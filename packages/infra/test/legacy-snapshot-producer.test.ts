import assert from "node:assert/strict";
import fs from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import { onTestFinished, test } from "vitest";
import { produceLegacySnapshot } from "../../../scripts/legacy-snapshot-producer.mjs";
import { inspectLedger, verifyLedgerSnapshot } from "../../../scripts/legacy-snapshot-verifier.mjs";
import { captureDirectory } from "./support/legacy-fixture.mjs";
import { fakeExclusive, producerFixture, sourceFiles } from "./support/legacy-producer-fixture.mjs";
import { openLegacyTeachingSnapshot } from "../src/legacy/teaching.ts";

const cli = fileURLToPath(new URL("../../../scripts/storage-admin.mjs", import.meta.url));
const readCli = fileURLToPath(new URL("../../../scripts/read-legacy-ledger.mjs", import.meta.url));
const run = (...args: string[]) =>
  spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
const injected = { acquireExclusive: fakeExclusive };
const code = (expected: string) => (error: unknown) =>
  error instanceof Error && "code" in error && error.code === expected;

test("byte-only producer retains WAL commits, ID3 and closed months; reader and independent backup agree", async (t) => {
  const f = producerFixture(t);
  const before = captureDirectory(f.source, { mtime: true });
  const manifest = await produceLegacySnapshot(f.source, f.output, injected);
  assert.deepEqual(verifyLedgerSnapshot(f.output), manifest);
  for (const kind of ["teaching", "enterprise"])
    assert.deepEqual(
      inspectLedger(join(f.output, manifest.ledgers[kind].file), kind),
      f.expected[kind],
    );
  assert.ok(
    manifest.ledgers.teaching.journals.some((entry) => entry.id === 3 && entry.status === "draft"),
  );
  const reader = openLegacyTeachingSnapshot({ directory: f.output, verifiedManifest: manifest });
  const oracle = JSON.parse(
    fs.readFileSync(new URL("./support/legacy-data/base.json", import.meta.url), "utf8"),
  );
  try {
    assert.deepEqual(
      reader.trialBalances("2026-01").trialBalances,
      oracle.reports["2026-01"].trialBalances,
    );
    const ledger = reader.ledger({ month: "2026-01", account: "1000" });
    assert.deepEqual(
      {
        account: ledger.account,
        month: ledger.month,
        opening: ledger.opening,
        closing: ledger.closing,
        entries: ledger.entries.map(({ lineId: _lineId, ...entry }) => entry),
      },
      oracle.ledgers["2026-01"]["1000"],
    );
  } finally {
    reader.close();
  }
  for (const args of [
    ["trial", "--stage", "adjusted"],
    ["ledger", "--account", "1000"],
  ]) {
    const result = spawnSync(
      process.execPath,
      [readCli, ...args, "--snapshot-dir", f.output, "--month", "2026-01"],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.ok(JSON.parse(result.stdout).result);
  }
  const backup = join(f.output, "backup");
  const privateManifest = JSON.parse(fs.readFileSync(join(backup, "manifest.json"), "utf8"));
  const restored = join(f.directory, "restored");
  fs.mkdirSync(restored);
  for (const entry of privateManifest.files) {
    assert.ok(!entry.file.endsWith("-shm"));
    assert.deepEqual(
      fs.readFileSync(join(backup, entry.file)),
      fs.readFileSync(join(f.source, entry.file)),
    );
    fs.copyFileSync(join(backup, entry.file), join(restored, entry.file));
  }
  for (const [kind, file] of Object.entries({
    teaching: "teaching.sqlite",
    enterprise: "erp.sqlite",
  })) {
    assert.deepEqual(inspectLedger(join(restored, file), kind), f.expected[kind]);
    assert.deepEqual(privateManifest.logical[kind], manifest.ledgers[kind].logical);
  }
  assert.deepEqual(captureDirectory(f.source, { mtime: true }), before);
});

test.each(["standalone", "wal-without-shm"])(
  "producer accepts %s without creating source sidecars",
  async (mode) => {
    const f = producerFixture({ onTestFinished }, { wal: mode !== "standalone" });
    if (mode === "wal-without-shm")
      for (const file of sourceFiles) fs.unlinkSync(join(f.source, `${file}-shm`));
    const before = captureDirectory(f.source, { mtime: true });
    const manifest = await produceLegacySnapshot(f.source, f.output, injected);
    assert.deepEqual(verifyLedgerSnapshot(f.output), manifest);
    assert.deepEqual(captureDirectory(f.source, { mtime: true }), before);
  },
);

test.each(["SOURCE_BUSY", "UNSUPPORTED_PLATFORM"])(
  "injected %s gate fails without touching source or output",
  async (expected) => {
    const f = producerFixture({ onTestFinished }),
      before = captureDirectory(f.source, { mtime: true });
    await assert.rejects(
      produceLegacySnapshot(f.source, f.output, {
        acquireExclusive() {
          throw Object.assign(new Error("injected gate"), { code: expected });
        },
      }),
      code(expected),
    );
    assert.ok(!fs.existsSync(f.output));
    assert.deepEqual(captureDirectory(f.source, { mtime: true }), before);
  },
);

test.each(["bytes", "mtime", "remove", "add", "journal"])(
  "copy-time %s changes fail with no partial output",
  async (change) => {
    const f = producerFixture({ onTestFinished });
    if (change === "add") fs.unlinkSync(join(f.source, "erp.sqlite-shm"));
    let closed = false;
    await assert.rejects(
      produceLegacySnapshot(f.source, f.output, {
        acquireExclusive(source) {
          const lease = fakeExclusive(source);
          return {
            ...lease,
            copy(destination) {
              lease.copy(destination);
              if (change === "bytes")
                fs.appendFileSync(join(source, "teaching.sqlite-wal"), "mutation");
              if (change === "mtime")
                fs.utimesSync(join(source, "teaching.sqlite"), new Date(0), new Date(0));
              if (change === "remove") fs.unlinkSync(join(source, "erp.sqlite-wal"));
              if (change === "add") fs.writeFileSync(join(source, "erp.sqlite-shm"), "mutation");
              if (change === "journal")
                fs.writeFileSync(join(source, "teaching.sqlite-journal"), "mutation");
            },
            close() {
              closed = true;
            },
          };
        },
      }),
      code(change === "journal" ? "ROLLBACK_JOURNAL" : "SOURCE_CHANGED"),
    );
    assert.ok(closed);
    assert.ok(!fs.existsSync(f.output));
  },
);

test.each(["journal", "missing", "existing", "nested", "corrupt", "copy-failure"])(
  "%s refusal preserves all source bytes and mtimes",
  async (scenario) => {
    const f = producerFixture({ onTestFinished });
    if (scenario === "journal")
      fs.writeFileSync(join(f.source, "teaching.sqlite-journal"), "stable hot journal");
    if (scenario === "missing") fs.unlinkSync(join(f.source, "erp.sqlite"));
    if (scenario === "existing") {
      fs.mkdirSync(f.output);
      fs.writeFileSync(join(f.output, "keep"), "existing");
    }
    if (scenario === "corrupt") {
      fs.writeFileSync(join(f.source, "teaching.sqlite"), "not a database");
      fs.unlinkSync(join(f.source, "teaching.sqlite-wal"));
    }
    const before = captureDirectory(f.source, { mtime: true });
    const output = scenario === "nested" ? join(f.source, "nested") : f.output;
    const options =
      scenario === "copy-failure"
        ? {
            acquireExclusive(source) {
              return {
                ...fakeExclusive(source),
                copy() {
                  throw new Error("injected disk failure");
                },
              };
            },
          }
        : injected;
    await assert.rejects(produceLegacySnapshot(f.source, output, options));
    if (scenario === "existing")
      assert.equal(fs.readFileSync(join(output, "keep"), "utf8"), "existing");
    else assert.ok(!fs.existsSync(output));
    assert.deepEqual(captureDirectory(f.source, { mtime: true }), before);
  },
);

test("CLI requires exact explicit paths and has no exclusive-check bypass", () => {
  for (const args of [
    ["legacy-snapshot"],
    ["legacy-snapshot", "--source-dir", "unused"],
    ["legacy-snapshot", "--source-dir", "unused", "--out-dir", "unused", "--force", "yes"],
    ["legacy-snapshot", "--source-dir", "unused", "--source-dir", "unused"],
  ]) {
    const result = run(...args);
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stderr).error.code, "INVALID_INPUT");
    assert.equal(result.stdout, "");
  }
});

