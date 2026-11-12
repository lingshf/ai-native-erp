import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import * as boundaries from '../scripts/check-boundaries.mjs';

const { checkImportBoundaries } = boundaries;
const required = ['packages/application', 'packages/infrastructure', 'packages/contracts', 'packages/ui', 'apps/api', 'apps/web'];
function repositoryFixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'erp-boundary-regression-'));
  t.after(() => rmSync(root, { recursive: true }));
  for (const project of required) {
    mkdirSync(join(root, project, 'src'), { recursive: true });
    writeFileSync(join(root, project, 'src', 'index.ts'), 'export const present = true;');
  }
  return root;
}

test('pure domain rejects infrastructure and ambient browser access including type-only imports', () => {
  for (const source of ["import type { Pool } from 'pg';", "export { db } from '../../infrastructure/src/db.js';",
    "const w = window;", "const f = await import('node:fs');"]) {
    assert.ok(checkImportBoundaries('packages/domain/src/money.ts', source).length);
  }
  assert.deepEqual(checkImportBoundaries('packages/domain/src/money.ts', 'export const add = (a: bigint, b: bigint) => a + b;'), []);
});

test('application and web reject concrete or relative backdoors but allow their declared edges', () => {
  assert.ok(checkImportBoundaries('packages/application/src/post.ts', "import { x } from '@erp/infrastructure';").length);
  assert.ok(checkImportBoundaries('apps/web/src/app.tsx', "import { x } from '../../../packages/application/src/post.js';").length);
  assert.ok(checkImportBoundaries('apps/web/src/app.tsx', "import type { Post } from '@erp/domain';").length);
  assert.deepEqual(checkImportBoundaries('apps/web/src/app.tsx',
    "import React from 'react'; import { healthSchema } from '@erp/contracts'; import { labels } from '@erp/ui';"), []);
});

test('computed dynamic imports and require cannot evade pure-layer checks', () => {
  for (const source of ["const x = require('pg');", "const x = import('p' + 'g');",
    "type Db = import('pg').Pool;", "import type { Db } from '@erp/infrastructure';"]) {
    assert.ok(checkImportBoundaries('packages/domain/src/value.ts', source).length);
  }
  assert.deepEqual(checkImportBoundaries('packages/application/src/info.ts',
    "import type { Money } from '@erp/domain'; export interface RuntimeInfo { profile: 'local' }"), []);
});

test('boundary parsing supports the actual legacy-decorator and JSX workspace syntax', () => {
  assert.deepEqual(checkImportBoundaries('apps/api/src/controller.ts',
    "import { Controller, Get } from '@nestjs/common'; @Controller() export class Health { @Get() get() { return 'local'; } }"), []);
  assert.deepEqual(checkImportBoundaries('apps/web/src/app.tsx',
    "import React from 'react'; export const App = () => <main aria-label=\"runtime\" />;"), []);
});

test('all supported TypeScript and JavaScript source extensions are scanned', t => {
  const root = repositoryFixture(t);
  const extensions = ['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs'];
  for (const extension of extensions) {
    writeFileSync(join(root, 'packages', 'application', 'src', `violation.${extension}`),
      "import { x } from '@erp/infrastructure';");
  }
  const result = boundaries.checkRepositoryBoundaries(root);
  assert.equal(result.violations.length, extensions.length);
  assert.equal(result.files.length, required.length + extensions.length);
});

test('missing and empty required source projects cannot pass vacuously', t => {
  const root = repositoryFixture(t);
  rmSync(join(root, 'packages', 'application', 'src', 'index.ts'));
  assert.throws(() => boundaries.checkRepositoryBoundaries(root), /Empty required source directory/);
  rmSync(join(root, 'packages', 'application', 'src'), { recursive: true });
  assert.throws(() => boundaries.checkRepositoryBoundaries(root), /Missing required source directory/);
});

test('CLI resolves its own repository regardless of the invoking working directory', () => {
  const checker = fileURLToPath(new URL('../scripts/check-boundaries.mjs', import.meta.url));
  const cwd = fileURLToPath(new URL('../apps/', import.meta.url));
  const result = spawnSync(process.execPath, [checker], { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /passed for [1-9]\d* source files/);
});
