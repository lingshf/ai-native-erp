import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { StorageError } from "@erp/core/application";

function paths(filename: string) {
  const canonical = join(realpathSync(dirname(filename)), basename(filename));
  return { lock: `${canonical}.maintenance-lock`, users: `${canonical}.users` };
}

function gate(filename: string): () => void {
  const { lock } = paths(filename);
  let descriptor: number;
  try {
    descriptor = openSync(lock, "wx", 0o600);
  } catch (error) {
    if (error !== null && typeof error === "object" && "code" in error && error.code === "EEXIST")
      throw new StorageError("BUSY");
    throw error;
  }
  closeSync(descriptor);
  return () => unlinkSync(lock);
}

// Admission and maintenance use the same gate, so no connection can slip between
// checking existing users and replacing the database.
export async function acquireDatabaseLease(
  filename: string,
  validate?: () => Promise<void>,
): Promise<() => void> {
  let release: (() => void) | undefined;
  for (let attempt = 0; ; attempt++) {
    try {
      release = gate(filename);
      break;
    } catch (error) {
      if (!(error instanceof StorageError) || error.code !== "BUSY" || attempt >= 50) throw error;
      await setTimeout(10);
    }
  }
  try {
    await validate?.();
    const { users } = paths(filename);
    mkdirSync(users, { recursive: true, mode: 0o700 });
    const lease = join(users, `${process.pid}-${randomUUID()}`);
    writeFileSync(lease, "", { flag: "wx", mode: 0o600 });
    return () => unlinkSync(lease);
  } finally {
    release();
  }
}

export function acquireMaintenance(filename: string): () => void {
  const release = gate(filename);
  try {
    const { users } = paths(filename);
    if (existsSync(users)) {
      for (const name of readdirSync(users)) {
        const match = /^([1-9]\d*)-[\da-f-]+$/u.exec(name);
        if (!match) throw new StorageError("BUSY");
        try {
          process.kill(Number(match[1]), 0);
        } catch (error) {
          if (
            error !== null &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "ESRCH"
          ) {
            unlinkSync(join(users, name));
            continue;
          }
          throw error;
        }
        throw new StorageError("BUSY");
      }
    }
    return release;
  } catch (error) {
    release();
    throw error;
  }
}
