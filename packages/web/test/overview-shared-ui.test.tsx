import { act, render, screen, within } from "@testing-library/react";
import { isInaccessible } from "@testing-library/dom";
import { beforeEach, expect, it, vi } from "vitest";
import { label } from "../src/ui/index.ts";

type SharedModule = typeof import("../src/ui/components/index.tsx");

// The shared components chunk is held back per test, as when components-*.js/css is slow, then
// either arrives or fails (blocked).
const gate = vi.hoisted(() => ({
  current: undefined as
    | undefined
    | {
        promise: Promise<SharedModule>;
        resolve: (module: SharedModule) => void;
        reject: (error: Error) => void;
      },
}));

beforeEach(() => {
  let resolve!: (module: SharedModule) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<SharedModule>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  gate.current = { promise, resolve, reject };
  vi.resetModules();
  vi.doMock("../src/ui/components/index.tsx", () => promise);
});

async function renderPending() {
  const { App } = await import("../src/App.tsx");
  const view = render(<App />);
  const page = view.container.querySelector<HTMLElement>(".overview-page")!;
  const status = page.querySelector<HTMLElement>(".overview-status")!;
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  // Pending: the loading note is the only exposed (and only live) content; the transparent
  // placeholder with heading, status and the not-yet-judged data warning is inert and hidden.
  const exposed = within(page);
  expect(exposed.getByRole("status").textContent).toBe(label("zh", "shell.uiLoading"));
  expect(exposed.queryByRole("heading")).toBeNull();
  expect(exposed.queryByRole("region")).toBeNull();
  expect(exposed.queryByRole("button")).toBeNull();
  expect(isInaccessible(status)).toBe(true);
  expect(isInaccessible(screen.getByText(label("zh", "shell.dataWarning")))).toBe(true);
  expect(page.querySelector(".overview-content")?.hasAttribute("inert")).toBe(true);
  // Health has failed already, but it is not shown before the final layout exists.
  expect(screen.queryByText(label("zh", "shell.networkError"))).toBeNull();
  expect(status.textContent).toBe(label("zh", "shell.healthLoading"));
  return { page, status };
}

it("exposes the final page with the same status region once the shared chunk arrives", async () => {
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new Error("offline")));
  const { page, status } = await renderPending();
  const actual = await vi.importActual<SharedModule>("../src/ui/components/index.tsx");
  await act(async () => {
    gate.current!.resolve(actual);
    await gate.current!.promise;
  });
  const exposed = within(page);
  expect(exposed.getByRole("status")).toBe(status);
  expect(status.textContent).toContain(label("zh", "shell.networkError"));
  expect(exposed.getByRole("heading", { name: label("zh", "shell.overview") })).toBeTruthy();
  expect(exposed.getByRole("region", { name: label("zh", "shell.data") })).toBeTruthy();
  expect(exposed.getByRole("button", { name: label("zh", "shell.retry") })).toBeTruthy();
  expect(exposed.queryByText(label("zh", "shell.uiLoading"))).toBeNull();
  expect(page.querySelector(".overview-content")?.hasAttribute("inert")).toBe(false);
});

it("degrades visibly with the same status region when the shared chunk fails", async () => {
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new Error("offline")));
  const { page, status } = await renderPending();
  await act(async () => {
    gate.current!.reject(new Error("Unable to preload CSS"));
    await gate.current!.promise.catch(() => undefined);
  });
  const exposed = within(page);
  expect(exposed.getByRole("status")).toBe(status);
  expect(exposed.getByRole("alert").textContent).toContain(label("zh", "shell.uiFailed"));
  expect(exposed.getByRole("button", { name: label("zh", "shell.uiReload") })).toBeTruthy();
  expect(status.textContent).toContain(label("zh", "shell.networkError"));
  expect(exposed.getByRole("button", { name: label("zh", "shell.retry") })).toBeTruthy();
  expect(exposed.getByRole("heading", { name: label("zh", "shell.overview") })).toBeTruthy();
});
