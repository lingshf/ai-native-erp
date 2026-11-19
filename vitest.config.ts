import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { readdirSync, readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const layerExclude = process.env.CI_TEST_LAYER === "pr" ? ["**/*.slow.test.{ts,tsx}"] : [];

// Files share a module graph per worker (isolate: false) because the suite is
// CPU-bound on CI. Module-level vi.mock() needs a fresh graph, so those files
// run in a separate isolated project.
const moduleMockFiles = readdirSync(join(root, "packages/infra"), { recursive: true })
  .map(String)
  .filter((file) => file.endsWith(".test.ts") && !file.includes("node_modules"))
  .filter((file) =>
    /^\s*vi\.mock\(/mu.test(readFileSync(join(root, "packages/infra", file), "utf8")),
  )
  .map((file) => relative(root, join(root, "packages/infra", file)).replaceAll("\\", "/"));

export default defineConfig({
  root,
  test: {
    pool: "forks",
    maxWorkers: availableParallelism(),
    isolate: false,
    testTimeout: 15_000,
    hookTimeout: 15_000,
    clearMocks: true,
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
    exclude: [...configDefaults.exclude, ...layerExclude],
    projects: [
      {
        extends: true,
        test: {
          name: "core",
          environment: "node",
          include: ["packages/core/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "infra",
          environment: "node",
          include: ["packages/infra/**/*.test.ts"],
          exclude: [...configDefaults.exclude, ...layerExclude, ...moduleMockFiles],
        },
      },
      {
        extends: true,
        test: {
          name: "infra-isolated",
          environment: "node",
          isolate: true,
          include: moduleMockFiles.length > 0 ? moduleMockFiles : ["<none>"],
        },
      },
      {
        extends: true,
        plugins: [react()],
        test: {
          name: "web",
          root: "./packages/web",
          environment: "jsdom",
          include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
          setupFiles: ["./test/setup.ts"],
        },
      },
    ],
  },
});
