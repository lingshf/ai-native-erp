import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { StorageError } from "@erp/core/application";
import { migrationReportSchema, type MigrationReport } from "@erp/core/contracts";
import {
  type LegacyImportSnapshot,
  legacyImportPlan,
  teachingImportCompany,
  legacyTargetId,
  type ImportChoices,
} from "./import-plan.ts";
import { acquireMaintenance } from "../storage/maintenance.ts";
import { tradeReportingRepository } from "../storage/trade-reporting.ts";
import {
  openReconciliationTarget as openTarget,
  type ReconciliationConnection,
} from "../storage/reconciliation.ts";

type Row = Record<string, string | number | null>;
type Run = {
  id: string;
  snapshot_sha: string;
  choices: string;
  status: string;
  opening?: string | null;
};
const stages = ["unadjusted", "adjusted", "postClosing"] as const;
function balances(values: Row[]): Row[] {
  return values.map((value) => ({
    ...value,
    ...Object.fromEntries(
      stages.map((stage) => [
        `${stage}Balance`,
        String(BigInt(value[`${stage}Debit`] ?? 0) - BigInt(value[`${stage}Credit`] ?? 0)),
      ]),
    ),
  }));
}
function trialTotals(values: Row[]): Row[] {
  const grouped = new Map<string, Row>();
  for (const value of values) {
    const key = JSON.stringify([value.company, value.month]);
    let total = grouped.get(key);
    if (!total) {
      total = { company: value.company, month: value.month };
      for (const stage of stages)
        for (const side of ["Debit", "Credit"]) total[`${stage}${side}`] = "0";
      grouped.set(key, total);
    }
    for (const stage of stages)
      for (const side of ["Debit", "Credit"]) {
        const field = `${stage}${side}`;
        total[field] = String(BigInt(total[field] ?? 0) + BigInt(value[field] ?? 0));
      }
  }
  return [...grouped.values()];
}
function draftMinor(value: string | number | null, scale: number): string {
  const text = String(value),
    match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match || (match[2]?.length ?? 0) > scale) return `invalid:${text}`;
  return String(
    BigInt(match[1]) * 10n ** BigInt(scale) + BigInt((match[2] ?? "").padEnd(scale, "0") || "0"),
  );
}
export const reconciliationSha256 = (value: string | Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");
function rows(db: ReconciliationConnection, sql: string): Row[] {
  return (db.prepare(sql).all() as Record<string, unknown>[]).map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        typeof value === "bigint" ? String(value) : value,
      ]),
    ),
  ) as Row[];
}
function runFor(snapshot: LegacyImportSnapshot, db: ReconciliationConnection): Run {
  const runs = db.prepare("SELECT * FROM legacy_import_runs").all() as Run[];
  if (runs.length !== 1 || runs[0].snapshot_sha !== JSON.stringify(snapshot.snapshotSha256))
    throw new StorageError("CONFLICT");
  if (!["imported", "reconciled", "failed"].includes(runs[0].status))
    throw new StorageError("CONFLICT");
  return runs[0];
}
function sequence(db: ReconciliationConnection): bigint {
  return (db.prepare("SELECT value FROM write_seq WHERE id=1").get() as { value: bigint }).value;
}

