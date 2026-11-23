import type { Language } from "./ui/index.ts";

// Same shape as the contract's `decimal` (packages/core/src/contracts/trade-documents.ts).
const decimalPattern = /^(0|[1-9]\d{0,11})(\.\d{1,6})?$/u;

/**
 * Groups the integer part of a contract decimal by language; the fraction is kept as written
 * (no padding, truncation or rounding). Anything else is returned unchanged.
 */
export function formatDecimal(value: string, language: Language): string {
  const match = decimalPattern.exec(value);
  if (!match) return value;
  const [, integer = "", fraction = ""] = match;
  const grouped = new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(
    BigInt(integer),
  );
  return `${grouped}${fraction}`;
}
