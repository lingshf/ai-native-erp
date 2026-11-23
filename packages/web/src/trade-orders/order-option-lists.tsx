import type { TradeDto } from "@erp/core/contracts";
import { MessageBar } from "../ui/components/index.tsx";
import type { T } from "./order-model.ts";
import type { Draft } from "./order-draft.ts";
import type { OptionsQuery } from "./use-order-entry.ts";

type OptionQueries = { parties: OptionsQuery; products: OptionsQuery; taxes: OptionsQuery };

const active = (query: OptionsQuery, keep: (item: TradeDto) => boolean) =>
  (query.data?.items ?? []).filter((item) => item.active && keep(item));

// The datalist options for the draft's side, and whether any of the three queries failed.
export function orderOptions({ parties, products, taxes }: OptionQueries, side: Draft["side"]) {
  return {
    parties: active(
      parties,
      (item) =>
        item.kind === "tradeParty" &&
        (item.data.role === "both" || item.data.role === (side === "AP" ? "vendor" : "customer")),
    ),
    products: active(
      products,
      (item) =>
        item.kind === "tradeProduct" && item.data.type === (side === "AP" ? "expense" : "service"),
    ),
    taxes: active(taxes, (item) => item.kind === "taxCode"),
    failed: parties.isError || products.isError || taxes.isError,
  };
}
export type OrderOptions = ReturnType<typeof orderOptions>;

export function OrderOptionsFailed({ t }: { t: T }) {
  return (
    <MessageBar tone="warning">
      <p>{t("tord.optionsFailed")}</p>
    </MessageBar>
  );
}

export function OrderOptionLists({ options }: { options: OrderOptions }) {
  return (
    <>
      <datalist id="tord-party-options">
        {options.parties.map((item) => (
          <option key={item.code} value={item.code}>
            {item.data.name}
          </option>
        ))}
      </datalist>
      <datalist id="tord-product-options">
        {options.products.map((item) => (
          <option key={item.code} value={item.code}>
            {item.data.name}
          </option>
        ))}
      </datalist>
      <datalist id="tord-tax-options">
        {options.taxes.map((item) => (
          <option key={item.code} value={item.code}>
            {item.data.name}
          </option>
        ))}
      </datalist>
    </>
  );
}
