import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MasterDataService, DimensionService } from "@erp/core/application";
import { dimensionBalance } from "@erp/core/domain";
import { dimensionConfigSchema, errorSchema, type DimensionCommand } from "@erp/core/contracts";
import { createSqliteStorage } from "../../src/storage/index.ts";
import { sqliteBackend } from "../../src/storage/sqlite.ts";
import { schemaFingerprint } from "../../src/storage/schema.ts";
import { normalizeMigration } from "../../src/storage/migrations.ts";
import { createMasterDataStore } from "../../src/storage/master-data.ts";
import { createApi } from "../../src/http/index.ts";
const base = { revision: 0, active: true, from: "2026-01-01", to: "2026-12-31" };
describe("dimension HTTP and typed persistence", () => {
  let directory: string,
    api: Awaited<ReturnType<typeof createApi>>,
    store: ReturnType<typeof createMasterDataStore>,
    url: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "erp-dimensions-"));
    const config = { filename: join(directory, "target.sqlite") };
    const backend = sqliteBackend(config),
      db = await backend.acquire(false, true);
    try {
      await db.begin();
      for (const [index, file] of ["001-storage.sql", "002-master-data.sql"].entries()) {
        const sql = normalizeMigration(
          await readFile(new URL(`../../migrations/sqlite/${file}`, import.meta.url), "utf8"),
        );
        await db.script(sql);
        await db.query("INSERT INTO schema_migrations VALUES(?,'sqlite',?,?)", [
          index + 1,
          createHash("sha256").update(sql).digest("hex"),
          await schemaFingerprint(db),
        ]);
      }
      await db.query("INSERT INTO tenants(tenant_id) VALUES('KEEP')");
      await db.commit();
    } finally {
      await db.release();
      await backend.close();
    }
    const storage = createSqliteStorage(config);
    try {
      await expect(storage.verifySchema()).rejects.toMatchObject({ code: "SCHEMA_MISMATCH" });
      await storage.migrate();
      await storage.verifySchema();
    } finally {
      await storage.close();
    }
    store = createMasterDataStore(config);
    const masterData = new MasterDataService(store);
    await masterData.initialize(2026);
    api = await createApi({
      environment: { ERP_PORT: "0" },
      allowPortZero: true,
      masterData,
      dimensions: new DimensionService(store),
      logError: () => undefined,
    });
    url = await api.listen();
  });
  afterEach(async () => {
    await api?.close();
    await store?.close();
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  const write = async (config: DimensionCommand, company = "DEFAULT") => {
    const reply = await fetch(`${url}/api/v1/dimensions`, {
      method: config.revision === 0 ? "POST" : "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ company, config }),
    });
    return { status: reply.status, body: await reply.json() };
  };
  it("explicitly upgrades immutable002 and round-trips all configuration kinds with scoped keyset values, CAS and immutable history", async () => {
    for (const code of ["DEPT", "COST"]) {
      expect((await write({ ...base, kind: "dimension", code, name: code })).status).toBe(201);
      for (const value of ["A", "B"])
        expect(
          (await write({ ...base, kind: "value", dimension: code, code: value, name: value }))
            .status,
        ).toBe(201);
    }
    const defaults = await write({
      ...base,
      kind: "defaults",
      code: "LEDGER",
      values: { DEPT: "A" },
    });
    expect(dimensionConfigSchema.parse(defaults.body).kind).toBe("defaults");
    const structure = await write({
      ...base,
      kind: "structure",
      code: "1000",
      required: ["DEPT"],
      optional: ["COST"],
      forbidden: [],
      allowed: [{ DEPT: "A" }],
      fixed: {},
      conditionals: [],
    });
    expect(structure.status).toBe(201);
    expect(
      (
        await write({
          ...base,
          kind: "derivation",
          code: "D",
          when: { DEPT: "A" },
          values: { COST: "B" },
          mode: "fill",
        })
      ).status,
    ).toBe(201);
    const masterData = new MasterDataService(store);
    let account = await masterData.saveAccount(
      "DEFAULT",
      {
        code: "2800",
        name: "Clearing",
        category: "LIABILITY",
        reportGroup: "otherLiabilities",
        normalSide: "CREDIT",
        purpose: "clearing",
        controlModule: null,
        contraOf: null,
        manualAllowed: true,
        active: true,
      },
      0,
    );
    const balance = {
      ...base,
      kind: "balance" as const,
      code: "LEDGER",
      dimension: "DEPT",
      account: "2800",
    };
    const savedBalance = await write(balance);
    expect(savedBalance.status).toBe(201);
    expect(savedBalance.body).toEqual({ ...balance, revision: 1 });
    const lines = [
      { debit: 100, credit: 0, dimensions: { DEPT: "A" } },
      { debit: 0, credit: 100, dimensions: { DEPT: "B" } },
    ];
    for (const changes of [{ active: false }, { active: true, purpose: "general" as const }]) {
      account = await masterData.saveAccount(
        "DEFAULT",
        { ...account, ...changes },
        account.revision,
      );
      const current = await masterData.account("DEFAULT", "2800");
      expect(() =>
        dimensionBalance({ ...balance, revision: 1 }, "2026-01-15", lines, current),
      ).toThrow(
        expect.objectContaining({
          issue: { scope: "dimensions", path: "account", rule: "reference" },
        }),
      );
    }
    const page = await fetch(
      `${url}/api/v1/dimensions?company=DEFAULT&kind=value&dimension=DEPT&limit=1&cursor=A`,
    );
    expect(await page.json()).toMatchObject({
      items: [{ kind: "value", code: "B" }],
      nextCursor: null,
    });
    expect(
      (
        await write({
          ...base,
          revision: 1,
          kind: "value",
          dimension: "DEPT",
          code: "A",
          name: "Updated",
          active: false,
        })
      ).status,
    ).toBe(200);
    await masterData.createCompany({
      code: "B",
      name: "Other",
      currency: "CNY",
      scale: 2,
      year: 2026,
      closeMode: "annual",
    });
    expect((await (await fetch(`${url}/api/v1/dimensions?company=B`)).json()).items).toEqual([]);
    const raw = new Database(join(directory, "target.sqlite"));
    try {
      expect(raw.prepare("SELECT tenant_id FROM tenants WHERE tenant_id='KEEP'").get()).toEqual({
        tenant_id: "KEEP",
      });
      expect(raw.prepare("SELECT version FROM schema_migrations ORDER BY version").all()).toEqual([
        { version: 1 },
        { version: 2 },
        { version: 3 },
        { version: 4 },
        { version: 5 },
        { version: 6 },
        { version: 7 },
        { version: 8 },
        { version: 9 },
        { version: 10 },
        { version: 11 },
      ]);
      expect(
        raw
          .prepare(
            "SELECT count(*) AS n FROM dimension_history WHERE kind='value' AND config_key='DEPT:A'",
          )
          .get(),
      ).toEqual({ n: 2 });
      expect(() => raw.exec("DELETE FROM dimension_history")).toThrow();
      expect(
        raw
          .prepare(
            "EXPLAIN QUERY PLAN SELECT * FROM dimension_values WHERE company_id=? AND dimension_code=? AND value_code>? ORDER BY value_code LIMIT 101",
          )
          .all("DEFAULT", "DEPT", "A")
          .map((row) => JSON.stringify(row))
          .join(),
      ).toContain("SEARCH dimension_values USING PRIMARY KEY");
    } finally {
      raw.close();
    }
    expect(await new DimensionService(store).catalog("DEFAULT")).toHaveLength(10);
  });
  it("reports precise structure fields without writes, rejects mode fields per D5 and distinguishes genuine CAS", async () => {
    const definition = { ...base, kind: "dimension" as const, code: "DEPT", name: "Department" };
    expect((await write(definition)).status).toBe(201);
    const invalid = await write({
      ...base,
      kind: "structure",
      code: "1000",
      required: ["MISSING"],
      optional: [],
      forbidden: [],
      allowed: [],
      fixed: {},
      conditionals: [],
    });
    expect(invalid.status).toBe(400);
    expect(errorSchema.parse(invalid.body).fieldErrors).toEqual([
      { path: "required.0", messageKey: "api.error.dimensions.reference" },
    ]);
    const stale = await write({ ...definition, name: "Stale" });
    expect(stale.status).toBe(409);
    expect(errorSchema.parse(stale.body)).toMatchObject({ code: "CONFLICT", fieldErrors: [] });
    const unsupported = await fetch(`${url}/api/v1/dimensions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        company: "DEFAULT",
        config: {
          ...base,
          kind: "structure",
          code: "1000",
          required: [],
          optional: [],
          forbidden: [],
          allowed: [],
          fixed: {},
          conditionals: [],
          match: "exact",
        },
      }),
    });
    expect(unsupported.status).toBe(400);
    expect(await new DimensionService(store).catalog("DEFAULT")).toHaveLength(1);
  });
});
