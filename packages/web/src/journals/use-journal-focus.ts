import { useEffect, useLayoutEffect } from "react";
import type { EditorRefs, JournalState } from "./use-journal-state.ts";

type FocusInputs = Pick<JournalState, "draft" | "busy" | "plan" | "deleting"> &
  Pick<EditorRefs, "form" | "focusLine" | "returnFocus">;

export function useJournalFocus({
  draft,
  busy,
  plan,
  deleting,
  form,
  focusLine,
  returnFocus,
}: FocusInputs) {
  const lineCount = draft?.lines.length ?? 0;
  // biome-ignore lint/correctness/useExhaustiveDependencies: refs are stable; the dependency list stays as in CompanyJournals before REFAC-03b.
  useEffect(() => {
    if (focusLine.current !== null && focusLine.current < lineCount) {
      form.current
        ?.querySelector<HTMLInputElement>(`[data-account="${focusLine.current}"]`)
        ?.focus();
      focusLine.current = null;
    }
  }, [lineCount]);
  // Layout phase: a passive effect after an async commit returns focus one task late.
  // biome-ignore lint/correctness/useExhaustiveDependencies: refs are stable; the dependency list stays as in CompanyJournals before REFAC-03b.
  useLayoutEffect(() => {
    if (!busy && !plan && !deleting && document.activeElement === document.body) {
      const previous = returnFocus.current;
      if (previous?.isConnected) previous.focus();
      else if (previous) document.getElementById("journal-company")?.focus();
    }
  }, [busy, plan, deleting]);
  // Layout phase: a draft loaded over HTTP otherwise leaves focus on body for one task.
  // biome-ignore lint/correctness/useExhaustiveDependencies: refs are stable; the dependency list stays as in CompanyJournals before REFAC-03b.
  useLayoutEffect(() => {
    if (draft?.id) form.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, [draft?.id]);
}
