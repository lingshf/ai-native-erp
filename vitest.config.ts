import { configDefaults, defineConfig } from "vitest/config";
import { BaseSequencer, type TestSpecification } from "vitest/node";
import react from "@vitejs/plugin-react";
import { readdirSync, readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { selectShardFiles } from "./scripts/ci.ts";

const root = fileURLToPath(new URL(".", import.meta.url));
const layerExclude = process.env.CI_TEST_LAYER === "pr" ? ["**/*.slow.test.{ts,tsx}"] : [];
const browserFiles = ["packages/infra/test/http/*gui*.slow.test.ts"];

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
    const selected = new Set(
      selectShardFiles(
        files.map((spec) => this.key(spec)),
        this.weights,
        this.ctx.config,
        Object.fromEntries(files.map((spec) => [this.key(spec), spec.project.name])),
      ),
    );
    return files.filter((spec) => selected.has(this.key(spec)));
  }

  // Files stay grouped by project: with isolate: false a worker reuses its module graph only
  // within a project. Projects whose longest file is longest go first (so the isolated
  // storage backup file starts at t=0 instead of running alone at the end), and inside each
  // project the longest recorded files start first; unknown files count as longest.
  override async sort(files: TestSpecification[]) {
    const weight = (spec: TestSpecification) =>
      this.weights[this.key(spec)] ?? Number.POSITIVE_INFINITY;
    const projectWeight = new Map<string, number>();
    for (const spec of files) {
      projectWeight.set(
        spec.project.name,
        Math.max(projectWeight.get(spec.project.name) ?? 0, weight(spec)),
      );
    }
    const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
    const sorted = [...files].sort(
      (a, b) =>
        (projectWeight.get(b.project.name) ?? 0) - (projectWeight.get(a.project.name) ?? 0) ||
        byName(a.project.name, b.project.name) ||
        weight(b) - weight(a) ||
        byName(this.key(a), this.key(b)),
    );
    // Order diagnostic for isolate: false (a custom sequencer disables Vitest's
    // `--sequence.shuffle.files`): TEST_FILE_ORDER=reverse|shuffle:<seed> reorders files
    // inside each project and keeps project grouping. Unset keeps the weighted order.
    const order = process.env.TEST_FILE_ORDER;
    if (!order) return sorted;
    const shuffleSeed = /^shuffle:(\d+)$/u.exec(order)?.[1];
    if (order !== "reverse" && shuffleSeed === undefined) {
      throw new Error(`TEST_FILE_ORDER must be "reverse" or "shuffle:<seed>", got "${order}"`);
    }
    let state = Number(shuffleSeed ?? 0) >>> 0;
    const random = () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const groups = new Map<string, TestSpecification[]>();
    for (const spec of sorted) {
      groups.set(spec.project.name, [...(groups.get(spec.project.name) ?? []), spec]);
    }
    return [...groups.values()].flatMap((group) => {
      if (order === "reverse") return group.reverse();
      for (let i = group.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        [group[i], group[j]] = [group[j], group[i]];
      }
      return group;
    });
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
          exclude: [
            ...configDefaults.exclude,
            ...layerExclude,
            ...moduleMockFiles,
            ...browserFiles,
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "infra-browser",
          environment: "node",
          include: browserFiles,
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
