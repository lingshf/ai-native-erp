import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as application from "@erp/core/application";
import * as applicationStorage from "@erp/core/application/storage";
import * as contracts from "@erp/core/contracts";
import * as contractsMasterData from "@erp/core/contracts/master-data";
import * as contractsMigration from "@erp/core/contracts/migration";

const subpaths = {
  "./application/storage": "./src/application/storage.ts",
  "./contracts/master-data": "./src/contracts/master-data.ts",
  "./contracts/migration": "./src/contracts/migration.ts",
};

test("narrow subpaths resolve to the same modules the barrels re-export", () => {
  assert.equal(applicationStorage.StorageError, application.StorageError);
  assert.equal(contractsMigration.migrationReportSchema, contracts.migrationReportSchema);
  assert.equal(contractsMigration.migrationStatusSchema, contracts.migrationStatusSchema);
  assert.equal(contractsMasterData.accountFieldsSchema, contracts.accountFieldsSchema);
});

test("only the three exact subpaths are added and their targets do not reach a barrel", () => {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest.exports, {
    "./domain": "./src/domain/index.ts",
    "./application": "./src/application/index.ts",
    "./contracts": "./src/contracts/index.ts",
    ...subpaths,
  });
  for (const [subpath, target] of Object.entries(subpaths)) {
    const source = readFileSync(new URL(`../${target}`, import.meta.url), "utf8");
    const specifiers = [
      ...source.matchAll(/\bfrom\s+["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']/g),
    ].map((match) => match[1] ?? match[2]);
    assert.deepEqual(
      specifiers.filter((specifier) => specifier !== "zod"),
      [],
      `${subpath} must not import beyond zod`,
    );
    if (subpath.startsWith("./application/")) assert.deepEqual(specifiers, []);
  }
});
