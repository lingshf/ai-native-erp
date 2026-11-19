import { resolve } from "node:path";

class InvalidConfiguration extends Error {
  constructor() {
    super("Invalid explicit storage configuration. Use --help.");
  }
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
  if (action === "legacy-import") {
    const options = new Map();
    const keys = [
      "--snapshot-dir",
      "--target",
      "--drafts",
      "--receipts",
      "--source-events",
      "--transfer-queue",
      "--seals",
      "--audit",
    ];
    for (let index = 0; index < tokens.length; index += 2) {
      const key = tokens[index],
        value = tokens[index + 1];
      if (
        (!keys.includes(key) && key !== "--opening-items") ||
        options.has(key) ||
        !value ||
        value.startsWith("--")
      )
        throw new InvalidConfiguration();
      options.set(key, value);
    }
    if (options.size !== keys.length + Number(options.has("--opening-items")))
      throw new InvalidConfiguration();
    for (const key of keys.slice(2)) {
      if (
        !(key === "--drafts" ? ["import-as-draft", "skip"] : ["import", "archive-only"]).includes(
          options.get(key),
        )
      )
        throw new InvalidConfiguration();
    }
    return {
      action,
      snapshot: resolve(options.get("--snapshot-dir")),
      target: resolve(options.get("--target")),
      choices: Object.fromEntries(keys.slice(2).map((key) => [key.slice(2), options.get(key)])),
      openingItems: options.has("--opening-items")
        ? resolve(options.get("--opening-items"))
        : undefined,
    };
  }
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
    return { action, source: options.get("--source-dir"), output: options.get("--out-dir") };
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
  return { action, scope, configuration: { filename: resolve(options.get("--file")) } };
}

function readOpeningItems(readFileSync, file) {
  try {
    return readFileSync(file);
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "EISDIR") throw new InvalidConfiguration();
    throw error;
  }
}

let StorageFailure;
let LegacyFailure;
try {
  const command = parseArguments(process.argv.slice(2));
  if (!command) {
    console.log(
      JSON.stringify({
        usage: "storage-admin.mjs migrate|verify|provision --provider sqlite --file FILE",
        scope: "provision requires --tenant ID, optionally --book ID and --company ID",
        backup: "storage-admin.mjs backup <db> <out> | restore <db> <in> (stop service first)",
        legacy:
          "storage-admin.mjs legacy-snapshot --source-dir DIR --out-dir NEW_DIR (isolated stopped source, Windows only)",
        legacyImport:
          "storage-admin.mjs legacy-import --snapshot-dir DIR --target NEW_DB --drafts import-as-draft|skip --receipts import|archive-only --source-events import|archive-only --transfer-queue import|archive-only --seals import|archive-only --audit import|archive-only [--opening-items FILE.json] (required when AP/AR control accounts are in scope)",
        legacyReconcile:
          "storage-admin.mjs legacy-reconcile --snapshot-dir DIR --target DB --check | --confirm FILE",
        safety:
          "Explicit new target only; no .env, DATA_DIR, original-ledger defaults, implicit migration or business seeding.",
      }),
    );
  } else if (command.action === "legacy-import" || command.action === "legacy-reconcile") {
    const { StorageError } = await import("@erp/core/application");
    StorageFailure = StorageError;
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { LegacyImportSnapshot } = await import("../packages/infra/src/legacy/import-plan.ts");
    const { executeLegacyImport } = await import("../packages/infra/src/storage/legacy-import.ts");
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
      if (command.action === "legacy-import") {
        result = await executeLegacyImport(snapshot, {
          target: command.target,
          choices: command.choices,
          ...(command.openingItems
            ? { openingItems: { bytes: readOpeningItems(readFileSync, command.openingItems) } }
            : {}),
        });
      } else {
        const { checkLegacyReconciliation, confirmLegacyReconciliation } = await import(
          "../packages/infra/src/legacy/reconcile.ts"
        );
        result = command.confirmation
          ? await confirmLegacyReconciliation(snapshot, command.target, command.confirmation)
          : await checkLegacyReconciliation(snapshot, command.target);
        if (result.verdict !== "pass") process.exitCode = 1;
      }
      console.log(JSON.stringify({ ...result, action: command.action }));
    } finally {
      snapshot.close();
    }
  } else if (command.action === "legacy-snapshot") {
    const { produceLegacySnapshot, LegacySnapshotError } = await import(
      "./legacy-snapshot-producer.mjs"
    );
    LegacyFailure = LegacySnapshotError;
    await produceLegacySnapshot(command.source, command.output);
    console.log(JSON.stringify({ status: "ok", action: command.action }));
  } else {
    const application = await import("@erp/core/application");
    StorageFailure = application.StorageError;
    const scope = command.scope ? application.parseScope(command.scope) : undefined;
    const { createSqliteStorage, backupSqlite, restoreSqlite } = await import("@erp/infra/storage");
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
    console.log(
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
  console.error(
    JSON.stringify({
      error: {
        code: invalid ? "INVALID_INPUT" : classified ? error.code : "STORAGE_FAILURE",
        message: invalid ? error.message : classified ? error.message : "Storage operation failed.",
      },
    }),
  );
  process.exitCode = 1;
}
