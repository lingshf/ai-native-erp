import {
  DomainError,
  assertTradeAccount,
  checkedCode,
  checkedExpectedRevision,
  checkedName,
  checkedPage,
  checkTradeDefaultDimensions,
  tradeError,
  tradeKinds,
  validateTradeConfig,
  type Page,
  type PageQuery,
  type TradeConfig,
  type TradeKind,
  type TradeWrite,
  type TradeAccountRole,
} from "@erp/core/domain";
import type { MasterDataStore } from "./master-data.ts";
import { canonicalJson } from "./storage.ts";

export interface TradeQuery extends PageQuery {
  readonly search?: string;
}
export interface TradeRepository {
  tradeConfig(
    company: string,
    kind: TradeKind,
    code: string,
    at?: string,
  ): Promise<TradeConfig | null>;
  tradePage(company: string, kind: TradeKind, query: TradeQuery): Promise<Page<TradeConfig>>;
  saveTradeConfig(
    company: string,
    config: TradeConfig,
    expected: number,
    at: string,
  ): Promise<void>;
}
export class TradeMasterService {
  private readonly store: MasterDataStore;
  private readonly now: () => string;
  constructor(store: MasterDataStore, now = () => new Date().toISOString()) {
    this.store = store;
    this.now = now;
  }
  list(company: string, kind: TradeKind, query: TradeQuery) {
    checkedCode(company);
    if (!tradeKinds.includes(kind)) tradeError("kind", "shape");
    checkedPage(query);
    if (query.cursor !== undefined) checkedCode(query.cursor);
    if (query.search !== undefined) checkedName(query.search, 160);
    return this.store.read(async (repo) => {
      if (!(await repo.company(company))) throw new DomainError("NOT_FOUND");
      return repo.tradePage(company, kind, query);
    });
  }
  get(company: string, kind: TradeKind, code: string, at?: string): Promise<TradeConfig> {
    checkedCode(company);
    checkedCode(code);
    if (!tradeKinds.includes(kind)) tradeError("kind", "shape");
    if (
      at !== undefined &&
      (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(at) ||
        !Number.isFinite(Date.parse(at)) ||
        new Date(at).toISOString() !== at)
    )
      tradeError("at", "shape");
    return this.store.read(async (repo) => {
      const config = await repo.tradeConfig(company, kind, code, at);
      if (!config) throw new DomainError("NOT_FOUND");
      return config;
    });
  }
  save(command: TradeWrite): Promise<TradeConfig> {
    checkedCode(command.company);
    checkedExpectedRevision(command.expectedRevision);
    const config: TradeConfig = {
      kind: command.kind,
      code: command.code,
      active: command.active,
      revision: command.expectedRevision + 1,
      data: command.data,
    } as TradeConfig;
    validateTradeConfig(config);
    return this.store.write(async (repo) => {
      const company = command.company;
      if (!(await repo.company(company))) throw new DomainError("NOT_FOUND");
      const old = await repo.tradeConfig(company, config.kind, config.code);
      if ((old?.revision ?? 0) !== command.expectedRevision) throw new DomainError("CONFLICT");
      if (old && !config.active && canonicalJson(old.data) === canonicalJson(config.data)) {
        await repo.saveTradeConfig(company, config, command.expectedRevision, this.now());
        return config;
      }
      const reference = async (kind: TradeKind, code: string, path: string) => {
        const found = await repo.tradeConfig(company, kind, code);
        if (!found?.active || found.data.from > config.data.from || found.data.to < config.data.to)
          tradeError(`data.${path}`, "reference");
        return found;
      };
      const account = async (code: string, role: TradeAccountRole, side?: "AP" | "AR") => {
        assertTradeAccount(await repo.account(company, code), role, side);
      };
      if (config.kind === "tradeParty" || config.kind === "tradeProduct") {
        for (const code of config.data.allowedTaxCodes)
          await reference("taxCode", code, "allowedTaxCodes");
        checkTradeDefaultDimensions(
          config.data,
          config.data.defaultDimensions,
          await repo.dimensionCatalog(company),
        );
      }
      if (config.kind === "tradeParty") {
        const d = config.data;
        await reference("tradeTerms", d.terms, "terms");
        for (const [code, side] of [
          [d.apProfile, "AP"],
          [d.arProfile, "AR"],
        ] as const) {
          if (code === null) continue;
          const found = await reference(
            "tradeProfile",
            code,
            side === "AP" ? "apProfile" : "arProfile",
          );
          if (found.kind !== "tradeProfile" || found.data.side !== side)
            tradeError(side === "AP" ? "data.apProfile" : "data.arProfile", "reference");
        }
      } else if (config.kind === "tradeProduct") {
        const d = config.data;
        if (d.expenseAccount !== null) await account(d.expenseAccount, "expenseAccount");
        if (d.revenueAccount !== null) await account(d.revenueAccount, "revenueAccount");
      } else if (config.kind === "tradeProfile") {
        const d = config.data;
        for (const role of [
          "controlAccount",
          "advanceAccount",
          "cashAccount",
          "discountAccount",
        ] as const)
          await account(d[role], role, d.side);
      } else if (config.kind === "taxCode") {
        if (config.data.inputAccount !== null)
          await account(config.data.inputAccount, "inputAccount");
        if (config.data.outputAccount !== null)
          await account(config.data.outputAccount, "outputAccount");
      }
      await repo.saveTradeConfig(company, config, command.expectedRevision, this.now());
      return config;
    });
  }
}
