import { constants, closeSync, fstatSync, lstatSync, openSync, readSync } from "node:fs";
import type { BigIntStats } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, join, parse, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { SQLOutputValue } from "node:sqlite";
import { StorageError } from "@erp/core/application";
import type {
  LegacyTeachingLedger,
  LegacyTeachingLedgerQuery,
  LegacyTeachingPeriod,
  LegacyTeachingReader,
  LegacyTeachingSnapshotInfo,
  LegacyTeachingTrialBalances,
  VerifiedTeachingSnapshotConfiguration,
} from "@erp/core/application";
import {
  DomainError,
  checkedMinor,
  checkedTeachingMonth,
  projectTeachingLedger,
  projectTrialBalances,
} from "@erp/core/domain";
import type {
  AccountCategory,
  JournalKind,
  PostedTeachingLine,
  ProjectionAccount,
} from "@erp/core/domain";

type Row = Record<string, SQLOutputValue>;
type SnapshotEntry =
  VerifiedTeachingSnapshotConfiguration["verifiedManifest"]["ledgers"]["teaching"];
type SnapshotCheck =
  | "validation"
  | "configuration"
  | "path"
  | "manifest"
  | "header"
  | "sidecar"
  | "identity"
  | "digest"
  | "logical-digest"
  | "schema"
  | "projection"
  | "read";

function fail(code: ConstructorParameters<typeof StorageError>[0]): never {
  if (code === "INVALID_SNAPSHOT") return invalidSnapshot("validation");
  throw new StorageError(code);
}

export function snapshotError(
  check: SnapshotCheck,
  before?: BigIntStats,
  after?: BigIntStats,
  code: "INVALID_SNAPSHOT" | "SCHEMA_MISMATCH" = "INVALID_SNAPSHOT",
) {
  const describe = (stat?: BigIntStats) =>
    stat
      ? {
          size: String(stat.size),
          mtimeNs: String(stat.mtimeNs),
          ino: String(stat.ino),
          dev: String(stat.dev),
          ctimeNs: String(stat.ctimeNs),
        }
      : null;
  const diagnostic = { check, before: describe(before), after: describe(after) };
  const error = new StorageError(code);
  error.message += ` ${JSON.stringify(diagnostic)}`;
  return Object.assign(error, { diagnostic });
}

function invalidSnapshot(check: SnapshotCheck, before?: BigIntStats, after?: BigIntStats): never {
  throw snapshotError(check, before, after);
}

export function snapshotStat(file?: string): BigIntStats | undefined {
  if (file === undefined) return undefined;
  try {
    return lstatSync(file, { bigint: true });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      ["ENOENT", "ENOTDIR", "EACCES", "EPERM", "ELOOP"].includes(String(error.code))
    )
      return undefined;
    throw error;
  }
}

function record(value: unknown): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  ) {
    return fail("INVALID_SNAPSHOT");
  }
  const result: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== "string" || !descriptor || !("value" in descriptor))
      fail("INVALID_SNAPSHOT");
    Object.defineProperty(result, key, { value: descriptor.value, enumerable: true });
  }
  return result;
}

function configuration(value: unknown): { directory: string; entry: SnapshotEntry } {
  const raw = record(value);
  if (
    Object.keys(raw).sort().join(",") !== "directory,verifiedManifest" ||
    typeof raw.directory !== "string" ||
    !raw.directory.trim() ||
    !isAbsolute(raw.directory)
  )
    fail("INVALID_SNAPSHOT");
  const manifest = record(raw.verifiedManifest),
    ledgers = record(manifest.ledgers);
  const entry = record(ledgers.teaching);
  if (
    manifest.version !== 1 ||
    manifest.status !== "verified" ||
    manifest.crossDatabaseAtomic !== false ||
    entry.file !== "teaching.sqlite" ||
    typeof entry.bytes !== "number" ||
    !Number.isSafeInteger(entry.bytes) ||
    entry.bytes < 100 ||
    typeof entry.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(entry.sha256)
  )
    fail("INVALID_SNAPSHOT");
  return {
    directory: resolve(raw.directory),
    entry: { file: "teaching.sqlite", bytes: entry.bytes, sha256: entry.sha256 },
  };
}

