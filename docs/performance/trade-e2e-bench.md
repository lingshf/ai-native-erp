# Trade benchmark evidence

## M1-R3: history and concurrency (`http-contract-v3-history-concurrency`)

M1-R3 ([task](../../design/tasks/M1-R3-trade-report-capacity.md),
[M1 review §4](../../design/reviews/M1.md)) adds settlement/adjustment history
and concurrent report clients to the M1-07 capacity fixture below. Budgets and
the D18 80% line (800 ms for reads) are unchanged. The command is unchanged:
`node packages\infra\bench\trade-http.ts`.

### History load

`packages/infra/bench/trade-history.ts` (seed `m1-r3-trade-history-v1`) runs
after the M1-07 projection, writes production tables directly, and keeps
triggers and foreign keys enabled. It is synthetic, like the M1-07 items: it is
not posting throughput and not GL-reconciliation evidence.

| Property | Value |
|---|---:|
| Settlements | **200,000** (0–4 per invoice item, average 2) |
| Payment documents / their journals | 24,000 |
| Fully settled invoice items | 20,000 (20%) |
| Cancelled invoice items (action + reversal journal) | 2,500 |
| Advance + apply adjustments | 2,500 advances, 2,500 applications |
| Adjusted invoices | 5,000 (5%) |
| Open items after load (invoices + advances) | 102,500 |
| Added journals / GL lines | 31,500 / 239,000 |
| Status: open / settled / cancelled | 80,000 / 20,000 / 2,500 |
| Fixture file after history | 1,064,611,840 bytes |

The task suggested credits for the adjustment share. Credit notes reference an
original item through a foreign key (`original_id`), and the generated
projections are not real posted invoices. The loader therefore uses
cancellations plus advance+apply settlements, which put action-change JSON and
settlement history on the same report paths. The loader asserts the expected
counts, per-item revision/balance consistency, no settlement before its item,
current and June 2026 gross totals (including party `P0015`),
`PRAGMA foreign_key_check` and `PRAGMA quick_check`.

### Concurrency scenario

After the serial reads, three clients on separate keep-alive connections fire
together in each round: the current all-party aging report, the June 2026
historical balances and the party-`P0015` current report. There are 24 measured
rounds after 4 warmups. Each request has its own p95, and
`concurrent-3-reports-round` is the p95 of the slowest request in each round.
Read workers are `max(2, min(3, availableParallelism - 1))`: 3 locally and 3 on
the 4-vCPU CI runner.

### Optimization (D51) and equivalence

The first local run with history exceeded the budget. With the b2cc1d7 SQL, the
current aging report took about 3.6–4.2 s and the GL reconciliation about
2.7–3.9 s per request. The totals and the reconciliation scanned every
settlement through a LEFT JOIN plus grouping, and parsed each action-change
JSON document repeatedly. Following D18, `trade-reporting.ts` was rewritten
without a replay cache:

- Paid amounts and action changes are correlated per-item sums, served by the
  covering index from migration 016.
- Totals are a per-(kind, bucket) GROUP BY that is then summed. The page is
  joined only for the returned items. The non-detail projection drops the
  `journal_entries` join, which foreign keys make redundant.
- Reconciliation materializes the subledger first. It takes GL balances from
  per-period sums for months before the cutoff, plus the cutoff month by date,
  minus the lines of entries whose receipt module is not `TRADE`.

Migration 016 (D51) adds only
`settlements_report(company_id,item_id,accounting_date,applied_gross_minor,applied_net_minor,applied_tax_minor)`.
It runs automatically through the normal migration path on startup or upgrade:

- **Build time:** about 7.2 s for 200,000 settlements on the local host.
- **File size:** +21,585,920 bytes (about 2.1%) on a 1.04 GB fixture, about
  108 bytes per settlement.
- **Schema:** no other schema changes.

Semantic equivalence is tested, not argued.
`packages/infra/test/support/trade-reporting-legacy.ts` freezes the b2cc1d7 SQL.
`compareWithLegacyReports` compares the serialized results field by field:

- Base, AP, AR and every party scope.
- The current report and the 12 month-ends of 2026.
- Keyset pages, every item detail plus a missing id, and the reconciliation.

It runs at the end of four `trade-documents` behaviour tests: history,
actions/reversals, other-source GL and keyset pages.

### M1-R3 results

Nearest-rank p95, ms, 24 measured requests after 4 warmups per run.

