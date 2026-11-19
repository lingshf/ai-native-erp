import { configDefaults, defineConfig } from "vitest/config";
import { BaseSequencer, type TestSpecification } from "vitest/node";
import react from "@vitejs/plugin-react";
import { readdirSync, readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { balanceShards } from "./scripts/ci.ts";

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

// `--shard` splits files by recorded run time (scripts/test-shard-weights.json,
// regenerate with `node scripts/ci.ts weights REPORT.json...`) instead of by path hash.
class WeightedShardSequencer extends BaseSequencer {
  private readonly weights = JSON.parse(
    readFileSync(join(root, "scripts/test-shard-weights.json"), "utf8"),
  ) as Record<string, number>;

  private key(spec: TestSpecification) {
    return relative(root, spec.moduleId).replaceAll("\\", "/");
  }

  override async shard(files: TestSpecification[]) {
    const { shard } = this.ctx.config;
    if (!shard) return files;
    const selected = new Set(
      balanceShards(
        files.map((spec) => this.key(spec)),
        this.weights,
        shard.count,
      )[shard.index - 1],
    );
    return files.filter((spec) => selected.has(this.key(spec)));
  }

  // Longest recorded files start first across all projects so that no long file
  // (for example an isolated one) is left running alone at the end; unknown files first.
  override async sort(files: TestSpecification[]) {
    const weight = (spec: TestSpecification) =>
      this.weights[this.key(spec)] ?? Number.POSITIVE_INFINITY;
    return [...files].sort(
      (a, b) =>
        weight(b) - weight(a) ||
        (this.key(a) < this.key(b) ? -1 : this.key(a) > this.key(b) ? 1 : 0),
    );
  }
}

export default defineConfig({
  root,
  test: {
    pool: "forks",
    maxWorkers: availableParallelism(),
    isolate: false,
    sequence: { sequencer: WeightedShardSequencer },
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
