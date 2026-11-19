# SQLite target storage

Public exports from `src/storage/index.ts`:

```ts
const local = createSqliteStorage({ filename: absoluteLocalDiskFilename });
```

The filename is mandatory; the factory never consults `DATA_DIR`, an old
ledger, or `.env`. Construction/import does not connect or create files.
SQLite requires a private local file, not memory, UNC/network storage, or a
per-request instance.

Lifecycle is explicit:

1. Operator calls `migrate()` against a new, dedicated target. Migrations are
   transactional, checksum-verified, forward-only, and never seed business data.
2. Startup calls `verifySchema()`. Missing, incomplete, edited or unknown schemas
   fail; startup does not migrate.
3. Operator calls `provision(scope)` for technical tenant/book/company rows.
4. Application uses the application `UnitOfWork` ports; all operations must be
   awaited/returned. Company write callbacks must narrow `session.level` before
   using receipts/audit. Scope IDs and exact preplanned tier/membership are
   checked at runtime. These scopes are not authentication or authorization.
5. `close()` rejects newcomers, drains/rolls back admitted work and closes
   connections. It is idempotent.

The SQLite application ID is persisted in the main DELETE-mode header before
WAL. Unknown files are refused before opening SQL connections. A marked but
empty interrupted target is recoverable only through explicit migration. The
operator must protect the containing directory from replacement attacks.
Target backends register process-owned leases before opening SQLite; maintenance
uses the same exclusive admission gate and refuses live leases. Dead-process
leases can be reclaimed, but a leftover maintenance lock is fail-closed and
requires operator investigation. Stop the service, not just its HTTP listener,
before restoring. An abruptly terminated worker can retain its process's lease
until the service process exits.

The existing admin CLI also exposes `backup <db> <out>` and `restore <db> <in>`.
Both paths are mandatory. Online backup uses SQLite's incremental backup API,
then verifies and converts the new snapshot to a standalone DELETE-mode file;
existing outputs are never overwritten. Restore holds one maintenance lock
through exclusive SQLite admission, input validation, TRUNCATE checkpoint,
handle closure, sidecar checks, checkpointed timestamped `.bak` creation,
same-directory atomic replacement and final validation or verified rollback.
The `.bak` is retained after either outcome and includes committed crash-WAL
transactions. Remaining WAL/SHM/journal files cause refusal, never manual deletion.
Input and rollback copies must pass integrity, application ID, migration
checksums and schema fingerprint validation against the running code.
If a process dies between exclusive file creation and persisting the application
marker, the remaining zero-byte/unmarked file is intentionally refused even by
`migrate()`. There is no automatic adoption/deletion or unsafe recovery; the
operator must investigate and select a fresh explicit target.

The versioned SQL also defines `schema_migrations`. Its migration row atomically
binds the normalized SQL checksum to a SHA256 structural fingerprint captured
after executing that exact SQL in the same DDL transaction. Verification
recomputes the fingerprint; it does not merely compare object names. SQLite
uses the persisted table/index/trigger SQL definitions. Rows and object keys
are sorted by JavaScript code-unit order before hashing. No reference database,
generic SQL parser, checksum cache or extra runtime DDL privileges are needed.
Even equivalent textual changes can conservatively require investigation.
This catches accidental drift; it does not protect against a database owner
deliberately replacing both schema and migration metadata. Changes to this
published 001 SQL are not permitted: its historical dialect CHECK value is
preserved to keep existing checksums valid, but runtime verification accepts
only `sqlite`. There is no compatibility migration or automatic metadata rewrite.

M0-08 adds immutable `002-master-data.sql`. Explicit migration verifies an
existing 001 target before appending 002; M0-09 appends `003-dimensions.sql`
with typed dimension/value/default/derivation/structure/balance tables and
append-only `dimension_history`. The value primary key is
`(company_id, dimension_code, value_code)`; list requests are keyset-paged
within that scope. Startup refuses an outdated target.
Every migration checksum is checked, and the latest migration's fingerprint
binds the complete current schema. Historical 001 fingerprints/checksums are
not rewritten, including the published 002 migration.

`ledger_companies` holds typed business metadata over the existing technical
`companies` identities, using fixed LOCAL tenant/book IDs. `accounts` has the
unique `(company_id, code)` primary-key access path; `periods` is likewise typed.
`config_history` is append-only, with actor fixed to LOCAL and an indexed
as-of lookup. It is history, not a generic JSON current-configuration table.
The master-data store reuses the validated SQLite backend and bounded queue;
each write use case, including default seeding and CAS/history, is one
BEGIN IMMEDIATE transaction. HTTP never supplies the actor. The composition
root accepts only an explicit absolute ERP_SQLITE_FILE; it verifies before
business seeding, and never opens a legacy Book.

