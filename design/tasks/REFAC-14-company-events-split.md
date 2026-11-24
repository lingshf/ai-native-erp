# REFAC-14：拆分 `CompanyEvents` 函数体（不改行为）

- Sprint：S24（[计划草案](S24.md)）　类型：重构（页面）　优先级：P2　决定：[D525](S24.md#s24-期间决定)（只改代码组织、不改行为；见“范围与决定”1–4）　建议分支：`refac-14-split-company-events`
- 来源：[S23 候选池](S23.md#候选池s23-之后)第 1 项（“按 ② 拆 `CompanyEvents`（563 行）……一个 Sprint 一个”）。结构与验收照搬 [REFAC-13](REFAC-13-order-lookup-split.md) 与 [REFAC-12](REFAC-12-settlement-entry-split.md)，只换成“业务事件”的事实；另按 [S22 回顾行动 3](../reviews/S22-retro.md#行动项汇总)（随 #323 入库）写出 chunk 归属与首屏预算，按行动 4 写出本机全量 web 测试命令。
- 迁移：**不加**。浏览器时段：**不需要**（理由见“证据要求”）。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 为什么是它

- `CompanyEvents` 按 `files/fnlen.cjs` 口径（非空、非注释行）为 **563 行**，是 `packages/web/src` 中最长的函数，约为 ② 上限（80 行）的 7 倍；第二长的 `CompanyReports` 为 378 行。
- 它承载业务事件页的全部交互：三个视图（业务事件、设置、待转队列）、新建草稿、预览与确认（含幂等键）、待转队列的预览、转入与撤回、结果详情与凭证链。TLIST-05（S21）只能在这个函数里加“刷新列表”，评审要读 500 多行上下文；之后的业务事件打磨都会经过这里，先拆小可以缩小评审面。
- S12 把它整体搬进 `business-events/` 时明确“本任务不拆”（[S12](S12.md) G5）；`trade-orders/` 已由 REFAC-13 收尾，按“一个 Sprint 一个页面函数体”的节奏轮到它。
- 冲突域与 S23 进行中的任务不相交：REFAC-13 只改 `trade-orders/`，SLOT-06 只改 `scripts/slot/`（见“冲突域”）。

## 现状（main `2794c3a`）

下文 `file:line` 都按 `2794c3af198cce1ce1fcfd43ec5d6a8825dd0b6e`。

- `packages/web/src/business-events/company-events.tsx` 共 707 行，导出 `CompanyEvents`（`:62–625`）；模块级另有 `revealFocused`（`:28–29`，前有一条“为什么”注释 `:27`）、`queueStatuses` / `QueueStatus`（`:30–31`）、`QueueStatusFilter`（`:38–58`）、`Review` 类型（`:59–61`）与 `BusinessPlan`（`:626–707`）。
- 设计角色用 `node files/fnlen.cjs packages/web/src/business-events` 实测，输出：

  ```text
  563	packages/web/src/business-events/company-events.tsx:62-625	CompanyEvents
  313	packages/web/src/business-events/settings.tsx:243-556	RuleSettings
  216	packages/web/src/business-events/editors.tsx:14-229	EventEditor
  175	packages/web/src/business-events/settings.tsx:67-242	MasterSettings
  116	packages/web/src/business-events/editors.tsx:230-345	ClearingEditor
  82	packages/web/src/business-events/company-events.tsx:626-707	BusinessPlan
  ```

- **Hook 调用**（源码顺序，R5a 的 base 一侧）：
  1. `useQueryClient`（`:76`）；
  2. `useState` × 11：`view`（`:77`，初值 `initialQueue ? "queue" : "events"`）、`draft`（`:80`）、`review`（`:81`）、`detail`（`:82`）、`entry`（`:83`）、`withdraw`（`:84`）、`status`（`:85`，初值 `"pending"`）、`busy`（`:86`）、`uncertain`（`:87`）、`configEditing`（`:88`）、`error`（`:89`）；
  3. `useRef` × 3：`working`（`:90`）、`alive`（`:91`）、`returnFocus`（`:92`）；
  4. `usePage` × 3：`"events"`（`:94`，`view === "events"` 时启用）、`"transfer-queue"`（`:96–102`，查询串 `` `&status=${status}` ``，`view === "queue"` 时启用）、`"dimensions"`（`:103`，`"&kind=dimension"`）；
  5. `useEffect`，依赖 `[]`（`:106–111`）：维护 `alive`；
  6. `useEffect`，依赖 `[editing, busy, lock]`（`:112–115`）：`lock(editing || busy)`，清理时 `lock(false)`；
  7. `useLayoutEffect`，依赖 `[review, withdraw, busy]`（`:117–122`）：无对话框且不忙时把焦点还给 `returnFocus`；前有注释 `:116`；
  8. `useEffect`，依赖 `[initialId, company.code]`（`:123–139`）：深链接读取 `/api/v1/events/<id>`，带 `AbortController`。
- **命令函数**（都在 `CompanyEvents` 内，每次渲染重新创建，读取当次渲染的状态）：`run`（`:140–156`，`working` 防重入；无对话框时记下 `returnFocus`；`finally` 中只在 `alive` 时清忙）；`complete`（`:157–167`，写详情、清草稿 / 凭证 / 两个对话框 / `uncertain`，并作废 `["business", code]` 与 `["journals", code]`）；`rejected`（`:168–181`，`MasterDataFailure` 且 `http` 且状态 `< 500` 视为已知拒绝，关闭对话框；否则置 `uncertain`）；`fresh`（`:182–204`，按操作生成新草稿）；`preview`（`:205–213`）；`confirm`（`:214–247`，事件确认 `confirmation "POST"` 带 `idempotencyKey`，或待转队列转入 `confirmation "TRANSFER"`）。
- **JSX**：Fragment 下 10 个子表达式（R5d 的 base 一侧）：
  1. 视图切换 `div.toolbar-row > div.segmented`（`:250–267`）；
  2. `{error !== undefined && !review && !withdraw && <BusinessError …/>}`（`:268`）；
  3. `{busy && <p role="status">…}`（`:269`）；
  4. `{view === "settings" && <BusinessSettings …/>}`（`:270–277`）；
  5. `{view === "events" && …}`（`:278–347`）：新建按钮行、`PageTable`（行内“查看”）、`EventEditor`；
  6. `{view === "queue" && …}`（`:348–433`）：`QueueStatusFilter`、`PageTable.be-queue`（行内“查看”“预览”“撤回”，按钮带 `onFocus={revealFocused}`）；
  7. `{detail && section.card.jv-detail}`（`:434–534`）：完成提示、回执、`BusinessPlan`、当前计划、“原事件”链接按钮、冲销与查看凭证按钮、凭证与链；
  8. `{review && <Modal>}`（`:535–562`）；
  9. `{withdraw && <Modal>}`（`:563–621`）：原因 `textarea`（`maxLength={200}`，`:573`）；
  10. `<PageControls page={dimensions} …/>`（`:622`）。
- **相近但不相同的处理**（拆分时最容易被误合并，R4 序列专门覆盖）：
  - 列表“查看”（事件 `:313–323`、队列 `:372–382`）在成功后 `setDetail` **并** `setEntry(null)`；详情中的“原事件”链接（`:470–479`）只 `setDetail`，**不**清 `entry`；
  - 队列“撤回”按钮（`:399–410`）不经 `run`，自己记 `returnFocus` 后打开对话框。
- **数字字面量**（`CompanyEvents` 内）：`500`（`:173`，HTTP 状态界限）、`200`（`:573`，撤回原因最大长度）。设计角色实测：`git grep -n -e 'maxLength={200}' -e '< 500' 2794c3a -- packages/web/src/business-events/company-events.tsx` 命中 `:173` 与 `:573` 两行，退出码 0。
- **导入方**：只有 `packages/web/src/BusinessEvents.tsx:8`（导入）与 `:60`（渲染）；`git grep -l -e 'business-events/' -- packages/web/src` 中目录外只有 `BusinessEvents.tsx`。
- **测试**：
  - jsdom：`packages/web/test/business-events.test.tsx` 736 行、10 个用例（`:43`、`:291`、`:406`、`:470`、`:523`、`:648`、`:679`、`:689`、`:701`、`:717`）；`journals.test.tsx`（`:302` 待转队列桩、`:440–488` 入队与原事件链接）与 `App.test.tsx`（`:367`、`:382` 导航标签）也经过业务事件页或其标签。
  - 真实 Chrome：`git grep -n -e be-queue -e transfer-queue -e CompanyEvents -e business-events -- packages/infra/test` 在 `2794c3a` 上只命中 `http/trade-master.test.ts:632`（迁移文件名 `005-business-events.sql`）与 `support/storage-raw-contract.mjs:8`（服务端仓储），都不是界面断言；**没有** e2e 场景操作业务事件页。

### chunk 归属与首屏（S22 回顾行动 3，base 实测）

设计角色在 `2794c3a` 上运行 `node scripts/measure/bundle-measure.mjs --base 2794c3af198cce1ce1fcfd43ec5d6a8825dd0b6e --head 2794c3af198cce1ce1fcfd43ec5d6a8825dd0b6e --work C:\tmp\meas-s24-base`（退出码 0），并读取构建出的 `dist/.vite/manifest.json`：

| 文件 | 落在哪个 chunk | 依据 |
| --- | --- | --- |
| `business-events/company-events.tsx`（改） | 路由 chunk `src/BusinessEvents.tsx`（`assets/BusinessEvents-*.js`） | `App.tsx:50–51` 以 `lazy(() => import("./BusinessEvents.tsx"))` 懒加载；`company-events.tsx` 只被 `BusinessEvents.tsx` 导入；`dist/assets/*.js` 中含其类名 `be-queue` 的只有 `BusinessEvents-D6eyE9Qr.js` |
| `business-events/` 下新文件（新增） | 同上 | 只允许被 `company-events.tsx` 或同目录新文件导入（决定 6），打包器把它们并入同一路由 chunk |
| 首屏（`index.html` 入口与预加载闭包） | **本任务不改任何首屏文件** | 改动文件都不在首屏闭包中；`ui/labels`、`ui/components` 等首屏模块只被导入、不改（决定 7） |
| 共用 chunk `_dialogs.js`（`journals/dialogs.tsx`：`Modal`、`LinePlan`、`Facts`）、`_virtual-rows.js`、`_master-data-client.js` 等 | 不改 | 只导入；路由闭包中这些 chunk 须 ±0 |

base 数字（屏蔽哈希后的 gzip-9 / 原始字节）：首屏 161114 / 531160；业务事件路由新增 19041 / 62286；入口 chunk `src/BusinessEvents.tsx` 6871 / 29947。

## 范围与决定

1. **不改行为**（D525）。以下全部不变：DOM 结构、类名、文本、属性（含 `id`、`aria-*`、`role`、`disabled`、`maxLength`、`required`）；请求的方法、URL、请求体与发出顺序（含幂等键与 `confirmation` 值）；查询缓存的键与作废范围；`working` 防重入与 `alive` 检查的位置；焦点行为（`returnFocus` 的记录与归还、`revealFocused`）；`lock` 的调用时机。只改代码组织，不修 bug；拆分时发现的疑似缺陷登记在 PR 正文，留作后续任务。
2. **Hook 顺序不变**：Hook 可以留在 `CompanyEvents`，也可以放进它顶层无条件调用的自定义 Hook（例如 `useCompanyEvents`）。**展示组件不得调用任何 Hook**；不新增 `useCallback`、`useMemo`、`memo`。展开自定义 Hook 后，Hook 调用序列（种类、先后、参数与依赖的源文本，空白归一）与“现状”所列 base 序列逐项相同（R5a）；`usePage` 按一次调用计，不展开其内部。`:116` 的“为什么”注释随 `useLayoutEffect` 搬移，内容不变。
3. **命令函数**：`run`、`complete`、`rejected`、`fresh`、`preview`、`confirm` 可以搬进自定义 Hook，或搬到同目录的普通模块函数（以参数接收状态、setter 与 ref）；每次渲染仍读取当次状态，不改为缓存的闭包。`await` 的先后、`alive` 检查与状态写入的顺序都不变。允许把纯计算抽成纯函数（例如由操作生成新草稿、由 `review` 生成确认请求、判断“已知拒绝”），输入输出逐项不变。**不合并**“现状”所列的相近处理：列表“查看”与“原事件”链接对 `entry` 的处理不同，队列“撤回”不经 `run`，须原样保留。
4. **组件层级对等**：新组件一律在模块顶层定义。抽出的组件只替换“现状”所列 10 个子表达式之一（或其中一个子表达式内部的一段，例如队列行的操作按钮）；只渲染该表达式原来渲染的内容，不把相邻兄弟合成一个返回 Fragment 的组件。条件渲染的条件（`view === …`、`error !== undefined && !review && !withdraw`、`busy`、`detail`、`review`、`withdraw`、`item.status === "pending" || item.status === "failed"`）留在父级原位置，或留在被抽出组件内与原来相同的位置。
5. **具名常量**（⑤）：撤回原因最大长度 `200` 与“已知拒绝”的状态界限 `500` 各用一个具名常量，值不变。
6. **文件**：新文件放在 `packages/web/src/business-events/`，按职责命名（例如 `use-company-events.ts`、`event-commands.ts`、`events-view.tsx`、`queue-view.tsx`、`event-detail.tsx`、`event-dialogs.tsx`、`business-plan.tsx`），粒度由开发定，写入 PR 正文。新文件只被同目录文件导入。`CompanyEvents` 仍从 `./company-events.tsx` 导出（`BusinessEvents.tsx` 不改，R2）。
   - `BusinessPlan`（82 行，`:626–707`）、`QueueStatusFilter`、`revealFocused` 与 `queueStatuses` 可以**原样搬移**到新文件，文本逐字不变（含 `:27` 注释），PR 正文附 `git diff --color-moved=plain -M` 或逐字比较的输出；`BusinessPlan` 不在本任务拆分范围内（存量 82 行，登记入候选池），不得改动。
7. **不改**：
   - `CompanyEvents` 的导出名与 props；`BusinessEvents.tsx`、`App.tsx` 与路由表；
   - `business-events/` 下的其他既有文件（`list.tsx`、`editors.tsx`、`settings.tsx`、`business-error.tsx`、`types.ts`，只导入）；`journals/dialogs.tsx`、`master-data-client.ts`；
   - 标签（`ui/labels*`）、CSS、契约（`@erp/core/contracts`）；
   - `packages/web/test/**`、`packages/infra/test/**`、`scripts/test-shard-weights.json`、`package.json` / lock。

## 冲突域

- web-ui:business-events：只改 `packages/web/src/business-events/company-events.tsx`，并在 `packages/web/src/business-events/` 新增文件（决定 6）。
- 取证所需的观测点和新增测试文件：无（R4 脚本不提交）。
- 受影响的 e2e 断言（S13 回顾行动 1）：检索见“现状”；没有界面断言；**必须继续成立**：无浏览器场景，由 R3 的 jsdom 用例与 R4 覆盖；**须随本任务改**：无。
- 受影响的文档引用（D460）：`git grep -n -F "company-events" -- docs design` 在 `2794c3a` 上命中 `design/` 下的历史文档（S12、S13、S14、S21、TLIST-03、TLIST-05、README 的 TLIST-05 行）与 `docs/release/v0.19.0-release-notes.md` 一处，都是当时的事实记录，不改。
- 与 S23 进行中的任务不相交：REFAC-13 只改 `trade-orders/`；SLOT-06 只改 `scripts/slot/`。两者与本任务没有共享文件，路由 chunk 也不同（`src/TradeOrders.tsx` 与 `src/BusinessEvents.tsx`）。

## 验收

### base 失败、head 通过

| 编号 | 检查 | base `2794c3a` | head 要求 |
| --- | --- | --- | --- |
| R6a | `node fnlen.cjs packages/web/src`（口径同 S16–S23）中 `CompanyEvents` 的行数 | **563**（失败） | ≤ 80，且 `company-events.tsx` 与新文件中没有本任务新增或改动的函数 > 80（原样搬移的 `BusinessPlan` 82 行除外，见决定 6） |
| R6b | `CompanyEvents` 及其新抽出的组件、Hook 与模块函数中，“已知拒绝”的状态界限 `500` 与撤回原因最大长度 `200` | 2 处（`:173` 的 `500`、`:573` 的 `200`，失败） | 0 处，改用具名常量（决定 5） |

### 两侧都须成立的不变量

- **R1 范围**：`git diff --name-only <base> <head>` 只含 `company-events.tsx` 与 `business-events/` 下的新文件；决定 7 所列文件的 diff 为空。不加迁移。
- **R2 导出不变**：`company-events.tsx` 的导出集合与 base 相同（`CompanyEvents`，function）。用仓库根 devDependency `@babel/parser` 解析，口径同 REFAC-13 R2。新文件的导出只在 `business-events/` 内部使用，PR 正文附 `git grep` 结果。
- **R3 既有测试原样通过**：`business-events.test.tsx` 的 10 个用例、`journals.test.tsx`、`App.test.tsx` 与 Web 全部 jsdom 测试通过；测试文件 diff 为空。本机全量命令见“测试命令”。
- **R4 DOM、请求与焦点等价**（送审证据，脚本不提交，不加常驻 CI 用例）：
  - **驱动**：临时 jsdom 驱动脚本，借用 `business-events.test.tsx` 的渲染方式与桩，在 base 与 head 上按同一序列操作。`fetch` 桩改为**受控响应**，采样边界同 [REFAC-10 R4](REFAC-10-order-list-split.md#验收)。
  - **固定 UUID**：base 在 `:183`（新草稿 `id`）与 `:212`（确认幂等键 `review.key`）调用 `crypto.randomUUID()`，两者都进请求体。驱动在每个场景开始时把 `crypto.randomUUID` 替换为同一确定序列（例如 `00000000-0000-4000-8000-000000000001` 起递增），两侧相同，做法同 [REFAC-12 R4](REFAC-12-settlement-entry-split.md#验收)。请求体中的草稿 `id` 与 `idempotencyKey` **原样保留**，不得删除、改写或归一化。采样另记每次 `randomUUID` 调用的序号与调用时所在步骤。
  - **记录 `lock`**：驱动传入的 `lock` 为记录桩，按调用顺序记下（步骤、参数），含卸载时清理调用的 `lock(false)`。不用 DOM 中按钮的 `disabled` 代替：子页按钮直接取 `editing || busy`（`:256`），漏掉 `lock` 调用也不会改变它。
  - **记录 `scrollIntoView`**：jsdom 没有实现 `scrollIntoView`，base 用 `?.` 调用（`:29`）。驱动在两侧都给 `HTMLElement.prototype.scrollIntoView` 装同一个记录桩，记下每次调用的目标元素（标签、可访问名称、所在行的事件 ID）与参数原文（base 为 `{ block: "nearest", inline: "nearest" }`）。
  - **序列**至少包含：
    - 三个视图来回切换（含“设置”）；
    - 新建现金服务草稿 → 预览 → 确认成功（核对请求体中的 `idempotencyKey` 与 `confirmation`、两个查询键被作废）；
    - 确认被拒（409，`review` 关闭）与确认结果不明（500 或网络错误，`uncertain` 后再次确认成功）。断言重试请求的 `idempotencyKey` 与首次确认的相同；关闭对话框后重新预览会取序列中的下一个值，断言新键与旧键不同；
    - 事件列表“查看” → 详情中“查看凭证”（出现 `entry`）→ 点“原事件”链接（`entry` **保留**）；再从列表“查看”（`entry` 清空）；
    - 冲销已过账的现金服务（`fresh` 带 `originalId`）；
    - 待转队列：切换状态筛选；“预览” → “转入”成功；“撤回” → 输入原因 → 确认成功；撤回被拒；
    - 对话框关闭后焦点回到打开它的按钮；队列“查看”“预览”“撤回”按钮各用 `element.focus()` 获得一次焦点，断言每次都有一条 `scrollIntoView` 记录、目标为该按钮、参数如上；焦点落到非队列按钮时没有新记录；
    - 第一次“查看”未应答时再点另一行（`working` 防重入，第二次不发请求）；
    - 深链接 `initialId`（含在应答前卸载，`AbortController` 生效）与 `initialQueue`；
    - 编辑草稿中、确认请求未应答时各采一次 `lock` 记录，之后卸载组件，断言最后一条为 `lock(false)`；
    - zh / en 各一遍。
  - **每步采样**：DOM（`document.body.innerHTML`）与焦点；累计请求日志（序号、方法、URL、请求体、结果）；查询缓存（`queryKey`、`status`、`isInvalidated`，按键排序）；累计 `lock` 记录；累计 `scrollIntoView` 记录；累计 `randomUUID` 调用记录。
  - **判定**：base 与 head 逐步、逐项、逐字节相同。PR 正文附脚本全文、步骤清单、两侧输出的 SHA-256 与比较结果，以及“原事件链接保留凭证”“确认结果不明后重试（含幂等键复用断言）”“`lock` 与卸载解锁”“队列按钮 `scrollIntoView`”四组场景的逐步输出原文。
- **R5 结构规则**（静态，评审按代码与 PR 表格核对）：
  - **R5a Hook 序列**：PR 正文列出 base 与 head 的 Hook 调用序列（自定义 Hook 按调用处展开），两侧逐行相同；base 一侧须与“现状”所列一致。
  - **R5b 展示组件无 Hook**：新抽出的组件中没有任何 `use*` 调用；PR 正文附 Babel AST 检查脚本的输出。
  - **R5c 模块级定义**：所有组件、自定义 Hook 与命令函数都在模块顶层声明。
  - **R5d 插槽对等**：PR 正文用一张表列出“现状”中的 10 个子表达式，并标出 head 中对应的唯一组件或表达式。
  - **R5e 原样搬移**：决定 6 所列可搬移的项，PR 正文附逐字比较输出（不同即失败）。
- **R6 尺寸**：除上表 R6a、R6b 外，`company-events.tsx` ≤ 150 行；新文件各 ≤ 200 行；每个新函数满足 ②（≤ 80 行、嵌套 ≤ 3 层）；PR 正文列出所有超过 50 行的函数，附计数行数与最深层数（base 与 head 两列）。
- **R7 打包字节**：首屏按 D454。用 `scripts/measure/bundle-measure.mjs`，写明脚本所在的提交 SHA（[任务书模板“构建来源”](TEMPLATE.md#证据要求)）；base 为最终送审 head 的实际合并基，合并基变了就重新测量。预算（未列出的项 ±0）：

  | 项 | manifest 键 | 上限 | 依据 |
  | --- | --- | --- | --- |
  | 首屏 | — | **±0**（D454，`--d454`） | 改动文件都不在首屏闭包中（“chunk 归属”表）；首屏预算与路由预算互不矛盾 |
  | 业务事件路由新增 | `src/BusinessEvents.tsx` | ≤ **+900 B** | 估定，见下 |
  | 业务事件入口 chunk | `src/BusinessEvents.tsx` | ≤ **+900 B** | 同上 |
  | 共用 chunk 与其他路由 | 全部 | ±0 | 只导入、不改 |
  | CSS | 全部 | ±0 | 不改 CSS |

  命令参数：`--route src/BusinessEvents.tsx=+900 --chunk src/BusinessEvents.tsx=+900 --d454`。出现 base 没有的新 chunk 即停下报告；超出先停下，报设计角色与协调者，不得自行放宽。上限没有做试改构建：REFAC-12 拆 `SettlementEntry` 定为 +900 B，本任务抽出的组件数相近，props 传递更多但 `BusinessPlan` 等原样搬移不增字节。
- **R8 质量门**：`typecheck`、`lint`、CI-02 预检通过；PR CI 绿；合并后覆盖该合并提交的 main Full 绿。
- **R9 可读性一节**：PR 正文按下节逐条说明。

### 测试命令（S22 回顾行动 4）

- 本机全量 web 测试一律用 `npx vitest run --project web`（项目名见 `vitest.config.ts:160`），PR 正文附汇总行原文，base 与 head 各一次。
- 有失败时，逐个列出失败的文件与用例，并附只对这些文件的串行重跑原文：`npx vitest run --project web --no-file-parallelism <失败文件…>`。不得自行更换并发参数而不说明；串行重跑仍失败即按真实失败处理。

## 性能考虑

- 渲染次数不变：不加 `memo`，不改 Hook 与依赖。不跑 Bench。打包变化由 R7 约束。其余项（规模、索引、查询次数、分页、事务）不适用：不改数据访问。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥：

- **②**：本任务就是为满足 ② 而做。`CompanyEvents` 从 563 行拆到 ≤ 80 行（R6a）。最大的几块是待转队列视图（`:348–433`，约 85 行）、详情（`:434–534`，约 100 行）、撤回对话框（`:563–621`）与 `confirm`（`:214–247`）；它们各自抽出后仍须 ≤ 80 行，详情可再拆出“凭证与链”一段。
- **③**：`company-events.tsx`（707 行）是热点；拆后 ≤ 150 行，新文件各 ≤ 200 行。PR 正文贴 `git diff --numstat`。
- **①**：组件、Hook 与函数名表达职责，例如 `ViewSwitch`、`EventsView`、`QueueView`、`QueueRowActions`、`EventDetail`、`ReviewDialog`、`WithdrawDialog`、`useCompanyEvents`、`freshDraft`、`isKnownRejection`；不用 `Part1`、`Section2`。
- **④**：分层对齐 REFAC-10–13 的做法：状态与命令在一个 Hook 或命令模块，展示组件只接收 props；不抽跨页共用件（`trade-*` 的同类组件不复用）。
- **⑤**：见决定 5。
- **⑥**：原有的“为什么”注释（`:27` 窄屏队列按钮、`:116` 布局阶段归还焦点）随代码搬移，不删改。不留调试输出。
- **测试耗时**：本任务不改测试；R4 驱动脚本不提交。PR 正文附 `business-events.test.tsx` 在 base 与 head 上的耗时（vitest 汇总行原文），两侧差异 > 20% 时说明原因。

## 用户可见变化

- 无。业务事件页的三个视图、新建与预览、确认与转入、撤回、详情与凭证链的外观、文案、键盘与焦点行为、请求与错误提示都不变（R3、R4）。

## 证据要求

- **不需要浏览器时段**：行为等价由 R3（既有 jsdom 用例）与 R4（逐步的 DOM、请求与焦点等价）证明；没有 e2e 场景操作业务事件页（“现状”检索）。R4 与构建在本机运行，须服从协调者的时段静默通知（D442 / D480）。
- **可行性**（S13 回顾行动 4）：R4 的驱动方式已在 REFAC-10（#291）、REFAC-11（#299）、REFAC-12（#311）跑通；`business-events.test.tsx` 已有可按路径分派的 `fetch` 桩（`:147`、`:621`），可改为受控响应。R6a、R6b 的 base 数字与 chunk 归属见“现状”（设计角色实测）。本任务书**没有**做试改构建，R7 的上限按拆分规模估定。
- PR 正文附：R2 导出与 `git grep` 结果；R4 脚本、步骤清单、比较结果与两组场景的逐步输出；R5a–R5e 各表；R6 行数表（base 与 head 两列）；R7 的 `bundle-measure.mjs` 完整输出与退出码；“测试命令”的汇总行；可读性一节。
