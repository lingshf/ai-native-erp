import { Pool, types } from 'pg';
import { CompiledQuery, Kysely, PostgresDialect } from 'kysely';
import { StorageError } from '@erp/application';
import { commitNotSent, databaseCode, storageError } from './errors.js';
import type { Backend, Connection, Parameters, PostgresStorageConfig, Row } from './types.js';

export function postgresBackend(config: PostgresStorageConfig): Backend {
  if (!config || typeof config.host !== 'string' || !config.host ||
    typeof config.port !== 'number' || !Number.isInteger(config.port) || config.port < 1 || config.port > 65535 ||
    typeof config.user !== 'string' || !config.user || typeof config.password !== 'string' || !config.password ||
    typeof config.database !== 'string' || !config.database ||
    !(config.ssl === false || (typeof config.ssl === 'object' && config.ssl !== null &&
      config.ssl.rejectUnauthorized === true && typeof config.ssl.ca === 'string' && config.ssl.ca.length > 0)) ||
    (config.maxConnections !== undefined && (!Number.isInteger(config.maxConnections) ||
      config.maxConnections < 2 || config.maxConnections > 64))) throw new StorageError('INVALID_INPUT');
  // Pool creation is lazy: importing and constructing storage never connects.
  let pool: Pool | undefined;
  let closed = false;
  const options = { ...config, ssl: config.ssl === false ? false as const :
    { rejectUnauthorized: true as const, ca: config.ssl.ca } };
  return {
    dialect: 'postgres',
    async acquire(_readOnly, migrating) {
      if (closed) throw new StorageError('CLOSED');
      if (!pool) {
        pool = new Pool({
          host: options.host, port: options.port, user: options.user, password: options.password,
          database: options.database, ssl: options.ssl,
          max: options.maxConnections ?? 8, connectionTimeoutMillis: 1000, idleTimeoutMillis: 10000,
          application_name: 'erp-m02-storage',
          options: '-c search_path=public',
          types: {
            getTypeParser(oid, format) {
              if (oid === 20 && format !== 'binary') return (value: string) => BigInt(value);
              return types.getTypeParser(oid, format);
            },
          },
        });
        pool.on('error', () => { /* An idle broken client is removed by pg; no credential-bearing error escapes. */ });
      }
      const client = await pool.connect();
      let broken = false;
      let timeoutFailure: StorageError | undefined;
      const rememberTimeout = (error: unknown): void => {
        if (databaseCode(error) === '25P04') {
          broken = true;
          timeoutFailure ??= storageError(error);
        }
      };
      const onError = (error: Error): void => {
        broken = true;
        rememberTimeout(error);
      };
      const onEnd = (): void => { broken = true; };
      client.on('error', onError);
      client.on('end', onEnd);

      async function protocolComplete<T>(work: () => Promise<T>): Promise<T> {
        if (timeoutFailure) throw timeoutFailure;
        if (broken) throw new StorageError('STORAGE_FAILURE');
        let settle = (): void => {};
        const ready = new Promise<void>((resolve) => { settle = resolve; });
        client.once('drain', settle);
        client.once('error', settle);
        client.once('end', settle);
        try {
          const result = await work();
          await ready;
          if (timeoutFailure) throw timeoutFailure;
          return result;
        } catch (error) {
          rememberTimeout(error);
          // A rejected pg query can precede ReadyForQuery; do not queue rollback
          // or release its client until the protocol has drained or the socket died.
          await ready;
          if (timeoutFailure) throw timeoutFailure;
          throw error;
        } finally {
          client.off('drain', settle);
          client.off('error', settle);
          client.off('end', settle);
        }
      }

      const db = new Kysely<Record<string, never>>({
        dialect: new PostgresDialect({
          pool: {
            options: {},
            async connect() {
              return {
                query: client.query.bind(client),
                release() {},
              };
            },
            async end() {},
          },
        }),
      });
      const connection: Connection = {
        async query(text: string, parameters: Parameters = []): Promise<readonly Row[]> {
          let index = 0;
          const sql = text.replaceAll('?', () => `$${++index}`);
          return protocolComplete(async () => {
            const result = await db.executeQuery<Row>(CompiledQuery.raw(sql, [...parameters]));
            return result.rows;
          });
        },
        async script(text) { await protocolComplete(() => client.query(text)); },
        async begin(readOnly) {
          await connection.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN ISOLATION LEVEL READ COMMITTED');
          // A positive SET does not rearm an inherited, already active timer.
          await connection.query("SET LOCAL transaction_timeout='0'");
          const lock = migrating ? '30s' : '1s';
          const statement = migrating ? '60s' : '5s';
          const transaction = migrating ? '120s' : '10s';
          await connection.query(`SET LOCAL lock_timeout='${lock}'`);
          await connection.query(`SET LOCAL statement_timeout='${statement}'`);
          await connection.query(`SET LOCAL transaction_timeout='${transaction}'`);
          const rows = await connection.query(`SELECT current_setting('lock_timeout')::interval=INTERVAL '${lock}' AS lock,
            current_setting('statement_timeout')::interval=INTERVAL '${statement}' AS statement,
            current_setting('transaction_timeout')::interval=INTERVAL '${transaction}' AS transaction`);
          if (rows[0]?.lock !== true || rows[0]?.statement !== true ||
            rows[0]?.transaction !== true) throw new StorageError('STORAGE_FAILURE');
        },
        async commit() {
          if (timeoutFailure) throw commitNotSent(timeoutFailure);
          const rows = await connection.query('COMMIT');
          if (rows[0]?.command !== 'COMMIT') throw new StorageError('TRANSACTION_ABORTED');
        },
        async rollback() {
          try { await connection.query('ROLLBACK'); } catch (error) { broken = true; throw error; }
        },
        async release(destroy = false) {
          try { await db.destroy(); } finally {
            client.off('error', onError);
            client.off('end', onEnd);
            client.release(destroy || broken);
          }
        },
      };
      return connection;
    },
    async close() { closed = true; await pool?.end(); },
  };
}
