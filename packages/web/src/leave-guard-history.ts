// Back/Forward guard for a page with unsaved work (TINV-03, D272 / D273). It asks before a history
// traversal leaves the page's current address; a cancel returns to that entry with history.go and
// adds or rewrites no entry, so later Back and Forward entries keep their order.
//
// Positions: only the ones react-router's history writes into history.state ({ usr, key, idx }, the
// idx increasing on every in-app push) are trusted; no position is ever inferred or written here,
// because an entry the router did not write may sit any distance away. When the current or the
// target entry has no trusted position, the distance is unknown; a cancel then falls back to pushing
// the current address after the target, which keeps the address and the draft but drops the
// entries that were ahead of the target.

type Entry = { href: string; state: unknown; position: number | null };

const positionOf = (state: unknown) => {
  if (state === null || typeof state !== "object") return null;
  const { idx, key } = state as { idx?: unknown; key?: unknown };
  return typeof key === "string" && typeof idx === "number" && Number.isInteger(idx) ? idx : null;
};

const currentEntry = (): Entry => ({
  href: window.location.href,
  state: window.history.state,
  position: positionOf(window.history.state),
});

export type HistoryGuard = {
  // The address a cancelled navigation returns to.
  here: () => string;
  // Call after each render: the page may rewrite its own address while guarded.
  settle: () => void;
  dispose: () => void;
};

// Installs capture listeners for popstate and hashchange. `mayLeave` asks once per navigation.
export function guardHistory(mayLeave: () => boolean): HistoryGuard {
  let here = currentEntry();
  let accepted = "";
  // The address of a cancelled traversal while history.go returns to `here`; its events are dropped.
  let cancelled = "";
  const navigation = (event: Event) => {
    const href = window.location.href;
    if (cancelled) {
      if (href === here.href || href === cancelled) {
        if (href === here.href) cancelled = "";
        event.stopImmediatePropagation();
        return;
      }
      cancelled = "";
    }
    if (href === here.href || href === accepted) return;
    if (mayLeave()) {
      accepted = href;
      return;
    }
    event.stopImmediatePropagation();
    const target = positionOf(window.history.state);
    if (here.position !== null && target !== null && target !== here.position) {
      cancelled = href;
      window.history.go(here.position - target);
    } else window.history.pushState(here.state, "", here.href);
  };
  window.addEventListener("popstate", navigation, true);
  window.addEventListener("hashchange", navigation, true);
  return {
    here: () => here.href,
    settle: () => {
      if (cancelled) return;
      here = currentEntry();
      if (accepted === here.href) accepted = "";
    },
    dispose: () => {
      window.removeEventListener("popstate", navigation, true);
      window.removeEventListener("hashchange", navigation, true);
    },
  };
}
