import {
  DomainError,
  assertTradeAccount,
  formatMinor,
  quantityMicros,
  roundTradeRatio,
  tradeDocumentError,
  tradeEffective,
  allocateTradeSegments,
  changeTradeSegments,
  tradeDimensionKey,
  tradeSegments,
  type DimensionMap,
  type JournalDraft,
  type JournalInputLine,
  type OpenItem,
  type TradeActionCommand,
  type TradeActionPreview,
  type TradeAccountRole,
  type TradeCreditLine,
  type TradeItemChange,
  type TradeSegmentAllocation,
} from "@erp/core/domain";
import type { JournalPreview, JournalService, JournalTools } from "./journals.ts";
import type { MasterDataRepository } from "./master-data.ts";

type Repo = MasterDataRepository;
function required<T>(value: T | null): T {
  if (value === null) tradeDocumentError("reference", "reference");
  return value;
}
function changed(
  item: OpenItem,
  gross: number,
  net: number,
  tax: number,
  allocations = allocateTradeSegments(item, gross),
): OpenItem {
  const remainingGross = item.remainingGross - gross;
  const remainingNet = item.remainingNet - net;
  const remainingTax = item.remainingTax - tax;
  if (
    remainingGross < 0 ||
    remainingGross > item.gross ||
    remainingNet < 0 ||
    remainingNet > item.net ||
    remainingTax < 0 ||
    remainingTax > item.tax
  )
    tradeDocumentError("gross", "quantity");
  return {
    ...item,
    remainingGross,
    remainingNet,
    remainingTax,
    segments: changeTradeSegments(item, allocations, gross < 0),
    status: remainingGross === 0 ? "settled" : "open",
    revision: item.revision + 1,
  };
}
function consume(item: OpenItem, gross: number): OpenItem {
  if (gross > item.remainingGross || item.status !== "open")
    tradeDocumentError("gross", "quantity");
  const net =
    gross === item.remainingGross
      ? item.remainingNet
      : roundTradeRatio(BigInt(item.remainingNet) * BigInt(gross), BigInt(item.remainingGross));
  return changed(item, gross, net, gross - net);
}
export async function prepareTradeAction(
  repo: Repo,
  journals: JournalService,
  tools: JournalTools,
  command: TradeActionCommand,
): Promise<{ preview: TradeActionPreview; journal: JournalPreview }> {
  const { company: companyCode, actionId, accountingDate: day } = command;
  const company = required(await repo.company(companyCode));
  if (
    (await repo.tradeAction(companyCode, actionId)) ||
    (await repo.journalEntry(companyCode, actionId)) ||
    (await repo.openItem(companyCode, actionId)) ||
    (await repo.tradePayment(companyCode, actionId))
  )
    tradeDocumentError("actionId", "duplicate", true);
  const sourceRef = `TRADE-${command.kind.toUpperCase()}:${actionId}`;
  if (await repo.journalSourceExists(companyCode, sourceRef))
    tradeDocumentError("actionId", "duplicate", true);
  const changes: TradeItemChange[] = [];
  const creditLines: TradeCreditLine[] = [];
  const lines: JournalInputLine[] = [];
  const master: DimensionMap[] = [];
  const exact: { index: number; dimensions: DimensionMap }[] = [];
  const dependencies: unknown[] = [];
  const checkedAccounts = new Set<string>(),
    checkedConfigs = new Set<string>();
  const links: string[] = [];
  let originalId: string | null = null;
  let gross = 0;
  let historical = false;
  let emptyReverse = false;
  const push = (
    account: string,
    debit: boolean,
    amount: number,
    dimensions: DimensionMap,
    defaults: DimensionMap = {},
    preserve = true,
  ) => {
    if (!amount) return;
    if (!Number.isSafeInteger(amount) || amount < 0) tradeDocumentError("lines", "shape");
    if (preserve) exact.push({ index: lines.length, dimensions });
    lines.push({
      account,
      debit: debit ? formatMinor(amount, company.scale) : "",
      credit: debit ? "" : formatMinor(amount, company.scale),
      dimensions,
      suspense: null,
    });
    master.push(defaults);
  };
  const account = async (
    code: string,
    role: TradeAccountRole,
    side: "AP" | "AR",
    alternate?: { role: TradeAccountRole; openingItem: string },
  ) => {
    const key = JSON.stringify([code, role, side, alternate ?? null]);
    if (checkedAccounts.has(key)) return;
    const value = await repo.account(companyCode, code);
    try {
      try {
        assertTradeAccount(value, role, side);
      } catch (error) {
        // D30: looked up only after a role mismatch, so M1 items cost no extra query.
        if (
          !(error instanceof DomainError) ||
          !alternate ||
          !(await repo.tradeOpeningItems(companyCode, [alternate.openingItem])).has(
            alternate.openingItem,
          )
        )
          throw error;
        assertTradeAccount(value, alternate.role, side);
      }
    } catch (error) {
      if (error instanceof DomainError) tradeDocumentError(code, "account");
      throw error;
    }
    dependencies.push(value);
    checkedAccounts.add(key);
  };
  const item = async (id: string, revision: number) => {
    const found = required(await repo.openItem(companyCode, id));
    if (found.revision !== revision) tradeDocumentError("revision", "stale", true);
    if (found.status === "cancelled") tradeDocumentError("itemId", "reference");
    if (day < found.accountingDate || day < (await repo.latestSettlementDate(companyCode, id)))
      tradeDocumentError("accountingDate", "reference");
    dependencies.push(found);
    links.push(id);
    return found;
  };
  const effective = async (kind: "tradeParty" | "tradeProduct" | "taxCode", code: string) => {
    const key = JSON.stringify([kind, code]);
    if (checkedConfigs.has(key)) return;
    const config = await repo.tradeConfig(companyCode, kind, code);
    if (!config || config.kind !== kind || !tradeEffective(config, day))
      tradeDocumentError(code, "reference");
    dependencies.push(config);
    checkedConfigs.add(key);
  };
  if (command.kind === "advance") {
    if (company.currency !== command.currency) tradeDocumentError("currency", "currency");
    const party = await repo.tradeConfig(companyCode, "tradeParty", command.party);
    if (party?.kind !== "tradeParty" || !tradeEffective(party, day))
      tradeDocumentError("party", "party");
    const profileCode = command.side === "AP" ? party.data.apProfile : party.data.arProfile;
    if (!profileCode) tradeDocumentError("party", "party");
    const profile = await repo.tradeConfig(companyCode, "tradeProfile", profileCode);
    if (
      profile?.kind !== "tradeProfile" ||
      !tradeEffective(profile, day) ||
      profile.data.side !== command.side
    )
      tradeDocumentError("party", "party");
    dependencies.push(party, profile);
    await account(profile.data.advanceAccount, "advanceAccount", command.side);
    await account(profile.data.cashAccount, "cashAccount", command.side);
    gross = command.gross;
    push(
      profile.data.advanceAccount,
      command.side === "AP",
      gross,
      command.dimensions,
      party.data.defaultDimensions,
      false,
    );
    push(profile.data.cashAccount, command.side !== "AP", gross, {}, {}, false);
    changes.push({
      before: null,
      after: {
        kind: "advance",
        itemId: actionId,
        side: command.side,
        party: command.party,
        currency: command.currency,
        accountingDate: day,
        documentDate: command.documentDate,
        dueDate: command.documentDate,
        discountDate: command.documentDate,
        discountPercent: "0",
        allowPartialDiscount: false,
        externalNo: actionId,
        controlAccount: profile.data.advanceAccount,
        dimensions: command.dimensions,
        segments: tradeSegments([{ dimensions: command.dimensions, gross }]),
        gross,
        net: gross,
        tax: 0,
        remainingGross: gross,
        remainingNet: gross,
        remainingTax: 0,
        revision: 1,
        status: "open",
      },
    });
  } else if (command.kind === "apply") {
    const source = await item(command.sourceId, command.sourceRevision);
    const target = await item(command.targetId, command.targetRevision);
    if (source.kind === "invoice" || target.kind !== "invoice")
      tradeDocumentError("targetId", "reference");
    if (source.party !== target.party || source.side !== target.side)
      tradeDocumentError("targetId", "party");
    if (source.currency !== target.currency) tradeDocumentError("targetId", "currency");
    // D30: legacy opening items may sit on either same-side trade account role.
    await account(
      source.controlAccount,
      source.kind === "advance" ? "advanceAccount" : "controlAccount",
      source.side,
      {
        role: source.kind === "advance" ? "controlAccount" : "advanceAccount",
        openingItem: source.itemId,
      },
    );
    await account(target.controlAccount, "controlAccount", target.side, {
      role: "advanceAccount",
      openingItem: target.itemId,
    });
    gross = command.gross;
    changes.push(
      { before: source, after: consume(source, gross) },
      { before: target, after: consume(target, gross) },
    );
    for (const segment of allocateTradeSegments(source, gross))
      push(source.controlAccount, source.side === "AR", segment.gross, segment.dimensions);
    for (const segment of allocateTradeSegments(target, gross))
      push(target.controlAccount, target.side === "AP", segment.gross, segment.dimensions);
  } else if (command.kind === "credit") {
    // D30: opening items carry no trade document lines to credit.
    const document = await repo.tradeDocument(companyCode, command.invoiceId);
    if (
      !document &&
      (await repo.tradeOpeningItems(companyCode, [command.invoiceId])).has(command.invoiceId)
    )
      tradeDocumentError("invoiceId", "reference");
    const invoice = required(document);
    const original = await item(command.invoiceId, command.revision);
    const entry = required(await repo.journalEntry(companyCode, invoice.journalId));
    const prior = await repo.tradeCreditLines(companyCode, command.invoiceId);
    dependencies.push(invoice, entry, prior);
    await effective("tradeParty", original.party);
    await account(original.controlAccount, "controlAccount", original.side);
    const selected = new Map(command.lines.map((l) => [l.sourceLineId, l]));
    if (command.lines.some((l) => !invoice.lines.some((s) => s.lineId === l.sourceLineId)))
      tradeDocumentError("lines", "reference");
    const business = entry.lines.filter((l) => l.role === "business");
    let position = invoice.snapshot.controlSegments
      ? invoice.lines.filter((l) => l.gross > 0).length
      : 1;
    let controlPosition = 0;
    const creditControls: TradeSegmentAllocation[] = [];
    const postings: {
      account: string;
      amount: number;
      dimensions: DimensionMap;
      role: TradeAccountRole;
    }[] = [];
    for (const [index, source] of invoice.lines.entries()) {
      const control =
        invoice.snapshot.controlSegments && source.gross
          ? business[controlPosition++]
          : business[0];
      const calculation = invoice.snapshot.calculation.lines[index];
      const originalExpense = original.side === "AP" ? calculation.expense : calculation.net;
      const originalTax = original.side === "AP" ? calculation.deductibleTax : calculation.tax;
      const expenseLine = originalExpense ? business[position++] : null;
      const taxLine = originalTax ? business[position++] : null;
      const selection = selected.get(source.lineId);
      if (!selection) continue;
      await effective("tradeProduct", source.product);
      await effective("taxCode", source.taxCode);
      const previous = prior.filter((l) => l.sourceLineId === source.lineId);
      const used = previous.reduce((n, l) => n + quantityMicros(l.quantity), 0n);
      const total = quantityMicros(source.quantity);
      const next = used + quantityMicros(selection.quantity);
      if (next > total) tradeDocumentError(`lines.${source.lineId}.quantity`, "quantity");
      const allocation = (key: "net" | "tax") => {
        const already = previous.reduce((n, l) => n + l[key], 0);
        // Cancelling a rounded slice may leave retained slices above the new cumulative quota.
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
      creditLines.push(credit);
      if (credit.net + credit.tax)
        creditControls.push({
          dimensions: required(control ?? null).dimensions,
          gross: credit.net + credit.tax,
        });
      const expense =
        original.side === "AP" ? credit.net + credit.tax - credit.deductibleTax : credit.net;
      const tax = original.side === "AP" ? credit.deductibleTax : credit.tax;
      if ((expense && !expenseLine) || (tax && !taxLine)) tradeDocumentError("lines", "reference");
      if (expenseLine)
        postings.push({
          ...expenseLine,
          amount: expense,
          role: original.side === "AP" ? "expenseAccount" : "revenueAccount",
        });
      if (taxLine)
        postings.push({
          ...taxLine,
          amount: tax,
          role: original.side === "AP" ? "inputAccount" : "outputAccount",
        });
    }
    const sum = (key: "net" | "tax") => {
      const total = creditLines.reduce((n, l) => n + BigInt(l[key]), 0n);
      if (total > BigInt(Number.MAX_SAFE_INTEGER)) tradeDocumentError("lines", "shape");
      return Number(total);
    };
    const net = sum("net"),
      tax = sum("tax");
    gross = net + tax;
    if (!Number.isSafeInteger(gross) || gross <= 0) tradeDocumentError("lines", "quantity");
    for (const segment of creditControls)
      push(original.controlAccount, original.side === "AP", segment.gross, segment.dimensions);
    for (const posting of postings) {
      if (!posting.amount) continue;
      await account(posting.account, posting.role, original.side);
      push(posting.account, original.side === "AR", posting.amount, posting.dimensions);
    }
    changes.push(
      { before: original, after: { ...original, revision: original.revision + 1 } },
      {
        before: null,
        after: {
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
        },
      },
    );
  } else if (command.kind === "cancel") {
    // D30: opening items are legacy balances, not cancellable trade evidence.
    const source = required(await repo.tradeItemSource(companyCode, command.itemId));
    if (source.opening) tradeDocumentError("itemId", "reference");
    const original = await item(command.itemId, command.revision);
    if (
      original.remainingGross !== original.gross ||
      (await repo.tradeUndo(companyCode, "cancel", original.itemId))
    )
      tradeDocumentError("itemId", "reference");
    if (
      original.kind === "invoice" &&
      (await repo.tradeCreditLines(companyCode, original.itemId)).length
    )
      tradeDocumentError("itemId", "reference");
    if (source.originalId !== null) {
      if (command.relatedRevision === null) tradeDocumentError("relatedRevision", "shape");
      const invoice = await item(source.originalId, command.relatedRevision);
      changes.push({ before: invoice, after: { ...invoice, revision: invoice.revision + 1 } });
    } else if (command.relatedRevision !== null) tradeDocumentError("relatedRevision", "shape");
    gross = original.gross;
    changes.push({
      before: original,
      after: {
        ...changed(original, original.net + original.tax, original.net, original.tax),
        status: "cancelled",
      },
    });
    historical = true;
    originalId = source.journalId;
  } else {
    if (await repo.tradeUndo(companyCode, "reverse", command.settlementId))
      tradeDocumentError("settlementId", "duplicate", true);
    const application = await repo.tradeAction(companyCode, command.settlementId);
    const payment = await repo.tradePayment(companyCode, command.settlementId);
    if (application?.command.kind !== "apply" && !payment)
      tradeDocumentError("settlementId", "reference");
    const allocations =
      application?.command.kind === "apply"
        ? application.receipt.changes.map((c) => ({
            itemId: c.after.itemId,
            gross: required(c.before).remainingGross - c.after.remainingGross,
            net: required(c.before).remainingNet - c.after.remainingNet,
            tax: required(c.before).remainingTax - c.after.remainingTax,
            segments: required(c.before)
              .segments.map((segment) => ({
                dimensions: segment.dimensions,
                gross:
                  segment.remainingGross -
                  required(
                    c.after.segments.find(
                      (s) =>
                        tradeDimensionKey(s.dimensions) === tradeDimensionKey(segment.dimensions),
                    ) ?? null,
                  ).remainingGross,
              }))
              .filter((s) => s.gross > 0),
          }))
        : required(payment).receipt.allocations;
    if (
      allocations.length !== command.items.length ||
      command.items.some((i) => !allocations.some((a) => a.itemId === i.itemId))
    )
      tradeDocumentError("items", "reference");
    for (const allocation of allocations) {
      const selection = required(command.items.find((i) => i.itemId === allocation.itemId) ?? null);
      const current = await item(selection.itemId, selection.revision);
      changes.push({
        before: current,
        after: changed(
          current,
          -allocation.gross,
          -allocation.net,
          -allocation.tax,
          allocation.segments ?? [{ dimensions: current.dimensions, gross: allocation.gross }],
        ),
      });
    }
    const receipt =
      application?.command.kind === "apply" ? application.receipt : required(payment).receipt;
    dependencies.push(receipt);
    links.push(command.settlementId);
    gross = receipt.gross;
    originalId = receipt.journalIds[0] ?? null;
    historical = true;
    emptyReverse = originalId === null;
  }
  const draft: JournalDraft = {
    id: actionId,
    revision: 0,
    sourceRef,
    date: day,
    documentDate: command.documentDate,
    taxDate: command.taxDate,
    memo: `${command.kind}: ${"reason" in command ? command.reason : actionId}`,
    kind: "normal",
    operation: historical ? "reverse" : "journal",
    originalId,
    headerDimensions: {},
    lines,
  };
  let journal: JournalPreview;
  if (emptyReverse) {
    const period = await repo.period(companyCode, day.slice(0, 7));
    if (
      period?.status !== "open" ||
      !period.modules.includes("trade") ||
      !period.modules.includes("tax")
    )
      tradeDocumentError("accountingDate", "reference");
    dependencies.push(period, await repo.journalConfigurationStamp(companyCode));
    journal = {
      fingerprint: "",
      plan: {
        version: 1,
        company: companyCode,
        currency: company.currency,
        scale: company.scale,
        draftId: actionId,
        draftRevision: 0,
        sourceRef,
        date: day,
        documentDate: command.documentDate,
        taxDate: command.taxDate,
        module: "TRADE",
        memo: draft.memo,
        operation: "reverse",
        originalId: null,
        journals: [],
      },
    };
  } else {
    journal = await journals.adapter("TRADE").plan(repo, companyCode, draft, master);
    if (!historical) {
      for (const entry of exact)
        if (
          tradeDimensionKey(journal.plan.journals[0].lines[entry.index].dimensions) !==
          tradeDimensionKey(entry.dimensions)
        )
          tradeDocumentError(`lines.${entry.index}.dimensions`, "account");
      if (command.kind === "advance")
        changes[0] = {
          before: null,
          after: {
            ...changes[0].after,
            dimensions: journal.plan.journals[0].lines[0].dimensions,
            segments: tradeSegments([
              { dimensions: journal.plan.journals[0].lines[0].dimensions, gross },
            ]),
          },
        };
      if (command.kind === "apply") {
        const net = new Map<string, bigint>();
        for (const line of journal.plan.journals[0].lines) {
          const key = JSON.stringify([line.account, tradeDimensionKey(line.dimensions)]);
          net.set(key, (net.get(key) ?? 0n) + BigInt(line.debit) - BigInt(line.credit));
        }
        if ([...net.values()].every((n) => n === 0n))
          journal = { ...journal, plan: { ...journal.plan, journals: [] } };
      }
    }
  }
  const fingerprint = tools.hash([
    "trade-action-preview-v1",
    command,
    journal.fingerprint,
    journal.plan,
    dependencies,
    changes,
    creditLines,
  ]);
  // The business fingerprint binds the complete two-sided subledger plan, including no-GL applications.
  journal = { ...journal, fingerprint };
  return {
    journal,
    preview: {
      fingerprint,
      kind: command.kind,
      gross,
      changes,
      creditLines,
      links: [...new Set(links)],
      journal: journal.plan,
    },
  };
}
