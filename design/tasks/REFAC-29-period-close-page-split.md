# REFAC-29：拆分期末结账页 `PeriodClose`（不改行为）

- Sprint：S24（[计划草案](S24.md)）
- 类型：重构（Web 页面拆分）
- 优先级：P2
- 决定：[D549](S24.md#s24-期间决定)。只改代码组织，不改行为，详见“范围与决定”1–7。
- 建议分支：`refac-29-split-period-close-page`
- 来源：[S24 候选](S24.md#候选s24-其余泳道s23-评审后定)“页面拆分”。REFAC-28（[#352](https://github.com/lingshf/ai-native-erp/pull/352)）已合并，并把 `PeriodClose`（208 行）明确留作后续；页面拆分名额空出，本批只排这一项。
- 模板：[REFAC-28](REFAC-28-close-wizard-split.md)（Hook 序列逐项相同、展示组件无 Hook、DOM 含属性顺序逐字节相同、请求直接断言、驱动原件 base64 或两种哈希）。
- 迁移：**不加**。
- 浏览器时段：**不需要**，理由见“证据要求”。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 为什么是它

- 设计角色在 `7eb7b42` 上用 `node files/fnlen.cjs packages/web/src packages/core/src packages/infra/src` 实测，超过 ② 上限的前几项：
  - `tradeDocumentRepository`（616）、`prepareSettlement`（179）：已排为 REFAC-26、REFAC-27，在岗。
  - legacy 的 `checkOpeningItems`（606）、`reconcileLegacy`（382）、`mapRow`（253）等：不碰。
  - `Workspace`（295，`App.tsx`）：**首屏**，本 Sprint 不排。
  - `FinancialReport`（240）、`LedgerGrid`（218）、`CompanyReports`（209）：同在 `LedgerReports.tsx`，宜作为一组另排。
  - `EventEditor`（216）、`DimensionEditor`（215）、`DetailBody`（214）：各自页面另排。
  - **`PeriodClose`（208，`PeriodClose.tsx:16–223`）**
- 选 `PeriodClose` 的理由：
  - **收尾**：REFAC-28 刚把同文件的 `CloseWizard` 拆进 `period-close/`，并在任务书“决定 7”中写明 `PeriodClose` 留作后续。同一文件、同一目录，接着做改动面最小，且可直接复用 #352 的驱动方法。
  - **不在首屏**：`PeriodClose.tsx` 只被 `App.tsx` 懒加载，落在 `src/PeriodClose.tsx` 路由 chunk。
  - **行为关键点集中、可直接断言**：公司与期间的分页加载、默认期间选择、URL 参数、两种锁定（向导在途 `locked`、准入编辑 `admissionLocked`）的传播、锁定期间持有旧选择（`held`）、错误重试的分流、无效选择提示、准入“已保存”提示的显隐。设计角色已在 base 上逐项实测（见 R4 直接断言）。
- 冲突域与在岗的 REFAC-26、REFAC-27 不相交，详见“冲突域”。

## 现状（main `7eb7b42`）

下文 `file:line` 都按 `7eb7b42`（#352 的合并提交）。

- `packages/web/src/PeriodClose.tsx` 共 **224** 行，只导出 `PeriodClose`（`:16`）。文件内另有模块级 `tones`（`:224`）。导入：`react` 的 `useCallback`、`useState`；`@tanstack/react-query` 的 `useInfiniteQuery`；`react-router-dom` 的 `useSearchParams`；`@erp/core/contracts` 的 `companiesPageSchema`、`periodsPageSchema` 与类型 `CompanyDto`、`PeriodDto`；`./ui/index.ts`（`label`、`LabelKey`、`Preferences`）；`./master-data-client.ts`（`masterRequest`）；`./TradePeriodAdmission.tsx`；`./ui/components/index.tsx`（`Badge`、`MessageBar`、`PageHeader`、`TeachingTip`）；`./period-close/close-wizard.tsx`（`CloseWizard`）；`./pages/period-close.css`。
- 设计角色实测：

  ```text
  208	packages/web/src/PeriodClose.tsx:16-223	PeriodClose
  ```

- **Hook 调用序列**（base，按源码顺序；R5a 以此为准）：
  1. `useSearchParams()`（`[params, setParams]`，`:17`）
  2. `useState(false)`（`locked`，`:18`）
  3. `useState(false)`（`admissionLocked`，`:19`）
  4. `useState<{ company: string; month: string } | null>(null)`（`admissionSaved`，`:20–22`）
  5. `useState<{ company: CompanyDto; period: PeriodDto } | null>(null)`（`held`，`:23`）
  6. `useInfiniteQuery` 公司（`:25–35`）：键 `["companies"]`，`initialPageParam: ""`，URL `` `/api/v1/companies?limit=100${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}` ``，`getNextPageParam: (page) => page.nextCursor ?? undefined`
  7. `useInfiniteQuery` 期间（`:38–48`）：键 `["close-periods", company?.code]`，`enabled: !!company`，URL `` `/api/v1/periods?company=${encodeURIComponent(company?.code ?? "")}&limit=100${pageParam ? `&cursor=${pageParam}` : ""}` ``（期间游标**不**编码，公司游标编码；两者不得统一）
  8. `useCallback` `lock`（`:57–65`），依赖 `[company, period]`：`value` 为真且有公司与期间时 `setHeld((current) => current ?? { company, period })`；为假时 `setHeld(null)`；最后 `setLocked(value)`
- **派生值**（都在组件体内、每次渲染求值）：
  - `t`（`:24`，位于第 5、6 个 Hook 之间）；
  - `items`、`company`（`:36–37`，位于第 6、7 个 Hook 之间）：URL 参数 `company`，缺省取第一项；参数不在列表中则为 `undefined`；
  - `months`、`period`（`:49–56`，位于第 7、8 个 Hook 之间）：URL 参数 `month`，缺省取第一个 `open` 期间，再缺省取最后一项；
  - `selectedCompany`、`selectedPeriod`（`:66–67`）：`held` 优先；
  - `companyOptions`、`periodOptions`（`:68–75`）：`held` 不在列表中时前置；
  - `error`（`:76`）：`companies.error ?? periods.error`。
- **JSX**（`:77–222`），`section.page.period-close` 内依次 9 项：
  1. `PageHeader`（`:79–136`），`context` 的 Fragment 内依次：
     - a. 公司字段 `div.field` + `#close-company`（`:84–98`，`disabled={locked || admissionLocked}`，`onChange` 只写 `company` 参数）；
     - b. 公司“加载更多”（`:99–108`，`companies.hasNextPage` 时，`disabled={locked || admissionLocked}`）；
     - c. 期间字段 `div.field` + `#close-month`（`:109–123`，`disabled={locked || admissionLocked}`，`onChange` 写 `company` 与 `month`）；
     - d. 期间“加载更多”（`:124–133`，`periods.hasNextPage` 时，`disabled={locked}`）。
  2. 说明 `MessageBar tone="info"`（`:137`）
  3. 错误 `MessageBar`（`:138–149`，`error` 时，`danger` + `role="alert"`，内含“重试”按钮：`companies.isError` 则重取公司，否则重取期间）
  4. 无效选择 `MessageBar`（`:150–154`，`!held && !companies.isPending && (!company || (!periods.isPending && !period))` 时，`danger` + `role="alert"`）
  5. `TeachingTip`（`:155–157`）
  6. 向导 `fieldset`（`:158–172`，`disabled={admissionLocked}`，`aria-label` 为 `close.title`）包 `CloseWizard`，`key` 为 `` `${selectedCompany.code}:${selectedPeriod.month}` ``，`next` 先 `lock(false)` 再 `setParams`
  7. `TradePeriodAdmission`（`:173–185`），`key` 为 `` `admission:${selectedCompany.code}:${selectedPeriod.month}:${selectedPeriod.revision}` ``，`lock={setAdmissionLocked}`，`disabled={locked}`
  8. “已保存”`MessageBar`（`:186–192`，`success` + `role="status"`）
  9. 期间表 `div.card > div.grid-wrap > table.grid`（`:193–220`，`months.length > 0` 时；行带 `aria-current`，状态用 `Badge` + `tones`）
- **重复**：`locked || admissionLocked` 出现 **3** 处（`:88`、`:102`、`:113`）。期间“加载更多”的 `disabled={locked}`（`:127`）与准入的 `disabled={locked}`（`:180`）不是同一条件。
- **测试**：
  - `packages/web/test/period-close.test.tsx` 3 个用例，经 `App` 整页渲染；`trade-period-admission.test.tsx` 6 个用例，也经整页渲染；
  - 真实 Chrome：`packages/infra/test/support/trade-gui/scenario/part-one.ts:8–46`（`closePeriod`）操作 `#close-month`、贸易准入复选框与保存，并等待 `role="status"` 的“已保存”文本；`smoke/pages.ts:54–57` 等待 `#close-month option`。

### chunk 归属与首屏（S22 回顾行动 3，base 实测）

设计角色在 `7eb7b42` 上运行 `node scripts/measure/bundle-measure.mjs --base 7eb7b42… --head 7eb7b42… --work <新目录> --d454`（两侧都传完整 SHA）。脚本取自 `7eb7b42`，该文件最后一次改动是 `6156759`；退出码 0，`RESULT: PASS`。

| 文件 | 落在哪个 chunk | 依据 |
| --- | --- | --- |
| `PeriodClose.tsx`（改） | 路由入口 chunk `src/PeriodClose.tsx` | 只被 `App.tsx` 懒加载 |
| `period-close/` 下新文件（新增） | 同上 | 只允许被 `PeriodClose.tsx` 或本任务的新文件导入（决定 6） |
| 首屏 | **本任务不改任何首屏文件** | `ui/*`、`ui/components`、`master-data-client.ts` 只导入、不改（决定 7） |
| CSS | 不改 | `pages/period-close.css` 不改 |

base 数字（原始 / gzip-9 字节）：

| 项 | 键 | 原始 | gzip |
| --- | --- | --- | --- |
| first-screen | first-screen | 531281 | 161156 |
| route | `src/PeriodClose.tsx` | 42985 | 15831 |
| chunk | `src/PeriodClose.tsx` | 13883 | 4687 |
| chunk | `assets/PeriodClose.css` | 2242 | 735 |

## 范围与决定

1. **不改行为**（D549）。以下全部不变：
   - DOM 结构、类名、文本；属性及其**先后顺序**，含 `id`、`htmlFor`、`className`、`type`、`disabled`、`value`、`role`、`tone`、`aria-label`、`aria-current`、`scope`；
   - 请求的 URL（含游标是否编码）、方法与发出顺序；查询键；`enabled` 条件；
   - 默认公司、默认期间的选择规则；`held` 的设置与清除时机；选项前置规则；
   - URL 参数的写法：改公司只写 `company`，改期间写 `company` 与 `month`；
   - 两种锁定传播到的控件与条件，含期间“加载更多”只看 `locked` 这一不对称；
   - 错误重试的分流（先看 `companies.isError`）；无效选择提示的条件；“已保存”提示的条件；
   - `CloseWizard` 与 `TradePeriodAdmission` 的 `key`（决定其何时重新挂载）、props 与回调；
   - 焦点与键盘行为。

   只改代码组织，不修 bug。拆分时发现的疑似缺陷（例如期间“加载更多”不随准入锁定而禁用）登记在 PR 正文，留作后续任务。
2. **Hook 顺序不变**：
   - Hook 可以留在 `PeriodClose`，也可以放进它在顶层无条件调用的自定义 Hook，例如 `usePeriodSelection`；
   - **展示组件不得调用任何 Hook**；不新增 `useCallback`、`useMemo`、`useEffect`、`memo`；
   - 展开自定义 Hook 后，Hook 调用序列与“现状”所列 8 项逐项相同：种类、先后、参数与依赖的源文本，只归一空白（R5a）；
   - 第 6、7 个 Hook 之间依赖 `company`，第 7、8 个之间依赖 `period`：派生值的求值位置可以随 Hook 一起搬进自定义 Hook，但不得改变“先求 `company` 再建期间查询”的先后；
   - 本任务**没有豁免**。
3. **两个分页查询不合并**：公司与期间两个 `useInfiniteQuery` 的选项对象原样搬移（R5c）。两者游标编码不同，不得抽成一个共用工厂；如需减少重复，只能在 PR 正文说明并留作后续。
4. **组件层级对等**：
   - 新组件一律在模块顶层定义；
   - 抽出的组件只替换“现状”所列 9 项之一，或第 1 项 `context` 内 a–d 之一；只渲染该段原来渲染的内容；
   - 不把相邻兄弟合成一个返回 Fragment 的组件；例外：第 1 项的 `context` 整体（a–d 的 Fragment）可以作为一个组件，因为它原本就是一个 Fragment 值；
   - 条件渲染的条件留在父级原位置，或留在被抽出组件内与原来相同的位置；
   - 第 6、7 项（`CloseWizard`、`TradePeriodAdmission`）留在 `PeriodClose` 中直接渲染，`key` 与回调原样（R5c），不得包进新组件，以免改变重新挂载的边界。
5. **“选择已锁定”去重**（⑤，R6b）：
   - a、b、c 三处 `disabled={locked || admissionLocked}` 改为每次渲染求值一次的一个值（例如 `const selectionLocked = locked || admissionLocked`），三处改用它；
   - d 的 `disabled={locked}` 与准入的 `disabled={locked}` 不是同一条件，**不**并入。
6. **文件**：
   - 新文件放进已有的 `packages/web/src/period-close/`，按职责命名，例如 `use-period-selection.ts`、`period-picker.tsx`、`period-close-notices.tsx`、`period-table.tsx`，粒度由开发定，写入 PR 正文；
   - 新文件只被 `PeriodClose.tsx` 或本任务的新文件导入；
   - REFAC-28 的 8 个文件（`close-action-bar.tsx`、`close-commands.ts`、`close-links.ts`、`close-notices.tsx`、`close-preview.tsx`、`close-text.ts`、`close-wizard.tsx`、`use-close-commands.ts`）**不改**；`close-text.ts` 的 `CloseText` 类型可以导入复用，但不改其定义；
   - `tones` 可以随期间表搬进新文件，源文本不变；
   - `PeriodClose` 留在 `PeriodClose.tsx`，仍是该文件唯一的导出，名称与 props 类型不变。
7. **不改**：
   - `period-close/` 下 REFAC-28 的既有文件；`TradePeriodAdmission.tsx`；`App.tsx` 与路由表；`master-data-client.ts`；`ui/**`（含标签资源与教学文案）；CSS（含 `pages/period-close.css`）；契约（`@erp/core/contracts`）；
   - `packages/web/test/**`（含 `setup.ts`）、`packages/infra/**`、`packages/core/**`；
   - `scripts/**`（含 `scripts/slot/`、`scripts/measure/`）、`scripts/test-shard-weights.json`、`package.json` / lock、`vitest.config.ts`。

## 冲突域

- web-ui:period-close：只改 `packages/web/src/PeriodClose.tsx`，并在 `packages/web/src/period-close/` 下新增文件（决定 6）。
- 取证所需的观测点和新增测试文件：无。R4 驱动不提交。
- 受影响的 e2e 断言（S13 回顾行动 1）：`trade-gui/scenario/part-one.ts:8–46` 依赖 `#close-month`、贸易准入控件与 `role="status"` 的“已保存”文本；`smoke/pages.ts:54–57` 依赖 `#close-month option`。这些 id、角色与文本都在决定 1 的不变范围内。**须随本任务改**：无。
- 受影响的文档引用（D460）：`git grep -n -F "PeriodClose" -- docs design` 在 `7eb7b42` 上命中 156 行，都是历史任务书、评审与演示日志中的事实记录；组件名与文件名不变，不改。
- 与在岗任务不相交：
  - REFAC-26 只改 `packages/infra/src/storage/trade-documents.ts` 与同目录新增的 `trade-document-*.ts`；
  - REFAC-27 只改 `packages/core/src/application/trade-documents.ts` 与同目录新增的 `trade-settlement-*.ts`。

  三者没有共享文件。本任务跑 `web` 项目，另两项跑 `core` / `infra` 项目。

## 验收

### base 失败、head 通过

| 编号 | 检查 | base `7eb7b42` | head 要求 |
| --- | --- | --- | --- |
| R6a | `node fnlen.cjs packages/web/src`（口径同 S16–S24）中 `PeriodClose` 的行数 | **208**（失败） | ≤ 80；本任务新增或改动的函数也都 ≤ 80 |
| R6b | 在 `PeriodClose.tsx` 与 `period-close/` 全部文件的拼接文本上，正则 `/locked \|\|\s+admissionLocked/g` 的命中数（`node -e` 读文件计数，跨行写法也算） | **3**（失败） | **1**：决定 5 的定义 1 处。PR 正文附 base 与 head 两侧的计数脚本与输出原文 |

### 两侧都须成立的不变量

- **R1 范围**：
  - `git diff --name-only <base> <head>` 只含 `packages/web/src/PeriodClose.tsx` 与 `packages/web/src/period-close/` 下的**新**文件；
  - 决定 7 所列文件（含 REFAC-28 的 8 个文件）的 diff 为空；
  - 不加迁移。
- **R2 导出不变**：
  - `PeriodClose.tsx` 的导出集合与 base 相同，只有 `PeriodClose`，类型为 function；props 类型源文本相同，只归一空白。用仓库根 devDependency `@babel/parser`（插件 `typescript`、`jsx`）解析，口径同 REFAC-14 R2；
  - 新文件的导出只在 `PeriodClose.tsx` 与 `period-close/` 内使用，PR 正文附 `git grep` 结果。
- **R3 既有测试原样通过**：
  - `period-close.test.tsx` 的 3 个用例、`trade-period-admission.test.tsx` 的 6 个用例、`App.test.tsx` 与 Web 全部 jsdom 测试通过；
  - 测试文件 diff 为空；
  - 本机全量命令见“测试命令”。
- **R4 DOM、请求、锁定与选择等价**（送审证据；驱动不提交，不加常驻 CI 用例）：
  - **两个驱动**，都是临时 jsdom 脚本，在 base 与 head 上按同一序列操作。`fetch` 桩按路径分派，借用 `period-close.test.tsx:12` 的写法，但改为**受控响应**：
    - `/api/v1/companies` 与 `/api/v1/periods`（GET）可按游标返回分页（`nextCursor` 须是合法的公司代码 / 月份，否则契约校验失败），也可返回带指定状态码（500）的错误信封；
    - `/api/v1/periods`（PUT）返回 `revision + 1` 的期间；
    - `close-preview` 可以挂起，用来让向导进入在途锁定；
    - 桩记录每次请求的序号、方法、URL 与请求体原文。

    `QueryClient.prototype.invalidateQueries` 用委托包装记录调用（序号、`queryKey`），保留原实现。

    - **驱动 A（整页）**：渲染 `App`，经导航进入期末结账页，按 `period-close.test.tsx` 与 `trade-period-admission.test.tsx` 的路径操作。
    - **驱动 B（直接渲染导出组件）**：在 `QueryClientProvider`（`retry: false`）与 `HashRouter` 内直接渲染导出的 `PeriodClose`，`preferences` 由驱动控制（zh / en、教学开 / 关）；起始 URL 由 `window.history.replaceState` 给定。
  - **记录规则**：同 [REFAC-28 R4](REFAC-28-close-wizard-split.md#两侧都须成立的不变量)。
    - 被记录的函数一律用委托包装对象或函数，不用 `Proxy`；
    - 调用时分配递增序号并立即写入记录；返回 Promise 时先记 `pending`，完成后在同一条记录写 `resolved` / `rejected` 与结果；
    - 参数与返回值都经确定性编码（`Set` → `{"$set": […]}`、`Map` → `{"$map": [[k, v], …]}`；其余同 REFAC-17）；
    - 驱动须带 REFAC-17 的自测（a）–（c），失败即 R4 失败。
  - **焦点**：`HTMLElement.prototype.focus` 装记录桩，保留原实现，记下每次调用的目标。
  - **序列**至少包含（驱动 B，另有标注的除外）：
    - **分页与默认选择**：公司两页（`DEFAULT` → 游标 `DEFAULT` → `SECOND`）；期间两页（第一页 `2026-01 closed`、`2026-02 frozen`，游标 `2026-02`；第二页 `2026-03 open`）；起始 URL 不带参数；依次点公司“加载更多”、期间“加载更多”。
    - **准入锁定与“已保存”**：起始 `?company=DEFAULT&month=2026-02`；勾选“准入贸易”；填原因并保存；再勾掉、再勾上；再经 `window.location.hash` 切到 `2026-01`。
    - **无效选择**：起始 `?company=NOPE`；再切到 `?company=DEFAULT&month=2099-01`。
    - **URL 参数**：加载第二页公司后在 `#close-company` 选 `SECOND`；待期间选项就绪后在 `#close-month` 选 `2026-01`。
    - **错误重试**：公司 500 后恢复并点“重试”；另起一遍，期间 500 后恢复并点“重试”。
    - **向导在途时持有旧选择**：起始 `?company=DEFAULT&month=2026-01`，期间 `2026-01`、`2026-02` 都为 `open`；点“预览结账”（`close-preview` 挂起）；让期间列表改为只返回 `2026-02`，由驱动经自己持有的 `QueryClient` 调 `refetchQueries({ queryKey: ["close-periods", "DEFAULT"] })`，等期间表只剩 1 行。
    - 驱动 A：zh / en 各一遍；教学模式开与关各一遍。
  - **每步采样**：
    - DOM：`document.body.innerHTML`；
    - `window.location.hash`；
    - 累计请求日志：序号、方法、URL、请求体原文、结果；
    - `invalidateQueries` 记录；
    - `#close-company`、`#close-month` 的 `value`、`disabled` 与选项值列表；两个“加载更多”按钮的 `disabled`；向导 `fieldset` 的 `disabled`；
    - 焦点调用记录；
    - `console.error` 调用记录。
  - **判定**：base 与 head 逐步、逐项、逐字节相同。并且**直接断言**，只比两侧相同不够。以下各条设计角色都已在 `7eb7b42` 上用临时 jsdom 脚本实测成立：
    1. **分页请求**：GET 依次为 `/api/v1/companies?limit=100`、`/api/v1/periods?company=DEFAULT&limit=100`；点两个“加载更多”后依次追加 `/api/v1/companies?limit=100&cursor=DEFAULT`、`/api/v1/periods?company=DEFAULT&limit=100&cursor=2026-02`。之后两个“加载更多”都不再渲染。
    2. **默认期间**：无 `month` 参数、只有第一页（`closed`、`frozen`）时，`#close-month` 的值为最后一项 `2026-02`，选项为 `2026-01,2026-02`；加载第二页（含 `open` 的 `2026-03`）后，值变为 `2026-03`，期间表中带 `aria-current="true"` 的行是 `2026-03`；公司选项为 `DEFAULT,SECOND`。
    3. **准入锁定**：勾选“准入贸易”后，`#close-company`、`#close-month` 与公司“加载更多”带 `disabled`，向导 `fieldset` 带 `disabled`；期间“加载更多”**不**带 `disabled`（base 的不对称，原样保留）。
    4. **“已保存”**：保存后 PUT 请求体原文为 `{"company":"DEFAULT","month":"2026-02","revision":1,"status":"frozen","reason":"<原因>","confirmed":true,"modules":["trade"]}`，键顺序如此；`invalidateQueries` 恰好 1 次、键为 `["close-periods","DEFAULT"]`；“已保存”文本所在最近的带 `role` 祖先为 `role="status"`；上述控件都不再带 `disabled`。再勾掉（准入变脏）时“已保存”消失，再勾上（恢复干净）时重新出现；切到 `2026-01` 后消失。
    5. **无效选择**：`?company=NOPE` 时出现 `ledger.invalid` 文本，最近的带 `role` 祖先为 `role="alert"`；没有向导 `fieldset`；只发出 1 个 GET（公司），不请求期间。`?company=DEFAULT&month=2099-01` 时同样出现该提示，没有向导 `fieldset`。
    6. **URL 参数**：在 `#close-company` 选 `SECOND` 后 hash 为 `#/period-close?company=SECOND`（不带 `month`）；随后在 `#close-month` 选 `2026-01` 后 hash 为 `#/period-close?company=SECOND&month=2026-01`。
    7. **错误重试分流**：
       - 公司 500：同时有 2 个 `role="alert"`（`close.error` 错误条与 `ledger.invalid`）；只发出 1 个 GET。恢复后点“重试”，追加的 GET 依次为公司、期间。
       - 期间 500：同样出现 `ledger.invalid`；GET 为公司、期间各 1 个。恢复后点“重试”，只追加 1 个期间 GET，不重取公司。
    8. **向导在途时持有旧选择**：点“预览结账”后 `#close-month` 带 `disabled`。期间列表改为只有 `2026-02` 并重新取数后：`#close-month` 的值仍为 `2026-01`，选项为 `2026-01,2026-02`（`held` 前置）；期间表只有 `2026-02` 一行（表按查询数据渲染，不含 `held`）；没有 `ledger.invalid`；`#close-company`、`#close-month`、公司“加载更多”带 `disabled`；向导 `fieldset` **不**带 `disabled`（它只看准入锁定）。

    base 上任一直接断言不成立，先停下并向协调者报告，不得把“两侧相同”当作通过，也不得改产品代码迁就断言。PR 正文附：驱动全文、步骤清单、两侧输出的 SHA-256 与比较结果，以及“准入锁定与已保存”“错误重试”“持有旧选择”三组场景的逐步输出原文。
  - **驱动原件**：PR 正文贴驱动**原文件字节的 base64**；或者同时写出两种 SHA-256：原始字节的，以及按 UTF-8 解码并把换行归一为 LF 后的字节的（评审从代码块复制时得到的是 LF 文本）。只给一种哈希不算满足。
- **R5 结构规则**（静态；评审按代码与 PR 表格核对）：
  - **R5a Hook 序列**：PR 正文列出 base 与 head 的 Hook 调用序列（自定义 Hook 按调用处展开），以及参数与依赖的源文本（只归一空白）。两侧逐行相同，base 一侧须与“现状”所列 8 项一致。没有豁免，任何差异即失败。
  - **R5b 展示组件无 Hook**：新抽出的组件中没有任何 `use*` 调用。PR 正文附 Babel AST 检查脚本的输出。
  - **R5c 原文搬移**：以下各项在 base 与 head 之间逐字比较，只归一缩进；不同即失败：
    - 两个 `useInfiniteQuery` 的选项对象；
    - `company`、`period` 的求值表达式；`lock` 的回调体与依赖数组；
    - `selectedCompany`、`selectedPeriod`、`companyOptions`、`periodOptions`、`error` 的求值表达式；
    - 两个 `onChange` 中的 `setParams(...)` 调用；错误条“重试”按钮的 `onClick`；
    - 无效选择提示与“已保存”提示的条件表达式；
    - `CloseWizard`、`TradePeriodAdmission` 两个 JSX 元素（含 `key`、全部 props 与 `next`、`onSaved` 回调）；
    - `tones`。
  - **R5d 插槽对等**：PR 正文用一张表列出“现状”中 `section` 内的 9 项（第 1 项按 a–d 列出），并标出 head 中对应的唯一组件或表达式。
- **R6 尺寸**：
  - 除上表 R6a、R6b 外，`PeriodClose.tsx` ≤ **120** 行（base 224 行）；
  - 新文件各 ≤ 150 行；每个新函数满足 ②：≤ 80 行，嵌套 ≤ 3 层；
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
  - 上限没有做试改构建：REFAC-28（#352，263 行，拆成 8 个文件）实测为 +450 B（gzip，`833d6d5` → 合并 head）；本函数 208 行，但展示组件要接收的值较多（选项、选中值、两种锁定、分页状态与回调），沿用 +600 B。
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
- 请求次数与时机不变（R4 直接断言 1、5、7）。
- 不跑 Bench。打包变化由 R7 约束。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥：

- **②**：`PeriodClose` 从 208 行拆到 ≤ 80 行（R6a）；拆后它只是“取选择状态 → 组合页头选择器、提示条、结账向导、期间准入、期间表”。
- **③**：`PeriodClose.tsx`（224 行）拆后 ≤ 120 行，新文件各 ≤ 150 行（R6）。PR 正文贴 `git diff --numstat`。
- **①**：文件与组件名表达职责，例如“期间选择”“页头选择器”“页面提示”“期间表”。不用 `part1`、`helpers2` 这类名字，也不与 REFAC-28 的 `close-*` 文件重名。
- **④**：
  - 查询、默认选择、锁定与 `held` 集中在一个自定义 Hook（或留在 `PeriodClose`），展示组件只接收值与回调；
  - 两种锁定的组合只有一处定义（决定 5）。
- **⑤**：“选择已锁定”条件去重（决定 5、R6b）。两个分页查询结构相似但游标编码不同，不合并（决定 3）；`t` 与向导中的同名定义各属一个组件，不合并；`["close-periods", company]` 的失效在 `TradePeriodAdmission` 与向导内，本任务不碰。
- **⑥**：不新增注释，除非某处拆分需要说明“为什么”，例如“向导在途时持有旧选择，避免刷新后的列表把正在处理的期间换掉”；不留调试输出。
- **测试耗时**：本任务不改测试；R4 驱动不提交。PR 正文附 `period-close.test.tsx` 与 `trade-period-admission.test.tsx` 在 base 与 head 上的耗时（vitest 汇总行原文）；两侧差异 > 20% 时说明原因。

## 用户可见变化

- 无。公司与期间的选择、分页加载、默认期间、两种锁定、错误重试、无效选择提示、“已保存”提示、期间表与中英文文本都不变（R3、R4）。

## 证据要求

- **不需要浏览器时段**：
  - 行为等价由 R3 与 R4（DOM 逐字节、请求、锁定、选择与 URL 的直接断言）证明；
  - e2e 依赖的 `#close-month`、准入控件与 `role="status"` 文本都在 R4 的逐字节比较中；
  - R4 与构建在本机运行，须服从协调者的时段静默通知（D442 / D480）。
- **可行性**（S13 回顾行动 4）：
  - 设计角色在 `7eb7b42` 上用临时 jsdom 脚本（驱动 B 的写法）跑通了 R4 直接断言 1–8 的全部场景，脚本已删除，未提交；
  - 注意：`fetch` 桩返回的 `nextCursor` 须是合法的公司代码 / 月份，否则 `companiesPageSchema` / `periodsPageSchema` 校验失败、“加载更多”不出现；`fireEvent.change` 选择期间前须先等期间选项就绪，否则值会落空；
  - R6a、R6b 与 R7 的 base 数字见“现状”，由设计角色实测。
- PR 正文附：
  - R2 的导出比较与 `git grep` 结果；
  - R3 汇总行；
  - R4 驱动（原件 base64 或两种 SHA-256）、步骤清单、比较结果、直接断言结果与三组场景的逐步输出；
  - R5a–R5d 各表；
  - R6 行数表（base 与 head 两列）；
  - R7 的 `bundle-measure.mjs` 完整输出与退出码；
  - 可读性一节；
  - 疑似缺陷登记（至少写明期间“加载更多”不随准入锁定禁用这一处是否保留，以及理由）。

  R8b 在合并后补到 PR 评论。

## 设计自查

- [x] 本批只有这一项页面拆分；冲突域与在岗 REFAC-26、REFAC-27 逐文件不相交。
- [x] 每条 base 失败、head 通过的检查都有 base 实测值；R7 的 base 字节已实测。
- [x] 分页、默认选择、两种锁定、持有旧选择、错误重试、无效选择与“已保存”都有 base 实测过的直接断言。
- [x] 可读性一节齐全；无用户可见变化。
- [x] 不加迁移，不碰 `scripts/slot/`、`scripts/measure/`。
