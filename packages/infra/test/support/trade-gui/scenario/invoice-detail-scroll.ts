// Review D356 / D360 / D363: at 390 the detail dialog's line table is a Tab stop, and ArrowRight
// scrolls it to the last column while focus stays in the dialog.
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import type { Locator, Page } from "playwright";
import { expect } from "vitest";
import { artifacts } from "../paths.ts";
import type { ScenarioContext } from "./context.ts";

/** Tabs to the lines' scroll region; focus never leaves the dialog on the way. */
export async function tabToRegion(page: Page, dialog: Locator, region: Locator) {
  const onRegion = () => region.evaluate((element) => element === document.activeElement);
  for (let count = 0; count < 8 && !(await onRegion()); count++) {
    await page.keyboard.press("Tab");
    // biome-ignore format: keeps the original line breaks of this assertion (REFAC-01b L2a)
    expect(
      await dialog.evaluate((element) => element.contains(document.activeElement)),
    ).toBe(true);
  }
  expect(await onRegion()).toBe(true);
}

// D360/D363: each ArrowRight may start a smooth-scroll animation (headless Chromium on
// CI), and rapid presses cancel each other. After every press settle() waits until
// scrollLeft is unchanged for 3 animation frames ("stable") or a wall-clock cap runs out
// while it is still moving / rAF never fires ("timeout", fails at once). Stop pressing at
// the end or when a stable press made no progress; the final poll decides. The whole
// phase has a 10 s budget: worst case ≈ 10 s, since the deadline is checked before every
// press and every settle cap / the poll timeout is clipped to the remaining budget.
/** Presses ArrowRight until the region is scrolled to its end; returns the number of presses. */
export async function scrollToEnd(page: Page, region: Locator) {
  const budget = 10_000;
  const deadline = Date.now() + budget;
  const remaining = () => deadline - Date.now();
  const geometry = () =>
    region.evaluate((element) => ({
      scrollLeft: element.scrollLeft,
      max: element.scrollWidth - element.clientWidth,
    }));
  const settle = (cap: number) => settled(region, cap);
  let presses = 0;
  const fail = async (reason: string) => {
    expect.unreachable(
      `390 keyboard scroll ${reason}: ${JSON.stringify({ ...(await geometry()), presses, budget })}`,
    );
  };
  if ((await settle(remaining())) === "timeout")
    await fail("did not settle before the first ArrowRight");
  let { scrollLeft: position, max } = await geometry();
  const pressLimit = Math.ceil(max / 40) + 5;
  while (position < max - 1 && presses < pressLimit) {
    if (remaining() <= 0) await fail("exceeded the 10 s budget");
    await page.keyboard.press("ArrowRight");
    presses++;
    if ((await settle(remaining())) === "timeout") await fail("still moving after the settle cap");
    const next = await geometry();
    if (next.scrollLeft === position) break;
    position = next.scrollLeft;
    max = next.max;
  }
  if (remaining() <= 0) await fail("exceeded the 10 s budget");
  await expect
    .poll(
      () =>
        region.evaluate(
          (element) => element.scrollWidth - element.clientWidth - element.scrollLeft,
        ),
      { timeout: remaining() },
    )
    .toBeLessThanOrEqual(1);
  return presses;
}

/** "stable" once scrollLeft is unchanged for 3 animation frames, "timeout" after `cap` ms (≤ 1 s). */
function settled(region: Locator, cap: number) {
  return region.evaluate(
    (element, limit) =>
      new Promise<"stable" | "timeout">((resolve) => {
        let last = element.scrollLeft;
        let same = 0;
        let done = false;
        const finish = (result: "stable" | "timeout") => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(result);
        };
        const timer = setTimeout(() => finish("timeout"), limit);
        const tick = () => {
          if (done) return;
          const now = element.scrollLeft;
          same = now === last ? same + 1 : 0;
          last = now;
          if (same >= 3) finish("stable");
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    Math.max(0, Math.min(1000, cap)),
  );
}

/** The last column lies inside the scrolled region, which keeps the focus inside the dialog. */
export async function checkScrolledToEnd(
  { page, name }: ScenarioContext,
  region: Locator,
  presses: number,
) {
  const scrolled = await region.evaluate((element) => {
    const wrap = element.getBoundingClientRect();
    const last = (
      element.querySelector("thead th:last-child") as HTMLElement
    ).getBoundingClientRect();
    return {
      scrollLeft: element.scrollLeft,
      max: element.scrollWidth - element.clientWidth,
      wrap: [wrap.left, wrap.right],
      lastColumn: [last.left, last.right],
      focused: element === document.activeElement,
      inDialog: (element.closest("dialog") as HTMLElement).contains(document.activeElement),
    };
  });
  console.log(`[tinv06] ${name} 390 keyboard scroll ${JSON.stringify({ ...scrolled, presses })}`);
  appendFileSync(
    join(artifacts, `${name}-invoice-detail-geometry.json`),
    `${JSON.stringify({ width: 390, keyboardScroll: { ...scrolled, presses } })}\n`,
  );
  expect(scrolled.max).toBeGreaterThan(0);
  expect(scrolled.scrollLeft).toBeGreaterThanOrEqual(scrolled.max - 1);
  expect(scrolled.lastColumn[0]).toBeGreaterThanOrEqual(scrolled.wrap[0] - 1);
  expect(scrolled.lastColumn[1]).toBeLessThanOrEqual(scrolled.wrap[1] + 1);
  expect(scrolled.focused).toBe(true);
  expect(scrolled.inDialog).toBe(true);
  await page.screenshot({
    path: join(artifacts, `${name}-invoice-detail-390-scrolled.png`),
  });
}
