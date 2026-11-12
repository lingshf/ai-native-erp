import type { StorageScope, UnitOfWork } from '@erp/application';

export interface TargetStorage extends UnitOfWork {
  verifySchema(): Promise<void>;
  migrate(): Promise<void>;
  provision(scope: StorageScope): Promise<void>;
}

export interface SqliteStorageConfig { readonly filename: string }

export interface PostgresStorageConfig {
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly password: string;
  readonly database: string;
  readonly ssl: false | { readonly rejectUnauthorized: true; readonly ca: string };
  readonly maxConnections?: number;
}

export type Row = Record<string, unknown>;
export type Parameters = readonly (string | number | bigint | null)[];
export interface Connection {
  query(text: string, parameters?: Parameters): Promise<readonly Row[]>;
  script(text: string): Promise<void>;
  begin(readOnly: boolean): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(destroy?: boolean): Promise<void>;
}
export interface Backend {
  readonly dialect: 'sqlite' | 'postgres';
  acquire(readOnly: boolean, migrating: boolean): Promise<Connection>;
  close(): Promise<void>;
}
