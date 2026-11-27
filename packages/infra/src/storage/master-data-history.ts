import type { MasterDataRepository } from "@erp/core/application";
import type { Connection } from "./types.ts";

export function configHistoryRepository(db: Connection): Pick<MasterDataRepository, "history"> {
  return {
    async history(company, kind, key, revision, snapshot, at, reason) {
      await db.query(
        "INSERT INTO config_history(company_id,kind,config_key,revision,recorded_at,actor,reason,snapshot) VALUES(?,?,?,?,?,'LOCAL',?,?)",
        [company, kind, key, revision, at, reason, JSON.stringify(snapshot)],
      );
    },
  };
}
