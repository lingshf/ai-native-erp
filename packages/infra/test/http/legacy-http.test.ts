import assert from "node:assert/strict";
import { request } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "vitest";
import { createApi } from "@erp/infra/http";
import { DomainError, StorageError } from "@erp/core/application";
import {
  errorSchema,
  legacyContextSchema,
  legacyTrialSchema,
  legacyLedgerSchema,
} from "@erp/core/contracts";
import { openVerifiedTeachingReader } from "../../../../scripts/legacy-snapshot-reader.mjs";
import { captureDirectory, legacyFixture } from "../support/legacy-fixture.mjs";

function get(address, path, headers = {}, method = "GET", body) {
  return new Promise((resolveResponse, reject) => {
    const req = request(new URL(address), { path, headers, method }, (response) => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        text += chunk;
      });
      response.on("end", () =>
        resolveResponse({
          status: response.statusCode,
          headers: response.headers,
          text,
          json: () => JSON.parse(text),
        }),
      );
    });
    req.on("error", reject);
    req.end(body);
  });
}

function financeHeaders(response) {
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.equal(
    Object.keys(response.headers).some((key) => key.startsWith("access-control-")),
    false,
  );
}

function failure(response, status, code) {
  assert.equal(response.status, status, response.text);
  financeHeaders(response);
  const parsed = errorSchema.parse(response.json());
  assert.equal(parsed.code, code);
  assert.deepEqual(parsed.params, {});
  assert.deepEqual(parsed.fieldErrors, []);
  assert.equal(parsed.retryable, status === 503);
  assert.match(parsed.requestId, /^[0-9a-f-]{36}$/u);
  assert.equal(response.text.includes("private-secret"), false);
  return parsed;
}

async function apiFixture(t, options = {}) {
  const api = await createApi({
    environment: { ERP_PORT: "0" },
    allowPortZero: true,
    webRoot: resolve("apps", "api", "test", "missing-web"),
    logError: () => {},
    ...options,
  });
  t.onTestFinished(() => api.close());
  return { api, address: await api.listen() };
}

test("real HTTP returns exact historical context, three trial stages and full-month ledger", async (t) => {
  const f = legacyFixture(t, { history: true });
  const before = captureDirectory(f.directory);
  const reader = openVerifiedTeachingReader(f.target);
  f.readers.push(reader);
  const { api, address } = await apiFixture(t, { legacyReader: reader });
  const context = await get(address, "/api/v1/legacy/context");
  assert.equal(context.status, 200, context.text);
  financeHeaders(context);
  assert.deepEqual(legacyContextSchema.parse(context.json()), {
    contractVersion: "1",
    source: reader.info,
    periods: [
      { month: "2026-01", status: "closed" },
      { month: "2026-02", status: "closed" },
      { month: "2026-03", status: "open" },
    ],
  });
  const query = `snapshot=${reader.info.snapshotSha256}&month=${f.month}`;
  const trial = await get(address, `/api/v1/legacy/trial?${query}`);
  assert.equal(trial.status, 200, trial.text);
  financeHeaders(trial);
  assert.deepEqual(legacyTrialSchema.parse(trial.json()), {
    contractVersion: "1",
    source: reader.info,
    ...reader.trialBalances(f.month),
  });
  assert.notDeepEqual(trial.json().trialBalances.unadjusted, trial.json().trialBalances.adjusted);
  assert.notDeepEqual(trial.json().trialBalances.adjusted, trial.json().trialBalances.postClosing);
  for (const account of ["1000", "1100", "4000"]) {
    const ledger = await get(address, `/api/v1/legacy/ledger?${query}&account=${account}&limit=1`);
    assert.equal(ledger.status, 200, ledger.text);
    financeHeaders(ledger);
    assert.deepEqual(legacyLedgerSchema.parse(ledger.json()), {
      contractVersion: "1",
      source: reader.info,
      ...reader.ledger({ month: f.month, account, limit: 1 }),
    });
    if (account === "1100") assert.equal(ledger.json().closing, 725);
  }
  const full = (await get(address, `/api/v1/legacy/ledger?${query}&account=4000`)).json();
  assert.ok(full.entries.some((row) => row.kind === "closing"));
  const cash = (await get(address, `/api/v1/legacy/ledger?${query}&account=1000`)).json();
  assert.ok(cash.entries.some((row) => row.kind === "reversal"));
  assert.ok(cash.entries.some((row) => row.dimensions?.TEAM === "A"));
  assert.ok(
    cash.entries.some((row, index, entries) =>
      entries.some(
        (other, otherIndex) =>
          otherIndex !== index && other.id === row.id && other.lineId !== row.lineId,
      ),
    ),
  );
  await api.close();
  // API borrows rather than closes the reader.
  assert.equal(reader.periods().length, 3);
  reader.close();
  assert.deepEqual(captureDirectory(f.directory), before);
});

