import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  inspectLedger,
  verifyLedgerSnapshot,
} from "../../../../scripts/legacy-snapshot-verifier.mjs";

export function captureDirectory(directory, { mtime = false } = {}) {
  return fs
    .readdirSync(directory)
    .sort()
    .map((name) => {
      const file = join(directory, name);
      const stat = fs.statSync(file, { bigint: true });
      return [
        name,
        stat.isDirectory()
          ? captureDirectory(file, { mtime })
          : createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
        ...(mtime && stat.isFile() ? [stat.mtimeNs.toString()] : []),
      ];
    });
}

export function snapshotRejection(check, before, after = before, code = "INVALID_SNAPSHOT") {
  const describe = (stat) =>
    stat
      ? Object.fromEntries(
          ["size", "mtimeNs", "ino", "dev", "ctimeNs"].map((key) => [key, String(stat[key])]),
        )
      : null;
  return (error) => {
    assert.equal(error.code, code);
    assert.equal(error.name, "StorageError");
    const diagnostic = { check, before: describe(before), after: describe(after) };
    assert.deepEqual(error.diagnostic, diagnostic);
    assert.ok(error.message.endsWith(JSON.stringify(diagnostic)));
    assert.ok(!error.message.includes(".sqlite") && !error.message.includes("SELECT"));
    return true;
  };
}

const advanceAccounts = {
  1400: {
    category: "ASSET",
    contraOf: null,
    controlModule: "AP",
    manualAllowed: false,
    name: "Vendor prepayments",
    normalSide: "DEBIT",
    purpose: "control",
    reportGroup: "prepayments",
  },
  2300: {
    category: "LIABILITY",
    contraOf: null,
    controlModule: "AR",
    manualAllowed: false,
    name: "Customer advances",
    normalSide: "CREDIT",
    purpose: "control",
    reportGroup: "otherLiabilities",
  },
};
const window = { from: "2026-01-01", to: "2099-12-31" };
/**
 * Fictional M2-03b opening-items file for company F. Every listed control account is declared;
 * accounts with rows are `detail`, the rest `empty`. Master data needs `tradeAdvances`.
 */
export function openingItemsFile({
  accounts = ["1300", "2100"],
  items = {},
  master = Object.keys(items).length > 0,
  ...extra
} = {}) {
  const file = {
    version: 1,
    ...(master
      ? {
          terms: [
            {
              company: "F",
              code: "NET30",
              name: "Net 30",
              ...window,
              dueDays: 30,
              discountDays: 0,
              discountPercent: "0",
              allowPartialDiscount: false,
            },
          ],
          profiles: [
            {
              company: "F",
              code: "ARP",
              name: "AR profile",
              ...window,
              side: "AR",
              controlAccount: "1300",
              advanceAccount: "2300",
              cashAccount: "1000",
              discountAccount: "4000",
            },
            {
              company: "F",
              code: "APP",
              name: "AP profile",
              ...window,
              side: "AP",
              controlAccount: "2100",
              advanceAccount: "1400",
              cashAccount: "1000",
              discountAccount: "4000",
            },
          ],
          parties: [
            ["C1", "Fictional customer", "customer"],
            ["V1", "Fictional vendor", "vendor"],
          ].map(([code, name, role]) => ({
            company: "F",
            code,
            name,
            ...window,
            role,
            apProfile: role === "customer" ? null : "APP",
            arProfile: role === "vendor" ? null : "ARP",
            terms: "NET30",
          })),
        }
      : {}),
    accounts: accounts.map((account) => ({
      company: "F",
      account,
      declaration: items[account]?.length ? "detail" : "empty",
      ...(items[account]?.length
        ? {
            items: items[account].map((row, index) => {
              const side = ["1300", "2300"].includes(account) ? "AR" : "AP";
              const party = side === "AR" ? "C1" : "V1";
              return {
                side,
                party,
                partyName: party === "C1" ? "Fictional customer" : "Fictional vendor",
                externalNo: `OPEN-${account}-${index + 1}`,
                documentDate: "2026-01-10",
                dueDate: "2026-02-09",
                currency: "EUR",
                ...(typeof row === "number" ? { remainingMinor: row } : row),
              };
            }),
          }
        : {}),
    })),
    ...extra,
  };
  return { bytes: Buffer.from(JSON.stringify(file)) };
}

