import type { Language } from "./labels.ts";

type PartyFilterKey = "label" | "all" | "hint" | "invalid";

// Imported by a single lazy route so it is inlined there and the entry chunk stays unchanged (PG-05).
export const partyFilterLabels: Readonly<
  Record<Language, Readonly<Record<PartyFilterKey, string>>>
> = {
  zh: {
    label: "按伙伴代码筛选未结项",
    all: "全部伙伴",
    hint: "留空表示全部伙伴；按回车或离开输入框后生效。",
    invalid: "伙伴代码只能包含大写字母、数字和 _ . : -。",
  },
  en: {
    label: "Filter items by partner code",
    all: "All partners",
    hint: "Leave blank for all partners. Press Enter or leave the field to apply.",
    invalid: "Partner codes use capital letters, digits and _ . : - only.",
  },
};
