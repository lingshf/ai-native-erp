import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  inspectLedger,
  verifyLedgerSnapshot,
} from "../../../../scripts/legacy-snapshot-verifier.mjs";

export function captureDirectory(directory) {
  return fs
    .readdirSync(directory)
    .sort()
    .map((name) => {
      const file = join(directory, name);
      return [
        name,
        fs.statSync(file).isDirectory()
          ? captureDirectory(file)
          : createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
      ];
    });
}

export function legacyFixture(t, { wal = false, history = false, many = false } = {}) {
  const directory = resolve(`.legacy-fixture-${randomUUID()}`);
  fs.mkdirSync(directory);
  const teaching = join(directory, "source-teaching.sqlite");
  const enterprise = join(directory, "source-enterprise.sqlite");
  const connections = [];
  const readers = [];
  t.onTestFinished(() => {
    for (const reader of readers) reader.close();
    for (const connection of connections) connection.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const variant = history
    ? wal
      ? "history-wal"
      : "history"
    : wal
      ? "wal"
      : many
        ? "many"
        : "base";
  for (const [file, name] of [
    [teaching, variant],
    [enterprise, "enterprise"],
  ]) {
    const db = new DatabaseSync(file);
    connections.push(db);
    if (wal && file === teaching) {
      db.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0");
    }
    db.exec(fs.readFileSync(new URL(`./legacy-data/${name}.sql`, import.meta.url), "utf8"));
  }
  if (wal) {
    connections[0].exec("BEGIN");
    connections[0].prepare("SELECT COUNT(*) FROM journals").get();
  }
  // Frozen old outputs are an independent oracle, not the new projection under test.
  const oracle = JSON.parse(
    fs.readFileSync(new URL(`./legacy-data/${variant}.json`, import.meta.url), "utf8"),
  );
  const book = {
    accounts: () => structuredClone(oracle.accounts),
    reports: (month) => structuredClone(oracle.reports[month]),
    ledger: (account, month) => structuredClone(oracle.ledgers[month][account]),
  };
  const before = captureDirectory(directory);
  const target = join(directory, "snapshot");
  fs.mkdirSync(target);
  const ledgers = {};
  for (const [kind, source, file] of [
    ["teaching", teaching, "teaching.sqlite"],
    ["enterprise", enterprise, "erp.sqlite"],
  ]) {
    const output = join(target, file);
    const db = new DatabaseSync(source, { readOnly: true });
    try {
      db.prepare("VACUUM main INTO ?").run(output);
    } finally {
      db.close();
    }
    const bytes = fs.readFileSync(output);
    assert.deepEqual([...bytes.subarray(18, 20)], [1, 1]);
    ledgers[kind] = {
      file,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      ...inspectLedger(output, kind),
    };
  }
  const manifest = { version: 1, status: "verified", crossDatabaseAtomic: false, ledgers };
  fs.writeFileSync(join(target, "manifest.json"), JSON.stringify(manifest));
  assert.deepEqual(verifyLedgerSnapshot(target), manifest);
  assert.deepEqual(
    captureDirectory(directory).filter(([name]) => name !== "snapshot"),
    before,
  );
  return {
    directory,
    teaching,
    enterprise,
    book,
    target,
    manifest,
    snapshot: join(target, "teaching.sqlite"),
    readers,
    month: history ? "2026-02" : "2026-01",
    config: { directory: target, verifiedManifest: manifest },
  };
}

export function metadataFor(file, directory) {
  const data = fs.readFileSync(file);
  return {
    directory,
    verifiedManifest: {
      version: 1,
      status: "verified",
      crossDatabaseAtomic: false,
      ledgers: {
        teaching: {
          file: "teaching.sqlite",
          bytes: data.length,
          sha256: createHash("sha256").update(data).digest("hex"),
        },
      },
    },
  };
}
