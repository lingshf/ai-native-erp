import { DomainError, StorageError } from "@erp/core/application";
import type { LedgerCursor } from "@erp/core/domain";
import { ledgerCursorSchema } from "@erp/core/contracts";
import type { Row } from "./types.ts";

export const amount = (row: Row, name: string) => {
  const value = Number(row[name]);
  if (!Number.isSafeInteger(value)) throw new StorageError("STORAGE_FAILURE");
  return value;
};
export function decodeLedgerCursor(text: string | undefined): LedgerCursor | null {
  if (text === undefined) return null;
  if (text.length > 2048) throw new DomainError("INVALID_INPUT");
  try {
    const decoded = ledgerCursorSchema.safeParse(
      JSON.parse(Buffer.from(text, "base64url").toString("utf8")),
    );
    if (
      text.length > 2048 ||
      !decoded.success ||
      Buffer.from(JSON.stringify(decoded.data)).toString("base64url") !== text
    )
      throw new DomainError("INVALID_INPUT");
    return decoded.data;
  } catch (error) {
    if (error instanceof SyntaxError) throw new DomainError("INVALID_INPUT");
    throw error;
  }
}
