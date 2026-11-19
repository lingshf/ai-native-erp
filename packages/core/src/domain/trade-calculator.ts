import { checkedMinor, DomainError } from "./index.ts";

export interface TradeCalculationIssue {
  readonly scope: "trade-calculator";
  readonly path: string;
  readonly rule: "shape" | "decimal" | "percent" | "currency" | "tax";
}

export interface TradeTax {
  readonly code: string;
  readonly treatment: "standard" | "zero" | "exempt";
  readonly ratePercent: string;
  readonly deductiblePercent: string;
}

export interface TradeCalculationLine {
  readonly id: string;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly discountPercent: string;
  /** Currency-scale decimal; inclusive when the document uses inclusive prices. */
  readonly taxableCharges: string;
  readonly tax: TradeTax;
}

export interface TradeCalculationInput {
  readonly side: "ap" | "ar";
  readonly currency: string;
  readonly accountingCurrency: string;
  readonly scale: number;
  readonly priceMode: "exclusive" | "inclusive";
  readonly rounding: "line" | "document";
  readonly lines: readonly TradeCalculationLine[];
}

export interface TradeAmounts {
  readonly net: number;
  readonly tax: number;
  readonly gross: number;
  readonly deductibleTax: number;
  readonly nonDeductibleTax: number;
  readonly expense: number;
  readonly cashDiscountBase: number;
}

export interface CalculatedTradeLine extends TradeAmounts {
  readonly id: string;
  readonly taxCode: string;
  readonly treatment: TradeTax["treatment"];
  readonly roundingSource: {
    readonly lineIndex: number;
    readonly group: readonly [string, TradeTax["treatment"], string, string];
    readonly exactTaxNumerator: string;
    readonly exactTaxDenominator: string;
    readonly lineRoundedTax: number;
    readonly adjustment: number;
  };
}

export interface TradeCalculation extends TradeAmounts {
  readonly algorithm: "trade-v1-half-up-largest-remainder";
  readonly currency: string;
  readonly scale: number;
  readonly priceMode: TradeCalculationInput["priceMode"];
  readonly rounding: TradeCalculationInput["rounding"];
  readonly lines: readonly CalculatedTradeLine[];
}

const decimalUnit = 1_000_000n;
const percentUnit = 100n * decimalUnit;

function invalid(path: string, rule: TradeCalculationIssue["rule"]): never {
  throw new DomainError("INVALID_INPUT", { scope: "trade-calculator", path, rule });
}

function shape(value: unknown, keys: readonly string[], path: string): void {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    invalid(path, "shape");
}

function decimal(value: unknown, scale: number, path: string): bigint {
  if (typeof value !== "string" || !/^\d{1,16}(?:\.\d{1,6})?$/.test(value))
    invalid(path, "decimal");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > scale) invalid(path, "decimal");
  return BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, "0"));
}

function percent(value: unknown, path: string): bigint {
  const result = decimal(value, 6, path);
  if (result > percentUnit) invalid(path, "percent");
  return result;
}

function halfUp(numerator: bigint, denominator: bigint): bigint {
  const absolute = numerator < 0n ? -numerator : numerator;
  const rounded = (absolute * 2n + denominator) / (denominator * 2n);
  return numerator < 0n ? -rounded : rounded;
}

export function roundTradeRatio(numerator: bigint, denominator: bigint): number {
  if (typeof numerator !== "bigint" || typeof denominator !== "bigint" || denominator <= 0n)
    invalid("ratio", "decimal");
  return checkedMinor(halfUp(numerator, denominator), 0);
}

interface WorkingLine {
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

/** Pure invoice arithmetic. Callers resolve tax-code validity at taxDate before calling. */
export function calculateTrade(input: TradeCalculationInput): TradeCalculation {
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
  const ids = new Set<string>();
  const groups = new Map<string, WorkingLine[]>();
  const lines = Array.from(input.lines, (line, index): WorkingLine => {
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
  });

  if (input.rounding === "document") {
    for (const bucket of groups.values()) {
      const denominator = bucket[0].denominator;
      const totalTax = halfUp(
        bucket.reduce((sum, line) => sum + line.numerator, 0n),
        denominator,
      );
      let allocated = 0n;
      for (const line of bucket) {
        line.tax = line.numerator / denominator;
        allocated += line.tax;
      }
      const ranked = [...bucket].sort((a, b) => {
        const difference = (b.numerator % denominator) - (a.numerator % denominator);
        return difference > 0n ? 1 : difference < 0n ? -1 : a.index - b.index;
      });
      for (let i = 0; BigInt(i) < totalTax - allocated; i++) ranked[i].tax += 1n;
    }
  }

  const totals = {
    net: 0n,
    tax: 0n,
    gross: 0n,
    deductibleTax: 0n,
    nonDeductibleTax: 0n,
    expense: 0n,
    cashDiscountBase: 0n,
  };
  const calculated = lines.map((line): CalculatedTradeLine => {
    const net = input.priceMode === "inclusive" ? line.basis - line.tax : line.basis;
    const deductibleTax =
      input.side === "ap" ? halfUp(line.tax * line.deductible, percentUnit) : 0n;
    const nonDeductibleTax = input.side === "ap" ? line.tax - deductibleTax : 0n;
    const amounts = {
      net,
      tax: line.tax,
      gross: net + line.tax,
      deductibleTax,
      nonDeductibleTax,
      expense: input.side === "ap" ? net + nonDeductibleTax : 0n,
      cashDiscountBase: net,
    };
    const result = {
      id: line.input.id,
      taxCode: line.input.tax.code,
      treatment: line.input.tax.treatment,
      ...minorAmounts(amounts, input.scale),
      roundingSource: {
        lineIndex: line.index,
        group: line.group,
        exactTaxNumerator: line.numerator.toString(),
        exactTaxDenominator: line.denominator.toString(),
        lineRoundedTax: checkedMinor(line.lineTax, input.scale),
        adjustment: checkedMinor(line.tax - line.lineTax, input.scale),
      },
    };
    for (const key of Object.keys(totals) as (keyof TradeAmounts)[]) totals[key] += amounts[key];
    return result;
  });
  if (totals.gross === 0n) invalid("lines", "decimal");
  return {
    algorithm: "trade-v1-half-up-largest-remainder",
    currency: input.currency,
    scale: input.scale,
    priceMode: input.priceMode,
    rounding: input.rounding,
    ...minorAmounts(totals, input.scale),
    lines: calculated,
  };
}

function minorAmounts(amounts: Record<keyof TradeAmounts, bigint>, scale: number): TradeAmounts {
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
