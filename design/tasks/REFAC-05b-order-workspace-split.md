# REFAC-05b：拆分 `OrderWorkspace` 函数体（不改行为）

- Sprint：S16（[计划](S16.md)）　类型：重构（页面）　优先级：P2　决定：待协调者定编号　建议分支：`refac-05b-split-order-workspace`
- 来源：REFAC-05（#238）只搬文件、不拆函数体，把“按 ② 拆 `OrderWorkspace`”登记进候选池（[S14 REFAC-05 决定 5](S14.md#refac-05拆分-tradeorderstsx只搬移不改行为)）；S15 先做了同类的 [REFAC-06c](REFAC-06c-invoice-entry-split.md)（#256）。本任务书结构与验收照搬 REFAC-06c，只换成订单页的事实。
- 迁移：**不加**。浏览器时段：**不需要**（理由见“证据要求”）。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 现状（main `bfeccb7`）

- `packages/web/src/trade-orders/order-workspace.tsx` 共 608 行：
  - 模块层（`:1–46`）：导入；`lineFields`（`:33`）、`amountKeys`（`:34`）；自定义 Hook `useOptions`（`:35–46`，主数据下拉选项查询）；
  - 其余全部是 `export function OrderWorkspace`（`:48–608`），按 `files/fnlen.cjs` 口径（非空、非注释行）计 551 行，远超 ②。
- `OrderWorkspace` 内部分两块：
  - **状态与命令**（`:70–287`）。Hook 调用按源码顺序为：
    1. `useState`：`draft`、`dirty`、`working`、`failure`、`saved`、`preview`、`previewFocus`、`opened`（`:71–81`）；
    2. `useRef` `focusNext`（`:83`）；`useEffect`，依赖 `[linkOrder]`，地址中的订单变化时设 `opened`（`:84–87`；注释 `:81–82` 说明“地址拥有已打开的订单”，TINV-03）；
    3. `useQueryClient`（`:95`）；`useRef`：`savedNotice`、`previewButton`、`previewResult`（`:96–98`）；
    4. `useOptions` ×3：`parties`、`products`、`taxes`（`:99–101`）；
    5. `useLayoutEffect`：报告离开守卫 `[onGuard, busy, dirty]`（`:102`）、卸载时报告空闲守卫 `[onGuard]`（`:103`）、保存后聚焦提示 `[saved]`（`:105–107`，注释 D92 `:104`）、预览后聚焦 `[previewFocus]`（`:108–111`）。
  - 命令函数与派生值：`open`（`:88–94`，在 `useQueryClient` 之前声明）、`money`、`issueAt`、`edit`、`editLine`、`addLine`、`removeLine`、`discard`（`window.confirm`，`:144–150`）、`failed`、`checkedCommand`、`runPreview`（`:184–209`）、`save`（`:211–234`，成功后 `client.resetQueries({ queryKey: ["trade-orders", company.code] })`）、`fieldLabel`、`errorProps`、`errorText`（返回 JSX）、`options`，以及派生值 `partyOptions`、`productOptions`、`taxOptions`、`optionsFailed`、`generalSummary`（`:263–287`）。
  - **JSX**（`:289–607`）：`<form className="tord-entry">` 下依次为：
    - 操作栏 `div.tord-command-bar`（`:296–328`）；
    - `{failure && …}` 错误条（`:329–342`）；
    - `{saved && …}` 保存提示（`:343–352`）；
    - `{preview && …}` 预览结果 `section.tord-lookup-result`（`:353–373`）；
    - `{optionsFailed && …}` 选项读取失败提示（`:374–378`）；
    - 常规 `FastTab#tord-general`（`:379–461`）、行 `FastTab#tord-lines`（`:462–560`）；
    - 三个 `datalist`：`tord-party-options`、`tord-product-options`、`tord-tax-options`（`:561–581`）。

    `</form>` 之后：`{saved && …}` 已保存订单的 `FastTab#tord-saved`（内含 `OrderView`）、`OrderList`、`OrderLookup`（`:583–607`）。
