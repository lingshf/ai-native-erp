import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { companiesPageSchema, type CompanyDto } from "@erp/core/contracts";
import { masterRequest } from "./master-data-client.ts";
import { formatMinor } from "./reports-data.ts";
import { label, type Preferences } from "./ui/index.ts";
import { settlementTeaching } from "./ui/trade-settlement-teaching.ts";
import { useInvoiceLeaveGuard } from "./trade-invoices/use-invoice-leave-guard.ts";
import { MessageBar, PageHeader, TeachingTip } from "./ui/components/index.tsx";
import type { Guard, Key } from "./trade-settlements/settlement-model.ts";
import { useSettlementDraft } from "./trade-settlements/use-settlement-draft.ts";
import { useOpenItems } from "./trade-settlements/use-open-items.ts";
import {
  changeCommand,
  confirmSettlement,
  runPreview,
  type SettlementContext,
} from "./trade-settlements/settlement-commands.ts";
import { SettlementCommandBar } from "./trade-settlements/settlement-command-bar.tsx";
import {
  SettlementErrorBars,
  SettlementReceiptBar,
  SettlementUncertainBar,
} from "./trade-settlements/settlement-messages.tsx";
import { SettlementGeneralTab } from "./trade-settlements/settlement-general-tab.tsx";
import { SettlementAllocationTab } from "./trade-settlements/settlement-allocation-tab.tsx";
import { SettlementResultTab } from "./trade-settlements/settlement-result-tab.tsx";
import "./pages/trade-settlements.css";
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
  onGuard: (guard: Guard) => void;
}) {
  const t = (key: Key) => label(preferences.language, key);
  const money = (minor: number) => formatMinor(minor, preferences.language, company.scale);
  const draft = useSettlementDraft(company, onGuard);
  const openItems = useOpenItems(company);
  const entry: SettlementContext = { ...draft, company, t, page: openItems.page };
  const { command, locked, saved, busy, storageFailed, uncertain, receipt, result } = draft;
  const confirm = () => confirmSettlement(entry);
  return (
    <div className="tset-entry">
      <SettlementCommandBar
        t={t}
        previewDisabled={locked || command.items.length === 0}
        confirmDisabled={locked || !draft.preview}
        onPreview={() => runPreview(entry)}
        onConfirm={confirm}
      />
      <SettlementErrorBars
        messages={[
          storageFailed && t("tinv.storageFailed"),
          openItems.page.isError && t("master.error"),
          draft.error,
        ]}
      />
      {saved.pending && uncertain && (
        <SettlementUncertainBar t={t} retryDisabled={busy || storageFailed} onRetry={confirm} />
      )}
      {receipt && <SettlementReceiptBar t={t} receipt={receipt} />}
      <TeachingTip teaching={preferences.teaching} title={t("master.teachingTitle")}>
        {settlementTeaching(preferences.language, t("tset.teaching"))}
      </TeachingTip>
      <SettlementGeneralTab
        t={t}
        command={command}
        locked={locked}
        onChange={(next) => changeCommand(entry, next)}
      />
      <SettlementAllocationTab
        t={t}
        money={money}
        company={company}
        command={command}
        locked={locked}
        openItems={openItems}
        onChange={(next) => changeCommand(entry, next)}
      />
      {result && <SettlementResultTab t={t} money={money} result={result} />}
    </div>
  );
}
