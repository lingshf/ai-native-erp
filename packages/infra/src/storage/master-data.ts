import {
  DomainError,
  StorageError,
  type MasterDataRepository,
  type MasterDataStore,
} from "@erp/core/application";
import { Queue } from "./queue.ts";
import { sqliteBackend } from "./sqlite.ts";
import { storageError } from "./errors.ts";
import { inspectSchema } from "./migrations.ts";
import { dimensionRepository } from "./dimensions.ts";
import { journalRepository } from "./journals.ts";
import { businessRepository } from "./business-events.ts";
import { reportRepository } from "./reports.ts";
import { periodCloseRepository } from "./period-close.ts";
import { tradeRepository } from "./trade-master.ts";
import { tradeDocumentRepository } from "./trade-documents.ts";
import { tradeReportingRepository } from "./trade-reporting.ts";
import { companyRepository } from "./master-data-companies.ts";
import { accountRepository } from "./master-data-accounts.ts";
import { periodRepository } from "./master-data-periods.ts";
import { configHistoryRepository } from "./master-data-history.ts";
import type { Connection, SqliteStorageConfig } from "./types.ts";

export function masterDataRepository(db: Connection): MasterDataRepository {
  // Spread order defines Object.keys order: the eight composed repositories first, then
  // the master-data groups in their original order (companies, accounts, periods, history).
  return {
    ...tradeRepository(db),
    ...tradeDocumentRepository(db),
    ...tradeReportingRepository(db),
    ...dimensionRepository(db),
    ...journalRepository(db),
    ...businessRepository(db),
    ...reportRepository(db),
    ...periodCloseRepository(db),
    ...companyRepository(db),
    ...accountRepository(db),
    ...periodRepository(db),
    ...configHistoryRepository(db),
  };
}
export function createMasterDataStore(
  config: SqliteStorageConfig,
): MasterDataStore & { close(): Promise<void> } {
  const backend = sqliteBackend(config);
  const queue = new Queue();
  const inflight = new Set<Promise<unknown>>();
  let closed = false;
  function run<T>(write: boolean, work: (repo: MasterDataRepository) => Promise<T>): Promise<T> {
    if (closed) return Promise.reject(new StorageError("CLOSED"));
    async function transaction(): Promise<T> {
      const release = await queue.acquire();
      let db: Connection | undefined;
      let begun = false;
      let destroy = false;
      try {
        db = await backend.acquire(!write, false);
        await db.begin();
        begun = true;
        await inspectSchema(db, false);
        const result = await work(masterDataRepository(db));
        await db.commit();
        begun = false;
        return result;
      } catch (error) {
        if (begun && db) {
          try {
            await db.rollback();
          } catch {
            destroy = true;
            throw new StorageError("STORAGE_FAILURE");
          }
        }
        if (error instanceof DomainError) throw error;
        throw storageError(error);
      } finally {
        try {
          await db?.release(destroy);
        } finally {
          release();
        }
      }
    }
    const operation = transaction();
    inflight.add(operation);
    void operation.then(
      () => inflight.delete(operation),
      () => inflight.delete(operation),
    );
    return operation;
  }
  return {
    read: (work) => run(false, work),
    write: (work) => run(true, work),
    async close() {
      closed = true;
      queue.close();
      await Promise.allSettled([...inflight]);
      await backend.close();
    },
  };
}
