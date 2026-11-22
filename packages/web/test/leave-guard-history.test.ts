// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { guardHistory, type HistoryGuard } from "../src/leave-guard-history.ts";

const pause = () => new Promise((resolve) => setTimeout(resolve, 30));

// A real browser runs the router's popstate listener (registered when the app starts, before any
// page guard) first and re-renders synchronously between listeners: the guarded page unmounts
// (dispose) or settles on the new address before its guard is asked. This router does the same.
describe("leave-guard-history behind a router that re-renders first", () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    for (const done of cleanup.splice(0)) done();
    vi.restoreAllMocks();
  });

  async function setup(rerender: "dispose" | "settle") {
    window.location.hash = "#/from";
    await pause();
    window.location.hash = "#/page";
    await pause();
    let guard: HistoryGuard | null = null;
    const routed: string[] = [];
    const router = (event: Event) => {
      routed.push(`${event.type} ${window.location.hash}`);
      if (window.location.hash === "#/page" || guard === null) return;
      if (rerender === "dispose") {
        guard.dispose();
        guard = null;
      } else guard.settle();
    };
    window.addEventListener("popstate", router, true);
    window.addEventListener("hashchange", router, true);
    cleanup.push(() => {
      window.removeEventListener("popstate", router, true);
      window.removeEventListener("hashchange", router, true);
      guard?.dispose();
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const go = vi.spyOn(window.history, "go");
    guard = guardHistory(() => window.confirm("leave?"));
    return { confirm, go, routed };
  }

  for (const rerender of ["dispose", "settle"] as const) {
    test(`asks once on a real Back, keeps the address on cancel and leaves on confirm (${rerender})`, async () => {
      const { confirm, go, routed } = await setup(rerender);
      window.history.back();
      await pause();
      expect(confirm).toHaveBeenCalledTimes(1);
      expect(window.location.hash).toBe("#/page");
      expect(routed.filter((entry) => !entry.endsWith("#/page"))).toEqual([]);
      confirm.mockReturnValue(true);
      window.history.back();
      await pause();
      expect(confirm).toHaveBeenCalledTimes(2);
      expect(window.location.hash).toBe("#/from");
      expect(routed).toContain("popstate #/from");
      expect(go).not.toHaveBeenCalled();
    });
  }
});
