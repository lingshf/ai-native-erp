import type { TradeDocumentRepository } from "@erp/core/application";
import type { TradeConfig } from "@erp/core/domain";
import { tradeConfigRow, tradeTables } from "./trade-master.ts";
import type { Connection } from "./types.ts";

export function tradeConfigLookups(
  db: Pick<Connection, "query">,
): Pick<TradeDocumentRepository, "tradeConfigsByCodes"> {
  return {
    async tradeConfigsByCodes(company, kind, codes) {
      if (!codes.length) return [];
      const rows = await db.query(
        `SELECT * FROM ${tradeTables[kind]} WHERE company_id=? AND code IN(${codes.map(() => "?").join(",")}) ORDER BY code`,
        [company, ...codes],
      );
      return rows.map((row) => tradeConfigRow(kind, row) as TradeConfig<typeof kind>);
    },
  };
}
