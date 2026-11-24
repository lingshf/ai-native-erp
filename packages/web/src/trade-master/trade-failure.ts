import type { LabelKey } from "../ui/index.ts";
import { MasterDataFailure } from "../master-data-client.ts";

type Failure = { path: string; key: Exclude<LabelKey, "shell.httpError">; conflict: boolean };
export type { Failure };
export function failure(error: unknown): Failure {
  if (error instanceof MasterDataFailure) {
    if (error.status === 409) return { path: "form", key: "master.conflict", conflict: true };
    const field = error.detail?.fieldErrors[0];
    for (const rule of [
      "shape",
      "window",
      "reference",
      "account",
      "missingTax",
      "ambiguousTax",
    ] as const)
      if (field?.messageKey === `api.error.trade.${rule}`)
        return { path: field.path, key: `trade.issue.${rule}`, conflict: false };
    if (error.status === 400 || error.kind === "invalid")
      return { path: "form", key: "trade.issue.shape", conflict: false };
  }
  return { path: "form", key: "master.error", conflict: false };
}
