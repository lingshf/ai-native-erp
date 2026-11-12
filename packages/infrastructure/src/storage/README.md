# M02 target storage

Public exports from `storage/index.ts`:

```ts
const local = createSqliteStorage({ filename: absoluteLocalDiskFilename });
const server = createPostgresStorage({
  host, port, user, password, database,
  ssl: { rejectUnauthorized: true, ca },
  maxConnections: 8,
});
```

`ssl: false` is supported for the isolated loopback test runtime. Connection
fields are mandatory; production factories never consult `PG*`, `DATA_DIR`,
an old ledger, or `.env`. Construction/import does not connect or create files.
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
uses the persisted table/index/trigger SQL definitions. PostgreSQL uses
OID-independent catalog descriptors for relations/RLS, columns/defaults,
constraints, indexes, user/internal trigger definitions and enablement,
function bodies/settings, rules, policies and inheritance. Rows and object keys
are sorted by JavaScript code-unit order before hashing. No reference database,
generic SQL parser, checksum cache or extra runtime DDL privileges are needed.
Even equivalent textual changes can conservatively require investigation.
This catches accidental drift; it does not protect against a database owner
deliberately replacing both schema and migration metadata. Changes to this
unreleased M02 initial SQL require fresh fixtures; old checksums are not adopted.

SQLite holds separate read/write queues and connections across awaits. Each
queue permits 64 waiters/one second, callbacks have a ten-second budget, and
sessions become invalid before cleanup. Pending driver work is drained before
rollback/release. Synchronous native statements cannot be interrupted by a JS
timer: this is a measured guardrail, not hard realtime or asynchronous native IO.
Only pretransaction `BEGIN IMMEDIATE` BUSY is attempted three times, with
asynchronous 25/50ms waits.

PostgreSQL requires 18, a dedicated database and fixed `public` schema.
Its configured `search_path=public` keeps CREATE in public while PostgreSQL
implicitly resolves `pg_catalog` before public, preventing catalog shadowing.
Writes use READ COMMITTED; reads use REPEATABLE READ READ ONLY. Tenant/book
shared locks precede company exclusive locks; parent-tier writers take their
exclusive lock without upgrades. Every row lock is a separate SQL statement
in ASCII tuple order. Provisioning uses INSERT ON CONFLICT plus reselect at RC.
Business budgets are 1/5/10 seconds (lock/statement/transaction); migration
budgets are 30/60/120 seconds. BEGIN disables any inherited transaction timer
before arming the adapter's own budget. Broken clients are destroyed. Only confirmed
40001/40P01 aborts may replay an explicitly retryable write, at most three
attempts. Unknown commit outcomes are never replayed.
A previously observed server transaction-timeout FATAL is rejected before
sending COMMIT as `TRANSACTION_TIMEOUT`, not an unknown wire outcome. An actual
COMMIT reply tagged ROLLBACK is `TRANSACTION_ABORTED` and is not replayed.

Receipts bind full company scope, operation, key, principal and fingerprint.
JSON is canonical UTF-8 TEXT, not JSONB. Native int64 remains bigint; public
revisions/audit sequences undergo safe-integer checks. Evidence has real
UPDATE/DELETE triggers, PostgreSQL TRUNCATE triggers, full-scope unique/FKs and
restricted parent deletion. This does not resist database-owner DDL tampering,
implement RLS, or deliver GL/approvals/outbox.

## Validation

From repository root, after the parent-owned dependency restore and build:

```text
node --test packages\infrastructure\test\storage-sqlite.test.mjs
node --test packages\infrastructure\test\databases\storage-postgres.test.mjs
```

The nested PostgreSQL suite is mandatory only in the explicit database runner.
It requires the parent's managed runtime to supply `ERP_TEST_DATABASE_URL`
temporarily; missing configuration fails, never skips. Tests create/drop only
random dedicated fixture databases. No runtime is downloaded/started here.
The fixture role requires CREATE DATABASE, test-only backend termination and
setting `deadlock_timeout` for the adversarial real-deadlock probe.
Do not pass real application databases or print the URI. Raw driver/constraint
probes import internal modules only in tests; no SQL/CRUD escape hatch is
exported by the production entry.

Owned files:

- `src/storage/{index,types,errors,queue,migrations,schema,sqlite,postgres,session,core}.ts`
- `src/storage/README.md`
- `migrations/{sqlite,postgres}/001-storage.sql`
- `test/storage-sqlite.test.mjs`
- `test/databases/storage-postgres.test.mjs`
- `test/support/storage-contract.mjs`
- `test/support/storage-raw-contract.mjs`
- `test/support/storage-sqlite-cases.mjs`
- `test/support/storage-postgres-cases.mjs`
- `test/support/storage-pg-harness.mjs`