test("actual listener paginates over 100 real rows with stable totals and line identities", async (t) => {
  const f = legacyFixture(t, { many: true });
  const before = captureDirectory(f.directory);
  const reader = openVerifiedTeachingReader(f.target);
  f.readers.push(reader);
  const { api, address } = await apiFixture(t, { legacyReader: reader });
  const base = `/api/v1/legacy/ledger?snapshot=${reader.info.snapshotSha256}&month=2026-01&account=1000`;
  const first = await get(address, base);
  assert.equal(first.status, 200, first.text);
  const a = legacyLedgerSchema.parse(first.json());
  assert.equal(a.entries.length, 100);
  assert.ok(a.totalEntries > 100);
  const second = await get(address, `${base}&cursor=${a.nextCursor}`);
  assert.equal(second.status, 200, second.text);
  const b = legacyLedgerSchema.parse(second.json());
  assert.equal(b.nextCursor, undefined);
  assert.equal(a.entries.length + b.entries.length, a.totalEntries);
  assert.equal(new Set([...a.entries, ...b.entries].map((row) => row.lineId)).size, a.totalEntries);
  for (const key of ["opening", "debit", "credit", "closing", "totalEntries"])
    assert.equal(a[key], b[key]);
  assert.deepEqual(
    [...a.entries, ...b.entries],
    [
      reader.ledger({ month: "2026-01", account: "1000" }),
      reader.ledger({ month: "2026-01", account: "1000", cursor: a.nextCursor }),
    ].flatMap((page) => page.entries),
  );
  failure(
    await get(address, `${base}&cursor=${a.nextCursor.slice(0, -1)}!`),
    400,
    "INVALID_REQUEST",
  );
  failure(
    await get(address, `${base}&cursor=${a.nextCursor}&account=4000`),
    400,
    "INVALID_REQUEST",
  );
  failure(
    await get(address, `${base.replace("account=1000", "account=4000")}&cursor=${a.nextCursor}`),
    400,
    "INVALID_REQUEST",
  );
  await api.close();
  reader.close();
  assert.deepEqual(captureDirectory(f.directory), before);
});

