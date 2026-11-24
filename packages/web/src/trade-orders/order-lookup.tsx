import type { FormEvent } from "react";
import type { CompanyDto } from "@erp/core/contracts";
import { label, type Preferences } from "../ui/index.ts";
import { FastTab } from "../ui/components/index.tsx";
import type { T, Opened } from "./order-model.ts";
import { OrderLookupError } from "./order-lookup-error.tsx";
import { OrderLookupForm } from "./order-lookup-form.tsx";
import { OrderLookupResult } from "./order-lookup-result.tsx";
import { useOrderLookup } from "./use-order-lookup.ts";
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
  const { orderId, setOrderId, busy, result, error, resultRef, retry } = useOrderLookup(
    company,
    request,
  );
  const lookup = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    onLookup(orderId.trim());
  };
  return (
    <FastTab id="tord-lookup" title={t("tord.lookup")}>
      <OrderLookupForm
        orderId={orderId}
        busy={busy}
        t={t}
        onChange={setOrderId}
        onSubmit={lookup}
      />
      {busy && <p role="status">{label(language, "master.loading")}</p>}
      {error && (
        <OrderLookupError error={error} language={language} t={t} onRetry={retry} onBack={onBack} />
      )}
      {result && (
        <OrderLookupResult
          result={result}
          sectionRef={resultRef}
          company={company}
          language={language}
          money={money}
          t={t}
        />
      )}
    </FastTab>
  );
}
