import { describe, expect, it } from "vitest";
import { en, zh, label, loadPreferences, persistPreferences, defaultPreferences } from "@erp/ui";

function placeholders(value: string) {
  return [...value.matchAll(/\{([^{}]+)\}/g)].map(match => match[1]).sort();
}

describe("independent UI resources", () => {
  it("has exactly matching nonempty language keys and interpolation placeholders", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      expect(en[key].trim().length).toBeGreaterThan(0);
      expect(zh[key].trim().length).toBeGreaterThan(0);
      expect(placeholders(en[key])).toEqual(placeholders(zh[key]));
    }
  });

  it("interpolates translated labels without evaluating replacement syntax", () => {
    expect(label("en", "shell.httpError", { status: 503 })).toContain("HTTP 503");
    expect(label("zh", "shell.httpError", { status: 500 })).toContain("HTTP 500");
    expect(label("en", "shell.httpError", { status: "$&" })).toContain("HTTP $&");
  });

  it("does not mutate or silently persist default recovery on reads", () => {
    let writes = 0;
    const storage = {
      getItem: () => "{broken",
      setItem: () => { writes++; }
    };
    expect(loadPreferences(() => storage)).toEqual({
      preferences: defaultPreferences, issues: ["storageCorrupt"]
    });
    expect(writes).toBe(0);
    expect(Object.isFrozen(defaultPreferences)).toBe(true);
    expect(persistPreferences(() => storage, { language: "en", theme: "green", teaching: true })).toBeUndefined();
    expect(writes).toBe(1);
  });
});
