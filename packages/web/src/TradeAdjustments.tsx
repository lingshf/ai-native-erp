import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
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
import { useInvoiceLeaveGuard } from "./TradeInvoices.tsx";

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
    <section>
      <h2>{t("tadj.title")}</h2>
      <p>{t("tadj.boundary")}</p>
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
      {companies.hasNextPage && (
        <button type="button" onClick={() => void companies.fetchNextPage()}>
          {t("master.loadMore")}
        </button>
      )}
      {companies.isError && <p role="alert">{t("master.error")}</p>}
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
  const page = useInfiniteQuery({
    queryKey: ["tradeActionItems", company.code],
    initialPageParam: "",
    refetchOnMount: true,
    queryFn: ({ pageParam, signal }) =>
      masterRequest(
        `/api/v1/trade/open-items?company=${encodeURIComponent(company.code)}&limit=100${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
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
        sessionStorage.setItem(key(company.code), JSON.stringify(next));
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
    <label>
      {t(field === "sourceId" ? "tadj.source" : "tadj.target")}
      <select
        aria-label={t(field === "sourceId" ? "tadj.source" : "tadj.target")}
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
    </label>
  );
  return (
    <>
      {storageFailed && <p role="alert">{t("tinv.storageFailed")}</p>}
      <fieldset disabled={locked}>
        <label>
          {t("tadj.kind")}
          <select
            value={draft.kind}
            onChange={(e) => {
              const kind = (["advance", "credit", "apply", "cancel", "reverse"] as const).find(
                (kind) => kind === e.target.value,
              );
              if (kind) change({ kind, actionId: crypto.randomUUID(), sourceId: "", targetId: "" });
            }}
          >
            {(["advance", "credit", "apply", "cancel", "reverse"] as const).map((kind) => (
              <option key={kind} value={kind}>
                {t(`tadj.${kind}`)}
              </option>
            ))}
          </select>
        </label>
        {(["accountingDate", "documentDate", "taxDate"] as const).map((field) => (
          <label key={field}>
            {t(`tinv.${field}`)}
            <input
              type="date"
              value={draft[field]}
              onChange={(e) => change({ [field]: e.target.value })}
            />
          </label>
        ))}
        {draft.kind === "advance" && (
          <>
            <label>
              {t("trade.side")}
              <select
                value={draft.side}
                onChange={(e) => change({ side: e.target.value === "AR" ? "AR" : "AP" })}
              >
                <option value="AP">{t("trade.AP")}</option>
                <option value="AR">{t("trade.AR")}</option>
              </select>
            </label>
            <label>
              {t("tinv.party")}
              <input value={draft.party} onChange={(e) => change({ party: e.target.value })} />
            </label>
          </>
        )}
        {draft.kind !== "advance" && draft.kind !== "reverse" && itemSelect("sourceId")}
        {draft.kind === "apply" && itemSelect("targetId")}
        {(draft.kind === "advance" || draft.kind === "apply") && (
          <label>
            {t("tadj.gross")}
            <input
              type="number"
              min="1"
              step="1"
              value={draft.gross}
              onChange={(e) => change({ gross: e.target.value })}
            />
          </label>
        )}
        {draft.kind === "credit" && (
          <>
            <p>{t("tadj.creditHint")}</p>
            {draft.lines.map((line, index) => (
              <div key={line.id}>
                <label>
                  {t("tadj.sourceLine")}
                  <input
                    value={line.sourceLineId}
                    onChange={(e) =>
                      change({
                        lines: draft.lines.map((line, i) =>
                          i === index ? { ...line, sourceLineId: e.target.value } : line,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  {t("tinv.quantity")}
                  <input
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
                </label>
                <button
                  type="button"
                  disabled={draft.lines.length === 1}
                  onClick={() => change({ lines: draft.lines.filter((_, i) => i !== index) })}
                >
                  {t("tinv.removeLine")}
                </button>
              </div>
            ))}
            <button
              type="button"
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
          </>
        )}
        {draft.kind === "cancel" && (
          <label>
            {t("tadj.relatedRevision")}
            <input
              type="number"
              min="1"
              step="1"
              value={draft.relatedRevision}
              onChange={(e) => change({ relatedRevision: e.target.value })}
            />
          </label>
        )}
        {draft.kind === "reverse" && (
          <>
            <label>
              {t("tadj.settlementId")}
              <input
                value={draft.settlementId}
                onChange={(e) => change({ settlementId: e.target.value })}
              />
            </label>
            <p>{t("tadj.reverseHint")}</p>
            {rows
              .filter((row) => row.status !== "cancelled")
              .map((row) => (
                <label key={row.itemId}>
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
                  {row.externalNo} · {row.itemId} · v{row.revision}
                </label>
              ))}
          </>
        )}
        {(draft.kind === "cancel" || draft.kind === "reverse") && (
          <label>
            {t("tadj.reason")}
            <input
              maxLength={160}
              value={draft.reason}
              onChange={(e) => change({ reason: e.target.value })}
            />
          </label>
        )}
        {page.hasNextPage && (
          <button type="button" onClick={() => void page.fetchNextPage()}>
            {t("master.loadMore")}
          </button>
        )}
        <button type="button" onClick={() => void run(false)}>
          {t("tinv.preview")}
        </button>
        <button type="button" disabled={!preview} onClick={() => void run(true)}>
          {t("tadj.confirm")}
        </button>
        <button
          type="button"
          onClick={() => {
            sequence.current++;
            setSaved({ draft: empty(), pending: null });
            setPreview(null);
            setReceipt(null);
          }}
        >
          {t("tadj.clear")}
        </button>
      </fieldset>
      {page.isError && <p role="alert">{t("master.error")}</p>}
      {error && <p role="alert">{error}</p>}
      {saved.pending && (
        <div role="alert">
          {t("tinv.uncertain")}
          <button type="button" disabled={busy || storageFailed} onClick={() => void run(true)}>
            {t("tinv.retryConfirm")}
          </button>
        </div>
      )}
      {result && (
        <section aria-label={t("tadj.result")}>
          <h3>{t("tadj.result")}</h3>
          <p>
            {t(`tadj.${result.kind}`)} · {money(result.gross)}
          </p>
          {result.changes.map(({ after }) => (
            <p key={after.itemId}>
              {after.itemId} · {t(`tadj.${after.kind}`)} · {t("tset.remaining")}:{" "}
              {money(after.remainingGross)} ·{t("tinv.net")}: {money(after.remainingNet)} ·{" "}
              {t("tinv.tax")}: {money(after.remainingTax)} · v{after.revision} ·{" "}
              {t(`tadj.${after.status}`)}
            </p>
          ))}
          {result.creditLines.map((line) => (
            <p key={line.sourceLineId}>
              {line.sourceLineId} · {line.quantity} ·{t("tinv.net")}: {money(line.net)} ·{" "}
              {t("tinv.tax")}: {money(line.tax)}
            </p>
          ))}
          {preview && (
            <table aria-label={t("tinv.previewTitle")}>
              <thead>
                <tr>
                  {(
                    [
                      "journal.account",
                      "journal.debit",
                      "journal.credit",
                      "journal.dimensions",
                    ] as const
                  ).map((key) => (
                    <th key={key}>{t(key)}</th>
                  ))}
                </tr>
              </thead>
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
          )}
          <p>
            {t("tadj.links")}: {result.links.join(", ")}
          </p>
          {receipt && (
            <p role="status">
              {t("tadj.posted")} {receipt.sourceRef} · {receipt.journalIds.join(", ")}
            </p>
          )}
        </section>
      )}
    </>
  );
}
