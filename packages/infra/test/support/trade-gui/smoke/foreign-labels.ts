import { resources } from "../../../../../web/src/ui/index.ts";

// Text the other language would show but this one must not: label values (and the literal
// parts of templates) that differ between the two dictionaries.
export function foreignLabels(language: "zh" | "en") {
  const own = resources[language] as Record<string, string>;
  const other = resources[language === "zh" ? "en" : "zh"] as Record<string, string>;
  const ownValues = new Set(Object.values(own));
  const foreign = new Set<string>();
  for (const [key, value] of Object.entries(other)) {
    if (value === own[key]) continue;
    for (const part of value.split(/\{[^{}]+\}/u)) {
      const text = part.trim();
      if (/\p{L}{2}/u.test(text) && !ownValues.has(text)) foreign.add(text);
    }
  }
  return [...foreign];
}
