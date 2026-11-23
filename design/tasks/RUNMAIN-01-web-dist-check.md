# RUNMAIN-01：Demo 运行脚本缺少 dist 时明确报错退出

- Sprint：S18（[计划](S18.md)）　类型：工具（Demo 脚本）　优先级：P2　决定：待协调者定编号　建议分支：`runmain-01-web-dist-check`
- 来源：[S17 回顾 S18 候选](../reviews/S17-retro.md#s18-候选产品负责人建议)第 2 项；S16 回顾行动 2 的候选代码任务；D481。
- 迁移：**不加**。浏览器时段：**不需要**。不改产品代码，构建产物不变。
- 数据：只用临时目录中的虚构 git 仓库；不读取真实旧账、4173 账套或 `.bak` 文件。

## 现状（main `350e77a`）

- 每个版本的 Demo 有自己的 `docs/demo/vX/scripts/run-main.ps1`，最新是 `docs/demo/v0.16.0/scripts/run-main.ps1`（43 行）。它迁移临时账套（`:15`）、预置（`:16`）、启动 `node packages/infra/src/main.ts`（`:18`），然后轮询 `http://127.0.0.1:4203/` 20 次、每次失败等 1 秒（`:19`），未就绪即 `throw "not ready"`（`:20`）。**它不构建，也不检查 `packages/web/dist`**。
- 服务器从 `packages/web/dist` 提供页面（`packages/infra/src/http/index.ts:69–70` 的 `defaultWebRoot`）。新建的应用 worktree 没有 dist，`/` 不返回 200，于是 run-main 在约 20 秒后以 `not ready` 失败，报错里不提 dist。
- **设计角色在 `350e77a` 上的实测**（新建分离 worktree `npm ci` 后删除 `packages\web\dist`，`git status --porcelain` 为空）：

  ```text
  > pwsh -NoProfile -File docs/demo/v0.16.0/scripts/run-main.ps1 -Shots $env:TEMP\s18-shots -SkipCapture
  prepared C:\Users\…\Temp\erp-demo-458b5179-…\demo.sqlite 2026
  port 4203 released
  Exception: …\docs\demo\v0.16.0\scripts\run-main.ps1:20
     |    if(-not $ready -or $server.HasExited){throw "not ready"}
     | not ready
  exit=1 elapsed=33s
  ```

  这就是 v0.15.0 的 DEMO-16 干跑失败（D481）的形态：33 秒后失败，原因要靠读脚本才能知道。
- 已有的同类检查有两处，但都不能被 run-main 复用：
  - `scripts/slot/slot-run.ps1:154–162`：先构建，再要求 `packages/web/dist/index.html` 的修改时间**严格晚于** HEAD 提交时间，否则退出码 5。它属于时段 runner（冲突域 `scripts/slot/`，由 `check-manifest` 管理），且只在 runner 内执行；
  - `docs/demo/TEMPLATE.md:36–38`：“启动与检查”块里的同一判定（内联代码），v0.16.0 的 run-main 没有带上它。
- D481 用流程绕开（路线图 §5“标准时段流程”第 ② 步、Demo 模板第 17 条：干跑前先 `npm run build`），根因仍在。
- Demo 脚本不进 CI（`scripts/slot/README.md`：“不进 Vitest、不进 CI”，预检除外）；runner 用 `powershell.exe`（5.1）启动步骤，步骤里不能用只有 PowerShell 7 才有的模块 cmdlet（Demo 模板第 13 条）。

## 设计决定（产品负责人）

1. **不改已发布的 run-main**：`docs/demo/v*/` 是归档证据，归档脚本的哈希必须与实际运行的一致（Demo 模板第 16 条）。本任务新增一个**与版本无关的检查脚本**，从 DEMO-18 的 `v0.17.0` run-main 起调用。
2. **新文件**：
   - `scripts/demo/assert-web-dist.ps1`：参数 `-Root`（应用 worktree 根目录，默认当前目录）。判定 `<Root>\packages\web\dist\index.html` 存在，且修改时间**严格晚于** `git -C <Root> log -1 --format=%cI HEAD`（与 `slot-run.ps1:159–162`、Demo 模板第 12 条同一口径，相等也算失败）；
   - `scripts/demo/selftest-web-dist.ps1`：自测，见“验收”。
3. **退出码与输出**（一行，以 `web-dist:` 开头，便于在 run-through 中检索）：

   | 结果 | 退出码 | 输出必须包含 |
   | --- | --- | --- |
   | 通过 | 0 | `web-dist: ok`、`index.html` 的绝对路径、两个时间（ISO 8601，UTC） |
   | dist 缺失 | 3 | `web-dist: missing`、检查的绝对路径、修复命令原文 `npm run build`、`D481` |
   | dist 过期（不晚于 HEAD 提交时间） | 4 | `web-dist: stale`、两个时间、修复命令原文 `npm run build`、`D481` |
   | 无法判定 | 2 | `web-dist: undetermined`、原因（`Root` 不存在、不是 git worktree、找不到 `git`、提交时间无法解析） |

   输出写到标准输出（`Write-Output`），不用 `Write-Host`；“无法判定”按失败处理（路线图 §5 设计自查 14）。退出码在脚本顶部定义为具名常量（⑤）。
4. **兼容性**：只用 `Test-Path`、`Get-Item`、`Join-Path`、`git` 与 .NET 类型，不用 `Get-FileHash`、`New-Guid` 等模块 cmdlet，也不用 PowerShell 7 才有的语法（`??`、`?:`、`&&`）；能在 `powershell.exe` 5.1 与 `pwsh` 7 下运行（Demo 模板第 13 条）。
5. **调用方式**（由 DEMO-18 的版本管理写进 `v0.17.0` run-main，在迁移之前）：

   ```powershell
   & scripts/demo/assert-web-dist.ps1 -Root (Get-Location).Path; if ($LASTEXITCODE) { throw "web dist check exit $LASTEXITCODE" }
   ```

   以 `&` 调用脚本文件时，脚本内的 `exit` 只结束该脚本并设置 `$LASTEXITCODE`，run-main 随后 `throw`，`finally` 照常清理。
6. **不改**：`scripts/slot/**`（slot-run 自己的检查维持原样，改用本脚本列入候选池）；`docs/demo/**`（由 DEMO-18 采用）；`packages/**`；`package.json` / lock；CI 工作流。

## 范围

- 新增 `scripts/demo/assert-web-dist.ps1`、`scripts/demo/selftest-web-dist.ps1`。不改其他文件。

## 冲突域

- tools:demo：新目录 `scripts/demo/`，只新增上面两个文件。
- 与 `scripts/slot/` 不相交：`check-manifest` 只解析 `procs.ps1` 与 `slot-run.ps1`（`scripts/slot/check-manifest.mjs:14–32`），不受影响。
- 与 S18 其他任务不相交：REFAC-09 只改 `packages/web/src/trade-invoices/`；TLIST-02 改 `TradeMaster.tsx`、`ui/trade-labels.ts` 与 `trade-master.test.tsx`。
- 与 DEMO-18 的交界：DEMO-18 在本任务合并后，才在 `docs/demo/v0.17.0/scripts/run-main.ps1` 中调用本脚本，并更新 Demo 模板第 17 条与“启动与检查”块（版本管理负责，见 [DEMO-18 验收](S18.md#demo-18-验收)）。
- 受影响的 e2e 断言：无（不改产品与测试代码；`git diff --name-only -- packages` 为空）。

## 验收

### base 失败、head 通过

自测脚本 `selftest-web-dist.ps1` 带参数 `-Helper`（默认 `$PSScriptRoot\assert-web-dist.ps1`）。在临时目录里建一个虚构 git 仓库（`git init`，用 `GIT_COMMITTER_DATE` 固定提交时间，写一个文件并提交），按场景准备 `packages\web\dist\index.html` 并用 `[IO.File]::SetLastWriteTimeUtc` 设定时间，然后**在子进程中**调用 `-Helper` 指向的脚本，断言退出码与输出。每个场景各在 `pwsh` 与 `powershell.exe` 两种子进程中跑一次，退出码须相同。

| 编号 | 场景 | 期望退出码 | 期望输出 | base `350e77a` |
| --- | --- | --- | --- | --- |
| W1 | 没有 `packages\web\dist` | 3 | 含 `web-dist: missing`、绝对路径、`npm run build`、`D481` | 失败：检查脚本不存在 |
| W2 | `index.html` 时间 = 提交时间 | 4 | 含 `web-dist: stale`、`npm run build` | 失败 |
| W3 | `index.html` 时间 = 提交时间 − 1 分钟 | 4 | 同 W2 | 失败 |
| W4 | `index.html` 时间 = 提交时间 + 1 分钟 | 0 | 含 `web-dist: ok` | 失败 |
| W5 | `-Root` 是存在但不是 git 仓库的目录（其中有新的 dist） | 2 | 含 `web-dist: undetermined` | 失败 |
| W6 | `-Root` 不存在 | 2 | 含 `web-dist: undetermined` | 失败 |
| W7 | 每个场景的墙钟耗时 | — | ≤ 5 秒 | 不适用 |

- **base 上的判定方法**：把 head 的自测脚本复制到临时目录，用 `-Helper <base 检出>\scripts\demo\assert-web-dist.ps1`（不存在）运行：每个场景报 `FAIL`，自测以非零退出。PR 正文附这次运行与 head 上运行的未截断输出。
- 自测输出每个场景一行：`PASS` / `FAIL`、编号、子进程类型、实际退出码、耗时；最后一行汇总；全部通过退出 0，否则退出 1；`-Helper` 指向的文件不存在时，每个场景都记 `FAIL`（不得跳过）。
- 自测把 `TEMP` / `TMP` 指向本次专用的临时目录，结束时删除自己建的目录（Demo 模板第 10 条的隔离做法）；不碰调用者的工作区。

### 真实 worktree 上的对照（送审证据）

- **W8**：在 head 上新建分离 worktree，`npm ci` 后**不构建**，在其根目录运行 `& scripts/demo/assert-web-dist.ps1 -Root (Get-Location).Path; "exit=$LASTEXITCODE"`：退出码 3，≤ 5 秒，输出含该 worktree 的绝对路径与 `npm run build`。再 `npm run build` 后重跑：退出码 0。base 上的对应用户路径（v0.16.0 run-main，33 秒后 `not ready`）见“现状”，开发在同一台机器上重跑一次并附输出。

### 两侧都须成立的不变量

- **W9 范围**：`git diff --name-only <base> <head>` 只含“范围”中的两个文件；`git diff --name-only <base> <head> -- packages docs scripts/slot` 为空。
- **W10 兼容性**：`git grep -n -E "Get-FileHash|New-Guid|\?\?|&&" -- scripts/demo` 无结果（附输出）；W1–W6 在 `powershell.exe` 下通过。
- **W11 质量门**：PR CI 绿（本任务不改 CI 覆盖的代码，CI 结果与 base 相同即可）。

## 性能考虑

- 检查只读一个文件的时间与一次 `git log`，W7 要求每个场景 ≤ 5 秒。不跑 Bench。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥：

- **尺寸**：`assert-web-dist.ps1` ≤ 80 行；`selftest-web-dist.ps1` ≤ 200 行；每个函数 ≤ 80 行、嵌套 ≤ 3 层（②）。
- **①**：函数名表达职责，如 `Get-HeadCommitTime`、`Invoke-Case`。
- **④**：自测中六个场景用一张场景表加一个执行函数驱动，不逐场景复制代码。
- **⑤**：退出码 0 / 2 / 3 / 4 与 W7 的 5 秒都定义为具名常量。
- **⑥**：脚本头注释写明用途、退出码表、与 `slot-run.ps1:154–162` 及 D481 的关系；不写重复代码的注释。
- 热点文件：无（只新增文件）。

## 用户可见变化

- **产品**：无。不改 `packages/**`，构建产物不变。
- **Demo 操作者**（随 DEMO-18 生效）：在没有构建过的 worktree 中运行 `v0.17.0` 的 run-main，会在迁移之前几秒内停下，提示 `web-dist: missing … npm run build … D481`，而不是约 20–30 秒后报 `not ready`。

## 证据要求

- 不需要浏览器时段，不需要真实 Chrome：W1–W7 由自测证明，W8 在真实 worktree 上运行一次（不启动服务器）。
- **可行性**（S13 回顾行动 4）：设计角色已在 `350e77a` 上实跑 base 的用户路径（见“现状”）；`GIT_COMMITTER_DATE` 固定提交时间、`[IO.File]::SetLastWriteTimeUtc` 设定文件时间在 PowerShell 5.1 与 7 下都可用（.NET Framework 与 .NET 都有该 API）。
- PR 正文附：base 与 head 两次自测的未截断输出；W8 的命令与输出；W9、W10 的命令与输出；可读性一节。数字（耗时、计数）都附原始输出（S15 回顾行动 1）。
