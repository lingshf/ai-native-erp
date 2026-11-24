# SLOT-05：窗口门禁快照工具（node 进程、父进程链、cwd 与端口监听）

- Sprint：S22（[计划](S22.md)）　类型：开发工具　优先级：P1　决定：待协调者定编号　建议分支：`slot-05-gate-snapshot`
- 来源：[S20 回顾行动 2](../reviews/S20-retro.md#行动项汇总)（D507）。S21 的 DEMO-21 先用手动命令（[#307](https://github.com/lingshf/ai-native-erp/pull/307) 给 Demo 模板加的第 23 条，“脚本化留待之后单独决定”）；本任务把它做成工具。
- 迁移：**不加**。浏览器时段：**不需要**。
- 数据：不读取任何账套；不读取真实旧账、4173 账套或 `.bak` 文件。

## 为什么

- DEMO-19 与 DEMO-20 两次开窗都要人工判断外来进程。DEMO-20 开窗时多出的 PID 4056 无法归属，原因是门禁记录没有 cwd 和父进程（D507，见 [S20 评审 §2.2](../reviews/S20-review.md)）。
- 手动命令（#307 第 23 条）只取得到 `Win32_Process` 的字段：PID、父 PID、创建时间、命令行。**`Win32_Process` 没有 cwd**；逐级查父进程链、每分钟重复一次，也全靠人工，容易漏记。
- 仓库已有读取 cwd 的代码：`scripts/slot/procs.ps1:22–53` 的 `[Gate01Cwd]::Get(pid)` 从进程 PEB 读取 64 位进程的当前目录，读不到返回 `$null`。采样器的归属判定（`Get-Owner`，`:94`）就用它。工具复用这段代码，不重写。
- 设计角色在 `276fd3b` 上试过（见“证据要求 / 可行性”）：在 pwsh 7 中 dot-source `procs.ps1` 后，对 `node -e` 子进程调用 `[Gate01Cwd]::Get` 能读到 cwd；`KernelModeTime + UserModeTime` 也能折算出 CPU 秒数。

## 现状（main `276fd3b`）

- `scripts/slot/procs.ps1` 共 241 行：
  - `:22–53` 是 `Gate01Cwd`（`Add-Type`，已加载时跳过）；
  - `:54` 用 `git -C $PSScriptRoot rev-parse --git-common-dir` 定位本仓库；
  - `:88–93` 的 `Get-UnknownDetail` 把 `name / pid / ppid / created / exe / cwd / cmdline` 拼成一行，读不到的写 `unreadable`；
  - `:215–241` 的 `Counted` 是采样器的计数入口（规则 R3）。
- `scripts/slot/check-manifest.mjs` 只检查 `procs.ps1` 与 `slot-run.ps1` 的出口标注（`:16`、`:31–32`）。新增文件只要不加 `# exit SR-…` 出口标注，就不进入规则表核对。
- `git cat-file -e 276fd3b:scripts/slot/gate-snapshot.ps1` 的退出码是 128，说明 base 上没有该工具（设计角色已核对）。
- 进行中的 [#304](https://github.com/lingshf/ai-native-erp/pull/304)（SLOT-04）改 `scripts/slot/slot-run.ps1`、`selftest-location.ps1`（新）和 `scripts/slot/README.md`。本任务也要改 README，所以**须等 #304 合并后再派发**。

## 设计决定（产品负责人）

1. **只记录，不判定**：工具只把事实写进 TSV，不判断进程是否计数、是否属于本仓库或是否放行，也不调用 `Counted` / `Get-Owner`。采样规则 R3、路线图 §5 规则表和 `check-manifest.mjs` 的输出都不变。归属由协调者按快照判断。
2. **复用 `Gate01Cwd`**：新脚本 dot-source 同目录的 `procs.ps1`，只调用 `[Gate01Cwd]::Get`，不改 `procs.ps1`，不复制那段 C#。
3. **命令行**：
   ```powershell
   pwsh -NoProfile -File scripts\slot\gate-snapshot.ps1 -OutFile <新文件.tsv> -Ports "<端口>[,<端口>…]" (-Once | -StopFile <路径>) [-IntervalSeconds 60] [-MaxMinutes 180]
   ```
   - `-OutFile` 必须是**不存在的新文件**，所在目录必须已存在，不覆盖、不追加。
   - `-Ports` 必填，列出本次要核对的监听端口（窗口申请里写“批准端口和 4173”）。工具里**不写死任何端口**。
   - **`-Ports` 是一个字符串参数（`[string]`），按逗号分隔的 CSV 由工具自己解析**，不依赖 PowerShell 的数组绑定：`pwsh -File` 把参数作为字符串传入，不会把 `P,Q` 绑定成整型数组。解析规则：按 `,` 切分，每项去掉首尾空白后须是 1–65535 的十进制整数；空项（如 `"4204,"`）、非数字、超出范围或重复的端口都按参数错误处理（退出码 3，不写文件）。申请与执行中统一写成带引号的一个参数，例如 `-Ports "4204,4173"`。
   - `-Once` 只做一次快照（开窗前门禁）；`-StopFile` 用于窗口内每隔 `-IntervalSeconds` 秒做一次快照，直到该文件出现，或达到 `-MaxMinutes` 上限。`-Once` 与 `-StopFile` 必须二选一。
   - 第一次快照立即做；之后每次在上一次开始后满 `-IntervalSeconds` 秒时进行，不累积漂移。
4. **每次快照的内容**（每次快照写完立即落盘，窗口内可随时读到已完成的快照）：
   - **node 进程**：`Name` 为 `node.exe` 的全部进程，每个一行，`depth=0`。
   - **父进程链**：每个 node 进程沿 `ParentProcessId` 向上逐级记录，`depth=1, 2, …`，直到第一个非 node 进程（含该进程）后停止。遇到以下情况也停止，并在该行 `note` 列写明原因，不推测：父进程不存在（`parent-exited`）、父进程比子进程晚创建（`pid-reused`）、深度达到 32（`depth-cap`）。同一快照内多个 node 进程共享的祖先也逐个链记录，不去重，便于逐链阅读。
   - **端口监听**：`-Ports` 中每个端口的**每个** Listen 状态端点各一行（`kind=listen`），`localAddress` 写该端点的本地地址（如 `127.0.0.1`、`::1`、`0.0.0.0`），`pid` 写其 `OwningProcess`；同一端口有多个监听地址或多个监听进程时逐个成行，不合并。该端口没有任何监听时写一行，`pid=none`、`localAddress` 为空。某端口的查询出错时，该端口只写一行 `kind=error`（`port` 填该端口），**不写** `pid=none`：查询失败是“无法判定”，不是“空闲”。
   - **空快照**：没有任何 node 进程时写一行 `kind=none`，保证每次快照至少有一行，按分钟可查。
5. **TSV 列（固定顺序，首行表头）**：`snapshot`、`takenAt`、`kind`（`node` / `ancestor` / `listen` / `none` / `error`）、`pid`、`ppid`、`depth`、`name`、`created`、`cpuSeconds`、`exe`、`cwd`、`cmdline`、`port`、`localAddress`、`note`。
   - `takenAt` 与 `created` 都写带时区偏移的 ISO 8601（`ToString('o')`）；
   - `cpuSeconds` 等于 `(KernelModeTime + UserModeTime) / 1e7`，保留 3 位小数；
   - `cmdline` 中的制表符、换行与连续空白都归一为一个空格；
   - 读不到的值写 `unreadable`（同 `Get-UnknownDetail`），不写空串，不推测。
6. **退出码**（任务书模板“门禁的无法判定”）：

   | 退出码 | 含义 | 是否写文件 |
   | --- | --- | --- |
   | 0 | 全部快照完成，没有查询出错 | 写 |
   | 2 | 不是 Windows，或不是 PowerShell 7（与 `slot-run.ps1` 相同） | 不写 |
   | 3 | 参数错误：`-OutFile` 已存在或目录不存在；`-Once` 与 `-StopFile` 没有二选一；`-Ports` 的 CSV 中有空项、非整数、不在 1–65535 或重复的端口；`-IntervalSeconds` < 1 | 不写 |
   | 8 | 至少一次进程查询或端口查询出错（沿用 D475 端口查询失败的退出码）。出错的那次写一行 `kind=error`，`note` 是异常消息；工具继续完成其余快照 | 写 |
   | 9 | 达到 `-MaxMinutes` 上限时 `-StopFile` 仍未出现。已写的快照保留 | 写 |

   - **优先级**：退出码按 `8 > 9 > 0` 取一个。窗口内先有查询出错、之后又达到 `-MaxMinutes` 上限时退出 **8**，不是 9；是否达到上限由摘要中的 `timedOut` 单独说明，两条事实都不丢。

   结束时向控制台打印一行摘要：`gate-snapshot done snapshots=<n> rows=<n> errors=<n> timedOut=<true|false> exit=<码>`。
7. **不做的事**：
   - 不起 node，不开端口，不访问网络；
   - 不读取账套与 `logs/` 以外的文件；
   - 不结束任何进程；
   - 不改 `procs.ps1`、`slot-run.ps1`、`preflight*`、步骤文件与既有自测；
   - 不进入 Vitest 或 CI；Windows 专用，与 `selftest*.ps1` 相同。
8. **与 `slot-run.ps1` 的关系**：两者是独立的工具，本任务不把快照接进 runner。窗口内由版本管理在另一个 pwsh 中按申请原文运行（D508：申请里的命令与实际执行逐字一致，后面不加管道）。

## 范围

- 新增 `scripts/slot/gate-snapshot.ps1`、`scripts/slot/selftest-gate-snapshot.ps1`。
- 修改 `scripts/slot/README.md`：文件表加两行，“运行”一节加用法与退出码表。

## 冲突域

- tooling:slot-gate：只涉及上面三个文件。
- 与 [#304](https://github.com/lingshf/ai-native-erp/pull/304)（SLOT-04）都改 `scripts/slot/README.md`，所以本任务排在 #304 合并之后派发。
- 与 S22 其他任务不相交：REFAC-12 / TLIST-06 只改 `packages/web/`；DOC-22 只改 `docs/release/README.md`、`docs/demo/TEMPLATE.md`。
- **DEMO 窗口**：`scripts/slot/` 是时段工具，DEMO 窗口开启到关闭之间不改、不合并本任务。本任务的自测会起 node 并占用一个临时端口，须服从协调者的静默通知（D480）。
- 受影响的 e2e 断言：无（不涉及 `packages/`）。
- 受影响的文档：`docs/demo/TEMPLATE.md` 第 23 条（#307）改为引用本工具，由版本管理在 DOC-22 中完成，本任务不改 `docs/`。

## 验收

### base 失败、head 通过

用 head 的 `selftest-gate-snapshot.ps1` 在 base 与 head 上各跑一次。base 上没有 `gate-snapshot.ps1`，各用例应以“脚本不存在”失败；PR 正文附两次运行的未截断输出，以及每个用例在 base 上的失败原因。

| 编号 | 断言 | base `276fd3b` | head |
| --- | --- | --- | --- |
| G1 | 自测起两级 node 进程：父进程 cwd 为临时目录 A，子进程 cwd 为临时目录 B。`-Once` 之后，TSV 中子进程那条链依次是 `node depth=0 cwd=B`、`ancestor depth=1`（父 node，cwd=A）、`ancestor depth=2`（第一个非 node 进程，即自测的 pwsh），并在此结束 | 失败：没有工具 | 通过 |
| G2 | G1 中各行的 `created` 可解析为带偏移的时间；`cpuSeconds` 是非负数；`cmdline` 不含制表符与换行 | 失败 | 通过 |
| G3 | 自测**以子进程方式**用与开窗申请相同的公开调用 `pwsh -NoProfile -File scripts\slot\gate-snapshot.ps1 -OutFile <新文件> -Ports "P,Q,4173" -Once` 运行（P 代表批准端口，4173 与开窗申请的并集相同）（不在进程内直接调用函数、不绕过参数绑定），退出码 0。自测在一个空闲端口 P 上起两个 node 监听（分别绑定 `127.0.0.1` 与 `::1`），另取一个空闲端口 Q：输出中有 P 的两行 `kind=listen`（`localAddress` 分别为 `127.0.0.1` 与 `::1`，`pid` 等于各自的监听进程）与 Q 的一行 `pid=none`（`localAddress` 为空），并有 4173 的行（`kind=listen`，`pid` 为实际监听者或 `none`；自测只查询 4173，不绑定、不结束其上的进程，也不断言它空闲），且没有 `kind=error` 行；本机不能绑定 `::1` 时，改用 G6 同样的替身注入两条监听记录验证逐端点成行，并在 PR 正文说明 | 失败 | 通过 |
| G4 | `-StopFile` 加 `-IntervalSeconds 1`：自测轮询 TSV，**等到 `snapshot=2` 的行实际写出**后才创建停止文件（等待上限 30 s，超时则用例失败并写明“30 s 内未见第 2 次快照”，不得提前发停止信号）；之后工具在停止文件出现后 ≤ 15 s 内退出，退出码 0，`snapshot` 从 1 起连续、≥ 2 次，摘要 `timedOut=false`。判定只依据已写出的快照与退出码，不依据固定的等待时间，慢机上同样成立 | 失败 | 通过 |
| G5 | 参数错误分别得到退出码 3 且不写文件，全部经 `pwsh -NoProfile -File` 调用：`-OutFile` 已存在；`-Once` 与 `-StopFile` 都给或都不给；`-Ports` 为 `"0"`、`"70000"`、`"abc"`、`"4204,"`、`"4204,4204"` | 失败 | 通过 |
| G6 | 用自测的替身（例如通过参数注入，使端口查询抛异常）模拟查询出错：退出码 8，TSV 中出错端口只有 `kind=error` 行、没有该端口的 `pid=none` 行，其余行照常写出 | 失败 | 通过 |
| G7 | `-MaxMinutes` 上限：使用替身时钟或允许的最小值（由开发定，在 PR 正文说明）使上限先到，得到退出码 9、摘要 `timedOut=true`，已写的快照保留；再把 G6 的查询出错替身与上限同时使用，得到退出码 **8**、摘要 `errors≥1 timedOut=true`（验证 8 > 9 的优先级） | 失败 | 通过 |

- G6、G7 的替身只在自测中使用。注入方式由开发定，但必须是参数或环境变量这类显式入口，不改动正式路径的行为；PR 正文写明注入方式。

### 两侧都须成立的不变量

- **G8 范围**：`git diff --name-only <base> <head>` 只含“范围”所列三个文件。不加迁移。
- **G9 规则不变**：`node scripts/slot/check-manifest.mjs` 在 base 与 head 上都退出码 0，输出逐字相同；`procs.ps1` 与 `slot-run.ps1` 的 diff 为空；`$script:SlotRuleVersion` 仍是 `R3`。
- **G10 既有自测**：`selftest.ps1`、`selftest-ports.ps1` 与 `selftest-preflight.ps1` 在 head 上通过（若 #304 已合并，再加 `selftest-location.ps1`），附未截断输出；PR CI 绿。
- **G11 自测不留痕**：自测结束后，自测起的 node 进程全部结束，临时目录全部删除，所用端口不再监听。PR 正文附自测结束后的 `Get-CimInstance Win32_Process -Filter "Name='node.exe'"` 输出，以及对所用端口的 `Get-NetTCPConnection` 查询结果。
- **G12 PR 正文**须含：“用户可见变化”一节（写“无”）；“可读性”一节；G1–G7 的用例名与 `file:line` 对照表；一次 `-Once` 的真实输出样例（可以只截取表头与前 10 行，但须注明行数）。

## e2e 断言

- 无。不改 `packages/`。

## 性能考虑

- 每次快照做一次 `Get-CimInstance Win32_Process`，对每个 node 进程及其祖先各调用一次 `Gate01Cwd`，再对每个端口做一次 `Get-NetTCPConnection`。时间预算：单次快照 ≤ 5 s，在本机 node 进程不超过 30 个时测量；PR 正文附实测的单次快照耗时。
- 其他项（规模、索引、分页、事务、打包）都不适用：不涉及数据库与 Web。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥：

- `gate-snapshot.ps1` ≤ 160 行；`selftest-gate-snapshot.ps1` ≤ 220 行；README 净增 ≤ +20 行。
- 每个函数 ≤ 40 行，嵌套 ≤ 3 层。建议拆成参数校验、单次快照、父进程链、端口行、写 TSV 和循环几个函数，命名表达职责（①）。
- ④：cwd 只经 `Gate01Cwd`；`unreadable` 的写法与 `Get-UnknownDetail` 一致。自测中起进程、取空闲端口、清理这几项都写成辅助函数，不在用例里逐个复制。
- ⑤：退出码、列名、`depth` 上限 32 与默认间隔 60 用具名变量。
- **测试耗时**（[S20 回顾行动 6](../reviews/S20-retro.md#行动项汇总)，见[任务书模板“测试在满载下的耗时”](TEMPLATE.md#证据要求)）：
  - 自测总耗时 ≤ 60 s，G4 的等待用停止文件加轮询，不用固定的长 sleep；
  - PR 正文附自测总耗时与每个用例的耗时；单个用例 > 2 s 的写明原因（G4 要等第 2 次快照实际写出，耗时取决于机器，PR 正文写实测值）。

## 用户可见变化

- 无。这是开发工具，ERP 的界面、数据与行为都不变。
- 对版本管理的变化：开窗前门禁和窗口内每分钟的快照可以用一条命令完成，结果是一份 TSV，包含 cwd、父进程链与端口监听。Demo 模板第 23 条由 DOC-22 改为引用本工具。

## 证据要求

- **不需要浏览器时段**。自测在本机运行，须避开 DEMO 窗口，服从静默通知（D480）。
- **可行性**（S13 回顾行动 4，模板“证明条款的可行性”）：设计角色在 `276fd3b`、pwsh 7、Windows 64 位上运行了以下探针，结果为 `cwd=[<临时目录>\]`、`cpu=0.09375`，`created` 带 `-08:00` 偏移，退出码 0：
  ```powershell
  . .\scripts\slot\procs.ps1
  $p = Start-Process node -ArgumentList '-e','setTimeout(()=>{},8000)' -WorkingDirectory <临时目录> -PassThru -WindowStyle Hidden
  $w = Get-CimInstance Win32_Process -Filter "ProcessId=$($p.Id)"
  [Gate01Cwd]::Get($p.Id); ($w.KernelModeTime + $w.UserModeTime) / 1e7; $w.CreationDate.ToString('o')
  ```
  注意：`Gate01Cwd` 返回的路径可能带结尾的 `\`。工具原样记录，不做修剪。G1 的比较按 `TrimEnd('\')` 之后进行。
- PR 正文附：base 与 head 两次自测的未截断输出；G9 的两次 check-manifest 输出；G10 的既有自测输出；G11 的进程与端口查询；可读性一节（`git diff --numstat` 与函数行数）。