function regularPath(path: string, directory = false): BigIntStats {
  let before: BigIntStats | undefined;
  try {
    before = lstatSync(path, { bigint: true });
    const root = parse(path).root;
    for (let cursor = path; cursor !== root; cursor = dirname(cursor)) {
      if (lstatSync(cursor).isSymbolicLink()) invalidSnapshot("path", before, snapshotStat(path));
    }
    if (!(directory ? before.isDirectory() : before.isFile()))
      invalidSnapshot("path", before, snapshotStat(path));
    return before;
  } catch (error) {
    if (error instanceof StorageError) throw error;
    return invalidSnapshot("path", before, snapshotStat(path));
  }
}

function sameFile(left: BigIntStats, right: BigIntStats): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

function assertSnapshotIdentity(before: BigIntStats, after: BigIntStats): void {
  if (!sameFile(before, after)) invalidSnapshot("identity", before, after);
}

function noSidecars(file: string, before: BigIntStats): void {
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    // lstat also rejects dangling symlink sidecars, unlike existsSync alone.
    try {
      lstatSync(file + suffix);
      invalidSnapshot("sidecar", before, regularPath(file));
    } catch (error) {
      if (error instanceof StorageError) throw error;
      if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT"))
        invalidSnapshot("sidecar", before, snapshotStat(file));
    }
  }
}

function header(fd: number, before: BigIntStats): void {
  const buffer = Buffer.alloc(100);
  if (
    readSync(fd, buffer, 0, 100, 0) !== 100 ||
    buffer.subarray(0, 16).toString("latin1") !== "SQLite format 3\0" ||
    buffer[18] !== 1 ||
    buffer[19] !== 1
  )
    invalidSnapshot("header", before, fstatSync(fd, { bigint: true }));
}

function openSnapshotFile(file: string): { fd: number; before: BigIntStats } {
  let before: BigIntStats | undefined;
  let fd: number | undefined;
  try {
    before = regularPath(file);
    if (before.size < 100n) return invalidSnapshot("header", before, before);
    noSidecars(file, before);
    fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    header(fd, before);
    noSidecars(file, before);
    assertSnapshotIdentity(before, fstatSync(fd, { bigint: true }));
    assertSnapshotIdentity(before, regularPath(file));
    return { fd, before };
  } catch (error) {
    if (fd !== undefined) closeSync(fd);
    if (error instanceof StorageError) throw error;
    return invalidSnapshot("read", before, snapshotStat(file));
  }
}

/**
 * Filesystem-only guard before M00 verification opens either fixed snapshot member.
 * This is not manifest verification or protection against a malicious directory race.
 */
export function preflightLegacySnapshotPair(directory: string): void {
  try {
    if (typeof directory !== "string" || !directory.trim() || !isAbsolute(directory))
      invalidSnapshot("path");
    const path = resolve(directory);
    regularPath(path, true);
    // Fixed M00 filenames; never accept manifest-selected paths.
    for (const filename of ["teaching.sqlite", "erp.sqlite"]) {
      const { fd } = openSnapshotFile(join(path, filename));
      closeSync(fd);
    }
  } catch (error) {
    if (error instanceof StorageError) throw error;
    invalidSnapshot("path");
  }
}

function digest(fd: number): string {
  const hash = createHash("sha256"),
    buffer = Buffer.alloc(65536);
  let position = 0,
    count: number;
  do {
    count = readSync(fd, buffer, 0, buffer.length, position);
    hash.update(buffer.subarray(0, count));
    position += count;
  } while (count);
  return hash.digest("hex");
}

function all(db: DatabaseSync, sql: string, ...parameters: (string | number)[]): Row[] {
  const statement = db.prepare(sql);
  statement.setReadBigInts(true);
  return statement.all(...parameters);
}

