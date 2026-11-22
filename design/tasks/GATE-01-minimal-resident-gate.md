# GATE-01 拆出最小常驻闸门，入口块回到 PG-05 预算内

- Sprint：S10（[计划](S10.md)）　依赖：无　建议分支：`gate-01-minimal-resident-gate`
- 冲突域（逐个列文件）：
  - web-ui:shell：`packages/web/src/App.tsx`（只改第 4–5 行的注释与静态导入）；
  - 历史闸门：`packages/web/src/leave-guard-history.ts`（拆分）、`packages/web/src/leave-guard-gate.ts`（新建，常驻部分）、`packages/web/test/leave-guard-history.test.ts`（补用例）；
  - 真实 Chrome 取证：`packages/infra/test/support/trade-gui-scenario.ts` 新增 `leaveOnFirstKey()` 与 `leaveByForward()` 两个步骤（验收 4），在现有两次 `leaveByBack()` 调用（`:1320–1334`）之后调用；`leaveByBack()` 本身与其他步骤不改；
  - 共享单文件：`packages/infra/test/support/trade-gui-scenario.ts`（与 TINV-05 共享，顺序与门禁见 [S10 泳道](S10.md#泳道)；只在验收 2、3 的测量达标后才改，见决定 4）。**不新增测试文件**，因此不改 `scripts/test-shard-weights.json`。
  - **不涉及**：`TradeInvoices.tsx`、`TradeMaster.tsx`、`TradeOrders.tsx` 的导入行与 `guardHistory` 调用（三页仍从 `leave-guard-history.ts` 导入，见“设计决定”2）；任何页面 CSS；路由表与懒加载列表（`App.tsx:20–60`）；`vite.config.ts`。
- 类型：前端重构（行为不变）
- 优先级：P2（S9 评审遗留 1，D284 超预算的后续）

## 现状（main `f943b8b`）

- `App.tsx:4–5` 静态导入整个 `./leave-guard-history.ts`，注释说明须在 HashRouter 注册它的 `popstate` 监听之前（D280，[S9 评审](../reviews/S9.md) #181 行）。
- `leave-guard-history.ts`（69 行）同时包含两部分：常驻闸门（`handlers`、`gate`、`installGate()` 与模块求值时的 `installGate()` 调用，`:22–40`）和按页注册的 `guardHistory()`（`:42–69`，含 `currentEntry`，`:10–12`）。
- 三个懒加载页面从该模块导入 `guardHistory`：`TradeInvoices.tsx:22`、`TradeMaster.tsx:17`、`TradeOrders.tsx:4`（后者写作 `.js`）。
- 因为 `App.tsx` 静态导入了整个模块，`guardHistory` 也进了入口块：#181 的 PG-05（gzip-9）入口 +375 B，超预算 75 B（D284 接受），同时 `TradeOrders` 块 −166 B（[S9 评审](../reviews/S9.md) #181 行与 §3 D284 条）。
- 只在真实 Chrome 复现、必须保持的行为：D280 监听顺序；D282 `useLayoutEffect` 安装时机；TINV-04 验收 5a（后退 / 前进只确认一次；取消后地址、页面、草稿不变；继续后到达目标），真实 Chrome 现有覆盖**只有后退**：`trade-gui-scenario.ts` 的 `leaveByBack()`（`:1417–1460`）只调用 `page.goBack()`，且在第一次后退之前已完成导航、整段输入（`type()` 以 Tab 结束，`:188–193`）和对话框处理函数注册，不是“首次输入后立即后退”的用例。**前进只有 jsdom 覆盖**：`trade-orders.test.tsx:1484–1520`（`it.each` 的 `Forward` 一行，只覆盖订单页取消；检索 `rg -n "goForward|history\.forward" packages/infra/test packages/web/test` 只命中 `trade-orders.test.tsx:1508`）。可接受的限制：取消会截断前进历史（D275）。
- 构建配置没有 `manualChunks` 与 `sourcemap`（`packages/web/vite.config.ts:15` 只有 `outDir`、`emptyOutDir`）。

## 设计决定（产品负责人）

1. **常驻部分只留闸门本身**：新建 `leave-guard-gate.ts`，只含 `handlers` 注册表、`gate` 分发函数、`installGate()` 和模块求值时的一次 `installGate()` 调用，以及注册 / 注销处理函数的两个导出。`App.tsx` 改为静态导入这个模块，注释同步改写（仍说明 D280 的原因）。
2. **`guardHistory` 留在原模块**：`leave-guard-history.ts` 保留 `guardHistory`、`HistoryGuard` 类型与 `currentEntry`，改为从 `leave-guard-gate.ts` 导入注册函数与 `installGate`。三个页面的导入行一字不改，所以本任务与 TINV-05 在 `TradeInvoices.tsx` 上不相交。
3. **懒加载归属交给打包器**：不加 `manualChunks`。`leave-guard-history.ts` 被三个懒加载页面共用，打包器可能把它放进共享块（多一个并行请求）或其中一个页面块；两种都接受，PR 正文写明实际结果。
4. **预算与停止**：入口块 gzip-9 相对 PR 实际 base 至少减少 75 B（使 D284 的超出部分归零）。先做拆分并完成验收 2、3 的测量，达标后才改共享单文件 `trade-gui-scenario.ts`。达不到时停下报告设计角色，附字节表；不靠删注释、改压缩配置或改 `vite.config.ts` 凑数。之后由协调者以决定编号二选一：① 接受较小的减少（写明接受的字节数），按正常路径继续并合并；② 不合并结案，遗留 1 维持到后续 Sprint。两种结果怎样满足 DEMO-10 门禁、怎样解除 `trade-gui-scenario.ts` 门禁，见 [S10“不合并结案与门禁解锁”](S10.md#不合并结案与门禁解锁)。
5. **用户可见变化**：无功能变化；首次加载的入口块变小。PR 正文“用户可见变化”一节写“无”，并给出 PG-05 字节表。

## 导航与历史

- **机制不变**：仍是每个窗口一个常驻闸门，在 `window` 上以捕获方式监听 `popstate` 与 `hashchange`（现 `leave-guard-history.ts:36–37`），逐个调用已注册的处理函数，某个处理函数阻止后不再继续；取消时只用 `pushState` 回到原地址，不调用 `history.go`（D275）。
- **注册位置与顺序**：闸门在 `leave-guard-gate.ts` 求值时注册；该模块由 `App.tsx` 静态导入，求值早于 `HashRouter` 挂载时注册自己的 `popstate` 监听（D280）。页面的处理函数在 `useLayoutEffect` 中注册到闸门（D282），不直接加 `window` 监听。拆分后这两点都不变。
- **可接受的限制**：取消会截断前进历史（D275），不变。

## 范围

1. 新建 `leave-guard-gate.ts`（决定 1），从 `leave-guard-history.ts` 移出对应代码；原文件只保留 `guardHistory` 部分（决定 2）。两个文件顶部注释各自说明职责，原注释中关于 D275、D280 的说明不丢失。
2. `App.tsx:4–5` 改为导入 `./leave-guard-gate.ts`，注释同步。
3. `leave-guard-history.test.ts` 补用例（不新建文件）。

## 入口参数与异常

不适用：本任务不涉及 URL、查询或路径参数，也不改任何页面的入口参数处理。

## 不在范围

- 保留前进历史（S9 评审遗留 5）；任何离开确认的行为或文案变化。
- 页面导入行、`useInvoiceLeaveGuard` 与其他页面守卫。
- `vite.config.ts`、`manualChunks`、压缩配置。

## 验收标准

1. **行为不变（jsdom）**：`packages/web/test/leave-guard-history.test.ts` 现有用例与 `trade-invoices.test.tsx:897`、`trade-master.test.tsx:243`、`trade-orders.test.tsx:1497–1583` 一带的历史用例一字不改、全部通过。补两条用例：
   - 只导入 `leave-guard-gate.ts`（不导入 `leave-guard-history.ts`）时，闸门已在 `window` 上注册（例如派发 `popstate` 时已注册的处理函数被调用）；
   - 通过 `leave-guard-history.ts` 注册的处理函数与闸门是同一份注册表（同一窗口不会出现两个闸门：`installGate()` 多次调用只注册一次）。
2. **入口块**：`npm run build` 后入口块 gzip-9 相对 PR 实际 base 减少 ≥ 75 B（决定 4）；PR 正文给出入口块、`leave-guard-history.ts` 所在块、三个页面块与 CSS 的 gzip-9 字节表（base / head / 差值）。
3. **模块归属**：用本地临时构建（`npx vite build --sourcemap`，在 `packages/web` 下执行，不提交配置改动）读取入口块 `.map` 的 `sources`：包含 `leave-guard-gate.ts`，不包含 `leave-guard-history.ts`；PR 正文附命令与输出。
4. **真实 Chrome**（`trade-gui-*.slow.test.ts`，中 / 英两轮，发票页与订单页都跑，附完整日志）：
   - **a. 现有后退**：`leaveByBack()` 一字不改通过（同 #181 D294 的口径：只弹一次确认；取消后地址、页面、草稿不变；继续后到达目标）。
   - **b. 首键后退（D280 + D282）**：新增 `leaveOnFirstKey()`。`navigate("trade-reports")` → `navigate(path)`（到页面标题出现为止，沿用 `:871–886` 的等待）→ **先**注册对话框处理函数（取消）→ 用 Tab 把焦点移到伙伴字段，按**一个**字符键使草稿 dirty → **紧接着**调用 `page.goBack({ waitUntil: "commit" })`。按键与后退之间不加 `waitForTimeout`、`expect.poll`、Tab 或任何等待页面稳定的步骤。断言：只弹一次确认；地址仍是 `#/<path>`、页面标题不变、字段值为该字符。随后改为接受并再后退一次，只弹一次确认，到达 `#/trade-reports`。
   - **c. 真实前进**：新增 `leaveByForward()`。
     - 取消：`navigate(path)` → `navigate("trade-reports")` → `page.goBack()` 回到 `path`（草稿干净，断言 0 次确认）→ `type()` 使草稿 dirty → `page.goForward({ waitUntil: "commit" })`。断言只弹一次确认；取消后地址、页面、草稿不变。
     - 继续：取消已截断前进历史（D275），所以继续分支重新建立前进条目：改为接受 → `navigate("trade-reports")`（站内跳转，只弹一次确认并接受）→ `page.goBack()` 回到 `path`（0 次确认）→ `type()` → `page.goForward({ waitUntil: "commit" })`。断言只弹一次确认，到达 `#/trade-reports`。
     - 每次导航后都断言累计确认次数恰好等于预期值。
   - **d. 先在 base 上跑**：b、c 两个新步骤先在 PR 实际 base 上通过，证明它们描述的是现有行为。base 上不通过即为现有缺陷，停下报告设计角色，不在本任务修。PR 正文附 base 与 head 两份日志。
   - **覆盖边界**：真实 Chrome 覆盖两页的后退（a、b）与前进（c）。jsdom 的前进用例（`trade-orders.test.tsx:1484–1520`）保留，作为 `history.go` 未被调用的补充证据（真实 Chrome 不监视 `history.go`）。不覆盖：一次后退跨越多个历史条目，以及取消后保留前进历史（D275 已知限制）。
5. 无 CSS 变化（CSS 文件 SHA 不变）；无 `package.json` / lock 变化；现有测试与 E2E 不删除、不削弱、不跳过（D11）。

## 性能考虑

- 规模、读写路径、索引、查询次数、分页、事务 / 缓存：不适用（纯前端模块拆分，不发请求、不碰存储）。
- **前端开销**：入口块变小；进入三个守卫页面之一时可能多一个并行的共享块请求（决定 3），体积为原来在入口里的那部分，PR 正文给出该块 gzip-9 字节数。
- **预算与验证方式**：PG-05 前端体积必测（验收 2），base 为 PR 实际 base，数字绑定最终送审 head，与取证 head 分开写。

## 证据要求

- 真实 Chrome 与 E2E：按[路线图 §5 UI PR 证据清单](../roadmap.md#5-团队流程) 1–9 项，请求评审前逐项勾选。本任务不改布局，第 4 项像素差只需证明守卫页面在 1440 / 390 下 base 与 head 像素差为 0（两主题）。
- **只能由真实 Chrome 证明的验收项**（mock 测试不能替代）：
  - D280 监听顺序、后退方向的 TINV-04 验收 5a：`leaveByBack()`（`:1417`，验收 4a）；
  - D282 首次安装时机，即首次输入后立即后退也会确认：`leaveOnFirstKey()`（新增，验收 4b）；
  - 前进方向的 TINV-04 验收 5a：`leaveByForward()`（新增，验收 4c）；
  - 以上步骤都在 `trade-gui-scenario.ts` 中，由 `trade-gui-*.slow.test.ts` 运行；新步骤另附 base 上的通过日志（验收 4d）。
- 构建产物归属：验收 3 的命令与输出。

## 设计自查（路线图 §5 设计文档自查 1–9）

- [x] 1 事实断言有来源
- [x] 2 不涉及进行中的 PR
- [x] 3 依赖列与泳道说明一致（与 TINV-05、CSS-02 不相交；`trade-gui-scenario.ts` 按泳道顺序，GATE-01 结案后解除门禁，含不合并结案）
- [x] 4 不新增 CSS
- [x] 5 覆盖类断言给出 `file:line`
- [x] 6 共享单文件 `trade-gui-scenario.ts` 已列入泳道（新增两个步骤，测量达标后才改）；不新增测试文件
- [x] 7 不涉及入口参数
- [x] 8 改动条款已通读上下文
- [x] 9 导航与历史：机制、注册位置与顺序、可接受的限制已写明
