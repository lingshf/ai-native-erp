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

SQLite holds separate read/write queues and connections across awaits. Each
queue permits 64 waiters/one second, callbacks have a ten-second budget, and
sessions become invalid before cleanup. Pending driver work is drained before
rollback/release. Synchronous native statements cannot be interrupted by a JS
timer: this is a measured guardrail, not hard realtime or asynchronous native IO.
Writable target connections use `journal_mode=WAL`, `synchronous=NORMAL`,
`foreign_keys=ON`, and `busy_timeout=5000`, after schema validation and before
transactions. Read connections also enable NORMAL, foreign keys and the same
busy timeout, without changing journal mode. SQLite handles the bounded busy
wait; no outer retries multiply that budget or replay callbacks. A synchronous
busy wait can block the event loop for up to five seconds under contention.
The separate legacy snapshot reader remains read-only and never enables WAL.

Receipts bind full company scope, operation, key, principal and fingerprint.
JSON is canonical UTF-8 TEXT. Native int64 remains bigint; public
revisions/audit sequences undergo safe-integer checks. Evidence has real
UPDATE/DELETE triggers, full-scope unique/FKs and
restricted parent deletion. This does not resist database-owner DDL tampering
or deliver GL/approvals/outbox.

## Validation

From repository root, after `npm ci`:

```text
npm run verify:sqlite
```

This builds the packages and runs the SQLite storage contract and CLI tests
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
