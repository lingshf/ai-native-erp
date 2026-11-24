import { canonicalJson, type BusinessRepository } from "@erp/core/application";
import type { Connection } from "./types.ts";
export function businessAuditLog(db: Connection): Pick<BusinessRepository, "businessAudit"> {
  return {
    async businessAudit(company, reference, action, details, at) {
      await db.query(
        "INSERT INTO audit(tenant_id,book_id,company_id,sequence,operation,reference,principal,details,recorded_at) SELECT 'LOCAL','LOCAL',?,coalesce(max(sequence),0)+1,?,?,'LOCAL',?,? FROM audit WHERE tenant_id='LOCAL' AND book_id='LOCAL' AND company_id=?",
        [company, action, reference, canonicalJson(details), at, company],
      );
    },
  };
}
