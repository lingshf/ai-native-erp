import type { Language } from "./labels.ts";

// Imported by a single lazy route so it is inlined there and the entry chunk stays unchanged (PG-05).
export const masterTeachingRules: Readonly<Record<Language, string>> = {
  zh: "AP/AR 过账配置指定控制、预付、现金与折扣科目，发票、核销与预付都按这些科目记账。",
  en: "AP/AR posting profiles set the control, advance, cash and discount accounts that invoices, settlements and advances post to.",
};
export function masterTeaching(language: Language, lead: string): string {
  return `${lead}${language === "en" ? " " : ""}${masterTeachingRules[language]}`;
}
