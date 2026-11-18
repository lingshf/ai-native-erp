import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  selectPrTests,
  shouldRun,
  testSummary,
  vitestTimings,
  type TestTiming,
} from "../../../../scripts/ci.ts";

describe("CI selection and reporting", () => {
  it("keeps component-only and documentation changes incremental", () => {
    expect(selectPrTests(["packages/web/src/App.tsx", "README.md"])).toEqual({
      all: false,
      legacy: false,
    });
  });

  it("falls back on workspace/config changes without unnecessarily running legacy", () => {
    for (const file of [
      "package.json",
      "package-lock.json",
      "packages/web/package.json",
      "vitest.config.ts",
      "tsconfig.base.json",
      "packages/web/tsconfig.json",
    ]) {
      expect(selectPrTests([file]), file).toEqual({ all: true, legacy: false });
    }
    expect(selectPrTests(["src/server.mjs", "public/app.js", "tests/ui.test.mjs"])).toEqual({
      all: false,
      legacy: true,
    });
  });

  it("runs legacy tests when Git recognizes a rename out of the legacy tree", () => {
    const directory = mkdtempSync(join(tmpdir(), "erp-ci-rename-"));
    const git = (...args: string[]) =>
      execFileSync(
        "git",
        [
          "-c",
          "user.name=CI fixture",
          "-c",
          "user.email=ci-fixture@example.invalid",
          "-c",
          "commit.gpgsign=false",
          ...args,
        ],
        { cwd: directory, encoding: "utf8" },
      );
    const commit = (message: string) =>
      git(
        "commit",
        "--quiet",
        "-m",
        message,
        "-m",
        "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>",
      );
    try {
      git("init", "--quiet");
      git("config", "diff.renames", "true");
      mkdirSync(join(directory, "src"));
      mkdirSync(join(directory, "packages", "infra"), { recursive: true });
      writeFileSync(join(directory, "src", "example.mjs"), "export const amount = 100;\n");
      git("add", ".");
      commit("Legacy source fixture");
      git("update-ref", "refs/remotes/origin/main", "HEAD");
      git("mv", join("src", "example.mjs"), join("packages", "infra", "example.mjs"));
      commit("Move source out of legacy tree");
      expect(git("diff", "--name-status", "-M", "origin/main...HEAD")).toMatch(/^R100\t/);
      const output = join(directory, "outputs.txt");
      const stdout = execFileSync(
        process.execPath,
        [fileURLToPath(new URL("../../../../scripts/ci.ts", import.meta.url)), "plan"],
        {
          cwd: directory,
          encoding: "utf8",
          env: {
            ...process.env,
            BASE_REF: "main",
            GITHUB_OUTPUT: output,
            GITHUB_STEP_SUMMARY: join(directory, "summary.md"),
          },
        },
      );
      expect(readFileSync(output, "utf8")).toMatch(/^legacy=true$/m);
      expect(JSON.parse(stdout).files).toEqual(
        expect.arrayContaining(["src/example.mjs", "packages/infra/example.mjs"]),
      );
    } finally {
      rmSync(directory, { recursive: true });
    }
  });

  it("skips inactive nights but not a push/manual run", () => {
    const now = Date.UTC(2026, 10, 18);
    const cutoff = (now - 24 * 60 * 60 * 1000) / 1000;
    expect(shouldRun("schedule", cutoff - 1, now)).toBe(false);
    expect(shouldRun("schedule", cutoff, now)).toBe(true);
    expect(shouldRun("push", cutoff - 1, now)).toBe(true);
    expect(shouldRun("workflow_dispatch", cutoff - 1, now)).toBe(true);
  });

  it("combines legacy and Vitest timings, sorts top ten and escapes table cells", () => {
    const timings: TestTiming[] = Array.from({ length: 11 }, (_, index) => ({
      name: `case ${index}`,
      file: "packages/core/test/example.test.ts",
      durationMs: index,
      source: "vitest",
    }));
    timings.push({
      name: "legacy|slow\ncase",
      file: "tests/example.test.mjs",
      durationMs: 99,
      source: "legacy",
    });
    const markdown = testSummary(timings);
    expect(markdown).toContain("Executed tests with timings: 12");
    expect(markdown).toContain("legacy\\|slow case");
    expect(markdown.indexOf("99.00")).toBeLessThan(markdown.indexOf("10.00"));
    expect(markdown).not.toContain("| case 0 |");
    expect(markdown).not.toContain("| case 1 |");
  });

  it("reports failed tests and rejects malformed reports instead of masking them", () => {
    expect(
      vitestTimings({
        testResults: [
          {
            name: "test.ts",
            assertionResults: [
              { fullName: "failure", duration: 12, status: "failed" },
              { fullName: "skipped", status: "pending" },
            ],
          },
        ],
      }),
    ).toEqual([{ name: "failure", file: "test.ts", durationMs: 12, source: "vitest" }]);
    expect(() => vitestTimings({})).toThrow("Invalid Vitest JSON report");
  });
});