const requiredColumns: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  accounts: { code: "TEXT", name: "TEXT", category: "TEXT" },
  periods: { month: "TEXT", status: "TEXT" },
  journals: {
    id: "INTEGER",
    date: "TEXT",
    memo: "TEXT",
    kind: "TEXT",
    status: "TEXT",
    reversal_of: "INTEGER",
  },
  lines: {
    id: "INTEGER",
    journal_id: "INTEGER",
    account: "TEXT",
    debit: "INTEGER",
    credit: "INTEGER",
  },
  dimensions: { code: "TEXT", name: "TEXT", active: "INTEGER", revision: "INTEGER" },
  dimension_values: {
    dimension: "TEXT",
    code: "TEXT",
    name: "TEXT",
    active: "INTEGER",
    revision: "INTEGER",
  },
  line_dimensions: { line_id: "INTEGER", dimension: "TEXT", value: "TEXT" },
};
const primaryKeys: Readonly<Record<string, readonly string[]>> = {
  accounts: ["code"],
  periods: ["month"],
  journals: ["id"],
  lines: ["id"],
  dimensions: ["code"],
  dimension_values: ["dimension", "code"],
  line_dimensions: ["line_id", "dimension"],
};

function schema(db: DatabaseSync): void {
  for (const [table, required] of Object.entries(requiredColumns)) {
    const definition = all(db, "SELECT type FROM sqlite_schema WHERE name=?", table);
    if (definition.length !== 1 || definition[0].type !== "table") fail("SCHEMA_MISMATCH");
    const columns = all(db, `PRAGMA table_info("${table}")`);
    if (
      Object.entries(required).some(
        ([name, type]) => !columns.some((column) => column.name === name && column.type === type),
      )
    )
      fail("SCHEMA_MISMATCH");
    const keys = columns
      .filter((column) => typeof column.pk === "bigint" && column.pk > 0n)
      .sort((a, b) => Number(a.pk) - Number(b.pk))
      .map((column) => column.name);
    if (JSON.stringify(keys) !== JSON.stringify(primaryKeys[table])) fail("SCHEMA_MISMATCH");
  }
  const references = (
    table: string,
    target: string,
    columns: readonly (readonly [string, string])[],
  ): void => {
    const fks = all(db, `PRAGMA foreign_key_list("${table}")`);
    if (
      !fks.some(
        (first) =>
          first.table === target &&
          columns.every(([from, to], sequence) =>
            fks.some(
              (fk) =>
                fk.id === first.id &&
                fk.seq === BigInt(sequence) &&
                fk.from === from &&
                fk.to === to,
            ),
          ),
      )
    ) {
      fail("SCHEMA_MISMATCH");
    }
  };
  references("journals", "journals", [["reversal_of", "id"]]);
  references("lines", "journals", [["journal_id", "id"]]);
  references("lines", "accounts", [["account", "code"]]);
  references("dimension_values", "dimensions", [["dimension", "code"]]);
  references("line_dimensions", "lines", [["line_id", "id"]]);
  references("line_dimensions", "dimension_values", [
    ["dimension", "dimension"],
    ["value", "code"],
  ]);
  if (
    all(db, "PRAGMA integrity_check").some((row) => row.integrity_check !== "ok") ||
    all(db, "PRAGMA foreign_key_check").length
  )
    fail("INVALID_SNAPSHOT");
}

function text(value: SQLOutputValue | undefined): string {
  if (typeof value !== "string") return fail("SCHEMA_MISMATCH");
  return value;
}

function id(value: SQLOutputValue | undefined): number {
  if (typeof value !== "bigint" || value < 1n) return fail("INVALID_SNAPSHOT");
  return checkedMinor(value, 0);
}

function kind(value: SQLOutputValue | undefined): JournalKind {
  if (value !== "normal" && value !== "adjusting" && value !== "reversal" && value !== "closing") {
    return fail("INVALID_SNAPSHOT");
  }
  return value;
}

