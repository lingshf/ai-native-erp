import {
  tradeDocumentError,
  tradeSegments,
  type OpenItem,
  type TradeSegmentAllocation,
} from "@erp/core/domain";
import {
  journalOutcome,
  required,
  type TradeActionContext,
  type TradeBranchOutcome,
  type TradeCommandOf,
} from "./trade-action-context.ts";
import { creditLine, type CreditPosting } from "./trade-action-credit-line.ts";

type CreditCommand = TradeCommandOf<"credit">;
type CreditSource = Awaited<ReturnType<typeof creditSource>>;
export async function prepareCredit(
  ctx: TradeActionContext,
  command: CreditCommand,
): Promise<TradeBranchOutcome> {
  const source = await creditSource(ctx, command);
  const { original } = source;
  const { creditControls, postings } = await collectCreditLines(ctx, command, source);
  const sum = (key: "net" | "tax") => {
    const total = ctx.creditLines.reduce((n, l) => n + BigInt(l[key]), 0n);
    if (total > BigInt(Number.MAX_SAFE_INTEGER)) tradeDocumentError("lines", "shape");
    return Number(total);
  };
  const net = sum("net"),
    tax = sum("tax");
  const gross = net + tax;
  if (!Number.isSafeInteger(gross) || gross <= 0) tradeDocumentError("lines", "quantity");
  for (const segment of creditControls)
    ctx.push(original.controlAccount, original.side === "AP", segment.gross, segment.dimensions);
  for (const posting of postings) {
    if (!posting.amount) continue;
    await ctx.account(posting.account, posting.role, original.side);
    ctx.push(posting.account, original.side === "AR", posting.amount, posting.dimensions);
  }
  ctx.changes.push(
    {
      before: original,
      after: { ...original, revision: original.revision + 1 },
    },
    {
      before: null,
      after: creditItem(ctx, command, original, { net, tax, creditControls }),
    },
  );
  return journalOutcome(gross);
}
async function creditSource(ctx: TradeActionContext, command: CreditCommand) {
  const { repo, companyCode } = ctx;
  // D30: opening items carry no trade document lines to credit.
  const document = await repo.tradeDocument(companyCode, command.invoiceId);
  if (
    !document &&
    (await repo.tradeOpeningItems(companyCode, [command.invoiceId])).has(command.invoiceId)
  )
    tradeDocumentError("invoiceId", "reference");
  const invoice = required(document);
  const original = await ctx.item(command.invoiceId, command.revision);
  const entry = required(await repo.journalEntry(companyCode, invoice.journalId));
  const prior = await repo.tradeCreditLines(companyCode, command.invoiceId);
  ctx.dependencies.push(invoice, entry, prior);
  await ctx.effective("tradeParty", original.party);
  await ctx.account(original.controlAccount, "controlAccount", original.side);
  return { invoice, original, entry, prior };
}
async function collectCreditLines(
  ctx: TradeActionContext,
  command: CreditCommand,
  { invoice, original, entry, prior }: CreditSource,
) {
  const selected = new Map(command.lines.map((l) => [l.sourceLineId, l]));
  if (command.lines.some((l) => !invoice.lines.some((s) => s.lineId === l.sourceLineId)))
    tradeDocumentError("lines", "reference");
  const business = entry.lines.filter((l) => l.role === "business");
  let position = invoice.snapshot.controlSegments
    ? invoice.lines.filter((l) => l.gross > 0).length
    : 1;
  let controlPosition = 0;
  const creditControls: TradeSegmentAllocation[] = [];
  const postings: CreditPosting[] = [];
  for (const [index, source] of invoice.lines.entries()) {
    const control =
      invoice.snapshot.controlSegments && source.gross ? business[controlPosition++] : business[0];
    const calculation = invoice.snapshot.calculation.lines[index];
    const originalExpense = original.side === "AP" ? calculation.expense : calculation.net;
    const originalTax = original.side === "AP" ? calculation.deductibleTax : calculation.tax;
    const expenseLine = originalExpense ? business[position++] : null;
    const taxLine = originalTax ? business[position++] : null;
    const selection = selected.get(source.lineId);
    if (!selection) continue;
    const input = {
      source,
      selection,
      prior,
      side: original.side,
      control,
      expenseLine,
      taxLine,
    };
    await creditLine(ctx, input, creditControls, postings);
  }
  return { creditControls, postings };
}
function creditItem(
  { actionId, day }: TradeActionContext,
  command: CreditCommand,
  original: OpenItem,
  {
    net,
    tax,
    creditControls,
  }: { net: number; tax: number; creditControls: TradeSegmentAllocation[] },
): OpenItem {
  const gross = net + tax;
  return {
    ...original,
    kind: "credit",
    itemId: actionId,
    externalNo: actionId,
    accountingDate: day,
    documentDate: command.documentDate,
    dueDate: command.documentDate,
    discountDate: command.documentDate,
    discountPercent: "0",
    allowPartialDiscount: false,
    segments: tradeSegments(creditControls),
    gross,
    net,
    tax,
    remainingGross: gross,
    remainingNet: net,
    remainingTax: tax,
    status: "open",
    revision: 1,
  };
}
