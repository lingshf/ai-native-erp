import {
  DomainError,
  checkedCode,
  checkedJournalDay,
  type DimensionMap,
  type JournalDraft,
  type JournalPlan,
  type JournalReceipt,
} from "./index.ts";

export type BusinessOperation =
  | "cash_service"
  | "cash_service.cancel"
  | "statistics"
  | "clearing.match";
export type RuleScope = "exact" | "group" | "all";
export type CashDirection = "receive" | "pay";
export interface BusinessIssue {
  readonly scope: "business";
  readonly path: string;
  readonly rule:
    | "shape"
    | "missing"
    | "ambiguous"
    | "account"
    | "reference"
    | "stale"
    | "source"
    | "queue"
    | "pending"
    | "quantity"
    | "line"
    | "limit";
}
export function businessError(path: string, rule: BusinessIssue["rule"], conflict = false): never {
  throw new DomainError(conflict ? "CONFLICT" : "INVALID_INPUT", { scope: "business", path, rule });
}
export interface BusinessMaster {
  readonly code: string;
  readonly name: string;
  readonly group: string;
  readonly active: boolean;
  readonly revision: number;
  readonly dimensions: DimensionMap;
}
export interface PostingRule {
  readonly code: string;
  readonly revision: number;
  readonly active: boolean;
  readonly direction: CashDirection;
  readonly meaning: "cash" | "offset";
  readonly objectScope: RuleScope;
  readonly objectCode: string;
  readonly partyScope: RuleScope;
  readonly partyCode: string;
  readonly account: string;
  readonly dimensions: DimensionMap;
  readonly from: string;
  readonly to: string;
}
export interface RuleMatch {
  readonly meaning: PostingRule["meaning"];
  readonly rule: string;
  readonly revision: number;
  readonly account: string;
  readonly candidates: readonly {
    readonly objectScope: RuleScope;
    readonly partyScope: RuleScope;
    readonly count: number;
  }[];
}
const scopes = ["all", "group", "exact"] as const;
export function compilePostingRules(rules: readonly PostingRule[], day: string) {
  checkedJournalDay(day, "date");
  if (rules.length > 5000) businessError("rules", "limit");
  const buckets = new Map<string, PostingRule[]>();
  const key = (
    direction: CashDirection,
    meaning: PostingRule["meaning"],
    objectScope: RuleScope,
    objectCode: string,
    partyScope: RuleScope,
    partyCode: string,
  ) => JSON.stringify([direction, meaning, objectScope, objectCode, partyScope, partyCode]);
  for (const rule of rules) {
    if (!rule.active || day < rule.from || day > rule.to) continue;
    const bucket = key(
      rule.direction,
      rule.meaning,
      rule.objectScope,
      rule.objectCode,
      rule.partyScope,
      rule.partyCode,
    );
    const found = buckets.get(bucket);
    if (found) found.push(rule);
    else buckets.set(bucket, [rule]);
  }
  return {
    match(
      direction: CashDirection,
      meaning: PostingRule["meaning"],
      service: BusinessMaster,
      party: BusinessMaster | null,
    ): { rule: PostingRule; explanation: RuleMatch } {
      const candidates: { object: number; party: number; rules: readonly PostingRule[] }[] = [];
      for (const [objectRank, objectScope] of scopes.entries()) {
        for (const [partyRank, partyScope] of scopes.entries()) {
          if (!party && partyScope !== "all") continue;
          const found = buckets.get(
            key(
              direction,
              meaning,
              objectScope,
              objectScope === "all" ? "*" : objectScope === "exact" ? service.code : service.group,
              partyScope,
              partyScope === "all" ? "*" : partyScope === "exact" ? party!.code : party!.group,
            ),
          );
          if (found) candidates.push({ object: objectRank, party: partyRank, rules: found });
        }
      }
      const winners = candidates.filter(
        (a) => !candidates.some((b) => b !== a && b.object >= a.object && b.party >= a.party),
      );
      if (!winners.length) businessError(`rules.${meaning}`, "missing");
      if (winners.length !== 1 || winners[0].rules.length !== 1)
        businessError(`rules.${meaning}`, "ambiguous");
      const rule = winners[0].rules[0];
      return {
        rule,
        explanation: {
          meaning,
          rule: rule.code,
          revision: rule.revision,
          account: rule.account,
          candidates: candidates.map((item) => ({
            objectScope: scopes[item.object],
            partyScope: scopes[item.party],
            count: item.rules.length,
          })),
        },
      };
    },
  };
}
interface EventBase {
  readonly id: string;
  readonly sourceRef: string;
  readonly date: string;
  readonly memo: string;
}
export interface CashServiceEvent extends EventBase {
  readonly operation: "cash_service";
  readonly direction: CashDirection;
  readonly service: string;
  readonly party: string | null;
  readonly currency: string;
  readonly amount: string;
  readonly dimensions: DimensionMap;
}
export interface CancelCashEvent extends EventBase {
  readonly operation: "cash_service.cancel";
  readonly originalId: string;
}
export interface StatisticsEvent extends EventBase {
  readonly operation: "statistics";
  readonly code: string;
  readonly quantity: string;
  readonly unit: string;
  readonly dimensions: DimensionMap;
}
export interface ClearingRef {
  readonly entryId: string;
  readonly lineNo: number;
}
export interface ClearingEvent extends EventBase {
  readonly operation: "clearing.match";
  readonly account: string;
  readonly lines: readonly ClearingRef[];
}
export type BusinessEvent = CashServiceEvent | CancelCashEvent | StatisticsEvent | ClearingEvent;
export type EventCommand = BusinessEvent | (JournalDraft & { readonly operation: "journal" });
export interface StatisticsFact {
  readonly code: string;
  readonly quantity: number;
  readonly scale: 6;
  readonly unit: string;
  readonly dimensions: DimensionMap;
  readonly dimensionOrigins: Readonly<
    Record<
      string,
      readonly {
        readonly source: string;
        readonly previous?: string | null;
        readonly value: string | null;
      }[]
    >
  >;
}
export interface BusinessPreview {
  readonly fingerprint: string;
  readonly plan: JournalPlan;
  readonly matches: readonly RuleMatch[];
  readonly statistics: StatisticsFact | null;
  readonly clearing: readonly ClearingRef[];
}
export type TransferStatus = "pending" | "failed" | "transferred" | "withdrawn";
export interface TransferQueueItem {
  readonly id: string;
  readonly sourceRef: string;
  readonly date: string;
  readonly memo: string;
  readonly status: TransferStatus;
  readonly createdAt: string;
  readonly revision: number;
  readonly journalIds: readonly string[];
  readonly fingerprint: string | null;
  readonly plan: JournalPlan | null;
  readonly error: string | null;
  readonly reason: string | null;
}
export interface BusinessRecord {
  readonly event: EventCommand;
  readonly preview: BusinessPreview;
  readonly receipt: JournalReceipt;
  readonly createdAt: string;
}
export interface BusinessResult extends BusinessRecord {
  readonly status: "posted" | "recorded" | "cancelled" | TransferStatus;
  readonly journalIds: readonly string[];
  readonly queue: TransferQueueItem | null;
}
export interface OpenClearingLine extends ClearingRef {
  readonly account: string;
  readonly date: string;
  readonly memo: string;
  readonly debit: number;
  readonly credit: number;
  readonly dimensions: DimensionMap;
}
export function statisticsQuantity(raw: string): number {
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d{1,6})?$/u.test(raw) || raw.length > 40)
    businessError("quantity", "quantity");
  const negative = raw.startsWith("-");
  const [whole, fraction = ""] = (negative ? raw.slice(1) : raw).split(".");
  const exact =
    (BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, "0"))) * (negative ? -1n : 1n);
  if (exact < -9007199254740991n || exact > 9007199254740991n)
    businessError("quantity", "quantity");
  return Number(exact);
}
export function checkedBusinessMaster(value: BusinessMaster): void {
  checkedCode(value.code);
  checkedCode(value.group);
  if (
    !value.name.trim() ||
    value.name.length > 80 ||
    /\p{Cc}/u.test(value.name) ||
    typeof value.active !== "boolean"
  )
    businessError("name", "shape");
}
