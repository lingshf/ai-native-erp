import type { JournalDraft, JournalInputLine } from "./journals.ts";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function parseAiCandidate(
  text: string,
  id: string,
): {
  draft: JournalDraft;
  rationale: string;
} | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (
    !record(value) ||
    Object.keys(value).some(
      (key) => !["date", "memo", "kind", "rationale", "lines"].includes(key),
    ) ||
    typeof value.date !== "string" ||
    value.date.length !== 10 ||
    typeof value.memo !== "string" ||
    !value.memo.trim() ||
    value.memo.length > 200 ||
    (value.kind !== "normal" && value.kind !== "adjusting") ||
    typeof value.rationale !== "string" ||
    !value.rationale.trim() ||
    value.rationale.length > 2000 ||
    !Array.isArray(value.lines) ||
    value.lines.length < 2 ||
    value.lines.length > 100
  )
    return null;
  const lines: JournalInputLine[] = [];
  for (const line of value.lines) {
    if (
      !record(line) ||
      Object.keys(line).some(
        (key) => !["account", "debit", "credit", "dimensions"].includes(key),
      ) ||
      typeof line.account !== "string" ||
      !/^[1-9]\d{3}$/u.test(line.account) ||
      typeof line.debit !== "string" ||
      line.debit.length > 40 ||
      typeof line.credit !== "string" ||
      line.credit.length > 40 ||
      (line.dimensions !== undefined && !record(line.dimensions))
    )
      return null;
    const dimensions: Record<string, string> = {};
    for (const [key, item] of Object.entries(line.dimensions ?? {})) {
      if (
        typeof item !== "string" ||
        !/^[A-Z][A-Z0-9_]{0,31}$/u.test(key) ||
        !/^[A-Z0-9][A-Z0-9_-]{0,39}$/u.test(item)
      )
        return null;
      dimensions[key] = item;
    }
    if (Object.keys(dimensions).length > 32) return null;
    lines.push({
      account: line.account,
      debit: line.debit,
      credit: line.credit,
      dimensions,
      suspense: null,
    });
  }
  return {
    draft: {
      id,
      revision: 0,
      sourceRef: `AI-${id}`,
      date: value.date,
      memo: value.memo,
      kind: value.kind === "adjusting" ? "adjusting" : "normal",
      operation: "journal",
      originalId: null,
      headerDimensions: {},
      lines,
    },
    rationale: value.rationale,
  };
}
