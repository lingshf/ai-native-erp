# SLOT-04：`slot-run.ps1` 调用位置自检 + dist 检查改用 `assert-web-dist.ps1`

- Sprint：S21（[计划](S21.md)）　类型：开发工具　优先级：P1　决定：待协调者定编号　建议分支：`slot-04-call-location-check`
- 来源：[S19 回顾行动 2](../reviews/S19-retro.md#行动项汇总)（“在预检之前检查调用位置，不满足就以非 0 退出、不做任何动作；与改用 `assert-web-dist.ps1` 合并为一个任务”）；DEMO-19 的 4a / 4b 处置（D498 / D499，见 [S19 期间决定](S19.md#s19-期间决定)）；RUNMAIN-01（#283，`scripts/demo/assert-web-dist.ps1`）。
- 迁移：**不加**。浏览器时段：**不需要**（只用 `-Stub` 运行；DEMO-21 的无浏览器演练再用一次，见 [DEMO-21 验收](S21.md#demo-21-验收)）。
- 派发时点：DEMO-20 窗口关闭之后；**DEMO 窗口开启到关闭之间不改、不合并本任务**。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 现状（main `ea5c0a1`）

- `scripts/slot/slot-run.ps1` 共 215 行。执行顺序：
  - `:126–127` `$root = git rev-parse --show-toplevel`（当前目录所在 worktree），`Set-Location $root`；`:129`、`:131` 记录 `runner start` 与 `tooling head … dir=$PSScriptRoot`；
  - `:132–138` 输入检查（`-StepsFile` 存在、`-Ports`、`-BaseRoot` 目录存在），不满足以退出码 4 结束；
  - `:140` **执行步骤文件**：`& $StepsFile -OutDir $OutDir -Root $root -BaseRoot $BaseRoot`；`:142` 没有步骤时退出码 4；
  - `:144` `Assert-PortsFree 'before-preflight'`（端口忙 7、查询失败 8）；`:145–153` head / base 预检；
  - `:156–158` `npm run build`；`:159–162` dist 检查：`packages/web/dist/index.html` 的修改时间须严格晚于 HEAD 提交时间，否则 `ABORT: dist not newer than HEAD commit`，退出码 5；
  - 之后是进程预检采样与各步骤。
- 调用位置**没有任何检查**。DEMO-19 的 4b（固定来源：[DEMO-19 run-through §2](../../docs/demo/v0.18.0/run-through.md)）在 tool worktree 内调用，`-BaseRoot` 也是 tool worktree，`-StepsFile` 是 app worktree 的 `docs/demo/v0.18.0/scripts/steps-demo19.ps1`。步骤以 `dir = $Root`（即 tool worktree）运行 `docs\demo\v0.18.0\scripts\run-main.ps1`，该路径在 tool worktree 中不存在；失败发生在端口检查、预检、构建、采样**之后**。
- 正确的调用形式（D499）：在 app worktree 内用 `pwsh` 调用 tool worktree 的 `scripts\slot\slot-run.ps1`。此时 `$root` 是 app worktree，`$PSScriptRoot` 在 tool worktree，步骤文件在 app worktree。
- 其他合法形式（必须继续可用）：
  - 步骤文件来自 runner 自己的目录（`scripts/slot/steps.*.ps1`），当前目录是被测 worktree（DEMO-15 起的“工具头与被测头分离”）；
  - 自测使用的步骤文件：`selftest-ports.ps1:108` 与 `selftest-preflight.ps1:216` 用 `scripts/slot/steps.example.ps1`；`selftest.ps1:370–378` 的 Part 4 把步骤文件写在 `-OutDir`（`%TEMP%` 下，不在任何 git worktree 中）；`selftest-preflight.ps1:218–219` 的 `-BaseRoot` 是工作目录下 `git init` 的临时仓库（`:117–128`），与当前仓库不同；`:230` 还以该临时仓库为当前目录、步骤文件仍取 runner 目录的 `steps.example.ps1`（R-steps 允许：步骤文件在 tool worktree）。
- `scripts/demo/assert-web-dist.ps1`（58 行）与 runner 同一规则（`:3` 注释写明 “Same rule as scripts/slot/slot-run.ps1:154-162”），输出一行 `web-dist: …`，退出码 0 ok、2 undetermined、3 missing、4 stale；它自己的分支由 `scripts/demo/selftest-web-dist.ps1`（146 行）覆盖。
- 自测：`selftest.ps1` 417 行、`selftest-preflight.ps1` 246 行、`selftest-ports.ps1` 115 行；共用辅助 `Invoke-SlotRunner`（`selftest-preflight.ps1:193`）与 `Test-StoppedBeforeBuild`（`:209–211`，按日志中没有 `build start|dist check|precheck|step ` 判定）。`scripts/slot/` 不进 Vitest / CI。
- `check-manifest.mjs` 只核对 `procs.ps1` 的 SR 规则编号与 roadmap §5 规则表；本任务不加 SR 编号。

## 设计决定（产品负责人）

1. **自检位置**：放在 `:138` 输入检查之后、`:140` 执行步骤文件之前。自检失败时**零动作**：不执行步骤文件、不查端口、不预检、不构建、不做 dist 检查、不采样、不运行步骤；只写日志（`runner start`、`tooling head` 两行照旧）。
2. **两条规则**（任一成立即中止），不解析步骤内容、不按模式开关：
   - **R-base**：给了 `-BaseRoot`，且它与 `$root` 是同一目录（`-BaseRoot` 在 git worktree 内时取其 `rev-parse --show-toplevel`，否则取规范化的完整路径；比较不区分大小写、不计末尾分隔符）。base 与 head 是同一棵树时，base 一侧的预检与对比没有意义。
   - **R-steps**：`-StepsFile` 位于某个 git worktree 内，且该 worktree 的顶层既不是 `$root`，也不是 runner 自己所在 worktree 的顶层（`git -C $PSScriptRoot rev-parse --show-toplevel`）。不在任何 git worktree 内的步骤文件（如 `%TEMP%` 下的自测文件）不受此条限制。
   - DEMO-19 4b 同时命中两条；D499 的正确形式与“其他合法形式”都不命中。
3. **退出码与日志**：中止用退出码 **4**（输入或配置错误，与 `:132–142` 同类），日志一行以 `ABORT: call location` 开头，写明命中的规则名、`root`、`tool`、步骤文件所在 worktree（或 `none`）、`BaseRoot` 的完整路径，并附正确形式的提示：`run from the app worktree: pwsh -File <tool>\scripts\slot\slot-run.ps1 …`。通过时写一行 `call location ok root=… tool=… steps-worktree=…`（DEMO-21 演练据此取证）。
4. **dist 检查**：`:159–162` 改为调用 runner 所在 worktree 的 `scripts/demo/assert-web-dist.ps1 -Root $root`（按 `$PSScriptRoot` 定位），把它输出的整行 `web-dist: …` 记为 `dist check web-dist: …`；它的退出码不为 0 时写 `ABORT: dist check exit <n>`，runner 以退出码 **5** 结束（约定不变，`README.md` 与下游文档无需改退出码表）。调用不得结束 runner 进程本身（脚本内的 `exit` 只结束被调脚本）。`assert-web-dist.ps1` 不存在时按输入错误以退出码 4 结束。日志关键词 `dist check` 保留，`Test-StoppedBeforeBuild` 不改。
5. **不改**：`procs.ps1`、规则版本 `$script:SlotRuleVersion`、`preflight*`、`step-env.ps1`、`steps.*.ps1`、既有三份自测、`check-manifest.mjs`、`scripts/demo/**`、`design/roadmap.md` 规则表、`docs/`。

## 范围

- `scripts/slot/slot-run.ps1`：决定 1–4。
- `scripts/slot/selftest-location.ps1`（新）：S1–S6 的自测，写法仿 `selftest-ports.ps1`（`$runner = Join-Path $PSScriptRoot 'slot-run.ps1'`，可点源复用 `selftest-preflight.ps1` 的 `Invoke-SlotRunner` / `Test-StoppedBeforeBuild`，不改它）。
- `scripts/slot/README.md`：文件表加一行 `selftest-location.ps1`；“原样传出 / 输入检查”一节加调用位置两条规则与正确形式；dist 检查一句改为引用 `assert-web-dist.ps1`。

## 冲突域

- tooling:slot：只改上面三个文件。
- 与 S21 其他任务不相交：FLAKE-08 只改 `packages/web/test/`；TLIST-05 只改 `packages/web/src/business-events/` 与其测试；DOC-21 只改 `docs/release/README.md`。
- 与 S20 进行中 PR 不相交：#298 改 `scripts/measure/**` 等，不改 `scripts/slot/`、`scripts/demo/`。
- 受影响的 e2e 断言：无（runner 不进 Vitest / CI）。
- 受影响的文档引用：`docs/demo/TEMPLATE.md` 与 `docs/release/README.md` 中的调用示例已是 D499 的正确形式，无需改；DEMO-21 照常引用。

## 验收

### base 失败、head 通过

S1–S6 都由 `selftest-location.ps1` 执行，每条一行 `PASS` / `FAIL` 与原因。自测用临时目录：`%TEMP%` 下 `git init` 的“app”仓库（含一个提交与步骤文件）充当另一个 worktree。为让 base 一侧也**不构建**，S1–S3 的步骤文件被执行时会写一个标记文件并返回空步骤：base 因此在“produced no steps”（`:142`）处以 4 结束；head 必须在执行步骤文件之前以 `ABORT: call location` 结束、标记文件不存在。

| 编号 | 断言 | base（S21 送审时的实际合并基） | head |
| --- | --- | --- | --- |
| S1 | 4b 形态：当前目录是 runner 所在仓库，`-StepsFile` 在临时 app 仓库，`-BaseRoot` = runner 所在仓库，`-Stub pass -Ports <空闲端口>`：退出码 4，日志有 `ABORT: call location` 且列出 R-base 与 R-steps，标记文件**不存在**，日志无 `port`、`preflight`、`build start`、`dist check`、`precheck`、`step ` | 失败：步骤文件被执行（标记存在），以 `produced no steps` 结束 | 通过 |
| S2 | 只命中 R-steps：同 S1 但不给 `-BaseRoot`：退出码 4，`ABORT: call location` 只列 R-steps，标记不存在 | 失败 | 通过 |
| S3 | 只命中 R-base：步骤文件在 `%TEMP%`（不在 git worktree 内），`-BaseRoot` 是当前仓库根（大小写或末尾分隔符不同的写法各一次）：退出码 4，只列 R-base，标记不存在 | 失败 | 通过 |
| S4 | 正确形式不被误拦：当前目录是临时 app 仓库，步骤文件在 app 仓库内；以及当前目录是 runner 所在仓库、步骤文件是 `scripts/slot/steps.example.ps1` 的复制（同一仓库内）：日志有 `call location ok`，各项原文正确 | 失败：base 没有 `call location ok` 行 | 通过 |
| S5 | dist 检查改用脚本（一次完整 `-Stub pass` 运行，含构建）：日志有 `dist check web-dist: ok`，退出码 0 | 失败：base 的行是 `dist check head-commit=… newer=True`，没有 `web-dist:` | 通过 |
| S6 | dist 失败分支：把 `slot-run.ps1` 及其依赖复制到临时目录的 `scripts/slot/`，并在同级 `scripts/demo/` 放一个只输出 `web-dist: stale (stand-in)` 并以 4 结束的替身；从被测仓库调用该副本：退出码 5，日志有 `dist check web-dist: stale (stand-in)` 与 `ABORT: dist check exit 4`，无 `precheck`、`step ` | 失败：base 副本不调用替身，dist 新鲜时继续运行 | 通过 |

- **base 上的判定方法**：在 base 的分离 worktree 中放入 head 的 `selftest-location.ps1`（不改 base 的 runner）并运行；PR 正文附 base 与 head 两次运行的未截断输出，以及 S1–S6 每条在 base 上的失败原因。base 写完整 SHA。

### 两侧都须成立的不变量

- **S7 既有自测**：head 上 `selftest.ps1`、`selftest-preflight.ps1`、`selftest-ports.ps1` 全部通过（附未截断汇总）；它们的文件不改。
- **S8 清单**：`node scripts/slot/check-manifest.mjs` 退出码 0（附输出）。
- **S9 范围**：`git diff --name-only <合并基>..<head>` 只含“范围”所列三个文件。不加迁移；不改 `packages/`、CI 配置、`package.json` / lock。
- **S10 PR 正文**须含：“用户可见变化：无”；“可读性”一节；S1–S6 与自测代码 `file:line` 对照表；DEMO-19 4b 命令按决定 2 的推演（引用 run-through 原文，固定来源，不重跑）。

## e2e 断言

- 无。runner 不参与 Vitest / CI；main Full 照常须绿。

## 性能考虑

- 自检只多两到三次 `git rev-parse`（每次数十毫秒），在构建之前，可忽略。S5 / S6 各需一次构建（S6 的副本从被测仓库构建），自测总时长增加约一次构建的时间；S1–S4 不构建。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥：

- `slot-run.ps1` 净增 ≤ +30 行（存量 215 行）；调用位置自检与 dist 检查各放进一个具名函数（如 `Assert-CallLocation`、`Invoke-WebDistCheck`），各 ≤ 40 行、嵌套 ≤ 3 层；主流程只多两行调用。
- `selftest-location.ps1` ≤ 200 行；每条断言一个块，复用 `Invoke-SlotRunner`、`Test-StoppedBeforeBuild` 与 `New-CheckResult`，不复制它们。
- README 净增 ≤ +12 行。
- ⑤：规则名（`R-base`、`R-steps`）、退出码与日志前缀用具名常量或沿用文件内既有写法，不散落字面量。
- PR 正文“可读性”一节贴 `git diff --numstat`，以及两个新函数的行数。

## 用户可见变化

- 无（开发工具）。对时段操作者：从错误位置调用 runner 会在开始时立即以退出码 4 结束，并提示正确的调用形式；正确调用时日志多一行 `call location ok`，dist 检查一行改为 `web-dist:` 格式。

## 证据要求

- 不需要浏览器时段。S1–S6 由自测在开发机上执行；S5 / S6 的构建服从时段静默通知（D480）。
- **可行性**（S13 回顾行动 4）：临时 app 仓库用 `git init` + 一次提交即可让 `rev-parse --show-toplevel` 生效；S6 的副本须同时复制 `slot-run.ps1` 点源或调用的文件（`procs.ps1`、`step-env.ps1`、`preflight.mjs` 及其依赖），开发在 PR 中列出复制清单。设计角色**没有**试做 S6；若副本方式无法在不改 runner 的前提下运行，停下报设计角色与协调者，不为测试给 runner 加参数。
- DEMO-21 的无浏览器演练日志（`call location ok`、`dist check web-dist: ok`）由版本管理附在开窗申请中，不属于本任务 PR。
