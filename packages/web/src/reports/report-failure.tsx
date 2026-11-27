import { ReportFailure } from "../reports-data.ts";
import type { SimpleLabel, Translate } from "./report-label.ts";

const isConflict = (error: unknown) =>
  error instanceof ReportFailure && error.status === 409 && error.detail?.code === "CONFLICT";
const errorLabels = {
  INVALID_REQUEST: ["api.error.invalidRequest", "reports.invalidRequest"],
  FORBIDDEN: ["api.error.forbidden", "reports.forbidden"],
  NOT_FOUND: ["api.error.notFound", "reports.notFound"],
  CONFLICT: ["api.error.conflict", "reports.conflict"],
  UNAVAILABLE: ["api.error.unavailable", "reports.unavailable"],
  INTERNAL_ERROR: ["api.error.internal", "reports.internal"],
  METHOD_NOT_ALLOWED: ["api.error.methodNotAllowed", "reports.httpError"],
  UNSUPPORTED_MEDIA_TYPE: ["api.error.unsupportedMediaType", "reports.httpError"],
} as const;
function failureLabel(error: unknown): SimpleLabel {
  if (!(error instanceof ReportFailure) || error.kind === "invalid")
    return "reports.invalidResponse";
  if (error.kind === "network") return "reports.networkError";
  const known = Object.entries(errorLabels).find(([code]) => code === error.detail?.code)?.[1];
  return known && known[0] === error.detail?.messageKey ? known[1] : "reports.httpError";
}
function Failure({
  error,
  retry,
  reload,
  t,
}: {
  error: unknown;
  retry: () => void;
  reload: () => void;
  t: Translate;
}) {
  return (
    <Alert
      action={
        <button
          className="btn btn-secondary btn-sm"
          type="button"
          onClick={isConflict(error) ? reload : retry}
        >
          {t(isConflict(error) ? "reports.reload" : "reports.retry")}
        </button>
      }
    >
      {t(isConflict(error) ? "reports.conflict" : failureLabel(error))}
    </Alert>
  );
}
function Alert({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="message-bar danger" role="alert">
      <span className="icon" aria-hidden="true">
        ⚠
      </span>
      <div className="text">{children}</div>
      {action}
    </div>
  );
}

export { Alert, Failure, failureLabel, isConflict };
