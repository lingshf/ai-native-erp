# REFAC-11：拆分 `OrderView` 函数体（不改行为）

- Sprint：S20（[计划](S20.md)）　类型：重构（页面）　优先级：P2　决定：待协调者定编号　建议分支：`refac-11-split-order-view`
- 来源：[S19 候选池](S19.md#候选池s19-之后)第 1 项（“按 ② 拆 `OrderView`（186 行）或 `OrderLookup`（143 行）；S20 首选之一，与 REFAC-10 同目录，等它合并后做”）。REFAC-10（#291）已合并为 `6787f52`。结构与验收照搬 [REFAC-10](REFAC-10-order-list-split.md)，只换成订单详情的事实。
- 迁移：**不加**。浏览器时段：**不需要**（理由见“证据要求”）。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 为什么先拆 `OrderView`

- 它比 `OrderLookup`（143 行）更长，且被两处共用：保存后的订单（`order-workspace.tsx:87`）与“查找订单”的结果（`order-lookup.tsx:151`）都渲染它。用户看订单详情、开票数量与“开票”入口都经过它。
- 它承载开票相关的业务口径（未开票数量用百万分之一精确相减、已开足时禁用“开票”并给出原因、贷项冲回数量），后续 M1 贸易打磨（如多订单合并开票）都会改这里。先拆小，后续任务的评审面更小。
- `OrderLookup` 留在候选池，一个 Sprint 只做一个页面函数体拆分（S18 定的节奏）。

## 现状（main `3f8f2ff`）

- `packages/web/src/trade-orders/order-view.tsx` 共 212 行（`(Get-Content …).Count`），不是热点（③ ≤ 800）：
  - 模块层（`:1–22`）：导入；`micros`（`:11–14`）与 `fromMicros`（`:15–22`），注释 `:10`（百万分之一精确运算）。
  - `export function OrderView`（`:23–212`）：按 `files/fnlen.cjs` 口径（非空、非注释行）计 **186 行**，超过 ②（设计角色在 `3f8f2ff` 上实测）。
- `OrderView` 内部：
  - **Hook 调用**（源码顺序）：`useId()`（`:40`）；`useQuery`（`:43–52`），键 `["trade-order-invoicing", company.code, order.orderId]`，`refetchOnMount: "always"`，注释 `:41–42`（TINV-02 决定 1）。没有 `useState`、`useEffect`、`useRef`。
  - **派生值**：`decimal`（`:37–38`，TORD-07 注释 `:36`）；`amountKeys`（`:39`）；`known`（`:53`）；`invoiced`、`credited`（`:54–55`）；`remaining`（`:56–59`）；`fullyInvoiced`（`:60–61`）；`invoiceLink`（`:62`）；`total`（`:64–65`，PG-01 注释 `:63`）。
  - **JSX**（`:66–211`）：`div.tord-order` 下依次 6 个子表达式：
    1. `dl.kpis`（`:68–75`）：净额 / 税额 / 总额；
    2. `dl.tord-facts`（`:76–111`）：8 组事实；
    3. `div.grid-wrap`（`:112–175`）：订单行表 `table.grid.tord-amounts`，表头 13 列；行内未开票数量的三种显示（“…”、余量、负余量加“已开足”徽章）；合计行 `colSpan={9}`（`:166`）；
    4. `{invoicing.isFetching && …}`（`:176`）；
    5. `{invoicing.isError && !invoicing.isFetching && MessageBar}`（`:177–188`，含“重试”）；
    6. `div.tord-invoice-actions`（`:189–209`）：可开票时是 `Link`，否则是禁用按钮加 `aria-describedby`，已开足时显示原因。
- 数字字面量（`OrderView` 内）：`colSpan={9}`（`:166`）；`0n`、`1n` 是 BigInt 比较的哨兵值，`micros` / `fromMicros` 里的 `1_000_000n`、`6` 在模块层。
- 导入方：`trade-orders/order-workspace.tsx:9`、`trade-orders/order-lookup.tsx:8`。导出集合只有 `OrderView`。所在块为路由懒加载的 `TradeOrders`（`App.tsx:35–36`）。
- 测试：
  - jsdom：`packages/web/test/trade-orders.test.tsx` 1787 行、38 个用例（热点），其中开票数量、已开足与开票失败在 `:833–895` 一带，贷项冲回数量在 `:1778` 一带；`trade-invoice-links.test.tsx`、`trade-invoices.test.tsx` 也经过订单详情。
  - 真实 Chrome：`git grep -l -E 'tord\.(invoice|net|gross|lines|total|orderId)|trade-order-invoicing|/invoicing\?' -- packages/infra/test/support` 在 `3f8f2ff` 上命中 2 个文件（见“冲突域”）。

## 范围与决定

1. **不改行为**。以下全部不变：DOM 结构、类名、文本、属性（含 `id`、`aria-*`、`role`、`colSpan`、`scope`）；请求的方法、URL 与发出顺序；查询键与 `refetchOnMount`；“开票”链接的地址；焦点行为。只改代码组织，不修 bug；拆分时发现的疑似缺陷登记在 PR 正文，留作后续任务。
2. **Hook 只在原处**：`useId` 与 `useQuery` 留在 `OrderView`，或放进 `OrderView` 顶层无条件调用的新自定义 Hook（例如 `useOrderInvoicing`，返回 `invoicing`、`known`、`invoiced`、`credited` 等派生值）。新抽出的**展示组件不得调用任何 Hook**。展开自定义 Hook 后，Hook 调用序列（种类、先后、依赖与键的源文本）与 base 相同（R5a）。`reasonId` 仍由同一个 `useId` 调用产生，并传给需要它的组件。
3. **组件层级对等**：新组件一律在模块顶层定义；抽出的组件只替换上面 6 个子表达式之一，或 `div.grid-wrap` / `tbody` 内的一个子表达式（例如一行、未开票数量单元格、合计行），只渲染该表达式原来渲染的内容；不把相邻兄弟合成一个返回 Fragment 的组件。条件渲染的条件（`invoicing.isFetching`、`invoicing.isError && !invoicing.isFetching`、`known && !fullyInvoiced`、`fullyInvoiced`、未开票数量的三分支）留在父级原位置或原单元格内。
4. **纯函数**：`micros`、`fromMicros` 可以搬到同目录新文件（例如 `order-quantity.ts`），不改实现与注释；`remaining` 与 `fullyInvoiced` 的口径（`?? 1n`、`<= 0n`、`> 0n`、`< 0n`）不变。
5. **文件**：新文件放在 `packages/web/src/trade-orders/` 下，以 `order-view-` 为前缀按职责命名（例如 `order-view-facts.tsx`、`order-view-lines.tsx`、`order-view-actions.tsx`、`use-order-invoicing.ts`），粒度由开发定，写入 PR 正文。`OrderView` 仍须能从 `./order-view.tsx` 导入（R2）。
6. **具名常量**（⑤）：`colSpan={9}` 改为具名常量（表达“合计行之前的非金额列数”），值不变；BigInt 哨兵 `0n`、`1n` 不改。
7. **不改**：
   - `OrderView` 的导出名与 props；`order-workspace.tsx`、`order-lookup.tsx`、`TradeOrders.tsx` 与路由表；
   - `trade-orders/` 下的其他既有文件（只导入）；`trade-order-link.ts`；`decimal-format.ts`；
   - `packages/web/test/**`、`packages/infra/test/**`、`scripts/test-shard-weights.json`；
   - 标签（`ui/trade-order-labels.ts`、`ui/master-labels.ts`）、CSS（`trade-orders.css` 等）、契约（`@erp/core`）。

## 冲突域

- web-ui:trade-orders 详情：只改 `packages/web/src/trade-orders/order-view.tsx`，并在同目录新增以 `order-view-` 或 `use-order-invoicing` / `order-quantity` 为前缀的文件。
- 取证所需观测点 / 新增测试文件：无（R4 脚本不提交）。
- 受影响的 e2e 断言（S13 回顾行动 1）：
  - 检索见“现状”；
  - **必须继续成立**：`trade-gui/scenario/orders.ts`、`invoice-source-orders.ts`，它们依赖的标签、表格名、按钮名与“开票”地址全部不变；
  - **须随本任务改**：无。
- 受影响的文档引用（D460）：`git grep -n -F "order-view.tsx" -- docs design` 在 `3f8f2ff` 上只命中 `design/` 下的历史任务书（REFAC-05b、REFAC-10、S14、S16），都是当时的事实记录，不改。
- 与 S20 其他任务不相交：TLIST-04 只改 `Dimensions.tsx` 与 `dimensions.test.tsx`；MEAS-01 不改 `packages/web/`。

## 验收

### base 失败、head 通过

| 编号 | 检查 | base `3f8f2ff` | head 要求 |
| --- | --- | --- | --- |
| R6a | `node fnlen.cjs packages/web/src/trade-orders`（口径同 S16–S19）中 `OrderView` 的行数 | **186**（失败） | ≤ 80，且 `trade-orders/` 下没有本任务新增或改动的函数 > 80 |
| R6b | `(Get-Content packages/web/src/trade-orders/order-view.tsx).Count` | **212**（失败） | ≤ 120 |
| R6c | `OrderView` 及其新抽出的组件中的数字字面量 `9`（`colSpan`） | 1 处（失败） | 0 处，改用具名常量（决定 6） |

### 两侧都须成立的不变量

- **R1 范围**：`git diff --name-only <base> <head>` 只含 `order-view.tsx` 和“冲突域”允许的新文件；决定 7 列出的文件 diff 为空。不加迁移。
- **R2 导出不变**：`order-view.tsx` 的导出集合与 base 相同（`OrderView`，function）；用仓库根 devDependency `@babel/parser` 解析，口径同 REFAC-10 R2。新文件的导出只供 `trade-orders/` 内部使用（PR 正文附 `git grep` 结果）。
- **R3 既有测试原样通过**：`trade-orders.test.tsx` 的 38 个用例、`trade-invoice-links.test.tsx`、`trade-invoices.test.tsx` 与 Web 全部 jsdom 测试通过；测试文件 diff 为空。
- **R4 DOM、地址、请求与焦点等价**（送审证据，脚本不提交，不加常驻 CI 用例）：
  - **驱动**：临时 jsdom 驱动脚本，借用 `trade-orders.test.tsx` 的渲染方式、`QueryClient` 配置与 `fetch` 桩（`trade-orders-fixtures.ts` 的 `invoicingOf`），通过 `App` 渲染订单页，在 base 与 head 上按同一序列操作；`fetch` 桩改为**受控响应**，采样边界同 [REFAC-10 R4](REFAC-10-order-list-split.md#验收)。
  - **序列**至少包含：
    - 保存后的订单详情（`order-workspace`）与“查找订单”结果（`order-lookup`）各一次；
    - 开票数量读取中（“…”与 `role="status"`）；
    - 未开票、部分开票、已开足（徽章、禁用“开票”与 `aria-describedby` 原因）、超开（负余量加徽章）；
    - 有贷项冲回数量；
    - 开票数量请求失败 →“重试”→ 成功；
    - 可开票时点“开票”链接（地址变化）；
    - zh / en 各一遍。
  - **每步采样**：DOM（`document.body.innerHTML`）；焦点；`window.location.hash` 与 `history.length`；累计请求日志（序号、方法、URL、结果）；查询缓存（`queryKey`、`status`、`isInvalidated`，按键排序）。
  - **判定**：base 与 head 逐步、逐项、逐字节相同。`useId` 生成的 `id` 在两边须相同（Hook 序列不变时成立）。PR 正文附脚本全文、步骤清单、两边输出的 SHA-256 与比较结果，以及“已开足”与“请求失败→重试”两组场景的逐步输出原文。
- **R5 结构规则**（静态，评审按代码与 PR 表格核对）：
  - **R5a Hook 序列**：PR 正文列出 base 与 head 的 Hook 调用序列（自定义 Hook 按调用处展开；每行写种类与键 / 依赖的源文本，空白归一），两边逐行相同。
  - **R5b 展示组件无 Hook**：新抽出的组件中没有任何 `use*` 调用；PR 正文附 Babel AST 检查脚本的输出。
  - **R5c 模块级定义**：所有组件与自定义 Hook 都在模块顶层声明。
  - **R5d 插槽对等**：PR 正文用一张表列出 base 中 `div.tord-order` 的 6 个子表达式以及 `div.grid-wrap` / `tbody` 内被抽出的子表达式，标出 head 中对应的唯一组件或表达式。
- **R6 尺寸**：除上表 R6a–R6c 外，`trade-orders/` 下每个新文件 ≤ 200 行；每个新函数满足 ②（≤ 80 行、嵌套 ≤ 3 层）；PR 正文列出所有超过 60 行的函数，附计数行数与最深层数。
- **R7 打包字节**（构建条件、依赖图、D432 字节口径同 REFAC-10 R7；首屏按 D454；口径见 [S20 共同验收“L10 / 体积口径”](S20.md#l10--体积口径)）：
  - PR 正文须有“构建来源”一节（[任务书模板](TEMPLATE.md)“证据要求”，含 S17 回顾行动 3 的干净性证明）。base 为最终送审 head 的实际合并基；合并基变了就重新测量。
  - 测量脚本：MEAS-01 已合并时用入库脚本（钉住提交 SHA），否则附脚本全文或钉住的版本（同 #291）。
  - 首屏：±0。
  - **订单页块路由**：PR 正文列出 base 上加载 `TradeOrders-*.js` 的路由及判定依据。这些路由的“路由新增”JS 合计（屏蔽哈希后的 gzip-9）增加不超过 **+900 B**（沿用 D461 / D476 的上限）；其他路由 ±0。各路由 CSS 的集合与字节都不变。
  - 上限只按 D461 / D476，本任务书不给试算数字或余量估计。超出先停下报设计角色与协调者，不得自行放宽预算。
- **R8 质量门**：`typecheck`、`lint`、CI-02 预检通过；PR CI 绿；合并后覆盖该合并提交的 main Full 绿（含 tests:trade-e2e 的浏览器分片，即“冲突域”中“必须继续成立”的断言）。
- **R9 可读性一节**：PR 正文按下节逐条说明。

## 性能考虑

- 渲染次数不变：不加 `memo`，不改 Hook 与查询键。不跑 Bench。
- 打包变化由 R7 约束。其余项（规模、索引、查询次数、分页、事务）不适用：不改数据访问。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥：

- **②**：本任务就是为满足 ② 而做。`OrderView` 从 186 行拆到每个函数 ≤ 80 行、嵌套 ≤ 3 层（R6a）。最大的一块是订单行表（`:112–175`，约 60 行），按“表头 / 行 / 合计行”拆即可。
- **③**：`order-view.tsx`（212 行）不是热点；本任务净减到 ≤ 120 行（R6b），新文件各 ≤ 200 行。PR 正文贴 `git diff --numstat`。
- **①**：组件与 Hook 名表达职责，如 `OrderKpis`、`OrderFacts`、`OrderLinesTable`、`OrderInvoiceActions`、`useOrderInvoicing`，不用 `Part1`、`Section2`。
- **④**：订单列表已拆成 `order-list-*.tsx`（REFAC-10）；本任务文件命名与分层对齐它，不抽跨页共用件。
- **⑤**：见决定 6。
- **⑥**：原有的“为什么”注释（`:10` 精确运算、`:36` TORD-07、`:41–42` TINV-02 决定 1、`:63` PG-01）随代码搬移，不删改。不留调试输出。

## 用户可见变化

- 无。订单详情的外观、文案、键盘与焦点行为、地址与请求都不变（R3、R4）。

## 证据要求

- **不需要浏览器时段**：行为等价由 R3（既有 jsdom 用例）与 R4（逐步 DOM、地址、请求与焦点等价）证明；tests:trade-e2e 中经过订单详情的步骤（“冲突域”所列）在合并后由覆盖合并提交的 main Full 的浏览器分片执行；口径同 REFAC-10。R4 与构建在本机运行，须服从协调者的时段静默通知（D442 / D480）。
- **可行性**（S13 回顾行动 4）：R4 的驱动方式已由 REFAC-06c（#256）、REFAC-05b（#265）、REFAC-07（#275）、REFAC-09（#285）、REFAC-10（#291）跑通；`trade-orders-fixtures.ts` 已有开票数量桩（`invoicingOf`）。R6a–R6c 的 base 数字见“现状”（设计角色实测）。本任务书**没有**做试改构建，R7 只按 D461 / D476 的上限判定。
- PR 正文附：R2 导出与 `git grep` 结果；R4 脚本、步骤清单、比较结果与两组场景的逐步输出；R5a–R5d 各表；R6 行数表（base 与 head 两列）；R7 的“构建来源”一节、路由清单与字节表；可读性一节。
- 证明类验收附脚本原文与未截断输出，或链接到固定修订（S13 回顾行动 6）；PR 正文写到的字节、计数都附原始输出（S15 回顾行动 1）。
