import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import {
  companiesPageSchema,
  openItemPageSchema,
  tradeActionCommandSchema,
  tradeActionConfirmSchema,
  tradeActionPreviewSchema,
  tradeActionReceiptSchema,
  type CompanyDto,
  type TradeActionCommandDto,
  type TradeActionPreviewDto,
  type TradeActionReceiptDto,
} from "@erp/core/contracts";
import { masterRequest, MasterDataFailure } from "./master-data-client.ts";
import { formatMinor } from "./reports-data.ts";
import { label, type Preferences } from "./ui/index.ts";
import { adjustmentTeaching } from "./ui/trade-adjustment-teaching.ts";
import { useInvoiceLeaveGuard } from "./TradeInvoices.tsx";
import { FastTab, MessageBar, PageHeader, TeachingTip } from "./ui/components/index.tsx";
import "./pages/trade-settlements.css";

type Key = Exclude<Parameters<typeof label>[1], "shell.httpError">;

type Pending = ReturnType<typeof tradeActionConfirmSchema.parse>;
type Draft = {
  kind: TradeActionCommandDto["kind"];
  actionId: string;
  side: "AP" | "AR";
  party: string;
  accountingDate: string;
  documentDate: string;
  taxDate: string;
  gross: string;
  sourceId: string;
  targetId: string;
  relatedRevision: string;
  settlementId: string;
  reason: string;
  lines: { id: string; sourceLineId: string; quantity: string }[];
  items: string[];
};
type Saved = { draft: Draft; pending: Pending | null };
function empty(): Draft {
  const day = new Date().toISOString().slice(0, 10);
  return {
    kind: "advance",
    actionId: crypto.randomUUID(),
    side: "AP",
    party: "",
    accountingDate: day,
    documentDate: day,
    taxDate: day,
    gross: "",
    sourceId: "",
    targetId: "",
    relatedRevision: "",
    settlementId: "",
    reason: "",
    lines: [{ id: crypto.randomUUID(), sourceLineId: "", quantity: "" }],
    items: [],
  };
}
const key = (company: string) => `erp.tradeActions.v1.${company}`;
const partyCode = /^[A-Z0-9][A-Z0-9_.:-]{0,59}$/u;
function restore(company: string): { saved: Saved; failed: boolean } {
  const fallback: Saved = { draft: empty(), pending: null };
  try {
    const raw = sessionStorage.getItem(key(company));
    if (!raw) return { saved: fallback, failed: false };
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || !("draft" in value) || !("pending" in value))
      throw new Error("Invalid trade draft");
    const draft = value.draft;
    if (!draft || typeof draft !== "object" || Array.isArray(draft))
      throw new Error("Invalid trade draft");
    const scalar = Object.entries(fallback.draft)
      .filter(([, value]) => typeof value === "string")
      .map(([key]) => key);
    if (
      Object.keys(draft).length !== Object.keys(fallback.draft).length ||
      scalar.some((key) => !(key in draft) || typeof Reflect.get(draft, key) !== "string") ||
      !("kind" in draft) ||
      !["advance", "credit", "apply", "cancel", "reverse"].includes(String(draft.kind)) ||
      !("side" in draft) ||
      !["AP", "AR"].includes(String(draft.side)) ||
      !("items" in draft) ||
      !Array.isArray(draft.items) ||
      draft.items.length > 100 ||
      draft.items.some((id: unknown) => typeof id !== "string") ||
      !("lines" in draft) ||
      !Array.isArray(draft.lines) ||
      draft.lines.length > 100 ||
      draft.lines.some(
        (line: unknown) =>
          !line ||
          typeof line !== "object" ||
          !("id" in line) ||
          typeof line.id !== "string" ||
          !("sourceLineId" in line) ||
          typeof line.sourceLineId !== "string" ||
          !("quantity" in line) ||
          typeof line.quantity !== "string",
      )
    )
      throw new Error("Invalid trade draft");
    const pending = value.pending === null ? null : tradeActionConfirmSchema.parse(value.pending);
    if (
      pending &&
      (pending.command.company !== company ||
        pending.command.actionId !== Reflect.get(draft, "actionId") ||
        pending.command.kind !== draft.kind ||
        pending.command.accountingDate !== Reflect.get(draft, "accountingDate") ||
        pending.command.documentDate !== Reflect.get(draft, "documentDate") ||
        pending.command.taxDate !== Reflect.get(draft, "taxDate"))
    )
      throw new Error("Invalid pending trade command");
    return { saved: { draft: draft as Draft, pending }, failed: false };
  } catch {
    return { saved: fallback, failed: true };
  }
}
export function TradeAdjustments({ preferences }: { preferences: Preferences }) {
  const t = (key: Exclude<Parameters<typeof label>[1], "shell.httpError">) =>
    label(preferences.language, key);
  const [selected, setSelected] = useState("");
  const [guard, setGuard] = useState({ busy: false, unsaved: false });
  useInvoiceLeaveGuard(guard);
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
  const rows = companies.data?.pages.flatMap((page) => page.items) ?? [];
  const company = rows.find((row) => row.code === (selected || rows[0]?.code));
  return (
    <section className="page trade-adjustments">
      <PageHeader
        title={t("tadj.title")}
        description={t("tadj.description")}
        context={
          <>
            <div className="field">
              <label htmlFor="tadj-company">{t("master.company")}</label>
              <select
                id="tadj-company"
                value={company?.code ?? ""}
                disabled={guard.busy || guard.unsaved}
                onChange={(e) => setSelected(e.target.value)}
              >
                {rows.map((row) => (
                  <option key={row.code} value={row.code}>
                    {row.code} · {row.name}
                  </option>
                ))}
              </select>
            </div>
            {companies.hasNextPage && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void companies.fetchNextPage()}
              >
                {t("master.loadMore")}
              </button>
            )}
          </>
        }
      />
      <MessageBar tone="info">{t("tadj.boundary")}</MessageBar>
      {companies.isError && (
        <MessageBar tone="danger" role="alert">
          {t("master.error")}
        </MessageBar>
      )}
      {company && (
        <ActionEntry
          key={company.code}
          company={company}
          preferences={preferences}
          onGuard={setGuard}
        />
      )}
    </section>
  );
}
function ActionEntry({
  company,
  preferences,
  onGuard,
}: {
  company: CompanyDto;
  preferences: Preferences;
  onGuard: (guard: { busy: boolean; unsaved: boolean }) => void;
}) {
  const t = (key: Exclude<Parameters<typeof label>[1], "shell.httpError">) =>
    label(preferences.language, key);
  const money = (minor: number) => formatMinor(minor, preferences.language, company.scale);
  const head = (keys: Key[]) => (
    <thead>
      <tr>
        {keys.map((key) => (
          <th key={key}>{t(key)}</th>
        ))}
      </tr>
    </thead>
  );
  const [loaded] = useState(() => restore(company.code));
  const [saved, setSaved] = useState(loaded.saved);
  const [storageFailed, setStorageFailed] = useState(loaded.failed);
  const [preview, setPreview] = useState<TradeActionPreviewDto | null>(null);
  const [receipt, setReceipt] = useState<TradeActionReceiptDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0),
    running = useRef(false);
  const draft = saved.draft;
  const locked = busy || saved.pending !== null || storageFailed;
  useEffect(
    () => () => {
      sequence.current++;
    },
    [],
  );
  useEffect(() => {
    if (storageFailed) return;
    try {
      sessionStorage.setItem(key(company.code), JSON.stringify(saved));
    } catch {
      setStorageFailed(true);
    }
  }, [company.code, saved, storageFailed]);
  useEffect(() => {
    onGuard({
      busy: busy || saved.pending !== null,
      unsaved: !!(
        draft.party ||
        draft.sourceId ||
        draft.settlementId ||
        draft.gross ||
        draft.reason ||
        draft.items.length ||
        draft.lines.some((line) => line.sourceLineId || line.quantity)
      ),
    });
  }, [busy, saved.pending, draft, onGuard]);
  const client = useQueryClient();
  const [partyFilter, setPartyFilter] = useState("");
  const [partyInput, setPartyInput] = useState("");
  const partyInvalid = partyInput.trim() !== "" && !partyCode.test(partyInput.trim());
  const page = useInfiniteQuery({
    queryKey: ["tradeActionItems", company.code, partyFilter],
    initialPageParam: "",
    refetchOnMount: "always",
    queryFn: ({ pageParam, signal }) =>
      masterRequest(
        `/api/v1/trade/open-items?company=${encodeURIComponent(company.code)}${partyFilter ? `&party=${encodeURIComponent(partyFilter)}` : ""}&limit=100${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        openItemPageSchema,
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows = page.data?.pages.flatMap((page) => page.items) ?? [];
  function change(patch: Partial<Draft>) {
    sequence.current++;
    setSaved({ draft: { ...draft, ...patch }, pending: null });
    setPreview(null);
    setReceipt(null);
    setError(null);
  }
  function applyPartyFilter() {
    const value = partyInput.trim();
    if (value !== "" && !partyCode.test(value)) return;
    setPartyInput(value);
    if (value === partyFilter) return;
    client.removeQueries({ queryKey: ["tradeActionItems", company.code] });
    setPartyFilter(value);
    change({ sourceId: "", targetId: "", items: [] });
  }
  function command(): TradeActionCommandDto {
    const common = {
      company: company.code,
      actionId: draft.actionId,
      kind: draft.kind,
      accountingDate: draft.accountingDate,
      documentDate: draft.documentDate,
      taxDate: draft.taxDate,
    };
    const source = rows.find((row) => row.itemId === draft.sourceId);
    const target = rows.find((row) => row.itemId === draft.targetId);
    switch (draft.kind) {
      case "advance":
        return tradeActionCommandSchema.parse({
          ...common,
          side: draft.side,
          party: draft.party,
          currency: company.currency,
          gross: Number(draft.gross),
          dimensions: {},
        });
      case "credit":
        return tradeActionCommandSchema.parse({
          ...common,
          invoiceId: draft.sourceId,
          revision: source?.revision,
          lines: draft.lines.map(({ sourceLineId, quantity }) => ({ sourceLineId, quantity })),
        });
      case "apply":
        return tradeActionCommandSchema.parse({
          ...common,
          sourceId: draft.sourceId,
          sourceRevision: source?.revision,
          targetId: draft.targetId,
          targetRevision: target?.revision,
          gross: Number(draft.gross),
        });
      case "cancel":
        return tradeActionCommandSchema.parse({
          ...common,
          itemId: draft.sourceId,
          revision: source?.revision,
          relatedRevision: draft.relatedRevision ? Number(draft.relatedRevision) : null,
          reason: draft.reason,
        });
      case "reverse":
        return tradeActionCommandSchema.parse({
          ...common,
          settlementId: draft.settlementId,
          items: draft.items.map((itemId) => ({
            itemId,
            revision: rows.find((row) => row.itemId === itemId)?.revision,
          })),
          reason: draft.reason,
        });
    }
  }
  function report(error: unknown) {
    const detail = error instanceof MasterDataFailure ? error.detail?.fieldErrors[0] : null;
    setError(
      detail ? `${t("master.error")} ${detail.path}: ${detail.messageKey}` : t("master.error"),
    );
  }
  async function run(confirm: boolean) {
    if (running.current || storageFailed || (!confirm && locked)) return;
    running.current = true;
    setBusy(true);
    setError(null);
    const version = ++sequence.current;
    try {
      if (!confirm) {
        const result = await masterRequest(
          "/api/v1/trade/actions/preview",
          tradeActionPreviewSchema,
          { method: "POST", body: command() },
        );
        if (sequence.current === version) setPreview(result);
        return;
      }
      if (!preview && !saved.pending) return;
      const pending =
        saved.pending ??
        tradeActionConfirmSchema.parse({
          command: command(),
          fingerprint: preview?.fingerprint,
          idempotencyKey: crypto.randomUUID(),
          confirmation: "POST",
        });
      const next = { ...saved, pending };
      try {
        const value = JSON.stringify(next);
        sessionStorage.setItem(key(company.code), value);
        if (sessionStorage.getItem(key(company.code)) !== value) {
          setStorageFailed(true);
          return;
        }
      } catch {
        setStorageFailed(true);
        return;
      }
      setSaved(next);
      const result = await masterRequest("/api/v1/trade/actions", tradeActionReceiptSchema, {
        method: "POST",
        body: pending,
      });
      if (sequence.current !== version) return;
      setReceipt(result);
      setPreview(null);
      setSaved({ draft: empty(), pending: null });
      await page.refetch();
    } catch (error) {
      if (sequence.current !== version) return;
      report(error);
      if (
        error instanceof MasterDataFailure &&
        error.kind === "http" &&
        (error.status ?? 500) < 500
      ) {
        setSaved((saved) => ({ ...saved, pending: null }));
        setPreview(null);
      }
    } finally {
      running.current = false;
      if (sequence.current === version) setBusy(false);
    }
  }
  const result = receipt ?? preview;
  const previewLines = useMemo(
    () =>
      preview?.journal.journals.flatMap((journal) =>
        journal.lines.map((line) => ({ id: crypto.randomUUID(), line })),
      ) ?? [],
    [preview],
  );
  const itemSelect = (field: "sourceId" | "targetId") => (
    <div className="ui-field">
      <label htmlFor={`tadj-${field}`}>
        {t(field === "sourceId" ? "tadj.source" : "tadj.target")}
      </label>
      <select
        id={`tadj-${field}`}
        value={draft[field]}
        onChange={(e) => change({ [field]: e.target.value })}
      >
        <option value="">{t("tadj.choose")}</option>
        {rows
          .filter(
            (row) =>
              row.status !== "cancelled" &&
              (field === "targetId" || draft.kind === "credit"
                ? row.kind === "invoice"
                : draft.kind !== "apply" || row.kind !== "invoice"),
          )
          .map((row) => (
            <option key={row.itemId} value={row.itemId}>
              {row.externalNo} · {row.party} · {t(`tadj.${row.kind}`)} · {money(row.remainingGross)}{" "}
              · v{row.revision}
            </option>
          ))}
      </select>
    </div>
  );
  const irreversible = draft.kind === "cancel" || draft.kind === "reverse";
  return (
    <div className="tadj-entry">
      <div className="tadj-command-bar">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={locked}
          onClick={() => void run(false)}
        >
          {t("tinv.preview")}
        </button>
        <button
          type="button"
          className={irreversible ? "btn btn-danger" : "btn btn-primary"}
          disabled={locked || !preview}
          onClick={() => void run(true)}
        >
          {t("tadj.confirm")}
        </button>
        <button
          type="button"
          className="btn btn-subtle"
          disabled={locked}
          onClick={() => {
            sequence.current++;
            setSaved({ draft: empty(), pending: null });
            setPreview(null);
            setReceipt(null);
            if (partyFilter) client.removeQueries({ queryKey: ["tradeActionItems", company.code] });
            setPartyFilter("");
            setPartyInput("");
          }}
        >
          {t("tadj.clear")}
        </button>
      </div>
      {[storageFailed && t("tinv.storageFailed"), page.isError && t("master.error"), error].map(
        (text) =>
          text && (
            <MessageBar key={text} tone="danger" role="alert">
              {text}
            </MessageBar>
          ),
      )}
      {saved.pending && (
        <MessageBar tone="warning" role="alert">
          <p>{t("tinv.uncertain")}</p>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy || storageFailed}
            onClick={() => void run(true)}
          >
            {t("tinv.retryConfirm")}
          </button>
        </MessageBar>
      )}
      {receipt && (
        <MessageBar tone="success" role="status">
          {t("tadj.posted")} {receipt.sourceRef} · {receipt.journalIds.join(", ")}
        </MessageBar>
      )}
      <TeachingTip teaching={preferences.teaching} title={t("master.teachingTitle")}>
        {adjustmentTeaching(preferences.language, t("tadj.teaching"))}
      </TeachingTip>
      <FastTab id="tadj-general" title={t("master.general")}>
        <fieldset disabled={locked} className="ui-form-grid">
          <div className="ui-field">
            <label htmlFor="tadj-kind">{t("tadj.kind")}</label>
            <select
              id="tadj-kind"
              value={draft.kind}
              onChange={(e) => {
                const kind = (["advance", "credit", "apply", "cancel", "reverse"] as const).find(
                  (kind) => kind === e.target.value,
                );
                if (kind)
                  change({ kind, actionId: crypto.randomUUID(), sourceId: "", targetId: "" });
              }}
            >
              {(["advance", "credit", "apply", "cancel", "reverse"] as const).map((kind) => (
                <option key={kind} value={kind}>
                  {t(`tadj.${kind}`)}
                </option>
              ))}
            </select>
          </div>
          {(["accountingDate", "documentDate", "taxDate"] as const).map((field) => (
            <div key={field} className="ui-field">
              <label htmlFor={`tadj-${field}`}>{t(`tinv.${field}`)}</label>
              <input
                id={`tadj-${field}`}
                type="date"
                value={draft[field]}
                onChange={(e) => change({ [field]: e.target.value })}
              />
            </div>
          ))}
          {draft.kind === "advance" && (
            <>
              <div className="ui-field">
                <label htmlFor="tadj-side">{t("trade.side")}</label>
                <select
                  id="tadj-side"
                  value={draft.side}
                  onChange={(e) => change({ side: e.target.value === "AR" ? "AR" : "AP" })}
                >
                  <option value="AP">{t("trade.AP")}</option>
                  <option value="AR">{t("trade.AR")}</option>
                </select>
              </div>
              <div className="ui-field">
                <label htmlFor="tadj-party">{t("tinv.party")}</label>
                <input
                  id="tadj-party"
                  value={draft.party}
                  onChange={(e) => change({ party: e.target.value })}
                />
              </div>
            </>
          )}
        </fieldset>
      </FastTab>
      <FastTab id="tadj-allocation" title={t("tadj.allocation")}>
        <fieldset disabled={locked} className="tadj-allocation">
          {draft.kind === "credit" && <p className="tadj-hint">{t("tadj.creditHint")}</p>}
          {draft.kind === "reverse" && <p className="tadj-hint">{t("tadj.reverseHint")}</p>}
          <div className="ui-form-grid">
            {draft.kind !== "advance" && (
              <div className="ui-field">
                <label htmlFor="tadj-partyFilter">{t("tadj.partyFilter")}</label>
                <input
                  id="tadj-partyFilter"
                  maxLength={60}
                  placeholder={t("tadj.partyFilterAll")}
                  aria-invalid={partyInvalid}
                  aria-describedby="tadj-partyFilter-hint"
                  value={partyInput}
                  onChange={(e) => setPartyInput(e.target.value)}
                  onBlur={applyPartyFilter}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    applyPartyFilter();
                  }}
                />
                <p id="tadj-partyFilter-hint" className="tadj-hint">
                  {t(partyInvalid ? "tadj.partyFilterInvalid" : "tadj.partyFilterHint")}
                </p>
              </div>
            )}
            {draft.kind !== "advance" && draft.kind !== "reverse" && itemSelect("sourceId")}
            {draft.kind === "apply" && itemSelect("targetId")}
            {(draft.kind === "advance" || draft.kind === "apply") && (
              <div className="ui-field">
                <label htmlFor="tadj-gross">{t("tadj.gross")}</label>
                <input
                  id="tadj-gross"
                  type="number"
                  min="1"
                  step="1"
                  value={draft.gross}
                  onChange={(e) => change({ gross: e.target.value })}
                />
              </div>
            )}
            {draft.kind === "cancel" && (
              <div className="ui-field">
                <label htmlFor="tadj-relatedRevision">{t("tadj.relatedRevision")}</label>
                <input
                  id="tadj-relatedRevision"
                  type="number"
                  min="1"
                  step="1"
                  value={draft.relatedRevision}
                  onChange={(e) => change({ relatedRevision: e.target.value })}
                />
              </div>
            )}
            {draft.kind === "reverse" && (
              <div className="ui-field">
                <label htmlFor="tadj-settlementId">{t("tadj.settlementId")}</label>
                <input
                  id="tadj-settlementId"
                  value={draft.settlementId}
                  onChange={(e) => change({ settlementId: e.target.value })}
                />
              </div>
            )}
          </div>
          {draft.kind === "credit" && (
            <div className="tadj-lines">
              {draft.lines.map((line, index) => (
                <div key={line.id} className="tadj-line">
                  <div className="ui-field">
                    <label htmlFor={`tadj-line-${line.id}`}>{t("tadj.sourceLine")}</label>
                    <input
                      id={`tadj-line-${line.id}`}
                      value={line.sourceLineId}
                      onChange={(e) =>
                        change({
                          lines: draft.lines.map((line, i) =>
                            i === index ? { ...line, sourceLineId: e.target.value } : line,
                          ),
                        })
                      }
                    />
                  </div>
                  <div className="ui-field">
                    <label htmlFor={`tadj-quantity-${line.id}`}>{t("tinv.quantity")}</label>
                    <input
                      id={`tadj-quantity-${line.id}`}
                      inputMode="decimal"
                      value={line.quantity}
                      onChange={(e) =>
                        change({
                          lines: draft.lines.map((line, i) =>
                            i === index ? { ...line, quantity: e.target.value } : line,
                          ),
                        })
                      }
                    />
                  </div>
                  <button
                    type="button"
                    className="btn btn-subtle"
                    disabled={draft.lines.length === 1}
                    onClick={() => change({ lines: draft.lines.filter((_, i) => i !== index) })}
                  >
                    {t("tinv.removeLine")}
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn btn-secondary"
                disabled={draft.lines.length >= 100}
                onClick={() =>
                  change({
                    lines: [
                      ...draft.lines,
                      { id: crypto.randomUUID(), sourceLineId: "", quantity: "" },
                    ],
                  })
                }
              >
                {t("tadj.addLine")}
              </button>
            </div>
          )}
          {draft.kind === "reverse" && (
            <div className="tadj-items">
              {rows
                .filter((row) => row.status !== "cancelled")
                .map((row) => (
                  <label key={row.itemId} className="ui-check">
                    <input
                      type="checkbox"
                      checked={draft.items.includes(row.itemId)}
                      disabled={!draft.items.includes(row.itemId) && draft.items.length >= 100}
                      onChange={(e) =>
                        change({
                          items: e.target.checked
                            ? [...draft.items, row.itemId]
                            : draft.items.filter((id) => id !== row.itemId),
                        })
                      }
                    />
                    <span>
                      {row.externalNo} · {row.itemId} · v{row.revision}
                    </span>
                  </label>
                ))}
            </div>
          )}
          {irreversible && (
            <div className="ui-field">
              <label htmlFor="tadj-reason">{t("tadj.reason")}</label>
              <input
                id="tadj-reason"
                maxLength={160}
                value={draft.reason}
                onChange={(e) => change({ reason: e.target.value })}
              />
            </div>
          )}
          {page.hasNextPage && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void page.fetchNextPage()}
            >
              {t("master.loadMore")}
            </button>
          )}
        </fieldset>
      </FastTab>
      {result && (
        <FastTab id="tadj-result" title={t("tadj.result")}>
          <section className="tadj-result" aria-label={t("tadj.result")}>
            <dl className="kpis">
              <div className="kpi emphasis">
                <dt className="label">{t(`tadj.${result.kind}`)}</dt>
                <dd className="value">{money(result.gross)}</dd>
              </div>
            </dl>
            <div className="grid-wrap">
              <table className="grid tadj-changes">
                {head([
                  "tset.item",
                  "trpt.kind",
                  "tset.remaining",
                  "tinv.net",
                  "tinv.tax",
                  "tadj.revision",
                  "tadj.status",
                ])}
                <tbody>
                  {result.changes.map(({ after }) => (
                    <tr key={after.itemId}>
                      <td>{after.itemId}</td>
                      <td>{t(`tadj.${after.kind}`)}</td>
                      <td>{money(after.remainingGross)}</td>
                      <td>{money(after.remainingNet)}</td>
                      <td>{money(after.remainingTax)}</td>
                      <td>v{after.revision}</td>
                      <td>{t(`tadj.${after.status}`)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {result.creditLines.length > 0 && (
              <div className="grid-wrap">
                <table className="grid tadj-credit">
                  {head(["tadj.sourceLine", "tinv.quantity", "tinv.net", "tinv.tax"])}
                  <tbody>
                    {result.creditLines.map((line) => (
                      <tr key={line.sourceLineId}>
                        <td>{line.sourceLineId}</td>
                        <td>{line.quantity}</td>
                        <td>{money(line.net)}</td>
                        <td>{money(line.tax)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {preview && (
              <div className="grid-wrap">
                <table className="grid tadj-journal" aria-label={t("tinv.previewTitle")}>
                  {head([
                    "journal.account",
                    "journal.debit",
                    "journal.credit",
                    "journal.dimensions",
                  ])}
                  <tbody>
                    {previewLines.map(({ id, line }) => (
                      <tr key={id}>
                        <td>{line.account}</td>
                        <td>{money(line.debit)}</td>
                        <td>{money(line.credit)}</td>
                        <td>
                          {Object.entries(line.dimensions)
                            .map(([key, value]) => `${key}=${value}`)
                            .join(", ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="tadj-links">
              {t("tadj.links")}: {result.links.join(", ")}
            </p>
          </section>
        </FastTab>
      )}
    </div>
  );
}
