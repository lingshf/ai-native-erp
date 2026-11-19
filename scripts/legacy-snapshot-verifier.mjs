import fs from "node:fs";
import { createHash } from "node:crypto";
import { dirname, parse, resolve, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { StorageError } from "@erp/core/application";
import { snapshotError, snapshotStat } from "@erp/infra/legacy-teaching";
import { legacyEnterpriseIntegrity } from "./legacy-enterprise-integrity.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const jsonHash = (value) => hash(JSON.stringify(value));
const filenames = { teaching: "teaching.sqlite", enterprise: "erp.sqlite" };
const quote = (identifier) => '"' + identifier.replaceAll('"', '""') + '"';
const fail = (message) => {
  const error = new Error(message);
  error.code = "SNAPSHOT_INVALID";
  throw error;
};

function regularPath(file, directory = false) {
  if (typeof file !== "string" || !file.trim()) fail("An explicit path is required.");
  const path = resolve(file),
    root = parse(path).root;
  for (let cursor = path; cursor !== root; cursor = dirname(cursor)) {
    if (fs.lstatSync(cursor).isSymbolicLink()) fail("Symbolic-link paths are not supported.");
  }
  const stat = fs.lstatSync(path);
  if (!(directory ? stat.isDirectory() : stat.isFile()))
    fail("Expected a regular file or directory.");
  return path;
}

function typed(value) {
  if (value === null) return ["null"];
  if (typeof value === "bigint") return ["integer", value.toString()];
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("Non-finite SQLite value.");
    return ["real", Object.is(value, -0) ? "-0" : String(value)];
  }
  if (typeof value === "string") return ["text", value];
  if (value instanceof Uint8Array) return ["blob", Buffer.from(value).toString("base64")];
  fail("Unsupported SQLite value.");
}

function canonicalTeaching(db) {
  const periods = db
    .prepare("SELECT * FROM periods ORDER BY month")
    .all()
    .map((row) => ({ ...row }));
  const journals = db
    .prepare("SELECT * FROM journals ORDER BY date DESC,id DESC")
    .all()
    .map((row) => ({
      ...row,
      lines: db
        .prepare("SELECT id,account,debit,credit FROM lines WHERE journal_id=? ORDER BY id")
        .all(row.id)
        .map((line) => {
          if (!Number.isSafeInteger(line.debit) || !Number.isSafeInteger(line.credit))
            fail("Unsafe teaching amount.");
          const dimensions = Object.fromEntries(
            db
              .prepare(
                "SELECT dimension,value FROM line_dimensions WHERE line_id=? ORDER BY dimension",
              )
              .all(line.id)
              .map((value) => [value.dimension, value.value]),
          );
          return {
            account: line.account,
            debit: line.debit,
            credit: line.credit,
            ...(Object.keys(dimensions).length ? { dimensions } : {}),
          };
        }),
    }));
  const totals = { debit: 0n, credit: 0n };
  for (const journal of journals)
    if (journal.status === "posted")
      for (const line of journal.lines) {
        totals.debit += BigInt(line.debit);
        totals.credit += BigInt(line.credit);
      }
  if (totals.debit !== totals.credit) fail("Teaching posted ledger is unbalanced.");
  return {
    canonicalSha256: jsonHash({ periods, journals }).toUpperCase(),
    journals: journals.map(({ id, status }) => ({ id, status })),
    postedTotals: { debit: String(totals.debit), credit: String(totals.credit) },
  };
}

