import { act, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { label } from "../src/ui/index.ts";
import { App } from "../src/App.tsx";

// The shared components chunk is held back and then fails, as when components-*.js/css is slow or blocked.
const gate = vi.hoisted(() => {
  let reject!: (error: Error) => void;
  const promise = new Promise<never>((_resolve, rejectPromise) => {
    reject = rejectPromise;
  });
  return { promise, reject };
});
vi.mock("../src/ui/components/index.tsx", () => gate.promise);

it("keeps the status region and controls inert until the shared chunk settles, then degrades visibly", async () => {
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new Error("offline")));
  const { container } = render(<App />);
  const status = screen.getByRole("status");
  const loading = screen.getByText(label("zh", "shell.healthLoading"));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  // Health has failed already, but nothing is shown or operable before the final layout exists.
  expect(screen.queryByText(label("zh", "shell.networkError"))).toBeNull();
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.getByText(label("zh", "shell.healthLoading"))).toBe(loading);
  expect(container.querySelector(".overview-page")?.getAttribute("aria-busy")).toBe("true");

  await act(async () => {
    gate.reject(new Error("Unable to preload CSS"));
    await gate.promise.catch(() => undefined);
  });
  expect(screen.getByRole("status")).toBe(status);
  expect(screen.getByRole("alert").textContent).toContain(label("zh", "shell.uiFailed"));
  expect(screen.getByRole("button", { name: label("zh", "shell.uiReload") })).toBeTruthy();
  expect(screen.getByText(label("zh", "shell.networkError"))).toBeTruthy();
  expect(screen.getByRole("button", { name: label("zh", "shell.retry") })).toBeTruthy();
  expect(container.querySelector(".overview-page")?.hasAttribute("aria-busy")).toBe(false);
});
