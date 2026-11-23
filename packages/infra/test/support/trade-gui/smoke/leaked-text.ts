import type { Page } from "playwright";
import { resources } from "../../../../../web/src/ui/index.ts";

export type LeakedTextInput = {
  // Labels only the other language uses.
  foreign: string[];
  language: "zh" | "en";
  // User data shown on the page, which may legitimately be in either language.
  data: string[];
};

// Visible text and text attributes on the page that are hard-coded or leaked from the other
// language. The `page.evaluate` callback runs in the browser, so it may use only its argument.
export function collectLeakedText(page: Page, { foreign, language, data }: LeakedTextInput) {
  // biome-ignore format: keeps the callback and its argument line-for-line as moved (REFAC-08 T3).
  return page.evaluate(
    ({ foreign, english, own, latin }) => {
      const texts: string[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const parent = node.parentElement;
        if (!parent || parent.closest("script, style, [hidden]")) continue;
        if (!parent.closest("option") && parent.getClientRects().length === 0) continue;
        texts.push(node.textContent ?? "");
      }
      for (const element of document.body.querySelectorAll(
        "[placeholder], [aria-label], [title], [alt]",
      ))
        for (const name of ["placeholder", "aria-label", "title", "alt"])
          texts.push(element.getAttribute(name) ?? "");
      return [
        ...new Set(
          texts
            .map((text) => text.trim())
            .filter(
              (text) =>
                text &&
                !own.includes(text) &&
                ((english && /\p{Script=Han}/u.test(text)) ||
                  (!english &&
                    (text.match(/[A-Za-z]{3,}/gu) ?? []).some(
                      (word) => word !== word.toUpperCase() && !latin.includes(word),
                    )) ||
                  foreign.some(
                    (value) =>
                      text === value || (value.length >= 12 && text.includes(value)),
                  )),
            ),
        ),
      ];
    },
    {
      foreign,
      english: language === "en",
      own: [...Object.values(resources[language]), ...data],
      // Latin words the zh dictionary or user data itself uses; all-caps words are codes.
      latin: [
        ...new Set(
          [...Object.values(resources[language]), ...data]
            .join(" ")
            .match(/[A-Za-z]{3,}/gu) ?? [],
        ),
      ],
    },
  );
}
