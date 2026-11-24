import type { LabelKey } from "../ui/index.ts";
export type T = (key: Exclude<LabelKey, "shell.httpError">) => string;
export type Money = (minor: number) => string;
