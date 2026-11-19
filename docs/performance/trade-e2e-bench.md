# M1-07 trade benchmark evidence

> **Invalidated acceptance evidence:** the measurements below predate review
> 5976793336 and exclude shared response-contract parsing. Every old percentile,
> including the linked raw JSON, is withdrawn as an acceptance value. The
> corrected `http-contract-v2` runner times the full HTTP response, JSON decoding
> and shared contract parsing; replacement three-run evidence is pending the
> required rebase after PR #47 merges.

Measured on 2026-11-19, 13:41:54.787–13:45:54.040 UTC. This document records
performance evidence; it does not replace the separate browser acceptance test.

## Reproduction and method

From the repository root, with the locked dependencies installed and Node 26:

```powershell
node packages\infra\bench\trade-http.ts
```

The command always runs three repetitions in the same environment, with four
warmups followed by 24 measured requests per scenario per repetition. Each
repetition starts a new production `packages\infra\src\main.ts` child against a
fresh copy of the same generated fixture. It uses real HTTP/1.1 requests over
`127.0.0.1`, an ephemeral port, keep-alive, concurrency one, three read workers
and one writer worker. There is no Fastify injection or direct application call
in the measured request path.

Elapsed times include loopback HTTP, production worker dispatch, SQL, response
serialization/transfer and client JSON parsing. Fixture generation, configuration,
startup and response assertions are outside the measured requests. Confirmations
exclude the separately requested prerequisite preview, but include production
revalidation, posting and transaction commit; each confirmation is a new invoice,
not an idempotency replay.

The three read scenarios run before invoice writes:

- Current open-item first page: 100 items, `status=open`.
- Current aging report: 100 returned items plus totals across all 100,000 items.
- Historical balances: the month-end report for June 2026, 100 returned items
  plus the complete historical aggregation.

AP and AR preview/confirm scenarios each use the maximum 100 invoice lines,
ordinary 13% VAT, document rounding, discounts and taxable charges, and 100
distinct dimension segments. Each resulting journal has 300 GL lines. AP also
matches all 100 lines against a purchase order; AR has no order.

The current report is the most expensive read: its p95 was 375.05–585.76 ms.
Returning only 100 rows does not avoid the all-item totals aggregation.

## Exact fixture shape and limitations

`generateTradeFixture` reuses the existing `generateLedgerFixture` without
changing it. The initial fixture is asserted before each repetition:

| Property | Initial value |
|---|---:|
| Companies | 1 (`DEFAULT`) |
| GL journals / GL lines | 1,000 / **1,000,000** |
| Base accounts / additional trade accounts | 200 / 6 |
| Periods / dimensions | 24 / 3 |
| Partners | **1,000**: 500 AP vendors, 500 AR customers |
| Open items | **100,000**: 50,000 AP, 50,000 AR |
| Items per partner | Exactly 100 |
| Item sources / frozen terms / control segments | 100,000 each |
| Partner configuration-history records | 1,000 |
| Current invoice gross total | 1,130,000,000 minor units |
| June 2026 historical gross total | 680,260,000 minor units |
| Completed fixture size | 561,623,040 bytes |

Capacity items are synthetic invoice-kind projections, not 100,000 invoices
posted through the application. Their sources reuse the existing synthetic GL
journals with matching accounting dates. **They are not GL-reconciliation
evidence and must not be presented as a reconciled trade subledger.** No source
GL rows are rewritten, and no foreign keys or immutable triggers are disabled.
The capacity population has no settlement or adjustment history, so these results
do not establish performance for history-heavy or concurrent workloads.

The loader checks the exact counts and AP/AR distribution, every partner's item
count, source dates, segment amounts, GL debit/credit balance,
`PRAGMA foreign_key_check` and `PRAGMA quick_check`. Real production
confirmations subsequently add 56 invoices (28 AP and 28 AR, including warmups),
16,800 GL lines and 5,600 control segments. Every repetition therefore ends with
exactly 1,016,800 GL lines, 100,056 open items and 105,600 control segments;
the same integrity and shape checks pass again.

Only newly created, uniquely owned fixtures beneath `artifacts\ci` are used.
They are deleted after the run. The runner does not use a user ledger, a main
checkout, a backup or port 4173.

## Environment

| Property | Recorded value |
|---|---|
| Node | v26.13.0 |
| V8 | 14.6.202.34-node.40 |
| Native benchmark SQLite | 3.53.4 |
| OS | Windows, `win32` release 10.0.26300, x64 |
| CPU | AMD EPYC 7763 64-Core Processor |
| Exposed logical CPUs / available parallelism | 16 / 16 |
| Total memory | 68,665,831,424 bytes |
| Free memory at final metadata capture | 35,458,510,848 bytes |
| Request concurrency / read workers / writer workers | 1 / 3 / 1 |

Per-repetition start/end free-memory and host metadata are retained in the JSON.
Windows does not support the recorded load-average API; its zero values are
explicitly marked unsupported, not interpreted as an idle host. The machine was
shared, not an isolated performance runner.

Fixture seed: `m1-07-trade-v1`; base GL seed: `m012-v1`.
Logical SHA-256 values:

- Base GL: `a8df49dab076979459e657d785781a4488307f20440be42715acebadc54efead`
- Trade capacity: `de6d921efd67616414fbd85ca475a698d325d99edf5007f75e034d4bd8787385`

## Results

Nearest-rank p95, milliseconds; each cell is based on 24 measured requests after
four warmups. The raw sample order, p50, p95 and p99 are preserved in the JSON.

| Scenario | Run 1 | Run 2 | Run 3 | p95 budget |
|---|---:|---:|---:|---:|
| Open-item first page (100) | 21.50 | 12.96 | 13.18 | ≤1,000 |
| Current aging report | 585.76 | 375.05 | 441.42 | ≤1,000 |
| Historical balances, 2026-06 | 302.40 | 335.05 | 299.71 | ≤1,000 |
| AP invoice preview (100 lines) | 31.76 | 44.74 | 32.70 | ≤2,000 |
| AP invoice confirm (100 lines) | 399.49 | 377.71 | 423.34 | ≤2,000 |
| AR invoice preview (100 lines) | 27.57 | 26.31 | 25.58 | ≤2,000 |
| AR invoice confirm (100 lines) | 385.22 | 359.62 | 384.92 | ≤2,000 |

**All three runs passed the unchanged budgets. No D18 warnings occurred.**
D18 flags a scenario when its p95 exceeds 80% of its budget: 800 ms for reads or
1,600 ms for preview/confirm. No scenario crossed those values, so no
D18-triggered optimization was required. There is no measured budget gap for
this workload; the synthetic-source and serial/history limitations above remain.

The isolated `trade-http` job in `bench.yml` runs only on the existing manual or
scheduled benchmark triggers, uploads the JSON artifacts, and does not change
the existing benchmarks. Real timing gates are not run in PR tests.

## Raw evidence

Persistent, compact, complete three-run evidence: [trade-bench.json](trade-bench.json).
It is a minified copy of the aggregate output, retaining all original raw timing
values and metadata, with no local absolute fixture paths.

The reproduction command writes these repository-relative files:

- `artifacts\ci\trade.json`: aggregate, all three raw sample sets and metadata.
- `artifacts\ci\trade-fixture.json`: fixture generation, size and shape evidence.
- `artifacts\ci\trade-run-1.json`
- `artifacts\ci\trade-run-2.json`
- `artifacts\ci\trade-run-3.json`

The artifact files are ignored local/CI outputs; `trade-bench.json` preserves the
reviewed evidence in the repository after those artifacts expire.
