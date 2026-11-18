import { resolve } from 'node:path';

class InvalidConfiguration extends Error {
  constructor() {
    super('Invalid explicit storage configuration. Use --help.');
  }
}

function parseArguments(args) {
  if (args.length === 1 && args[0] === '--help') return null;
  const [action, ...tokens] = args;
  if (!['migrate', 'verify', 'provision'].includes(action)) throw new InvalidConfiguration();
  const options = new Map();
  const valued = new Set(['--provider', '--file', '--tenant', '--book', '--company']);
  for (let index = 0; index < tokens.length; index += 2) {
    const key = tokens[index], value = tokens[index + 1];
    if (!valued.has(key) || options.has(key) || !value || value.startsWith('--')) throw new InvalidConfiguration();
    options.set(key, value);
  }
  if (options.get('--provider') !== 'sqlite' || !options.has('--file')) throw new InvalidConfiguration();
  const scopeOptions = ['--tenant', '--book', '--company'];
  if (action !== 'provision' && scopeOptions.some((key) => options.has(key))) throw new InvalidConfiguration();
  let scope;
  if (action === 'provision') {
    if (!options.has('--tenant') || (options.has('--company') && !options.has('--book'))) {
      throw new InvalidConfiguration();
    }
    scope = {
      level: options.has('--company') ? 'company' : options.has('--book') ? 'book' : 'tenant',
      tenantId: options.get('--tenant'),
      ...(options.has('--book') ? { bookId: options.get('--book') } : {}),
      ...(options.has('--company') ? { companyId: options.get('--company') } : {}),
    };
  }
  return { action, scope, configuration: { filename: resolve(options.get('--file')) } };
}

let StorageFailure;
try {
  const command = parseArguments(process.argv.slice(2));
  if (!command) {
    console.log(JSON.stringify({
      usage: 'storage-admin.mjs migrate|verify|provision --provider sqlite --file FILE',
      scope: 'provision requires --tenant ID, optionally --book ID and --company ID',
      safety: 'Explicit new target only; no .env, DATA_DIR, original-ledger defaults, implicit migration or business seeding.',
    }));
  } else {
    const application = await import('@erp/application');
    StorageFailure = application.StorageError;
    const scope = command.scope ? application.parseScope(command.scope) : undefined;
    const { createSqliteStorage } = await import('@erp/infrastructure/storage');
    const storage = createSqliteStorage(command.configuration);
    try {
      if (command.action === 'migrate') await storage.migrate();
      await storage.verifySchema();
      if (command.action === 'provision') await storage.provision(scope);
    } finally {
      await storage.close();
    }
    console.log(JSON.stringify({ status: 'ok', action: command.action, provider: 'sqlite', ...(scope ? { scope } : {}) }));
  }
} catch (error) {
  const invalid = error instanceof InvalidConfiguration;
  const classified = StorageFailure && error instanceof StorageFailure;
  console.error(JSON.stringify({
    error: {
      code: invalid ? 'INVALID_INPUT' : classified ? error.code : 'STORAGE_FAILURE',
      message: invalid ? error.message : classified ? error.message : 'Storage operation failed.',
    },
  }));
  process.exitCode = 1;
}
