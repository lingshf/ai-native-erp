import type { JournalDraftDto } from "@erp/core/contracts";
import type { Language } from "../ui/index.ts";
import { formatMinor } from "../reports-data.ts";

export const MAX_JOURNAL_LINES = 500;
export const LOOKUP_PAGE_SIZE = 100;
export const SOURCE_REF_MAX_LENGTH = 100;
export const MEMO_MAX_LENGTH = 200;

export const emptyLine = () => ({
  account: "",
  debit: "",
  credit: "",
  dimensions: {},
  suspense: null,
});
export const newDraft = (): JournalDraftDto => ({
  id: crypto.randomUUID(),
  revision: 0,
  sourceRef: "",
  date: "",
  memo: "",
  kind: "normal",
  operation: "journal",
  originalId: null,
  headerDimensions: {},
  lines: [emptyLine(), emptyLine()],
});
export const companyParam = (company: string) => `company=${encodeURIComponent(company)}`;
// Display-only totals for the editor footer; the server preview remains the balance authority.
function toMinor(value: string, scale: number) {
  const match = /^(\d+)(?:\.(\d*))?$/u.exec(value.trim() || "0");
  const fraction = match?.[2] ?? "";
  if (!match || fraction.length > scale) return undefined;
  const minor = Number(match[1] + fraction.padEnd(scale, "0"));
  return Number.isSafeInteger(minor) ? minor : undefined;
}
export function lineTotals(lines: JournalDraftDto["lines"], scale: number, language: Language) {
  let debit: number | undefined = 0,
    credit: number | undefined = 0;
  for (const line of lines) {
    const d = toMinor(line.debit, scale),
      c = toMinor(line.credit, scale);
    debit = debit === undefined || d === undefined ? undefined : debit + d;
    credit = credit === undefined || c === undefined ? undefined : credit + c;
  }
  const show = (value: number | undefined) =>
    value === undefined || !Number.isSafeInteger(value) ? "—" : formatMinor(value, language, scale);
  return {
    debit: show(debit),
    credit: show(credit),
    balanced: debit === undefined || credit === undefined || debit === credit,
  };
}
export function minorToDecimal(minor: number, scale: number) {
  const digits = String(minor).padStart(scale + 1, "0");
  return scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits;
}
