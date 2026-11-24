# Demo 模板

复制到 `docs/demo/vX.Y.Z/README.md` 使用，并按发布流程 `docs/release/README.md` 执行。本文件不放相对链接，避免复制后指错目录；版本 README 中写链接时，从 `docs/demo/vX.Y.Z/` 出发应为 `../../release/README.md`，写完请点开确认可达。

## 硬性要求

1. **每条命令在评审前已在 PowerShell 中实跑**。脚本旁或 `run-through.md` 记录：commit SHA、命令、实际输出摘要、退出码；有界面的步骤附截图路径。
2. **不出现 `<…>` 占位符**（PowerShell 会把 `<` 当作重定向）。路径与参数用先赋值的变量或写实际值，命令可直接复制运行。
3. **一次性数据集与独立端口**：账套放在 `erp-demo-<guid>` 临时目录（GUID 实际生成），端口取不同于 4173 及此前 Demo 的值（v0.1.0 4190、v0.2.0 4191、v0.3.0 4193、v0.4.0 4194）；不使用用户数据、真实旧账、`.bak`、用户主检出。
4. **复跑命令自带检查**（见下“启动与检查”）：启动前确认端口空闲；写入数据前确认该端口的监听进程就是本次启动的进程；收尾只停本次启动的进程。不用 `Get-Process node`、进程名或历史 PID 去停进程；历史 PID 只出现在 `run-through.md` 的执行记录里，不写进给读者复跑的命令。
5. **截图状态断言**：文件名里的语言、主题、宽度、教学开关，必须在截图前从页面读取并断言，不符就中止（见下“截图状态断言”）。故障注入会改变状态（例如让偏好读取失败，应用回退到 zh / 红 / 教学关闭），此时按**实际状态**命名，并在说明里写出是哪个故障分支，不要用循环变量命名。
6. **滚动位置**：截图前显式设定滚动位置（通常回到页首），整页截图时粘性顶栏才不会压在正文中间；怀疑遮挡是否会在正常使用中出现时，在真实视口里量输入框与顶栏的位置并记录，不在截图里掩盖。
7. 未实跑的分支（例如夹具无法覆盖的用法）写明“仅对照代码，未实跑”，不得写成已通过；预期结果与实测结果分开标注。
8. **执行记录里做过的人工检查，都要落到可复制的命令里**（例如“确认端口空闲”“确认进程归属”“确认服务就绪”）；写不成命令的检查，注明是人工目视。
9. **脚本先写好、先用替身跑通，再申请 Demo 时段**：复跑脚本（含 seed、capture、清理）在申请时段之前就写完，并用不启动浏览器的替身完整跑通成功分支和失败分支（见下“替身验证”）；真实运行使用的就是通过评审、通过替身验证的那份脚本，运行后不再为“整理成可复制”而改它。运行前核对账套就绪清单：迁移已执行，预览 / 保存所需的主数据（例如伙伴）已 seed；缺少就中止，不要带着空账套去截图。（v0.6.0 回顾行动项 1）
10. **含删除 / 复制操作的替身必须隔离 `TEMP`（`TMP`）并校验真实产物哈希**：替身把 `TEMP`、`TMP` 指向本次专用的临时目录，并在前后各记一次真实产物（账套、备份、截图等）的 SHA256，证明替身没有触及它们（见下“替身验证”）。每个场景还要断言预期结果（是否抛出、复制了几次、停了哪些 pid、有无残留），任一断言失败就以非零退出。（v0.6.0 回顾行动项 2）

