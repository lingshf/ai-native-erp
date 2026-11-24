import type { LabelKey } from "../ui/index.ts";

export type CloseText = (key: Exclude<LabelKey, "shell.httpError">) => string;
