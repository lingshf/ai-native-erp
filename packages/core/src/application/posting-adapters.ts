import type { Account } from "@erp/core/domain";

export type PostingAdapterRegistry = Readonly<
  Record<string, readonly NonNullable<Account["controlModule"]>[]>
>;

// Register production adapters here when their module is implemented, never from request data.
export const postingAdapters: PostingAdapterRegistry = Object.freeze({
  TRADE: Object.freeze(["AP", "AR", "TAX"] as const),
});
