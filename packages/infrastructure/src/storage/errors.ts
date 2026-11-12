import { StorageError } from '@erp/application';

const sources = new WeakMap<StorageError, string>();
const unsentCommits = new WeakSet<StorageError>();

export function commitNotSent(error: StorageError): StorageError {
  unsentCommits.add(error);
  return error;
}

export function isCommitNotSent(error: unknown): boolean {
  return error instanceof StorageError && unsentCommits.has(error);
}

export function databaseCode(error: unknown): string {
  if (error instanceof StorageError) return sources.get(error) ?? '';
  if (typeof error !== 'object' || error === null || !('code' in error)) return '';
  return typeof error.code === 'string' ? error.code : '';
}

export function storageError(error: unknown): StorageError {
  if (error instanceof StorageError) return error;
  const code = databaseCode(error);
  const mapped = new StorageError(
    code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED' || code === '55P03' ? 'BUSY' :
      code === '57014' || code === '25P04' ? 'TRANSACTION_TIMEOUT' :
        code === '40001' || code === '40P01' || code === '25P02' ? 'TRANSACTION_ABORTED' :
          code.startsWith('SQLITE_CONSTRAINT') || code.startsWith('23') ? 'CONFLICT' : 'STORAGE_FAILURE',
  );
  sources.set(mapped, code);
  return mapped;
}

export const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));
