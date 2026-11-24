import { StorageError, type BusinessRepository } from "@erp/core/application";
import { businessMasterSchema, postingRuleSchema } from "@erp/core/contracts";
import type { Connection, Row } from "./types.ts";
import { decoded, json, page } from "./business-rows.ts";
function flag(value: unknown): boolean {
  if (value !== 0 && value !== 0n && value !== 1 && value !== 1n)
    throw new StorageError("STORAGE_FAILURE");
  return value === 1 || value === 1n;
}
function master(row: Row) {
  return decoded(businessMasterSchema, {
    code: row.code,
    name: row.name,
    group: row.group_code,
    active: flag(row.active),
    revision: Number(row.revision),
    dimensions: json(row.dimensions),
  });
}
function rule(row: Row) {
  return decoded(postingRuleSchema, {
    code: row.code,
    revision: Number(row.revision),
    active: flag(row.active),
    direction: row.direction,
    meaning: row.meaning,
    objectScope: row.object_scope,
    objectCode: row.object_code,
    partyScope: row.party_scope,
    partyCode: row.party_code,
    account: row.account_code,
    dimensions: json(row.dimensions),
    from: row.valid_from,
    to: row.valid_to,
  });
}
async function save(
  db: Connection,
  table: "business_services" | "business_parties" | "posting_rules",
  company: string,
  code: string,
  columns: readonly string[],
  values: readonly (string | number)[],
  expected: number,
) {
  if (expected === 0)
    await db.query(
      `INSERT INTO ${table}(company_id,code,${columns.join(",")}) VALUES(?,?,${columns.map(() => "?").join(",")})`,
      [company, code, ...values],
    );
  else if (
    (
      await db.query(
        `UPDATE ${table} SET ${columns.map((name) => `${name}=?`).join(",")} WHERE company_id=? AND code=? AND revision=? RETURNING code`,
        [...values, company, code, expected],
      )
    ).length !== 1
  )
    throw new StorageError("CONFLICT");
}
export function businessMasterStore(
  db: Connection,
): Pick<BusinessRepository, "businessMaster" | "businessMasters" | "saveBusinessMaster"> {
  return {
    async businessMaster(company, kind, code) {
      const rows = await db.query(
        `SELECT * FROM ${kind === "service" ? "business_services" : "business_parties"} WHERE company_id=? AND code=?`,
        [company, code],
      );
      return rows[0] ? master(rows[0]) : null;
    },
    async businessMasters(company, kind, query) {
      return page(
        await db.query(
          `SELECT * FROM ${kind === "service" ? "business_services" : "business_parties"} WHERE company_id=? AND code>? ORDER BY code LIMIT ?`,
          [company, query.cursor ?? "", query.limit + 1],
        ),
        query,
        master,
        (item) => item.code,
      );
    },
    saveBusinessMaster(company, kind, value, expected) {
      return save(
        db,
        kind === "service" ? "business_services" : "business_parties",
        company,
        value.code,
        ["name", "group_code", "active", "revision", "dimensions"],
        [value.name, value.group, +value.active, value.revision, JSON.stringify(value.dimensions)],
        expected,
      );
    },
  };
}
export function postingRuleStore(
  db: Connection,
): Pick<BusinessRepository, "postingRules" | "postingCatalog" | "postingRule" | "savePostingRule"> {
  return {
    async postingRules(company, query) {
      return page(
        await db.query(
          "SELECT * FROM posting_rules WHERE company_id=? AND code>? ORDER BY code LIMIT ?",
          [company, query.cursor ?? "", query.limit + 1],
        ),
        query,
        rule,
        (item) => item.code,
      );
    },
    async postingCatalog(company) {
      return (
        await db.query("SELECT * FROM posting_rules WHERE company_id=? ORDER BY code LIMIT 5001", [
          company,
        ])
      ).map(rule);
    },
    async postingRule(company, code) {
      const rows = await db.query("SELECT * FROM posting_rules WHERE company_id=? AND code=?", [
        company,
        code,
      ]);
      return rows[0] ? rule(rows[0]) : null;
    },
    savePostingRule(company, value, expected) {
      return save(
        db,
        "posting_rules",
        company,
        value.code,
        [
          "active",
          "revision",
          "direction",
          "meaning",
          "object_scope",
          "object_code",
          "party_scope",
          "party_code",
          "account_code",
          "dimensions",
          "valid_from",
          "valid_to",
        ],
        [
          +value.active,
          value.revision,
          value.direction,
          value.meaning,
          value.objectScope,
          value.objectCode,
          value.partyScope,
          value.partyCode,
          value.account,
          JSON.stringify(value.dimensions),
          value.from,
          value.to,
        ],
        expected,
      );
    },
  };
}
export function configHistoryStore(
  db: Connection,
): Pick<BusinessRepository, "businessHistory" | "businessStamp"> {
  return {
    async businessHistory(company, kind, code, revision, snapshot, at) {
      await db.query(
        "INSERT INTO business_config_history(company_id,kind,code,revision,snapshot,recorded_at) VALUES(?,?,?,?,?,?)",
        [company, kind, code, revision, JSON.stringify(snapshot), at],
      );
    },
    async businessStamp(company) {
      const rows = await db.query(
        "SELECT count(*) AS stamp FROM business_config_history WHERE company_id=?",
        [company],
      );
      return Number(rows[0].stamp);
    },
  };
}
