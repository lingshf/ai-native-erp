import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { beforeEach, afterEach, describe, it, expect } from "vitest";
import {
  MasterDataService,
  TradeMasterService,
  DimensionService,
  JournalService,
} from "@erp/core/application";
import {
  type AccountInput,
  type TradeWrite,
  type JournalDraft,
  tradeKinds,
} from "@erp/core/domain";
import { createSqliteStorage } from "../../src/storage/index.ts";
import { createMasterDataStore } from "../../src/storage/master-data.ts";
import { createApi } from "../../src/http/index.ts";
import { normalizeMigration } from "../../src/storage/migrations.ts";
import { schemaFingerprint } from "../../src/storage/schema.ts";
import { sqliteBackend } from "../../src/storage/sqlite.ts";
import { SqliteExecutor } from "../../src/workers/executor.ts";
import { journalTools } from "../../src/storage/journals.ts";

const window = { name: "Trade", from: "2026-01-01", to: "2026-12-31" };
const common = { company: "DEFAULT", code: "A", active: true, expectedRevision: 0 };
const terms: TradeWrite = {
  ...common,
  kind: "tradeTerms",
  data: {
    ...window,
    dueDays: 30,
    discountDays: 7,
    discountPercent: "1.5",
    allowPartialDiscount: true,
  },
};
const tax: TradeWrite = {
  ...common,
  kind: "taxCode",
  code: "VAT",
  data: {
    ...window,
    mode: "ordinary",
    deductiblePercent: "75",
    inputAccount: "1400",
    outputAccount: "2200",
    rates: [{ id: "R", from: window.from, to: window.to, ratePercent: "12" }],
  },
};
const profile: TradeWrite = {
  ...common,
  kind: "tradeProfile",
  code: "AP",
  data: {
    ...window,
    side: "AP",
    controlAccount: "2100",
    advanceAccount: "1250",
    cashAccount: "1000",
    discountAccount: "4000",
  },
};
const party: TradeWrite = {
  ...common,
  kind: "tradeParty",
  data: {
    ...window,
    role: "vendor",
    apProfile: "AP",
    arProfile: null,
    terms: "A",
    allowedTaxCodes: ["VAT"],
    defaultDimensions: {},
  },
};
const product: TradeWrite = {
  ...common,
  kind: "tradeProduct",
  data: {
    ...window,
    type: "expense",
    expenseAccount: "5000",
    revenueAccount: null,
    allowedTaxCodes: ["VAT"],
    defaultDimensions: {},
  },
};
const commands = [terms, tax, profile, party, product];
describe("trade master HTTP and SQLite", () => {
  let directory: string, filename: string, host: string, now: string;
  let store: ReturnType<typeof createMasterDataStore>, api: Awaited<ReturnType<typeof createApi>>;
  let master: MasterDataService, service: TradeMasterService;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "erp-trade-"));
    filename = join(directory, "target.sqlite");
    const storage = createSqliteStorage({ filename });
    try {
      await storage.migrate();
    } finally {
      await storage.close();
    }
    store = createMasterDataStore({ filename });
    now = "2026-01-01T00:00:00.000Z";
    master = new MasterDataService(store);
    service = new TradeMasterService(store, () => now);
    await master.initialize(2026);
    for (const [code, category, reportGroup, controlModule] of [
      ["2100", "LIABILITY", "payables", "AP"],
      ["1250", "ASSET", "prepayments", "AP"],
      ["1400", "ASSET", "otherAssets", "TAX"],
      ["2200", "LIABILITY", "taxLiabilities", "TAX"],
    ] as const) {
      const account: AccountInput = {
        code,
        name: code,
        category,
        reportGroup,
        controlModule,
        purpose: "control",
        normalSide: category === "ASSET" ? "DEBIT" : "CREDIT",
        contraOf: null,
        active: true,
        manualAllowed: false,
      };
      await master.saveAccount("DEFAULT", account, 0);
    }
    api = await createApi({
      environment: { ERP_PORT: "0" },
      allowPortZero: true,
      trade: service,
      masterData: master,
      logError: () => undefined,
    });
    host = new URL(await api.listen()).host;
  });
  afterEach(async () => {
    await api?.close();
    await store?.close();
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  async function seed() {
    for (const command of commands) await service.save(command);
  }
  it.each(tradeKinds)(
    "%s create/list/update/history uses strict fields, immutable codes and CAS",
    async (kind) => {
      await seed();
      const command = commands.find((value) => value.kind === kind);
      if (!command) throw new Error("Missing command");
      const url = `/api/v1/trade/${kind}`;
      const get = () =>
        api.app.inject({ url: `${url}?company=DEFAULT&limit=1`, headers: { host } });
      const listed = await get();
      expect(listed.statusCode).toBe(200);
      expect(listed.json().items[0]).toMatchObject({ kind, code: command.code, revision: 1 });
      expect(
        (await api.app.inject({ method: "POST", url, headers: { host }, payload: command }))
          .statusCode,
      ).toBe(409);
      expect(
        (
          await api.app.inject({
            method: "POST",
            url,
            headers: { host },
            payload: { ...command, code: "NEW", group: "UNUSED" },
          })
        ).statusCode,
      ).toBe(400);
      now = "2026-01-02T00:00:00.000Z";
      const writes = await Promise.all(
        ["First", "Second"].map((name) =>
          api.app.inject({
            method: "PUT",
            url,
            headers: { host },
            payload: {
              ...command,
              expectedRevision: 1,
              data: { ...command.data, name },
              active: false,
            },
          }),
        ),
      );
      expect(writes.map((reply) => reply.statusCode).sort()).toEqual([200, 409]);
      const historical = await api.app.inject({
        url: `${url}/${command.code}?company=DEFAULT&at=2026-01-01T12%3A00%3A00.000Z`,
        headers: { host },
      });
      expect(historical.json()).toMatchObject({
        active: true,
        revision: 1,
        data: { name: "Trade" },
      });
      const current = await api.app.inject({
        url: `${url}/${command.code}?company=DEFAULT`,
        headers: { host },
      });
      expect(current.json()).toMatchObject({ active: false, revision: 2 });
      expect(
        (
          await api.app.inject({
            method: "PUT",
            url,
            headers: { host },
            payload: { ...command, code: "RENAMED", expectedRevision: 2 },
          })
        ).statusCode,
      ).toBe(409);
      expect((await get()).json().items).toHaveLength(1);
      const db = new Database(filename);
      try {
        expect(
          db.prepare("SELECT count(*) n FROM trade_config_history WHERE kind=?").get(kind),
        ).toEqual({ n: 2 });
        expect(() => db.prepare("DELETE FROM trade_config_history WHERE kind=?").run(kind)).toThrow(
          /immutable/,
        );
        expect(() =>
          db.prepare("UPDATE trade_config_history SET snapshot='{}' WHERE kind=?").run(kind),
        ).toThrow(/immutable/);
        expect(db.prepare("SELECT count(*) n FROM journal_entries").get()).toEqual({ n: 0 });
      } finally {
        db.close();
      }
    },
  );
  it.each(tradeKinds)(
    "%s rejects wrong verbs, invalid queries, foreign origins and mismatched route kind",
    async (kind) => {
      const url = `/api/v1/trade/${kind}`;
      const command = commands.find((value) => value.kind === kind);
      if (!command) throw new Error("Missing command");
      expect((await api.app.inject({ method: "DELETE", url, headers: { host } })).statusCode).toBe(
        405,
      );
      expect(
        (await api.app.inject({ url: `${url}?company=DEFAULT&limit=501`, headers: { host } }))
          .statusCode,
      ).toBe(400);
      expect(
        (await api.app.inject({ url: `${url}?company=DEFAULT&extra=1`, headers: { host } }))
          .statusCode,
      ).toBe(400);
      expect(
        (
          await api.app.inject({
            method: "POST",
            url,
            headers: { host, origin: "https://evil.invalid" },
            payload: command,
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (await api.app.inject({ method: "PUT", url, headers: { host }, payload: command }))
          .statusCode,
      ).toBe(400);
      expect(
        (
          await api.app.inject({
            method: "POST",
            url,
            headers: { host },
            payload: { ...command, kind: kind === "tradeTerms" ? "taxCode" : "tradeTerms" },
          })
        ).statusCode,
      ).toBe(400);
    },
  );
  it("supports AR and both-role partners, service products and effective default dimensions without implicit setup", async () => {
    await seed();
    for (const [code, category, reportGroup] of [
      ["1300", "ASSET", "receivables"],
      ["2300", "LIABILITY", "otherLiabilities"],
    ] as const) {
      await master.saveAccount(
        "DEFAULT",
        {
          code,
          category,
          reportGroup,
          name: code,
          controlModule: "AR",
          purpose: "control",
          normalSide: category === "ASSET" ? "DEBIT" : "CREDIT",
          contraOf: null,
          manualAllowed: false,
          active: true,
        },
        0,
      );
    }
    await service.save({
      ...profile,
      code: "AR",
      data: { ...profile.data, side: "AR", controlAccount: "1300", advanceAccount: "2300" },
    });
    const dimensions = new DimensionService(store);
    const dimension = {
      code: "DEPT",
      revision: 0,
      active: true,
      from: window.from,
      to: window.to,
    };
    await dimensions.save("DEFAULT", { ...dimension, kind: "dimension", name: "Department" });
    await dimensions.save("DEFAULT", {
      ...dimension,
      kind: "value",
      code: "SALES",
      dimension: "DEPT",
      name: "Sales",
    });
    for (const role of ["customer", "both"] as const) {
      const saved = await service.save({
        ...party,
        code: role.toUpperCase(),
        data: {
          ...party.data,
          role,
          apProfile: role === "customer" ? null : "AP",
          arProfile: "AR",
          defaultDimensions: { DEPT: "SALES" },
        },
      });
      expect(saved.data).toMatchObject({ role, defaultDimensions: { DEPT: "SALES" } });
    }
    await expect(
      service.save({
        ...product,
        code: "SERVICE",
        data: {
          ...product.data,
          type: "service",
          expenseAccount: null,
          revenueAccount: "4000",
          defaultDimensions: { DEPT: null },
        },
      }),
    ).resolves.toMatchObject({ kind: "tradeProduct" });
    await expect(
      service.save({ ...party, code: "LONGWINDOW", data: { ...party.data, from: "2025-12-31" } }),
    ).rejects.toMatchObject({ issue: { rule: "reference" } });
    await dimensions.save("DEFAULT", {
      ...dimension,
      kind: "value",
      code: "SALES",
      dimension: "DEPT",
      name: "Sales",
      revision: 1,
      active: false,
    });
    await expect(
      service.save({
        ...party,
        code: "INACTIVEDIM",
        data: { ...party.data, defaultDimensions: { DEPT: "SALES" } },
      }),
    ).rejects.toMatchObject({
      issue: { path: "data.defaultDimensions.DEPT", rule: "reference" },
    });
  });
  it("persists the final safe revision and rejects a further save rather than committing an unreadable record", async () => {
    await service.save(terms);
    const db = new Database(filename);
    try {
      db.prepare("UPDATE trade_terms SET revision=? WHERE company_id='DEFAULT' AND code='A'").run(
        Number.MAX_SAFE_INTEGER - 1,
      );
    } finally {
      db.close();
    }
    const final = await api.app.inject({
      method: "PUT",
      url: "/api/v1/trade/tradeTerms",
      headers: { host },
      payload: { ...terms, expectedRevision: Number.MAX_SAFE_INTEGER - 1 },
    });
    expect(final.statusCode).toBe(200);
    expect(final.json().revision).toBe(Number.MAX_SAFE_INTEGER);
    expect((await service.get("DEFAULT", "tradeTerms", "A")).revision).toBe(
      Number.MAX_SAFE_INTEGER,
    );
    const rejected = await api.app.inject({
      method: "PUT",
      url: "/api/v1/trade/tradeTerms",
      headers: { host },
      payload: { ...terms, expectedRevision: Number.MAX_SAFE_INTEGER },
    });
    expect(rejected.statusCode).toBe(400);
  });
  it("isolates company references, checks profile sides and validates default dimension windows", async () => {
    await seed();
    await master.createCompany({
      code: "OTHER",
      name: "Other",
      currency: "CNY",
      scale: 2,
      year: 2026,
      closeMode: "annual",
    });
    await expect(service.save({ ...party, company: "OTHER" })).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    expect((await service.list("OTHER", "tradeParty", { limit: 100 })).items).toEqual([]);
    await expect(
      service.save({
        ...party,
        code: "WRONG",
        data: { ...party.data, role: "customer", apProfile: null, arProfile: "AP" },
      }),
    ).rejects.toMatchObject({ issue: { path: "data.arProfile", rule: "reference" } });
    await expect(
      service.save({
        ...party,
        code: "DIMS",
        data: { ...party.data, defaultDimensions: { DEPT: "SALES" } },
      }),
    ).rejects.toMatchObject({ issue: { path: "data.defaultDimensions.DEPT", rule: "reference" } });
    await expect(
      service.save({ ...profile, code: "BAD", data: { ...profile.data, advanceAccount: "1200" } }),
    ).rejects.toMatchObject({ issue: { path: "data.advanceAccount", rule: "account" } });
    await service.save({ ...terms, expectedRevision: 1, active: false });
    await expect(service.save({ ...party, code: "INACTIVE" })).rejects.toMatchObject({
      issue: { path: "data.terms", rule: "reference" },
    });
    expect(() =>
      service.save({
        ...tax,
        code: "BADWINDOW",
        data: { ...tax.data, rates: [{ ...tax.data.rates[0], to: "2027-01-01" }] },
      }),
    ).toThrow(expect.objectContaining({ issue: expect.objectContaining({ rule: "window" }) }));
  });
  it("allows CAS deactivation with stale references but validates reactivation and changed references", async () => {
    await seed();
    await service.save({ ...terms, active: false, expectedRevision: 1 });
    const disabled = await api.app.inject({
      method: "PUT",
      url: "/api/v1/trade/tradeParty",
      headers: { host },
      payload: { ...party, active: false, expectedRevision: 1 },
    });
    expect(disabled.statusCode).toBe(200);
    expect(disabled.json()).toMatchObject({ active: false, revision: 2 });
    await expect(service.save({ ...party, expectedRevision: 2 })).rejects.toMatchObject({
      issue: { path: "data.terms" },
    });
    await expect(
      service.save({
        ...party,
        active: false,
        expectedRevision: 2,
        data: { ...party.data, terms: "MISSING" },
      }),
    ).rejects.toMatchObject({ issue: { path: "data.terms" } });
    await expect(
      service.save({ ...party, active: false, expectedRevision: 1 }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(service.save({ ...party, code: "NEW", active: false })).rejects.toMatchObject({
      issue: { rule: "reference" },
    });
    await service.save({ ...tax, active: false, expectedRevision: 1 });
    const cash = await master.account("DEFAULT", "1250");
    await master.saveAccount("DEFAULT", { ...cash, active: false }, cash.revision);
    await expect(
      service.save({ ...profile, active: false, expectedRevision: 1 }),
    ).resolves.toMatchObject({ active: false, revision: 2 });
    await expect(
      service.save({ ...product, active: false, expectedRevision: 1 }),
    ).resolves.toMatchObject({ active: false, revision: 2 });
    await expect(service.save({ ...product, expectedRevision: 2 })).rejects.toMatchObject({
      issue: { path: "data.allowedTaxCodes" },
    });
  });
  it("executes trade reads and writes through production worker lanes and preserves structured rule errors", async () => {
    const executor = await SqliteExecutor.create({ filename, readers: 2 });
    const workerApi = await createApi({
      environment: { ERP_PORT: "0" },
      allowPortZero: true,
      ...executor.services(),
      logError: () => undefined,
    });
    try {
      const workerHost = new URL(await workerApi.listen()).host;
      const saved = await workerApi.app.inject({
        method: "POST",
        url: "/api/v1/trade/tradeTerms",
        headers: { host: workerHost },
        payload: terms,
      });
      expect(saved.statusCode).toBe(201);
      expect(
        (await executor.services().trade.list("DEFAULT", "tradeTerms", { limit: 1 })).items[0],
      ).toMatchObject({ code: "A", revision: 1 });
      expect(await executor.services().trade.get("DEFAULT", "tradeTerms", "A")).toMatchObject({
        revision: 1,
      });
      const invalid = await workerApi.app.inject({
        method: "POST",
        url: "/api/v1/trade/tradeProfile",
        headers: { host: workerHost },
        payload: { ...profile, data: { ...profile.data, cashAccount: "2100" } },
      });
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json().fieldErrors).toEqual([
        { path: "data.cashAccount", messageKey: "api.error.trade.account" },
      ]);
    } finally {
      await workerApi.close();
      await executor.close();
    }
  });
  it("paginates partners and products with indexed, literal Unicode prefix boundaries", async () => {
    await seed();
    const db = new Database(filename);
    try {
      const insertParty = db.prepare(
        "INSERT INTO trade_parties SELECT company_id,?, ?, active,revision,valid_from,valid_to,role,ap_profile,ar_profile,terms,allowed_tax_codes,default_dimensions FROM trade_parties WHERE company_id='DEFAULT' AND code='A'",
      );
      const insertProduct = db.prepare(
        "INSERT INTO trade_products SELECT company_id,?, ?, active,revision,valid_from,valid_to,type,expense_account,revenue_account,allowed_tax_codes,default_dimensions FROM trade_products WHERE company_id='DEFAULT' AND code='A'",
      );
      db.transaction(() => {
        for (let index = 1; index < 200; index++) {
          const code = `N${String(index).padStart(5, "0")}`;
          insertParty.run(code, `Partner ${index}`);
          insertProduct.run(code, `Product ${index}`);
        }
      })();
      db.prepare("UPDATE trade_parties SET name='Literal_% partner' WHERE code='A'").run();
      const names = [
        "Edge",
        `Edge\u{10ffff}`,
        `Edge\u{10ffff}tail`,
        "Edgf",
        "\u{10ffff}",
        "\u{10ffff}\u{10ffff}tail",
      ];
      for (const [index, name] of names.entries())
        db.prepare("UPDATE trade_parties SET name=? WHERE company_id='DEFAULT' AND code=?").run(
          name,
          `N${String(index + 1).padStart(5, "0")}`,
        );
      for (const table of ["trade_parties", "trade_products"]) {
        const plans = db
          .prepare(
            `EXPLAIN QUERY PLAN SELECT * FROM ${table} INDEXED BY ${table}_name WHERE company_id=? AND code>? AND name>=? AND name<? ORDER BY code LIMIT 101`,
          )
          .all("DEFAULT", "", "P", "Q");
        expect(JSON.stringify(plans)).toContain(`${table}_name`);
      }
    } finally {
      db.close();
    }
    for (const kind of ["tradeParty", "tradeProduct"]) {
      const reply = await api.app.inject({
        url: `/api/v1/trade/${kind}?company=DEFAULT&limit=100`,
        headers: { host },
      });
      expect(reply.statusCode).toBe(200);
      expect(reply.json().items).toHaveLength(100);
      expect(reply.json().nextCursor).toBeTruthy();
    }
    expect(
      (await service.list("DEFAULT", "tradeParty", { limit: 100, search: "Edge" })).items.map(
        (row) => row.data.name,
      ),
    ).toEqual(["Edge", `Edge\u{10ffff}`, `Edge\u{10ffff}tail`]);
    expect(
      (await service.list("DEFAULT", "tradeParty", { limit: 100, search: "\u{10ffff}" })).items.map(
        (row) => row.data.name,
      ),
    ).toEqual(["\u{10ffff}", "\u{10ffff}\u{10ffff}tail"]);
    const literal = await service.list("DEFAULT", "tradeParty", {
      limit: 100,
      search: "Literal_%",
    });
    expect(literal.items.map((row) => row.code)).toEqual(["A"]);
    const first = await service.list("DEFAULT", "tradeProduct", { limit: 100 });
    const second = await service.list("DEFAULT", "tradeProduct", {
      limit: 100,
      cursor: first.nextCursor ?? "",
    });
    expect(new Set([...first.items, ...second.items].map((row) => row.code)).size).toBe(200);
  });
  it("upgrades authentic 008 to 009 without changing published migration history or populated ledger evidence", async () => {
    const journals = new JournalService(store, journalTools);
    const input: JournalDraft = {
      id: randomUUID(),
      revision: 0,
      sourceRef: "PRE-UPGRADE-JOURNAL",
      date: "2026-01-15",
      documentDate: "2026-01-12",
      taxDate: "2026-01-14",
      memo: "Historical capital",
      operation: "journal",
      kind: "normal",
      originalId: null,
      headerDimensions: {},
      lines: [
        { account: "1000", debit: "50.00", credit: "", dimensions: {}, suspense: null },
        { account: "3000", debit: "", credit: "50.00", dimensions: {}, suspense: null },
      ],
    };
    const draft = await journals.save("DEFAULT", input);
    const preview = await journals.preview("DEFAULT", draft);
    const receipt = await journals.confirm({
      company: "DEFAULT",
      draftId: draft.id,
      revision: draft.revision,
      fingerprint: preview.fingerprint,
      idempotencyKey: randomUUID(),
      confirmation: "POST",
    });
    const upgradeFile = join(directory, "upgrade.sqlite");
    const backend = sqliteBackend({ filename: upgradeFile });
    const db = await backend.acquire(false, true);
    try {
      await db.begin();
      const filenames = [
        "001-storage.sql",
        "002-master-data.sql",
        "003-dimensions.sql",
        "004-journals.sql",
        "005-business-events.sql",
        "006-reports.sql",
        "007-period-close.sql",
        "008-journal-dates.sql",
      ];
      for (const [index, filename] of filenames.entries()) {
        const sql = normalizeMigration(
          await readFile(new URL(`../../migrations/sqlite/${filename}`, import.meta.url), "utf8"),
        );
        await db.script(sql);
        await db.query(
          "INSERT INTO schema_migrations(version,dialect,checksum,schema_fingerprint) VALUES(?,'sqlite',?,?)",
          [index + 1, createHash("sha256").update(sql).digest("hex"), await schemaFingerprint(db)],
        );
      }
      await db.query("ATTACH DATABASE ? AS existing", [filename]);
      for (const table of [
        "tenants",
        "books",
        "companies",
        "ledger_companies",
        "accounts",
        "periods",
        "config_history",
        "receipts",
        "audit",
        "journal_drafts",
        "journal_entries",
        "journal_lines",
        "journal_seals",
        "journal_corrections",
      ])
        await db.query(`INSERT INTO ${table} SELECT * FROM existing.${table}`);
      await db.script(`
        INSERT INTO tenants(tenant_id) VALUES('KEEP');
        INSERT INTO books(tenant_id,book_id) VALUES('KEEP','KEEP');
        INSERT INTO companies(tenant_id,book_id,company_id) VALUES('KEEP','KEEP','KEEP');
      `);
      await db.commit();
    } finally {
      await db.release();
      await backend.close();
    }
    const oldStore = createMasterDataStore({ filename: upgradeFile });
    // Migration verifies the old fingerprint before appending the new typed trade tables.
    const storage = createSqliteStorage({ filename: upgradeFile });
    try {
      await expect(storage.verifySchema()).rejects.toMatchObject({ code: "SCHEMA_MISMATCH" });
      const before = new Database(upgradeFile, { readonly: true });
      try {
        expect(
          before.prepare("SELECT MAX(version) AS version FROM schema_migrations").get(),
        ).toEqual({
          version: 8,
        });
        expect(
          before.prepare("SELECT name FROM sqlite_schema WHERE name GLOB 'trade_*'").all(),
        ).toEqual([]);
      } finally {
        before.close();
      }
      await storage.migrate();
      await storage.verifySchema();
      const preserved = new Database(upgradeFile);
      try {
        expect(
          preserved
            .prepare("SELECT tenant_id,book_id,company_id FROM companies WHERE company_id='KEEP'")
            .get(),
        ).toEqual({
          tenant_id: "KEEP",
          book_id: "KEEP",
          company_id: "KEEP",
        });
      } finally {
        preserved.close();
      }
      const oldMaster = new MasterDataService(oldStore);
      await oldMaster.initialize(2026);
      await new TradeMasterService(oldStore).save(terms);
      expect((await oldMaster.accounts("DEFAULT", { limit: 100 })).items).toHaveLength(12);
      expect(await new JournalService(oldStore, journalTools).entry("DEFAULT", draft.id)).toEqual(
        await journals.entry("DEFAULT", draft.id),
      );
      const source = new Database(filename, { readonly: true });
      const upgraded = new Database(upgradeFile, { readonly: true });
      try {
        for (const [table, order] of Object.entries({
          receipts: "company_id,receipt_key",
          audit: "company_id,sequence",
          config_history: "company_id,kind,config_key,revision",
          journal_entries: "sequence",
          journal_lines: "company_id,entry_id,line_no",
          journal_seals: "company_id,entry_id",
        })) {
          expect(upgraded.prepare(`SELECT * FROM ${table} ORDER BY ${order}`).all()).toEqual(
            source.prepare(`SELECT * FROM ${table} ORDER BY ${order}`).all(),
          );
        }
        expect(
          upgraded
            .prepare(
              "SELECT version,dialect,checksum,schema_fingerprint FROM schema_migrations WHERE version<=8 ORDER BY version",
            )
            .all(),
        ).toEqual(
          source
            .prepare(
              "SELECT version,dialect,checksum,schema_fingerprint FROM schema_migrations WHERE version<=8 ORDER BY version",
            )
            .all(),
        );
        expect(
          upgraded.prepare("SELECT version FROM schema_migrations ORDER BY version").all(),
        ).toEqual(Array.from({ length: 12 }, (_, index) => ({ version: index + 1 })));
        expect(
          upgraded
            .prepare("SELECT result FROM receipts WHERE idempotency_key=?")
            .get(receipt.idempotencyKey),
        ).toBeDefined();
      } finally {
        source.close();
        upgraded.close();
      }
    } finally {
      await oldStore.close();
      await storage.close();
    }
  });
});
