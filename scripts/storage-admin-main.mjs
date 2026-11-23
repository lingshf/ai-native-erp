import { resolve } from "node:path";

class InvalidConfiguration extends Error {
  constructor() {
    super("Invalid explicit storage configuration. Use --help.");
  }
}

const decisionCOptions = {
  "--drafts": ["import-as-draft", "skip"],
  "--receipts": ["import", "archive-only"],
  "--source-events": ["import", "archive-only"],
  "--transfer-queue": ["import", "archive-only"],
  "--seals": ["import", "archive-only"],
  "--audit": ["import", "archive-only"],
};
const legacyImportValuedOptions = [
  "--snapshot-dir",
  "--target",
  "--opening-items",
  ...Object.keys(decisionCOptions),
];

function readLegacyImportOptions(tokens) {
  const options = new Map();
  for (let index = 0; index < tokens.length; index++) {
    const key = tokens[index];
    if (options.has(key)) throw new InvalidConfiguration();
    if (key === "--dry-run") {
      options.set(key, true);
      continue;
    }
    const value = tokens[++index];
    if (!legacyImportValuedOptions.includes(key) || !value || value.startsWith("--"))
      throw new InvalidConfiguration();
    options.set(key, value);
  }
  return options;
}

// M2-02: a dry run may omit all decision C options to list them, but never takes half a set,
// and never names a target, so nobody mistakes it for a run that wrote a database.
function parseLegacyImportArguments(tokens) {
  const options = readLegacyImportOptions(tokens);
  const dryRun = options.has("--dry-run");
  const givenChoices = Object.keys(decisionCOptions).filter((key) => options.has(key));
  const completeChoices = givenChoices.length === Object.keys(decisionCOptions).length;
  const writesTarget = options.has("--target") || options.has("--opening-items");
  if (
    !options.has("--snapshot-dir") ||
    !(completeChoices || (dryRun && givenChoices.length === 0)) ||
    (dryRun ? writesTarget : !options.has("--target")) ||
    givenChoices.some((key) => !decisionCOptions[key].includes(options.get(key)))
  )
    throw new InvalidConfiguration();
  const choices = completeChoices
    ? Object.fromEntries(givenChoices.map((key) => [key.slice(2), options.get(key)]))
    : undefined;
  if (dryRun)
    return {
      action: "legacy-import",
      dryRun,
      snapshot: resolve(options.get("--snapshot-dir")),
      choices,
    };
  return {
    action: "legacy-import",
    snapshot: resolve(options.get("--snapshot-dir")),
    target: resolve(options.get("--target")),
    choices,
    openingItems: options.has("--opening-items")
      ? resolve(options.get("--opening-items"))
      : undefined,
  };
}

function countRecordReasons(reasonsByObject, record) {
  if (!record.reasons.length) return;
  const key = `${record.source}.${record.object}`;
  reasonsByObject[key] ??= {};
  const reasons = reasonsByObject[key];
  for (const reason of record.reasons) reasons[reason] = (reasons[reason] ?? 0) + 1;
}

async function legacyImportDryRun(snapshot, choices) {
  const { legacyImportPlan } = await import("../packages/infra/src/legacy/import-plan.ts");
  const plan = legacyImportPlan(snapshot, { dryRun: true, choices, includeTotals: false });
  const decisions = plan.next().value;
  const listed = {
    dryRun: true,
    snapshotSha256: decisions.snapshotSha256,
    choices: decisions.choices,
  };
  if (!choices) {
    plan.return();
    return listed;
  }
  const reasons = {};
  for (const event of plan) {
    if (event.type === "record") countRecordReasons(reasons, event);
    if (event.type === "summary") {
      const { executable, counts, drafts } = event;
      return { ...listed, executable, counts, drafts, reasons };
    }
  }
  throw new Error("Legacy import plan ended without a summary.");
}

