import { test, vi } from "vitest";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import fs from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openVerifiedTeachingReader } from "../../../scripts/legacy-snapshot-reader.mjs";
import { inspectLedger, verifyLedgerSnapshot } from "../../../scripts/legacy-snapshot-verifier.mjs";
import { legacyFixture, captureDirectory, snapshotRejection } from "./support/legacy-fixture.mjs";

test("shared opener verifies the real pair and holds a read-only reader without changing either source", (t) => {
  const f = legacyFixture(t, { wal: true });
  const before = captureDirectory(f.directory, { mtime: true });
  const reader = openVerifiedTeachingReader(f.target);
  f.readers.push(reader);
  assert.equal(reader.info.snapshotSha256, f.manifest.ledgers.teaching.sha256);
  assert.deepEqual(
    reader.trialBalances(f.month).trialBalances,
    f.book.reports(f.month).trialBalances,
  );
  reader.close();
  assert.deepEqual(captureDirectory(f.directory, { mtime: true }), before);
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
    // Keep the physical digest valid so the shared entrance reaches schema/integrity inspection.
    const bytes = readFileSync(file);
    invalid.manifest.ledgers.enterprise.bytes = bytes.length;
    invalid.manifest.ledgers.enterprise.sha256 = createHash("sha256").update(bytes).digest("hex");
    writeFileSync(join(invalid.target, "manifest.json"), JSON.stringify(invalid.manifest));
    const unchanged = captureDirectory(invalid.directory, { mtime: true });
    assert.throws(() => inspectLedger(file, "enterprise"), { code: "SNAPSHOT_INVALID", message });
    assert.throws(
      () => openVerifiedTeachingReader(invalid.target),
      snapshotRejection("schema", fs.statSync(file, { bigint: true })),
    );
    assert.deepEqual(captureDirectory(invalid.directory, { mtime: true }), unchanged);
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
  const frozen = captureDirectory(f.directory, { mtime: true });
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
  assert.deepEqual(captureDirectory(f.directory, { mtime: true }), frozen);
});

test("shared opener classifies failed manifest verification and never returns a success-shaped empty reader", (t) => {
  const f = legacyFixture(t);
  const manifestFile = join(f.target, "manifest.json");
  for (const check of ["manifest", "digest", "logical-digest"]) {
    const manifest = structuredClone(f.manifest);
    if (check === "digest") manifest.ledgers.teaching.sha256 = "0".repeat(64);
    if (check === "logical-digest") manifest.ledgers.teaching.logical.sha256 = "0".repeat(64);
    writeFileSync(manifestFile, JSON.stringify(check === "manifest" ? {} : manifest));
    const before = captureDirectory(f.directory, { mtime: true });
    assert.throws(
      () => openVerifiedTeachingReader(f.target),
      snapshotRejection(
        check,
        fs.statSync(check === "manifest" ? manifestFile : f.snapshot, { bigint: true }),
      ),
    );
    assert.deepEqual(captureDirectory(f.directory, { mtime: true }), before);
  }
});

test("shared opener rejects an mtime-only change during pair verification before handing out a reader", (t) => {
  const f = legacyFixture(t);
  const file = join(f.target, "erp.sqlite");
  const originalRead = fs.readFileSync;
  const originalStat = fs.statSync(file, { bigint: true });
  let reads = 0;
  let injected: ReturnType<typeof captureDirectory> | undefined;
  const spy = vi.spyOn(fs, "readFileSync").mockImplementation((...args) => {
    const bytes = originalRead(...args);
    if (args[0] === file && ++reads === 2) {
      // Simulate an external metadata change after logical inspection, with unchanged bytes.
      fs.utimesSync(file, new Date(), new Date("2000-01-01T00:00:00Z"));
      injected = captureDirectory(f.directory, { mtime: true });
    }
    return bytes;
  });
  try {
    assert.throws(
      () => {
        const reader = openVerifiedTeachingReader(f.target);
        f.readers.push(reader);
      },
      { code: "INVALID_SNAPSHOT" },
    );
    assert.ok(injected);
    assert.notEqual(fs.statSync(file, { bigint: true }).mtimeNs, originalStat.mtimeNs);
    assert.deepEqual(captureDirectory(f.directory, { mtime: true }), injected);
  } finally {
    spy.mockRestore();
  }
});
