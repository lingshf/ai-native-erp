import type { Language } from "./labels.ts";

// Imported by a single lazy route so it is inlined there and the entry chunk stays unchanged (PG-05).
export const adjustmentTeachingRules: Readonly<Record<Language, string>> = {
  zh: "预付借记预付科目、贷记现金；预收借记现金、贷记预收科目。应用预付 / 贷项时，来源与目标发票的未结余额同额减少。非库存贷项按原发票科目反方向记账。",
  en: "Prepayments debit the advance account and credit cash; customer advances debit cash and credit the advance account. Applying an advance or credit reduces the source and target invoice open items by the same amount. Non-stock credits post the original invoice accounts in the opposite direction.",
};
export function adjustmentTeaching(language: Language, lead: string): string {
  return `${lead}${language === "en" ? " " : ""}${adjustmentTeachingRules[language]}`;
}
