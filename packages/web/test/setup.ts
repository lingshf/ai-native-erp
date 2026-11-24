import { cleanup, configure } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, vi } from "vitest";

// FLAKE-09 trial runs needed 3000 ms under load; still 1/5 of testTimeout, so
// several waits in one test stay within it.
const ASYNC_WAIT_MS = 3000;
configure({ asyncUtilTimeout: ASYNC_WAIT_MS });

// With isolate: false, a worker's first lazy route load was timed inside the
// first findBy wait (FLAKE-09); loading the routes up front moves it into a hook.
const lazyRouteModules = import.meta.glob(["../src/*.tsx", "!../src/main.tsx", "../src/ui/components/index.tsx"]);

beforeAll(async () => {
  const loadRoutes = Object.values(lazyRouteModules);
  if (loadRoutes.length === 0) throw new Error("No route modules found to preload");
  await Promise.all(loadRoutes.map((load) => load()));
});

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});