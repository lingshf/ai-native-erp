import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { companiesPageSchema } from "@erp/core/contracts";
import { label, type Preferences } from "./ui/index.ts";
import { detailLabel } from "./ui/trade-invoice-detail-labels.ts";
import { masterRequest } from "./master-data-client.ts";
import { useInvoiceLeaveGuard } from "./trade-invoices/use-invoice-leave-guard.ts";
import { MessageBar, PageHeader } from "./ui/components/index.tsx";
import { failure, idleGuard, type T } from "./trade-invoices/invoice-model.ts";
import {
  addressParams,
  linkParamKeys,
  managedKeys,
  type LinkChange,
} from "./trade-invoices/invoice-link.ts";
import { InvoiceEntry } from "./trade-invoices/invoice-entry.tsx";
import { InvoiceList } from "./trade-invoices/invoice-list.tsx";
import "./pages/trade-invoices.css";

export { useInvoiceLeaveGuard } from "./trade-invoices/use-invoice-leave-guard.ts";
export { sourceOrderPath, SourceOrderCell } from "./trade-invoices/source-order.tsx";

// TINV-01: one `fromOrder` request taken from the address; `company` null means the current one.
type Intake = { company: string | null; orderId: string };

export function TradeInvoices({ preferences }: { preferences: Preferences }) {
  const t: T = (key) => label(preferences.language, key);
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState(() => params.get("company") ?? "");
  const [guard, setGuard] = useState(idleGuard);
  const [intake, setIntake] = useState<Intake | null>(null);
  useInvoiceLeaveGuard(guard, t("trade.leaveConfirm"));
  const fromOrder = params.get("fromOrder");
  // The router commits the dropped parameter in a transition, so this effect can rerun (e.g. on
  // guard.busy) while the address still shows the request: take each request only once.
  const taken = useRef<string | null>(null);
  // Take the request once and drop it from the address (replace), so a refresh never refills.
  useEffect(() => {
    if (fromOrder === null) {
      taken.current = null;
      return;
    }
    if (taken.current === fromOrder) return;
    taken.current = fromOrder;
    const target = params.get("company");
    const orderId = fromOrder.trim();
    setIntake(orderId ? { company: target || null, orderId } : null);
    if (target && !guard.busy) setSelected(target);
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("fromOrder");
        return next;
      },
      { replace: true },
    );
  }, [fromOrder, params, setParams, guard.busy]);
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
  // TINV-07: a `company` in the address wins over the picker; filters and the open invoice live
  // in the address too. Every write replaces the current entry (never push), so it adds no history
  // entry and never passes the Back/Forward gate or the leave confirmation.
  const linkCompany = params.get("company") || null;
  const linked = linkParamKeys.some((key) => params.has(key));
  const company = rows.find((row) => row.code === (linkCompany ?? selected)) ?? rows[0];
  const write = (change: LinkChange) => {
    // Merge with the address as it is now (an earlier write may not have re-rendered yet). Every
    // write sets each managed key once (dropping duplicates) and deletes the empty ones; other
    // keys stay as they are.
    const next = addressParams();
    for (const key of managedKeys) {
      const value = key in change ? change[key] : next.get(key);
      if (key === "invoice" ? value?.trim() : value) next.set(key, value as string);
      else next.delete(key);
    }
    setParams(next, { replace: true });
  };
  // An explicit target (an order link's company, or `company` with a link) is resolved apart from
  // the P1/P3 fallback: it is "missing" only once a fresh company list lacks it (P2/P4). While the
  // list is not confirmed (loading, refetching, or failed with rows still cached), an order request
  // or a link mounts nothing at all, even for a cached or implicit company (P10).
  const settled = companies.isSuccess && !companies.isFetching;
  const known = (code: string) => rows.some((row) => row.code === code);
  // The order request still in the address is the target from the first render on: the intake
  // effect only runs after it, and a cached list must not mount the default company meanwhile.
  const pendingOrder = !!fromOrder?.trim();
  const wanted = intake?.company ?? (pendingOrder ? linkCompany : null);
  const linkTarget = linked ? linkCompany : null;
  const missing = !!wanted && settled && !known(wanted);
  // A filter or invoice link for a company that is not loaded never opens another company's data.
  const linkMissing = !!linkTarget && settled && !known(linkTarget);
  const unconfirmed = !settled && (intake !== null || pendingOrder || linked);
  const backFromLink = () => {
    setIntake(null);
    write({ company: null, invoice: null, party: null, side: null, from: null, to: null });
    document.getElementById("tinv-company")?.focus();
  };
  return (
    <section className="page trade-invoices">
      <PageHeader
        title={t("tinv.title")}
        description={t("tinv.description")}
        context={
          <div className="field">
            <label htmlFor="tinv-company">{t("master.company")}</label>
            <select
              id="tinv-company"
              value={company?.code ?? ""}
              disabled={guard.busy}
              onChange={(event) => {
                setSelected(event.target.value);
                setIntake(null);
                // Filters and the open invoice belong to the previous company.
                write({
                  company: event.target.value,
                  invoice: null,
                  party: null,
                  side: null,
                  from: null,
                  to: null,
                });
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
      {(companies.isPending || (unconfirmed && companies.isFetching)) && (
        <p role="status">{t("master.loading")}</p>
      )}
      {missing && (
        <MessageBar tone="danger" role="alert">
          <p>
            {t("tinv.fromOrder.company")} · {wanted}
          </p>
          <button type="button" className="btn btn-secondary" onClick={backFromLink}>
            {t("master.cancel")}
          </button>
        </MessageBar>
      )}
      {linkMissing && !missing && (
        <MessageBar tone="danger" role="alert">
          <p>
            {detailLabel(preferences.language, "tinv.link.company")} · {linkCompany}
          </p>
          <button type="button" className="btn btn-secondary" onClick={backFromLink}>
            {detailLabel(preferences.language, "tinv.link.back")}
          </button>
        </MessageBar>
      )}
      {companies.isError && (
        <MessageBar tone="danger" role="alert">
          <p>{t(failure(companies.error).key)}</p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void companies.refetch()}
          >
            {t("master.retry")}
          </button>
        </MessageBar>
      )}
      {company && !missing && !linkMissing && !unconfirmed && (
        <>
          <InvoiceEntry
            key={company.code}
            company={company}
            preferences={preferences}
            t={t}
            onGuard={setGuard}
            intake={
              intake && (intake.company === null || intake.company === company.code)
                ? intake.orderId
                : null
            }
            onIntake={setIntake}
          />
          <InvoiceList
            company={company}
            preferences={preferences}
            t={t}
            params={params}
            write={(change) => write({ company: company.code, ...change })}
          />
        </>
      )}
    </section>
  );
}
