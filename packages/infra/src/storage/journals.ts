import { createHash, randomUUID } from "node:crypto";
import { StorageError, type JournalRepository, type JournalTools } from "@erp/core/application";
import { journalDraftStore } from "./journal-drafts.ts";
import { insertEntry, journalTurnover } from "./journal-posting.ts";
import { journalChainReader, journalEntryReader, journalPageReader } from "./journal-queries.ts";
import { journalCorrectionAuditLog, journalReceiptStore } from "./journal-receipts.ts";
import type { Connection } from "./types.ts";

export const journalTools: JournalTools = {
  id: randomUUID,
  now: () => new Date().toISOString(),
  hash(parts) {
    const hash = createHash("sha256");
    const visit = (value: unknown): void => {
      if (value === null || typeof value !== "object") {
        const text = JSON.stringify(value);
        if (text === undefined || (typeof value === "number" && !Number.isSafeInteger(value)))
          throw new StorageError("INVALID_INPUT");
        hash.update(text);
        return;
      }
      if (Array.isArray(value)) {
        hash.update("[");
        for (const item of value) {
          visit(item);
          hash.update(",");
        }
        hash.update("]");
      } else {
        hash.update("{");
        for (const key of Object.keys(value).sort()) {
          visit(key);
          hash.update(":");
          visit(Reflect.get(value, key));
          hash.update(",");
        }
        hash.update("}");
      }
    };
    visit(parts);
    return hash.digest("hex");
  },
};
export function storedJournalPlan(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  // Pre-008 immutable business/queue evidence has the same accounting-date defaults.
  return {
    ...value,
    documentDate: Object.hasOwn(value, "documentDate")
      ? Reflect.get(value, "documentDate")
      : Reflect.get(value, "date"),
    taxDate: Object.hasOwn(value, "taxDate")
      ? Reflect.get(value, "taxDate")
      : Reflect.get(value, "date"),
  };
}
// Spread order is the key order of JournalRepository; keep it unchanged.
export function journalRepository(db: Connection): JournalRepository {
  return {
    insertHistoricalJournal: (company, entry, run) => insertEntry(db, company, entry, null, run),
    journalTurnover: (company) => journalTurnover(db, company),
    ...journalDraftStore(db),
    ...journalPageReader(db),
    ...journalEntryReader(db),
    ...journalChainReader(db),
    ...journalReceiptStore(db),
    insertJournalEntry: (company, entry, key) => insertEntry(db, company, entry, key, null),
    ...journalCorrectionAuditLog(db),
  };
}
