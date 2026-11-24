# 独占时段进程采样器（`scripts/slot/`）

E2E 独占时段（[路线图 §5](../../design/roadmap.md#5-团队流程)“E2E 独占时段”）用的运行器与进程采样器，规则见路线图 §5“进程采样规则”。本目录实现规则版本 **R3**（`procs.ps1` 中的 `$script:SlotRuleVersion`）：R1 即 D319 时段所用 D316 版 kit（gist `lingshf/c437f3d99887d0214ebd05ae9d741cc5` @ `4e00af7`）的实际逻辑，含 D320 追认的 launcher 分支，逐分支一致，只多出规则编号；R2 在 R1 上加了 SR-X1 的沿用判定（D411、D412，S12 SLOT-02）：本次运行已判为外仓的进程，之后命令行读不到但创建时间不变时仍判外仓；一旦某次可读采样改判为非外仓，沿用记录即清除（以最新可读判定为准）。R3 在 R2 上加了 SR-X6（D472，S16 SLOT-03）：归属不明的进程（命令行读不到且没有 D411 沿用，或整条链都没有仓库证据且不属 SR-X2–X5）不再计数，改为排除并完整记录；R2 及以前这类进程按 SR-C3 计数。R3 同时加了端口硬检查（`-Ports`；端口被占用退出码 7，端口查询失败退出码 8）。来源：[SLOT-01](../../design/tasks/SLOT-01-slot-sampler-in-repo.md)、S16 SLOT-03。

不进 Vitest、不进 CI；唯一例外是开跑前静态检查（`preflight.mjs`），PR CI 的 verify 也运行它（S15 CI-02，见[下文](#开跑前静态检查s12-slot-02d407--d408)）。

| 文件                              | 作用                                                                                                                                                       | 平台            |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `procs.ps1`                       | 候选、归属与排除判定（`Counted`），每个判定出口标注 SR 编号                                                                                                | Windows         |
| `slot-run.ps1`                    | 时段运行器：构建门禁、预检（连续 6 次计数为 0）、逐步运行并每 10 s 采样                                                                                    | Windows         |
| `steps.example.ps1`               | `-StepsFile` 示例（步骤列表；kit 中为 GATE-01 专用列表）                                                                                                   | Windows         |
| `steps.gate01.ps1`                | 原样复现 D316 kit 的 GATE-01 七个步骤（D347）；需要 `-BaseRoot` 下有 `artifacts/ci/gate01/` 工具，否则退出码 4                                             | Windows         |
| `selftest.ps1`                    | 自测：kit 原有 27 项 + 每条 SR 规则的正例与反例 + 可选的与 D316 kit 逐 PID 对照                                                                            | Windows         |
| `check-manifest.mjs`              | 清单检查：判定出口与路线图规则表、规则版本逐一对照                                                                                                         | 任意 OS（Node） |
| `preflight.mjs`、`preflight/`     | 开跑前静态检查（S12 SLOT-02，D407 / D408）：tsc 与 TDZ，对照基线                                                                                           | 任意 OS（Node） |
| `tsconfig.preflight.json`         | 静态检查的 tsc 范围：`npm run typecheck` 不覆盖的场景与 `*.slow.test.ts` 文件                                                                              | —               |
| `preflight-baseline.json`         | 静态检查基线：既有 tsc 错误与 TDZ 发现的计数，只减不增                                                                                                     | —               |
| `fixtures/`                       | TDZ 回归夹具（`tdz-*.ts.txt`，按内容解析，不进 lint 与 typecheck）与 I1 的 `PSModulePath` 探针                                                             | —               |
| `tdz-fixtures.mjs`                | TDZ 夹具检查：逐个夹具输出 `PASS` / `FAIL`                                                                                                                 | 任意 OS（Node） |
| `step-env.ps1`                    | 步骤子进程环境：每步重置 `PSModulePath`                                                                                                                    | Windows         |
| `selftest-preflight.ps1`          | `selftest.ps1` 第 5 部分：子进程环境（I1）、tsc 基线键（I3）、TDZ 夹具（I4）、静态检查接入 runner（I5）                                                    | Windows         |
| `selftest-ports.ps1`              | 端口硬检查自测（S16 SLOT-03 S5）：端口被替身占用时退出码 7，替身结束后不是 7，非 `-Stub` 不给 `-Ports` 时退出码 4，模拟端口查询失败时退出码 8（D475）      | Windows         |
| `selftest-location.ps1`           | 调用位置自检与 dist 检查自测（S21 SLOT-04 S1–S6）：R-base / R-steps 命中时零动作退出码 4，合法形式记 `call location ok`，dist 检查经 `assert-web-dist.ps1` | Windows         |
| `gate-snapshot.ps1`               | 窗口门禁快照（S22 SLOT-05，D507）：node 进程、父进程链、cwd、CPU 秒数与指定端口的监听者写成 TSV；只记录，不判定归属                                        | Windows         |
| `selftest-gate-snapshot.ps1`      | `gate-snapshot.ps1` 自测（G1–G7、G4b、G6b）：父进程链与 cwd、字段格式、逐端点监听、停止文件、节拍、参数错误、查询出错、TSV 写失败与时限                    | Windows         |
| `selftest-slot-snapshot.ps1`      | runner 自动快照自测（S23 SLOT-06，D517）：端口被占仍为 7 且快照有占用者、无遗留子进程、端口去重、慢快照超时、启动前退出码 4 不起快照；评审项 G11–G15       | Windows         |
| `steps.d387.ps1`                  | D387 回归步骤：用 `powershell.exe` 原样运行 v0.11.0 Demo 的三个无浏览器替身                                                                                | Windows         |
| const rows = compareWithBaseline( |
    countByKey(findings, (found) => found.key),
    allowedCounts,
);
ast = setup.parse(readFileSync(file, "utf8"), {
sourceType: "module",
plugins: PARSER_PLUGINS,

## 运行

```powershell
# 自测（PowerShell 7 / pwsh；需要 node 在 PATH 上）
pwsh -File scripts/slot/selftest.ps1 [-OutDir $env:TEMP\slot-selftest-out] [-ReferenceProcs artifacts/ci/gate01-ref/procs.ps1]

# 端口硬检查自测（会以 -Stub 跑一次构建，不开浏览器）
pwsh -File scripts/slot/selftest-ports.ps1 -OutDir $env:TEMP\slot-selftest-ports-out

# 调用位置与 dist 检查自测（S5 / S6 各以 -Stub 构建一次，不开浏览器）
pwsh -File scripts/slot/selftest-location.ps1 -OutDir $env:TEMP\slot-selftest-location-out

# runner 自动快照自测（以 -Stub 构建一次，不开浏览器；G5 约 45 s）
pwsh -File scripts/slot/selftest-slot-snapshot.ps1 -OutDir $env:TEMP\slot-selftest-slot-snapshot-out

# 时段运行（先按路线图 §5 申请时段，申请写明规则版本 R3）；在被测应用的工作树中执行
pwsh -File scripts/slot/slot-run.ps1 -OutDir $env:TEMP\slot-<任务>-<日期> -StepsFile <步骤文件> -Ports 4203 [-BaseRoot <base 工作树>] [-PreflightFiles <路径>[,<路径>…]]
# 演练：-Stub pass 或 -Stub fail:<步骤名>，步骤换成 node 一行脚本，不开浏览器；-Stub 下 -Ports 可省略

# 开跑前静态检查（runner 会自动运行；也可单独运行）与 TDZ 夹具检查
node scripts/slot/preflight.mjs --root . [--files <路径>…]
node scripts/slot/tdz-fixtures.mjs

# 清单检查（任意 OS）
node scripts/slot/check-manifest.mjs [--roadmap design/roadmap.md] [--code scripts/slot/procs.ps1]

# 窗口门禁快照：开窗前 -Once；窗口内 -StopFile（每 -IntervalSeconds 秒一次，停止文件出现或到 -MaxMinutes 为止）
pwsh -NoProfile -File scripts\slot\gate-snapshot.ps1 -OutFile <新文件.tsv> -Ports "<端口>[,<端口>…]" (-Once | -StopFile <路径>) [-IntervalSeconds 60] [-MaxMinutes 180]
pwsh -NoProfile -File scripts\slot\selftest-gate-snapshot.ps1   # 自测（起 node，占一个临时端口；只查询 4173）
```

- **`gate-snapshot.ps1`**（S22 SLOT-05）：`-OutFile` 须是新文件（目录已存在）；`-Ports` 是一个带引号的 CSV 字符串（如 `-Ports "4204,4173"`），工具里不写死端口。第一次快照立即做，之后每次在上一次实际开始后满 `-IntervalSeconds` 秒时做（某次慢了不按全局节拍补采）；每次快照立即追加到 TSV，列为 `snapshot takenAt kind pid ppid depth name created cpuSeconds exe cwd cmdline port localAddress note`：每个 node 进程一行（`kind=node`），其父进程链逐级到第一个非 node 进程（`kind=ancestor`，`note` 写 `parent-exited` / `pid-reused` / `depth-cap` 时链提前结束）；每个端口的每个 Listen 端点一行（一次 CIM 查询 `MSFT_NetTCPConnection State=2` 取全部 Listen 端点），查询成功且该端口无端点时才写 `pid=none`，查询抛出任何异常（不论类别，包括 ObjectNotFound）时每个端口写 `kind=error`；没有 node 进程时一行 `kind=none`。cwd 取自 `procs.ps1` 的 `[Gate01Cwd]::Get`，读不到的值写 `unreadable`。只记录，不判定归属，不结束进程。

  | 退出码 | 含义（多个成立时按 8 > 9 > 0 取一个；时限另见摘要 `timedOut`）                                                                                   | 写文件 |
  | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
  | 0      | 全部快照完成，没有查询出错                                                                                                                       | 写     |
  | 2      | 不是 Windows 或不是 PowerShell 7                                                                                                                 | 不写   |
  | 3      | 参数错误：`-OutFile` 已存在或目录不存在；`-Once` 与 `-StopFile` 不是二选一；`-Ports` 有空项、非整数、超出 1–65535 或重复；`-IntervalSeconds` < 1 | 不写   |
  | 8      | 至少一次进程或端口查询出错（该处写 `kind=error`，不写 `pid=none`），其余快照照常完成；或 TSV 创建 / 追加失败（立即停止，摘要只计已写入的快照）   | 写     |
  | 9      | 到 `-MaxMinutes` 时停止文件仍未出现                                                                                                              | 写     |

  结束时打印 `gate-snapshot done snapshots=… rows=… errors=… timedOut=… exit=…`。自测替身只经环境变量注入：`GATE_SNAPSHOT_FAIL_LISTEN_QUERY=<错误类别>`（在 try 内代替监听查询抛出该类别的错误，走真实的分类分支）、`GATE_SNAPSHOT_SLOW_FIRST_SECONDS`（第一次快照慢 n 秒）、`GATE_SNAPSHOT_SECONDS_PER_MINUTE`（替身时钟）；正式使用不设置。

- **需 pwsh 7**（D347）：只能在 Windows 的 PowerShell 7 上运行：`selftest.ps1` 与 `slot-run.ps1` 在非 Windows 上立即以退出码 2 结束（“只能在 Windows 运行”）；在 Windows PowerShell 5.1 上同样以退出码 2 结束，因为 `procs.ps1`（与 D316 kit 相同）用了只有 .NET Core 才有的 `[IO.Path]::GetFullPath(path, base)`，5.1 下所有 git 工作树（`.git` 是文件）都会被当成“无仓库”。D316 kit 也一直在 PowerShell 7 下运行。它用 WMI 启动替身进程（node.exe 及其改名副本），在 `%TEMP%\slot-selftest-*`、`%LOCALAPPDATA%\Programs\slot-selftest-*` 与 `scripts/slot/selftest/` 下建临时文件；结束时只停止这些替身进程的进程树并删除这些临时目录，不碰其他进程。输出逐项 `PASS` / `FAIL` 与 `summary` 行，有 FAIL 时退出码 1。
- `-ReferenceProcs`：D316 kit 的 `procs.ps1` 副本（按 LF 计算 SHA-256 须为 `906A4B70…90A6F8`，否则失败）。它用 `git -C <所在目录>` 定位本仓库，所以副本须放在本仓库某个工作树内，建议 `artifacts/ci/gate01-ref/procs.ps1`（`artifacts/ci/` 已被 git 忽略，不入库）。给出时，自测的每个快照同时交给 kit 的 `Counted`，计数集合与排除集合须逐 PID 相同（`EQUIV` 项）；R3 下 kit 计数而本目录判 SR-X6 的 PID 算一致（`r3-sr-x6=` 列出），其余仍须逐 PID 相同。第 1 部分中 kit 参考结果为“计数，SR-C3”的用例改为期望“排除，SR-X6”，逐项标“R3 差异”，`summary` 后一行列出这些用例。
- **`-Ports`**（R3，D472）：时段要用的端口，例如 `-Ports 4203`（多个端口在 `pwsh -File` 下写成 `-Ports 4203,4204`）。非 `-Stub` 运行不给时构建前以退出码 4 结束（`missing -Ports`）；端口不在 1–65535 时同样是 4。检查两次：加载步骤后、静态检查与进程预检之前（`phase=before-preflight`）；进程预检通过后、第一个步骤之前（`phase=before-steps`）。任一端口有 `Listen` 状态的 TCP 连接（任意地址，IPv4 / IPv6）就以**退出码 7** 结束，不等待、不重试（D444），日志每个占用写一行 `port busy phase=… port=… address=… pid=… name=… cmdline=[…] verdict=[<SR 判定>]`，再写 `ABORT: slot port in use (…)`；端口空闲时写 `ports free phase=… ports=…`。端口查询本身失败（`Get-NetTCPConnection` 报错，无论是非终止错误还是异常）时不当作空闲：每条错误写一行 `port lookup failed phase=… id=[…] category=[…] exception=[…] message=[…]`，再写 `ABORT: port lookup failed (…)`，以**退出码 8** 结束，不重试、不开跑（D475）；退出码 7 只表示确认有监听。`-Stub` 下给了 `-Ports` 同样检查；没给时记 `ports not given (stub) phase=…`。
- **被测应用与时段工具可分开**：仓库根取自调用时的当前目录（构建、dist 检查、步骤的 `-Root` 与 `runner start head=` 都用它），`procs.ps1`、`preflight.mjs` 从脚本所在目录加载。在被测应用的工作树中执行 `pwsh -File <工具工作树>\scripts\slot\slot-run.ps1 …` 即可；`slot-summary.log` 的 `runner start head=…` 是被测应用的 HEAD，下一行 `tooling head=…` 是脚本所在工作树的 HEAD。
- **调用位置自检**（S21 SLOT-04）：输入检查之后、执行步骤文件之前检查两条规则，任一成立即以**退出码 4** 结束，零动作（不执行步骤文件、不查端口、不预检、不构建、不采样）：**R-base** 给了 `-BaseRoot` 且它（在 git 工作树内取其顶层）与当前仓库根是同一目录（不区分大小写、不计末尾分隔符）；**R-steps** `-StepsFile` 所在 git 工作树既不是当前仓库根，也不是脚本所在工作树（不在 git 工作树内的步骤文件不受限）。日志写 `ABORT: call location rules=… root=… tool=… steps-worktree=… base-root=…` 与正确形式：在 app 工作树内执行 `pwsh -File <工具工作树>\scripts\slot\slot-run.ps1 …`；通过时写 `call location ok root=… tool=… steps-worktree=…`。
- **runner 退出码**：0 全部步骤通过；1 构建失败、有步骤失败或 runner 异常；2 步骤期间采样到计数进程，或平台 / PowerShell 版本不符；3 进程预检 15 分钟超时；4 输入或配置错误（含缺 `-Ports`）；5 dist 检查未通过（调用 `scripts/demo/assert-web-dist.ps1`，日志 `dist check web-dist: …`；它的退出码非 0 时写 `ABORT: dist check exit <n>`；缺这个脚本时为 4）；6 静态检查有新发现；**7 时段端口被占用**（R3，确认有监听）；**8 端口查询失败**（R3，D475）。
- **自动门禁快照**（S23 SLOT-06，D517、D524；只记录、不改判定）：输入、调用位置与加载步骤这些退出码 4 的检查之后、第一次端口检查之前，runner 起 `gate-snapshot.ps1 -StopFile`，写 `<OutDir>\gate-snapshot-<UTC yyyyMMddTHHmmssfffZ>.tsv`；端口是 `-Ports` 与 4173 的并集（去重升序，`-Stub` 不给 `-Ports` 时只有 4173）。日志写 `gate snapshot started pid=… file=… ports=…`，再等第一次快照最多 15 s（超时写 `gate snapshot not ready after 15 s`，子进程提前退出写 `gate snapshot exited early exit=…`），都继续运行；起快照时出错只写 `gate snapshot not started: …`，子进程若已起则立即结束其进程树（`gate snapshot start failed; …`）。此后每条结束路径（含 `exit 0` 与 runner 异常）都建停止文件；停止步骤总共最多 30 s（含强制结束与确认）：先等子进程 25 s（留 5 s 给强制结束），退出则写 `gate snapshot exit=<n> gate-snapshot done …`；超时只结束这个子进程的进程树（`taskkill` 以子进程运行，等它也只用剩余预算），在剩余预算内确认它已退出才写 `gate snapshot stop timeout after 30 s; stopped pid=…`，否则写 `… WARNING: pid=… not confirmed stopped within the 30 s budget; taskkill exit=…`（`taskkill` 在预算内未结束时为 `taskkill not finished`）；停止文件建不成时不等待，直接结束进程树（`gate snapshot stop file not written (…); …`）；停止步骤自身出错只写 `gate snapshot cleanup error (runner exit code kept): …`，这条日志写失败也只吞掉，都不改 runner 的退出码。启动前的退出码 4 不起快照；`preflight.mjs` 返回的退出码 4 在启动之后，那时有快照且照常停止。runner 的判定、退出码与既有日志行不变，退出最多推迟 30 s；快照子进程属 SR-R1，不计数也不排除。人工在窗口内另起的 `gate-snapshot.ps1` 照旧，两者写不同的文件。
- `check-manifest.mjs` 退出码：0 一致；1 有出口缺编号、有表外编号、表内编号没有出口，或规则版本不一致；2 输入不可用（文件不存在、找不到规则表或版本）。判定出口按代码结构识别（`Get-Owner` / `Get-UnreadableOwner` / `Get-SystemExclusion` 中返回非空的 `return`，`Counted` 中的 `continue`、`@{ Kind = … }`、运行器树扩展与排除汇总），不依赖标注本身。

## 开跑前静态检查（S12 SLOT-02，D407 / D408）

`slot-run.ps1` 的顺序：输入检查 → 调用位置自检（SLOT-04）→ 加载步骤 → 端口检查（R3）→ **静态检查（先 head，再 base）** → 构建 → dist 检查（`assert-web-dist.ps1`）→ 进程预检 → 端口再检查（R3）→ 逐步运行。`-Stub` 演练同样真跑静态检查。

**PR CI 也运行**（S15 CI-02）：`.github/workflows/ci.yml` 的 verify 在 `Typecheck` 之后运行 `node scripts/slot/preflight.mjs --root .`（不带 `--files`），退出码判定与时段相同：0 通过，4 或 6 让 verify 失败。这样 `test/support/**` 与 `*.slow.test.ts` 的类型错误在合并前暴露。时段 runner 的第一步静态检查不变，不因 CI 已跑而省略。

- **检查内容**：`preflight.mjs --root <checkout>` 用 `<checkout>` 自己的 `node_modules` 下的 tsc 和 `@babel/parser`，读取 `<checkout>/scripts/slot/` 下的 `tsconfig.preflight.json` 与 `preflight-baseline.json`。
  - tsc：检查 `tsconfig.preflight.json` 的 `include`（`packages/infra/test/support/**/*.ts`、`packages/infra/test/http/*.slow.test.ts`）。
  - TDZ：同一函数或块作用域中，在某个 `let` / `const` / `class` 声明之前，直接引用该绑定，或调用（含作为参数传出）直接或间接引用该绑定的局部函数；同一条声明中的多个绑定各按自己的声明子句起点判定（`const first = later, later = 1;` 命中 `later`）。检查范围是上述文件加上 `--files`（可以是取证用的 `.mjs`）。
- **退出码**：0 无新发现；**4** 输入或配置错误（参数缺失、`--files` 后没有路径、`--root` 或 `--files` 不存在、tsconfig 或基线缺失或无法解析、找不到 tsc 或 `@babel/parser`、文件无法解析），其他内部异常也是 4；**6** 有新发现（基线外的 tsc 错误或 TDZ 发现，或某条计数超过基线）。输出逐条列出 `tsc NEW|baseline 文件(行,列) 错误码: 消息` 与 `tdz NEW|baseline 文件:行 键 (declared line N) via …`，最后一行是 `preflight result exit=…`。
- **原样传出**：head 预检以 4 或 6 结束时，runner 以同一退出码结束，不构建、不做 dist 检查、不做进程预检、不运行任何步骤；head 不为 0 时不跑 base。`-BaseRoot` 下有 `scripts/slot/preflight.mjs` 时用 base 自己的工具与基线检查 base（`--root <BaseRoot>`，不带 `-PreflightFiles`），结果同样原样传出；没有时记 `base preflight skipped (no preflight.mjs)`，不算错误；不给 `-BaseRoot` 时记 `base preflight skipped (no -BaseRoot)`。
- **`-PreflightFiles`**：只交给 head 预检的 `--files`；相对路径按调用时的当前目录解析。文件不存在时预检返回 4，runner 原样传出。
- **日志**：`OutDir` 下的 `preflight-head.log` / `preflight-base.log` 是完整输出；`slot-summary.log` 中各有一行 `preflight head|base exit=… log=… preflight result …`。
- **基线只减不增**：`preflight-baseline.json` 按“错误码 + 消息首行及其续行”（tsc，续行以 `>>` 连接，不含文件、位置与长联合的省略计数；TS2769 这类诊断的实际参数类型只在续行）和“外层函数路径 > 绑定名”（TDZ）计数。基线外的键或计数变大即为新发现（6）；计数减少或消失的条目只在日志中列为 `reduced`，不阻断，由后续 PR 删除。增加条目或调大计数须经设计角色批准并有决定编号。

## 步骤子进程环境（D387 / D407）

runner 在 pwsh 7 中运行，子进程会继承 pwsh 7 的 `PSModulePath`；步骤中启动的 Windows PowerShell 5.1 因此加载不了自带的模块（D387：哈希 cmdlet “not recognized”）。`step-env.ps1` 让每个步骤（含 `-Stub` 步骤，不只是 `powershell.exe` 步骤）启动前把 `PSModulePath` 设为从资源管理器启动的 5.1 看到的值：User 值（非空时）在前，接 Machine 值。步骤的 `env.PSModulePath` 显式给值时以步骤为准。每步日志多一行 `step <名字> PSModulePath=<值>`；步骤结束后恢复 runner 原来的值。

本目录新写的脚本与改动的行计算哈希用 .NET（`[System.Security.Cryptography.SHA256]`），生成 GUID 用 `[guid]::NewGuid()`，不用对应的 cmdlet（D408）；唯一例外是 `fixtures/psmodulepath-probe.ps1`，它故意调用哈希 cmdlet 来验证环境修正。

## 日志

- 日志与时段现场数据**只写到仓库外的目录**（`-OutDir`，例如 `%TEMP%` 下）；`OutDir` 在仓库内时两个脚本都拒绝运行（退出码 4）。`slot-run.ps1` 在入口把相对的 `-OutDir`、`-StepsFile`、`-BaseRoot` 按调用时的当前目录解析成绝对路径，校验与写入都用这个路径（运行器随后切到仓库根，日志也不会移位或写进工作树；D354）。`-StepsFile` 没有产出任何步骤时，构建前以退出码 4 结束（D354）。不提交任何日志或采样输出。
- 用完**归档，不删除**（S10 回顾行动 1/2）：例如上传到取证 gist 或附到 PR，并在 PR 正文中链接。
- `slot-run.ps1` 的输出：`slot-summary.log`（开头 `runner start head=… rules=R3 ports=…` 与 `tooling head=…`；每次采样一行 `runner-tree n=…`；每个被排除的 PID 首次出现时一行 `excluded pid=… rule=SR-X… name=… reason=[…] cmdline=[…]`）、`processes.tsv`（每次采样的计数、计数进程及其规则、排除数、运行器树进程数，以及最后一列 `sr-x6`：该次采样中归属不明而被排除的进程数）、`excluded.tsv`（每次采样的每个排除进程，含 `rule` 列），以及各步骤的输出。SR-R1 只出现在 `runner-tree` 行，不出现在排除日志里。
- `slot-run.ps1` 的自动快照（SLOT-06）：每次运行一组 `gate-snapshot-<时间戳>.tsv`、`.stdout.log`、`.stderr.log`（不用 `.out.log`：那是步骤输出的命名，自测据此判断步骤是否运行）与停止文件 `.stop`，同一 `-OutDir` 复用时各次运行文件不同。
- **SR-X6 的原因字段**（R3）：`name= pid= ppid= created= exe= cwd= cmdline=[…]`，读不到的值写 `unreadable`；整条链没有仓库证据的情形另写 `ancestors-walked=<上溯层数>`。命令行读不到的情形不另读 cwd（与命令行在同一处进程内存，读不到），写 `cwd=unreadable`。
- `selftest.ps1` 的输出：`<OutDir>/selftest.log`（缺省 `%TEMP%\slot-selftest-out-<时间>`）。

## 规则变更流程

1. 新增、放宽或改变任何一条规则的判定或优先级，先由协调者给出决策编号（D…）。
2. 设计角色把改动写入路线图 §5“进程采样规则”表并升版本号（R3…）。
3. 再改本目录代码：更新 `$script:SlotRuleVersion`、出口标注与自测（新规则至少 1 个正例与 1 个反例），`check-manifest.mjs` 与 `selftest.ps1` 都通过后提 PR。
4. 时段申请写明所用规则版本。

代码先于路线图改动时，`check-manifest.mjs` 会因版本不一致或表外编号而失败。
