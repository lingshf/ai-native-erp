import type { OpenItem } from "@erp/core/domain";
import type { ReconciliationConnection } from "../storage/reconciliation.ts";

/** Opening items read back per batch while writing the target (D434). */
export const OPENING_WRITE_BATCH = 1000;

/** One validated opening item, everything `writeOpening` needs to write it. */
export interface OpeningEntry {
  readonly source: string;
  readonly company: string;
  readonly legacyId: string;
  readonly journalLegacyRef: string;
  readonly item: OpenItem;
  readonly evidence: string;
}
export interface OpeningStaging {
  append(entry: OpeningEntry): void;
  count(): number;
}
type StagedRow = {
  seq: number;
  source: string;
  company: string;
  legacy_id: string;
  journal_legacy_ref: string;
  item: string;
  evidence: string;
};

/**
 * (Re)creates the `opening_entries` staging table in the temporary plan database, so the
 * validated items live on disk in file order instead of in a resident array.
 */
export function createOpeningStaging(plan: ReconciliationConnection): OpeningStaging {
  plan.exec(`DROP TABLE IF EXISTS opening_entries;
    CREATE TABLE opening_entries(seq INTEGER PRIMARY KEY,source TEXT NOT NULL,company TEXT NOT NULL,
      legacy_id TEXT NOT NULL,journal_legacy_ref TEXT NOT NULL,item TEXT NOT NULL,evidence TEXT NOT NULL)`);
  const insert = plan.prepare(
    "INSERT INTO opening_entries(seq,source,company,legacy_id,journal_legacy_ref,item,evidence) VALUES(?,?,?,?,?,?,?)",
  );
  let staged = 0;
  return {
    append(entry) {
      insert.run(
        ++staged,
        entry.source,
        entry.company,
        entry.legacyId,
        entry.journalLegacyRef,
        JSON.stringify(entry.item),
        entry.evidence,
      );
    },
    count: () => staged,
  };
}

/** Yields the staged items in file order, `size` at a time; only the current batch is in memory. */
export function* openingEntryBatches(
  plan: ReconciliationConnection,
  size: number,
): Generator<OpeningEntry[]> {
  const page = plan
    .prepare("SELECT * FROM opening_entries WHERE seq>? ORDER BY seq LIMIT ?")
    .safeIntegers(false);
  let after = 0;
  for (;;) {
    const rows = page.all(after, size) as StagedRow[];
    if (!rows.length) return;
    after = rows[rows.length - 1].seq;
    yield rows.map((row) => ({
      source: row.source,
      company: row.company,
      legacyId: row.legacy_id,
      journalLegacyRef: row.journal_legacy_ref,
      item: JSON.parse(row.item) as OpenItem,
      evidence: row.evidence,
    }));
  }
}
