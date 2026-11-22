# v0.10.0 Demo

状态：24 张截图：D330 时段（2026-11-22 01:33:50–01:35:58，-08:00）首次采集；D332 时段（01:43:47–01:45:33）用点击路径重取，全部 24 张入库于 `screenshots/`，同目录有 `capture-log-main.json`。基线 main `c0189c7`（`packages/` 与 TINV-05 合并点 `108684d` 相同，其后只有文档提交）。演示账套是临时目录里的虚构账套，端口 4201；不连接 4173，不碰真实旧账或 `.bak`。

## 1. S10 用户可见变化与演示点

| 变化 | PR | 演示 | 截图 |
|---|---|---|---|
| 销售（AR）方向：订单列表里销售单也显示“开票状态”（部分开票 / 已开完） | #179（S9 已有，本版补销售方向） | 打开“采购 / 销售订单”，看 SO-I1、SO-I2 两行与采购单并列 | `orders-list-sales-*` |
| 销售单详情（从发票列表的来源订单链接点进，地址 `#/trade-orders?company=DEFAULT&order=SO-I1`）：只读详情，L1 已开 4 剩余 6，L2 剩余 4 | #179、#181 | 在发票页点 SO-I1 链接 | `order-from-invoice-ar-*`（真实点击后的截图；脚本断言点击后的实际 hash 与订单行） |
| 发票列表：销售发票 AR-I1-1、AR-I2-1 的“来源订单”是 SO-I1、SO-I2 链接，点开进入销售单深链接 | #181 | 打开“发票”页看全部 6 张发票 → 点 SO-I1 | `invoice-list-ar-source-*` |
| 发票列表筛选条（新；请求新增可选参数，迁移 018 只加一条索引）：按伙伴、按方向、记账日期起止；应用 / 清除；无结果有专门提示 | #189 | 伙伴填 `PARTY2` → 应用（3 行，混合方向）；清除；方向选“销售 AR” → 应用（2 行）；再填伙伴 `PARTY` → 应用（无结果） | `invoice-filter-party-*`、`invoice-filter-side-ar-*`、`invoice-filter-empty-*` |
| GATE-01、PROC-07（门禁与流程） | #188、#187 | 无界面变化，不演示 | — |

文件名后缀 `*` = `zh-red-1440`、`zh-red-390`、`en-green-1440`、`en-green-390`（教学模式开启）。共 6 类 × 4 = 24 张。详情图来自点击来源链接之后（不是直接打开地址）。验收要求“销售方向每项在 zh-red / en-green × 1440 各一张、至少一张 390”：本版 4 个组合全部采集，已覆盖。

## 2. 流程图

见 [发票列表筛选](../../flows/invoice-list-filter-flow.md)；订单与发票互相追溯沿用 [order-invoice-trace-flow](../../flows/order-invoice-trace-flow.md)。

## 3. 演示脚本（口述顺序）

预置（全部虚构）：沿用 v0.9.0 的三张采购单与两张采购发票（PO-I1 部分开票、PO-I2 已开完、PO-I3 未开票；AP-I1-1、AP-I2-1），以及 seed-trade 自带的 AP-DEMO（PARTY）、AP-DEMO2（PARTY2），均无来源订单。本版 `seed-sales.mjs` 新增服务类商品 `SERVICE`（收入科目 4000）和两张销售单，往来方都是 PARTY2：`SO-I1` L1 数量 10 单价 30、L2 数量 4 单价 50，发票 `AR-I1-1` 开 L1 的 4 个；`SO-I2` L1 数量 10 单价 30，发票 `AR-I2-1` 开满 10。

1. 打开“采购 / 销售订单”：五张订单，SO-I1“部分开票”、SO-I2“已开完”，与采购单同一列表。
2. 打开“发票”页：6 张发票，AR-I1-1 → SO-I1，AR-I2-1 → SO-I2。
3. 点 SO-I1 链接进入销售单详情（地址变为 `#/trade-orders?company=DEFAULT&order=SO-I1`）：只读，L1 已开 4、剩余 6，L2 已开 0、剩余 4。
4. 回到发票页，用筛选条：伙伴填 `PARTY2`，点“应用”：3 行（AP-DEMO2、AR-I1-1、AR-I2-1，采购销售混合）；点“清除”：回到 6 行，两个字段都清空；方向选“销售 AR”，点“应用”：2 行；再把伙伴填成 `PARTY`，点“应用”：没有符合条件的发票，表格无数据行，显示“没有符合条件的发票。”。筛选不改地址栏，不弹离开确认。

