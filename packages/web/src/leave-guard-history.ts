// Back/Forward guard for a page with unsaved work (TINV-03, D275). It asks once before a history
// traversal leaves the page's current address. A cancel pushes that address again after wherever
// history now stands, so the address and the draft stay and the traversal's own later events (the
// hashchange that follows popstate) arrive at the page's address and do not ask again.
//
// It never calls history.go to return: positions in history.state cannot tell whether an entry is
// in this document or how far away it is, and a wrong guess could leave the document. The accepted
// cost is that the entries that were ahead of where history stood are dropped.
//
// Each guard registers with the resident gate in leave-guard-gate.ts, which App.tsx loads before
// HashRouter (D280); this module itself is loaded only with the pages that use it (GATE-01).

import { addGateHandler, installGate, removeGateHandler } from "./leave-guard-gate.ts";

type Entry = { href: string; state: unknown };

const currentEntry = (): Entry => ({ href: window.location.href, state: window.history.state });

export type HistoryGuard = {
  // The address a cancelled navigation keeps.
  here: () => string;
  // Call after each render: the page may rewrite its own address while guarded.
  settle: () => void;
  dispose: () => void;
};

// Registers with the gate. `mayLeave` asks once per navigation.
export function guardHistory(mayLeave: () => boolean): HistoryGuard {
  installGate();
  let here = currentEntry();
  let accepted = "";
  const navigation = (event: Event) => {
    const href = window.location.href;
    if (href === here.href || href === accepted) return;
    if (mayLeave()) {
      accepted = href;
      return;
    }
    event.stopImmediatePropagation();
    window.history.pushState(here.state, "", here.href);
  };
  addGateHandler(navigation);
  return {
    here: () => here.href,
    settle: () => {
      here = currentEntry();
      if (accepted === here.href) accepted = "";
    },
    dispose: () => {
      removeGateHandler(navigation);
    },
  };
}