- 唯一导出是 `OrderWorkspace`，导入方只有 `TradeOrders.tsx:17`（渲染在 `:121`）。
- 数字字面量：行数上限 `100` 出现两次（`addLine` `:126` 与加行按钮 `disabled` `:553`）；`maxLength={60}` 出现三次（订单号、伙伴、行输入）。
- 同目录其他函数也超过 ②（`order-list.tsx` `OrderList` 206 行、`order-view.tsx` `OrderView` 183 行、`order-lookup.tsx` `OrderLookup` 143 行、`TradeOrders.tsx` `TradeOrders` 111 行）；本任务只拆 `OrderWorkspace`，其余留在候选池（`OrderView` 由 S16 的 TORD-08 改动，不能同时拆）。
- 测试：
  - jsdom：`packages/web/test/trade-orders.test.tsx` 共 37 个用例（`git grep -c -E "^\s*it\(" -- packages/web/test/trade-orders.test.tsx`），经 `App` 渲染订单页，按标签与角色驱动录入表单；
  - 真实 Chrome（tests:trade-e2e）：`git grep -l -E "#tord-|tord\." -- packages/infra/test/support` 在 `bfeccb7` 上命中 5 个文件（见“冲突域”）。其中按 `id` 驱动录入表单的是 `trade-gui/scenario/orders.ts:20–23`（`#tord-side`、`#tord-orderDate`、`#tord-orderId`、`#tord-party`）与 `leave-guard.ts:33`、`:46`（`#tord-party`）。

## 范围与决定

1. **不改行为**。以下内容全部不变：
   - DOM 结构、类名、文本、属性（含 `id`、`aria-*`、`maxLength`、`inputMode`、`list`）；
   - 焦点移动（保存提示、预览结果 / 预览按钮）；
   - 请求的方法、URL、请求体与发出顺序；查询缓存的 `resetQueries`；
   - `window.confirm` 的调用时机与文案；
   - 向页面报告的离开守卫值序列（`onGuard` 的每次调用及参数）；`onLink`、`onFilter`、`onBack` 的调用。

   本任务只改代码组织，不修 bug；拆分时发现的疑似缺陷登记在 PR 正文，留作后续任务。
2. **状态只有一个主人**：
   - 所有 `useState`、`useRef`、`useEffect`、`useLayoutEffect`、`useQueryClient`、`useOptions` 调用，要么留在 `OrderWorkspace`，要么放进它在顶层无条件调用的自定义 Hook（例如 `useOrderDraft`、`useOrderCommands`、`useOrderFocus`，名称由开发定）。
   - 新抽出的**展示组件不得调用任何 Hook**，只接收 props 渲染（理由同 REFAC-03b 决定 2）。
   - 展开自定义 Hook 之后，Hook 调用序列（种类、先后顺序、依赖数组源文本）与 base 相同（验收 P5a）。特别是：`[linkOrder]` 的 effect 仍在 `useQueryClient` 之前；四个 layout effect 的先后（守卫 → 卸载清理 → 保存聚焦 → 预览聚焦）不变。
3. **组件层级对等**：
   - 新组件一律在模块顶层定义。
   - 抽出的组件只替换 `<form>` 下的**一个子表达式**（或某个 `FastTab` 内部的一个子表达式），只渲染该表达式原来渲染的内容。不得把几个相邻兄弟（例如错误条、保存提示、预览结果）合成一个返回 Fragment 的组件；三个 `datalist` 是唯一的例外，可合成一个组件，前提是它返回的 Fragment 里只有这三个元素、顺序不变。
   - 条件渲染的条件（`{failure && …}`、`{saved && …}`、`{preview && …}`、`{optionsFailed && …}`）留在父级原位置。
   - `</form>` 之后的 `OrderView`、`OrderList`、`OrderLookup` 调用保持在 `OrderWorkspace` 中，props 不变。
3a. **命令函数**：
   - `runPreview`、`save`、`failed`、`checkedCommand`、`discard`、`removeLine` 可以搬进自定义 Hook，也可以搬成模块级函数（显式接收所需的状态与 setter）。
   - 每个函数内 setter、`masterRequest`、`resetQueries`、`window.confirm` 的调用顺序不变；`runPreview` 失败时仍先 `setPreview(null)` 再 `failed(...)`、最后 `setPreviewFocus`。
   - `open` 读取的是**该次渲染**的 `linkOrder`；搬移后仍须如此（不得改成读 ref 或最新值）。