export function inspectLedger(file, kind) {
  if (!Object.hasOwn(filenames, kind)) fail("Unsupported ledger kind.");
  const path = regularPath(file);
  const db = new DatabaseSync(path, { readOnly: true });
  let description;
  try {
    db.exec("BEGIN");
    if (
      db
        .prepare("PRAGMA integrity_check")
        .all()
        .some((row) => row.integrity_check !== "ok") ||
      db.prepare("PRAGMA foreign_key_check").all().length
    )
      fail("SQLite integrity check failed.");
    const schema = db
      .prepare(
        "SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' OR name='sqlite_sequence' ORDER BY type,name",
      )
      .all()
      .map((row) => ({ ...row }));
    const tables = schema
      .filter((row) => row.type === "table")
      .map((row) => row.name)
      .sort();
    const required =
      kind === "teaching"
        ? ["accounts", "periods", "journals", "lines", "line_dimensions"]
        : ["companies", "configs", "journals", "source_events", "receipts", "transfer_queue"];
    if (required.some((table) => !tables.includes(table)))
      fail("Ledger schema does not match the requested kind.");
    const tableDigests = tables.map((name) => {
      const statement = db.prepare(`SELECT * FROM ${quote(name)}`);
      statement.setReadBigInts(true);
      const columns = statement.columns().map((column) => column.name);
      const rows = statement
        .all()
        .map((row) => JSON.stringify(columns.map((column) => typed(row[column]))))
        .sort();
      return { name, columns, rows: rows.length, sha256: jsonHash(rows) };
    });
    const version = db.prepare("PRAGMA user_version").get().user_version;
    const logical = {
      sha256: jsonHash({ version, schema, tables: tableDigests }),
      schemaVersion: version,
      tables: tableDigests,
    };
    description = {
      logical,
      ...(kind === "teaching"
        ? canonicalTeaching(db)
        : { integrity: legacyEnterpriseIntegrity(db) }),
    };
    db.exec("ROLLBACK");
  } finally {
    db.close();
  }
  return description;
}

function describe(file, kind) {
  const description = inspectLedger(file, kind);
  return {
    file: filenames[kind],
    bytes: fs.statSync(file).size,
    sha256: hash(fs.readFileSync(file)),
    ...description,
  };
}

export function verifyLedgerSnapshot(target) {
  let file;
  let before;
  let check = "path";
  try {
    file = typeof target === "string" ? resolve(target) : undefined;
    before = snapshotStat(file);
    const directory = regularPath(target, true);
    file = join(directory, "manifest.json");
    before = snapshotStat(file);
    regularPath(file);
    check = "manifest";
    const manifestBytes = fs.readFileSync(file);
    const manifest = JSON.parse(manifestBytes.toString("utf8"));
    const verified = [{ file, before, sha256: hash(manifestBytes) }];
    if (
      !manifest ||
      manifest.version !== 1 ||
      manifest.status !== "verified" ||
      manifest.crossDatabaseAtomic !== false ||
      !manifest.ledgers ||
      Object.keys(manifest.ledgers).sort().join(",") !== "enterprise,teaching" ||
      Object.keys(manifest).sort().join(",") !== "crossDatabaseAtomic,ledgers,status,version"
    )
      fail("Invalid snapshot manifest version or fields.");
    for (const kind of Object.keys(filenames)) {
      file = join(directory, filenames[kind]);
      before = snapshotStat(file);
      check = "manifest";
      const entry = manifest.ledgers[kind];
      if (
        !entry ||
        entry.file !== filenames[kind] ||
        !Number.isSafeInteger(entry.bytes) ||
        entry.bytes <= 0 ||
        !/^[a-f0-9]{64}$/.test(entry.sha256)
      )
        fail("Invalid manifest file or digest.");
      check = "path";
      regularPath(file);
      before = fs.lstatSync(file, { bigint: true });
      check = "digest";
      if (before.size !== BigInt(entry.bytes) || hash(fs.readFileSync(file)) !== entry.sha256)
        fail("Snapshot byte count or hash differs.");
      check = "schema";
      const actual = describe(file, kind);
      check = "logical-digest";
      if (JSON.stringify(actual) !== JSON.stringify(entry))
        fail("Snapshot logical digest or integrity differs.");
      verified.push({ file, before, sha256: entry.sha256 });
    }
    // Recheck the whole pair and manifest after all SQL handles have closed, before delivery.
    for (const entry of verified) {
      ({ file, before } = entry);
      const unchanged = () => {
        const after = fs.lstatSync(file, { bigint: true });
        if (["dev", "ino", "size", "mtimeNs"].some((key) => before[key] !== after[key]))
          throw snapshotError("identity", before, after);
      };
      check = "identity";
      unchanged();
      check = "digest";
      if (hash(fs.readFileSync(file)) !== entry.sha256)
        fail("Snapshot bytes changed during verification.");
      check = "identity";
      unchanged();
    }
    return manifest;
  } catch (error) {
    if (error instanceof StorageError && "diagnostic" in error) throw error;
    throw snapshotError(check, before, snapshotStat(file));
  }
}
