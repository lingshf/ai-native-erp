import test from "node:test";
import assert from "node:assert/strict";
import {
  LegacyTeachingQueryService,
  StorageError,
  DomainError,
} from "../../src/application/index.ts";

function fixture() {
  const calls = [];
  const balance = {
    rows: [
      { code: "1000", name: "Fictional cash", category: "ASSET", debit: 3, credit: 0 },
      { code: "4000", name: "Fictional revenue", category: "REVENUE", debit: 0, credit: 3 },
    ],
    debit: 3,
    credit: 3,
  };
  const trialBalances = { unadjusted: balance, adjusted: balance, postClosing: balance };
  const reader = {
    info: {
      sourceKind: "verified-teaching-snapshot",
      baseline: "M00-verified-snapshot",
      live: false,
      snapshotSha256: "a".repeat(64),
      snapshotBytes: 4096,
      scale: 2,
    },
    periods() {
      calls.push("periods");
      return [{ month: "2026-01", status: "closed" }];
    },
    trialBalances(month) {
      calls.push(["trial", month]);
      return { month, trialBalances };
    },
    ledger(query) {
      calls.push(["ledger", query]);
      return {
        month: query.month,
        account: query.account,
        opening: -1,
        closing: 2,
        debit: 3,
        credit: 0,
        totalEntries: 1,
        entries: [
          {
            id: 2,
            lineId: 7,
            date: "2026-01-15",
            memo: "Fictional entry",
            kind: "normal",
            reversal_of: null,
            source_kind: null,
            account: "1000",
            debit: 3,
            credit: 0,
            balance: 2,
          },
        ],
      };
    },
    close() {
      assert.fail("Borrowing query service must not own or close its reader");
    },
  };
  return { reader, calls, trialBalances, service: new LegacyTeachingQueryService(reader) };
}

test("query service binds one snapshot and forwards original complete projection without recomputing it", () => {
  const { reader, calls, service, trialBalances } = fixture();
  assert.deepEqual(service.context(), {
    source: reader.info,
    periods: [{ month: "2026-01", status: "closed" }],
  });
  const trial = service.trial(reader.info.snapshotSha256, "2026-01");
  assert.deepEqual(trial, { source: reader.info, month: "2026-01", trialBalances });
  const query = { month: "2026-01", account: "1000", limit: 1, cursor: "YQ" };
  const ledger = service.ledger(reader.info.snapshotSha256, query);
  assert.equal(ledger.opening, -1);
  assert.equal(ledger.closing, 2);
  assert.equal(ledger.source, reader.info);
  assert.deepEqual(calls, ["periods", ["trial", "2026-01"], ["ledger", query]]);
  assert.equal(Object.hasOwn(calls.at(-1)[1], "snapshot"), false);
});

test("malformed or stale snapshot identities reject before the reader is called", () => {
  const { calls, service, reader } = fixture();
  for (const snapshot of ["", "A".repeat(64), "a".repeat(63), "a".repeat(64) + "\n"]) {
    assert.throws(
      () => service.trial(snapshot, "2026-01"),
      (error) => error instanceof StorageError && error.code === "INVALID_INPUT",
    );
  }
  assert.throws(
    () => service.ledger("b".repeat(64), { month: "2026-01", account: "1000" }),
    (error) => error instanceof StorageError && error.code === "CONFLICT",
  );
  reader.info = { ...reader.info, snapshotSha256: "c".repeat(64) };
  assert.throws(
    () => service.trial("a".repeat(64), "2026-01"),
    (error) => error instanceof StorageError && error.code === "CONFLICT",
  );
  assert.deepEqual(calls, []);
});

test("query service reuses domain month validation and preserves explicit reader failures", () => {
  const { calls, service, reader } = fixture();
  for (const month of ["1899-12", "9999-01", "2026-13", "2026-01\n"]) {
    assert.throws(
      () => service.trial(reader.info.snapshotSha256, month),
      (error) => error instanceof DomainError && error.code === "INVALID_INPUT",
    );
    assert.throws(
      () => service.ledger(reader.info.snapshotSha256, { month, account: "1000" }),
      (error) => error instanceof DomainError && error.code === "INVALID_INPUT",
    );
  }
  assert.deepEqual(calls, []);
  const failure = new StorageError("CLOSED");
  reader.periods = () => {
    throw failure;
  };
  reader.ledger = () => {
    throw failure;
  };
  assert.throws(
    () => service.context(),
    (error) => error === failure,
  );
  assert.throws(
    () => service.ledger(reader.info.snapshotSha256, { month: "2026-01", account: "1000" }),
    (error) => error === failure,
  );
});
