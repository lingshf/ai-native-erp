# v0.11.0 Demo（DEMO-11）

产品基线 `68620fd`（`f5defcc` 之后只有文档提交）。演示账套是本轮新建的临时库（`erp-demo-<guid>`，端口 4201，结束即删），不连 4173，不碰真实旧账、.bak 与本地主检出。

## 1. 截图（32 张，另有开发提交的 TINV-06 `tinv06-*`，不属本 Demo）

每种 × {zh-red, en-green} × {1440, 390}，文件名 `<名称>-<语言>-<主题>-<宽度>.png`，全部在 `screenshots/`；逐步记录在 `screenshots/capture-log-main.json`（含入口 hash、操作路径、最终 hash）。

| 名称 | 到达方式（同一页面实例内的用户操作） | 断言 |
|---|---|---|
| invoice-detail-ap | 发票列表 → 筛选 PARTY2 + AP → 鼠标点击 AP-D1-1 | 合计 100.00/13.00/113.00、来源订单 PO-D1、未结 113.00、无核销；地址栏 hash 不变；恰好一次详情请求；无离开确认框 |
| invoice-detail-ar | 筛选 AR → 焦点放在“应用”，Tab 到 AR-I1-1，Enter | 合计 120.00/15.60/135.60、核销 50.00、未结余额 85.60；hash 不变 |
| invoice-filter-date | 填起止都为当月 1 日 → 应用 | 只剩 AP-EARLY-1..3；请求带 from/to |
| invoice-filter-error-party | 伙伴填 `bad party` → 应用 | 显示错误、`aria-invalid`、0 个列表请求、行数不变 |
| invoice-filter-error-range | 起日期晚于止日期 → 应用 | 显示固定提示、0 个列表请求、行数不变 |
| invoice-filter-loadmore | 伙伴 PARTY → 应用 → 加载更多 | 第一页 100 行，加载更多请求带 `party=PARTY` 且返回 5 行全为 PARTY，筛选条不变 |
| invoice-filter-reset | 应用 AR → 刷新；应用 PARTY+AP → 切到 DEMO2 → 切回 DEFAULT | 每次筛选条为空，回到未筛选第一页 |
| sidebar-groups | 首页（入口页，无操作） | 1440：分组标题可见；390：标题隐藏；链接顺序同 `App.tsx:199–236`；无横向溢出 |

数据来源见 `scripts/seed-detail.mjs`：伙伴 PARTY2 的 AP-D1-1（订单 PO-D1）、AP-EARLY-1..3（当月 1 日）、BULK-001..102（伙伴 PARTY，凑够 >100 行）；AR-I1-1 核销 50.00。DEFAULT 共 112 张，PARTY 105 张。

