import { MasterDataFailure } from "../master-data-client.ts";
import type { LabelKey } from "../ui/index.ts";
import { MessageBar } from "../ui/components/index.tsx";
import type { T } from "./dimension-types.ts";

const rules = [
  "shape",
  "reference",
  "window",
  "duplicate",
  "cycle",
  "conflict",
  "required",
  "forbidden",
  "combination",
  "balance",
] as const;
export type Failure = {
  path: string;
  key: Exclude<LabelKey, "shell.httpError">;
  conflict: boolean;
};
export function failure(error: unknown): Failure {
  if (error instanceof MasterDataFailure) {
    if (error.status === 409 && error.detail?.code === "CONFLICT")
      return { path: "form", key: "master.conflict", conflict: true };
    const field = error.detail?.fieldErrors[0];
    const rule = rules.find((value) => field?.messageKey === `api.error.dimensions.${value}`);
    if (rule && field) return { path: field.path, key: `dim.issue.${rule}`, conflict: false };
    if (error.status === 400 || error.kind === "invalid")
      return { path: "form", key: "dim.issue.shape", conflict: false };
  }
  return { path: "form", key: "master.error", conflict: false };
}
export function Notice({ error, t, retry }: { error: unknown; t: T; retry: () => void }) {
  return (
    <MessageBar tone="danger" role="alert">
      <p>{t(failure(error).key)}</p>
      <button type="button" className="btn btn-secondary" onClick={retry}>
        {t("master.retry")}
      </button>
    </MessageBar>
  );
}
