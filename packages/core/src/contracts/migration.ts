import { z } from "zod";

const row = z.record(z.string(), z.union([z.string(), z.number(), z.null()]));
export const migrationReportSchema = z.strictObject({
  version: z.literal(1),
  runId: z.string(),
  snapshotSha256: z.record(z.string(), z.string()),
  verdict: z.enum(["difference", "blocked", "pending", "pass"]),
  blockers: z.array(
    z.strictObject({
      code: z.literal("M2_03B_OPENING_REQUIRED"),
      company: z.string(),
      account: z.string(),
    }),
  ),
  knownDifferencesSha256: z.string(),
  knownDifferences: z.array(
    z.strictObject({
      source: z.string(),
      object: z.string(),
      disposition: z.string(),
      reasons: z.array(z.string()),
      count: z.number().int().nonnegative(),
      legacyRefs: z.array(z.string()),
    }),
  ),
  checks: z.array(
    z.strictObject({ section: z.string(), expected: z.array(row), actual: z.array(row) }),
  ),
  differences: z.array(
    z.strictObject({
      section: z.string(),
      key: z.string(),
      expected: row.nullable(),
      actual: row.nullable(),
    }),
  ),
});
export type MigrationReport = z.infer<typeof migrationReportSchema>;
export const migrationStatusSchema = z.strictObject({
  run: z
    .strictObject({
      id: z.string(),
      status: z.enum(["importing", "imported", "reconciled", "failed"]),
      createdAt: z.string(),
      baseline: z.string().nullable(),
      reportSha256: z.string().nullable(),
      confirmationSha256: z.string().nullable(),
      report: migrationReportSchema.nullable(),
    })
    .nullable(),
});
export type MigrationStatus = z.infer<typeof migrationStatusSchema>;