**CI** — [Bench run 44666904185](https://github.com/lingshf/ai-native-erp/actions/runs/44666904185),
job `trade-http` (5 min 19 s wall clock). Environment: Linux 4 vCPU AMD EPYC 7763,
16 GB, Node v26.13.1.

| Scenario | Run 1 | Run 2 | Run 3 | p95 budget |
|---|---:|---:|---:|---:|
| Open-item first page (100) | 10.59 | 9.21 | 8.64 | ≤1,000 |
| Current aging report | 424.34 | 428.45 | 427.02 | ≤1,000 |
| Historical balances, 2026-06 | 301.69 | 298.96 | 301.74 | ≤1,000 |
| GL reconciliation | 470.37 | 472.09 | 472.83 | ≤1,000 |
| Concurrent: current aging | 440.21 | 439.14 | 429.96 | ≤1,000 |
| Concurrent: historical 2026-06 | 305.71 | 315.27 | 304.68 | ≤1,000 |
| Concurrent: party P0015 current | 342.37 | 352.07 | 338.81 | ≤1,000 |
| Concurrent: slowest of 3 per round | 440.22 | 439.16 | 429.97 | ≤1,000 |
| AP invoice preview (100 lines) | 58.73 | 59.59 | 52.18 | ≤2,000 |
| AP invoice confirm (100 lines) | 125.81 | 125.48 | 131.07 | ≤2,000 |
| AR invoice preview (100 lines) | 50.06 | 48.13 | 46.45 | ≤2,000 |
| AR invoice confirm (100 lines) | 119.79 | 118.68 | 113.28 | ≤2,000 |

All three CI runs passed with no D18 warnings. The highest value is the
reconciliation at 472.83 ms, 59% of the read budget.

**Local** three-run results: pending. The shared host was saturated by unrelated load-test processes at measurement time; numbers taken then are not valid evidence (control scenarios degraded several-fold).

### M1-R3 limitations

- History is a direct synthetic load. It has no credit notes and no
  multi-company data.
- Concurrency is three report clients. It does not cover reports running
  together with writes.
- The party-scoped report alone takes tens of ms. Under concurrency it reaches
  about 340 ms because it waits behind the all-party reports on the read
  workers.
- Each report still aggregates all items per request. Its cost grows linearly
  with item and settlement counts.

## M1-07 baseline (`http-contract-v2`)

Measured on 2026-11-19, 14:45:07.899–14:49:59.210 UTC using
`http-contract-v2`, after rebasing onto migration 014 / main
`fa812a0531ae56adaeaa8a7c73d2bbdcdc44b321`. Measured source head:
`70761d7` (the subsequent evidence-only commit does not change benchmark code).
This document records post-rebase local evidence, not the final-head Linux
acceptance run or the separate browser acceptance test.

All earlier `http-contract-v2` predictions on `0cd94fc` remain predictions.
All pre-v2 measurements are withdrawn because they excluded shared-contract
parsing. This document and its raw JSON replace that invalid evidence.
Final-head CI and formal three-run Bench results are recorded in
[PR #54](https://github.com/lingshf/ai-native-erp/pull/54).

### Reproduction and method

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
serialization/transfer, client JSON decoding and shared response-contract parsing.
Fixture generation, configuration, startup and subsequent scenario assertions
are outside the measured requests. Confirmations
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

The current report is the most expensive read: its p95 was 421.46–602.04 ms.
Returning only 100 rows does not avoid the all-item totals aggregation.

### Exact fixture shape and limitations

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
| Base GL fixture size, before trade capacity | 566,546,432 bytes |

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

### Environment

| Property | Recorded value |
|---|---|
| Node | v26.13.0 |
| V8 | 14.6.202.34-node.40 |
| Native benchmark SQLite | 3.53.4 |
| OS | Windows, `win32` release 10.0.26300, x64 |
| CPU | AMD EPYC 7763 64-Core Processor |
| Exposed logical CPUs / available parallelism | 16 / 16 |
| Total memory | 68,665,831,424 bytes |
| Free memory at final metadata capture | 38,165,868,544 bytes |
| Request concurrency / read workers / writer workers | 1 / 3 / 1 |

Per-repetition start/end free-memory and host metadata are retained in the JSON.
Windows does not support the recorded load-average API; its zero values are
explicitly marked unsupported, not interpreted as an idle host. The machine was
shared, not an isolated performance runner.

Fixture seed: `m1-07-trade-v1`; base GL seed: `m012-v1`.
Logical SHA-256 values:

- Base GL: `a8df49dab076979459e657d785781a4488307f20440be42715acebadc54efead`
- Trade capacity: `de6d921efd67616414fbd85ca475a698d325d99edf5007f75e034d4bd8787385`

### Results

Nearest-rank p95, milliseconds; each cell is based on 24 measured requests after
four warmups. The raw sample order, p50, p95 and p99 are preserved in the JSON.

| Scenario | Run 1 | Run 2 | Run 3 | p95 budget |
|---|---:|---:|---:|---:|
| Open-item first page (100) | 23.10 | 26.28 | 57.35 | ≤1,000 |
| Current aging report | 579.71 | 421.46 | 602.04 | ≤1,000 |
| Historical balances, 2026-06 | 358.84 | 398.66 | 363.24 | ≤1,000 |
| AP invoice preview (100 lines) | 53.97 | 56.90 | 41.80 | ≤2,000 |
| AP invoice confirm (100 lines) | 475.91 | 455.59 | 480.49 | ≤2,000 |
| AR invoice preview (100 lines) | 41.20 | 44.72 | 52.38 | ≤2,000 |
| AR invoice confirm (100 lines) | 422.89 | 485.99 | 499.10 | ≤2,000 |

**All three runs passed the unchanged budgets. No D18 warnings occurred.**
D18 flags a scenario when its p95 exceeds 80% of its budget: 800 ms for reads or
1,600 ms for preview/confirm. No scenario crossed those values, so no
D18-triggered optimization was required. There is no measured budget gap for
this workload; the synthetic-source and serial/history limitations above remain.

The isolated `trade-http` job in `bench.yml` runs only on the existing manual or
scheduled benchmark triggers, uploads the JSON artifacts, and does not change
the existing benchmarks. Real timing gates are not run in PR tests.

### Raw evidence

Persistent, complete three-run local evidence: [trade-bench.json](trade-bench.json).
It is a copy of the aggregate output, retaining all original raw timing
values and metadata, with no local absolute fixture paths.

The reproduction command writes these repository-relative files:

- `artifacts\ci\trade.json`: aggregate, all three raw sample sets and metadata.
- `artifacts\ci\trade-fixture.json`: fixture generation, size and shape evidence.
- `artifacts\ci\trade-run-1.json`
- `artifacts\ci\trade-run-2.json`
- `artifacts\ci\trade-run-3.json`

The artifact files are ignored local/CI outputs; `trade-bench.json` preserves the
reviewed evidence in the repository after those artifacts expire.
