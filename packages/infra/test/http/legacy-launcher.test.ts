import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createServer } from "node:net";
import { test } from "vitest";
import { captureDirectory, legacyFixture } from "../support/legacy-fixture.mjs";

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

test("invalid runtime precedes snapshot access", async () => {
  const { startLegacyPreview } = await import("../../../../scripts/preview-legacy-snapshot.mjs");
  for (const override of [
    { ERP_PROFILE: "server" },
    { ERP_HOST: "0.0.0.0" },
    { ERP_HOST: "localhost" },
    { ERP_PORT: "4173" },
  ]) {
    let accessed = false;
    await assert.rejects(
      startLegacyPreview({
        snapshotDirectory: "private-secret",
        environment: { ...environment, ...override },
        openReader() {
          accessed = true;
          throw new Error("private-secret");
        },
      }),
    );
    assert.equal(accessed, false);
  }
});

test("pure parser rejects missing/duplicate/unknown arguments and noncanonical dev origins", async () => {
  const { parsePreviewArguments } = await import("../../../../scripts/preview-legacy-snapshot.mjs");
  for (const args of [
    [],
    ["--snapshot-dir"],
    ["--snapshot-dir", ""],
    ["--snapshot-dir", "--dev-origin"],
    ["--snapshot-dir", "x", "--extra", "x"],
    ["--snapshot-dir", "x", "--snapshot-dir", "y"],
    ["--snapshot-dir", "x", "--dev-origin"],
    ["--snapshot-dir", "x", "--dev-origin", ""],
    [
      "--snapshot-dir",
      "x",
      "--dev-origin",
      "http://127.0.0.1:5173",
      "--dev-origin",
      "http://127.0.0.1:5174",
    ],
    ...[
      "http://localhost:5173",
      "http://0.0.0.0:5173",
      "http://127.0.0.1:4173",
      "http://127.0.0.1:0",
      "http://127.0.0.1:65536",
      "http://127.0.0.1:05173",
      "http://127.0.0.1:5173/",
      "http://u@127.0.0.1:5173",
      "http://127.0.0.1:5173?x=1",
      "http://127.0.0.1:5173#x",
      "https://127.0.0.1:5173",
      "http://127.1:5173",
      "*",
    ].map((origin) => ["--snapshot-dir", "private-secret-missing", "--dev-origin", origin]),
  ]) {
    assert.throws(() => parsePreviewArguments(args), { name: "PreviewArgumentsError" });
  }
  assert.deepEqual(parsePreviewArguments(["--snapshot-dir", "explicit"]), {
    snapshotDirectory: "explicit",
    devOrigin: undefined,
  });
  for (const devOrigin of ["http://127.0.0.1:5173", "http://[::1]:5173"]) {
    assert.deepEqual(
      parsePreviewArguments(["--dev-origin", devOrigin, "--snapshot-dir", "explicit"]),
      { snapshotDirectory: "explicit", devOrigin },
    );
  }
});

test("argument rejection reports one safe failure without starting or installing signals", async () => {
  const { runPreview } = await import("../../../../scripts/preview-legacy-snapshot.mjs");
  const runtime = new EventEmitter();
  const events = [];
  runtime.stderr = { write: (line) => events.push(JSON.parse(line)) };
  let started = false;
  const result = await runPreview([], environment, {
    runtime,
    startPreview() {
      started = true;
      throw new Error("private-secret startup must not run");
    },
  });
  assert.equal(started, false);
  assert.equal(result, undefined);
  assert.equal(runtime.exitCode, 1);
  assert.equal(events.length, 1);
  assert.deepEqual(Object.keys(events[0]).sort(), ["errorType", "requestId"]);
  assert.equal(events[0].errorType, "PreviewArgumentsError");
  assert.match(
    events[0].requestId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
  );
  assert.equal(JSON.stringify(events).includes("private-secret"), false);
  assert.deepEqual(runtime.eventNames(), []);
});

