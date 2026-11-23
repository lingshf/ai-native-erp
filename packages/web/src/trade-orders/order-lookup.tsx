import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { tradeOrderCommandSchema, tradeOrderSchema, type CompanyDto } from "@erp/core/contracts";
import { label, type Preferences } from "../ui/index.ts";
import type { TradeOrderKey } from "../ui/trade-order-labels.ts";
import { masterRequest, MasterDataFailure } from "../master-data-client.ts";
import { Badge, FastTab, MessageBar } from "../ui/components/index.tsx";
import type { T, Order, Opened } from "./order-model.ts";
import { OrderView } from "./order-view.tsx";
export function OrderLookup({
  company,
  language,
  money,
  t,
  request,
  onLookup,
  onBack,
}: {
  company: CompanyDto;
  language: Preferences["language"];
  money: (value: number) => string;
  t: T;
  request: Opened | null;
  onLookup: (orderId: string) => void;
  onBack: () => void;
}) {
  const [orderId, setOrderId] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Order | null>(null);
  const [error, setError] = useState<TradeOrderKey | "master.error" | null>(null);
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
  const lookup = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    onLookup(orderId.trim());
  };
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
      if (ticket === latest.current)
        setError(
          !(issue instanceof MasterDataFailure)
            ? "master.error"
            : issue.status === 400
              ? "tord.issue.shape"
              : issue.status === 404 && issue.detail?.code === "NOT_FOUND"
                ? "tord.notFound"
                : "master.error",
        );
    } finally {
      if (ticket === latest.current) setBusy(false);
    }
  };
  return (
    <FastTab id="tord-lookup" title={t("tord.lookup")}>
      <form className="filter-bar tord-lookup" onSubmit={lookup}>
        <div className="field">
          <label htmlFor="tord-lookup-id">{t("tord.lookupId")}</label>
          <input
            id="tord-lookup-id"
            maxLength={60}
            autoComplete="off"
            value={orderId}
            onChange={(event) => setOrderId(event.target.value)}
          />
        </div>
        <div className="actions">
          <button type="submit" className="btn btn-secondary" disabled={busy || !orderId.trim()}>
            {t("tord.lookupButton")}
          </button>
        </div>
      </form>
      {busy && <p role="status">{label(language, "master.loading")}</p>}
      {error && (
        <MessageBar tone="danger" role="alert">
          <p>{error === "master.error" ? label(language, "master.error") : t(error)}</p>
          {error === "master.error" ? (
            <button type="button" className="btn btn-secondary" onClick={() => void run(failed)}>
              {label(language, "master.retry")}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                onBack();
                document
                  .querySelector<HTMLButtonElement>('[aria-controls="tord-list-body"]')
                  ?.focus();
              }}
            >
              {t("tord.deepLink.back")}
            </button>
          )}
        </MessageBar>
      )}
      {result && (
        <section
          className="tord-lookup-result"
          aria-label={t("tord.lookupTitle")}
          ref={resultRef}
          tabIndex={-1}
        >
          <h4>
            {t("tord.lookupTitle")} <Badge tone="info">{result.orderId}</Badge>
          </h4>
          <OrderView order={result} company={company} language={language} money={money} t={t} />
        </section>
      )}
    </FastTab>
  );
}
