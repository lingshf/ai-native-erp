import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  companiesPageSchema,
  openItemPageSchema,
  tradeSettlementCommandSchema,
  tradeSettlementConfirmSchema,
  tradeSettlementPreviewSchema,
  tradeSettlementReceiptSchema,
  type CompanyDto,
  type TradeSettlementCommandDto,
  type TradeSettlementPreviewDto,
  type TradeSettlementReceiptDto,
} from "@erp/core/contracts";
import { masterRequest, MasterDataFailure } from "./master-data-client.ts";
import { formatMinor } from "./reports-data.ts";
import { label, type Preferences } from "./ui/index.ts";
import { settlementTeaching } from "./ui/trade-settlement-teaching.ts";
import { useInvoiceLeaveGuard } from "./TradeInvoices.tsx";
import { FastTab, MessageBar, PageHeader, TeachingTip } from "./ui/components/index.tsx";
import "./pages/trade-settlements.css";

type Key = Exclude<Parameters<typeof label>[1], "shell.httpError">;

type Pending = ReturnType<typeof tradeSettlementConfirmSchema.parse>;
type Saved = { command: TradeSettlementCommandDto; pending: Pending | null };
const day = () => new Date().toISOString().slice(0, 10);
const storageKey = (company: string) => `erp.tradeSettlements.v1.${company}`;

function initial(company: CompanyDto): { saved: Saved; failed: boolean } {
  const date = day();
  const empty: Saved = {
    command: {
      company: company.code,
      paymentId: crypto.randomUUID(),
      side: "AP",
      party: "",
      currency: company.currency,
      accountingDate: date,
      documentDate: date,
      taxDate: date,
      items: [],
    },
    pending: null,
  };
  try {
    const raw = window.sessionStorage.getItem(storageKey(company.code));
    if (!raw) return { saved: empty, failed: false };
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || !("command" in value) || !("pending" in value))
      throw new Error("Invalid saved settlement");
    const c = value.command;
    if (
      !c ||
      typeof c !== "object" ||
      !("party" in c) ||
      typeof c.party !== "string" ||
      !("items" in c) ||
      !Array.isArray(c.items)
    )
      throw new Error("Invalid saved settlement");
    const parsed = tradeSettlementCommandSchema.parse({
      ...c,
      party: c.party || "DRAFT",
      items: c.items.length
        ? c.items
        : [{ itemId: crypto.randomUUID(), revision: 1, gross: 1, takeDiscount: false }],
    });
    if (parsed.company !== company.code || parsed.currency !== company.currency)
      throw new Error("Invalid company");
    const pending =
      value.pending === null ? null : tradeSettlementConfirmSchema.parse(value.pending);
    if (
      pending &&
      JSON.stringify(pending.command) !==
        JSON.stringify({ ...parsed, party: c.party, items: c.items })
    )
      throw new Error("Invalid pending settlement");
    return {
      saved: {
        command: { ...parsed, party: c.party, items: c.items.length ? parsed.items : [] },
        pending,
      },
      failed: false,
    };
  } catch {
    return { saved: empty, failed: true };
  }
}

export function TradeSettlements({ preferences }: { preferences: Preferences }) {
  const t = (key: Exclude<Parameters<typeof label>[1], "shell.httpError">) =>
    label(preferences.language, key);
  const [selected, setSelected] = useState("");
  const [guard, setGuard] = useState({ busy: false, unsaved: false });
  useInvoiceLeaveGuard(guard, t("trade.leaveConfirm"));
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
    <section className="page trade-settlements">
      <PageHeader
        title={t("tset.title")}
        description={t("tset.description")}
        context={
          <>
            <div className="field">
              <label htmlFor="tset-company">{t("master.company")}</label>
              <select
                id="tset-company"
                disabled={guard.busy}
                value={company?.code ?? ""}
                onChange={(event) => setSelected(event.target.value)}
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
      <MessageBar tone="info">{t("tset.boundary")}</MessageBar>
      {companies.isError && (
        <MessageBar tone="danger" role="alert">
          {t("master.error")}
        </MessageBar>
      )}
      {company && (
        <SettlementEntry
          key={company.code}
          company={company}
          preferences={preferences}
          onGuard={setGuard}
        />
      )}
    </section>
  );
}