`/api/v1/dimensions` shares that store and transaction lifecycle. POST/PUT
use entity revision CAS and record history atomically; validation returns
bounded safe field paths, not SQL or raw exception messages. D5 deliberately
uses only subset allowed combinations (unlisted keys are unrestricted),
including rules ported from Book. There is no exact-mode column, selector,
compatibility branch or legacy-data conversion tool. Core compiles lookup
maps once for in-memory per-line validation; actual journal integration and
revalidating generated clearing lines are integrated by M0-10.

Balancing candidates require the current same-company clearing account as an
explicit input. After checking business balance, the pure function rejects a
missing/inactive/non-clearing or mismatched account before producing candidates.
Account maintenance itself remains unrestricted by balancing configuration:
callers must read the current account for each generation, within the journal
use-case transaction when M0-10 integrates this rule, not reuse its save-time
snapshot. This is one generation-time policy, not a second account-edit gate.

D5 also intentionally relaxes Book's saved-combination restrictions: an allowed
combination may omit required segments and may name existing dimensions not
declared required/optional. Required line values remain independently checked.

SQLite holds separate read/write queues and connections across awaits. Each
queue permits 64 waiters/one second, callbacks have a ten-second budget, and
sessions become invalid before cleanup. Pending driver work is drained before
rollback/release. Synchronous native statements cannot be interrupted by a JS
timer: this is a measured guardrail, not hard realtime or asynchronous native IO.
Target connections configure `busy_timeout=5000` when opened, before schema
inspection or a journal-mode switch. Writable connections then use
`journal_mode=WAL`, `synchronous=NORMAL`, and `foreign_keys=ON`, after schema
validation and before transactions. Read connections also enable NORMAL and
foreign keys, without changing journal mode. SQLite handles the bounded busy
wait; no outer retries multiply that budget or replay callbacks. A synchronous
busy wait can block the event loop for up to five seconds under contention.
The separate legacy snapshot reader remains read-only and never enables WAL.

Receipts bind full company scope, operation, key, principal and fingerprint.
JSON is canonical UTF-8 TEXT. Native int64 remains bigint; public
revisions/audit sequences undergo safe-integer checks. Evidence has real
UPDATE/DELETE triggers, full-scope unique/FKs and
restricted parent deletion. This does not resist database-owner DDL tampering
or deliver approvals/outbox.

M0-10 appends `004-journals.sql`; 001–003 remain unchanged. The typed journal
tables share the master-data store's read/write transactions. Preview is one
consistent read snapshot of the supplied current `{company,draft}` editor content,
including unsaved revision-zero drafts, with no draft writes or revision changes.
The Web preview never calls save; unsaved edits must be explicitly saved with the
separate Save button and re-previewed before posting. Final composed business and
generated-line dimension maps are capped at 32 keys during planning, returning a
field-local 400 rather than failing the response contract. Confirmation re-reads current
same-company accounts, periods, dimensions, history stamps and correction edges,
recomputes the fingerprint and validates the full generated plan inside a single
BEGIN IMMEDIATE. Receipt, all entries/lines/seals/correction edges, audit and
draft deletion commit together or roll back together.

Existing 001 receipts/audit remain the single stores: nullable source/key
columns preserve generic receipt operations; new unique indexes enforce journal
source identity and global idempotency keys. `audit_log` is a read-only projection
of journal confirmations from `audit`, not a second audit copy. Completed retries
return the persisted receipt before mutable restrictions, including after a
restart or period freeze. Sealed entries/lines and correction edges cannot be
updated/deleted; deferred foreign keys require every committed entry to be
sealed, and sealed entries reject appended lines. Each immutable seal records
company cumulative turnover; an indexed latest-entry lookup and sealing trigger
preserve the existing exact-safe cumulative limit without scanning all GL.

D6 mirrors historical posted lines exactly without applying current defaults,
derivations, account activity/manual restrictions or dimension validity. It still
checks same-company account existence, original evidence, swapped exact amounts,
correction state and dates. Every other new/generated line uses current account
and dimension rules. Reclassification is full economic value, excluding internal
balancing turnover; replacement writes both output journals atomically and links
both outputs. No old-ledger import/conversion is provided.

M0-11 appends `005-business-events.sql` without changing 001-004. Typed
services, parties and two-axis posting rules share entity CAS and append-only
history. Event acceptance reuses the journal transaction's plan/commit pipeline
and the single receipts/audit stores; source events, journal ownership links,
signed six-place statistics and complete source-line clearing links are immutable.
Statistics/clearing acceptance may have no GL output.

Rules use a date-specific Map and at most nine exact/group/all buckets per
match. Incomparable two-axis winners are ambiguous, never service-prioritized;
both cash and offset rules are explicit. Dimensions overlay party, service,
winning rule and event in that order before the common dimension resolver.
Current accounts are re-read inside preview/confirmation transactions. D6
cancellation is the only historical-availability exception; manual correction
of a business-owned journal is rejected in favor of its source action. A queued
ordinary journal remains an ordinary journal after transfer and keeps normal
manual correction; its queue wrapper is not a cash-service source.

