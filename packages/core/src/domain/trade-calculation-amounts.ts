import { checkedMinor } from "./index.ts";
import type { WorkingLine } from "./trade-calculation-input.ts";
import { halfUp, minorAmounts, percentUnit } from "./trade-calculation-values.ts";
import type {
  CalculatedTradeLine,
  TradeAmounts,
  TradeCalculationInput,
} from "./trade-calculator.ts";

export function allocateDocumentTax(groups: ReadonlyMap<string, WorkingLine[]>): void {
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

export function calculatedTradeLine(
  input: TradeCalculationInput,
  line: WorkingLine,
  totals: Record<keyof TradeAmounts, bigint>,
): CalculatedTradeLine {
  const net = input.priceMode === "inclusive" ? line.basis - line.tax : line.basis;
  const deductibleTax = input.side === "ap" ? halfUp(line.tax * line.deductible, percentUnit) : 0n;
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
}
