import { useEffect, useRef, useState } from "react";
import type { AiDraftResultDto } from "@erp/core/contracts";
import { aiCommands } from "./ai-commands.ts";

type AiRequestProps = { company: string; month: string; teaching: boolean; disabled: boolean };
export type AiRequestState = ReturnType<typeof useAiState>;

export function useAiRequest(props: AiRequestProps) {
  const state = useAiState(props);
  return { ...state, ...aiCommands(state, props) };
}

function useAiState({ month, teaching, disabled }: AiRequestProps) {
  const [prompt, setPrompt] = useState(""),
    [mode, setMode] = useState<"draft" | "explain">("draft");
  const [candidate, setCandidate] = useState<AiDraftResultDto | null>(null),
    [explanation, setExplanation] = useState<string | null>(null);
  const [pending, setPending] = useState(false),
    [error, setError] = useState<unknown>(),
    [cancelled, setCancelled] = useState(false);
  const active = useRef<AbortController | null>(null);
  const lineKeys = useRef<string[]>([]);
  useEffect(
    () => () => {
      active.current?.abort();
      active.current = null;
    },
    [],
  );
  useEffect(() => {
    if (disabled || (!teaching && mode === "explain")) {
      active.current?.abort();
      active.current = null;
      setPending(false);
      setExplanation(null);
      setCandidate(null);
      if (!teaching) setMode("draft");
    }
  }, [disabled, teaching, mode]);
  return {
    prompt,
    setPrompt,
    mode,
    setMode,
    candidate,
    setCandidate,
    explanation,
    setExplanation,
    pending,
    setPending,
    error,
    setError,
    cancelled,
    setCancelled,
    active,
    lineKeys,
    monthValid: /^\d{4}-\d\d$/u.test(month),
  };
}
