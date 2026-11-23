import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { test } from "vitest";
import { validateOpeningItems } from "../src/legacy/opening-items.ts";
import { OPENING_WRITE_BATCH, openingEntryBatches } from "../src/legacy/opening-staging.ts";
import { executeLegacyImport } from "../src/storage/legacy-import.ts";
import {
  choices,
  fixture,
  opening,
  plannedImport,
  RECEIVABLES_CONTROL_1300,
  rows,
} from "./support/legacy-opening-fixture.ts";

// M2-05b (D434): opening items are staged on disk and written in batches inside the one final
// transaction; these cases pin staging, batch-size independence and all-or-nothing rollback.

/** 28 items over three control accounts, each summing to the fixture's GL balance (130, 0, -25). */
const BATCHED_ITEMS = {
  "1300": Array.from({ length: 13 }, () => 10),
  "2100": Array.from({ length: 10 }, (_, index) => (index % 2 ? 10 : -10)),
  "2300": Array.from({ length: 5 }, () => -5),
};
const BATCHED_ITEM_COUNT = 28;
/** Splits the 28 items into 4 opening batches (7, 7, 7, 7). */
const SMALL_OPENING_BATCH = 7;
/** Commits the fixture's GL in several batches before the final opening transaction. */
const GL_BATCH_LINES = 4;
const batchedOpening = () => opening({ items: BATCHED_ITEMS });
/** Run IDs, timestamps and the run-bound reconciliation report hash differ between runs by design. */
const VOLATILE_COLUMN = /^(?:run_id|import_run|report_sha)$|_at$/u;

/**
 * Every target table except the run row, primary-key ordered; run-specific columns are dropped
 * and the run ID inside values (the reconciliation report) is replaced by a placeholder.
 */
function logicalDump(file: string): Record<string, unknown[]> {
  const db = new Database(file, { readonly: true });
  const name = (column: string) => `"${column.replaceAll('"', '""')}"`;
  try {
    const runId = String(db.prepare("SELECT id FROM legacy_import_runs").pluck().get());
    const normalize = (value: unknown) =>
      typeof value === "string" ? value.replaceAll(runId, "<run>") : value;
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT GLOB 'sqlite_*' AND name<>'legacy_import_runs' ORDER BY name",
      )
      .pluck()
      .all() as string[];
    return Object.fromEntries(
      tables.map((table) => {
        const columns = db.prepare("SELECT name,pk FROM pragma_table_info(?)").all(table) as {
          name: string;
          pk: number;
        }[];
        const key = columns.filter((column) => column.pk).sort((a, b) => a.pk - b.pk);
        const kept = columns.filter((column) => !VOLATILE_COLUMN.test(column.name));
        const order = (key.length ? key : columns).map((column) => name(column.name));
        const sql = `SELECT ${kept.map((column) => name(column.name))} FROM ${name(table)} ORDER BY ${order}`;
        const records = db.prepare(sql).raw().all() as unknown[][];
        return [table, records.map((record) => record.map(normalize))];
      }),
    );
  } finally {
    db.close();
  }
}
type CommittedSnapshot = { dump: Record<string, unknown[]>; run: Record<string, unknown>[] };
/** Target contents plus the run's durable progress (`cursor`, `counts`, `write_sequence`). */
function committedSnapshot(file: string): CommittedSnapshot {
  return {
    dump: logicalDump(file),
    run: rows(file, "SELECT status,opening,cursor,counts,write_sequence FROM legacy_import_runs"),
  };
}
function expectAtCommittedSnapshot(
  file: string,
  snapshot: CommittedSnapshot,
  status: "importing" | "failed" = "importing",
) {
  assert.deepEqual(committedSnapshot(file), {
    ...snapshot,
    run: snapshot.run.map((run) => ({ ...run, status })),
  });
}
/**
 * The last committed GL state before the final `flush(true)`: an import stopped right before the
 * opening write rolls the final transaction back to exactly this point.
 */
async function committedBaseline(
  f: ReturnType<typeof fixture>,
): Promise<{ target: string; snapshot: CommittedSnapshot }> {
  const target = join(f.directory, "baseline.sqlite");
  let committedBatches = 0;
  await assert.rejects(
    executeLegacyImport(
      f.snapshot,
      { target, choices, batchLines: GL_BATCH_LINES, openingItems: batchedOpening() },
      {
        beforeBatchCommit: () => void committedBatches++,
        beforeOpeningWrite() {
          throw new Error("stop before the opening phase");
        },
      },
    ),
    /stop before the opening phase/u,
  );
  assert.ok(committedBatches >= 2, "GL must commit in several batches before the opening phase");
  assert.deepEqual(rows(target, "SELECT count(*) n FROM open_items"), [{ n: 0 }]);
  assert.deepEqual(rows(target, "SELECT count(*) n FROM trade_parties"), [{ n: 0 }]);
  assert.deepEqual(
    rows(target, "SELECT count(*) n FROM legacy_refs WHERE object_type LIKE 'opening_%'"),
    [{ n: 0 }],
  );
  const snapshot = committedSnapshot(target);
  assert.deepEqual(
    snapshot.run.map(({ status, opening }) => ({ status, opening })),
    [{ status: "importing", opening: null }],
  );
  return { target, snapshot };
}

