# UI-10b 凭证列表操作列

- Sprint：S4　依赖：[UI-09e](UI-09e-journals-css.md)（同冲突域串行）　建议分支：`ui-10b-journals-actions`
- 冲突域：web-ui:journals（`Journals.tsx`、凭证 labels、`src/pages/journals.css`）
- 类型：页面 tsx
- 来源：[UI-1 审查](../reviews/UI-1.md) §8 F8，以及 #82 复审补记的“查看”列过窄

## 范围

- 凭证列表操作列表头补“操作 / Actions”（新 label 键，中英齐全）。
- 加宽“查看”列：1440 下按钮完整显示，不再截成“查看 TRADE…”。可以给列设最小宽度，或把按钮的可见文字缩为“查看”，同时用 `aria-label` 保留原可访问名称；后一种写法只在原名称确实过长时采用。
- **按钮可访问名称不变**（E2E 依赖）。

## 验收标准

1. 满足 [UI-1 通用验收标准](README.md#ui-1界面逐步改进) 1–9。PG-05：入口 JS 不变，CSS 合计 ≤ +0.2 kB，路由 chunk ≤ +15%。
2. 截图：凭证列表改前 / 改后，1440 中文 + 红、English + 绿，以及 390。英文表头完整，按钮文字不截断。
3. Web 测试新增：操作列表头可按名称定位，即 `columnheader` 名为 `t("…actions")`；按钮可访问名称与改前相同。
4. 虚拟列表行高与 overscan 不变。
