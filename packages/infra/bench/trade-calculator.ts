import { performance } from "node:perf_hooks";
import { calculateTrade, type TradeCalculationInput } from "@erp/core/domain";

export function tradeCalculatorBenchmark() {
  const input: TradeCalculationInput = Object.freeze({
    side: "ap",
    currency: "USD",
    accountingCurrency: "USD",
    scale: 2,
    priceMode: "exclusive",
    rounding: "document",
    lines: Object.freeze(
      Array.from({ length: 100 }, (_, index) =>
        Object.freeze({
          id: `${index}`,
          quantity: "1",
          unitPrice: "73.19",
          discountPercent: "0",
          taxableCharges: "0.00",
          tax: Object.freeze({
            code: "VAT",
            treatment: "standard",
            ratePercent: "12",
            deductiblePercent: "50",
          }),
        }),
      ),
    ),
  });
  for (let index = 0; index < 10; index++) calculateTrade(input);
  const samples = Array.from({ length: 15 }, () => {
    const start = performance.now();
    const result = calculateTrade(input);
    const elapsed = performance.now() - start;
    if (
      result.gross !== 819728 ||
      result.net + result.tax !== result.gross ||
      result.expense + result.deductibleTax !== result.gross ||
      result.lines.some((line) => line.net + line.tax !== line.gross)
    )
      throw new Error("Invalid trade calculator benchmark result");
    return elapsed;
  }).sort((a, b) => a - b);
  return { lines: 100, warmup: 10, samples: samples.length, p50Ms: samples[7], budgetMs: 5 };
}
