import {
  calculateTrade,
  tradeDocumentError,
  type Company,
  type TradeAmounts,
  type TradeCalculation,
  type TradeConfig,
  type TradeInvoiceCommand,
  type TradeTaxRate,
} from "@erp/core/domain";

/** One invoice line after product, account and tax resolution (`resolveLines`). */
export interface InvoiceResolvedLine {
  readonly product: TradeConfig<"tradeProduct">;
  readonly account: string;
  readonly tax: { readonly tax: TradeConfig<"taxCode">; readonly rate: TradeTaxRate };
}

/** Calculates the invoice amounts; a document without a positive gross is rejected. */
export function calculateInvoice(
  command: TradeInvoiceCommand,
  company: Company,
  resolved: readonly InvoiceResolvedLine[],
): TradeCalculation {
  const calculation = calculateTrade({
    side: command.side === "AP" ? "ap" : "ar",
    currency: command.currency,
    accountingCurrency: company.currency,
    scale: company.scale,
    priceMode: command.priceIncludesTax ? "inclusive" : "exclusive",
    rounding: command.rounding,
    lines: command.lines.map((line, index) => ({
      id: line.lineId,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountPercent: line.discountPercent,
      taxableCharges: line.taxableCharge,
      tax: {
        code: resolved[index].tax.tax.code,
        treatment:
          resolved[index].tax.tax.data.mode === "ordinary"
            ? "standard"
            : resolved[index].tax.tax.data.mode,
        ratePercent: resolved[index].tax.rate.ratePercent,
        deductiblePercent: resolved[index].tax.tax.data.deductiblePercent,
      },
    })),
  });
  if (calculation.gross <= 0) tradeDocumentError("lines", "shape");
  return calculation;
}

/** The tax account and amount a line posts: input VAT for AP (deductible part only), output VAT for AR. */
export function invoiceTaxPosting(
  command: Pick<TradeInvoiceCommand, "side">,
  calc: TradeAmounts,
  tax: InvoiceResolvedLine["tax"],
): { readonly account: string | null; readonly minor: number } {
  return {
    account: command.side === "AP" ? tax.tax.data.inputAccount : tax.tax.data.outputAccount,
    minor: command.side === "AP" ? calc.deductibleTax : calc.tax,
  };
}
