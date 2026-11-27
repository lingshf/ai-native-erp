import { DomainError, checkedJournalDay } from "./index.ts";
import type { TradeIssue } from "./trade-master.ts";

export function tradeError(path: string, rule: TradeIssue["rule"]): never {
  throw new DomainError("INVALID_INPUT", { scope: "trade", path, rule });
}
export function checkedTradePercent(value: string, path: string): bigint {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,2})(?:\.\d{1,6})?$/u.test(value))
    tradeError(path, "shape");
  const [whole, fraction = ""] = value.split(".");
  const exact = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
  if (exact > 100_000_000n) tradeError(path, "shape");
  return exact;
}
export function checkedTradeWindow(range: { from: string; to: string }, path = "data"): void {
  checkedJournalDay(range.from, `${path}.from`);
  checkedJournalDay(range.to, `${path}.to`);
  if (range.from > range.to) tradeError(path, "window");
}
