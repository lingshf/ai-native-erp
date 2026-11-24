# REFAC-33：拆分总账报表页 `LedgerReports.tsx`（不改行为）

- Sprint：S24（[计划草案](S24.md)）
- 类型：重构（Web 页面拆分）
- 优先级：P2
- 决定：[D553](S24.md#s24-期间决定)。只改代码组织，不改行为，详见“范围与决定”1–8。
- 建议分支：`refac-33-split-ledger-reports-page`
- 来源：[S24 候选](S24.md#候选s24-其余泳道s23-评审后定)“页面拆分”。REFAC-28、REFAC-29 的任务书都写明 `FinancialReport`、`LedgerGrid`、`CompanyReports` 同在 `LedgerReports.tsx`，“宜作为一组另排”。REFAC-29（[#358](https://github.com/lingshf/ai-native-erp/pull/358)）已合并，页面拆分名额空出。本任务在设计空闲时提前写好，有开发名额时派发。
- 模板：[REFAC-29](REFAC-29-period-close-page-split.md)。沿用其中的做法：Hook 序列逐项相同，展示组件不调用 Hook，DOM 含属性顺序逐字节相同，请求做直接断言，驱动原件给 base64 或两种哈希。
- 迁移：**不加**。
- 浏览器时段：**不需要**，理由见“证据要求”。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 为什么是它

- 设计角色在 `c7bc920` 上用 `node fnlen.cjs packages/web/src packages/core/src packages/infra/src` 实测。超过 ② 上限的前几项如下：
  - legacy 的 `checkOpeningItems`（606）、`reconcileLegacy`（382）、`mapRow`（253）、`executeLegacyImport`（230）：不碰。
  - `Workspace`（295，`App.tsx`）：**首屏**，本 Sprint 不排。
  - **`FinancialReport`（240）、`LedgerGrid`（218）、`CompanyReports`（209）**：都在 `LedgerReports.tsx`。同一文件里还有 `LedgerReports`（86），也超过 ②。
  - `targetStorage`（218）：迁移目标存储，不排。
  - `EventEditor`（216）、`DimensionEditor`（215）、`DetailBody`（214）、`Ledger`（200，`Reports.tsx`）：各属不同页面，留待以后另排。
- 选它的理由：
  - **收益最大**：一个文件里有 4 个函数超过 ②，合计 **753** 行；文件 **877** 行，是 Web 端现存最大的源文件。一次拆完，Web 端最长的非首屏函数从 240 行降到 ≤ 80 行。
  - **不在首屏**：`LedgerReports.tsx` 只被 `App.tsx` 懒加载（`App.tsx:60–61`），落在路由 chunk `src/LedgerReports.tsx` 中。
  - **行为关键点可直接断言**：
    - URL 参数校验与“重新加载快照”；
    - 默认期间，视图与阶段切换写入的 hash；
    - 下钻链接中的快照钉（`watermark` / `accountRevision`），以及结账后阶段下“报表方向”列改用 `adjusted`；
    - 钉值不符时拒绝响应；
    - 总账明细由快照转入网格；
    - 游标编码、表单提交与刷新；
    - 409 冲突时锁住全部控件，并拒绝发请求；
    - 期间分页，以及未知期间触发重取。

    设计角色已在 base 上逐项实测，见 R4 直接断言。
- 冲突域与在途的 REFAC-30、REFAC-31、REFAC-32 逐文件不相交，详见“冲突域”。

## 现状（main `c7bc920`）

下文 `file:line` 都按 `c7bc920`（#359 的合并提交）。`LedgerReports.tsx` 最后一次改动是 `ca61d8a`（REFAC-04）。

- `packages/web/src/LedgerReports.tsx` 共 **877** 行，只导出 `LedgerReports`（`:23`）。
- 导入：
  - `react`：`useCallback`、`useEffect`、`useRef`、`useState`；
  - `@tanstack/react-query`：`useInfiniteQuery`、`useQuery`、`useQueryClient`；
  - `react-router-dom`：`Link`、`useLocation`、`useSearchParams`；
  - `@erp/core/contracts`：6 个 schema，以及类型 `CompanyDto`、`ReportDto`；
  - `./ui/index.ts`、`./master-data-client.ts`、`./reports-data.ts`（`formatMinor`）、`./journals/virtual-rows.tsx`（`VirtualRows`）、`./ui/components/index.tsx`（`Badge`、`MessageBar`、`PageHeader`、`TeachingTip`）、`./pages/ledger.css`。
- 模块级定义：
  - `T`（`:20`）、`views`（`:21`）、`View`（`:22`）；
  - 组件：`LedgerReports`（`:23–108`）、`ErrorBox`（`:109–131`）、`CompanyReports`（`:132–340`）、`FinancialReport`（`:341–580`）、`LedgerSnapshot`（`:614–659`）、`LedgerGrid`（`:660–877`）；
  - 函数：`ledgerFilters`（`:581–593`）、`ledgerKey`（`:594–608`）、`useLedgerConflict`（`:609–613`）。
- 设计角色实测：

  ```text
  240	packages/web/src/LedgerReports.tsx:341-580	FinancialReport
  218	packages/web/src/LedgerReports.tsx:660-877	LedgerGrid
  209	packages/web/src/LedgerReports.tsx:132-340	CompanyReports
  86	packages/web/src/LedgerReports.tsx:23-108	LedgerReports
  ```

- **组件边界与 `key`**（决定 3 的依据）：
  - `CompanyReports` 的 `key` 为 `` `${company.code}:${location.pathname}` ``（`:98`）。换公司或在 `/ledger-reports` 与 `/ledger` 之间切换时，整棵子树重新挂载。
  - `LedgerGrid` 的 `key` 为 `` `${search}:${account}:${params.get("dimension")}:${params.get("value")}` ``。改变筛选时重新挂载，三个输入框的 `useState` 随之重置。
  - `FinancialReport` 与 `LedgerSnapshot` 没有 `key`。
- **Hook 调用序列**（base，按源码顺序；R5a 以此为准）：
  - `LedgerReports`：
    1. `useSearchParams()`（`:24`）
    2. `useLocation()`（`:25`）
    3. `useState<{ scope; error } | null>(null)`（`failedSnapshot`，`:26–29`）
    4. `useInfiniteQuery`（公司，`:31–41`）
    5. `useCallback`（`setConflict`，`:47–50`），依赖 `[scope]`
  - `CompanyReports`：
    1. `useSearchParams()`（`:143`）
    2. `useLocation()`（`:144`）
    3. `useQueryClient()`（`:145`）
    4. `useInfiniteQuery`（期间，`:147–159`）：键 `["ledger-periods", company.code]`，`staleTime: 0`，`refetchOnMount: "always"`。期间游标**不**编码。
    5. `useRef(requestedMonth)`（`:163`）
    6. `useEffect`（`:164–169`），依赖 `[requestedMonth, months, periods.refetch]`
  - `FinancialReport`：
    1. `useQuery`（`:360–389`）：键为 8 项，`queryFn` 内校验钉值。
  - `LedgerSnapshot`：
    1. `useSearchParams()`（`:625`）
    2. `useQueryClient()`（`:626`）
    3. `useQuery`（`:627–639`）
    4. `useLedgerConflict` → `useEffect`（`:640`，定义在 `:609–613`）
    5. `useEffect`（`:641–649`），依赖 `[query.data, query.isError, query.isFetching, conflict, scope, client, setParams]`
  - `LedgerGrid`：
    1. `useSearchParams()`（`:679`）
    2. `useState(account)`（`:680`）
    3. `useState(params.get("dimension") ?? "")`（`:681`）
    4. `useState(params.get("value") ?? "")`（`:682`）
    5. `useInfiniteQuery`（`:684–707`）：明细游标**编码**。
    6. `useLedgerConflict` → `useEffect`（`:708`）
- **派生值的求值位置**（都在组件体内，每次渲染求值）：
  - `CompanyReports`：
    - `t`；
    - `months`、`month`、`requestedMonth`（`:160–162`，在第 4、5 个 Hook 之间）；
    - `view`、`stage`、`account`（`:170–172`）；
    - `valid`（`:173–200`）；
    - `search`（`:201–204`）；
    - `change`（`:205–211`）；
    - `ledger`（`:212`）。
  - `FinancialReport`：在早返回（`:386–389`）之后求值 `report`、`fmt`、`pinnedSearch`、`toLedger`、`selected`、`groupValue`、`incomeGroup`、`kpis`、`summary`、`accountsTitle`（`:390–432`）。
  - `LedgerGrid`：`filters`（`:683`，在第 4、5 个 Hook 之间）；`data`、`rows`、`first`、`fmt`（`:709–712`）。
- **重复**：
  - 报表类别筛选 `view === "income" ? ["REVENUE", "EXPENSE"]… : view === "balance-sheet" ? ["ASSET", "LIABILITY", "EQUITY"]… : true` 写了 **2** 处：科目行 `selected`（`:400–408`）与类别表的 `.filter`（`:505–511`）。两处判定相同，都看 `row.category`。
  - `formatMinor(n, preferences.language, company.scale)` 写了 2 处（`FinancialReport`、`LedgerGrid`）。
  - `t("ledger.snapshotUnavailable")` 写了 3 处：`ErrorBox`、`LedgerSnapshot`、`LedgerGrid`。其中 `ErrorBox` 那处是附加说明，与另外两处的独立提示条不同。
- **测试**：
  - `packages/web/test/ledger-reports.test.tsx` 有 3 个用例。第 1 个经 `App` 整页渲染，覆盖快照钉、下钻、冲突与刷新；另 2 个只测 `VirtualRows`。
  - `reports.test.tsx` 断言主导航里指向 `#/ledger-reports` 的链接；`period-close.test.tsx` 从 `#/ledger-reports` 起始；`App.test.tsx` 断言导航标签。
  - `contrast.test.ts` 只读 `pages/ledger.css`。
  - 真实 Chrome 的 e2e（`packages/infra/test/support/trade-gui/`、`smoke/`）中，没有用到 `#ledger-*` 控件或总账报表页的断言（`git grep` 为空）。

### chunk 归属与首屏（S22 回顾行动 3，base 实测）

设计角色在 `c7bc920` 上运行：

```text
node scripts/measure/bundle-measure.mjs --base c7bc920526d6f35e0a8b0b4e2441656d9f4c2528 --head c7bc920526d6f35e0a8b0b4e2441656d9f4c2528 --work <新目录> --d454
```

脚本取自 `c7bc920`，该文件最后一次改动是 `6156759`；退出码 0，`RESULT: PASS`。

| 文件 | 落在哪个 chunk | 依据 |
| --- | --- | --- |
| `LedgerReports.tsx`（改） | 路由入口 chunk `src/LedgerReports.tsx` | 只被 `App.tsx` 懒加载 |
| `ledger-reports/` 下的新文件（新增） | 同上 | 只允许被 `LedgerReports.tsx` 或本任务的新文件导入（决定 7） |
| 首屏 | **本任务不改任何首屏文件** | `ui/*`、`ui/components`、`master-data-client.ts`、`reports-data.ts`、`journals/virtual-rows.tsx` 只导入，不改（决定 8） |
| CSS | 不改 | `pages/ledger.css` 也被 `Reports.tsx` 路由使用，不改 |

base 数字（原始 / gzip-9 字节）：

| 项 | 键 | 原始 | gzip |
| --- | --- | --- | --- |
| first-screen | first-screen | 531281 | 161155 |
| route | `src/LedgerReports.tsx` | 45390 | 15343 |
| chunk | `src/LedgerReports.tsx` | 17609 | 4885 |
| chunk | `assets/ledger.css` | 2082 | 729 |

## 范围与决定

1. **不改行为**（D553）。以下全部不变：
   - DOM：结构、类名、文本，属性及其**先后顺序**（含 `id`、`htmlFor`、`className`、`type`、`disabled`、`value`、`role`、`tone`、`aria-label`、`scope`、`href`）；
   - 请求：URL（含参数顺序、游标是否编码）、发出顺序与次数；
   - 查询：查询键、`enabled`、`staleTime`、`gcTime`、`refetchOn*`；`setQueryData` 预置的键与值；
   - `resetQueries` / `invalidateQueries` 的调用顺序与键；
   - URL 参数：校验规则（`valid` 全部条件）、`change` 的合并顺序、刷新时删去的键、表单提交写入的键与顺序、快照转网格时用 `replace` 写入；
   - 下钻链接的 `href`，含“报表方向”列在 `postClosing` 下改用 `adjusted`；
   - 钉值不符时报 `invalid`，409 冲突的传播与锁定，冲突时表单提交被拒绝；
   - 滚动加载的阈值与条件（`< 600`、`hasNextPage`、`!isFetching`、`!isError`、`!conflict`），以及 `cancelRefetch: false`；
   - 焦点与键盘行为；中英文文本与教学提示。

   本任务只改代码组织，不修 bug。拆分时发现的疑似缺陷登记在 PR 正文，留作后续任务。已知一处：只填“值”不填“维度”时，表单写出 `value` 而不带 `dimension`，`valid` 随即判为无效（R4 直接断言 7）。
2. **Hook 顺序不变**：
   - 每个现有组件的 Hook 可以留在原组件里，也可以放进它在顶层无条件调用的自定义 Hook；
   - 展开自定义 Hook 后，每个组件的 Hook 调用序列与“现状”所列逐项相同：种类、先后、参数与依赖的源文本都相同，只归一空白（R5a）；
   - 派生值可以随 Hook 搬进自定义 Hook，但不得改变它与相邻 Hook 的先后。例如 `CompanyReports` 中 `month` 先于 `useRef`，`LedgerGrid` 中 `filters` 先于 `useInfiniteQuery`；
   - **新抽出的展示组件不得调用任何 Hook**；不新增 `useCallback`、`useMemo`、`useEffect`、`memo`；
   - 本任务**没有豁免**。
3. **组件边界不变**：
   - `LedgerReports`、`CompanyReports`、`FinancialReport`、`LedgerSnapshot`、`LedgerGrid` 这 5 个带 Hook 的组件仍是独立的 React 组件。不得把其中一个内联进父组件，也不得把两个合并；
   - 父组件渲染它们时的 `key` 与全部 props 原样保留（R5c），以免改变重新挂载的边界与 `useState` 的重置时机；
   - `ErrorBox` 仍是独立组件，props 不变；
   - 新抽出的展示组件只替换原 JSX 中的一段，只渲染该段原来渲染的内容。条件渲染的条件留在父级原位置，或留在被抽出组件内与原来相同的位置。
4. **报表类别筛选去重**（⑤，R6b）：
   - `selected` 与类别表 `.filter` 两处的判定，改为调用同一个按 `view` 与 `category` 判定的函数；
   - 两处结果的元素与顺序不变（R4 直接断言 2、3 中类别表与科目表的行）；
   - `formatMinor` 的两处调用可以不合并；合并时须保持实参不变。
5. **查询不合并**：
   - 公司、期间、报表、快照、明细 5 个查询的选项对象原样搬移（R5c）；
   - 公司游标编码，期间游标不编码，明细游标编码，三者不得抽成共用工厂；
   - `ledgerFilters`、`ledgerKey` 的函数体原样搬移。
6. **模块级常量**：`T`、`views`、`View` 可以搬进新文件供各文件共用，定义的源文本不变。
7. **文件**：
   - 新文件放进新目录 `packages/web/src/ledger-reports/`，按职责命名，例如 `company-reports.tsx`、`report-filter-bar.tsx`、`financial-report.tsx`、`report-tables.tsx`、`ledger-snapshot.tsx`、`ledger-grid.tsx`、`ledger-query.ts`、`error-box.tsx`。粒度由开发定，写入 PR 正文；
   - 新文件只被 `LedgerReports.tsx` 或本任务的新文件导入；
   - `LedgerReports` 留在 `LedgerReports.tsx`，仍是该文件唯一的导出，名称与 props 类型不变；`App.tsx` 的懒加载导入不变。
8. **不改**：
   - `App.tsx` 与路由表；`Reports.tsx`、`reports-data.ts`、`journals/virtual-rows.tsx`、`master-data-client.ts`；`ui/**`（含标签资源与教学文案）；CSS（含 `pages/ledger.css`）；契约（`@erp/core/contracts`）；
   - `packages/web/test/**`（含 `setup.ts`）、`packages/infra/**`、`packages/core/**`；
   - `scripts/**`（含 `scripts/slot/`、`scripts/measure/`）、`scripts/test-shard-weights.json`、`package.json` / lock、`vitest.config.ts`。

## 冲突域

- web-ui:ledger：只改 `packages/web/src/LedgerReports.tsx`，并在新目录 `packages/web/src/ledger-reports/` 下新增文件（决定 7）。
- 取证所需的观测点和新增测试文件：无。R4 驱动不提交。
- 受影响的 e2e 断言（S13 回顾行动 1）：无。真实 Chrome 场景不进入总账报表页。**须随本任务改**：无。
- 受影响的文档引用（D460）：`git grep -n -F "LedgerReports" -- docs design` 在 `c7bc920` 上命中 68 行，都是历史任务书、评审与演示日志中的事实记录。组件名与文件名不变，不改。
- 与在途任务不相交：
  - REFAC-30 只改 `packages/core/src/domain/trade-calculator.ts` 与同目录新增的 `trade-calculation-*.ts`；
  - REFAC-31 只改 `packages/core/src/application/business-events.ts` 与同目录新增的 `business-event-*.ts`；
  - REFAC-32 只改 `packages/infra/src/copilot-ai.ts` 与同目录新增的 `copilot-ai-*.ts`。

  四者没有共享文件。本任务只跑 `web` 项目，另三项跑 `core` / `infra` / `infra-isolated` 项目。REFAC-29 已合并，本任务是唯一的页面拆分。

## 验收

### base 失败、head 通过

| 编号 | 检查 | base `c7bc920` | head 要求 |
| --- | --- | --- | --- |
| R6a | `node fnlen.cjs packages/web/src`（口径同 S16–S24）中 `FinancialReport`、`LedgerGrid`、`CompanyReports`、`LedgerReports` 的行数 | **240 / 218 / 209 / 86**（失败） | 都 ≤ 80；本任务新增或改动的函数也都 ≤ 80 |
| R6b | 在 `LedgerReports.tsx` 与 `ledger-reports/` 全部文件的拼接文本上，分别统计 `/\["ASSET", "LIABILITY", "EQUITY"\]/g` 与 `/\["REVENUE", "EXPENSE"\]/g` 的命中数（用 `node -e` 读文件计数） | **2 / 2**（失败） | **1 / 1**（决定 4）。PR 正文附 base 与 head 两侧的计数脚本与输出原文 |

### 两侧都须成立的不变量

- **R1 范围**：
  - `git diff --name-only <base> <head>` 只含 `packages/web/src/LedgerReports.tsx` 与 `packages/web/src/ledger-reports/` 下的**新**文件；
  - 决定 8 所列文件的 diff 为空；
  - 不加迁移。
- **R2 导出不变**：
  - `LedgerReports.tsx` 的导出集合与 base 相同：只有 `LedgerReports`，类型为 function；props 类型的源文本相同，只归一空白。用仓库根 devDependency `@babel/parser`（插件 `typescript`、`jsx`）解析，口径同 REFAC-14 R2；
  - 新文件的导出只在 `LedgerReports.tsx` 与 `ledger-reports/` 内使用，PR 正文附 `git grep` 结果。
- **R3 既有测试原样通过**：
  - `ledger-reports.test.tsx` 的 3 个用例、`reports.test.tsx`、`period-close.test.tsx`、`App.test.tsx` 与 Web 全部 jsdom 测试通过；
  - 测试文件 diff 为空；
  - 本机全量命令见“测试命令”。
- **R4 DOM、请求、URL 与冲突等价**（送审证据；驱动不提交，不加常驻 CI 用例）：
  - **两个驱动**都是临时 jsdom 脚本，在 base 与 head 上按同一序列操作。
  - `fetch` 桩按路径分派，借用 `ledger-reports.test.tsx:128–` 中 `vi.stubGlobal("fetch", …)` 的写法，但改为**受控响应**：
    - `/api/v1/companies`：一页；
    - `/api/v1/periods`：可返回一页，也可分两页。第一页 `2026-01`，`nextCursor: "2026-01"`；第二页 `2026-02`。
    - `/api/v1/reports/*`：用 `buildReports` 构造。`watermark` 默认取请求参数，没有时取 5；驱动可强制返回其他值。`accountRevision` 取请求参数，没有时取 8。
    - `/api/v1/ledger`：可返回 409 错误信封。第一页 `nextCursor` 为 `"c/1 x"`（含须编码的字符），第二页为 `null`。第一页明细带 `dimensions: { REGION: "N" }`。维度代码须大写，否则 `ledgerSchema` 校验失败。
  - 桩记录每次请求的序号、方法与 URL（`pathname + search`）。`QueryClient.prototype.resetQueries` 与 `invalidateQueries` 用委托包装，记录序号与 `queryKey`，保留原实现。
  - 两个驱动的渲染方式：
    - **驱动 A（整页）**：渲染 `App`，经导航进入总账报表与总账明细，按 `ledger-reports.test.tsx` 第 1 个用例的路径操作。
    - **驱动 B（直接渲染导出组件）**：在 `QueryClientProvider` 与 `HashRouter` 内直接渲染导出的 `LedgerReports`。`QueryClient` 的默认选项与 `App.tsx:67–80` 相同；`preferences` 由驱动控制（zh / en、教学开 / 关）；起始 URL 由 `window.history.replaceState` 给定。
    - 两者都按 `ledger-reports.test.tsx:41–52` 装 `offsetHeight` / `offsetWidth` 与 `ResizeObserver` 桩。
  - **记录规则**：同 [REFAC-28 R4](REFAC-28-close-wizard-split.md#两侧都须成立的不变量)。
    - 被记录的函数一律用委托包装对象或函数，不用 `Proxy`；
    - 调用时分配递增序号并立即写入记录；
    - 参数经确定性编码；
    - 驱动须带 REFAC-17 的自测（a）–（c），任一失败即 R4 失败。
  - **焦点**：`HTMLElement.prototype.focus` 装记录桩，保留原实现，记下每次调用的目标。
  - **序列**：至少覆盖下面直接断言 1–12 的全部场景（驱动 B；11、12 为必跑项，现有整页测试不进入资产负债表与对账表分支）。驱动 A 另跑 zh / en 各一遍、教学模式开与关各一遍。
  - **每步采样**：
    - `document.body.innerHTML`；
    - `window.location.hash`；
    - 累计请求日志；
    - `resetQueries` / `invalidateQueries` 记录；
    - 以下控件的 `value` 与 `disabled`：`#ledger-company`、`#ledger-month`、`#ledger-view`、`#ledger-stage`、`#ledger-account`、`#ledger-dimension`、`#ledger-value`，以及“查询”按钮；
    - 焦点调用记录；
    - `console.error` 调用记录。
  - **判定**：base 与 head 逐步、逐项、逐字节相同。并且要**直接断言**；只比两侧相同不够。下列各条，设计角色都已在 `c7bc920` 上用临时 jsdom 脚本（驱动 B 的写法）实测成立。除另有说明外，期间为一页（`2026-01`、`2026-02`），语言为 zh。
    1. **URL 校验与重新加载**：
       - 起始 `#/ledger-reports?company=DEFAULT&month=2026-01&foo=1`：出现 `ledger.invalid` 文本，其最近的带 `role` 祖先为 `role="alert"`，提示条内有“重新加载快照”按钮；只发出 2 个 GET（`/api/v1/companies?limit=100`、`/api/v1/periods?company=DEFAULT&limit=100`），不请求报表。
       - 点该按钮后，hash 为 `#/ledger-reports?company=DEFAULT`；提示消失；追加 1 个 GET：`/api/v1/reports/trial?company=DEFAULT&month=2026-02&stage=adjusted`（默认期间取最后一项）。
       - 另两种起始 URL 也出现同一提示，且同样只发出公司、期间 2 个 GET：`…&dimension=x`（有维度无值）与 `…&view=trial&view=trial`（重复键）。
    2. **默认期间、视图与阶段切换**：起始 `#/ledger-reports?company=DEFAULT`。
       - `#ledger-month` 的值为 `2026-02`；
       - 类别表中 `cash` 行的链接 `href` 为 `#/ledger-reports?company=DEFAULT&month=2026-02&stage=adjusted&watermark=5&accountRevision=8&view=trial&group=cash`；
       - 在 `#ledger-view` 选 `income` 后，hash 为 `#/ledger-reports?company=DEFAULT&month=2026-02&view=income&group=`；
       - 再在 `#ledger-stage` 选 `postClosing` 后，hash 为 `#/ledger-reports?company=DEFAULT&month=2026-02&view=income&group=&stage=postClosing`；
       - 报表 GET 依次为 `trial`（`adjusted`）、`income`（`adjusted`）、`income`（`postClosing`），各 1 个，都不带钉值。
    3. **下钻链接**：直接断言 2 的利润表科目表中，`4400` 行有 5 个链接：
       - `adjusted` 下，5 个 `href` 都是 `#/ledger?company=DEFAULT&month=2026-02&stage=adjusted&watermark=5&accountRevision=8&account=4400`；
       - `postClosing` 下，第 1 个（“报表方向”列）仍为 `stage=adjusted`，其余 4 个为 `stage=postClosing`，其他参数与顺序相同。
    4. **钉值不符**：起始 `#/ledger-reports?company=DEFAULT&month=2026-01&watermark=3&accountRevision=8`，桩返回 `watermark: 4`。
       - 报表 GET 为 `/api/v1/reports/trial?company=DEFAULT&month=2026-01&stage=adjusted&watermark=3&accountRevision=8`，只发 1 次；
       - 出现 `ledger.error` 与 `reports.invalidResponse` 文本，提示条为 `role="alert"`，内有“重试”按钮；
       - 不渲染类别表。
    5. **快照转网格**：起始 `#/ledger?company=DEFAULT&month=2026-01&account=1000`。
       - 明细 GET 依次为：
         - `/api/v1/ledger?company=DEFAULT&month=2026-01&account=1000&limit=500&stage=adjusted`；
         - `/api/v1/ledger?company=DEFAULT&month=2026-01&account=1000&limit=500&stage=adjusted&watermark=5&accountRevision=8`。

         网格挂载后仍重取一次（`refetchOnMount: "always"`），不因 `setQueryData` 预置而省去。
       - hash 为 `#/ledger?company=DEFAULT&month=2026-01&account=1000&stage=adjusted&watermark=5&accountRevision=8`（不含 `limit`）；
       - `.ledger-totals` 的文本为 `期初余额: 100.00本期借方: 30.00本期贷方: 0.00期末余额: 130.00本期行数: 2账簿水位: 5科目配置版本: 8`；
       - 第一条明细的来源链接 `href` 为 `#/journals?company=DEFAULT&id=00000000-0000-4000-8000-000000000001`，维度单元格文本为 `REGION=N`。
    6. **游标与重复提交**：接直接断言 5。
       - 对“总账明细”区域触发 `scrollTop: 1000` 的滚动，追加 1 个 GET：`…&watermark=5&accountRevision=8&cursor=c%2F1%20x`；
       - 不改筛选直接点“查询”，追加 2 个 GET：先是第一页（不带 `cursor`），再是 `cursor=c%2F1%20x`。
    7. **只有值、没有维度**（疑似缺陷，原样保留）：接直接断言 6。在 `#ledger-value` 填 `N` 后点“查询”。
       - hash 为 `#/ledger?company=DEFAULT&month=2026-01&account=1000&stage=adjusted&watermark=5&accountRevision=8&value=N`；
       - 出现 `ledger.invalid`（`role="alert"`）。

       另起一遍：在 `#ledger-account` 填 `4400`、`#ledger-dimension` 填 `REGION`、`#ledger-value` 填 `N` 后点“查询”。
       - hash 为 `#/ledger?company=DEFAULT&month=2026-01&account=4400&stage=adjusted&watermark=5&accountRevision=8&dimension=REGION&value=N`；
       - 只追加 1 个 GET：`/api/v1/ledger?company=DEFAULT&month=2026-01&account=4400&limit=500&stage=adjusted&dimension=REGION&value=N&watermark=5&accountRevision=8`。注意 `dimension` / `value` 在钉值之前。
    8. **409 冲突与恢复**：起始 `#/ledger?company=DEFAULT&month=2026-01&account=1000&watermark=5&accountRevision=8`，明细返回 409。
       - 只有 1 个 `role="alert"`，文本为 `ledger.snapshotUnavailable`；
       - `#ledger-company`、`#ledger-month`、`#ledger-account`、`#ledger-dimension`、`#ledger-value` 与“查询”按钮都带 `disabled`；
       - 此时点“查询”，并对表单直接 `fireEvent.submit`，都不发出任何请求。
       - 观察到上述 409 与锁定之后，先把明细桩切换为 200，再点“刷新为最新账簿”（刷新会重置查询，点击时仍返回 409 的桩不是本条的恢复夹具）：
         - `resetQueries` 恰好 1 次，键为 `["ledger-live","DEFAULT"]`；
         - `invalidateQueries` 恰好 1 次，键为 `["ledger-periods","DEFAULT"]`；
         - 追加的 GET 依次为：`/api/v1/periods?company=DEFAULT&limit=100`、带钉值的明细、不带钉值的快照（`…&limit=500&stage=adjusted`）、带钉值的明细，共 4 个；
         - 完成后上述控件都不再带 `disabled`。
    9. **期间分页与未知期间**：期间分两页，起始 `#/ledger-reports?company=DEFAULT`。
       - `#ledger-month` 先为 `2026-01`。
       - 点“加载更多”后：
         - 追加 GET `/api/v1/periods?company=DEFAULT&limit=100&cursor=2026-01`（游标不编码）；
         - 值变为 `2026-02`，追加 1 个 `trial` 报表 GET；
         - “加载更多”不再渲染。
       - 再经 `window.location.hash` 切到 `month=2026-03`：
         - 重取期间，追加 2 个 GET：第一页，以及 `cursor=2026-01`；
         - 出现 `ledger.invalid`。
    10. **报表页刷新（en）**：起始 `#/ledger-reports?company=DEFAULT&month=2026-01&watermark=5&accountRevision=8`，语言 en。
        - `.ledger-meta` 文本为 `Posting watermark: 5 · Account configuration revision: 8`。
        - 点 `Refresh to latest ledger` 后：
          - `resetQueries` 与 `invalidateQueries` 的键同直接断言 8；
          - hash 为 `#/ledger-reports?company=DEFAULT&month=2026-01`；
          - 追加的 GET 依次为：带钉值的 `trial` 报表、`/api/v1/periods?company=DEFAULT&limit=100`、不带钉值的 `trial` 报表。
    11. **资产负债表（混合类别夹具）**：报表桩改用下列 6 行（顺序即 `buildReports` 的输入顺序；`opening` 都为 0，`closing = debit - credit`，`yearNet` 同 `closing`），覆盖 R6b 去重直接影响的两处筛选：
        | 代码 | 名称 | 类别 | 报表类别 | 方向 | 借方 | 贷方 |
        | --- | --- | --- | --- | --- | --- | --- |
        | 4400 | Revenue | REVENUE | sales | CREDIT | 0 | 4000 |
        | 1000 | Cash | ASSET | cash | DEBIT | 13000 | 0 |
        | 6000 | Opex | EXPENSE | operatingExpense | DEBIT | 1000 | 0 |
        | 2000 | Payable | LIABILITY | payables | CREDIT | 0 | 5000 |
        | 3000 | Capital | EQUITY | capital | CREDIT | 0 | 7000 |
        | 1100 | Receivable | ASSET | receivables | DEBIT | 2000 | 0 |

        起始 `#/ledger-reports?company=DEFAULT&month=2026-01&view=balance-sheet`（期间一页，语言 zh）。
        - 报表 GET 只有 1 个：`/api/v1/reports/balance-sheet?company=DEFAULT&month=2026-01&stage=adjusted`；
        - `.kpis .kpi` 恰好 3 个，`className|textContent` 依次为 `kpi emphasis|资产150.00`、`kpi|负债50.00`、`kpi|权益（含未结转损益）100.00`；
        - 类别表（`table[aria-label="报表类别"]`）`tbody` 恰好 4 行，`textContent` 依次为 `投入资本70.00`、`货币资金130.00`、`应付款50.00`、`应收款20.00`（`capital`、`cash`、`payables`、`receivables`，排除 `sales` 与 `operatingExpense`；保留负债与权益）；各行无 `class`；链接 `href` 为 `#/ledger-reports?company=DEFAULT&month=2026-01&stage=adjusted&watermark=5&accountRevision=8&view=balance-sheet&group=<类别>`；
        - 科目表（`.ledger-accounts`）标题为“试算平衡”，表头依次为 科目、期初余额、本期借方、本期贷方、期末余额（无“报表方向”列）；`tbody` 恰好 4 行，依次为 `1000 · Cash`、`2000 · Payable`、`3000 · Capital`、`1100 · Receivable`（按试算行顺序，排除 4400 与 6000），每行 4 个链接都指向 `#/ledger?company=DEFAULT&month=2026-01&stage=adjusted&watermark=5&accountRevision=8&account=<代码>`；`2000` 行文本为 `2000 · Payable0.000.0050.00-50.00`。
        - 点 `cash` 行的链接后：hash 为 `#/ledger-reports?company=DEFAULT&month=2026-01&stage=adjusted&watermark=5&accountRevision=8&view=balance-sheet&group=cash`；追加 1 个带钉值的 `balance-sheet` GET；类别表仍为同样 4 行，只有 `cash` 行带 `class="selected"`；科目表只剩 `1000 · Cash` 1 行。
    12. **对账表**：接直接断言 11，在 `#ledger-view` 选 `reconciliation`。报表桩对 `reconciliation` 返回同一 `buildReports` 结果，但把第 2 条检查替换为 `{ id: "balanceSheet", left: 15000, right: 14000, difference: 1000, pass: false }`（`allPass: false`），以同时覆盖两种徽标。
        - hash 为 `#/ledger-reports?company=DEFAULT&month=2026-01&stage=adjusted&watermark=5&accountRevision=8&view=reconciliation&group=`；追加 1 个 GET：`/api/v1/reports/reconciliation?company=DEFAULT&month=2026-01&stage=adjusted&watermark=5&accountRevision=8`；
        - 不渲染 `.kpis`、类别表与 `.ledger-accounts`；
        - `.ledger-stack` 的 `outerHTML` 逐字节为：
          ```html
          <section class="ledger-stack" aria-label="对账"><p class="ledger-meta">账簿水位: 5 · 科目配置版本: 8</p><div class="message-bar info"><span class="icon" aria-hidden="true">i</span><div class="text">同源账簿的数学勾稽，不是独立审计或外部对账证明。</div></div><div class="card"><header><h3>对账</h3><span class="summary">2026-01 · CNY</span></header><div class="grid-wrap"><table class="grid"><thead><tr><th>对账</th><th class="num">左方</th><th class="num">右方</th><th class="num">差额</th><th>结果</th></tr></thead><tbody><tr><th scope="row">所选阶段试算</th><td class="num">160.00</td><td class="num">160.00</td><td class="num">0.00</td><td><span class="badge success"><span aria-hidden="true">✓</span>一致</span></td></tr><tr><th scope="row">资产 = 负债 + 权益</th><td class="num">150.00</td><td class="num">140.00</td><td class="num">10.00</td><td><span class="badge danger"><span aria-hidden="true">×</span>不一致</span></td></tr><tr><th scope="row">权益变动衔接</th><td class="num">100.00</td><td class="num">100.00</td><td class="num">0.00</td><td><span class="badge success"><span aria-hidden="true">✓</span>一致</span></td></tr><tr><th scope="row">收入 - 费用 = 利润</th><td class="num">30.00</td><td class="num">30.00</td><td class="num">0.00</td><td><span class="badge success"><span aria-hidden="true">✓</span>一致</span></td></tr></tbody></table></div></div></section>
          ```

        直接断言 11、12 的每一步也进入上文“每步采样”的 DOM 逐字节比较。

    base 上任一直接断言不成立时，先停下并向协调者报告。不得把“两侧相同”当作通过，也不得改产品代码迁就断言。PR 正文附：
    - 驱动全文与步骤清单；
    - 两侧输出的 SHA-256 与比较结果；
    - 直接断言 5–8（快照转网格、游标、表单、冲突）与 11、12（资产负债表、对账表）的逐步输出原文。
  - **驱动原件**：PR 正文贴驱动**原文件字节的 base64**；或者同时写出两种 SHA-256：一是原始字节的，二是按 UTF-8 解码并把换行归一为 LF 之后字节的（评审从代码块复制时得到的是 LF 文本）。只给一种哈希不算满足。
- **R5 结构规则**（静态；评审按代码与 PR 表格核对）：
  - **R5a Hook 序列**：PR 正文按组件列出 base 与 head 的 Hook 调用序列，自定义 Hook 按调用处展开，并附参数与依赖的源文本（只归一空白）。
    - 两侧逐行相同；base 一侧须与“现状”所列一致（5 + 6 + 1 + 5 + 6 项）。
    - 没有豁免，任何差异即失败。
  - **R5b 展示组件无 Hook**：新抽出的组件中没有任何 `use*` 调用。PR 正文附 Babel AST 检查脚本的输出。
  - **R5c 原文搬移**：以下各项在 base 与 head 之间逐字比较，只归一缩进；不同即失败。
    - 5 个查询的选项对象；
    - `ledgerFilters`、`ledgerKey`、`useLedgerConflict` 的函数体；
    - `LedgerSnapshot` 中第二个 `useEffect` 的回调体与依赖数组；
    - `setConflict` 的回调体与依赖；
    - `CompanyReports` 中 `useEffect` 的回调体与依赖；
    - 以下求值表达式：
      - `CompanyReports`：`scope`、`conflict`、`month`、`view`、`stage`、`account`、`valid`、`search`（含两条 `if`）；
      - `FinancialReport`：`pinnedSearch`（含两次 `set`）、`toLedger`、`groupValue`、`incomeGroup`、`kpis`；
      - `LedgerGrid`：`data`；
    - `change`；
    - “刷新为最新账簿”按钮、表单 `onSubmit`、`onScrollCapture` 与 `ErrorBox` `retry` 的回调体；
    - `CompanyReports`、`LedgerGrid`、`LedgerSnapshot`、`FinancialReport` 4 个 JSX 元素的 `key` 与全部 props；
    - `views`、`T`、`View`。
  - **R5d 插槽对等**：PR 正文用表格列出 base 中 5 个组件的顶层 JSX 各段，并标出 head 中对应的唯一组件或表达式。
- **R6 尺寸**：
  - 除上表 R6a、R6b 外，`LedgerReports.tsx` ≤ **150** 行（base 877 行）；
  - 新文件各 ≤ 200 行；每个新函数满足 ②：≤ 80 行，嵌套 ≤ 3 层；
  - PR 正文列出所有超过 50 行的函数，附计数行数与最深层数（base 与 head 两列）。
- **R7 打包字节**：
  - 首屏按 D454；
  - 用 `scripts/measure/bundle-measure.mjs`，写明脚本所在的提交 SHA；
  - base 取最终送审 head 的实际合并基；合并基变了就重新测量。

  预算（未列出的项为 ±0）：

  | 项 | manifest 键 | 上限 | 依据 |
  | --- | --- | --- | --- |
  | 首屏 | — | **±0**（D454，`--d454`） | 改动文件都不在首屏闭包中（见“chunk 归属”表） |
  | 总账报表路由新增 | `src/LedgerReports.tsx` | ≤ **+900 B** | 估定，见下 |
  | 总账报表入口 chunk | `src/LedgerReports.tsx` | ≤ **+900 B** | 同上 |
  | CSS | `assets/ledger.css` 等全部 | ±0 | 不改 CSS |
  | 共用 chunk 与其他路由 | 全部 | ±0 | 只导入、不改 |

  命令参数：`--route src/LedgerReports.tsx=+900 --chunk src/LedgerReports.tsx=+900 --d454`。
  - 出现 base 没有的新 chunk 时，即停下报告；
  - 超出上限时先停下，报设计角色与协调者，不得自行放宽；
  - 上限没有做试改构建。REFAC-28（#352，263 行拆成 8 个文件）实测为 +450 B（gzip）。本任务要拆的函数合计 753 行，新文件更多，展示组件也要接收较多 props，所以估为 +900 B。
- **R8 质量门**：
  - **R8a 合并前**：`typecheck`、`lint`、CI-02 预检通过；PR CI（`ci.yml`）绿。
  - **R8b 合并后检查（不作合并门）**：合并后第一次覆盖该合并提交的 main Full 须绿；失败时报协调者，按 D456 暂停后续合并。
- **R9 可读性一节**：PR 正文按下文“可读性”一节逐条说明。

### 测试命令（S22 回顾行动 4）

- 本机全量 web 测试一律用 `npx vitest run --project web`。PR 正文附汇总行原文，base 与 head 各一次。
- 有失败时，逐个列出失败的文件与用例，并附只对这些文件的串行重跑原文：`npx vitest run --project web --no-file-parallelism <失败文件…>`。
  - 不得更换并发参数而不说明；
  - 串行重跑仍失败的，按真实失败处理。

## 性能考虑

- 渲染次数不变：组件边界与 `key` 不变（决定 3），不加 `memo`，不改 Hook 与依赖（决定 2）。
- 类别筛选改为调用同一函数，每行的判定次数不变。
- 请求次数与时机不变（R4 直接断言 1、2、5、6、8、9、10、11、12）。
- 不跑 Bench。打包变化由 R7 约束。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥：

- **②**：4 个超长函数（240 / 218 / 209 / 86）都拆到 ≤ 80 行（R6a）。拆后：
  - `CompanyReports` 只做“取期间 → 解析与校验 URL → 筛选栏 → 提示条 → 选择报表、快照或网格”；
  - `FinancialReport` 只做“取报表 → 对账表，或 KPI、类别表与科目表”；
  - `LedgerGrid` 只做“取明细 → 筛选表单、提示、合计、明细表与加载更多”。
- **③**：`LedgerReports.tsx` 从 877 行降到 ≤ 150 行，新文件各 ≤ 200 行（R6）。PR 正文贴 `git diff --numstat`。
- **①**：文件与组件名表达职责，例如“报表筛选栏”“对账表”“类别表”“科目表”“明细筛选”“明细合计”“快照”。不用 `part1`、`helpers2` 这类名字。
- **④**：
  - 查询与 URL 解析留在带 Hook 的组件或其自定义 Hook 中，展示组件只接收值与回调；
  - 明细查询键与筛选（`ledgerFilters`、`ledgerKey`、`useLedgerConflict`）集中在一个文件。
- **⑤**：
  - 报表类别筛选去重（决定 4、R6b）；
  - 三类游标编码不同，不合并（决定 5）；
  - `LedgerSnapshot` 与 `LedgerGrid` 中的冲突提示条可以抽成同一个展示组件。它与 `ErrorBox` 内的附加说明不是同一段 DOM，不合并。
- **⑥**：不新增注释，除非某处拆分需要说明“为什么”。例如，网格挂载后为何仍会重取一次，或“报表方向”列为何在结账后改用 `adjusted`。不留调试输出。
- **测试耗时**：本任务不改测试；R4 驱动不提交。PR 正文附 `ledger-reports.test.tsx` 在 base 与 head 上的耗时（vitest 汇总行原文）；两侧差异 > 20% 时说明原因。

## 用户可见变化

- 无。以下都不变（R3、R4）：
  - 总账报表的公司、期间、视图、阶段选择，URL 校验与重新加载；
  - KPI、类别表、科目表与对账表；
  - 下钻链接与快照钉；
  - 总账明细的筛选、分页、合计与来源链接；
  - 冲突锁定与刷新；
  - 中英文文本与教学提示。

## 证据要求

- **不需要浏览器时段**：
  - 行为等价由 R3 与 R4 证明，R4 包括 DOM 逐字节比较，以及请求、URL、查询失效与冲突锁定的直接断言；
  - 真实 Chrome 场景不进入总账报表页；
  - R4 与构建在本机运行，须服从协调者的时段静默通知（D442 / D480）。
- **可行性**（S13 回顾行动 4）：
  - 设计角色在 `c7bc920` 上用临时 jsdom 脚本（驱动 B 的写法）跑通了 R4 直接断言 1–12 的全部场景。脚本已删除，未提交。
  - 注意事项：
    - 明细桩的维度代码须匹配 `^[A-Z][A-Z0-9_]{0,31}$`，否则 `ledgerSchema` 校验失败、网格不出现；
    - 期间分页的 `nextCursor` 须是合法月份；
    - 409 场景：先让明细桩返回 409，观察提示与锁定；再把桩切换为 200；最后点“刷新为最新账簿”（同直接断言 8）。
    - 期间桩的每项须含 `month`、`status`、`revision`（`periodSchema` 为严格对象，多出 `company` 字段即校验失败）。
    - 直接断言 11 中类别表与科目表各有多个文本为 `130.00` 的链接，点击类别时按 `table[aria-label="报表类别"] a[href*="group=cash"]` 选取。
  - R6a、R6b 与 R7 的 base 数字见“现状”与上表，由设计角色实测。
- PR 正文附：
  - R2 的导出比较与 `git grep` 结果；
  - R3 汇总行；
  - R4：驱动（原件 base64 或两种 SHA-256）、步骤清单、比较结果、直接断言结果，以及直接断言 5–8 的逐步输出；
  - R5a–R5d 各表；
  - R6 行数表（base 与 head 两列）；
  - R7：`bundle-measure.mjs` 的完整输出与退出码；
  - 可读性一节；
  - 疑似缺陷登记：至少写明“只有值、没有维度时表单写出无效 URL”这一处是否保留，以及理由。

  R8b 在合并后补到 PR 评论。

## 设计自查

- [x] 本批只有这一项页面拆分；冲突域与在途 REFAC-30、REFAC-31、REFAC-32 逐文件不相交。
- [x] 每条 base 失败、head 通过的检查都有 base 实测值；R7 的 base 字节已实测。
- [x] URL 校验、默认期间、视图与阶段切换、下钻链接、钉值不符、快照转网格、游标、表单提交、409 冲突与恢复、期间分页、报表页刷新、资产负债表（混合类别）与对账表（两种徽标）都有 base 实测过的直接断言。
- [x] 可读性一节齐全；无用户可见变化。
- [x] 不加迁移，不碰 `scripts/slot/`、`scripts/measure/`。
