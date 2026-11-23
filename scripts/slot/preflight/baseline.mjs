// Baseline of known findings (S12 SLOT-02, D407 / D408): counts per key that may only go down.
// A key outside the baseline, or a count above it, is a new finding (exit 6). A key whose count went
// down is only reported; a later PR removes it. Raising or adding an entry needs a design decision.
import { PreflightConfigError } from "./errors.mjs";

const SECTIONS = ["tsc", "tdz"];

/** Parses { "tsc": { key: count }, "tdz": { key: count } } (other top-level fields are notes). */
export function parseBaseline(text, path) {
  let baseline;
  try {
    baseline = JSON.parse(text);
  } catch (error) {
    throw new PreflightConfigError(`baseline is not valid JSON: ${path}: ${error.message}`);
  }
  for (const section of SECTIONS) {
    const counts = baseline?.[section];
    if (!counts || typeof counts !== "object" || Array.isArray(counts)) {
      throw new PreflightConfigError(`baseline has no "${section}" object: ${path}`);
    }
    for (const [key, count] of Object.entries(counts)) {
      if (!Number.isInteger(count) || count < 1) {
        throw new PreflightConfigError(`baseline ${section} count must be a positive integer: ${key}`);
      }
    }
  }
  return baseline;
}

export function countByKey(items, keyOf) {
  const counts = new Map();
  for (const item of items) counts.set(keyOf(item), (counts.get(keyOf(item)) ?? 0) + 1);
  return counts;
}

/** Returns every key seen or allowed, with status "new" (blocks), "reduced" (logged) or "ok". */
export function compareWithBaseline(counts, allowedCounts) {
  const keys = new Set([...counts.keys(), ...Object.keys(allowedCounts)]);
  return [...keys].sort().map((key) => {
    const count = counts.get(key) ?? 0;
    const allowed = allowedCounts[key] ?? 0;
    const status = count > allowed ? "new" : count < allowed ? "reduced" : "ok";
    return { key, count, allowed, status };
  });
}
