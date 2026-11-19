import { createHash } from "node:crypto";
import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { DatabaseSync } from "node:sqlite";
import type { SQLOutputValue } from "node:sqlite";
import { StorageError } from "@erp/core/application";
import { accountFieldsSchema } from "@erp/core/contracts";
import { checkedAccount, DomainError } from "@erp/core/domain";
import { preflightLegacySnapshotPair, snapshotError, snapshotStat } from "./teaching.ts";

export type ImportChoices = {
  drafts: "import-as-draft" | "skip";
  receipts: "import" | "archive-only";
  "source-events": "import" | "archive-only";
  "transfer-queue": "import" | "archive-only";
  seals: "import" | "archive-only";
  audit: "import" | "archive-only";
};
type Source = "teaching" | "enterprise";
type Row = Record<string, SQLOutputValue>;
type Data = string | number | boolean | null | { [key: string]: Data } | Data[];
export type ImportReason =
  | "UNKNOWN_CURRENCY"
  | "FOREIGN_CURRENCY"
  | "ORPHAN_LINE"
  | "MISSING_ACCOUNT"
  | "MISSING_DIMENSION_VALUE"
  | "INVALID_AMOUNT"
  | "INVALID_DATE"
  | "INVALID_ACCOUNT"
  | "INVALID_JSON"
  | "MISSING_PERIOD"
  | "COMPANY_ID_CONFLICT"
  | "SUSPENSE_ACCOUNT"
  | "ACCOUNT_CONFIG_MISMATCH"
  | "CONFIG_FOLDED_INTO_ACCOUNT"
  | "SOURCE_CONFIG_HISTORY"
  | "SOURCE_TEMPLATE"
  | "SOURCE_REVISION"
  | "TARGET_SCHEMA_UNSUPPORTED";
export type ImportRecord = {
  type: "record";
  source: Source;
  object: string;
  legacy_ref: string;
  disposition:
    | "mapped"
    | "unmappable"
    | "archive-only"
    | "skipped"
    | "decision-required"
    | "source-only";
  reasons: ImportReason[];
  target: Data | null;
};
type Counts = Record<ImportRecord["disposition"] | "source", number>;
type Amounts = { debit: string; credit: string };
export function teachingImportCompany(firstMonth: string) {
  return {
    company_id: "TEACHING",
    name: "Teaching ledger",
    currency: "CNY",
    scale: 2,
    year: Number(firstMonth.slice(0, 4)),
  };
}
export function legacyTargetId(
  source: string,
  company: string,
  object: string,
  legacy: string,
): string {
  const bytes = createHash("sha256")
    .update(JSON.stringify([source, company, object, legacy]))
    .digest()
    .subarray(0, 16);
  // Keep legacy-ID locality in posting indexes; the hash suffix separates ledgers and high bits.
  bytes.writeUIntBE(Number(BigInt(legacy) & 0xffffffffffffn), 0, 6);
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export type ImportEvent =
  | {
      type: "decisions";
      snapshotSha256: Readonly<Record<Source, string>>;
      choices: {
        option: keyof ImportChoices;
        allowed: readonly string[];
        affected: number;
        selected: string | null;
      }[];
    }
  | ImportRecord
  | {
      type: "totals";
      source: Source;
      company: string;
      month: string;
      account: string;
      status: string;
      unadjusted: Amounts;
      adjusted: Amounts;
      postClosing: Amounts;
    }
  | {
      type: "summary";
      executable: boolean;
      counts: Record<string, Counts>;
      drafts: { journals: number; lines: number; lineDimensions: number };
    };

const choiceValues = {
  drafts: ["import-as-draft", "skip"],
  receipts: ["import", "archive-only"],
  "source-events": ["import", "archive-only"],
  "transfer-queue": ["import", "archive-only"],
  seals: ["import", "archive-only"],
  audit: ["import", "archive-only"],
} as const;
const choiceTables: Partial<Record<string, keyof ImportChoices>> = {
  receipts: "receipts",
  source_events: "source-events",
  transfer_queue: "transfer-queue",
  journal_seals: "seals",
  audit: "audit",
};
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
const string = (value: SQLOutputValue | undefined) => String(value ?? "");
const validDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
const validAmount = (value: SQLOutputValue | undefined): value is bigint =>
  typeof value === "bigint" && value >= 0n && value <= 9007199254740991n;
function checkedBatchSize(value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > 5000)
    throw new RangeError("Import batchSize must be between 1 and 5000.");
}
function json(value: SQLOutputValue | undefined): Record<string, unknown> {
  if (typeof value !== "string") throw new SyntaxError("Expected a legacy JSON object.");
  const parsed: unknown = JSON.parse(value);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
    throw new SyntaxError("Expected a legacy JSON object.");
  return Object.fromEntries(Object.entries(parsed));
}

