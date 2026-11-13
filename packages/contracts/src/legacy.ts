import { z } from 'zod';

const minor = z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);
const nonnegative = minor.min(0);
const identifier = nonnegative.min(1);
export const legacyMonthSchema = z.string().length(7)
  .regex(/^(?!9999-)(?:19[0-9]{2}|[2-9][0-9]{3})-(?:0[1-9]|1[0-2])$/u);
const snapshot = z.string().length(64).regex(/^[a-f0-9]{64}$/u);
const account = z.string().length(4).regex(/^[1-9][0-9]{3}$/u);
const cursor = z.string().min(1).max(1024).regex(/^[A-Za-z0-9_-]+$/u);
const limit = z.string().regex(/^(?:[1-9][0-9]?|100)$/u);
export const legacyTrialStages = ['unadjusted', 'adjusted', 'postClosing'] as const;
export type LegacyTrialStage = typeof legacyTrialStages[number];

export const legacySnapshotInfoSchema = z.strictObject({
  sourceKind: z.literal('verified-teaching-snapshot'),
  baseline: z.literal('M00-verified-snapshot'),
  live: z.literal(false),
  snapshotSha256: snapshot,
  snapshotBytes: identifier,
  scale: z.literal(2),
});

export const legacyContextSchema = z.strictObject({
  contractVersion: z.literal('1'),
  source: legacySnapshotInfoSchema,
  periods: z.array(z.strictObject({ month: legacyMonthSchema, status: z.enum(['open', 'closed']) })),
});

const trialBalance = z.strictObject({
  rows: z.array(z.strictObject({
    code: account,
    name: z.string(),
    category: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']),
    debit: nonnegative,
    credit: nonnegative,
  })),
  debit: nonnegative,
  credit: nonnegative,
});

export const legacyTrialSchema = z.strictObject({
  contractVersion: z.literal('1'),
  source: legacySnapshotInfoSchema,
  month: legacyMonthSchema,
  trialBalances: z.strictObject({
    unadjusted: trialBalance,
    adjusted: trialBalance,
    postClosing: trialBalance,
  }),
});

export const legacyLedgerSchema = z.strictObject({
  contractVersion: z.literal('1'),
  source: legacySnapshotInfoSchema,
  month: legacyMonthSchema,
  account,
  opening: minor,
  closing: minor,
  debit: nonnegative,
  credit: nonnegative,
  totalEntries: nonnegative,
  entries: z.array(z.strictObject({
    id: identifier,
    lineId: identifier,
    date: z.iso.date(),
    memo: z.string(),
    kind: z.enum(['normal', 'adjusting', 'reversal', 'closing']),
    reversal_of: identifier.nullable(),
    source_kind: z.enum(['normal', 'adjusting', 'reversal', 'closing']).nullable(),
    account,
    debit: nonnegative,
    credit: nonnegative,
    dimensions: z.record(z.string(), z.string()).optional(),
    balance: minor,
  })).max(100),
  nextCursor: cursor.optional(),
});

export const legacyTrialQuerySchema = z.strictObject({ snapshot, month: legacyMonthSchema });
export const legacyLedgerQuerySchema = z.strictObject({
  snapshot, month: legacyMonthSchema, account, limit: limit.optional(), cursor: cursor.optional(),
});

export type LegacySnapshotInfo = z.infer<typeof legacySnapshotInfoSchema>;
export type LegacyContextResponse = z.infer<typeof legacyContextSchema>;
export type LegacyTrialResponse = z.infer<typeof legacyTrialSchema>;
export type LegacyLedgerResponse = z.infer<typeof legacyLedgerSchema>;
export type LegacyTrialQuery = z.infer<typeof legacyTrialQuerySchema>;
export type LegacyLedgerQuery = z.infer<typeof legacyLedgerQuerySchema>;
