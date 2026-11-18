import assert from "node:assert/strict";
import { test } from "vitest";
import legacyZh from "../../../public/labels/zh.js";
import legacyEn from "../../../public/labels/en.js";
import { resources, type Language } from "../src/ui/index.ts";

const dictionaries: readonly [Language, Readonly<Record<string, string>>][] = [
  ["zh", legacyZh],
  ["en", legacyEn],
];
for (const [language, legacy] of dictionaries) {
  test(`shared ${language} label keys retain their legacy values`, () => {
    const current: Readonly<Record<string, string>> = resources[language];
    const shared = Object.keys(current).filter((key) => Object.hasOwn(legacy, key));
    const differences = shared.filter((key) => current[key] !== legacy[key]);
    assert.deepEqual(
      differences,
      [],
      `Changed legacy ${language} label keys: ${differences.join(", ")}`,
    );
    for (const key of shared) assert.equal(current[key], legacy[key], `${language}: ${key}`);
  });
}