test("finance fails closed before listen, checks actual Host/Origin and ignores forwarded headers", async (t) => {
  const webRoot = await mkdtemp(resolve(tmpdir(), "erp-http-static-"));
  let api: Awaited<ReturnType<typeof createApi>> | undefined;
  t.onTestFinished(async () => {
    await api?.close();
    await rm(webRoot, { recursive: true });
  });
  await writeFile(resolve(webRoot, "index.html"), "<!doctype html><title>HTTP fixture</title>");
  api = await createApi({
    environment: { ERP_PORT: "0" },
    allowPortZero: true,
    webRoot,
    logError: () => {},
  });
  const early = await api.server.inject("/api/v1/legacy/context");
  assert.equal(early.statusCode, 403, early.body);
  const address = await api.listen();
  const origin = new URL(address).origin;
  for (const headers of [
    { host: "attacker.invalid" },
    { host: "127.0.0.1:0" },
    { host: "[::1]:4180" },
    { origin: "null" },
    { origin: "https://attacker.invalid" },
    { origin: `${origin}/` },
    { "sec-fetch-site": "cross-site" },
    {
      host: "attacker.invalid",
      "x-forwarded-host": new URL(address).host,
      forwarded: `host=${new URL(address).host}`,
    },
    { origin: "http://127.0.0.1:5173" },
  ])
    failure(await get(address, "/api/v1/legacy/context", headers), 403, "FORBIDDEN");
  for (const headers of [
    {},
    { origin },
    { "sec-fetch-site": "same-origin" },
    { "x-forwarded-host": "attacker.invalid", "x-forwarded-proto": "https" },
  ])
    failure(await get(address, "/api/v1/legacy/context", headers), 503, "UNAVAILABLE");
  for (const path of [
    `/api/v1/legacy/trial?snapshot=${"0".repeat(64)}&month=2026-01`,
    `/api/v1/legacy/ledger?snapshot=${"0".repeat(64)}&month=2026-01&account=1000`,
  ])
    failure(await get(address, path), 503, "UNAVAILABLE");
  for (const path of [
    "/api/v1/legacy/%63ontext",
    "/api/v1/%6cegacy/context",
    "//api/v1/legacy/context",
    "/api/v1/legacy/context/",
    "/api/v1/legacy/context%3fignored",
  ]) {
    const response = await get(address, path, { host: "attacker.invalid" });
    assert.ok([403, 404].includes(response.status), `${path}: ${response.status}`);
    assert.notEqual(response.status, 503);
  }
  for (const path of ["context", "trial", "ledger"]) {
    for (const method of ["POST", "PUT", "DELETE", "PATCH", "OPTIONS"]) {
      const response = await get(address, `/api/v1/legacy/${path}`, {}, method);
      failure(response, 405, "METHOD_NOT_ALLOWED");
      assert.equal(response.headers.allow, "GET");
    }
    const head = await get(address, `/api/v1/legacy/${path}`, {}, "HEAD");
    assert.equal(head.status, 405);
    financeHeaders(head);
  }
});

test("early API rejections never invoke handlers while asynchronous send hooks are pending", async (t) => {
  let handlerCalls = 0;
  const { address } = await apiFixture(t, {
    registerTestRoutes(server) {
      server.addHook("onSend", async (_request, _reply, payload) => {
        await new Promise((resolveSend) => setImmediate(resolveSend));
        return payload;
      });
      const handler = async () => {
        handlerCalls += 1;
        return { shouldNotRun: true };
      };
      server.get("/api/v1/__test/blocked", handler);
      server.post("/api/v1/health", handler);
    },
  });
  const unknown = await get(address, "/api/v1/__test/blocked");
  assert.equal(unknown.status, 404, unknown.text);
  assert.equal(unknown.json().code, "NOT_FOUND");
  const method = await get(address, "/api/v1/health", {}, "POST");
  assert.equal(method.status, 405, method.text);
  assert.equal(method.json().code, "METHOD_NOT_ALLOWED");
  assert.equal(handlerCalls, 0);
});

test("malformed financial route errors use sanitized DTOs even before request hooks", async (t) => {
  const { address } = await apiFixture(t);
  const response = await get(address, "/api/v1/legacy/%ZZ-private-secret");
  failure(response, 400, "INVALID_REQUEST");
});

