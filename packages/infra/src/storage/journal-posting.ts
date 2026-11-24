import { StorageError } from "@erp/core/application";
import type { JournalEntry } from "@erp/core/domain";
import type { Connection } from "./types.ts";

export async function journalTurnover(db: Connection, company: string): Promise<number> {
  const rows = await db.query(
    "SELECT s.turnover_minor FROM journal_entries e JOIN journal_seals s ON s.company_id=e.company_id AND s.entry_id=e.id WHERE e.company_id=? ORDER BY e.sequence DESC LIMIT 1",
    [company],
  );
  const value = Number(rows[0]?.turnover_minor ?? 0);
  if (!Number.isSafeInteger(value) || value < 0) throw new StorageError("STORAGE_FAILURE");
  return value;
}
export async function insertEntry(
  db: Connection,
  company: string,
  entry: JournalEntry,
  key: string | null,
  run: string | null,
) {
  await db.query(
    "INSERT INTO journal_entries(company_id,id,receipt_key,source_ref,accounting_date,document_date,tax_date,period,memo,kind,operation,role,posted_at,fingerprint,import_run) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [
      company,
      entry.id,
      key,
      entry.sourceRef,
      entry.date,
      entry.documentDate,
      entry.taxDate,
      entry.date.slice(0, 7),
      entry.memo,
      entry.kind === "closing" ? "normal" : entry.kind,
      entry.operation,
      entry.role,
      entry.postedAt,
      entry.fingerprint,
      run,
    ],
  );
  if (entry.kind === "closing")
    await db.query("INSERT INTO period_closing_journals(company_id,journal_id) VALUES(?,?)", [
      company,
      entry.id,
    ]);
  for (const [index, line] of entry.lines.entries()) {
    const { account, debit, credit, dimensions, ...evidence } = line;
    await db.query(
      "INSERT INTO journal_lines(company_id,entry_id,line_no,period,account_code,debit_minor,credit_minor,dimensions,evidence) VALUES(?,?,?,?,?,?,?,?,?)",
      [
        company,
        entry.id,
        index + 1,
        entry.date.slice(0, 7),
        account,
        debit,
        credit,
        JSON.stringify(dimensions),
        JSON.stringify(evidence),
      ],
    );
  }
  const previous = await journalTurnover(db, company);
  await db.query("INSERT INTO journal_seals(company_id,entry_id,turnover_minor) VALUES(?,?,?)", [
    company,
    entry.id,
    BigInt(previous) + BigInt(entry.debit),
  ]);
}
