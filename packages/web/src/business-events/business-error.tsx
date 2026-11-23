import { MasterDataFailure } from "../master-data-client.ts";
import { JournalError } from "../Journals.tsx";
import { MessageBar } from "../ui/components/index.tsx";
import type { T } from "./types.ts";
export function BusinessError({
  error,
  t,
  uncertain = false,
}: {
  error: unknown;
  t: T;
  uncertain?: boolean;
}) {
  const issue = error instanceof MasterDataFailure ? error.detail?.fieldErrors[0] : undefined;
  const rules = [
    "shape",
    "missing",
    "ambiguous",
    "account",
    "reference",
    "stale",
    "source",
    "queue",
    "pending",
    "quantity",
    "line",
    "limit",
  ] as const;
  const rule = issue?.messageKey.startsWith("api.error.business.")
    ? rules.find((r) => issue.messageKey === `api.error.business.${r}`)
    : undefined;
  if (!uncertain && rule)
    return (
      <MessageBar tone="danger" role="alert">
        {t(`business.rule.${rule}`)} · {issue?.path}
      </MessageBar>
    );
  if (!uncertain && error instanceof MasterDataFailure && error.status === 404)
    return (
      <MessageBar tone="danger" role="alert">
        {t("business.rule.reference")}
      </MessageBar>
    );
  return <JournalError error={error} t={t} uncertain={uncertain} />;
}
