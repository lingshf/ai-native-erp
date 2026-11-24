import { checkedMinor } from "./index.ts";
import {
  decimal,
  decimalUnit,
  halfUp,
  invalid,
  percent,
  percentUnit,
  shape,
} from "./trade-calculation-values.ts";
import type { TradeCalculationInput, TradeCalculationLine, TradeTax } from "./trade-calculator.ts";

export interface WorkingLine {
  readonly input: TradeCalculationLine;
  readonly index: number;
  readonly group: readonly [string, TradeTax["treatment"], string, string];
  readonly basis: bigint;
  readonly numerator: bigint;
  readonly denominator: bigint;
  readonly deductible: bigint;
  readonly lineTax: bigint;
  tax: bigint;
}

export function checkTradeDocument(input: TradeCalculationInput): void {
  shape(
    input,
    ["side", "currency", "accountingCurrency", "scale", "priceMode", "rounding", "lines"],
    "document",
  );
  if (input.side !== "ap" && input.side !== "ar") invalid("side", "shape");
  if (input.priceMode !== "exclusive" && input.priceMode !== "inclusive")
    invalid("priceMode", "shape");
  if (input.rounding !== "line" && input.rounding !== "document") invalid("rounding", "shape");
  if (
    typeof input.currency !== "string" ||
    !/^[A-Z]{3}$/.test(input.currency) ||
    input.currency !== input.accountingCurrency
  )
    invalid("currency", "currency");
  checkedMinor(0, input.scale);
  if (!Array.isArray(input.lines) || input.lines.length === 0 || input.lines.length > 100)
    invalid("lines", "shape");
}

export function workingTradeLine(
  input: TradeCalculationInput,
  line: TradeCalculationLine,
  index: number,
  ids: Set<string>,
  groups: Map<string, WorkingLine[]>,
): WorkingLine {
  const path = `lines.${index}`;
  shape(line, ["id", "quantity", "unitPrice", "discountPercent", "taxableCharges", "tax"], path);
  if (typeof line.id !== "string" || !line.id.trim() || line.id.length > 100 || ids.has(line.id))
    invalid(`${path}.id`, "shape");
  ids.add(line.id);
  shape(line.tax, ["code", "treatment", "ratePercent", "deductiblePercent"], `${path}.tax`);
  const tax = line.tax;
  if (
    typeof tax.code !== "string" ||
    !tax.code.trim() ||
    tax.code.length > 100 ||
    !["standard", "zero", "exempt"].includes(tax.treatment)
  )
    invalid(`${path}.tax`, "tax");
  const rate = percent(tax.ratePercent, `${path}.tax.ratePercent`);
  const deductible = percent(tax.deductiblePercent, `${path}.tax.deductiblePercent`);
  if (tax.treatment !== "standard" && rate !== 0n) invalid(`${path}.tax.ratePercent`, "tax");
  const quantity = decimal(line.quantity, 6, `${path}.quantity`);
  if (quantity === 0n) invalid(`${path}.quantity`, "decimal");
  const price = decimal(line.unitPrice, 6, `${path}.unitPrice`);
  const discount = percent(line.discountPercent, `${path}.discountPercent`);
  const charges = decimal(line.taxableCharges, input.scale, `${path}.taxableCharges`);
  const basis =
    halfUp(
      quantity * price * (percentUnit - discount) * 10n ** BigInt(input.scale),
      decimalUnit * decimalUnit * percentUnit,
    ) + charges;
  checkedMinor(basis, input.scale);
  const denominator = input.priceMode === "inclusive" ? percentUnit + rate : percentUnit;
  const numerator = basis * rate;
  // Inclusive line rounding preserves rounded net; document rounding allocates exact tax.
  const lineTax =
    input.priceMode === "inclusive"
      ? basis - halfUp(basis * percentUnit, denominator)
      : halfUp(numerator, denominator);
  const group = [tax.code, tax.treatment, rate.toString(), deductible.toString()] as const;
  const working = {
    input: line,
    index,
    group,
    basis,
    numerator,
    denominator,
    deductible,
    lineTax,
    tax: lineTax,
  };
  const key = JSON.stringify(group);
  const bucket = groups.get(key);
  if (bucket) bucket.push(working);
  else groups.set(key, [working]);
  return working;
}
