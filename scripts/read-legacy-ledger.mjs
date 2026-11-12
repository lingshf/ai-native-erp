import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

let StorageErrorType;
let phase = 'startup';
try {
  const { StorageError } = await import('@erp/application');
  StorageErrorType = StorageError;
  phase = 'arguments';
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    strict: true,
    options: {
      help: { type: 'boolean' },
      'snapshot-dir': { type: 'string' },
      month: { type: 'string' },
      stage: { type: 'string' },
      account: { type: 'string' },
      limit: { type: 'string' },
      cursor: { type: 'string' },
    },
  });
  if (values.help) {
    console.log(JSON.stringify({
      mode: 'read-only-verified-snapshot',
      commands: {
        trial: ['--snapshot-dir DIRECTORY', '--month YYYY-MM', '--stage unadjusted|adjusted|postClosing'],
        ledger: ['--snapshot-dir DIRECTORY', '--month YYYY-MM', '--account ACCOUNT',
          '[--limit 1..100]', '[--cursor CURSOR]'],
      },
    }, null, 2));
  } else {
    const command = positionals[0];
    if (positionals.length !== 1 || !['trial', 'ledger'].includes(command) ||
      !values['snapshot-dir'] || !values.month || values.month.length !== 7 ||
      !/^[0-9]{4}-(0[1-9]|1[0-2])$/u.test(values.month)) throw new StorageError('INVALID_INPUT');
    let limit = 100;
    if (command === 'trial') {
      if (!['unadjusted', 'adjusted', 'postClosing'].includes(values.stage) ||
        values.account !== undefined || values.limit !== undefined || values.cursor !== undefined) {
        throw new StorageError('INVALID_INPUT');
      }
    } else {
      if (!values.account || values.stage !== undefined) throw new StorageError('INVALID_INPUT');
      if (values.limit !== undefined) {
        limit = Number(values.limit);
        if (!Number.isInteger(limit) || limit < 1 || limit > 100 || String(limit) !== values.limit) {
          throw new StorageError('INVALID_INPUT');
        }
      }
    }
    phase = 'startup';
    const [{ verifyLedgerSnapshot }, { preflightLegacySnapshotPair, openLegacyTeachingSnapshot }] = await Promise.all([
      import('./ledger-snapshot.mjs'),
      import('@erp/infrastructure/legacy-teaching'),
    ]);
    const directory = resolve(values['snapshot-dir']);
    phase = 'snapshot';
    preflightLegacySnapshotPair(directory);
    const verifiedManifest = verifyLedgerSnapshot(directory);
    phase = 'reader';
    const reader = openLegacyTeachingSnapshot({ directory, verifiedManifest });
    let output;
    try {
      const query = command === 'trial'
        ? { month: values.month, stage: values.stage }
        : { month: values.month, account: values.account, limit };
      const result = command === 'trial'
        ? reader.trialBalances(values.month).trialBalances[values.stage]
        : reader.ledger({ month: values.month, account: values.account, limit,
          ...(values.cursor === undefined ? {} : { cursor: values.cursor }) });
      if (result === undefined) throw new StorageError('STORAGE_FAILURE');
      output = JSON.stringify({ snapshot: reader.info, query, result });
    } finally { reader.close(); }
    console.log(output);
  }
} catch (error) {
  const code = phase === 'arguments' ? 'INVALID_INPUT' : phase === 'snapshot' ? 'INVALID_SNAPSHOT' : 'STORAGE_FAILURE';
  const failure = StorageErrorType
    ? error instanceof StorageErrorType ? error : new StorageErrorType(code)
    : { code: 'STORAGE_FAILURE', message: 'The storage operation failed.' };
  process.stderr.write(JSON.stringify({ error: { code: failure.code, message: failure.message } }) + '\n');
  process.exitCode = 1;
}
