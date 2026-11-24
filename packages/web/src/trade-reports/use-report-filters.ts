import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { CompanyDto } from "@erp/core/contracts";
import { useInvoiceLeaveGuard } from "../trade-invoices/use-invoice-leave-guard.ts";
import type { T } from "./types.ts";
export function useReportFilters(company: CompanyDto, t: T) {
  const [params, setParams] = useSearchParams();
  const party = params.get("party") ?? "",
    month = params.get("month") ?? "",
    side = params.get("side") ?? "";
  const [input, setInput] = useState({ party, month, side });
  useEffect(() => setInput({ party, month, side }), [party, month, side]);
  const dirty = input.party !== party || input.month !== month || input.side !== side;
  useInvoiceLeaveGuard({ busy: false, unsaved: dirty }, t("trade.leaveConfirm"));
  const view = params.get("view") ?? "openItems";
  const id = params.get("item");
  function change(fields: Record<string, string>) {
    setParams({ ...Object.fromEntries(params), company: company.code, ...fields, item: "" });
  }
  function openItem(documentId: string) {
    setParams({ ...Object.fromEntries(params), company: company.code, item: documentId });
  }
  const clear = () => setInput({ party, month, side });
  return { party, month, side, view, id, input, setInput, dirty, change, openItem, clear };
}
