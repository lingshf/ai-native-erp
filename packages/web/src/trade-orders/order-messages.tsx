import type { RefObject } from "react";
import type { TradeOrderPreviewDto } from "@erp/core/contracts";
import { Badge, MessageBar } from "../ui/components/index.tsx";
import type { T, Order } from "./order-model.ts";
import type { Failure } from "./order-draft.ts";
import { amountKeys, fieldLabel } from "./order-entry-fields.tsx";

export function OrderErrorBar({ t, failure }: { t: T; failure: Failure }) {
  return (
    <MessageBar tone={failure.uncertain ? "warning" : "danger"} role="alert">
      <p>{failure.message}</p>
      {failure.issues.length > 0 && (
        <ul>
          {failure.issues.map((issue) => (
            <li key={`${issue.path}:${issue.key}`}>
              {[fieldLabel(t, issue.path), t(issue.key)].filter(Boolean).join(": ")}
            </li>
          ))}
        </ul>
      )}
    </MessageBar>
  );
}

type OrderSavedNoticeProps = { t: T; saved: Order; notice: RefObject<HTMLDivElement | null> };

export function OrderSavedNotice({ t, saved, notice }: OrderSavedNoticeProps) {
  return (
    <div className="tord-saved" ref={notice} tabIndex={-1}>
      <MessageBar tone="success" role="status">
        <p>
          {t("tord.saved", { orderId: saved.orderId })}{" "}
          <a href="#/trade-invoices">{t("tord.toInvoices")}</a>
        </p>
      </MessageBar>
    </div>
  );
}

type OrderPreviewResultProps = {
  t: T;
  preview: TradeOrderPreviewDto;
  money: (value: number) => string;
  result: RefObject<HTMLElement | null>;
};

export function OrderPreviewResult({ t, preview, money, result }: OrderPreviewResultProps) {
  return (
    <section
      className="tord-lookup-result"
      ref={result}
      tabIndex={-1}
      aria-labelledby="tord-preview-title"
    >
      <h4 id="tord-preview-title">
        {t("tord.previewTitle")} <Badge tone="info">{t("tord.previewBadge")}</Badge>
      </h4>
      <p className="ui-hint">{t("tord.previewNote")}</p>
      <dl className="kpis">
        {amountKeys.map((key) => (
          <div key={key} className={key === "gross" ? "kpi emphasis" : "kpi"}>
            <dt className="label">{t(`tord.${key}`)}</dt>
            <dd className="value">{money(preview[key])}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
