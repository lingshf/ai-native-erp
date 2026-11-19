import { resolve } from "node:path";

class InvalidConfiguration extends Error {
  constructor() {
    super("Invalid explicit storage configuration. Use --help.");
  }
}

function parseArguments(args) {
  if (args.length === 1 && args[0] === "--help") return null;
  const [action, ...tokens] = args;
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
        safety:
          "Explicit new target only; no .env, DATA_DIR, original-ledger defaults, implicit migration or business seeding.",
      }),
    );
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
