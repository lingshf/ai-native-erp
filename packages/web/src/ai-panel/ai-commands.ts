import { aiDraftResultSchema, aiExplainResultSchema } from "@erp/core/contracts";
import { masterRequest } from "../master-data-client.ts";
import type { AiRequestState } from "./use-ai-request.ts";

/** Rebuilt on every render so the commands read that render's state, as before the split. */
export function aiCommands(
  state: AiRequestState,
  { company, month, disabled }: { company: string; month: string; disabled: boolean },
) {
  const { prompt, mode, active, lineKeys, monthValid } = state;
  const { setMode, setPending, setError, setCancelled, setCandidate, setExplanation } = state;
  function changeMode(value: "draft" | "explain") {
    setMode(value);
    setCandidate(null);
    setExplanation(null);
    setError(undefined);
  }
  function cancel() {
    active.current?.abort();
    active.current = null;
    setPending(false);
    setCancelled(true);
  }
  async function send() {
    if (active.current || disabled || !monthValid || !prompt.trim()) return;
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    setError(undefined);
    setCancelled(false);
    setCandidate(null);
    setExplanation(null);
    try {
      const body = { company, month, prompt };
      if (mode === "draft") {
        const result = await masterRequest("/api/v1/ai/draft", aiDraftResultSchema, {
          method: "POST",
          body,
          signal: controller.signal,
        });
        if (active.current === controller) {
          lineKeys.current = result.draft?.lines.map(() => crypto.randomUUID()) ?? [];
          setCandidate(result);
        }
      } else {
        const result = await masterRequest("/api/v1/ai/explain", aiExplainResultSchema, {
          method: "POST",
          body,
          signal: controller.signal,
        });
        if (active.current === controller) setExplanation(result.text);
      }
    } catch (error) {
      if (active.current === controller) setError(error);
    } finally {
      if (active.current === controller) {
        active.current = null;
        setPending(false);
      }
    }
  }
  return { changeMode, send, cancel };
}
