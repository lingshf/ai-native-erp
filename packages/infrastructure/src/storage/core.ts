import { AsyncLocalStorage } from 'node:async_hooks';
import { StorageError, parseLockPlan, parseScope } from '@erp/application';
import type {
  CompanyScope, LockPlan, StorageReadSession, StorageScope, StorageWriteSession, TransactionOptions,
} from '@erp/application';
import { databaseCode, delay, isCommitNotSent, storageError } from './errors.js';
import { inspectSchema, migrateConnection } from './migrations.js';
import { Queue } from './queue.js';
import { Session, lockScopes, scopeTable, scopeValues, scopeWhere } from './session.js';
import type { Backend, Connection, TargetStorage } from './types.js';

export function targetStorage(backend: Backend): TargetStorage {
  const context = new AsyncLocalStorage<boolean>();
  const writer = new Queue();
  const reader = new Queue();
  const inflight = new Set<Promise<unknown>>();
  let closed = false;
  let closing: Promise<void> | undefined;

  function admitted<T>(work: () => Promise<T>): Promise<T> {
    if (context.getStore()) return Promise.reject(new StorageError('NESTED_UOW'));
    if (closed) return Promise.reject(new StorageError('CLOSED'));
    const operation = Promise.resolve().then(() => context.run(true, work)).catch((error: unknown) => { throw storageError(error); });
    inflight.add(operation);
    void operation.then(() => inflight.delete(operation), () => inflight.delete(operation));
    return operation;
  }

  async function begin(connection: Connection, readOnly: boolean): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      try { await connection.begin(readOnly); return; } catch (error) {
        if (backend.dialect !== 'sqlite' || databaseCode(error) !== 'SQLITE_BUSY' || attempt >= 2) throw error;
        await delay(25 * (attempt + 1));
      }
    }
  }

  async function transaction<T>(
    readOnly: boolean, migrating: boolean, work: (connection: Connection) => Promise<T>,
  ): Promise<T> {
    let releaseQueue: (() => void) | undefined;
    let releaseReader: (() => void) | undefined;
    let connection: Connection | undefined;
    let begun = false;
    let committing = false;
    let destroy = false;
    try {
      if (backend.dialect === 'sqlite') {
        releaseQueue = await (readOnly ? reader : writer).acquire();
        if (migrating) releaseReader = await reader.acquire();
      }
      connection = await backend.acquire(readOnly, migrating);
      // BEGIN may succeed before timeout configuration fails. Roll back on either failure.
      begun = backend.dialect === 'postgres';
      await begin(connection, readOnly);
      begun = true;
      if (migrating && backend.dialect === 'postgres') {
        // The advisory lock precedes every version-table or object inspection.
        await connection.query('SELECT pg_advisory_xact_lock(1163022386,2)');
      }
      if (!migrating) await inspectSchema(connection, backend.dialect, false);
      const result = await work(connection);
      committing = true;
      await connection.commit();
      begun = false;
      return result;
    } catch (error) {
      if (begun && connection) {
        try { await connection.rollback(); } catch { destroy = true; }
      }
      if (committing) {
        if (isCommitNotSent(error)) throw error;
        const code = databaseCode(error);
        if (backend.dialect === 'postgres' && (code === '40001' || code === '40P01')) throw error;
        if (error instanceof StorageError && error.code === 'TRANSACTION_ABORTED') throw error;
        if (backend.dialect === 'postgres') { destroy = true; throw new StorageError('COMMIT_UNKNOWN'); }
      }
      if (databaseCode(error) === '25P04') destroy = true;
      throw error;
    } finally {
      try { await connection?.release(destroy); } finally { releaseReader?.(); releaseQueue?.(); }
    }
  }

  async function callback<T>(
    connection: Connection, plan: LockPlan, readOnly: boolean,
    work: (session: Session) => Promise<T> | T,
  ): Promise<T> {
    const session = new Session(connection, plan, !readOnly);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          session.invalidate();
          reject(new StorageError('TRANSACTION_TIMEOUT'));
        }, 10000);
      });
      const result = await Promise.race([Promise.resolve().then(() => work(session)), timeout]);
      await session.finish();
      return result;
    } finally {
      if (timer) clearTimeout(timer);
      await session.drain();
    }
  }

  async function migration(connection: Connection): Promise<void> {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pending = new Set<Promise<unknown>>();
    function operation<T>(work: () => Promise<T>): Promise<T> {
      if (!active) return Promise.reject(new StorageError('CLOSED'));
      const promise = Promise.resolve().then(() => {
        if (!active) throw new StorageError('CLOSED');
        return work();
      });
      pending.add(promise);
      void promise.then(() => pending.delete(promise), () => pending.delete(promise));
      return promise;
    }
    const guarded: Connection = {
      ...connection,
      query: (sql, values) => operation(() => connection.query(sql, values)),
      script: (sql) => operation(() => connection.script(sql)),
    };
    try {
      await Promise.race([
        migrateConnection(guarded, backend.dialect),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            active = false;
            reject(new StorageError('TRANSACTION_TIMEOUT'));
          }, 120000);
        }),
      ]);
    } finally {
      active = false;
      if (timer) clearTimeout(timer);
      await Promise.allSettled([...pending]);
    }
  }

  return {
    verifySchema() {
      return admitted(() => transaction(true, false, async () => undefined));
    },
    migrate() {
      return admitted(() => transaction(false, true, migration));
    },
    provision(input: StorageScope) {
      return admitted(async () => {
        const scope = parseScope(input);
        await transaction(false, false, async (connection) => {
          const hierarchy: StorageScope[] = [{ level: 'tenant', tenantId: scope.tenantId }];
          if (scope.level !== 'tenant') hierarchy.push({ level: 'book', tenantId: scope.tenantId, bookId: scope.bookId });
          if (scope.level === 'company') hierarchy.push(scope);
          for (const item of hierarchy) {
            const columns = ['tenant_id', 'book_id', 'company_id'].slice(0, scopeValues(item).length);
            await connection.query(`INSERT INTO ${scopeTable(item)}(${columns.join(',')}) VALUES(${columns.map(() => '?').join(',')}) ON CONFLICT DO NOTHING`, scopeValues(item));
            const rows = await connection.query(`SELECT revision FROM ${scopeTable(item)} WHERE ${scopeWhere(item)}`, scopeValues(item));
            if (rows.length !== 1) throw new StorageError('CONFLICT');
          }
        });
      });
    },
    write<T>(input: LockPlan, work: (session: StorageWriteSession) => Promise<T> | T, options?: TransactionOptions) {
      return admitted(async () => {
        const plan = parseLockPlan(input);
        if (typeof work !== 'function' || (options !== undefined &&
          (typeof options !== 'object' || options === null || Object.keys(options).some((key) => key !== 'retry') ||
            (options.retry !== undefined && typeof options.retry !== 'boolean')))) throw new StorageError('INVALID_INPUT');
        for (let attempt = 0; ; attempt++) {
          try {
            return await transaction(false, false, async (connection) => {
              await lockScopes(connection, backend.dialect, plan);
              return callback(connection, plan, false, (session) => work(session.writeSession()));
            });
          } catch (error) {
            const code = databaseCode(error);
            if (backend.dialect !== 'postgres' || !options?.retry || attempt >= 2 ||
              (code !== '40001' && code !== '40P01')) throw error;
            await delay(25 * (attempt + 1));
          }
        }
      });
    },
    read<T>(input: CompanyScope, work: (session: StorageReadSession) => Promise<T> | T) {
      return admitted(async () => {
        const scope = parseScope(input);
        if (scope.level !== 'company') throw new StorageError('INVALID_SCOPE');
        if (typeof work !== 'function') throw new StorageError('INVALID_INPUT');
        const plan: LockPlan = { level: 'company', scopes: [scope] };
        return transaction(true, false, async (connection) => {
          // Establish the snapshot before handing control across an await boundary.
          const rows = await connection.query('SELECT revision FROM companies WHERE tenant_id=? AND book_id=? AND company_id=?', scopeValues(scope));
          if (rows.length !== 1) throw new StorageError('NOT_FOUND');
          return callback(connection, plan, true, (session) => work(session.readSession()));
        });
      });
    },
    close() {
      if (context.getStore()) return Promise.reject(new StorageError('NESTED_UOW'));
      if (!closing) {
        closed = true;
        writer.close();
        reader.close();
        closing = (async () => {
          await Promise.allSettled([...inflight]);
          try { await backend.close(); } catch (error) { throw storageError(error); }
        })();
      }
      return closing;
    },
  };
}
