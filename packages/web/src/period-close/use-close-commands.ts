import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ClosePreviewDto, CloseResultDto } from "@erp/core/contracts";
import {
  execute,
  loadPreview,
  type CloseCommandContext,
  type CloseScope,
  type Pending,
} from "./close-commands.ts";

export type CloseCommands = ReturnType<typeof useCloseCommands>;

export function useCloseCommands(scope: CloseScope) {
  const { period, setLocked } = scope;
  const client = useQueryClient();
  const [preview, setPreview] = useState<ClosePreviewDto | null>(null);
  const [result, setResult] = useState<CloseResultDto | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(
    () => setPreview((current) => (current?.revision === period.revision ? current : null)),
    [period.revision],
  );
  useEffect(() => {
    setLocked(busy || pending !== null);
  }, [busy, pending, setLocked]);
  const context: CloseCommandContext = {
    ...scope,
    client,
    base: `/api/v1/periods/${period.month}`,
    busy,
    pending,
    setPreview,
    setResult,
    setPending,
    setBusy,
    setError,
  };
  return {
    preview,
    result,
    pending,
    busy,
    error,
    loadPreview: () => loadPreview(context),
    execute: (command: Pending) => execute(context, command),
  };
}