test("composition owns real resources and idempotently drains API before closing snapshot", async (t) => {
  const { startLegacyPreview } = await import("../../../../scripts/preview-legacy-snapshot.mjs");
  const f = legacyFixture(t, { history: true });
  const before = captureDirectory(f.directory);
  const preview = await startLegacyPreview({
    snapshotDirectory: f.target,
    environment: { ERP_PORT: "0" },
    allowPortZero: true,
  });
  const context = await (await fetch(`${preview.address}/api/v1/legacy/context`)).json();
  assert.equal(context.source.snapshotSha256, f.manifest.ledgers.teaching.sha256);
  assert.equal(context.periods.length, 3);
  await Promise.all([preview.close(), preview.close(), preview.close()]);
  await assert.rejects(fetch(`${preview.address}/api/v1/legacy/context`));
  assert.deepEqual(captureDirectory(f.directory), before);
});

test("composition startup/bind/close failures release resources, preserve close order and remain failures", async (t) => {
  const { startLegacyPreview } = await import("../../../../scripts/preview-legacy-snapshot.mjs");
  const { openVerifiedTeachingReader } = await import(
    "../../../../scripts/legacy-snapshot-reader.mjs"
  );
  const { createApi } = await import("@erp/infra/http");
  const f = legacyFixture(t);
  const before = captureDirectory(f.directory);
  const blocker = await reserve(t);
  let reader: ReturnType<typeof openVerifiedTeachingReader>;
  await assert.rejects(
    startLegacyPreview({
      snapshotDirectory: f.target,
      environment: { ERP_PORT: String(blocker.port) },
      openReader(directory) {
        reader = openVerifiedTeachingReader(directory);
        return reader;
      },
    }),
    (error) => error.code === "EADDRINUSE",
  );
  assert.throws(
    () => reader.periods(),
    (error) => error.code === "CLOSED",
  );
  await assert.rejects(
    startLegacyPreview({
      snapshotDirectory: f.target,
      openReader(directory) {
        reader = openVerifiedTeachingReader(directory);
        return reader;
      },
      async createApi() {
        throw new Error("private-secret startup");
      },
    }),
  );
  assert.throws(
    () => reader.periods(),
    (error) => error.code === "CLOSED",
  );
  for (const failApi of [false, true]) {
    const order = [];
    const preview = await startLegacyPreview({
      snapshotDirectory: f.target,
      environment: { ERP_PORT: "0" },
      allowPortZero: true,
      openReader(directory) {
        reader = openVerifiedTeachingReader(directory);
        return {
          info: reader.info,
          periods: () => reader.periods(),
          trialBalances: (month) => reader.trialBalances(month),
          ledger: (query) => reader.ledger(query),
          close() {
            order.push("reader");
            reader.close();
            throw new Error("private-secret close");
          },
        };
      },
      async createApi(options) {
        const api = await createApi({ ...options, logError: () => {} });
        return {
          ...api,
          async close() {
            assert.equal(reader.periods().length > 0, true);
            await api.close();
            assert.equal(api.server.server.listening, false);
            order.push("api");
            if (failApi) throw new Error("private-secret close");
          },
        };
      },
    });
    const close = preview.close();
    await assert.rejects(close);
    assert.equal(preview.close(), close);
    assert.deepEqual(order, ["api", "reader"]);
    assert.throws(
      () => reader.periods(),
      (error) => error.code === "CLOSED",
    );
  }
  assert.deepEqual(captureDirectory(f.directory), before);
});

