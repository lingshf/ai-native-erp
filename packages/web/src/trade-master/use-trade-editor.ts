import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { TradeCommand } from "@erp/core/contracts";
import { initialTradeDraft, specific } from "./trade-draft.ts";
import type { Failure } from "./trade-failure.ts";
import {
  persistTradeCommand,
  submitTradeDraft,
  type TradeEditorRender,
} from "./trade-editor-commands.ts";
import { idleGuard, type TradeEditorProps } from "./trade-master-types.ts";

export function useTradeEditor({ company, kind, initial, t, close, lock }: TradeEditorProps) {
  const client = useQueryClient();
  const fields = ["name", "from", "to", ...specific[kind]] as const;
  const [code, setCode] = useState(initial?.code ?? "");
  const [active, setActive] = useState(initial?.active ?? true);
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    initialTradeDraft(company, kind, initial),
  );
  const [error, setError] = useState<Failure | null>(null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const starting = useRef(JSON.stringify({ code, active, draft }));
  const dirty = JSON.stringify({ code, active, draft }) !== starting.current;
  const pendingCommand = useRef<TradeCommand | null>(null);
  const generation = useRef(0);
  useLayoutEffect(() => {
    lock({ open: true, dirty, pending: busy || uncertain });
  }, [lock, dirty, busy, uncertain]);
  useLayoutEffect(() => () => lock(idleGuard), [lock]);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const editor: TradeEditorRender = {
    company,
    kind,
    initial,
    close,
    client,
    fields,
    code,
    active,
    draft,
    busy,
    uncertain,
    setError,
    setBusy,
    setUncertain,
    pendingCommand,
    generation,
  };
  return {
    fields,
    code,
    setCode,
    active,
    setActive,
    draft,
    setDraft,
    error,
    busy,
    uncertain,
    submit: (event: FormEvent) => void submitTradeDraft(editor, event),
    // Reconcile resends the same command object (same expectedRevision); the draft is not re-parsed.
    reconcile: () => {
      if (pendingCommand.current) void persistTradeCommand(editor, pendingCommand.current, true);
    },
    reload: () => {
      void client.invalidateQueries({ queryKey: ["trade", company.code, kind] });
      close();
    },
    cancel: () => {
      if (!dirty || window.confirm(t("trade.discard"))) close();
    },
  };
}
