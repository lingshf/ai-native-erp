import { useEffect, useRef, useState, type ReactNode } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  companiesPageSchema, accountsPageSchema, dimensionPageSchema, businessMastersPageSchema, postingRulesPageSchema,
  businessEventsPageSchema, businessPreviewSchema, businessResultSchema, businessMasterSchema, postingRuleSchema,
  transferQueuePageSchema, openClearingPageSchema, journalDetailSchema,
  type ContractSchema, type CompanyDto, type BusinessEventDto, type BusinessMasterDto, type PostingRuleDto,
  type BusinessPreviewDto, type BusinessResultDto, type JournalDetailDto,
} from "@erp/core/contracts";
import { label, type LabelKey, type Language, type Preferences } from "./ui/index.ts";
import { MasterDataFailure, masterRequest } from "./master-data-client.ts";
import { DimensionFields, JournalError, LinePlan, Modal, VirtualRows } from "./Journals.tsx";
import { formatMinor } from "./reports-data.ts";
type T = (key: Exclude<LabelKey, "shell.httpError">) => string;
const companyQuery = (company: string) => `company=${encodeURIComponent(company)}`;
function usePage<T>(path: string, company: string, schema: ContractSchema<{ items: T[]; nextCursor: string | null }>, query = "", enabled = true) {
  return useInfiniteQuery({
    queryKey: ["business", company, path, query], enabled, initialPageParam: "",
    queryFn: ({ pageParam, signal }) => masterRequest(`/api/v1/${path}?${companyQuery(company)}&limit=100${query}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`, schema, { signal }),
    getNextPageParam: page => page.nextCursor ?? undefined,
  });
}
type Listing<T> = {
  data?: { pages: { items: T[] }[] }; isPending: boolean; isError: boolean; error: unknown;
  hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown; refetch: () => unknown;
};
function PageControls({ page, t }: { page: Listing<unknown>; t: T }) {
  return <>
    {page.isPending && <p role="status">{t("master.loading")}</p>}
    {page.isError && <><BusinessError error={page.error} t={t} /><button type="button" onClick={() => void page.refetch()}>{t("master.retry")}</button></>}
    {page.hasNextPage && <button type="button" disabled={page.isFetchingNextPage} onClick={() => void page.fetchNextPage()}>{t("master.loadMore")}</button>}
  </>;
}
function PageTable<T>({ page, title, header, render, t }: { page: Listing<T>; title: string; header: readonly string[]; render: (item: T, index: number) => ReactNode; t: T }) {
  const items = page.data?.pages.flatMap(p => p.items) ?? [];
  return <><VirtualRows items={items} title={title} header={header} render={render} />
    {!page.isPending && !page.isError && !items.length && <p>{t("business.empty")}</p>}<PageControls page={page} t={t} /></>;
}
export function BusinessError({ error, t, uncertain = false }: { error: unknown; t: T; uncertain?: boolean }) {
  const issue = error instanceof MasterDataFailure ? error.detail?.fieldErrors[0] : undefined;
  const rules = ["shape", "missing", "ambiguous", "account", "reference", "stale", "source", "queue", "pending", "quantity", "line", "limit"] as const;
  const rule = issue?.messageKey.startsWith("api.error.business.") ? rules.find(r => issue.messageKey === `api.error.business.${r}`) : undefined;
  if (!uncertain && rule) return <p role="alert">{t(`business.rule.${rule}`)} · {issue?.path}</p>;
  if (!uncertain && error instanceof MasterDataFailure && error.status === 404) return <p role="alert">{t("business.rule.reference")}</p>;
  return <JournalError error={error} t={t} uncertain={uncertain} />;
}
export function BusinessEvents({ preferences }: { preferences: Preferences }) {
  const t: T = key => label(preferences.language, key), [params] = useSearchParams();
  const [selected, setSelected] = useState<string | undefined>(() => params.get("company") ?? undefined), [locked, setLocked] = useState(false);
  const companies = useInfiniteQuery({
    queryKey: ["companies"], initialPageParam: "",
    queryFn: ({ pageParam, signal }) => masterRequest(`/api/v1/companies?limit=100${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`, companiesPageSchema, { signal }),
    getNextPageParam: page => page.nextCursor ?? undefined,
  });
  const items = companies.data?.pages.flatMap(p => p.items) ?? [], company = items.find(item => item.code === (selected ?? items[0]?.code));
  return <section><h2>{t("business.title")}</h2><PageControls page={companies} t={t} />
    <label htmlFor="business-company">{t("master.company")}</label>
    <select id="business-company" disabled={locked} value={company?.code ?? ""} onChange={event => setSelected(event.target.value)}>{items.map(item => <option key={item.code} value={item.code}>{item.code} · {item.name}</option>)}</select>
    {company && <CompanyEvents key={company.code} company={company} language={preferences.language} lock={setLocked}
      initialId={params.get("company") === company.code ? params.get("id") : null} initialQueue={params.get("view") === "queue"} />}
    {preferences.teaching && <p className="teaching">{t("business.teaching")}</p>}
  </section>;
}
type Review = { preview: BusinessPreviewDto; event: BusinessEventDto; key: string } | { preview: BusinessPreviewDto; queueId: string };
function CompanyEvents({ company, language, lock, initialId, initialQueue }: { company: CompanyDto; language: Language; lock: (value: boolean) => void; initialId: string | null; initialQueue: boolean }) {
  const t: T = key => label(language, key), client = useQueryClient();
  const [view, setView] = useState<"events" | "settings" | "queue">(initialQueue ? "queue" : "events");
  const [draft, setDraft] = useState<BusinessEventDto | null>(null), [review, setReview] = useState<Review | null>(null);
  const [detail, setDetail] = useState<BusinessResultDto | null>(null), [entry, setEntry] = useState<JournalDetailDto | null>(null);
  const [withdraw, setWithdraw] = useState<{ id: string; reason: string } | null>(null), [status, setStatus] = useState<"pending" | "failed" | "transferred" | "withdrawn">("pending");
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [configEditing, setConfigEditing] = useState(false), [error, setError] = useState<unknown>();
  const working = useRef(false), alive = useRef(true), returnFocus = useRef<HTMLElement | null>(null);
  const editing = Boolean(draft || review || withdraw || configEditing);
  const listing = usePage("events", company.code, businessEventsPageSchema, "", view === "events");
  const queue = usePage("transfer-queue", company.code, transferQueuePageSchema, `&status=${status}`, view === "queue");
  const dimensions = usePage("dimensions", company.code, dimensionPageSchema, "&kind=dimension");
  const dimensionKeys = dimensions.data?.pages.flatMap(p => p.items.map(item => item.code)) ?? [];
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { lock(editing || busy); return () => lock(false); }, [editing, busy, lock]);
  useEffect(() => {
    if (!review && !withdraw && !busy) {
      const previous = returnFocus.current;
      if (previous?.isConnected) previous.focus();
    }
  }, [review, withdraw, busy]);
  useEffect(() => {
    if (!initialId) return;
    const controller = new AbortController();
    void masterRequest(`/api/v1/events/${encodeURIComponent(initialId)}?${companyQuery(company.code)}`, businessResultSchema, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setDetail(result); }, cause => { if (!controller.signal.aborted) setError(cause); });
    return () => controller.abort();
  }, [initialId, company.code]);
  async function run(action: () => Promise<void>) {
    if (working.current) return;
    if (!review && !withdraw) returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    working.current = true; setBusy(true); setError(undefined);
    try { await action(); } catch (cause) { if (alive.current) setError(cause); }
    finally { working.current = false; if (alive.current) setBusy(false); }
  }
  function complete(result: BusinessResultDto) {
    if (!alive.current) return;
    setDetail(result); setDraft(null); setEntry(null); setReview(null); setWithdraw(null); setUncertain(false);
    void client.invalidateQueries({ queryKey: ["business", company.code] });
    void client.invalidateQueries({ queryKey: ["journals", company.code] });
  }
  function rejected(cause: unknown) {
    const known = cause instanceof MasterDataFailure && cause.kind === "http" && cause.status !== undefined && cause.status < 500;
    if (alive.current) { setUncertain(!known); if (known) { setReview(null); setWithdraw(null); } }
  }
  function fresh(operation: "cash_service" | "statistics" | "clearing.match", originalId?: string) {
    const base = { id: crypto.randomUUID(), sourceRef: "", date: "", memo: "" };
    const next: BusinessEventDto = originalId ? { ...base, operation: "cash_service.cancel", originalId } :
      operation === "cash_service" ? { ...base, operation, direction: "receive", service: "", party: null, currency: company.currency, amount: "", dimensions: {} } :
      operation === "statistics" ? { ...base, operation, code: "", quantity: "", unit: "", dimensions: {} } : { ...base, operation, account: "", lines: [] };
    setDraft(next); setDetail(null); setEntry(null); setError(undefined);
  }
  const preview = () => run(async () => {
    if (!draft) return;
    const result = await masterRequest("/api/v1/events/preview", businessPreviewSchema, { method: "POST", body: { company: company.code, event: draft } });
    if (alive.current) setReview({ preview: result, event: draft, key: crypto.randomUUID() });
  });
  const confirm = () => run(async () => {
    if (!review) return;
    try {
      const result = "event" in review
        ? await masterRequest("/api/v1/events/confirm", businessResultSchema, { method: "POST", body: { company: company.code, event: review.event, fingerprint: review.preview.fingerprint, idempotencyKey: review.key, confirmation: "POST" } })
        : await masterRequest(`/api/v1/transfer-queue/${review.queueId}/confirm`, businessResultSchema, { method: "POST", body: { company: company.code, fingerprint: review.preview.fingerprint, confirmation: "TRANSFER" } });
      complete(result);
    } catch (cause) { rejected(cause); throw cause; }
  });
  return <>
    <div className="journal-actions">{(["events", "settings", "queue"] as const).map(item => <button key={item} type="button" disabled={editing || busy} aria-pressed={view === item} onClick={() => { setView(item); setError(undefined); }}>{t(item === "events" ? "business.title" : `business.${item}`)}</button>)}</div>
    {error !== undefined && !review && !withdraw && <BusinessError error={error} t={t} />}
    {busy && <p role="status">{t("journal.pending")}</p>}
    {view === "settings" && <BusinessSettings company={company} t={t} dimensionKeys={dimensionKeys} lock={setConfigEditing} />}
    {view === "events" && <>
      <div className="journal-actions">{(["cash_service", "statistics", "clearing.match"] as const).map(operation => <button type="button" key={operation} disabled={editing || busy} onClick={() => fresh(operation)}>{t("business.new")} · {t(`business.${operation}`)}</button>)}</div>
      <PageTable page={listing} t={t} title={t("business.title")} header={[t("journal.sourceRef"), t("journal.date"), t("business.title"), ""]}
        render={item => <><td>{item.sourceRef}</td><td>{item.date}</td><td>{t(`business.${item.operation}`)} · {t(`business.${item.status}`)}</td><td><button type="button" disabled={editing || busy} onClick={() => void run(async () => { const result = await masterRequest(`/api/v1/events/${item.id}?${companyQuery(company.code)}`, businessResultSchema); if (alive.current) { setDetail(result); setEntry(null); } })}>{t("journal.view")}</button></td></>} />
      {draft && <EventEditor event={draft} company={company} t={t} language={language} dimensionKeys={dimensionKeys} change={setDraft} busy={busy || Boolean(review)} preview={() => void preview()} close={() => { setDraft(null); setError(undefined); }} />}
    </>}
    {view === "queue" && <>
      <label>{t("business.queue")}<select disabled={editing || busy} value={status} onChange={event => { const next = event.target.value; if (next === "pending" || next === "failed" || next === "transferred" || next === "withdrawn") setStatus(next); }}>{(["pending", "failed", "transferred", "withdrawn"] as const).map(item => <option key={item} value={item}>{t(`business.${item}`)}</option>)}</select></label>
      <PageTable page={queue} t={t} title={t("business.queue")} header={[t("journal.sourceRef"), t("journal.date"), t("business.queue"), ""]}
        render={item => <><td>{item.sourceRef}</td><td>{item.date}</td><td>{t(`business.${item.status}`)}{item.error && <> · {item.error}</>}{item.reason && <> · {item.reason}</>}</td><td>
          <button type="button" disabled={editing || busy} onClick={() => void run(async () => { const result = await masterRequest(`/api/v1/events/${item.id}?${companyQuery(company.code)}`, businessResultSchema); if (alive.current) { setDetail(result); setEntry(null); } })}>{t("journal.view")}</button>
          {(item.status === "pending" || item.status === "failed") && <>
            <button type="button" disabled={editing || busy} onClick={() => void run(async () => { const result = await masterRequest(`/api/v1/transfer-queue/${item.id}/preview`, businessPreviewSchema, { method: "POST", body: { company: company.code } }); if (alive.current) setReview({ preview: result, queueId: item.id }); })}>{t("journal.preview")}</button>
            <button type="button" disabled={editing || busy} onClick={() => { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setError(undefined); setWithdraw({ id: item.id, reason: "" }); }}>{t("business.withdraw")}</button>
          </>}
        </td></>} />
    </>}
    {detail && <section><h3>{detail.event.sourceRef} · {t(`business.${detail.status}`)}</h3><p role="status">{t("business.done")}</p>
      <p>{t("business.receipt")}: {detail.receipt.idempotencyKey} · {detail.receipt.postedAt} · {detail.receipt.fingerprint}</p>
      <BusinessPlan preview={detail.preview} company={company} language={language} t={t} />
      {detail.queue?.plan && <><h4>{t("business.currentPlan")}</h4>{detail.queue.plan.journals.map(journal => <LinePlan key={journal.role} lines={journal.lines} company={company} language={language} t={t} />)}</>}
      {detail.event.operation === "cash_service.cancel" && <p>{t("business.original")}: <button type="button" disabled={editing || busy} onClick={() => { const event = detail.event; if (event.operation === "cash_service.cancel") void run(async () => { const result = await masterRequest(`/api/v1/events/${event.originalId}?${companyQuery(company.code)}`, businessResultSchema); if (alive.current) setDetail(result); }); }}>{detail.event.originalId}</button></p>}
      {detail.event.operation === "cash_service" && detail.status === "posted" && <button type="button" disabled={editing || busy} onClick={() => fresh("cash_service", detail.event.id)}>{t("business.cash_service.cancel")}</button>}
      {detail.journalIds.map(id => <button type="button" key={id} disabled={editing || busy} onClick={() => void run(async () => { const result = await masterRequest(`/api/v1/journals/${id}?${companyQuery(company.code)}`, journalDetailSchema); if (alive.current) setEntry(result); })}>{t("journal.view")} {id}</button>)}
      {entry && <section><h4>{entry.entry.sourceRef} · {entry.entry.id}</h4><LinePlan lines={entry.entry.lines} company={company} language={language} t={t} /><h4>{t("journal.chain")}</h4>{entry.chain.map(edge => <p key={edge.outputId}>{edge.date} · {edge.originalId} → {edge.outputId}</p>)}</section>}
    </section>}
    {review && <Modal title={t("journal.previewTitle")} busy={busy || uncertain} close={() => setReview(null)}>
      <BusinessPlan preview={review.preview} company={company} language={language} t={t} />
      {error !== undefined && <BusinessError error={error} t={t} uncertain={uncertain} />}
      <button type="button" disabled={busy} onClick={() => void confirm()}>{t("event" in review ? "business.confirm" : "business.transfer")}</button>
      <button type="button" disabled={busy || uncertain} onClick={() => setReview(null)}>{t("journal.back")}</button>
    </Modal>}
    {withdraw && <Modal title={t("business.withdraw")} busy={busy || uncertain} close={() => setWithdraw(null)}>
      <label>{t("business.reason")}<textarea required maxLength={200} disabled={busy || uncertain} value={withdraw.reason} onChange={event => setWithdraw({ ...withdraw, reason: event.target.value })} /></label>
      {error !== undefined && <BusinessError error={error} t={t} uncertain={uncertain} />}
      <button type="button" disabled={busy || !withdraw.reason.trim()} onClick={() => void run(async () => {
        try { complete(await masterRequest(`/api/v1/transfer-queue/${withdraw.id}/withdraw`, businessResultSchema, { method: "POST", body: { company: company.code, reason: withdraw.reason, confirmation: "WITHDRAW" } })); }
        catch (cause) { rejected(cause); throw cause; }
      })}>{t("business.withdrawConfirm")}</button>
      <button type="button" disabled={busy || uncertain} onClick={() => setWithdraw(null)}>{t("journal.back")}</button>
    </Modal>}
    <PageControls page={dimensions} t={t} />
  </>;
}
function BusinessPlan({ preview, company, language, t }: { preview: BusinessPreviewDto; company: CompanyDto; language: Language; t: T }) {
  return <><p>{preview.plan.sourceRef} · {preview.plan.date} · {preview.plan.currency}</p><p>{preview.plan.memo}</p>
    {preview.matches.map(match => <section key={match.meaning}><h4>{t("business.match")}: {t(`business.${match.meaning}`)} → {match.rule} / r{match.revision} → {match.account}</h4><p>{t("business.candidates")}: {match.candidates.map(item => `${t(item.objectScope === "group" ? "business.groupScope" : `business.${item.objectScope}`)} / ${t(item.partyScope === "group" ? "business.groupScope" : `business.${item.partyScope}`)} (${item.count})`).join(" · ")}</p></section>)}
    {!preview.plan.journals.length && <p>{t("business.noGl")}</p>}
    {preview.plan.journals.map(journal => <section key={journal.role}><h4>{t(journal.role === "reversal" ? "journal.historical" : "journal.business")}</h4><LinePlan lines={journal.lines} company={company} language={language} t={t} /><p>{t("journal.debit")}: {formatMinor(journal.debit, language, company.scale)} / {t("journal.credit")}: {formatMinor(journal.credit, language, company.scale)}</p></section>)}
    {preview.statistics && <section><h4>{preview.statistics.code}: {formatMinor(preview.statistics.quantity, language, 6)} {preview.statistics.unit}</h4>{Object.entries(preview.statistics.dimensionOrigins).map(([key, origins]) => <p key={key}>{key}: {origins.map(origin => `${origin.source} → ${origin.value ?? "-"}`).join(" · ")}</p>)}</section>}
    {preview.clearing.length > 0 && <VirtualRows items={preview.clearing} title={t("business.selected")} header={[t("journal.original"), t("journal.line")]} render={line => <><td>{line.entryId}</td><td>{line.lineNo}</td></>} />}
  </>;
}
function EventEditor({ event, company, t, language, dimensionKeys, change, busy, preview, close }: {
  event: BusinessEventDto; company: CompanyDto; t: T; language: Language; dimensionKeys: string[]; change: (event: BusinessEventDto) => void; busy: boolean; preview: () => void; close: () => void;
}) {
  const form = useRef<HTMLFormElement>(null);
  const services = usePage("services", company.code, businessMastersPageSchema, "", event.operation === "cash_service"), parties = usePage("parties", company.code, businessMastersPageSchema, "", event.operation === "cash_service");
  useEffect(() => { form.current?.querySelector<HTMLInputElement>("input")?.focus(); }, [event.id]);
  return <form ref={form} onSubmit={submit => { submit.preventDefault(); if (!busy) preview(); }} onKeyDown={key => { if (key.key === "Enter" && (key.ctrlKey || key.metaKey)) { key.preventDefault(); if (!busy) key.currentTarget.requestSubmit(); } }}>
    <fieldset disabled={busy}><legend>{t(`business.${event.operation}`)}</legend>
      <label>{t("journal.sourceRef")}<input required maxLength={100} value={event.sourceRef} onChange={e => change({ ...event, sourceRef: e.target.value })} /></label>
      <label>{t("journal.date")}<input required type="date" value={event.date} onChange={e => change({ ...event, date: e.target.value })} /></label>
      <label>{t("journal.memo")}<input required maxLength={200} value={event.memo} onChange={e => change({ ...event, memo: e.target.value })} /></label>
      {event.operation === "cash_service" && <>
        <label>{t("business.direction")}<select value={event.direction} onChange={e => { if (e.target.value === "receive" || e.target.value === "pay") change({ ...event, direction: e.target.value }); }}><option value="receive">{t("business.receive")}</option><option value="pay">{t("business.pay")}</option></select></label>
        <label>{t("business.service")}<input required list="business-services" value={event.service} onChange={e => change({ ...event, service: e.target.value })} /></label>
        <datalist id="business-services">{services.data?.pages.flatMap(p => p.items).map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</datalist><PageControls page={services} t={t} />
        <label>{t("business.party")}<input list="business-parties" value={event.party ?? ""} onChange={e => change({ ...event, party: e.target.value || null })} /></label>
        <datalist id="business-parties">{parties.data?.pages.flatMap(p => p.items).map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</datalist><PageControls page={parties} t={t} />
        <label>{t("business.amount")} · {company.currency}<input required inputMode="decimal" maxLength={40} value={event.amount} onChange={e => change({ ...event, amount: e.target.value })} /></label>
      </>}
      {event.operation === "statistics" && <>
        <label>{t("business.code")}<input required value={event.code} onChange={e => change({ ...event, code: e.target.value })} /></label>
        <label>{t("business.quantity")}<input required inputMode="decimal" maxLength={40} value={event.quantity} onChange={e => change({ ...event, quantity: e.target.value })} /></label>
        <label>{t("business.unit")}<input required maxLength={40} value={event.unit} onChange={e => change({ ...event, unit: e.target.value })} /></label>
      </>}
      {(event.operation === "cash_service" || event.operation === "statistics") && <><p>{t("journal.dimensionHelp")}</p><DimensionFields keys={[...new Set([...dimensionKeys, ...Object.keys(event.dimensions)])]} value={event.dimensions} change={dimensions => change({ ...event, dimensions })} /></>}
      {event.operation === "cash_service.cancel" && <p>{t("business.original")}: {event.originalId}</p>}
      {event.operation === "clearing.match" && <ClearingEditor event={event} company={company} t={t} language={language} change={change} />}
      <button type="submit">{t("journal.preview")}</button><button type="button" onClick={close}>{t("journal.cancel")}</button>
    </fieldset>
  </form>;
}
function ClearingEditor({ event, company, t, language, change }: { event: Extract<BusinessEventDto, { operation: "clearing.match" }>; company: CompanyDto; t: T; language: Language; change: (event: BusinessEventDto) => void }) {
  const [enabled, setEnabled] = useState(false), valid = /^[1-9]\d{3}$/u.test(event.account) && /^\d{4}-\d\d-\d\d$/u.test(event.date);
  const page = usePage("events/open-items", company.code, openClearingPageSchema, `&account=${encodeURIComponent(event.account)}&date=${encodeURIComponent(event.date)}`, enabled && valid);
  return <>
    <label>{t("journal.account")}<input required pattern="[1-9][0-9]{3}" value={event.account} onChange={e => change({ ...event, account: e.target.value, lines: [] })} /></label>
    <p>{t("business.clearHelp")}</p><button type="button" disabled={!valid} onClick={() => { setEnabled(true); if (enabled) void page.refetch(); }}>{t("business.openItems")}</button>
    {enabled && valid && <PageTable page={page} t={t} title={t("business.openItems")} header={[t("journal.original"), t("journal.debit"), t("journal.credit"), ""]}
      render={line => <><td>{line.entryId} / {line.lineNo} · {line.date} · {line.memo}</td><td>{formatMinor(line.debit, language, company.scale)}</td><td>{formatMinor(line.credit, language, company.scale)}</td><td><label>{t("business.select")}<input type="checkbox" checked={event.lines.some(item => item.entryId === line.entryId && item.lineNo === line.lineNo)} onChange={e => change({ ...event, lines: e.target.checked ? [...event.lines, { entryId: line.entryId, lineNo: line.lineNo }] : event.lines.filter(item => item.entryId !== line.entryId || item.lineNo !== line.lineNo) })} /></label></td></>} />}
    <VirtualRows items={event.lines} title={t("business.selected")} header={[t("journal.original"), t("journal.line"), ""]} render={line => <><td>{line.entryId}</td><td>{line.lineNo}</td><td><button type="button" onClick={() => change({ ...event, lines: event.lines.filter(item => item.entryId !== line.entryId || item.lineNo !== line.lineNo) })}>{t("journal.remove")}</button></td></>} />
  </>;
}
function BusinessSettings({ company, t, dimensionKeys, lock }: { company: CompanyDto; t: T; dimensionKeys: string[]; lock: (value: boolean) => void }) {
  const [kind, setKind] = useState<"services" | "parties" | "rules">("services"), [editing, setEditing] = useState(false);
  useEffect(() => { lock(editing); return () => lock(false); }, [editing, lock]);
  return <section><h3>{t("business.settings")}</h3><div className="journal-actions">{(["services", "parties", "rules"] as const).map(item => <button key={item} type="button" aria-pressed={kind === item} disabled={editing} onClick={() => setKind(item)}>{t(`business.${item}`)}</button>)}</div>
    {kind === "rules" ? <RuleSettings company={company} t={t} dimensionKeys={dimensionKeys} lock={setEditing} /> : <MasterSettings key={kind} kind={kind} company={company} t={t} dimensionKeys={dimensionKeys} lock={setEditing} />}
  </section>;
}
function MasterSettings({ kind, company, t, dimensionKeys, lock }: { kind: "services" | "parties"; company: CompanyDto; t: T; dimensionKeys: string[]; lock: (value: boolean) => void }) {
  const page = usePage(kind, company.code, businessMastersPageSchema), client = useQueryClient(), form = useRef<HTMLFormElement>(null);
  const [value, setValue] = useState<BusinessMasterDto | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<unknown>(), [saved, setSaved] = useState(false);
  const working = useRef(false), alive = useRef(true), editing = value !== null;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { lock(editing || busy); if (editing) form.current?.querySelector<HTMLInputElement>("input:not(:disabled)")?.focus(); return () => lock(false); }, [editing, busy, lock]);
  return <>
    <button type="button" disabled={editing || busy} onClick={() => { setValue({ code: "", name: "", group: "", active: true, revision: 0, dimensions: {} }); setError(undefined); setSaved(false); }}>{t("business.new")}</button>
    <PageTable page={page} t={t} title={t(`business.${kind}`)} header={[t("business.code"), t("business.name"), t("business.group"), ""]} render={item => <><td>{item.code}</td><td>{item.name}</td><td>{item.group} · {item.active ? t("business.active") : "—"}</td><td><button type="button" disabled={editing || busy} onClick={() => { setValue(item); setError(undefined); setSaved(false); }}>{t("business.edit")}</button></td></>} />
    {error !== undefined && <BusinessError error={error} t={t} />}{saved && <p role="status">{t("business.saved")}</p>}
    {value && <form ref={form} onSubmit={submit => { submit.preventDefault(); if (working.current) return; working.current = true; setBusy(true); setError(undefined); void masterRequest(`/api/v1/${kind}`, businessMasterSchema, { method: "POST", body: { company: company.code, value } }).then(() => { if (alive.current) { setValue(null); setSaved(true); void client.invalidateQueries({ queryKey: ["business", company.code, kind] }); } }, cause => { if (alive.current) setError(cause); }).finally(() => { working.current = false; if (alive.current) setBusy(false); }); }}>
      <fieldset disabled={busy}><legend>{t(`business.${kind}`)}</legend>
        <label>{t("business.code")}<input required disabled={value.revision > 0} value={value.code} onChange={e => setValue({ ...value, code: e.target.value })} /></label>
        <label>{t("business.name")}<input required maxLength={80} value={value.name} onChange={e => setValue({ ...value, name: e.target.value })} /></label>
        <label>{t("business.group")}<input required value={value.group} onChange={e => setValue({ ...value, group: e.target.value })} /></label>
        <label>{t("business.active")}<input type="checkbox" checked={value.active} onChange={e => setValue({ ...value, active: e.target.checked })} /></label>
        <DimensionFields keys={[...new Set([...dimensionKeys, ...Object.keys(value.dimensions)])]} value={value.dimensions} change={dimensions => setValue({ ...value, dimensions })} />
        <button type="submit">{t("business.save")}</button><button type="button" onClick={() => { setValue(null); setError(undefined); }}>{t("journal.cancel")}</button>
      </fieldset>
    </form>}
  </>;
}
function RuleSettings({ company, t, dimensionKeys, lock }: { company: CompanyDto; t: T; dimensionKeys: string[]; lock: (value: boolean) => void }) {
  const page = usePage("posting-rules", company.code, postingRulesPageSchema), accounts = usePage("accounts", company.code, accountsPageSchema), client = useQueryClient();
  const [value, setValue] = useState<PostingRuleDto | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState<unknown>(), [saved, setSaved] = useState(false);
  const working = useRef(false), alive = useRef(true), form = useRef<HTMLFormElement>(null), editing = value !== null;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { lock(editing || busy); if (editing) form.current?.querySelector<HTMLInputElement>("input:not(:disabled)")?.focus(); return () => lock(false); }, [editing, busy, lock]);
  const newRule = (): PostingRuleDto => ({ code: "", revision: 0, active: true, direction: "receive", meaning: "cash", objectScope: "exact", objectCode: "", partyScope: "all", partyCode: "*", account: "", dimensions: {}, from: `${company.year}-01-01`, to: `${company.year}-12-31` });
  return <>
    <button type="button" disabled={editing || busy} onClick={() => { setValue(newRule()); setError(undefined); setSaved(false); }}>{t("business.new")}</button>
    <PageTable page={page} t={t} title={t("business.rules")} header={[t("business.code"), t("business.direction"), t("business.meaning"), t("journal.account"), ""]} render={item => <><td>{item.code} · {item.objectScope}/{item.objectCode} · {item.partyScope}/{item.partyCode}</td><td>{t(`business.${item.direction}`)}</td><td>{t(`business.${item.meaning}`)}</td><td>{item.account}</td><td><button type="button" disabled={editing || busy} onClick={() => { setValue(item); setError(undefined); setSaved(false); }}>{t("business.edit")}</button></td></>} />
    {error !== undefined && <BusinessError error={error} t={t} />}{saved && <p role="status">{t("business.saved")}</p>}
    {value && <form ref={form} onSubmit={submit => { submit.preventDefault(); if (working.current) return; working.current = true; setBusy(true); setError(undefined); void masterRequest("/api/v1/posting-rules", postingRuleSchema, { method: "POST", body: { company: company.code, value } }).then(() => { if (alive.current) { setValue(null); setSaved(true); void client.invalidateQueries({ queryKey: ["business", company.code, "posting-rules"] }); } }, cause => { if (alive.current) setError(cause); }).finally(() => { working.current = false; if (alive.current) setBusy(false); }); }}>
      <fieldset disabled={busy}><legend>{t("business.rules")}</legend>
        <label>{t("business.code")}<input required disabled={value.revision > 0} value={value.code} onChange={e => setValue({ ...value, code: e.target.value })} /></label>
        <label>{t("business.active")}<input type="checkbox" checked={value.active} onChange={e => setValue({ ...value, active: e.target.checked })} /></label>
        <label>{t("business.direction")}<select value={value.direction} onChange={e => { if (e.target.value === "receive" || e.target.value === "pay") setValue({ ...value, direction: e.target.value }); }}>{(["receive", "pay"] as const).map(item => <option key={item} value={item}>{t(`business.${item}`)}</option>)}</select></label>
        <label>{t("business.meaning")}<select value={value.meaning} onChange={e => { if (e.target.value === "cash" || e.target.value === "offset") setValue({ ...value, meaning: e.target.value }); }}><option value="cash">{t("business.cash")}</option><option value="offset">{t("business.offset")}</option></select></label>
        <label>{t("business.objectScope")}<select value={value.objectScope} onChange={e => { const scope = e.target.value; if (scope === "exact" || scope === "group" || scope === "all") setValue({ ...value, objectScope: scope, objectCode: scope === "all" ? "*" : "" }); }}>{(["exact", "group", "all"] as const).map(item => <option key={item} value={item}>{t(item === "group" ? "business.groupScope" : `business.${item}`)}</option>)}</select></label>
        <label>{t("business.objectCode")}<input required disabled={value.objectScope === "all"} value={value.objectCode} onChange={e => setValue({ ...value, objectCode: e.target.value })} /></label>
        <label>{t("business.partyScope")}<select value={value.partyScope} onChange={e => { const scope = e.target.value; if (scope === "exact" || scope === "group" || scope === "all") setValue({ ...value, partyScope: scope, partyCode: scope === "all" ? "*" : "" }); }}>{(["exact", "group", "all"] as const).map(item => <option key={item} value={item}>{t(item === "group" ? "business.groupScope" : `business.${item}`)}</option>)}</select></label>
        <label>{t("business.partyCode")}<input required disabled={value.partyScope === "all"} value={value.partyCode} onChange={e => setValue({ ...value, partyCode: e.target.value })} /></label>
        <label>{t("journal.account")}<input required list="business-rule-accounts" pattern="[1-9][0-9]{3}" value={value.account} onChange={e => setValue({ ...value, account: e.target.value })} /></label>
        <datalist id="business-rule-accounts">{accounts.data?.pages.flatMap(p => p.items).map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</datalist><PageControls page={accounts} t={t} />
        <label>{t("business.from")}<input required type="date" value={value.from} onChange={e => setValue({ ...value, from: e.target.value })} /></label>
        <label>{t("business.to")}<input required type="date" value={value.to} onChange={e => setValue({ ...value, to: e.target.value })} /></label>
        <DimensionFields keys={[...new Set([...dimensionKeys, ...Object.keys(value.dimensions)])]} value={value.dimensions} change={dimensions => setValue({ ...value, dimensions })} />
        <button type="submit">{t("business.save")}</button><button type="button" onClick={() => { setValue(null); setError(undefined); }}>{t("journal.cancel")}</button>
      </fieldset>
    </form>}
  </>;
}