function category(value: SQLOutputValue | undefined): AccountCategory {
  if (
    value !== "ASSET" &&
    value !== "LIABILITY" &&
    value !== "EQUITY" &&
    value !== "REVENUE" &&
    value !== "EXPENSE"
  )
    return fail("INVALID_SNAPSHOT");
  return value;
}

function amount(value: SQLOutputValue | undefined): number {
  if (typeof value !== "bigint" || value < 0n) return fail("INVALID_SNAPSHOT");
  return checkedMinor(value, 2);
}

function accounts(db: DatabaseSync): ProjectionAccount[] {
  return all(db, "SELECT code,name,category FROM accounts ORDER BY code").map((row) => ({
    code: text(row.code),
    name: text(row.name),
    category: category(row.category),
  }));
}

function posted(db: DatabaseSync, month: string): PostedTeachingLine[] {
  const dimensions = new Map<number, Record<string, string>>();
  for (const row of all(
    db,
    `SELECT d.line_id,d.dimension,d.value FROM line_dimensions d
    JOIN lines l ON l.id=d.line_id JOIN journals j ON j.id=l.journal_id
    WHERE j.status='posted' AND j.date<? ORDER BY d.line_id,d.dimension`,
    `${month}-32`,
  )) {
    const key = id(row.line_id),
      map = dimensions.get(key) ?? {};
    Object.defineProperty(map, text(row.dimension), { value: text(row.value), enumerable: true });
    dimensions.set(key, map);
  }
  return all(
    db,
    `SELECT j.id,j.date,j.memo,j.kind,j.reversal_of,l.id AS line_id,
    l.account,l.debit,l.credit,s.kind AS source_kind
    FROM journals j JOIN lines l ON l.journal_id=j.id LEFT JOIN journals s ON s.id=j.reversal_of
    WHERE j.status='posted' AND j.date<? ORDER BY j.date,j.id,l.id`,
    `${month}-32`,
  ).map((row) => {
    const lineId = id(row.line_id),
      map = dimensions.get(lineId);
    return {
      id: id(row.id),
      lineId,
      date: text(row.date),
      memo: text(row.memo),
      kind: kind(row.kind),
      reversal_of: row.reversal_of === null ? null : id(row.reversal_of),
      source_kind: row.source_kind === null ? null : kind(row.source_kind),
      account: text(row.account),
      debit: amount(row.debit),
      credit: amount(row.credit),
      ...(map ? { dimensions: map } : {}),
    };
  });
}

interface Cursor {
  readonly snapshotSha256: string;
  readonly account: string;
  readonly month: string;
  readonly date: string;
  readonly journalId: number;
  readonly lineId: number;
}

function cursorPosition(cursor: unknown, sha256: string, account: string, month: string): Cursor {
  if (
    typeof cursor !== "string" ||
    !cursor.length ||
    cursor.length > 1024 ||
    !/^[A-Za-z0-9_-]+$/.test(cursor)
  )
    return fail("INVALID_CURSOR");
  try {
    const bytes = Buffer.from(cursor, "base64url");
    if (bytes.toString("base64url") !== cursor) return fail("INVALID_CURSOR");
    const encoded = bytes.toString("utf8");
    const value: unknown = JSON.parse(encoded);
    if (!value || typeof value !== "object" || Array.isArray(value)) return fail("INVALID_CURSOR");
    const raw = record(value);
    if (
      Object.keys(raw).sort().join(",") !== "account,date,journalId,lineId,month,snapshotSha256" ||
      raw.snapshotSha256 !== sha256 ||
      raw.account !== account ||
      raw.month !== month ||
      typeof raw.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(raw.date) ||
      typeof raw.journalId !== "number" ||
      !Number.isSafeInteger(raw.journalId) ||
      raw.journalId < 1 ||
      typeof raw.lineId !== "number" ||
      !Number.isSafeInteger(raw.lineId) ||
      raw.lineId < 1
    )
      return fail("INVALID_CURSOR");
    const result = {
      snapshotSha256: sha256,
      account,
      month,
      date: raw.date,
      journalId: raw.journalId,
      lineId: raw.lineId,
    };
    if (encoded !== JSON.stringify(result)) return fail("INVALID_CURSOR");
    return result;
  } catch {
    return fail("INVALID_CURSOR");
  }
}

