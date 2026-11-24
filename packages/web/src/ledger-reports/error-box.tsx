import { MasterDataFailure } from "../master-data-client.ts";
import { MessageBar } from "../ui/components/index.tsx";
import type { T } from "./types.ts";

export function ErrorBox({ error, retry, t }: { error: unknown; retry: () => void; t: T }) {
  return (
    <MessageBar tone="danger" role="alert">
      {t("ledger.error")}{" "}
      {error instanceof MasterDataFailure &&
        error.detail?.code === "CONFLICT" &&
        t("ledger.snapshotUnavailable")}{" "}
      {error instanceof MasterDataFailure &&
        (error.kind === "network" ? (
          t("reports.networkError")
        ) : error.kind === "invalid" ? (
          t("reports.invalidResponse")
        ) : (
          <code>
            HTTP {error.status} · {error.detail?.code} · {error.detail?.requestId}
          </code>
        ))}{" "}
      <button type="button" className="btn btn-secondary btn-sm" onClick={retry}>
        {t("master.retry")}
      </button>
    </MessageBar>
  );
}

export function SnapshotUnavailable({ t }: { t: T }) {
  return (
    <MessageBar tone="danger" role="alert">
      {t("ledger.snapshotUnavailable")}
    </MessageBar>
  );
}
