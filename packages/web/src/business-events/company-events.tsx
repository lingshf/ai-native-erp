import { useEffect, useLayoutEffect, useRef, useState, type FocusEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  dimensionPageSchema,
  businessEventsPageSchema,
  businessPreviewSchema,
  businessResultSchema,
  transferQueuePageSchema,
  journalDetailSchema,
  type CompanyDto,
  type BusinessEventDto,
  type BusinessPreviewDto,
  type BusinessResultDto,
  type JournalDetailDto,
} from "@erp/core/contracts";
import { label, type Language } from "../ui/index.ts";
import { MasterDataFailure, masterRequest } from "../master-data-client.ts";
import { Facts, LinePlan, Modal } from "../journals/dialogs.tsx";
import { VirtualRows } from "../journals/virtual-rows.tsx";
import { MessageBar } from "../ui/components/index.tsx";
import { formatMinor } from "../reports-data.ts";
import { BusinessError } from "./business-error.tsx";
import { EventEditor } from "./editors.tsx";
import { companyQuery, PageControls, PageTable, pageKey, usePage } from "./list.tsx";
import { BusinessSettings } from "./settings.tsx";
import type { T } from "./types.ts";
// 待转队列操作列：窄屏表格横向滚动时，浏览器聚焦只滚到按钮“部分可见”就停；让焦点按钮完整进入可见区，焦点环不被裁切
const revealFocused = (event: FocusEvent<HTMLButtonElement>) =>
  event.currentTarget.scrollIntoView?.({ block: "nearest", inline: "nearest" });
const queueStatuses = ["pending", "failed", "transferred", "withdrawn"] as const;
type QueueStatus = (typeof queueStatuses)[number];
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
type Review =
  | { preview: BusinessPreviewDto; event: BusinessEventDto; key: string }
  | { preview: BusinessPreviewDto; queueId: string };