4. **文件**：新文件放在 `packages/web/src/trade-orders/` 下，按职责命名（例如 `order-command-bar.tsx`、`order-messages.tsx`、`order-general-tab.tsx`、`order-lines-tab.tsx`、`use-order-entry.ts`），粒度由开发定，写入 PR 正文。`lineFields`、`amountKeys`、`useOptions` 可以搬进新文件，但不改实现。
5. **具名常量**（⑤）：行数上限 `100` 改为一个具名常量，两处共用；`maxLength` 的 `60` 改为一个具名常量，三处共用。值都不变。
6. **不改**：
   - `TradeOrders.tsx` 及 `trade-orders/` 下的既有文件（`order-model.ts`、`order-draft.ts`、`order-list.tsx`、`order-lookup.tsx`、`order-view.tsx`、`use-order-leave-guard.ts` 等）；
   - `packages/web/test/**`、`packages/infra/test/**`、`scripts/test-shard-weights.json`；
   - 标签文件（`ui/` 下的中英文案）、CSS、契约（`@erp/core`）；
   - 其他页面与导入方。

## 冲突域

- web-ui:trade-orders 录入：只改 `packages/web/src/trade-orders/order-workspace.tsx`，并在 `packages/web/src/trade-orders/` 下新增文件。
- 取证所需观测点 / 新增测试文件：无（P4 脚本不提交）。
- 受影响的 e2e 断言（S13 回顾行动 1）：
  - 检索：`git grep -l -E "#tord-|tord\." -- packages/infra/test/support`；
  - **必须继续成立**：上述检索在 `bfeccb7` 上命中 5 个文件（`navigate-ready.ts`，以及 `trade-gui/scenario/` 下的 `invoice-source-orders.ts`、`leave-guard.ts`、`order-invoicing-filter.ts`、`orders.ts`），其中对录入表单元素 `id`、文案与焦点的断言全部不变；
  - **须随本任务改**：无。
- 受影响的文档引用（S14 回顾行动 6，D460）：`git grep -n -E "order-workspace|OrderWorkspace" -- docs` 在 `bfeccb7` 上**无结果**；`design/` 中的引用（S14.md、S15.md、reviews/S14.md）是历史记录，不改。
- 与 S16 其他任务不相交：
  - TORD-08：改 `trade-orders/order-view.tsx`、`ui/trade-order-labels.ts`、core / infra 与若干测试，不碰 `order-workspace.tsx`；本任务不改 `order-view.tsx`；
  - CI-03：只改 `packages/infra/test/**` 下 4 个文件与 `scripts/slot/preflight-baseline.json`。

## 验收

