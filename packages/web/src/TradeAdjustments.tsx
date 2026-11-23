import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { companiesPageSchema, type CompanyDto } from "@erp/core/contracts";
import { masterRequest } from "./master-data-client.ts";
import { formatMinor } from "./reports-data.ts";
import { label, type Preferences } from "./ui/index.ts";
import { adjustmentTeaching } from "./ui/trade-adjustment-teaching.ts";
import { partyFilterLabels } from "./ui/trade-adjustment-filter-labels.ts";
import { useInvoiceLeaveGuard } from "./trade-invoices/use-invoice-leave-guard.ts";
import { MessageBar, PageHeader, TeachingTip } from "./ui/components/index.tsx";
import type { Draft, T } from "./trade-adjustments/action-draft.ts";
import {
  useActionDraft,
  useActionItems,
  usePreviewLines,
  type Guard,
} from "./trade-adjustments/use-action-entry.ts";
import {
  applyPartyFilter,
  changeDraft,
  clearEntry,
  runAction,
} from "./trade-adjustments/action-commands.ts";
import { ActionCommandBar } from "./trade-adjustments/action-command-bar.tsx";
import { ActionErrors, ReceiptBar, UncertainBar } from "./trade-adjustments/action-messages.tsx";
import { ActionGeneralTab } from "./trade-adjustments/action-general-tab.tsx";
import { ActionAllocationTab } from "./trade-adjustments/action-allocation-tab.tsx";
import { ActionResultTab } from "./trade-adjustments/action-result-tab.tsx";
import "./pages/trade-settlements.css";
export function TradeAdjustments({ preferences }: { preferences: Preferences }) {
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
  onGuard: (guard: Guard) => void;
}) {
  const t: T = (key) => label(preferences.language, key);
  const money = (minor: number) => formatMinor(minor, preferences.language, company.scale);
  const entry = {
    ...useActionDraft(company, onGuard),
    ...useActionItems(company),
    company,
    t,
  };
  const previewLines = usePreviewLines(entry.preview);
  const { saved, draft, locked, busy, uncertain, storageFailed, preview, receipt, page } = entry;
  const run = (confirm: boolean) => void runAction(entry, confirm);
  const change = (patch: Partial<Draft>) => changeDraft(entry, patch);
  const view = { t, money, draft, rows: entry.rows, change };
  const result = receipt ?? preview;
  const irreversible = draft.kind === "cancel" || draft.kind === "reverse";
  return (
    <div className="tadj-entry">
      <ActionCommandBar
        t={t}
        locked={locked}
        previewed={!!preview}
        irreversible={irreversible}
        onRun={run}
        onClear={() => clearEntry(entry)}
      />
      <ActionErrors
        texts={[
          storageFailed && t("tinv.storageFailed"),
          page.isError && t("master.error"),
          entry.error,
        ]}
      />
      {saved.pending && uncertain && (
        <UncertainBar t={t} disabled={busy || storageFailed} onRetry={() => run(true)} />
      )}
      {receipt && <ReceiptBar t={t} receipt={receipt} />}
      <TeachingTip teaching={preferences.teaching} title={t("master.teachingTitle")}>
        {adjustmentTeaching(preferences.language, t("tadj.teaching"))}
      </TeachingTip>
      <ActionGeneralTab view={view} locked={locked} />
      <ActionAllocationTab
        view={view}
        locked={locked}
        irreversible={irreversible}
        filter={{
          text: partyFilterLabels[preferences.language],
          value: entry.partyInput,
          onChange: entry.setPartyInput,
          onApply: () => applyPartyFilter(entry),
        }}
        page={page}
      />
      {result && (
        <ActionResultTab
          t={t}
          money={money}
          result={result}
          preview={preview}
          previewLines={previewLines}
        />
      )}
    </div>
  );
}
