// Build graph and bytes (D432): manifest loading, hash masking, static closures and asset sizes.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

export const GZIP_LEVEL = 9;
const MANIFEST_PATH = join(".vite", "manifest.json");
// Vite / Rolldown content hashes: 8 characters of [A-Za-z0-9_-] before .js / .css (same as #288).
const HASHED_NAME = /([A-Za-z0-9_.-]+?)-[A-Za-z0-9_-]{8}\.(js|css)/g;
const ENTRY_SCRIPT = /<script\b[^>]*?\bsrc="(?:\.?\/)?(assets\/[^"]+\.js)"/g;
const MODULE_PRELOAD =
  /<link\b(?=[^>]*\brel="modulepreload")[^>]*?\bhref="(?:\.?\/)?(assets\/[^"]+\.js)"/g;

// D432: asset hashes are masked before compressing, so a renamed but otherwise equal asset compares equal.
export const maskHashes = (text) => text.replace(HASHED_NAME, "$1-HASH.$2");
export const unhashedName = (name) => name.replace(HASHED_NAME, "$1.$2");
export const sha256 = (data) => createHash("sha256").update(data).digest("hex");
export const sorted = (items) => [...items].sort();
const sum = (values) => values.reduce((total, value) => total + value, 0);

// D432: raw bytes and gzip-9 of the hash-masked content; the SHA-256 is of the raw file.
export function assetBytes(content) {
  return {
    raw: content.length,
    gzip: gzipSync(maskHashes(content.toString("utf8")), { level: GZIP_LEVEL }).length,
    sha256: sha256(content),
  };
}

export function loadBuild(dir) {
  const manifest = JSON.parse(readFileSync(join(dir, MANIFEST_PATH), "utf8"));
  const chunks = new Map();
  for (const [key, entry] of Object.entries(manifest)) {
    chunks.set(unhashedName(key), {
      file: entry.file,
      imports: (entry.imports ?? []).map(unhashedName),
      css: entry.css ?? [],
      isDynamicEntry: entry.isDynamicEntry === true,
    });
  }
  return { dir, chunks, html: readFileSync(join(dir, "index.html"), "utf8"), bytes: new Map() };
}
export const fileBytes = (build, file) =>
  build.bytes.get(file) ??
  build.bytes.set(file, assetBytes(readFileSync(join(build.dir, file)))).get(file);
function keyOfFile(build, file) {
  for (const [key, chunk] of build.chunks) if (chunk.file === file) return key;
  throw new Error(`${build.dir}: index.html refers to ${file}, which is not in the manifest`);
}

export function staticClosure(build, roots, seen = new Set()) {
  for (const key of roots) {
    if (seen.has(key)) continue;
    if (!build.chunks.has(key)) throw new Error(`${build.dir}: unknown chunk ${key}`);
    seen.add(key);
    staticClosure(build, build.chunks.get(key).imports, seen);
  }
  return seen;
}

// D432 / D454: the first screen is index.html's entry script and modulepreloads plus their static
// imports; a prefetch (or any other <link>) is not.
export function firstScreenClosure(build) {
  const tags = [ENTRY_SCRIPT, MODULE_PRELOAD].flatMap((tag) => [...build.html.matchAll(tag)]);
  return staticClosure(
    build,
    tags.map((tag) => keyOfFile(build, tag[1])),
  );
}

// D432: a lazy route adds the static closure of its dynamic entry minus the first screen.
export function routeAddedKeys(build, route, firstScreen) {
  return sorted([...staticClosure(build, [route])].filter((key) => !firstScreen.has(key)));
}

export const jsBytes = (build, key) => fileBytes(build, build.chunks.get(key).file);
export const NO_BYTES = Object.freeze({ raw: 0, gzip: 0 });
export function bytesOf(build, keys) {
  const each = [...keys].map((key) => jsBytes(build, key));
  return { raw: sum(each.map((bytes) => bytes.raw)), gzip: sum(each.map((bytes) => bytes.gzip)) };
}

// D432: route-added JS sums routeAddedKeys (raw and masked gzip-9); a shared chunk counts for every route.
export function routeAddedBytes(build, route, firstScreen) {
  return bytesOf(build, routeAddedKeys(build, route, firstScreen));
}

// D432: the CSS a route loads is the CSS of its whole static closure, first screen included.
export function routeCss(build, route) {
  const files = [...staticClosure(build, [route])].flatMap((key) => build.chunks.get(key).css);
  const withBytes = (file) => ({ key: unhashedName(file), ...fileBytes(build, file) });
  return sorted(new Set(files)).map(withBytes);
}

export const routeKeys = (build) =>
  [...build.chunks].filter(([, c]) => c.isDynamicEntry).map(([k]) => k);
