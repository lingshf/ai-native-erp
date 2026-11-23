// The trade pages the smoke visits, in order.
import type { ExpectStatic } from "vitest";
import type { Page } from "playwright";
import type { LabelKey } from "../../../../../web/src/ui/index.ts";
import { choose } from "../keyboard.ts";

// Each page's own list query (first load must succeed) and the seeded rows it renders from it.
// Titles, lang and theme render even when the data request fails, so they prove nothing alone.
export type Label = (key: LabelKey) => string;
export type TradePage = {
  path: string;
  title: LabelKey;
  request: (url: URL) => boolean;
  loaded: (t: Label) => string;
  // Read-only keyboard step that makes the page show its loaded rows.
  reveal?: (page: Page, check: ExpectStatic) => Promise<void>;
};
export const tradePages: readonly TradePage[] = [
  {
    path: "trade",
    title: "trade.title",
    request: (url) => url.pathname === "/api/v1/trade/tradeParty",
    loaded: (t) => `main table[aria-label="${t("trade.tradeParty")}"] tbody tr`,
  },
  {
    path: "trade-invoices",
    title: "tinv.title",
    request: (url) => url.pathname === "/api/v1/trade/invoices",
    loaded: (t) => `main table[aria-label="${t("tinv.list")}"] tbody tr`,
  },
  {
    path: "trade-settlements",
    title: "tset.title",
    request: (url) =>
      url.pathname === "/api/v1/trade/open-items" && url.searchParams.get("status") === "open",
    loaded: (t) => `main table[aria-label="${t("tset.select")}"] tbody tr`,
  },
  {
    path: "trade-adjustments",
    title: "tadj.title",
    request: (url) =>
      url.pathname === "/api/v1/trade/open-items" && !url.searchParams.has("status"),
    loaded: () => `#tadj-sourceId option:not([value=""])`,
    // The default action (advance) lists no items; cancel lists the open items read-only.
    reveal: (page, check) => choose(page, page.locator("#tadj-kind"), "cancel", check),
  },
  {
    path: "trade-reports",
    title: "trpt.title",
    request: (url) => url.pathname === "/api/v1/trade/reports/open-items",
    loaded: () => "main table tbody tr",
  },
  {
    path: "period-close",
    title: "close.title",
    request: (url) => url.pathname === "/api/v1/periods",
    loaded: () => "#close-month option",
  },
];
