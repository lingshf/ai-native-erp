import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, type MockInstance, vi } from "vitest";

let testTimers: MockInstance<typeof setTimeout>;

beforeEach(() => {
  window.localStorage.clear();
  testTimers = vi.spyOn(globalThis, "setTimeout");
});

// A virtual list's 150 ms scroll-reset debounce (@tanstack/virtual-core) outlives its test;
// when it fires after the fork's jsdom is torn down, React reads the deleted `window`.
// Runs after cleanup(), so the timers belong to components that are already unmounted.
function clearTimersLeftByTest() {
  for (const result of testTimers.mock.results) {
    if (result.type === "return") clearTimeout(result.value);
  }
}

afterEach(() => {
  cleanup();
  clearTimersLeftByTest();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