function hashFile(file: string, expected: { bytes: number; sha256: string }): void {
  const fd = openSync(file, "r");
  try {
    if (fstatSync(fd).size !== expected.bytes) throw new StorageError("INVALID_SNAPSHOT");
    const hash = createHash("sha256");
    const buffer = Buffer.alloc(65536);
    let length = readSync(fd, buffer, 0, buffer.length, null);
    while (length !== 0) {
      hash.update(buffer.subarray(0, length));
      length = readSync(fd, buffer, 0, buffer.length, null);
    }
    if (hash.digest("hex") !== expected.sha256) throw new StorageError("INVALID_SNAPSHOT");
  } finally {
    closeSync(fd);
  }
}

/**
 * An already-produced snapshot pair only. Does not verify semantic integrity:
 * broken references must reach the planner as reportable data, not exceptions.
 */
export class LegacyImportSnapshot {
  readonly directory: string;
  readonly snapshotSha256: Readonly<Record<Source, string>>;
  readonly #db: Record<Source, DatabaseSync>;
  #closed = false;

  constructor(
    directory: string,
    manifest: {
      version: number;
      status: string;
      crossDatabaseAtomic: boolean;
      ledgers: Record<Source, { file: string; bytes: number; sha256: string }>;
    },
  ) {
    this.directory = directory;
    if (
      !manifest ||
      typeof manifest !== "object" ||
      !manifest.ledgers ||
      manifest.version !== 1 ||
      manifest.status !== "verified" ||
      manifest.crossDatabaseAtomic !== false
    )
      throw new StorageError("INVALID_SNAPSHOT");
    preflightLegacySnapshotPair(directory);
    const before = {
      teaching: snapshotStat(join(directory, "teaching.sqlite")),
      enterprise: snapshotStat(join(directory, "erp.sqlite")),
    };
    for (const [source, file] of [
      ["teaching", "teaching.sqlite"],
      ["enterprise", "erp.sqlite"],
    ] as const) {
      const entry = manifest.ledgers[source];
      if (entry?.file !== file || !/^[a-f0-9]{64}$/.test(entry.sha256))
        throw new StorageError("INVALID_SNAPSHOT");
      hashFile(join(directory, file), entry);
    }
    this.snapshotSha256 = Object.freeze({
      teaching: manifest.ledgers.teaching.sha256,
      enterprise: manifest.ledgers.enterprise.sha256,
    });
    const teaching = new DatabaseSync(join(directory, "teaching.sqlite"), { readOnly: true });
    try {
      const enterprise = new DatabaseSync(join(directory, "erp.sqlite"), { readOnly: true });
      this.#db = { teaching, enterprise };
      try {
        for (const db of Object.values(this.#db)) {
          db.exec("PRAGMA query_only=ON; PRAGMA cache_size=-8192; PRAGMA temp_store=FILE; BEGIN");
          db.prepare("SELECT count(*) FROM sqlite_schema").get();
        }
        preflightLegacySnapshotPair(directory);
        for (const [source, file] of [
          ["teaching", "teaching.sqlite"],
          ["enterprise", "erp.sqlite"],
        ] as const) {
          const after = snapshotStat(join(directory, file));
          if (
            !before[source] ||
            !after ||
            (["dev", "ino", "size", "mtimeNs", "ctimeNs"] as const).some(
              (key) => before[source]?.[key] !== after[key],
            )
          )
            throw snapshotError("identity", before[source], after);
        }
      } catch (error) {
        enterprise.close();
        throw error;
      }
    } catch (error) {
      teaching.close();
      throw error;
    }
  }

  close(): void {
    if (this.#closed) return;
    for (const db of Object.values(this.#db)) db.close();
    this.#closed = true;
  }

  #connection(source: Source): DatabaseSync {
    if (this.#closed) throw new StorageError("CLOSED");
    return this.#db[source];
  }

  *#query(source: Source, sql: string): Generator<Row> {
    const statement = this.#connection(source).prepare(sql);
    statement.setReadBigInts(true);
    yield* statement.iterate();
  }

  *tables(source: Source): Generator<string> {
    for (const row of this.#query(
      source,
      "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    ))
      yield string(row.name);
  }

  count(source: Source, table: string, drafts = false): number {
    for (const row of this.#query(
      source,
      `SELECT count(*) AS n FROM ${quote(table)}${drafts ? " WHERE status='draft'" : ""}`,
    ))
      return Number(row.n);
    throw new StorageError("SCHEMA_MISMATCH");
  }

  *rows(source: Source, table: string, batchSize: number): Generator<Row> {
    checkedBatchSize(batchSize);
    const db = this.#connection(source);
    // Keyset paging uses the real primary key, including composite WITHOUT ROWID tables.
    const keys = [...this.#query(source, `PRAGMA table_info(${quote(table)})`)]
      .filter((row) => row.pk !== 0n)
      .sort((a, b) => Number(a.pk) - Number(b.pk))
      .map((row) => string(row.name));
    if (!keys.length) throw new StorageError("SCHEMA_MISMATCH");
    const columns = keys.map((key) => `t.${quote(key)}`).join(",");
    let after: SQLOutputValue[] | undefined;
    let fullPage: boolean;
    const joins = this.#joins(source, table);
    do {
      const statement = db.prepare(
        `SELECT t.*${joins.select} FROM ${quote(table)} t ${joins.sql}
         ${after ? `WHERE (${columns})>(${keys.map(() => "?").join(",")})` : ""}
         ORDER BY ${columns} LIMIT ?`,
      );
      statement.setReadBigInts(true);
      const page = statement.all(...(after ?? []), batchSize);
      if (!page.length) return;
      for (const row of page) {
        row._legacy_ref =
          keys.length === 1
            ? string(row[keys[0]])
            : JSON.stringify(Object.fromEntries(keys.map((key) => [key, string(row[key])])));
        yield row;
      }
      after = keys.map((key) => page[page.length - 1][key]);
      fullPage = page.length === batchSize;
    } while (fullPage);
  }

  #joins(source: Source, table: string): { select: string; sql: string } {
    if (source === "teaching" && table === "accounts")
      return {
        select:
          ",coalesce(s.active,1) AS active,coalesce(s.manual_allowed,1) AS manual_allowed,p.normal_side,p.related_account",
        sql: "LEFT JOIN account_settings s ON s.code=t.code LEFT JOIN account_properties p ON p.code=t.code",
      };
    if (source === "enterprise" && table === "accounts")
      return {
        select: ",c.active",
        sql: "LEFT JOIN configs c ON c.company=t.company AND c.kind='account' AND c.code=t.code",
      };
    if (source === "enterprise" && ["configs", "config_versions"].includes(table))
      return {
        select: ",a.code AS account_exists,a.data AS account_data",
        sql: "LEFT JOIN accounts a ON a.company=t.company AND a.code=t.code",
      };
    if (table === "journals") {
      const month = source === "teaching" ? "substr(t.date,1,7)" : "substr(t.accounting_date,1,7)";
      return {
        select: `,p.month AS period_exists${source === "enterprise" ? ",c.currency,c.scale,c.report_currency,c.report_scale,u.code AS currency_exists,u.scale AS currency_scale" : ",r.kind AS original_kind"}`,
        sql: `LEFT JOIN periods p ON p.month=${month}${source === "enterprise" ? " AND p.company=t.company LEFT JOIN companies c ON c.code=t.company LEFT JOIN currencies u ON u.code=c.currency" : " LEFT JOIN journals r ON r.id=t.reversal_of"}`,
      };
    }
    if (table === "lines") {
      const company = source === "enterprise" ? " AND j.company=t.company" : "";
      const accountCompany = source === "enterprise" ? " AND a.company=t.company" : "";
      return {
        select: `,j.id AS parent_id,a.code AS account_exists${source === "enterprise" ? ",a.purpose AS account_purpose,c.currency,c.scale,c.report_currency,c.report_scale,u.code AS currency_exists,u.scale AS currency_scale" : ",j.status AS journal_status"}`,
        sql: `LEFT JOIN journals j ON j.id=t.journal_id${company}
              LEFT JOIN accounts a ON a.code=t.account${accountCompany}
              ${source === "enterprise" ? "LEFT JOIN companies c ON c.code=t.company LEFT JOIN currencies u ON u.code=c.currency" : ""}`,
      };
    }
    if (source === "teaching" && table === "line_dimensions")
      return {
        select: ",l.id AS parent_id,v.code AS value_exists,j.status AS journal_status",
        sql: "LEFT JOIN lines l ON l.id=t.line_id LEFT JOIN journals j ON j.id=l.journal_id LEFT JOIN dimension_values v ON v.dimension=t.dimension AND v.code=t.value",
      };
    if (source === "enterprise" && table === "companies")
      return {
        select: ",c.code AS currency_exists,c.scale AS currency_scale",
        sql: "LEFT JOIN currencies c ON c.code=t.currency",
      };
    return { select: "", sql: "" };
  }

  *totals(source: Source): Generator<Extract<ImportEvent, { type: "totals" }>> {
    const teaching = source === "teaching";
    const company = teaching ? "'TEACHING'" : "l.company";
    const date = teaching ? "j.date" : "j.accounting_date";
    const status = teaching ? "j.status" : "'posted'";
    const sql = `SELECT ${company} AS company,substr(${date},1,7) AS month,l.account,
      ${status} AS status,j.kind,l.debit,l.credit${teaching ? ",r.kind AS original_kind" : ""}
      FROM lines l JOIN journals j ON j.id=l.journal_id${teaching ? "" : " AND j.company=l.company"}
      ${teaching ? "LEFT JOIN journals r ON r.id=j.reversal_of" : ""}
      ORDER BY company,month,l.account,status,l.id`;
    let key = "";
    let total: Extract<ImportEvent, { type: "totals" }> | undefined;
    let amounts = [0n, 0n, 0n, 0n, 0n, 0n];
    const finish = () => {
      if (!total) throw new StorageError("INVALID_SNAPSHOT");
      [total.unadjusted, total.adjusted, total.postClosing] = [0, 2, 4].map((i) => ({
        debit: String(amounts[i]),
        credit: String(amounts[i + 1]),
      }));
      return total;
    };
    for (const row of this.#query(source, sql)) {
      const next = JSON.stringify([row.company, row.month, row.account, row.status]);
      if (key !== next) {
        if (total) yield finish();
        key = next;
        amounts = [0n, 0n, 0n, 0n, 0n, 0n];
        total = {
          type: "totals",
          source,
          company: string(row.company),
          month: string(row.month),
          account: string(row.account),
          status: string(row.status),
          unadjusted: { debit: "0", credit: "0" },
          adjusted: { debit: "0", credit: "0" },
          postClosing: { debit: "0", credit: "0" },
        };
      }
      if (!validAmount(row.debit) || !validAmount(row.credit)) continue;
      for (const [index, include] of [
        [
          0,
          row.kind !== "closing" && row.kind !== "adjusting" && row.original_kind !== "adjusting",
        ],
        [2, row.kind !== "closing"],
        [4, true],
      ] as const)
        if (include) {
          amounts[index] += row.debit;
          amounts[index + 1] += row.credit;
        }
    }
    if (total) yield finish();
  }

  *reconciliationTotals(source: Source): Generator<Row> {
    const teaching = source === "teaching";
    const company = teaching ? "'TEACHING'" : "l.company";
    const date = teaching ? "j.date" : "j.accounting_date";
    const normal = teaching
      ? "j.kind NOT IN('closing','adjusting') AND coalesce(r.kind,'')<>'adjusting'"
      : "j.kind NOT IN('closing','adjusting')";
    yield* this.#query(
      source,
      `SELECT ${company} company,substr(${date},1,7) month,l.account,
        sum(CASE WHEN ${normal} THEN l.debit ELSE 0 END) unadjustedDebit,
        sum(CASE WHEN ${normal} THEN l.credit ELSE 0 END) unadjustedCredit,
        sum(CASE WHEN j.kind<>'closing' THEN l.debit ELSE 0 END) adjustedDebit,
        sum(CASE WHEN j.kind<>'closing' THEN l.credit ELSE 0 END) adjustedCredit,
        sum(l.debit) postClosingDebit,sum(l.credit) postClosingCredit
       FROM lines l JOIN journals j ON j.id=l.journal_id${teaching ? "" : " AND j.company=l.company"}
       ${teaching ? "LEFT JOIN journals r ON r.id=j.reversal_of WHERE j.status='posted'" : ""}
       GROUP BY ${company},substr(${date},1,7),l.account ORDER BY 1,2,3`,
    );
  }

  *reconciliationDimensions(): Generator<Row> {
    yield* this.#query(
      "teaching",
      `SELECT 'TEACHING' company,substr(j.date,1,7) month,d.dimension,d.value,
        sum(l.debit) debit,sum(l.credit) credit
       FROM line_dimensions d JOIN lines l ON l.id=d.line_id JOIN journals j ON j.id=l.journal_id
       WHERE j.status='posted'
       GROUP BY month,d.dimension,d.value ORDER BY month,d.dimension,d.value`,
    );
  }
}

function mapRow(
  source: Source,
  table: string,
  row: Row,
): {
  target: Data | null;
  reasons: ImportReason[];
  sourceOnly?: boolean;
} {
  const reasons: ImportReason[] = [];
  const fail = (reason: ImportReason) => reasons.push(reason);
  const company_id = source === "teaching" ? "TEACHING" : string(row.company);
  let target: Data | null = null;
  if (source === "enterprise") {
    if (table === "meta") return { target: null, reasons: ["SOURCE_REVISION"], sourceOnly: true };
    if (table === "chart_templates")
      return { target: null, reasons: ["SOURCE_TEMPLATE"], sourceOnly: true };
    if (["configs", "config_versions"].includes(table) && row.kind === "account") {
      if (row.account_exists === null) return { target: null, reasons: ["MISSING_ACCOUNT"] };
      const data = json(row.data);
      if (table === "configs" && !isDeepStrictEqual(data, json(row.account_data)))
        return { target: null, reasons: ["ACCOUNT_CONFIG_MISMATCH"] };
      return {
        target: null,
        reasons: [table === "configs" ? "CONFIG_FOLDED_INTO_ACCOUNT" : "SOURCE_CONFIG_HISTORY"],
        sourceOnly: true,
      };
    }
  }
  if (source === "enterprise" && ["companies", "journals", "lines"].includes(table)) {
    if (row.currency_exists === null || row.scale !== row.currency_scale) fail("UNKNOWN_CURRENCY");
    if (row.currency !== row.report_currency || row.scale !== row.report_scale)
      fail("FOREIGN_CURRENCY");
    if ((table === "companies" ? row.code : row.company) === "TEACHING")
      fail("COMPANY_ID_CONFLICT");
  }
  if (table === "accounts") {
    const data = source === "teaching" ? {} : json(row.data);
    if (!/^[1-9]\d{3}$/.test(string(row.code))) fail("INVALID_ACCOUNT");
    const category = string(row.category);
    const debit = category === "ASSET" || category === "EXPENSE";
    const groups: Record<string, string> = {
      ASSET: "otherAssets",
      LIABILITY: "otherLiabilities",
      EQUITY: "otherEquity",
      REVENUE: "otherRevenue",
      EXPENSE: "otherExpense",
    };
    target = {
      company_id,
      code: string(row.code),
      name: source === "teaching" ? string(row.name) : String(data.name ?? ""),
      category,
      active: row.active === undefined || row.active === 1n,
      manual_allowed:
        source === "teaching" ? row.manual_allowed === 1n : data.manualAllowed === true,
      normal_side: String(data.normalSide ?? row.normal_side ?? (debit ? "DEBIT" : "CREDIT")),
      report_group: String(data.reportGroup ?? groups[category]),
      purpose: String(row.purpose ?? "general"),
      contra_of: String(data.contraOf ?? row.related_account ?? "") || null,
      control_module: typeof data.controlModule === "string" ? data.controlModule : null,
    };
    const account = accountFieldsSchema.safeParse({
      code: target.code,
      name: target.name,
      category: target.category,
      reportGroup: target.report_group,
      normalSide: target.normal_side,
      purpose: target.purpose,
      controlModule: target.control_module,
      contraOf: target.contra_of,
      manualAllowed: target.manual_allowed,
      active: target.active,
    });
    if (!account.success) fail("INVALID_ACCOUNT");
    else {
      try {
        target.name = checkedAccount(account.data).name;
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        fail("INVALID_ACCOUNT");
      }
    }
  } else if (source === "teaching" && table === "dimensions") {
    target = {
      company_id,
      code: string(row.code),
      name: string(row.name),
      active: row.active === 1n,
    };
  } else if (source === "teaching" && table === "dimension_values") {
    target = {
      company_id,
      dimension_code: string(row.dimension),
      value_code: string(row.code),
      name: string(row.name),
      active: row.active === 1n,
    };
  } else if (table === "periods") {
    if (!/^(?:19\d{2}|[2-9]\d{3})-(?:0[1-9]|1[0-2])$/.test(string(row.month))) fail("INVALID_DATE");
    target = {
      company_id,
      month: string(row.month),
      status:
        row.status === "hold"
          ? "frozen"
          : row.status === "permanent"
            ? "closed"
            : string(row.status),
    };
  } else if (table === "journals") {
    const document = string(source === "teaching" ? row.date : row.document_date);
    const accounting = string(source === "teaching" ? row.date : row.accounting_date);
    if (!validDate(document) || !validDate(accounting)) fail("INVALID_DATE");
    if (row.period_exists === null) fail("MISSING_PERIOD");
    target = {
      company_id,
      legacy_ref: string(row.id),
      document_date: document,
      accounting_date: accounting,
      tax_date: document,
      status: source === "teaching" && row.status === "draft" ? "draft" : "historical",
      kind:
        row.kind === "reversal"
          ? row.original_kind === "adjusting"
            ? "adjusting"
            : "normal"
          : row.kind === "closing"
            ? "normal"
            : string(row.kind),
      legacy_kind: string(row.kind),
      is_closing: row.kind === "closing",
      legacy_operation: source === "teaching" ? string(row.kind) : string(row.operation),
      legacy_details: source === "teaching" ? null : string(row.details),
      operation: row.kind === "reversal" ? "reverse" : "journal",
      reversal_of:
        row.reversal_of === undefined || row.reversal_of === null ? null : string(row.reversal_of),
      memo: string(row.memo),
    };
  } else if (table === "lines") {
    if (row.parent_id === null) fail("ORPHAN_LINE");
    if (row.account_exists === null) fail("MISSING_ACCOUNT");
    if (row.account_purpose === "suspense") fail("SUSPENSE_ACCOUNT");
    if (!validAmount(row.debit) || !validAmount(row.credit) || row.debit > 0n === row.credit > 0n)
      fail("INVALID_AMOUNT");
    target = {
      company_id,
      legacy_ref: string(row.id),
      journal_legacy_ref: string(row.journal_id),
      account_code: string(row.account),
      debit_minor: string(row.debit),
      credit_minor: string(row.credit),
    };
    if (source === "enterprise") {
      const data = json(row.data);
      if (data.account !== undefined && data.account !== row.account) fail("INVALID_ACCOUNT");
      if (typeof row.line_no !== "bigint" || row.line_no < 1n || row.line_no > 2000n)
        fail("TARGET_SCHEMA_UNSUPPORTED");
      for (const field of ["currency", "accountingCurrency", "reportingCurrency"])
        if (data[field] !== undefined && data[field] !== row.currency) fail("FOREIGN_CURRENCY");
      for (const [field, amount] of [
        ["debit", row.debit],
        ["credit", row.credit],
        ["transactionDebit", row.debit],
        ["transactionCredit", row.credit],
        ["reportingDebit", row.debit],
        ["reportingCredit", row.credit],
      ] as const) {
        const value = data[field];
        if (
          value !== undefined &&
          (typeof value !== "number" || !Number.isSafeInteger(value) || BigInt(value) !== amount)
        )
          fail("INVALID_AMOUNT");
      }
      if (
        data.dimensions !== undefined &&
        (data.dimensions === null ||
          typeof data.dimensions !== "object" ||
          Array.isArray(data.dimensions) ||
          Object.keys(data.dimensions).length !== 0)
      )
        fail("TARGET_SCHEMA_UNSUPPORTED");
      target.evidence = string(row.data);
      target.dimensions = {};
      target.line_no = Number(row.line_no);
    }
  } else if (source === "teaching" && table === "line_dimensions") {
    if (row.parent_id === null) fail("ORPHAN_LINE");
    if (row.value_exists === null) fail("MISSING_DIMENSION_VALUE");
    target = {
      company_id,
      line_legacy_ref: string(row.line_id),
      dimension_code: string(row.dimension),
      value_code: string(row.value),
    };
  } else if (source === "enterprise" && table === "companies") {
    target = {
      company_id: string(row.code),
      name: string(row.name),
      currency: string(row.currency),
      scale: Number(row.scale),
      year: Number(row.year),
    };
  } else if (source === "teaching" && table === "account_settings") {
    target = {
      company_id,
      code: string(row.code),
      active: row.active === 1n,
      manual_allowed: row.manual_allowed === 1n,
      revision: string(row.revision),
    };
  } else if (source === "teaching" && table === "account_properties") {
    target = {
      company_id,
      code: string(row.code),
      normal_side: string(row.normal_side),
      contra_of: row.related_account === null ? null : string(row.related_account),
      revision: string(row.revision),
    };
  } else if (source === "teaching" && table === "teaching_services") {
    target = {
      company_id,
      code: string(row.code),
      name: string(row.name),
      group_code: string(row.group_code),
      active: row.active === 1n,
    };
  } else if (source === "enterprise" && table === "audit") {
    if (
      !/^[ -~]{1,100}$/.test(string(row.reference)) ||
      !/^[a-z0-9][a-z0-9_.:-]{0,59}$/.test(string(row.action)) ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(string(row.at)) ||
      Buffer.byteLength(string(row.data)) > 65536
    )
      fail("TARGET_SCHEMA_UNSUPPORTED");
    json(row.data);
    target = {
      company_id,
      legacy_ref: string(row.id),
      operation: string(row.action),
      reference: string(row.reference),
      principal: "legacy.import",
      details: string(row.data),
      recorded_at: string(row.at),
    };
  } else if (source === "enterprise" && table === "currencies") {
    target = { code: string(row.code), scale: Number(row.scale) };
  } else {
    fail("TARGET_SCHEMA_UNSUPPORTED");
  }
  return { target: reasons.length ? null : target, reasons: [...new Set(reasons)] };
}

/**
 * Consume to completion before treating a plan as executable. Records and totals
 * are JSON-safe pure data; no writes, timestamps, random IDs or retained GL arrays.
 * The stream is the plan (e.g. serialize each event as one NDJSON line).
 */
export function* legacyImportPlan(
  snapshot: LegacyImportSnapshot,
  request: {
    dryRun?: boolean;
    choices?: ImportChoices;
    batchSize?: number;
    includeTotals?: boolean;
  },
): Generator<ImportEvent> {
  const { dryRun = false, batchSize = 1000 } = request;
  const choices = request.choices === undefined ? undefined : { ...request.choices };
  checkedBatchSize(batchSize);
  if (typeof dryRun !== "boolean") throw new TypeError("dryRun must be a boolean.");
  if (
    (choices === undefined && !dryRun) ||
    (choices !== undefined &&
      (Object.keys(choices).length !== 6 ||
        Object.entries(choiceValues).some(
          ([key, allowed]) => !allowed.some((value) => value === Reflect.get(choices, key)),
        )))
  )
    throw new TypeError("All six decision C choices must be explicit.");
  const decisions = Object.entries(choiceValues).map(([key, allowed]) => {
    const option = key as keyof ImportChoices;
    const table = Object.entries(choiceTables).find(([, value]) => value === option)?.[0];
    return {
      option,
      allowed,
      affected:
        option === "drafts"
          ? snapshot.count("teaching", "journals", true)
          : snapshot.count("enterprise", table ?? ""),
      selected: choices?.[option] ?? null,
    };
  });
  yield { type: "decisions", snapshotSha256: snapshot.snapshotSha256, choices: decisions };
  const counts: Record<string, Counts> = {};
  const drafts = { journals: 0, lines: 0, lineDimensions: 0 };
  let executable = choices !== undefined;
  for (const source of ["teaching", "enterprise"] as const) {
    for (const table of snapshot.tables(source)) {
      const count: Counts = {
        source: 0,
        mapped: 0,
        unmappable: 0,
        "archive-only": 0,
        skipped: 0,
        "decision-required": 0,
        "source-only": 0,
      };
      counts[`${source}.${table}`] = count;
      for (const row of snapshot.rows(source, table, batchSize)) {
        const draft =
          source === "teaching" &&
          ((table === "journals" && row.status === "draft") || row.journal_status === "draft");
        if (draft) {
          if (table === "journals") drafts.journals++;
          if (table === "lines") drafts.lines++;
          if (table === "line_dimensions") drafts.lineDimensions++;
        }
        const option = source === "enterprise" ? choiceTables[table] : draft ? "drafts" : undefined;
        const selected = option ? choices?.[option] : undefined;
        let mapped: ReturnType<typeof mapRow>;
        try {
          mapped = mapRow(source, table, row);
        } catch (error) {
          if (!(error instanceof SyntaxError)) throw error;
          mapped = { target: null, reasons: ["INVALID_JSON"] };
        }
        const disposition =
          option && !selected
            ? "decision-required"
            : selected === "archive-only"
              ? "archive-only"
              : selected === "skip"
                ? "skipped"
                : mapped.sourceOnly
                  ? "source-only"
                  : mapped.reasons.length
                    ? "unmappable"
                    : "mapped";
        if (disposition === "unmappable" || disposition === "decision-required") executable = false;
        count.source++;
        count[disposition]++;
        yield {
          type: "record",
          source,
          object: table,
          legacy_ref: string(row._legacy_ref),
          disposition,
          reasons:
            disposition === "unmappable" ||
            disposition === "decision-required" ||
            disposition === "source-only"
              ? mapped.reasons
              : [],
          target: disposition === "mapped" ? mapped.target : null,
        };
      }
    }
    if (request.includeTotals !== false) yield* snapshot.totals(source);
  }
  yield { type: "summary", executable, counts, drafts };
}
