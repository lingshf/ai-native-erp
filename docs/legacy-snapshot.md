# Legacy snapshot producer

Development, tests and benchmarks use fictional fixtures only. Decisions A/B/C
remain unauthorized: do not read real ledgers, operate on the running 4173 book,
use the user's old checkout, or inspect existing backup files.

On Windows, with an explicitly authorized, stopped and isolated source:

The command is maintained only in [the migration runbook §2](migration-runbook.md) (Chinese).

Both paths are mandatory; output must not exist or be inside source. The source
contains `teaching.sqlite` and `erp.sqlite` and their optional `-wal`/`-shm`.
There are no defaults, environment-file reads, or bypass switches. Non-Windows
production use refuses with `UNSUPPORTED_PLATFORM`.

The Windows broker holds real read-only `FileShare.None` handles for both main
files and all existing WAL/SHM files through byte copying and before/after
existence, size, mtime and SHA-256 comparison. Any conflicting process handle
causes `SOURCE_BUSY`; hashes do not substitute for stopping and isolating writes.
Only explicit not-found metadata errors count as absent; directories, reparse
points, permission failures and other I/O errors always refuse the operation,
including during both inventories while exclusive handles remain held.
SQLite never opens source paths. Only private copies are recovered/checkpointed.
The output contains the existing verified two-ledger snapshot format and
`backup/`, whose unchanged main/WAL bytes and private manifest preserve committed
WAL data. SHM is never backed up. A separate copy of the backup passes integrity
checks and must have the same logical digest as the generated snapshot.
The two books are individually consistent, not cross-database atomic.

Any remaining `-journal` causes `ROLLBACK_JOURNAL`, with no output. Do not delete
or roll it back with this tool. After obtaining the corresponding real-data
authorization, have the user normally start and stop the old application using
their old checkout to complete SQLite recovery, then retry. Source bytes,
sidecar existence and mtimes must remain unchanged on success and refusal.
Other errors remove only output created by this invocation, never an existing
directory. Generated snapshots, backups and private manifests must not enter Git.

Portable tests inject the exclusive-lease backend; the CLI cannot inject one.
Real Windows handle tests run only with `ERP_WINDOWS_SNAPSHOT_HANDLES=1` in the
nightly/manual Windows workflow, never PR CI. The same workflow measures a
fictional million-GL-line snapshot plus backup against 60 seconds. Unit tests
have no sub-second elapsed-time assertions.
