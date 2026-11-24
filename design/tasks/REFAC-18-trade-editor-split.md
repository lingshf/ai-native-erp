# REFAC-18：拆分 `TradeEditor` 函数体（不改行为）

- Sprint：S24（[计划草案](S24.md)）　类型：重构（页面）　优先级：P2　决定：[D534](S24.md#s24-期间决定)（只改代码组织、不改行为；见“范围与决定”1–7）　建议分支：`refac-18-split-trade-editor`
- 来源：[S24 候选](S24.md#候选s24-其余泳道s23-评审后定)“按 ② 拆 `TradeEditor`（292）”。结构与验收照搬 [REFAC-16](REFAC-16-rule-settings-split.md)（#334 已合并），只换成“贸易主数据编辑器”的事实；R4 的记录规则复用 [REFAC-17 R4](REFAC-17-prepare-trade-action-split.md#两侧都须成立的不变量)（#335 已合并）的委托包装与记录编码。main Full 只作合并后检查（R8b），不作合并前门。
- 迁移：**不加**。浏览器时段：**不需要**（理由见“证据要求”）。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 为什么是它

- REFAC-16 合并后，设计角色在 `f3a7646` 上用 `node files/fnlen.cjs packages/web/src` 实测，`packages/web/src` 中最长的两个函数是 `Workspace`（295 行，`App.tsx`，首屏文件）与 **`TradeEditor`（292 行）**，约为 ② 上限（80 行）的 3.7 倍。
- 选它而不选 `Workspace`：`Workspace` 在首屏闭包中，任何组织变化都直接进首屏预算（D454），且承载整个外壳的导航与锁定，评审面最大；`TradeEditor` 在路由 chunk `src/TradeMaster.tsx` 内，首屏 ±0 可由构建直接证明。REFAC-16 的任务书已写明“`TradeEditor` 留作下一个页面拆分”。
- 它承载贸易主数据（往来方、产品、过账配置、付款条件、税码五类）的全部编辑交互：草稿初值、逐字段解析与契约校验、保存与“结果未知”的对账重试、冲突后重新加载、编辑锁与离开守卫、取消确认。JSON 字段的判定 `field === "rates" || field === "defaultDimensions"` 在函数内写了两遍（`:471`、`:595`），是本任务唯一的去重点（决定 5）。
- **节奏**：同一时间只有一个页面拆分在途。REFAC-16 已由 #334 合并，本批其他任务（REFAC-19、REFAC-20）都不是页面拆分。
- 冲突域与同批任务不相交：REFAC-19 只改 `packages/infra/src/storage/`，REFAC-20 只改 `packages/core/src/domain/`（见“冲突域”）。

## 现状（main `f3a7646`）

下文 `file:line` 都按 `f3a764636a39ea8c2e9622b8e9f9782f16aa076a`。

- `packages/web/src/TradeMaster.tsx` 共 687 行，只导出 `TradeMaster`（`:94`）。模块内另有：类型 `T`、`TradeKind`、`Failure`、`EditorGuard` 与常量 `tradeKinds`、`idleGuard`（`:21–26`）；`useTradeLeaveGuard`（`:27–64`）；`failure`（`:65–83`）；`Notice`（`:84–93`）；`PaneActions`（`:205–231`）；`TradePane`（`:232–368`）；常量 `specific`（`:369–381`）、`choices`（`:382–387`）、`nullable`（`:388–395`）；**`TradeEditor`（`:396–687`）**。`specific`、`choices`、`nullable` 只在 `TradeEditor` 内使用。
- 设计角色用 `node files/fnlen.cjs packages/web/src` 实测（只列本文件）：

  ```text
  292	packages/web/src/TradeMaster.tsx:396-687	TradeEditor
  136	packages/web/src/TradeMaster.tsx:232-368	TradePane
  110	packages/web/src/TradeMaster.tsx:94-203	TradeMaster
  ```

  `TradePane` 与 `TradeMaster` 也超过 80 行，但不在本任务范围（决定 7），登记入候选池。
- **属性**：`company`、`kind`、`initial`（`TradeDto | null`）、`t`、`close`、`lock(guard: EditorGuard)`；由 `TradePane`（`:356–365`）以 `key={editing ? \`${editing.code}:${editing.revision}\` : "new"}` 渲染，`lock` 是 `TradeMaster` 的 `setGuard`（`:198`）。
- **Hook 调用**（`TradeEditor` 内，源码顺序，R5a 的 base 一侧）：
  1. `useQueryClient()`（`:411`）；（`fields` 常量 `:412`）
  2. `useState`：`code`（`:413`，`initial?.code ?? ""`）、`active`（`:414`，`initial?.active ?? true`）、`draft`（`:415–445`，惰性初值函数：默认值 `"30"`、`"7"`、`"1.5"`、`"true"`、`"100"` 等，再按 `initial.data` 映射）、`error`（`:446`，`null`）、`busy`（`:447`，`false`）、`uncertain`（`:448`，`false`）；
  3. `useRef`：`starting`（`:449`，`JSON.stringify({ code, active, draft })`）；（派生值 `dirty` `:450`）
  4. `useRef`：`pendingCommand`（`:451`，`null`）、`generation`（`:452`，`0`）；
  5. `useLayoutEffect`，依赖 `[lock, dirty, busy, uncertain]`（`:453–455`）：`lock({ open: true, dirty, pending: busy || uncertain })`；
  6. `useLayoutEffect`，依赖 `[lock]`（`:456`）：清理时 `lock(idleGuard)`；
  7. `useEffect`，依赖 `[]`（`:457–462`）：卸载时 `generation.current++`。
- **命令**：
  - `submit`（`:463–511`）：`busy || uncertain` 时直接返回；逐字段解析（`:466–490`）：JSON 字段 `JSON.parse`，`allowedTaxCodes` 按逗号切分、去空白、去空项，`allowPartialDiscount` 转布尔，`dueDays` / `discountDays` 去空白后为空则转 `null`（契约 `trade-master.ts:44–45` 不可空，随后 `safeParse` 失败；见 D537、D538），`nullable` 中的字段空串转 `null`；`SyntaxError` 时置 `{ path: "data.<field>", key: "trade.issue.shape" }` 并返回，其他错误原样抛出；再 `tradeWriteSchema.safeParse`，失败取第一条 issue 的路径；成功后写 `pendingCommand` 并 `await persist(...)`。
  - `persist`（`:512–556`）：`id = ++generation.current`；`expectedRevision` 非 0 时 `PUT`，否则 `POST` `/api/v1/trade/${kind}`；`reconcile` 为真且返回 409 时，`GET /api/v1/trade/${kind}/<code>?company=<公司>`，五项（`kind`、`code`、`revision === expectedRevision + 1`、`active`、`JSON.stringify(data)`）全部相符才视为已保存；`generation.current === id` 时才 `close()`、写错误与 `uncertain`（`:544–550`：非 `MasterDataFailure`、非 `http`、状态 ≥ 500、或对账时非 409 为 `true`）；`finally` 中 `generation.current === id` 时复位 `busy`，`accepted || generation.current !== id` 时失效 `["trade", company.code, kind]`（`:554`）。
- **JSX**（`<form>` → `FastTab` 下，R5d 的 base 一侧）：
  1. 三条提示（`:564–566`：`trade.nullHint`；`tradeProfile` 时 `trade.discountHint`；`taxCode` 时 `trade.rateHint`）；
  2. `(busy || uncertain)` 时的 `role="status"`（`:567–569`）；
  3. `uncertain` 时的“对账”按钮（`:570–581`）；
  4. `fieldset disabled={busy || uncertain}`（`:582–683`）内依次为：代码输入（`:583–592`，`initial` 存在时禁用）、`fields.map`（`:593–642`：`allowPartialDiscount` 为复选框；`choices` 中的字段为 `select`；JSON 字段为 `textarea`；其余为 `input`，`from` / `to` 为 `date`；`aria-invalid` 与 `aria-describedby="trade-error"` 按错误路径设置）、“启用”复选框（`:643–651`）、错误条 `#trade-error`（`:652–656`）、操作区（`:657–682`：`error?.conflict` 时的“重新加载”按钮 `:658–669`，失效 `["trade", company.code, kind]` 并关闭；保存 `:670–672`；取消 `:673–681`，`!dirty || window.confirm(t("trade.discard"))` 时关闭）。
- **相近但不相同的处理**（拆分时最容易被误合并，R4 序列专门覆盖）：
  - 失效同一查询键 `["trade", company.code, kind]` 的两处（`persist` 的 `finally` 与“重新加载”按钮）条件不同：前者在 `accepted || generation.current !== id` 时、不关闭；后者无条件并关闭。两处**各自保留**（不在 ⑤ 去重范围）。
  - `required`：JSON 字段的 `textarea` 一律必填；`input` 在字段不属于 `nullable` 且不是 `allowedTaxCodes` 时必填；复选框不设。
  - “对账”只重发 `pendingCommand.current` 中**同一个**命令对象（同一 `expectedRevision`），不重新解析草稿。
  - 取消：草稿未改时**不**调用 `window.confirm`。
- **数字字面量**：草稿默认值是字符串（`"30"` 等，属领域默认值）；`revision + 1`、`?? 0`、`>= 500`、`409` 都是协议或语义值，不在 ⑤ 范围，原文不变。
- **离开守卫**：`TradeMaster` 以 `useTradeLeaveGuard(guard, …)`（`:100`）在 `guard.dirty || guard.pending` 时挂接 `guardHistory`（`leave-guard-history.ts`）、`document` 捕获阶段的 `click` 与 `window` 的 `beforeunload`；`guard.open` 时禁用公司与类别下拉（`:124`、`:162`）。`pending` 时离开一律被拒且**不**询问（`mayLeave` 先判断 `!guard.pending`）。这是 `lock` 值在页面上的全部去向，R4 驱动 B 据此直接观测。
- **导入方**：`TradeMaster.tsx` 只被 `App.tsx:38–39` 懒加载（`lazy(() => import("./TradeMaster.tsx").then(...))`），在 `:273` 渲染。
- **测试**：
  - jsdom：`packages/web/test/trade-master.test.tsx` 733 行、13 个用例；经过编辑器的有 `:144`（脏草稿锁定对象切换、显式取消与导航的确认）、`:217`（真实“后退”）、`:259`（写请求在途时阻止上下文、侧栏与浏览器导航）、`:310`（结果未知时锁定，并以同一 CAS 命令对账）、`:385`（五类新建与编辑、精确小数、CAS 与不可改代码、切换语言保留草稿）、`:523`（教学提示与错误）、`:582`（失败草稿保留，区分字段错误与过期版本重新加载）。
  - 真实 Chrome（只在 main Full 中运行）：`packages/infra/test/support/trade-gui/scenario/part-one.ts:88–103`（`configurer`）按 `#trade-kind`、`trade.new`、`#trade-code`、`#trade-name`、`#trade-<字段>`（`SELECT` 用选择，其余逐字输入）、`dim.save` 操作编辑器，并等待 `#trade-code` 脱离文档。

### chunk 归属与首屏（S22 回顾行动 3，base 实测）

设计角色在 `f3a7646` 上运行 `node scripts/measure/bundle-measure.mjs --base f3a764636a39ea8c2e9622b8e9f9782f16aa076a --head f3a764636a39ea8c2e9622b8e9f9782f16aa076a --work <新目录> --d454`（脚本取自 `f3a7646`，该文件最后一次改动是 `6156759`；退出码 0，`RESULT: PASS`）：

| 文件 | 落在哪个 chunk | 依据 |
| --- | --- | --- |
| `TradeMaster.tsx`（改） | 路由入口 chunk `src/TradeMaster.tsx`（`assets/TradeMaster-*.js`） | `App.tsx:38–39` 懒加载；没有其他导入方 |
| `trade-master/` 下新文件（新增） | 同上 | 只允许被 `TradeMaster.tsx` 或本任务的新文件导入（决定 6） |
| 首屏（`index.html` 入口与预加载闭包） | **本任务不改任何首屏文件** | `ui/*`、`ui/components`、`master-data-client.ts`、`leave-guard-history.ts` 只导入、不改（决定 7） |
| CSS | 不改 | 路由闭包的 CSS 为 `components.css`、`index.css`、`master.css`（输出原文） |

base 数字（屏蔽哈希后的原始 / gzip-9 字节，输出原文行）：

```text
| first-screen | first-screen | 531160 | 531160 | 161115 | 161115 | 0 | ±0 | PASS |
| route | src/TradeMaster.tsx | 37776 | 37776 | 13691 | 13691 | 0 | ±0 | PASS |
| chunk | src/TradeMaster.tsx | 12982 | 12982 | 4658 | 4658 | 0 | ±0 | PASS |
```

## 范围与决定

1. **不改行为**（D534）。以下全部不变：DOM 结构、类名、文本、属性（含 `id`、`required`、`disabled`、`type`、`aria-*`、`role`、`htmlFor`）；请求的 URL、方法、请求体与发出顺序；查询键与失效的键及条件；`lock` 收到的值序列；离开守卫的挂接与卸下；`window.confirm` 的调用条件与次数；焦点与键盘行为；`generation` 卸载保护与 `busy || uncertain` 防重入的语义。只改代码组织，不修 bug；拆分时发现的疑似缺陷登记在 PR 正文，留作后续任务。
2. **Hook 顺序不变**：Hook 可以留在 `TradeEditor`，也可以放进它顶层无条件调用的自定义 Hook（例如 `useTradeEditor`）。**展示组件不得调用任何 Hook**；不新增 `useCallback`、`useMemo`、`memo`。展开自定义 Hook 后，Hook 调用序列（种类、先后、参数与依赖的源文本，空白归一）与“现状”所列 base 序列逐项相同（R5a）。**唯一豁免**：`draft` 的 `useState` 参数可以由内联惰性函数改为调用模块顶层纯函数的箭头函数（例如 `() => initialTradeDraft(company, kind, initial)`），仍须是**函数形式**（惰性，每个编辑器实例只求值一次）；被搬出的函数体与 base `:416–444` 逐字相同（只归一缩进），由 R5c 核对。
3. **命令**：`submit` 与 `persist` 可以搬进自定义 Hook；`generation` / `pendingCommand` / `busy` / `uncertain` 的读写顺序、两层 `try` 的结构、`finally` 的两个条件不变；每次渲染仍读取当次状态，不改为缓存的闭包。逐字段解析（`:470–486` 的嵌套条件表达式）可以抽成模块顶层纯函数（例如 `tradeFieldValue(field, value)`），分支顺序与表达式原文不变，只把 JSON 字段的判定换成决定 5 的谓词；`SyntaxError` 的捕获留在 `submit` 的循环内，原样返回。
4. **组件层级对等**：新组件一律在模块顶层定义。抽出的组件只替换“现状”所列 JSX 的 4 项之一，或第 4 项 `fieldset` 内部的一段（例如单个字段、操作区）；只渲染该段原来渲染的内容，不把相邻兄弟合成一个返回 Fragment 的组件。条件渲染的条件留在父级原位置，或留在被抽出组件内与原来相同的位置。**不合并**“现状”所列的相近处理：两处查询失效各自保留；复选框字段与 `fields.map` 中的 `allowPartialDiscount` 复选框各自保留。
5. **JSON 字段判定去重**（⑤ 去重，R6b）：`field === "rates" || field === "defaultDimensions"` 两处（`:471`、`:595`）改为**同一个**模块顶层谓词（例如 `isJsonField(field)`）各调用一次，原表达式只在该谓词内出现一次。
6. **文件**：新建目录 `packages/web/src/trade-master/`（与 `trade-reports/`、`trade-invoices/` 等并列；base 上不存在），新文件按职责命名（例如 `trade-editor.tsx`、`use-trade-editor.ts`、`trade-draft.ts`、`trade-field.tsx`、`trade-editor-actions.tsx`），粒度由开发定，写入 PR 正文。新文件只被 `TradeMaster.tsx` 或本任务的新文件导入。`TradeMaster` 仍从 `./TradeMaster.tsx` 导出，签名不变（`App.tsx` 不改）。`TradeEditor` 可以留在 `TradeMaster.tsx`，也可以整体搬到新文件；`specific`、`choices`、`nullable` 随之原样搬移。`TradeEditor` 搬走后，`T`、`TradeKind`、`Failure`、`EditorGuard`、`idleGuard`、`failure` 若两侧都要用，可以原样搬到一个新文件由两侧导入（定义文本逐字不变）。
7. **不改**：
   - `TradeMaster`、`TradePane`、`PaneActions`、`Notice`、`useTradeLeaveGuard` 的函数体（可因决定 6 增删 `import` 行）；`App.tsx` 与路由表；`master-data-client.ts`、`leave-guard-history.ts`、`ui/**`（含标签与 `ui/trade-master-teaching.ts`）；CSS（含 `pages/master.css`）；契约（`@erp/core/contracts`）；
   - `packages/web/test/**`（含 `setup.ts`）、`packages/infra/**`（含 `trade-gui` 场景）、`packages/core/**`；
   - `scripts/**`（含 `scripts/slot/`、`scripts/measure/`）、`scripts/test-shard-weights.json`、`package.json` / lock、`vitest.config.ts`。

## 冲突域

- web-ui:trade-master：只改 `packages/web/src/TradeMaster.tsx`，并新增 `packages/web/src/trade-master/` 下的文件（决定 6）。
- 取证所需的观测点和新增测试文件：无（R4 驱动不提交）。
- 受影响的 e2e 断言（S13 回顾行动 1）：`trade-gui/scenario/part-one.ts:88–103` 依赖的 `id`、按钮文案、`SELECT` 与输入的区分以及保存后编辑器卸载**必须继续成立**；合并前由 R3 与 R4（DOM 逐字节相同）保证，合并后由 R8b 的 main Full 复核；**须随本任务改**：无。
- 受影响的文档引用（D460）：`git grep -n -F "TradeMaster.tsx" -- docs design` 在 `f3a7646` 上命中 41 行，都是当时的事实记录，不改。
- 与同批任务不相交：REFAC-19 只改 `packages/infra/src/storage/reports.ts` 与同目录新文件，REFAC-20 只改 `packages/core/src/domain/journals.ts` 与同目录新文件；三者没有共享文件，测试项目也不同（本任务跑 `web`）。

## 验收

### base 失败、head 通过

| 编号 | 检查 | base `f3a7646` | head 要求 |
| --- | --- | --- | --- |
| R6a | `node fnlen.cjs packages/web/src`（口径同 S16–S24）中 `TradeEditor` 的行数 | **292**（失败） | ≤ 80，且本任务新增或改动的函数都 ≤ 80（`TradeMaster`、`TradePane` 不改，不计） |
| R6b | `git grep -n -F 'field === "rates" \|\| field === "defaultDimensions"' <rev> -- packages/web/src/TradeMaster.tsx packages/web/src/trade-master` 的命中数 | **2**（`:471`、`:595`，失败） | **1**（决定 5 的谓词内）；PR 正文附 base 与 head 两侧检索原文 |

### 两侧都须成立的不变量

- **R1 范围**：`git diff --name-only <base> <head>` 只含 `packages/web/src/TradeMaster.tsx` 与 `packages/web/src/trade-master/` 下的新文件；决定 7 所列文件的 diff 为空。不加迁移。
- **R2 导出不变**：`TradeMaster.tsx` 的导出集合与 base 相同（`TradeMaster`，function），参数类型的源文本相同（只归一空白）。用仓库根 devDependency `@babel/parser`（插件 `typescript`、`jsx`）解析，口径同 REFAC-14 R2。新文件的导出只在 `TradeMaster.tsx` 与 `trade-master/` 内使用，PR 正文附 `git grep` 结果。
- **R3 既有测试原样通过**：`trade-master.test.tsx` 的 13 个用例、`App.test.tsx` 与 Web 全部 jsdom 测试通过；测试文件 diff 为空。本机全量命令见“测试命令”。
- **R4 DOM、请求、锁定、守卫与确认等价**（送审证据，驱动不提交，不加常驻 CI 用例）：
  - **两个驱动**，都是临时 jsdom 脚本，借用 `trade-master.test.tsx` 的渲染方式与按路径分派的 `fetch` 桩，在 base 与 head 上按同一序列操作。`fetch` 桩改为**受控响应**（保存请求可挂起、成功、409、500、网络拒绝；对账的 `GET` 可返回相符或不符的记录）：
    - **驱动 A（整页）**：渲染 `App`，进入贸易主数据页；
    - **驱动 B（锁定与守卫直接观测）**：直接渲染导出的 `TradeMaster`（套 `QueryClientProvider`）。`lock` 是 `TradeMaster` 内部的 `setGuard`，无法从外部替换，因此按“现状 / 离开守卫”所列的全部去向记录：（1）用 `vi.mock` 把 `leave-guard-history.ts` 的 `guardHistory` 换成**委托包装函数**（调用原实现，记录每次调用，并把返回对象换成逐方法转发、记录 `dispose` 与 `here` 调用的普通新对象）；（2）给 `window.addEventListener` / `removeEventListener`（只记 `beforeunload`）与 `document.addEventListener` / `removeEventListener`（只记捕获阶段的 `click`）装记录桩，保留原实现；（3）每步记录 `#trade-company` 与 `#trade-kind` 的 `disabled`（`guard.open`）。
  - **记录规则**（复用 [REFAC-17 R4](REFAC-17-prepare-trade-action-split.md#两侧都须成立的不变量)）：被记录的函数一律用**委托包装对象 / 函数**，不用 `Proxy`；调用时分配递增序号并立即写入记录，返回 Promise 时先记 `pending`，完成后在同一条记录写 `resolved` / `rejected` 与结果，不对 Promise 本身取摘要；每步采样时不得有 `pending` 以外的未定状态被漏记（挂起中的请求记为 `pending` 属正常）。参数与返回值都经同一个确定性编码函数（`Set` → `{"$set": […]}`、`Map` → `{"$map": [[k, v], …]}`、`bigint`、`undefined`、`Date`、函数的编码同 REFAC-17）再做 JSON / SHA-256。驱动须带 REFAC-17 的自测（a）–（c），失败即 R4 失败。
  - **确认与焦点**：`window.confirm` 换成**记录桩**，按脚本依次返回预设值并记下每次调用的文案；`HTMLElement.prototype.focus` 装记录桩（保留原实现），记下每次调用的目标与次数。
  - **序列**至少包含：
    - 列表首屏 → 新建往来方：依次填名称、日期、`role`（`select`）、`allowedTaxCodes`（`"VAT, ,ZERO"`）、`defaultDimensions`（JSON）；保存成功（`POST`）；
    - 新建付款条件（D537）：`allowPartialDiscount` 取消勾选，`dueDays` 留空 → 直接 `fireEvent.submit` 保存（绕过 `required`）→ 不发请求、字段错误；再填入 `dueDays`（如 `"30"`）→ 保存；新建税码：`rates` 填**非法 JSON** → 保存（不发请求，字段错误）→ 改正后保存；新建过账配置（出现 `trade.discountHint`）；新建产品（`expenseAccount` 留空）；
    - 编辑已有记录（`revision > 0`）：代码输入禁用，保存发 `PUT`；
    - 保存挂起：字段组禁用、出现 `role="status"`；同一时刻再次派发 `submit` 只发出 1 个请求；挂起期间点击页面内的同源链接（驱动 B 自行在文档中放一个）；放行成功 → 编辑器关闭，`["trade", <公司>, <类别>]` 被失效并重新请求；
    - 保存返回 409 → 冲突错误条与“重新加载”按钮 → 点击“重新加载”；
    - 保存返回 500 → `uncertain`：状态文案为 `trade.uncertain`，出现“对账” → 点击“对账”，重发返回 409，`GET` 返回**相符**记录 → 编辑器关闭；另一遍 `GET` 返回合法但**不符**的记录 → base 重新抛出重发得到的 409（`:523–533`），编辑器不关闭、`uncertain` 变为 `false`（`:544–549`：409 是 `http` 且 `reconcile && status !== 409` 不成立）、进入冲突态（`failure` 对 409 给出 `conflict: true`，`:67`）并出现“重新加载”按钮，不再显示“对账” → 点击“重新加载”；网络拒绝 → `uncertain`；
    - 取消：草稿未改时点击取消；改动后点击取消，`confirm` 先返回 `false`（草稿保留）再返回 `true`（关闭）；
    - **卸载时的在途保存**（驱动 B）：两遍。（i）保存挂起时卸载根组件，然后放行**成功**响应；（ii）重新挂载，保存挂起时卸载根组件，然后放行**失败**响应（`500`）。卸载使 `generation.current` 自增（`:459`），两遍中 `generation.current !== id` 都成立；
    - zh / en 各一遍；教学模式开与关各一遍（驱动 A）。
  - **每步采样**：DOM（`document.body.innerHTML`）；累计请求日志（序号、方法、URL、请求体原文、结果）；查询缓存（`queryKey`、`status`、`isInvalidated`，按键排序）；驱动 B 的守卫记录与两个下拉的 `disabled`；`confirm` 与焦点调用记录；`console.error` 调用记录。
  - **判定**：base 与 head 逐步、逐项、逐字节相同；并且**直接断言**（只比两侧相同不够）：
    1. 守卫：打开未改动的编辑器后两个下拉禁用、`beforeunload` 未挂接；首次改动后 `guardHistory` 调用 1 次且 `beforeunload` 挂接 1 次；保存挂起期间点击链接被阻止且 `confirm` 调用 0 次；保存成功关闭后两个下拉恢复可用，`dispose` 调用次数等于 `guardHistory` 调用次数，`beforeunload` 的挂接与卸下次数相等（守卫全部卸下）；
    2. 防重入：两次 `submit` 只记 1 个请求；
    3. 非法 JSON：没有发出请求；错误条文本以 `data.rates: ` 开头；`#trade-rates` 带 `aria-invalid="true"` 与 `aria-describedby="trade-error"`；
    4. 请求体（D537 改为 4a、4b 两条；原“付款条件 `dueDays` 为 `null`”在 base 上不成立：契约 `trade-master.ts:44` 的 `dueDays` 为 `z.number().int()`，不可空，留空时 `safeParse` 失败、不发请求）：往来方的 `allowedTaxCodes` 为 `["VAT","ZERO"]`；产品的 `expenseAccount` 为 `null`；
       - 4a. 付款条件 `dueDays` 留空：发出请求 0 次；错误条文本以 `data.dueDays: ` 开头；`#trade-dueDays` 带 `aria-invalid`；
       - 4b. 填入 `dueDays` 后保存：请求体中 `allowPartialDiscount` 为 `false`、`dueDays` 为数字（JSON 数值，不是字符串）；
    5. 对账：重发的方法与请求体与首次请求逐字节相同，随后恰好 1 个 `GET /api/v1/trade/<类别>/<代码>?company=<公司>`；相符时关闭；不符时编辑器不关闭，状态文案不再是 `trade.uncertain`（`uncertain` 为 `false`），没有“对账”按钮，错误条为 `master.conflict` 的当前语言文本且出现“重新加载”按钮，点击后 `["trade", <公司>, <类别>]` 被失效；这是 base 的现有行为，本任务保留，不改产品代码；
    6. 取消：未改动时 `confirm` 调用 0 次；改动后调用 2 次，文案均为 `trade.discard` 的当前语言文本；第一次之后草稿仍在；
    7. 卸载时的在途保存：（i）放行成功响应后 `["trade", <公司>, <类别>]` 被失效 1 次；（ii）放行失败响应后该键**仍被失效 1 次**——此时 `accepted` 为 `false`，失效只来自 `generation.current !== id` 分支（`:553`），因此删掉该分支会使（ii）失败，而（i）不能区分（成功时 `accepted` 已为 `true`）；两遍都没有 `setError` / `setBusy` 的效果（组件已卸载），`console.error` 无新增记录，`confirm` 调用 0 次。
    base 上任一直接断言不成立，先停下并向协调者报告，不得把“两侧相同”当作通过。PR 正文附驱动全文、步骤清单、两侧输出的 SHA-256 与比较结果，以及“守卫记录”“对账”“卸载时的在途保存”三组场景的逐步输出原文。
  - **驱动原件**：PR 正文贴驱动**原文件字节的 base64**，或同时写出两种 SHA-256：原始字节、按 UTF-8 解码并把换行归一为 LF 后的字节（评审从代码块复制时得到的是 LF 文本）。只给一种哈希不算满足。
- **R5 结构规则**（静态，评审按代码与 PR 表格核对）：
  - **R5a Hook 序列**：PR 正文列出 base 与 head 的 Hook 调用序列（自定义 Hook 按调用处展开）及参数与依赖的源文本（只归一空白），两侧逐行相同；base 一侧须与“现状”所列一致。唯一豁免见决定 2（`draft` 的惰性初值函数），其他任何差异即失败。
  - **R5b 展示组件无 Hook**：新抽出的组件中没有任何 `use*` 调用；PR 正文附 Babel AST 检查脚本的输出。
  - **R5c 原文搬移**：`draft` 初值函数体（`:416–444`）、逐字段解析表达式（`:470–486`，除决定 5 的谓词替换外）、`persist` 的 `setUncertain` 参数（`:544–550`）、`specific` / `choices` / `nullable` 的定义，base 与 head 逐字比较（只归一缩进）；不同即失败。
  - **R5d 插槽对等**：PR 正文用一张表列出“现状”中的 JSX 4 项（第 4 项再按段列出），并标出 head 中对应的唯一组件或表达式。
  - **R5e 未改部分**：`TradeMaster`、`TradePane`、`PaneActions`、`Notice`、`useTradeLeaveGuard` 逐字比较输出（不同即失败）。
- **R6 尺寸**：除上表 R6a、R6b 外，`TradeMaster.tsx` ≤ 420 行（base 687；`TradeMaster`、`TradePane` 不动，故不设更低的线）；新文件各 ≤ 200 行；每个新函数满足 ②（≤ 80 行、嵌套 ≤ 3 层）；PR 正文列出所有超过 50 行的函数，附计数行数与最深层数（base 与 head 两列）。
- **R7 打包字节**：首屏按 D454。用 `scripts/measure/bundle-measure.mjs`，写明脚本所在的提交 SHA；base 为最终送审 head 的实际合并基，合并基变了就重新测量。预算（未列出的项 ±0）：

  | 项 | manifest 键 | 上限 | 依据 |
  | --- | --- | --- | --- |
  | 首屏 | — | **±0**（D454，`--d454`） | 改动文件都不在首屏闭包中（“chunk 归属”表） |
  | 贸易主数据路由新增 | `src/TradeMaster.tsx` | ≤ **+500 B** | 估定，见下 |
  | 贸易主数据入口 chunk | `src/TradeMaster.tsx` | ≤ **+500 B** | 同上 |
  | 共用 chunk 与其他路由 | 全部 | ±0 | 只导入、不改 |
  | CSS | 全部 | ±0 | 不改 CSS |

  命令参数：`--route src/TradeMaster.tsx=+500 --chunk src/TradeMaster.tsx=+500 --d454`。出现 base 没有的新 chunk 即停下报告；超出先停下，报设计角色与协调者，不得自行放宽。上限没有做试改构建：REFAC-16 以 +500 B（313 行）为停止线，本函数 292 行，按同一停止线估定；REFAC-16 的实测值见 #334，若协调者要求按实测收紧，以协调者为准。
- **R8 质量门**：
  - **R8a 合并前**：`typecheck`、`lint`、CI-02 预检通过；PR CI（`ci.yml`）绿。
  - **R8b 合并后检查（不作合并门）**：合并后第一次覆盖该合并提交的 main Full 须绿，**含** `trade-gui` 真实 Chrome 场景（`part-one.ts` 经过编辑器）；失败时报协调者，按 D456 暂停后续合并。
- **R9 可读性一节**：PR 正文按下节逐条说明。

### 测试命令（S22 回顾行动 4）

- 本机全量 web 测试一律用 `npx vitest run --project web`，PR 正文附汇总行原文，base 与 head 各一次。
- 有失败时，逐个列出失败的文件与用例，并附只对这些文件的串行重跑原文：`npx vitest run --project web --no-file-parallelism <失败文件…>`。不得自行更换并发参数而不说明；串行重跑仍失败即按真实失败处理。

## 性能考虑

- 渲染次数不变：不加 `memo`，不改 Hook 与依赖；`draft` 初值仍惰性求值（决定 2）。不跑 Bench。打包变化由 R7 约束。其余项（规模、索引、查询次数、分页、事务）不适用：不改数据访问，请求序列由 R4 核对。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥：

- **②**：本任务就是为满足 ② 而做。`TradeEditor` 从 292 行拆到 ≤ 80 行（R6a）。最大的两块是 `fields.map`（`:593–642`，约 50 行）与 `persist`（`:512–556`），须各自成为 ≤ 80 行的组件或函数。
- **③**：`TradeMaster.tsx`（687 行）是热点；拆后 ≤ 420 行（R6），新文件各 ≤ 200 行。PR 正文贴 `git diff --numstat`。
- **①**：组件、Hook 与函数名表达职责，例如 `useTradeEditor`、`TradeEditorForm`、`TradeField`、`TradeEditorActions`、`initialTradeDraft`、`tradeFieldValue`、`isJsonField`；不用 `Part1`、`Section2`。
- **④**：分层对齐 REFAC-10–16 的做法：状态、请求与命令在一个 Hook，展示组件只接收 props；不抽跨页共用件（`TradeField` 只在贸易主数据内使用）。
- **⑤**：见决定 5（JSON 字段判定去重）。
- **⑥**：`TradeMaster.tsx` 现有注释（`:28`、`:32`、`:204`、`:291`）随代码保留；不新增注释，除非某处拆分需要说明“为什么”（例如对账只重发同一命令）；不留调试输出。
- **测试耗时**：本任务不改测试；R4 驱动不提交。PR 正文附 `trade-master.test.tsx` 在 base 与 head 上的耗时（vitest 汇总行原文），两侧差异 > 20% 时说明原因。

## 用户可见变化

- 无。贸易主数据五类的新建与编辑、字段输入、保存与失败提示、结果未知与对账、冲突后重新加载、取消确认、离开守卫、中英文与教学模式下的外观都不变（R3、R4）。

## 证据要求

- **不需要浏览器时段**：行为等价由 R3（既有 jsdom 用例）与 R4（逐步的 DOM、请求、守卫与确认等价及直接断言）证明；真实 Chrome 场景 `part-one.ts` 只在 main Full 中运行，作合并后检查（R8b）。R4 与构建在本机运行，须服从协调者的时段静默通知（D442 / D480）。
- **可行性**（S13 回顾行动 4）：`trade-master.test.tsx` 的 `:259`、`:310` 已能挂起写请求并驱动结果未知与对账；`:144`、`:217` 已能观测守卫对导航与“后退”的拦截；委托包装与记录编码已在 REFAC-17（#335）跑通。R6a、R6b 的 base 数字与 chunk 归属见“现状”（设计角色实测）。本任务书**没有**做试改构建，R7 的上限按拆分规模估定；**没有**试写驱动，若某一步在 jsdom 中构造不出来，PR 正文写明原因并报协调者，不得静默删去。
- PR 正文附：R2 导出与 `git grep` 结果；R4 驱动（原件 base64 或两种 SHA-256）、步骤清单、比较结果、直接断言结果与三组场景的逐步输出；R5a–R5e 各表；R6 行数表（base 与 head 两列）；R6b 两侧检索原文；R7 的 `bundle-measure.mjs` 完整输出与退出码；“测试命令”的汇总行；可读性一节。R8b 合并后补到 PR 评论。
