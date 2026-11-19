// 校验 design/ui/tokens.css 中声明的前景/背景组合是否满足 WCAG 2.2 AA。
// 用法：node design/ui/check-contrast.mjs [tokens.css 路径]；任一组合不达标时非零退出。
// UI-01 把同一份清单移入 packages/web 的测试，CI 执行。
import { readFileSync } from "node:fs";

const file = process.argv[2] ?? new URL("./tokens.css", import.meta.url);
const css = readFileSync(file, "utf8");

function block(selector) {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`missing block ${selector}`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  return Object.fromEntries(
    [...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]),
  );
}

const root = block(":root");
const themes = {
  red: { ...root, ...block('.workspace[data-theme="red"]') },
  green: { ...root, ...block('.workspace[data-theme="green"]') },
};

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// [前景, 背景, 最低比值, 用途]
const pairs = [
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
  ["color-border-strong", "color-surface", 3, "输入框边框（非文字）"],
  ["color-primary", "color-surface", 3, "选中指示条（非文字）"],
  ["color-focus", "color-surface", 3, "焦点框 / 卡片"],
  ["color-focus", "color-bg", 3, "焦点框 / 页面底"],
  ["color-surface", "color-appbar", 3, "焦点框 / 顶栏（白色外框）"],
];

let failed = 0;
for (const [theme, tokens] of Object.entries(themes)) {
  for (const [fg, bg, min, use] of pairs) {
    const value = ratio(tokens[fg], tokens[bg]);
    const ok = value >= min;
    if (!ok) failed++;
    console.log(
      `${ok ? "PASS" : "FAIL"} ${theme.padEnd(5)} ${value.toFixed(2).padStart(5)}:1 ≥ ${min}  ${fg} on ${bg}  ${use}`,
    );
  }
}
if (failed) {
  console.error(`${failed} pair(s) below WCAG AA`);
  process.exit(1);
}
