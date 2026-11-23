import { useLayoutEffect, useRef } from "react";
import { guardHistory, type HistoryGuard } from "../leave-guard-history.ts";
import type { Guard } from "./invoice-model.ts";

// Shared by the trade pages: busy (a submit in flight or its outcome unknown) blocks in-app links
// and history; unsaved input asks once per navigation; modified clicks open a new tab untouched.
// Back/Forward go through leave-guard-history.ts (a cancel keeps the address and the draft).
export function useInvoiceLeaveGuard(guard: Guard, message: string) {
  // Listeners read the latest guard so a just-finished post never keeps blocking navigation.
  const latest = useRef(guard);
  latest.current = guard;
  const history = useRef<HistoryGuard | null>(null);
  // After every render: the page may rewrite its own address while guarded (leave-guard-history.ts).
  useLayoutEffect(() => history.current?.settle());
  // Layout effects: the guard is armed in the same commit as the input that made the page dirty,
  // so an immediate Back is asked (passive effects may run after the traversal has begun).
  useLayoutEffect(() => {
    if (!guard.busy && !guard.unsaved) return;
    const mayLeave = () =>
      !latest.current.busy && (!latest.current.unsaved || window.confirm(message));
    const guarded = guardHistory(mayLeave);
    history.current = guarded;
    const click = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.href === guarded.here() ||
        link.target === "_blank"
      )
        return;
      const plain =
        event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;
      if (!latest.current.busy && !plain) return;
      if (mayLeave()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (!latest.current.busy && !latest.current.unsaved) return;
      event.preventDefault();
      event.returnValue = "";
    };
    document.addEventListener("click", click, true);
    window.addEventListener("beforeunload", unload);
    return () => {
      history.current = null;
      guarded.dispose();
      document.removeEventListener("click", click, true);
      window.removeEventListener("beforeunload", unload);
    };
  }, [guard.busy, guard.unsaved, message]);
}
