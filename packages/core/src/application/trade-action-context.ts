import {
  DomainError,
  assertTradeAccount,
  formatMinor,
  tradeDocumentError,
  tradeEffective,
  type Company,
  type DimensionMap,
  type JournalInputLine,
  type OpenItem,
  type TradeActionCommand,
  type TradeAccountRole,
  type TradeCreditLine,
  type TradeItemChange,
} from "@erp/core/domain";
import type { MasterDataRepository } from "./master-data.ts";

export type Repo = MasterDataRepository;
export type TradeCommandOf<K extends TradeActionCommand["kind"]> = Extract<
  TradeActionCommand,
  { kind: K }
>;
/** What a kind-specific branch reports back to the journal plan and the preview. */
export interface TradeBranchOutcome {
  readonly gross: number;
  readonly historical: boolean;
  readonly originalId: string | null;
  readonly emptyReverse: boolean;
}
export const journalOutcome = (gross: number): TradeBranchOutcome => ({
  gross,
  historical: false,
  originalId: null,
  emptyReverse: false,
});
export function required<T>(value: T | null): T {
  if (value === null) tradeDocumentError("reference", "reference");
  return value;
}
// The push order of dependencies, links, changes and creditLines enters the preview fingerprint.
interface TradeActionState {
  readonly changes: TradeItemChange[];
  readonly creditLines: TradeCreditLine[];
  readonly lines: JournalInputLine[];
  readonly master: DimensionMap[];
  readonly exact: { index: number; dimensions: DimensionMap }[];
  readonly dependencies: unknown[];
  readonly links: string[];
}
export type TradeActionContext = ReturnType<typeof createTradeActionContext>;
export function createTradeActionContext(
  repo: Repo,
  company: Company,
  command: TradeActionCommand,
) {
  const { company: companyCode, actionId, accountingDate: day } = command;
  const state: TradeActionState = {
    changes: [],
    creditLines: [],
    lines: [],
    master: [],
    exact: [],
    dependencies: [],
    links: [],
  };
  return {
    repo,
    company,
    companyCode,
    actionId,
    day,
    ...state,
    push: journalLinePusher(company, state),
    account: tradeAccountChecker(repo, companyCode, state.dependencies, new Set<string>()),
    item: openItemLoader(repo, companyCode, day, state),
    effective: tradeConfigChecker(repo, companyCode, day, state.dependencies, new Set<string>()),
  };
}
function journalLinePusher(company: Company, { exact, lines, master }: TradeActionState) {
  return (
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
}
type TradeAccountSide = "AP" | "AR";
type AlternateRole = { role: TradeAccountRole; openingItem: string };
function tradeAccountChecker(
  repo: Repo,
  companyCode: string,
  dependencies: unknown[],
  checkedAccounts: Set<string>,
) {
  return async (
    code: string,
    role: TradeAccountRole,
    side: TradeAccountSide,
    alternate?: AlternateRole,
  ) => {
    const key = JSON.stringify([code, role, side, alternate ?? null]);
    if (checkedAccounts.has(key)) return;
    const value = await repo.account(companyCode, code);
    try {
      await assertAccountRole(repo, companyCode, value, { role, side, alternate });
    } catch (error) {
      if (error instanceof DomainError) tradeDocumentError(code, "account");
      throw error;
    }
    dependencies.push(value);
    checkedAccounts.add(key);
  };
}
async function assertAccountRole(
  repo: Repo,
  companyCode: string,
  value: Awaited<ReturnType<Repo["account"]>>,
  {
    role,
    side,
    alternate,
  }: { role: TradeAccountRole; side: TradeAccountSide; alternate?: AlternateRole },
) {
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
}
function openItemLoader(
  repo: Repo,
  companyCode: string,
  day: string,
  { dependencies, links }: TradeActionState,
) {
  return async (id: string, revision: number): Promise<OpenItem> => {
    const found = required(await repo.openItem(companyCode, id));
    if (found.revision !== revision) tradeDocumentError("revision", "stale", true);
    if (found.status === "cancelled") tradeDocumentError("itemId", "reference");
    if (day < found.accountingDate || day < (await repo.latestSettlementDate(companyCode, id)))
      tradeDocumentError("accountingDate", "reference");
    dependencies.push(found);
    links.push(id);
    return found;
  };
}
function tradeConfigChecker(
  repo: Repo,
  companyCode: string,
  day: string,
  dependencies: unknown[],
  checkedConfigs: Set<string>,
) {
  return async (kind: "tradeParty" | "tradeProduct" | "taxCode", code: string) => {
    const key = JSON.stringify([kind, code]);
    if (checkedConfigs.has(key)) return;
    const config = await repo.tradeConfig(companyCode, kind, code);
    if (!config || config.kind !== kind || !tradeEffective(config, day))
      tradeDocumentError(code, "reference");
    dependencies.push(config);
    checkedConfigs.add(key);
  };
}
