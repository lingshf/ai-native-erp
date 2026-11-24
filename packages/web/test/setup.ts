import { cleanup, configure } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, vi } from "vitest";

// FLAKE-09: 3000 ms passed the trial runs under load and is 1/5 of testTimeout.
const ASYNC_WAIT_MS = 3000;
configure({ asyncUtilTimeout: ASYNC_WAIT_MS });

// FLAKE-09: with isolate: false, the first lazy route load was timed inside the first findBy;
// preload it here. 60 s (D530): files after vi.resetModules() re-evaluate every route.
const PRELOAD_TIMEOUT_MS = 60_000;
const routeModules = import.meta.glob(["../src/{*,ui/components/index}.tsx", "!../src/main.tsx"]);

beforeAll(async () => {
  const loadRoutes = Object.values(routeModules);
  if (loadRoutes.length === 0) throw new Error("No route modules found to preload");
  await Promise.all(loadRoutes.map((load) => load()));
}, PRELOAD_TIMEOUT_MS);

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
