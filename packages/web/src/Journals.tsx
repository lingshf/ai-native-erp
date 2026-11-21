import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Link, useSearchParams } from "react-router-dom";
import {
  companiesPageSchema,
  accountsPageSchema,
  dimensionPageSchema,
  journalDraftSchema,
  journalPageSchema,
  journalDetailSchema,
  journalPreviewSchema,
  journalReceiptSchema,
  journalDeletedSchema,
  businessResultSchema,
  type CompanyDto,
  type JournalDraftDto,
  type JournalEntryDto,
  type JournalPreviewDto,
  type JournalReceiptDto,
  type JournalDetailDto,
  type BusinessResultDto,
} from "@erp/core/contracts";
import { label, type LabelKey, type Language, type Preferences } from "./ui/index.ts";
import { MasterDataFailure, masterRequest } from "./master-data-client.ts";
import { formatMinor } from "./reports-data.ts";
import { AiPanel } from "./AiPanel.tsx";
import { Badge, FastTab, MessageBar, PageHeader, TeachingTip } from "./ui/components/index.tsx";
import "./pages/journals.css";
type T = (key: Exclude<LabelKey, "shell.httpError">) => string;
const emptyLine = () => ({ account: "", debit: "", credit: "", dimensions: {}, suspense: null });
const fresh = (): JournalDraftDto => ({
  id: crypto.randomUUID(),
  revision: 0,
  sourceRef: "",
  date: "",
  memo: "",
  kind: "normal",
  operation: "journal",
  originalId: null,
  headerDimensions: {},
  lines: [emptyLine(), emptyLine()],
});
const url = (company: string) => `company=${encodeURIComponent(company)}`;
// Display-only totals for the editor footer; the server preview remains the balance authority.
function toMinor(value: string, scale: number) {
  const match = /^(\d+)(?:\.(\d*))?$/u.exec(value.trim() || "0");
  const fraction = match?.[2] ?? "";
  if (!match || fraction.length > scale) return undefined;
  const minor = Number(match[1] + fraction.padEnd(scale, "0"));
  return Number.isSafeInteger(minor) ? minor : undefined;
}
function lineTotals(lines: JournalDraftDto["lines"], scale: number, language: Language) {
  let debit: number | undefined = 0,
    credit: number | undefined = 0;
  for (const line of lines) {
    const d = toMinor(line.debit, scale),
      c = toMinor(line.credit, scale);
    debit = debit === undefined || d === undefined ? undefined : debit + d;
    credit = credit === undefined || c === undefined ? undefined : credit + c;
  }
  const show = (value: number | undefined) =>
    value === undefined || !Number.isSafeInteger(value) ? "—" : formatMinor(value, language, scale);
  return {
    debit: show(debit),
    credit: show(credit),
    balanced: debit === undefined || credit === undefined || debit === credit,
  };
}
export function Journals({ preferences }: { preferences: Preferences }) {
  const [params, setParams] = useSearchParams();
  const t: T = (key) => label(preferences.language, key);
  const [locked, setLocked] = useState(false);
  const companies = useInfiniteQuery({
    queryKey: ["companies"],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      masterRequest(
        `/api/v1/companies?limit=100${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        companiesPageSchema,
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const items = companies.data?.pages.flatMap((page) => page.items) ?? [];
  const company = items.find((item) => item.code === (params.get("company") ?? items[0]?.code));
  return (
    <section className="page journals">
      <PageHeader
        title={t("journal.title")}
        context={
          <>
            <div className="field">
              <label htmlFor="journal-company">{t("master.company")}</label>
              <select
                id="journal-company"
                disabled={locked}
                value={company?.code ?? ""}
                onChange={(event) => setParams({ company: event.target.value })}
              >
                {items.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.code} · {item.name}
                  </option>
                ))}
              </select>
            </div>
            {companies.hasNextPage && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={companies.isFetchingNextPage}
                onClick={() => void companies.fetchNextPage()}
              >
                {t("master.loadMore")}
              </button>
            )}
          </>
        }
      />
      <TeachingTip teaching={preferences.teaching} title={t("journal.teachingTitle")}>
        {t("journal.teaching")}
      </TeachingTip>
      {companies.isPending && <p role="status">{t("master.loading")}</p>}
      {companies.isError && (
        <MessageBar tone="danger" role="alert">
          {t("journal.error")}{" "}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => void companies.refetch()}
          >
            {t("master.retry")}
          </button>
        </MessageBar>
      )}
      {company && (
        <CompanyJournals
          key={`${company.code}:${params.get("id") ?? ""}`}
          company={company}
          initialEntryId={params.get("id")}
          language={preferences.language}
          teaching={preferences.teaching}
          lock={setLocked}
        />
      )}
    </section>
  );
}
function CompanyJournals({
  company,
  initialEntryId,
  language,
  teaching,
  lock,
}: {
  company: CompanyDto;
  initialEntryId: string | null;
  language: Language;
  teaching: boolean;
  lock: (value: boolean) => void;
}) {
  const t: T = (key) => label(language, key),
    client = useQueryClient();
  const [status, setStatus] = useState<"draft" | "posted">(initialEntryId ? "posted" : "draft");
  const [draft, setDraft] = useState<JournalDraftDto | null>(null),
    [detail, setDetail] = useState<JournalDetailDto | null>(null);
  const [dirty, setDirty] = useState(false);
  const [plan, setPlan] = useState<
    (JournalPreviewDto & { key: string; command: "POST" | "QUEUE" }) | null
  >(null);
  const [queued, setQueued] = useState<BusinessResultDto | null>(null);
  const [receipt, setReceipt] = useState<JournalReceiptDto | null>(null),
    [notice, setNotice] = useState<"saved" | null>(null);
  const [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [deleting, setDeleting] = useState(false);
  const alive = useRef(true),
    working = useRef(false),
    form = useRef<HTMLFormElement>(null),
    lineKeys = useRef<string[]>([]),
    returnFocus = useRef<HTMLElement | null>(null),
    focusLine = useRef<number | null>(null);
  const lineCount = draft?.lines.length ?? 0;
  const detailRequest = useRef<AbortController | null>(null);
  const loadDetail = useCallback(
    async (id: string, clearReceipt = false) => {
      detailRequest.current?.abort();
      const controller = new AbortController();
      detailRequest.current = controller;
      setError(undefined);
      try {
        const value = await masterRequest(
          `/api/v1/journals/${encodeURIComponent(id)}?${url(company.code)}`,
          journalDetailSchema,
          { signal: controller.signal },
        );
        if (alive.current && !controller.signal.aborted) {
          setDetail(value);
          if (clearReceipt) setReceipt(null);
        }
      } catch (error) {
        if (alive.current && !controller.signal.aborted) setError(error);
      }
    },
    [company.code],
  );
  useEffect(() => {
    if (initialEntryId) void loadDetail(initialEntryId);
    return () => detailRequest.current?.abort();
  }, [initialEntryId, loadDetail]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (focusLine.current !== null && focusLine.current < lineCount) {
      form.current
        ?.querySelector<HTMLInputElement>(`[data-account="${focusLine.current}"]`)
        ?.focus();
      focusLine.current = null;
    }
  }, [lineCount]);
  // Layout phase: a passive effect after an async commit returns focus one task late.
  useLayoutEffect(() => {
    if (!busy && !plan && !deleting && document.activeElement === document.body) {
      const previous = returnFocus.current;
      if (previous?.isConnected) previous.focus();
      else if (previous) document.getElementById("journal-company")?.focus();
    }
  }, [busy, plan, deleting]);
  // Layout phase: a draft loaded over HTTP otherwise leaves focus on body for one task.
  useLayoutEffect(() => {
    if (draft?.id) form.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, [draft?.id]);
  const listing = useInfiniteQuery({
    queryKey: ["journals", company.code, status],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      masterRequest(
        `/api/v1/journals?${url(company.code)}&status=${status}&limit=100${pageParam ? `&cursor=${pageParam}` : ""}`,
        journalPageSchema,
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const accounts = useInfiniteQuery({
    queryKey: ["journal-accounts", company.code],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      masterRequest(
        `/api/v1/accounts?${url(company.code)}&limit=100${pageParam ? `&cursor=${pageParam}` : ""}`,
        accountsPageSchema,
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const dimensions = useInfiniteQuery({
    queryKey: ["journal-dimensions", company.code],
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      masterRequest(
        `/api/v1/dimensions?${url(company.code)}&kind=dimension&limit=100${pageParam ? `&cursor=${pageParam}` : ""}`,
        dimensionPageSchema,
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const accountItems = accounts.data?.pages.flatMap((page) => page.items) ?? [];
  const dimensionKeys = [
    ...new Set([
      ...(dimensions.data?.pages.flatMap((page) => page.items.map((item) => item.code)) ?? []),
      ...Object.keys(draft?.headerDimensions ?? {}),
      ...(draft?.lines.flatMap((line) => Object.keys(line.dimensions)) ?? []),
    ]),
  ];
  const rows = listing.data?.pages.flatMap((page) => page.items) ?? [];
  const totals = lineTotals(draft?.lines ?? [], company.scale, language);
  function edit(value: JournalDraftDto | null) {
    detailRequest.current?.abort();
    lineKeys.current = value?.lines.map(() => crypto.randomUUID()) ?? [];
    setDraft(value);
    setDirty(value !== null && value.revision === 0);
    lock(value !== null);
    setPlan(null);
    setUncertain(false);
    setError(undefined);
    setNotice(null);
  }
  async function run(action: () => Promise<void>) {
    if (working.current) return;
    if (!plan && !deleting)
      returnFocus.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    working.current = true;
    setBusy(true);
    setError(undefined);
    setNotice(null);
    try {
      await action();
    } catch (error) {
      if (alive.current) setError(error);
    } finally {
      working.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function save(): Promise<JournalDraftDto> {
    if (!draft) throw new Error("Missing journal editor");
    const saved = await masterRequest(
      draft.revision
        ? `/api/v1/journals/drafts/${draft.id}`
        : `/api/v1/journals/${draft.operation === "journal" ? "drafts" : draft.operation}`,
      journalDraftSchema,
      { method: draft.revision ? "PUT" : "POST", body: { company: company.code, draft } },
    );
    if (alive.current) {
      setDraft(saved);
      setDirty(false);
      void client.invalidateQueries({ queryKey: ["journals", company.code] });
    }
    return saved;
  }
  const preview = () =>
    run(async () => {
      if (!draft) return;
      const result = await masterRequest("/api/v1/journals/preview", journalPreviewSchema, {
        method: "POST",
        body: { company: company.code, draft },
      });
      if (alive.current) setPlan({ ...result, key: crypto.randomUUID(), command: "POST" });
    });
  const confirm = (command: "POST" | "QUEUE") =>
    run(async () => {
      if (!plan || dirty || (uncertain && command !== plan.command)) return;
      const request = {
        company: company.code,
        draftId: plan.plan.draftId,
        revision: plan.plan.draftRevision,
        fingerprint: plan.fingerprint,
        idempotencyKey: plan.key,
        confirmation: command,
      };
      setPlan({ ...plan, command });
      try {
        const result =
          command === "QUEUE"
            ? await masterRequest("/api/v1/transfer-queue", businessResultSchema, {
                method: "POST",
                body: request,
              })
            : await masterRequest("/api/v1/journals/confirm", journalReceiptSchema, {
                method: "POST",
                body: request,
              });
        if (alive.current) {
          edit(null);
          if ("event" in result) {
            setQueued(result);
            setReceipt(null);
            void client.invalidateQueries({ queryKey: ["business", company.code] });
          } else {
            setReceipt(result);
            setQueued(null);
            setStatus("posted");
          }
          setDetail(null);
          void client.invalidateQueries({ queryKey: ["journals", company.code] });
        }
      } catch (error) {
        if (alive.current) {
          const rejected =
            error instanceof MasterDataFailure &&
            error.kind === "http" &&
            error.status !== undefined &&
            error.status < 500;
          if (rejected) {
            setPlan(null);
            setUncertain(false);
          } else setUncertain(true);
        }
        throw error;
      }
    });
  function change(patch: Partial<JournalDraftDto>) {
    if (draft) {
      setDraft({ ...draft, ...patch });
      setDirty(true);
      setNotice(null);
      setError(undefined);
    }
  }
  function addLine() {
    if (draft && draft.lines.length < 500) {
      lineKeys.current.push(crypto.randomUUID());
      focusLine.current = draft.lines.length;
      change({ lines: [...draft.lines, emptyLine()] });
    }
  }
  function rowKey(event: KeyboardEvent<HTMLTableRowElement>, index: number) {
    if (
      !(event.target instanceof HTMLInputElement) ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    )
      return;
    const last = index === (draft?.lines.length ?? 0) - 1;
    if (
      event.key === "Enter" ||
      (event.key === "Tab" &&
        last &&
        event.target === Array.from(event.currentTarget.querySelectorAll("input")).at(-1))
    ) {
      event.preventDefault();
      if (last) addLine();
      else form.current?.querySelector<HTMLInputElement>(`[data-account="${index + 1}"]`)?.focus();
    }
  }
  function correction(operation: "reverse" | "replace" | "reclassify") {
    if (!detail) return;
    const original = detail.entry;
    if (original.kind === "closing") return;
    const decimal = (n: number) => {
      const digits = String(n).padStart(company.scale + 1, "0");
      return company.scale
        ? `${digits.slice(0, -company.scale)}.${digits.slice(-company.scale)}`
        : digits;
    };
    edit({
      ...fresh(),
      operation,
      originalId: original.id,
      kind: original.kind,
      lines:
        operation === "reverse"
          ? []
          : original.lines
              .filter((line) => line.role === "business")
              .map((line) => ({
                account: line.account,
                debit: decimal(line.debit),
                credit: decimal(line.credit),
                dimensions: line.dimensions,
                suspense: line.suspense,
              })),
    });
  }
  return (
    <>
      <div className="toolbar-row">
        <button
          type="button"
          className={`btn ${draft ? "btn-secondary" : "btn-primary"}`}
          disabled={Boolean(draft) || busy}
          onClick={() => {
            edit(fresh());
            setReceipt(null);
            setQueued(null);
            setDetail(null);
          }}
        >
          {t("journal.new")}
        </button>
        <label className="jv-status">
          {t("journal.title")}{" "}
          <select
            className="jv-select"
            aria-label={t("journal.title")}
            disabled={busy}
            value={status}
            onChange={(event) => setStatus(event.target.value === "draft" ? "draft" : "posted")}
          >
            <option value="draft">{t("journal.drafts")}</option>
            <option value="posted">{t("journal.posted")}</option>
          </select>
        </label>
        <button
          type="button"
          className="btn btn-subtle"
          disabled={busy}
          onClick={() => void listing.refetch()}
        >
          {t("master.retry")}
        </button>
      </div>
      {listing.isPending && <p role="status">{t("master.loading")}</p>}
      {listing.isError && (
        <MessageBar tone="danger" role="alert">
          {t("journal.error")}
        </MessageBar>
      )}
      <div className="card jv-list">
        <VirtualRows
          items={rows}
          title={t("journal.title")}
          header={[
            t("journal.date"),
            t("journal.sourceRef"),
            t("journal.memo"),
            t("journal.actions"),
          ]}
          render={(row) => {
            const action = t(row.revision === null ? "journal.view" : "journal.edit");
            return (
              <>
                <td>{row.date}</td>
                <td>{row.sourceRef}</td>
                <td>{row.memo}</td>
                <td>
                  {/* The source reference is already in its own column and can be 100 chars; keep it only in the accessible name. */}
                  <button
                    type="button"
                    className="btn btn-subtle btn-sm"
                    aria-label={`${action} ${row.sourceRef || row.id}`}
                    disabled={busy || Boolean(draft)}
                    onClick={() =>
                      void run(async () => {
                        detailRequest.current?.abort();
                        if (row.revision !== null) {
                          const value = await masterRequest(
                            `/api/v1/journals/drafts/${row.id}?${url(company.code)}`,
                            journalDraftSchema,
                          );
                          if (alive.current) {
                            edit(value);
                            setDetail(null);
                          }
                        } else {
                          await loadDetail(row.id, true);
                        }
                      })
                    }
                  >
                    {action}
                  </button>
                </td>
              </>
            );
          }}
        />
        {!listing.isPending && !listing.isError && !rows.length && (
          <p className="empty-state">{t("journal.empty")}</p>
        )}
      </div>
      {listing.hasNextPage && (
        <button
          type="button"
          className="btn btn-secondary jv-more"
          disabled={listing.isFetchingNextPage}
          onClick={() => void listing.fetchNextPage()}
        >
          {t("master.loadMore")}
        </button>
      )}
      {error !== undefined && !plan && !deleting && (
        <JournalError error={error} t={t} uncertain={uncertain} />
      )}
      {busy && <p role="status">{t("journal.pending")}</p>}
      {notice && (
        <MessageBar tone="info" role="status">
          {t("journal.saved")}
        </MessageBar>
      )}
      {draft && (
        <form
          className="jv-editor"
          ref={form}
          onSubmit={(event) => event.preventDefault()}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
              event.preventDefault();
              if (!plan && !busy) void preview();
            }
          }}
        >
          <fieldset disabled={busy || Boolean(plan) || deleting}>
            <legend className="jv-legend">
              {t(`journal.${draft.operation === "journal" ? "editor" : draft.operation}`)}
            </legend>
            {draft.originalId && (
              <MessageBar tone="info">
                {t("journal.original")}: {draft.originalId} — {t("journal.correctionDate")}
              </MessageBar>
            )}
            <FastTab
              id="journal-general"
              title={t("journal.tabGeneral")}
              summary={[draft.sourceRef, draft.date].filter(Boolean).join(" · ")}
            >
              <div className="ui-form-grid">
                <label className="ui-field">
                  <span className="label">{t("journal.sourceRef")}</span>
                  <input
                    value={draft.sourceRef}
                    maxLength={100}
                    onChange={(event) => change({ sourceRef: event.target.value })}
                  />
                </label>
                <label className="ui-field">
                  <span className="label">{t("journal.date")}</span>
                  <input
                    type="date"
                    value={draft.date}
                    onChange={(event) => change({ date: event.target.value })}
                  />
                </label>
                <label className="ui-field ui-span-2">
                  <span className="label">{t("journal.memo")}</span>
                  <input
                    value={draft.memo}
                    maxLength={200}
                    onChange={(event) => change({ memo: event.target.value })}
                  />
                </label>
                {(["documentDate", "taxDate"] as const).map((field) => (
                  <label key={field} className="ui-field">
                    <span className="label">{t(`journal.${field}`)}</span>
                    <input
                      type="date"
                      value={draft[field] ?? ""}
                      onChange={(event) => change({ [field]: event.target.value || undefined })}
                    />
                  </label>
                ))}
                <label className="ui-field">
                  <span className="label">{t("journal.kind")}</span>
                  <select
                    disabled={draft.operation === "reverse" || draft.operation === "reclassify"}
                    value={draft.kind}
                    onChange={(event) =>
                      change({ kind: event.target.value === "adjusting" ? "adjusting" : "normal" })
                    }
                  >
                    <option value="normal">{t("journal.normal")}</option>
                    <option value="adjusting">{t("journal.adjusting")}</option>
                  </select>
                </label>
              </div>
              {draft.operation !== "reverse" && (
                <>
                  <p className="jv-hint">{t("journal.dimensionHelp")}</p>
                  <DimensionFields
                    keys={dimensionKeys}
                    value={draft.headerDimensions}
                    title={t("journal.header")}
                    change={(value) => change({ headerDimensions: value })}
                  />
                  {dimensions.isError && (
                    <MessageBar tone="danger" role="alert">
                      {t("journal.error")}{" "}
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => void dimensions.refetch()}
                      >
                        {t("master.retry")}
                      </button>
                    </MessageBar>
                  )}
                  {dimensions.hasNextPage && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => void dimensions.fetchNextPage()}
                    >
                      {t("master.loadMore")} {t("journal.dimensions")}
                    </button>
                  )}
                </>
              )}
            </FastTab>
            {draft.operation !== "reverse" && (
              <FastTab
                id="journal-lines"
                title={t("journal.tabLines")}
                summary={
                  totals.balanced ? undefined : (
                    <Badge tone="warning">{t("journal.unbalanced")}</Badge>
                  )
                }
              >
                <datalist id={`journal-accounts-${company.code}`}>
                  {accountItems
                    .filter((account) => account.active && account.manualAllowed)
                    .map((account) => (
                      <option key={account.code} value={account.code}>
                        {account.name}
                      </option>
                    ))}
                </datalist>
                {accounts.isError && (
                  <MessageBar tone="danger" role="alert">
                    {t("journal.error")}{" "}
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => void accounts.refetch()}
                    >
                      {t("master.retry")}
                    </button>
                  </MessageBar>
                )}
                {accounts.hasNextPage && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => void accounts.fetchNextPage()}
                  >
                    {t("master.loadMore")} {t("journal.account")}
                  </button>
                )}
                <div className="grid-wrap jv-lines">
                  <table className="grid" aria-label={t("journal.drafts")}>
                    <thead>
                      <tr>
                        {(
                          [
                            "journal.line",
                            "journal.account",
                            "journal.debit",
                            "journal.credit",
                            "journal.dimensions",
                          ] as const
                        ).map((key) => (
                          <th
                            key={key}
                            scope="col"
                            className={
                              key === "journal.debit" || key === "journal.credit"
                                ? "num"
                                : undefined
                            }
                          >
                            {t(key)}
                          </th>
                        ))}
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {draft.lines.map((line, index) => {
                        const patch = (value: Partial<typeof line>) =>
                          change({
                            lines: draft.lines.map((item, i) =>
                              i === index ? { ...item, ...value } : item,
                            ),
                          });
                        const suspense =
                          accountItems.find((account) => account.code === line.account)?.purpose ===
                            "suspense" ||
                          line.suspense !== null ||
                          (error instanceof MasterDataFailure &&
                            error.detail?.fieldErrors.some(
                              (issue) =>
                                issue.path.startsWith(`lines.${index}.suspense`) &&
                                issue.messageKey === "api.error.journals.suspense",
                            ));
                        return (
                          <tr
                            key={lineKeys.current[index]}
                            onKeyDown={(event) => rowKey(event, index)}
                          >
                            <th scope="row">{index + 1}</th>
                            <td>
                              <input
                                data-account={index}
                                aria-label={`${t("journal.line")} ${index + 1} ${t("journal.account")}`}
                                list={`journal-accounts-${company.code}`}
                                value={line.account}
                                onChange={(event) => patch({ account: event.target.value })}
                              />
                            </td>
                            <td>
                              <input
                                aria-label={`${t("journal.line")} ${index + 1} ${t("journal.debit")}`}
                                inputMode="decimal"
                                value={line.debit}
                                onChange={(event) => patch({ debit: event.target.value })}
                              />
                            </td>
                            <td>
                              <input
                                aria-label={`${t("journal.line")} ${index + 1} ${t("journal.credit")}`}
                                inputMode="decimal"
                                value={line.credit}
                                onChange={(event) => patch({ credit: event.target.value })}
                              />
                            </td>
                            <td>
                              <DimensionFields
                                keys={dimensionKeys}
                                value={line.dimensions}
                                title={`${t("journal.line")} ${index + 1}`}
                                change={(value) => patch({ dimensions: value })}
                              />
                              {suspense && (
                                <fieldset>
                                  <legend className="jv-legend">
                                    {t("journal.rule.suspense")}
                                  </legend>
                                  {(["owner", "reason", "reviewDate"] as const).map((field) => (
                                    <label key={field}>
                                      {t(`journal.${field}`)}
                                      <input
                                        type={field === "reviewDate" ? "date" : "text"}
                                        value={line.suspense?.[field] ?? ""}
                                        onChange={(event) =>
                                          patch({
                                            suspense: {
                                              owner: "",
                                              reason: "",
                                              reviewDate: "",
                                              ...line.suspense,
                                              [field]: event.target.value,
                                            },
                                          })
                                        }
                                      />
                                    </label>
                                  ))}
                                </fieldset>
                              )}
                            </td>
                            <td>
                              <button
                                type="button"
                                className="btn btn-subtle btn-sm"
                                onClick={() => {
                                  lineKeys.current.splice(index, 1);
                                  change({ lines: draft.lines.filter((_, i) => i !== index) });
                                }}
                              >
                                {t("journal.remove")} {index + 1}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th scope="row" colSpan={2}>
                          {t("journal.total")}
                        </th>
                        <td className="num">{totals.debit}</td>
                        <td className="num">{totals.credit}</td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary jv-add"
                  disabled={draft.lines.length >= 500}
                  onClick={addLine}
                >
                  {t("journal.add")}
                </button>
              </FastTab>
            )}
            <div className="ui-form-actions jv-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() =>
                  void run(async () => {
                    await save();
                    if (alive.current) setNotice("saved");
                  })
                }
              >
                {t("journal.save")}
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void preview()}>
                {t("journal.preview")}
              </button>
              {draft.revision > 0 && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={(event) => {
                    returnFocus.current = event.currentTarget;
                    setDeleting(true);
                  }}
                >
                  {t("journal.delete")}
                </button>
              )}
              <button type="button" className="btn btn-subtle" onClick={() => edit(null)}>
                {t("journal.cancel")}
              </button>
              {error !== undefined && (
                <>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => edit({ ...draft, id: crypto.randomUUID(), revision: 0 })}
                  >
                    {t("journal.copy")}
                  </button>
                  {draft.revision > 0 && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() =>
                        void run(async () => {
                          const saved = await masterRequest(
                            `/api/v1/journals/drafts/${draft.id}?${url(company.code)}`,
                            journalDraftSchema,
                          );
                          if (alive.current) edit(saved);
                        })
                      }
                    >
                      {t("journal.reload")}
                    </button>
                  )}
                </>
              )}
            </div>
          </fieldset>
        </form>
      )}
      {draft?.operation === "journal" && !plan && !deleting && (
        <AiPanel
          key={`${draft.id}:${draft.date.slice(0, 7)}`}
          company={company.code}
          month={draft.date.slice(0, 7)}
          language={language}
          teaching={teaching}
          disabled={busy}
          adopt={(value) => {
            edit(value);
            setDetail(null);
            setReceipt(null);
            setQueued(null);
          }}
        />
      )}
      {deleting && draft && (
        <Modal title={t("journal.deleteTitle")} busy={busy} close={() => setDeleting(false)}>
          <p>{draft.sourceRef || draft.id}</p>
          <div className="ui-form-actions">
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await masterRequest(`/api/v1/journals/drafts/${draft.id}`, journalDeletedSchema, {
                    method: "DELETE",
                    body: { company: company.code, revision: draft.revision },
                  });
                  if (alive.current) {
                    setDeleting(false);
                    edit(null);
                    void client.invalidateQueries({ queryKey: ["journals", company.code] });
                  }
                })
              }
            >
              {t("journal.deleteConfirm")}
            </button>
            <button
              type="button"
              className="btn btn-subtle"
              disabled={busy}
              onClick={() => setDeleting(false)}
            >
              {t("journal.back")}
            </button>
          </div>
          {error !== undefined && <JournalError error={error} t={t} uncertain={false} />}
        </Modal>
      )}
      {plan && (
        <Modal
          title={t("journal.previewTitle")}
          busy={busy || uncertain}
          close={() => setPlan(null)}
        >
          <Facts
            items={[
              [t("journal.sourceRef"), plan.plan.sourceRef],
              [t("journal.date"), plan.plan.date],
              [t("journal.currency"), plan.plan.currency],
              [t("journal.memo"), plan.plan.memo],
              [t("journal.documentDate"), plan.plan.documentDate],
              [t("journal.taxDate"), plan.plan.taxDate],
            ]}
          />
          <div className="kpis">
            {(["debit", "credit"] as const).map((side) => (
              <div key={side} className="kpi emphasis">
                <div className="label">{t(`journal.${side}`)}</div>
                <p className="value">
                  {formatMinor(
                    plan.plan.journals.reduce((sum, journal) => sum + journal[side], 0),
                    language,
                    company.scale,
                  )}
                </p>
              </div>
            ))}
          </div>
          {dirty && (
            <MessageBar tone="info" role="status">
              {t("journal.unsaved")}
            </MessageBar>
          )}
          {plan.plan.journals.map((journal, index) => (
            <section key={journal.role}>
              <h4>
                {index + 1} ·{" "}
                {t(
                  journal.role === "reversal"
                    ? "journal.historical"
                    : journal.role === "reclassification"
                      ? "journal.reclassify"
                      : "journal.business",
                )}
              </h4>
              <LinePlan
                lines={journal.lines}
                company={company}
                language={language}
                t={t}
                total={journal}
              />
            </section>
          ))}
          {error !== undefined && <JournalError error={error} t={t} uncertain={uncertain} />}
          <div className="ui-form-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || dirty || (uncertain && plan.command !== "POST")}
              onClick={() => void confirm("POST")}
            >
              {t("journal.confirm")}
            </button>
            {draft?.operation === "journal" && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy || dirty || (uncertain && plan.command !== "QUEUE")}
                onClick={() => void confirm("QUEUE")}
              >
                {t("business.enqueue")}
              </button>
            )}
            <button
              type="button"
              className="btn btn-subtle"
              disabled={busy || uncertain}
              onClick={() => setPlan(null)}
            >
              {t("journal.back")}
            </button>
          </div>
        </Modal>
      )}
      {queued && (
        <MessageBar tone="info">
          <span role="status">{t("business.enqueued")}</span>{" "}
          <Link
            to={`/events?company=${encodeURIComponent(company.code)}&id=${queued.event.id}&view=queue`}
          >
            {t("business.queue")}
          </Link>
        </MessageBar>
      )}
      {receipt && (
        <section className="card" aria-label={t("journal.posted")}>
          <div className="body">
            <MessageBar tone="info" role="status">
              {t("journal.postedNotice")}
            </MessageBar>
            <p>
              {receipt.sourceRef} · {receipt.postedAt}
            </p>
            <div className="ui-form-actions">
              {receipt.journalIds.map((id) => (
                <button
                  type="button"
                  className="btn btn-secondary"
                  key={id}
                  disabled={busy || Boolean(draft)}
                  onClick={() => void run(() => loadDetail(id))}
                >
                  {t("journal.view")} {id}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}
      {detail && (
        <section className="card jv-detail">
          <header>
            <h3>
              {detail.entry.sourceRef} · {detail.entry.date}
            </h3>
          </header>
          <div className="body">
            <p>{detail.entry.memo}</p>
            {detail.entry.module && (
              <p>
                {t("journal.module")}: {detail.entry.module}
              </p>
            )}
            <p>
              {t("journal.documentDate")}: {detail.entry.documentDate} · {t("journal.taxDate")}:{" "}
              {detail.entry.taxDate}
            </p>
            <LinePlan lines={detail.entry.lines} company={company} language={language} t={t} />
            <div className="ui-form-actions">
              {detail.entry.kind === "closing" && (
                <Link
                  to={`/period-close?${new URLSearchParams({ company: company.code, month: detail.entry.date.slice(0, 7) })}`}
                >
                  {t("close.title")}
                </Link>
              )}
              {detail.businessEventId && (
                <Link
                  to={`/events?company=${encodeURIComponent(company.code)}&id=${detail.businessEventId}`}
                >
                  {t("business.original")}
                </Link>
              )}
              {!detail.businessEventId &&
                !detail.entry.module &&
                detail.entry.kind !== "closing" &&
                detail.entry.role !== "reversal" &&
                (["reverse", "replace", "reclassify"] as const)
                  .filter(
                    (action) => detail.entry.role !== "reclassification" || action === "reverse",
                  )
                  .map((action) => (
                    <button
                      key={action}
                      type="button"
                      className="btn btn-secondary"
                      disabled={busy || Boolean(draft)}
                      onClick={() => correction(action)}
                    >
                      {t(`journal.${action}`)}
                    </button>
                  ))}
            </div>
            <h4>{t("journal.chain")}</h4>
            {detail.chain.map((edge) => (
              <p key={edge.outputId}>
                {edge.date} · {t(`journal.${edge.operation}`)} ·{" "}
                <button
                  type="button"
                  className="btn btn-subtle btn-sm"
                  disabled={busy || Boolean(draft)}
                  onClick={() => void run(() => loadDetail(edge.outputId))}
                >
                  {edge.outputId}
                </button>
              </p>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
export function DimensionFields({
  keys,
  value,
  title,
  change,
}: {
  keys: string[];
  value: Record<string, string | null>;
  title: string;
  change: (value: Record<string, string | null>) => void;
}) {
  return (
    <div className="journal-dimensions">
      {keys.map((key) => (
        <label key={key} className="ui-field">
          <span className="label">
            {title} {key}
          </span>
          <input
            value={value[key] === null ? "-" : (value[key] ?? "")}
            onChange={(event) => {
              const next = { ...value };
              if (event.target.value === "") delete next[key];
              else next[key] = event.target.value === "-" ? null : event.target.value;
              change(next);
            }}
          />
        </label>
      ))}
    </div>
  );
}
export function Modal({
  title,
  children,
  busy,
  close,
}: {
  title: string;
  children: ReactNode;
  busy: boolean;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    dialog.focus();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
      ref={ref}
      className="journal-dialog"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) close();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          if (!busy) close();
        }
        if (event.key === "Tab") {
          const nodes = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>(
              "button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex='0']",
            ),
          );
          const first = nodes[0],
            last = nodes.at(-1);
          if (!first) {
            event.preventDefault();
            return;
          }
          if (
            event.shiftKey &&
            (document.activeElement === first || document.activeElement === ref.current)
          ) {
            event.preventDefault();
            last?.focus();
          } else if (
            !event.shiftKey &&
            (document.activeElement === last || document.activeElement === ref.current)
          ) {
            event.preventDefault();
            first.focus();
          }
        }
      }}
    >
      <h3>{title}</h3>
      {children}
    </dialog>
  );
}
export function JournalError({
  error,
  t,
  uncertain,
}: {
  error: unknown;
  t: T;
  uncertain: boolean;
}) {
  const issue = error instanceof MasterDataFailure ? error.detail?.fieldErrors[0] : undefined;
  const rule = issue?.messageKey.split(".").at(-1);
  const rules = [
    "shape",
    "money",
    "balance",
    "balanceAccount",
    "dimensionLimit",
    "account",
    "manual",
    "suspense",
    "period",
    "source",
    "correction",
    "amount",
    "businessSource",
  ] as const;
  const key = rules.find((value) => value === rule);
  const fields = [
    ["account", "journal.account"],
    ["debit", "journal.debit"],
    ["credit", "journal.credit"],
    ["dimensions", "journal.dimensions"],
    ["date", "journal.date"],
    ["documentDate", "journal.documentDate"],
    ["taxDate", "journal.taxDate"],
    ["sourceRef", "journal.sourceRef"],
    ["owner", "journal.owner"],
    ["reason", "journal.reason"],
    ["reviewDate", "journal.reviewDate"],
    ["balance", "journal.balance"],
  ] as const;
  const message = uncertain
    ? t("journal.network")
    : rule === "stale" || (error instanceof MasterDataFailure && error.status === 409 && !issue)
      ? t("journal.stale")
      : issue?.messageKey.startsWith("api.error.dimensions.")
        ? t("journal.rule.dimensions")
        : key
          ? t(`journal.rule.${key}`)
          : error instanceof MasterDataFailure && error.status === 400
            ? t("journal.invalid")
            : t("journal.error");
  return (
    <MessageBar tone="danger" role="alert">
      {message}
      {issue && (
        <span>
          {" "}
          ·{" "}
          {issue.path
            .replace(
              /^lines\.(\d+)/u,
              (_, value: string) => `${t("journal.line")} ${Number(value) + 1}`,
            )
            .split(".")
            .map((part) => {
              const field = fields.find(([name]) => name === part);
              return field ? t(field[1]) : part;
            })
            .join(" · ")}
        </span>
      )}
    </MessageBar>
  );
}
export function Facts({ items }: { items: readonly (readonly [string, ReactNode])[] }) {
  return (
    <dl className="jv-facts">
      {items.map(([name, value]) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd>{value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
export function LinePlan({
  lines,
  company,
  language,
  t,
  total,
}: {
  lines: JournalEntryDto["lines"];
  company: CompanyDto;
  language: Language;
  t: T;
  total?: { debit: number; credit: number };
}) {
  const [selected, setSelected] = useState<number | null>(null);
  return (
    <>
      <div className="card jv-plan">
        <VirtualRows
          className="jv-rows"
          items={lines}
          title={t("journal.previewTitle")}
          header={[
            t("journal.account"),
            t("journal.debit"),
            t("journal.credit"),
            t("journal.dimensions"),
            "",
          ]}
          footer={
            total && (
              <tr>
                <th scope="row">{t("journal.total")}</th>
                <td className="num">{formatMinor(total.debit, language, company.scale)}</td>
                <td className="num">{formatMinor(total.credit, language, company.scale)}</td>
                <td colSpan={2} />
              </tr>
            )
          }
          render={(line, index) => (
            <>
              <td>
                {line.account} · {t(`journal.${line.role}`)}
              </td>
              <td className="num">{formatMinor(line.debit, language, company.scale)}</td>
              <td className="num">{formatMinor(line.credit, language, company.scale)}</td>
              <td>
                {Object.entries(line.dimensions)
                  .map(([key, value]) => `${key}=${value ?? "-"}`)
                  .join(" · ")}
              </td>
              <td>
                <button
                  type="button"
                  className="btn btn-subtle btn-sm"
                  onClick={() => setSelected(index)}
                >
                  {t("journal.details")} {index + 1}
                </button>
              </td>
            </>
          )}
        />
      </div>
      {selected !== null && lines[selected] && (
        <aside aria-label={t("journal.details")}>
          <h4>
            {t("journal.line")} {selected + 1}
          </h4>
          {Object.entries(lines[selected].dimensionOrigins).map(([key, origins]) => (
            <p key={key}>
              {key}:{" "}
              {origins.map((origin) => `${origin.source} → ${origin.value ?? "-"}`).join(" · ")}
            </p>
          ))}
          {lines[selected].historical && (
            <p>
              {t("journal.historical")}: {lines[selected].historical.entryId} /{" "}
              {lines[selected].historical.lineNo}
            </p>
          )}
          {lines[selected].balancing && (
            <p>
              {t("journal.balance")}: {lines[selected].balancing.dimension}=
              {lines[selected].balancing.value} ·{" "}
              {formatMinor(lines[selected].balancing.businessNet, language, company.scale)}
            </p>
          )}
        </aside>
      )}
    </>
  );
}
export function VirtualRows<T>({
  items,
  title,
  header,
  render,
  footer,
  forceVirtual = false,
  className,
}: {
  items: readonly T[];
  title: string;
  header: readonly string[];
  render: (item: T, index: number) => ReactNode;
  footer?: ReactNode;
  forceVirtual?: boolean;
  className?: string;
}) {
  const scroll = useRef<HTMLElement>(null),
    virtual = forceVirtual || items.length > 100;
  const rows = useVirtualizer({
    count: virtual ? items.length : 0,
    getScrollElement: () => scroll.current,
    estimateSize: () => 44,
    overscan: 5,
  });
  const visible = virtual
    ? rows
        .getVirtualItems()
        .map((item) => ({ index: item.index, start: item.start, end: item.end }))
    : items.map((_, index) => ({ index, start: index * 44, end: (index + 1) * 44 }));
  return (
    <section
      className={className ? `journal-scroll ${className}` : "journal-scroll"}
      aria-label={title}
      ref={scroll}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: Named virtual tables are keyboard scroll regions.
      tabIndex={0}
    >
      <table aria-label={title} aria-rowcount={items.length + (footer ? 2 : 1)}>
        <thead>
          <tr>
            {header.map((name) => (
              <th key={name} scope="col">
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {virtual && (
            <tr aria-hidden="true" tabIndex={-1}>
              <td
                className="journal-spacer"
                colSpan={header.length}
                style={{ height: visible[0]?.start ?? 0, padding: 0 }}
              />
            </tr>
          )}
          {visible.map(({ index }) => (
            <tr key={index} className="journal-row" aria-rowindex={index + 2}>
              {render(items[index], index)}
            </tr>
          ))}
          {virtual && (
            <tr aria-hidden="true" tabIndex={-1}>
              <td
                className="journal-spacer"
                colSpan={header.length}
                style={{ height: rows.getTotalSize() - (visible.at(-1)?.end ?? 0), padding: 0 }}
              />
            </tr>
          )}
        </tbody>
        {footer && <tfoot>{footer}</tfoot>}
      </table>
    </section>
  );
}
