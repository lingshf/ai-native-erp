# UI-09b 外壳窄屏品牌名

- Sprint：S4　依赖：—（外壳串行：[M1-R1a](M1-R1a-trade-order-entry-page.md) → UI-09b → [UI-10a](UI-10a-shell-preference-messagebar.md) → [UI-09g](UI-09g-global-element-rules.md)）　建议分支：`ui-09b-shell-brand`
- 冲突域：web-ui:shell（只改 `src/theme/shell.css`）
- 类型：**只改 CSS**
- 来源：[UI-1 审查](../reviews/UI-1.md) §8 F1

## 范围

- 视口 ≤ 760px 时，品牌区只显示 logo（`.brand-mark`），文字视觉隐藏（`.visually-hidden` 同类写法，不用 `display:none`）。品牌链接的无障碍名称保持不变。
- 语言、主题两个选择框在窄屏取内容宽度（可设 `max-width`），不占满顶栏。
- 1440 下外观不变（像素差 0）。

## 验收标准

1. 满足 [UI-1 通用验收标准](README.md#ui-1界面逐步改进) 1–9。PG-05：入口 JS 不变，CSS 合计 ≤ +0.2 kB，路由 chunk 不变。
2. 改前 / 改后截图：390 下中文 + 红、English + 绿的顶栏，英文不再出现 “E…”；1440 两组像素差为 0。
3. 品牌链接的可访问名称在 390 与 1440 下相同（Web 测试或 E2E 中新增断言）。
4. 偏好选择框的 `id`、`label`、Tab 顺序不变。