test("finance accepts only the actual bound IPv6 authority and exact IPv6 dev origin", async (t) => {
  const { address } = await apiFixture(t, {
    environment: { ERP_HOST: "::1", ERP_PORT: "0" },
    devOrigin: "http://[::1]:5173",
  });
  assert.equal(new URL(address).hostname, "[::1]");
  for (const headers of [
    {},
    { origin: new URL(address).origin },
    { origin: "http://[::1]:5173" },
  ]) {
    failure(await get(address, "/api/v1/legacy/context", headers), 503, "UNAVAILABLE");
  }
  failure(
    await get(address, "/api/v1/legacy/context", {
      host: `127.0.0.1:${new URL(address).port}`,
    }),
    403,
    "FORBIDDEN",
  );
  failure(
    await get(address, "/api/v1/legacy/context", {
      origin: "http://127.0.0.1:5173",
    }),
    403,
    "FORBIDDEN",
  );
});

test("explicit canonical dev origin is the only additional permitted origin", async (t) => {
  const { address } = await apiFixture(t, { devOrigin: "http://127.0.0.1:5173" });
  failure(
    await get(address, "/api/v1/legacy/context", { origin: "http://127.0.0.1:5173" }),
    503,
    "UNAVAILABLE",
  );
  failure(
    await get(address, "/api/v1/legacy/context", { origin: "http://127.0.0.1:5174" }),
    403,
    "FORBIDDEN",
  );
});

test("strict queries reject unknown, repeated, noncanonical and out-of-range values on real HTTP", async (t) => {
  const f = legacyFixture(t);
  const reader = openVerifiedTeachingReader(f.target);
  f.readers.push(reader);
  const { address } = await apiFixture(t, { legacyReader: reader });
  const q = `snapshot=${reader.info.snapshotSha256}&month=2026-01`;
  for (const suffix of ["?x=1", "?x=1&x=2", "?__proto__=x", "?constructor=x"]) {
    failure(await get(address, `/api/v1/legacy/context${suffix}`), 400, "INVALID_REQUEST");
  }
  for (const suffix of ["", `?${q}&stage=adjusted`, `?${q}&month=2026-01`, `?${q}&__proto__=x`]) {
    failure(await get(address, `/api/v1/legacy/trial${suffix}`), 400, "INVALID_REQUEST");
  }
  for (const value of ["01", "101", "1.0", "1e2", "NaN", "", "9007199254740992"]) {
    failure(
      await get(address, `/api/v1/legacy/ledger?${q}&account=1000&limit=${value}`),
      400,
      "INVALID_REQUEST",
    );
  }
  for (const value of ["1", "100"]) {
    assert.equal(
      (await get(address, `/api/v1/legacy/ledger?${q}&account=1000&limit=${value}`)).status,
      200,
    );
  }
  for (const suffix of ["&limit=1&limit=1", "&stage=adjusted", "&cursor=", "&account=1000"]) {
    failure(
      await get(address, `/api/v1/legacy/ledger?${q}&account=1000${suffix}`),
      400,
      "INVALID_REQUEST",
    );
  }
  failure(
    await get(
      address,
      `/api/v1/legacy/trial?${q.replace(reader.info.snapshotSha256, "0".repeat(64))}`,
    ),
    409,
    "CONFLICT",
  );
  failure(
    await get(address, `/api/v1/legacy/trial?${q.replace("2026-01", "2025-01")}`),
    404,
    "NOT_FOUND",
  );
  failure(await get(address, `/api/v1/legacy/ledger?${q}&account=9999`), 404, "NOT_FOUND");
  failure(
    await get(address, `/api/v1/legacy/ledger?${q}&account=1000&cursor=not-a-valid-cursor`),
    400,
    "INVALID_REQUEST",
  );
  reader.close();
  failure(await get(address, "/api/v1/legacy/context"), 503, "UNAVAILABLE");
});

