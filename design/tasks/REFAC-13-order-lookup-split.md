# REFAC-13：拆分 `OrderLookup` 函数体（不改行为）

- Sprint：S23（[计划](S23.md)）　类型：重构（页面）　优先级：P2　决定：待协调者定编号　建议分支：`refac-13-split-order-lookup`
- 来源：[S22 候选池](S22.md#候选池s22-之后)第 1 项（“按 ② 拆 `OrderLookup`（143 行）；与 REFAC-10 / 11 同目录；S23 起可排”）。结构与验收照搬 [REFAC-11](REFAC-11-order-view-split.md) 和 [REFAC-12](REFAC-12-settlement-entry-split.md)，只换成“查找订单”的事实。
- 迁移：**不加**。浏览器时段：**不需要**（理由见“证据要求”）。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 为什么是它

- `OrderLookup` 按 `files/fnlen.cjs` 口径（非空、非注释行）为 **143 行**，是 `trade-orders/` 目录中最后一个超过 ②（≤ 80）的函数。同目录的 `OrderWorkspace`、`OrderList`、`OrderView` 已由 REFAC-05b、REFAC-10、REFAC-11 拆完。
- 它承载订单深链接的口径：列表、表单或地址栏选中的订单号各触发一次查找；新的选择会作废进行中的请求（`latest` 序号）；结果出现后焦点移到结果区；400 / 404 / 其他错误分别给出“格式不对”“未找到”“重试”。后续订单相关的打磨（例如候选池中的“保留前进历史”）都会经过这里，先拆小可以缩小后续评审面。
- 一个 Sprint 只做一个页面函数体拆分（S18 定的节奏）；S22 拆的是 `SettlementEntry`（REFAC-12，#311）。

## 现状（main `eac0c37`）

- `packages/web/src/trade-orders/order-lookup.tsx` 共 156 行，只导出 `OrderLookup`（`:9–156`）。设计角色在 `eac0c37` 上用 `node files/fnlen.cjs packages/web/src/trade-orders` 实测，输出 `143	packages/web/src/trade-orders/order-lookup.tsx:9-156	OrderLookup`。
- **Hook 调用**（源码顺序，R5a 的 base 一侧）：
  1. `useState`：`orderId`（`:26`）、`busy`（`:27`）、`result`（`:28`）、`error`（`:29`）、`focusResult`（`:30`）；
  2. `useRef`：`resultRef`（`:31`）、`latest`（`:32`）；
  3. `useState` `failed`（`:33`）；
  4. `useEffect`，依赖 `[request]`（`:37–52`）：`request` 为空时递增 `latest` 并清空忙、结果与错误；否则写入订单号、展开折叠的“查找订单”页签（点击 `[aria-controls="tord-lookup-body"][aria-expanded="false"]`）、记下是否聚焦，并调用 `run`；
  5. `useLayoutEffect`，依赖 `[focusResult, result]`（`:53–58`）：有结果且要求聚焦时聚焦结果区。
- **命令函数**：`lookup`（`:59–63`，表单提交，忙时忽略）；`run`（`:66–97`，异步：递增 `latest` 取票号；用 `tradeOrderCommandSchema.shape.orderId` 先做格式检查；`masterRequest` 请求 `/api/v1/trade/orders/<id>?company=<code>`；错误映射为 400 → `tord.issue.shape`、404 且 `code` 为 `NOT_FOUND` → `tord.notFound`、其余 → `master.error`；只有票号仍是最新时才写结果、错误与忙状态）。
- **JSX**（`:98–155`）：`FastTab#tord-lookup` 下 4 个子表达式：
  1. `form.filter-bar.tord-lookup`（`:100–116`）：订单号输入（`maxLength={60}`，`:105`）与“查找”按钮；
  2. `{busy && <p role="status">…}`（`:117`）；
  3. `{error && MessageBar}`（`:118–140`）：`master.error` 时是“重试”，其他错误时是“返回列表”（调用 `onBack` 并把焦点移到 `[aria-controls="tord-list-body"]`）；
  4. `{result && section.tord-lookup-result}`（`:141–153`）：标题、订单号徽标与 `OrderView`。
- **数字字面量**（`OrderLookup` 内）：`60`（订单号最大长度，`:105`）；`400`、`404`（HTTP 状态，`:88`、`:90`）。
- 导入方：只有 `trade-orders/order-workspace.tsx:8`（导入）与 `:99`（渲染）。所在块为路由懒加载的 `TradeOrders`（`App.tsx:35–36`，manifest 键 `src/TradeOrders.tsx`）。
- 测试：
  - jsdom：`packages/web/test/trade-orders.test.tsx` 1787 行、38 个用例。涉及查找的用例至少有 `:206`（只读查找与未知订单号）、`:250`（列表翻页并用键盘经查找打开订单）、`:358`（查找页签折叠时仍能打开）、`:837`（查找后读取开票数量），以及 `:992`、`:1042`（“返回列表”）、`:1277`、`:1306`、`:1475` 附近的断言。
  - 真实 Chrome：`git grep -n -e tord-lookup -e lookupId -e "tord.lookup" -- packages/infra/test` 在 `eac0c37` 上只命中 `trade-gui/scenario/orders.ts:97`（等待名为 `tord.lookupTitle` 的 region）。

## 范围与决定

1. **不改行为**。以下全部不变：DOM 结构、类名、文本、属性（含 `id`、`aria-*`、`role`、`tabIndex`、`maxLength`）；请求的方法、URL 与发出顺序；`latest` 序号的递增与比较；焦点行为（结果区聚焦、“返回列表”后的焦点）；展开折叠页签的方式。只改代码组织，不修 bug；拆分时发现的疑似缺陷登记在 PR 正文，留作后续任务。
2. **Hook 顺序不变**：Hook 可以留在 `OrderLookup`，也可以放进它顶层无条件调用的自定义 Hook（例如 `useOrderLookup`：8 个状态与 ref、两个 effect、`run`）。**展示组件不得调用任何 Hook**。展开自定义 Hook 后，Hook 调用序列（种类、先后、依赖的源文本，空白归一）与“现状”所列的 base 序列逐项相同（R5a）。`// biome-ignore` 注释随 `useEffect` 搬移，内容不变。
3. **命令函数**：`lookup`、`run` 可以搬进自定义 Hook，或搬到同目录的普通模块函数（以参数接收状态与 setter）。`run` 中 `await` 的先后、票号比较的位置、错误映射的分支顺序都不变。错误映射可以抽成一个纯函数（输入异常，输出标签键），映射结果逐项不变。
4. **组件层级对等**：新组件一律在模块顶层定义。抽出的组件只替换上面 4 个子表达式之一；只渲染该表达式原来渲染的内容，不把相邻兄弟合成一个返回 Fragment 的组件。条件渲染的条件（`busy`、`error`、`result`、`error === "master.error"`）留在父级原位置，或留在被抽出组件内与原来相同的位置。
5. **具名常量**（⑤）：订单号最大长度 `60` 用一个具名常量，值不变；`400`、`404` 若随错误映射搬到纯函数中，也各用一个具名常量。
6. **文件**：新文件放在 `packages/web/src/trade-orders/`，以 `order-lookup-` 或 `use-order-lookup` 为前缀，按职责命名（例如 `order-lookup-form.tsx`、`order-lookup-error.tsx`、`order-lookup-result.tsx`、`use-order-lookup.ts`）。粒度由开发定，写入 PR 正文。`OrderLookup` 仍从 `./order-lookup.tsx` 导出（`order-workspace.tsx` 不改，R2）。
7. **不改**：
   - `OrderLookup` 的导出名与 props；`order-workspace.tsx`、`TradeOrders.tsx`、`App.tsx` 与路由表；
   - `trade-orders/` 下的其他既有文件（`order-model.ts`、`order-view.tsx`、`order-list.tsx` 等，只导入）；`master-data-client.ts`；
   - 标签（`ui/trade-order-labels.ts` 等）、CSS（`pages/trade-orders.css` 等）、契约（`@erp/core`）；
   - `packages/web/test/**`、`packages/infra/test/**`、`scripts/test-shard-weights.json`。

## 冲突域

- web-ui:trade-orders：只改 `packages/web/src/trade-orders/order-lookup.tsx`，并在 `packages/web/src/trade-orders/` 新增 `order-lookup-*` / `use-order-lookup*` 文件。
- 取证所需的观测点和新增测试文件：无（R4 脚本不提交）。
- 受影响的 e2e 断言（S13 回顾行动 1）：
  - 检索见“现状”；
  - **必须继续成立**：`trade-gui/scenario/orders.ts:97` 所在的订单场景（等待“查找订单”结果 region）；
  - **须随本任务改**：无。
- 受影响的文档引用（D460）：`git grep -n -F "order-lookup" -- docs design` 在 `eac0c37` 上只命中 `design/` 下的历史文档（REFAC-05b、REFAC-10、REFAC-11、S14），都是当时的事实记录，不改。
- 与 S23 其他任务不相交：TSET-01 只改 `trade-settlements/`、`ui/trade-labels.ts` 与 `trade-settlements.test.tsx`；SLOT-06 只改 `scripts/slot/`。

## 验收

### base 失败、head 通过

| 编号 | 检查 | base `eac0c37` | head 要求 |
| --- | --- | --- | --- |
| R6a | `node fnlen.cjs packages/web/src`（口径同 S16–S22）中 `OrderLookup` 的行数 | **143**（失败） | ≤ 80，且 `order-lookup.tsx` 与新文件中没有本任务新增或改动的函数 > 80 |
| R6b | `OrderLookup` 及其新抽出的组件与 Hook 中，表示订单号最大长度的数字字面量 `60` | 1 处（`:105`，失败） | 0 处，改用具名常量（决定 5） |

### 两侧都须成立的不变量

- **R1 范围**：`git diff --name-only <base> <head>` 只含 `order-lookup.tsx` 与 `trade-orders/` 下的新文件；决定 7 所列文件的 diff 为空。不加迁移。
- **R2 导出不变**：`order-lookup.tsx` 的导出集合与 base 相同（`OrderLookup`，function）。用仓库根 devDependency `@babel/parser` 解析，口径同 REFAC-11 R2。新文件的导出只在 `trade-orders/` 内部使用，PR 正文附 `git grep` 结果。
- **R3 既有测试原样通过**：`trade-orders.test.tsx` 的 38 个用例与 Web 全部 jsdom 测试通过；测试文件 diff 为空。
- **R4 DOM、请求与焦点等价**（送审证据，脚本不提交，不加常驻 CI 用例）：
  - **驱动**：临时 jsdom 驱动脚本，借用 `trade-orders.test.tsx` 的渲染方式与桩，通过 `App` 渲染订单页，在 base 与 head 上按同一序列操作。`fetch` 桩改为**受控响应**，采样边界同 [REFAC-10 R4](REFAC-10-order-list-split.md#验收)。
  - **序列**至少包含：
    - 手动输入订单号并查找，成功；
    - 格式不合法的订单号（不发请求，显示 `tord.issue.shape`）；
    - 404 `NOT_FOUND`（“返回列表”，并核对之后的焦点）；
    - 400；
    - 其他错误后“重试”成功；
    - 列表点击触发查找时页签处于折叠状态；
    - 第一次查找未应答时再选另一个订单号，再让第一次的应答返回（旧应答被丢弃）；
    - 带“聚焦”的深链接（结果区获得焦点）；
    - 移除地址参数（`request` 变为空，结果清空）；
    - zh / en 各一遍。
  - **每步采样**：DOM（`document.body.innerHTML`）与焦点；累计请求日志（序号、方法、URL、结果）；查询缓存（`queryKey`、`status`，按键排序）。
  - **判定**：base 与 head 逐步、逐项、逐字节相同。PR 正文附脚本全文、步骤清单、两侧输出的 SHA-256 与比较结果，以及“旧应答被丢弃”和“404 → 返回列表”两组场景的逐步输出原文。
- **R5 结构规则**（静态，评审按代码与 PR 表格核对）：
  - **R5a Hook 序列**：PR 正文列出 base 与 head 的 Hook 调用序列（自定义 Hook 按调用处展开），两侧逐行相同；base 一侧须与“现状”所列一致。
  - **R5b 展示组件无 Hook**：新抽出的组件中没有任何 `use*` 调用；PR 正文附 Babel AST 检查脚本的输出。
  - **R5c 模块级定义**：所有组件与自定义 Hook 都在模块顶层声明。
  - **R5d 插槽对等**：PR 正文用一张表列出 base 中 `FastTab#tord-lookup` 的 4 个子表达式，并标出 head 中对应的唯一组件或表达式。
- **R6 尺寸**：除上表 R6a、R6b 外，`order-lookup.tsx` ≤ 80 行，新文件各 ≤ 120 行；每个新函数满足 ②（≤ 80 行、嵌套 ≤ 3 层）；PR 正文列出所有超过 50 行的函数，附计数行数与最深层数。
- **R7 打包字节**：首屏按 D454；体积口径见 [S23 共同验收“L10 / 体积口径”](S23.md#l10--体积口径)。
  - 用 `scripts/measure/bundle-measure.mjs`，写明脚本所在的提交 SHA（[任务书模板“构建来源”](TEMPLATE.md#证据要求)）。base 为最终送审 head 的实际合并基；合并基变了就重新测量。
  - 首屏 ±0；订单路由（manifest 键 `src/TradeOrders.tsx`）的“路由新增”JS 与入口 chunk 各增加不超过 **+600 B**：`--route src/TradeOrders.tsx=+600 --chunk src/TradeOrders.tsx=+600 --d454`；其他路由与 chunk ±0；CSS 不变；出现 base 没有的新 chunk 即停下报告。
  - 超出先停下，报设计角色与协调者，不得自行放宽。
- **R8 质量门**：`typecheck`、`lint`、CI-02 预检通过；PR CI 绿；合并后覆盖该合并提交的 main Full 绿，包括 tests:trade-e2e 的浏览器分片（`orders.ts:97` 所在场景）。
- **R9 可读性一节**：PR 正文按下节逐条说明。

## 性能考虑

- 渲染次数不变：不加 `memo`，不改 Hook 与依赖。不跑 Bench。打包变化由 R7 约束。其余项（规模、索引、查询次数、分页、事务）不适用：不改数据访问。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥：

- **②**：本任务就是为满足 ② 而做。`OrderLookup` 从 143 行拆到 ≤ 80 行（R6a），最大的一块是 `run`（`:66–97`，约 30 行）与错误条（`:118–140`）。
- **③**：`order-lookup.tsx`（156 行）不是热点；拆后 ≤ 80 行，新文件各 ≤ 120 行。PR 正文贴 `git diff --numstat`。
- **①**：组件与 Hook 名表达职责，例如 `OrderLookupForm`、`OrderLookupError`、`OrderLookupResult`、`useOrderLookup`、`lookupErrorKey`；不用 `Part1`、`Section2`。
- **④**：分层对齐 REFAC-10 / 11 在 `trade-orders/` 中的做法，不抽跨页共用件。
- **⑤**：见决定 5。
- **⑥**：原有的“为什么”注释（`:34–36` 一次请求一次查找、`:64–65` 最新的选择拥有详情、`biome-ignore` 的理由）随代码搬移，不删改。不留调试输出。
- **测试耗时**：本任务不改测试；R4 驱动脚本不提交。PR 正文附 `trade-orders.test.tsx` 在 base 与 head 上的耗时（vitest 汇总行原文），两侧差异 > 20% 时说明原因。

## 用户可见变化

- 无。订单页“查找订单”的外观、文案、键盘与焦点行为、请求与错误提示都不变（R3、R4）。

## 证据要求

- **不需要浏览器时段**：行为等价由 R3（既有 jsdom 用例）与 R4（逐步的 DOM、请求与焦点等价）证明；`orders.ts:97` 所在的订单场景在合并后由覆盖合并提交的 main Full 的浏览器分片执行，口径同 REFAC-11 / 12。R4 与构建在本机运行，须服从协调者的时段静默通知（D442 / D480）。
- **可行性**（S13 回顾行动 4）：R4 的驱动方式已在 REFAC-10（#291）、REFAC-11（#299）、REFAC-12（#311）跑通，其中 REFAC-11 的序列已经覆盖“查找订单”结果中的 `OrderView`；R6a、R6b 的 base 数字见“现状”（设计角色实测）。本任务书**没有**做试改构建，R7 的上限按拆分规模估定（`OrderLookup` 约为 `SettlementEntry` 的三分之一，REFAC-12 的上限为 +900 B）。
- PR 正文附：R2 导出与 `git grep` 结果；R4 脚本、步骤清单、比较结果与两组场景的逐步输出；R5a–R5d 各表；R6 行数表（base 与 head 两列）；R7 的 `bundle-measure.mjs` 完整输出与退出码；可读性一节。
