import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { tradeOrderCommandSchema, tradeOrderSchema, type CompanyDto } from "@erp/core/contracts";
import type { TradeOrderKey } from "../ui/trade-order-labels.ts";
import { masterRequest, MasterDataFailure } from "../master-data-client.ts";
import type { Order, Opened } from "./order-model.ts";

export type LookupError = TradeOrderKey | "master.error";

const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;

function lookupErrorKey(issue: unknown): LookupError {
  return !(issue instanceof MasterDataFailure)
    ? "master.error"
    : issue.status === HTTP_BAD_REQUEST
      ? "tord.issue.shape"
      : issue.status === HTTP_NOT_FOUND && issue.detail?.code === "NOT_FOUND"
        ? "tord.notFound"
        : "master.error";
}

export function useOrderLookup(company: CompanyDto, request: Opened | null) {
  const [orderId, setOrderId] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Order | null>(null);
  const [error, setError] = useState<LookupError | null>(null);
  const [focusResult, setFocusResult] = useState(false);
  const resultRef = useRef<HTMLElement>(null);
  const latest = useRef(0);
  const [failed, setFailed] = useState("");
  // An order number chosen in the list, the form or the address runs one lookup (TORD-03, TINV-03);
  // a removed `order` clears the result.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per request, not per keystroke.
  useEffect(() => {
    if (!request) {
      ++latest.current;
      setBusy(false);
      setResult(null);
      setError(null);
      return;
    }
    setOrderId(request.orderId);
    const toggle = document.querySelector<HTMLButtonElement>(
      '[aria-controls="tord-lookup-body"][aria-expanded="false"]',
    );
    toggle?.click();
    setFocusResult(request.focus);
    void run(request.orderId);
  }, [request]);
  useLayoutEffect(() => {
    if (focusResult && result) {
      resultRef.current?.focus();
      setFocusResult(false);
    }
  }, [focusResult, result]);
  // The latest selection owns the detail: a list click during a pending lookup supersedes it, and
  // a superseded response is dropped so it can never show beside the newer order number.
  const run = async (id: string) => {
    const ticket = ++latest.current;
    setResult(null);
    setError(null);
    setFailed(id);
    if (!tradeOrderCommandSchema.shape.orderId.safeParse(id).success) {
      setBusy(false);
      setError("tord.issue.shape");
      return;
    }
    setBusy(true);
    try {
      const order = await masterRequest(
        `/api/v1/trade/orders/${encodeURIComponent(id)}?company=${encodeURIComponent(company.code)}`,
        tradeOrderSchema,
      );
      if (ticket === latest.current) setResult(order);
    } catch (issue) {
      if (ticket === latest.current) setError(lookupErrorKey(issue));
    } finally {
      if (ticket === latest.current) setBusy(false);
    }
  };
  const retry = () => void run(failed);
  return { orderId, setOrderId, busy, result, error, resultRef, retry };
}
