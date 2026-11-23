import { useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { companiesPageSchema } from "@erp/core/contracts";
import { label, type Preferences } from "./ui/index.ts";
import { orderLabel } from "./ui/trade-order-labels.ts";
import { masterRequest } from "./master-data-client.ts";
import {
  nextOrderParams,
  noOrderFilter,
  orderFilterChange,
  type OrderLinkChange,
} from "./trade-order-link.ts";
import { MessageBar, PageHeader, TeachingTip } from "./ui/components/index.tsx";
import { type T, idleGuard } from "./trade-orders/order-model.ts";
import { useOrderLeaveGuard } from "./trade-orders/use-order-leave-guard.ts";
import { OrderWorkspace } from "./trade-orders/order-workspace.tsx";
import { restartOrderList } from "./trade-orders/order-list.tsx";
import "./pages/trade-orders.css";
export function TradeOrders({ preferences }: { preferences: Preferences }) {
  const language = preferences.language;
  const t: T = (key, params) => orderLabel(language, key, params);
  const [selected, setSelected] = useState("");
  const [params, setParams] = useSearchParams();
  const [guard, setGuard] = useState(idleGuard);
  useOrderLeaveGuard(guard, t("tord.leaveConfirm"));
  const companies = useInfiniteQuery({
    queryKey: ["companies"],
    initialPageParam: "",
    refetchOnMount: true,
    queryFn: ({ pageParam, signal }) =>
      masterRequest(
        `/api/v1/companies?limit=100${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        companiesPageSchema,
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const rows = companies.data?.pages.flatMap((page) => page.items) ?? [];
  // A parameter that is absent takes the default; one that is present (even empty) must match.
  const linkCompany = params.get("company");
  const linkOrder = params.get("order");
  const company = rows.find((row) => row.code === (linkCompany ?? (selected || rows[0]?.code)));
  const companyMissing = linkCompany !== null && companies.isSuccess && !company;
  const client = useQueryClient();
  // TORD-07: every write replaces the entry (no history, no leave confirmation) and names the
  // company (rule 3).
  const link = (change: OrderLinkChange) =>
    setParams((current) => nextOrderParams(current, change), { replace: true });
  // Rule 3: a company change clears the filters and order and restarts that company's list.
  const switchTo = (code: string) => {
    restartOrderList(client, code, noOrderFilter);
    link({ company: code, order: null, ...orderFilterChange(noOrderFilter) });
  };
  return (
    <section className="page trade-orders">
      <PageHeader
        title={t("tord.title")}
        description={t("tord.description")}
        context={
          <div className="field">
            <label htmlFor="tord-company">{label(language, "master.company")}</label>
            <select
              id="tord-company"
              value={company?.code ?? ""}
              disabled={guard.busy}
              onChange={(event) => {
                if (!guard.unsaved || window.confirm(t("tord.leaveConfirm"))) {
                  setSelected(event.target.value);
                  switchTo(event.target.value);
                }
              }}
            >
              {rows.map((row) => (
                <option key={row.code} value={row.code}>
                  {row.code} · {row.name}
                </option>
              ))}
            </select>
          </div>
        }
      />
      <TeachingTip teaching={preferences.teaching} title={t("tord.teachingTitle")}>
        {t("tord.teaching")}
      </TeachingTip>
      {companies.isPending && <p role="status">{label(language, "master.loading")}</p>}
      {companies.isError && (
        <MessageBar tone="danger" role="alert">
          <p>{label(language, "master.error")}</p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void companies.refetch()}
          >
            {label(language, "master.retry")}
          </button>
        </MessageBar>
      )}
      {companyMissing && (
        <MessageBar tone="danger" role="alert">
          <p>
            {t("tord.deepLink.company")} · {linkCompany}
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              // Back to the list the page falls back to, named in the address (rule 3). With no
              // company to fall back to (D429) nothing is written and the message stays.
              const fallback = selected || rows[0]?.code;
              if (!fallback) return;
              switchTo(fallback);
              document.getElementById("tord-company")?.focus();
            }}
          >
            {t("tord.deepLink.back")}
          </button>
        </MessageBar>
      )}
      {company && (
        <OrderWorkspace
          key={company.code}
          company={company}
          preferences={preferences}
          t={t}
          onGuard={setGuard}
          linkOrder={linkOrder}
          params={params}
          onFilter={(filter) => link({ company: company.code, ...orderFilterChange(filter) })}
          onLink={(order) => link({ company: company.code, order })}
          onBack={() => link({ company: company.code, order: null })}
        />
      )}
    </section>
  );
}
