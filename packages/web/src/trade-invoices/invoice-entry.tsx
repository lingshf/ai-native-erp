import type { CompanyDto } from "@erp/core/contracts";
import type { Preferences } from "../ui/index.ts";
import { formatMinor } from "../reports-data.ts";
import { FastTab, MessageBar, TeachingTip } from "../ui/components/index.tsx";
import type { Guard, T } from "./invoice-model.ts";
import { PreviewPanel } from "./preview-panel.tsx";
import { bindInvoiceCommands, invoiceEntryContext } from "./invoice-entry-commands.ts";
import { InvoiceCommandBar } from "./invoice-command-bar.tsx";
import { InvoiceErrorBar, InvoiceReceiptBar, OrderIntakeBar } from "./invoice-messages.tsx";
import { InvoiceGeneralTab } from "./invoice-general-tab.tsx";
import { InvoiceLinesTab } from "./invoice-lines-tab.tsx";
import { useAddLineShortcut, useInvoiceEntryState, useOrderIntake } from "./use-invoice-entry.ts";

export function InvoiceEntry({
  company,
  preferences,
  t,
  onGuard,
  intake,
  onIntake,
}: {
  company: CompanyDto;
  preferences: Preferences;
  t: T;
  onGuard: (guard: Guard) => void;
  intake: string | null;
  onIntake: (done: null) => void;
}) {
  const entry = invoiceEntryContext(useInvoiceEntryState(company, onGuard), company, t);
  const { draft, dirty, preview, pending, busy, error, retry, receipt, fromOrder } = entry;
  const { firstField, stale, locked } = entry;
  const commands = bindInvoiceCommands(entry);
  useOrderIntake(fromOrder, intake, onIntake, commands.fillFromOrder);
  useAddLineShortcut(locked, commands.addLine);
  const money = (value: number) => formatMinor(value, preferences.language, company.scale);

  return (
    <form
      className="tinv-entry"
      aria-label={t("tinv.entry")}
      onSubmit={(event) => void commands.runPreview(event)}
    >
      <InvoiceCommandBar
        t={t}
        busy={busy}
        dirty={dirty}
        locked={locked}
        previewed={preview !== null}
        stale={stale}
        onConfirm={commands.confirm}
        onDiscard={commands.discard}
      />
      {error && (
        <InvoiceErrorBar
          t={t}
          error={error}
          retry={retry}
          pending={pending}
          busy={busy}
          onRetry={commands.post}
        />
      )}
      {receipt && <InvoiceReceiptBar t={t} receipt={receipt} money={money} />}
      {fromOrder && (
        <OrderIntakeBar t={t} fromOrder={fromOrder} busy={busy} onRetry={commands.fillFromOrder} />
      )}
      {stale && (
        <MessageBar tone="warning" role="alert">
          {t("tinv.stale")}
        </MessageBar>
      )}
      <TeachingTip teaching={preferences.teaching} title={t("master.teachingTitle")}>
        {t("tinv.teaching")}
        {fromOrder?.status === "loaded" && (
          <>
            <br />
            {t("tinv.fromOrder.teaching")}
          </>
        )}
      </TeachingTip>
      <InvoiceGeneralTab
        t={t}
        draft={draft}
        locked={locked}
        firstField={firstField}
        onEdit={commands.edit}
      />
      <InvoiceLinesTab
        t={t}
        draft={draft}
        locked={locked}
        onEdit={commands.edit}
        onAddLine={commands.addLine}
        onEditLine={commands.editLine}
        onRemoveLine={commands.removeLine}
      />
      {preview && (
        <FastTab
          id="tinv-preview"
          title={t("tinv.previewTitle")}
          summary={t("tinv.previewSummary")}
        >
          <PreviewPanel
            preview={preview.value}
            money={money}
            language={preferences.language}
            t={t}
          />
        </FastTab>
      )}
    </form>
  );
}
