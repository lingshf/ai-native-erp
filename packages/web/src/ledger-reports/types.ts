import type { LabelKey } from "../ui/index.ts";

export type T = (key: Exclude<LabelKey, "shell.httpError">) => string;
export const views = ["trial", "income", "balance-sheet", "reconciliation"] as const;
export type View = (typeof views)[number];
export type Format = (n: number) => string;
