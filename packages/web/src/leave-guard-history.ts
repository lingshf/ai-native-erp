// Back/Forward guard for a page with unsaved work (TINV-03, D272 / D273 / D274). It asks before a
// history traversal leaves the page's current address; a cancel tries to return to that entry with
// history.go, which adds or rewrites no entry, so later Back and Forward entries keep their order.
//
// react-router's history writes { usr, key, idx } into history.state on every in-app push and
// replace. The idx is only a hint: after an entry the router did not write (a typed address), the
// router numbers the next push from null, so the distance it gives may be wrong. A return therefore
// counts only if it lands on the original entry, the same URL and router key. Any other landing, no
// landing in time, or a missing idx on either side falls back to pushing the original address after
// wherever history now stands: the address and the draft stay, but the entries that were ahead of
// it are dropped. Events during a return never ask.

type Entry = { href: string; state: unknown; key: string | null; position: number | null };

const RETURN_TIMEOUT_MS = 1000;

const routerState = (state: unknown) => {
  if (state === null || typeof state !== "object") return { key: null, position: null };
  const { idx, key } = state as { idx?: unknown; key?: unknown };
  if (typeof key !== "string") return { key: null, position: null };
  return { key, position: typeof idx === "number" && Number.isInteger(idx) ? idx : null };
};

const currentEntry = (): Entry => ({
  href: window.location.href,
  state: window.history.state,
  ...routerState(window.history.state),
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
  // Set while history.go returns to `here` after a cancel.
  let returning: ReturnType<typeof setTimeout> | null = null;
  const restore = () => window.history.pushState(here.state, "", here.href);
  const land = () => {
    if (returning !== null) clearTimeout(returning);
    returning = null;
    const landed = currentEntry();
    if (landed.href !== here.href || here.key === null || landed.key !== here.key) restore();
  };
  const navigation = (event: Event) => {
    if (returning !== null) {
      event.stopImmediatePropagation();
      if (event.type === "popstate") land();
      return;
    }
    const href = window.location.href;
    if (href === here.href || href === accepted) return;
    if (mayLeave()) {
      accepted = href;
      return;
    }
    event.stopImmediatePropagation();
    const target = routerState(window.history.state).position;
    if (here.position !== null && target !== null && target !== here.position) {
      returning = setTimeout(land, RETURN_TIMEOUT_MS);
      window.history.go(here.position - target);
    } else restore();
  };
  window.addEventListener("popstate", navigation, true);
  window.addEventListener("hashchange", navigation, true);
  return {
    here: () => here.href,
    settle: () => {
      if (returning !== null) return;
      here = currentEntry();
      if (accepted === here.href) accepted = "";
    },
    dispose: () => {
      if (returning !== null) clearTimeout(returning);
      returning = null;
      window.removeEventListener("popstate", navigation, true);
      window.removeEventListener("hashchange", navigation, true);
    },
  };
}
