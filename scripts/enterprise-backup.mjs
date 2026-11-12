import { constants, copyFileSync, existsSync, lstatSync, mkdtempSync, rmdirSync, statSync, unlinkSync } from 'node:fs';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { EnterpriseBook } from '../src/enterprise.mjs';

async function digest(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

function inspect(file) {
  const book = new EnterpriseBook(file, { readOnly: true });
  try { return book.integrity(); }
  finally { book.close(); }
}

export async function copyEnterpriseBook({ source, target }) {
  if (typeof source !== 'string' || !source.trim() || typeof target !== 'string' || !target.trim()) {
    throw new Error('Explicit source and target paths are required.');
  }
  const input = resolve(source), output = resolve(target);
  if (input === output) throw new Error('Source and target must differ.');
  if (existsSync(output)) throw new Error('Target already exists; choose a new file.');
  if (!lstatSync(input).isFile()) throw new Error('Source must be an existing regular SQLite file.');
  const staging = mkdtempSync(join(dirname(output), '.erp-snapshot-'));
  const snapshot = join(staging, 'snapshot.sqlite');
  let connection;
  try {
    connection = new DatabaseSync(input, { readOnly: true });
    connection.prepare('VACUUM main INTO ?').run(snapshot);
    connection.close(); connection = undefined;
    const expected = inspect(snapshot), expectedHash = await digest(snapshot);
    copyFileSync(snapshot, output, constants.COPYFILE_EXCL);
    const integrity = inspect(output), sha256 = await digest(output);
    if (sha256 !== expectedHash || JSON.stringify(integrity) !== JSON.stringify(expected)) {
      throw new Error('Copy verification failed; do not use the target as a verified backup.');
    }
    return { schemaVersion: integrity.schemaVersion, sha256, bytes: statSync(output).size, integrity };
  } finally {
    connection?.close();
    if (existsSync(snapshot)) unlinkSync(snapshot);
    rmdirSync(staging);
  }
}

const usage = 'Usage: node scripts/enterprise-backup.mjs backup|restore --source <ERP SQLite file> --target <new file>';

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [action, ...args] = process.argv.slice(2);
    if (action === '--help' && !args.length) console.log(usage);
    else {
      if (!['backup', 'restore'].includes(action) || args.length !== 4) throw new Error(usage);
      const options = {};
      for (let i = 0; i < args.length; i += 2) {
        const key = args[i].slice(2), value = args[i + 1];
        if (!['--source', '--target'].includes(args[i]) || Object.hasOwn(options, key)
          || !value || value.startsWith('--')) throw new Error(usage);
        options[key] = value;
      }
      if (!options.source || !options.target) throw new Error(usage);
      console.log(JSON.stringify({ action, ...await copyEnterpriseBook(options) }));
    }
  } catch (error) {
    console.error('ERP copy failed:', error.message);
    process.exitCode = 1;
  }
}
