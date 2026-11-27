import { StorageError, type MasterDataRepository } from "@erp/core/application";
import { accountSchema } from "@erp/core/contracts";
import { accountRow, decode, page } from "./master-data-rows.ts";
import type { Connection } from "./types.ts";

export function accountRepository(
  db: Connection,
): Pick<
  MasterDataRepository,
  "account" | "accounts" | "contraChildren" | "accountsByCodes" | "saveAccount"
> {
  return {
    async account(company, code, at) {
      if (at !== undefined) {
        const rows = await db.query(
          "SELECT snapshot FROM config_history WHERE company_id=? AND kind='account' AND config_key=? AND recorded_at<=? ORDER BY recorded_at DESC,revision DESC LIMIT 1",
          [company, code, at],
        );
        if (!rows[0]) return null;
        if (typeof rows[0].snapshot !== "string") throw new StorageError("STORAGE_FAILURE");
        return decode(accountSchema, JSON.parse(rows[0].snapshot));
      }
      const rows = await db.query("SELECT * FROM accounts WHERE company_id=? AND code=?", [
        company,
        code,
      ]);
      return rows[0] ? accountRow(rows[0]) : null;
    },
    async accounts(company, query) {
      return page(
        await db.query(
          "SELECT * FROM accounts WHERE company_id=? AND code>? ORDER BY code LIMIT ?",
          [company, query.cursor ?? "", query.limit + 1],
        ),
        query,
        accountRow,
        (item) => item.code,
      );
    },
    async contraChildren(company, code) {
      return (
        await db.query("SELECT * FROM accounts WHERE company_id=? AND contra_of=?", [company, code])
      ).map(accountRow);
    },
    async accountsByCodes(company, codes) {
      if (!codes.length) return [];
      return (
        await db.query(
          `SELECT * FROM accounts WHERE company_id=? AND code IN(${codes.map(() => "?").join(",")}) ORDER BY code`,
          [company, ...codes],
        )
      ).map(accountRow);
    },
    async saveAccount(company, account, expected) {
      const fields = [
        account.name,
        account.category,
        account.reportGroup,
        account.normalSide,
        account.purpose,
        account.controlModule,
        account.contraOf,
        Number(account.manualAllowed),
        Number(account.active),
        Number(account.builtin),
        account.revision,
      ];
      if (expected === 0) {
        await db.query(
          "INSERT INTO accounts(name,category,report_group,normal_side,purpose,control_module,contra_of,manual_allowed,active,builtin,revision,company_id,code) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
          [...fields, company, account.code],
        );
      } else {
        const rows = await db.query(
          "UPDATE accounts SET name=?,category=?,report_group=?,normal_side=?,purpose=?,control_module=?,contra_of=?,manual_allowed=?,active=?,builtin=?,revision=? WHERE company_id=? AND code=? AND revision=? RETURNING code",
          [...fields, company, account.code, expected],
        );
        if (rows.length !== 1) throw new StorageError("CONFLICT");
      }
    },
  };
}
