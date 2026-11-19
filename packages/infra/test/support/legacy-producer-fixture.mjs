import fs from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { inspectLedger } from "../../../../scripts/legacy-snapshot-verifier.mjs";
import { optionalSourceFile } from "../../../../scripts/legacy-snapshot-producer.mjs";

export const sourceFiles = ["teaching.sqlite", "erp.sqlite"];

export function sourceInventory(source, lstat = fs.lstatSync) {
  for (const file of sourceFiles)
    if (optionalSourceFile(join(source, `${file}-journal`), lstat))
      throw Object.assign(new Error("Unrecovered journal"), { code: "ROLLBACK_JOURNAL" });
  return sourceFiles.flatMap((file) =>
    ["", "-wal", "-shm"].map((suffix) => {
      const name = file + suffix,
        path = join(source, name);
      const stat = optionalSourceFile(path, lstat);
      if (!stat) return { file: name, exists: false };
      return {
        file: name,
        exists: true,
        bytes: Number(stat.size),
        mtime: String(stat.mtimeNs),
        sha256: createHash("sha256").update(fs.readFileSync(path)).digest("hex"),
      };
    }),
  );
}

// Injected byte-only lease for portable CI; never a production fallback.
export function fakeExclusive(source) {
  return {
    capture: () => sourceInventory(source),
    copy(destination) {
      for (const entry of sourceInventory(source).filter(
        (entry) => entry.exists && !entry.file.endsWith("-shm"),
      ))
        fs.copyFileSync(
          join(source, entry.file),
          join(destination, entry.file),
          fs.constants.COPYFILE_EXCL,
        );
    },
    close() {},
  };
}

export function producerFixture(t, { million = false, wal = true } = {}) {
  const directory = resolve(`.legacy-fixture-${randomUUID()}`);
  const source = join(directory, "source"),
    output = join(directory, "output");
  fs.mkdirSync(source, { recursive: true });
  t.onTestFinished(() => fs.rmSync(directory, { recursive: true, force: true }));
  const expected = {};
  for (const [kind, file, fixture] of [
    ["teaching", "teaching.sqlite", "base"],
    ["enterprise", "erp.sqlite", "enterprise"],
  ]) {
    const seed = join(directory, file);
    const db = new DatabaseSync(seed);
    try {
      if (wal) db.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0");
      db.exec(fs.readFileSync(new URL(`./legacy-data/${fixture}.sql`, import.meta.url), "utf8"));
      if (kind === "teaching") {
        db.exec("INSERT INTO periods VALUES ('2025-12','closed')");
        if (million) {
          db.exec(`BEGIN;
            INSERT INTO journals VALUES (5,'2026-01-21','Fictional benchmark','normal','draft',NULL);
            WITH RECURSIVE n(i) AS (VALUES(9) UNION ALL SELECT i+1 FROM n WHERE i<1000002)
            INSERT INTO lines(id,journal_id,account,debit,credit)
            SELECT i,5,CASE WHEN i%2=1 THEN '1000' ELSE '4000' END,
              CASE WHEN i%2=1 THEN 1 ELSE 0 END, CASE WHEN i%2=0 THEN 1 ELSE 0 END FROM n;
            UPDATE journals SET status='posted' WHERE id=5;
            COMMIT`);
          const count = db
            .prepare(
              "SELECT count(*) AS n FROM lines JOIN journals ON journals.id=lines.journal_id WHERE journals.status='posted'",
            )
            .get().n;
          if (count !== 1000000)
            throw new Error("Fictional benchmark must contain one million posted GL lines.");
        }
      }
      if (!million) expected[kind] = inspectLedger(seed, kind);
      for (const suffix of ["", "-wal", "-shm"])
        if (fs.existsSync(seed + suffix))
          fs.copyFileSync(seed + suffix, join(source, file + suffix));
    } finally {
      db.close();
    }
  }
  return { directory, source, output, expected };
}
