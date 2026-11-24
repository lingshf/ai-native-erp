import type { CompanyDto, TradeDto } from "@erp/core/contracts";
import type { LabelKey } from "../ui/index.ts";

export type T = (key: Exclude<LabelKey, "shell.httpError">) => string;
export type TradeKind = TradeDto["kind"];
export type EditorGuard = { open: boolean; dirty: boolean; pending: boolean };
export const idleGuard: EditorGuard = { open: false, dirty: false, pending: false };
export type TradeEditorProps = {
  company: CompanyDto;
  kind: TradeKind;
  initial: TradeDto | null;
  t: T;
  close: () => void;
  lock: (guard: EditorGuard) => void;
};