test("validation stages every valid item in file order and returns only the count", () => {
  const ITEM_COUNT = 12;
  const { plan, add } = plannedImport();
  try {
    add("companies", "F", "F", null, null, { currency: "EUR", year: 2026 });
    add("accounts", "1300", "F", null, null, RECEIVABLES_CONTROL_1300);
    add("journals", "1", "F", null, "2026-01-15", { status: "historical" });
    add("lines", "1:1", "F", "1", null, {
      account_code: "1300",
      debit_minor: ITEM_COUNT,
      credit_minor: 0,
    });
    const { bytes } = opening({
      accounts: ["1300"],
      items: { "1300": Array.from({ length: ITEM_COUNT }, () => 1) },
    });
    const result = validateOpeningItems(plan, bytes);
    // The minimal plan lacks the profiles' other accounts; only item-level issues matter here.
    assert.deepEqual(
      result.issues.filter((issue) => issue.path.startsWith("1300.items")),
      [],
    );
    assert.equal(result.plan.entryCount, ITEM_COUNT);
    assert.equal("entries" in result.plan, false);
    assert.deepEqual(
      plan.prepare("SELECT seq FROM opening_entries ORDER BY seq").pluck().all(),
      Array.from({ length: ITEM_COUNT }, (_, index) => index + 1),
    );
    assert.deepEqual(
      [...openingEntryBatches(plan, 5)].map((batch) => batch.map((entry) => entry.item.externalNo)),
      [
        ["OPEN-1300-1", "OPEN-1300-2", "OPEN-1300-3", "OPEN-1300-4", "OPEN-1300-5"],
        ["OPEN-1300-6", "OPEN-1300-7", "OPEN-1300-8", "OPEN-1300-9", "OPEN-1300-10"],
        ["OPEN-1300-11", "OPEN-1300-12"],
      ],
    );
  } finally {
    plan.close();
  }
});

test("the imported target does not depend on the opening batch size", async (t) => {
  const f = fixture(t);
  const dumps = [];
  for (const openingBatchItems of [1, SMALL_OPENING_BATCH, undefined]) {
    const target = join(f.directory, `batch-${openingBatchItems ?? "default"}.sqlite`);
    await executeLegacyImport(f.snapshot, {
      target,
      choices,
      openingBatchItems,
      openingItems: batchedOpening(),
    });
    assert.deepEqual(rows(target, "SELECT count(*) n FROM open_items"), [
      { n: BATCHED_ITEM_COUNT },
    ]);
    dumps.push(committedSnapshot(target));
  }
  assert.deepEqual(dumps[0], dumps[2]);
  assert.deepEqual(dumps[1], dumps[2]);
});

test("a failure before an opening batch rolls back to the committed GL; the resume equals one run", async (t) => {
  const f = fixture(t),
    { snapshot: baseline } = await committedBaseline(f),
    interrupted = join(f.directory, "interrupted.sqlite"),
    uninterrupted = join(f.directory, "uninterrupted.sqlite");
  const request = (target: string) => ({
    target,
    choices,
    batchLines: GL_BATCH_LINES,
    openingBatchItems: SMALL_OPENING_BATCH,
    openingItems: batchedOpening(),
  });
  const reached: number[] = [];
  await assert.rejects(
    executeLegacyImport(f.snapshot, request(interrupted), {
      beforeOpeningBatch(batch) {
        reached.push(batch);
        if (batch === 2) throw new Error("synthetic opening batch failure");
      },
    }),
    /synthetic opening batch failure/u,
  );
  assert.deepEqual(reached, [1, 2]);
  expectAtCommittedSnapshot(interrupted, baseline);

  const written: number[] = [];
  await executeLegacyImport(f.snapshot, request(interrupted), {
    beforeOpeningBatch: (batch) => void written.push(batch),
  });
  assert.deepEqual(written, [1, 2, 3, 4]);
  await executeLegacyImport(f.snapshot, request(uninterrupted));
  assert.deepEqual(committedSnapshot(interrupted), committedSnapshot(uninterrupted));
});

test("a re-check difference after several opening batches rolls back to the committed GL as failed", async (t) => {
  const f = fixture(t),
    { snapshot: baseline } = await committedBaseline(f),
    target = join(f.directory, "failed.sqlite");
  const written: number[] = [];
  await assert.rejects(
    executeLegacyImport(
      f.snapshot,
      {
        target,
        choices,
        batchLines: GL_BATCH_LINES,
        openingBatchItems: SMALL_OPENING_BATCH,
        openingItems: batchedOpening(),
      },
      {
        beforeOpeningBatch: (batch) => void written.push(batch),
        beforeOpeningRecheck(db) {
          db.prepare(
            "DELETE FROM legacy_refs WHERE object_type='opening_accounts' AND legacy_id='F:1400'",
          ).run();
        },
      },
    ),
    (error: Error & { code?: string }) =>
      error.code === "CONFLICT" && /F\/1400: GL 0, opening items 0/u.test(error.message),
  );
  assert.deepEqual(written, [1, 2, 3, 4]);
  expectAtCommittedSnapshot(target, baseline, "failed");
});

test("an invalid opening batch size is refused before any target write", async (t) => {
  const f = fixture(t),
    { target: resumed } = await committedBaseline(f),
    created = join(f.directory, "never.sqlite"),
    before = readFileSync(resumed);
  for (const openingBatchItems of [0, OPENING_WRITE_BATCH + 1, 1.5])
    for (const target of [created, resumed])
      await assert.rejects(
        executeLegacyImport(f.snapshot, {
          target,
          choices,
          batchLines: GL_BATCH_LINES,
          openingBatchItems,
          openingItems: batchedOpening(),
        }),
        { code: "INVALID_INPUT" },
      );
  assert.equal(existsSync(created), false);
  assert.deepEqual(readFileSync(resumed), before);
});