// The same snapshot planner defines inclusion; target evidence is never the source of expected amounts.
export async function reconcileLegacy(
  snapshot: LegacyImportSnapshot,
  db: ReconciliationConnection,
  confirmation?: { knownDifferencesSha256: string },
): Promise<MigrationReport> {
  const run = runFor(snapshot, db);
  const report: MigrationReport = {
    version: 1,
    runId: run.id,
    snapshotSha256: { ...snapshot.snapshotSha256 },
    verdict: "pending",
    blockers: [],
    knownDifferencesSha256: "",
    knownDifferences: [],
    checks: [],
    differences: [],
  };
  const compare = (section: string, expected: Row[], actual: Row[], keys: string[]) => {
    const key = (row: Row) => JSON.stringify(keys.map((name) => row[name]));
    const left = new Map(expected.map((row) => [key(row), row]));
    const right = new Map(actual.map((row) => [key(row), row]));
    report.checks.push({ section, expected, actual });
    for (const id of [...new Set([...left.keys(), ...right.keys()])].sort()) {
      const a = left.get(id) ?? null,
        b = right.get(id) ?? null;
      if (JSON.stringify(a) !== JSON.stringify(b))
        report.differences.push({ section, key: id, expected: a, actual: b });
    }
  };
  db.exec(`CREATE TEMP TABLE reconciliation_expected(
      source TEXT,object TEXT,legacy TEXT,evidence TEXT,target TEXT,
      PRIMARY KEY(source,object,legacy)) WITHOUT ROWID;`);
  try {
    const insert = db.prepare("INSERT INTO reconciliation_expected VALUES(?,?,?,?,?)");
    const known = new Map<string, MigrationReport["knownDifferences"][number]>();
    for (const event of legacyImportPlan(snapshot, {
      choices: JSON.parse(run.choices) as ImportChoices,
      includeTotals: false,
      batchSize: 5000,
    })) {
      if (event.type !== "record") continue;
      if (event.disposition === "mapped") {
        const data = event.target as Record<string, unknown>;
        insert.run(
          event.source,
          event.object,
          event.legacy_ref,
          JSON.stringify(event.target),
          event.object === "journals"
            ? legacyTargetId(event.source, String(data.company_id), "journals", event.legacy_ref)
            : null,
        );
      } else {
        const key = JSON.stringify([event.source, event.object, event.disposition, event.reasons]);
        let group = known.get(key);
        if (!group) {
          group = {
            source: event.source,
            object: event.object,
            disposition: event.disposition,
            reasons: event.reasons,
            count: 0,
            legacyRefs: [],
          };
          known.set(key, group);
        }
        group.count++;
        group.legacyRefs.push(event.legacy_ref);
      }
    }
    report.knownDifferences = [...known.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, group]) => ({ ...group, legacyRefs: group.legacyRefs.sort() }));
    const first = db
      .prepare(`SELECT min(json_extract(evidence,'$.month')) month
      FROM reconciliation_expected WHERE source='teaching' AND object='periods'`)
      .get() as { month: string | null };
    if (first.month)
      insert.run(
        "teaching",
        "companies",
        "TEACHING",
        JSON.stringify(teachingImportCompany(first.month)),
        null,
      );
    for (const row of rows(
      db,
      `SELECT e.source,e.object,e.legacy,
        CASE WHEN f.legacy_id IS NULL THEN 'missing' ELSE 'evidence' END issue
      FROM reconciliation_expected e LEFT JOIN legacy_refs f
      ON f.source=e.source AND f.object_type=e.object AND f.legacy_id=e.legacy AND f.run_id='${run.id.replaceAll("'", "''")}'
      WHERE f.legacy_id IS NULL OR f.evidence<>e.evidence OR (e.target IS NOT NULL AND e.target<>f.target_id)
      UNION ALL SELECT f.source,f.object_type,f.legacy_id,'extra' FROM legacy_refs f
      LEFT JOIN reconciliation_expected e ON e.source=f.source AND e.object=f.object_type AND e.legacy=f.legacy_id
      WHERE e.legacy IS NULL AND f.object_type NOT IN('opening_items','opening_accounts') ORDER BY 1,2,3`,
    )) {
      report.differences.push({
        section: "legacy_refs",
        key: JSON.stringify(row),
        expected: row.issue === "extra" ? null : row,
        actual: row.issue === "missing" ? null : row,
      });
    }
    compare(
      "counts",
      rows(
        db,
        "SELECT source,object,count(*) count FROM reconciliation_expected GROUP BY source,object ORDER BY source,object",
      ),
      rows(
        db,
        "SELECT source,object_type object,count(*) count FROM legacy_refs WHERE object_type NOT IN('opening_items','opening_accounts') GROUP BY source,object_type ORDER BY source,object_type",
      ),
      ["source", "object"],
    );
    for (const source of ["teaching", "enterprise"] as const) {
      const expected = [...snapshot.reconciliationTotals(source)].map(
        (row) =>
          Object.fromEntries(
            Object.entries(row).map(([key, value]) => [key, String(value)]),
          ) as Row,
      );
      const companyFilter =
        source === "teaching" ? "e.company_id='TEACHING'" : "e.company_id<>'TEACHING'";
      const actual = rows(
        db,
        `SELECT e.company_id company,e.period month,l.account_code account,
          sum(CASE WHEN c.journal_id IS NULL AND e.kind<>'adjusting' THEN l.debit_minor ELSE 0 END) unadjustedDebit,
          sum(CASE WHEN c.journal_id IS NULL AND e.kind<>'adjusting' THEN l.credit_minor ELSE 0 END) unadjustedCredit,
          sum(CASE WHEN c.journal_id IS NULL THEN l.debit_minor ELSE 0 END) adjustedDebit,
          sum(CASE WHEN c.journal_id IS NULL THEN l.credit_minor ELSE 0 END) adjustedCredit,
          sum(l.debit_minor) postClosingDebit,sum(l.credit_minor) postClosingCredit
          FROM journal_lines l JOIN journal_entries e ON e.company_id=l.company_id AND e.id=l.entry_id
          LEFT JOIN period_closing_journals c ON c.company_id=e.company_id AND c.journal_id=e.id
          WHERE ${companyFilter} GROUP BY e.company_id,e.period,l.account_code ORDER BY 1,2,3`,
      );
      compare(`balances.${source}`, balances(expected), balances(actual), [
        "company",
        "month",
        "account",
      ]);
      compare(`trial.${source}`, trialTotals(expected), trialTotals(actual), ["company", "month"]);
    }
    compare(
      "dimensions",
      [...snapshot.reconciliationDimensions()].map(
        (row) =>
          Object.fromEntries(
            Object.entries(row).map(([key, value]) => [key, String(value)]),
          ) as Row,
      ),
      rows(
        db,
        `SELECT l.company_id company,l.period month,d.key dimension,d.value,
        sum(l.debit_minor) debit,sum(l.credit_minor) credit
        FROM journal_lines l,json_each(l.dimensions) d GROUP BY l.company_id,l.period,d.key,d.value ORDER BY 1,2,3,4`,
      ),
      ["company", "month", "dimension", "value"],
    );
    compare(
      "periods",
      rows(
        db,
        `SELECT json_extract(evidence,'$.company_id') company,json_extract(evidence,'$.month') month,
        json_extract(evidence,'$.status') status FROM reconciliation_expected WHERE object='periods' ORDER BY 1,2`,
      ),
      rows(db, "SELECT company_id company,month,status FROM periods ORDER BY 1,2"),
      ["company", "month"],
    );
    compare(
      "account-configuration",
      rows(
        db,
        `SELECT json_extract(evidence,'$.company_id') company,json_extract(evidence,'$.code') account,
        json_extract(evidence,'$.purpose') purpose,json_extract(evidence,'$.control_module') module
        FROM reconciliation_expected WHERE object='accounts' ORDER BY 1,2`,
      ),
      rows(
        db,
        "SELECT company_id company,code account,purpose,control_module module FROM accounts ORDER BY 1,2",
      ),
      ["company", "account"],
    );
    for (const row of rows(
      db,
      `SELECT p.source,p.legacy,p.evidence expected,f.target_id target
      FROM reconciliation_expected p LEFT JOIN legacy_refs f
        ON f.source=p.source AND f.object_type=p.object AND f.legacy_id=p.legacy
      LEFT JOIN journal_entries e ON e.id=f.target_id
      LEFT JOIN journal_drafts d ON d.id=f.target_id
      LEFT JOIN period_closing_journals c ON c.company_id=e.company_id AND c.journal_id=e.id
      WHERE p.object='journals' AND (
        (json_extract(p.evidence,'$.status')='draft' AND d.id IS NULL) OR
        (json_extract(p.evidence,'$.status')='historical' AND (
          e.id IS NULL OR e.company_id<>json_extract(p.evidence,'$.company_id')
          OR e.accounting_date<>json_extract(p.evidence,'$.accounting_date')
          OR e.document_date<>json_extract(p.evidence,'$.document_date')
          OR e.tax_date<>json_extract(p.evidence,'$.tax_date')
          OR e.memo<>json_extract(p.evidence,'$.memo')
          OR e.kind<>json_extract(p.evidence,'$.kind')
          OR e.operation<>json_extract(p.evidence,'$.operation')
          OR (c.journal_id IS NOT NULL)<>json_extract(p.evidence,'$.is_closing'))))
      ORDER BY p.source,p.legacy`,
    )) {
      report.differences.push({
        section: "journals",
        key: `${row.source}:${row.legacy}`,
        expected: row,
        actual: { target: row.target },
      });
    }
    compare(
      "journal-counts",
      rows(
        db,
        `SELECT json_extract(evidence,'$.status') status,count(*) count
        FROM reconciliation_expected WHERE object='journals' GROUP BY status ORDER BY status`,
      ),
      rows(
        db,
        `SELECT status,count(*) count FROM (
        SELECT 'historical' status FROM journal_entries UNION ALL SELECT 'draft' FROM journal_drafts)
        GROUP BY status ORDER BY status`,
      ),
      ["status"],
    );
    // Only missing/extra line references are materialized, not a second JS copy of the GL.
    for (const row of rows(
      db,
      `SELECT f.source,f.legacy_id legacy,f.target_id target FROM legacy_refs f
      LEFT JOIN journal_lines l ON l.entry_id=substr(f.target_id,1,36)
        AND l.line_no=CAST(substr(f.target_id,38) AS INTEGER)
        AND l.company_id=json_extract(f.evidence,'$.company_id')
      LEFT JOIN journal_drafts d ON d.id=substr(f.target_id,1,36)
        AND d.company_id=json_extract(f.evidence,'$.company_id')
        AND json_array_length(json_extract(d.data,'$.lines'))>=CAST(substr(f.target_id,38) AS INTEGER)
      WHERE f.object_type='lines' AND l.entry_id IS NULL AND d.id IS NULL`,
    )) {
      report.differences.push({
        section: "lines",
        key: JSON.stringify(row),
        expected: row,
        actual: null,
      });
    }
    compare(
      "line-counts",
      rows(db, "SELECT count(*) count FROM reconciliation_expected WHERE object='lines'"),
      rows(
        db,
        `SELECT (SELECT count(*) FROM journal_lines)+coalesce(
        (SELECT sum(json_array_length(json_extract(data,'$.lines'))) FROM journal_drafts),0) count`,
      ),
      [],
    );
    for (const row of rows(
      db,
      `SELECT object_type object,target_id target,count(*) count FROM legacy_refs
      WHERE object_type IN('journals','lines') GROUP BY object_type,target_id HAVING count(*)<>1 ORDER BY 1,2`,
    )) {
      report.differences.push({
        section: "legacy_refs",
        key: JSON.stringify(row),
        expected: null,
        actual: row,
      });
    }
    compare(
      "drafts",
      rows(
        db,
        `SELECT f.source,e.legacy,json_extract(e.evidence,'$.company_id') company,
        json_extract(e.evidence,'$.accounting_date') date,json_extract(e.evidence,'$.memo') memo
        FROM reconciliation_expected e JOIN legacy_refs f ON f.source=e.source AND f.object_type=e.object AND f.legacy_id=e.legacy
        WHERE e.object='journals' AND json_extract(e.evidence,'$.status')='draft' ORDER BY 1,2`,
      ),
      rows(
        db,
        `SELECT f.source,f.legacy_id legacy,d.company_id company,d.accounting_date date,d.memo
        FROM journal_drafts d LEFT JOIN legacy_refs f ON f.target_id=d.id AND f.object_type='journals' ORDER BY 1,2`,
      ),
      ["source", "legacy"],
    );
    compare(
      "draft-lines",
      rows(
        db,
        `SELECT e.source,e.legacy,json_extract(e.evidence,'$.company_id') company,
        json_extract(e.evidence,'$.account_code') account,json_extract(e.evidence,'$.debit_minor') debit,
        json_extract(e.evidence,'$.credit_minor') credit
        FROM reconciliation_expected e CROSS JOIN reconciliation_expected p ON p.source=e.source
          AND p.object='journals' AND p.legacy=json_extract(e.evidence,'$.journal_legacy_ref')
        WHERE e.object='lines' AND json_extract(p.evidence,'$.status')='draft' ORDER BY 1,2`,
      ),
      rows(
        db,
        `SELECT f.source,f.legacy_id legacy,d.company_id company,json_extract(l.value,'$.account') account,
        json_extract(l.value,'$.debit') debit,json_extract(l.value,'$.credit') credit,c.scale
        FROM journal_drafts d JOIN ledger_companies c ON c.company_id=d.company_id,json_each(d.data,'$.lines') l
        LEFT JOIN legacy_refs f ON f.object_type='lines' AND f.target_id=d.id||':'||(CAST(l.key AS INTEGER)+1)
        ORDER BY 1,2`,
      ).map(({ scale, ...row }) => ({
        ...row,
        debit: draftMinor(row.debit, Number(scale)),
        credit: draftMinor(row.credit, Number(scale)),
      })),
      ["source", "legacy"],
    );
    const trade = tradeReportingRepository({
      async query(sql, values = []) {
        return db.prepare(sql).all(...values) as Record<string, unknown>[];
      },
    });
    const controls: Row[] = [];
    for (const owner of rows(
      db,
      `SELECT c.company_id company,
      coalesce(max(e.accounting_date),printf('%04d-12-31',c.year)) cutoff
      FROM ledger_companies c LEFT JOIN journal_entries e ON e.company_id=c.company_id
      GROUP BY c.company_id ORDER BY c.company_id`,
    )) {
      for (const control of await trade.tradeReconciliation(
        String(owner.company),
        String(owner.cutoff),
      ))
        controls.push({
          company: owner.company,
          cutoff: owner.cutoff,
          ...Object.fromEntries(
            Object.entries(control).map(([key, value]) => [key, String(value)]),
          ),
        });
    }
    report.checks.push({
      section: "trade-reconciliation",
      expected: [],
      actual: controls,
    });
    if (run.opening !== "done")
      report.blockers = controls.map((row) => ({
        code: "M2_03B_OPENING_REQUIRED",
        company: String(row.company),
        account: String(row.account),
      }));
    report.knownDifferencesSha256 = reconciliationSha256(JSON.stringify(report.knownDifferences));
    const saved = db
      .prepare("SELECT 1 FROM sqlite_schema WHERE name='legacy_reconciliations' AND type='table'")
      .get()
      ? (db
          .prepare("SELECT report,confirmation_sha FROM legacy_reconciliations WHERE run_id=?")
          .get(run.id) as { report: string; confirmation_sha: string | null } | undefined)
      : undefined;
    const acknowledged =
      confirmation?.knownDifferencesSha256 === report.knownDifferencesSha256 ||
      Boolean(
        saved?.confirmation_sha &&
          migrationReportSchema.parse(JSON.parse(saved.report)).knownDifferencesSha256 ===
            report.knownDifferencesSha256,
      );
    report.verdict = report.differences.length
      ? "difference"
      : report.blockers.length
        ? "blocked"
        : report.knownDifferences.length && !acknowledged
          ? "pending"
          : "pass";
    return report;
  } finally {
    db.exec("DROP TABLE reconciliation_expected");
  }
}

