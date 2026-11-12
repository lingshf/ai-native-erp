/** Supplied only after the caller has run M00 verifyLedgerSnapshot(directory). */
export interface VerifiedTeachingSnapshotConfiguration {
  /** Absolute private snapshot directory, never an active ledger or DATA_DIR. */
  readonly directory: string;
  readonly verifiedManifest: {
    readonly version: 1;
    readonly status: 'verified';
    readonly crossDatabaseAtomic: false;
    readonly ledgers: {
      readonly teaching: {
        readonly file: 'teaching.sqlite';
        readonly bytes: number;
        readonly sha256: string;
      };
    };
  };
}

export interface LegacyTeachingSnapshotInfo {
  readonly sourceKind: 'verified-teaching-snapshot';
  readonly baseline: 'M00-verified-snapshot';
  readonly live: false;
  readonly snapshotSha256: string;
  readonly snapshotBytes: number;
  readonly scale: 2;
}

export interface LegacyTrialBalanceRow {
  readonly code: string;
  readonly name: string;
  readonly category: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  readonly debit: number;
  readonly credit: number;
}

export interface LegacyTrialBalance {
  readonly rows: readonly LegacyTrialBalanceRow[];
  readonly debit: number;
  readonly credit: number;
}

export interface LegacyTeachingTrialBalances {
  readonly month: string;
  readonly trialBalances: {
    readonly unadjusted: LegacyTrialBalance;
    readonly adjusted: LegacyTrialBalance;
    readonly postClosing: LegacyTrialBalance;
  };
}

export interface LegacyTeachingLedgerQuery {
  readonly account: string;
  readonly month: string;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface LegacyTeachingLedgerEntry {
  readonly id: number;
  readonly lineId: number;
  readonly date: string;
  readonly memo: string;
  readonly kind: 'normal' | 'adjusting' | 'reversal' | 'closing';
  readonly reversal_of: number | null;
  readonly source_kind: 'normal' | 'adjusting' | 'reversal' | 'closing' | null;
  readonly account: string;
  readonly debit: number;
  readonly credit: number;
  readonly dimensions?: Readonly<Record<string, string>>;
  readonly balance: number;
}

export interface LegacyTeachingLedger {
  readonly account: string;
  readonly month: string;
  readonly opening: number;
  readonly closing: number;
  /** Whole current month, never page totals. */
  readonly debit: number;
  readonly credit: number;
  readonly totalEntries: number;
  readonly entries: readonly LegacyTeachingLedgerEntry[];
  readonly nextCursor?: string;
}

/** Explicit local operator snapshot access, not an authorization or live-data port. */
export interface LegacyTeachingReader {
  readonly info: LegacyTeachingSnapshotInfo;
  trialBalances(month: string): LegacyTeachingTrialBalances;
  ledger(query: LegacyTeachingLedgerQuery): LegacyTeachingLedger;
  close(): void;
}
