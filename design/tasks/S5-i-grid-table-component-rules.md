# S5-i 共享组件：表格 `td` 对齐、`thead` / `tfoot` 底色，FastTab 禁用态改为组件规则

- Sprint：S5　依赖：S5-f（A 线前序，[#115](https://github.com/lingshf/ai-native-erp/pull/115) 也改 `theme/components.css`）、S5-c（[#113](https://github.com/lingshf/ai-native-erp/pull/113) 也在 `components.css` 新增一条规则）　建议分支：`s5-i-grid-table-rules`
- 冲突域：web-ui:components（**只改 `theme/components.css`**，不改页面 CSS、`.tsx`、`styles.css`）
- 类型：CSS
- 来源：S5-c [#113](https://github.com/lingshf/ai-native-erp/pull/113) 作者报告的未覆盖缺口。设计角色在 main `54dad41` 上逐冲突域核对源码，并按 S5-f [#115](https://github.com/lingshf/ai-native-erp/pull/115)（head `c2f0310`）的实际改动扣除已覆盖部分。

## 核对结果与分工

**D110（协调者代定）**：`.ui-field select { max-width }` 与 VirtualRows `tfoot` 底色由 S5-f（#115）独占，S5-i 不重复写。

#113 报告了三条声明。`select { max-width }` 已由 #115（S5-f）全部覆盖，**不在本任务**：
- `.ui-field select`；
- `.filter-bar .field > select`、`.page-header .field > select`；
- `.appbar-prefs select`。

`.ui-field select` 在 #115 中的特异性是 (0,1,1)，高于全局 `select` 的 (0,0,1)。`styles.css` 之外没有任何规则设置 `select` 的 `max-width`，所以提高特异性不会盖过别的覆盖，由 #115 的探针证据确认。两处不在 `.ui-field` 内的无类 `select` 仍归 S5-a。

#115 也覆盖了 VirtualRows 的 `.journal-scroll tfoot { background }`，但**没有**覆盖 `td` 对齐、`thead` 底色和 `.grid tfoot` 底色。剩下的由本任务处理：

| 全局声明 | 已有覆盖 | 仍依赖全局声明的元素（源码位置，main `54dad41`） |
| --- | --- | --- |
| `th, td { text-align: left }` | `.grid th`、`.card > .journal-scroll th` 已写 `left`；`td.num` 为 `right`；`.migration-page .kv`（S5-b，已合并）；结算页部分 `td`（`trade-settlements.css:58`） | **所有 `.grid td` 和 VirtualRows `td`**。`.grid td` 与 `.card .journal-row td` 都不设 `text-align`，删去全局声明后计算值由 `left` 变为 `start`。涉及 Accounts、AiPanel、Dimensions、Journals、BusinessEvents、LedgerReports、PeriodClose、Reports、TradeAdjustments、TradeInvoices、TradeMaster、TradeOrders、TradeReports、TradeSettlements |
| `thead, tfoot { background: var(--color-primary-soft) }` | `none`：`.ledger-page thead, tfoot`、`.trade-invoices thead`、`.card > .journal-scroll thead`；`.migration-page .kv`（S5-b）；`.journal-scroll tfoot`（S5-f #115） | **`.grid thead`**：Accounts、AiPanel、Dimensions、Journals、PeriodClose、Reports、TradeAdjustments、TradeMaster、TradeOrders、TradeReports、TradeSettlements。**`.grid tfoot`**：`Journals.tsx:846`、`Reports.tsx:400`。不直接位于 `.card` 内的 `.journal-scroll thead`：先用探针确认。`th` 自身不透明，底色多数情况下看不见，但计算值仍会变化 |

这些元素都在共享的 `.grid` / `.journal-scroll` 表格里，分布在 14 个页面。逐页复制同值声明会和 S5-a..e 冲突，所以在组件层写规则。

**D116（协调者代定）**：S5-a [#118](https://github.com/lingshf/ai-native-erp/pull/118) 的探针发现，凭证预览打开时，禁用的 `.fasttab-toggle` 的 `cursor` 与 `opacity` 仍取自全局 `button:disabled { opacity: 0.65; cursor: wait }`（`styles.css:55–58`）。`.fasttab-toggle` 是 `theme/components.css:310–323` 的共享组件，它的 `cursor: pointer` 特异性 (0,1,0) 低于 `button:disabled` 的 (0,1,1)，所以禁用时被全局规则盖过。按 D77，共享组件的声明写在组件层，不在页面 CSS 中重复，所以归入本任务，S5-a 不写。

## 范围

在 `theme/components.css` 中用类规则给出与现值相同的声明。**不改 `styles.css`**：
1. `.grid` 与 `.journal-scroll` 内 `th` / `td` 的 `text-align: left`。保留 `left`，不改为 `start`：两者在左到右文字下看起来一样，但计算值不同，不满足计算值零差异。改为逻辑属性不在本任务范围内。
2. `.grid` 内 `thead`、`tfoot` 的 `background: var(--color-primary-soft)`；`.journal-scroll` 内 `thead` 同值。`.journal-scroll tfoot` 由 #115 独占（D110），不重复写。
3. **D116**：`.fasttab-toggle:disabled` 的 `opacity: 0.65` 与 `cursor: wait`。只写这两项，不改可用态与其他禁用按钮。

**特异性**：与 S5-c 相同，用 `:where(...)` 包住类选择器，使特异性与被替代的全局元素规则一致，例如 `:where(.grid, .journal-scroll) :is(th, td)`、`:where(.grid, .journal-scroll) thead`、`:where(.grid) tfoot`，都是 (0,0,1)。这些属性有页面级覆盖（`none`、`right`），不能提高特异性。第 3 项例外：`.fasttab-toggle:disabled` 是 (0,2,0)，高于被替代的 (0,1,1)。这是为了盖过组件自身的 `cursor: pointer`，组件之外没有设置这两项的规则，以探针确认。具体写法由开发决定，以探针计算值为准。

**不在范围**：
- `select { max-width }`：#115（S5-f）与 S5-a；
- 页面已有覆盖：S5-b 的 `.kv`，ledger 与发票的 `none`；
- `th, td` 的其他属性（padding / vertical-align / min-width / border-bottom）：按 S5-a、S5-e 的任务文件处理；
- `.fasttab-toggle` 以外的禁用按钮：按 S5-a、S5-f 的任务文件处理。

## 验收标准

1. 满足 [S5 共同验收](README.md#s5stylescss-全局元素规则收尾--s4-回顾行动建议-v050)。组件规则作用于所有页面，所以下面两种零差都以**全部导航路由**（含运行状态页）、两主题、1440 / 390 和第 2 条的补采状态为范围，分开列表：
   - **(a) head 对 base**（`styles.css` 不变）：全页面所有元素计算值“变”为 0，像素差为 0。新规则与全局规则同值，不得改变任何元素。
   - **(b) 取证构建对 base**：取证构建为 head 删去 `th, td { text-align }`、`thead, tfoot { background }` 两条声明，以及 `button:disabled` 的 `opacity` 与 `cursor`，不提交。S5-i 职责内的全部元素计算值“变”为 0，即 `.grid` / `.journal-scroll` 内的 `th`、`td`、`thead`、`tfoot`，以及禁用的 `.fasttab-toggle`。
   - 若 S5-i 职责内有元素变值，说明组件规则不对，修正后重采，不转交。
2. 补采状态至少包括：
   - 发票过账预览（含 PO 匹配，`.trade-invoices thead` 为 `none`，验证页面覆盖仍然优先）；
   - 结算选中 AP-DEMO；
   - 凭证草稿表与凭证 `.grid tfoot`（`Journals.tsx:846`）；
   - 报表 `.grid tfoot`（`Reports.tsx:400`）；
   - 期末 fieldset 内的 VirtualRows；
   - 业务事件的 VirtualRows 表格；
   - **凭证预览打开时禁用的 FastTab 按钮**（D116），两主题、1440 / 390。
3. **(b) 中职责外的命中**：S5-f、S5-b 已是前序且已覆盖，`.grid` / `.journal-scroll` 之外的 `th` / `td` / `thead` / `tfoot` 只有迁移页 `.kv`，也已覆盖。因此表格两条声明的 (b) 预期**全页面**为 0。删去 `button:disabled` 后，其他禁用按钮由 S5-a / S5-f 负责，若仍有变值，按本条列出，不计为 S5-i 失败。出现变值元素时，在证据表中列出元素、文件:行与属性，报告设计角色归属后再合并，不在本任务中改页面 CSS，不自行扩大范围。
4. 组件规则只用类选择器（可以包在 `:where()` / `:is()` 中，与元素选择器组合），不引入新的纯元素选择器。CSS gzip 计入 S5 合计预算。
5. 现有组件、页面与对比度测试不删除、不削弱。
