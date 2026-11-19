import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "vitest";
import { captureDirectory, legacyFixture } from "../support/legacy-fixture.mjs";

const script = fileURLToPath(
  new URL("../../../../scripts/preview-legacy-snapshot.mjs", import.meta.url),
);
const environment = { ERP_PROFILE: "local", ERP_HOST: "127.0.0.1", ERP_PORT: "4180" };

async function reserve(t) {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  t.onTestFinished(() => new Promise((resolveClose) => server.close(resolveClose)));
  return { server, port: server.address().port };
}

test("launcher import has no execution side effects in a fresh process", () => {
  const child = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", `await import(${JSON.stringify(pathToFileURL(script).href)})`],
    { env: { ...process.env, ...environment }, encoding: "utf8", timeout: 10000 },
  );
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, "");
  assert.equal(child.stderr, "");
});

for (const [name, args, override, expected] of [
  [
    "arguments",
    ["--snapshot-dir", "private-secret-missing", "--dev-origin", "http://localhost:5173"],
    {},
    "PreviewArgumentsError",
  ],
  [
    "runtime",
    ["--snapshot-dir", "private-secret-missing"],
    { ERP_PROFILE: "server" },
    "RuntimeConfigurationError",
  ],
] as const) {
  test(`actual CLI rejects ${name} without loading HTTP or snapshot dependencies`, () => {
    const guard = `import { registerHooks } from "node:module";
      registerHooks({ resolve(specifier, context, nextResolve) {
        if (specifier === "@erp/infra/http" || specifier.endsWith("legacy-snapshot-reader.mjs")) {
          throw new Error("Heavy preview dependency loaded before rejection");
        }
        return nextResolve(specifier, context);
      } });`;
    const child = spawnSync(
      process.execPath,
      ["--import", `data:text/javascript,${encodeURIComponent(guard)}`, script, ...args],
      { env: { ...process.env, ...environment, ...override }, encoding: "utf8", timeout: 10000 },
    );
    assert.equal(child.status, 1, child.stderr);
    const event = JSON.parse(child.stderr.trim());
    assert.deepEqual(Object.keys(event).sort(), ["errorType", "requestId"]);
    assert.equal(event.errorType, expected);
    assert.match(event.requestId, /^[0-9a-f-]{36}$/u);
    assert.equal(child.stdout, "");
    assert.equal(child.stderr.includes("private-secret"), false);
  });
}

test("actual CLI opens explicit fixture, serves financial data and terminates after child.kill", async (t) => {
  const f = legacyFixture(t, { many: true });
  const before = captureDirectory(f.directory);
  const reserved = await reserve(t);
  await new Promise((resolveClose) => reserved.server.close(resolveClose));
  const child = spawn(process.execPath, [script, "--snapshot-dir", f.target], {
    env: {
      ...process.env,
      ...environment,
      ERP_PORT: String(reserved.port),
      DATA_DIR: "private-secret-ignored",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  t.onTestFinished(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await once(child, "exit");
    }
  });
  const address = `http://127.0.0.1:${reserved.port}`;
  let response: Response | undefined;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      response = await fetch(`${address}/api/v1/legacy/context`);
      break;
    } catch {
      assert.equal(child.exitCode, null, stderr);
      await new Promise((resolveWait) => setTimeout(resolveWait, 50));
    }
  }
  assert.equal(response?.status, 200, stderr);
  const context = await response.json();
  assert.equal(context.source.snapshotSha256, f.manifest.ledgers.teaching.sha256);
  const ledger = await (
    await fetch(
      `${address}/api/v1/legacy/ledger?snapshot=${context.source.snapshotSha256}` +
        "&month=2026-01&account=1000",
    )
  ).json();
  assert.equal(ledger.entries.length, 100);
  assert.ok(ledger.totalEntries > 100);
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  await exited;
  // Windows may force-terminate: composition tests prove callback ordering separately.
  assert.equal(stdout, "");
  assert.equal(stderr, "");
  await assert.rejects(fetch(`${address}/api/v1/legacy/context`));
  assert.deepEqual(captureDirectory(f.directory), before);
});

test("actual CLI missing snapshots and occupied listener fail nonzero without leaking paths", async (t) => {
  const f = legacyFixture(t);
  const reserved = await reserve(t);
  for (const [directory, port, expected] of [
    ["private-secret-missing", environment.ERP_PORT, "StartupError"],
    [f.target, String(reserved.port), "AddressInUse"],
  ]) {
    const child = spawnSync(process.execPath, [script, "--snapshot-dir", directory], {
      env: { ...process.env, ...environment, ERP_PORT: port },
      encoding: "utf8",
      timeout: 10000,
    });
    assert.equal(child.status, 1, child.stderr);
    assert.equal(JSON.parse(child.stderr.trim()).errorType, expected);
    assert.equal(child.stderr.includes(directory), false);
    assert.equal(child.stdout, "");
  }
});

test("actual CLI rejects snapshot sidecars without changing either source or snapshot", (t) => {
  const f = legacyFixture(t, { wal: true });
  writeFileSync(`${f.snapshot}-wal`, "fictional forbidden snapshot sidecar");
  const before = captureDirectory(f.directory);
  const child = spawnSync(process.execPath, [script, "--snapshot-dir", f.target], {
    env: { ...process.env, ...environment },
    encoding: "utf8",
    timeout: 10000,
  });
  assert.equal(child.status, 1, child.stderr);
  assert.equal(JSON.parse(child.stderr.trim()).errorType, "StartupError");
  assert.equal(child.stdout, "");
  assert.equal(child.stderr.includes(f.target), false);
  assert.deepEqual(captureDirectory(f.directory), before);
});
