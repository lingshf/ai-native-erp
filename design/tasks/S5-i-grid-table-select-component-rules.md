# S5-i 共享表格与表单字段：`thead` / `tfoot` 底色、`td` 对齐、`select` 最大宽度改为组件规则

- Sprint：S5　依赖：S5-f（A 线前序，同改 `theme/components.css`）、S5-c（#113 也在 `components.css` 新增一条规则）　建议分支：`s5-i-grid-select-rules`
- 冲突域：web-ui:components（**只改 `theme/components.css`**，不改页面 CSS、`.tsx`、`styles.css`）
- 类型：CSS
- 来源：S5-c [#113](https://github.com/lingshf/ai-native-erp/pull/113) 作者报告的未覆盖缺口；设计角色在 main `54dad41` 上逐冲突域核对的源码结果见下表

## 为什么放在组件层

下面三条全局声明在 main `54dad41` 上，除了少数页面已有覆盖，其余元素的计算值都由 `styles.css` 决定。这些元素都在共享的 `.grid` / `.journal-scroll`（VirtualRows）表格或 `.ui-field` 字段里，分布在 13 个页面、6 个冲突域。如果逐页复制同值声明，需要改 13 个页面 CSS，还会和 S5-a..e 产生冲突。组件层写一条规则就能覆盖。

| 全局声明 | 组件 / 页面 CSS 现有覆盖 | 仍依赖全局声明的元素（源码位置，main `54dad41`） |
| --- | --- | --- |
| `th, td { text-align: left }` | `.grid th`、`.card > .journal-scroll th` 已写 `left`；`td.num` 为 `right`；`.migration-page .kv` 由 S5-b 覆盖；结算页部分 `td`（`trade-settlements.css:58`） | **所有 `.grid td` 和 VirtualRows `td`**。`.grid td` 与 `.card .journal-row td` 都不设 `text-align`，删去全局声明后计算值由 `left` 变为 `start`。涉及 Accounts、AiPanel、Dimensions、Journals、BusinessEvents、LedgerReports、PeriodClose、Reports、TradeAdjustments、TradeInvoices、TradeMaster、TradeOrders、TradeReports、TradeSettlements |
| `thead, tfoot { background: var(--color-primary-soft) }` | `.ledger-page thead, tfoot`、`.trade-invoices thead`、`.card > .journal-scroll thead` 为 `none`；`.migration-page .kv` 由 S5-b 覆盖；VirtualRows `tfoot` 由 S5-f 覆盖 | **`.grid thead`**：Accounts、AiPanel、Dimensions、Journals、PeriodClose、Reports、TradeAdjustments、TradeMaster、TradeOrders、TradeReports、TradeSettlements。不直接位于 `.card` 内的 `.journal-scroll thead`：先用探针确认。另外，核对中发现 **`.grid tfoot`** 也没有覆盖：`Journals.tsx:846`、`Reports.tsx:400`。`th` 自身不透明，底色多数情况下看不见，但计算值仍会变化 |
| `select { max-width: 100% }` | `styles.css` 之外**没有任何规则**设置 `select` 的 `max-width`。外壳偏好区（`App.tsx:153/168`）与 `.page-header` / `.filter-bar` 的 `.field > select` 已归入 S5-f | **全部 `.ui-field select`**：Accounts、AiPanel、BusinessEvents（含 `.ui-field.jv-status`）、Dimensions（`:482`）、Journals（`:635`）、TradeAdjustments、TradeInvoices、TradeMaster（`:602`）、TradeOrders、TradeSettlements。不在 `.ui-field` 内的两处归入 S5-a：`Journals.tsx:475` 的 `label.jv-status > select`，以及 `BusinessEvents.tsx` 约 1570–1629 行 `form > fieldset > label > select` |

## 范围

在 `theme/components.css` 中用类规则给出与现值相同的声明。**不改 `styles.css`**：
1. `.grid` 与 `.journal-scroll` 内 `th` / `td` 的 `text-align: left`。保留 `left`，不改为 `start`：两者在左到右文字下看起来一样，但计算值不同，不满足计算值零差异。改为逻辑属性不在本任务范围内。
2. `.grid` 与 `.journal-scroll` 内 `thead`、`tfoot` 的 `background: var(--color-primary-soft)`。
3. `.ui-field select` 的 `max-width: 100%`，可写进现有 `.ui-field select` 规则。

**特异性**：与 S5-c 相同，建议用 `:where(...)` 包住类选择器，使特异性与被替代的全局元素规则一致，例如 `:where(.grid, .journal-scroll) :is(th, td)` 为 (0,0,1)，`:where(.grid, .journal-scroll) :is(thead, tfoot)` 为 (0,0,1)。这样各页已有的 `none`、`right` 等覆盖照常生效。具体写法由开发决定，以探针计算值为准。

**不在范围**：
- 页面已有覆盖：S5-b 的 `.kv`、ledger 与发票的 `none`、S5-f 的 VirtualRows `tfoot`、外壳与 `.field` 的 `select`；
- S5-a 的两处无类 `select`；
- `th, td` 的其他属性（padding / vertical-align / min-width / border-bottom），仍按 S5-a、S5-e 的任务文件处理。

## 验收标准

1. 满足 [S5 共同验收](README.md#s5stylescss-全局元素规则收尾--s4-回顾行动建议-v050)。取证构建删去 `th, td { text-align }`、`thead, tfoot { background }`、`select { max-width }` 三条声明。**探针范围为全部导航路由**，含运行状态页：组件规则作用于所有页面。
2. 补采状态至少包括：
   - 发票过账预览（含 PO 匹配，`.trade-invoices thead` 为 `none`，验证页面覆盖仍然优先）；
   - 结算选中 AP-DEMO；
   - 凭证草稿表与凭证 `.grid tfoot`（`Journals.tsx:846`）；
   - 报表 `.grid tfoot`（`Reports.tsx:400`）；
   - 期末 fieldset 内的 VirtualRows；
   - 业务事件编辑对话框中的 `.ui-field select`；
   - 科目表、维度、贸易主数据编辑器中的 `select`。
3. 不在本任务范围的元素计算值仍变的，在证据表中列出元素、文件:行和归属任务（S5-a 的两处 `select`、S5-b 的 `.kv`、S5-f 的偏好区等），不在本任务中改页面 CSS。
4. 组件规则只用类选择器（可以包在 `:where()` / `:is()` 中，与元素选择器组合），不引入新的纯元素选择器。CSS gzip 计入 S5 合计预算。
5. 现有组件、页面与对比度测试不删除、不削弱。