test.skipIf(process.platform === "win32")("real non-Windows CLI fails closed", (t) => {
  const f = producerFixture(t),
    before = captureDirectory(f.source, { mtime: true });
  const result = run("legacy-snapshot", "--source-dir", f.source, "--out-dir", f.output);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(JSON.parse(result.stderr).error.code, "UNSUPPORTED_PLATFORM");
  assert.ok(!fs.existsSync(f.output));
  assert.deepEqual(captureDirectory(f.source, { mtime: true }), before);
});

const windows = process.platform === "win32" && process.env.ERP_WINDOWS_SNAPSHOT_HANDLES === "1";
test.skipIf(!windows)("Windows broker preserves Unicode paths without source SHM", async (t) => {
  const f = producerFixture(t);
  const source = join(f.directory, "\u865a\u6784-source");
  fs.renameSync(f.source, source);
  for (const file of sourceFiles) fs.unlinkSync(join(source, `${file}-shm`));
  const before = captureDirectory(source, { mtime: true });
  const output = join(f.directory, "\u865a\u6784-output");
  await produceLegacySnapshot(source, output);
  verifyLedgerSnapshot(output);
  assert.deepEqual(captureDirectory(source, { mtime: true }), before);
});

test
  .skipIf(!windows)
  .each(sourceFiles.flatMap((file) => ["", "-wal", "-shm"].map((suffix) => file + suffix)))(
  "Windows refuses another process holding %s and succeeds after release",
  async (file) => {
    const f = producerFixture({ onTestFinished }),
      before = captureDirectory(f.source, { mtime: true });
    const holder = spawn(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        '$p=[Console]::ReadLine(); $s=[IO.File]::Open($p,"Open","Read","ReadWrite"); try { [Console]::WriteLine("ready"); [Console]::ReadLine() | Out-Null } finally { $s.Dispose() }',
      ],
      { stdio: ["pipe", "pipe", "inherit"], windowsHide: true },
    );
    const exited = once(holder, "exit");
    holder.stdin.write(`${join(f.source, file)}\n`);
    try {
      await once(holder.stdout, "data");
      const denied = run("legacy-snapshot", "--source-dir", f.source, "--out-dir", f.output);
      assert.equal(denied.status, 1, denied.stderr);
      assert.equal(JSON.parse(denied.stderr).error.code, "SOURCE_BUSY");
      assert.ok(!fs.existsSync(f.output));
      assert.deepEqual(captureDirectory(f.source, { mtime: true }), before);
    } finally {
      holder.stdin.end("\n");
      await exited;
    }
    const accepted = run("legacy-snapshot", "--source-dir", f.source, "--out-dir", f.output);
    assert.equal(accepted.status, 0, accepted.stderr);
    verifyLedgerSnapshot(f.output);
    assert.deepEqual(captureDirectory(f.source, { mtime: true }), before);
  },
  60000,
);
