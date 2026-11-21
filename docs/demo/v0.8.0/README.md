# v0.8.0 Demo

状态：16 张截图和日志已入库（第 4 个独占时段 D257，head `cc2aae8` 的脚本，前 3 个时段中止，见 [run-through.md](run-through.md)）。基线 `981151d`。演示账套是临时目录里的虚构账套，端口 4200；不连接 4173，不碰真实旧账或 `.bak`。

## 1. S8 用户可见变化与演示点

| 变化 | PR | 演示 | 截图 |
|---|---|---|---|
| 订单查询页：部分开票的订单显示每行已开/剩余数量，并有“开票”入口，带入开票页 | #172 | 查 PO-I1 → 看已开/剩余 → 点“开票” | `order-partial-*`、`invoice-prefilled-*` |
| 开票页按订单带入行（数量为剩余量）、带入提示、焦点到外部发票号 | #171 | 点“开票”后的开票页 | `invoice-prefilled-*` |
| 已全部开票的订单：显示“已开完”，开票按钮禁用并说明原因；直接带 `fromOrder` 打开开票页只提示、不生成行 | #171、#172 | 查 PO-I2 → 直接打开其开票页 | `order-full-*`、`invoice-fully-invoiced-*` |
| PROC-04、PROC-05（文档与脚本流程） | #169、#170 | 无界面变化，不演示 | — |

文件名后缀 `*` = `zh-red-1440`、`zh-red-390`、`en-green-1440`、`en-green-390`（教学模式开启）。

## 2. 流程图

见 [docs/flows/](../../flows/) 中“从订单开票”的总图与细节图。

## 3. 演示脚本（口述顺序）

预置：两张采购单（商品 EXPENSE，税码 VAT）。`PO-I1`（往来方 PARTY）L1 数量 10 单价 10、L2 数量 4 单价 25；`PO-I2` L1 数量 10 单价 10。`seed-invoicing.mjs` 另按预览→确认为 PO-I1 L1 开 4（发票 `AP-I1-1`），为 PO-I2 L1 开满 10（`AP-I2-1`）。

1. 打开“采购 / 销售订单”，查询 `PO-I1`：L1 已开 4、剩余 6；L2 已开 0、剩余 4；有“开票”链接。
2. 点“开票”：进入开票页，提示“已按订单带入”，两行已带入（L1 数量 6，L2 数量 4），焦点在外部发票号，地址栏不再带 `fromOrder`。
3. 回到订单页查询 `PO-I2`：显示“已开完”，开票按钮禁用并写明原因，没有链接。
4. 直接打开 `#/trade-invoices?company=DEFAULT&fromOrder=PO-I2`：提示该订单已全部开票，未生成行。

## 4. 复跑（从仓库根目录）

先做无浏览器替身检查（不启动 Chrome / Playwright / Vitest）。替身按顺序运行 `seed-trade.mjs` 与 `seed-invoicing.mjs`，校验前置主数据引用（伙伴、税码、档案、条款、商品）和订单规则；场景含成功、超量开票、缺主数据、缺税码、缺参数：

```powershell
powershell -NoProfile -File docs\demo\v0.8.0\scripts\stub-check.ps1
```

PROC-05 固定负例 1–5（空目录与删光、隐藏文件、读不了的文件、中途抛错、端口归属变化）的夹具，同样无浏览器：

```powershell
powershell -NoProfile -File docs\demo\v0.8.0\scripts\proc05-negatives.ps1
```

编排级替身（无浏览器、无真实服务；端口 4200 须空闲）：在沙箱里原样运行真实 `run-main.ps1`，构造“进程 A 存活但监听归进程 B”，并把渲染后 README 里的真实服务演练块和取图块实际执行一遍：

```powershell
powershell -NoProfile -File docs\demo\v0.8.0\scripts\orchestration-stub.ps1
```
真实服务演练（无浏览器，需协调者批准，D234）：

```powershell
$shots = Join-Path $env:TEMP ("demo-s8-shots-" + [guid]::NewGuid())
& .\docs\demo\v0.8.0\scripts\run-main.ps1 -Shots $shots -SkipCapture
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

build 完成后、capture 之前的 dist 断言（取图块里已串联；单独运行时用这段，不含 `/invoicing` 与 `fromOrder` 就中止）：

```powershell
$dist = Get-ChildItem packages\web\dist\assets -Filter *.js | Get-Content -Raw
if (-not ($dist -match "/invoicing" -and $dist -match "fromOrder")) { throw "dist 里没有 /invoicing 或 fromOrder，旧界面，中止" }
```

```powershell
. {
  $ErrorActionPreference = "Stop"
  $shots = Join-Path $env:TEMP ("demo-s8-shots-" + [guid]::NewGuid())
  try {
    npm run build   # 服务托管 packages/web/dist；不重建会演示旧界面
    if ($LASTEXITCODE -ne 0) { throw "构建失败，退出码 $LASTEXITCODE" }
    $dist = Get-ChildItem packages\web\dist\assets -Filter *.js | Get-Content -Raw
    if (-not ($dist -match "/invoicing" -and $dist -match "fromOrder")) { throw "dist 里没有 /invoicing 或 fromOrder，中止" }
    & .\docs\demo\v0.8.0\scripts\run-main.ps1 -Shots $shots
    $n = @(Get-ChildItem $shots -Filter *.png).Count
    if ($n -ne 16) { throw "截图数 $n，不是 16，不复制" }
    Copy-Item "$shots\*" docs\demo\v0.8.0\screenshots\
  } finally {
    if ((Split-Path $shots -Leaf) -like "demo-s8-shots-*" -and (Test-Path $shots)) { Remove-Item -Recurse -Force $shots }
  }
}
```

`run-main.ps1` 启动前检查端口 4200 空闲；每个 seed 与 capture 之前都校验监听进程就是本轮服务；`finally` 只停本轮服务、只删本轮 `erp-demo-*` 目录。`screenshots/.gitkeep` 是替身检查的哨兵文件，别删。

脚本入口：[run-main.ps1](scripts/run-main.ps1)、[capture.mjs](scripts/capture.mjs)、[seed-invoicing.mjs](scripts/seed-invoicing.mjs)、[stub-check.ps1](scripts/stub-check.ps1)、[proc05-negatives.ps1](scripts/proc05-negatives.ps1)、[orchestration-stub.ps1](scripts/orchestration-stub.ps1)、[seed-invoicing-stub.mjs](scripts/seed-invoicing-stub.mjs)；账套准备与主数据复用 v0.4.0 的 `prepare.mjs`、`seed-trade.mjs`。

## 5. 范围与限制

- 超量开票只由替身用“改过数量的副本”验证；它不是历史脚本。
- 未演示：销售方向、价格超容差例外、跨月账期、取消后恢复草稿（见 RC 说明）。
- 日志与时段记录见 [run-through.md](run-through.md)。
