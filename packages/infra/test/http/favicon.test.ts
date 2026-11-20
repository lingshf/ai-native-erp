import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { test } from "vitest";
import { createApi } from "@erp/infra/http";

const here = dirname(fileURLToPath(import.meta.url));
const web = resolve(here, "..", "..", "..", "web");

// Without a declared icon the browser requests /favicon.ico, which the server answers with 404.
test("index.html declares the public SVG favicon and the static server returns it", async (t) => {
  const html = await readFile(join(web, "index.html"), "utf8");
  const href = /<link\s+rel="icon"\s+href="(\/[^"]+)"\s+type="image\/svg\+xml"\s*\/?>/u.exec(
    html,
  )?.[1];
  assert.equal(href, "/favicon.svg");
  const icon = await readFile(join(web, "public", href));
  assert.ok(gzipSync(icon).length <= 1024, `gzip ${gzipSync(icon).length} B`);

  // Vite copies public/ to the root of dist; mirror that layout.
  const root = resolve(here, "..", `.test-artifacts-${randomUUID()}`);
  await mkdir(root, { recursive: true });
  t.onTestFinished(() => rm(root, { recursive: true, force: true }));
  await copyFile(join(web, "index.html"), join(root, "index.html"));
  await copyFile(join(web, "public", href), join(root, href));
  const api = await createApi({
    environment: { ERP_PORT: "0" },
    allowPortZero: true,
    webRoot: root,
  });
  t.onTestFinished(() => api.close());
  const response = await api.server.inject(href);
  assert.equal(response.statusCode, 200);
  assert.match(String(response.headers["content-type"]), /^image\/svg\+xml\b/u);
  assert.deepEqual(response.rawPayload, icon);
});