## 4. 复跑（从仓库根目录）

先做无浏览器替身检查（不启动 Chrome / Playwright / Vitest）。替身按顺序运行 `seed-trade.mjs`、`seed-invoicing.mjs`、`seed-sales.mjs`，校验前置主数据引用（伙伴、税码、档案、条款、商品）与订单规则；场景含：采购成功（22 个请求）、销售成功（31 个请求）、销售单缺 SERVICE 商品被拒、销售单用费用类商品被拒、超量开票、缺主数据、缺税码、缺参数：

```powershell
powershell -NoProfile -File docs\demo\v0.10.0\scripts\stub-check.ps1
```

PROC-05 固定负例 1–5（空目录与删光、隐藏文件、读不了的文件、中途抛错、端口归属变化）的夹具，同样无浏览器：

```powershell
powershell -NoProfile -File docs\demo\v0.10.0\scripts\proc05-negatives.ps1
```

编排级替身（无浏览器、无真实服务；端口 4201 须空闲）：在沙箱里原样运行真实 `run-main.ps1`，构造“进程 A 存活但监听归进程 B”（分别发生在 seed-invoicing 之前和 seed-sales 之前，各带一个去掉 PID 比较的对照），并把渲染后 README 里的真实服务演练块和取图块实际执行一遍，含 dist 缺界面标记、dist 不晚于 HEAD（相等）两个负例：

```powershell
powershell -NoProfile -File docs\demo\v0.10.0\scripts\orchestration-stub.ps1
```

真实服务演练（无浏览器，需协调者批准，D234）：

```powershell
$shots = Join-Path $env:TEMP ("demo-s10-shots-" + [guid]::NewGuid())
& .\docs\demo\v0.10.0\scripts\run-main.ps1 -Shots $shots -SkipCapture
```

真实 Chrome 取图（需独占时段）。开始前先做外部进程预检（连续 6 次都应为 0，每次间隔 10 秒），不为 0 就不要开始：

```powershell
1..6 | ForEach-Object {
  $n = @(Get-CimInstance Win32_Process | Where-Object {
    $_.ProcessId -ne $PID -and $_.Name -ne "pwsh.exe" -and $_.Name -ne "powershell.exe" -and
    ($_.Name -match "^(chrome|biome)" -or $_.CommandLine -match "vitest|playwright|vite\b|tsc\b|main\.ts|capture\.mjs")
  }).Count
  "预检 $_ : $n"
  if ($n -ne 0) { throw "有外部进程，不开始" }
  if ($_ -lt 6) { Start-Sleep 10 }
}
```

取图块：先 build，断言 `index.html` 严格晚于 HEAD 提交时间（相等也失败），再断言 dist 里有本版界面的文案（发票列表筛选条“Accounting date from”、无结果提示“No invoices match the filters”，旧界面没有），然后取图；任何一步失败就中止：

