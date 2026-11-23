import type { TradeInvoicePreviewDto } from "@erp/core/contracts";
import type { Language } from "../ui/index.ts";
import { FastTab } from "../ui/components/index.tsx";
import type { T } from "./invoice-model.ts";
import { PreviewPanel } from "./preview-panel.tsx";

export function InvoicePreviewTab({
  t,
  preview,
  money,
  language,
}: {
  t: T;
  preview: TradeInvoicePreviewDto;
  money: (value: number) => string;
  language: Language;
}) {
  return (
    <FastTab id="tinv-preview" title={t("tinv.previewTitle")} summary={t("tinv.previewSummary")}>
      <PreviewPanel preview={preview} money={money} language={language} t={t} />
    </FastTab>
  );
}
