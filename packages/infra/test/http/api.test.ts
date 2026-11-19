import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "vitest";
import { createApi, defaultWebRoot } from "@erp/infra/http";
import { errorSchema, healthSchema } from "@erp/core/contracts";

const here = dirname(fileURLToPath(import.meta.url));
const scratch = resolve(here, "..", ".test-artifacts");
const expectedHealth = {
  service: "ai-native-erp",
  contractVersion: "1",
  profile: "local",
  data: "unconfigured",
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertNoCors(response) {
  assert.deepEqual(
    Object.keys(response.headers).filter((name) =>
      name.toLowerCase().startsWith("access-control-"),
    ),
    [],
  );
}

function assertError(response, status, code) {
  assert.equal(response.statusCode, status, response.body);
  const body = errorSchema.parse(response.json());
  assert.equal(body.code, code);
  assert.match(body.requestId, uuid);
  assert.deepEqual(body.params, {});
  assert.deepEqual(body.fieldErrors, []);
  assert.equal(body.retryable, status === 503);
  assertNoCors(response);
  return body;
}

async function fixture(t, options = {}) {
  const events = [];
  const api = await createApi({
    environment: { ERP_PORT: "0" },
    allowPortZero: true,
    webRoot: join(scratch, `missing-${randomUUID()}`),
    logError: (event) => events.push(event),
    ...options,
  });
  t.onTestFinished(() => api.close());
  return { ...api, events };
}

test("health uses configured application port, strict contract, and no CORS", async (t) => {
  let calls = 0;
  const api = await fixture(t, {
    environment: { ERP_PROFILE: "local", ERP_HOST: "127.0.0.1", ERP_PORT: "0" },
    runtimeInfoPort: {
      getRuntimeInfo() {
        calls += 1;
        return { service: "ai-native-erp", profile: "local", data: "unconfigured" };
      },
    },
  });
  const response = await api.server.inject({
    method: "GET",
    url: "/api/v1/health",
    headers: { origin: "https://other.invalid" },
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(healthSchema.parse(response.json()), expectedHealth);
  assertNoCors(response);
  assert.equal(calls, 1);
  assert.equal(api.configuration.port, 0);
  assert.equal(resolve(defaultWebRoot()), resolve(here, "..", "..", "..", "web", "dist"));
});

test("all query keys, including repeated and empty values, are invalid", async (t) => {
  const api = await fixture(t);
  for (const suffix of ["?unexpected=yes", "?x=1&x=2", "?x=", "?__proto__=x"]) {
    assertError(await api.server.inject(`/api/v1/health${suffix}`), 400, "INVALID_REQUEST");
  }
});

test("unknown API paths are 404 and known health methods are 405", async (t) => {
  const api = await fixture(t);
  for (const method of ["GET", "POST", "DELETE", "OPTIONS"]) {
    assertError(await api.server.inject({ method, url: "/api/v1/not-found" }), 404, "NOT_FOUND");
  }
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    const response = await api.server.inject({
      method,
      url: "/api/v1/health",
      headers: { origin: "https://other.invalid", "access-control-request-method": "GET" },
    });
    assertError(response, 405, "METHOD_NOT_ALLOWED");
    assert.equal(response.headers.allow, "GET");
  }
  const head = await api.server.inject({ method: "HEAD", url: "/api/v1/health" });
  assertError(head, 405, "METHOD_NOT_ALLOWED");
});

test("Fastify parser errors are strict 400/415 using factory-only body routes", async (t) => {
  const api = await fixture(t, {
    registerTestRoutes(server) {
      server.post("/__test/json", async (request) => ({ received: request.body }));
    },
  });
  assertError(
    await api.server.inject({
      method: "POST",
      url: "/__test/json",
      headers: { "content-type": "application/json" },
      payload: '{"secret":',
    }),
    400,
    "INVALID_REQUEST",
  );
  assertError(
    await api.server.inject({
      method: "POST",
      url: "/__test/json",
      headers: { "content-type": "application/x-erp-unsupported" },
      payload: "sensitive body",
    }),
    415,
    "UNSUPPORTED_MEDIA_TYPE",
  );
  assert.ok(
    api.events.every((event) => Object.keys(event).sort().join(",") === "errorType,requestId"),
  );
  assert.equal(JSON.stringify(api.events).includes("secret"), false);
  assert.equal(JSON.stringify(api.events).includes("sensitive"), false);
});

test("unknown application failure is sanitized and IDs ignore incoming headers", async (t) => {
  const secret = "private-ledger-path-and-body";
  const api = await fixture(t, {
    runtimeInfoPort: {
      getRuntimeInfo() {
        throw new Error(secret);
      },
    },
  });
  const supplied = randomUUID();
  const first = await api.server.inject({
    url: "/api/v1/health",
    headers: { "x-request-id": supplied },
  });
  const second = await api.server.inject({
    url: "/api/v1/health",
    headers: { "x-request-id": "arbitrary-not-a-uuid" },
  });
  const a = assertError(first, 500, "INTERNAL_ERROR");
  const b = assertError(second, 500, "INTERNAL_ERROR");
  assert.notEqual(a.requestId, supplied);
  assert.notEqual(a.requestId, b.requestId);
  assert.equal(first.body.includes(secret), false);
  assert.equal(first.body.includes("stack"), false);
  assert.deepEqual(api.events[0], { requestId: a.requestId, errorType: "InternalError" });
});

test("unknown Fastify failures use the same safe error contract", async (t) => {
  const api = await fixture(t, {
    registerTestRoutes(server) {
      server.get("/__test/failure", async () => {
        throw new Error("private-body");
      });
    },
  });
  const response = await api.server.inject("/__test/failure");
  assertError(response, 500, "INTERNAL_ERROR");
  assert.equal(response.body.includes("private-body"), false);
});

test("production factory has no test endpoints; missing web and unconfigured finance services are explicit", async (t) => {
  const api = await fixture(t);
  assertError(await api.server.inject("/"), 503, "UNAVAILABLE");
  assertError(await api.server.inject("/assets/index.js"), 503, "UNAVAILABLE");
  assertError(await api.server.inject("/api/v1/__test/failure"), 404, "NOT_FOUND");
  assertError(await api.server.inject("/api/v1/ledger"), 403, "FORBIDDEN");
  assertError(
    await api.server.inject({
      method: "POST",
      url: "/__test/json",
    }),
    404,
    "NOT_FOUND",
  );
  const base = await api.listen();
  for (const path of [
    "/api/v1/journals?company=DEFAULT&status=draft&limit=1",
    "/api/v1/ledger?company=DEFAULT&month=2026-01&account=1000",
    "/api/v1/reports/trial?company=DEFAULT&month=2026-01",
  ]) {
    assertError(
      await api.server.inject({
        url: path,
        headers: { host: new URL(base).host },
      }),
      503,
      "UNAVAILABLE",
    );
  }
});

test("built static assets and health work on the same ephemeral listener without traversal", async (t) => {
  const root = resolve(here, "..", `.test-artifacts-${randomUUID()}`);
  await mkdir(join(root, "web"), { recursive: true });
  t.onTestFinished(async () => {
    await rm(root, { recursive: true, force: true });
  });
  await writeFile(join(root, "web", "index.html"), "<!doctype html><title>M01 shell</title>");
  await writeFile(join(root, "web", "shell.js"), 'fetch("/api/v1/health")');
  await writeFile(join(root, "private.txt"), "must-not-be-served");
  const api = await fixture(t, { webRoot: join(root, "web") });
  const address = await api.listen();
  const page = await fetch(address);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /M01 shell/);
  const health = await fetch(`${address}/api/v1/health`);
  assert.deepEqual(healthSchema.parse(await health.json()), expectedHealth);
  for (const headers of [page.headers, health.headers]) {
    assert.equal(
      [...headers.keys()].some((name) => name.startsWith("access-control-")),
      false,
    );
  }
  assert.match((await api.server.inject("/shell.js")).body, /api\/v1\/health/);
  assertError(await api.server.inject("/missing.txt"), 404, "NOT_FOUND");
  for (const url of ["/..%2fprivate.txt", "/%2e%2e/private.txt", "/.env"]) {
    const response = await api.server.inject(url);
    assert.ok(response.statusCode >= 400, `${url}: ${response.statusCode}`);
    assert.equal(response.body.includes("must-not-be-served"), false);
    errorSchema.parse(response.json());
  }
});

test("occupied port fails without fallback and can be released", async (t) => {
  const blocker = createServer();
  await new Promise((resolveListen, reject) => {
    blocker.once("error", reject);
    blocker.listen(0, "127.0.0.1", resolveListen);
  });
  t.onTestFinished(() => new Promise((resolveClose) => blocker.close(resolveClose)));
  const address = blocker.address();
  assert.ok(address && typeof address === "object");
  const api = await fixture(t, { environment: { ERP_PORT: String(address.port) } });
  await assert.rejects(api.listen(), (error) => error.code === "EADDRINUSE");
  assert.equal(api.server.server.listening, false);
  const child = spawnSync(process.execPath, [resolve(here, "..", "..", "src", "main.ts")], {
    encoding: "utf8",
    timeout: 10000,
    env: {
      ...process.env,
      ERP_PROFILE: "local",
      ERP_HOST: "127.0.0.1",
      ERP_PORT: String(address.port),
    },
  });
  assert.equal(child.status, 1, child.stderr);
  assert.equal(JSON.parse(child.stderr.trim()).errorType, "AddressInUse");
  assert.equal(child.stdout, "");
});

test("real IPv6 loopback is supported when the host provides it", async (t) => {
  const api = await fixture(t, { environment: { ERP_HOST: "::1", ERP_PORT: "0" } });
  let address: string;
  try {
    address = await api.listen();
  } catch (error) {
    if (["EAFNOSUPPORT", "EADDRNOTAVAIL"].includes(error.code)) {
      t.skip("IPv6 loopback unavailable on this host");
      return;
    }
    throw error;
  }
  assert.deepEqual(
    healthSchema.parse(await (await fetch(`${address}/api/v1/health`)).json()),
    expectedHealth,
  );
});

test("CLI rejects Server, unsafe hosts and forbidden port strings with safe fatal diagnostics", () => {
  const bootstrap = resolve(here, "..", "..", "src", "main.ts");
  const importGuard = `data:text/javascript,${encodeURIComponent(`
    import { registerHooks } from "node:module";
    registerHooks({
      resolve(specifier, context, nextResolve) {
        if (context.parentURL === ${JSON.stringify(pathToFileURL(bootstrap).href)}
          && !specifier.startsWith("node:") && specifier !== "./index.ts") {
          throw new Error("Runtime validation must precede application imports.");
        }
        return nextResolve(specifier, context);
      }
    });
  `)}`;
  for (const override of [
    { ERP_PROFILE: "server" },
    { ERP_HOST: "0.0.0.0" },
    { ERP_HOST: "" },
    { ERP_PORT: "0" },
    { ERP_PORT: "4173" },
    { ERP_PORT: "-1" },
    { ERP_PORT: "1.5" },
    { ERP_PORT: "65536" },
    { ERP_PORT: " " },
  ]) {
    const child = spawnSync(process.execPath, ["--import", importGuard, bootstrap], {
      encoding: "utf8",
      timeout: 10000,
      env: {
        ...process.env,
        ERP_PROFILE: "local",
        ERP_HOST: "127.0.0.1",
        ERP_PORT: "4180",
        ...override,
      },
    });
    assert.equal(child.status, 1, child.stderr);
    const diagnostic = JSON.parse(child.stderr.trim());
    assert.equal(diagnostic.errorType, "RuntimeConfigurationError");
    assert.match(diagnostic.requestId, uuid);
    assert.equal(child.stdout, "");
  }
});
