export { en, zh, resources, label } from "./labels.ts";
export type { LabelKey, LabelResources, Language } from "./labels.ts";
export {
  defaultPreferences, decodePreferences, loadPreferences,
  persistPreferences, preferenceStorageKey
} from "./preferences.ts";
export type { Preferences, PreferenceIssue, PreferenceStorage, Theme } from "./preferences.ts";
