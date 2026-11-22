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

// Installs capture listeners for popstate and hashchange. `mayLeave` asks once per navigation.
export function guardHistory(mayLeave: () => boolean): HistoryGuard {
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
  window.addEventListener("popstate", navigation, true);
  window.addEventListener("hashchange", navigation, true);
  return {
    here: () => here.href,
    settle: () => {
      here = currentEntry();
      if (accepted === here.href) accepted = "";
    },
    dispose: () => {
      window.removeEventListener("popstate", navigation, true);
      window.removeEventListener("hashchange", navigation, true);
    },
  };
}
