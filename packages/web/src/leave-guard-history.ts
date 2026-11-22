// Back/Forward guard for a page with unsaved work (TINV-03, D272). It asks before a history
// traversal leaves the page's current address; a cancel returns to that entry with history.go and
// adds or rewrites no entry, so later Back and Forward entries keep their order.
//
// Positions: react-router's history writes an increasing `idx` into history.state on every in-app
// push and replace. An entry without one (a typed address or a plain fragment link) gets one once,
// by replaceState with the same URL, when the page settles on it: the last settled position + 1.
// When the entry an event arrives at has no position, the direction is unknown; a cancel then falls
// back to pushing the current address after it, which keeps the address but drops forward entries.

type Entry = { href: string; state: unknown; position: number | null };

let lastPosition: number | null = null;

const positionOf = (state: unknown) => {
  const idx = state !== null && typeof state === "object" ? (state as { idx?: unknown }).idx : null;
  return typeof idx === "number" && Number.isInteger(idx) ? idx : null;
};

// Records the entry the page now shows and gives it a position if it has none.
export function settleHistoryEntry(): Entry {
  let state: unknown = window.history.state;
  let position = positionOf(state);
  if (position === null && (state === null || state === undefined || typeof state === "object")) {
    position = lastPosition === null ? 0 : lastPosition + 1;
    state = { ...(state as object | null), idx: position };
    window.history.replaceState(state, "");
  }
  if (position !== null) lastPosition = position;
  return { href: window.location.href, state, position };
}

export type HistoryGuard = {
  // The address a cancelled navigation returns to.
  here: () => string;
  // Call after each render: the page may rewrite its own address while guarded.
  settle: () => void;
  dispose: () => void;
};

// Installs capture listeners for popstate and hashchange. `mayLeave` asks once per navigation.
export function guardHistory(mayLeave: () => boolean): HistoryGuard {
  let here = settleHistoryEntry();
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
      here = settleHistoryEntry();
      if (accepted === here.href) accepted = "";
    },
    dispose: () => {
      window.removeEventListener("popstate", navigation, true);
      window.removeEventListener("hashchange", navigation, true);
    },
  };
}
