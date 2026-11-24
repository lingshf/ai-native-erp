# MEAS-02：拆分 `bundle-compare.mjs`（不改行为）

- Sprint：S24（[计划草案](S24.md)）　类型：重构（工具脚本）　优先级：P3　决定：[D529](S24.md#s24-期间决定)（只改代码组织、不改行为；见“设计决定”）　建议分支：`meas-02-split-bundle-compare`
- 来源：[S24 候选](S24.md#候选s24-其余泳道s23-评审后定)“`bundle-compare.mjs` 拆分（300 行上限）”，S20–S22 回顾候选 4，原定“下次改它之前做”。按 [S22 回顾行动 3](../reviews/S22-retro.md#行动项汇总) 写出 chunk 归属与首屏预算；按 #327 评审 6034449046 的口径，main Full 只作合并后检查。
- 迁移：**不加**。浏览器时段：**不需要**。
- 数据：只用本仓库源码构建出的 `dist`；不读取真实旧账、4173 账套或 `.bak` 文件。

## 为什么是它

- `scripts/measure/bundle-compare.mjs` 正好 **300 行**，等于 [MEAS-01](MEAS-01-bundle-measure-script.md) 可读性 ③ 的上限（每个脚本 ≤ 300 行）。下一个改体积口径或报告格式的任务，加一行就超限，到时还得先拆再改，评审面翻倍。
- 现在有一个空开发位，又没有任务在改它，提前拆最省事；拆完留出余量（R6a）。
- **与在途任务不冲突**：只改 `scripts/measure/`。FLAKE-09 只改 `packages/web/test/setup.ts`，REFAC-15 只改 `packages/web/src/TradeReports.tsx` 与 `trade-reports/`，逐文件不相交。本任务不是页面拆分，不占“同一时间只有一个页面拆分在途”的名额。
- **为什么不是其他候选**：Demo 全产物清单脚本化与门禁判定检查器都要等 DEMO-23 用过 SLOT-06（#322 刚合并，v0.22.0 尚未发布）；`RuleSettings` 等属于页面拆分，REFAC-15 在途；多订单合并开票要加迁移；M2-05 / M2-06 仍待用户决定；`-HASH` 口径写进文档不占开发泳道。

## 现状（main `e4a9fec`）

下文 `file:line` 都按 `e4a9fecb6c22036b5243770689f67318d9ea8135`。

- `scripts/measure/` 有三个文件：`bundle-compare.mjs`（300 行）、`bundle-measure.mjs`（149 行）、`README.md`（121 行）。只用 Node 内置模块。
- `bundle-compare.mjs` 按职责分为以下几段（行号为声明起点）：
  1. 常量与错误：`EXIT_CODES`、`GZIP_LEVEL`、`D454_MASKED_TOLERANCE_BYTES` 与各正则（`:8–25`），`measureError` / `usageError`（`:27–28`）；
  2. 哈希与小工具：`maskHashes`、`unhashedName`、`sha256`、`sorted`、`sameSet`、`signed`、`sum`（`:31–37`）；
  3. 构建图与字节：`assetBytes`、`loadBuild`、`fileBytes`、`keyOfFile`、`staticClosure`、`firstScreenClosure`、`routeAddedKeys`、`jsBytes`、`bytesOf`、`routeAddedBytes`、`routeCss`（`:40–112`）；
  4. D454：`sortPreloads`、`chunkText`、`preloadFiles`、`preloadTable`、`sortedText`、`d454Verdict`（`:114–145`）；
  5. 预算项与判定：`routeKeys`、`measuredSide` 等取值函数、`budgetItems`、`parseLimit`、`checkBudgets`、`BUDGET_FLAGS`、`addKeyedLimit`、`parseBudgetArgs`（`:147–233`）；
  6. 报告：`assetDigests`、`routeCssLines`、`budgetRow`、`formatReport`（`:235–271`）；
  7. 入口：`compareDists`（`:273–281`）、`main`（`:283–291`）与 `import.meta.main` 分支（`:293–300`）。
- **导出面**（`await import()` 实测，按名排序，共 23 个；R2 的 base 一侧）：

  ```text
  D454_MASKED_TOLERANCE_BYTES,EXIT_CODES,GZIP_LEVEL,assetBytes,assetDigests,budgetItems,checkBudgets,compareDists,d454Verdict,firstScreenClosure,formatReport,loadBuild,maskHashes,measureError,parseBudgetArgs,parseLimit,routeAddedBytes,routeAddedKeys,routeCss,sortPreloads,staticClosure,unhashedName,usageError
  ```

- **导入方**：
  - `scripts/measure/bundle-measure.mjs:10–16` 导入 `compareDists`、`EXIT_CODES`、`measureError`、`parseBudgetArgs`、`usageError`；
  - `packages/infra/test/tooling/bundle-compare.test.ts:6–17` 导入 10 个函数与常量（201 行，8 个用例 M2–M7），`:18` 另从 `bundle-measure.mjs` 导入 `parseMeasureArgs`；
  - 仓库内没有其他导入方（`git grep -n "bundle-compare" -- scripts packages package.json .github`）。
- **质量门覆盖**：`biome.json` 的 `includes` 含 `scripts/**`；根 `tsconfig.json` 不包含 `scripts/measure/`，`typecheck` 不检查它。`scripts/test-shard-weights.json:61` 登记了上述测试文件。
- **文档引用**（D460）：`git grep -c -F "bundle-compare.mjs" -- docs design` 共 25 行，都是历史记录或用法说明，不改；`scripts/measure/README.md` 的文件表（`:6–9`）须随本任务更新。

### chunk 归属与首屏预算（S22 回顾行动 3）

- `scripts/measure/` 不在 Web 构建中，也不被 `packages/web` 导入。改动文件**不属于任何 chunk**，首屏、所有路由、所有 chunk 与 CSS 一律 **±0**；由 R1（`packages/` 下 diff 为空）保证，**不需要**跑 `bundle-measure.mjs` 测体积。

## 设计决定（产品负责人）

1. **不改行为**（D529）：命令行的标准输出、标准错误与退出码，在同样的参数与 `dist` 下逐字节不变；`bundle-compare.mjs` 的导出名、导出值与导出函数的源文本不变；`bundle-measure.mjs` 与测试文件不改。不修 bug、不改报告格式、不加参数；发现的疑似问题登记在 PR 正文，留作后续任务。
2. **入口不变**：`bundle-compare.mjs` 仍是唯一的命令行入口和对外模块。它保留 `compareDists`、`main` 与 `import.meta.main` 分支，并以 `export { … } from "./…"` 转出其余 22 个导出，使两个导入方无需修改。
3. **原样搬移**：函数与常量的声明连同上方的 D432 / D454 / D460 / D487 注释整体搬到新模块，文本逐字不变。允许的改动只有：`import` / `export` 语句；被其他模块用到的内部函数或常量在声明前加 `export`；新模块顶部一行说明职责的注释；`bundle-compare.mjs` 头注释的“Usage”一行保持原文。
4. **每个声明只定义一次**：`sorted`、`sum` 等小工具放在一个模块中由他处导入，不得复制。
5. **模块依赖单向、无环**：新模块不得导入 `bundle-compare.mjs`；新模块之间不得循环导入。导入新模块不得有副作用（不读文件、不打印、不设退出码）。
6. **文件**：新文件放在 `scripts/measure/`，按职责命名，例如 `bundle-graph.mjs`（构建图与字节，含常量与小工具）、`bundle-d454.mjs`（D454 判定）、`bundle-budgets.mjs`（预算项、限额与参数解析）、`bundle-report.mjs`（报告与资产摘要）。粒度由开发定，写入 PR 正文；不新建子目录。
7. **不改**：`bundle-measure.mjs`；`packages/**`（含测试 `packages/infra/test/tooling/bundle-compare.test.ts`）；`scripts/test-shard-weights.json`；`biome.json`、`tsconfig.json`、`package.json` / lock；`docs/**` 与 `design/**`；`scripts/slot/**`。

## 范围

- 改：`scripts/measure/bundle-compare.mjs`；新增：`scripts/measure/` 下的新模块；更新：`scripts/measure/README.md` 文件表（列出新模块各一行），并把“口径只在这里实现”改为“口径只在 `bundle-compare.mjs` 及其导入的模块中实现”。

## 不在范围

- 改 D432 / D454 口径、报告格式、退出码含义或参数。
- 给 `scripts/measure/` 加类型检查或改 Biome 配置。
- 拆分或修改 `bundle-measure.mjs`（149 行，未到上限）。

## 冲突域

- tooling:measure：只改 `scripts/measure/`。
- 受影响的 e2e 断言：无（不改 Web 与服务端）。
- 与在途任务：FLAKE-09（`packages/web/test/setup.ts`）、REFAC-15（`packages/web/src/TradeReports.tsx`、`trade-reports/`）逐文件不相交。
- **与 REFAC-15 的 R7 测量**：REFAC-15 用 `bundle-measure.mjs` 报体积，并写明脚本所在的提交 SHA。本任务若先合并，REFAC-15 按实际合并基上的脚本测量即可；R4 保证同样输入下输出逐字节相同，不需要重测已有结果。

## 验收标准

### base 失败、head 通过

| 编号 | 检查 | base `e4a9fec` | head 要求 |
| --- | --- | --- | --- |
| R6a | `scripts/measure/*.mjs` 各文件行数（`(Get-Content <file>).Count`） | `bundle-compare.mjs` **300**（无余量，失败） | `bundle-compare.mjs` ≤ 80；每个新模块 ≤ 150；`bundle-measure.mjs` 仍为 149 |

### 两侧都须成立的不变量

- **R1 范围**：`git diff --name-only <base> <head>` 只含 `scripts/measure/bundle-compare.mjs`、`scripts/measure/README.md` 与 `scripts/measure/` 下的新 `.mjs` 文件；决定 7 所列文件的 diff 为空。不加迁移。
- **R2 导出面不变**：用一段临时脚本分别 `import()` base 与 head 的 `bundle-compare.mjs`，比较：
  - 导出名排序后逐字相同（上文 23 个）；
  - `EXIT_CODES`、`GZIP_LEVEL`、`D454_MASKED_TOLERANCE_BYTES` 的值 `assert.deepStrictEqual` 相同，`EXIT_CODES` 仍为冻结对象；
  - 20 个导出函数的 `Function.prototype.toString()` 逐字相同（验证原样搬移）。
  PR 正文附脚本全文与输出。
- **R3 既有测试原样通过**：`npx vitest run packages/infra/test/tooling/bundle-compare.test.ts` 的 8 个用例在 base 与 head 上都通过，测试文件 diff 为空；PR 正文附两侧汇总行原文。
- **R4 命令行输出等价**（送审证据，脚本不提交）：
  - **准备**：用 base 上的 `bundle-measure.mjs` 构建一对真实 `dist`：`--base 32aaea7…`（REFAC-13 合并点）`--head ac8ac00…`（REFAC-14 合并点，`BusinessEvents` 路由有真实差异）`--work C:\tmp\meas-02-dists`，写完整 40 位 SHA。以下记 `A = …\base\packages\web\dist`、`B = …\head\packages\web\dist`。另建 base 的分离 worktree，用于运行 base 一侧的脚本。
  - **用例**（每例在 base 脚本与 head 脚本上各跑一次，记录 stdout、stderr、退出码）：
    - C1 `A B`（不给预算，预期有 FAIL 行，退出码 1）；
    - C2 `A B --route src/BusinessEvents.tsx=+5000 --chunk src/BusinessEvents.tsx=+5000 --d454`，以及按 C1 的输出把其余变化项也放宽到能通过的参数（预期退出码 0；PR 正文写明最终参数）；
    - C3 `A A`（同一份 `dist`，全部 ±0，退出码 0）；
    - C4 用法错误，各一例：只给一个目录；`--chunk nokey`；`--route src/Nope.tsx=+1`；`--first-screen abc`；指向没有 `.vite/manifest.json` 的目录（均为退出码 2）；
    - C5 `node --input-type=module -e "await import('./scripts/measure/bundle-compare.mjs')"`（只导入不运行：无输出，退出码 0）；
    - C6 经 `bundle-measure.mjs` 的参数拒绝路径：短 SHA、已存在的 `--work`、未知参数（不触发构建）。
  - **判定**：每个用例的 stdout、stderr 与退出码，在 base 与 head 上逐字节相同；并且直接断言 C1 退出码为 1、C2 与 C3 为 0、C4 为 2（只比两侧相同不够：两侧都错也会相同）。PR 正文附脚本全文、各用例两侧输出的 SHA-256、比较结果，以及 C1 的输出原文。
- **R5 结构规则**（静态，评审按代码与 PR 表格核对）：
  - **R5a 原样搬移**：PR 正文附 `git diff --color-moved=plain -M <base> <head> -- scripts/measure` 的输出；除决定 3 允许的改动外没有新增或修改的行。
  - **R5b 依赖图**：PR 正文列出各模块的 `import` 关系（文本或 mermaid），无环，且新模块不导入 `bundle-compare.mjs`。
  - **R5c 唯一定义**：每个函数与常量在 `scripts/measure/` 中只声明一次（PR 正文附 `git grep -nE "^(export )?(const|function) " -- scripts/measure` 的结果）。
- **R6 尺寸**：除 R6a 外，`README.md` ≤ 150 行；没有函数超过 ② 上限（≤ 80 行、嵌套 ≤ 3 层，搬移前后都满足）。PR 正文贴 `git diff --numstat`。
- **R7 打包字节**：首屏 ±0、所有路由与 chunk ±0，由 R1 保证（见“chunk 归属与首屏预算”），不另测。
- **R8 质量门**：
  - **R8a 合并前**：`npx biome ci scripts/measure`、`npm run typecheck`、CI-02 预检通过；PR CI（`ci.yml`）绿。
  - **R8b 合并后检查（不作合并门）**：合并后第一次覆盖该合并提交的 main Full 须绿；失败时报协调者，按 D456 暂停后续合并。
- **R9 可读性一节**：PR 正文按下节逐条说明。

## 性能考虑

- 不改计算：同样读取 manifest、`index.html` 与资产文件，`fileBytes` 的缓存仍挂在 `build.bytes` 上；模块拆分只多几次 ESM 加载。不跑 Bench。其余项（规模、索引、查询、分页、事务）不适用。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥：

- **③**：本任务就是为满足 ③ 而做。`bundle-compare.mjs` 从 300 行拆到 ≤ 80 行，新模块各 ≤ 150 行（R6a），为下一个改口径的任务留出余量。
- **①**：模块名表达职责（决定 6 的例子），不用 `part1`、`utils2`。
- **④**：按“构建图 → D454 → 预算 → 报告 → 入口”的单向依赖分层（R5b）。
- **②、⑤**：函数原样搬移，不改长度与常量。
- **⑥**：新增注释只有每个新模块顶部的一行职责说明；不留调试输出。
- **测试耗时**：不改测试。PR 正文附 `bundle-compare.test.ts` 在 base 与 head 上的耗时（vitest 汇总行原文），两侧差异 > 20% 时说明原因。

## 用户可见变化

- 无。ERP 用户不受影响（不改 Web、服务端与数据）。对开发者，`node scripts/measure/bundle-compare.mjs` 与 `bundle-measure.mjs` 的参数、输出与退出码都不变（R4），`scripts/measure/README.md` 的文件表多出新模块。

## 证据要求

- **不需要浏览器时段**：等价由 R2–R4 在本机证明。R4 的两次构建在本机运行，须服从协调者的时段静默通知（D442 / D480）；构建所用 worktree 在 PR 送审后按 `bundle-measure.mjs` 打印的清理命令删除。
- **可行性**（S13 回顾行动 4）：R6a 的 base 行数、导出面与导入方由设计角色在 `e4a9fec` 上实测（见“现状”）；`bundle-measure.mjs` 构建一对 `dist` 的做法已在 REFAC-12 至 REFAC-14 的 R7 中跑通。
- PR 正文附：R2 脚本与输出；R3 汇总行；R4 脚本、各用例 SHA-256、比较结果与 C1 原文；R5a–R5c 输出；R6 `numstat`；可读性一节。R8b 合并后补到 PR 评论。

## 设计自查

- [x] 不加迁移、不需要浏览器时段、不读真实账套。
- [x] base 失败、head 通过的判据（R6a）与两侧不变量（R1–R5）分开写；R4 除两侧相同外另有直接断言。
- [x] 改动文件的 chunk 归属与首屏预算已写明（不属于任何 chunk，全部 ±0）。
- [x] 与 FLAKE-09、REFAC-15 逐文件不相交；不是页面拆分。
- [x] main Full 只作合并后检查（R8b）。
- [x] 用户可见变化已写明（无）。
