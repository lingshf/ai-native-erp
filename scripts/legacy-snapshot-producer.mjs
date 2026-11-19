import fs from "node:fs";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { DatabaseSync, backup } from "node:sqlite";
import { inspectLedger, verifyLedgerSnapshot } from "./legacy-snapshot-verifier.mjs";

const files = { teaching: "teaching.sqlite", enterprise: "erp.sqlite" };
const codes = new Set([
  "INVALID_INPUT",
  "UNSUPPORTED_PLATFORM",
  "SOURCE_BUSY",
  "SOURCE_CHANGED",
  "ROLLBACK_JOURNAL",
  "SNAPSHOT_FAILED",
]);
export class LegacySnapshotError extends Error {
  constructor(code) {
    super(`Legacy snapshot operation refused (${code}).`);
    this.code = code;
  }
}
const failure = (code) => new LegacySnapshotError(code);

function regularPath(path, directory) {
  for (let cursor = path; ; cursor = dirname(cursor)) {
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink()) throw failure("INVALID_INPUT");
    if (cursor === path && !(directory ? stat.isDirectory() : stat.isFile()))
      throw failure("INVALID_INPUT");
    if (dirname(cursor) === cursor) break;
  }
}

// Only this broker opens source files on Windows. SQLite sees private copies only.
export async function acquireWindowsSource(source) {
  if (process.platform !== "win32") throw failure("UNSUPPORTED_PLATFORM");
  const child = spawn(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-File",
      fileURLToPath(new URL("./legacy-source-lock.ps1", import.meta.url)),
    ],
    { stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
  );
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  let spawnError;
  child.on("error", (error) => {
    spawnError = error;
  });
  child.stdin.on("error", (error) => {
    spawnError = error;
  });
  child.stderr.resume();
  const exited = new Promise((resolveExit) => child.once("close", resolveExit));
  async function response() {
    const line = await lines.next();
    if (spawnError || line.done) throw failure("SOURCE_BUSY");
    const result = JSON.parse(line.value);
    if (result.error) throw failure(codes.has(result.error) ? result.error : "SOURCE_BUSY");
    return result;
  }
  const close = async () => {
    child.stdin.end('{"action":"close"}\n');
    await exited;
  };
  child.stdin.write(`${JSON.stringify({ source })}\n`);
  try {
    await response();
  } catch (error) {
    await close();
    throw error;
  }
  return {
    async capture() {
      child.stdin.write('{"action":"capture"}\n');
      return response();
    },
    async copy(destination) {
      child.stdin.write(`${JSON.stringify({ action: "copy", destination })}\n`);
      await response();
    },
    close,
  };
}

export async function produceLegacySnapshot(
  sourceDir,
  outDir,
  { acquireExclusive = acquireWindowsSource } = {},
) {
  let ownedOutput;
  try {
    if (
      typeof sourceDir !== "string" ||
      !sourceDir.trim() ||
      typeof outDir !== "string" ||
      !outDir.trim()
    )
      throw failure("INVALID_INPUT");
    const source = resolve(sourceDir),
      output = resolve(outDir);
    regularPath(source, true);
    regularPath(dirname(output), true);
    const within = relative(source, output);
    if (!within || (!within.startsWith(`..${sep}`) && within !== ".." && !isAbsolute(within)))
      throw failure("INVALID_INPUT");
    if (fs.existsSync(output)) throw failure("INVALID_INPUT");
    for (const file of Object.values(files)) {
      regularPath(join(source, file), false);
      if (fs.existsSync(join(source, `${file}-journal`))) throw failure("ROLLBACK_JOURNAL");
      for (const suffix of ["-wal", "-shm"])
        if (fs.existsSync(join(source, file + suffix)))
          regularPath(join(source, file + suffix), false);
    }
    const lease = await acquireExclusive(source);
    let entries;
    try {
      const before = await lease.capture();
      fs.mkdirSync(output, { mode: 0o700 });
      ownedOutput = output;
      const backupDir = join(output, "backup");
      fs.mkdirSync(backupDir, { mode: 0o700 });
      await lease.copy(backupDir);
      const after = await lease.capture();
      if (JSON.stringify(before) !== JSON.stringify(after)) throw failure("SOURCE_CHANGED");
      entries = before.filter((entry) => entry.exists && !entry.file.endsWith("-shm"));
      for (const entry of entries) {
        const bytes = fs.readFileSync(join(backupDir, entry.file));
        if (
          bytes.length !== entry.bytes ||
          createHash("sha256").update(bytes).digest("hex") !== entry.sha256
        )
          throw failure("SOURCE_CHANGED");
      }
    } finally {
      await lease.close();
    }
    const work = fs.mkdtempSync(join(output, ".work-"));
    const backupDir = join(output, "backup");
    for (const entry of entries)
      fs.copyFileSync(join(backupDir, entry.file), join(work, entry.file));
    const ledgers = {};
    for (const [kind, file] of Object.entries(files)) {
      const staging = join(work, file);
      const expected = inspectLedger(staging, kind);
      const db = new DatabaseSync(staging);
      try {
        const checkpoint = db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
        if (checkpoint.busy !== 0) throw failure("SNAPSHOT_FAILED");
        if (db.prepare("PRAGMA journal_mode=DELETE").get().journal_mode !== "delete")
          throw failure("SNAPSHOT_FAILED");
        await backup(db, join(output, file));
      } finally {
        db.close();
      }
      const bytes = fs.readFileSync(join(output, file));
      ledgers[kind] = {
        file,
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        ...expected,
      };
    }
    const manifest = { version: 1, status: "verified", crossDatabaseAtomic: false, ledgers };
    fs.writeFileSync(join(output, "manifest.json"), JSON.stringify(manifest), {
      flag: "wx",
      mode: 0o600,
    });
    verifyLedgerSnapshot(output);
    fs.writeFileSync(
      join(backupDir, "manifest.json"),
      JSON.stringify({
        version: 1,
        crossDatabaseAtomic: false,
        files: entries.map(({ file, bytes, sha256 }) => ({ file, bytes, sha256 })),
        logical: Object.fromEntries(
          Object.entries(ledgers).map(([kind, entry]) => [kind, entry.logical]),
        ),
      }),
      { flag: "wx", mode: 0o600 },
    );
    fs.rmSync(work, { recursive: true });
    return manifest;
  } catch (error) {
    if (ownedOutput) fs.rmSync(ownedOutput, { recursive: true, force: true });
    if (codes.has(error.code)) throw failure(error.code);
    throw failure("SNAPSHOT_FAILED");
  }
}
