import { StorageError, type MasterDataRepository } from "@erp/core/application";
import { periodCommandSchema, periodSchema } from "@erp/core/contracts";
import { decode, page, periodRow } from "./master-data-rows.ts";
import type { Connection } from "./types.ts";

export function periodRepository(
  db: Connection,
): Pick<MasterDataRepository, "periods" | "period" | "periodChange" | "savePeriod"> {
  return {
    async periods(company, query) {
      return page(
        await db.query(
          "SELECT * FROM periods WHERE company_id=? AND month>? ORDER BY month LIMIT ?",
          [company, query.cursor ?? "", query.limit + 1],
        ),
        query,
        periodRow,
        (item) => item.month,
      );
    },
    async period(company, month) {
      const rows = await db.query("SELECT * FROM periods WHERE company_id=? AND month=?", [
        company,
        month,
      ]);
      return rows[0] ? periodRow(rows[0]) : null;
    },
    async periodChange(company, month, revision) {
      const rows = await db.query(
        "SELECT snapshot FROM config_history WHERE company_id=? AND kind='period' AND config_key=? AND revision=?",
        [company, month, revision],
      );
      if (!rows[0]) return null;
      const { command, ...result } = decode(
        periodSchema.extend({ command: periodCommandSchema.optional() }),
        JSON.parse(String(rows[0].snapshot)),
      );
      return command ? { command, result } : null;
    },
    async savePeriod(company, period, expected) {
      if (expected === 0)
        await db.query(
          "INSERT INTO periods(company_id,month,status,revision,modules) VALUES(?,?,?,?,?)",
          [company, period.month, period.status, period.revision, JSON.stringify(period.modules)],
        );
      else if (
        (
          await db.query(
            "UPDATE periods SET status=?,revision=?,modules=? WHERE company_id=? AND month=? AND revision=? RETURNING month",
            [
              period.status,
              period.revision,
              JSON.stringify(period.modules),
              company,
              period.month,
              expected,
            ],
          )
        ).length !== 1
      )
        throw new StorageError("CONFLICT");
    },
  };
}
