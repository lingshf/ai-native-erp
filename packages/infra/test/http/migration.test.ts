import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "vitest";
import { createApi } from "../../src/http/index.ts";
import { MigrationReader } from "../../src/workers/migration-reader.ts";
import { LegacyImportSnapshot, type ImportChoices } from "../../src/legacy/import-plan.ts";
import { executeLegacyImport } from "../../src/storage/legacy-import.ts";
import { legacyFixture } from "../support/legacy-fixture.mjs";

test("stored reports are readable before confirmation; HTTP exposes no write action", async (t) => {
  const f = legacyFixture(t);
  const snapshot = new LegacyImportSnapshot(f.target, f.manifest);
  f.readers.push(snapshot);
  const target = join(f.directory, "target.sqlite");
  const choices: ImportChoices = {
    drafts: "import-as-draft",
    receipts: "archive-only",
    "source-events": "archive-only",
    "transfer-queue": "archive-only",
    seals: "archive-only",
    audit: "archive-only",
  };
  await executeLegacyImport(snapshot, { target, choices });
  const migration = new MigrationReader(target);
  const api = await createApi({
    environment: { ERP_PORT: "0" },
    allowPortZero: true,
    migration,
    logError: () => {},
  });
  try {
    const address = await api.listen(),
      host = new URL(address).host;
    const get = await api.app.inject({
      method: "GET",
      url: "/api/v1/migration",
      headers: { host },
    });
    assert.equal(get.statusCode, 200);
    assert.equal(get.headers["cache-control"], "no-store");
    assert.equal(get.json().run.status, "imported");
    assert.equal(get.json().run.report.verdict, "blocked");
    for (const method of ["POST", "PUT", "DELETE"] as const) {
      const response = await api.app.inject({
        method,
        url: "/api/v1/migration",
        headers: { host },
      });
      assert.equal(response.statusCode, 405);
      assert.equal(response.headers.allow, "GET");
    }
    assert.equal(
      (await api.app.inject({ url: "/api/v1/migration?target=arbitrary", headers: { host } }))
        .statusCode,
      400,
    );
    assert.equal(
      (
        await api.app.inject({
          url: "/api/v1/migration",
          headers: { host, origin: "https://foreign.invalid" },
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (await api.app.inject({ url: "/api/v1/companies", headers: { host } })).statusCode,
      503,
    );
  } finally {
    await api.close();
    await migration.close();
  }
});