```powershell
. {
  $shots = Join-Path $env:TEMP ("demo-s10-shots-" + [guid]::NewGuid())
  $log = "$shots.run.log"   # 完整输出写入文件；失败时保留 $shots 与日志，不清理
  $ok = $false
  $code = 0
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"   # Stop 下 PowerShell 5.1 会在第一行原生 stderr 处终止管道，丢后续输出并改写退出码
  try {
    $global:LASTEXITCODE = 0
    npm run build *>&1 | Out-File -FilePath $log -Append -Encoding utf8 -Width 4096   # 服务托管 packages/web/dist；不重建会演示旧界面
    if ($LASTEXITCODE -ne 0) { throw "构建失败，退出码 $LASTEXITCODE" }
    $headTime = [DateTimeOffset]::Parse((git log -1 --format=%cI HEAD)).UtcDateTime
    $index = "packages\web\dist\index.html"
    if (-not (Test-Path $index) -or (Get-Item $index).LastWriteTimeUtc -le $headTime) { throw "dist 缺失，或不晚于 HEAD 提交时间（相等也算失败），中止" }
    $dist = Get-ChildItem packages\web\dist\assets -Filter *.js | Get-Content -Raw
    if (-not ($dist -match "Accounting date from" -and $dist -match "No invoices match the filters")) { throw "dist 里没有 Accounting date from 或 No invoices match the filters，旧界面，中止" }
    $global:LASTEXITCODE = 0
    & .\docs\demo\v0.10.0\scripts\run-main.ps1 -Shots $shots *>&1 | Out-File -FilePath $log -Append -Encoding utf8 -Width 4096
    if ($LASTEXITCODE -ne 0) { throw "run-main 退出码 $LASTEXITCODE" }
    $n = @(Get-ChildItem $shots -Filter *.png).Count
    if ($n -ne 24) { throw "截图数 $n，不是 24，不复制" }
    Copy-Item "$shots\*" docs\demo\v0.10.0\screenshots\ -ErrorAction Stop   # 复制失败要进 catch：不设 ok、不删 $shots 里的原图
    $ok = $true
  } catch {
    $code = if ($LASTEXITCODE) { $LASTEXITCODE } else { 1 }   # 原生命令的真实退出码；runner 自己 throw 时没有，记为 1
    "EXCEPTION: $($_ | Out-String)" | Out-File -FilePath $log -Append -Encoding utf8 -Width 4096
  } finally {
    $ErrorActionPreference = $prevEap
    "exit=$code ok=$ok log=$log" | Out-File -FilePath $log -Append -Encoding utf8 -Width 4096
    if ($ok -and (Split-Path $shots -Leaf) -like "demo-s10-shots-*" -and (Test-Path $shots)) { Remove-Item -Recurse -Force $shots }
  }
  Get-Content -Encoding UTF8 $log
  if (-not $ok) { throw "失败，退出码 $code；已保留 $shots 和 $log，不清理，不重试" }
}
```

取图块把 build 与 `run-main.ps1` 的 stdout / stderr、异常原文（`EXCEPTION:`）和最终 `exit=` 都追加写进 `$log`（`Out-File -Encoding utf8`，不截断），成功才复制、才清理；失败保留现场并抛出。`ErrorActionPreference` 在块内设为 `Continue`、结束时恢复。无浏览器替身 [orchestration-stub.ps1](scripts/orchestration-stub.ps1) 的 B7 在 Windows PowerShell 5.1 下实际执行这个块，覆盖成功、原生 stderr 之后仍有 stdout 并以退出码 3 失败、runner 抛错三条路径。
`run-main.ps1` 启动前检查端口 4201 空闲；每个 seed 与 capture 之前都校验监听进程就是本轮服务；`finally` 只停本轮服务、只删本轮 `erp-demo-*` 目录。`screenshots/.gitkeep` 是替身检查的哨兵文件，别删。

脚本入口：[run-main.ps1](scripts/run-main.ps1)、[capture.mjs](scripts/capture.mjs)、[seed-invoicing.mjs](scripts/seed-invoicing.mjs)、[seed-sales.mjs](scripts/seed-sales.mjs)、[stub-check.ps1](scripts/stub-check.ps1)、[proc05-negatives.ps1](scripts/proc05-negatives.ps1)、[orchestration-stub.ps1](scripts/orchestration-stub.ps1)、[seed-invoicing-stub.mjs](scripts/seed-invoicing-stub.mjs)；账套准备与主数据复用 v0.4.0 的 `prepare.mjs`、`seed-trade.mjs`。

## 5. 范围与限制

- 未演示：记账日期起止筛选与两种输入错误（伙伴格式不合法、起止倒置）的提示，只对照代码与 #189 的 GUI 场景（`trade-gui-scenario.ts` 的 `invoiceFilters()`），本 Demo 不实跑；分页下“加载更多”保持筛选；筛选条在 1440 en 与 390 的换行布局只在截图里目测，不做几何断言（几何断言在 #189 的测试里）。
- 筛选不进地址栏、刷新后重置、切换公司后重置（`TradeInvoices.tsx:1077–1078`）；本 Demo 不演示刷新与切换公司。
- 离开确认、待重试、订单深链接异常提示在 v0.9.0 Demo 已演示，本版不重复。
- capture 没有用替身页面执行，走“逐条核对”路径（见 [run-through.md](run-through.md) §3）；真实 Chrome 取图已在独占时段完成（D330 首次取图；D332 重取详情图（已完成），见 [run-through.md](run-through.md) §5）。发票列表里的 AP-DEMO、AP-DEMO2 来自 seed-trade，来源列显示“—”，属预期。
- 日志与时段记录见 [run-through.md](run-through.md)。
