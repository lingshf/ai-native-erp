import { resolve } from 'node:path';
import { readFileSync, statSync } from 'node:fs';
import { X509Certificate } from 'node:crypto';

class InvalidConfiguration extends Error {
  constructor(message = 'Invalid explicit storage configuration. Use --help.') {
    super(message);
  }
}

function readCertificateAuthority(filename) {
  try {
    const info = statSync(filename);
    if (!info.isFile() || info.size === 0 || info.size > 1024 * 1024) throw new InvalidConfiguration();
    const ca = readFileSync(filename, 'utf8');
    const pem = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g;
    const certificates = ca.match(pem);
    if (!certificates?.length || ca.replace(pem, '').trim()
      || Buffer.byteLength(ca, 'utf8') > 1024 * 1024) throw new InvalidConfiguration();
    for (const certificate of certificates) new X509Certificate(certificate);
    return ca;
  } catch {
    throw new InvalidConfiguration('Cannot read a valid PEM CA bundle from --ca-file. Use --help.');
  }
}

function parseArguments(args) {
  if (args.length === 1 && args[0] === '--help') return null;
  const [action, ...tokens] = args;
  if (!['migrate', 'verify', 'provision'].includes(action)) throw new InvalidConfiguration();
  const options = new Map();
  const valued = new Set(['--provider', '--file', '--tenant', '--book', '--company', '--ca-file']);
  for (let index = 0; index < tokens.length; index += 1) {
    const key = tokens[index];
    if (options.has(key)) throw new InvalidConfiguration();
    if (key === '--no-tls-loopback') {
      options.set(key, true);
    } else {
      const value = tokens[++index];
      if (!valued.has(key) || !value || value.startsWith('--')) throw new InvalidConfiguration();
      options.set(key, value);
    }
  }
  const provider = options.get('--provider');
  if (!['sqlite', 'postgres'].includes(provider)) throw new InvalidConfiguration();
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
  if (provider === 'sqlite') {
    if (!options.has('--file') || options.has('--no-tls-loopback') || options.has('--ca-file')) {
      throw new InvalidConfiguration();
    }
    return { action, provider, scope, configuration: { filename: resolve(options.get('--file')) } };
  }
  if (options.has('--file')) throw new InvalidConfiguration();
  let url;
  try {
    url = new URL(process.env.ERP_TARGET_DATABASE_URL);
  } catch {
    throw new InvalidConfiguration();
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.search || url.hash) {
    throw new InvalidConfiguration();
  }
  let user, password, database;
  try {
    user = decodeURIComponent(url.username);
    password = decodeURIComponent(url.password);
    database = decodeURIComponent(url.pathname.slice(1));
  } catch {
    throw new InvalidConfiguration();
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const port = url.port ? Number(url.port) : 5432;
  if (![user, password, database, host].every((value) => value && !value.includes('\0'))
    || !Number.isInteger(port) || port < 1 || port > 65535) throw new InvalidConfiguration();
  const insecure = options.has('--no-tls-loopback');
  if (insecure && !['127.0.0.1', '::1'].includes(host)) throw new InvalidConfiguration();
  if (insecure && options.has('--ca-file')) throw new InvalidConfiguration();
  if (!insecure && !options.has('--ca-file')) {
    throw new InvalidConfiguration('PostgreSQL TLS requires an explicit --ca-file. Use --help.');
  }
  return {
    action, provider, scope,
    configuration: {
      host, port, user, password, database,
      ssl: insecure ? false : { rejectUnauthorized: true, ca: readCertificateAuthority(options.get('--ca-file')) },
    },
  };
}

let StorageFailure;
try {
  const command = parseArguments(process.argv.slice(2));
  if (!command) {
    console.log(JSON.stringify({
      usage: 'storage-admin.mjs migrate|verify|provision --provider sqlite --file FILE | --provider postgres (--ca-file FILE | --no-tls-loopback)',
      scope: 'provision requires --tenant ID, optionally --book ID and --company ID',
      connectionEnvironment: 'ERP_TARGET_DATABASE_URL',
      postgres: 'Dedicated PostgreSQL18 database only. TLS requires an explicit PEM --ca-file (maximum 1 MiB); no environment CA defaults. --no-tls-loopback is mutually exclusive and only permits a literal loopback host. URI query parameters are not accepted.',
      safety: 'Explicit new target only; no .env, DATA_DIR, original-ledger defaults, implicit migration or business seeding.',
    }));
  } else {
    const application = await import('@erp/application');
    StorageFailure = application.StorageError;
    const scope = command.scope ? application.parseScope(command.scope) : undefined;
    const infrastructure = await import('@erp/infrastructure/storage');
    const storage = command.provider === 'sqlite'
      ? infrastructure.createSqliteStorage(command.configuration)
      : infrastructure.createPostgresStorage(command.configuration);
    try {
      if (command.action === 'migrate') await storage.migrate();
      await storage.verifySchema();
      if (command.action === 'provision') await storage.provision(scope);
    } finally {
      await storage.close();
    }
    console.log(JSON.stringify({ status: 'ok', action: command.action, provider: command.provider, ...(scope ? { scope } : {}) }));
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
