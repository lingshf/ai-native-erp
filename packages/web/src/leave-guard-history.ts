// Back/Forward guard for a page with unsaved work (TINV-03, D275). It asks once before a history
// traversal leaves the page's current address. A cancel pushes that address again after wherever
// history now stands, so the address and the draft stay and the traversal's own later events (the
// hashchange that follows popstate) arrive at the page's address and do not ask again.
//
// It never calls history.go to return: positions in history.state cannot tell whether an entry is
// in this document or how far away it is, and a wrong guess could leave the document. The accepted
// cost is that the entries that were ahead of where history stood are dropped.

type Entry = { href: string; state: unknown };

const currentEntry = (): Entry => ({ href: window.location.href, state: window.history.state });

export type HistoryGuard = {
  // The address a cancelled navigation keeps.
  here: () => string;
  // Call after each render: the page may rewrite its own address while guarded.
  settle: () => void;
  dispose: () => void;
};

// One permanent gate per window, installed when this module is first evaluated. App.tsx imports it
// statically so the gate is registered before HashRouter's own popstate listener: in a real
// browser the router's listener re-renders synchronously (microtasks run between listeners), and a
// page that unmounts or settles there would otherwise drop or re-aim its guard before it is asked.
type Handler = (event: Event) => void;
const handlers = new Set<Handler>();
const gate = (event: Event) => {
  for (const handler of [...handlers]) {
    handler(event);
    if (event.cancelBubble) return;
  }
};
const gated = new WeakSet<Window>();
function installGate() {
  if (typeof window === "undefined" || gated.has(window)) return;
  gated.add(window);
  window.addEventListener("popstate", gate, true);
  window.addEventListener("hashchange", gate, true);
}
installGate();

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
  handlers.add(navigation);
  return {
    here: () => here.href,
    settle: () => {
      here = currentEntry();
      if (accepted === here.href) accepted = "";
    },
    dispose: () => {
      handlers.delete(navigation);
    },
  };
}
