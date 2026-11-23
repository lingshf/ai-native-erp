# REFAC-07：拆分 `ActionEntry` 函数体（不改行为）

- Sprint：S17（[计划](S17.md)）　类型：重构（页面）　优先级：P2　决定：待协调者定编号　建议分支：`refac-07-split-action-entry`
- 来源：S16 候选池首选（“下一个函数体拆分的首选：页面最大”，[S16 候选池](S16.md#候选池s16-之后)）。结构与验收照搬 [REFAC-05b](REFAC-05b-order-workspace-split.md)（#265）与 [REFAC-06c](REFAC-06c-invoice-entry-split.md)（#256），只换成调整页的事实。
- 迁移：**不加**。浏览器时段：**不需要**（理由见“证据要求”）。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 现状（main `00d1ed4`）

- `packages/web/src/TradeAdjustments.tsx` 共 838 行（`(Get-Content …).Count`），是热点（③ > 800）：
  - 模块层（`:1–123`）：导入；类型 `Key`、`Pending`、`Draft`、`Saved`；`empty()`（`:45–64`，用 `new Date()` 与 `crypto.randomUUID()`）；`key(company)` = `erp.tradeActions.v1.<company>`（`:65`）；`partyCode`（`:66`）；`restore()`（`:67–123`，sessionStorage 读回与校验）；
  - `export function TradeAdjustments`（`:124–193`，公司选择与守卫，70 行，不超 ②）；
  - `function ActionEntry`（`:194–838`）：按 `files/fnlen.cjs` 口径（非空、非注释行）计 **643 行**，全仓最大的超长函数。
- `ActionEntry` 内部：
  - **辅助**（`:203–214`）：`t`、`money`、`head`（返回 `<thead>` 的 JSX）。
  - **Hook 调用**（源码顺序）：
    1. `useState`：`loaded`（惰性 `restore`）、`saved`、`storageFailed`、`preview`、`receipt`、`error`、`busy`、`uncertain`（`:215–224`）；
    2. `useRef`：`sequence`、`running`（`:225–226`）；
    3. `useEffect`，依赖 `[]`，清理函数 `sequence.current++`（`:229–234`）；
    4. `useEffect`，依赖 `[company.code, saved, storageFailed]`，写 sessionStorage，失败设 `storageFailed`（`:235–242`）；
    5. `useLayoutEffect`，依赖 `[busy, saved.pending, draft, onGuard]`，向页面报告守卫（`:243–256`）；
    6. `useQueryClient`（`:257`）；`useState`：`partyFilter`、`partyInput`（`:259–260`）；
    7. `useInfiniteQuery`，键 `["tradeActionItems", company.code, partyFilter]`，`refetchOnMount: "always"`（`:262–274`）；
    8. `useMemo` `previewLines`，依赖 `[preview]`（`:419–425`）。
  - **命令**：`change`（`:275–281`）、`applyPartyFilter`（`:282–290`，`removeQueries`）、`command()`（`:291–347`，五种动作 advance / credit / apply / cancel / reverse 的 `switch`）、`report`（`:348–353`）、`run(confirm)`（`:354–417`：预览或确认；确认前把 `pending` 写入 sessionStorage 并读回比对，失败即 `storageFailed`；成功后 `setSaved({ draft: empty(), … })` 与 `page.refetch()`；4xx 清 `pending`，其余失败设 `uncertain`）；派生值 `result`、`itemSelect`（`:426–453`，返回 JSX）、`irreversible`（`:454`）。
  - **JSX**（`:455–837`）：`div.tadj-entry` 下依次为：
    - 操作栏 `div.tadj-command-bar`（`:457–490`，清除按钮的内联处理器含 `sequence.current++` 与 `removeQueries`）；
    - 错误条数组 `[storageFailed …, page.isError …, error].map(…)`（`:491–498`）；
    - `{saved.pending && uncertain && …}` 不确定提示（`:499–511`）；`{receipt && …}` 过账提示（`:512–516`）；
    - `TeachingTip`（`:517–519`）；
    - `FastTab#tadj-general`（`:520–577`）；
    - `FastTab#tadj-allocation`（`:578–751`）：提示、伙伴筛选与来源 / 目标 / 金额 / 修订号 / 结算号字段（`:582–644`）、贷项行 `div.tadj-lines`（`:645–704`）、反向条目 `div.tadj-items`（`:705–729`）、原因（`:730–740`）、加载更多（`:741–749`）；
    - `{result && FastTab#tadj-result}`（`:752–835`：变化表、贷项行表、分录预览表、链接）。
- 数字字面量：行 / 条目上限 `100` 出现四次（`restore` 的 `:90`、`:94`，加行按钮 `:691`，反向条目 `:714`）；`maxLength={60}`（`:588`）、`maxLength={160}`（`:735`）各一次；URL 中的 `limit=100` 是字符串，不算。
- 唯一导出是 `TradeAdjustments`，导入方只有路由表（懒加载）；`ActionEntry` 不导出。
- 测试：
  - jsdom：`packages/web/test/trade-adjustments.test.tsx` 共 505 行、9 个用例（`^\s*it\(` 计数）；
  - 真实 Chrome：`git grep -l -E "#tadj-|tadj\." -- packages/infra/test/support` 在 `00d1ed4` 上命中 5 个文件（见“冲突域”）。

## 范围与决定

1. **不改行为**。以下全部不变：
   - DOM 结构、类名、文本、属性（含 `id`、`aria-*`、`maxLength`、`min`、`step`、`inputMode`）；
   - 请求的方法、URL、请求体与发出顺序；查询缓存的 `removeQueries` 与 `page.refetch()`；
   - sessionStorage 的键、写入时机与内容（含 `run` 中“写入后读回比对”）；
   - `sequence` / `running` 的递增与检查位置（防止过期响应覆盖新状态）；
   - 向页面报告的守卫值序列（`onGuard` 的每次调用及参数）；
   - 教学提示的内容与显示条件。

   只改代码组织，不修 bug；拆分时发现的疑似缺陷登记在 PR 正文，留作后续任务。
2. **状态只有一个主人**：所有 Hook 调用要么留在 `ActionEntry`，要么放进它在顶层无条件调用的自定义 Hook（例如 `useActionDraft`、`useActionItems`、`useActionRun`，名称由开发定）。新抽出的**展示组件不得调用任何 Hook**，只接收 props 渲染。展开自定义 Hook 后，Hook 调用序列（种类、先后、依赖数组源文本）与 base 相同（R5a）；特别是两个 `useEffect` 仍在 `useLayoutEffect` 之前，`useQueryClient` 仍在 layout effect 之后、`partyFilter` 状态之前。
3. **组件层级对等**：
   - 新组件一律在模块顶层定义；
   - 抽出的组件只替换 `div.tadj-entry` 下的**一个子表达式**，或某个 `FastTab` / `fieldset` 内部的一个子表达式，只渲染该表达式原来渲染的内容；不得把相邻兄弟合成一个返回 Fragment 的组件。例外：错误条数组 `:491–498` 本身是一个表达式，可整体成为一个组件；
   - 条件渲染的条件（`{saved.pending && uncertain && …}`、`{receipt && …}`、`{result && …}`、`{draft.kind === … && …}`、`{irreversible && …}`、`{page.hasNextPage && …}`）留在父级原位置；
   - `itemSelect` 改为组件或模块级函数均可，两处调用的位置与参数不变。
3a. **命令函数**：`change`、`applyPartyFilter`、`command`、`report`、`run` 与清除按钮的处理器可以搬进自定义 Hook，也可以搬成模块级函数（显式接收所需的状态、ref 与 setter）。每个函数内 setter、`sequence` / `running`、`sessionStorage`、`masterRequest`、`removeQueries`、`page.refetch` 的调用顺序不变；`run` 读取的 `preview`、`saved`、`rows` 仍是**该次渲染**的值（不得改成读 ref 或最新值）。
4. **文件**：新文件放在新目录 `packages/web/src/trade-adjustments/` 下，按职责命名（例如 `action-draft.ts`（`Draft`、`empty`、`restore`）、`use-action-entry.ts`、`action-command-bar.tsx`、`action-general-tab.tsx`、`action-allocation-tab.tsx`、`action-result-tab.tsx`），粒度由开发定，写入 PR 正文。模块层的 `empty`、`key`、`partyCode`、`restore` 可以搬进新文件，但不改实现。
5. **具名常量**（⑤）：上限 `100` 改为一个具名常量，四处共用；`60`、`160` 各改为具名常量。值都不变。URL 中的 `limit=100` 不改。
6. **不改**：
   - `TradeAdjustments`（`:124–193`）的行为与导出；路由表与其他导入方；
   - `packages/web/test/**`、`packages/infra/test/**`、`scripts/test-shard-weights.json`；
   - 标签与教学文案（`ui/trade-labels.ts`、`ui/trade-adjustment-filter-labels.ts`、`ui/trade-adjustment-teaching.ts` 等）、CSS（`pages/trade-settlements.css`）、契约（`@erp/core`）；
   - `trade-invoices/use-invoice-leave-guard.ts`（只导入，不改）。

## 冲突域

- web-ui:trade-adjustments：只改 `packages/web/src/TradeAdjustments.tsx`，并在新目录 `packages/web/src/trade-adjustments/` 下新增文件。
- 取证所需观测点 / 新增测试文件：无（R4 脚本不提交）。
- 受影响的 e2e 断言（S13 回顾行动 1）：
  - 检索：`git grep -l -E "#tadj-|tadj\." -- packages/infra/test/support`；
  - **必须继续成立**：在 `00d1ed4` 上命中 5 个文件——`navigate-ready.ts:16`（`tadj.title`）；`trade-gui/smoke.ts:49–54`（`#tadj-sourceId option:not([value=""])` 计数、`#tadj-kind` 选 cancel）；`trade-gui/scenario/adjustments-reports.ts:22–78`（按 `tadj.*` 标签填写与选择，14 处）；`trade-gui/scenario/invoice-entry.ts:98`、`:108`、`:117`（`tadj.kind`、`tadj.confirm`）；`trade-gui/scenario/order-invoicing-filter.ts:43–44`。这些断言依赖的 `id`、标签与按钮名全部不变；
  - **须随本任务改**：无。
- 受影响的文档引用（D460）：`git grep -n -F "TradeAdjustments.tsx" -- docs ':!docs/demo/*/logs/*'` 在 `00d1ed4` 上**无结果**；`docs/demo/v0.10.0`–`v0.13.1` 的 `logs/` 只有历史构建输出中的块名 `TradeAdjustments-*.js`（归档，不改）；`docs/demo/v0.4.0/scripts/capture.mjs:79`、`:91` 引用 `#tadj-kind`、`#tadj-partyFilter`（归档脚本，`id` 不变，不改）。
- 与 S17 其他任务不相交：REFAC-08 只改 `packages/infra/test/support/trade-gui/smoke.ts` 与其新目录；TLIST-01 改 `trade-orders/order-list.tsx`、`trade-invoices/invoice-list.tsx`、`ui/trade-order-labels.ts`、`ui/trade-labels.ts`（只加两个键，本任务不改该文件）与两个测试文件。

## 验收

- **R1 范围**：`git diff --name-only <base> <head>` 只含 `packages/web/src/TradeAdjustments.tsx` 和 `packages/web/src/trade-adjustments/` 下的新文件；决定 6 列出的文件 diff 为空。不加迁移。
- **R2 导出不变**：`TradeAdjustments.tsx` 的导出集合（名称加类别）与 base 相同，即只有 `TradeAdjustments`；用仓库根 devDependency `@babel/parser` 解析，口径同 [REFAC-03 M2c（D433）](S13.md#refac-03拆分-journalstsx只搬移不改行为)。新文件的导出只供 `TradeAdjustments.tsx` 与 `trade-adjustments/` 内部使用（PR 正文附 `git grep` 结果）。
- **R3 既有测试原样通过**：`trade-adjustments.test.tsx` 的 9 个用例和 Web 全部 jsdom 测试通过；测试文件 diff 为空。
- **R4 DOM、存储、请求与守卫等价**（送审证据，脚本不提交，不加常驻 CI 用例）：
  - **驱动**：临时 jsdom 驱动脚本，借用 `trade-adjustments.test.tsx` 的渲染方式、`QueryClient` 配置与 `fetch` 桩，在 base 与 head 上按同一序列操作；两种渲染都做：通过 `App` 渲染调整页（`#/trade-adjustments`），以及直接渲染 `TradeAdjustments` 并记录传给 `useInvoiceLeaveGuard` 的守卫值（经 `ActionEntry` 的 `onGuard`）。
  - **确定性**：渲染前固定时钟；`crypto.randomUUID` 换成按调用次序返回固定值的桩（`empty()`、加行、切换动作都会调用它）；每次运行前清空 sessionStorage，需要读回场景时预置同一 JSON。
  - `fetch` 桩改为**受控响应**，采样边界同 [REFAC-03b P4](REFAC-03b-company-journals-split.md#验收)（操作 → 释放约定响应 → `act` 等待到待决队列与 `isFetching` / `isMutating` 满足约定、连续两次 `act` 后 DOM 不变 → 采样；不满足即报错退出）。
  - **序列**至少包含：
    - 五种动作各走一遍：填写、预览成功（结果区出现）、确认成功（过账提示、草稿重置、列表 `refetch`）；
    - 预览失败（4xx 字段错误）、确认失败（4xx 清 `pending`）、确认不确定（5xx → 不确定提示 → “重试确认”）；
    - 修改字段后预览消失；在途预览期间修改（过期响应被 `sequence` 丢弃）；
    - 伙伴筛选：非法值提示、Enter 应用、失焦应用、与当前值相同不重查；
    - 贷项行：加行到 100 行按钮禁用、删行；反向条目勾选到 100 条后其余禁用；
    - 清除按钮（有 / 无伙伴筛选两种）；
    - sessionStorage：读回合法草稿、读回带 `pending` 的草稿（进入不确定状态）、读回非法 JSON（`storageFailed`）、写入抛错；
    - 加载更多；未结项查询失败；
    - 教学模式开 / 关；zh / en。
  - **每步采样**：DOM（`document.body.innerHTML`）；焦点（`document.activeElement` 的 `id` 或标签名加文本）；sessionStorage 全部键值；累计请求日志（序号、方法、URL、请求体 JSON、结果）；查询缓存（`queryKey`、`status`、`isInvalidated`，按键排序）；守卫调用记录。
  - **判定**：base 与 head 逐步、逐项、逐字节相同。PR 正文附脚本全文、步骤清单（含每步释放的请求序号）、两边输出的 SHA-256 与比较结果，以及“确认不确定”与“sessionStorage 读回”两组场景的逐步输出原文。
- **R5 结构规则**（静态，评审按代码与 PR 表格核对）：
  - **R5a Hook 序列**：PR 正文列出 base 与 head 的 Hook 调用序列，自定义 Hook 按调用处展开；每行写 Hook 种类和依赖数组源文本（空白归一；没有依赖数组的写“无”）；两边逐行相同。
  - **R5b 展示组件无 Hook**：新抽出的组件中没有任何 `use*` 调用；PR 正文附 Babel AST 检查脚本的输出。
  - **R5c 模块级定义**：所有组件与自定义 Hook 都在模块顶层声明。
  - **R5d 插槽对等**：PR 正文用一张表列出 base 中 `div.tadj-entry` 的子表达式，以及三个 `FastTab` 内部被抽出的子表达式，标出 head 中对应的唯一组件或表达式，两边一一对应。
  - **R5e 副作用顺序**：PR 正文逐函数对照 base 与 head 中 `change`、`applyPartyFilter`、`run`、清除按钮处理器内的 setter、`sequence` / `running`、`sessionStorage`、`masterRequest`、`removeQueries`、`page.refetch` 调用序列。
  - **R5f effect 清理**：base 只有一个清理函数（`:229–234` 的 `sequence.current++`）；PR 正文写明它在 head 中由哪个 Hook 拥有。
- **R6 尺寸与可读性**：
  - `ActionEntry`、每个自定义 Hook、每个新组件与命令函数都满足 ②（≤ 80 行、嵌套 ≤ 3 层）；`command()` 的 `switch` 超过 ② 时按动作拆成模块级函数，返回值不变；
  - `TradeAdjustments.tsx` ≤ 300 行，`trade-adjustments/` 下每个新文件 ≤ 400 行；
  - PR 正文列出所有超过 60 行的函数，附计数行数与最深层数。
- **R7 打包字节**（构建条件、依赖图、D432 字节口径同 [S14 REFAC-06](S14.md#refac-06拆分-tradeinvoicestsx只搬移不改行为)；首屏按 D454，见[任务书模板](TEMPLATE.md)“首屏比对”）：
  - PR 正文须有“构建来源”一节（[任务书模板](TEMPLATE.md)“证据要求”）。base 为最终送审 head 的实际合并基；合并基变了就重新测量。
  - 首屏：±0。
  - **调整页块路由**：在 `00d1ed4` 上只有入口块 `index-*.js` 引用 `TradeAdjustments-*.js`（懒加载），即只有 `#/trade-adjustments` 加载它；PR 正文列出 base 上加载该块的路由及判定依据。
  - 调整页路由的“路由新增”JS 合计（屏蔽哈希后的 gzip-9）增加不超过 **+900 B**（D476：沿用 D461 的上限）；其他路由 ±0。各路由 CSS 的集合与字节都不变。
  - **余量依据**（设计角色在 `00d1ed4` 上试算，按 D461 包含要搬走的命令与闭包；本机 Windows，Node v26.13.0 / npm 11.20.0，`package-lock.json` blob `07c1aee8b9c3392b88c25f9bb670adbbc8f19201`，沿用已安装的 `node_modules`，`npm run build -w packages/web`；只量调整页块，屏蔽 `-<8 位哈希>.js|css` 后 gzip-9；试算改动已还原、未提交）：
    - base：`TradeAdjustments-*.js` 17,599 B / 5,528 B（原始 / 屏蔽后 gzip-9）；
    - 试算：把 `:203–454` 的全部状态、effect、命令与派生值原样搬进**一个**返回对象的 Hook，再把 9 个子表达式（操作栏、错误条数组、不确定提示、过账提示、常规字段、分配字段网格、贷项行、反向条目、结果区）抽成只收 props 的组件，props 逐个显式传递：19,896 B / 6,276 B，即 **+748 B**；入口块 530.51 kB 不变；
    - 试算中的 Hook 仍有 253 行、结果区组件 84 行，没有满足 ②。按决定 2、3a 继续拆成多个 Hook 或模块级命令函数会再增加传参字节（REFAC-05b 试算 +493 B、实测 +852 B）。设计角色曾建议放宽到 +1,300 B，协调者未采纳（D476）：上限保持 +900 B，试算 +748 B 留有余量。拆分时优先共用对象参数、少拆细碎组件，控制传参字节。

  超出 +900 B 先停下报设计角色与协调者，不得自行放宽预算（D476）。
- **R8 质量门**：`typecheck`、`lint`、CI-02 预检通过；PR CI 绿；合并后覆盖该合并提交的 main Full 绿（含 tests:trade-e2e 的浏览器分片，即“冲突域”中“必须继续成立”的断言）。
- **R9 可读性一节**：PR 正文按下节逐条说明。

## 性能考虑

- 渲染次数不变：不加 `memo`，不改 Hook 依赖；组件层级加深只增加少量函数调用，不跑 Bench。
- 打包变化由 R7 约束；试算见 R7。
- 其余项（规模、索引、查询次数、分页、事务）不适用：不改数据访问。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥：

- **②**：本任务就是为满足 ② 而做。`ActionEntry` 从 643 行拆到每个函数 ≤ 80 行、嵌套 ≤ 3 层（R6）。
- **③**：`TradeAdjustments.tsx`（838 行）是热点；本任务对它大幅净减（R6 上限 300 行）。PR 正文贴 `git diff --numstat`。
- **①**：组件与 Hook 名表达职责，如 `ActionCommandBar`、`CreditLinesField`、`useActionRun`，不用 `Part1`、`Section2`。
- **④**：五种动作的命令构造按动作拆开时，公共字段（`company`、`actionId`、`kind`、三个日期）只构造一次。三张结果表结构不同，不强制抽取。
- **⑤**：见决定 5。
- **⑥**：原有的“为什么”注释（`uncertain` 的说明 `:222–223` 等）随代码搬移，不删改。不留调试输出。

## 用户可见变化

- 无。页面外观、文案、键盘与焦点行为、存储与请求都不变（R3、R4）。

## 证据要求

- **不需要浏览器时段**：行为等价由 R3（既有 jsdom 用例）与 R4（逐步 DOM、存储、请求与守卫等价）证明；tests:trade-e2e 中经过调整页的步骤（“冲突域”所列）在合并后由覆盖合并提交的 main Full 的浏览器分片执行；口径同 REFAC-05b / REFAC-06c。R4 在本机运行，须服从协调者的时段停用通知（D442）。
- **可行性**（S13 回顾行动 4）：R4 的驱动方式已由 REFAC-06c（#256）、REFAC-05b（#265）跑通；本页另需 `crypto.randomUUID` 桩与 sessionStorage 采样，`trade-adjustments.test.tsx` 已在 jsdom 中使用 sessionStorage（读回场景）。R7 的试算见上。
- PR 正文附：R2 导出与 `git grep` 结果；R4 脚本、步骤清单、比较结果与两组场景的逐步输出；R5a–R5f 各表；R6 函数行数表；R7 的“构建来源”一节、路由清单与字节表；可读性一节。
- 证明类验收附脚本原文与未截断输出，或链接到固定修订（S13 回顾行动 6）；PR 正文写到的字节、计数都附原始输出（S15 回顾行动 1）。
