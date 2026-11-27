import type { MasterDataRepository } from "@erp/core/application";
import { companyRow, page } from "./master-data-rows.ts";
import type { Connection } from "./types.ts";

export function companyRepository(
  db: Connection,
): Pick<MasterDataRepository, "company" | "companies" | "currencyScale" | "insertCompany"> {
  return {
    async company(code) {
      const rows = await db.query("SELECT * FROM ledger_companies WHERE company_id=?", [code]);
      return rows[0] ? companyRow(rows[0]) : null;
    },
    async companies(query) {
      return page(
        await db.query(
          "SELECT * FROM ledger_companies WHERE company_id>? ORDER BY company_id LIMIT ?",
          [query.cursor ?? "", query.limit + 1],
        ),
        query,
        companyRow,
        (item) => item.code,
      );
    },
    async currencyScale(currency) {
      const rows = await db.query("SELECT scale FROM ledger_companies WHERE currency=? LIMIT 1", [
        currency,
      ]);
      return rows[0] ? Number(rows[0].scale) : null;
    },
    async insertCompany(company) {
      await db.query("INSERT INTO tenants(tenant_id) VALUES('LOCAL') ON CONFLICT DO NOTHING");
      await db.query(
        "INSERT INTO books(tenant_id,book_id) VALUES('LOCAL','LOCAL') ON CONFLICT DO NOTHING",
      );
      await db.query(
        "INSERT INTO companies(tenant_id,book_id,company_id) VALUES('LOCAL','LOCAL',?) ON CONFLICT DO NOTHING",
        [company.code],
      );
      await db.query(
        "INSERT INTO ledger_companies(company_id,name,currency,scale,year,close_mode,revision) VALUES(?,?,?,?,?,?,?)",
        [
          company.code,
          company.name,
          company.currency,
          company.scale,
          company.year,
          company.closeMode,
          company.revision,
        ],
      );
    },
  };
}
