import { test } from "vitest";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openVerifiedTeachingReader } from "../../../scripts/legacy-snapshot-reader.mjs";
import { inspectLedger, verifyLedgerSnapshot } from "../../../scripts/legacy-snapshot-verifier.mjs";
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

  // Frozen a401d6f producer output, including its original manifest, not this verifier's output.
  const target = join(f.directory, "posted-oracle");
  mkdirSync(target);
  for (const file of ["teaching.sqlite", "erp.sqlite", "manifest.json"]) {
    const source = file === "manifest.json" ? "manifest.oracle" : file;
    copyFileSync(
      new URL(`./support/legacy-data/posted-snapshot/${source}`, import.meta.url),
      join(target, file),
    );
  }
  const original = readFileSync(join(target, "manifest.json"));
  const producer = JSON.parse(
    readFileSync(
      new URL("./support/legacy-data/posted-snapshot/producer.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(createHash("sha256").update(original).digest("hex"), producer.manifestSha256);
  const expected = JSON.parse(original.toString("utf8"));
  const counts = expected.ledgers.enterprise.integrity.counts;
  assert.equal(counts.source_events, 1);
  assert.equal(counts.receipts, 1);
  assert.equal(counts.journals, 1);
  assert.equal(counts.lines, 2);
  assert.equal(
    expected.ledgers.enterprise.logical.tables.find((table) => table.name === "journal_seals").rows,
    1,
  );
  const frozen = captureDirectory(f.directory);
  assert.deepEqual(verifyLedgerSnapshot(target), expected);
  const postedReader = openVerifiedTeachingReader(target);
  f.readers.push(postedReader);
  try {
    assert.equal(postedReader.info.snapshotSha256, expected.ledgers.teaching.sha256);
    assert.equal(postedReader.trialBalances("2026-01").month, "2026-01");
    assert.ok(postedReader.ledger({ month: "2026-01", account: "1000" }).entries.length > 0);
  } finally {
    postedReader.close();
  }
  assert.deepEqual(captureDirectory(f.directory), frozen);
});

test("shared opener classifies failed manifest verification and never returns a success-shaped empty reader", (t) => {
  const f = legacyFixture(t);
  writeFileSync(join(f.target, "manifest.json"), "{}");
  const before = captureDirectory(f.directory);
  assert.throws(() => openVerifiedTeachingReader(f.target), { code: "INVALID_SNAPSHOT" });
  assert.deepEqual(captureDirectory(f.directory), before);
});
