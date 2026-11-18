import { StorageError, type DimensionRepository } from "@erp/core/application";
import { dimensionConfigSchema } from "@erp/core/contracts";
import type { DimensionConfig } from "@erp/core/domain";
import type { Connection, Row } from "./types.ts";

const tables = {
  dimension: "dimensions",
  value: "dimension_values",
  defaults: "dimension_defaults",
  derivation: "dimension_derivations",
  structure: "dimension_structures",
  balance: "dimension_balances",
} as const;
const kinds = ["dimension", "value", "defaults", "derivation", "structure", "balance"] as const;
function parentScope(kind: DimensionConfig["kind"], dimension: string | undefined): string[] {
  if (kind !== "value") return [];
  if (dimension === undefined) throw new StorageError("STORAGE_FAILURE");
  return [dimension];
}
const keyColumn = (kind: DimensionConfig["kind"]) =>
  kind === "value" ? "value_code" : kind === "structure" ? "account_code" : "code";
function decode(kind: DimensionConfig["kind"], row: Row): DimensionConfig {
  const json = (key: string): unknown => {
    if (typeof row[key] !== "string") throw new StorageError("STORAGE_FAILURE");
    return JSON.parse(row[key]);
  };
  const active = Number(row.active);
  const base = {
    kind,
    code: row[keyColumn(kind)],
    revision: Number(row.revision),
    active: active === 0 ? false : active === 1 ? true : row.active,
    from: row.valid_from,
    to: row.valid_to,
  };
  const extra =
    kind === "dimension"
      ? { name: row.name }
      : kind === "value"
        ? { name: row.name, dimension: row.dimension_code }
        : kind === "defaults"
          ? { values: json("values_json") }
          : kind === "derivation"
            ? { when: json("when_json"), values: json("values_json"), mode: row.mode }
            : kind === "structure"
              ? {
                  required: json("required_json"),
                  optional: json("optional_json"),
                  forbidden: json("forbidden_json"),
                  allowed: json("allowed_json"),
                  fixed: json("fixed_json"),
                  conditionals: json("conditionals_json"),
                }
              : { dimension: row.dimension_code, account: row.account_code };
  const parsed = dimensionConfigSchema.safeParse({ ...base, ...extra });
  if (!parsed.success) throw new StorageError("STORAGE_FAILURE");
  return parsed.data;
}
function fields(config: DimensionConfig): Record<string, string | number | null> {
  const base = {
    [keyColumn(config.kind)]: config.code,
    revision: config.revision,
    active: Number(config.active),
    valid_from: config.from,
    valid_to: config.to,
  };
  switch (config.kind) {
    case "dimension":
      return { ...base, name: config.name };
    case "value":
      return { ...base, name: config.name, dimension_code: config.dimension };
    case "defaults":
      return { ...base, values_json: JSON.stringify(config.values) };
    case "derivation":
      return {
        ...base,
        when_json: JSON.stringify(config.when),
        values_json: JSON.stringify(config.values),
        mode: config.mode,
      };
    case "structure":
      return {
        ...base,
        required_json: JSON.stringify(config.required),
        optional_json: JSON.stringify(config.optional),
        forbidden_json: JSON.stringify(config.forbidden),
        allowed_json: JSON.stringify(config.allowed),
        fixed_json: JSON.stringify(config.fixed),
        conditionals_json: JSON.stringify(config.conditionals),
      };
    case "balance":
      return { ...base, dimension_code: config.dimension, account_code: config.account };
  }
}
export function dimensionRepository(db: Connection): DimensionRepository {
  return {
    async dimension(company, kind, code, dimension) {
      const rows = await db.query(
        `SELECT * FROM ${tables[kind]} WHERE company_id=? AND ${keyColumn(kind)}=?${kind === "value" ? " AND dimension_code=?" : ""}`,
        [company, code, ...parentScope(kind, dimension)],
      );
      return rows[0] ? decode(kind, rows[0]) : null;
    },
    async dimensionPage(company, kind, query, dimension) {
      const rows = await db.query(
        `SELECT * FROM ${tables[kind]} WHERE company_id=?${kind === "value" ? " AND dimension_code=?" : ""} AND ${keyColumn(kind)}>? ORDER BY ${keyColumn(kind)} LIMIT ?`,
        [company, ...parentScope(kind, dimension), query.cursor ?? "", query.limit + 1],
      );
      const items = rows.slice(0, query.limit).map((row) => decode(kind, row));
      return { items, nextCursor: rows.length > query.limit ? items[items.length - 1].code : null };
    },
    async dimensionCatalog(company) {
      const result: DimensionConfig[] = [];
      for (const kind of kinds)
        result.push(
          ...(await db.query(`SELECT * FROM ${tables[kind]} WHERE company_id=?`, [company])).map(
            (row) => decode(kind, row),
          ),
        );
      return result;
    },
    async saveDimension(company, config, expected, at) {
      const values = fields(config),
        columns = Object.keys(values);
      if (expected === 0)
        await db.query(
          `INSERT INTO ${tables[config.kind]}(company_id,${columns.join(",")}) VALUES(${["?", ...columns.map(() => "?")].join(",")})`,
          [company, ...Object.values(values)],
        );
      else {
        const rows = await db.query(
          `UPDATE ${tables[config.kind]} SET ${columns.map((key) => `${key}=?`).join(",")} WHERE company_id=? AND ${keyColumn(config.kind)}=?${config.kind === "value" ? " AND dimension_code=?" : ""} AND revision=? RETURNING revision`,
          [
            ...Object.values(values),
            company,
            config.code,
            ...(config.kind === "value" ? [config.dimension] : []),
            expected,
          ],
        );
        if (rows.length !== 1) throw new StorageError("CONFLICT");
      }
      await db.query(
        "INSERT INTO dimension_history(company_id,kind,config_key,revision,recorded_at,actor,snapshot) VALUES(?,?,?,?,?,'LOCAL',?)",
        [
          company,
          config.kind,
          config.kind === "value" ? `${config.dimension}:${config.code}` : config.code,
          config.revision,
          at,
          JSON.stringify(config),
        ],
      );
    },
  };
}
