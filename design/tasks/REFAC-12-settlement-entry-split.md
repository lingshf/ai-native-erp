# REFAC-12：拆分 `SettlementEntry` 函数体（不改行为）

- Sprint：S22（[计划](S22.md)）　类型：重构（页面）　优先级：P2　决定：待协调者定编号　建议分支：`refac-12-split-settlement-entry`
- 来源：[S21 候选池](S21.md#候选池s21-之后)“按 ② 拆 `SettlementEntry`，再给结算加‘刷新列表’”；“刷新列表”系列（TLIST-01–05）只剩结算一页。拆分与功能分成两个任务：先做本任务，再做 [TLIST-06](TLIST-06-settlements-refresh.md)。结构与验收照搬 [REFAC-11](REFAC-11-order-view-split.md)，只换成付款与收款页的事实。
- 迁移：**不加**。浏览器时段：**不需要**（理由见“证据要求”）。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 为什么先拆

- `SettlementEntry` 按 `files/fnlen.cjs` 口径（非空、非注释行）为 **465 行**，是目前 `packages/web/src` 中最长的函数之一，远超 ②（≤ 80）。其中表格行的匿名函数单独就有 111 行（`:464–574`）。
- 它承载付款与收款的关键口径：两步提交（预览 → 确认）、待确认信封写入 `sessionStorage` 并回读比对、结果未知后安全重试、现金折扣可用性、未加载的已选项显示“待加载”而不按 0 推算。TLIST-06 要在这里加按钮；先拆小，功能任务的评审面更小，也能约束 TLIST-06 的净增。

## 现状（main `276fd3b`）

- `packages/web/src/TradeSettlements.tsx` 共 630 行，不是热点（③ ≤ 800）：
  - 模块层（`:1–91`）：导入；`day`（`:28`）；`storageKey`（`:29`）；`initial`（`:31–90`），从 `sessionStorage` 读取草稿与待确认信封。
  - `export function TradeSettlements`（`:92–161`）：公司选择与 `SettlementEntry` 的外壳，不在本任务范围。
  - `function SettlementEntry`（`:163–630`）：**465 行**（设计角色在 `276fd3b` 上用 `node files/fnlen.cjs packages/web/src` 实测，输出 `465 packages/web/src/TradeSettlements.tsx:163-630 SettlementEntry`，同一次输出中还有 `111 …:464-574 <anon>`）。
- `SettlementEntry` 内部：
  - **局部辅助**：`t`（`:172–173`）、`money`（`:174`）、`head`（`:175–183`，渲染 `thead`）、`kpis`（`:184–193`，渲染 `dl.kpis`）。
  - **Hook 调用**（源码顺序，R5a 的 base 一侧）：
    1. `useState`：`loaded`（`:194`）、`saved`（`:195`）、`storageFailed`（`:196`）、`preview`（`:197`）、`receipt`（`:198`）、`busy`（`:199`）、`uncertain`（`:202`）；
    2. `useRef(false)` `running`（`:203`）；`useState` `error`（`:204`）；`useRef(0)` `sequence`（`:208`）；
    3. `useEffect` 卸载时递增 `sequence`（`:209–214`）；`useEffect` 写入 `sessionStorage`（`:215–222`）；`useLayoutEffect` 调用 `onGuard`（`:223–228`）；
    4. `useInfiniteQuery`（`:229–240`）：键 `["tradeOpenItems", company.code]`，`refetchOnMount: "always"`，`limit=100`；
    5. `useRef` `scroll`（`:243`）；`useVirtualizer`（`:245–250`），`estimateSize` 48、`overscan` 5。
  - **派生值**：`command`、`locked`、`result`（`:205–207`）；`rows`、`firstSelected`（`:241–242`）；`virtual = rows.length > 100`（`:244`）；`measured`、`visible`（`:251–254`）；`due`、`allocated`（`:350–354`，注释 `:349`）。
  - **命令函数**：`change`（`:255–261`）、`report`（`:262–267`）、`runPreview`（`:268–288`）、`confirm`（`:289–347`）。`confirm` 在成功后调用 `await page.refetch()`（`:331`）。
  - **JSX**（`:355–629`）：`div.tset-entry` 下依次 7 个子表达式：
    1. `div.tset-command-bar`（`:357–374`）：“预览”和“确认”；
    2. 错误条数组（`:375–382`）；
    3. `{saved.pending && uncertain && …}`（`:383–395`），含“重试确认”；
    4. `{receipt && …}`（`:396–400`）；
    5. `TeachingTip`（`:401–403`）；
    6. `FastTab#tset-general`（`:404–439`）；
    7. `FastTab#tset-allocation`（`:440–600`）：KPI；`div.grid-wrap.accounts-scroll` 内的表格，含虚拟化的上下占位行（`:459–463`、`:575–584`）与行（`:464–574`）；“加载更多”（`:589–598`）；
    8. `{result && FastTab#tset-result}`（`:601–627`）。

    （第 2 项是一个 `.map` 表达式，第 8 项是条件表达式，共 8 个子表达式。）
- **数字字面量**（`SettlementEntry` 内）：
  - `100`：三种含义，分别是虚拟化阈值（`:244`）、单次最多选择项数（`:489`）、URL 中的 `limit=100`（`:235`，字符串的一部分）；
  - `48`：行高，出现在 `:248` 与 `:482`；
  - `5`：`overscan`（`:249`）；
  - `6`：占位行 `colSpan`（`:461`、`:578`）；
  - `2`：`aria-rowindex` 的偏移（`:482`）。
- 导入方：只有 `App.tsx:29–30`（`React.lazy`，路由块 `TradeSettlements-*.js`）。导出集合只有 `TradeSettlements`。
- `packages/web/src/trade-settlements/` 目录在 `276fd3b` 上不存在。
- 测试：
  - jsdom：`packages/web/test/trade-settlements.test.tsx` 362 行、8 个用例（`:202`、`:224`、`:235`、`:259`、`:282`、`:304`、`:331`、`:351`），桩辅助为 `mockApi`（`:121`）与 `selectPartial`（`:178`）。
  - 真实 Chrome：`git grep -n -e "tset" -e "settlement" -- packages/infra/test/support` 在 `276fd3b` 上只命中 `trade-gui/scenario/part-one.ts:105–128` 的 `settleWithDiscount`。它依赖 `#tset-party`、按名称定位的“选择 / 金额 / 折扣”控件，以及“预览”和“确认”两个按钮。

## 范围与决定

1. **不改行为**。以下全部不变：DOM 结构、类名、文本、属性（含 `id`、`aria-*`、`role`、`style`、`colSpan`）；请求的方法、URL、请求体与发出顺序；`sessionStorage` 的键、写入时机与内容；查询键与 `refetchOnMount`；焦点行为；离开确认（`onGuard`）。只改代码组织，不修 bug；拆分时发现的疑似缺陷登记在 PR 正文，留作后续任务。
2. **Hook 顺序不变**：Hook 可以留在 `SettlementEntry`，也可以放进它顶层无条件调用的自定义 Hook，例如：
   - `useSettlementDraft`：草稿、预览、回执、忙与未知状态、两个 ref、三个 effect；
   - `useOpenItems`：查询、滚动 ref 与虚拟化器。

   **展示组件不得调用任何 Hook**。展开自定义 Hook 后，Hook 调用序列（种类、先后、依赖与键的源文本，空白归一）与“现状”所列的 base 序列逐项相同（R5a）。
3. **命令函数**：`change`、`report`、`runPreview`、`confirm` 可以搬进自定义 Hook，或搬到同目录的普通模块函数（以参数接收状态与 setter）。`sequence` / `running` 的递增与比较位置、`await` 的先后、`catch` 中的分支都不变。`confirm` 中“写入后回读比对”（`:302–309`）保持原样。
4. **组件层级对等**：新组件一律在模块顶层定义。抽出的组件只替换上面 8 个子表达式之一，或表格 `tbody` 内的一个子表达式（例如一行、选择单元格、金额单元格、折扣单元格、上下占位行）；只渲染该表达式原来渲染的内容，不把相邻兄弟合成一个返回 Fragment 的组件。条件渲染的条件（`saved.pending && uncertain`、`receipt`、`result`、`page.hasNextPage`、`virtual && …`、`selected && …`）留在父级原位置或原单元格内。`head` 与 `kpis` 可以改为模块级组件，渲染结果相同。
5. **具名常量**（⑤）：
   - 虚拟化阈值、单次最多选择项数、行高、`overscan`、占位行 `colSpan` 与 `aria-rowindex` 偏移各用一个具名常量，值不变；
   - 两个 `100` 的含义不同，须用两个常量；
   - URL 中的 `limit=100` 是请求文本，可以引用常量，但生成的 URL 必须逐字不变（R4）。
6. **文件**：
   - 新文件放在新目录 `packages/web/src/trade-settlements/`，以 `settlement-` 或 `use-settlement-` / `use-open-items` 为前缀，按职责命名（例如 `settlement-command-bar.tsx`、`settlement-messages.tsx`、`settlement-general-tab.tsx`、`settlement-allocation-tab.tsx`、`settlement-row.tsx`、`settlement-result-tab.tsx`、`use-settlement-draft.ts`、`use-open-items.ts`）。粒度由开发定，写入 PR 正文。
   - `TradeSettlements` 仍从 `./TradeSettlements.tsx` 导出（`App.tsx` 不改，R2）。`initial`、`storageKey`、`day` 可以搬进新目录，实现与注释都不变。
7. **不改**：
   - `TradeSettlements` 的导出名与 props；`App.tsx` 与路由表；
   - `trade-invoices/use-invoice-leave-guard.ts`、`master-data-client.ts`、`reports-data.ts`；
   - 标签（`ui/` 下的标签文件与 `trade-settlement-teaching.ts`）、CSS（`pages/trade-settlements.css` 等）、契约（`@erp/core`）；
   - `packages/web/test/**`、`packages/infra/test/**`、`scripts/test-shard-weights.json`。

## 冲突域

- web-ui:trade-settlements：只改 `packages/web/src/TradeSettlements.tsx`，并在新目录 `packages/web/src/trade-settlements/` 新增文件。
- 取证所需的观测点和新增测试文件：无（R4 脚本不提交）。
- 受影响的 e2e 断言（S13 回顾行动 1）：
  - 检索见“现状”；
  - **必须继续成立**：`trade-gui/scenario/part-one.ts` 的 `settleWithDiscount`（`:105–128`）；
  - **须随本任务改**：无。
- 受影响的文档引用（D460）：`git grep -n -F "TradeSettlements.tsx" -- docs design` 在 `276fd3b` 上只命中 `design/` 下的历史文档（UI-1 评审、M1-R2a、README `:117`、S12、S14、S15、TINV-04、UI-06），都是当时的事实记录，不改。
- 与 S22 其他任务不相交：SLOT-05 只改 `scripts/slot/`；DOC-22 只改 `docs/`。TLIST-06 改同一组文件，**排在本任务合并之后**，由同一泳道接着做。

## 验收

### base 失败、head 通过

| 编号 | 检查 | base `276fd3b` | head 要求 |
| --- | --- | --- | --- |
| R6a | `node fnlen.cjs packages/web/src`（口径同 S16–S20）中 `SettlementEntry` 的行数 | **465**（失败） | ≤ 80，且 `TradeSettlements.tsx` 与 `trade-settlements/` 下没有本任务新增或改动的函数 > 80（含原 111 行的行渲染函数） |
| R6b | `(Get-Content packages/web/src/TradeSettlements.tsx).Count` | **630**（失败） | ≤ 200 |
| R6c | `SettlementEntry` 及其新抽出的组件与 Hook 中，表示行高、阈值、选择上限、`overscan`、`colSpan` 与 `aria-rowindex` 偏移的数字字面量 | 8 处（`:244`、`:248`、`:249`、`:461`、`:482` ×2、`:489`、`:578`；`:235` 的 URL 文本 `limit=100` 不计，按决定 5 可保留；失败） | 0 处，改用具名常量（决定 5） |

- R6c 的 base 计数由开发在 PR 正文按 `:235` 以外逐处列出，并与本表核对；有出入时以逐处列表为准，同时在 PR 正文说明。

### 两侧都须成立的不变量

- **R1 范围**：`git diff --name-only <base> <head>` 只含 `TradeSettlements.tsx` 与 `trade-settlements/` 下的新文件；决定 7 所列文件的 diff 为空。不加迁移。
- **R2 导出不变**：`TradeSettlements.tsx` 的导出集合与 base 相同（`TradeSettlements`，function）。用仓库根 devDependency `@babel/parser` 解析，口径同 REFAC-11 R2。新文件的导出只在 `TradeSettlements.tsx` 与 `trade-settlements/` 内部使用，PR 正文附 `git grep` 结果。
- **R3 既有测试原样通过**：`trade-settlements.test.tsx` 的 8 个用例与 Web 全部 jsdom 测试通过；测试文件 diff 为空。
- **R4 DOM、存储、请求与焦点等价**（送审证据，脚本不提交，不加常驻 CI 用例）：
  - **驱动**：临时 jsdom 驱动脚本，借用 `trade-settlements.test.tsx` 的渲染方式、`QueryClient` 配置与 `mockApi`，通过 `App` 渲染付款与收款页，在 base 与 head 上按同一序列操作。`fetch` 桩改为**受控响应**，采样边界同 [REFAC-10 R4](REFAC-10-order-list-split.md#验收)。
  - **序列**至少包含：
    - 选方向与伙伴；
    - 勾选一项并改金额；
    - 折扣可用与不可用各一项；
    - 预览后修改字段使预览失效；
    - 确认成功（回执、`page.refetch` 的请求）；
    - 确认时无服务器应答，进入“结果未知”，然后重试确认；
    - 4xx 回退；
    - `sessionStorage` 写入失败；
    - 未结项超过 100 行触发虚拟化并滚动；
    - “加载更多”；
    - 已选项尚未加载时显示“待加载”；
    - 卸载后重新挂载恢复待确认信封；
    - zh / en 各一遍。
  - **每步采样**：
    - DOM（`document.body.innerHTML`）与焦点；
    - `sessionStorage` 全部键值；
    - 累计请求日志（序号、方法、URL、请求体、结果）；
    - 查询缓存（`queryKey`、`status`、`isInvalidated`，按键排序）；
    - 最近一次 `onGuard` 的参数（经 `useInvoiceLeaveGuard` 的可观测效果，或驱动脚本对其参数的记录）。
  - **判定**：base 与 head 逐步、逐项、逐字节相同。`crypto.randomUUID` 在驱动中替换为确定序列，两侧相同。PR 正文附脚本全文、步骤清单、两侧输出的 SHA-256 与比较结果，以及“结果未知 → 重试”和“虚拟化滚动”两组场景的逐步输出原文。
- **R5 结构规则**（静态，评审按代码与 PR 表格核对）：
  - **R5a Hook 序列**：PR 正文列出 base 与 head 的 Hook 调用序列（自定义 Hook 按调用处展开），两侧逐行相同；base 一侧须与“现状”所列一致。
  - **R5b 展示组件无 Hook**：新抽出的组件中没有任何 `use*` 调用；PR 正文附 Babel AST 检查脚本的输出。
  - **R5c 模块级定义**：所有组件与自定义 Hook 都在模块顶层声明。
  - **R5d 插槽对等**：PR 正文用一张表列出 base 中 `div.tset-entry` 的 8 个子表达式，以及 `tbody` 内被抽出的子表达式，并标出 head 中对应的唯一组件或表达式。
- **R6 尺寸**：除上表 R6a–R6c 外，`trade-settlements/` 下每个新文件 ≤ 200 行；每个新函数满足 ②（≤ 80 行、嵌套 ≤ 3 层）；PR 正文列出所有超过 60 行的函数，附计数行数与最深层数。
- **R7 打包字节**：首屏按 D454；体积口径见 [S22 共同验收“L10 / 体积口径”](S22.md#l10--体积口径)。
  - 用 `scripts/measure/bundle-measure.mjs`，写明脚本所在的提交 SHA，参见[任务书模板“构建来源”](TEMPLATE.md#证据要求)。base 为最终送审 head 的实际合并基；合并基变了就重新测量。
  - 首屏：±0。
  - 付款与收款路由（manifest 键 `src/TradeSettlements.tsx`）的“路由新增”JS 与该入口 chunk（屏蔽哈希后的 gzip-9）各增加不超过 **+900 B**（沿用 D461 / D476 的上限），即 `--route src/TradeSettlements.tsx=+900 --chunk src/TradeSettlements.tsx=+900 --d454`；其他路由与 chunk ±0；CSS 不变。`trade-settlements/` 下的新文件只被该路由导入，应打进同一入口 chunk；构建中出现 base 没有的新 chunk 时停下报告。
  - 超出先停下，报设计角色与协调者，不得自行放宽。
- **R8 质量门**：`typecheck`、`lint`、CI-02 预检通过；PR CI 绿；合并后覆盖该合并提交的 main Full 绿，包括 tests:trade-e2e 的浏览器分片，即 `settleWithDiscount`。
- **R9 可读性一节**：PR 正文按下节逐条说明。

## 性能考虑

- 渲染次数不变：不加 `memo`，不改 Hook、查询键与虚拟化参数。不跑 Bench。
- 打包变化由 R7 约束。其余项（规模、索引、查询次数、分页、事务）都不适用，因为不改数据访问。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥：

- **②**：本任务就是为满足 ② 而做。`SettlementEntry` 从 465 行拆到每个函数 ≤ 80 行、嵌套 ≤ 3 层（R6a）。最大的两块是 `confirm`（`:289–347`，约 55 行）和行渲染（`:464–574`，111 行）；行渲染按“选择 / 金额 / 折扣”三个单元格拆开即可。
- **③**：`TradeSettlements.tsx`（630 行）不是热点，本任务净减到 ≤ 200 行（R6b），新文件各 ≤ 200 行。PR 正文贴 `git diff --numstat`。
- **①**：组件与 Hook 名表达职责，例如 `SettlementCommandBar`、`SettlementMessages`、`SettlementGeneralTab`、`SettlementAllocationTab`、`SettlementRow`、`SettlementResultTab`、`useSettlementDraft`、`useOpenItems`；不用 `Part1`、`Section2`。
- **④**：分层对齐 `trade-orders/`（REFAC-10 / 11），不抽跨页共用件。
- **⑤**：见决定 5。
- **⑥**：原有的“为什么”注释（`:200–201` 未知状态、`:349` 待加载用 `NaN`、`Counted` 以外的其他注释）随代码搬移，不删改。不留调试输出。
- **测试耗时**：本任务不改测试；R4 驱动脚本不提交。PR 正文附 `trade-settlements.test.tsx` 在 base 与 head 上的耗时（vitest 汇总行原文），两侧差异 > 20% 时说明原因。

## 用户可见变化

- 无。付款与收款页的外观、文案、键盘与焦点行为、请求、草稿保存与离开确认都不变（R3、R4）。

## 证据要求

- **不需要浏览器时段**：行为等价由 R3（既有 jsdom 用例）与 R4（逐步的 DOM、存储、请求与焦点等价）证明。tests:trade-e2e 中经过付款与收款页的 `settleWithDiscount` 在合并后，由覆盖合并提交的 main Full 的浏览器分片执行，口径同 REFAC-11。R4 与构建在本机运行，须服从协调者的时段静默通知（D442 / D480）。
- **可行性**（S13 回顾行动 4）：
  - R4 的驱动方式已在 REFAC-06c（#256）、REFAC-05b（#265）、REFAC-07（#275）、REFAC-09（#285）、REFAC-10（#291）、REFAC-11（#299）跑通；
  - `trade-settlements.test.tsx` 已有 `mockApi`（`:121`），其参数 `unknownFirst` 可以覆盖“结果未知”；
  - R6a、R6b 的 base 数字见“现状”（设计角色实测）。
  - 本任务书**没有**做试改构建，R7 只按 D461 / D476 的上限判定。
- PR 正文附：
  - R2 导出与 `git grep` 结果；
  - R4 脚本、步骤清单、比较结果与两组场景的逐步输出；
  - R5a–R5d 各表；
  - R6 行数表（base 与 head 两列）与 R6c 逐处列表；
  - R7 的 `bundle-measure.mjs` 完整输出与退出码；
  - 可读性一节。
