import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { closeSync, openSync, readFileSync, readSync, statSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

// Shared by legacy-import-bench.mjs and scripts/bench-migration-rehearsal.mjs (D420).
// Fictional data only: the fixture SQL plus generated "Fictional Bench" journals.
export const MILLION_GL_LINES = 1_000_000;
const HASH_CHUNK_BYTES = 65536;

/** Streams the file so hashing a million-line ledger does not hold it in memory. */
export function ledgerMetadata(directory, file) {
  const hash = createHash("sha256");
  const fd = openSync(join(directory, file), "r");
  const buffer = Buffer.alloc(HASH_CHUNK_BYTES);
  try {
    let length = readSync(fd, buffer, 0, buffer.length, null);
    while (length) {
      hash.update(buffer.subarray(0, length));
      length = readSync(fd, buffer, 0, buffer.length, null);
    }
    return { file, bytes: statSync(join(directory, file)).size, sha256: hash.digest("hex") };
  } finally {
    closeSync(fd);
  }
}

export function snapshotLedgers(directory) {
  return {
    teaching: ledgerMetadata(directory, "teaching.sqlite"),
    enterprise: ledgerMetadata(directory, "erp.sqlite"),
  };
}

// Dry-run only needs volume: 500k balanced two-line journals. An executable import also needs
// realistic journal sizes, so it writes 50k twenty-line journals (the last one with 14 lines).
function teachingVolumeSql(executable) {
  if (executable)
    return `WITH RECURSIVE n(i) AS (SELECT 10 UNION ALL SELECT i+1 FROM n WHERE i<50009),
                l(line) AS (SELECT 0 UNION ALL SELECT line+1 FROM l WHERE line<19)
                INSERT INTO lines SELECT (i-10)*20+10+line,i,
                  CASE WHEN line<CASE WHEN i=50009 THEN 7 ELSE 10 END THEN '1000' ELSE '4000' END,
                  CASE WHEN line<CASE WHEN i=50009 THEN 7 ELSE 10 END THEN 1 ELSE 0 END,
                  CASE WHEN line<CASE WHEN i=50009 THEN 7 ELSE 10 END THEN 0 ELSE 1 END
                FROM n CROSS JOIN l WHERE i<50009 OR line<14;`;
  return `WITH RECURSIVE n(i) AS (SELECT 10 UNION ALL SELECT i+1 FROM n WHERE i<500005)
          INSERT INTO lines SELECT i*2,i,'1000',1,0 FROM n;
          WITH RECURSIVE n(i) AS (SELECT 10 UNION ALL SELECT i+1 FROM n WHERE i<500005)
          INSERT INTO lines SELECT i*2+1,i,'4000',0,1 FROM n;`;
}

function writeTeachingVolume(db, executable) {
  db.exec(`
          DROP TRIGGER immutable_line_insert;
          PRAGMA cache_size=-8192;
          BEGIN;
          WITH RECURSIVE n(i) AS (SELECT 10 UNION ALL SELECT i+1 FROM n WHERE i<${executable ? 50009 : 500005})
          INSERT INTO journals SELECT i,'2026-01-15','Fictional Bench','normal','posted',NULL FROM n;
          ${teachingVolumeSql(executable)}
          COMMIT;
        `);
}

function copyLedger(source, output) {
  const db = new DatabaseSync(source, { readOnly: true });
  try {
    db.prepare("VACUUM main INTO ?").run(output);
  } finally {
    db.close();
  }
}

/**
 * Writes teaching.sqlite and erp.sqlite into `directory` and returns their verified manifest.
 * `executable` selects the importable variant (1,000,002 source lines → 1,000,000 GL lines).
 * `enterpriseSource` replaces the plain enterprise fixture, e.g. a `legacyFixture` ledger with
 * the advance accounts that opening-items master data needs.
 */
export function writeMillionLineSnapshot(directory, { executable, enterpriseSource }) {
  if (enterpriseSource) copyLedger(enterpriseSource, join(directory, "erp.sqlite"));
  const sourceLines = executable ? MILLION_GL_LINES + 2 : MILLION_GL_LINES;
  for (const [file, fixture] of [
    ["teaching.sqlite", "base.sql"],
    ["erp.sqlite", "enterprise.sql"],
  ]) {
    if (file === "erp.sqlite" && enterpriseSource) continue;
    const db = new DatabaseSync(join(directory, file));
    try {
      db.exec(readFileSync(new URL(`./legacy-data/${fixture}`, import.meta.url), "utf8"));
      if (file === "teaching.sqlite") {
        writeTeachingVolume(db, executable);
        assert.equal(db.prepare("SELECT count(*) AS n FROM lines").get().n, sourceLines);
      }
    } finally {
      db.close();
    }
  }
  const manifest = {
    version: 1,
    status: "verified",
    crossDatabaseAtomic: false,
    ledgers: snapshotLedgers(directory),
  };
  return { manifest, sourceLines };
}
