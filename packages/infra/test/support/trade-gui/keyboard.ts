// Keyboard-only interaction helpers: Tab to a control, type, choose, activate, check.
import { type ExpectStatic, expect } from "vitest";
import type { Locator, Page } from "playwright";

// All user interaction uses real Tab/Shift+Tab and keyboard events, never focus(), fill(),
// selectOption() or click(). Inspecting the DOM only identifies the next keyboard stop.
export async function tabTo(page: Page, target: Locator) {
  await target.waitFor({ state: "visible" });
  let handle = await target.elementHandle();
  // Keep the direction across document wrap, where activeElement briefly leaves the tab stops.
  let direction: "Tab" | "Shift+Tab" | undefined;
  try {
    for (let count = 0; count < 220; count++) {
      if (!handle) throw new Error("Keyboard target disappeared");
      const key = await handle.evaluate((element, direction) => {
        if (!element.isConnected) return "detached";
        if (element === document.activeElement && document.hasFocus()) return null;
        if (direction) return direction;
        const stops = [
          ...document.querySelectorAll<HTMLElement>(
            "a[href], button, input, select, textarea, [tabindex]",
          ),
        ].filter(
          (stop) =>
            stop.tabIndex >= 0 &&
            !stop.matches(":disabled") &&
            !stop.closest("[inert]") &&
            stop.getClientRects().length > 0 &&
            getComputedStyle(stop).visibility !== "hidden",
        );
        const current = stops.indexOf(document.activeElement as HTMLElement);
        const destination = stops.indexOf(element as HTMLElement);
        if (current < 0 || !document.hasFocus()) return "probe";
        if (destination < 0) return "Tab";
        const forward = (destination - current + stops.length) % stops.length;
        const backward = (current - destination + stops.length) % stops.length;
        return backward < forward ? "Shift+Tab" : "Tab";
      }, direction);
      if (key === null) return;
      if (key === "detached") {
        await handle.dispose();
        handle = await target.elementHandle();
      } else if (key === "probe") {
        // Establish a real tab stop before committing to a traversal direction.
        await page.keyboard.press("Tab");
      } else {
        direction ??= key;
        await page.keyboard.press(direction);
      }
    }
    throw new Error(
      `Not keyboard reachable: ${await target.evaluate((element) => element.outerHTML)}`,
    );
  } finally {
    await handle?.dispose();
  }
}
export async function type(page: Page, target: Locator, text: string) {
  await tabTo(page, target);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText(text);
  await page.keyboard.press("Tab");
}
// Concurrent tests pass their own `expect`: expect.poll needs the current test.
// `observe` only records each polled value list (diagnostics); it never changes the result.
export async function choose(
  page: Page,
  target: Locator,
  value: string,
  check: ExpectStatic = expect,
  observe?: (values: string[]) => Promise<void>,
) {
  const read = () =>
    target
      .locator("option")
      .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
  await check
    .poll(
      observe
        ? async () => {
            const values = await read();
            await observe(values);
            return values;
          }
        : read,
      { message: `Missing keyboard-selectable option: ${value}`, timeout: 10_000 },
    )
    .toContain(value);
  const index = await target
    .locator("option")
    .evaluateAll(
      (options, value) =>
        options.findIndex((option) => (option as HTMLOptionElement).value === value),
      value,
    );
  check(index).toBeGreaterThanOrEqual(0);
  await tabTo(page, target);
  await page.keyboard.press("Home");
  for (let i = 0; i < index; i++) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Tab");
}
export async function activate(page: Page, target: Locator) {
  await tabTo(page, target);
  await page.keyboard.press("Enter");
}
export async function checked(page: Page, target: Locator) {
  await tabTo(page, target);
  if (!(await target.isChecked())) await page.keyboard.press("Space");
}