function mapped<T>(work: () => T, invalid?: () => never): T {
  try {
    return work();
  } catch (error) {
    if (error instanceof StorageError) {
      if (error.code === "INVALID_SNAPSHOT" && invalid) return invalid();
      throw error;
    }
    if (error instanceof DomainError) {
      if (error.code !== "OVERFLOW" && invalid) return invalid();
      return fail(error.code === "OVERFLOW" ? "OVERFLOW" : "INVALID_SNAPSHOT");
    }
    return fail("STORAGE_FAILURE");
  }
}

class SnapshotReader implements LegacyTeachingReader {
  private closed = false;
  readonly info: LegacyTeachingSnapshotInfo;

  private readonly db: DatabaseSync;
  private readonly fd: number;
  private readonly before: BigIntStats;
  constructor(db: DatabaseSync, fd: number, entry: SnapshotEntry, before: BigIntStats) {
    this.db = db;
    this.fd = fd;
    this.before = before;
    this.info = Object.freeze({
      sourceKind: "verified-teaching-snapshot",
      baseline: "M00-verified-snapshot",
      live: false,
      snapshotSha256: entry.sha256,
      snapshotBytes: entry.bytes,
      scale: 2,
    });
  }

  private read<T>(work: () => T): T {
    return mapped(work, () =>
      invalidSnapshot("projection", this.before, fstatSync(this.fd, { bigint: true })),
    );
  }

  private month(month: unknown): string {
    if (this.closed) return fail("CLOSED");
    let value: string;
    try {
      value = checkedTeachingMonth(month);
    } catch (error) {
      if (error instanceof DomainError) return fail("INVALID_INPUT");
      throw error;
    }
    if (!all(this.db, "SELECT month FROM periods WHERE month=?", value).length)
      return fail("NOT_FOUND");
    return value;
  }

  periods(): readonly LegacyTeachingPeriod[] {
    return this.read(() => {
      if (this.closed) return fail("CLOSED");
      return all(this.db, "SELECT month,status FROM periods ORDER BY month").map((row) => {
        const month = checkedTeachingMonth(text(row.month)),
          status = text(row.status);
        if (status !== "open" && status !== "closed") return fail("INVALID_SNAPSHOT");
        return { month, status };
      });
    });
  }

  trialBalances(month: string): LegacyTeachingTrialBalances {
    return this.read(() => {
      const value = this.month(month);
      return projectTrialBalances(accounts(this.db), posted(this.db, value), value);
    });
  }