**与任务书的差异**：任务书写“三个新分组”。页面实际是三个新分组（凭证与业务事件 / 贸易往来 / 总账与结账，由 UI-14 #197 拆出），加上原有的基础配置、只读报表，共五个带标题的分组，另有一个无标题的首组（运行状态、迁移核对）。以代码为准。
链接顺序（16 个）与 [#197](https://github.com/lingshf/ai-native-erp/pull/197)（base `506201e`、head `5f67f2e`）核验过的顺序相同：#197 正文记录 slot-2 的 base/head 取图比对 16 对、`failures=[]`，`App.test.tsx` 的 “UI-14 sidebar navigation groups” 断言同一 16 链接序列。本 Demo 的 `capture.mjs` 的 `navOrder` 与之一致，只断言“与 #197 核验的 base 顺序相同”，没有自己重做 base/head 比对。

## 2. 槽位与运行记录

槽位：D308（当前无开发在岗，协调者已确认可直接使用）。预检：Chrome 进程 6 次采样（间隔 2 s）均为 0（比 R1 的 10 s 间隔短，未使用 `scripts/slot/` 采样器）。
先 `-SkipCapture` 真服务预演一次（退出码 0），再整体运行一次，通道 `ERP_E2E_BROWSER_CHANNEL=chrome`，端口 4201：

- 运行 21:13:04–21:15:03，退出码 0，输出 `shots 32`，结束后端口释放。
- 完整日志：`logs/demo-capture-main.log`（33 行），SHA-256 `32B2869BD5CC8800701A2C48144B285F0ABE7C3961562BD2BB0CDF1ECAB62E52`。
- 命令：`$env:ERP_E2E_BROWSER_CHANNEL='chrome'; ./docs/demo/v0.11.0/scripts/run-main.ps1 -Shots docs/demo/v0.11.0/screenshots`（需先 `npm run build`）。

**例外记录（D373，不作先例）**

- ①：21:13–21:15 取图时，槽位是协调者明确批准直接使用的（“可以直接用，按 D308 执行”）。当时两名开发刚建、处于 plan 模式，没有浏览器进程。本轮接受只用 Chrome 做 2 秒预检，作为例外（D373），以后不作先例。
- ⑤：端口 4201 作为例外接受。端口已释放，没有冲突证据（D373）。

**重取记录（D376、D380）**：#204 评审后 `capture.mjs` 增加了断言（伙伴错误文案、筛选/未筛选按请求区分、截图前 hash），所以 21:13 的 32 张图早于最终脚本，不能作为最终证据。按 R1（`scripts/slot/slot-run.ps1`）重取：

- 第 1 次尝试（21:23–21:38）：预检期间开发在别的工作树跑 vitest，预检 15 分钟超时，exit 3，没有运行任何步骤。目录 `C:\Users\shaoling\slot-s11-demo-recapture-attempt1-precheck-timeout`（本机，未入库）。
- 第 2 次（21:38:43–21:41:21）：预检 6 次均为 0，唯一一次取图在第 7 步“重置”失败（slot-run exit 1，按 D308 不重跑）。原文：`CAPTURE FAILED: page.waitForResponse: Timeout 30000ms exceeded while waiting for event "response"`。已写出 6 张，端口 4201 已释放，无残留进程。目录 `C:\Users\shaoling\slot-s11-demo-recapture`（本机，未入库）。
- 原因（读 `TradeInvoices.tsx:1091–1112` 与 `App.tsx:67–70`）：QueryClient 的 `staleTime` 是 `Infinity`，切回 DEFAULT 时未筛选的第一页取自缓存，不发请求，我新增的 `waitForResponse` 因此等不到。`capture.mjs` 已改为：切回 DEFAULT 时不要求有请求，只断言期间发出的任何列表请求都不带筛选参数，再断言筛选条为空、101 行。
- 第 3 次（D382，最终取图，本机 21:50:29–21:53:31，UTC 05:50:32–05:53:31）：HEAD `0b956d62f7c7e8f1016947f7973650b6790ea2a2`，工作区干净；runner 先 build、做 dist 新鲜度门禁，预检 6 次均为 0，只跑一次；`demo-capture` 退出码 0（UTC 05:51:40–05:53:30），runner exit 0，运行后计数为 0，输出 `shots 32`，端口 4201 已释放。目录 `C:\Users\shaoling\slot-s11-demo-recapture-3`（本机，未入库）；入库的原始输出：`logs/recapture-d382-demo-capture.out.log`（33 行，SHA-256 `0E32C5B5D74BE599F7A47FB4F6054BF7F9C90FCEEDF18ABD92DF99BF52A4DC3E`）、`logs/recapture-d382-build.log`（56 行，`CC214E77EEA889E3CDD347870A564B3632B4A17DB2D6404CCB0FDAA5B9A4D9EA`）。32 张图与 `capture-log-main.json` 已替换 `screenshots/` 中首次取图的版本；核对结果见 `run-through.md` §2b。

## 3. 限制

- 390 宽的详情对话框是 fixed 定位，整页截图里显示在页面顶部，属 TINV-06 已有行为，不是本 Demo 引入。
- 本 PR 只加 Demo 材料；CHANGELOG 日期和 tag 目标留给日期 PR。

## 4. 复跑（从仓库根目录）

无浏览器替身检查（不启动 Chrome / Playwright / Vitest）。`seed-detail` 替身（`seed-detail-stub.mjs`）校验 222 个请求的成功路径，以及缺 AR、超额核销、日期格式错误、缺参数的负例：

```powershell
powershell -NoProfile -File docs\demo\v0.11.0\scripts\stub-check.ps1
```

PROC-05 固定负例（空目录、隐藏文件、读不了的文件、中途抛错、所有权变化、同文件 `Copy-Item` 非终止错误对照；第 6 项“从渲染文档取块”由下面的编排替身覆盖）：

```powershell
powershell -NoProfile -File docs\demo\v0.11.0\scripts\proc05-negatives.ps1
```

编排级替身（无浏览器、无真实服务；端口 4201 须空闲）：在沙箱里原样运行真实 `run-main.ps1`，在 seed-trade、seed-invoicing、seed-sales 之后分别构造“进程 A 存活但监听归进程 B”（各带去掉 PID 比较的对照），并把 GitHub 渲染后的 README 里的真实服务演练块和取图块实际执行，含 dist 缺界面标记、dist 时间等于 HEAD 两个负例与 B7 日志完整性路径：

```powershell
powershell -NoProfile -File docs\demo\v0.11.0\scripts\orchestration-stub.ps1
```

**统一步骤块（预演与取图共用，唯一的真实服务入口）**。第一行 `$capture` 决定模式：`$false` 是预演（build → 新鲜度门禁 → 真实服务 → seed → readiness，无浏览器，到 `-SkipCapture` 为止）；`$true` 是取图，只能放在 `slot-run.ps1` 的步骤里运行（见下节）。块先 build，断言 `index.html` 严格晚于 HEAD 提交时间，再断言 dist 里有本版界面文案（“Invoice details”“No invoices match the filters”），任何一步失败就中止。

日志规则：每次写日志都带 `-ErrorAction Stop`（`Out-File`、`Get-ChildItem`、`Get-Content`、`Copy-Item`、`Remove-Item` 全部如此）；写日志失败也进入 `catch`，不会被当成成功；日志落盘并复核（路径、SHA-256、行数）是清理的前置条件，复核没过就不删 `$shots` 里的原图。日志开头记录 HEAD 与工作区状态。

```powershell
$capture = $false   # $false = 预演；$true = 取图（仅限 slot-run 的步骤内）
. {
  $shots = Join-Path $env:TEMP ("demo-s11-shots-" + [guid]::NewGuid())
  $log = "$shots.run.log"   # 完整输出写入文件；失败时保留 $shots 与日志，不清理
  $W = @{ FilePath = $log; Append = $true; Encoding = "utf8"; Width = 4096; ErrorAction = "Stop" }
  $runArgs = if ($capture) { @{} } else { @{ SkipCapture = $true } }
  $ok = $false
  $code = 0
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"   # Stop 下 PowerShell 5.1 会在第一行原生 stderr 处终止管道，丢后续输出并改写退出码；各 cmdlet 自带 -ErrorAction Stop
  try {
    $global:LASTEXITCODE = 0
    "mode=$(if ($capture) { 'capture' } else { 'rehearsal' }) head=$(git rev-parse HEAD) status=[$((git status --short) -join ';')]" | Out-File @W
    npm run build *>&1 | Out-File @W
    if ($LASTEXITCODE -ne 0) { throw "构建失败，退出码 $LASTEXITCODE" }
    $headTime = [DateTimeOffset]::Parse((git log -1 --format=%cI HEAD)).UtcDateTime
    $index = "packages\web\dist\index.html"
    if (-not (Test-Path $index) -or (Get-Item $index -ErrorAction Stop).LastWriteTimeUtc -le $headTime) { throw "dist 缺失，或不晚于 HEAD 提交时间（相等也算失败），中止" }
    $dist = Get-ChildItem packages\web\dist\assets -Filter *.js -ErrorAction Stop | Get-Content -Raw -ErrorAction Stop
    if (-not ($dist -match "Invoice details" -and $dist -match "No invoices match the filters")) { throw "dist 里没有 Invoice details 或 No invoices match the filters，旧界面，中止" }
    "gate ok: dist newer than HEAD, UI markers present" | Out-File @W
    $global:LASTEXITCODE = 0
    & .\docs\demo\v0.11.0\scripts\run-main.ps1 -Shots $shots @runArgs *>&1 | Out-File @W
    if ($LASTEXITCODE -ne 0) { throw "run-main 退出码 $LASTEXITCODE" }
    if ($capture) {
      $n = @(Get-ChildItem $shots -Filter *.png -ErrorAction Stop).Count
      if ($n -ne 32) { throw "截图数 $n，不是 32，不复制" }
      Copy-Item "$shots\*" docs\demo\v0.11.0\screenshots\ -ErrorAction Stop   # 复制失败进 catch：不设 ok、不删 $shots 里的原图
    }
    $before = @(Get-Content -Encoding UTF8 -LiteralPath $log -ErrorAction Stop).Count   # 先证明此前的日志确实落盘
    if ($before -lt 1) { throw "日志为空，不能清理原图" }
    "exit=0 ok=True log=$log" | Out-File @W
    $sha = (Get-FileHash -Algorithm SHA256 -LiteralPath $log -ErrorAction Stop).Hash
    $lines = @(Get-Content -Encoding UTF8 -LiteralPath $log -ErrorAction Stop).Count
    Write-Host "日志已落盘并复核：log=$log sha256=$sha lines=$lines"   # 删原图之前先留下路径、SHA-256、行数
    $ok = $true
  } catch {
    $code = if ($LASTEXITCODE) { $LASTEXITCODE } else { 1 }
    $msg = "EXCEPTION: $($_ | Out-String)`nexit=$code ok=False log=$log"
    try { $msg | Out-File @W } catch { Write-Host "日志写入失败：$($_.Exception.Message)" }
    Write-Host $msg
  } finally {
    $ErrorActionPreference = $prevEap
    if ($ok -and $capture -and (Split-Path $shots -Leaf) -like "demo-s11-shots-*" -and (Test-Path $shots)) {
      try { Remove-Item -Recurse -Force -LiteralPath $shots -ErrorAction Stop } catch { $ok = $false; $code = 1; Write-Host "清理 $shots 失败：$($_.Exception.Message)"; try { "cleanup-failed exit=1 ok=False" | Out-File @W } catch { Write-Host "日志写入失败：$($_.Exception.Message)" } }
    }
  }
  if (Test-Path -LiteralPath $log -PathType Leaf) { Get-Content -Encoding UTF8 -LiteralPath $log }
  if (-not $ok) { throw "失败，退出码 $code；已保留 $shots 和 $log，不清理，不重试" }
}
```

真实服务预演（无浏览器）：把上面块的第一行保持为 `$capture = $false`，在仓库根目录用 `powershell -NoProfile` 运行；与取图同一份 build 与门禁，不另有分支。

**取图的唯一正式入口**是 `scripts\slot\slot-run.ps1`（R1）。它自己做 build 与 dist 新鲜度门禁、6 次预检（间隔 10 秒）、运行中每 10 秒采样，预检不为 0 不开始，有外部进程就中止。仓库里的步骤文件是 [steps-demo11.ps1](scripts/steps-demo11.ps1)（只有一个 `demo-capture` 步骤，调用 `run-main.ps1`，走 Chrome 通道）。输出目录必须在仓库外且是新目录，不要覆盖旧时段：

```powershell
pwsh -NoProfile -File scripts\slot\slot-run.ps1 -OutDir C:\Users\<user>\slot-s11-demo-<n> -StepsFile docs\demo\v0.11.0\scripts\steps-demo11.ps1
```

上面的统一步骤块在取图模式（`$capture = $true`）下**只作为槽位内步骤或编排替身的入口**，不要在槽位之外手工运行它；不提供手工预检块，也不要绕过 `slot-run.ps1` 直接调用 `run-main.ps1` 取图。D373 ① 只豁免首次取图，D382 的重取是通过 `slot-run.ps1` 跑的。

`run-main.ps1` 启动前检查端口 4201 空闲（D373 例外）；每个 seed 与 capture 之前都校验监听进程就是本轮服务；`finally` 只停本轮服务、只删本轮 `erp-demo-*` 目录。`screenshots/.gitkeep` 是替身检查的哨兵文件，别删。取图期间不使用 `tinv06-*`（开发提交的文件，不要覆盖）。

脚本入口：[run-main.ps1](scripts/run-main.ps1)、[capture.mjs](scripts/capture.mjs)、[seed-detail.mjs](scripts/seed-detail.mjs)、[seed-detail-stub.mjs](scripts/seed-detail-stub.mjs)、[stub-check.ps1](scripts/stub-check.ps1)、[proc05-negatives.ps1](scripts/proc05-negatives.ps1)、[orchestration-stub.ps1](scripts/orchestration-stub.ps1)；账套准备与主数据复用 v0.4.0 的 `prepare.mjs`、`seed-trade.mjs`，开票与销售复用 v0.10.0 的 `seed-invoicing.mjs`、`seed-sales.mjs`。证据与逐条断言出处见 [run-through.md](run-through.md)。
