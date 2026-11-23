# MEAS-01：体积测量脚本入库（`scripts/measure/`）

- Sprint：S20（[计划](S20.md)）　类型：开发工具　优先级：P1　决定：待协调者定编号　建议分支：`meas-01-bundle-measure`
- 来源：[S18 回顾](../reviews/S18-retro.md)行动 4（“测量脚本入库”，协调者已批准为 S20 候选）。
- 迁移：**不加**。浏览器时段：**不需要**。不改 `packages/web/`、`packages/core/`、`packages/server/` 的任何源码。
- 数据：只用虚构数据与仓库内构建产物；不读取真实旧账、4173 账套或 `.bak` 文件。

## 为什么做

- 每个改动 Web 的任务都要在 PR 里报体积（S14 回顾行动 1、D432、D454、D460、D487），但测量脚本一直是**每个 PR 临时附带**：
  - #284 / #288 用 `bundle-measure.ps1` + `bundle-compare.mjs`（首屏 = `index.html` 入口 + `modulepreload` + 静态导入闭包；逐资产原始字节与屏蔽哈希后的 gzip-9）；
  - #285 / #291 用 `r7-build.mjs` + `r7-bytes.mjs`（`vite build --manifest`，读 `dist/.vite/manifest.json`，按 D432 算“路由新增”JS）。
- 后果：同一口径有两套实现；评审每次要读一遍新脚本；“构建来源”字段由人手抄，S17、S18 都出过数字或哈希抄错的返工（D487、D495）。入库后，任务书只需写“用 `scripts/measure` 在某提交上的输出”，评审只核对输出。

## 现状（main `3f8f2ff`）

- `git ls-files scripts/measure` 为空；仓库内没有任何体积测量脚本。
- 历史口径的出处（只作对照，不改）：
  - 首屏：#288 正文的“构建来源”与比较表：合并基 `19cd963b4a0451e73a4264f956b5c2b9e34ad3af` → head `06a73da8387a6006f1b7faae941ada7384df42f4`，首屏 JS 掩码 gzip-9 **160933 → 160942（+9 B）**。
  - 路由新增：#291 正文：合并基 `19cd963b4a0451e73a4264f956b5c2b9e34ad3af` → head `aabfeb7373e97155f8865b1f66258ad044577253`，路由新增 JS **18739 → 19004（+265 B）**，其中 `TradeOrders` 块 **12729 → 12994**。
- Web 构建：`npm run build --workspace @erp/web` 即 `vite build`；`packages/web/vite.config.*` 没有 `build.manifest`，需在命令行加 `--manifest`。
- 工具类测试在 `packages/infra/test/tooling/`（`boundaries.test.ts`、`ci.test.ts`），在 `scripts/test-shard-weights.json:60–61` 有权重。
- “构建来源”字段见 [任务书模板](TEMPLATE.md) “证据要求”（`TEMPLATE.md:100`）。

## 范围与决定

1. **文件**（只新增，不改既有脚本）：
   - `scripts/measure/bundle-measure.mjs`：编排。给定 base 与 head 两个完整 SHA，各建一个新的分离 worktree，`npm ci`，`npm run build --workspace @erp/web -- --manifest`，收集产物，调用比较模块，打印报告。
   - `scripts/measure/bundle-compare.mjs`：纯函数（读两个 `dist` 目录，算首屏闭包、路由新增、逐块字节与预算判定）加一个薄 CLI（可直接比较两个已有 `dist`）。
   - `scripts/measure/README.md`：用法、口径（引用 D432、D454、D460、D487）、退出码、示例输出。
   - `packages/infra/test/tooling/bundle-compare.test.ts`：单元测试（用测试内构造的小型假 `dist`，不跑真实构建）。
   - `scripts/test-shard-weights.json`：只加上面测试文件的一行（S20 内只有本任务改这个文件）；不运行 `node scripts/ci.ts weights` 重算。
