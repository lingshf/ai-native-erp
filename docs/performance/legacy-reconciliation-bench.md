# M2-04 reconciliation benchmark

## Reproduction and scope

```powershell
node packages\infra\bench\reconciliation.ts OUTPUT.json
```

The runner generates fictional teaching/enterprise snapshots, imports them into a
new isolated SQLite target, and asserts exactly **1,000,000 posted GL lines**.
It never reads a user ledger, a backup, port 4173, or the main checkout. Temporary
fixtures are removed on exit.

Three repetitions use the same target and environment. Each measures one complete
readonly reconciliation, then starts the real HTTP API with its dedicated migration
reader worker. After five warmups, 50 sequential loopback HTTP requests fetch
`GET /api/v1/migration`. HTTP elapsed time includes worker dispatch, SQLite report
read, serialization, transfer, JSON decoding and shared response-contract parsing.
p95 is nearest rank (sample 48 of 50). Startup and fixture generation are excluded.
This measures warm page-data access, not browser rendering or cold application startup.

The controls deliberately lack M2-03b's `opening=done` marker: all checks and
HTTP responses must say `blocked`, with the run still `imported`. The benchmark
does not bypass the gate or exercise future P-inclusive opening reconciliation.

## Three-round evidence

Local run on Windows x64, Node v26.13.0, AMD EPYC 7763, 16 available logical
processors. The environment was shared with validation work; these are measured
results, not predictions. Initial import including its final reconciliation took
240.981 seconds; that is not the standalone check budget.

| Round | Complete check | Warm HTTP p95 | HTTP response bytes |
|---|---:|---:|---:|
| 1 | 23.769 s | 12.854 ms | 14,021 |
| 2 | 34.991 s | 42.742 ms | 14,021 |
| 3 | 49.697 s | 21.024 ms | 14,021 |

Budgets are 120 seconds for reconciliation and 1 second for warm HTTP p95.
The runner enforces D18's stricter 80% guards: **96 seconds / 800 ms**.
Worst measured results use 41.42% / 4.28% of their full budgets, below both guards.

The checker stages expected references in temporary SQLite tables, aggregates
exact smallest-unit amounts in SQLite, and joins line references using indexed
entry/company/line keys rather than concatenating actual target keys. The HTTP
path reads the stored report; it does not rerun million-line reconciliation.

Snapshot SHA-256 values for this run:

```text
teaching:   d36818c0ff1f344b7cbcd04a88e82767a4fbfb59391bf1438d2e34e07bd88561
enterprise: a07810a2e92c3997b927165a6989506386414c5e22f23fde662ff3cb0c37905d
```

The command's JSON output also retains all 150 individual HTTP samples, exact
timings, thresholds and environment metadata. These local measurements supplement,
but do not replace, final-head PR CI and the separate real-browser acceptance cases.
