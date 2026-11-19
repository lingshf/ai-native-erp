import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

// jsdom cannot evaluate media queries or layout, so this checks the shell stylesheet's rules;
// design/ui/screenshots/UI-01/capture.mjs measures the rendered boxes in real Chrome.
const css = readFileSync(resolve(import.meta.dirname, "../src/theme/shell.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//gu,
  "",
);

function mediaBlock(query: string) {
  const start = css.indexOf(`@media ${query} {`);
  expect(start, `missing @media ${query}`).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(start, i + 1);
  }
  throw new Error(`unterminated @media ${query}`);
}

function px(source: string, selector: string, property: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const rule = new RegExp(`(?:^|[}\\s])${escaped}\\s*\\{([^}]*)\\}`, "gu");
  const values = [...source.matchAll(rule)].flatMap((m) =>
    [...(m[1] ?? "").matchAll(new RegExp(`(?:^|[;\\s])${property}:\\s*(\\d+)px`, "gu"))].map((v) =>
      Number(v[1]),
    ),
  );
  return values.at(-1);
}

describe("app bar preference target sizes (design/ui §7)", () => {
  const base = css.slice(0, css.indexOf("@media"));
  const touch = mediaBlock("(max-width: 760px), (pointer: coarse)");

  test("desktop controls are at least 36px", () => {
    expect(px(base, ".appbar-prefs select", "height")).toBeGreaterThanOrEqual(36);
    expect(px(base, ".appbar-prefs .checkbox-label", "min-height")).toBeGreaterThanOrEqual(36);
  });

  test("narrow screens and coarse pointers get 44px targets for all three controls", () => {
    expect(px(touch, ".appbar-prefs select", "height")).toBeGreaterThanOrEqual(44);
    expect(px(touch, ".appbar-prefs .checkbox-label", "min-height")).toBeGreaterThanOrEqual(44);
    expect(px(touch, ".appbar-prefs .checkbox-label", "min-width")).toBeGreaterThanOrEqual(44);
  });

  test("the narrow layout does not shrink the targets again", () => {
    const narrow = mediaBlock("(max-width: 760px)");
    for (const [selector, property] of [
      [".appbar-prefs select", "height"],
      [".appbar-prefs .checkbox-label", "min-height"],
      [".appbar-prefs .checkbox-label", "min-width"],
    ] as const) {
      const value = px(narrow, selector, property);
      if (value !== undefined) expect(value).toBeGreaterThanOrEqual(44);
    }
  });
});
