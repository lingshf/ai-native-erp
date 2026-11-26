# REFAC-10：拆分 `OrderList` 函数体（不改行为）

- Sprint：S19（[计划](S19.md)）　类型：重构（页面）　优先级：P2　决定：待协调者定编号　建议分支：`refac-10-split-order-list`
- 来源：[S18 候选池](S18.md#候选池s18-之后)第 1 项（“S19 首选，与 REFAC-09 同一写法”）；D477（TLIST-01 让 `OrderList` 206 → 209 行，例外内，仍超过 ②）。结构与验收照搬 [REFAC-09](REFAC-09-invoice-list-split.md)（#285），只换成订单列表的事实。
- 迁移：**不加**。浏览器时段：**不需要**（理由见“证据要求”）。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 现状（main `1638445`）

- `packages/web/src/trade-orders/order-list.tsx` 共 278 行（`(Get-Content …).Count`），不是热点（③ ≤ 800）：
  - 模块层（`:1–67`）：
    - 导入；`invoicingValues`、`invoicingTone`（`:19–21`）；`FilterState` 类型（`:22`）；
    - `orderListKey(company, filter)` = `["trade-orders", company, filter]`（`:23–24`）；
    - `restartOrderList` 对该键 `resetQueries(…, exact: true)`（`:27–28`，K7b 注释 `:25–26`）；
    - **已有**自定义 Hook `useOrderFilters(params, company, onFilter)`（`:34–66`，TORD-07 注释 `:30–33`）：`useQueryClient`、`useState(fresh)`、渲染期重置（`:44–45`）与 `show` / `apply` / `clear` / `refresh`（TLIST-01 注释 `:62`）/ `edit`。
  - `export function OrderList`（`:69–278`）：按 `files/fnlen.cjs` 口径（非空、非注释行）计 **209 行**，超过 ②。设计角色在 S18 计划时用该脚本实测；S19 计划期间处于 DEMO-18 静默窗口，用 PowerShell 按同一口径（去空行、去注释行）复核 `:69–278` 也是 209 行。
- `OrderList` 内部：
  - **Hook 调用**（源码顺序）：
    1. `useOrderFilters(params, company.code, onFilter)`（`:86–90`，展开后是 `useQueryClient`、`useState`）；
    2. `useInfiniteQuery`，键 `orderListKey(company.code, applied)`，`refetchOnMount: true`，每页 100 条，`queryFn` 中的 TORD-05 注释（`:91–103`）。

    没有 `useRef`、`useEffect`、虚拟化。
  - **派生值**：`rows`（`:104`）、`filtered`（`:105`）、`described`（`:106–109`，返回 `aria-*`）。
  - **JSX**（`:110–277`）：`FastTab id="tord-list"` 下依次为 7 个子表达式：
    1. `{broken && MessageBar}`（`:112–119`，含“清除”按钮）；
    2. `form.filter-bar.tord-filter`（`:120–207`）：五个字段（伙伴、方向、开票状态、起、止）与 `div.actions`（`:196–206`，应用 / 清除 / 刷新列表）；
    3. `{page.isPending && …}`（`:208`）；
    4. `{page.isError && MessageBar}`（`:209–216`，含“重试”）；
    5. `{page.isSuccess && rows.length === 0 && …}` 空状态（`:217–219`，按 `filtered` 区分两种文案）；
    6. `{rows.length > 0 && div.grid-wrap}`（`:220–263`）：8 列表头与行，行内订单号按钮调用 `onOpen`，开票状态用 `Badge`；
    7. `{page.hasNextPage && div.ui-form-actions}`（`:264–275`，加载更多）。
- 数字字面量：只有 `maxLength={60}`（`:130`）一处。URL 中的 `limit: "100"` 是字符串，不算。
- 导入方：`trade-orders/order-workspace.tsx:7`（`OrderList`，`:90` 渲染）；`TradeOrders.tsx:18`、`:52`（`restartOrderList`）。导出集合：`restartOrderList`、`OrderList`。`TradeOrders` 由路由表懒加载（`App.tsx:35–36`）。
- 测试：
  - jsdom：`packages/web/test/trade-orders.test.tsx` 1787 行、38 个用例（`^\s*it\(` 计数），热点；`trade-list-refresh.test.tsx` 317 行；
  - 真实 Chrome：`git grep -l -E "#tord-|tord\.(filter|list)" -- packages/infra/test/support` 在 `1638445` 上命中 3 个文件（见“冲突域”）。

## 范围与决定

1. **不改行为**。以下全部不变：
   - DOM 结构、类名、文本、属性（含 `id`、`aria-*`、`role`、`maxLength`、`noValidate`）；
   - 请求的方法、URL 与发出顺序；查询缓存的 `resetQueries` 时机与键；
   - `onFilter`、`onOpen` 的每次调用及参数（即地址写入与浏览器历史）；
   - 焦点行为（本列表没有自己的焦点还原，焦点只随 DOM 变化）。

   只改代码组织，不修 bug；拆分时发现的疑似缺陷登记在 PR 正文，留作后续任务。
2. **状态只有一个主人**：`useOrderFilters` 原样保留（可以搬到新文件，不改实现与注释），渲染期重置（`:44–45`）仍与它的 `useState` 在同一个函数里。`useInfiniteQuery` 留在 `OrderList`，或放进 `OrderList` 顶层无条件调用的新自定义 Hook（例如 `useOrderRows`）。新抽出的**展示组件不得调用任何 Hook**。展开自定义 Hook 后，Hook 调用序列（种类、先后、依赖数组源文本）与 base 相同（R5a）。
3. **组件层级对等**：新组件一律在模块顶层定义；抽出的组件只替换上面 7 个子表达式之一，或 `form` / `div.grid-wrap` 内部的一个子表达式，只渲染该表达式原来渲染的内容；不得把相邻兄弟合成一个返回 Fragment 的组件。条件渲染的条件（`broken`、`page.isPending`、`page.isError`、`page.isSuccess && rows.length === 0`、`rows.length > 0`、`page.hasNextPage`、两处 `invalid === …`）留在父级原位置。
4. **命令函数**：`useOrderFilters` 中各命令内 `restartOrderList`、`setState`、`onFilter` 的先后不变；`apply` 读取的 `draft`、`current` 仍是**该次渲染**的值。行按钮仍直接调用 `onOpen(row.orderId)`。
5. **文件**：新文件放在 `packages/web/src/trade-orders/` 下，以 `order-list-` 为前缀按职责命名（例如 `order-list-filter.tsx`（筛选栏）、`order-list-table.tsx`（表格）、`use-order-list.ts`），粒度由开发定，写入 PR 正文。`orderListKey`、`restartOrderList` 可以搬进新文件，但不改实现与注释；`restartOrderList` 仍须能从 `./trade-orders/order-list.tsx` 导入（R2）。
6. **具名常量**（⑤）：`60` 改为具名常量，值不变。URL 中的 `limit: "100"` 不改。
7. **不改**：
   - `OrderList`、`restartOrderList` 的导出名与签名；`TradeOrders.tsx`、`order-workspace.tsx` 与路由表；
   - `trade-orders/` 下的其他既有文件（`order-model.ts`、`order-view.tsx`、`order-lookup.tsx` 等，只导入）；`trade-order-link.ts`；
   - `packages/web/test/**`、`packages/infra/test/**`、`scripts/test-shard-weights.json`；
   - 标签（`ui/trade-order-labels.ts`、`ui/master-labels.ts`、`ui/trade-labels.ts`）、CSS、契约（`@erp/core`）。

## 冲突域

- web-ui:trade-orders 列表：只改 `packages/web/src/trade-orders/order-list.tsx`，并在 `packages/web/src/trade-orders/` 下新增以 `order-list-` 或 `use-order-list` 为前缀的文件。
- 取证所需观测点 / 新增测试文件：无（R4 脚本不提交）。
- 受影响的 e2e 断言（S13 回顾行动 1）：
  - 检索：`git grep -l -E "#tord-|tord\.(filter|list)" -- packages/infra/test/support`；
  - **必须继续成立**：在 `1638445` 上命中 3 个文件——`trade-gui/scenario/leave-guard.ts`、`order-invoicing-filter.ts`、`orders.ts`。它们依赖的 `id`（`#tord-filter-*`）、标签、按钮名与地址形状全部不变；
  - **须随本任务改**：无。
- 受影响的文档引用（D460）：`git grep -n -F "order-list.tsx" -- docs design` 在 `1638445` 上只命中 `design/` 下的历史任务书（README 的 TLIST-01 行、REFAC-05b、REFAC-07、S14、S17）与 `docs/demo/v0.14.0/run-through.md:26`，都是当时的事实记录，不改。
- 与 S19 其他任务不相交：TLIST-03 只改 `Accounts.tsx`、`ui/master-labels.ts` 与 `accounts.test.tsx`（本任务都不改）。

## 验收

### base 失败、head 通过

| 编号 | 检查 | base `1638445` | head 要求 |
| --- | --- | --- | --- |
| R6a | `node fnlen.cjs packages/web/src/trade-orders`（口径同 S16–S18）中 `OrderList` 的行数 | **209**（失败） | ≤ 80，且 `trade-orders/` 下没有本任务新增或改动的函数 > 80 |
| R6b | `(Get-Content packages/web/src/trade-orders/order-list.tsx).Count` | **278**（失败） | ≤ 160 |
| R6c | `OrderList` 及其新抽出的组件中的数字字面量 `60`（不含 URL 字符串） | 1 处（失败） | 0 处，改用具名常量（决定 6） |

- R6b 的上限低于 REFAC-09 的 200：`useOrderFilters`（约 35 行）已在本文件，若整体搬走，剩余部分远低于 160；留在本文件也够用。

### 两侧都须成立的不变量

- **R1 范围**：`git diff --name-only <base> <head>` 只含 `order-list.tsx` 和“冲突域”允许的新文件；决定 7 列出的文件 diff 为空。不加迁移。
- **R2 导出不变**：`order-list.tsx` 的导出集合（名称加类别）与 base 相同，即 `restartOrderList`（const）与 `OrderList`（function）；搬走时用再导出保持；用仓库根 devDependency `@babel/parser` 解析，口径同 [REFAC-03 M2c（D433）](S13.md#refac-03拆分-journalstsx只搬移不改行为)。新文件的导出只供 `trade-orders/` 内部使用（PR 正文附 `git grep` 结果）。
- **R3 既有测试原样通过**：`trade-orders.test.tsx` 的 38 个用例、`trade-list-refresh.test.tsx` 和 Web 全部 jsdom 测试通过；测试文件 diff 为空。
- **R4 DOM、地址、请求与焦点等价**（送审证据，脚本不提交，不加常驻 CI 用例）：
  - **驱动**：临时 jsdom 驱动脚本，借用 `trade-orders.test.tsx` 的渲染方式、`QueryClient` 配置与 `fetch` 桩（“加载更多”桩在 `:255–302` 一带），通过 `App` 渲染订单页（`#/trade-orders?company=DEFAULT`），在 base 与 head 上按同一序列操作。
  - `fetch` 桩改为**受控响应**，采样边界同 [REFAC-09 R4](REFAC-09-invoice-list-split.md#验收)。
  - **序列**至少包含：
    - 首屏加载；0 行（未筛选与已筛选两种空状态）；有行；
    - 加载更多；
    - 筛选：伙伴格式错误、日期区间错误（`aria-invalid` 与提示）、改输入后错误消失、按开票状态筛选、合法应用、Enter 应用、清除；
    - 刷新列表（TLIST-01）：已加载两页时刷新，筛选栏有未应用输入时刷新；
    - 地址筛选无效（`broken`）提示与其中的“清除”；
    - 点行内订单号打开订单（`onOpen`）→ 返回列表；
    - 列表请求失败 → “重试”；
    - 切换公司（筛选输入重置）；zh / en。
  - **每步采样**：DOM（`document.body.innerHTML`）；焦点（`document.activeElement` 的 `id` 或标签名加文本）；`window.location.hash` 与 `history.length`；累计请求日志（序号、方法、URL、结果）；查询缓存（`queryKey`、`status`、`isInvalidated`，按键排序）。
  - **判定**：base 与 head 逐步、逐项、逐字节相同。PR 正文附脚本全文、步骤清单（含每步释放的请求序号）、两边输出的 SHA-256 与比较结果，以及“刷新列表”与“筛选校验错误”两组场景的逐步输出原文。
- **R5 结构规则**（静态，评审按代码与 PR 表格核对）：
  - **R5a Hook 序列**：PR 正文列出 base 与 head 的 Hook 调用序列（自定义 Hook 按调用处展开；每行写种类和依赖数组源文本，空白归一，没有依赖数组的写“无”），两边逐行相同；并写明渲染期重置（`:44–45`）在 head 中所在的函数（决定 2）。
  - **R5b 展示组件无 Hook**：新抽出的组件中没有任何 `use*` 调用；PR 正文附 Babel AST 检查脚本的输出。
  - **R5c 模块级定义**：所有组件与自定义 Hook 都在模块顶层声明。
  - **R5d 插槽对等**：PR 正文用一张表列出 base 中 `FastTab#tord-list` 的 7 个子表达式以及 `form` / `div.grid-wrap` 内被抽出的子表达式，标出 head 中对应的唯一组件或表达式。
  - **R5e 副作用顺序**：PR 正文逐函数对照 base 与 head 中 `show`、`apply`、`clear`、`refresh` 与行按钮处理器内的 `restartOrderList`、`setState`、`onFilter`、`onOpen` 序列。
- **R6 尺寸**：除上表 R6a–R6c 外，`trade-orders/` 下每个新文件 ≤ 300 行；每个新函数满足 ②（≤ 80 行、嵌套 ≤ 3 层）；PR 正文列出所有超过 60 行的函数，附计数行数与最深层数。
- **R7 打包字节**（D432：构建条件、依赖图、字节口径同 [S14 REFAC-06](S14.md#refac-06拆分-tradeinvoicestsx只搬移不改行为)；首屏：D454，见[任务书模板](TEMPLATE.md)“首屏比对”）：
  - PR 正文须有“构建来源”一节（[任务书模板](TEMPLATE.md)“证据要求”，含 S17 回顾行动 3 的干净性证明）。base 为最终送审 head 的实际合并基；合并基变了就重新测量。
  - 首屏：±0。
  - **订单页块路由**：PR 正文列出 base 上加载 `TradeOrders-*.js` 的路由及判定依据。这些路由的“路由新增”JS 合计（屏蔽哈希后的 gzip-9）增加不超过 **+900 B**（沿用 D461 / D476 的上限）；其他路由 ±0。各路由 CSS 的集合与字节都不变。
  - 上限只按 D461 / D476，本任务书不给试算数字或余量估计。超出先停下报设计角色与协调者，不得自行放宽预算。
- **R8 质量门**：`typecheck`、`lint`、CI-02 预检通过；PR CI 绿；合并后覆盖该合并提交的 main Full 绿（含 tests:trade-e2e 的浏览器分片，即“冲突域”中“必须继续成立”的断言）。
- **R9 可读性一节**：PR 正文按下节逐条说明。

## 性能考虑

- 渲染次数不变：不加 `memo`，不改 Hook 依赖；渲染期重置留在原函数（决定 2）。不跑 Bench。
- 打包变化由 R7 约束。
- 其余项（规模、索引、查询次数、分页、事务）不适用：不改数据访问。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥：

- **②**：本任务就是为满足 ② 而做。`OrderList` 从 209 行拆到每个函数 ≤ 80 行、嵌套 ≤ 3 层（R6a）。最大的一块是筛选栏（`:120–207`，88 行）：它本身也须 ≤ 80 行，可按字段或“字段组 / 操作区”再分（仍守决定 3）。
- **③**：`order-list.tsx`（278 行）不是热点；本任务净减到 ≤ 160 行（R6b），新文件各 ≤ 300 行。PR 正文贴 `git diff --numstat`。
- **①**：组件与 Hook 名表达职责，如 `OrderFilterBar`、`OrderRows`、`useOrderRows`，不用 `Part1`、`Section2`。
- **④**：发票列表已拆出 `invoice-list-filter.tsx`、`invoice-list-table.tsx`、`invoice-list-bars.tsx`（REFAC-09）。两边的筛选栏与表格字段不同（订单有开票状态、无虚拟化），本任务**不**抽跨页共用件；文件命名与分层对齐 REFAC-09，便于对照阅读。
- **⑤**：见决定 6。
- **⑥**：原有的“为什么”注释（K7b `:25–26`、TORD-07 `:30–33`、TLIST-01 `:62`、TORD-05 `:96`）随代码搬移，不删改。不留调试输出。

## 用户可见变化

- 无。页面外观、文案、键盘与焦点行为、地址与请求都不变（R3、R4）。

## 证据要求

- **不需要浏览器时段**：行为等价由 R3（既有 jsdom 用例）与 R4（逐步 DOM、地址、请求与焦点等价）证明；tests:trade-e2e 中经过订单列表的步骤（“冲突域”所列）在合并后由覆盖合并提交的 main Full 的浏览器分片执行；口径同 REFAC-09。R4 与构建在本机运行，须服从协调者的时段静默通知（D442 / D480）。
- **可行性**（S13 回顾行动 4）：R4 的驱动方式已由 REFAC-06c（#256）、REFAC-05b（#265）、REFAC-07（#275）、REFAC-09（#285）跑通；`trade-orders.test.tsx` 已有“加载更多”的 `fetch` 桩（`:255–302` 一带）。R6a–R6c 的 base 数字见“现状”（设计角色实测）。本任务书**没有**做试改构建（S19 计划期间处于 DEMO-18 静默窗口），R7 只按 D461 / D476 的上限判定。
- PR 正文附：R2 导出与 `git grep` 结果；R4 脚本、步骤清单、比较结果与两组场景的逐步输出；R5a–R5e 各表；R6 行数表（base 与 head 两列）；R7 的“构建来源”一节、路由清单与字节表；可读性一节。
- 证明类验收附脚本原文与未截断输出，或链接到固定修订（S13 回顾行动 6）；PR 正文写到的字节、计数都附原始输出（S15 回顾行动 1）。
