import { MessageBar } from "../ui/components/index.tsx";
import type { CloseText } from "./close-text.ts";

type Refetchable = { isError: boolean; refetch: () => Promise<unknown> };

export function PeriodLoadError({
  t,
  companies,
  periods,
}: {
  t: CloseText;
  companies: Refetchable;
  periods: Refetchable;
}) {
  return (
    <MessageBar tone="danger" role="alert">
      {t("close.error")}{" "}
      <button
        className="btn btn-secondary"
        type="button"
        onClick={() => void (companies.isError ? companies.refetch() : periods.refetch())}
      >
        {t("master.retry")}
      </button>
    </MessageBar>
  );
}

export function InvalidSelectionNotice({ t }: { t: CloseText }) {
  return (
    <MessageBar tone="danger" role="alert">
      {t("ledger.invalid")}
    </MessageBar>
  );
}

export function AdmissionSavedNotice({ t }: { t: CloseText }) {
  return (
    <MessageBar tone="success" role="status">
      {t("trpt.saved")}
    </MessageBar>
  );
}
