import type { MasterDataService } from "./master-data.ts";
import type { DimensionService } from "./dimensions.ts";
import type { JournalService } from "./journals.ts";
import type { BusinessEventService } from "./business-events.ts";
import type { ReportService } from "./reports.ts";
import type { PeriodCloseService } from "./period-close.ts";
import type { AiContextService } from "./ai-assistant.ts";
import type { TradeMasterService } from "./trade-master.ts";

export type ExecutionLane = "write" | "heavy" | "light";
export interface ApplicationServices {
  trade: Pick<TradeMasterService, "list" | "get" | "save">;
  masterData: Pick<
    MasterDataService,
    | "initialize"
    | "createCompany"
    | "companies"
    | "accounts"
    | "account"
    | "saveAccount"
    | "periods"
    | "setPeriod"
  >;
  dimensions: Pick<DimensionService, "list" | "catalog" | "save">;
  journals: Pick<
    JournalService,
    "list" | "draft" | "entry" | "save" | "remove" | "preview" | "confirm"
  >;
  events: Pick<
    BusinessEventService,
    | "masters"
    | "saveMaster"
    | "rules"
    | "saveRule"
    | "preview"
    | "detail"
    | "list"
    | "confirm"
    | "enqueue"
    | "queue"
    | "transferPreview"
    | "transfer"
    | "withdraw"
    | "openItems"
  >;
  reports: Pick<ReportService, "report" | "reconciliation" | "ledger">;
  closing: Pick<PeriodCloseService, "preview" | "confirm" | "openNext">;
  aiContext: Pick<AiContextService, "draft" | "explain">;
}

export const applicationLanes = {
  trade: { list: "light", get: "light", save: "write" },
  masterData: {
    initialize: "write",
    createCompany: "write",
    companies: "light",
    accounts: "light",
    account: "light",
    saveAccount: "write",
    periods: "light",
    setPeriod: "write",
  },
  dimensions: { list: "light", catalog: "light", save: "write" },
  journals: {
    list: "light",
    draft: "light",
    entry: "light",
    save: "write",
    remove: "write",
    preview: "heavy",
    confirm: "write",
  },
  events: {
    masters: "light",
    saveMaster: "write",
    rules: "light",
    saveRule: "write",
    preview: "heavy",
    detail: "light",
    list: "light",
    confirm: "write",
    enqueue: "write",
    queue: "light",
    transferPreview: "heavy",
    transfer: "write",
    withdraw: "write",
    openItems: "heavy",
  },
  reports: { report: "heavy", reconciliation: "heavy", ledger: "heavy" },
  closing: { preview: "heavy", confirm: "write", openNext: "write" },
  aiContext: { draft: "light", explain: "heavy" },
} as const satisfies {
  [S in keyof ApplicationServices]: { [M in keyof ApplicationServices[S]]: ExecutionLane };
};

export type ServiceName = keyof ApplicationServices;
export type MethodName<S extends ServiceName> = keyof ApplicationServices[S] & string;
export type ServiceMethod<
  S extends ServiceName,
  M extends MethodName<S>,
> = ApplicationServices[S][M] extends (...args: infer A) => infer R
  ? { args: A; result: Awaited<R> }
  : never;
export interface ApplicationExecutor {
  execute<S extends ServiceName, M extends MethodName<S>>(
    service: S,
    method: M,
    args: ServiceMethod<S, M>["args"],
  ): Promise<ServiceMethod<S, M>["result"]>;
}
