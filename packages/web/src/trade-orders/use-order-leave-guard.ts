import { useLayoutEffect, useRef } from "react";
import { guardHistory, type HistoryGuard } from "../leave-guard-history.js";
import type { Guard } from "./order-model.ts";
// Same contract as the other trade pages' leave guards: links and history are blocked while a
// save is in flight; an unsaved draft asks before leaving and before unloading the tab.
export function useOrderLeaveGuard(guard: Guard, message: string) {
  const latest = useRef(guard);
  latest.current = guard;
  const history = useRef<HistoryGuard | null>(null);
  // After every render: the page rewrites its own address (company, order) while a draft is open,
  // and a cancelled navigation must return to that address (leave-guard-history.ts).
  useLayoutEffect(() => history.current?.settle());
  // Layout effect: armed in the commit that made the page dirty (see TradeInvoices.tsx).
  useLayoutEffect(() => {
    if (!guard.busy && !guard.unsaved) return;
    const mayLeave = () => !latest.current.busy && window.confirm(message);
    const guarded = guardHistory(mayLeave);
    history.current = guarded;
    const click = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.href === guarded.here() ||
        link.target === "_blank" ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      if (!mayLeave()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    const unload = (event: BeforeUnloadEvent) => {
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
