import { checkedTeachingMonth } from '@erp/core/domain';
import { StorageError } from './storage.ts';
import type { LegacyTeachingLedgerQuery, LegacyTeachingReader } from './legacy-teaching.ts';

/** Borrows one explicit local snapshot; neither a live ledger nor an authorization service. */
export class LegacyTeachingQueryService {
  private readonly reader: LegacyTeachingReader;
  constructor(reader: LegacyTeachingReader) { this.reader = reader; }

  context() {
    return { source: this.reader.info, periods: this.reader.periods() };
  }

  private assertSnapshot(snapshot: string): void {
    if (typeof snapshot !== 'string' || snapshot.length !== 64 || !/^[a-f0-9]{64}$/u.test(snapshot)) {
      throw new StorageError('INVALID_INPUT');
    }
    if (snapshot !== this.reader.info.snapshotSha256) throw new StorageError('CONFLICT');
  }

  trial(snapshot: string, month: string) {
    this.assertSnapshot(snapshot);
    return { source: this.reader.info, ...this.reader.trialBalances(checkedTeachingMonth(month)) };
  }

  ledger(snapshot: string, query: LegacyTeachingLedgerQuery) {
    this.assertSnapshot(snapshot);
    checkedTeachingMonth(query.month);
    return { source: this.reader.info, ...this.reader.ledger(query) };
  }
}
