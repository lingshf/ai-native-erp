# UI-09g 删除 `styles.css` 全局元素规则

- Sprint：S4　依赖：[UI-09a](UI-09a-components-css.md)、[UI-09b](UI-09b-shell-brand-css.md)、[UI-09c](UI-09c-master-css.md)、[UI-09d](UI-09d-ledger-period-close-css.md)、[UI-09e](UI-09e-journals-css.md)、[UI-09f](UI-09f-trade-css.md)；外壳串行中排最后　建议分支：`ui-09g-global-rules`
- 冲突域：web-ui:shell（只改 `src/styles.css`）。证据覆盖全部页面，所以开工时不应有正在进行的页面 CSS 任务；若 rebase 后 main 上有新的页面 CSS，重做证据。
- 类型：**只改 CSS**
- 来源：[UI-1 审查](../reviews/UI-1.md) §6 D-7，方法见 §5.1（C4 属性级证据）

## 范围

- `styles.css` 中的全局元素规则 `button`、`select`、`table`、`th`、`td` 等（main `2a23025` 的 `styles.css:6-72` 一带）。
- 方法：
  1. 逐页、逐元素列出这些全局规则在各页实际生效的属性：被哪条页面或组件规则覆盖，或仍然生效；
  2. 对仍然生效的属性，先把它迁到对应组件或页面 CSS，或者证明它与浏览器默认值相同；
  3. 然后删除全局规则。
- 不接手任何页面，不改 `.tsx`。

## 验收标准

1. 满足 [UI-1 通用验收标准](README.md#ui-1界面逐步改进) 1–9。PG-05：入口 JS 不变，CSS 合计**不增**（应减少），路由 chunk 不变。
2. **属性级证据表**：格式同 [UI-1.md §5.1](../reviews/UI-1.md)。表中写明页面、元素、属性、删除前计算值、删除后计算值，以及覆盖来源或迁移去向。
   - 用 `getComputedStyle` 脚本对全部导航路由（含运行状态页）、两主题、1440 / 390 采集；
   - 删除前后计算值逐项相等，才算“完全覆盖”。
3. 全部页面改前 / 改后截图像素差为 0；差异不为 0 的项必须在表中说明，并经设计评审接受。
4. 结果写入 `design/reviews/UI-1.md` §5（追加小节，不改已有结论）。
