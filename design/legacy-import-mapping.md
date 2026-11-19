# Legacy import mapping contract (M2-02)

This module plans an import; it never creates or opens a target database. Its
inputs must be an isolated snapshot pair produced by the snapshot tool and an
explicit decision C for planning. Development and Bench inputs are fictional.
Nothing in this API grants permission to access real legacy data.

## API and deterministic stream

`packages/infra/src/legacy/import-plan.ts` exports `LegacyImportSnapshot`,
`legacyImportPlan`, `ImportChoices`, `ImportEvent`, `ImportRecord` and
`ImportReason`. The M2-03 CLI will consume these exports; there is deliberately
no CLI change in M2-02.

```ts
const snapshot = new LegacyImportSnapshot(absoluteSnapshotDirectory, verifiedManifest);
try {
  for (const event of legacyImportPlan(snapshot, {
    dryRun: true,
    // Omit choices to request the decision C inventory, not an executable plan.
  })) {
    // JSON.stringify(event) + "\n" is the deterministic NDJSON representation.
  }
} finally {
  snapshot.close();
}
```

The reader reuses the M0-R4 filesystem preflight, checks both fixed filenames,
sizes and SHA-256 digests, then pins read-only SQLite transactions. It rejects
sidecars, symlinks, missing files and changed files during opening. It does not
call the existing semantic verifier: that verifier rejects orphan references,
whereas a planning report must enumerate them. A digest-matching file is not
therefore an assertion that all its data can be imported.

The generator yields, in order:

1. `decisions`: both snapshot digests, all six option names, allowed values,
   affected source-object counts and explicit selections (or `null`).
2. `record`: one per source row, grouped by source and alphabetically ordered
   table, then SQLite primary-key order. References are source-qualified by the
   event's `source`/`object`; composite primary keys are JSON objects. The target
   of a mapped journal also retains its original numeric ID as `legacy_ref`
   (a decimal string). No UUID, timestamp, actor identity or target write is
   invented for journals.
3. `totals`: monthly debit/credit movements per source, company, account and
   posted/draft status, with unadjusted, adjusted and post-closing stages.
4. `summary`: source, mapped, unmappable, archive-only, skipped and
   decision-required counts for **every** source table, plus separate draft
   journal/line/dimension counts and an `executable` flag.

Targets are an **intermediate mapping representation**, not SQL insert objects.
M2-03 must bind company settings, allocate stable target IDs, resolve legacy
references, construct the required dates/revisions/history and use the domain
historical-posting pipeline. It must consume the entire stream and reject a
missing or non-executable final summary before writing anything. An executable
plan is not real-operation authorization and does not replace domain validation.

Only the selected fields with a supported target meaning are mapped; other
tables/objects are reported with `TARGET_SCHEMA_UNSUPPORTED`, not discarded or
treated as successful imports. This includes old version/template metadata and
old posting-rule shapes without a lossless adapter. This intentionally blocks
execution until those rows are handled in a later extension or the source data
is resolved; it never silently imports an incomplete ledger.

## Decision C: no defaults

| Option | Explicit values | Affected count |
| --- | --- | --- |
| `drafts` | `import-as-draft`, `skip` | Teaching draft journals (including ID3); line/dimension counts are separate in the summary |
| `receipts` | `import`, `archive-only` | Enterprise receipts |
| `source-events` | `import`, `archive-only` | Enterprise source events |
| `transfer-queue` | `import`, `archive-only` | Enterprise transfer queue |
| `seals` | `import`, `archive-only` | Enterprise journal seals |
| `audit` | `import`, `archive-only` | Enterprise audit rows |

Without choices, only `dryRun: true` is accepted. A supplied choices object must
contain all six valid selections, even for an empty table and even in dry-run.
Test selections are fictional-fixture inputs, **not** the user's real decision C.

Skipping a draft skips its lines and line dimensions as one aggregate. Draft
source totals are still reported separately and never enter posted totals.
`archive-only` means retain the verified source evidence in its snapshot, not
copy it into current evidence tables and not create another archive file here.

`import` never means forge current receipts or preview/fingerprint evidence:
old receipts, source-event commands, transfer queues and seals have incompatible
evidence/dependency contracts and are explicitly unmappable in this version.
Audit rows are expressible only with a nonempty reference and a supported
operation identifier; the import provenance principal is `legacy.import`, not
a claim about the original actor. Reference-free old audit rows are unmappable.

