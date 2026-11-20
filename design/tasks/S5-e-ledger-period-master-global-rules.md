# S5-e 总账报表 / 期末结账 / 科目表：不再依赖全局元素规则

- Sprint：S5　依赖：S5-f（A 线前序）　建议分支：`s5-e-ledger-rules`
- 冲突域：web-ui:ledger、web-ui:period-close、web-ui:master（各自页面 CSS）
- 类型：CSS
- 来源：UI-09g [#106](https://github.com/lingshf/ai-native-erp/pull/106) 证据表“保留”

## 范围

依赖 `styles.css` 全局规则的声明，改为各页 CSS 中的类规则，值不变。**不改 `styles.css`**：
- 报表与期末页的 `caption`：text-align / font-weight / padding；
- 总账明细 `th, td`：vertical-align / min-width / border-bottom（#106 观察到仍生效）；
- 总账 tfoot `td { padding }`；
- 期末 fieldset 内 `.journal-scroll` 的 `th, td { padding }`。

**不在范围**：总账明细与科目表 `td` 的 `text-align`、`.grid thead` 底色、`.ui-field select` 的 `max-width`。这些由 [S5-i](S5-i-grid-table-select-component-rules.md) 在组件层覆盖，保留 `left`，不改为 `start`，本任务不在页面 CSS 中重复写；取证构建也不删这三条。

## 验收标准

1. 满足 [S5 共同验收](README.md#s5stylescss-全局元素规则收尾--s4-回顾行动建议-v050)。
2. 金额列仍右对齐、等宽（`num`）；F4 金额链接与 F6 行表头的样式不变。
3. 总账、期末、科目表测试不删除、不削弱。
