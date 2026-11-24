import { useCallback, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  companiesPageSchema,
  periodsPageSchema,
  type CompanyDto,
  type PeriodDto,
} from "@erp/core/contracts";
import { label, type LabelKey, type Preferences } from "./ui/index.ts";
import { masterRequest } from "./master-data-client.ts";
import { TradePeriodAdmission } from "./TradePeriodAdmission.tsx";
import { Badge, MessageBar, PageHeader, TeachingTip } from "./ui/components/index.tsx";
import { CloseWizard } from "./period-close/close-wizard.tsx";
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
        description={t("close.description")}
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
