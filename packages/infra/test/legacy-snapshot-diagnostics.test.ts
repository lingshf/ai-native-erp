import { test, vi } from "vitest";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import { preflightLegacySnapshotPair } from "../src/legacy/teaching.ts";
import { captureDirectory, legacyFixture } from "./support/legacy-fixture.mjs";

vi.mock("node:fs", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs")>();
  return { ...original, lstatSync: vi.fn(original.lstatSync) };
});

test.each(["header", "sidecar", "identity"] as const)(
  "INVALID_SNAPSHOT identifies %s and records safe before/after metadata without writes",
  async (check) => {
    const cleanup: (() => void)[] = [];
    const f = legacyFixture({ onTestFinished: (fn: () => void) => cleanup.push(fn) });
    const original = await vi.importActual<typeof import("node:fs")>("node:fs");
    try {
      if (check === "header") {
        const bytes = fs.readFileSync(f.snapshot);
        bytes[18] = 2;
        bytes[19] = 2;
        fs.writeFileSync(f.snapshot, bytes);
      } else if (check === "sidecar") {
        fs.writeFileSync(f.snapshot + "-wal", "independent test sidecar");
      }
      const before = captureDirectory(f.directory, { mtime: true });
      const stat = fs.statSync(f.snapshot, { bigint: true });
      let calls = 0;
      if (check === "identity") {
        vi.mocked(fs.lstatSync).mockImplementation((...args) => {
          const value = original.lstatSync(...args);
          if (args[0] === f.snapshot && typeof value.ino === "bigint" && ++calls === 2)
            value.ino += 1n;
          return value;
        });
      }
      assert.throws(
        () => preflightLegacySnapshotPair(f.target),
        (error: unknown) => {
          assert.ok(error instanceof Error && "code" in error && "diagnostic" in error);
          assert.equal(error.code, "INVALID_SNAPSHOT");
          const expected = {
            size: String(stat.size),
            mtimeNs: String(stat.mtimeNs),
            ino: String(stat.ino),
            dev: String(stat.dev),
            ctimeNs: String(stat.ctimeNs),
          };
          assert.deepEqual(error.diagnostic, {
            check,
            before: expected,
            after: { ...expected, ino: String(stat.ino + (check === "identity" ? 1n : 0n)) },
          });
          assert.ok(error.message.includes(JSON.stringify(error.diagnostic)));
          assert.ok(!error.message.includes(f.directory));
          assert.ok(!error.message.includes("SELECT"));
          return true;
        },
      );
      assert.deepEqual(captureDirectory(f.directory, { mtime: true }), before);
    } finally {
      vi.mocked(fs.lstatSync).mockImplementation(original.lstatSync);
      for (const fn of cleanup) fn();
    }
  },
);
