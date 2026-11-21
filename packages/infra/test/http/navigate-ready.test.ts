// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest";
import { label } from "../../../web/src/ui/index.ts";
import { navigateTitle, targetPageShown } from "../support/navigate-ready.ts";

afterEach(() => {
  document.body.replaceChildren();
  location.hash = "";
});

// Resolves when `ready()` holds, re-checking after every DOM change, like a polling wait.
function until(ready: () => boolean) {
  let met = false;
  const done = new Promise<void>((resolve) => {
    const check = () => {
      if (!met && ready()) {
        met = true;
        observer.disconnect();
        resolve();
      }
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    check();
  });
  return { done, met: () => met };
}

test("navigate() readiness waits past a stale title until the target page title renders", async () => {
  const main = document.createElement("main");
  const stale = document.createElement("h2");
  stale.textContent = label("en", "shell.overview");
  main.append(stale);
  document.body.append(main);
  // The state FLAKE-02 diagnostics recorded: hash already on the target, old title still shown.
  location.hash = "#/period-close";
  const title = navigateTitle("en", "period-close");

  const before = until(() => document.querySelector("main h2") !== null);
  const after = until(() => targetPageShown(title));
  await before.done;
  await Promise.resolve();
  expect(before.met()).toBe(true);
  expect(after.met()).toBe(false);

  // Suspense fallback replaces the old page, still without the target title.
  const fallback = document.createElement("p");
  fallback.setAttribute("role", "status");
  main.replaceChildren(fallback);
  await Promise.resolve();
  expect(after.met()).toBe(false);

  const heading = document.createElement("h2");
  heading.textContent = title;
  main.replaceChildren(heading);
  await after.done;
  expect(after.met()).toBe(true);
});