2. **只用 Node 内置模块**（`node:fs`、`node:path`、`node:zlib`、`node:crypto`、`node:child_process`）。不改 `package.json`、`package-lock.json`，不加依赖。
3. **口径**（与历史一致，不新定）：
   - 字节：原始字节与 gzip-9；**屏蔽哈希**：文件名与内容里的 Vite 内容哈希先替换为固定占位再压缩（同 #288 `bundle-compare.mjs`）。
   - 首屏：`index.html` 的入口脚本、`modulepreload` 与它们的静态导入闭包（按 manifest 的 `imports`）。判定按 D454 的四条规则。
   - 路由新增：某路由懒加载入口（manifest 的 `isDynamicEntry`）的静态导入闭包减去首屏闭包（D432）。
   - CSS：逐路由列出集合与字节。
   - 以 manifest 的源文件键（如 `src/TradeOrders.tsx`）而非带哈希的文件名对齐 base 与 head。
4. **预算**：命令行参数 `--first-screen <±B>`（或 `--d454`）、`--chunk <源键>=<+B>`、`--route <源键>=<+B>`，可多次给出；**未列出的项默认 ±0**。每项打印 base、head、差值、上限与 PASS / FAIL。
5. **来源与干净性**（D460、D487）：两侧分别打印 `git rev-parse HEAD`、`git status --porcelain`（须为空）、`node -v`、`npm -v`、OS、`git rev-parse <sha>:package-lock.json`、完整命令行，以及逐资产 SHA-256（不截断）。即 TEMPLATE“构建来源”全部字段，可整段贴进 PR。
6. **退出码**：0 全部 PASS；1 有预算 FAIL；2 参数错误；3 来源或干净性错误（非 40 位 SHA、工作目录已存在、工作区不干净、两侧 lockfile blob 不同）。
7. **安全**：
   - 只接受完整 40 位小写 SHA；拒绝分支名与短 SHA。
   - 工作目录由 `--work <dir>` 指定且必须不存在；脚本不删除任何不是它本次创建的目录，结束后打印清理命令而不自动删除。
   - 不占端口，不启动服务。
8. **不改**：`scripts/slot/**`、`scripts/demo/**`、`scripts/ci.ts`、`.github/**`、`packages/**/src/**`、`packages/web/vite.config.*`、`docs/**`、`design/**`。CI 不新增作业；`TEMPLATE.md` 的引用由设计角色在本任务合并后另开设计 PR 更新。

## 冲突域

- tooling:measure：`scripts/measure/**`（新目录）、`packages/infra/test/tooling/bundle-compare.test.ts`（新文件）、`scripts/test-shard-weights.json`（加一行）。
- 与 S20 其他任务不相交：REFAC-11 只改 `packages/web/src/trade-orders/`；TLIST-04 只改 `Dimensions.tsx` 与 `dimensions.test.tsx`。它们都不改 `scripts/test-shard-weights.json`。
- 受影响的 e2e：无。受影响的文档引用：无（新路径）。

## 验收

### base 失败、head 通过