test("all declared storage/domain errors are mapped and sanitized, output failures never become success", async (t) => {
  const f = legacyFixture(t);
  const reader = openVerifiedTeachingReader(f.target);
  f.readers.push(reader);
  let fault: Error | undefined;
  let invalid: unknown;
  const events = [];
  const borrowed = {
    info: reader.info,
    periods() {
      if (fault) throw fault;
      return invalid ?? reader.periods();
    },
    trialBalances: (month) => reader.trialBalances(month),
    ledger: (query) => reader.ledger(query),
    close() {
      throw new Error("API must not own this reader");
    },
  };
  const { address } = await apiFixture(t, {
    legacyReader: borrowed,
    logError: (event) => events.push(event),
  });
  const cases = [
    ...["INVALID_INPUT", "INVALID_CURSOR"].map((code) => [
      new StorageError(code),
      400,
      "INVALID_REQUEST",
    ]),
    [new StorageError("NOT_FOUND"), 404, "NOT_FOUND"],
    [new StorageError("CONFLICT"), 409, "CONFLICT"],
    ...["INVALID_SNAPSHOT", "SCHEMA_MISMATCH", "OVERFLOW", "BUSY", "CLOSED", "STORAGE_FAILURE"].map(
      (code) => [new StorageError(code), 503, "UNAVAILABLE"],
    ),
    [new StorageError("INVALID_SCOPE"), 500, "INTERNAL_ERROR"],
    [new DomainError("INVALID_INPUT"), 400, "INVALID_REQUEST"],
    [new DomainError("NOT_FOUND"), 404, "NOT_FOUND"],
    [new DomainError("OVERFLOW"), 503, "UNAVAILABLE"],
    [new Error("private-secret SQL C:\\private-secret"), 500, "INTERNAL_ERROR"],
  ];
  const ids = new Set();
  for (const [error, status, code] of cases) {
    fault = error;
    error.message = "private-secret SQL C:\\private-secret";
    const response = await get(address, "/api/v1/legacy/context", {
      "x-request-id": "private-secret",
    });
    ids.add(failure(response, status, code).requestId);
  }
  assert.equal(ids.size, cases.length);
  assert.equal(JSON.stringify(events).includes("private-secret"), false);
  assert.ok(events.every((event) => Object.keys(event).sort().join(",") === "errorType,requestId"));
  fault = undefined;
  for (const value of [
    [{ month: "2026-01", status: "open", secret: "private-secret" }],
    [{ month: "9999-01", status: "open" }],
  ]) {
    invalid = value;
    failure(await get(address, "/api/v1/legacy/context"), 503, "UNAVAILABLE");
  }
});

test("strict trial and flat ledger output reject unsafe amounts, extra fields and nonfinite numbers", async (t) => {
  const f = legacyFixture(t);
  const reader = openVerifiedTeachingReader(f.target);
  f.readers.push(reader);
  let badTrial: ReturnType<typeof reader.trialBalances>;
  let badLedger: ReturnType<typeof reader.ledger>;
  const { address } = await apiFixture(t, {
    legacyReader: {
      info: reader.info,
      periods: () => reader.periods(),
      trialBalances: () => badTrial,
      ledger: () => badLedger,
      close() {},
    },
  });
  const q = `snapshot=${reader.info.snapshotSha256}&month=2026-01`;
  for (const amount of [1.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity]) {
    badTrial = structuredClone(reader.trialBalances("2026-01"));
    badTrial.trialBalances.adjusted.debit = amount;
    failure(await get(address, `/api/v1/legacy/trial?${q}`), 503, "UNAVAILABLE");
    badLedger = { ...reader.ledger({ month: "2026-01", account: "1000" }), closing: amount };
    failure(await get(address, `/api/v1/legacy/ledger?${q}&account=1000`), 503, "UNAVAILABLE");
  }
  badTrial = { ...reader.trialBalances("2026-01"), secret: "private-secret" };
  failure(await get(address, `/api/v1/legacy/trial?${q}`), 503, "UNAVAILABLE");
  badLedger = { ...reader.ledger({ month: "2026-01", account: "1000" }), secret: "private-secret" };
  failure(await get(address, `/api/v1/legacy/ledger?${q}&account=1000`), 503, "UNAVAILABLE");
});