## Unified behavior / old-to-target comparison

Differences below are source-format adapters, not selectable business modes.
There is one target policy; no Book/Enterprise rule switch is introduced.

| Concern | Legacy Book / Enterprise | Unified mapping / behavior change |
| --- | --- | --- |
| Company scope | Teaching has no company; Enterprise has company codes | Teaching is the `TEACHING` namespace; Enterprise retains its company code. A real Enterprise `TEACHING` company is a blocking collision. Teaching currency/name/year must be bound explicitly by the executor, never inferred from another company. |
| Accounts | Book settings/properties are separate; Enterprise stores account JSON and current config activity | Code retained, including disabled accounts and their history. Properties become normal-side/contra/manual fields. Missing Book settings use the old implicit active/manual-allowed semantics. Missing reporting groups map by category to the target's `other*` group; Enterprise's explicit group is retained. Suspense accounts are unmappable, not cleared or reclassified. |
| Dimensions/values | Book code/value tables, with active flags | Code-to-code mapping, active flags retained; each line-dimension link remains an explicit legacy reference. No missing value is created. |
| Periods | Book `open`/`closed`; Enterprise `open`/`hold`/`permanent` | `open`/`closed`, and `hold` -> `frozen`, `permanent` -> `closed`. M2-03 must import historical close state without running ordinary closing or regenerating closing journals. |
| Dates | Book has one date; Enterprise has document/accounting/tax dates | Preserve document and accounting dates; tax date always equals document date, as required by M2-02. Enterprise's differing old tax date is intentionally not replayed. |
| Posted journals | Book normal/adjusting/reversal/closing; Enterprise kind and operation | Import as `historical`, preserve original `legacy_ref` and `legacy_kind`; normalized target kind is normal/adjusting. Reversals carry their original reference. Closing remains explicit legacy classification, not a new journal. The executor must preserve adjusting-reversal classification and register original closing journals for stage reporting. |
| Draft journals | Book drafts including ID3 | Only explicit import-as-draft/skip. No posting, auto-fix, or implicit skip. |
| Currency | Enterprise currency registry plus accounting/report currencies | Unknown currency/precision -> `UNKNOWN_CURRENCY`; reporting conversion -> `FOREIGN_CURRENCY`. No rate lookup or FX calculation. |
| Evidence and unsupported metadata | Legacy source proof differs from current receipt/seal contracts | Unsupported objects are listed with reason codes; no new proof is fabricated. Only an explicit archive-only choice excludes a decision-C object from live import. |

Enterprise normalized domestic-currency lines retain their complete old JSON as
`evidence`; account, line number and minor amounts are mapped explicitly.
Transaction/accounting/reporting currencies and repeated amounts must agree.
Nonempty Enterprise dimension JSON currently needs an adapter for its old
configuration representation and is reported as `TARGET_SCHEMA_UNSUPPORTED`;
it is never dropped while pretending to import a dimensionless line.

## Totals, errors and resource bounds

Amounts and identifiers use decimal strings where SQLite integers might exceed
JavaScript's safe integer precision; totals accumulate as `bigint`. Invalid line
amounts are enumerated as `INVALID_AMOUNT`, not rounded. Orphan lines are listed
as `ORPHAN_LINE`; they cannot be assigned a real month and do not enter monthly
totals. Missing accounts/dimension values are explicit blockers. Unmappable
rows always have `target: null`.

Totals describe **source** movements, including valid amounts on rows that cannot
be imported for another reason. To reproduce a reader's trial balance at month M,
add earlier months' post-closing net movement to M's selected-stage net movement.
This keeps the report bounded-memory and preserves the reader's opening-balance
semantics across adjustments, reversals and closing.

Primary-key keyset pages contain 1–5000 rows (default 1000). The complete GL,
unmappable list and monthly totals are streamed, not accumulated. SQLite uses
an 8 MiB page cache per source and file-backed sorting. Consumers must also stream
the output rather than spread a production plan into an array.

The opt-in fictional Bench is
`node packages\infra\test\support\legacy-import-bench.mjs`. It creates and removes
its own isolated fixture, streams one million GL lines through JSON serialization,
asserts complete counts and unchanged snapshot digests, and checks the task's
120-second / 512-MiB limits. These limits are not PR-unit-test wall-clock
assertions (decision D11). No CI workflow or shared Bench file is changed.
