import {
  DomainError,
  checkedCode,
  checkedExpectedRevision,
  checkedPage,
  dimensionKey,
  dimensionError,
  validateDimensionConfig,
  type DimensionConfig,
  type Page,
  type PageQuery,
} from "@erp/core/domain";
import type { MasterDataStore } from "./master-data.ts";
export interface DimensionRepository {
  dimension(
    company: string,
    kind: DimensionConfig["kind"],
    code: string,
    dimension?: string,
  ): Promise<DimensionConfig | null>;
  dimensionPage(
    company: string,
    kind: DimensionConfig["kind"],
    query: PageQuery,
    dimension?: string,
  ): Promise<Page<DimensionConfig>>;
  dimensionCatalog(company: string): Promise<readonly DimensionConfig[]>;
  saveDimension(
    company: string,
    config: DimensionConfig,
    expected: number,
    at: string,
  ): Promise<void>;
}
export class DimensionService {
  private readonly store: MasterDataStore;
  private readonly now: () => string;
  constructor(store: MasterDataStore, now = () => new Date().toISOString()) {
    this.store = store;
    this.now = now;
  }
  list(company: string, kind: DimensionConfig["kind"], query: PageQuery, dimension?: string) {
    checkedCode(company);
    checkedPage(query);
    if ((kind === "value") !== (dimension !== undefined)) dimensionError("dimension", "reference");
    return this.store.read(async (repo) => {
      if (!(await repo.company(company))) throw new DomainError("NOT_FOUND");
      return repo.dimensionPage(company, kind, query, dimension);
    });
  }
  catalog(company: string) {
    checkedCode(company);
    return this.store.read(async (repo) => {
      if (!(await repo.company(company))) throw new DomainError("NOT_FOUND");
      return repo.dimensionCatalog(company);
    });
  }
  save(company: string, input: DimensionConfig): Promise<DimensionConfig> {
    checkedCode(company);
    checkedExpectedRevision(input.revision);
    return this.store.write(async (repo) => {
      if (!(await repo.company(company))) throw new DomainError("NOT_FOUND");
      const old = await repo.dimension(
        company,
        input.kind,
        input.code,
        input.kind === "value" ? input.dimension : undefined,
      );
      if ((old?.revision ?? 0) !== input.revision) throw new DomainError("CONFLICT");
      const catalog = await repo.dimensionCatalog(company);
      const config = { ...input, revision: input.revision + 1 };
      const next = [
        ...catalog.filter(
          (item) => item.kind !== config.kind || dimensionKey(item) !== dimensionKey(config),
        ),
        config,
      ];
      validateDimensionConfig(config, next);
      if (
        config.kind === "structure" ||
        config.kind === "balance" ||
        (config.kind === "defaults" && config.code !== "LEDGER")
      ) {
        const account = await repo.account(
          company,
          config.kind === "balance" ? config.account : config.code,
        );
        if (
          !account ||
          (config.kind === "balance" &&
            (account.purpose !== "clearing" || (config.active && !account.active)))
        )
          dimensionError(config.kind === "balance" ? "account" : "code", "reference");
      }
      await repo.saveDimension(company, config, input.revision, this.now());
      return config;
    });
  }
}
