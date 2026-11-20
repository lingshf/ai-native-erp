import type { Language } from "./labels.ts";

// Imported by a single lazy route so it is inlined there and the entry chunk stays unchanged (PG-05).
export const settlementTeachingRules: Readonly<Record<Language, string>> = {
  zh: "核销发票时，付款借记应付控制科目、贷记现金；收款借记现金、贷记应收控制科目。核销按分配金额减少所选未结项，部分核销保留剩余余额。",
  en: "When settling invoices, payments debit the payables control account and credit cash; receipts debit cash and credit the receivables control account. Settlement reduces each selected open item by its allocated amount; a partial settlement leaves the rest open.",
};
export function settlementTeaching(language: Language, lead: string): string {
  return `${lead}${language === "en" ? " " : ""}${settlementTeachingRules[language]}`;
}
