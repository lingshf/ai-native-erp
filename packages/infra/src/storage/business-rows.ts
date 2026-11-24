import { StorageError } from "@erp/core/application";
import type { ContractSchema } from "@erp/core/contracts";
import type { Page, PageQuery } from "@erp/core/domain";
import type { Row } from "./types.ts";
export function decoded<T>(schema: ContractSchema<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new StorageError("STORAGE_FAILURE");
  return parsed.data;
}
export function json(value: unknown): unknown {
  if (typeof value !== "string") throw new StorageError("STORAGE_FAILURE");
  return JSON.parse(value);
}
export function page<T>(
  rows: readonly Row[],
  query: PageQuery,
  decode: (row: Row) => T,
  cursor: (value: T) => string,
): Page<T> {
  const items = rows.slice(0, query.limit).map(decode);
  return { items, nextCursor: rows.length > query.limit ? cursor(items[items.length - 1]) : null };
}
