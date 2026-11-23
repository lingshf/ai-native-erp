import type { CompanyDto } from "@erp/core/contracts";
import type { Preferences } from "../ui/index.ts";
import { formatMinor } from "../reports-data.ts";
import type { OrderFilter } from "../trade-order-link.ts";
import { FastTab } from "../ui/components/index.tsx";
import type { T, Guard } from "./order-model.ts";
import { OrderList } from "./order-list.tsx";
import { OrderLookup } from "./order-lookup.tsx";
import { OrderView } from "./order-view.tsx";
import { useOrderEntryState } from "./use-order-entry.ts";
import { bindOrderCommands } from "./order-entry-commands.ts";
import { fieldErrors } from "./order-entry-fields.tsx";
import { OrderCommandBar } from "./order-command-bar.tsx";
import { OrderErrorBar, OrderPreviewResult, OrderSavedNotice } from "./order-messages.tsx";
import { OrderOptionLists, OrderOptionsFailed, orderOptions } from "./order-option-lists.tsx";
import { OrderGeneralTab } from "./order-general-tab.tsx";
import { OrderLinesTab } from "./order-lines-tab.tsx";

type OrderWorkspaceProps = {
  company: CompanyDto;
  preferences: Preferences;
  t: T;
  onGuard: (guard: Guard) => void;
  linkOrder: string | null;
  params: URLSearchParams;
  onFilter: (filter: OrderFilter) => void;
  onLink: (orderId: string | null) => void;
  // Recovery from a bad order link removes `order` and names this company (TORD-07 rule 3).
  onBack: () => void;
};

export function OrderWorkspace(props: OrderWorkspaceProps) {
  const { company, preferences, t, onGuard, linkOrder, params, onFilter, onLink, onBack } = props;
  const language = preferences.language;
  const entry = useOrderEntryState(company, linkOrder, onGuard);
  const commands = bindOrderCommands({ ...entry, company, t, linkOrder, onLink });
  const { draft, busy, failure, saved, preview } = entry;
  const options = orderOptions(entry, draft.side);
  const errors = fieldErrors(failure, t);
  const money = (value: number) => formatMinor(value, language, company.scale);

  return (
    <>
      <form
        className="tord-entry"
        aria-label={t("tord.entry")}
        onSubmit={(event) => void commands.save(event)}
      >
        <OrderCommandBar
          t={t}
          working={entry.working}
          busy={busy}
          dirty={entry.dirty}
          previewed={preview !== null}
          previewButton={entry.previewButton}
          onPreview={commands.preview}
          onDiscard={commands.discard}
        />
        {failure && <OrderErrorBar t={t} failure={failure} />}
        {saved && <OrderSavedNotice t={t} saved={saved} notice={entry.savedNotice} />}
        {preview && (
          <OrderPreviewResult t={t} preview={preview} money={money} result={entry.previewResult} />
        )}
        {options.failed && <OrderOptionsFailed t={t} />}
        <OrderGeneralTab
          t={t}
          language={language}
          currency={company.currency}
          draft={draft}
          busy={busy}
          errors={errors}
          onEdit={commands.edit}
        />
        <OrderLinesTab
          t={t}
          draft={draft}
          busy={busy}
          preview={preview}
          money={money}
          errors={errors}
          commands={commands}
        />
        <OrderOptionLists options={options} />
      </form>
      {saved && (
        <FastTab id="tord-saved" title={t("tord.savedTitle")} summary={saved.orderId}>
          <OrderView order={saved} company={company} language={language} money={money} t={t} />
        </FastTab>
      )}
      <OrderList
        company={company}
        language={language}
        money={money}
        t={t}
        params={params}
        onFilter={onFilter}
        onOpen={(orderId) => commands.open(orderId, true)}
      />
      <OrderLookup
        company={company}
        language={language}
        money={money}
        t={t}
        request={entry.opened}
        onLookup={(orderId) => commands.open(orderId, false)}
        onBack={onBack}
      />
    </>
  );
}
