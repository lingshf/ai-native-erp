# REFAC-28：拆分期末结账向导 `CloseWizard`（不改行为）

- Sprint：S24（[计划草案](S24.md)）
- 类型：重构（Web 页面拆分）
- 优先级：P2
- 决定：[D548](S24.md#s24-期间决定)。只改代码组织，不改行为，详见“范围与决定”1–7。
- 建议分支：`refac-28-split-close-wizard`
- 来源：[S24 候选](S24.md#候选s24-其余泳道s23-评审后定)“页面拆分”。REFAC-24（[#349](https://github.com/lingshf/ai-native-erp/pull/349)）已合并，页面拆分名额空出；本批只排这一项页面拆分。
- 模板：[REFAC-24](REFAC-24-ai-panel-split.md)（Hook 序列逐项相同、展示组件无 Hook、DOM 含属性顺序逐字节相同、请求直接断言）。
- 迁移：**不加**。
- 浏览器时段：**不需要**，理由见“证据要求”。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 为什么是它

- 设计角色在 `b74d526` 上用 `node files/fnlen.cjs packages/web/src packages/core/src packages/infra/src` 实测，超过 ② 上限的前几项：
  - `tradeDocumentRepository`（616）、`prepareSettlement`（179）：已排为 REFAC-26、REFAC-27，在岗。
  - legacy 的 `checkOpeningItems`（606）、`reconcileLegacy`（382）等：不碰。
  - `Workspace`（295，`App.tsx`）：**首屏**，改动会动首屏字节，本 Sprint 不排。
  - **`CloseWizard`（263，`PeriodClose.tsx:243–505`）**
  - `FinancialReport`（240）、`LedgerGrid`（218）、`CompanyReports`（209）：同在 `LedgerReports.tsx`，三个函数共用一个文件，宜作为一组另排。
- 选 `CloseWizard` 的理由：
  - **不在首屏**：`PeriodClose.tsx` 只被 `App.tsx:53–54` 懒加载，落在 `src/PeriodClose.tsx` 路由 chunk。
  - **自包含**：不导出，只被同文件的 `PeriodClose`（`:166–176`）渲染；5 个 props；只用 `useQueryClient`，没有 `useQuery` / `useMutation`。
  - **行为关键点集中**：结果未知时保留原命令并重试、4xx 与其他失败的分流、响应字段校验、查询失效的先后（`await` 与不 `await`）、穿透链接的复合定位、父页锁定。拆分时最容易改坏的就是这些，R4 逐项直接断言。
  - **既有测试覆盖主路径**：`period-close.test.tsx` 3 个用例覆盖预览、确认、结果未知重试、打开下一期间、阻断项与已关闭期间。REFAC-24 当时因用例少而暂缓；本任务书用 R4 驱动补足（下文）。
- 冲突域与在岗的 REFAC-26、REFAC-27 不相交，详见“冲突域”。

## 现状（main `b74d526`）

下文 `file:line` 都按 `b74d526`（#350 的合并提交）。

- `packages/web/src/PeriodClose.tsx` 共 **505** 行，只导出 `PeriodClose`（`:22`）。文件内另有模块级 `tones`（`:230`）、类型 `Pending`（`:231–242`）与不导出的 `CloseWizard`（`:243–505`）。导入：`react` 的 `useCallback`、`useEffect`、`useState`；`@tanstack/react-query` 的 `useInfiniteQuery`、`useQueryClient`；`react-router-dom` 的 `Link`、`useSearchParams`；`@erp/core/contracts` 的 5 个 schema 与 4 个类型；`./ui/index.ts`；`./master-data-client.ts`（`MasterDataFailure`、`masterRequest`）；`./reports-data.ts`（`formatMinor`）；`./journals/virtual-rows.tsx`（`VirtualRows`）；`./TradePeriodAdmission.tsx`；`./ui/components/index.tsx`（`Badge`、`FastTab`、`MessageBar`、`PageHeader`、`TeachingTip`）；`./pages/period-close.css`。
- 设计角色实测：

  ```text
  263	packages/web/src/PeriodClose.tsx:243-505	CloseWizard
  208	packages/web/src/PeriodClose.tsx:22-229	PeriodClose
  ```

  `PeriodClose`（208）不在本任务范围内，函数体不改（决定 7）；留作后续。
- **props**：`company`、`period`、`preferences`、`setLocked`、`next`。调用方 `PeriodClose.tsx:166–176` 以 `` key={`${selectedCompany.code}:${selectedPeriod.month}`} `` 渲染，外包 `<fieldset disabled={admissionLocked}>`；`setLocked` 是父级的 `lock`（`useCallback`，依赖 `[company, period]`）。
- **Hook 调用序列**（base，按源码顺序；R5a 以此为准）：
  1. `useQueryClient()`（`client`，`:256`）
  2. `useState<ClosePreviewDto | null>(null)`（`preview`，`:257`）
  3. `useState<CloseResultDto | null>(null)`（`result`，`:258`）
  4. `useState<Pending | null>(null)`（`pending`，`:259`）
  5. `useState(false)`（`busy`，`:260`）
  6. `useState<unknown>(null)`（`error`，`:261`）
  7. `useEffect(() => setPreview((current) => (current?.revision === period.revision ? current : null)), [period.revision])`（`:262–265`）
  8. `useEffect(() => { setLocked(busy || pending !== null); }, [busy, pending, setLocked])`（`:267–269`）
- **命令与派生值**：
  - `t`（`:266`，位于两个 `useEffect` 之间）、`base`（`:270`，`/api/v1/periods/${period.month}`）、`latestPeriod`（`:271`，`result?.period ?? period`）。
  - `loadPreview()`（`:272–302`）：
    - 守卫：`busy || pending` 成立即返回，不发请求；
    - 依次 `setLocked(true)`、`setBusy(true)`、`setError(null)`、`setResult(null)`、`setPreview(null)`；
    - 请求体 `{ company, revision, commandId: crypto.randomUUID() }`，`POST ${base}/close-preview`；
    - 响应的 `company`、`month`、`revision`、`commandId` 任一与请求不符即 `MasterDataFailure("invalid")`；
    - `catch` 记错误；`finally` 只 `setBusy(false)`（**不** `setLocked(false)`，由第 8 个 Hook 复位）。
  - `execute(command)`（`:303–360`）：
    - 守卫：只看 `busy`；
    - 依次 `setLocked(true)`、`setPending(command)`、`setBusy(true)`、`setError(null)`；
    - `close` 分支：`POST ${base}/close`，校验 `preview.company`、`preview.month`、`preview.commandId`、`preview.fingerprint`、`receipt.idempotencyKey` 共 5 项；成功后依次 `setResult`、`setPreview(null)`、`setPending(null)`，再**不等待**地失效 `["ledger-live", company]`、`["close-periods", company]`；
    - `open-next` 分支：`POST ${base}/open-next`；按 `period.month` 计算期望的下一月（12 月进到下一年 `01`），`month` 或 `status !== "open"` 不符即 `invalid`；**等待** `Promise.all` 失效 `["close-periods", company]`、`["ledger-periods", company]` 之后，才 `setPending(null)` 并调用 `next(opened.month)`；
    - `catch`：记错误；只有 `MasterDataFailure` 且 `kind === "http"` 且 `(status ?? 500) < 500` 时，才清 `pending`、清 `preview` 并不等待地失效 `["close-periods", company]`；其余失败（网络、5xx、`invalid`）保留 `pending`，界面进入“结果未知、可重试原命令”；
    - `finally`：`setBusy(false)`。
  - `fmt`（`:361`）、`source(account?)`（`:362–374`）：无预览时抛 `Error("Missing close preview")`；`account` 为空或为 `"3100"` 时指向 `/ledger-reports?…&view=trial`，否则指向 `/ledger?…&account=…`；复合定位参数顺序为 `company`、`month`、`stage=adjusted`、`watermark`、`accountRevision`。
  - `closedView`（`:375`）：`result || latestPeriod.status !== "open"`。
- **JSX**（`:376–504`），Fragment 内依次 5 项：
  1. `div.bar`：
     - a. 预览按钮（`latestPeriod.status !== "closed" && !result` 时）；
     - b. 确认按钮（`preview` 时，`btn-primary`，有阻断项即禁用）；
     - c. 打开下一期间按钮（`closedView` 时；`monthly-teaching` 或 12 月且期间尚未关闭即禁用）；
     - d. 重试原命令按钮（`pending` 时，只在 `busy` 时禁用）；
     - e. `span`：`month · 状态`。
  2. 在途 `p[role=status]`（`busy` 时）
  3. 错误 `MessageBar`（`pending` 时 `warning` + `close.unknown`，否则 `danger` + `close.error`）
  4. 已关闭 `MessageBar`（`closedView` 时；凭证链接列表）
  5. 预览 `FastTab#close-preview`：净额 KPI（`pending` 时为纯文本、否则为链接）、阻断项 `MessageBar` 列表、`VirtualRows` 结转分录（借贷两列同样按 `pending` 决定是否为链接）。
- **重复**：`busy || pending !== null`（含跨行写法）在文件中出现 **4** 处：`:268`（第 8 个 Hook 的回调）、`:383`（a 的 `disabled`）、`:393`（b 的 `disabled`）、`:415`（c 的 `disabled`，跨行）。三处 `disabled` 是 R6b 的去重对象；`:268` 不动（决定 5）。
- **测试**：
  - `packages/web/test/period-close.test.tsx` 3 个用例（`:12`、`:203`、`:266`），都经 `App` 整页渲染；
  - 真实 Chrome：`packages/infra/test/support/trade-gui/scenario/part-one.ts:8–46`（`closePeriod`）只操作父页的 `#close-month` 与贸易准入，`smoke/pages.ts:54–57` 只等 `#close-month option`；e2e **不**点击向导的任何按钮。

### chunk 归属与首屏（S22 回顾行动 3，base 实测）

设计角色在 `b74d526` 上运行 `node scripts/measure/bundle-measure.mjs --base b74d526 --head b74d526 --work <新目录> --d454`（两侧都传完整 SHA）。脚本取自 `b74d526`，该文件最后一次改动是 `6156759`；退出码 0，`RESULT: PASS`。

| 文件 | 落在哪个 chunk | 依据 |
| --- | --- | --- |
| `PeriodClose.tsx`（改） | 路由入口 chunk `src/PeriodClose.tsx` | 只被 `App.tsx:53–54` 懒加载 |
| `period-close/` 下新文件（新增） | 同上 | 只允许被 `PeriodClose.tsx` 或本任务的新文件导入（决定 6） |
| 首屏 | **本任务不改任何首屏文件** | `ui/*`、`ui/components`、`master-data-client.ts`、`reports-data.ts`、`journals/virtual-rows.tsx` 只导入、不改（决定 7） |
| CSS | 不改 | `pages/period-close.css` 不改 |

base 数字（原始 / gzip-9 字节）：

| 项 | 键 | 原始 | gzip |
| --- | --- | --- | --- |
| first-screen | first-screen | 531281 | 161156 |
| route | `src/PeriodClose.tsx` | 41566 | 15381 |
| chunk | `src/PeriodClose.tsx` | 12464 | 4237 |
| chunk | `assets/PeriodClose.css` | 2242 | 735 |

## 范围与决定

1. **不改行为**（D548）。以下全部不变：
   - DOM 结构、类名、文本；属性及其**先后顺序**，含 `type`、`className`、`disabled`、`role`、`tone`、`id`、`title`、`to`；
   - 请求的 URL、方法、请求体（含键顺序）与发出顺序；`crypto.randomUUID()` 的调用次数与时机；
   - 响应校验的字段与先后，`MasterDataFailure("invalid")` 的抛出条件；
   - 4xx 与其他失败的分流条件；`pending` 的保留与清除时机；重试发送的请求体；
   - 查询失效的键、先后，以及是否 `await`（`close` 与 4xx 不等待，`open-next` 等待后再 `next`）；
   - `setLocked` 的调用时机与参数（命令开始时同步 `true`，其余由第 8 个 Hook 按 `busy || pending !== null` 同步）；
   - 穿透链接的 URL（含参数顺序）与“结果未知时只显示纯文本”的条件；
   - 焦点与键盘行为。

   只改代码组织，不修 bug。拆分时发现的疑似缺陷登记在 PR 正文，留作后续任务。
2. **Hook 顺序不变**：
   - Hook 可以留在 `CloseWizard`，也可以放进它在顶层无条件调用的自定义 Hook，例如 `useCloseCommands`；
   - **展示组件不得调用任何 Hook**；不新增 `useCallback`、`useMemo`、`memo`；
   - 展开自定义 Hook 后，Hook 调用序列与“现状”所列 8 项逐项相同：种类、先后、参数与依赖的源文本，只归一空白（R5a）；
   - 本任务**没有豁免**。
3. **命令**：
   - `loadPreview`、`execute` 可以搬进自定义 Hook 或同目录模块；
   - 两者的守卫、状态设置的先后、请求、响应校验、`catch` 分流与 `finally`，顺序与结构都不变（R5c）；
   - 每次渲染仍读取当次的 `busy`、`pending`、`period`、`company`，不改为缓存的闭包；
   - `open-next` 的期望月份计算与 `source` 原样搬移（R5c）；可以提成纯函数，但表达式逐字不变。
4. **组件层级对等**：
   - 新组件一律在模块顶层定义；
   - 抽出的组件只替换“现状”所列 Fragment 内 5 项之一，或第 1、5 项内部的一段（例如第 1 项的 a–e 之一、第 5 项的净额 KPI 或结转分录卡片）；只渲染该段原来渲染的内容；
   - 不把相邻兄弟合成一个返回 Fragment 的组件；
   - 条件渲染的条件留在父级原位置，或留在被抽出组件内与原来相同的位置。
5. **“正在处理”去重**（⑤，R6b）：
   - 三处 `disabled` 中的 `busy || pending !== null` 改为每次渲染求值一次的一个值（例如 `const working = busy || pending !== null`），三处改用它；与其后的 `|| …` 组合时运算顺序不变；
   - 第 8 个 Hook 的回调与依赖**不改**（仍写 `busy || pending !== null`，依赖仍为 `[busy, pending, setLocked]`），避免依赖数组变化与 lint 的依赖检查；
   - 重试按钮的 `disabled={busy}` 不是同一条件，不并入。
6. **文件**：
   - 新建目录 `packages/web/src/period-close/`（base 上不存在），与 `ai-panel/`、`accounts/` 等并列；
   - 新文件按职责命名，例如 `use-close-commands.ts`、`close-actions.tsx`、`close-preview.tsx`、`close-links.ts`，粒度由开发定，写入 PR 正文；
   - 新文件只被 `PeriodClose.tsx` 或本任务的新文件导入；
   - `CloseWizard` 可以留在 `PeriodClose.tsx`，也可以搬进 `period-close/`；无论放哪里，都**不**从 `PeriodClose.tsx` 导出，名称不变；`Pending` 类型随之搬移，源文本不变；
   - `PeriodClose.tsx` 仍只导出 `PeriodClose`。
7. **不改**：
   - `PeriodClose` 函数体（`:22–229`）与 `tones`；`TradePeriodAdmission.tsx`；`App.tsx` 与路由表；`master-data-client.ts`；`reports-data.ts`；`journals/**`；`ui/**`（含标签资源与教学文案）；CSS（含 `pages/period-close.css`）；契约（`@erp/core/contracts`）；
   - `packages/web/test/**`（含 `setup.ts`）、`packages/infra/**`、`packages/core/**`；
   - `scripts/**`（含 `scripts/slot/`、`scripts/measure/`）、`scripts/test-shard-weights.json`、`package.json` / lock、`vitest.config.ts`。

## 冲突域

- web-ui:period-close：只改 `packages/web/src/PeriodClose.tsx`（`CloseWizard` 与 `Pending`），并在 `packages/web/src/period-close/` 下新增文件（决定 6）。
- 取证所需的观测点和新增测试文件：无。R4 驱动不提交。
- 受影响的 e2e 断言（S13 回顾行动 1）：`trade-gui/scenario/part-one.ts:8–46` 与 `smoke/pages.ts:54–57` 只依赖父页的 `#close-month`、贸易准入控件与 `role="status"` 的“已保存”提示；向导在途时的 `p[role=status]` 不变（决定 1）。**须随本任务改**：无。
- 受影响的文档引用（D460）：`git grep -n -F "CloseWizard" -- docs design` 在 `b74d526` 上命中 5 行（REFAC-24 任务书 2 行、S24.md 3 行），都是当时的事实记录，不改。
- 与在岗任务不相交：
  - REFAC-26 只改 `packages/infra/src/storage/trade-documents.ts` 与同目录新增的 `trade-document-*.ts`；
  - REFAC-27 只改 `packages/core/src/application/trade-documents.ts` 与同目录新增的 `trade-settlement-*.ts`。

  三者没有共享文件。本任务跑 `web` 项目，另两项跑 `core` / `infra` 项目。

## 验收

### base 失败、head 通过

| 编号 | 检查 | base `b74d526` | head 要求 |
| --- | --- | --- | --- |
| R6a | `node fnlen.cjs packages/web/src`（口径同 S16–S24）中 `CloseWizard` 的行数 | **263**（失败） | ≤ 80；本任务新增或改动的函数也都 ≤ 80 |
| R6b | 在 `PeriodClose.tsx` 与 `period-close/` 全部文件的拼接文本上，正则 `/busy \|\|\s+pending !== null/g` 的命中数（`node -e` 读文件计数，跨行写法也算） | **4**（失败） | **2**：第 8 个 Hook 的回调 1 处、决定 5 的定义 1 处。PR 正文附 base 与 head 两侧的计数脚本与输出原文 |

### 两侧都须成立的不变量

- **R1 范围**：
  - `git diff --name-only <base> <head>` 只含 `packages/web/src/PeriodClose.tsx` 与 `packages/web/src/period-close/` 下的新文件；
  - 决定 7 所列文件的 diff 为空；
  - 不加迁移。
- **R2 导出与父级不变**：
  - `PeriodClose.tsx` 的导出集合与 base 相同，只有 `PeriodClose`，类型为 function；
  - `PeriodClose` 函数的源文本与 base 相同，只归一空白；`CloseWizard` 的 props 类型源文本相同，只归一空白。用仓库根 devDependency `@babel/parser`（插件 `typescript`、`jsx`）解析，口径同 REFAC-14 R2；
  - 新文件的导出只在 `PeriodClose.tsx` 与 `period-close/` 内使用，PR 正文附 `git grep` 结果。
- **R3 既有测试原样通过**：
  - `period-close.test.tsx` 的 3 个用例、`trade-period-admission.test.tsx`、`App.test.tsx` 与 Web 全部 jsdom 测试通过；
  - 测试文件 diff 为空；
  - 本机全量命令见“测试命令”。
- **R4 DOM、请求、锁定与失效等价**（送审证据；驱动不提交，不加常驻 CI 用例）：
  - **两个驱动**，都是临时 jsdom 脚本，在 base 与 head 上按同一序列操作。`fetch` 桩按路径分派，借用 `period-close.test.tsx:12` 的写法，但改为**受控响应**：
    - `close-preview`、`close`、`open-next` 可以挂起，也可以返回驱动给定的成功体、字段不符的成功体、带指定状态码（400 / 409 / 500 / 503）的错误信封，或网络拒绝（`TypeError`）；
    - 桩记录每次请求的序号、方法、URL 与请求体原文，由驱动决定何时放行。

    `crypto.randomUUID` 在两侧都换成按调用递增的确定性桩（`00000000-0000-4000-8000-00000000000N`），记录调用次数。`QueryClient.prototype.invalidateQueries` 用委托包装记录调用（序号、`queryKey`、调用时 `pending` 状态是否已清、返回的 Promise 何时完成），保留原实现。

    - **驱动 A（整页）**：渲染 `App`，经导航进入期末结账页，按 `period-close.test.tsx` 三个用例的路径操作。
    - **驱动 B（直接渲染导出组件）**：在 `QueryClientProvider` 与 `HashRouter` 内直接渲染导出的 `PeriodClose`，`preferences` 由驱动控制（zh / en）；公司与期间由 `fetch` 桩决定（`closeMode` 为 `annual` 与 `monthly-teaching`；月份为 `2026-11` 与 `2026-12`；状态为 `open` / `frozen` / `closed`）。`CloseWizard` 不导出，不得为取证而导出。
  - **记录规则**：同 [REFAC-24 R4](REFAC-24-ai-panel-split.md#两侧都须成立的不变量)。
    - 被记录的函数一律用委托包装对象或函数，不用 `Proxy`；
    - 调用时分配递增序号并立即写入记录；返回 Promise 时先记 `pending`，完成后在同一条记录写 `resolved` / `rejected` 与结果；
    - 参数与返回值都经确定性编码（`Set` → `{"$set": […]}`、`Map` → `{"$map": [[k, v], …]}`；其余同 REFAC-17）；
    - 驱动须带 REFAC-17 的自测（a）–（c），失败即 R4 失败。
  - **焦点**：`HTMLElement.prototype.focus` 装记录桩，保留原实现，记下每次调用的目标。
  - **序列**至少包含（驱动 B，另有标注的除外）：
    - **预览**：成功（无阻断项、2 行结转分录，其中一行科目为 `3100`）；成功但有阻断项；4 种字段不符（`company`、`month`、`revision`、`commandId` 各一）；网络拒绝；在途时再次点预览（用 `fireEvent.click` 直接派发，绕过 `disabled`）。
    - **确认结账**：成功；5 种字段不符各一；409；500；网络拒绝后点“重试原命令”再成功。
    - **打开下一期间**（按钮只在 `closedView` 时出现）：`2026-11` 冻结期间 → `2026-12` 成功；`2026-12` 关闭期间 → `2027-01` 成功；返回月份不符；返回 `status: "frozen"`；400；503 后重试成功；在 `open-next` 等待失效期间挂起 `invalidateQueries` 返回的 Promise，再放行。
    - **禁用条件**：`annual` 的 `2026-11` 冻结期间、`annual` 的 `2026-12` 冻结期间、`monthly-teaching` 的 `2026-11` 冻结期间与关闭期间，各渲染一次，记录打开下一期间按钮的 `disabled`。
    - **期间版本变化**：预览完成、锁定已解除后，让 `/api/v1/periods` 返回同月 `revision + 1`，再由驱动经自己持有的 `QueryClient` 调 `refetchQueries({ queryKey: ["close-periods", <company>] })` 触发父页重新取数（不计入 `invalidateQueries` 记录），记录预览卡片是否消失；同样操作但 `revision` 不变再做一遍。锁定期间父页持有旧期间（`held`），不在此时触发。
    - 驱动 A：zh / en 各一遍；教学模式开与关各一遍。
  - **每步采样**：
    - DOM：`document.body.innerHTML`；
    - 累计请求日志：序号、方法、URL、请求体原文、结果；
    - `randomUUID` 调用次数、`invalidateQueries` 记录；
    - 父页 `#close-company`、`#close-month` 的 `disabled`；
    - 焦点调用记录；
    - `console.error` 调用记录。
  - **判定**：base 与 head 逐步、逐项、逐字节相同。并且**直接断言**，只比两侧相同不够：
    1. **预览请求**：`POST /api/v1/periods/<month>/close-preview`，请求体原文为 `{"company":…,"revision":…,"commandId":…}`，键顺序如此，`commandId` 为本次 `randomUUID` 的返回值；在途时再次派发点击，请求仍只有 1 个、`randomUUID` 只多 1 次。
    2. **响应校验**：预览 4 种字段不符与预览网络拒绝：错误条为 `danger` + `close.error`、带 `role="alert"`，没有预览卡片，没有“重试原命令”按钮。确认 5 种、打开下一期间 2 种字段不符（`invalid` 不是 HTTP 失败，`pending` 保留）：错误条为 `warning` + `close.unknown`、带 `role="alert"`，出现“重试原命令”按钮，`invalidateQueries` 不增加。
    3. **失败分流**：确认与打开下一期间的 400 / 409：没有“重试原命令”按钮，错误条为 `danger` + `close.error`，确认场景的预览卡片消失（打开下一期间本无预览卡片），`invalidateQueries` 恰好多 1 次、键为 `["close-periods", <company>]`；500 / 503 / 网络拒绝：出现重试按钮、错误条为 `warning` + `close.unknown`，`invalidateQueries` 不增加。
    4. **重试原命令**：重试请求的 URL 与请求体原文与第一次逐字节相同，`randomUUID` 不增加；结果未知期间，预览、确认、打开下一期间按钮都带 `disabled`，重试按钮不带；父页 `#close-company`、`#close-month` 带 `disabled`；净额与结转分录金额为纯文本（没有 `<a>`）。
    5. **成功后的失效**：确认成功后 `invalidateQueries` 依次为 `["ledger-live", <company>]`、`["close-periods", <company>]`，调用时 `pending` 已清；打开下一期间成功后依次为 `["close-periods", <company>]`、`["ledger-periods", <company>]`，在两者的 Promise 放行**之前**父页 `#close-month` 的值不变、重试按钮仍在，放行之后期间切换到返回的月份。
    6. **下一月计算**：`2026-11` 期望 `2026-12`，`2026-12` 期望 `2027-01`；两者成功，返回其他月份即 `invalid`。
    7. **打开下一期间的禁用**：`annual` 的 `2026-11` 冻结期间不带 `disabled`；`annual` 的 `2026-12` 冻结期间与 `monthly-teaching` 的 `2026-11` 冻结期间带 `disabled`；`monthly-teaching` 的关闭期间不带。
    8. **穿透链接**：预览成功后，净额链接与科目 `3100` 的金额链接指向 `#/ledger-reports?company=…&month=…&stage=adjusted&watermark=…&accountRevision=…&view=trial`，其他科目指向 `#/ledger?company=…&month=…&stage=adjusted&watermark=…&accountRevision=…&account=<科目>`，参数顺序如此。
    9. **锁定**：命令开始后、放行前父页两个下拉带 `disabled`；预览完成后（成功或失败）两者都不带；结果未知期间一直带。
    10. **期间版本变化**：同月 `revision` 变化后预览卡片消失；`revision` 不变时重新取数，预览卡片仍在。

    base 上任一直接断言不成立，先停下并向协调者报告，不得把“两侧相同”当作通过，也不得改产品代码迁就断言。PR 正文附：驱动全文、步骤清单、两侧输出的 SHA-256 与比较结果，以及“失败分流”“重试原命令”“成功后的失效”三组场景的逐步输出原文。
  - **驱动原件**：PR 正文贴驱动**原文件字节的 base64**；或者同时写出两种 SHA-256：原始字节的，以及按 UTF-8 解码并把换行归一为 LF 后的字节的（评审从代码块复制时得到的是 LF 文本）。只给一种哈希不算满足。
- **R5 结构规则**（静态；评审按代码与 PR 表格核对）：
  - **R5a Hook 序列**：PR 正文列出 base 与 head 的 Hook 调用序列（自定义 Hook 按调用处展开），以及参数与依赖的源文本（只归一空白）。两侧逐行相同，base 一侧须与“现状”所列 8 项一致。没有豁免，任何差异即失败。
  - **R5b 展示组件无 Hook**：新抽出的组件中没有任何 `use*` 调用。PR 正文附 Babel AST 检查脚本的输出。
  - **R5c 原文搬移**：以下各项在 base 与 head 之间逐字比较，只归一缩进；不同即失败：
    - `loadPreview`、`execute` 的函数体；
    - `source` 的函数体；`open-next` 期望月份的计算表达式；
    - 两个 `useEffect` 的回调体与依赖数组；
    - `Pending` 类型。
  - **R5d 插槽对等**：PR 正文用一张表列出“现状”中 Fragment 内的 5 项（第 1 项按 a–e、第 5 项按段列出），并标出 head 中对应的唯一组件或表达式。
- **R6 尺寸**：
  - 除上表 R6a、R6b 外，`PeriodClose.tsx` ≤ **260** 行（base 505 行；`PeriodClose` 本身 208 行不改）；
  - 新文件各 ≤ 200 行；每个新函数满足 ②：≤ 80 行，嵌套 ≤ 3 层；
  - PR 正文列出所有超过 50 行的函数，附计数行数与最深层数（base 与 head 两列）。
- **R7 打包字节**：
  - 首屏按 D454；
  - 用 `scripts/measure/bundle-measure.mjs`，写明脚本所在的提交 SHA；
  - base 为最终送审 head 的实际合并基；合并基变了就重新测量。

  预算（未列出的项 ±0）：

  | 项 | manifest 键 | 上限 | 依据 |
  | --- | --- | --- | --- |
  | 首屏 | — | **±0**（D454，`--d454`） | 改动文件都不在首屏闭包中（“chunk 归属”表） |
  | 期末结账路由新增 | `src/PeriodClose.tsx` | ≤ **+600 B** | 估定，见下 |
  | 期末结账入口 chunk | `src/PeriodClose.tsx` | ≤ **+600 B** | 同上 |
  | CSS | `assets/PeriodClose.css` 等全部 | ±0 | 不改 CSS |
  | 共用 chunk 与其他路由 | 全部 | ±0 | 只导入、不改 |

  命令参数：`--route src/PeriodClose.tsx=+600 --chunk src/PeriodClose.tsx=+600 --d454`。
  - 出现 base 没有的新 chunk，即停下报告；
  - 超出上限时先停下，报设计角色与协调者，不得自行放宽；
  - 上限没有做试改构建：REFAC-24（#349，279 行）实测为 +493 B，已贴近当时的 +500 B；本函数 263 行，但跨组件传递的值更多（命令、预览、`pending`、`source`），故放宽到 +600 B。
- **R8 质量门**：
  - **R8a 合并前**：`typecheck`、`lint`、CI-02 预检通过；PR CI（`ci.yml`）绿。
  - **R8b 合并后检查（不作合并门）**：合并后第一次覆盖该合并提交的 main Full 须绿；失败时报协调者，按 D456 暂停后续合并。
- **R9 可读性一节**：PR 正文按下节逐条说明。

### 测试命令（S22 回顾行动 4）

- 本机全量 web 测试一律用 `npx vitest run --project web`。PR 正文附汇总行原文，base 与 head 各一次。
- 有失败时，逐个列出失败的文件与用例，并附只对这些文件的串行重跑原文：`npx vitest run --project web --no-file-parallelism <失败文件…>`。
  - 不得自行更换并发参数而不说明；
  - 串行重跑仍失败，即按真实失败处理。

## 性能考虑

- 渲染次数不变：不加 `memo`，不改 Hook 与依赖（决定 2）。
- 三处禁用条件从每次渲染各求值一次变为求值一次，差异可忽略。
- 不跑 Bench。打包变化由 R7 约束。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥：

- **②**：`CloseWizard` 从 263 行拆到 ≤ 80 行（R6a）；拆后它只是“取命令状态 → 组合操作栏、状态与错误条、已关闭提示、预览卡片”。
- **③**：`PeriodClose.tsx`（505 行）拆后 ≤ 260 行，新文件各 ≤ 200 行（R6）。PR 正文贴 `git diff --numstat`。
- **①**：文件与组件名表达职责，例如“结账命令”“操作栏”“预览卡片”“穿透链接”。不用 `part1`、`helpers2` 这类名字。
- **④**：
  - 命令、响应校验与失败分流集中在一个自定义 Hook（或留在 `CloseWizard`），展示组件只接收值与回调；
  - 穿透链接的 URL 构造（`source`）只有一处定义，展示组件以回调或已算好的值接收。
- **⑤**：“正在处理”条件去重（决定 5、R6b）。`["close-periods", company]` 的失效出现在 3 处，各处的等待语义不同（两处不等待、一处在 `Promise.all` 中等待），不强行合并；`t` 与 `PeriodClose` 中的同名定义各属一个组件，`PeriodClose` 本任务不改，不合并。
- **⑥**：不新增注释，除非某处拆分需要说明“为什么”，例如“只有 4xx 才放弃原命令，其余失败结果未知，须保留以便重试”；不留调试输出。
- **测试耗时**：本任务不改测试；R4 驱动不提交。PR 正文附 `period-close.test.tsx` 在 base 与 head 上的耗时（vitest 汇总行原文）；两侧差异 > 20% 时说明原因。

## 用户可见变化

- 无。期末结账的预览、确认、结果未知后的重试、打开下一期间、阻断项提示、穿透链接、父页锁定与中英文文本都不变（R3、R4）。

## 证据要求

- **不需要浏览器时段**：
  - 行为等价由 R3 与 R4（DOM 逐字节、请求、失败分流、失效与锁定的直接断言）证明；
  - e2e 不操作向导按钮；
  - R4 与构建在本机运行，须服从协调者的时段静默通知（D442 / D480）。
- **可行性**（S13 回顾行动 4）：
  - `period-close.test.tsx:12` 已用 `fetch` 桩跑通预览、结果未知的确认与打开下一期间、重试与查询失效；`:203`、`:266` 跑通阻断项与已关闭期间；
  - 驱动 B 渲染已导出的 `PeriodClose`，只需 `QueryClientProvider`、`HashRouter` 与 `fetch` 桩，不需要导出 `CloseWizard`；
  - R6a、R6b 与 R7 的 base 数字见“现状”，由设计角色实测；
  - 本任务书**没有**试写驱动。若某个场景在 jsdom 中构造不出来（例如在 `Promise.all` 等待期间观察 DOM），PR 正文写明原因并报协调者，不得静默删去。
- PR 正文附：
  - R2 的导出、`PeriodClose` 源文本比较与 `git grep` 结果；
  - R3 汇总行；
  - R4 驱动（原件 base64 或两种 SHA-256）、步骤清单、比较结果、直接断言结果与三组场景的逐步输出；
  - R5a–R5d 各表；
  - R6 行数表（base 与 head 两列）；
  - R7 的 `bundle-measure.mjs` 完整输出与退出码；
  - 可读性一节。

  R8b 在合并后补到 PR 评论。

## 设计自查

- [x] 本批只有这一项页面拆分；冲突域与在岗 REFAC-26、REFAC-27 逐文件不相交。
- [x] 每条 base 失败、head 通过的检查都有 base 实测值；R7 的 base 字节已实测。
- [x] 结果未知的重试、失败分流、失效先后与等待、锁定、穿透链接都有直接断言。
- [x] 可读性一节齐全；无用户可见变化。
- [x] 不加迁移，不碰 `scripts/slot/`、`scripts/measure/`。
