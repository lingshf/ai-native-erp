import {
  formatMinor,
  tradeDocumentError,
  type CalculatedTradeLine,
  type DimensionMap,
  type JournalDraft,
  type JournalInputLine,
  type TradeCalculation,
  type TradeConfig,
  type TradeDocumentLine,
  type TradeInvoiceCommand,
  type TradeInvoiceLineInput,
  type TradeLineMatch,
} from "@erp/core/domain";
import { invoiceTaxPosting, type InvoiceResolvedLine } from "./trade-invoice-calculation.ts";

export interface InvoiceJournalInput {
  readonly command: TradeInvoiceCommand;
  readonly party: TradeConfig<"tradeParty">;
  readonly profile: TradeConfig<"tradeProfile">;
  readonly resolved: readonly InvoiceResolvedLine[];
  readonly calculation: TradeCalculation;
  readonly matches: readonly TradeLineMatch[];
  readonly scale: number;
}

export interface InvoiceJournalLines {
  readonly journalLines: JournalInputLine[];
  /** Master-data default dimensions, one per journal line. */
  readonly master: DimensionMap[];
  readonly controlIndexes: number[];
  readonly lines: TradeDocumentLine[];
}

type Push = (
  account: string,
  side: "debit" | "credit",
  minor: number,
  dims: DimensionMap,
  defaults: DimensionMap,
) => void;

interface Pusher {
  readonly journalLines: JournalInputLine[];
  readonly master: DimensionMap[];
  readonly push: Push;
}

/** Appends a journal line and its default dimensions together; zero amounts are skipped. */
function journalLinePusher(scale: number): Pusher {
  const journalLines: JournalInputLine[] = [];
  const master: DimensionMap[] = [];
  const push: Push = (account, side, minor, dims, defaults) => {
    if (minor === 0) return;
    const money = formatMinor(minor, scale);
    journalLines.push({
      account,
      debit: side === "debit" ? money : "",
      credit: side === "credit" ? money : "",
      dimensions: dims,
      suspense: null,
    });
    master.push(defaults);
  };
  return { journalLines, master, push };
}

/**
 * Two passes: every control-account line first, then each line's expense / revenue and tax lines.
 * `confirm` reads the open item's control line through `controlIndexes[0]`.
 */
export function invoiceJournalLines(input: InvoiceJournalInput): InvoiceJournalLines {
  const { command } = input;
  const pusher = journalLinePusher(input.scale);
  const controlSide = command.side === "AP" ? "credit" : "debit",
    lineSide = command.side === "AP" ? "debit" : "credit";
  const controlIndexes = pushControlLines(input, pusher, controlSide);
  const lines: TradeDocumentLine[] = command.lines.map((line, index) =>
    pushDocumentLine(input, pusher, lineSide, line, index),
  );
  return { journalLines: pusher.journalLines, master: pusher.master, controlIndexes, lines };
}

function pushControlLines(
  { command, party, profile, resolved, calculation }: InvoiceJournalInput,
  { journalLines, push }: Pusher,
  controlSide: "debit" | "credit",
): number[] {
  const controlIndexes: number[] = [];
  for (const [index, line] of command.lines.entries()) {
    if (!calculation.lines[index].gross) continue;
    controlIndexes.push(journalLines.length);
    push(
      profile.data.controlAccount,
      controlSide,
      calculation.lines[index].gross,
      line.dimensions,
      { ...party.data.defaultDimensions, ...resolved[index].product.data.defaultDimensions },
    );
  }
  return controlIndexes;
}

function pushDocumentLine(
  { command, party, resolved, calculation, matches }: InvoiceJournalInput,
  { push }: Pusher,
  lineSide: "debit" | "credit",
  line: TradeInvoiceLineInput,
  index: number,
): TradeDocumentLine {
  const calc = calculation.lines[index];
  const { product, account, tax } = resolved[index];
  const defaults = { ...party.data.defaultDimensions, ...product.data.defaultDimensions };
  push(
    account,
    lineSide,
    command.side === "AP" ? calc.expense : calc.net,
    line.dimensions,
    defaults,
  );
  const taxPosting = invoiceTaxPosting(command, calc, tax);
  if (taxPosting.minor > 0) {
    if (taxPosting.account === null) tradeDocumentError(`lines.${index}.taxCode`, "account");
    push(taxPosting.account, lineSide, taxPosting.minor, line.dimensions, defaults);
  }
  return invoiceDocumentLine(command, line, index, calc, resolved[index], matches[index]);
}

function invoiceDocumentLine(
  command: TradeInvoiceCommand,
  line: TradeInvoiceLineInput,
  index: number,
  calc: CalculatedTradeLine,
  { product, account, tax }: InvoiceResolvedLine,
  match: TradeLineMatch | undefined,
): TradeDocumentLine {
  return {
    lineId: line.lineId,
    lineNo: index + 1,
    product: product.code,
    account,
    taxCode: tax.tax.code,
    taxRateId: tax.rate.id,
    ratePercent: tax.rate.ratePercent,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    discountPercent: line.discountPercent,
    taxableCharge: line.taxableCharge,
    net: calc.net,
    tax: calc.tax,
    gross: calc.gross,
    deductibleTax: calc.deductibleTax,
    orderId: command.orderId,
    orderLineId: line.orderLineId,
    expectedNet: match ? match.expectedNet : null,
    matchStatus: match ? (match.withinTolerance ? "matched" : "exception") : "notApplicable",
  };
}

export function invoiceDraft(
  command: TradeInvoiceCommand,
  external: string,
  journalLines: JournalInputLine[],
): JournalDraft {
  return {
    id: command.documentId,
    revision: 0,
    sourceRef: `TRADE-${command.side}-INV:${command.documentId}`,
    date: command.accountingDate,
    documentDate: command.documentDate,
    taxDate: command.taxDate,
    memo: `${command.side} invoice ${external}`.slice(0, 200),
    kind: "normal",
    operation: "journal",
    originalId: null,
    headerDimensions: command.headerDimensions,
    lines: journalLines,
  };
}
