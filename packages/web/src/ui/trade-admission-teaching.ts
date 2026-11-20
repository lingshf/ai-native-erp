import type { Language } from "./labels.ts";

// Imported by a single lazy route so it is inlined there and the entry chunk stays unchanged (PG-05).
export const admissionTeaching: Readonly<Record<Language, { title: string; text: string }>> = {
  zh: { title: "期间准入说明", text: "准入只控制贸易单据能否在该期间记账，不结账。" },
  en: {
    title: "About period admission",
    text: "Admission only controls whether trade documents can post in this period; it does not close the period.",
  },
};
