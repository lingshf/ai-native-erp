import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  test: {
    pool: "forks",
    maxWorkers: 4,
    testTimeout: 15_000,
    hookTimeout: 15_000,
    clearMocks: true,
    restoreMocks: true,
    exclude: [
      ...configDefaults.exclude,
      ...(process.env.CI_TEST_LAYER === "pr" ? ["**/*.slow.test.{ts,tsx}"] : []),
    ],
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
