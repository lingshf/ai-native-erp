import type { Language } from "./labels.ts";

export type Theme = "red" | "green";
export interface Preferences {
  readonly language: Language;
  readonly theme: Theme;
  readonly teaching: boolean;
}
export type PreferenceIssue = "storageRead" | "storageCorrupt" | "storageWrite";
export interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export const preferenceStorageKey = "erp.workspace.preferences.v1";
export const defaultPreferences: Preferences = Object.freeze({
  language: "zh",
  theme: "red",
  teaching: false,
});

export function decodePreferences(value: unknown): Preferences | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== 3 ||
    !Object.hasOwn(record, "language") ||
    !Object.hasOwn(record, "theme") ||
    !Object.hasOwn(record, "teaching") ||
    (record.language !== "zh" && record.language !== "en") ||
    (record.theme !== "red" && record.theme !== "green") ||
    typeof record.teaching !== "boolean"
  )
    return undefined;
  return { language: record.language, theme: record.theme, teaching: record.teaching };
}

export function loadPreferences(getStorage: () => PreferenceStorage): {
  preferences: Preferences;
  issues: PreferenceIssue[];
} {
  let serialized: string | null;
  try {
    serialized = getStorage().getItem(preferenceStorageKey);
  } catch {
    return { preferences: defaultPreferences, issues: ["storageRead"] };
  }
  if (serialized === null) return { preferences: defaultPreferences, issues: [] };
  try {
    const preferences = decodePreferences(JSON.parse(serialized));
    if (preferences) return { preferences, issues: [] };
  } catch {
    // Parsing errors and invalid shapes share the same visible recovery notice.
  }
  return { preferences: defaultPreferences, issues: ["storageCorrupt"] };
}

export function persistPreferences(
  getStorage: () => PreferenceStorage,
  preferences: Preferences,
): PreferenceIssue | undefined {
  try {
    getStorage().setItem(preferenceStorageKey, JSON.stringify(preferences));
    return undefined;
  } catch {
    return "storageWrite";
  }
}
