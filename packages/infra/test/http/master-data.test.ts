import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MasterDataService } from "@erp/core/application";
import { createSqliteStorage } from "../../src/storage/index.ts";
import { createMasterDataStore } from "../../src/storage/master-data.ts";
import { schemaFingerprint } from "../../src/storage/schema.ts";
import { sqliteBackend } from "../../src/storage/sqlite.ts";
import { createApi } from "../../src/http/index.ts";
import { normalizeMigration } from "../../src/storage/migrations.ts";

const input = {
  company: "DEFAULT",
  code: "1500",
  name: "Equipment",
  category: "ASSET",
  reportGroup: "fixedAssets",
  normalSide: "DEBIT",
  purpose: "general",
  controlModule: null,
  contraOf: null,
  manualAllowed: true,
  active: true,
  revision: 0,
} as const;
describe("master data HTTP and real SQLite use cases", () => {
  let directory: string;
  let store: ReturnType<typeof createMasterDataStore>;
  let api: Awaited<ReturnType<typeof createApi>>;
  let service: MasterDataService;
  let host: string;
  let now: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "erp-master-"));
    const config = { filename: join(directory, "target.sqlite") };
    const storage = createSqliteStorage(config);
    try {
      await storage.migrate();
    } finally {
      await storage.close();
    }
    store = createMasterDataStore(config);
    now = "2026-01-01T00:00:00.000Z";
    service = new MasterDataService(store, () => now);
    await service.initialize(2026);
    api = await createApi({
      environment: { ERP_PORT: "0" },
      allowPortZero: true,
      masterData: service,
      logError: () => undefined,
    });
    host = new URL(await api.listen()).host;
  });
  afterEach(async () => {
    await api?.close();
    await store?.close();
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  const headers = () => ({ host });
  it("seeds once, isolates company charts and currencies, and bounds stable company pagination", async () => {
    await service.initialize(2027);
    const seed = await api.app.inject({ url: "/api/v1/companies", headers: headers() });
    expect(seed.json().items).toMatchObject([
      { code: "DEFAULT", year: 2026, closeMode: "monthly-teaching" },
    ]);
    const create = {
      method: "POST" as const,
      url: "/api/v1/companies",
      headers: headers(),
      payload: {
        code: "A",
        name: "Alpha",
        currency: "EUR",
        scale: 2,
        year: 2026,
        closeMode: "annual",
      },
    };
    expect((await api.app.inject(create)).statusCode).toBe(201);
    expect((await service.accounts("A", { limit: 100 })).items).toHaveLength(8);
    expect(
      (await api.app.inject({ ...create, payload: { ...create.payload, code: "B", scale: 3 } }))
        .statusCode,
    ).toBe(409);
    const first = (
      await api.app.inject({ url: "/api/v1/companies?limit=1", headers: headers() })
    ).json();
    expect(first.items.map((row: { code: string }) => row.code)).toEqual(["A"]);
    expect(
      (
        await api.app.inject({
          url: `/api/v1/companies?limit=1&cursor=${first.nextCursor}`,
          headers: headers(),
        })
      ).json().items[0].code,
    ).toBe("DEFAULT");
    expect(
      (await api.app.inject({ url: "/api/v1/companies?limit=501", headers: headers() })).statusCode,
    ).toBe(400);
    expect((await api.app.inject({ url: "/api/v1/health" })).json().data).toBe("configured");
  });
  it("creates and paginates accounts, enforces CAS for simultaneous saves, and preserves historical versions", async () => {
    now = "2026-01-02T00:00:00.000Z";
    const created = await api.app.inject({
      method: "POST",
      url: "/api/v1/accounts",
      headers: headers(),
      payload: input,
    });
    expect(created.statusCode).toBe(201);
    expect(
      (
        await api.app.inject({
          method: "POST",
          url: "/api/v1/accounts",
          headers: headers(),
          payload: {
            ...input,
            code: "1590",
            name: "Depreciation",
            normalSide: "CREDIT",
            contraOf: "1500",
          },
        })
      ).statusCode,
    ).toBe(201);
    expect(await service.account("DEFAULT", "1590")).toMatchObject({
      contraOf: "1500",
      normalSide: "CREDIT",
    });
    now = "2026-01-03T00:00:00.000Z";
    const saves = await Promise.all(
      ["First", "Second"].map((name) =>
        api.app.inject({
          method: "PUT",
          url: "/api/v1/accounts",
          headers: headers(),
          payload: { ...input, revision: 1, name, active: false },
        }),
      ),
    );
    expect(saves.map((reply) => reply.statusCode).sort()).toEqual([200, 409]);
    expect(saves.find((reply) => reply.statusCode === 409)?.json()).toMatchObject({
      code: "CONFLICT",
      fieldErrors: [],
    });
    const accepted = saves.find((reply) => reply.statusCode === 200);
    if (!accepted) throw new Error("Missing successful CAS response");
    const winner = accepted.json();
    const historical = await api.app.inject({
      url: "/api/v1/accounts/1500?company=DEFAULT&at=2026-01-02T12%3A00%3A00.000Z",
      headers: headers(),
    });
    expect(historical.json()).toMatchObject({ name: "Equipment", revision: 1, active: true });
    const current = await api.app.inject({
      url: "/api/v1/accounts/1500?company=DEFAULT",
      headers: headers(),
    });
    expect(current.json()).toMatchObject({ name: winner.name, revision: 2, active: false });
    const page = await api.app.inject({
      url: "/api/v1/accounts?company=DEFAULT&limit=2&cursor=1000",
      headers: headers(),
    });
    expect(page.json().items.map((account: { code: string }) => account.code)).toEqual([
      "1200",
      "1500",
    ]);
    expect(page.json().nextCursor).toBe("1500");
    expect((await service.accounts("DEFAULT", { limit: 500 })).items).toHaveLength(10);
    const invalidParent = await api.app.inject({
      method: "POST",
      url: "/api/v1/accounts",
      headers: headers(),
      payload: { ...input, code: "1591", normalSide: "CREDIT", contraOf: "9999" },
    });
    expect(invalidParent.statusCode).toBe(400);
    expect(invalidParent.json()).toMatchObject({
      code: "INVALID_REQUEST",
      fieldErrors: [{ path: "contraOf", messageKey: "api.error.account.contraParent" }],
    });
    const invalidPurpose = await api.app.inject({
      method: "PUT",
      url: "/api/v1/accounts",
      headers: headers(),
      payload: {
        ...input,
        name: winner.name,
        revision: 2,
        active: false,
        purpose: "clearing",
      },
    });
    expect(invalidPurpose.statusCode).toBe(400);
    expect(invalidPurpose.json()).toMatchObject({
      code: "INVALID_REQUEST",
      fieldErrors: [{ path: "purpose", messageKey: "api.error.account.contraChildren" }],
    });
    await expect(service.account("MISSING", "1500")).rejects.toMatchObject({ code: "NOT_FOUND" });
    const raw = new Database(join(directory, "target.sqlite"));
    try {
      expect(
        raw
          .prepare(
            "SELECT count(*) AS n FROM config_history WHERE kind='account' AND config_key='1500'",
          )
          .get(),
      ).toEqual({ n: 2 });
      expect(() => raw.exec("DELETE FROM config_history")).toThrow();
    } finally {
      raw.close();
    }
  });
  it("protects the Local write boundary, strict payloads and monthly teaching built-ins", async () => {
    const request = {
      method: "POST" as const,
      url: "/api/v1/accounts",
      headers: headers(),
      payload: input,
    };
    expect(
      (
        await api.app.inject({
          ...request,
          headers: { ...headers(), origin: "https://external.invalid" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await api.app.inject({ ...request, payload: { ...input, actor: "OTHER" } })).statusCode,
    ).toBe(400);
    const rejected = await api.app.inject({
      method: "DELETE",
      url: "/api/v1/accounts",
      headers: headers(),
    });
    expect(rejected.statusCode).toBe(405);
    expect(rejected.headers.allow).toBe("GET, POST, PUT");
    expect(
      (
        await api.app.inject({
          method: "PUT",
          url: "/api/v1/accounts",
          headers: headers(),
          payload: { ...input, code: "1000", revision: 1 },
        })
      ).statusCode,
    ).toBe(400);
  });
  it("lists periods and applies revisioned freeze, reopen and irreversible explicit close", async () => {
    const page = await api.app.inject({
      url: "/api/v1/periods?company=DEFAULT&limit=2",
      headers: headers(),
    });
    expect(page.json().items.map((period: { month: string }) => period.month)).toEqual([
      "2026-01",
      "2026-02",
    ]);
    const command = {
      company: "DEFAULT",
      month: "2026-01",
      revision: 1,
      status: "frozen",
      reason: "Review",
      confirmed: false,
    };
    const request = {
      method: "PUT" as const,
      url: "/api/v1/periods",
      headers: headers(),
      payload: command,
    };
    expect((await api.app.inject(request)).json()).toMatchObject({ status: "frozen", revision: 2 });
    expect((await api.app.inject(request)).statusCode).toBe(409);
    expect(
      (
        await api.app.inject({
          ...request,
          payload: { ...command, revision: 2, status: "closed", confirmed: true },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await api.app.inject({ ...request, payload: { ...command, revision: 3, status: "open" } }))
        .statusCode,
    ).toBe(409);
  });
  it("uses the company/account primary-key index and keeps bounded lists below 1s p95 at 50 companies and 2000 accounts", async () => {
    const raw = new Database(join(directory, "target.sqlite"));
    raw.pragma("foreign_keys=ON");
    try {
      raw.transaction(() => {
        for (let index = 1; index < 50; index++) {
          const code = `C${String(index).padStart(2, "0")}`;
          raw
            .prepare(
              "INSERT INTO companies(tenant_id,book_id,company_id) VALUES('LOCAL','LOCAL',?)",
            )
            .run(code);
          raw
            .prepare(
              "INSERT INTO ledger_companies(company_id,name,currency,scale,year,close_mode,revision) VALUES(?,?,'CNY',2,2026,'annual',1)",
            )
            .run(code, code);
        }
        const insert = raw.prepare(
          "INSERT INTO accounts SELECT company_id,?,name,category,report_group,normal_side,purpose,control_module,contra_of,manual_allowed,active,0,revision FROM accounts WHERE company_id='DEFAULT' AND code='1000'",
        );
        for (let index = 0; index < 1992; index++) insert.run(String(6000 + index));
      })();
      expect(raw.prepare("SELECT count(*) AS n FROM accounts").get()).toEqual({ n: 2000 });
      const plan = raw
        .prepare(
          "EXPLAIN QUERY PLAN SELECT * FROM accounts WHERE company_id=? AND code>? ORDER BY code LIMIT ?",
        )
        .all("DEFAULT", "6000", 101);
      expect(JSON.stringify(plan)).toContain("SEARCH accounts USING PRIMARY KEY");
      const timings: Record<string, number[]> = { companies: [], accounts: [] };
      for (let index = 0; index < 20; index++) {
        for (const [kind, url, expected] of [
          ["companies", "/api/v1/companies?limit=100", 50],
          ["accounts", "/api/v1/accounts?company=DEFAULT&limit=100&cursor=6000", 100],
        ] as const) {
          const started = performance.now();
          const reply = await api.app.inject({ url, headers: headers() });
          expect(reply.statusCode).toBe(200);
          expect(reply.json().items).toHaveLength(expected);
          timings[kind].push(performance.now() - started);
        }
      }
      const p95 = Object.fromEntries(
        Object.entries(timings).map(([kind, samples]) => [kind, samples.sort((a, b) => a - b)[18]]),
      );
      expect(p95.companies).toBeLessThanOrEqual(1000);
      expect(p95.accounts).toBeLessThanOrEqual(1000);
      console.log(
        JSON.stringify({
          kind: "M0-08-list-p95-ms",
          companies: 50,
          accounts: 2000,
          samples: 20,
          p95,
        }),
      );
    } finally {
      raw.close();
    }
  });
});

it("upgrades an authentic immutable 001 target only on explicit migration, preserving existing scope data and checksums", async () => {
  const directory = await mkdtemp(join(tmpdir(), "erp-master-upgrade-"));
  const config = { filename: join(directory, "old.sqlite") };
  const backend = sqliteBackend(config);
  const storage = createSqliteStorage(config);
  try {
    const connection = await backend.acquire(false, true);
    const sql = normalizeMigration(
      await readFile(new URL("../../migrations/sqlite/001-storage.sql", import.meta.url), "utf8"),
    );
    await connection.begin();
    await connection.script(sql);
    const checksum = createHash("sha256").update(sql).digest("hex");
    await connection.query("INSERT INTO schema_migrations VALUES(1,'sqlite',?,?)", [
      checksum,
      await schemaFingerprint(connection),
    ]);
    await connection.query("INSERT INTO tenants(tenant_id) VALUES('KEEP')");
    await connection.commit();
    await connection.release();
    await expect(storage.verifySchema()).rejects.toMatchObject({ code: "SCHEMA_MISMATCH" });
    await storage.migrate();
    await storage.verifySchema();
    const raw = new Database(config.filename);
    try {
      expect(raw.prepare("SELECT tenant_id FROM tenants").all()).toEqual([{ tenant_id: "KEEP" }]);
      expect(
        raw.prepare("SELECT version,checksum FROM schema_migrations ORDER BY version").all(),
      ).toMatchObject([{ version: 1, checksum }, { version: 2 }]);
    } finally {
      raw.close();
    }
  } finally {
    await backend.close();
    await storage.close();
    await rm(directory, { recursive: true, force: true });
  }
});