- **P1 范围**：`git diff --name-only <base> <head>` 只含 `packages/web/src/trade-orders/order-workspace.tsx` 和 `packages/web/src/trade-orders/` 下的新文件；决定 6 列出的文件 diff 为空。不加迁移。
- **P2 导出不变**：`order-workspace.tsx` 的导出集合（名称加类别）与 base 相同，即只有 `OrderWorkspace`。用仓库根 devDependency `@babel/parser` 解析，口径同 [REFAC-03 M2c（D433）](S13.md#refac-03拆分-journalstsx只搬移不改行为)。新文件的导出只供 `trade-orders/` 目录内部使用（PR 正文附 `git grep` 结果）。
- **P3 既有测试原样通过**：`trade-orders.test.tsx` 的 37 个用例和 Web 全部 jsdom 测试通过；测试文件 diff 为空。
- **P4 DOM、表单状态、焦点、请求与守卫等价**（送审证据，脚本不提交，不加常驻 CI 用例）：
  - **驱动**：临时 jsdom 驱动脚本，借用 `trade-orders.test.tsx` 的渲染方式、`QueryClient` 配置与 `fetch` 桩，在 base 与 head 上按同一序列操作。两种渲染都做：
    - 通过 `App` 渲染订单页（`#/trade/orders`），覆盖地址中的 `order=`（`linkOrder`）；
    - 直接渲染 `OrderWorkspace`，传入记录每次调用的 `onGuard`、`onLink`、`onFilter`、`onBack` 间谍。
  - 渲染前固定时钟；`window.confirm` 换成按脚本预设逐次回答的桩，并记录每次调用的文案。
  - `fetch` 桩改为**受控响应**，采样边界的规则同 [REFAC-03b P4](REFAC-03b-company-journals-split.md#验收)（操作 → 释放约定响应 → `act` 等待到待决队列与 `isFetching` / `isMutating` 满足约定、连续两次 `act` 后 DOM 不变 → 采样；不满足即报错退出）。
  - **序列**至少包含：
    - 空白草稿；填写订单号、切换方向 AP / AR（伙伴与产品选项随之过滤）、伙伴、订单日期；勾选含税价；切换舍入；
    - 改行字段、加行（含达到 100 行时按钮禁用）、删行（含删掉带错误的行后错误条同步）；
    - 预览成功（焦点到结果）、预览前端校验失败、预览接口失败（焦点回到预览按钮）、修改后预览消失；
    - 保存成功（保存提示获得焦点、`FastTab#tord-saved` 出现、列表查询被重置）、保存失败（字段错误）、保存不确定（5xx）；
    - 放弃草稿（确认取消与确认放弃）；
    - 三个选项查询之一失败；
    - 列表点订单号打开（`open(..., true)`）、按订单号查询（`open(..., false)`）、地址中 `order=` 变化；
    - 教学模式开 / 关；zh / en 两种语言。
  - **每步采样**：DOM（`document.body.innerHTML`）；表单即时状态与焦点（口径同 REFAC-03b P4）；累计请求日志（序号、方法、URL、请求体 JSON、结果）；查询缓存（`queryKey`、`status`、`isInvalidated`，按键排序）；`window.confirm` 调用记录；四个回调的调用记录（直接渲染时）。
  - **判定**：base 与 head 逐步、逐项、逐字节相同。PR 正文附脚本全文、步骤清单（含每步释放的请求序号与 `confirm` 预设回答）、两边输出的 SHA-256 与比较结果、预览与保存两组场景的逐步输出原文。
- **P5 结构规则**（静态，评审按代码与 PR 表格核对）：
  - **P5a Hook 序列**：PR 正文列出 base 与 head 的 Hook 调用序列，自定义 Hook 按调用处展开（`useOptions` 展开为其中的 `useQuery`）。每行写 Hook 种类和依赖数组源文本（空白归一；没有依赖数组的写“无”）。两边逐行相同。
  - **P5b 展示组件无 Hook**：新抽出的组件中没有任何 `use*` 调用。PR 正文附 Babel AST 检查脚本的输出。
  - **P5c 模块级定义**：所有组件与自定义 Hook 都在模块顶层声明，`OrderWorkspace` 与 Hook 的函数体内不再声明组件。
  - **P5d 插槽对等**：PR 正文用一张表列出 base 中 `<form>` 的子表达式，以及两个 `FastTab` 内部被抽出的子表达式，标出 head 中对应的唯一组件或表达式，两边一一对应。
  - **P5e 副作用顺序**：PR 正文逐函数对照 base 与 head 中 `runPreview`、`save`、`discard`、`removeLine`、`open` 内 setter、`window.confirm`、`masterRequest`、`resetQueries`、`onLink` 的调用序列；`resetQueries` 的 `queryKey` 表达式不变。
  - **P5f effect 清理**：PR 正文列出 base 中每个 `useEffect` / `useLayoutEffect` 的清理函数（只有卸载时报告空闲守卫的一个），以及它们在 head 中由哪个 Hook 拥有。
- **P6 尺寸与可读性**：
  - `OrderWorkspace`、每个自定义 Hook、每个新组件与命令函数都满足 ②（≤ 80 行、嵌套 ≤ 3 层）；
  - `order-workspace.tsx` ≤ 200 行，`trade-orders/` 下每个新文件 ≤ 400 行；
  - PR 正文列出所有超过 60 行的函数，附计数行数与最深层数。
- **P7 打包字节**（构建条件、依赖图、D432 字节口径同 [S14 REFAC-06](S14.md#refac-06拆分-tradeinvoicestsx只搬移不改行为)；首屏按 D454，见[任务书模板](TEMPLATE.md)“首屏比对”）：
  - PR 正文须有“构建来源”一节（[S15 共同验收](S15.md#共同验收)，[任务书模板](TEMPLATE.md)“证据要求”）。base 为最终送审 head 的实际合并基；合并基变了就重新测量。
  - 首屏：±0。
  - **订单块路由**：在 `bfeccb7` 上只有订单路由（`#/trade/orders`）加载订单页块（`TradeOrders-*.js`）：构建后只有入口块 `index-*.js` 引用它（懒加载）。PR 正文列出 base 上加载该块的路由及判定依据。
  - 订单路由的“路由新增”JS 合计（屏蔽哈希后的 gzip-9）增加不超过 **+900 B**；其他路由 ±0。
  - 各路由 CSS 的集合与字节都不变。
  - **+900 B 的依据**（设计角色在 `bfeccb7` 上试算，按 D461 包含要搬走的命令与闭包；本机 Windows，Node v26.13.0 / npm 11.20.0，`package-lock.json` blob `07c1aee8b9c3392b88c25f9bb670adbbc8f19201`，`npm ci` 后 `npm run build -w packages/web`，只量订单页块，屏蔽哈希后 gzip-9；试算改动未提交）：
    - base：`TradeOrders-*.js` 38,755 B / 11,796 B（原始 / gzip-9）；
    - 试算：把 `:70–287` 的全部状态、effect、命令与派生值原样搬进**一个**返回对象的 Hook，再抽出 7 个只收 props 的组件（操作栏、错误条、保存提示、预览结果、常规字段、行字段、三个 datalist）：40,455 B / 12,289 B，即 **+493 B**；入口块 +1 B（哈希名长度噪声）。
    - 试算中的 Hook 仍有 213 行、行字段组件 97 行、常规字段组件 85 行，没有满足 ②。按决定 2、3a 继续拆成 3–4 个 Hook 或模块级命令函数（显式传参），会再增加传参与返回对象的字节。REFAC-06c 的实测（D461：试算 +400 B，实测精简后约 +873 B）说明这部分约占一半，所以上限取 +493 B 的约 1.8 倍，与 D461 相同的 +900 B。

  超出阈值先停下报设计角色。
- **P8 质量门**：`typecheck`、`lint`、CI-02 预检通过；PR CI 绿；合并后覆盖该合并提交的 main Full 绿（含 tests:trade-e2e 的浏览器分片，即“冲突域”中“必须继续成立”的断言）。
- **P9 可读性一节**：PR 正文按下节逐条说明。

## 性能考虑

- 渲染次数不变：不加 `memo`，不改 Hook 依赖，每次状态变化触发的渲染与 base 相同；组件层级加深只增加少量函数调用，不跑 Bench。
- 打包变化由 P7 约束；试算见 P7。
- 其余项（规模、索引、查询次数、分页、事务）不适用：不改数据访问。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥：

- **②**：本任务就是为满足 ② 而做。`OrderWorkspace` 从 551 行拆到每个函数 ≤ 80 行、嵌套 ≤ 3 层（P6）。
- **③**：`order-workspace.tsx`（608 行）不是热点（≤ 800）；本任务对它大幅净减。PR 正文贴 `git diff --numstat`。
- **①**：组件与 Hook 名表达职责，如 `OrderCommandBar`、`OrderLinesTab`、`useOrderCommands`，不用 `Part1`、`Section2`。
- **④**：行数上限 `100`、`maxLength` `60` 各共用一个常量（决定 5）。错误条、保存提示、预览结果结构不同，不强制抽取。
- **⑤**：见决定 5。
- **⑥**：原有的“为什么”注释（地址拥有已打开的订单 `:81–82`、D92 的 layout effect `:104`、`previewFocus` 的说明 `:78`、`onBack` 的 TORD-07 规则 3 `:66`）随代码搬移，不删改。不留调试输出。

## 用户可见变化

- 无。页面外观、文案、键盘与焦点行为、请求都不变（P3、P4）。

## 证据要求

- **不需要浏览器时段**：
  - 行为等价由 P3（既有 jsdom 用例）与 P4（逐步 DOM、表单状态、焦点、请求与守卫等价）证明；
  - tests:trade-e2e 中经过录入表单的步骤（“冲突域”所列）在合并后由覆盖合并提交的 main Full 的浏览器分片执行；
  - 比照 REFAC-06c 的口径。

  P4 在本机运行，须服从协调者的时段停用通知（D442）。
- **可行性**（S13 回顾行动 4）：P4 的驱动方式已由 REFAC-06c（#256）在发票页跑通；P7 的试算见上。
- PR 正文附：
  - P2 导出与 `git grep` 结果；
  - P4 脚本、步骤清单、比较结果与两组场景的逐步输出；
  - P5a Hook 序列表、P5b 检查输出、P5d 插槽对照表、P5e 副作用顺序表、P5f 清理归属表；
  - P6 函数行数表；
  - P7 的“构建来源”一节、订单块路由清单与字节表；
  - 可读性一节。
- 证明类验收附脚本原文与未截断输出，或链接到固定修订（S13 回顾行动 6）。