export function legacyFixture(
  t,
  { wal = false, history = false, many = false, tradeControls = true, tradeAdvances = false } = {},
) {
  const directory = resolve(`.legacy-fixture-${randomUUID()}`);
  fs.mkdirSync(directory);
  const teaching = join(directory, "source-teaching.sqlite");
  const enterprise = join(directory, "source-enterprise.sqlite");
  const connections = [];
  const readers = [];
  t.onTestFinished(() => {
    for (const reader of readers) reader.close();
    for (const connection of connections) connection.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const variant = history
    ? wal
      ? "history-wal"
      : "history"
    : wal
      ? "wal"
      : many
        ? "many"
        : "base";
  for (const [file, name] of [
    [teaching, variant],
    [enterprise, "enterprise"],
  ]) {
    const db = new DatabaseSync(file);
    connections.push(db);
    if (wal && file === teaching) {
      db.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0");
    }
    let sql = fs.readFileSync(new URL(`./legacy-data/${name}.sql`, import.meta.url), "utf8");
    if (name === "enterprise" && !tradeControls)
      sql = sql
        .split("\n")
        .filter(
          (line) =>
            !(
              /^INSERT INTO "(?:accounts|configs|config_versions)"/.test(line) &&
              /VALUES \('F',(?:'account',)?'(?:1300|2100)'/.test(line)
            ),
        )
        .join("\n");
    if (name === "enterprise" && tradeAdvances)
      for (const [code, data] of Object.entries(advanceAccounts)) {
        const json = JSON.stringify(data);
        sql += `\nINSERT INTO "accounts" ("company","code","category","purpose","data") VALUES ('F','${code}','${data.category}','control','${json}');`;
        for (const table of ["configs", "config_versions"])
          sql += `\nINSERT INTO "${table}" ("company","kind","code","revision","active","data") VALUES ('F','account','${code}',1,1,'${json}');`;
      }
    db.exec(sql);
  }
  if (wal) {
    connections[0].exec("BEGIN");
    connections[0].prepare("SELECT COUNT(*) FROM journals").get();
  }
  // Frozen old outputs are an independent oracle, not the new projection under test.
  const oracle = JSON.parse(
    fs.readFileSync(new URL(`./legacy-data/${variant}.json`, import.meta.url), "utf8"),
  );
  const book = {
    accounts: () => structuredClone(oracle.accounts),
    reports: (month) => structuredClone(oracle.reports[month]),
    ledger: (account, month) => structuredClone(oracle.ledgers[month][account]),
  };
  const before = captureDirectory(directory);
  const target = join(directory, "snapshot");
  fs.mkdirSync(target);
  const ledgers = {};
  for (const [kind, source, file] of [
    ["teaching", teaching, "teaching.sqlite"],
    ["enterprise", enterprise, "erp.sqlite"],
  ]) {
    const output = join(target, file);
    const db = new DatabaseSync(source, { readOnly: true });
    try {
      db.prepare("VACUUM main INTO ?").run(output);
    } finally {
      db.close();
    }
    const bytes = fs.readFileSync(output);
    assert.deepEqual([...bytes.subarray(18, 20)], [1, 1]);
    ledgers[kind] = {
      file,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      ...inspectLedger(output, kind),
    };
  }
  const manifest = { version: 1, status: "verified", crossDatabaseAtomic: false, ledgers };
  fs.writeFileSync(join(target, "manifest.json"), JSON.stringify(manifest));
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
    snapshot: join(target, "teaching.sqlite"),
    readers,
    month: history ? "2026-02" : "2026-01",
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