function parseArguments(args) {
  if (args.length === 1 && args[0] === "--help") return null;
  const [action, ...tokens] = args;
  if (action === "legacy-reconcile") {
    const options = new Map();
    for (let index = 0; index < tokens.length; index++) {
      const key = tokens[index];
      if (!["--snapshot-dir", "--target", "--check", "--confirm"].includes(key) || options.has(key))
        throw new InvalidConfiguration();
      if (key === "--check") options.set(key, true);
      else {
        const value = tokens[++index];
        if (!value || value.startsWith("--")) throw new InvalidConfiguration();
        options.set(key, resolve(value));
      }
    }
    if (
      options.size !== 3 ||
      !options.has("--snapshot-dir") ||
      !options.has("--target") ||
      options.has("--check") === options.has("--confirm")
    )
      throw new InvalidConfiguration();
    return {
      action,
      snapshot: options.get("--snapshot-dir"),
      target: options.get("--target"),
      confirmation: options.get("--confirm"),
    };
  }
  if (action === "legacy-import") return parseLegacyImportArguments(tokens);
  if (action === "legacy-snapshot") {
    const options = new Map();
    for (let index = 0; index < tokens.length; index += 2) {
      const key = tokens[index],
        value = tokens[index + 1];
      if (
        !["--source-dir", "--out-dir"].includes(key) ||
        options.has(key) ||
        !value ||
        value.startsWith("--")
      )
        throw new InvalidConfiguration();
      options.set(key, resolve(value));
    }
    if (options.size !== 2) throw new InvalidConfiguration();
    return {
      action,
      source: options.get("--source-dir"),
      output: options.get("--out-dir"),
    };
  }
  if (action === "backup" || action === "restore") {
    if (tokens.length !== 2 || tokens.some((token) => !token || token.startsWith("--")))
      throw new InvalidConfiguration();
    return {
      action,
      configuration: { filename: resolve(tokens[0]) },
      transfer: resolve(tokens[1]),
    };
  }
  if (!["migrate", "verify", "provision"].includes(action)) throw new InvalidConfiguration();
  const options = new Map();
  const valued = new Set(["--provider", "--file", "--tenant", "--book", "--company"]);
  for (let index = 0; index < tokens.length; index += 2) {
    const key = tokens[index],
      value = tokens[index + 1];
    if (!valued.has(key) || options.has(key) || !value || value.startsWith("--"))
      throw new InvalidConfiguration();
    options.set(key, value);
  }
  if (options.get("--provider") !== "sqlite" || !options.has("--file"))
    throw new InvalidConfiguration();
  const scopeOptions = ["--tenant", "--book", "--company"];
  if (action !== "provision" && scopeOptions.some((key) => options.has(key)))
    throw new InvalidConfiguration();
  let scope;
  if (action === "provision") {
    if (!options.has("--tenant") || (options.has("--company") && !options.has("--book"))) {
      throw new InvalidConfiguration();
    }
    scope = {
      level: options.has("--company") ? "company" : options.has("--book") ? "book" : "tenant",
      tenantId: options.get("--tenant"),
      ...(options.has("--book") ? { bookId: options.get("--book") } : {}),
      ...(options.has("--company") ? { companyId: options.get("--company") } : {}),
    };
  }
  return {
    action,
    scope,
    configuration: { filename: resolve(options.get("--file")) },
  };
}

function readOpeningItems(readFileSync, file) {
  try {
    return readFileSync(file);
  } catch (error) {
    if (["ENOENT", "EISDIR", "EACCES", "EPERM"].includes(error?.code))
      throw new InvalidConfiguration();
    throw error;
  }
}

