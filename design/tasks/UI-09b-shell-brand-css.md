# UI-09b 外壳窄屏品牌名

- Sprint：S4　依赖：[M1-R1a](M1-R1a-trade-order-entry-page.md)（外壳串行，必须已合并）、[UI-09e](UI-09e-journals-css.md)（A 线前序）。外壳串行：M1-R1a → UI-09b → [UI-10a](UI-10a-shell-preference-messagebar.md) → [UI-09g](UI-09g-global-element-rules.md)　建议分支：`ui-09b-shell-brand`
- 冲突域：web-ui:shell（只改 `src/theme/shell.css`；测试只在 `shell-targets.test.ts`、`App.test.tsx` 中新增断言）
- 类型：**只改 CSS**
- 来源：[UI-1 审查](../reviews/UI-1.md) §8 F1

## 范围

- 品牌区的结构（`App.tsx:139–144`）是 `aria-hidden` 的 `.brand-mark` 图标，加上标题 `<h1>{t("shell.title")}</h1>`，不是链接。视口 ≤ 760px 时，只显示图标，`.appbar h1` 用视觉隐藏写法（`clip` / `clip-path` + 1px 尺寸，同 `.visually-hidden`）。不用 `display:none` 或 `visibility:hidden`，以保持标题仍在无障碍树中。
- 不加链接、不加 `tabindex`、不改 `.tsx`。
- 语言、主题两个选择框在窄屏取内容宽度（可设 `max-width`），不占满顶栏。
- 1440 下外观不变（像素差 0）。

## 验收标准

1. 满足 [UI-1 通用验收标准](README.md#ui-1界面逐步改进) 1–9。PG-05：入口 JS 不变，CSS 合计 ≤ +0.2 kB，路由 chunk 不变。
2. 改前 / 改后截图：390 下中文 + 红、English + 绿的顶栏，英文不再出现 “E…”；1440 两组像素差为 0。
3. **标题仍可按名称找到**（不改 `tests:trade-e2e` 的共享场景）：
   - Web 测试新增断言：`shell-targets.test.ts` 中，`.appbar h1` 在 ≤ 760 媒体块内不含 `display: none` / `visibility: hidden`，并使用 `clip` 或 `clip-path`；`App.test.tsx` 中 `getByRole("heading", { level: 1, name: t("shell.title") })` 唯一。
   - 真实 Chrome 证据：用截图脚本（参照 `design/ui/screenshots/UI-01/capture.mjs`）在 390 与 1440 下执行同一 `getByRole` 查询，两者都找到唯一元素且名称相同。结果贴在 PR 中。jsdom 不计算媒体查询，不能代替这一步。
4. **没有新的 Tab 停靠点**：390 下从“跳到主内容”开始的 Tab 序列与改前逐项相同。`h1` 不可聚焦，图标仍为 `aria-hidden`。
5. 偏好选择框的 `id`、`label`、Tab 顺序不变。
