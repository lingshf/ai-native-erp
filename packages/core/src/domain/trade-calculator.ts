import { checkedMinor } from "./index.ts";
import { allocateDocumentTax, calculatedTradeLine } from "./trade-calculation-amounts.ts";
import {
  checkTradeDocument,
  type WorkingLine,
  workingTradeLine,
} from "./trade-calculation-input.ts";
import { halfUp, invalid, minorAmounts } from "./trade-calculation-values.ts";

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

export function roundTradeRatio(numerator: bigint, denominator: bigint): number {
  if (typeof numerator !== "bigint" || typeof denominator !== "bigint" || denominator <= 0n)
    invalid("ratio", "decimal");
  return checkedMinor(halfUp(numerator, denominator), 0);
}

/** Pure invoice arithmetic. Callers resolve tax-code validity at taxDate before calling. */
export function calculateTrade(input: TradeCalculationInput): TradeCalculation {
  checkTradeDocument(input);
  const ids = new Set<string>();
  const groups = new Map<string, WorkingLine[]>();
  // Array.from visits sparse holes as undefined, so they fail the line shape check.
  const lines = Array.from(input.lines, (line, index) =>
    workingTradeLine(input, line, index, ids, groups),
  );
  if (input.rounding === "document") allocateDocumentTax(groups);
  const totals = {
    net: 0n,
    tax: 0n,
    gross: 0n,
    deductibleTax: 0n,
    nonDeductibleTax: 0n,
    expense: 0n,
    cashDiscountBase: 0n,
  };
  const calculated = lines.map((line) => calculatedTradeLine(input, line, totals));
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
