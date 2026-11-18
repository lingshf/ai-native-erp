import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import * as boundaries from "../scripts/check-boundaries.mjs";

const { checkImportBoundaries } = boundaries;
const required = [
  "packages/core/src/domain",
  "packages/core/src/application",
  "packages/core/src/contracts",
  "packages/infra/src",
  "packages/web/src",
];
function repositoryFixture(t) {
  const root = mkdtempSync(join(tmpdir(), "erp-boundary-regression-"));
  t.after(() => rmSync(root, { recursive: true }));
  for (const project of required) {
    mkdirSync(join(root, project), { recursive: true });
    writeFileSync(join(root, project, "index.ts"), "export const present = true;");
  }
  return root;
}

test("pure domain rejects infrastructure and ambient browser access including type-only imports", () => {
  for (const source of [
    "import type { Pool } from 'pg';",
    "export { db } from '../../../infra/src/index.ts';",
    "import { x } from '@erp/core/application';",
    "const w = window;",
    "const f = await import('node:fs');",
  ]) {
    assert.ok(checkImportBoundaries("packages/core/src/domain/money.ts", source).length);
  }
  assert.deepEqual(
    checkImportBoundaries(
      "packages/core/src/domain/money.ts",
      "export const add = (a: bigint, b: bigint) => a + b;",
    ),
    [],
  );
});

test("application and web reject concrete or relative backdoors but allow their declared edges", () => {
  assert.ok(
    checkImportBoundaries(
      "packages/core/src/application/post.ts",
      "import { x } from '@erp/infra';",
    ).length,
  );
  for (const source of [
    "import { x } from '../../core/src/application/index.ts';",
    "import type { Post } from '@erp/core/domain';",
    "import { readFile } from 'node:fs';",
    "import Database from 'better-sqlite3';",
  ])
    assert.ok(checkImportBoundaries("packages/web/src/app.tsx", source).length);
  assert.deepEqual(
    checkImportBoundaries(
      "packages/web/src/app.tsx",
      "import React from 'react'; import { healthSchema } from '@erp/core/contracts'; import { labels } from './ui/index.ts';",
    ),
    [],
  );
});

test("computed dynamic imports and require cannot evade pure-layer checks", () => {
  for (const source of [
    "const x = require('pg');",
    "const x = import('p' + 'g');",
    "type Db = import('pg').Pool;",
    "import type { Db } from '@erp/infra';",
  ]) {
    assert.ok(checkImportBoundaries("packages/core/src/domain/value.ts", source).length);
  }
  assert.deepEqual(
    checkImportBoundaries(
      "packages/core/src/application/info.ts",
      "import type { Money } from '@erp/core/domain'; export interface RuntimeInfo { profile: 'local' }",
    ),
    [],
  );
});

test("boundary parsing supports actual erasable TypeScript and JSX workspace syntax", () => {
  assert.deepEqual(
    checkImportBoundaries(
      "packages/infra/src/http/health.ts",
      "import type { FastifyInstance } from 'fastify'; export function health(server: FastifyInstance) { return server; }",
    ),
    [],
  );
  assert.deepEqual(
    checkImportBoundaries(
      "packages/web/src/app.tsx",
      "import React from 'react'; export const App = () => <main aria-label=\"runtime\" />;",
    ),
    [],
  );
});

test("all supported TypeScript and JavaScript source extensions are scanned", (t) => {
  const root = repositoryFixture(t);
  const extensions = ["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"];
  for (const extension of extensions) {
    writeFileSync(
      join(root, "packages", "core", "src", "application", `violation.${extension}`),
      "import { x } from '@erp/infra';",
    );
  }
  writeFileSync(
    join(root, "packages", "core", "src", "unlayered.ts"),
    "import { x } from '@erp/infra';",
  );
  const result = boundaries.checkRepositoryBoundaries(root);
  assert.equal(result.violations.length, extensions.length + 1);
  assert.equal(result.files.length, required.length + extensions.length + 1);
});

test("missing and empty required source projects cannot pass vacuously", (t) => {
  const root = repositoryFixture(t);
  rmSync(join(root, "packages", "core", "src", "application", "index.ts"));
  assert.throws(
    () => boundaries.checkRepositoryBoundaries(root),
    /Empty required source directory/,
  );
  rmSync(join(root, "packages", "core", "src", "application"), { recursive: true });
  assert.throws(
    () => boundaries.checkRepositoryBoundaries(root),
    /Missing required source directory/,
  );
});

test("CLI resolves its own repository regardless of the invoking working directory", () => {
  const checker = fileURLToPath(new URL("../scripts/check-boundaries.mjs", import.meta.url));
  const cwd = fileURLToPath(new URL("../packages/", import.meta.url));
  const result = spawnSync(process.execPath, [checker], { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /passed for [1-9]\d* source files/);
});

test("Local Vite serves same-origin assets without reflecting cross-origin CORS headers", async (t) => {
  const web = new URL("../packages/web/", import.meta.url);
  const require = createRequire(new URL("package.json", web));
  const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
  const server = await createServer({
    root: fileURLToPath(web),
    configFile: fileURLToPath(new URL("vite.config.ts", web)),
    logLevel: "silent",
    server: { host: "127.0.0.1", port: 0, strictPort: true },
  });
  t.after(() => server.close());
  await server.listen();
  const address = server.httpServer.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  for (const source of [origin, "http://127.0.0.1:5188", "https://example.invalid"]) {
    const response = await fetch(origin, { headers: { Origin: source, Connection: "close" } });
    await response.arrayBuffer();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.equal(response.headers.get("access-control-allow-credentials"), null);
  }
});
