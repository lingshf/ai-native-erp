import { StorageError, type TradeRepository } from "@erp/core/application";
import { tradeConfigSchema } from "@erp/core/contracts";
import type { TradeKind, TradeConfig } from "@erp/core/domain";
import type { Connection, Row, Parameters } from "./types.ts";

const tables = {
  tradeParty: "trade_parties",
  tradeProduct: "trade_products",
  tradeProfile: "trade_profiles",
  tradeTerms: "trade_terms",
  taxCode: "trade_tax_codes",
} as const satisfies Record<TradeKind, string>;
function json(value: unknown): unknown {
  if (typeof value !== "string") throw new StorageError("STORAGE_FAILURE");
  return JSON.parse(value);
}
function flag(value: unknown): boolean {
  if (value !== 0 && value !== 0n && value !== 1 && value !== 1n)
    throw new StorageError("STORAGE_FAILURE");
  return value === 1 || value === 1n;
}
function decode(value: unknown): TradeConfig {
  const parsed = tradeConfigSchema.safeParse(value);
  if (!parsed.success) throw new StorageError("STORAGE_FAILURE");
  return parsed.data;
}
function rowConfig(kind: TradeKind, row: Row): TradeConfig {
  const base = { name: row.name, from: row.valid_from, to: row.valid_to };
  const data =
    kind === "tradeParty"
      ? {
          ...base,
          role: row.role,
          apProfile: row.ap_profile,
          arProfile: row.ar_profile,
          terms: row.terms,
          allowedTaxCodes: json(row.allowed_tax_codes),
          defaultDimensions: json(row.default_dimensions),
        }
      : kind === "tradeProduct"
        ? {
            ...base,
            type: row.type,
            expenseAccount: row.expense_account,
            revenueAccount: row.revenue_account,
            allowedTaxCodes: json(row.allowed_tax_codes),
            defaultDimensions: json(row.default_dimensions),
          }
        : kind === "tradeProfile"
          ? {
              ...base,
              side: row.side,
              controlAccount: row.control_account,
              advanceAccount: row.advance_account,
              cashAccount: row.cash_account,
              discountAccount: row.discount_account,
            }
          : kind === "tradeTerms"
            ? {
                ...base,
                dueDays: Number(row.due_days),
                discountDays: Number(row.discount_days),
                discountPercent: row.discount_percent,
                allowPartialDiscount: flag(row.allow_partial_discount),
              }
            : {
                ...base,
                mode: row.mode,
                rates: json(row.rates),
                deductiblePercent: row.deductible_percent,
                inputAccount: row.input_account,
                outputAccount: row.output_account,
              };
  return decode({
    kind,
    code: row.code,
    active: flag(row.active),
    revision: Number(row.revision),
    data,
  });
}
function fields(config: TradeConfig): Record<string, Parameters[number]> {
  const common = {
    name: config.data.name,
    active: Number(config.active),
    revision: config.revision,
    valid_from: config.data.from,
    valid_to: config.data.to,
  };
  switch (config.kind) {
    case "tradeParty":
      return {
        ...common,
        role: config.data.role,
        ap_profile: config.data.apProfile,
        ar_profile: config.data.arProfile,
        terms: config.data.terms,
        allowed_tax_codes: JSON.stringify(config.data.allowedTaxCodes),
        default_dimensions: JSON.stringify(config.data.defaultDimensions),
      };
    case "tradeProduct":
      return {
        ...common,
        type: config.data.type,
        expense_account: config.data.expenseAccount,
        revenue_account: config.data.revenueAccount,
        allowed_tax_codes: JSON.stringify(config.data.allowedTaxCodes),
        default_dimensions: JSON.stringify(config.data.defaultDimensions),
      };
    case "tradeProfile":
      return {
        ...common,
        side: config.data.side,
        control_account: config.data.controlAccount,
        advance_account: config.data.advanceAccount,
        cash_account: config.data.cashAccount,
        discount_account: config.data.discountAccount,
      };
    case "tradeTerms":
      return {
        ...common,
        due_days: config.data.dueDays,
        discount_days: config.data.discountDays,
        discount_percent: config.data.discountPercent,
        allow_partial_discount: Number(config.data.allowPartialDiscount),
      };
    case "taxCode":
      return {
        ...common,
        mode: config.data.mode,
        rates: JSON.stringify(config.data.rates),
        deductible_percent: config.data.deductiblePercent,
        input_account: config.data.inputAccount,
        output_account: config.data.outputAccount,
      };
  }
}
export function tradeRepository(db: Connection): TradeRepository {
  return {
    async tradeConfig(company, kind, code, at) {
      if (at !== undefined) {
        const rows = await db.query(
          "SELECT snapshot FROM trade_config_history WHERE company_id=? AND kind=? AND config_key=? AND recorded_at<=? ORDER BY recorded_at DESC,revision DESC LIMIT 1",
          [company, kind, code, at],
        );
        return rows[0] ? decode(json(rows[0].snapshot)) : null;
      }
      const rows = await db.query(`SELECT * FROM ${tables[kind]} WHERE company_id=? AND code=?`, [
        company,
        code,
      ]);
      return rows[0] ? rowConfig(kind, rows[0]) : null;
    },
    async tradePage(company, kind, query) {
      const prefix = query.search;
      // Binary ranges retain literal prefix semantics (including '%' and '_') and use the name index.
      const search = prefix === undefined ? "" : " AND name>=? AND name<?";
      const index = prefix === undefined ? "" : ` INDEXED BY ${tables[kind]}_name`;
      const rows = await db.query(
        `SELECT * FROM ${tables[kind]}${index} WHERE company_id=? AND code>?${search} ORDER BY code LIMIT ?`,
        [
          company,
          query.cursor ?? "",
          ...(prefix === undefined ? [] : [prefix, `${prefix}\u{10ffff}`]),
          query.limit + 1,
        ],
      );
      const items = rows.slice(0, query.limit).map((row) => rowConfig(kind, row));
      return { items, nextCursor: rows.length > query.limit ? items[items.length - 1].code : null };
    },
    async saveTradeConfig(company, config, expected, at) {
      const values = fields(config),
        columns = Object.keys(values),
        table = tables[config.kind];
      if (expected === 0) {
        await db.query(
          `INSERT INTO ${table}(company_id,code,${columns.join(",")}) VALUES(?,?,${columns.map(() => "?").join(",")})`,
          [company, config.code, ...Object.values(values)],
        );
      } else {
        const rows = await db.query(
          `UPDATE ${table} SET ${columns.map((column) => `${column}=?`).join(",")} WHERE company_id=? AND code=? AND revision=? RETURNING code`,
          [...Object.values(values), company, config.code, expected],
        );
        if (rows.length !== 1) throw new StorageError("CONFLICT");
      }
      await db.query(
        "INSERT INTO trade_config_history(company_id,kind,config_key,revision,recorded_at,actor,snapshot) VALUES(?,?,?,?,?,'LOCAL',?)",
        [company, config.kind, config.code, config.revision, at, JSON.stringify(config)],
      );
    },
  };
}
