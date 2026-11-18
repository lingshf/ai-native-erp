import { StorageError } from "@erp/core/application";

export function storageError(error: unknown): StorageError {
  if (error instanceof StorageError) return error;
  const code =
    error !== null && typeof error === "object" && "code" in error ? error.code : undefined;
  return new StorageError(
    code === "SQLITE_BUSY" || code === "SQLITE_LOCKED"
      ? "BUSY"
      : typeof code === "string" && code.startsWith("SQLITE_CONSTRAINT")
        ? "CONFLICT"
        : "STORAGE_FAILURE",
  );
}
