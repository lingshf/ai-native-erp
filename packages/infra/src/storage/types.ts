import type { StorageScope, UnitOfWork } from "@erp/core/application";

export interface TargetStorage extends UnitOfWork {
  verifySchema(): Promise<void>;
  migrate(): Promise<void>;
  provision(scope: StorageScope): Promise<void>;
}

export interface SqliteStorageConfig {
  readonly filename: string;
}

export type Row = Record<string, unknown>;
export type Parameters = readonly (string | number | bigint | null)[];
export interface Connection {
  query(text: string, parameters?: Parameters): Promise<readonly Row[]>;
  script(text: string): Promise<void>;
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(destroy?: boolean): Promise<void>;
}
export interface Backend {
  acquire(readOnly: boolean, migrating: boolean): Promise<Connection>;
  close(): Promise<void>;
}