| 编号 | 检查 | base `3f8f2ff` | head 要求 |
| --- | --- | --- | --- |
| M1 | `git ls-files scripts/measure packages/infra/test/tooling/bundle-compare.test.ts` | 空（失败） | 列出决定 1 的 4 个新文件 |
| M2 | 屏蔽哈希：只有哈希不同的两个假资产 | 无脚本（失败） | 掩码 gzip-9 相同、差值 0；内容真变时差值非 0 |
| M3 | 首屏闭包：假 manifest 中入口 → 静态导入 → 再导入，加一个动态导入 | 无脚本（失败） | 闭包含前三者、不含动态导入块 |
| M4 | D454 四条规则各一个正例、一个反例 | 无脚本（失败） | 判定与 D454 原文一致 |
| M5 | 预算：在上限内、等于上限、超过上限、未列项变化 1 B | 无脚本（失败） | PASS、PASS、FAIL、FAIL（默认 ±0）；退出码 0 / 0 / 1 / 1 |
| M6 | 路由新增：两个懒加载路由共用一个块 | 无脚本（失败） | 共用块计入两条路由，首屏块不计入 |
| M7 | 参数校验：短 SHA、分支名、已存在的 `--work`、未知参数 | 无脚本（失败） | 退出码 3、3、3、2，错误信息说明原因 |
| M8 | 真实运行：base = head = 本任务送审 head 的实际合并基 | 无脚本（失败） | 所有项 ±0，两侧逐资产 SHA-256 相同，退出码 0；PR 正文附完整输出 |
| M9 | 复现历史：#288 对（首屏）与 #291 对（路由新增），SHA 见“现状” | 无脚本（失败） | 首屏 160933 → 160942；路由新增 18739 → 19004、`TradeOrders` 块 12729 → 12994；PR 正文附完整输出 |

- M2–M7 写成 `bundle-compare.test.ts` 的用例（在 base 上因模块不存在而失败）。M1、M8、M9 是送审证据。
- **M9 不一致时**：不得改口径去凑数。PR 正文写明两边的环境（Node / npm / OS / lockfile blob）与逐资产差异，停下报设计角色，由设计角色决定以哪边为准。历史数字只核对固定来源（D495），不要求重跑 #288 / #291 的旧脚本。
- **`--manifest` 不改产物**：PR 正文附一次对比，同一 SHA 上普通构建与 `--manifest` 构建的 JS / CSS 逐资产 SHA-256 相同（只多出 `.vite/manifest.json`）。

### 不变量

- **M10 范围**：`git diff --name-only <base> <head>` 只含决定 1 的文件；决定 8 所列 diff 为空；没有迁移。
- **M11 Web 体积 ±0**：本任务不改 Web 源码，M8 即证明。
- **M12 质量门**：`typecheck`、`lint`（biome 覆盖 `scripts/`）、CI-02 预检、边界检查、分片权重检查通过；PR CI 绿；合并后覆盖该合并提交的 main Full 绿。

## 性能考虑

- 一次 M8 / M9 运行包括两次 `npm ci` 与两次构建，属于本机开发操作，须服从协调者的时段静默通知（D442 / D480）。单元测试不跑真实构建，`bundle-compare.test.ts` 应在 2 s 内完成。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥：

- **②**：每个函数 ≤ 80 行、嵌套 ≤ 3 层；PR 正文列出超过 60 行的函数。
- **③**：每个脚本 ≤ 300 行；测试文件 ≤ 300 行；README ≤ 150 行。PR 正文贴 `git diff --numstat`。
- **①**：函数名表达口径，如 `firstScreenClosure`、`routeAddedBytes`、`maskHashes`、`checkBudgets`，不用缩写。
- **④**：比较逻辑只有一份（`bundle-compare.mjs`），编排脚本不重复计算。
- **⑤**：gzip 级别 9、退出码 0–3、SHA 长度 40 都用具名常量。
- **⑥**：每个口径函数前一行注释写出对应决定号（D432 / D454 / D460 / D487）。不留调试输出。

## 用户可见变化

- 无（开发工具）。产品界面、数据与发布物都不变。

## 证据要求

- **L10 / 体积**：本任务不改 Web，M8 即其体积证明（全部 ±0）。口径见 [S20 共同验收“L10 / 体积口径”](S20.md#l10--体积口径)。
- PR 正文附：M1 输出；M2–M7 测试运行输出；M8、M9 完整输出（含全部“构建来源”字段）；`--manifest` 对比；可读性一节。
- 证明类验收附脚本原文与未截断输出，或链接到固定修订（S13 回顾行动 6）；PR 正文写到的字节、计数都附原始输出（S15 回顾行动 1），且来自最终送审 head 上的命令（D495）。
