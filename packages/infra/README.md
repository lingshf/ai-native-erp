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
