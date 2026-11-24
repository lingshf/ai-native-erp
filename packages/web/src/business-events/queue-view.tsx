import type { FocusEvent } from "react";
import type { QueueSummaryDto } from "@erp/core/contracts";
import { openEvent, previewQueueItem, startWithdraw } from "./event-commands.ts";
import { PageTable, pageKey } from "./list.tsx";
import type { T } from "./types.ts";
import type { CompanyEventsState } from "./use-company-events.ts";
// 待转队列操作列：窄屏表格横向滚动时，浏览器聚焦只滚到按钮“部分可见”就停；让焦点按钮完整进入可见区，焦点环不被裁切
const revealFocused = (event: FocusEvent<HTMLButtonElement>) =>
  event.currentTarget.scrollIntoView?.({ block: "nearest", inline: "nearest" });
const queueStatuses = ["pending", "failed", "transferred", "withdrawn"] as const;
export type QueueStatus = (typeof queueStatuses)[number];
type StatusFilterProps = {
  value: QueueStatus;
  disabled: boolean;
  change: (next: QueueStatus) => void;
  t: T;
};
function QueueStatusFilter({ value, disabled, change, t }: StatusFilterProps) {
  return (
    <label className="ui-field jv-status">
      <span className="label">{t("business.queue")}</span>
      <select
        disabled={disabled}
        value={value}
        onChange={(event) => {
          const next = queueStatuses.find((item) => item === event.target.value);
          if (next) change(next);
        }}
      >
        {queueStatuses.map((item) => (
          <option key={item} value={item}>
            {t(`business.${item}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
export function QueueView({ state, t }: { state: CompanyEventsState; t: T }) {
  const { company, status, setStatus, queue, queueQuery, editing, busy } = state;
  return (
    <>
      <QueueStatusFilter value={status} disabled={editing || busy} change={setStatus} t={t} />
      <PageTable
        page={queue}
        t={t}
        refreshKey={pageKey(company.code, "transfer-queue", queueQuery)}
        title={t("business.queue")}
        className="be-queue"
        header={[t("journal.sourceRef"), t("journal.date"), t("business.queue"), ""]}
        render={(item) => (
          <>
            <td>{item.sourceRef}</td>
            <td>{item.date}</td>
            <td>
              {t(`business.${item.status}`)}
              {item.error && <> · {item.error}</>}
              {item.reason && <> · {item.reason}</>}
            </td>
            <td>
              <QueueRowActions item={item} state={state} t={t} />
            </td>
          </>
        )}
      />
    </>
  );
}
type RowActionsProps = { item: QueueSummaryDto; state: CompanyEventsState; t: T };
function QueueRowActions({ item, state, t }: RowActionsProps) {
  const { editing, busy } = state;
  return (
    <div className="be-queue-actions">
      <button
        type="button"
        className="btn btn-subtle btn-sm"
        onFocus={revealFocused}
        disabled={editing || busy}
        onClick={() => void openEvent(state, item.id)}
      >
        {t("journal.view")}
      </button>
      {(item.status === "pending" || item.status === "failed") && (
        <>
          <button
            type="button"
            className="btn btn-subtle btn-sm"
            onFocus={revealFocused}
            disabled={editing || busy}
            onClick={() => void previewQueueItem(state, item.id)}
          >
            {t("journal.preview")}
          </button>
          <button
            type="button"
            className="btn btn-subtle btn-sm"
            onFocus={revealFocused}
            disabled={editing || busy}
            onClick={() => startWithdraw(state, item.id)}
          >
            {t("business.withdraw")}
          </button>
        </>
      )}
    </div>
  );
}
