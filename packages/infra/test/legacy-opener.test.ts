import { test } from "vitest";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openVerifiedTeachingReader } from "../../../scripts/legacy-snapshot-reader.mjs";
import { inspectLedger } from "../../../scripts/legacy-snapshot-verifier.mjs";
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
  for (const [sql, message] of [
    ["DROP TRIGGER immutable_audit_UPDATE", /Incomplete immutable enterprise schema/],
    ["ALTER TABLE configs ADD COLUMN unexpected TEXT", /Incompatible enterprise schema/],
    ["UPDATE currencies SET scale=3 WHERE code='EUR'", /Currency precision integrity failure/],
  ] as const) {
    const invalid = legacyFixture(t);
    const file = join(invalid.target, "erp.sqlite");
    const db = new DatabaseSync(file);
    try {
      const trigger = db
        .prepare("SELECT sql FROM sqlite_schema WHERE name='currency_scale'")
        .get()?.sql;
      if (sql.startsWith("UPDATE currencies")) db.exec("DROP TRIGGER currency_scale");
      db.exec(sql);
      if (sql.startsWith("UPDATE currencies")) {
        assert.equal(typeof trigger, "string");
        db.exec(trigger);
      }
    } finally {
      db.close();
    }
    const unchanged = captureDirectory(invalid.directory);
    assert.throws(() => inspectLedger(file, "enterprise"), { code: "SNAPSHOT_INVALID", message });
    assert.throws(() => openVerifiedTeachingReader(invalid.target), { code: "INVALID_SNAPSHOT" });
    assert.deepEqual(captureDirectory(invalid.directory), unchanged);
  }
});

test("shared opener classifies failed manifest verification and never returns a success-shaped empty reader", (t) => {
  const f = legacyFixture(t);
  writeFileSync(join(f.target, "manifest.json"), "{}");
  const before = captureDirectory(f.directory);
  assert.throws(() => openVerifiedTeachingReader(f.target), { code: "INVALID_SNAPSHOT" });
  assert.deepEqual(captureDirectory(f.directory), before);
});
