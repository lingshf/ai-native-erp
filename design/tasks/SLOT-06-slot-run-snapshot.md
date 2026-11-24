# SLOT-06：`slot-run.ps1` 在运行期间自动做门禁快照

- Sprint：S23（[计划](S23.md)）　类型：开发工具　优先级：P2　决定：[D517](S23.md#s23-期间决定)（只记录、不改判定，见“设计决定”1–4）　建议分支：`slot-06-slot-run-snapshot`
- 来源：[S22 候选池](S22.md#候选池s22-之后)“`slot-run.ps1` 在运行期间自动调用 `gate-snapshot.ps1`（等 SLOT-05 经过一次 Demo 实用后再评估；会改 runner 与规则表）”。另见 [S21 回顾议题 6](../reviews/S21-retro.md)：第二窗口的快照没有父进程链，归属只能事后猜测。
- **派发条件**：DEMO-22 的窗口已关闭，且其 run-through 已记录 SLOT-05（`gate-snapshot.ps1`）的第一次实际使用。派发前设计角色按该 run-through 复核本任务书：如果 run-through 记录了工具缺陷（例如 cwd 普遍读不到、查询出错），先由设计 PR 修订本任务书，再派发。**任何 DEMO 窗口开启到关闭之间不改、不合并 `scripts/slot/`**。
- 迁移：**不加**。浏览器时段：**不需要**（自测只用 `-Stub` 与替身监听，不开浏览器）。
- 数据：不读取任何账套；不读取真实旧账、4173 账套或 `.bak` 文件。

## 为什么

- `gate-snapshot.ps1`（SLOT-05，#312 = `7c7cafd`）现在只能人工调用：Demo 窗口前手动跑 `-Once`，窗口内手动起 `-StopFile`，最后手动建停止文件。开发任务申请的时段（例如 SLOT-04 的 4c 实跑，D512）没有人跑它。
- 时段 runner 出现异常时（退出码 2 步骤期间有计数进程、7 端口被占、8 端口查询失败），日志只有 runner 自己的一行判定。占端口或外来 node 进程的父进程链、cwd 与 CPU 秒数，正是 `gate-snapshot.ps1` 记录的内容；runner 自动带上它，每次时段运行都有同样格式的证据，不靠人记得开。
- 只记录，不改判定：runner 的计数、排除、退出码与规则版本（R3）都不变，所以不改规则表（候选池原话“会改规则表”经核对不需要，见“现状”）。

## 现状（main `eac0c37`）

- `scripts/slot/slot-run.ps1` 共 245 行：
  - `:20` 参数 `-OutDir -StepsFile [-BaseRoot] [-Stub] [-PreflightFiles] [-Ports int[]]`；`:44` 建 `-OutDir`（已存在则沿用，`processes.tsv` 等按“不存在才写表头”追加，`:154–155`）；
  - `:151` `$script:ever = @{ [int]$PID = $true }`：runner 自己的进程树（SR-R1）从它的 PID 开始，逐次采样累积；
  - `:43` `-OutDir` 在仓库内即退出码 4（早于建目录）；`:163–175` 输入检查、`Assert-CallLocation`（`:171`）与加载步骤：这一段的失败都以退出码 4 结束；`:176` 记录步骤名；
  - `:177` `Assert-PortsFree 'before-preflight'`（7 / 8）；`:178–186` 静态检查（6）；`:189–192` 构建（1）与 dist 检查（5）；`:193–201` 进程预检（3）；`:214` `Assert-PortsFree 'before-steps'`；`:215–242` 步骤（1 / 2）；`:244` `exit 0`。退出点分散在顶层代码与函数内（`Assert-PortsFree`、`Invoke-WebDistCheck` 等）。
- `scripts/slot/gate-snapshot.ps1` 共 160 行（`:1–8` 用法）：
  - `-OutFile` 必须是新文件，已存在即退出码 3（`:30`）；`-Ports` 是 CSV 字符串，有重复项即退出码 3（`:21`）；停止文件事先存在不算参数错误；
  - 第一次快照在启动后立即做，之后每 `-IntervalSeconds` 秒一次（`:127–137`），出现停止文件后结束，**不另做最后一次**；
  - 退出码 0 / 2 / 3 / 8 / 9，优先级 8 > 9 > 0；最后打印一行 `gate-snapshot done snapshots=… rows=… errors=… timedOut=… exit=…`（`:144`）。
- `scripts/slot/procs.ps1:21` 候选进程名 `$names` 是 `node|cmd|chrome|…|npm`，**不含 `pwsh`**；runner 起的子进程无论名称都属于 SR-R1（`:218–222` 累积进程树，`:229` 跳过），既不计数也不排除，只在每次采样的 `runner-tree n=…` 中计入。
- `scripts/slot/check-manifest.mjs` 只按结构检查 `procs.ps1` 中判定函数的出口（`:61–86`），并把 `slot-run.ps1` 作为 `--also` 检查其中出现的 `SR-…` 编号都在规则表中（`:32`）。`slot-run.ps1` 不新增 `SR-…` 编号，清单输出就不变。
- 设计角色在 pwsh 7.6.10 上实测（行动 3：技术断言先实测）：`-File` 脚本中，`try` 内直接 `exit 2`、`try` 内调用的函数中 `exit 7`、以及 `trap { exit 1 }`，三种情况下 `finally` 都会执行，进程退出码分别是 2、7、1。
- base 一侧：`git grep -n -F "gate-snapshot" eac0c37 -- scripts/slot/slot-run.ps1` 无结果，退出码 1（设计角色已核对）。
- 自测：`selftest.ps1`（417 行）、`selftest-ports.ps1`（115 行，P1 用替身 node 占端口得到退出码 7，不构建）、`selftest-location.ps1`（156 行）、`selftest-preflight.ps1`（246 行，提供 `Invoke-SlotRunner` 等辅助）、`selftest-gate-snapshot.ps1`（220 行）。

## 设计决定（产品负责人）

1. **何时启动**：输入检查、调用位置检查与加载步骤都通过之后（即所有退出码 4 的路径之后，`:176` 之后），`Assert-PortsFree 'before-preflight'`（`:177`）之前，runner 用 `Start-Process` 起一个子进程：

   `pwsh -NoProfile -File <脚本目录>\gate-snapshot.ps1 -OutFile <OutDir>\gate-snapshot-<UTC 时间戳>.tsv -Ports "<端口 CSV>" -StopFile <OutDir>\gate-snapshot-<同一时间戳>.stop`

   - 时间戳格式 `yyyyMMddTHHmmssfffZ`，使同一 `-OutDir` 的多次运行各有新文件（`-OutDir` 允许复用）；
   - `<端口 CSV>` 是 `-Ports` 与 4173 的并集，**去重**后升序，用逗号连接（`gate-snapshot.ps1` 拒绝重复端口）；`-Stub` 且未给 `-Ports` 时只有 `4173`；
   - `-IntervalSeconds`、`-MaxMinutes` 用工具默认值（60 / 180）；
   - 子进程的标准输出与错误重定向到 `<OutDir>\gate-snapshot-<时间戳>.out.log` / `.err.log`；
   - `-Stub` 下同样启动（自测依赖它）。
2. **等第一次快照写完再继续**：启动后等待 TSV 中出现第一次快照（表头之后至少一行），或子进程已退出，最多 15 s（具名常量）。日志写一行：`gate snapshot started pid=… file=… ports=…`；超时写 `gate snapshot not ready after 15 s`；子进程提前退出写 `gate snapshot exited early exit=…`。三种情况都继续运行，不改变 runner 的流程。启动快照最多等 15 s：第一次快照在 15 s 内写出时，它在端口检查之前，退出码 7 时 TSV 中有占用者的进程与父进程链；超时或提前退出时不保证这一点，只留上述日志行（G5 即超时情形）。
3. **何时停止**：从启动之后起，runner 的**每一条**结束路径（包括 `exit 1 / 2 / 3 / 5 / 6 / 7 / 8`、`exit 0` 与未捕获异常）都经过同一个停止步骤：建停止文件，等子进程退出，最多 30 s（具名常量）；然后把子进程的退出码与它的 `gate-snapshot done …` 摘要行写进 `slot-summary.log`：`gate snapshot exit=<n> <摘要行原文>`。超时写 `gate snapshot stop timeout after 30 s; stopped pid=…`，只结束这个子进程的进程树。实现建议：把启动之后的主流程放进 `try { … } finally { <停止步骤> }`（行为见“现状”的实测）；也可以把主流程抽成函数后在 `try` 中调用。
4. **只记录，不改判定**：
   - runner 的判定与退出码不变，每一条既有日志行不变（只新增上述几行，`runner-tree n=…` 中的数值因多一个子进程而变大）；
   - 时间上有两处变化：启动后最多多等 15 s（第 2 条）；运行结束后停止快照，最多等 30 s，超时就强制结束快照子进程树并记一条警告（第 3 条），因此 runner 的退出时间最多推迟 30 s；
   - 快照的退出码（包括 8、9）不影响 runner 的退出码；
   - 不新增退出码、不新增 `SR-…` 编号、`$script:SlotRuleVersion` 仍为 `R3`；不改 `design/roadmap.md` 规则表；`check-manifest.mjs` 的输出与 base 逐字相同。
5. **不改 `gate-snapshot.ps1`**：按它现有的参数与行为调用。DEMO-22 的 run-through 若要求改工具本身，属于派发前修订本任务书的情况（见文首“派发条件”）。
6. **README**：在 `scripts/slot/README.md` 的“runner 退出码”之后补一段，写明自动快照的文件名、端口并集、启动 / 停止时机、日志行与“只记录”；在“日志”一节列出新文件。人工在窗口内另起的 `gate-snapshot.ps1`（Demo 模板第 23 条）照旧，两者写不同的文件，互不影响。
7. **不改**：`gate-snapshot.ps1`、`procs.ps1`、`check-manifest.mjs`、`preflight*`、`step-env.ps1`、`steps.*.ps1`、既有自测文件、`design/roadmap.md`、`docs/`（Demo 模板是否改为依赖自动快照，由版本管理在 DEMO-23 之后另议）。

## 冲突域

- tooling:slot：`scripts/slot/slot-run.ps1`、`scripts/slot/selftest-slot-snapshot.ps1`（新）、`scripts/slot/README.md`。
- 与 S23 其他任务不相交：REFAC-13 只改 `trade-orders/`；TSET-01 只改 `trade-settlements/`、`ui/trade-labels.ts` 与其测试。
- 与 DOC-22 的交点：DOC-22(b) [#317](https://github.com/lingshf/ai-native-erp/pull/317)（已合并，`3ae4848`）只改 `docs/release/README.md` 与 `docs/demo/TEMPLATE.md`，不相交。
- `scripts/slot/` 是时段 runner 所在目录：DEMO-22 与 DEMO-23 的窗口开启到关闭之间不改、不合并本任务。

## 验收

### base 失败、head 通过

新自测 `scripts/slot/selftest-slot-snapshot.ps1 -OutDir <仓库外目录>`，逐项输出 `PASS` / `FAIL` 与 `summary` 行。辅助函数复用 `selftest-preflight.ps1`（dot-source），不复制。PR 正文附 base（把新自测文件复制到 base 工作树运行）与 head 两次的未截断输出。

| 编号 | 场景 | head 要求（base 失败） |
| --- | --- | --- |
| G1 | 替身 node 进程监听一个空闲临时端口 P；`slot-run.ps1 -Stub pass -Ports P` | runner 退出码仍为 **7**；`-OutDir` 中有一个 `gate-snapshot-*.tsv`，其第 1 次快照中有 `kind=listen`、`port=P`、`pid=<替身 PID>` 的一行，且有该 PID 的 `kind=node` 行与至少一行 `kind=ancestor`；`slot-summary.log` 中 `gate snapshot started` 一行在 `port busy` 一行之前，`gate snapshot exit=` 一行在 `ABORT: slot port in use` 之后 |
| G2 | 接 G1，查子进程 | runner 退出后，命令行含本次 TSV 路径的 `pwsh` 进程数为 0（按 `Win32_Process` 查询，PR 正文附查询原文） |
| G3 | 替身停止后，`slot-run.ps1 -Stub pass -Ports P`（构建一次，不开浏览器） | runner 退出码 **0**；TSV 至少 1 次快照，端口 P 与 4173 各有 `pid=none` 的 `kind=listen` 行；日志 `gate snapshot exit=0 gate-snapshot done …` |
| G4 | 同 G1，但 `-Ports P,4173`（含 4173） | 子进程不因重复端口退出（日志不出现 `exited early exit=3`）；TSV 中 4173 每次快照只出现一组 `kind=listen` 行 |
| G5 | 设置 `GATE_SNAPSHOT_SLOW_FIRST_SECONDS=60`（SLOT-05 的替身环境变量，第一次快照慢 60 s：大于启动等待 15 s 与停止等待 30 s 之和 45 s，留 15 s 余量，使 runner 在快照写出前就到停止超时），走 G1 的端口占用路径 | runner 退出码仍为 **7**；日志依次有 `gate snapshot not ready after 15 s` 与 `gate snapshot stop timeout after 30 s; stopped pid=…`；之后同 G2，没有遗留的子进程 |

### 两侧都须成立的不变量

- **G6 退出码 4 不起快照**：缺 `-StepsFile`、调用位置不符等退出码 4 的路径，`-OutDir` 中没有 `gate-snapshot-*` 文件，日志没有 `gate snapshot` 行。
- **G7 既有自测原样通过**：`selftest.ps1`、`selftest-ports.ps1`、`selftest-location.ps1`、`selftest-preflight.ps1`、`selftest-gate-snapshot.ps1` 在 head 上全部通过，这些文件 diff 为空。
- **G8 清单不变**：`node scripts/slot/check-manifest.mjs` 在 base 与 head 上的输出逐字相同，末行为 `OK: …`，退出码 0。
- **G9 范围**：`git diff --name-only` 只含“冲突域”三项；`git diff <base> <head> -- scripts/slot/gate-snapshot.ps1 scripts/slot/procs.ps1 design/roadmap.md` 为空。
- **G10 不计数**：G3 的 `processes.tsv` 中，步骤期间 `counted` 列与不带快照时相同（`-Stub pass` 下均为 0）；`excluded.tsv` 中没有快照子进程的 PID。

## 性能考虑

- 快照子进程每 60 s 做一次 CIM 查询（SLOT-05 实测单次不超过 5 s），与 runner 每 10 s 一次的采样相互独立。runner 只在启动时最多等 15 s、结束时最多等 30 s；正常情况下停止在下一次 250 ms 轮询内完成。
- 不进 Vitest / CI；不跑 Bench。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥：

- **②**：新增函数（例如 `Start-GateSnapshot`、`Wait-GateSnapshotReady`、`Stop-GateSnapshot`、`Get-SnapshotPortCsv`）各 ≤ 30 行、嵌套 ≤ 3 层；`slot-run.ps1` 中被 `try` 包住的主流程不另加嵌套层以外的分支。
- **③**：`slot-run.ps1` 净增 ≤ +45 行（245 → ≤ 290）；`selftest-slot-snapshot.ps1` ≤ 200 行；README 净增 ≤ +15 行。PR 正文贴 `git diff --numstat`。
- **①**：函数与变量名表达用途，例如 `$snapshotStopFile`、`$snapshotProcess`；不用 `$p2`、`$tmp`。
- **④**：快照的启停集中在上述函数中，主流程只调用；不把端口并集的逻辑写进 `Assert-PortsFree`。
- **⑤**：15 s、30 s、端口 4173、时间戳格式与文件名前缀都用具名常量（`$script:` 级）。
- **⑥**：在启动处写一行“为什么”：先等第一次快照（最多 15 s），使它通常先于端口检查、退出码 7 / 8 时有占用者的父进程链与 cwd；超时不阻断。不留调试输出。
- **测试在满载下的耗时**（[TEMPLATE](TEMPLATE.md#证据要求)）：G3 构建一次，其余各项不构建；PR 正文附自测总耗时与每项耗时；总耗时 ≤ 300 s（含一次构建，构建耗时单列），G5 因 15 s 启动等待加 30 s 停止超时（约 45 s）而长于其他项，写明原因；不加重试。

## 用户可见变化

- 无（开发工具）。ERP 应用的界面、数据与行为都不变。
- 对团队可见：每次 `slot-run.ps1` 运行的 `-OutDir` 中多一份 `gate-snapshot-<时间戳>.tsv` 及其日志，`slot-summary.log` 多三行左右的快照记录。

## 证据要求

- **可行性**（S13 回顾行动 4）：
  - `try`/`finally` 与 `exit` 的组合已由设计角色在 pwsh 7.6.10 上实测（见“现状”）；
  - G1 的替身监听沿用 `selftest-ports.ps1` P1 的做法，不构建；
  - G5 的慢快照替身是 SLOT-05 已有的环境变量 `GATE_SNAPSHOT_SLOW_FIRST_SECONDS`，子进程继承 runner 的环境；60 s 大于 15 s + 30 s，第一次快照在 runner 停止等待结束之前一定写不出，停止超时分支稳定可达。不为此新增可注入的超时参数（15 s、30 s 仍是具名常量）；
  - 设计角色**没有**试改 `slot-run.ps1`。
- 本机运行须服从协调者的时段静默通知（D442 / D480）；自测会占一个临时端口并查询 4173，在任何 DEMO 窗口内不运行。
- PR 正文附：G1–G5 两侧未截断输出；G6–G10 的命令与输出；G8 两侧 `check-manifest.mjs` 输出原文；“可读性”与“用户可见变化”两节。
