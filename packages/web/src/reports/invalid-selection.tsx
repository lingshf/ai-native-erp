import { Alert } from "./report-failure.tsx";
import type { Translate } from "./report-label.ts";

export function InvalidSelection({ t, reload }: { t: Translate; reload: () => void }) {
  return (
    <Alert
      action={
        <button className="btn btn-secondary btn-sm" type="button" onClick={reload}>
          {t("reports.reload")}
        </button>
      }
    >
      {t("reports.invalidSelection")}
    </Alert>
  );
}
