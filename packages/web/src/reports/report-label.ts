import type { LabelKey } from "../ui/index.ts";

type SimpleLabel = Exclude<LabelKey, "shell.httpError">;
type Translate = (key: SimpleLabel) => string;

export type { SimpleLabel, Translate };
