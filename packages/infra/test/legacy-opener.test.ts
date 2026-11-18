import { test } from "vitest";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { openVerifiedTeachingReader } from "../../../scripts/legacy-snapshot-reader.mjs";
import { legacyFixture, captureDirectory } from "./support/legacy-fixture.mjs";

test("shared opener verifies the real pair and holds a read-only reader without changing either source", (t) => {
  const f = legacyFixture(t, { wal: true });
  const before = captureDirectory(f.directory);
  const reader = openVerifiedTeachingReader(f.target);
  f.readers.push(reader);
  assert.equal(reader.info.snapshotSha256, f.manifest.ledgers.teaching.sha256);
  assert.deepEqual(
    reader.trialBalances(f.month).trialBalances,
    f.book.reports(f.month).trialBalances,
  );
  reader.close();
  assert.deepEqual(captureDirectory(f.directory), before);
});

test("shared opener classifies failed manifest verification and never returns a success-shaped empty reader", (t) => {
  const f = legacyFixture(t);
  writeFileSync(join(f.target, "manifest.json"), "{}");
  const before = captureDirectory(f.directory);
  assert.throws(() => openVerifiedTeachingReader(f.target), { code: "INVALID_SNAPSHOT" });
  assert.deepEqual(captureDirectory(f.directory), before);
});
