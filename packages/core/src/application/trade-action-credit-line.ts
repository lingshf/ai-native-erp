import {
  quantityMicros,
  roundTradeRatio,
  tradeDocumentError,
  type DimensionMap,
  type JournalEntry,
  type TradeAccountRole,
  type TradeCreditLine,
  type TradeDocumentRecord,
  type TradeSegmentAllocation,
} from "@erp/core/domain";
import { required, type TradeActionContext } from "./trade-action-context.ts";

type InvoiceLine = TradeDocumentRecord["lines"][number];
type BusinessLine = JournalEntry["lines"][number];
export interface CreditPosting {
  account: string;
  amount: number;
  dimensions: DimensionMap;
  role: TradeAccountRole;
}
/** One selected invoice line with the journal lines the invoice posted for it. */
export interface CreditLineInput {
  readonly source: InvoiceLine;
  readonly selection: { readonly quantity: string };
  readonly prior: readonly TradeCreditLine[];
  readonly side: "AP" | "AR";
  readonly control: BusinessLine | undefined;
  readonly expenseLine: BusinessLine | null;
  readonly taxLine: BusinessLine | null;
}
export async function creditLine(
  ctx: TradeActionContext,
  input: CreditLineInput,
  creditControls: TradeSegmentAllocation[],
  postings: CreditPosting[],
): Promise<void> {
  const { source, side, control, expenseLine, taxLine } = input;
  await ctx.effective("tradeProduct", source.product);
  await ctx.effective("taxCode", source.taxCode);
  const credit = creditAmounts(input);
  ctx.creditLines.push(credit);
  if (credit.net + credit.tax)
    creditControls.push({
      dimensions: required(control ?? null).dimensions,
      gross: credit.net + credit.tax,
    });
  const expense = side === "AP" ? credit.net + credit.tax - credit.deductibleTax : credit.net;
  const tax = side === "AP" ? credit.deductibleTax : credit.tax;
  if ((expense && !expenseLine) || (tax && !taxLine)) tradeDocumentError("lines", "reference");
  if (expenseLine)
    postings.push({
      ...expenseLine,
      amount: expense,
      role: side === "AP" ? "expenseAccount" : "revenueAccount",
    });
  if (taxLine)
    postings.push({
      ...taxLine,
      amount: tax,
      role: side === "AP" ? "inputAccount" : "outputAccount",
    });
}
function creditAmounts({ source, selection, prior }: CreditLineInput): TradeCreditLine {
  const previous = prior.filter((l) => l.sourceLineId === source.lineId);
  const used = previous.reduce((n, l) => n + quantityMicros(l.quantity), 0n);
  const total = quantityMicros(source.quantity);
  const next = used + quantityMicros(selection.quantity);
  if (next > total) tradeDocumentError(`lines.${source.lineId}.quantity`, "quantity");
  const allocation = (key: "net" | "tax") => {
    const already = previous.reduce((n, l) => n + l[key], 0);
    // Cancelling a rounded slice may leave retained slices above the new cumulative quota.
    // biome-ignore format: keeps the original line breaks of this formula (REFAC-17 R5c)
    return Math.max(
      0,
      Math.min(
        source[key] - already,
        roundTradeRatio(BigInt(source[key]) * next, total) - already,
      ),
    );
  };
  const credit = {
    sourceLineId: source.lineId,
    quantity: selection.quantity,
    net: allocation("net"),
    tax: allocation("tax"),
    deductibleTax: 0,
  };
  const previousTax = previous.reduce((n, l) => n + l.tax, 0);
  const previousDeductible = previous.reduce((n, l) => n + l.deductibleTax, 0);
  credit.deductibleTax =
    source.tax === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            credit.tax,
            source.deductibleTax - previousDeductible,
            roundTradeRatio(
              BigInt(source.deductibleTax) * BigInt(previousTax + credit.tax),
              BigInt(source.tax),
            ) - previousDeductible,
          ),
        );
  return credit;
}
