# UI-11c S5-g 遗留：VirtualRows 占位行 `td` 的边框、对齐与最小宽度

- Sprint：S5 收尾后的 backlog（不计入 S5 目标，版本由协调者定）　依赖：S5-g [#126](https://github.com/lingshf/ai-native-erp/pull/126) 合并；与 [UI-11a](UI-11a-business-queue-actions-column.md)、[FOCUS-02](FOCUS-02-business-master-save-failure-focus.md) 同属 web-ui:journals，与 [UI-11b](UI-11b-s5g-leftover-button-checkbox.md) 同改 `theme/components.css`，都**串行**，先后由协调者定　建议分支：`ui-11c-virtualrows-spacer`
- 冲突域：web-ui:journals（`Journals.tsx` 中的 `VirtualRows`）；若规则写进 `theme/components.css`（VirtualRows 的 `.journal-scroll` / `.journal-row` 组件规则在那里），同时占 web-ui:components。
- 类型：CSS（必要时 tsx 加类名）
- 来源：S5-g #126（head `a456f33`）第二道检查，证据 [gist](https://gist.github.com/lingshf/a5d44f3ae2f4eb51cdf4cfaff7533084)。这一项使 `styles.css` 中的 `th, td { border-bottom; vertical-align; min-width }` 仍须保留。

## 观察

- **共享组件的触发条件**：`VirtualRows`（main `c5c9224` 的 `Journals.tsx` 第 1482 行）在 `forceVirtual || items.length > 100` 时启用虚拟化，前后各渲染一个 `aria-hidden` 占位行（第 1515、1525 行），内含一个跨列 `td`，只有内联的 `height` 与 `padding: 0`，没有类。
- 它的 `border-bottom`（1px `--color-border`）、`vertical-align: top`、`min-width: 96px` 都来自全局 `th, td`。
- **已覆盖**：总账明细（`LedgerReports.tsx` 传入 `forceVirtual`）始终渲染占位行；#125（S5-e）已采到占位格，并在 `pages/ledger.css` 的 `:where(.ledger-page :is(th, td))` 补齐这三项。它不是本任务要修的缺口。
- **仍有依赖的页面类别**：业务事件、凭证、贸易。这些页面不传 `forceVirtual`，只有超过 100 行时才出现占位行，S5 各任务的夹具都没有采到。

## 范围

- 给占位 `td`（或其 `tr`）加类，在组件规则中给出与现值**相同**的 `border-bottom`、`vertical-align`、`min-width`。
- **滚动总高度不变**：占位行的 1px 下边框计入表格高度。改动后滚动区 `scrollHeight`、各行的 `offsetTop` 与改前一致；若认为这条边框本不应存在，先报告设计角色，不在本任务里改变高度。
- 虚拟化阈值、`estimateSize`、overscan 不变（design/ui §8）。不改 `styles.css`，不改页面 CSS 中与占位行无关的规则。

## 验收标准

1. 满足 [S5 共同验收](README.md#s5stylescss-全局元素规则收尾--s4-回顾行动建议-v050) 2–5。PG-05：入口 JS 不变，CSS 合计 ≤ +0.2 kB，路由 chunk ≤ +15%。
2. **计算值证据**：在只用于取证、不提交的构建中删去 `th, td` 的 `border-bottom`、`vertical-align`、`min-width`，在超过 100 行的虚构夹具上，业务事件、凭证、贸易中各取至少一个使用 `VirtualRows` 的列表，两主题、1440 / 390，滚动到顶部、中部、底部三处：占位 `td` 计算值“变”为 0，滚动区 `scrollHeight` 与改前相同。
   - 改动在共享组件里，所以**已覆盖的总账明细也要纳入零差核对**：同样条件下采集总账明细（`forceVirtual`）的占位 `td` 与 `scrollHeight`，改前 / 改后计算值零差、像素差为 0；不把它重复列为待修缺口。
3. 同一条件下，删去这三条声明后，`VirtualRows` 的表头、数据行与表尾计算值也为 0（确认 S5 各任务已覆盖，只剩占位行）；有新的非 0 项时列出并报告设计角色。
4. 截图：上述列表在三个滚动位置改前 / 改后像素差为 0。
5. 现有测试与 E2E 不删除、不削弱（D11）。验证分层同 [FLAKE-02](FLAKE-02-trade-gui-period-option-poll.md)。