Queued journals preserve their acceptance receipt/plan but require a new
current-configuration preview before explicit transfer. The transfer, ownership
links and audit commit atomically; failures persist a safe failed state.
`transfer_queue(company_id,status,created_at,id)` supports bounded keyset pages.
Pending/failed items block period freezing/closing. Withdrawal is terminal:
same normalized reason retries return the original result without another write,
different reasons conflict, and withdrawn items cannot transfer.

`npm run bench` includes 5,000-rule synthetic events over real loopback HTTP,
complete response JSON and shared client DTO decoding, with 10 warmups and
100 measured samples. Preview/confirm include index compilation and current-state
validation; confirm includes commit. Raw samples and p50/p95/p99 are stored in the
existing bench artifacts. This remains separate from million-GL capacity acceptance.

## Live ledger reports and capacity (M0-12)

`ReportService` uses one read transaction per request. `/api/v1/reports/trial`,
`income`, `balance-sheet` and `reconciliation` return the same consistent report
bundle; `/api/v1/ledger` returns at most 500 chronological lines. All routes retain
the local finance Host/Origin boundary, strict input/output contracts and no-store
headers. No GL rows are loaded wholesale into application memory.

SQL aggregates by account using a covering company/period/account/debit/credit index.
The first million-row SQL probe exceeded 1 second with the original non-covering
index; 006 adds the covering index without introducing a balance table. Classification
uses current configuration, including inactive accounts and signed contra amounts.
Trial and balance-sheet balances include all earlier periods; income separates the
selected period from calendar YTD. Equity includes cumulative unclosed profit, not
only this year's income, so crossing a year without a closing entry cannot silently
drop historical value. Unadjusted excludes only current-period adjusting entries;
postClosing currently equals adjusted because the journal schema has no closing
entry kind yet. The reconciliation endpoint computes all three trial-stage checks,
balance sheet, equity roll-forward and profit in one read snapshot (six checks).
Other report bundles carry the selected-stage trial check and the three statement
checks. No currency translation or full closing is claimed.

Migration 006 only adds covering report, account/period and chronological journal indexes. Ledger
pages order by accounting date, journal ID and line number, pin the initial posting
sequence watermark, and bind cursors to company, account, period, stage and dimension
filter. Totals and running prefixes are SQL aggregates; the client cannot supply
trusted balances. Unassigned dimension filtering matches missing or null values.
Reports and ledger pages return a compound snapshot: the GL posting `watermark`
and `accountRevision`, the sum of all current account revisions in that company.
Requests must supply both pins together or neither, including first-page
drilldowns, filters and group navigation; cursors carry and validate both.
Historical report reads filter immutable entries by sequence; current-watermark
reads retain the covering-index fast path. Unavailable/future watermarks fail with
409, as does any changed account configuration, even without new GL entries.
The sum detects edits to lower-revision accounts that `MAX(revision)` would miss,
is company-scoped, and detects changing a classification back to its original value.
Account creation starts at revision 1, each edit increments it, and accounts cannot
be deleted; unsafe integer aggregates fail explicitly. Snapshot validation and the
report/ledger query share one read transaction. Partial pins and cursor/pin
mismatches fail with 400. There is only the current-classification basis, not a
historical-classification mode: a changed configuration requires an explicit
refresh of both pins, never a silent latest-data fallback.
Ordinary report requests do not create receipts.

`npm run bench:generate-ledger -- <absolute-new-file>` refuses existing files and
builds the production schema with a deterministic 1-company, 200-account, 24-period,
3-dimension, 1,000,000-line fixture. It keeps foreign keys, immutable triggers,
balanced journal seals, receipts and audit enabled. Bulk loading is **not** posting
throughput. One account/month contains exactly 100,000 lines for scrolling checks.
`npm run bench` owns and cleans its temporary fixture, performs 5 warmups and 50
hot loopback HTTP samples per trial/income/balance-sheet/ledger path, and includes
complete response JSON/shared client decoding. Each p95 budget is 1000 ms.
JSON/Markdown/Actions summary record fixture size/time/digest, raw samples,
percentiles, query plans and explicit PASS/MISS. Misses require a design follow-up,
not a smaller fixture or an anticipatory materialized balance table. Generation
and capacity sampling run only in Bench/manual workflows, never PR tests.

## Validation

From repository root, after `npm ci`:

```text
npm run verify:sqlite
```

This runs the TypeScript source directly, without a build, and exercises the SQLite storage contract and CLI tests
against disposable local fixtures. Raw driver/constraint probes import internal
modules only in tests; no SQL/CRUD escape hatch is exported by the production entry.

Owned files:

- `src/storage/{index,types,errors,queue,migrations,schema,sqlite,session,core}.ts`
- `README.md`
- `migrations/sqlite/001-storage.sql`
- `test/storage-sqlite.test.mjs`
- `test/storage-admin-cli.test.mjs`
- `test/support/storage-contract.mjs`
- `test/support/storage-raw-contract.mjs`
- `test/support/storage-sqlite-cases.mjs`
