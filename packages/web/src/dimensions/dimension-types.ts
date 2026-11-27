import type { DimensionCommand } from "@erp/core/contracts";
import type { LabelKey } from "../ui/index.ts";

export type T = (key: Exclude<LabelKey, "shell.httpError">) => string;
export type Kind = DimensionCommand["kind"];
