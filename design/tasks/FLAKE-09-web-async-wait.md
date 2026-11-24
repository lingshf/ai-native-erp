# FLAKE-09：web 测试在本机负载下的异步等待超时（只改测试设置）

- Sprint：S24（[计划草案](S24.md)）　类型：测试基础设施　优先级：P2　决定：[D527](S24.md#s24-期间决定)（根因与修法：路由模块预加载加集中异步等待上限，只改 `packages/web/test/setup.ts`）　建议分支：`flake-09-web-async-wait`
- 来源：[S22 回顾](../reviews/S22-retro.md)议题 3、行动 4 与候选 1（“查清 `waitFor` 超时的负载因素，决定是调默认超时还是限制 worker”）；S24 计划写明 FLAKE-09 在 REFAC-13 合并后排。[D526](S24.md#s24-期间决定)（REFAC-14 #326 中 `trade-orders.test.tsx` 导航用例超时判为原有偶发）是最近一次因此需要协调者逐案判定的实例。
- 迁移：**不加**。浏览器时段：**不需要**（只跑 jsdom 单元测试）。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 为什么是它

S22 的三个开发 PR（#311、#316、#320）与 S24 的 #326 都在本机默认并行全量 web 测试中遇到时间敏感的失败，失败文件每次不同，评审只能逐案判断“是否与改动有关”。S22 回顾行动 4 统一了送审命令与串行重跑，但没有消除失败本身。本任务把原因查实并在测试设置中一处修复，之后送审的本机全量命令应能在负载下稳定通过。

## 现状（main `ac8ac00`；设计角色试跑，16 核 Windows，Node v26.13.0）

- **配置**：`vitest.config.ts:106–110`：`maxWorkers: availableParallelism()`（本机 16）、`isolate: false`（同一 worker 内的文件共享模块图）、`testTimeout` / `hookTimeout` 15 000 ms；web 项目 `:160–164`，`setupFiles: ["./test/setup.ts"]`。
- **异步等待上限**：`packages/web` 内没有 `configure(` 或 `asyncUtilTimeout`（`git grep -n -e asyncUtilTimeout -e "configure(" -- packages/web` 无命中），所有 `findBy*` / `waitFor` 用 Testing Library 默认 1000 ms。`packages/web/test` 中也没有任何用例依赖 `findBy` / `waitFor` 超时被拒（`git grep -n -F ".rejects" -- packages/web/test` 无命中），加大上限只会让真实失败报告得更慢，不会改变通过与否。
- **路由懒加载**：`packages/web/src/App.tsx:20–61` 有 15 处 `lazy(() => import("./<Route>.tsx"))`（14 个模块，`Reports.tsx` 两处），`:426` 另有 `import("./ui/components/index.tsx")`。`App.test` 之外的页面测试大多渲染整个 `<App />` 再 `findByRole` 等页面出现。
- **setup.ts**：13 行，只有 `beforeEach` 清 `localStorage` 与 `afterEach` 清理。
- **既有依赖模块图的用例**：`overview-shared-ui.test.tsx:20–30` 每个用例 `vi.resetModules()` 后 `vi.doMock("../src/ui/components/index.tsx", …)`；`migration.test.tsx:296` 断言路由 `Suspense` 的加载提示。

### 试跑与归因（设计角色，命令与汇总行原文）

命令都在仓库根运行：`npx vitest run --project web [--maxWorkers=N]`。“预载”为开跑前 `Win32_Processor.LoadPercentage`，反映其他 session 的负载，不可控。试改 `setup.ts` 只在本地，未提交，每组结束后 `git checkout -- packages/web/test/setup.ts` 还原。

| 组 | 提交 | 设置 | 汇总行（逐次） |
| --- | --- | --- | --- |
| 默认并行 | `32aaea7` | 原样，16 worker | `Tests  11 failed \| 373 passed (384)`；`Tests  9 failed \| 375 passed (384)`；`Tests  384 passed (384)` |
| 限制 worker | `32aaea7` | 原样，`--maxWorkers=8` | `Tests  384 passed (384)`；`Tests  384 passed (384)`；`Tests  1 failed \| 383 passed (384)`（预载 88%） |
| 只加上限 | `32aaea7` | `asyncUtilTimeout: 3000`，16 worker | 3 次 `Tests  384 passed (384)`（预载 84% / 97% / 63%） |
| 超订 base | `32aaea7` | 原样，`--maxWorkers=32` | `Tests  9 failed \| 375 passed (384)`；`Tests  2 failed \| 382 passed (384)`；`Tests  5 failed \| 379 passed (384)` |
| 超订 base | `ac8ac00` | 原样，`--maxWorkers=32` | `Tests  5 failed \| 379 passed (384)`；`Tests  1 failed \| 383 passed (384)` |
| 超订，只加上限 | `32aaea7` | `asyncUtilTimeout: 3000`，`--maxWorkers=32` | `Tests  1 failed \| 383 passed (384)`；`Tests  384 passed (384)`；`Tests  384 passed (384)` |
| 超订，只预加载 | `32aaea7` | 路由预加载，`--maxWorkers=32` | `Tests  1 failed \| 383 passed (384)`；`Tests  384 passed (384)`；`Tests  1 failed \| 383 passed (384)` |
| 超订，两者都加 | `32aaea7` | 预加载 + 3000 ms，`--maxWorkers=32` | 4 次 `Tests  384 passed (384)`（预载 72% / 52% / 38% / 49%） |

- **失败形态**：默认并行两次失败的 20 个用例全部是异步等待到期：`Unable to find role=… / text …`，或 `waitFor` 内的断言（如 `expected [] to deeply equal [ 1, 2 ]`）；单个用例耗时 1.0–1.4 s，即刚过 1000 ms 上限；分布在 9 个文件（`accounts`、`business-events`、`journals`、`ledger-reports`、`period-close`、`trade-invoice-detail`、`trade-list-refresh`、`trade-orders`、`trade-reports`）。
- **位置集中在文件开头**：20 个中 16 个是所在文件的第 1 或第 2 个用例（例如 `trade-orders.test.tsx` 的“is reachable from the shell navigation”，即 D526 那一条）。`isolate: false` 下，worker 第一次渲染某个路由时要现场转换并加载该路由模块，这段时间落在第一个 `findBy` 的 1 s 内。
- **推断**（试跑只能支持，不能证明）：失败由“首次懒加载路由的转换与加载”加“CPU 竞争下的 jsdom 渲染”两部分叠加超过 1 s 造成。只预加载或只加上限，超订下仍各有失败；两者都加时 4 次全过。限制 worker 不能消除失败（`--maxWorkers=8` 在高预载下仍失败），而且会拖慢 CI 以外所有人的本机全量。

### chunk 归属与首屏（S22 回顾行动 3）

本任务只改 `packages/web/test/setup.ts`，它只被 vitest 加载，不进 `vite build` 的任何 chunk。首屏、路由与其他 chunk 都是 ±0，不需要 `bundle-measure.mjs`；R1 的 `git diff --name-only` 即证明。

## 范围与决定

1. **D527 修法**：只改 `packages/web/test/setup.ts`，做两件事：
   - **路由预加载**：在 `beforeAll` 中加载 `App.tsx` 懒加载的全部模块，把首次转换与加载的耗时移到钩子里（受 `hookTimeout` 15 000 ms 约束），不再计入第一个 `findBy` 的等待。模块清单不得手抄：用 `import.meta.glob` 从 `../src/*.tsx`（排除 `../src/main.tsx`，它在导入时就要求 `#root`）与 `../src/ui/components/index.tsx` 取得，新增顶层路由文件自动覆盖。
   - **集中异步等待上限**：`configure({ asyncUtilTimeout: … })`，值 **3000 ms**，用一个具名常量（例如 `ASYNC_WAIT_MS`），配“为什么”注释，写明依据（本任务书试跑；是 `testTimeout` 的 1 / 5，一个用例内连续几次等待仍在上限内）。
2. **不做**：不改 `vitest.config.ts`（`maxWorkers`、`isolate`、`testTimeout` 都不动）；不在单个测试文件里加 `timeout` 或改等待写法；不改产品代码；不改 `scripts/test-shard-weights.json`；不改送审命令（[TEMPLATE](TEMPLATE.md#证据要求) 的 `npx vitest run --project web` 不变）。
3. **预加载失败要报错**：`import.meta.glob` 的结果为空，或任一模块加载抛错时，`beforeAll` 失败（不吞异常），以免预加载静默失效。
4. 若实测发现 3000 ms 不足或预加载有副作用（例如改变某个用例对加载提示的断言），先停下报协调者，不自行改值或改为限制 worker。

## 冲突域

- `packages/web/test/setup.ts`（所有 web 测试共用的单文件）。本任务在途期间，其他任务不得改这个文件。
- 与 SLOT-06（`scripts/slot/`）逐文件不相交；REFAC-14 已合并（#326）。不改产品代码，与之后的页面任务也不相交，但它们的送审基线会随本任务合并而变：本任务合并前开出的 PR，本机全量结果按其各自 base 解读。
- 不改 `package.json` / lock，不加依赖（`@testing-library/react` 的 `configure` 已可用）。

## 验收

### base 失败、head 通过

| 编号 | 检查 | base（`ac8ac00` 或实际合并基） | head 要求 |
| --- | --- | --- | --- |
| F1 | **超订复现协议**：本机，`npx vitest run --project web --maxWorkers=32`，base 与 head **交替**各跑 5 次（B H B H …，让两侧承受相近的外部负载）；每次记开跑前 CPU 预载与 `node` 进程数 | 至少 1 次失败（设计角色试跑 5 / 5 失败） | 5 次全部 `Tests  384 passed (384)`（用例总数以实际 base 为准，两侧相同） |
| F2 | `git grep -n -e asyncUtilTimeout -e "import.meta.glob" -- packages/web/test/setup.ts` | 无命中（失败） | 两处各 1 行命中：具名常量取值 3000 的 `configure`，与决定 1 的 `import.meta.glob` |

- **F1 无法判定**：base 5 次全过时，记为“无法判定”，不算通过；再交替各跑 5 次，仍全过则停下报协调者（附全部汇总行与预载），不自行改协议。
- **F1 失败**：head 任一次失败即不通过，附失败文件与用例，并按“测试命令”串行重跑这些文件，原文附上。

### 两侧都须成立的不变量

- **R1 范围**：`git diff --name-only <base> <head>` 只有 `packages/web/test/setup.ts`。
- **R2 用例不变**：base 与 head 的用例集合相同：各用 `--reporter=json` 跑一次，按“文件 › 标题”排序后比较，PR 正文附两侧条目数与比较结果（应为相同）。
- **R3 预加载覆盖**：`App.tsx` 中所有 `import("./…")` 的目标都在预加载清单内。PR 正文附 `git grep -n 'import("./' -- packages/web/src/App.tsx` 的原文，与 head 上实际预加载的模块路径（在 `beforeAll` 中临时打印一次后删除，或用一次性脚本求 glob 结果），两者求差为空。
- **R4 依赖模块图的既有用例通过**：`overview-shared-ui.test.tsx`（`resetModules` + `doMock` 共享组件）与 `migration.test.tsx`（路由 `Suspense` 加载提示）在 head 上单独跑与全量跑都通过，PR 正文附汇总行。
- **R5 默认命令**：head 上 `npx vitest run --project web`（默认 16 worker）连跑 3 次全过，附汇总行与预载。
- **R6 CI 耗时**：同一 head 的 main Full 绿。PR 正文列出 base 与 head 同 workflow 中含 web 用例的各 unit 分片的 vitest `Duration` 行原文；任一分片增加超过 3 s 时，先报协调者再合并。
- **R7 失败仍能报告**：在本地临时把一个用例的 `findByRole` 名称改错（不提交），head 上该用例在约 3 s 后以原有的 `Unable to find role` 失败，附输出；证明上限生效且没有吞掉失败。

### 测试命令（S22 回顾行动 4）

- 本机全量 web 测试一律用 `npx vitest run --project web`，附汇总行原文。F1 是本任务专用的复现协议，另用 `--maxWorkers=32`，不替代送审命令。
- 有失败时，逐个列出失败的文件与用例，并附只对这些文件的串行重跑原文：`npx vitest run --project web --no-file-parallelism <失败文件…>`。

## 性能考虑

- **本机**：每个 worker 在首个文件前预加载一次全部路由模块（`isolate: false` 下之后的文件复用），全量耗时与预加载前的总和相近；试跑中“两者都加”的 `Duration` 为 46–48 s（32 worker），默认并行原样为 37–46 s（16 worker），两者负载不同，不作比较依据，以 R5、R6 的实测为准。
- **CI**：每个含 web 用例的分片多一次全部路由的加载，由 R6 约束。
- **失败报告变慢**：真实失败的异步断言从 1 s 变为 3 s 才报告，可接受（R7）。
- 其余项（规模、索引、查询次数、分页、事务、打包）不适用。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥：

- **③**：`setup.ts` 13 行，净增 ≤ 15 行。
- **①⑤**：上限用具名常量；预加载的变量名说明用途（例如 `lazyRouteModules`），不用 `modules`、`x`。
- **⑥**：两条“为什么”注释，各 1–3 行：为什么预加载（`isolate: false` 下首次懒加载的转换落在第一个 `findBy` 的等待里，引 FLAKE-09）；为什么是 3000 ms（引本任务书试跑与 `testTimeout` 的关系）。不留调试输出（R3 的临时打印须删除）。
- **测试耗时**：本任务改的就是测试设置；PR 正文附 R5、R6 的耗时原文。

## 用户可见变化

- 无。产品代码、界面、文案与打包产物都不变（R1、“chunk 归属与首屏”）。
- 对开发与评审：本机默认并行全量 web 测试在负载下不再因异步等待偶发失败（F1、R5），送审不必再逐案判定“原有偶发”（D526 这类）；真实失败的异步断言约 3 s 后报告。

## 证据要求

- **不需要浏览器时段**；F1、R5 与 R7 在本机运行，须服从协调者的时段静默通知（D442 / D480），F1 的 10 次运行约 10 分钟。
- **可行性**（S13 回顾行动 4）：F1 的复现协议、两种修法的组合与 `import.meta.glob` 排除 `main.tsx` 的写法，设计角色都已在 `32aaea7` / `ac8ac00` 上试跑（见“现状”），未提交任何代码。
- **数字附原文**：F1 的 10 行汇总行、每次的预载与 `node` 进程数；R2 的比较输出；R3 的两份清单；R4、R5 的汇总行；R6 的分片 `Duration` 行；R7 的失败输出。
- PR 正文“当前状态”置顶；附 `setup.ts` 的完整 diff 与可读性一节。
