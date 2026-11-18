import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { Book } from "../../../../src/book.mjs";
import { EnterpriseBook } from "../../../../src/enterprise.mjs";
import { snapshotLedgers, verifyLedgerSnapshot } from "../../../../scripts/ledger-snapshot.mjs";

export function captureDirectory(directory) {
  return fs
    .readdirSync(directory)
    .sort()
    .map((name) => {
      const file = join(directory, name);
      return [
        name,
        fs.statSync(file).isDirectory()
          ? captureDirectory(file)
          : createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
      ];
    });
}

export function legacyFixture(t, { wal = false, history = false, many = false } = {}) {
  const directory = resolve(`.legacy-fixture-${randomUUID()}`);
  fs.mkdirSync(directory);
  const teaching = join(directory, "source-teaching.sqlite");
  const enterprise = join(directory, "source-enterprise.sqlite");
  const book = new Book(teaching, { today: "2026-01-15" });
  const erp = new EnterpriseBook(enterprise);
  const readers = [];
  t.after(() => {
    for (const reader of readers) reader.close();
    book.close();
    erp.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  // Only baseline public enterprise methods: no dependency on unreleased trade.
  erp.createCompany({
    code: "F",
    name: "Fictional legacy fixture",
    year: 2026,
    currency: "EUR",
    scale: 2,
    reportCurrency: "EUR",
    reportScale: 2,
    chartTemplate: "STANDARD",
  });
  book.createDimension({ code: "TEAM", name: "Fictional team" });
  book.createDimensionValue("TEAM", { code: "A", name: "Fictional A" });
  book.createAccount({ code: "1100", name: "Historical disabled account", category: "ASSET" });
  const post = (date, amount, kind = "normal", account = "1000") => {
    const journal = book.save({
      date,
      memo: `Fictional ${date}`,
      kind,
      lines: [
        { account, debit: amount, credit: "0", dimensions: { TEAM: "A" } },
        { account: "4000", debit: "0", credit: amount, dimensions: { TEAM: "A" } },
      ],
    });
    return book.post(journal.id);
  };
  let month = "2026-01";
  if (history) {
    const adjustment = post("2026-01-20", "3.25", "adjusting");
    book.closePeriod("2026-01");
    book.nextPeriod();
    book.post(book.reverse(adjustment.id, "2026-02-01").id);
    post("2026-02-20", "2.30", "adjusting");
    post("2026-02-10", "7.25", "normal", "1100");
    post("2026-02-10", "1.50");
    post("2026-02-02", "4.40");
    const split = book.save({
      date: "2026-02-10",
      memo: "Same-date, same-journal line order",
      kind: "normal",
      lines: [
        { account: "1000", debit: "0.01", credit: "0" },
        { account: "1000", debit: "0.02", credit: "0" },
        { account: "4000", debit: "0", credit: "0.03" },
      ],
    });
    book.post(split.id);
    book.closePeriod("2026-02");
    book.nextPeriod();
    month = "2026-02";
  } else {
    const draft = book.save({
      date: "2026-01-15",
      memo: "Retain fictional draft ID3",
      kind: "normal",
      lines: [
        { account: "1000", debit: "7.25", credit: "0" },
        { account: "4000", debit: "0", credit: "7.25" },
      ],
    });
    assert.equal(draft.id, 3);
    post("2026-01-20", "3.25", "adjusting");
  }
  if (many) {
    for (let index = 0; index < 101; index++) post("2026-01-10", "0.01");
  }
  const account = book.accounts().find((row) => row.code === "1100");
  book.updateAccount("1100", {
    name: account.name,
    active: false,
    manualAllowed: false,
    revision: account.revision,
  });
  if (wal) {
    book.db.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0");
    post(`${month === "2026-02" ? "2026-03" : month}-25`, "1.23");
    // Pin the source's committed read version, including its existing WAL read mark.
    // Otherwise M00's own read can initialize a SHM read mark before bridge consumption.
    book.db.exec("BEGIN");
    book.db.prepare("SELECT COUNT(*) FROM journals").get();
  }
  const before = captureDirectory(directory);
  const target = join(directory, "snapshot");
  const manifest = snapshotLedgers({ teaching, enterprise, target });
  const snapshot = join(target, manifest.ledgers.teaching.file);
  // This is a gate, not a journal-mode conversion: fail back to G3 on another runtime.
  assert.deepEqual(
    [...fs.readFileSync(snapshot).subarray(18, 20)],
    [1, 1],
    "M00 VACUUM output is WAL: stop and return to G3; never change source or snapshot mode",
  );
  assert.deepEqual(verifyLedgerSnapshot(target), manifest);
  assert.deepEqual(
    captureDirectory(directory).filter(([name]) => name !== "snapshot"),
    before,
  );
  return {
    directory,
    teaching,
    enterprise,
    book,
    target,
    manifest,
    snapshot,
    readers,
    month,
    config: { directory: target, verifiedManifest: manifest },
  };
}

export function metadataFor(file, directory) {
  const data = fs.readFileSync(file);
  return {
    directory,
    verifiedManifest: {
      version: 1,
      status: "verified",
      crossDatabaseAtomic: false,
      ledgers: {
        teaching: {
          file: "teaching.sqlite",
          bytes: data.length,
          sha256: createHash("sha256").update(data).digest("hex"),
        },
      },
    },
  };
}