function SettlementEntry({
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
  const kpis = (entries: [Key, number][]) => (
    <dl className="kpis">
      {entries.map(([key, value], index) => (
        <div key={key} className={index === 1 ? "kpi emphasis" : "kpi"}>
          <dt className="label">{t(key)}</dt>
          <dd className="value">{Number.isNaN(value) ? t("tset.unloaded") : money(value)}</dd>
        </div>
      ))}
    </dl>
  );
  const [loaded] = useState(() => initial(company));
  const [saved, setSaved] = useState(loaded.saved);
  const [storageFailed, setStorageFailed] = useState(loaded.failed);
  const [preview, setPreview] = useState<TradeSettlementPreviewDto | null>(null);
  const [receipt, setReceipt] = useState<TradeSettlementReceiptDto | null>(null);
  const [busy, setBusy] = useState(false);
  // The outcome is unknown only after a send failed without a server answer (or on reload),
  // never while the first send is still in flight.
  const [uncertain, setUncertain] = useState(loaded.saved.pending !== null);
  const running = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const command = saved.command;
  const locked = busy || saved.pending !== null || storageFailed;
  const result = receipt ?? preview;
  const sequence = useRef(0);
  useEffect(
    () => () => {
      sequence.current++;
    },
    [],
  );
  useEffect(() => {
    if (storageFailed) return;
    try {
      window.sessionStorage.setItem(storageKey(company.code), JSON.stringify(saved));
    } catch {
      setStorageFailed(true);
    }
  }, [company.code, saved, storageFailed]);
  useLayoutEffect(() => {
    onGuard({
      busy: busy || saved.pending !== null,
      unsaved: command.party !== "" || command.items.length > 0,
    });
  }, [busy, saved.pending, command.party, command.items.length, onGuard]);
  const page = useInfiniteQuery({
    queryKey: ["tradeOpenItems", company.code],
    initialPageParam: "",
    refetchOnMount: "always",
    queryFn: ({ pageParam, signal }) =>
      masterRequest(
        `/api/v1/trade/open-items?company=${encodeURIComponent(company.code)}&status=open&limit=100${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        openItemPageSchema,
        { signal },
      ),
    getNextPageParam: (p) => p.nextCursor ?? undefined,
  });
  const rows = page.data?.pages.flatMap((p) => p.items) ?? [];
  const firstSelected = rows.find((item) => item.itemId === command.items[0]?.itemId);
  const scroll = useRef<HTMLDivElement>(null);
  const virtual = rows.length > 100;
  const virtualizer = useVirtualizer({
    count: virtual ? rows.length : 0,
    getScrollElement: () => scroll.current,
    estimateSize: () => 48,
    overscan: 5,
  });
  const measured = virtualizer.getVirtualItems();
  const visible = virtual
    ? measured.map((item) => ({ row: rows[item.index], index: item.index }))
    : rows.map((row, index) => ({ row, index }));
  function change(next: TradeSettlementCommandDto) {
    sequence.current++;
    setSaved({ command: next, pending: null });
    setPreview(null);
    setReceipt(null);
    setError(null);
  }
  function report(error: unknown) {
    const detail = error instanceof MasterDataFailure ? error.detail?.fieldErrors[0] : null;
    setError(
      detail ? `${t("master.error")} ${detail.path}: ${detail.messageKey}` : t("master.error"),
    );
  }
  async function runPreview() {
    if (running.current || locked) return;
    running.current = true;
    setBusy(true);
    setError(null);
    const version = ++sequence.current;
    try {
      const body = tradeSettlementCommandSchema.parse(command);
      const result = await masterRequest(
        "/api/v1/trade/settlements/preview",
        tradeSettlementPreviewSchema,
        { method: "POST", body },
      );
      if (sequence.current === version) setPreview(result);
    } catch (error) {
      if (sequence.current === version) report(error);
    } finally {
      running.current = false;
      if (sequence.current === version) setBusy(false);
    }
  }
  async function confirm() {
    if (running.current || storageFailed || (!preview && !saved.pending)) return;
    let pending = saved.pending;
    if (!pending) {
      if (!preview) return;
      setUncertain(false);
      pending = {
        command,
        fingerprint: preview.fingerprint,
        idempotencyKey: crypto.randomUUID(),
        confirmation: "POST",
      };
    }
    try {
      const serialized = JSON.stringify({ command, pending });
      window.sessionStorage.setItem(storageKey(company.code), serialized);
      if (window.sessionStorage.getItem(storageKey(company.code)) !== serialized) {
        setStorageFailed(true);
        return;
      }
    } catch {
      setStorageFailed(true);
      return;
    }
    setSaved({ command, pending });
    running.current = true;
    setBusy(true);
    setError(null);
    const version = ++sequence.current;
    try {
      const result = await masterRequest(
        "/api/v1/trade/settlements",
        tradeSettlementReceiptSchema,
        { method: "POST", body: pending },
      );
      if (sequence.current !== version) return;
      setReceipt(result);
      setPreview(null);
      setSaved({
        command: { ...command, paymentId: crypto.randomUUID(), items: [] },
        pending: null,
      });
      await page.refetch();
    } catch (error) {
      if (sequence.current === version) {
        report(error);
        if (
          error instanceof MasterDataFailure &&
          error.kind === "http" &&
          (error.status ?? 500) < 500
        ) {
          setSaved({ command, pending: null });
          setPreview(null);
        } else setUncertain(true);
      }
    } finally {
      running.current = false;
      if (sequence.current === version) setBusy(false);
    }
  }
  // 已选未结项尚未加载时余额未知：NaN 使应付/应收与剩余显示“待加载”，不按 0 推算。
  const due = command.items.reduce(
    (sum, item) => sum + (rows.find((row) => row.itemId === item.itemId)?.remainingGross ?? NaN),
    0,
  );
  const allocated = command.items.reduce((sum, item) => sum + item.gross, 0);
  return (
    <div className="tset-entry">
      <div className="tset-command-bar">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={locked || command.items.length === 0}
          onClick={() => void runPreview()}
        >
          {t("tinv.preview")}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={locked || !preview}
          onClick={() => void confirm()}
        >
          {t("tset.confirm")}
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
      {saved.pending && uncertain && (
        <MessageBar tone="warning" role="alert">
          <p>{t("tinv.uncertain")}</p>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy || storageFailed}
            onClick={() => void confirm()}
          >
            {t("tinv.retryConfirm")}
          </button>
        </MessageBar>
      )}
      {receipt && (
        <MessageBar tone="success" role="status">
          {t("tset.posted")} {receipt.sourceRef} · {receipt.journalIds.join(", ")}
        </MessageBar>
      )}
      <TeachingTip teaching={preferences.teaching} title={t("master.teachingTitle")}>
        {settlementTeaching(preferences.language, t("tset.teaching"))}
      </TeachingTip>
      <FastTab id="tset-general" title={t("master.general")}>
        <fieldset disabled={locked} className="ui-form-grid">
          <div className="ui-field">
            <label htmlFor="tset-side">{t("trade.side")}</label>
            <select
              id="tset-side"
              value={command.side}
              onChange={(e) =>
                change({ ...command, side: e.target.value === "AR" ? "AR" : "AP", items: [] })
              }
            >
              <option value="AP">{t("trade.AP")}</option>
              <option value="AR">{t("trade.AR")}</option>
            </select>
          </div>
          <div className="ui-field">
            <label htmlFor="tset-party">{t("tinv.party")}</label>
            <input
              id="tset-party"
              value={command.party}
              onChange={(e) => change({ ...command, party: e.target.value, items: [] })}
            />
          </div>
          {(["accountingDate", "documentDate", "taxDate"] as const).map((field) => (
            <div key={field} className="ui-field">
              <label htmlFor={`tset-${field}`}>{t(`tinv.${field}`)}</label>
              <input
                id={`tset-${field}`}
                type="date"
                value={command[field]}
                onChange={(e) => change({ ...command, [field]: e.target.value })}
              />
            </div>
          ))}
        </fieldset>
      </FastTab>
      <FastTab id="tset-allocation" title={t("tset.allocation")}>
        <fieldset disabled={locked} className="tset-allocation">
          <p className="tset-hint">{t("tset.minorHint")}</p>
          {kpis([
            [`trade.${command.side}`, due],
            ["tset.allocated", allocated],
            ["tset.remaining", due - allocated],
          ])}
          <div className="grid-wrap accounts-scroll" ref={scroll}>
            <table className="grid" aria-label={t("tset.select")}>
              {head([
                "tset.select",
                "tinv.party",
                "tinv.externalInvoice",
                "tset.remaining",
                "tset.amount",
                "tset.discount",
              ])}
              <tbody>
                {virtual && measured[0]?.start ? (
                  <tr>
                    <td colSpan={6} style={{ height: measured[0].start, padding: 0 }} />
                  </tr>
                ) : null}
                {visible.map(({ row, index }) => {
                  if (!row) return null;
                  const selected = command.items.find((item) => item.itemId === row.itemId);
                  const available =
                    row.kind === "invoice" &&
                    command.accountingDate >= row.documentDate &&
                    command.accountingDate <= row.discountDate &&
                    Number(row.discountPercent) > 0 &&
                    (row.allowPartialDiscount ||
                      (row.remainingGross === row.gross &&
                        (selected?.gross ?? row.remainingGross) === row.gross));
                  const eligible =
                    row.side === command.side &&
                    row.party === command.party &&
                    row.currency === company.currency &&
                    (!firstSelected ||
                      (firstSelected.kind === "invoice") === (row.kind === "invoice"));
                  return (
                    <tr key={row.itemId} aria-rowindex={index + 2} style={{ height: 48 }}>
                      <td>
                        <label>
                          <input
                            type="checkbox"
                            aria-label={`${t("tset.select")} ${row.externalNo}`}
                            checked={!!selected}
                            disabled={!eligible || (!selected && command.items.length >= 100)}
                            onChange={(e) =>
                              change({
                                ...command,
                                items: e.target.checked
                                  ? [
                                      ...command.items,
                                      {
                                        itemId: row.itemId,
                                        revision: row.revision,
                                        gross: row.remainingGross,
                                        takeDiscount: false,
                                      },
                                    ]
                                  : command.items.filter((item) => item.itemId !== row.itemId),
                              })
                            }
                          />
                        </label>
                      </td>
                      <td>
                        {row.party} · {row.side}
                      </td>
                      <td>
                        <span>{row.externalNo}</span> · {t(`tadj.${row.kind}`)}
                      </td>
                      <td>{money(row.remainingGross)}</td>
                      <td>
                        {selected && (
                          <input
                            type="number"
                            min={1}
                            max={row.remainingGross}
                            step={1}
                            aria-label={`${t("tset.amount")} ${row.externalNo}`}
                            value={selected.gross}
                            onChange={(e) =>
                              change({
                                ...command,
                                items: command.items.map((item) =>
                                  item.itemId === row.itemId
                                    ? {
                                        ...item,
                                        gross:
                                          Number.isSafeInteger(Number(e.target.value)) &&
                                          Number(e.target.value) > 0
                                            ? Number(e.target.value)
                                            : item.gross,
                                        takeDiscount: false,
                                      }
                                    : item,
                                ),
                              })
                            }
                          />
                        )}
                      </td>
                      <td>
                        <span className="tset-discount">
                          {row.discountPercent}% · {row.discountDate} ·{" "}
                          {t(available ? "tset.available" : "tset.unavailable")}
                          {selected && (
                            <label>
                              <input
                                type="checkbox"
                                aria-label={`${t("tset.discount")} ${row.externalNo}`}
                                checked={selected.takeDiscount}
                                disabled={!available && !selected.takeDiscount}
                                onChange={(e) =>
                                  change({
                                    ...command,
                                    items: command.items.map((item) =>
                                      item.itemId === row.itemId
                                        ? { ...item, takeDiscount: e.target.checked }
                                        : item,
                                    ),
                                  })
                                }
                              />
                            </label>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {virtual && measured.length > 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      style={{
                        height: virtualizer.getTotalSize() - (measured.at(-1)?.end ?? 0),
                        padding: 0,
                      }}
                    />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {page.hasNextPage && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={page.isFetchingNextPage}
              onClick={() => void page.fetchNextPage()}
            >
              {t("master.loadMore")}
            </button>
          )}
        </fieldset>
      </FastTab>
      {result && (
        <FastTab id="tset-result" title={t("tset.result")}>
          <section className="tset-result" aria-label={t("tset.result")}>
            {kpis([
              ["tset.amount", result.gross],
              ["tset.cash", result.cash],
              ["tset.discountAmount", result.discount],
            ])}
            <div className="grid-wrap">
              <table className="grid">
                {head(["tset.item", "tinv.net", "tinv.tax", "tset.settled", "tset.remaining"])}
                <tbody>
                  {result.allocations.map((a) => (
                    <tr key={a.itemId}>
                      <td>{a.itemId}</td>
                      <td>{money(a.net)}</td>
                      <td>{money(a.tax)}</td>
                      <td>{money(a.settledGross)}</td>
                      <td>{money(a.remainingGross)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </FastTab>
      )}
    </div>
  );
}
