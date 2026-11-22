// The resident part of the Back/Forward guard (GATE-01, D284): one permanent gate per window,
// installed when this module is first evaluated. App.tsx imports it statically so the gate is
// registered before HashRouter's own popstate listener (D280): in a real browser the router's
// listener re-renders synchronously (microtasks run between listeners), and a page that unmounts or
// settles there would otherwise drop or re-aim its guard before it is asked. The per-page guard
// (guardHistory) lives in leave-guard-history.ts and is loaded with the pages that use it.

export type GateHandler = (event: Event) => void;

const handlers = new Set<GateHandler>();
const gate = (event: Event) => {
  for (const handler of [...handlers]) {
    handler(event);
    if (event.cancelBubble) return;
  }
};
const gated = new WeakSet<Window>();
export function installGate() {
  if (typeof window === "undefined" || gated.has(window)) return;
  gated.add(window);
  window.addEventListener("popstate", gate, true);
  window.addEventListener("hashchange", gate, true);
}
installGate();

export const addGateHandler = (handler: GateHandler) => {
  handlers.add(handler);
};
export const removeGateHandler = (handler: GateHandler) => {
  handlers.delete(handler);
};
