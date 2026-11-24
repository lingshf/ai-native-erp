import type { Dispatch, FormEvent, MutableRefObject, SetStateAction } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { tradeWriteSchema, tradeConfigSchema, type TradeCommand } from "@erp/core/contracts";
import { masterRequest, MasterDataFailure } from "../master-data-client.ts";
import { tradeFieldValue, type TradeFieldName } from "./trade-draft.ts";
import { failure, type Failure } from "./trade-failure.ts";
import type { TradeEditorProps } from "./trade-master-types.ts";

/** One render's state and setters; commands read it instead of a cached closure. */
export type TradeEditorRender = Pick<TradeEditorProps, "company" | "kind" | "initial" | "close"> & {
  client: QueryClient;
  fields: readonly TradeFieldName[];
  code: string;
  active: boolean;
  draft: Record<string, string>;
  busy: boolean;
  uncertain: boolean;
  setError: Dispatch<SetStateAction<Failure | null>>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setUncertain: Dispatch<SetStateAction<boolean>>;
  pendingCommand: MutableRefObject<TradeCommand | null>;
  generation: MutableRefObject<number>;
};

export async function submitTradeDraft(editor: TradeEditorRender, event: FormEvent) {
  const { company, kind, initial, fields, code, active, draft, busy, uncertain, setError } = editor;
  event.preventDefault();
  if (busy || uncertain) return;
  const data: Record<string, unknown> = {};
  for (const field of fields) {
    const value = draft[field];
    try {
      data[field] = tradeFieldValue(field, value);
    } catch (issue) {
      if (!(issue instanceof SyntaxError)) throw issue;
      setError({ path: `data.${field}`, key: "trade.issue.shape", conflict: false });
      return;
    }
  }
  const parsed = tradeWriteSchema.safeParse({
    company: company.code,
    kind,
    code,
    expectedRevision: initial?.revision ?? 0,
    active,
    data,
  });
  if (!parsed.success) {
    setError({
      path: parsed.error.issues[0]?.path.join(".") || "form",
      key: "trade.issue.shape",
      conflict: false,
    });
    return;
  }
  editor.pendingCommand.current = parsed.data;
  await persistTradeCommand(editor, parsed.data);
}

export async function persistTradeCommand(
  editor: TradeEditorRender,
  command: TradeCommand,
  reconcile = false,
) {
  const { company, kind, close, client, setError, setBusy, setUncertain, generation } = editor;
  const id = ++generation.current;
  setBusy(true);
  setError(null);
  let accepted = false;
  try {
    try {
      await masterRequest(`/api/v1/trade/${kind}`, tradeConfigSchema, {
        method: command.expectedRevision ? "PUT" : "POST",
        body: command,
      });
    } catch (issue) {
      if (!reconcile || !(issue instanceof MasterDataFailure) || issue.status !== 409) throw issue;
      const saved = await masterRequest(
        `/api/v1/trade/${kind}/${encodeURIComponent(command.code)}?company=${encodeURIComponent(company.code)}`,
        tradeConfigSchema,
      );
      if (
        saved.kind !== command.kind ||
        saved.code !== command.code ||
        saved.revision !== command.expectedRevision + 1 ||
        saved.active !== command.active ||
        JSON.stringify(saved.data) !== JSON.stringify(command.data)
      )
        throw issue;
    }
    accepted = true;
    if (generation.current === id) close();
  } catch (issue) {
    if (generation.current === id) {
      setError(failure(issue));
      setUncertain(
        !(issue instanceof MasterDataFailure) ||
          issue.kind !== "http" ||
          (issue.status ?? 500) >= 500 ||
          (reconcile && issue.status !== 409),
      );
    }
  } finally {
    if (generation.current === id) setBusy(false);
    if (accepted || generation.current !== id)
      void client.invalidateQueries({ queryKey: ["trade", company.code, kind] });
  }
}
