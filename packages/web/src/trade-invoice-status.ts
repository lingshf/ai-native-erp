import type { TradeInvoiceDetailDto } from "@erp/core/contracts";
import type { Tone } from "./ui/components/index.tsx";

// TINV-08: shared by the invoice page (list, preview) and the detail dialog, which must not
// import the page module (circular import, lazy chunks merged).
type PoMatch = TradeInvoiceDetailDto["document"]["poMatch"];
type OpenItemStatus = TradeInvoiceDetailDto["openItem"]["status"];

export const poMatchTone: Readonly<Record<PoMatch, Tone>> = {
  matched: "success",
  exception: "warning",
  notApplicable: "info",
};

export const openItemTone: Readonly<Record<OpenItemStatus, Tone>> = {
  open: "warning",
  settled: "success",
  cancelled: "info",
};
