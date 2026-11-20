import { useCallback, useEffect, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  companiesPageSchema,
  periodsPageSchema,
  periodSchema,
  closePreviewSchema,
  closeResultSchema,
  type CompanyDto,
  type PeriodDto,
  type ClosePreviewDto,
  type CloseResultDto,
} from "@erp/core/contracts";
import { label, type LabelKey, type Preferences } from "./ui/index.ts";
import { MasterDataFailure, masterRequest } from "./master-data-client.ts";
import { formatMinor } from "./reports-data.ts";
import { VirtualRows } from "./Journals.tsx";
import { TradePeriodAdmission } from "./TradePeriodAdmission.tsx";
import { Badge, FastTab, MessageBar, PageHeader, TeachingTip } from "./ui/components/index.tsx";
import "./pages/period-close.css";
export function PeriodClose({ preferences }: { preferences: Preferences }) {
  const [params, setParams] = useSearchParams();
  const [locked, setLocked] = useState(false);
  const [admissionLocked, setAdmissionLocked] = useState(false);
  const [admissionSaved, setAdmissionSaved] = useState<{ company: string; month: string } | null>(
    null,
  );
  const [held, setHeld] = useState<{ company: CompanyDto; period: PeriodDto } | null>(null);
  const t = (key: Exclude<LabelKey, "shell.httpError">) => label(preferences.language, key);
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
  const periods = useInfiniteQuery({
    queryKey: ["close-periods", company?.code],
    enabled: !!company,
    initialPageParam: "",
    queryFn: ({ pageParam, signal }) =>
      masterRequest(
        `/api/v1/periods?company=${encodeURIComponent(company?.code ?? "")}&limit=100${pageParam ? `&cursor=${pageParam}` : ""}`,
        periodsPageSchema,
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const months = periods.data?.pages.flatMap((page) => page.items) ?? [];
  const period = months.find(
    (item) =>
      item.month ===
      (params.get("month") ??
        months.find((row) => row.status === "open")?.month ??
        months.at(-1)?.month),
  );
  const lock = useCallback(
    (value: boolean) => {
      if (value && company && period) setHeld((current) => current ?? { company, period });
      if (!value) setHeld(null);
      setLocked(value);
    },
    [company, period],
  );
  const selectedCompany = held?.company ?? company,
    selectedPeriod = held?.period ?? period;
  const companyOptions =
    held && !items.some((item) => item.code === held.company.code)
      ? [held.company, ...items]
      : items;
  const periodOptions =
    held && !months.some((item) => item.month === held.period.month)
      ? [held.period, ...months]
      : months;
  const error = companies.error ?? periods.error;
  return (
    <section className="page period-close">
      <PageHeader
        title={t("close.title")}
        context={
          <>
            <div className="field">
              <label htmlFor="close-company">{t("master.company")}</label>
              <select
                id="close-company"
                disabled={locked || admissionLocked}
                value={selectedCompany?.code ?? ""}
                onChange={(event) => setParams({ company: event.target.value })}
              >
                {companyOptions.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.code} · {item.name}
                  </option>
                ))}
              </select>
            </div>
            {companies.hasNextPage && (
              <button
                className="btn btn-secondary"
                disabled={locked || admissionLocked}
                type="button"
                onClick={() => void companies.fetchNextPage()}
              >
                {t("master.loadMore")}
              </button>
            )}
            <div className="field">
              <label htmlFor="close-month">{t("ledger.period")}</label>
              <select
                id="close-month"
                disabled={locked || admissionLocked}
                value={selectedPeriod?.month ?? ""}
                onChange={(event) =>
                  setParams({ company: company?.code ?? "", month: event.target.value })
                }
              >
                {periodOptions.map((item) => (
                  <option key={item.month}>{item.month}</option>
                ))}
              </select>
            </div>
            {periods.hasNextPage && (
              <button
                className="btn btn-secondary"
                disabled={locked}
                type="button"
                onClick={() => void periods.fetchNextPage()}
              >
                {t("master.loadMore")}
              </button>
            )}
          </>
        }
      />
      <MessageBar tone="info">{t("close.note")}</MessageBar>
      {error && (
        <MessageBar tone="danger" role="alert">
          {t("close.error")}{" "}
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => void (companies.isError ? companies.refetch() : periods.refetch())}
          >
            {t("master.retry")}
          </button>
        </MessageBar>
      )}
      {!held && !companies.isPending && (!company || (!periods.isPending && !period)) && (
        <MessageBar tone="danger" role="alert">
          {t("ledger.invalid")}
        </MessageBar>
      )}
      <TeachingTip teaching={preferences.teaching} title={t("master.teachingTitle")}>
        {t("close.teaching")}
      </TeachingTip>
      {selectedCompany && selectedPeriod && (
        <fieldset disabled={admissionLocked} aria-label={t("close.title")}>
          <CloseWizard
            key={`${selectedCompany.code}:${selectedPeriod.month}`}
            company={selectedCompany}
            period={selectedPeriod}
            preferences={preferences}
            setLocked={lock}
            next={(month) => {
              lock(false);
              setParams({ company: selectedCompany.code, month });
            }}
          />
        </fieldset>
      )}
      {selectedCompany && selectedPeriod && (
        <TradePeriodAdmission
          key={`admission:${selectedCompany.code}:${selectedPeriod.month}:${selectedPeriod.revision}`}
          company={selectedCompany.code}
          period={selectedPeriod}
          preferences={preferences}
          lock={setAdmissionLocked}
          disabled={locked}
          onSaved={() =>
            setAdmissionSaved({ company: selectedCompany.code, month: selectedPeriod.month })
          }
        />
      )}
      {!admissionLocked &&
        admissionSaved?.company === selectedCompany?.code &&
        admissionSaved?.month === selectedPeriod?.month && (
          <MessageBar tone="success" role="status">
            {t("trpt.saved")}
          </MessageBar>
        )}
      {months.length > 0 && (
        <div className="card">
          <div className="grid-wrap">
            <table className="grid">
              <caption>{t("close.periods")}</caption>
              <thead>
                <tr>
                  {(["ledger.period", "tadj.status"] as const).map((key) => (
                    <th key={key} scope="col">
                      {t(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {months.map((item) => (
                  <tr key={item.month} aria-current={item.month === selectedPeriod?.month}>
                    <td>{item.month}</td>
                    <td>
                      <Badge tone={tones[item.status]}>{t(`close.status.${item.status}`)}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
const tones = { open: "info", frozen: "warning", closed: "success" } as const;
type Pending =
  | {
      action: "close";
      body: {
        company: string;
        revision: number;
        commandId: string;
        fingerprint: string;
        confirmation: "CLOSE";
      };
    }
  | { action: "open-next"; body: { company: string; revision: number } };
function CloseWizard({
  company,
  period,
  preferences,
  setLocked,
  next,
}: {
  company: CompanyDto;
  period: PeriodDto;
  preferences: Preferences;
  setLocked: (locked: boolean) => void;
  next: (month: string) => void;
}) {
  const client = useQueryClient();
  const [preview, setPreview] = useState<ClosePreviewDto | null>(null);
  const [result, setResult] = useState<CloseResultDto | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(
    () => setPreview((current) => (current?.revision === period.revision ? current : null)),
    [period.revision],
  );
  const t = (key: Exclude<LabelKey, "shell.httpError">) => label(preferences.language, key);
  useEffect(() => {
    setLocked(busy || pending !== null);
  }, [busy, pending, setLocked]);
  const base = `/api/v1/periods/${period.month}`;
  const latestPeriod = result?.period ?? period;
  async function loadPreview() {
    if (busy || pending) return;
    setLocked(true);
    setBusy(true);
    setError(null);
    setResult(null);
    setPreview(null);
    const body = {
      company: company.code,
      revision: period.revision,
      commandId: crypto.randomUUID(),
    };
    try {
      const current = await masterRequest(`${base}/close-preview`, closePreviewSchema, {
        method: "POST",
        body,
      });
      if (
        current.company !== body.company ||
        current.month !== period.month ||
        current.revision !== body.revision ||
        current.commandId !== body.commandId
      )
        throw new MasterDataFailure("invalid");
      setPreview(current);
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  async function execute(command: Pending) {
    if (busy) return;
    setLocked(true);
    setPending(command);
    setBusy(true);
    setError(null);
    try {
      if (command.action === "close") {
        const closed = await masterRequest(`${base}/close`, closeResultSchema, {
          method: "POST",
          body: command.body,
        });
        if (
          closed.preview.company !== command.body.company ||
          closed.preview.month !== period.month ||
          closed.preview.commandId !== command.body.commandId ||
          closed.preview.fingerprint !== command.body.fingerprint ||
          closed.receipt.idempotencyKey !== command.body.commandId
        )
          throw new MasterDataFailure("invalid");
        setResult(closed);
        setPreview(null);
        setPending(null);
        void client.invalidateQueries({ queryKey: ["ledger-live", company.code] });
        void client.invalidateQueries({ queryKey: ["close-periods", company.code] });
      } else {
        const opened = await masterRequest(`${base}/open-next`, periodSchema, {
          method: "POST",
          body: command.body,
        });
        const year = Number(period.month.slice(0, 4)),
          month = Number(period.month.slice(5));
        const expected =
          month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
        if (opened.month !== expected || opened.status !== "open")
          throw new MasterDataFailure("invalid");
        await Promise.all([
          client.invalidateQueries({ queryKey: ["close-periods", company.code] }),
          client.invalidateQueries({ queryKey: ["ledger-periods", company.code] }),
        ]);
        setPending(null);
        next(opened.month);
      }
    } catch (failure) {
      setError(failure);
      if (
        failure instanceof MasterDataFailure &&
        failure.kind === "http" &&
        (failure.status ?? 500) < 500
      ) {
        setPending(null);
        setPreview(null);
        void client.invalidateQueries({ queryKey: ["close-periods", company.code] });
      }
    } finally {
      setBusy(false);
    }
  }
  const fmt = (value: number) => formatMinor(value, preferences.language, company.scale);
  function source(account?: string) {
    if (!preview) throw new Error("Missing close preview");
    const scope = {
      company: company.code,
      month: period.month,
      stage: "adjusted",
      watermark: String(preview.snapshot.watermark),
      accountRevision: String(preview.snapshot.accountRevision),
    };
    return account && account !== "3100"
      ? `/ledger?${new URLSearchParams({ ...scope, account })}`
      : `/ledger-reports?${new URLSearchParams({ ...scope, view: "trial" })}`;
  }
  const closedView = result || latestPeriod.status !== "open";
  return (
    <>
      <div className="bar">
        {latestPeriod.status !== "closed" && !result && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy || pending !== null}
            onClick={() => void loadPreview()}
          >
            {t("close.preview")}
          </button>
        )}
        {preview && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || pending !== null || preview.blockers.length > 0}
            onClick={() =>
              void execute({
                action: "close",
                body: {
                  company: company.code,
                  revision: preview.revision,
                  commandId: preview.commandId,
                  fingerprint: preview.fingerprint,
                  confirmation: "CLOSE",
                },
              })
            }
          >
            {t("close.confirm")}
          </button>
        )}
        {closedView && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={
              busy ||
              pending !== null ||
              ((company.closeMode === "monthly-teaching" || period.month.endsWith("-12")) &&
                latestPeriod.status !== "closed")
            }
            onClick={() =>
              void execute({
                action: "open-next",
                body: { company: company.code, revision: latestPeriod.revision },
              })
            }
          >
            {t("close.next")}
          </button>
        )}
        {pending && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => void execute(pending)}
          >
            {t("close.retry")}
          </button>
        )}
        <span>
          {period.month} · {t(`close.status.${latestPeriod.status}`)}
        </span>
      </div>
      {busy && <p role="status">{t("master.loading")}</p>}
      {error !== null && (
        <MessageBar tone={pending ? "warning" : "danger"} role="alert">
          {t(pending ? "close.unknown" : "close.error")}
        </MessageBar>
      )}
      {closedView && (
        <MessageBar tone="info">
          <p>{t("close.closed")}</p>
          {result?.receipt.journalIds.map((id) => (
            <p key={id}>
              <Link to={`/journals?${new URLSearchParams({ company: company.code, id })}`}>
                {id}
              </Link>
            </p>
          ))}
        </MessageBar>
      )}
      {preview && (
        <FastTab
          id="close-preview"
          title={t(preview.action === "freeze" ? "close.freeze" : "close.transfer")}
        >
          <dl className="kpis">
            <div className="kpi emphasis">
              <dt className="label">{t("close.net")}</dt>
              <dd className="value">
                {pending ? (
                  fmt(preview.netProfit)
                ) : (
                  <Link to={source()}>{fmt(preview.netProfit)}</Link>
                )}
              </dd>
            </div>
          </dl>
          {preview.blockers.map((blocker) => (
            <MessageBar tone="danger" role="alert" key={blocker}>
              {t(`close.block.${blocker}`)}
            </MessageBar>
          ))}
          <div className="card">
            <VirtualRows
              items={preview.lines}
              title={t("close.lines")}
              header={[t("ledger.account"), t("ledger.debit"), t("ledger.credit")]}
              render={(line) => (
                <>
                  <th>{line.account}</th>
                  {[line.debit, line.credit].map((amount, index) => (
                    <td key={index === 0 ? "debit" : "credit"}>
                      {pending ? fmt(amount) : <Link to={source(line.account)}>{fmt(amount)}</Link>}
                    </td>
                  ))}
                </>
              )}
            />
          </div>
        </FastTab>
      )}
    </>
  );
}
