# REFAC-35：拆分报表页 `Reports.tsx`（不改行为）

- Sprint：S30（[计划](S30.md)）
- 类型：重构（Web 页面拆分）
- 优先级：P2
- 决定：[D612](S30.md#s30-期间决定)。REFAC-35 不改行为，只改代码组织，详见“范围与决定”1–9。
- 建议分支：`refac-35-split-reports-page`
- 来源：S30 [D609](S30.md#s30-期间决定)；验收基线见 [S30.md:50](S30.md#范围与验收) 与[三项 REFAC 共用：可读性与嵌套复验](S30.md#三项-refac-共用可读性与嵌套复验)（`S30.md:54–66`），本任务书只细化、不放宽。
- 模板：[REFAC-33](REFAC-33-ledger-reports-page-split.md)。沿用其中的做法：Hook 序列逐项相同，展示组件不调用 Hook，DOM 含属性顺序逐字节相同，请求做直接断言，驱动原件给 base64 或两种哈希。
- 迁移：**不加**。
- 浏览器时段：**不需要**，理由见“证据要求”。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 为什么是它

- S30 选题依据（D609）在 `bae5d59` 上用 `fnlen.cjs` 实测，`Reports.tsx` 中 `Ledger` 200、`Reports` 189、`Trial` 131 行，都超过 ② 的 80 行（`S30.md:60`）。`4d296bf` 相对 `bae5d59` 只改了 `design/`：`git diff --quiet bae5d59 4d296bf -- packages` 退出码为 0，所以下文源码事实在两个提交上相同。
- 选它的理由：
  - **一个文件 3 个超长函数**：合计 520 行，文件 623 行。一次拆完。
  - **不在首屏**：`Reports.tsx` 的引用方只有 `App.tsx:56`、`App.tsx:58` 两处懒加载（枚举命令见“现状”）。
  - **已有整页测试**：`packages/web/test/reports.test.tsx` 共 32 个用例，经 `App` 整页渲染覆盖默认期间、下钻、URL 校验、取消旧请求、加载更多、409 与重新加载（见“现状·测试”）。
  - **没有焦点代码**：`Reports.tsx` 中没有 `.focus(` 与 `autoFocus`（枚举命令见“现状”），焦点等价只需证明“两侧都没有焦点调用”。
- 冲突域与 S30 其余三项（REFAC-36、REFAC-37、KDOC-14）逐文件不相交，详见“冲突域”。

## 现状（main `4d296bf`）

下文 `file:line` 都按 `4d296bf`（#464，S30 计划的合并提交）。`Reports.tsx` 最后一次改动是 `65d1041`（#68，UI-07a，2026-11-19）。

- `packages/web/src/Reports.tsx` 共 **623** 行（`git grep -c "" 4d296bf -- packages/web/src/Reports.tsx`）。导出只有 `Reports`（`:96`）与 `ReportIndex`（`:620`）：`git grep -n -E "^export " 4d296bf -- packages/web/src/Reports.tsx` 只输出这两行。
- 引用方：`git grep -n -E "\./Reports\.tsx|/Reports\.tsx|src/Reports" 4d296bf -- packages` 只输出 `App.tsx:56`（`lazy` 导入 `Reports`）与 `App.tsx:58`（`lazy` 导入 `ReportIndex`，所在声明为 `:57–59`）。路由：`/reports` → `ReportIndex`（`App.tsx:361–368`），`/reports/*` → `Reports`（`App.tsx:369–376`）。
- 导入（`:1–25`）：
  - `react`：`useEffect`、`useRef`、`useState`（`:1`）；
  - `@tanstack/react-query`：`useInfiniteQuery`、`useQuery`、`useQueryClient`、类型 `InfiniteData`（`:2–7`）；
  - `react-router-dom`：`Link`、`Navigate`、`useLocation`、`useMatch`、`useSearchParams`（`:8`）；
  - `@erp/core/contracts`：`legacyTrialStages`，类型 `LegacyLedgerResponse`、`LegacyTrialStage`（`:9–13`）；
  - `./ui/components/index.tsx`：`MessageBar`、`PageHeader`、`TeachingTip`（`:14`）；`./ui/index.ts`：`label` 与类型 `LabelKey`、`Language`、`Preferences`（`:15`）；`./pages/ledger.css`（`:16`）；
  - `./reports-data.ts`：`formatMinor`、`parseContext`、`parseLedgerPage`、`parseTrial`、`readReport`、`ReportFailure`、类型 `ReportScope`（`:17–25`）。
- 模块级定义：
  - 类型 `SimpleLabel`（`:27`）、`Translate`（`:28`）；常量 `pageLimit = "100"`（`:29`）、`errorLabels`（`:32–41`）；
  - 函数：`isConflict`（`:30–31`）、`failureLabel`（`:42–48`）；
  - 组件：`Failure`（`:49–75`）、`Alert`（`:76–86`）、`ScrollTable`（`:87–94`，含 `biome-ignore` 注释 `:89` 与 `role="region"`、`tabIndex={0}` 的 `div` `:90`）、`Reports`（`:96–285`）、`Trial`（`:287–417`）、`Ledger`（`:419–618`）、`ReportIndex`（`:620–623`）。
- 按 [S30 统一量法](S30.md#s30-统一量法)（`node <保存位置>\s30-measure.cjs 4d296bf packages/web/src/Reports.tsx`）在 `4d296bf` 上的完整输出如下（设计角色实测；列依次为行数、最深层数、位置、函数名）。改前值：`Reports` 189 / 3、`Trial` 131 / 2、`Ledger` 200 / 2。开发在 PR 正文贴 base 上的重跑输出，与此不同时须说明：

  ```text
  2	0	packages/web/src/Reports.tsx:30-31	isConflict
  7	1	packages/web/src/Reports.tsx:42-48	failureLabel
  27	0	packages/web/src/Reports.tsx:49-75	Failure
  11	0	packages/web/src/Reports.tsx:76-86	Alert
  7	0	packages/web/src/Reports.tsx:87-94	ScrollTable
  189	3	packages/web/src/Reports.tsx:96-285	Reports
  1	0	packages/web/src/Reports.tsx:104-104	t
  1	0	packages/web/src/Reports.tsx:107-107	queryFn
  9	1	packages/web/src/Reports.tsx:131-139	reload
  131	2	packages/web/src/Reports.tsx:287-417	Trial
  9	1	packages/web/src/Reports.tsx:306-314	queryFn
  200	2	packages/web/src/Reports.tsx:419-618	Ledger
  17	1	packages/web/src/Reports.tsx:445-461	queryFn
  1	0	packages/web/src/Reports.tsx:462-462	getNextPageParam
  9	1	packages/web/src/Reports.tsx:464-472	more
  4	0	packages/web/src/Reports.tsx:620-623	ReportIndex
  ```

  行数与 `fnlen.cjs` 在 `bae5d59` 上的结果（`S30.md:60`）一致。`Reports` 的 3 层来自 `#report-period` 的 `onChange` 回调（`:205`，第 1 层）→ `if`（`:207`，第 2 层）→ `legacyTrialStages.some` 回调（`:211`，第 3 层）。
- **组件边界与 `key`**（决定 3 的依据）：
  - `Trial` 的 `key` 为 `` `${source.snapshotSha256}:${month}` ``（`:256`）；`Ledger` 的 `key` 为 `` `${source.snapshotSha256}:${month}:${account}` ``（`:271`）。换快照、期间或科目时整棵子树重新挂载。
  - `Ledger` 只在 `ledgerRoute && account && /^[1-9][0-9]{3}$/u.test(account)` 时渲染（`:269`），否则显示 `reports.routeMissing`（`:280–281`）。
- **Hook 调用序列**（base，按源码顺序；R5a 以此为准）：
  - `Reports`（8 项）：
    1. `useQueryClient()`（`:97`）
    2. `useState(0)`（`generation`，`:98`）
    3. `useState(false)`（`reloading`，`:99`）
    4. `useSearchParams()`（`:100`）
    5. `useMatch("/reports/trial")`（`:101`）
    6. `useMatch("/reports/ledger/:account")`（`:102`）
    7. `useQuery`（`:105–109`）：键 `["legacy", "context", generation]`，`readReport("/api/v1/legacy/context", …)`，`enabled: !reloading`
    8. `useEffect`（`:124–129`），依赖 `[source, month, stage, invalid, params, setParams, reloading]`；缺参数时以 `replace` 写入 `{ source, month, stage }`（`:127`）
  - `Trial`（1 项）：`useQuery`（`:304–315`），键 `["legacy", "trial", sha, month]`，URL `/api/v1/legacy/trial?snapshot=…&month=…`。
  - `Ledger`（3 项）：`useQueryClient()`（`:432`）、`useRef(false)`（`lock`，`:433`）、`useInfiniteQuery`（`:442–463`）。`queryFn` 先读缓存页（`:446–450`），URL 参数顺序为 `snapshot`、`month`、`account`、`limit`（`:451–456`），有游标时再 `set("cursor", …)`（`:457`）。
  - `ReportIndex`（1 项）：`useLocation()`（`:621`）。
- **派生值的求值位置**（都在组件体内，每次渲染求值）：
  - `Reports`：`language`、`t`（`:103–104`，在第 6、7 个 Hook 之间）；`source`、`periods`、`selectedSource`、`month`、`stage`、`invalid`（`:110–123`，在第 7、8 个 Hook 之间）；`reload`（`:131–139`）；早返回（`:140–185`）之后的 `search`（`:186–190`，键顺序 `source`、`month`、`stage`）、`scope`（`:191`）、`account`（`:192`）。
  - `Trial`：`data`（`:316`）。
  - `Ledger`：`key`（`:434–441`，在 `useRef` 与 `useInfiniteQuery` 之间）；`more`（`:464–472`）、`first`、`entries`、`kinds`（`:473–480`）。
- **`reload` 流程**（`:131–139`）：`reloading` 为真时直接返回；否则 `setReloading(true)` → `await client.cancelQueries({ queryKey: ["legacy"] })`（`:134`）→ `client.removeQueries({ queryKey: ["legacy"] })`（`:135`）→ `setParams({}, { replace: true })`（`:136`）→ `generation + 1`（`:137`）→ `setReloading(false)`（`:138`）。
- **URL 写入方式**：自动补参用 `replace`（`:127`）；切换期间（`:208–212`）与切换阶段（`onStage`，`:262–264`）调用 `setParams` 时不带 `replace`。
- **重复**（S30 ④ 要求任务书列出；去向见决定 4 与“可读性·重复”）：
  - 加载状态段落 `<p className="ledger-meta" role="status">{t("reports.loading")}</p>` 写了 **3** 处：`:142–144`、`:339–341`、`:493–495`。
  - 把 `reload` 包成 `() => { void reload(); }` 的回调写了 **4** 处：`:180–182`、`:242–244`、`:265–267`、`:276–278`。
  - “阶段是否合法”判定写了 **3** 处：`:123`（`!legacyTrialStages.some((value) => value === stage)`）、`:211`（同一判定，用于回退到 `adjusted`）、`:326`（`legacyTrialStages.find((value) => value === event.target.value)`）。
  - “期间是否存在”判定 `periods.some((period) => period.month === …)` 写了 2 处：`:122`、`:207`。
  - `<Failure … retry={() => { void query.refetch(); }} reload={reload} />` 写了 2 处：`:343–349`、`:497–503`；`Reports` 中另有 `void context.refetch()`（`:165`、`:178`）；`Ledger` 中 `void more()` 2 处（`:590`、`:609`）。
  - 表头按字段给金额列加 `num` 类：`:372–380`、`:543–553`，各自的字段集不同。
  - 金额单元格 `formatMinor(…, language)`：`:395`、`:396`、`:405`、`:406`、`:513`、`:576`、`:577`、`:578`。格式化规则本身只在 `reports-data.ts` 的 `formatMinor` 中。
- **焦点**：
  - `git grep -n -E "\.focus\(|autoFocus" 4d296bf -- packages/web/src/Reports.tsx packages/web/src/ui packages/web/src/reports-data.ts` 无输出（退出码 1）。
  - 键盘可达性来自 `ScrollTable` 的 `tabIndex={0}`（`:90`），用于 `:365`（`Trial`）与 `:521`（`Ledger`）两处。
- **测试**：
  - `packages/web/test/reports.test.tsx` 共 716 行，22 处 `it` / `it.each`，展开为 32 个用例。设计角色在 `packages/` 与 `4d296bf` 相同的工作树上运行 `npx vitest run --project web packages/web/test/reports.test.tsx`：`Tests 32 passed (32)`，`Duration 9.50s`。其中页面用例都经 `App` 整页渲染，用 `installFetch`（`:82–97`）按路径分派 `fetch`，夹具见 `:14–67`（`snapshotSha256` 为 64 个 `a`；期间 `2025-01` closed、`2025-02` open；科目 `1100 原始 Cash`；明细首页 `nextCursor: "next_1"`）。
  - 与本任务直接相关的用例：未配置快照与重试的请求序列（`:98–150`，序列断言 `:143–148`）；默认期间与 `adjusted`（`:303–320`）；下钻时明细请求不带 `stage`（`:321–362`，`:335`）；非末期期间回到试算（`:363–399`）；错误参数（`:400–415`、`:468–480`）；不自动重试（`:416–467`）；空期间（`:481–487`）；`ReportIndex` 重定向保留错误参数（`:488–495`）；切换期间取消旧请求（`:496–529`）；加载更多串行化与不完整提示（`:530–556`，连点两次只发 2 个明细请求，`:541–544`）；切换期间清除游标（`:557–591`）；换快照（`:592–603`）；偏好保存失败与重挂载（`:604–642`）；安全错误文本（`:643–684`）；409 与重新加载（`:685–718`）。
  - `App.test.tsx:373`、`:391` 断言导航标签 `reports.group` / `reports.trial`。
  - 真实 Chrome 的 e2e 不进入报表页：`git grep -n -E 'report-period|trial-stage|snapshot-identity|#/reports|reports/ledger/' 4d296bf -- packages/infra/test packages/core scripts` 无输出（退出码 1）。`packages/infra/test` 中出现的 `/api/v1/legacy/*`、`reports/trial` 都是服务端 HTTP 测试或 `legacy-import-bench.mjs:268` 的服务端请求，不经过本页面。

### chunk 归属与首屏（S22 回顾行动 3）

| 文件 | 落在哪个 chunk | 依据 |
| --- | --- | --- |
| `Reports.tsx`（改） | 路由入口 chunk `src/Reports.tsx` | 只被 `App.tsx:56`、`:58` 懒加载 |
| `reports/` 下的新文件（新增） | 同上 | 只允许被 `Reports.tsx` 或本任务的新文件导入（决定 8） |
| 首屏 | **本任务不改任何首屏文件** | `ui/*`、`ui/components`、`reports-data.ts` 只导入，不改（决定 9） |
| CSS | 不改 | `pages/ledger.css` 也被 `LedgerReports.tsx:12` 导入，不改 |

base 数字：**设计角色未在 `4d296bf` 上实测**（取证会在共享仓库建 worktree，本次写任务书时不做）。历史参照：`docs/demo/v0.21.0/logs/bundle-measure-sprint.out.log`（base `a1a1244` / head `3ae4848`）中 route `src/Reports.tsx` 为 24521 / 8744（原始 / gzip，`:374`），chunk `src/Reports.tsx` 为 11748 / 3622（`:400`），CSS 闭包为 `components.css`、`index.css`、`ledger.css`（`:354`）。此后 `reports-data.ts` 有改动（`961c278`，不是 `3ae4848` 的祖先），`4d296bf` 上的数字可能不同。开发在动手前先跑 R7 命令（`--base` 与 `--head` 都取实际合并基），把 base 数字贴进 PR 正文。

## 范围与决定

1. **不改行为**（D612）。以下全部不变：
   - DOM：结构、类名、文本，属性及其**先后顺序**（含 `id="report-period"`、`id="trial-stage"`、`htmlFor`、`className`、`type`、`disabled`、`value`、`role`、`tone`、`aria-label`、`aria-hidden`、`tabIndex`、`scope`、`colSpan`、`href`）；
   - 请求：URL（含参数顺序、游标参数）、发出顺序与次数、`signal` 传递与取消；
   - 查询：查询键（含前缀 `"legacy"`）、`enabled`、`initialPageParam`、`getNextPageParam`；`App.tsx:68–80` 的默认选项不动；
   - `cancelQueries` / `removeQueries` 的调用顺序与键（`["legacy"]`）；
   - URL 参数：`invalid` 的全部条件、自动补参用 `replace`、切换期间与阶段不用 `replace`、`search` 的键顺序、科目号正则 `/^[1-9][0-9]{3}$/u`；`ReportIndex` 的重定向（保留 `search`，`replace`）；
   - 加载更多的守卫（`lock`、`isFetching`、`hasNextPage`）与 `cancelRefetch: false`；
   - 焦点与键盘行为（两侧都没有程序化焦点调用；`ScrollTable` 的 `role`、`aria-label`、`tabIndex` 不变）；中英文文本与教学提示；
   - chunk 归属：不新增 chunk，不改首屏闭包（R7）。

   本任务只改代码组织，不修 bug。拆分时发现的疑似缺陷登记在 PR 正文，留作后续任务。
2. **Hook 顺序不变**：
   - 每个现有组件的 Hook 可以留在原组件里，也可以放进它在顶层无条件调用的自定义 Hook；
   - 展开自定义 Hook 后，每个组件的 Hook 调用序列与“现状”所列逐项相同（8 + 1 + 3 + 1 项）：种类、先后、参数与依赖的源文本都相同，只归一空白（R5a）；
   - 派生值可以随 Hook 搬进自定义 Hook，但不得改变它与相邻 Hook 的先后。例如 `Reports` 中 `t` 先于 `useQuery`，`invalid` 先于 `useEffect`；`Ledger` 中 `key` 先于 `useInfiniteQuery`；
   - **新抽出的展示组件不得调用任何 Hook**；不新增 `useCallback`、`useMemo`、`useEffect`、`memo`；
   - 本任务**没有豁免**。
3. **组件边界不变**：
   - `Reports`、`Trial`、`Ledger`、`ReportIndex` 这 4 个带 Hook 的组件仍是独立的 React 组件。不得把其中一个内联进父组件，也不得把两个合并；
   - 父组件渲染 `Trial`、`Ledger` 时的 `key` 与 props 原样保留（R5c；`reload` 属性的值按决定 4 改为同一个包装函数）；
   - `Failure`、`Alert`、`ScrollTable` 仍是独立组件，props 不变；
   - 新抽出的展示组件只替换原 JSX 中的一段，只渲染该段原来渲染的内容。条件渲染的条件留在父级原位置，或留在被抽出组件内与原来相同的位置。
4. **去重**（S30 ④，R6b）：
   - **加载状态段落**（3 处）抽成一个展示组件，三处渲染的 DOM 不变；
   - **`reload` 包装回调**（4 处）改为 `Reports` 中的一个具名函数，`Failure` 的 `reload` 与 `Trial`、`Ledger` 的 `reload` 都传它。须在第一个用到它的早返回（`:172`）之前定义；它不是 Hook，不进 R5a 序列；
   - **阶段合法性**（3 处）改为调用同一个判定函数（类型守卫，判定 `legacyTrialStages` 中是否有与之相等的值）。`:123` 的取反、`:211` 的回退到 `"adjusted"`、`:326` 的“合法才调用 `onStage`”这三处语义不变；
   - 其余重复（“现状·重复”中的期间判定、`Failure` 重试、表头 `num` 类、金额单元格）可以不合并；合并时须保持实参与 DOM 不变，并在 PR 正文写明去向。
5. **查询不合并**：上下文、试算、明细 3 个查询的选项对象原样搬移（R5c）；明细的缓存读取、游标与 `parseLedgerPage` 调用不抽成与试算共用的工厂。
6. **模块级定义**：`SimpleLabel`、`Translate`、`pageLimit`、`isConflict`、`errorLabels`、`failureLabel`、`Failure`、`Alert`、`ScrollTable` 可以搬进新文件供各文件共用，定义的源文本不变（`ScrollTable` 连同 `:89` 的 `biome-ignore` 注释一起搬）。
7. **快照身份留在 `Reports.tsx`**：`pages/ledger.css:46` 的注释写着“报表页快照身份（Reports.tsx details.snapshot-identity）”，而 CSS 不在本任务冲突域。`<details className="snapshot-identity">`（`:228–231`）留在 `Reports.tsx` 中，以免该注释失真。
8. **文件**：
   - 新文件放进新目录 `packages/web/src/reports/`，按职责命名，例如 `report-failure.tsx`（`Failure`、`Alert`、`failureLabel`）、`report-period-select.tsx`、`snapshot-unconfigured.tsx`、`trial-report.tsx`、`trial-table.tsx`、`legacy-ledger.tsx`、`ledger-entries-table.tsx`、`trial-stage.ts`。粒度由开发定，写入 PR 正文；
   - 新文件只被 `Reports.tsx` 或本任务的新文件导入；
   - `Reports` 与 `ReportIndex` 留在 `Reports.tsx`，仍是该文件仅有的两个导出，名称与 props 类型不变；`App.tsx` 的两处懒加载导入不变。
9. **不改**：
   - `App.tsx` 与路由表；`LedgerReports.tsx` 与 `ledger-reports/**`；`reports-data.ts`；`ui/**`（含标签资源与教学文案）；CSS（含 `pages/ledger.css`）；契约（`@erp/core/contracts`）；
   - `packages/web/test/**`（含 `setup.ts`）、`packages/infra/**`、`packages/core/**`；
   - `scripts/**`（含 `scripts/slot/`、`scripts/measure/`）、`scripts/test-shard-weights.json`、`package.json` / lock、`vitest.config.ts`。

## 冲突域

- web-ui:reports（`S30.md:50`）：只改 `packages/web/src/Reports.tsx`，并在新目录 `packages/web/src/reports/` 下新增文件（决定 8）。该目录在 `4d296bf` 上不存在（`git ls-tree -d --name-only 4d296bf packages/web/src/` 的输出中没有 `reports`）。
- 取证所需的观测点和新增测试文件：无。R4 驱动不提交。
- 受影响的 e2e 断言（S13 回顾行动 1）：无，枚举命令见“现状·测试”。**须随本任务改**：无。
- 受影响的文档引用（D460）：
  - `git grep -n -F "web/src/Reports.tsx" 4d296bf -- docs README.md` 无输出（`S30.md:181`）；
  - `git grep -n -E "(^|[^A-Za-z])Reports\.tsx" 4d296bf -- design docs` 命中 36 行，分布在 `design/decisions.md`、`design/tasks/` 下的历史任务书与计划，以及 `docs/demo/v0.11.0`、`v0.19.0`、`v0.20.0`、`v0.21.0` 的日志中，都是当时提交上的事实记录。文件名不变，不改；
  - `pages/ledger.css:46` 的注释按决定 7 保持成立。
- 与 S30 其余项不相交（`S30.md:49–52`）：
  - KDOC-14 只改 `docs/flows/invoice-detail-flow.md`；
  - REFAC-36 只改 `packages/infra/src/storage/master-data.ts` 与同目录新增的 `master-data-*.ts`；
  - REFAC-37 只改 `packages/core/src/domain/dimensions.ts` 与同目录新增的 `dimension-*.ts`。

  四者没有共享文件。本任务只跑 `web` 项目，REFAC-36 跑 `infra` / `infra-isolated`，REFAC-37 跑 `core`（`S30.md:214`）。本任务是 S30 中仅有的页面拆分（`S30.md:211`）。

## 验收

### base 失败、head 通过

| 编号 | 检查 | base `4d296bf` | head 要求 |
| --- | --- | --- | --- |
| R6a | 按“可读性·量法”运行 `s30-measure.cjs`（base 与 head 两条命令）；取第 1 列（行数） | `Ledger` / `Reports` / `Trial` 为 **200 / 189 / 131**（失败） | 输出中每一行第 1 列都 ≤ 80 |
| R6b | 在 `Reports.tsx` 与 `reports/` 下全部文件的拼接文本上，分别统计 `/t\("reports\.loading"\)/g`、`/void reload\(\);/g`、`/legacyTrialStages\.(?:some\|find)\(/g` 的命中数（下方命令） | **3 / 4 / 3**（失败） | **1 / 1 / 1**（决定 4）。PR 正文附 base 与 head 两侧的命令与输出原文 |

R6b 计数命令（在仓库根运行；base 上 `reports/` 不存在时跳过）：

```text
node -e "const fs=require('node:fs'),path=require('node:path');const fl=[];const w=p=>{if(!fs.existsSync(p))return;if(fs.statSync(p).isDirectory())fs.readdirSync(p).sort().forEach(e=>w(path.join(p,e)));else fl.push(p)};['packages/web/src/Reports.tsx','packages/web/src/reports'].forEach(w);const s=fl.map(f=>fs.readFileSync(f,'utf8')).join('\n');for(const [k,r] of [['loading',/t\(\"reports\.loading\"\)/g],['reload',/void reload\(\);/g],['stage',/legacyTrialStages\.(?:some|find)\(/g]])console.log(k,(s.match(r)||[]).length)"
```

设计角色在 `4d296bf` 上的输出为 `loading 3`、`reload 4`、`stage 3`。PowerShell 下引号转义不同，可把同一段脚本存为临时文件后运行，PR 正文写明实际用法。

### 两侧都须成立的不变量

- **R1 范围**：
  - `git diff --name-only <base>...<head>` 只含 `packages/web/src/Reports.tsx` 与 `packages/web/src/reports/` 下的**新**文件（`S30.md:189`）；
  - 决定 9 所列文件的 diff 为空；
  - 不加迁移。
- **R2 导出不变**：
  - `Reports.tsx` 的导出集合与 base 相同：`Reports`、`ReportIndex` 两个，类型都为 function；`Reports` 的 props 类型源文本相同，只归一空白。用仓库根 devDependency `@babel/parser`（`package.json:37`，7.29.13；插件 `typescript`、`jsx`）解析，口径同 REFAC-33 R2；
  - 新文件的导出只在 `Reports.tsx` 与 `reports/` 内使用，PR 正文附 `git grep` 结果。
- **R3 既有测试原样通过**：
  - `reports.test.tsx` 的 32 个用例、`App.test.tsx` 与 Web 全部 jsdom 测试通过；
  - 测试文件 diff 为空；
  - 本机全量命令见“测试命令”。
- **R4 DOM、请求、URL、焦点等价**（送审证据；驱动不提交，不加常驻 CI 用例）：
  - **两个驱动**都是临时 jsdom 脚本，在 base 与 head 上按同一序列操作。
  - `fetch` 桩按路径分派，借用 `reports.test.tsx:82–97` `installFetch` 的写法与 `:14–67` 的夹具，但改为**受控响应**：
    - `/api/v1/legacy/context`：默认返回夹具；可切换为 503 `UNAVAILABLE` 信封（同 `:104–114`）、空期间（同 `:483`），或换成 64 个 `b` 的快照（同 `:692–695`）；
    - `/api/v1/legacy/trial`：默认返回 `trial(month)`；可返回 409 `CONFLICT` 信封（同 `:698–708`）；
    - `/api/v1/legacy/ledger`：首页带 `nextCursor: "next_1"`，第二页不带；可让第二页挂起或失败（同 `:530–556`）。
  - 桩记录每次请求的序号、方法、URL（`pathname + search`）与 `signal.aborted` 的最终值。`QueryClient.prototype.cancelQueries` 与 `removeQueries` 用委托包装，记录序号与 `queryKey`，保留原实现。
  - 两个驱动的渲染方式：
    - **驱动 A（整页）**：渲染 `App`，按 `reports.test.tsx` 的整页路径操作（经导航进入试算、下钻明细、返回）。
    - **驱动 B（直接渲染导出组件）**：在 `QueryClientProvider` 与 `HashRouter` 内用 `<Routes>` 挂 `/reports` → `ReportIndex`、`/reports/*` → `Reports`（同 `App.tsx:361–376`）。`QueryClient` 的默认选项与 `App.tsx:68–80` 相同；`preferences` 由驱动控制（zh / en、教学开 / 关）；起始 URL 由 `window.history.replaceState` 给定。
  - **记录规则**：同 [REFAC-28 R4](REFAC-28-close-wizard-split.md#两侧都须成立的不变量)。
    - 被记录的函数一律用委托包装对象或函数，不用 `Proxy`；
    - 调用时分配递增序号并立即写入记录；
    - 参数经确定性编码；
    - 驱动须带 REFAC-17 的自测（a）–（c），任一失败即 R4 失败。
  - **焦点**：`HTMLElement.prototype.focus` 装记录桩，保留原实现，记下每次调用的目标；每步另记 `document.activeElement` 的标签名、`id` 与 `aria-label`。
  - **序列**：至少覆盖下面直接断言 1–11 的全部场景（驱动 B）。驱动 A 另跑 zh / en 各一遍、教学模式开与关各一遍。
  - **每步采样**：
    - `document.body.innerHTML`；
    - `window.location.hash` 与 `window.history.length`（区分 `replace` 与 push）；
    - 累计请求日志；
    - `cancelQueries` / `removeQueries` 记录；
    - `#report-period`、`#trial-stage` 的 `value` 与 `disabled`，以及“加载更多”按钮的 `disabled` 与文本；
    - 焦点调用记录与 `activeElement`；
    - `console.error` 调用记录。
  - **判定**：base 与 head 逐步、逐项、逐字节相同。并且要**直接断言**；只比两侧相同不够。下列各条的预期值由设计角色从 `4d296bf` 源码与既有测试推出，**未用驱动在 base 上实测**（见“证据要求·可行性”）。开发须先在 base 上跑通全部直接断言；任一条在 base 上不成立时，先停下并向协调者与设计角色报告，不得改断言迁就、不得把“两侧相同”当作通过，也不得改产品代码。除另有说明外，夹具同 `reports.test.tsx:14–67`，语言 zh，`<sha>` 为 64 个 `a`。
    1. **默认期间与自动补参**：起始 `#/reports/trial`。
       - 请求依次为 `/api/v1/legacy/context`、`/api/v1/legacy/trial?snapshot=<sha>&month=2025-02`（参照 `:143–146`）；
       - hash 为 `#/reports/trial?source=<sha>&month=2025-02&stage=adjusted`，`history.length` 与起始时相同（`replace`，`:127`）；
       - `#report-period` 值为 `2025-02`，`#trial-stage` 值为 `adjusted`（参照 `:310–315`）。
    2. **下钻链接与阶段切换**：接 1。
       - `1100` 行链接 `href` 为 `#/reports/ledger/1100?source=<sha>&month=2025-02&stage=adjusted`（`:388`，键顺序 `:186–190`）；
       - 在 `#trial-stage` 选 `postClosing`：hash 末尾变为 `stage=postClosing`，`history.length` 加 1；不追加请求（试算查询键不含阶段，`:305`）；链接 `href` 随之变为 `…&stage=postClosing`。
    3. **切换期间**：接 2，在 `#report-period` 选 `2025-01`。
       - hash 为 `#/reports/trial?source=<sha>&month=2025-01&stage=postClosing`，`history.length` 加 1（`:208–212`）；
       - 追加 1 个 GET：`/api/v1/legacy/trial?snapshot=<sha>&month=2025-01`。
    4. **明细与返回**：起始 `#/reports/ledger/1100?source=<sha>&month=2025-02&stage=postClosing`。
       - 明细 GET 为 `/api/v1/legacy/ledger?snapshot=<sha>&month=2025-02&account=1100&limit=100`，不带 `stage`（参照 `:335`）；
       - “返回”链接 `href` 为 `#/reports/trial?source=<sha>&month=2025-02&stage=postClosing`（`:487`）；
       - KPI 区 `.kpis .kpi` 恰好 5 个，最后一个为 `reports.totalEntries`；状态段落为 `reports.partial`（`:599`）。
    5. **加载更多与串行化**：接 4。连点两次“加载更多”。
       - 只追加 1 个 GET：`…&account=1100&limit=100&cursor=next_1`（参照 `:541–544`）；
       - 第二页返回后，按钮不再渲染，状态段落为 `reports.complete`。
       另起一遍，让第二页失败：出现 `reports.incomplete`（`MessageBar tone="warning"`）与带“重试”按钮的 `role="alert"`；点“重试”只追加 1 个带 `cursor=next_1` 的 GET（参照 `:549–555`）。
    6. **URL 非法与重新加载**：起始 `#/reports/trial?source=bad`。
       - 出现 `reports.invalidSelection`，其最近的带 `role` 祖先为 `role="alert"`，提示条内有“重新加载快照”按钮；`#report-period` 值为 `""`；只发出 1 个 GET（`context`）（参照 `:468–480`）。
       - 点该按钮后：`cancelQueries` 恰好 1 次、随后 `removeQueries` 恰好 1 次，键都为 `["legacy"]`；hash 先变为 `#/reports/trial`（`replace`），最终为 `#/reports/trial?source=<sha>&month=2025-02&stage=adjusted`；追加 GET 依次为 `context`、`trial?snapshot=<sha>&month=2025-02`。
       - 另两种起始 URL 也出现同一提示，且只发出 1 个 GET：`#/reports/trial?month=2025-13`、`#/reports/trial?month=2025-01&month=2025-02`。
    7. **未配置快照**：`context` 返回 503 `UNAVAILABLE`。
       - 出现 `MessageBar`（`tone="info"`、`role="status"`）文本 `reports.unconfigured`，没有 `role="alert"`；链接 `href` 为 `#/ledger-reports`；
       - 点 `reports.reload` 按钮后追加 1 个 `context` GET（参照 `:136–146`）；`cancelQueries` / `removeQueries` 无记录（该按钮调 `context.refetch`，`:165`）。
    8. **409 冲突**：`trial` 返回 409 `CONFLICT`。
       - 出现 `reports.conflict` 的 `role="alert"`，按钮文本为 `reports.reload`（`Failure`，`:49–75`）；只发出 `context`、`trial` 2 个 GET（参照 `:713`）；
       - 把 `context` 切到 64 个 `b` 的快照后点该按钮：`cancelQueries`、`removeQueries` 各 1 次，键 `["legacy"]`；hash 最终含 `source=` 加 64 个 `b`；`context` GET 共 2 个（参照 `:715–717`）。
    9. **空期间与路由缺失**：
       - `context` 的 `periods` 为空：出现 `.empty-state` 文本 `reports.noPeriods`，没有 `table`；`#report-period` 带 `disabled`（`:204`）（参照 `:481–487`）；
       - 起始 `#/reports/ledger/abc`：出现 `reports.routeMissing` 的 `role="alert"`（`:280–281`），不发明细请求。
    10. **`ReportIndex` 重定向**：起始 `#/reports?source=bad&month=2025-02`。hash 为 `#/reports/trial?source=bad&month=2025-02`，`history.length` 不变（`replace`，`:622`）；出现 `reports.invalidSelection`；只发出 1 个 GET（参照 `:488–495`）。
    11. **焦点与键盘**：直接断言 1–10 的每一步，驱动 B 的焦点调用记录都为空（依据：“现状·焦点”的枚举命令）；试算与明细各有 1 个 `div.grid-wrap[role="region"][tabindex="0"]`，`aria-label` 分别为 `reports.trialScroll`、`reports.ledgerScroll` 的文本。驱动 A 的焦点记录两侧逐项相同（跳转链接聚焦 `main` 属外壳行为，参照 `:344–345`）。

    PR 正文附：
    - 驱动全文与步骤清单；
    - 两侧输出的 SHA-256 与比较结果；
    - 直接断言 4–8 的逐步输出原文。
  - **驱动原件**：PR 正文贴驱动**原文件字节的 base64**；或者同时写出两种 SHA-256：一是原始字节的，二是按 UTF-8 解码并把换行归一为 LF 之后字节的。只给一种哈希不算满足。
- **R5 结构规则**（静态；评审按代码与 PR 表格核对）：
  - **R5a Hook 序列**：PR 正文按组件列出 base 与 head 的 Hook 调用序列，自定义 Hook 按调用处展开，并附参数与依赖的源文本（只归一空白）。
    - 两侧逐行相同；base 一侧须与“现状”所列一致（8 + 1 + 3 + 1 项）。
    - 没有豁免，任何差异即失败。
  - **R5b 展示组件无 Hook**：新抽出的组件中没有任何 `use*` 调用。PR 正文附 Babel AST 检查脚本的输出。
  - **R5c 原文搬移**：以下各项在 base 与 head 之间逐字比较，只归一缩进；不同即失败。决定 4 的三处替换是仅有的例外，PR 正文逐处贴出 base 与 head 原文。
    - 3 个查询的选项对象（`:105–109`、`:304–315`、`:442–463`）；
    - `useEffect` 的回调体与依赖数组（`:124–129`）；`reload` 的函数体（`:131–139`）；`more` 的函数体（`:464–472`）；
    - 以下求值表达式：`Reports` 的 `source`、`periods`、`selectedSource`、`month`、`stage`、`invalid`（`:110–123`，阶段判定除外）、`search`、`scope`、`account`（`:186–192`）；`Trial` 的 `data`（`:316`）；`Ledger` 的 `key`（`:434–441`）、`first`、`entries`、`kinds`（`:473–480`）；
    - 早返回的条件（`:140`、`:146–151`、`:172`、`:185`）与 `Ledger` 的渲染条件（`:269`）；
    - `#report-period` 的 `onChange`（`:205–214`，阶段判定除外）、`#trial-stage` 的 `onChange`（`:325–328`，阶段判定除外）、`onStage`（`:262–264`）、`Failure` 的 `retry` 回调（`:176–178`、`:346–348`、`:500–502`、`:589–591`）与“加载更多”按钮的 `onClick`（`:608–610`）；
    - `Trial`、`Ledger` 两个 JSX 元素的 `key` 与全部 props（`:255–279`，`reload` 的值按决定 4）；
    - `ReportIndex`（`:620–623`）全文；决定 6 所列模块级定义。
  - **R5d 插槽对等**：PR 正文用表格列出 base 中 `Reports`、`Trial`、`Ledger` 的顶层 JSX 各段，并标出 head 中对应的组件或表达式（每段对应一个）。
- **R6 尺寸**：
  - 除上表 R6a、R6b 外，`Reports.tsx` ≤ **150** 行（`wc -l`，base 623 行）；
  - 新文件各 ≤ **150** 行（`S30.md:62`）；每个函数满足 ②：≤ 80 行，嵌套 ≤ 3 层（按“可读性·量法”）；
  - PR 正文列出超过 60 行的函数（`S30.md:60`），附计数行数与最深层数（base 与 head 两列）。
- **R7 打包字节**：
  - 首屏按 D454；
  - 用 `scripts/measure/bundle-measure.mjs`，写明脚本所在的提交 SHA（该文件在 `4d296bf` 上最后一次改动是 `6156759`）；
  - base 取最终送审 head 的实际合并基；合并基变了就重新测量。

  预算（未列出的项为 ±0）：

  | 项 | manifest 键 | 上限 | 依据 |
  | --- | --- | --- | --- |
  | 首屏 | — | **±0**（D454，`--d454`） | 改动文件都不在首屏闭包中（见“chunk 归属”表） |
  | 报表页路由 | `src/Reports.tsx` | ≤ **+800 B**（硬上限） | 估定，见下 |
  | 报表页入口 chunk | `src/Reports.tsx` | ≤ **+800 B** | 同上 |
  | CSS | `assets/ledger.css` 等全部 | ±0 | 不改 CSS |
  | 共用 chunk 与其他路由 | 全部 | ±0 | 只导入、不改 |

  命令参数：`--route src/Reports.tsx=+800 --chunk src/Reports.tsx=+800 --d454`。
  - 出现 base 没有的新 chunk 时，即停下报告；
  - 超出上限时先停下，报设计角色与协调者，不得自行放宽，也不得为压字节改变拆分结构或行为；
  - 上限没有做试改构建，是估计值：REFAC-28（263 行）实测 +450 B（gzip，`REFAC-33` R7 引用）；REFAC-33（753 行）估为 +900 B。本任务要拆的函数合计 520 行，故估为 +800 B。它按硬上限执行（[S30 共用](S30.md#三项-refac-共用可读性与嵌套复验)）：开发先在 base 上实测字节，再测 head；超出按上两条处理，是否调整由 TL 决定。
- **R8 质量门**：
  - **R8a 合并前**：`npm run typecheck`（`tsc --noEmit -p tsconfig.json`）、`npm run check`（`biome ci`）、CI-02 预检通过；PR CI（`ci.yml`）绿。
  - **R8b 合并后检查（不作合并门）**：合并后第一次覆盖该合并提交的 main Full 须绿；失败时报协调者，按 D456 暂停后续合并。
- **R9 可读性一节**：PR 正文按下文“可读性”一节逐项给出改前 / 改后数据。

### 测试命令（S22 回顾行动 4）

- 本机全量 web 测试一律用 `npx vitest run --project web`（`vitest.config.ts:160`）。PR 正文附汇总行原文，base 与 head 各一次。
- 有失败时，逐个列出失败的文件与用例，并附只对这些文件的串行重跑原文：`npx vitest run --project web --no-file-parallelism <失败文件…>`。
  - 不得更换并发参数而不说明；
  - 串行重跑仍失败的，按真实失败处理。

## 性能考虑

- 渲染次数不变：组件边界与 `key` 不变（决定 3），不加 `memo`，不改 Hook 与依赖（决定 2）。
- `reload` 包装由内联箭头改为一个具名函数，每次渲染仍新建一次；`Trial`、`Ledger` 未做记忆化，props 身份变化不影响渲染次数。
- 阶段判定改为调用同一函数，每次渲染的判定次数不变。
- 请求次数与时机不变（R4 直接断言 1–8、10）。
- 不跑 Bench。打包变化由 R7 约束。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥（`roadmap.md:89–96`）与 [S30 共用要求](S30.md#三项-refac-共用可读性与嵌套复验)（`S30.md:54–66`）。PR 正文“可读性”一节按下表五项逐项给出**改前 / 改后**数据。

| 维度 | 要求 | 改前（`4d296bf`，设计角色用本节量法实测） | PR 正文改后须列 |
| --- | --- | --- | --- |
| 函数长度（②） | `Reports.tsx` 与 `reports/` 下每个函数（含内层具名函数）不计空行与纯注释行 ≤ 80 | `Ledger` 200、`Reports` 189、`Trial` 131；其余 9 项 ≤ 27（见“现状”的完整输出） | 本节量法对 `Reports.tsx` 与 `reports/` 的**完整输出**；无超过 80 行的函数；超过 60 行的逐个列行数 |
| 嵌套深度（②） | 每个函数 ≤ 3 层 | `Reports` 3、`Trial` 2、`Ledger` 2；`failureLabel`、`reload`、`more` 各 1；其余 0 | 同一份输出的第 2 列；无超过 3 层的函数；超过 60 行的函数附最深层数 |
| 文件长度（③） | `Reports.tsx` 拆后 ≤ 150 行；新文件各 ≤ 150 行；文件非热点（< 800） | `Reports.tsx` 623 行；`reports/` 不存在 | 逐文件 `git diff --numstat <base> <head>` 与拆后 `wc -l` |
| 重复（④） | 同一业务规则或同一流程第三次出现即抽取 | 见“现状·重复”：加载段落 3 处、`reload` 包装 4 处、阶段判定 3 处（R6b：3 / 4 / 3）；另有 2 处以内的重复 6 类 | 每处重复的去向：抽取为哪个函数 / 组件（R6b：1 / 1 / 1），或说明为何保留 |
| 命名（①） | 新函数、新文件名表达业务含义；不用 `step1`、`part2`、`helper`、`utils` 及同类序号名 | — | 新增名称清单，每个名称一句职责；附 `git diff --name-only <base>...<head> \| grep -i -E "step[0-9]\|part[0-9]\|helper\|util"` 的输出（预期为空） |

### 量法

用 [S30 统一量法](S30.md#s30-统一量法) 的 `s30-measure.cjs`（参数 `<rev> <files…>`，经 `git show` 读取指定提交），函数长度与嵌套深度共用；脚本原文以 S30.md 该节为准，本任务书不另附。把脚本存到仓库外（下记 `<保存位置>`），在仓库根目录运行：

```powershell
node <保存位置>\s30-measure.cjs 4d296bf packages/web/src/Reports.tsx
node <保存位置>\s30-measure.cjs <head> packages/web/src/Reports.tsx @(git diff --name-only --diff-filter=A <base> <head> -- packages/web/src/reports)
```

- **输出**：每个具名函数一行，`行数<TAB>层数<TAB>文件:首行-末行<TAB>名称`；内联回调计入所在函数，不单独成行；具名内层函数单独成行。
- **计层口径**（摘要，以 S30 统一量法为准）：函数体顶层记 0 层；任何不具名的函数体（内联回调，含 JSX 属性回调与 IIFE）加 1 层；`if` / `else`、循环、`switch`、`try` / `catch` 的受控语句不论是否带花括号都加 1 层；else-if 与它前面的 if 同层；具名内层函数单独计；JSX 元素层级、`?:`、`&&` 不计层。
- **改前**：一律取该脚本在 `4d296bf` 上的输出。设计角色确认的值为 `Reports` 189 / 3、`Trial` 131 / 2、`Ledger` 200 / 2（行数 / 层数）；PR 正文贴开发在 base 上重跑的完整输出，若与这三个值不符，先停下报告。
- **改后**：拆后每个函数（含 JSX 回调所在的函数）≤ 80 行、≤ 3 层。JSX 属性回调（如 `onChange`、`onClick`）按本量法计入所在组件并加 1 层，回调里的 `if` 与再内层的回调继续加层。例如 base 中 `Reports` 的 3 层就来自 `onChange`（`:205`）→ `if`（`:207`）→ `.some` 回调（`:211`）。

### 其余各条

- **②**：拆后
  - `Reports` 只做“取上下文 → 解析与校验 URL → 补参 → 早返回（加载、未配置、失败）→ 期间选择、快照身份、提示条 → 选择试算、明细或提示”；
  - `Trial` 只做“取试算 → 阶段选择 → 加载、失败或试算表”；
  - `Ledger` 只做“取明细 → 标题与返回 → 加载、失败，或 KPI、明细表、分页状态与加载更多”。
- **③**：`Reports.tsx` 从 623 行降到 ≤ 150 行，新文件各 ≤ 150 行（R6）。上限 150 的依据：拆后 `Reports.tsx` 保留导入、`Reports`（≤ 80 行）与 `ReportIndex`（4 行），并按决定 7 保留快照身份段；与 REFAC-33 对被拆文件的上限相同。
- **④**：见上表“重复”一行与决定 4。查询与 URL 解析留在带 Hook 的组件或其自定义 Hook 中，展示组件只接收值与回调。
- **⑤**：`pageLimit` 已是具名常量，原样保留；不新增未命名的数字。
- **⑥**：不新增注释，除非某处拆分需要说明“为什么”（例如阶段判定为何改用类型守卫）。不留调试输出。`ScrollTable` 的 `biome-ignore` 注释随组件原样搬移。
- **测试耗时**：本任务不改测试；R4 驱动不提交。PR 正文附 `reports.test.tsx` 在 base 与 head 上的耗时（vitest 汇总行原文）；两侧差异 > 20% 时说明原因。

## 用户可见变化

- 无。以下都不变（R3、R4）：
  - 期间与阶段选择、URL 校验、自动补参与重新加载快照；
  - 未配置快照、错误与 409 提示；
  - 试算表、下钻链接与返回链接；
  - 明细 KPI、明细表、加载更多与不完整提示；
  - 可滚动区域的键盘可达性；中英文文本与教学提示。

## 证据要求

- **不需要浏览器时段**：
  - 行为等价由 R3 与 R4 证明，R4 包括 DOM 逐字节比较，以及请求、URL、查询取消与移除、焦点的直接断言；
  - 真实 Chrome 场景不进入报表页（枚举命令见“现状·测试”）；
  - R4 与构建在本机运行，须服从协调者的时段静默通知（D442 / D480）。
- **可行性**（S13 回顾行动 4）：
  - 设计角色在 `packages/` 与 `4d296bf` 相同的工作树上跑过 `reports.test.tsx`（32 个用例通过），并实测了 R6a 与 R6b 的 base 数字；
  - **R4 直接断言没有用驱动在 base 上实测**，预期值来自源码与既有测试（各条已注明出处）；R7 的 base 字节也未实测。开发先在 base 上跑 R4 与 R7，不成立或缺数时按上文先停下报告；
  - 注意事项：
    - `HashRouter` 下 `Link` 的 `href` 以 `#` 开头；
    - `installFetch` 的路径分派用 `endsWith`（`:85–87`），受控桩沿用；
    - 409 恢复须先把 `context` 切到新快照再点按钮（同 `:714–715`）。
- PR 正文附：
  - R1 的 `git diff --name-only <base>...<head>` 原始输出；
  - R2 的导出比较与 `git grep` 结果；
  - R3 汇总行；
  - R4：驱动（原件 base64 或两种 SHA-256）、步骤清单、比较结果、直接断言结果，以及直接断言 4–8 的逐步输出；
  - R5a–R5d 各表；
  - R6 行数表（base 与 head 两列）与 R6b 计数输出；
  - R7：`bundle-measure.mjs` 的完整输出与退出码；
  - 可读性一节（五项改前 / 改后数据、`s30-measure.cjs` 的两条运行命令与 base、head 两份完整输出（脚本原文不贴，链接 [S30 统一量法](S30.md#s30-统一量法)））；
  - 疑似缺陷登记（没有时写“无”）。

  R8b 在合并后补到 PR 评论。

## 合并后项

- Product/Design 在合并提交上用 [S30 统一量法](S30.md#s30-统一量法) 的 `s30-measure.cjs`（参数为合并提交与 `Reports.tsx`、`reports/` 下各文件） **复测函数长度与嵌套深度**，在已合并 PR 下评论：命令、完整输出、合并提交完整 SHA（`S30.md:66`、`:199`）。无超过 80 行、无超过 3 层的函数后，S30 执行状态表 REFAC-35 行的“合并后项”才清空（`S30.md:168`）。

## 开放问题（请 TL 确认）

1. （已定，评审 6083453880）R7 的 `+800 B` 由估计确定，未做试改构建，按硬上限执行：超出即停下报告，不自行放宽。base 字节未在 `4d296bf` 上实测（只有 `3ae4848` 的历史数字），由开发先在 base 上测。
2. 嵌套量法与路线图边界例的出入：抽出 `map` 回调后，按 S30 统一量法的口径外层为 2 层，`roadmap.md:91` 写“外层为 3 层”。本任务按脚本结果判定（两者都 ≤ 3，不影响通过与否）；是否需要由 Knowledge Lead 另行澄清路线图原文？
3. 阶段判定去重（决定 4）把 `:326` 的 `.find` 改为类型守卫，是 R5c 的显式例外，由 R4 直接断言 2、6 与 R3 证明等价。若 TL 认为这超出“不改行为”的稳妥范围，可改为“只抽取 `:123`、`:211` 两处”，R6b 第 3 项相应改为 2。

## 设计自查

- [x] 本 Sprint 只有这一项页面拆分；冲突域与 KDOC-14、REFAC-36、REFAC-37 逐文件不相交。
- [x] R6a、R6b 有 base 实测值；R7 的 base 字节未实测，要求开发先测；+800 B 按硬上限执行（开放问题 1，已定）。
- [x] 默认期间与补参、下钻与阶段切换、切换期间、明细与返回、加载更多与失败、URL 非法与重新加载、未配置、409、空期间与路由缺失、`ReportIndex` 重定向、焦点都有直接断言；预期值的出处逐条注明，未用驱动在 base 上实测（已写明，开发先在 base 上跑）。
- [x] 可读性五项都有要求、改前数据（量法链接 S30 统一量法并附命令）与改后须列；新文件各 ≤ 150 行，`Reports.tsx` 拆后 ≤ 150 行；无用户可见变化。
- [x] 合并后项写明由 Product/Design 在合并提交上复测函数长度与嵌套深度。
- [x] 不加迁移，不碰 `scripts/slot/`、`scripts/measure/`，不改测试文件。