async function signalFixture(t, failClose = false) {
  const { runPreview, startLegacyPreview } = await import(
    "../../../../scripts/preview-legacy-snapshot.mjs"
  );
  const { openVerifiedTeachingReader } = await import(
    "../../../../scripts/legacy-snapshot-reader.mjs"
  );
  const { createApi } = await import("@erp/infra/http");
  let preview: Awaited<ReturnType<typeof startLegacyPreview>> | undefined;
  t.onTestFinished(() => preview?.close().catch(() => {}));
  const f = legacyFixture(t);
  const before = captureDirectory(f.directory);
  const runtime = new EventEmitter();
  const events = [];
  runtime.stderr = { write: (line) => events.push(JSON.parse(line)) };
  const order = [];
  let api: Awaited<ReturnType<typeof createApi>>;
  let reader: ReturnType<typeof openVerifiedTeachingReader>;
  const listenerCounts = ["SIGINT", "SIGTERM"].map((signal) => process.listenerCount(signal));
  preview = await runPreview(
    ["--snapshot-dir", f.target],
    { ERP_PORT: "0" },
    {
      runtime,
      startPreview(options) {
        return startLegacyPreview({
          ...options,
          allowPortZero: true,
          openReader(directory) {
            reader = openVerifiedTeachingReader(directory);
            return {
              info: reader.info,
              periods: () => reader.periods(),
              trialBalances: (month) => reader.trialBalances(month),
              ledger: (query) => reader.ledger(query),
              close() {
                assert.equal(api.server.server.listening, false);
                order.push("reader");
                reader.close();
                if (failClose) throw new Error("private-secret reader close");
              },
            };
          },
          async createApi(options) {
            api = await createApi({ ...options, logError: () => {} });
            return {
              ...api,
              async close() {
                assert.equal(reader.periods().length > 0, true);
                await api.close();
                order.push("api");
                if (failClose) throw new Error("private-secret API close");
              },
            };
          },
        });
      },
    },
  );
  assert.ok(preview);
  assert.deepEqual(
    ["SIGINT", "SIGTERM"].map((signal) => process.listenerCount(signal)),
    listenerCounts,
  );
  assert.equal((await fetch(`${preview.address}/api/v1/legacy/context`)).status, 200);
  return { runtime, events, order, reader, api, preview, f, before };
}

test("runPreview repeated SIGTERM/SIGINT drain API then reader once without failure status", async (t) => {
  const { runtime, events, order, reader, api, preview, f, before } = await signalFixture(t);
  assert.equal(runtime.emit("SIGTERM"), true);
  assert.equal(runtime.emit("SIGINT"), true);
  assert.equal(runtime.emit("SIGTERM"), true);
  await runtime.listeners("SIGINT")[0]();
  assert.deepEqual(order, ["api", "reader"]);
  assert.equal(api.server.server.listening, false);
  assert.throws(
    () => reader.periods(),
    (error) => error.code === "CLOSED",
  );
  await assert.rejects(fetch(`${preview.address}/api/v1/legacy/context`));
  assert.equal(runtime.exitCode, undefined);
  assert.deepEqual(events, []);
  assert.deepEqual(captureDirectory(f.directory), before);
});

test("runPreview repeated signals report close rejection once as safe CloseError and failure status", async (t) => {
  const { runtime, events, order, reader, api, preview, f, before } = await signalFixture(t, true);
  assert.equal(runtime.emit("SIGINT"), true);
  assert.equal(runtime.emit("SIGTERM"), true);
  assert.equal(runtime.emit("SIGINT"), true);
  await runtime.listeners("SIGTERM")[0]();
  assert.deepEqual(order, ["api", "reader"]);
  assert.equal(api.server.server.listening, false);
  assert.throws(
    () => reader.periods(),
    (error) => error.code === "CLOSED",
  );
  await assert.rejects(fetch(`${preview.address}/api/v1/legacy/context`));
  assert.equal(runtime.exitCode, 1);
  assert.equal(events.length, 1);
  assert.deepEqual(Object.keys(events[0]).sort(), ["errorType", "requestId"]);
  assert.equal(events[0].errorType, "CloseError");
  assert.match(
    events[0].requestId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
  );
  assert.equal(JSON.stringify(events).includes("private-secret"), false);
  assert.deepEqual(captureDirectory(f.directory), before);
});