export async function checkLegacyReconciliation(
  snapshot: LegacyImportSnapshot,
  target: string,
): Promise<MigrationReport> {
  const db = openTarget(target, true);
  try {
    db.exec("BEGIN");
    return await reconcileLegacy(snapshot, db);
  } finally {
    db.close();
  }
}

export function saveReconciliation(db: ReconciliationConnection, report: MigrationReport): void {
  const serialized = JSON.stringify(report);
  db.prepare(`INSERT INTO legacy_reconciliations(run_id,report,report_sha) VALUES(?,?,?)
    ON CONFLICT(run_id) DO UPDATE SET report=excluded.report,report_sha=excluded.report_sha`).run(
    report.runId,
    serialized,
    reconciliationSha256(serialized),
  );
}

export async function confirmLegacyReconciliation(
  snapshot: LegacyImportSnapshot,
  target: string,
  confirmationFile: string,
  hooks: { afterRead?: () => void } = {},
): Promise<MigrationReport> {
  const release = acquireMaintenance(target);
  let reader: ReconciliationConnection | undefined, writer: ReconciliationConnection | undefined;
  try {
    reader = openTarget(target, true);
    reader.exec("BEGIN");
    const run = runFor(snapshot, reader),
      baseline = sequence(reader);
    if (run.status === "reconciled") {
      const saved = reader
        .prepare("SELECT report,baseline FROM legacy_reconciliations WHERE run_id=?")
        .get(run.id) as { report: string; baseline: bigint | null } | undefined;
      if (!saved || saved.baseline !== baseline) throw new StorageError("CONFLICT");
      return migrationReportSchema.parse(JSON.parse(saved.report));
    }
    if (run.status !== "imported") throw new StorageError("CONFLICT");
    const bytes = readFileSync(confirmationFile);
    const parsed: unknown = JSON.parse(bytes.toString("utf8"));
    const confirmation =
      parsed &&
      typeof parsed === "object" &&
      "knownDifferencesSha256" in parsed &&
      typeof parsed.knownDifferencesSha256 === "string"
        ? { knownDifferencesSha256: parsed.knownDifferencesSha256 }
        : undefined;
    const report = await reconcileLegacy(snapshot, reader, confirmation);
    if (report.verdict !== "pass") return report;
    // Even an empty list must be bound to the exact user-provided confirmation.
    if (confirmation?.knownDifferencesSha256 !== report.knownDifferencesSha256)
      return { ...report, verdict: "pending" };
    reader.close();
    reader = undefined;
    hooks.afterRead?.();
    writer = openTarget(target, false);
    writer.exec("BEGIN IMMEDIATE");
    if (
      sequence(writer) !== baseline ||
      (
        writer.prepare("SELECT status FROM legacy_import_runs WHERE id=?").get(run.id) as {
          status: string;
        }
      ).status !== "imported"
    )
      throw new StorageError("CONFLICT");
    saveReconciliation(writer, report);
    writer
      .prepare(
        "UPDATE legacy_reconciliations SET confirmation_sha=?,baseline=? WHERE run_id=? AND baseline IS NULL",
      )
      .run(reconciliationSha256(bytes), baseline, run.id);
    writer.prepare("UPDATE legacy_import_runs SET status='reconciled' WHERE id=?").run(run.id);
    writer.exec("COMMIT");
    return report;
  } finally {
    reader?.close();
    writer?.close();
    release();
  }
}
