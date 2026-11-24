import { checkedMinor, DomainError } from "./index.ts";
import type { TradeAmounts, TradeCalculationIssue } from "./trade-calculator.ts";

export const decimalUnit = 1_000_000n;
export const percentUnit = 100n * decimalUnit;

export function invalid(path: string, rule: TradeCalculationIssue["rule"]): never {
  throw new DomainError("INVALID_INPUT", { scope: "trade-calculator", path, rule });
}

export function shape(value: unknown, keys: readonly string[], path: string): void {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    invalid(path, "shape");
}

export function decimal(value: unknown, scale: number, path: string): bigint {
  if (typeof value !== "string" || !/^\d{1,16}(?:\.\d{1,6})?$/.test(value))
    invalid(path, "decimal");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > scale) invalid(path, "decimal");
  return BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, "0"));
}

export function percent(value: unknown, path: string): bigint {
  const result = decimal(value, 6, path);
  if (result > percentUnit) invalid(path, "percent");
  return result;
}

export function halfUp(numerator: bigint, denominator: bigint): bigint {
  const absolute = numerator < 0n ? -numerator : numerator;
  const rounded = (absolute * 2n + denominator) / (denominator * 2n);
  return numerator < 0n ? -rounded : rounded;
}

export function minorAmounts(
  amounts: Record<keyof TradeAmounts, bigint>,
  scale: number,
): TradeAmounts {
  return {
    net: checkedMinor(amounts.net, scale),
    tax: checkedMinor(amounts.tax, scale),
    gross: checkedMinor(amounts.gross, scale),
    deductibleTax: checkedMinor(amounts.deductibleTax, scale),
    nonDeductibleTax: checkedMinor(amounts.nonDeductibleTax, scale),
    expense: checkedMinor(amounts.expense, scale),
    cashDiscountBase: checkedMinor(amounts.cashDiscountBase, scale),
  };
}
