import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

// Port of design/ui/check-contrast.mjs: every declared foreground/background pair must meet
// WCAG 2.2 AA in both themes (text ≥ 4.5:1, control boundaries and their states ≥ 3:1).
const tokens = readFileSync(resolve(import.meta.dirname, "../src/theme/tokens.css"), "utf8");

function block(css: string, selector: string) {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`missing block ${selector}`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  return Object.fromEntries(
    [...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/giu)].map((m) => [m[1], m[2]]),
  ) as Record<string, string>;
}

function themes(css: string) {
  const root = block(css, ":root");
  return {
    red: { ...root, ...block(css, '.workspace[data-theme="red"]') },
    green: { ...root, ...block(css, '.workspace[data-theme="green"]') },
  };
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// [foreground, background, minimum, use]
const pairs: ReadonlyArray<readonly [string, string, number, string]> = [
  ["color-text", "color-bg", 4.5, "正文 / 页面底"],
  ["color-text", "color-surface-alt", 4.5, "正文 / 表头、交替行"],
  ["color-text-muted", "color-surface", 4.5, "次要文字 / 卡片"],
  ["color-text-muted", "color-bg", 4.5, "次要文字 / 页面底"],
  ["color-text-muted", "color-surface-alt", 4.5, "次要文字 / 表头"],
  ["color-primary", "color-surface", 4.5, "链接、次按钮文字"],
  ["color-primary", "color-primary-soft", 4.5, "导航选中、徽标文字"],
  ["color-text", "color-primary-soft", 4.5, "正文 / 选中行"],
  ["color-on-primary", "color-primary", 4.5, "主按钮"],
  ["color-on-primary", "color-primary-hover", 4.5, "主按钮悬停"],
  ["color-on-primary", "color-primary-active", 4.5, "主按钮按下"],
  ["color-on-appbar", "color-appbar", 4.5, "顶栏标题"],
  ["color-appbar-muted", "color-appbar", 4.5, "顶栏次要文字"],
  ["color-info", "color-info-bg", 4.5, "信息提示"],
  ["color-success", "color-success-bg", 4.5, "成功提示"],
  ["color-warning", "color-warning-bg", 4.5, "警告提示"],
  ["color-danger", "color-danger-bg", 4.5, "错误提示"],
  ["color-danger", "color-surface", 4.5, "危险按钮文字"],
  ["color-teach", "color-teach-bg", 4.5, "教学提示"],
  // Control boundaries (WCAG 1.4.11): every background and interaction state they can appear on.
  ["color-border-strong", "color-surface", 3, "输入框 / 次按钮 / 分段按钮边框（静止）"],
  ["color-border-strong", "color-surface-alt", 3, "次按钮悬停底 / 只读输入 / 交替行内输入框"],
  ["color-border-strong", "color-bg", 3, "页面底上的次按钮、筛选控件"],
  ["color-border-strong", "color-primary-soft", 3, "选中行内的输入框"],
  ["color-danger", "color-surface", 3, "危险按钮边框（静止）/ 校验失败输入框"],
  ["color-danger", "color-danger-bg", 3, "危险按钮边框（悬停）"],
  ["color-primary", "color-surface", 3, "主按钮底色作边界 / 选中指示条 / 分段选中"],
  ["color-primary", "color-bg", 3, "页面底上的主按钮"],
  ["color-primary-hover", "color-surface", 3, "主按钮悬停作边界"],
  ["color-primary-active", "color-surface", 3, "主按钮按下作边界"],
  ["color-focus", "color-surface-alt", 3, "焦点框 / 表头、交替行"],
  ["color-focus", "color-primary-soft", 3, "焦点框 / 选中行"],
  ["color-focus", "color-surface", 3, "焦点框 / 卡片"],
  ["color-focus", "color-bg", 3, "焦点框 / 页面底"],
  ["color-surface", "color-appbar", 3, "焦点框 / 顶栏（白色外框）"],
  // UI-01 shell additions: preference controls on the app bar.
  ["color-appbar-muted", "color-appbar", 3, "顶栏偏好下拉框边框"],
  ["color-on-appbar", "color-appbar", 3, "顶栏教学复选框（勾选态填充）"],
  ["color-primary", "color-primary-soft", 3, "导航当前页指示条 / 选中底"],
];

function failures(css: string) {
  return Object.entries(themes(css)).flatMap(([theme, values]) =>
    pairs.flatMap(([fg, bg, min, use]) => {
      const fgValue = values[fg];
      const bgValue = values[bg];
      if (!fgValue || !bgValue) return [`${theme}: missing ${fg} or ${bg}`];
      const value = ratio(fgValue, bgValue);
      return value >= min
        ? []
        : [`${theme} ${value.toFixed(2)}:1 < ${min} ${fg} on ${bg} (${use})`];
    }),
  );
}

function withToken(name: string, value: string) {
  const pattern = new RegExp(`(--${name}:\\s*)#[0-9a-f]{6}`, "giu");
  expect(tokens.match(pattern)?.length).toBeGreaterThan(0);
  return tokens.replace(pattern, `$1${value}`);
}

describe("design token contrast", () => {
  test("covers every check-contrast.mjs pair and all pairs pass in both themes", () => {
    const script = readFileSync(
      resolve(import.meta.dirname, "../../../design/ui/check-contrast.mjs"),
      "utf8",
    );
    const declared = [...script.matchAll(/\["([\w-]+)", "([\w-]+)", ([\d.]+),/gu)].map(
      (m) => `${m[1]}|${m[2]}|${m[3]}`,
    );
    expect(declared.length).toBeGreaterThanOrEqual(34);
    const covered = new Set(pairs.map(([fg, bg, min]) => `${fg}|${bg}|${min}`));
    expect(declared.filter((pair) => !covered.has(pair))).toEqual([]);
    expect(failures(tokens)).toEqual([]);
  });

  test("stays identical to the design source tokens", () => {
    const design = readFileSync(
      resolve(import.meta.dirname, "../../../design/ui/tokens.css"),
      "utf8",
    );
    expect(tokens.replaceAll("\r\n", "\n")).toBe(design.replaceAll("\r\n", "\n"));
  });

  test("fails when muted text is lightened", () => {
    expect(failures(withToken("color-text-muted", "#9aa3ad")).length).toBeGreaterThan(0);
  });

  test("fails when the control boundary returns to the old border value", () => {
    const found = failures(withToken("color-border-strong", "#8a939e"));
    expect(found.some((failure) => failure.includes("color-border-strong"))).toBe(true);
  });
});
