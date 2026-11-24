import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  accountCommandSchema,
  accountFieldsSchema,
  accountSchema,
  type AccountCommand,
} from "@erp/core/contracts";
import { MasterDataFailure, masterRequest } from "../master-data-client.ts";
import { groups } from "./account-groups.ts";

export function useAccountEditor(initial: AccountCommand, saved: () => void) {
  const client = useQueryClient();
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const operation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      operation.current++;
      controller.current?.abort();
    },
    [],
  );
  function patch(change: Partial<AccountCommand>) {
    setDraft((value) => ({ ...value, ...change }));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const parsed = accountCommandSchema.safeParse(draft);
    if (!parsed.success || (draft.purpose === "control" && draft.controlModule === null)) {
      setError(new MasterDataFailure("invalid"));
      return;
    }
    const id = ++operation.current;
    controller.current = new AbortController();
    setBusy(true);
    setError(undefined);
    try {
      await masterRequest("/api/v1/accounts", accountSchema, {
        method: draft.revision === 0 ? "POST" : "PUT",
        body: parsed.data,
        signal: controller.current.signal,
      });
      if (operation.current === id) saved();
    } catch (issue) {
      if (operation.current === id) setError(issue);
    } finally {
      if (operation.current === id) setBusy(false);
      else void client.invalidateQueries({ queryKey: ["accounts", initial.company] });
    }
  }
  const changeChoice = <
    K extends "category" | "reportGroup" | "normalSide" | "purpose" | "controlModule",
  >(
    key: K,
    value: string,
  ) => {
    if (key === "controlModule" && value === "") {
      patch({ controlModule: null });
      return;
    }
    const parsed = accountFieldsSchema.shape[key].safeParse(value);
    if (!parsed.success) {
      setError(new MasterDataFailure("invalid"));
      return;
    }
    if (key === "category") {
      const category = accountFieldsSchema.shape.category.parse(value);
      patch({
        category,
        reportGroup: groups[category][0],
        normalSide: ["ASSET", "EXPENSE"].includes(category) ? "DEBIT" : "CREDIT",
      });
    } else if (key === "purpose") {
      const purpose = accountFieldsSchema.shape.purpose.parse(value);
      patch({
        purpose,
        controlModule: null,
        ...(purpose === "control" ? { manualAllowed: false } : {}),
      });
    } else patch({ [key]: parsed.data });
  };
  return { draft, error, busy, patch, submit, changeChoice };
}
export type AccountEditorState = ReturnType<typeof useAccountEditor>;
