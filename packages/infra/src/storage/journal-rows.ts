import { StorageError } from "@erp/core/application";
import type { Row } from "./types.ts";

export function json(value: unknown): unknown {
  if (typeof value !== "string") throw new StorageError("STORAGE_FAILURE");
  return JSON.parse(value);
}
export function correctionOperation(row: Row): "reverse" | "replace" | "reclassify" {
  if (row.operation !== "reverse" && row.operation !== "replace" && row.operation !== "reclassify")
    throw new StorageError("STORAGE_FAILURE");
  return row.operation;
}