export async function runStorageAdmin(args, { stdout, stderr }) {
  let StorageFailure;
  let LegacyFailure;
  let exitCode = 0;
  try {
    const command = parseArguments(args);
    if (!command) {
      stdout(
        JSON.stringify({
          usage: "storage-admin.mjs migrate|verify|provision --provider sqlite --file FILE",
          scope: "provision requires --tenant ID, optionally --book ID and --company ID",
          backup: "storage-admin.mjs backup <db> <out> | restore <db> <in> (stop service first)",
          legacy:
            "storage-admin.mjs legacy-snapshot --source-dir DIR --out-dir NEW_DIR (isolated stopped source, Windows only)",
          legacyImport:
            "storage-admin.mjs legacy-import --snapshot-dir DIR --target NEW_DB --drafts import-as-draft|skip --receipts import|archive-only --source-events import|archive-only --transfer-queue import|archive-only --seals import|archive-only --audit import|archive-only [--opening-items FILE.json] (required when AP/AR control accounts are in scope)",
          legacyImportDryRun:
            "storage-admin.mjs legacy-import --snapshot-dir DIR --dry-run [all six decision options above] (read-only; without options lists each option and affected count, with all six prints the plan summary; no --target or --opening-items)",
          legacyReconcile:
            "storage-admin.mjs legacy-reconcile --snapshot-dir DIR --target DB --check | --confirm FILE",
          safety:
            "Explicit new target only; no .env, DATA_DIR, original-ledger defaults, implicit migration or business seeding.",
        }),
      );
    } else if (command.action === "legacy-import" || command.action === "legacy-reconcile") {
      const { StorageError } = await import("@erp/core/application/storage");
      StorageFailure = StorageError;
      const { readFileSync } = await import("node:fs");
      const { join } = await import("node:path");
      const { LegacyImportSnapshot } = await import("../packages/infra/src/legacy/import-plan.ts");
      let manifest;
      try {
        manifest = JSON.parse(readFileSync(join(command.snapshot, "manifest.json"), "utf8"));
      } catch (error) {
        if (error instanceof SyntaxError || error?.code === "ENOENT")
          throw new StorageError("INVALID_SNAPSHOT");
        throw error;
      }
      const snapshot = new LegacyImportSnapshot(command.snapshot, manifest);
      try {
        let result;
        if (command.dryRun) {
          result = await legacyImportDryRun(snapshot, command.choices);
        } else if (command.action === "legacy-import") {
          const { executeLegacyImport } = await import(
            "../packages/infra/src/storage/legacy-import.ts"
          );
          result = await executeLegacyImport(snapshot, {
            target: command.target,
            choices: command.choices,
            ...(command.openingItems
              ? {
                  openingItems: {
                    bytes: readOpeningItems(readFileSync, command.openingItems),
                  },
                }
              : {}),
          });
        } else {
          const { checkLegacyReconciliation, confirmLegacyReconciliation } = await import(
            "../packages/infra/src/legacy/reconcile.ts"
          );
          result = command.confirmation
            ? await confirmLegacyReconciliation(snapshot, command.target, command.confirmation)
            : await checkLegacyReconciliation(snapshot, command.target);
          if (result.verdict !== "pass") exitCode = 1;
        }
        stdout(JSON.stringify({ ...result, action: command.action }));
      } finally {
        snapshot.close();
      }
    } else if (command.action === "legacy-snapshot") {
      const { produceLegacySnapshot, LegacySnapshotError } = await import(
        "./legacy-snapshot-producer.mjs"
      );
      LegacyFailure = LegacySnapshotError;
      await produceLegacySnapshot(command.source, command.output);
      stdout(JSON.stringify({ status: "ok", action: command.action }));
    } else {
      const application = await import("@erp/core/application");
      StorageFailure = application.StorageError;
      const scope = command.scope ? application.parseScope(command.scope) : undefined;
      const { createSqliteStorage, backupSqlite, restoreSqlite } = await import(
        "@erp/infra/storage"
      );
      let restored;
      if (command.action === "backup") {
        await backupSqlite(command.configuration.filename, command.transfer);
      } else if (command.action === "restore") {
        restored = await restoreSqlite(command.configuration.filename, command.transfer);
      } else {
        const storage = createSqliteStorage(command.configuration);
        try {
          if (command.action === "migrate") await storage.migrate();
          await storage.verifySchema();
          if (command.action === "provision") await storage.provision(scope);
        } finally {
          await storage.close();
        }
      }
      stdout(
        JSON.stringify({
          status: "ok",
          action: command.action,
          provider: "sqlite",
          ...(scope ? { scope } : {}),
          ...(restored ? { backup: restored.backup } : {}),
        }),
      );
    }
  } catch (error) {
    const invalid = error instanceof InvalidConfiguration;
    const classified =
      (StorageFailure && error instanceof StorageFailure) ||
      (LegacyFailure && error instanceof LegacyFailure);
    stderr(
      JSON.stringify({
        error: {
          code: invalid ? "INVALID_INPUT" : classified ? error.code : "STORAGE_FAILURE",
          message: invalid
            ? error.message
            : classified
              ? error.message
              : "Storage operation failed.",
        },
      }),
    );
    exitCode = 1;
  }
  return exitCode;
}
