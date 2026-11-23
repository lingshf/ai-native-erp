# REFAC-09：拆分 `InvoiceList` 函数体（不改行为）

- Sprint：S18（[计划](S18.md)）　类型：重构（页面）　优先级：P2　决定：待协调者定编号　建议分支：`refac-09-split-invoice-list`
- 来源：[S17 回顾 S18 候选](../reviews/S17-retro.md#s18-候选产品负责人建议)第 1 项；[S17 评审](../reviews/S17.md)遗留 6（`InvoiceList` 290 → 294，D477 例外内，仍超过 ②）。结构与验收照搬 [REFAC-07](REFAC-07-action-entry-split.md)（#275），只换成发票列表的事实。
- 迁移：**不加**。浏览器时段：**不需要**（理由见“证据要求”）。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 现状（main `350e77a`）

- `packages/web/src/trade-invoices/invoice-list.tsx` 共 335 行（`(Get-Content …).Count`），不是热点（③ ≤ 800）：
  - 模块层（`:1–28`）：导入；`invoiceListKey(company, filter)` = `["trade-invoices", company, filter]`（`:23–24`）；`restartInvoiceList` 对该键 `resetQueries(…, exact: true)`（`:26–27`，注释写明“应用、清除、刷新列表都从第一页重读”）；
  - `export function InvoiceList`（`:29–335`）：按 `files/fnlen.cjs` 口径（非空、非注释行）计 **294 行**，超过 ②（`node fnlen.cjs packages/web/src/trade-invoices` 输出 `294	…invoice-list.tsx:29-335	InvoiceList`）。
- `InvoiceList` 内部：
  - **Hook 调用**（源码顺序）：
    1. `useQueryClient`（`:42`）；
    2. `useState(fresh)`（`:49`），紧接着渲染期重置：`current = filter.key === key ? filter : fresh()`，不同则 `setFilter(current)`（`:50–51`，TINV-07：已应用的筛选或公司变化时，未应用的输入随之重置）；
    3. `useInfiniteQuery`，键 `invoiceListKey(company.code, applied)`，`refetchOnMount: true`，每页 100 条（`:53–70`）；
    4. `useRef` `scroll`（`:96`）；
    5. `useRef` `opened`（`:104`）、`useRef` `closedId`（`:105`）；
    6. `useEffect`，依赖 `[invoice]`，关闭详情后把焦点还给触发按钮，找不到时还给列表（`:108–117`）；
    7. `useVirtualizer`（`:119–124`）。
  - **命令**：`show`（`:73–77`：先 `restartInvoiceList`，再 `setFilter`，再 `write`）、`apply`（`:78–87`，校验伙伴格式与日期区间）、`clear`（`:88`）、`refresh`（`:89`，TLIST-01）、`edit`（`:90–91`）、`described`（`:92–95`，返回 `aria-*`）；行按钮的内联处理器（`:275–278`：写 `opened.current` 再 `write({ invoice })`）；详情 `close`（`:327–330`：写 `closedId.current` 再 `write({ invoice: null })`）。
  - **JSX**（`:141–334`）：`div.card.tinv-list` 下依次为 8 个子表达式：
    1. `header`（`:142–144`）；
    2. `{broken && MessageBar}`（`:146–153`，含“清除”按钮）；
    3. `form.filter-bar.tinv-filter`（`:155–225`）：四个字段（伙伴、方向、起、止）与 `div.actions`（`:215–225`，应用 / 清除 / 刷新列表）；
    4. `{page.isPending && …}`（`:227`）；
    5. `{page.isError && MessageBar}`（`:228–235`）；
    6. `section.grid-wrap.tinv-list-scroll`（`:236–303`）：表头、虚拟行、空状态；
    7. `{page.hasNextPage && div.tinv-more}`（`:304–315`）；
    8. `{invoice && TradeInvoiceDetail}`（`:316–333`）。
- 数字字面量：虚拟化阈值 `100`（`:118`）；行高 `44` 两处（`:122` `estimateSize`、`:265` 行 `style`）；`overscan: 5`（`:123`）；`maxLength={60}`（`:166`）。URL 中的 `limit=100` 是字符串，不算；`aria-rowindex={index + 2}` 的 `2` 是表头偏移，不算。
- 唯一导入方：`TradeInvoices.tsx:18`（导入）与 `:194`（渲染）；`TradeInvoices` 由路由表懒加载（`App.tsx:32–33`）。
- 测试：
  - jsdom：`packages/web/test/trade-invoices.test.tsx` 1269 行、24 个用例（`^\s*it\(` 计数），热点；`trade-list-refresh.test.tsx` 317 行；`trade-invoice-links.test.tsx`；
  - 真实 Chrome：`git grep -l -E "#tinv-|tinv\.(filter|list)" -- packages/infra/test/support` 在 `350e77a` 上命中 8 个文件（见“冲突域”）。

## 范围与决定

1. **不改行为**。以下全部不变：
   - DOM 结构、类名、文本、属性（含 `id`、`aria-*`、`role`、`maxLength`、`tabIndex`、行 `style`）；
   - 请求的方法、URL 与发出顺序；查询缓存的 `resetQueries` 时机与键；
   - 地址写入（`write` 的每次调用及参数）与浏览器历史；
   - 关闭详情后的焦点去向；
   - 虚拟化阈值、行高、`overscan`。

   只改代码组织，不修 bug；拆分时发现的疑似缺陷登记在 PR 正文，留作后续任务。
2. **状态只有一个主人**：所有 Hook 调用要么留在 `InvoiceList`，要么放进它在顶层无条件调用的自定义 Hook（例如 `useInvoiceFilters`、`useInvoiceRows`、`useDetailFocus`，名称由开发定）。新抽出的**展示组件不得调用任何 Hook**。展开自定义 Hook 后，Hook 调用序列（种类、先后、依赖数组源文本）与 base 相同（R5a）。**渲染期重置（`:50–51`）必须与它的 `useState` 在同一个函数里**，不得拆到别的组件或 effect 中（否则会多一次提交，R4 的 DOM 序列会变）。
3. **组件层级对等**：新组件一律在模块顶层定义；抽出的组件只替换上面 8 个子表达式之一，或 `form` / `section` 内部的一个子表达式，只渲染该表达式原来渲染的内容；不得把相邻兄弟合成一个返回 Fragment 的组件。条件渲染的条件（`broken`、`page.isPending`、`page.isError`、`page.hasNextPage`、`invoice`、`before > 0`、`after > 0`、空状态）留在父级原位置。
4. **命令函数**：`show`、`apply`、`clear`、`refresh`、`edit` 与行按钮、`close` 的处理器可以搬进自定义 Hook，也可以搬成模块级函数（显式接收所需的值与 setter）。每个函数内 `restartInvoiceList`、`setFilter`、`write`、ref 写入的先后不变；`apply` 读取的 `draft`、`current` 仍是**该次渲染**的值。
5. **文件**：新文件放在 `packages/web/src/trade-invoices/` 下，以 `invoice-list-` 为前缀按职责命名（例如 `invoice-list-filter.tsx`（筛选栏）、`invoice-list-table.tsx`（表格与虚拟行）、`use-invoice-list.ts`），粒度由开发定，写入 PR 正文。`invoiceListKey`、`restartInvoiceList` 可以搬进新文件，但不改实现与注释。
6. **具名常量**（⑤）：`100`（虚拟化阈值）、`44`（行高，两处共用一个常量）、`5`、`60` 各改为具名常量，值不变。URL 中的 `limit=100` 不改。
7. **不改**：
   - `InvoiceList` 的导出名与 props；`TradeInvoices.tsx` 与路由表；
   - `trade-invoices/` 下的其他既有文件（`invoice-link.ts`、`invoice-model.ts`、`source-order.tsx`、`preview-panel.tsx` 等，只导入）；
   - `packages/web/test/**`、`packages/infra/test/**`、`scripts/test-shard-weights.json`；
   - 标签（`ui/trade-labels.ts`、`ui/trade-invoice-detail-labels.ts`）、CSS、契约（`@erp/core`）。

## 冲突域

- web-ui:trade-invoices 列表：只改 `packages/web/src/trade-invoices/invoice-list.tsx`，并在 `packages/web/src/trade-invoices/` 下新增以 `invoice-list-` 或 `use-invoice-list` 为前缀的文件。
- 取证所需观测点 / 新增测试文件：无（R4 脚本不提交）。
- 受影响的 e2e 断言（S13 回顾行动 1）：
  - 检索：`git grep -l -E "#tinv-|tinv\.(filter|list)" -- packages/infra/test/support`；
  - **必须继续成立**：在 `350e77a` 上命中 8 个文件——`trade-gui-invoice-links.ts`、`trade-gui/scenario/invoice-detail.ts`、`invoice-entry.ts`、`invoice-filters.ts`、`invoice-source-orders.ts`、`leave-guard.ts`、`orders.ts`、`trade-gui/smoke/pages.ts`。它们依赖的 `id`（`#tinv-filter-*`）、标签、按钮名与地址形状全部不变；
  - **须随本任务改**：无。
- 受影响的文档引用（D460）：`git grep -n -F "invoice-list.tsx" -- docs design ':!docs/demo/*/logs/*'` 在 `350e77a` 上只命中 `design/` 下的历史任务书（REFAC-06c、REFAC-07、README 的 TLIST-01 行），都是当时的事实记录，不改。
- 与 S18 其他任务不相交：RUNMAIN-01 只新增 `scripts/demo/` 下的文件；TLIST-02 改 `TradeMaster.tsx`、`ui/trade-labels.ts`（本任务不改该文件）与 `trade-master.test.tsx`。

## 验收

### base 失败、head 通过

| 编号 | 检查 | base `350e77a` | head 要求 |
| --- | --- | --- | --- |
| R6a | `node fnlen.cjs packages/web/src/trade-invoices`（口径同 S16 / S17）中 `InvoiceList` 的行数 | **294**（失败） | ≤ 80，且 `trade-invoices/` 下没有本任务新增或改动的函数 > 80 |
| R6b | `(Get-Content packages/web/src/trade-invoices/invoice-list.tsx).Count` | **335**（失败） | ≤ 200 |
| R6c | `InvoiceList` 中的数字字面量 `100`、`44`、`5`、`60`（不含 URL 字符串与 `index + 2`） | 5 处（失败） | 0 处，改用具名常量（决定 6） |

### 两侧都须成立的不变量

- **R1 范围**：`git diff --name-only <base> <head>` 只含 `invoice-list.tsx` 和“冲突域”允许的新文件；决定 7 列出的文件 diff 为空。不加迁移。
- **R2 导出不变**：`invoice-list.tsx` 的导出集合（名称加类别）与 base 相同，即只有 `InvoiceList`；用仓库根 devDependency `@babel/parser` 解析，口径同 [REFAC-03 M2c（D433）](S13.md#refac-03拆分-journalstsx只搬移不改行为)。新文件的导出只供 `trade-invoices/` 内部使用（PR 正文附 `git grep` 结果）。
- **R3 既有测试原样通过**：`trade-invoices.test.tsx` 的 24 个用例、`trade-list-refresh.test.tsx`、`trade-invoice-links.test.tsx` 和 Web 全部 jsdom 测试通过；测试文件 diff 为空。
- **R4 DOM、地址、请求与焦点等价**（送审证据，脚本不提交，不加常驻 CI 用例）：
  - **驱动**：临时 jsdom 驱动脚本，借用 `trade-invoices.test.tsx` 的渲染方式、`QueryClient` 配置与 `fetch` 桩，通过 `App` 渲染发票页（`#/trade-invoices?company=DEFAULT`），在 base 与 head 上按同一序列操作。
  - `fetch` 桩改为**受控响应**，采样边界同 [REFAC-07 R4](REFAC-07-action-entry-split.md#验收)（操作 → 释放约定响应 → `act` 等待到待决队列与 `isFetching` 满足约定、连续两次 `act` 后 DOM 不变 → 采样；不满足即报错退出）。
  - **序列**至少包含：
    - 首屏加载；0 行（未筛选与已筛选两种空状态）；≤ 100 行；> 100 行（虚拟化，滚动到中段与末尾）；
    - 加载更多；
    - 筛选：伙伴格式错误、日期区间错误（`aria-invalid` 与提示）、改输入后错误消失、合法应用、Enter 应用、清除；
    - 刷新列表（TLIST-01）：已加载两页时刷新，筛选栏有未应用输入时刷新；
    - 地址筛选无效（`broken`）提示与其中的“清除”；
    - 打开详情（行按钮）→ 关闭 → 焦点回到触发按钮；深链接 `invoice=` 不在已加载行中 → 关闭 → 焦点回到列表；
    - 列表请求失败 → “重试”；
    - 切换公司（筛选输入重置）；zh / en。
  - **每步采样**：DOM（`document.body.innerHTML`）；焦点（`document.activeElement` 的 `id` 或标签名加文本）；`window.location.hash` 与 `history.length`；累计请求日志（序号、方法、URL、结果）；查询缓存（`queryKey`、`status`、`isInvalidated`，按键排序）。
  - **判定**：base 与 head 逐步、逐项、逐字节相同。PR 正文附脚本全文、步骤清单（含每步释放的请求序号）、两边输出的 SHA-256 与比较结果，以及“刷新列表”与“关闭详情后的焦点”两组场景的逐步输出原文。
- **R5 结构规则**（静态，评审按代码与 PR 表格核对）：
  - **R5a Hook 序列**：PR 正文列出 base 与 head 的 Hook 调用序列（自定义 Hook 按调用处展开；每行写种类和依赖数组源文本，空白归一，没有依赖数组的写“无”），两边逐行相同；并写明渲染期重置（`:50–51`）在 head 中所在的函数（决定 2）。
  - **R5b 展示组件无 Hook**：新抽出的组件中没有任何 `use*` 调用；PR 正文附 Babel AST 检查脚本的输出。
  - **R5c 模块级定义**：所有组件与自定义 Hook 都在模块顶层声明。
  - **R5d 插槽对等**：PR 正文用一张表列出 base 中 `div.tinv-list` 的 8 个子表达式以及 `form` / `section` 内被抽出的子表达式，标出 head 中对应的唯一组件或表达式。
  - **R5e 副作用顺序**：PR 正文逐函数对照 base 与 head 中 `show`、`apply`、`refresh`、行按钮与 `close` 处理器内的 `restartInvoiceList`、`setFilter`、`write`、ref 写入序列。
- **R6 尺寸**：除上表 R6a–R6c 外，`trade-invoices/` 下每个新文件 ≤ 300 行；每个新函数满足 ②（≤ 80 行、嵌套 ≤ 3 层）；PR 正文列出所有超过 60 行的函数，附计数行数与最深层数。
- **R7 打包字节**（构建条件、依赖图、D432 字节口径同 [S14 REFAC-06](S14.md#refac-06拆分-tradeinvoicestsx只搬移不改行为)；首屏按 D454，见[任务书模板](TEMPLATE.md)“首屏比对”）：
  - PR 正文须有“构建来源”一节（[任务书模板](TEMPLATE.md)“证据要求”，含 S17 回顾行动 3 的干净性证明）。base 为最终送审 head 的实际合并基；合并基变了就重新测量。
  - 首屏：±0。
  - **发票页块路由**：PR 正文列出 base 上加载 `TradeInvoices-*.js` 的路由及判定依据。这些路由的“路由新增”JS 合计（屏蔽哈希后的 gzip-9）增加不超过 **+900 B**（沿用 D461 / D476 的上限）；其他路由 ±0。各路由 CSS 的集合与字节都不变。
  - 上限只按 D461 / D476，本任务书不给试算数字或余量估计。超出先停下报设计角色与协调者，不得自行放宽预算。
- **R8 质量门**：`typecheck`、`lint`、CI-02 预检通过；PR CI 绿；合并后覆盖该合并提交的 main Full 绿（含 tests:trade-e2e 的浏览器分片，即“冲突域”中“必须继续成立”的断言）。
- **R9 可读性一节**：PR 正文按下节逐条说明。

## 性能考虑

- 渲染次数不变：不加 `memo`，不改 Hook 依赖；渲染期重置留在原函数（决定 2）。不跑 Bench。
- 打包变化由 R7 约束。
- 其余项（规模、索引、查询次数、分页、事务）不适用：不改数据访问。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥：

- **②**：本任务就是为满足 ② 而做。`InvoiceList` 从 294 行拆到每个函数 ≤ 80 行、嵌套 ≤ 3 层（R6a）。
- **③**：`invoice-list.tsx`（335 行）不是热点；本任务净减到 ≤ 200 行（R6b），新文件各 ≤ 300 行。PR 正文贴 `git diff --numstat`。
- **①**：组件与 Hook 名表达职责，如 `InvoiceFilterBar`、`InvoiceRows`、`useDetailFocus`，不用 `Part1`、`Section2`。
- **④**：订单列表 `OrderList` 有相似的筛选栏与虚拟行，但本任务**不**抽跨页共用件（`OrderList` 的拆分排在 S19，见[候选池](S18.md#候选池s18-之后)）；发票列表内部重复的两段 `aria-*` 由既有 `described` 负责，不再加一层。
- **⑤**：见决定 6。
- **⑥**：原有的“为什么”注释（TINV-07 筛选来源 `:43–45`、详情地址与 P5 / P6 `:97–101`、焦点还原 `:106–107`、`biome-ignore` 两处）随代码搬移，不删改。不留调试输出。

## 用户可见变化

- 无。页面外观、文案、键盘与焦点行为、地址与请求都不变（R3、R4）。

## 证据要求

- **不需要浏览器时段**：行为等价由 R3（既有 jsdom 用例）与 R4（逐步 DOM、地址、请求与焦点等价）证明；tests:trade-e2e 中经过发票列表的步骤（“冲突域”所列）在合并后由覆盖合并提交的 main Full 的浏览器分片执行；口径同 REFAC-07。R4 在本机运行，须服从协调者的时段停用通知（D442）。
- **可行性**（S13 回顾行动 4）：R4 的驱动方式已由 REFAC-06c（#256）、REFAC-05b（#265）、REFAC-07（#275）跑通；`trade-invoices.test.tsx` 已有“加载更多”的 `fetch` 桩（`:1084`）与焦点还原用例。R6a–R6c 的 base 数字由设计角色在 `350e77a` 上实跑（见“现状”与 S18 计划 PR 正文）。
- PR 正文附：R2 导出与 `git grep` 结果；R4 脚本、步骤清单、比较结果与两组场景的逐步输出；R5a–R5e 各表；R6 行数表（base 与 head 两列）；R7 的“构建来源”一节、路由清单与字节表；可读性一节。
- 证明类验收附脚本原文与未截断输出，或链接到固定修订（S13 回顾行动 6）；PR 正文写到的字节、计数都附原始输出（S15 回顾行动 1）。
