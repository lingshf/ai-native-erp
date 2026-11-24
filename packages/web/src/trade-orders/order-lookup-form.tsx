import type { FormEvent } from "react";
import type { T } from "./order-model.ts";

const ORDER_ID_MAX_LENGTH = 60;

export function OrderLookupForm({
  orderId,
  busy,
  t,
  onChange,
  onSubmit,
}: {
  orderId: string;
  busy: boolean;
  t: T;
  onChange: (orderId: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <form className="filter-bar tord-lookup" onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor="tord-lookup-id">{t("tord.lookupId")}</label>
        <input
          id="tord-lookup-id"
          maxLength={ORDER_ID_MAX_LENGTH}
          autoComplete="off"
          value={orderId}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      <div className="actions">
        <button type="submit" className="btn btn-secondary" disabled={busy || !orderId.trim()}>
          {t("tord.lookupButton")}
        </button>
      </div>
    </form>
  );
}
