# S5-a 凭证 / 业务事件：不再依赖全局元素规则

- Sprint：S5　依赖：S5-b（C 线前序）　建议分支：`s5-a-journals-rules`
- 冲突域：web-ui:journals（`BusinessEvents.tsx`、凭证页及其页面 CSS、labels）
- 类型：页面 tsx + CSS
- 来源：UI-09g [#106](https://github.com/lingshf/ai-native-erp/pull/106) 证据表“保留”，摘要见 [UI-1.md §5.2](../reviews/UI-1.md#52-ui-09gstylescss-全局元素规则删除记录)

## 范围

依赖 `styles.css` 全局规则的声明（main `66d8e15`）：
- `BusinessEvents.tsx` 无类的 `legend`（font-weight、padding）；
- `form > fieldset > label > select`（width / **max-width** / background / color / border / radius / padding / min-height），即 `BusinessEvents.tsx` 约 1570–1629 行；
- `Journals.tsx:475` 的 `label.jv-status > select`：它不在 `.ui-field` 内，`journals.css` 的 `.journals :is(.jv-status, .jv-lines) :is(select, input)` 不设 `max-width`，所以 `max-width` 仍取自全局规则。`.ui-field select` 的 `max-width` 由 [S5-i](S5-i-grid-table-select-component-rules.md) 在组件层覆盖，本任务不重复写；
- 无类按钮（约 1125、1183、1401/1402、1467、1701/1702 行）的 background / color / border / padding / cursor / font-weight，以及 hover / active / disabled 状态。`:407` 的分段按钮已由 `.segmented button` 覆盖，不在范围内；
- VirtualRows 表头（约 860、1174 行）的 `th, td { padding }`；
- 凭证页复选框。

做法：给这些元素加类名（优先用已有共享类，如按钮用 `ui/components` 的按钮类），在页面 CSS 中给出与现值相同的声明。**不改 `styles.css`**。

## 验收标准

1. 满足 [S5 共同验收](README.md#s5stylescss-全局元素规则收尾--s4-回顾行动建议-v050)。
2. **补采状态**：UI-09g 没有采到的业务事件编辑、清账 / 预览对话框、禁用按钮、hover / active，都要在证据中出现（脚本驱动到该状态后采集）。
3. 按钮的可访问名称、`role`、键盘顺序不变；现有 `business-events` / 凭证测试不删除、不削弱，只允许因加类名而新增断言。
4. 页面 chunk gzip ≤ +0.1 kB。
