import type { AccountCommand } from "@erp/core/contracts";
import type { LabelKey } from "../ui/index.ts";
import { MasterDataFailure } from "../master-data-client.ts";

export type T = (key: Exclude<LabelKey, "shell.httpError">) => string;
export function failure(error: unknown): "master.error" | "master.invalid" | "master.conflict" {
  return error instanceof MasterDataFailure &&
    error.status === 409 &&
    error.detail?.code === "CONFLICT"
    ? "master.conflict"
    : error instanceof MasterDataFailure && (error.kind === "invalid" || error.status === 400)
      ? "master.invalid"
      : "master.error";
}
const fieldMessages = {
  "api.error.account.contraParent": "master.contraInvalid",
  "api.error.account.contraChildren": "master.contraChildren",
  "api.error.account.readOnly": "master.readonly",
} as const;
function fieldMessage(error: unknown, path: keyof AccountCommand) {
  const issue =
    error instanceof MasterDataFailure
      ? error.detail?.fieldErrors.find((item) => item.path === path)
      : undefined;
  return Object.entries(fieldMessages).find(([key]) => key === issue?.messageKey)?.[1];
}
export function fieldIssue(error: unknown, path: keyof AccountCommand) {
  const key = fieldMessage(error, path);
  return {
    key,
    props: {
      "aria-invalid": key ? true : undefined,
      "aria-describedby": key ? `account-${path}-error` : undefined,
    },
  };
}
export type FieldIssue = ReturnType<typeof fieldIssue>;
