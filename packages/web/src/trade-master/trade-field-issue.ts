import type { Failure } from "./trade-failure.ts";

// Same as max(3650) on dueDays / discountDays in the contract trade-master.ts.
const MAX_TERM_DAYS = 3650;

export class TradeFieldIssue extends Error {
  readonly key: Failure["key"];
  constructor(key: Failure["key"]) {
    super(key);
    this.key = key;
  }
}

export function wholeDays(value: string): number {
  const text = value.trim();
  if (!/^[0-9]+$/.test(text) || Number(text) > MAX_TERM_DAYS)
    throw new TradeFieldIssue("trade.issue.wholeDays");
  return Number(text);
}