  ledger(query: LegacyTeachingLedgerQuery): LegacyTeachingLedger {
    return this.read(() => {
      if (this.closed) return fail("CLOSED");
      if (
        !query ||
        typeof query !== "object" ||
        Array.isArray(query) ||
        Object.keys(query).some((key) => !["month", "account", "limit", "cursor"].includes(key))
      )
        return fail("INVALID_INPUT");
      const month = this.month(query.month),
        account = query.account;
      if (typeof account !== "string" || !/^[1-9]\d{3}$/.test(account))
        return fail("INVALID_INPUT");
      if (!accounts(this.db).some((row) => row.code === account)) return fail("NOT_FOUND");
      const limit = query.limit === undefined ? 100 : query.limit;
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) return fail("INVALID_INPUT");
      const cursor =
        query.cursor === undefined
          ? undefined
          : cursorPosition(query.cursor, this.info.snapshotSha256, account, month);
      const projection = projectTeachingLedger(posted(this.db, month), account, month);
      let start = 0;
      if (cursor) {
        start =
          projection.entries.findIndex(
            (entry) =>
              entry.date === cursor.date &&
              entry.id === cursor.journalId &&
              entry.lineId === cursor.lineId,
          ) + 1;
        if (start === 0) return fail("INVALID_CURSOR");
      }
      const entries = projection.entries.slice(start, start + limit);
      const last = entries.at(-1);
      const nextCursor =
        last && start + entries.length < projection.entries.length
          ? Buffer.from(
              JSON.stringify({
                snapshotSha256: this.info.snapshotSha256,
                account,
                month,
                date: last.date,
                journalId: last.id,
                lineId: last.lineId,
              } satisfies Cursor),
            ).toString("base64url")
          : undefined;
      return { ...projection, entries, ...(nextCursor ? { nextCursor } : {}) };
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    mapped(() => {
      try {
        try {
          this.db.exec("ROLLBACK");
        } finally {
          this.db.close();
        }
      } finally {
        closeSync(this.fd);
      }
    });
  }
}

/**
 * Private operator directory only. Metadata is the result of the caller's M00 verifier,
 * not a user authorization token. Stat/hash checks bound accidental replacement; they
 * do not claim to defeat a malicious same-directory actor racing SQLite's path open.
 */
export function openLegacyTeachingSnapshot(
  config: VerifiedTeachingSnapshotConfiguration,
): LegacyTeachingReader {
  let db: DatabaseSync | undefined;
  let fd: number | undefined;
  let file: string | undefined;
  let before: BigIntStats | undefined;
  let check: SnapshotCheck = "configuration";
  try {
    const { directory, entry } = configuration(config);
    check = "path";
    preflightLegacySnapshotPair(directory);
    file = join(directory, entry.file);
    const opened = openSnapshotFile(file);
    fd = opened.fd;
    before = opened.before;
    if (before.size !== BigInt(entry.bytes)) return invalidSnapshot("digest", before, before);
    check = "read";
    db = new DatabaseSync(file, { readOnly: true });
    db.exec("BEGIN");
    all(db, "SELECT rootpage FROM sqlite_schema LIMIT 1");
    // The first SQLite read now holds SHARED until close; no mode change or checkpoint.
    header(fd, before);
    noSidecars(file, before);
    assertSnapshotIdentity(before, regularPath(file));
    assertSnapshotIdentity(before, fstatSync(fd, { bigint: true }));
    if (digest(fd) !== entry.sha256)
      return invalidSnapshot("digest", before, fstatSync(fd, { bigint: true }));
    assertSnapshotIdentity(before, regularPath(file));
    assertSnapshotIdentity(before, fstatSync(fd, { bigint: true }));
    check = "schema";
    schema(db);
    header(fd, before);
    noSidecars(file, before);
    assertSnapshotIdentity(before, regularPath(file));
    assertSnapshotIdentity(before, fstatSync(fd, { bigint: true }));
    // POSIX close() on any descriptor for this file drops this process's SQLite locks.
    const reader = new SnapshotReader(db, fd, entry, before);
    fd = undefined;
    db = undefined;
    return reader;
  } catch (error) {
    if (db) {
      try {
        db.close();
      } catch {
        /* Preserve the classified initialization failure. */
      }
    }
    const after = fd === undefined ? snapshotStat(file) : fstatSync(fd, { bigint: true });
    if (error instanceof StorageError) {
      if (
        error.code === "SCHEMA_MISMATCH" ||
        (error.code === "INVALID_SNAPSHOT" &&
          (!("diagnostic" in error) ||
            (error.diagnostic &&
              typeof error.diagnostic === "object" &&
              "check" in error.diagnostic &&
              error.diagnostic.check === "validation")))
      )
        throw snapshotError(check, before, after, error.code);
      throw error;
    }
    if (error instanceof DomainError)
      return error.code === "OVERFLOW" ? fail("OVERFLOW") : invalidSnapshot(check, before, after);
    if (
      error &&
      typeof error === "object" &&
      "errcode" in error &&
      (error.errcode === 5 || error.errcode === 6)
    )
      return fail("BUSY");
    return invalidSnapshot(check, before, after);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