11. **替身执行真实运行会调用的每一个写入脚本，并按产品规则断言请求内容**：每个 seed，以及 capture 中发出写请求的部分，都由替身 HTTP 服务（回环临时端口）接收请求；只模拟退出码不算覆盖。替身服务至少断言：商品类型与收入 / 费用科目是否匹配单据方向、必填字段、引用的主数据（伙伴、商品、税码）是否已在本轮创建；不符时返回与真实服务相同的状态码和错误码，并有一个负例（例如销售单用只有费用科目的商品）证明确实会被拒绝。每条规则在替身里注明来源（源码 `path:line` 或契约），产品规则变化时替身随之更新。（S7 回顾行动项 3）
12. **申请浏览器时段前，先对真实服务做一次无浏览器演练**：先 build 并断言 dist 严格晚于 HEAD 提交时间（见“启动与检查”），再迁移 → 启动 → 全部 seed → 就绪清单 → 清理，遵守本模板的端口、归属与清理规则；不启动 Chrome、Playwright、Vitest。演练要覆盖 capture：capture 的每一步用新的浏览器上下文隔离草稿 / 本地存储；两条验证路径，至少走一条并在记录里写明走了哪条：(a) 用替身（假页面、假服务，不启动浏览器）或协调者批准的无头方式执行 capture 的完整步骤与全部断言；(b) 以上都做不到时回退为逐条核对：capture 里**每一条**断言（文本、响应字段、状态、请求结果，不只是文本）对照组件源码和响应 schema，结果记入“断言逐条核对”栏（见“演练记录模板”）。例外（D258、D256）：刻意演示状态保留的步骤（例如未保存草稿在跳转后仍在）可以复用同一浏览器上下文，但要在记录里写明复用的原因，并验证其前后的隔离步骤不受影响。演练的命令、脚本 SHA 与输出摘要写进 `run-through.md`（原始命令没有保存的，如实注明）。演练失败就修脚本后重做，不申请时段。D487：新增或改动的 capture 脚本不能走 (b) 回退，其证据见要求 18 的“真实运行前”门槛；(b) 只适用于未改动的 capture 脚本。演练是否需要独占时段，由协调者按路线图“E2E 独占时段”决定，申请前先问。（S7 回顾行动项 4）
13. **runner 内运行的脚本不依赖 PowerShell 7 才有的模块 cmdlet**：`scripts/slot/slot-run.ps1` 在 pwsh 7 中运行，但用 `powershell.exe`（5.1）启动步骤，步骤继承的 `PSModulePath` 含 pwsh 7 的目录，D387 时段中 `Get-FileHash`（`New-Guid` 同理）在子进程里不可用。新写或改动的 Demo 脚本一律用 .NET：哈希用 `[System.Security.Cryptography.SHA256]`（范例：`docs/demo/v0.11.0/scripts/orchestration-stub.ps1` 的 `Get-Sha256`），GUID 用 `[guid]::NewGuid()`。没有被 runner 启动的脚本（如手工运行的检查）不受此限，已发布的 Demo 脚本不改。替身验证要覆盖这一点：用与 runner 相同的方式（子进程 `powershell.exe`）至少跑一次替身，不只在当前 shell 里跑。（S11 回顾行动 3，D387 / D407 / D408）
14. **断言要有对照态**：每条断言写明“到达操作之前它不成立”的证据，例如筛选前后的行集合或请求参数不同；不能区分前后状态的断言不算数（动作前后都是 100 行时，行数断言证明不了筛选生效）。断言表在“默认值 / 对照态”栏并列写出动作前的取值及其来源：同一页面的另一个入口（例如有 / 无 `invoice=` 参数）、同一控件的另一个取值（例如筛选“全部” vs“部分开票”），或在同一页面实例里动作之前读到的值；纯新增、没有对照的元素，写“无（纯新增）”，并给出该元素原本不存在的依据（源码 `file:line`）。另外，Demo 里新写的步骤块也要继承本模板的约束：块内每个 cmdlet 都带 `-ErrorAction Stop`（S10 回顾行动 2）。（S11 回顾行动 5）
15. **间距类断言按“分隔线到首行字段”量，并且只记录**：卡片头与筛选栏这类“留白”，量卡片头底边到筛选表单内第一个字段标签顶边，不量外框到外框（外框间距按设计可以是 0 px，内部留白来自表单自身的 padding）。用 `check()` 记录实测值和预期（如 ≥ 16 px），不作为失败条件；失败条件只有“截图是否拍对”（路由、语言、主题、宽度、页头标题、关键可见文字）。范例：`docs/demo/v0.13.1/scripts/capture.mjs` 的 `invoiceSpacing`。（S14，D440 / D441 / D444，设计口径见 `design/tasks/S14.md` 的 DEMO-14 验收；取代 DEMO-12 的“外框间距应约 16 px”写法）
16. **`-Stub` 只证明什么、不证明什么，脚本哈希取自 git**（S15 回顾行动 4）：`slot-run -Stub` 只证明 runner 的编排——参数、日志与清单格式、退出码和归属记录。它**不运行步骤脚本**，子进程是 `node -e` 而不是 `powershell.exe`，所以不证明 `run-main.ps1`、`capture.mjs` 在真实 PowerShell 子进程与 Chrome 下能跑通；这一点要由另做的替身或“时段前真实服务演练”（要求 12）覆盖，并在 `run-through.md` 如实写明 Stub 的这个局限。记录中的脚本哈希一律取自 `git rev-parse HEAD:<路径>`（或 `git hash-object`），不手算、不取自工作区文件的临时副本；归档的脚本副本与实际运行的脚本要哈希一致。
17. **干跑前先 build，再走标准时段流程**（S16 回顾行动，D481 / D480）：在**新建的应用 worktree** 里，任何干跑（直接运行 `run-main.ps1`、`-SkipCapture` 或 capture 干跑）之前先执行一次 `npm run build`。`run-main.ps1` 本身不构建，只有 `slot-run.ps1` 会构建；缺少 `packages\web\dist` 时服务器不会就绪，干跑以 `not ready` 失败（v0.15.0 的 DEMO-16 就是这样）。这一次 build 算流程修正，不算重试，但要在 `run-through.md` 记下失败与修正。标准时段流程：先由协调者安排安静时段（D480：所有 ai-native-erp 会话停止本地 node / vitest，回复“quiet”）；应用与 tooling 各用一个 worktree，两处的 `npm ci` 都在安静时段开始前完成（时段内不再装依赖；**D493**：DEMO-18 的两次 `npm ci` 在窗口内运行，是被接受的一次性偏差，不是常规；D489 只把第 0 步并入窗口，不包括安装；自 DEMO-19 起 `npm ci` 必须在开窗前完成并退出码 0，**申请开窗时附上**：两处（应用与 tooling）`npm ci` 的退出码、lock 文件 blob（`git rev-parse <SHA>:package-lock.json`）、两处安装之后 `git status --porcelain` 的输出（必须为空），窗口内再运行 `npm ci` 视为偏离，需要协调者的明确 Dxxx）；时段内依次做 build、capture 干跑、真实 `slot-run`（`-SkipCapture` 必须在开窗前跑完，见第 25 条），每步一次、不重试，任一步失败即停下上报。记录 `runner start head=` 与 `tooling head=`，并抄录日志里的全部 SR-X6 行：每行写明进程 PID、进程名和采样器实际输出的原因字段（`reason`：`command line unreadable, no D411 record` 或 `no repository evidence in process or N ancestor(s)`，以及 `name= pid= ppid= created= exe= cwd= cmdline=[…]`，读不到的值是 `unreadable`），原样抄录，不自行推测命令行为什么读不到；SR-X6 不计数但必须完整记录。**RUNMAIN-01（[#283](https://github.com/lingshf/ai-native-erp/pull/283)，v0.17.0 起）**：`run-main.ps1` 在迁移之前调用 `scripts/demo/assert-web-dist.ps1`，缺少 `packages\web\dist` 或 dist 不晚于 HEAD 提交时间（`stale`）时几秒内失败（`web-dist: missing` / `stale`，退出码 3 / 4，并提示 `npm run build`）；它只拦截，不构建，所以**干跑前的那一次 `npm run build` 仍然必须做**。该守卫对 `-SkipCapture` 同样生效；每当 RC 头又多一个提交（哪怕只改文档），dist 就会比 HEAD 旧，窗口内要在干跑前重新构建一次，并在 `run-through.md` 记下原因（DEMO-18 的 D491 即如此）。另外 `run-main.ps1` 的 `-Shots` 是必填参数，`-SkipCapture` 也要带（例如 `-SkipCapture -Shots $shots`），否则在参数绑定时失败、脚本主体不运行（DEMO-18 的 D490）；这样的失败照实记录，重跑需要协调者批准。
18. **新增或改动的脚本各有演练证据**（S17 回顾行动 1，D486 / D487）：(a) 新增或改动的 `run-main.ps1`：必须在时段前的无浏览器演练中实际运行（带 `-SkipCapture`）。(b) 新增或改动的 capture 脚本：无法无浏览器运行，要求 12(b) 的交叉核对回退只适用于未改动的 capture 脚本；新增或改动的必须在时段内干跑（要求 17）中于正式运行之前实际运行，其日志即证据。`-Stub`（要求 16）不算。两类演练分开记录，不互相替代。两道门槛分开：**(i) 时段批准门槛**：申请时段前须有时段前证据——无浏览器演练（含 `run-main.ps1` 的改动，带 `-SkipCapture`），以及未改动 capture 脚本的 12(a)（12(a) 不可用时为 12(b) 逐条核对）；缺则不批准时段。**(ii) 真实运行前门槛**：新增或改动的 capture 脚本须先有时段内干跑日志；缺该日志，真实运行不得开始，除非协调者以明确的 Dxxx 允许。D486 是一次性处置，不是常设豁免。
19. **体积 / 字节基线取自干净 worktree**（S17 回顾行动 3，D460 / D487）：在新建的 detached worktree 里、分别在确切的 base 与 head SHA 上构建，不用 stash 调整过的树；两侧用相同的构建命令和相同的 lock 文件，并记录实际命令输出。每一侧贴出：`git rev-parse HEAD`、`git status --porcelain`（必须为空）、`npm ci` 输出、node / npm 版本、操作系统、lock 文件 blob、产物 SHA-256。
20. **RC 数字自查、窗口产物与安装顺序**（S18 回顾行动 1–3，D492 / D493 / D495，自 DEMO-19 起）：(a) `README.md`、`run-through.md` 与 RC 正文里能由命令得出的计数、哈希与 SHA 角色，在最终 head 上实际运行并附输出；历史测量与时点（窗口内耗时、开窗与清理时间、开发 PR 的字节数）引用固定来源，只核对引用，不重跑、不重算（D495，细则见 `docs/release/README.md` 检查清单）；(b) 清理前对所有时段产物记录路径、SHA-256 与行数并保存控制台日志，入库文件的哈希按 git blob 计算（D492，见“日志入库前后的核对”）；(c) `npm ci` 在开窗前完成（D493，见第 17 条）。
21. **`slot-run.ps1` 的调用方式**（DEMO-19，D498 / D499）：必须用 `pwsh`（PowerShell 7）启动，用 `powershell.exe` 会在主体运行前以退出码 2 退出（`slot-run.ps1 needs PowerShell 7 (pwsh)`）；并且必须**在 app worktree 内**调用 tool worktree 的脚本，因为 runner 以当前目录的 `git rev-parse --show-toplevel` 为 Root：`cd <app>; pwsh -NoProfile -File <tool>\scripts\slot\slot-run.ps1 -OutDir <新的空目录> -StepsFile <app>\<步骤文件> -BaseRoot <tool> -Ports <端口>`。在 tool 里调用会让步骤文件里的相对路径找不到。摘要日志前三行应显示 runner head = app 头、tooling head 与 base head = main，开跑前核对；完整命令行写入 run-through，不能只留“按约定”。
22. **`npm ci` 的输出存成文件**（S20 回顾，D506）：应用与 tooling 两处的 `npm ci` 都用 `Tee-Object` 把完整输出写入文件，并在命令之后立即记录退出码，例如 `npm ci 2>&1 | Tee-Object -FilePath <日志路径>; $ciExit = $LASTEXITCODE`（`$LASTEXITCODE` 取自管道里的 `npm`，不是 `Tee-Object`）。日志路径放在清理前产物清单里，记录路径、SHA-256 与行数，并附进开窗申请。输出没有保存的，按 D506 / D500 的先例只能作为缺口交协调者处置。
23. **窗口门禁与窗口内快照**（S20 回顾，D507）：开窗前和窗口内**每分钟各做一次** node 进程快照，先用手动命令：`Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Select-Object ProcessId,ParentProcessId,CreationDate,CommandLine`，再沿 `ParentProcessId` 向上列出父进程链（每一级的 `ProcessId`、`Name`、`CommandLine`），并记录每个进程的 CPU 秒数（`Get-Process -Id <PID>` 的 `CPU`）。`Win32_Process` 不提供 cwd，手动命令取不到：cwd 一律如实记为“未取”，不推测、不从命令行倒推；读取 cwd 的工具化是 S22 候选。同时核对批准端口与 4173 无监听：`Get-NetTCPConnection -LocalPort <批准端口>,4173 -State Listen`；**这只是开窗前门禁的条件**（结果必须为空），不适用于窗口内每分钟一次的快照，因为窗口内这些端口本来就在使用中，窗口内只记录监听情况，不据此判失败。每次快照的时间（带时区）与完整输出**存成文件**（`logs/gate-snapshots.tsv`，一行一个进程一次快照），路径与 SHA-256 列进清单；窗口申请里写明快照计划与命令。不属于本次演示的 ERP 相关 node 进程出现时如实记录，来源无法判定的写“无法判定”（D507）。
24. **获批命令原样执行**（S20 回顾，D508）：获批的命令与批准原文逐字一致，**后面不再事后加管道**（不加 `Select-Object`、`Tee-Object`、`Out-File` 之类）：批准的是原文，加管道就是与批准原文不同的命令（D508）；需要保存输出时，用批准原文里已有的参数或重定向，或在申请阶段把带输出保存的完整命令一并批准。命令本身的退出码要单独记录，并由执行者自己写进原始日志：命令执行完后紧接着在同一份日志里追加一行 `exit=$LASTEXITCODE`（例如 `Add-Content <日志路径> "exit=$LASTEXITCODE"`，追加的是单独一条语句，不是批准命令的管道；这条 `Add-Content` 也属于获批命令的一部分：必须与 runner 在**同一个 PowerShell 进程里紧接着执行**，并**写进开窗申请的命令原文**，由协调者连同命令一起批准）；run-through 引用日志里的这一行（路径与行号），不靠手抄，也不以“runner 日志里有 done”代替。
25. **`-SkipCapture` 在开窗前对本版本实跑**（S20 回顾，D509）：**每次 Demo** 都要针对本版本（新建的应用 worktree，本 RC 头）在申请开窗前实跑一次 `run-main.ps1 -SkipCapture -Shots <目录>`，并把以下内容附进开窗申请：完整命令行、退出码 0、日志（路径与完整 SHA-256），日志须含端口释放行；**窗口内不跑**。没有跑完，或日志缺少端口释放行，就不批准窗口。

## 启动与检查

从仓库根目录执行。整段放在 `. { ... }` 里：`throw` 会中止整段，而逐行粘贴时 `throw` 不会阻止后面的行；变量仍留在当前会话，供收尾使用。（v0.17.0 起，`run-main.ps1` 自己调用 `assert-web-dist.ps1` 作缺 / 过期 dist 的守卫；下面块里的 `npm run build` 与 dist 断言仍是手动流程的一部分，不能省。）

```powershell
. {
  $server = $null; $demo = $null; $db = $null; $port = $null
  $port = 4195
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "构建失败，退出码 $LASTEXITCODE" }
  $dist = "packages/web/dist/index.html"
  $headTime = [DateTimeOffset]::Parse((git log -1 --format=%cI HEAD)).UtcDateTime
  if (-not (Test-Path $dist) -or (Get-Item $dist).LastWriteTimeUtc -le $headTime) { throw "dist 缺失，或不晚于 HEAD 提交时间（相等也算失败）：不启动浏览器，先重新构建" }
  if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
    throw "端口 $port 已被占用：换端口，或先确认占用者归属；不要停止不属于本次演示的进程"
  }
  $demo = Join-Path ([IO.Path]::GetTempPath()) ("erp-demo-" + [guid]::NewGuid())
  New-Item -ItemType Directory -Path $demo -ErrorAction Stop | Out-Null
  $db = Join-Path $demo "demo.sqlite"
  npm run storage:admin -- migrate --provider sqlite --file $db
  if ($LASTEXITCODE -ne 0) { throw "迁移失败，退出码 $LASTEXITCODE" }
  $day = Get-Date -Format yyyy-MM-dd
  node docs/demo/v0.4.0/scripts/prepare.mjs $db (Get-Date).Year   # 本版的预置脚本，换成本版实际的；服务启动前写入
  if ($LASTEXITCODE -ne 0) { throw "预置失败，退出码 $LASTEXITCODE" }
  $env:ERP_SQLITE_FILE = $db
  $env:ERP_PORT = "$port"
  $env:ERP_HOST = "127.0.0.1"
  $env:ERP_PROFILE = "local"
  $server = Start-Process node -ArgumentList "packages/infra/src/main.ts" -PassThru -WindowStyle Hidden
  $ready = $false
  1..20 | ForEach-Object {
    if (-not $ready) {
      try { $ready = (Invoke-WebRequest "http://127.0.0.1:$port/" -UseBasicParsing).StatusCode -eq 200 } catch { Start-Sleep 1 }
    }
  }
  if (-not $ready -or $server.HasExited) { throw "演示服务未就绪，不要写入数据" }
  $owner = @((Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue).OwningProcess)
  if ($owner.Count -ne 1 -or $owner[0] -ne $server.Id) {
    throw "端口 $port 的监听进程 ($($owner -join ',')) 不是本次启动的 $($server.Id)，中止，不要写入数据"
  }
  "ready: port=$port pid=$($server.Id) db=$db"
}
```

（端口 4195 仅为示例，按本版实际选用。每轮开头先清空 `$server`、`$demo`、`$db`、`$port`，同一会话复跑时，端口检查先中止也不会让收尾块碰上一轮残留的对象；本轮已创建的临时目录和已启动的 `$server` 仍按下面的收尾清理。）

**每个写入数据的脚本（seed、截图）都放进下面这种“校验 + 执行”同一个块里**，校验失败时 `throw` 会中止整块，写入不会执行；不要把校验和写入分成两次粘贴。不依赖启动块是否中止过：

```powershell
. {
  $script = "docs/demo/v0.4.0/scripts/seed-trade.mjs"   # 换成本版要运行的脚本
  if (-not $server -or -not $port -or -not $day) { throw "本轮没有已启动的 `$server，先运行启动块" }
  if ($server.HasExited) { throw "本轮服务进程已退出，中止，不要写入数据" }
  $owner = @((Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue).OwningProcess)
  if ($owner.Count -ne 1 -or $owner[0] -ne $server.Id) {
    throw "端口 $port 的监听进程 ($($owner -join ',')) 不是本轮启动的 $($server.Id)，中止，不要写入数据"
  }
  node $script "http://127.0.0.1:$port" $day   # 地址用刚校验过的 $port；本版 seed 还需要日期（yyyy-mm-dd），参数按脚本的 usage 补全
  if ($LASTEXITCODE -ne 0) { throw "$script 失败，退出码 $LASTEXITCODE" }
}
```

### 日志完整保留与失败现场（S9 回顾行动项 5）

runner 与 capture 的 stdout / stderr 先完整写入文件，再看输出；不要用 `Select-Object -Last`、`head` 之类截断，也不要只看控制台。把下面的写法套在 runner 与 capture 的命令上。日志写进仓库内 `docs/demo/vX/logs/`（`vX` 换成本次版本；不放 `$env:TEMP`，也不放 `$demo` 里），随 Demo PR 入库，任何路径下都不删（S10 回顾行动 1）：

```powershell
. {
  $logDir = "docs/demo/v0.11.0/logs"   # 换成本次版本
  New-Item -ItemType Directory -Path $logDir -Force -ErrorAction Stop | Out-Null
  $log = Join-Path $logDir ("demo-run-{0}-{1}.log" -f (Get-Date -Format yyyyMMdd-HHmmss-fff), [guid]::NewGuid().ToString("N"))
  $cmd = { node docs/demo/v0.4.0/scripts/capture.mjs }   # 换成 runner / capture 的实际命令
  $global:LASTEXITCODE = 0
  $code = 0
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"   # Stop 下 5.1 会在第一行 stderr 处终止管道，丢后续 stdout，并把实际退出码记成 1
  try {
    & $cmd *>&1 | Tee-Object -FilePath $log -Append -ErrorAction Stop
    $code = $LASTEXITCODE
  } catch {
    $code = 1   # runner 自己 throw（例如监听归属检查失败）：没有原生命令退出码，记为 1
    "EXCEPTION: $($_ | Out-String)" | Tee-Object -FilePath $log -Append -ErrorAction Stop
  } finally {
    $ErrorActionPreference = $prevEap
  }
  "exit=$code log=$log" | Tee-Object -FilePath $log -Append -ErrorAction Stop
  if ($code -ne 0) { throw "失败，退出码 $code；截图目录与日志保留，不清理：$log" }
}
```

- **块内的 cmdlet 一律显式 `-ErrorAction Stop`**（`Copy-Item`、`Remove-Item`、`Move-Item`、`New-Item`、`Out-File`、`Set-Content`、`Tee-Object` 等；本模板的其他可执行块同样）。`$ErrorActionPreference = "Continue"` 只为原生命令的 stderr 服务，不能让 cmdlet 的非终止错误被吞掉：缺了 `-ErrorAction Stop`，复制失败也会继续往下执行、把 `ok` 设成真并删掉源截图（v0.10.0 #192 的 `Copy-Item` 事故，S10 回顾行动 2）。
- 块内把 `$ErrorActionPreference` 设为 `Continue`，结束时恢复原值：原生命令的 stderr 与实际退出码都会落盘（Windows PowerShell 5.1 在 `Stop` 下会因第一条 stderr 提前终止管道，丢掉后续 stdout，并把退出码记成 1）。
- 日志名含毫秒和 GUID，同一秒内先后运行 runner 与 capture 也不会互相覆盖；`-Append` 只在同一次运行内追加。runner 抛错与原生命令非 0 退出都会落盘：前者写 `EXCEPTION:` 加原始错误，两者都写 `exit=` 与日志路径。
- 失败时**先保存现场再做别的**：截图目录（capture 已写出的图）和日志文件原样保留，不跑收尾里的清理，不重试；停服务与释放端口除外（只停本轮的 `$server`）。
- PR 正文 / 回报写完整错误与退出码、日志路径；断言类中止另写**失败断言的原文**。原文丢失就写“原断言已丢失，根因未知”，不要推测成脚本问题。

### 日志入库前后的核对（S10 回顾行动 1，D339）

**清理前对所有时段产物记录哈希并保留控制台日志（D492，自 DEMO-19 起）**：DEMO-18 因没有记录而留下已知缺口（D492 一次性接受，不是常规）。临时目录删除之前，对**每一个**窗口内产物（日志、JSON、TSV、截图，以及 `npm ci`、`npm run build`、各步骤的控制台输出）记录原路径、SHA-256 与字节数（文本产物另记行数；二进制文件只记 SHA-256 与字节数），并把控制台输出存成文件；同时列出本次用到的**临时账套路径清单**（每个 `erp-demo-<guid>` 账套目录与其数据库文件，含 `-wal` / `-shm`），**先把这份清单与上面的记录保存到窗口目录之外（例如 `run-through.md` 草稿），再开始清理**，清理只删清单里列出的路径；需要入库的复制进 `logs/`，不入库的也要在 `run-through.md` 的清单里列出路径、哈希与不入库的原因。入库后，凡要写进文档的哈希一律按 git blob 的原始字节计算（`git cat-file blob <oid>`，见下面的命令），不要用工作区检出文件的哈希：检出可能经过换行转换（例如 TSV 为 CRLF），与 blob 不同；并与清理前记录的值对照，不一致要说明。缺少清理前记录的产物逐项标“not retained”并写明原因，由协调者给出处置，不得默认通过。

日志含 CRLF 等原始字节，必须原样入库。仓库规则：`.gitignore` 里 `!docs/demo/*/logs/*.log` 反忽略；根 `.gitattributes` 里 `docs/demo/*/logs/*.log -text` 关闭换行转换。**写完日志后、清理临时截图目录之前**，先记录日志路径、SHA-256 与行数，再做入库前核对（`$log` 为上面的日志路径）：

```powershell
. {
  $h = (Get-FileHash -LiteralPath $log -Algorithm SHA256 -ErrorAction Stop).Hash
  $n = @(Get-Content -LiteralPath $log -ErrorAction Stop).Count
  "log=$log sha256=$h lines=$n"
  git check-ignore -v -- $log          # 输出必须命中 .gitignore:<行>:!docs/demo/*/logs/*.log
  git check-ignore -q -- $log
  if ($LASTEXITCODE -ne 1) { throw "check-ignore -q 退出码 $LASTEXITCODE：0 表示日志仍被忽略，其他值是命令错误；只有 1 通过" }
  $attr = git check-attr text -- $log
  if ($attr -notmatch ": text: unset$") { throw "text 属性不是 unset：$attr" }
}
```

日志在任何路径下都不删（成功、失败、中止均保留）。合并后核对 Git blob 的原始字节，不经 PowerShell 管道（管道会改写字节，D334）：

```powershell
. {
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ("blob-" + [guid]::NewGuid().ToString("N"))
  cmd /c "git cat-file blob <提交>:<路径> > $tmp"
  if ($LASTEXITCODE -ne 0) { throw "git cat-file 失败，退出码 $LASTEXITCODE" }
  $h = (Get-FileHash -LiteralPath $tmp -Algorithm SHA256 -ErrorAction Stop).Hash
  Remove-Item -LiteralPath $tmp -ErrorAction Stop
  "blob sha256=$h"   # 必须与写日志时记录的 SHA-256 一致
}
```

`<提交>:<路径>` 换成合并提交与日志路径。

## 收尾

只停本轮启动的进程（`$server`），只删本轮生成的目录。变量为空（本轮没有创建）就什么都不做，处理完立刻清空，避免下一轮误用：

```powershell
. {
  if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -ErrorAction Stop }
  if ($demo -and (Split-Path $demo -Leaf) -like "erp-demo-*") { Remove-Item -Recurse -Force $demo -ErrorAction Stop }
  if ($port) {
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { "端口 $port 仍有监听（可能不属于本轮，先确认归属，不要强停）" } else { "端口 $port 已释放" }
  } else { "本轮没有创建任何对象，无需收尾" }
  $server = $null; $demo = $null; $db = $null; $port = $null
}
```

## 替身验证（先于申请时段）

替身不启动 Chrome、Playwright 或 Vitest，用假进程和假脚本代替。含删除 / 复制操作的替身，整段放在下面的块里：先记真实产物哈希，再把 `TEMP`、`TMP` 指向专用临时目录，在 `# 替身` 处放本版脚本的替身调用，结束时（无论替身成功还是抛错）恢复环境、只删专用目录，并**在 `finally` 里重新计算哈希**，最后统一判定。以下任一情况都 `throw`（命令行运行时退出码为 1）：替身抛错、哈希前后不一致、任何文件（含隐藏文件）无法读取。后置快照为空（文件被删光、只剩空目录）按“缺失”照常比较，与“快照失败”分开报告。隐藏文件计入；读不了的文件不会被静默跳过。从仓库根目录执行：

```powershell
. {
  $real = "docs/demo/v0.6.0/screenshots"   # 换成本版真实产物目录（截图、账套、备份等）
  $oldTemp = $env:TEMP; $oldTmp = $env:TMP; $iso = $null; $before = $null; $after = $null; $problems = @()
  $snap = { param($dir) @(Get-ChildItem -LiteralPath $dir -Recurse -File -Force -ErrorAction Stop | Sort-Object FullName | ForEach-Object { (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256 -ErrorAction Stop).Hash + "  " + $_.FullName }) }
  try {
    if (-not (Test-Path -LiteralPath $real)) { throw "真实产物目录不存在：$real" }
    $before = @(& $snap $real)
    if ($before.Count -eq 0) { throw "真实产物目录为空，无法证明替身没有触及它：$real" }
    $iso = Join-Path ([IO.Path]::GetTempPath()) ("erp-stub-" + [guid]::NewGuid())
    New-Item -ItemType Directory -Path $iso -ErrorAction Stop | Out-Null
    $env:TEMP = $iso; $env:TMP = $iso
    # 替身：在这里调用本版脚本的替身，成功分支和失败分支各一次，并逐个场景断言结果
  } catch {
    $problems += "替身或前置检查失败：" + $_.Exception.Message
  } finally {
    $env:TEMP = $oldTemp; $env:TMP = $oldTmp
    if ($iso -and (Split-Path $iso -Leaf) -like "erp-stub-*") {
      try { Remove-Item -Recurse -Force $iso -ErrorAction Stop } catch { $problems += "清理专用目录失败（保留 $iso，手工处理）：" + $_.Exception.Message }
    }
    if ($null -ne $before) {
      try { $after = @(& $snap $real) } catch { $problems += "后置哈希失败（有文件读不了或目录消失）：" + $_.Exception.Message }
    }
  }
  # 快照为空（@()）与快照失败（$null）要区分：空快照照常比较，删光文件会报为缺失
  if ($null -ne $before -and $null -ne $after -and (($before -join "`n") -ne ($after -join "`n"))) {
    $missing = @($before | Where-Object { $after -notcontains $_ }).Count
    $problems += "真实产物哈希在替身运行前后不一致（缺失或改动 $missing 个文件，运行前 $($before.Count) 个，运行后 $($after.Count) 个）：$real"
  }
  if ($problems.Count -gt 0) { throw ($problems -join "；") }
  "真实产物未变：$($before.Count) 个文件（含隐藏文件）"
}
```

替身验证的输出（场景、断言、退出码、哈希结论）写进 `run-through.md` 和 PR 正文，成功分支和失败分支都要有。（v0.6.0 回顾行动项 1、2）

替身的失败场景至少覆盖发布流程清单里的“固定负例组”七项（空目录、隐藏文件、不可读文件、中途抛错、归属变化、从渲染文档复制、非终止错误），全文见 `docs/release/README.md`，这里不重复；不适用的项写“不适用”及理由。（S7 回顾行动项 5）

### 写入脚本的替身（要求 11）

- 替身以**脚本路径为参数**，对被测版本的原样文件运行（现行版或从旧提交取出的旧版），不改脚本、不用桩函数替换 `fetch`；脚本输出、退出码和替身的请求日志都要记录。
- 验收写**精确**结果，不能只判“非零退出”：每个请求的状态码与错误码、脚本在哪一步退出、哪些请求没有发出、请求日志恰好有哪些条目。缺参数、替身未就绪、连接失败、错误码不是预期值而导致的非零退出，一律不算通过。
- 先确认替身已就绪（就绪探测成功）且参数齐全，再运行脚本；探测结果写进记录。
- 失败分支用历史上真实出过问题的旧脚本回放（取旧提交的脚本文件），确认替身能复现当时的拒绝；修复版在同一替身、同一规则下全部通过。
- 范例与局限：`docs/demo/v0.7.0/scripts/seed-orders-stub.mjs` 的规则来源是 `packages/core/src/application/trade-documents.ts:638-641`，但它固定运行同目录下的 `seed-orders.mjs`，只能验证现行版；要回放旧版，只能先把旧文件换进该目录，**它不满足“路径参数”和旧版回放的要求**，新替身应按上面写成接受脚本路径参数。PROC-04 验收用的参数化替身全文在 PR #169 正文里。

可勾选核对（每个写入脚本逐项）：

- [ ] 替身接收该脚本的真实请求（非桩函数），请求日志已记录。
- [ ] 替身按产品规则断言请求内容，规则来源已注明 `path:line` 或契约。
- [ ] 有一个负例：违反规则的请求被拒绝，状态码与错误码与真实服务一致。
- [ ] 旧版回放：对历史出过问题的旧脚本，精确复现当时的状态码、错误码、退出码，后续请求未发出。
- [ ] 现行版在同一替身下全部成功，退出 0。
- [ ] 就绪探测与参数齐全已先确认；其余原因的非零退出一律不算通过。
- [ ] 输出、退出码、请求日志写进 `run-through.md` 和 PR 正文。

### 时段前真实服务演练（要求 12）

- [ ] 临时账套（`erp-demo-` 加 GUID）、不同于 4173 及此前 Demo 的端口。
- [ ] 按“启动与检查”：迁移、预置、启动，确认端口空闲和监听归属。
- [ ] 每个 seed 前各做一次归属检查（放在“校验 + 执行”同一块里），全部 seed 退出码为 0。
- [ ] 先 build，并断言 `packages/web/dist/index.html` 严格晚于 HEAD 提交时间（相等也失败）（“启动与检查”），失败即中止。
- [ ] 账套就绪清单：伙伴、商品、订单等 capture 需要的主数据都在，缺少就中止。
- [ ] capture 的每一步用新的浏览器上下文（刻意演示状态保留的步骤除外，写明原因）；写明走了替身 / 无头路径还是回退为逐条核对；回退时每条断言（含响应字段、状态、请求结果）都核对并填“断言逐条核对”栏。
- [ ] 按“收尾”清理，并确认端口已释放、无 `erp-demo-*` 残留。
- [ ] 命令、脚本 SHA、输出摘要和退出码写进 `run-through.md`。（S7 回顾行动项 3、4）
## 截图状态断言

用 Playwright（系统 Chrome）时，每张截图前先回到页首并断言状态，文件名里写什么，就断言什么：

```javascript
async function assertState(page, want) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const got = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    theme: document.querySelector(".workspace")?.dataset.theme,
    width: window.innerWidth,
    teaching: document.querySelector("#workspace-teaching")?.checked,
    scrollY: window.scrollY,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  const { scrollWidth, ...state } = got;
  const wanted = { scrollY: 0, ...want };
  const bad = Object.entries(wanted).filter(([key, value]) => state[key] !== value);
  if (bad.length > 0) throw new Error("截图状态与文件名不符：" + JSON.stringify({ wanted, got: state }));
  if (state.width === 390 && scrollWidth > state.width) {
    throw new Error(`390 px 页面横向溢出：scrollWidth=${scrollWidth} > innerWidth=${state.width}`);
  }
}
// 用法：await assertState(page, { lang: "en", theme: "green", width: 390, teaching: true });
```

宽度为 390 时多一条页面宽度断言：`document.documentElement.scrollWidth <= window.innerWidth`，不满足就抛错，错误信息含实测 `scrollWidth` 与 `innerWidth`（宽表只能在表内滚动，页面不横向滚动）。（S9 回顾行动项 3、D290）

**截断类判定按实测行距与字形盒设容差**：不用 `scrollHeight > clientHeight`（被行数截断的文字仍参与布局，该判定会误报或漏报）。按已布局文字的行数、末字符字形盒底边相对可见框底边的超出量判定，容差为 `max(0, (字形盒高 − 行高) / 2) + 1 px`：半行距取实测值，下限为 0（字形盒小于行高时不能变成负数，否则正常文本会被误报），再加 1 px 余量。示例：`packages/infra/test/support/trade-gui-scenario.ts:1361–1393`。

### 到达路径（S10 回顾行动 4）

每类截图在 `run-through.md` 写明**入口与到达操作**：只有入口页可以 `page.goto`；目标状态必须由点击 / 键盘操作产生，截图与断言来自同一个页面实例（不得为取图另开页面或直接 `goto` 目标 URL）。capture 日志（如 `capture-log-main.json`）里每张目标截图记录“到达操作”和到达后实际读取的 `location.hash`，并断言与预期一致。直接打开 URL 的图只能标注为“深链接”，不能当作用户操作路径的证据。

### 断言逐条核对表

每条文本 / 状态断言先对照组件的实际渲染，再写进脚本。写成表，放进 `run-through.md`：

| 断言文本 / 状态 | 组件 `file:line` | 装饰符与 `aria-hidden` 内容 | 默认值 | 翻译键（zh / en） | 响应 schema 字段位置 | seed 来源 | 工具判定复核 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 例：徽章“已开完” | `packages/web/src/...tsx:行号` | 例：前缀符号在 `aria-hidden` 的 `span` 内，`textContent` 要不要含符号 | 例：读取中显示“…” | 例：键名与两种语言的文案 | 例：`openapi` 或类型定义的 `path:line` | 例：“发票列表 2 行”对照 `seed-trade.mjs:行号` 产生的发票（含 seed 自带的、无来源订单的行） | 例：中止后改过产品代码，引用该行为的取证判定（截图 / 日志 / 断言）逐条复核：仍成立 / 已作废 |

没有对应项的格子写“无”，不留空。装饰符与 `aria-hidden` 的内容必须对照源码确认，不凭记忆写断言。（S8 回顾行动项 1）

- **seed 来源**：数量 / 行数类断言（“N 行”“只有 1 条”“无来源订单”）对照**产生这些数据的 seed 语句** `file:line`，把其他 seed 脚本自带的数据一并算入；不对照 seed 的数量断言不写。
- **工具判定复核**：一次中止之后产品代码又改过的，列出所有引用该行为的取证判定（此前的截图、日志、断言结论），逐条复核后再写“仍成立”或“已作废”；没有改过产品代码写“无”。（S9 回顾行动项 4）

选择器取自 `packages/web/src/App.tsx`（`document.documentElement.lang`、`.workspace[data-theme]`、`#workspace-teaching`）；若界面结构改了，先更新这里的选择器再用。

## 演练记录模板（`run-through.md`）

| 项 | 内容 |
| --- | --- |
| 对象 | tag / commit SHA |
| 环境 | 临时账套、端口、浏览器 |
| 命令 | 实际执行的命令（可复制） |
| 输出摘要 | 退出码与关键输出 |
| 断言逐条核对 | 断言（文本、字段、状态、请求结果）→ 来源 `file:line` → 结果；并写明走的是替身 / 无头路径还是回退核对，以及状态保留的例外（表见“断言逐条核对表”，含 seed 来源与工具判定复核两栏；演练覆盖不了 capture 时必填） |
| 截图 | 路径 |
| 未实跑 | 列出并说明原因 |
| 已知控制台错误 | 逐条归因（请求路径、状态、日志类型），预期与非预期分开 |