export function CompanyEvents({
  company,
  language,
  lock,
  initialId,
  initialQueue,
}: {
  company: CompanyDto;
  language: Language;
  lock: (value: boolean) => void;
  initialId: string | null;
  initialQueue: boolean;
}) {
  const t: T = (key) => label(language, key),
    client = useQueryClient();
  const [view, setView] = useState<"events" | "settings" | "queue">(
    initialQueue ? "queue" : "events",
  );
  const [draft, setDraft] = useState<BusinessEventDto | null>(null),
    [review, setReview] = useState<Review | null>(null);
  const [detail, setDetail] = useState<BusinessResultDto | null>(null),
    [entry, setEntry] = useState<JournalDetailDto | null>(null);
  const [withdraw, setWithdraw] = useState<{ id: string; reason: string } | null>(null),
    [status, setStatus] = useState<QueueStatus>("pending");
  const [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [configEditing, setConfigEditing] = useState(false),
    [error, setError] = useState<unknown>();
  const working = useRef(false),
    alive = useRef(true),
    returnFocus = useRef<HTMLElement | null>(null);
  const editing = Boolean(draft || review || withdraw || configEditing);
  const listing = usePage("events", company.code, businessEventsPageSchema, "", view === "events");
  const queueQuery = `&status=${status}`;
  const queue = usePage(
    "transfer-queue",
    company.code,
    transferQueuePageSchema,
    queueQuery,
    view === "queue",
  );
  const dimensions = usePage("dimensions", company.code, dimensionPageSchema, "&kind=dimension");
  const dimensionKeys =
    dimensions.data?.pages.flatMap((p) => p.items.map((item) => item.code)) ?? [];
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    lock(editing || busy);
    return () => lock(false);
  }, [editing, busy, lock]);
  // Layout phase: a passive effect after an async commit returns focus one task late.
  useLayoutEffect(() => {
    if (!review && !withdraw && !busy) {
      const previous = returnFocus.current;
      if (previous?.isConnected) previous.focus();
    }
  }, [review, withdraw, busy]);
  useEffect(() => {
    if (!initialId) return;
    const controller = new AbortController();
    void masterRequest(
      `/api/v1/events/${encodeURIComponent(initialId)}?${companyQuery(company.code)}`,
      businessResultSchema,
      { signal: controller.signal },
    ).then(
      (result) => {
        if (!controller.signal.aborted) setDetail(result);
      },
      (cause) => {
        if (!controller.signal.aborted) setError(cause);
      },
    );
    return () => controller.abort();
  }, [initialId, company.code]);
  async function run(action: () => Promise<void>) {
    if (working.current) return;
    if (!review && !withdraw)
      returnFocus.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    working.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (cause) {
      if (alive.current) setError(cause);
    } finally {
      working.current = false;
      if (alive.current) setBusy(false);
    }
  }
  function complete(result: BusinessResultDto) {
    if (!alive.current) return;
    setDetail(result);
    setDraft(null);
    setEntry(null);
    setReview(null);
    setWithdraw(null);
    setUncertain(false);
    void client.invalidateQueries({ queryKey: ["business", company.code] });
    void client.invalidateQueries({ queryKey: ["journals", company.code] });
  }
  function rejected(cause: unknown) {
    const known =
      cause instanceof MasterDataFailure &&
      cause.kind === "http" &&
      cause.status !== undefined &&
      cause.status < 500;
    if (alive.current) {
      setUncertain(!known);
      if (known) {
        setReview(null);
        setWithdraw(null);
      }
    }
  }
  function fresh(operation: "cash_service" | "statistics" | "clearing.match", originalId?: string) {
    const base = { id: crypto.randomUUID(), sourceRef: "", date: "", memo: "" };
    const next: BusinessEventDto = originalId
      ? { ...base, operation: "cash_service.cancel", originalId }
      : operation === "cash_service"
        ? {
            ...base,
            operation,
            direction: "receive",
            service: "",
            party: null,
            currency: company.currency,
            amount: "",
            dimensions: {},
          }
        : operation === "statistics"
          ? { ...base, operation, code: "", quantity: "", unit: "", dimensions: {} }
          : { ...base, operation, account: "", lines: [] };
    setDraft(next);
    setDetail(null);
    setEntry(null);
    setError(undefined);
  }
  const preview = () =>
    run(async () => {
      if (!draft) return;
      const result = await masterRequest("/api/v1/events/preview", businessPreviewSchema, {
        method: "POST",
        body: { company: company.code, event: draft },
      });
      if (alive.current) setReview({ preview: result, event: draft, key: crypto.randomUUID() });
    });
  const confirm = () =>
    run(async () => {
      if (!review) return;
      try {
        const result =
          "event" in review
            ? await masterRequest("/api/v1/events/confirm", businessResultSchema, {
                method: "POST",
                body: {
                  company: company.code,
                  event: review.event,
                  fingerprint: review.preview.fingerprint,
                  idempotencyKey: review.key,
                  confirmation: "POST",
                },
              })
            : await masterRequest(
                `/api/v1/transfer-queue/${review.queueId}/confirm`,
                businessResultSchema,
                {
                  method: "POST",
                  body: {
                    company: company.code,
                    fingerprint: review.preview.fingerprint,
                    confirmation: "TRANSFER",
                  },
                },
              );
        complete(result);
      } catch (cause) {
        rejected(cause);
        throw cause;
      }
    });
  return (
    <>
      <div className="toolbar-row">
        <div className="segmented">
          {(["events", "settings", "queue"] as const).map((item) => (
            <button
              key={item}
              type="button"
              disabled={editing || busy}
              aria-pressed={view === item}
              onClick={() => {
                setView(item);
                setError(undefined);
              }}
            >
              {t(item === "events" ? "business.title" : `business.${item}`)}
            </button>
          ))}
        </div>
      </div>
      {error !== undefined && !review && !withdraw && <BusinessError error={error} t={t} />}
      {busy && <p role="status">{t("journal.pending")}</p>}
      {view === "settings" && (
        <BusinessSettings
          company={company}
          t={t}
          dimensionKeys={dimensionKeys}
          lock={setConfigEditing}
        />
      )}
      {view === "events" && (
        <>
          <div className="toolbar-row">
            {(["cash_service", "statistics", "clearing.match"] as const).map((operation) => (
              <button
                type="button"
                className="btn btn-secondary"
                key={operation}
                disabled={editing || busy}
                onClick={() => fresh(operation)}
              >
                {t("business.new")} · {t(`business.${operation}`)}
              </button>
            ))}
          </div>
          <PageTable
            page={listing}
            t={t}
            refreshKey={pageKey(company.code, "events")}
            title={t("business.title")}
            header={[t("journal.sourceRef"), t("journal.date"), t("business.title"), ""]}
            render={(item) => (
              <>
                <td>{item.sourceRef}</td>
                <td>{item.date}</td>
                <td>
                  {t(`business.${item.operation}`)} · {t(`business.${item.status}`)}
                </td>
                <td>
                  <button
                    type="button"
                    className="btn btn-subtle btn-sm"
                    disabled={editing || busy}
                    onClick={() =>
                      void run(async () => {
                        const result = await masterRequest(
                          `/api/v1/events/${item.id}?${companyQuery(company.code)}`,
                          businessResultSchema,
                        );
                        if (alive.current) {
                          setDetail(result);
                          setEntry(null);
                        }
                      })
                    }
                  >
                    {t("journal.view")}
                  </button>
                </td>
              </>
            )}
          />
          {draft && (
            <EventEditor
              event={draft}
              company={company}
              t={t}
              language={language}
              dimensionKeys={dimensionKeys}
              change={setDraft}
              busy={busy || Boolean(review)}
              preview={() => void preview()}
              close={() => {
                setDraft(null);
                setError(undefined);
              }}
            />
          )}
        </>
      )}
      {view === "queue" && (
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
                  <div className="be-queue-actions">
                    <button
                      type="button"
                      className="btn btn-subtle btn-sm"
                      onFocus={revealFocused}
                      disabled={editing || busy}
                      onClick={() =>
                        void run(async () => {
                          const result = await masterRequest(
                            `/api/v1/events/${item.id}?${companyQuery(company.code)}`,
                            businessResultSchema,
                          );
                          if (alive.current) {
                            setDetail(result);
                            setEntry(null);
                          }
                        })
                      }
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
                          onClick={() =>
                            void run(async () => {
                              const result = await masterRequest(
                                `/api/v1/transfer-queue/${item.id}/preview`,
                                businessPreviewSchema,
                                { method: "POST", body: { company: company.code } },
                              );
                              if (alive.current) setReview({ preview: result, queueId: item.id });
                            })
                          }
                        >
                          {t("journal.preview")}
                        </button>
                        <button
                          type="button"
                          className="btn btn-subtle btn-sm"
                          onFocus={revealFocused}
                          disabled={editing || busy}
                          onClick={() => {
                            returnFocus.current =
                              document.activeElement instanceof HTMLElement
                                ? document.activeElement
                                : null;
                            setError(undefined);
                            setWithdraw({ id: item.id, reason: "" });
                          }}
                        >
                          {t("business.withdraw")}
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </>
            )}
          />
        </>
      )}
      {detail && (
        <section className="card jv-detail">
          <header>
            <h3>
              {detail.event.sourceRef} · {t(`business.${detail.status}`)}
            </h3>
          </header>
          <div className="body">
            <MessageBar tone="info" role="status">
              {t("business.done")}
            </MessageBar>
            <p>
              {t("business.receipt")}: {detail.receipt.idempotencyKey} · {detail.receipt.postedAt} ·{" "}
              {detail.receipt.fingerprint}
            </p>
            <BusinessPlan preview={detail.preview} company={company} language={language} t={t} />
            {detail.queue?.plan && (
              <>
                <h4>{t("business.currentPlan")}</h4>
                {detail.queue.plan.journals.map((journal) => (
                  <LinePlan
                    key={journal.role}
                    lines={journal.lines}
                    company={company}
                    language={language}
                    t={t}
                  />
                ))}
              </>
            )}
            {detail.event.operation === "cash_service.cancel" && (
              <p>
                {t("business.original")}:{" "}
                <button
                  type="button"
                  className="btn btn-subtle btn-sm"
                  disabled={editing || busy}
                  onClick={() => {
                    const event = detail.event;
                    if (event.operation === "cash_service.cancel")
                      void run(async () => {
                        const result = await masterRequest(
                          `/api/v1/events/${event.originalId}?${companyQuery(company.code)}`,
                          businessResultSchema,
                        );
                        if (alive.current) setDetail(result);
                      });
                  }}
                >
                  {detail.event.originalId}
                </button>
              </p>
            )}
            <div className="ui-form-actions">
              {detail.event.operation === "cash_service" && detail.status === "posted" && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={editing || busy}
                  onClick={() => fresh("cash_service", detail.event.id)}
                >
                  {t("business.cash_service.cancel")}
                </button>
              )}
              {detail.journalIds.map((id) => (
                <button
                  type="button"
                  className="btn btn-secondary"
                  key={id}
                  disabled={editing || busy}
                  onClick={() =>
                    void run(async () => {
                      const result = await masterRequest(
                        `/api/v1/journals/${id}?${companyQuery(company.code)}`,
                        journalDetailSchema,
                      );
                      if (alive.current) setEntry(result);
                    })
                  }
                >
                  {t("journal.view")} {id}
                </button>
              ))}
            </div>
            {entry && (
              <section className="jv-entry">
                <h4>
                  {entry.entry.sourceRef} · {entry.entry.id}
                </h4>
                <LinePlan lines={entry.entry.lines} company={company} language={language} t={t} />
                <h4>{t("journal.chain")}</h4>
                {entry.chain.map((edge) => (
                  <p key={edge.outputId}>
                    {edge.date} · {edge.originalId} → {edge.outputId}
                  </p>
                ))}
              </section>
            )}
          </div>
        </section>
      )}
      {review && (
        <Modal
          title={t("journal.previewTitle")}
          busy={busy || uncertain}
          close={() => setReview(null)}
        >
          <BusinessPlan preview={review.preview} company={company} language={language} t={t} />
          {error !== undefined && <BusinessError error={error} t={t} uncertain={uncertain} />}
          <div className="ui-form-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void confirm()}
            >
              {t("event" in review ? "business.confirm" : "business.transfer")}
            </button>
            <button
              type="button"
              className="btn btn-subtle"
              disabled={busy || uncertain}
              onClick={() => setReview(null)}
            >
              {t("journal.back")}
            </button>
          </div>
        </Modal>
      )}
      {withdraw && (
        <Modal
          title={t("business.withdraw")}
          busy={busy || uncertain}
          close={() => setWithdraw(null)}
        >
          <label className="ui-field">
            <span className="label">{t("business.reason")}</span>
            <textarea
              required
              maxLength={200}
              disabled={busy || uncertain}
              value={withdraw.reason}
              onChange={(event) => setWithdraw({ ...withdraw, reason: event.target.value })}
            />
          </label>
          {error !== undefined && <BusinessError error={error} t={t} uncertain={uncertain} />}
          <div className="ui-form-actions">
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy || !withdraw.reason.trim()}
              onClick={() =>
                void run(async () => {
                  try {
                    complete(
                      await masterRequest(
                        `/api/v1/transfer-queue/${withdraw.id}/withdraw`,
                        businessResultSchema,
                        {
                          method: "POST",
                          body: {
                            company: company.code,
                            reason: withdraw.reason,
                            confirmation: "WITHDRAW",
                          },
                        },
                      ),
                    );
                  } catch (cause) {
                    rejected(cause);
                    throw cause;
                  }
                })
              }
            >
              {t("business.withdrawConfirm")}
            </button>
            <button
              type="button"
              className="btn btn-subtle"
              disabled={busy || uncertain}
              onClick={() => setWithdraw(null)}
            >
              {t("journal.back")}
            </button>
          </div>
        </Modal>
      )}
      <PageControls page={dimensions} t={t} />
    </>
  );
}
function BusinessPlan({
  preview,
  company,
  language,
  t,
}: {
  preview: BusinessPreviewDto;
  company: CompanyDto;
  language: Language;
  t: T;
}) {
  return (
    <>
      <Facts
        items={[
          [t("journal.sourceRef"), preview.plan.sourceRef],
          [t("journal.date"), preview.plan.date],
          [t("journal.currency"), preview.plan.currency],
          [t("journal.memo"), preview.plan.memo],
        ]}
      />
      {preview.matches.map((match) => (
        <section key={match.meaning}>
          <h4>
            {t("business.match")}: {t(`business.${match.meaning}`)} → {match.rule} / r
            {match.revision} → {match.account}
          </h4>
          <p>
            {t("business.candidates")}:{" "}
            {match.candidates
              .map(
                (item) =>
                  `${t(item.objectScope === "group" ? "business.groupScope" : `business.${item.objectScope}`)} / ${t(item.partyScope === "group" ? "business.groupScope" : `business.${item.partyScope}`)} (${item.count})`,
              )
              .join(" · ")}
          </p>
        </section>
      ))}
      {!preview.plan.journals.length && <p>{t("business.noGl")}</p>}
      {preview.plan.journals.map((journal) => (
        <section key={journal.role}>
          <h4>{t(journal.role === "reversal" ? "journal.historical" : "journal.business")}</h4>
          <LinePlan
            lines={journal.lines}
            company={company}
            language={language}
            t={t}
            total={journal}
          />
        </section>
      ))}
      {preview.statistics && (
        <section>
          <h4>
            {preview.statistics.code}: {formatMinor(preview.statistics.quantity, language, 6)}{" "}
            {preview.statistics.unit}
          </h4>
          {Object.entries(preview.statistics.dimensionOrigins).map(([key, origins]) => (
            <p key={key}>
              {key}:{" "}
              {origins.map((origin) => `${origin.source} → ${origin.value ?? "-"}`).join(" · ")}
            </p>
          ))}
        </section>
      )}
      {preview.clearing.length > 0 && (
        <VirtualRows
          className="jv-rows"
          items={preview.clearing}
          title={t("business.selected")}
          header={[t("journal.original"), t("journal.line")]}
          render={(line) => (
            <>
              <td>{line.entryId}</td>
              <td>{line.lineNo}</td>
            </>
          )}
        />
      )}
    </>
  );
}
