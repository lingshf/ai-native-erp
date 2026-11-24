import type { BusinessRepository } from "@erp/core/application";
import type { Connection } from "./types.ts";
import { businessMasterStore, postingRuleStore, configHistoryStore } from "./business-config.ts";
import {
  businessEventLookups,
  businessEventList,
  businessEventWrites,
} from "./business-event-store.ts";
import { transferQueueStore } from "./business-queue.ts";
import { clearingLineStore } from "./business-clearing.ts";
import { businessAuditLog } from "./business-audit.ts";
export function businessRepository(db: Connection): BusinessRepository {
  return {
    ...businessMasterStore(db),
    ...postingRuleStore(db),
    ...configHistoryStore(db),
    ...businessEventLookups(db),
    ...businessEventList(db),
    ...businessEventWrites(db),
    ...transferQueueStore(db),
    ...clearingLineStore(db),
    ...businessAuditLog(db),
  };
}
