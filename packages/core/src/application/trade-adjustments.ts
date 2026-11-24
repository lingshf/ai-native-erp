import {
  tradeDocumentError,
  type TradeActionCommand,
  type TradeActionPreview,
} from "@erp/core/domain";
import type { JournalPreview, JournalService, JournalTools } from "./journals.ts";
import { prepareAdvance } from "./trade-action-advance.ts";
import { prepareCancel } from "./trade-action-cancel.ts";
import {
  createTradeActionContext,
  required,
  type Repo,
  type TradeActionContext,
  type TradeBranchOutcome,
} from "./trade-action-context.ts";
import { prepareCredit } from "./trade-action-credit.ts";
import { emptyReversePlan, planTradeJournal, tradeJournalDraft } from "./trade-action-journal.ts";
import { prepareApply, prepareReverse } from "./trade-action-settlement.ts";

export async function prepareTradeAction(
  repo: Repo,
  journals: JournalService,
  tools: JournalTools,
  command: TradeActionCommand,
): Promise<{ preview: TradeActionPreview; journal: JournalPreview }> {
  const { company: companyCode, actionId } = command;
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
  const ctx = createTradeActionContext(repo, company, command);
  const outcome = await prepareKind(ctx, command);
  const draft = tradeJournalDraft(ctx, command, sourceRef, outcome);
  let journal = outcome.emptyReverse
    ? await emptyReversePlan(ctx, command, draft)
    : await planTradeJournal(ctx, journals, command, draft, outcome);
  const { dependencies, changes, creditLines, links } = ctx;
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
      gross: outcome.gross,
      changes,
      creditLines,
      links: [...new Set(links)],
      journal: journal.plan,
    },
  };
}
function prepareKind(
  ctx: TradeActionContext,
  command: TradeActionCommand,
): Promise<TradeBranchOutcome> {
  if (command.kind === "advance") return prepareAdvance(ctx, command);
  if (command.kind === "apply") return prepareApply(ctx, command);
  if (command.kind === "credit") return prepareCredit(ctx, command);
  if (command.kind === "cancel") return prepareCancel(ctx, command);
  return prepareReverse(ctx, command);
}
