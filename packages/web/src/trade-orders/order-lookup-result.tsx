import type { RefObject } from "react";
import type { CompanyDto } from "@erp/core/contracts";
import type { Preferences } from "../ui/index.ts";
import { Badge } from "../ui/components/index.tsx";
import type { T, Order } from "./order-model.ts";
import { OrderView } from "./order-view.tsx";

export function OrderLookupResult({
  result,
  sectionRef,
  company,
  language,
  money,
  t,
}: {
  result: Order;
  sectionRef: RefObject<HTMLElement | null>;
  company: CompanyDto;
  language: Preferences["language"];
  money: (value: number) => string;
  t: T;
}) {
  return (
    <section
      className="tord-lookup-result"
      aria-label={t("tord.lookupTitle")}
      ref={sectionRef}
      tabIndex={-1}
    >
      <h4>
        {t("tord.lookupTitle")} <Badge tone="info">{result.orderId}</Badge>
      </h4>
      <OrderView order={result} company={company} language={language} money={money} t={t} />
    </section>
  );
}
