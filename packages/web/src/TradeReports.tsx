import { useEffect, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import {
  companiesPageSchema,
  tradeReportSchema,
  tradeReconciliationSchema,
  tradeItemDetailSchema,
  type CompanyDto,
  type TradeItemDetailDto,
} from "@erp/core/contracts";
import { masterRequest } from "./master-data-client.ts";
import { formatMinor } from "./reports-data.ts";
import { label, type Preferences } from "./ui/index.ts";
import { useInvoiceLeaveGuard } from "./TradeInvoices.tsx";
import { VirtualRows } from "./Journals.tsx";

export function TradeReports({ preferences }: { preferences: Preferences }) {
  const [params, setParams] = useSearchParams();
  const t = (key: Exclude<Parameters<typeof label>[1], "shell.httpError">) =>
    label(preferences.language, key);
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
  const company = rows.find((row) => row.code === (params.get("company") ?? rows[0]?.code));
  return (
    <section>
      <h2>{t("trpt.title")}</h2>
      <p>{t("trpt.boundary")}</p>
      {preferences.teaching && <p>{t("trpt.teaching")}</p>}
      {companies.isError && (
        <p role="alert">
          {t("master.error")}{" "}
          <button type="button" onClick={() => void companies.refetch()}>
            {t("master.retry")}
          </button>
        </p>
      )}
      {!companies.isPending && !company && <p role="alert">{t("ledger.invalid")}</p>}
      {company && (
        <CompanyReports
          key={company.code}
          company={company}
          companies={rows}
          preferences={preferences}
          changeCompany={(code) => setParams({ company: code })}
          loadCompanies={companies.hasNextPage ? () => void companies.fetchNextPage() : undefined}
        />
      )}
    </section>
  );
}
function CompanyReports({
  company,
  companies,
  preferences,
  changeCompany,
  loadCompanies,
}: {
  company: CompanyDto;
  companies: readonly CompanyDto[];
  preferences: Preferences;
  changeCompany: (company: string) => void;
  loadCompanies: (() => void) | undefined;
}) {
  const [params, setParams] = useSearchParams();
  const t = (key: Exclude<Parameters<typeof label>[1], "shell.httpError">) =>
    label(preferences.language, key);
  const money = (minor: number) => formatMinor(minor, preferences.language, company.scale);
  const party = params.get("party") ?? "",
    month = params.get("month") ?? "",
    side = params.get("side") ?? "";
  const [input, setInput] = useState({ party, month, side });
  useEffect(() => setInput({ party, month, side }), [party, month, side]);
  const dirty = input.party !== party || input.month !== month || input.side !== side;
  useInvoiceLeaveGuard({ busy: dirty, unsaved: dirty });
  const view = params.get("view") ?? "openItems";
  const valid =
    (!month || /^\d{4}-(0[1-9]|1[0-2])$/u.test(month)) &&
    (!party || /^[A-Z0-9][A-Z0-9_.:-]{0,59}$/u.test(party)) &&
    ["", "AP", "AR"].includes(side) &&
    ["openItems", "ageing", "reconciliation"].includes(view);
  const scope = new URLSearchParams({ company: company.code });
  if (month) scope.set("month", month);
  const filtered = new URLSearchParams(scope);
  if (party) filtered.set("party", party);
  if (side) filtered.set("side", side);
  const page = useInfiniteQuery({
    queryKey: ["tradeReport", company.code, month, side, party],
    enabled: valid && view !== "reconciliation",
    initialPageParam: { cursor: "", snapshot: "" },
    refetchOnMount: "always",
    queryFn: ({ pageParam, signal }) =>
      masterRequest(
        `/api/v1/trade/reports/open-items?${filtered}&limit=100${pageParam.cursor ? `&cursor=${pageParam.cursor}&snapshot=${pageParam.snapshot}` : ""}`,
        tradeReportSchema,
        { signal },
      ),
    getNextPageParam: (page) =>
      page.nextCursor ? { cursor: page.nextCursor, snapshot: page.snapshot } : undefined,
  });
  const reconciliation = useQuery({
    queryKey: ["tradeReconciliation", company.code, month],
    enabled: valid && view === "reconciliation",
    refetchOnMount: "always",
    queryFn: ({ signal }) =>
      masterRequest(`/api/v1/trade/reports/reconciliation?${scope}`, tradeReconciliationSchema, {
        signal,
      }),
  });
  const id = params.get("item");
  const detail = useQuery({
    queryKey: ["tradeItemDetail", company.code, month, id],
    enabled: valid && !!id,
    refetchOnMount: "always",
    queryFn: ({ signal }) =>
      masterRequest(
        `/api/v1/trade/reports/open-items/${encodeURIComponent(id ?? "")}?${scope}`,
        tradeItemDetailSchema,
        { signal },
      ),
  });
  const rows = page.data?.pages.flatMap((p) => p.items) ?? [],
    totals = page.data?.pages[0]?.totals;
  function change(fields: Record<string, string>) {
    setParams({ ...Object.fromEntries(params), company: company.code, ...fields, item: "" });
  }
  const failure =
    (view === "reconciliation" ? reconciliation.error : page.error) ?? (id ? detail.error : null);
  return (
    <>
      <label htmlFor="trpt-company">{t("master.company")}</label>
      <select
        id="trpt-company"
        value={company.code}
        disabled={dirty}
        onChange={(e) => changeCompany(e.target.value)}
      >
        {companies.map((row) => (
          <option key={row.code} value={row.code}>
            {row.code} · {row.name}
          </option>
        ))}
      </select>
      {loadCompanies && (
        <button type="button" onClick={loadCompanies}>
          {t("master.loadMore")}
        </button>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          change(input);
        }}
      >
        <label htmlFor="trpt-month">{t("trpt.month")}</label>
        <input
          id="trpt-month"
          type="month"
          value={input.month}
          onChange={(e) => setInput({ ...input, month: e.target.value })}
        />
        <label htmlFor="trpt-party">{t("trpt.party")}</label>
        <input
          id="trpt-party"
          value={input.party}
          maxLength={60}
          onChange={(e) => setInput({ ...input, party: e.target.value })}
        />
        <label htmlFor="trpt-side">{t("tinv.side")}</label>
        <select
          id="trpt-side"
          value={input.side}
          onChange={(e) => setInput({ ...input, side: e.target.value })}
        >
          <option value="">{t("trpt.all")}</option>
          <option>AP</option>
          <option>AR</option>
        </select>
        <button type="submit">{t("trpt.apply")}</button>
        <button type="button" onClick={() => setInput({ party, month, side })}>
          {t("trpt.clear")}
        </button>
      </form>
      <nav aria-label={t("trpt.title")}>
        {(["openItems", "ageing", "reconciliation"] as const).map((value) => (
          <button
            key={value}
            type="button"
            disabled={dirty}
            aria-current={view === value ? "page" : undefined}
            onClick={() => change({ view: value })}
          >
            {t(`trpt.${value}`)}
          </button>
        ))}
      </nav>
      <button
        type="button"
        disabled={dirty}
        onClick={() => {
          if (view === "reconciliation") void reconciliation.refetch();
          else void page.refetch();
          if (id) void detail.refetch();
        }}
      >
        {t("trpt.refresh")}
      </button>
      {!valid && <p role="alert">{t("master.error")}</p>}
      {failure && (
        <p role="alert">
          {t("master.error")}{" "}
          <button
            type="button"
            onClick={() => {
              if (view === "reconciliation") void reconciliation.refetch();
              else void page.refetch();
              if (id) void detail.refetch();
            }}
          >
            {t("master.retry")}
          </button>
        </p>
      )}
      {(view === "reconciliation" ? reconciliation.isFetching : page.isFetching) && (
        <p role="status">{t("master.loading")}</p>
      )}
      {valid && view !== "reconciliation" && !page.isError && totals && (
        <>
          <p>
            {month ? page.data?.pages[0]?.asOf : t("trpt.current")} · {company.currency}
          </p>
          <dl>
            {(Object.keys(totals) as (keyof typeof totals)[]).map((key) => (
              <div key={key}>
                <dt>{t(`trpt.${key}`)}</dt>
                <dd>{money(totals[key])}</dd>
              </div>
            ))}
          </dl>
          <VirtualRows
            items={rows}
            title={t(view === "ageing" ? "trpt.ageing" : "trpt.openItems")}
            header={(
              [
                "document",
                "kind",
                "party",
                "net",
                "tax",
                "gross",
                "due",
                "days",
                "ageing",
                "version",
              ] as const
            ).map((key) => t(`trpt.${key}`))}
            render={(row) => (
              <>
                <td>
                  <button
                    type="button"
                    disabled={dirty}
                    onClick={() =>
                      setParams({
                        ...Object.fromEntries(params),
                        company: company.code,
                        item: row.documentId,
                      })
                    }
                  >
                    {row.externalNo}
                  </button>
                </td>
                <td>
                  {row.side} · {t(`trpt.${row.kind}`)}
                </td>
                <td>{row.party}</td>
                <td>{money(row.remainingNetMinor)}</td>
                <td>{money(row.remainingTaxMinor)}</td>
                <td>{money(row.remainingGrossMinor)}</td>
                <td>{row.dueDate ?? t("trpt.none")}</td>
                <td>{row.overdueDays ?? t("trpt.none")}</td>
                <td>{row.ageingBucket ? t(`trpt.${row.ageingBucket}`) : t("trpt.none")}</td>
                <td>
                  {row.version} / {row.currentVersion}
                </td>
              </>
            )}
          />
          {rows.length === 0 && <p>{t("trpt.empty")}</p>}
          {page.hasNextPage && (
            <button
              type="button"
              disabled={page.isFetchingNextPage}
              onClick={() => void page.fetchNextPage()}
            >
              {t("master.loadMore")}
            </button>
          )}
        </>
      )}
      {valid && view === "reconciliation" && (
        <>
          <p>{t("trpt.reconcileNote")}</p>
          {reconciliation.data && !reconciliation.isError && (
            <VirtualRows
              items={reconciliation.data.rows}
              title={t("trpt.reconciliation")}
              header={[
                t("journal.account"),
                ...(
                  ["subledger", "tradeGl", "other", "gl", "tradeDifference", "difference"] as const
                ).map((key) => t(`trpt.${key}`)),
              ]}
              render={(row) => (
                <>
                  <td>
                    {month ? (
                      <Link
                        to={`/ledger?${new URLSearchParams({ company: company.code, month, account: row.account })}`}
                      >
                        {row.account}
                      </Link>
                    ) : (
                      row.account
                    )}
                  </td>
                  {[
                    row.subledgerMinor,
                    row.tradeGlMinor,
                    row.otherSourceMinor,
                    row.glMinor,
                    row.tradeDifferenceMinor,
                    row.differenceMinor,
                  ].map((n, i) => (
                    <td
                      key={
                        ["subledger", "trade", "other", "gl", "tradeDifference", "difference"][i]
                      }
                    >
                      {money(n)}
                    </td>
                  ))}
                </>
              )}
            />
          )}
        </>
      )}
      {detail.data && !detail.isError && id && (
        <ItemDetail detail={detail.data} preferences={preferences} company={company} />
      )}
    </>
  );
}
function ItemDetail({
  detail,
  preferences,
  company,
}: {
  detail: TradeItemDetailDto;
  preferences: Preferences;
  company: CompanyDto;
}) {
  const t = (key: Exclude<Parameters<typeof label>[1], "shell.httpError">) =>
    label(preferences.language, key);
  const money = (n: number) => formatMinor(n, preferences.language, company.scale);
  const row = detail.selected;
  const journal = (id: string) => `/journals?${new URLSearchParams({ company: company.code, id })}`;
  return (
    <section aria-label={t("trpt.detail")}>
      <h3>
        {t("trpt.detail")}: {row.externalNo}
      </h3>
      <p>
        {t("trpt.source")}: {row.sourceReference} ·{" "}
        <Link to={journal(row.journalId)}>{t("journal.title")}</Link>
      </p>
      <p>
        {t("trpt.document")}: {row.documentId} · {row.accountingDate} · {row.documentDate} ·{" "}
        {row.controlAccount}
      </p>
      {detail.originalDocumentId && (
        <Link
          to={`/trade-reports?${new URLSearchParams({
            company: company.code,
            item: detail.originalDocumentId,
            ...(detail.asOf ? { month: detail.asOf.slice(0, 7) } : {}),
          })}`}
        >
          {t("trpt.original")}
        </Link>
      )}
      {detail.document && (
        <div className="table-scroll">
          <table aria-label={t("trpt.document")}>
            <thead>
              <tr>
                <th>{t("tinv.product")}</th>
                <th>{t("tinv.quantity")}</th>
                <th>{t("tinv.net")}</th>
                <th>{t("tinv.tax")}</th>
                <th>{t("tinv.gross")}</th>
              </tr>
            </thead>
            <tbody>
              {detail.document.lines.map((line) => (
                <tr key={line.lineId}>
                  <td>{line.product}</td>
                  <td>{line.quantity}</td>
                  <td>{money(line.net)}</td>
                  <td>{money(line.tax)}</td>
                  <td>{money(line.gross)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p>
        {t("trpt.version")}: {row.version} / {row.currentVersion}
      </p>
      <p>
        {t("trpt.gross")}: {money(row.remainingGrossMinor)} · {t("trpt.currentBalance")}:{" "}
        {money(detail.current.remainingGross)}
      </p>
      <h4>{t("trpt.settlements")}</h4>
      {detail.settlements.map((s) => (
        <p key={s.paymentId}>
          {s.sourceRef} ·{" "}
          {money(s.allocations.find((a) => a.itemId === row.documentId)?.gross ?? 0)}
          {s.journalIds.map((id) => (
            <Link key={id} to={journal(id)}>
              {t("journal.title")}
            </Link>
          ))}
        </p>
      ))}
      {detail.actions.map((a) => (
        <p key={a.command.actionId}>
          {a.receipt.sourceRef} · {a.command.accountingDate}
          {a.receipt.journalIds.map((id) => (
            <Link key={id} to={journal(id)}>
              {t("journal.title")}
            </Link>
          ))}
        </p>
      ))}
    </section>
  );
}
