// TINV-06 发票详情对话框的文案只随发票页的懒加载 chunk 下载（PG-05 / D350：入口块不增加）。
import type { Language } from "./labels.ts";

export const tradeInvoiceDetailEn = {
  "tinv.detail.open": "View invoice",
  "tinv.detail.title": "Invoice details",
  "tinv.detail.close": "Close",
  "tinv.detail.loading": "Loading invoice…",
  "tinv.detail.error": "Could not load the invoice.",
  "tinv.detail.notFound": "The invoice does not exist or is no longer in this company.",
  "tinv.detail.header": "Header",
  "tinv.detail.currency": "Currency",
  "tinv.detail.lineNo": "Line",
  "tinv.detail.matchStatus": "Match result",
  "tinv.detail.totals": "Totals",
  "tinv.detail.openItem": "Open item",
  "tinv.detail.remaining": "Open balance",
  "tinv.detail.settlements": "Settlements",
  "tinv.detail.actions": "Adjustments",
  "tinv.detail.date": "Date",
  "tinv.detail.sourceRef": "Source reference",
  "tinv.detail.cash": "Cash",
  "tinv.detail.discount": "Cash discount",
  "tinv.detail.amount": "Amount",
  "tinv.detail.noSettlements": "No settlements for this invoice.",
  "tinv.detail.noActions": "No adjustments for this invoice.",
  "tinv.detail.teachingPosting": "Posting the invoice created one journal:",
  "tinv.detail.teachingControl": "Its debit or credit lands on the control account:",
  "tinv.detail.teachingSettle":
    "It also opened one open item; payments and receipts applied to it reduce the open balance.",
  "tinv.link.company": "The link's company is not in the loaded list; nothing was opened",
  "tinv.link.back": "Back to invoices",
  "tinv.filter.linkInvalid":
    "The link's filters are not valid and were ignored; all invoices are shown.",
} as const;
export const tradeInvoiceDetailZh: Record<keyof typeof tradeInvoiceDetailEn, string> = {
  "tinv.detail.open": "查看发票",
  "tinv.detail.title": "发票详情",
  "tinv.detail.close": "关闭",
  "tinv.detail.loading": "正在读取发票…",
  "tinv.detail.error": "读取发票失败。",
  "tinv.detail.notFound": "发票不存在或已不在本公司。",
  "tinv.detail.header": "抬头",
  "tinv.detail.currency": "币种",
  "tinv.detail.lineNo": "行号",
  "tinv.detail.matchStatus": "匹配结果",
  "tinv.detail.totals": "合计",
  "tinv.detail.openItem": "未结项",
  "tinv.detail.remaining": "未结余额",
  "tinv.detail.settlements": "核销记录",
  "tinv.detail.actions": "调整记录",
  "tinv.detail.date": "日期",
  "tinv.detail.sourceRef": "来源参考",
  "tinv.detail.cash": "现金",
  "tinv.detail.discount": "现金折扣",
  "tinv.detail.amount": "金额",
  "tinv.detail.noSettlements": "该发票没有核销记录。",
  "tinv.detail.noActions": "该发票没有调整记录。",
  "tinv.detail.teachingPosting": "发票过账生成一张凭证：",
  "tinv.detail.teachingControl": "借贷落在控制科目：",
  "tinv.detail.teachingSettle": "同时生成一个未结项；付款 / 收款核销减少未结余额。",
  "tinv.link.company": "链接中的公司不在已加载列表中，未打开",
  "tinv.link.back": "返回发票页",
  "tinv.filter.linkInvalid": "链接中的筛选条件无效，已忽略；当前显示全部发票。",
};

export type TradeInvoiceDetailKey = keyof typeof tradeInvoiceDetailEn;
export const tradeInvoiceDetailResources = {
  zh: tradeInvoiceDetailZh,
  en: tradeInvoiceDetailEn,
} as const;

export function detailLabel(language: Language, key: TradeInvoiceDetailKey): string {
  return tradeInvoiceDetailResources[language][key];
}

export function isDetailKey(key: string): key is TradeInvoiceDetailKey {
  return Object.hasOwn(tradeInvoiceDetailEn, key);
}
