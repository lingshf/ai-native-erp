# UI-09d 总账报表与期末结账样式：金额链接、行表头、复选框间距、36px

- Sprint：S4　依赖：[UI-09a](UI-09a-components-css.md)　建议分支：`ui-09d-ledger-period-close-css`
- 冲突域：web-ui:ledger、web-ui:period-close（只改 `src/pages/ledger.css`、`src/pages/period-close.css`）
- 类型：**只改 CSS**
- 来源：[UI-1 审查](../reviews/UI-1.md) §8 F4、F6、F5（期末结账部分），§6 D-8（页面副本）

## 范围

1. **F4**：总账报表、试算、期末结账表格内的金额链接，改为细下划线或虚线（如 `text-decoration-thickness: 1px; text-underline-offset: 2px`，或 `text-decoration-style: dotted`），hover / focus 时加深为实线。
   - 保留非颜色提示（WCAG 1.4.1）。
   - 0.00 金额同样处理，不改为非链接，因为是否为链接属于 `.tsx`。
2. **F6**：期末结账分录表的“科目”行表头去掉整列灰底，只加粗；准入复选框之间的间距改为 `--space-2`。
3. **F5（期末结账部分）**：桌面端控件改为 36px，窄屏 / 粗指针为 44px，同 [UI-09c](UI-09c-master-css.md)。
4. **D-8**：删除 `period-close.css` 中的 `.message-bar p` 副本。

## 验收标准

1. 满足 [UI-1 通用验收标准](README.md#ui-1界面逐步改进) 1–9。PG-05：入口 JS 不变，CSS 合计 ≤ +0.2 kB，路由 chunk 不变。
2. 截图：总账报表、试算、期末结账改前 / 改后，含一个金额链接的 hover 或 focus 态；1440 中文 + 红、390 English + 绿。
3. 对比度：链接文字 ≥ 4.5:1，且不只靠颜色区分（下划线始终存在）；hover / focus 态加入 `contrast.test.ts` 检查。
4. 贸易期间准入（`TradePeriodAdmission.tsx`，属于 web-ui:trade）的样式若在 `period-close.css` 中，可以一起调整，但不改其 `.tsx`。
