# v0.9.0 Demo

状态：脚本已写好并通过无浏览器替身验证；真实服务演练与真实 Chrome 取图尚未做（按 D234 需协调者批准的独占时段）。截图与日志入库后，本节更新为实际时段、head 与结果。基线 main `9bbabe7`（产品代码同 `6478d10`）。演示账套是临时目录里的虚构账套，端口 4201；不连接 4173，不碰真实旧账或 `.bak`。

## 1. S9 用户可见变化与演示点

| 变化 | PR | 演示 | 截图 |
|---|---|---|---|
| 订单列表新增“开票状态”列：未开票 / 部分开票 / 已开完（文字徽章，符号 `!` / `i` / `✓`） | #179 | 打开“采购 / 销售订单”，看 PO-I1、PO-I2、PO-I3 三行 | `orders-list-invoicing-*` |
| 订单深链接 `#/trade-orders?company=DEFAULT&order=PO-I1`：直接打开只读详情，焦点在结果区，刷新仍在；订单不存在、公司不在列表中有提示和“返回列表” | #179 | 打开 PO-I1 深链接、刷新；打开不存在的订单和不存在的公司 | `order-deeplink-*`；异常提示只断言，不截图 |
| 发票列表新增“来源订单”列，订单号是链接，点开进入该订单深链接 | #181 | 打开“发票”页看已过账发票列表 → 点 PO-I1 | `invoice-list-source-*` |
| 五页统一离开确认：发票页有未提交输入时，点链接或浏览器后退，只问一次；取消留在原页、草稿保留；确认才离开 | #181 | 输入外部发票号 → 点来源订单链接取消 → 后退取消 → 再点链接确认 | `invoice-leave-cancelled-*` |
| PROC-06、FLAKE-06/07（流程与测试稳定性） | #178、#180 | 无界面变化，不演示 | — |

文件名后缀 `*` = `zh-red-1440`、`zh-red-390`、`en-green-1440`、`en-green-390`（教学模式开启）。共 4 类 × 4 = 16 张。

## 2. 流程图

见 [订单与发票互相追溯、统一离开确认](../../flows/order-invoice-trace-flow.md)。

## 3. 演示脚本（口述顺序）

预置：三张采购单（商品 EXPENSE，税码 VAT，往来方 PARTY）。`PO-I1`：L1 数量 10 单价 10、L2 数量 4 单价 25；`PO-I2`：L1 数量 10 单价 10；`PO-I3`：L1 数量 5 单价 20。`seed-invoicing.mjs` 为 PO-I1 L1 开 4（发票 `AP-I1-1`），为 PO-I2 L1 开满 10（`AP-I2-1`），PO-I3 不开票。

1. 打开“采购 / 销售订单”：列表最后一列为开票状态，PO-I1 “部分开票”、PO-I2 “已开完”、PO-I3 “未开票”。
2. 直接打开 `#/trade-orders?company=DEFAULT&order=PO-I1`：显示 PO-I1 只读详情，L1 已开 4、剩余 6，L2 已开 0、剩余 4；刷新后仍是同一画面。把 `order` 改成不存在的订单号：提示“本公司没有该订单号的订单”，点“返回列表”只去掉 `order`；把 `company` 改成不存在的公司：提示“公司不在已加载的列表中 · NOPE”，点“返回列表”去掉 `company` 与 `order`。
3. 打开“发票”页：已过账发票列表多了“来源订单”列，AP-I1-1 → PO-I1，AP-I2-1 → PO-I2；点 PO-I1 进入订单详情。
4. 回到发票页，在外部发票号里输入 `DRAFT-1`，点来源订单链接：弹出“本页有未提交的修改，仍要离开吗？”，取消，仍在发票页、草稿还在；再按浏览器后退：只再问一次，取消，仍在原地址、草稿还在；最后再点链接并确认，才进入订单详情。

## 4. 复跑（从仓库根目录）

先做无浏览器替身检查（不启动 Chrome / Playwright / Vitest）。替身按顺序运行 `seed-trade.mjs` 与 `seed-invoicing.mjs`，校验前置主数据引用（伙伴、税码、档案、条款、商品）和订单规则；场景含成功、超量开票、缺主数据、缺税码、缺参数：

```powershell
powershell -NoProfile -File docs\demo\v0.9.0\scripts\stub-check.ps1
```

PROC-05 固定负例 1–5（空目录与删光、隐藏文件、读不了的文件、中途抛错、端口归属变化）的夹具，同样无浏览器：

```powershell
powershell -NoProfile -File docs\demo\v0.9.0\scripts\proc05-negatives.ps1
```

编排级替身（无浏览器、无真实服务；端口 4201 须空闲）：在沙箱里原样运行真实 `run-main.ps1`，构造“进程 A 存活但监听归进程 B”，并把渲染后 README 里的真实服务演练块和取图块实际执行一遍，含 dist 缺界面标记、dist 不晚于 HEAD（相等）两个负例：

```powershell
powershell -NoProfile -File docs\demo\v0.9.0\scripts\orchestration-stub.ps1
```

真实服务演练（无浏览器，需协调者批准，D234）：

```powershell
$shots = Join-Path $env:TEMP ("demo-s9-shots-" + [guid]::NewGuid())
& .\docs\demo\v0.9.0\scripts\run-main.ps1 -Shots $shots -SkipCapture
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

取图块：先 build，断言 `index.html` 严格晚于 HEAD 提交时间（相等也失败），再断言 dist 里有本版界面的文案（订单列表“Partly invoiced”、发票列表“Source order”，旧界面没有），然后取图；任何一步失败就中止：

```powershell
. {
  $ErrorActionPreference = "Stop"
  $shots = Join-Path $env:TEMP ("demo-s9-shots-" + [guid]::NewGuid())
  $log = "$shots.run.log"   # 完整输出写入文件；失败时保留 $shots 与日志，不清理
  $ok = $false
  try {
    npm run build   # 服务托管 packages/web/dist；不重建会演示旧界面
    if ($LASTEXITCODE -ne 0) { throw "构建失败，退出码 $LASTEXITCODE" }
    $headTime = [DateTimeOffset]::Parse((git log -1 --format=%cI HEAD)).UtcDateTime
    $index = "packages\web\dist\index.html"
    if (-not (Test-Path $index) -or (Get-Item $index).LastWriteTimeUtc -le $headTime) { throw "dist 缺失，或不晚于 HEAD 提交时间（相等也算失败），中止" }
    $dist = Get-ChildItem packages\web\dist\assets -Filter *.js | Get-Content -Raw
    if (-not ($dist -match "Partly invoiced" -and $dist -match "Source order")) { throw "dist 里没有 Partly invoiced 或 Source order，旧界面，中止" }
    & .\docs\demo\v0.9.0\scripts\run-main.ps1 -Shots $shots *>&1 | Tee-Object -FilePath $log
    $n = @(Get-ChildItem $shots -Filter *.png).Count
    if ($n -ne 16) { throw "截图数 $n，不是 16，不复制" }
    Copy-Item "$shots\*" docs\demo\v0.9.0\screenshots\
    $ok = $true
  } finally {
    if ($ok -and (Split-Path $shots -Leaf) -like "demo-s9-shots-*" -and (Test-Path $shots)) { Remove-Item -Recurse -Force $shots }
    elseif (-not $ok) { "失败，已保留：$shots 和 $log" }
  }
}
```

`run-main.ps1` 启动前检查端口 4201 空闲；每个 seed 与 capture 之前都校验监听进程就是本轮服务；`finally` 只停本轮服务、只删本轮 `erp-demo-*` 目录。`screenshots/.gitkeep` 是替身检查的哨兵文件，别删。

脚本入口：[run-main.ps1](scripts/run-main.ps1)、[capture.mjs](scripts/capture.mjs)、[seed-invoicing.mjs](scripts/seed-invoicing.mjs)、[stub-check.ps1](scripts/stub-check.ps1)、[proc05-negatives.ps1](scripts/proc05-negatives.ps1)、[orchestration-stub.ps1](scripts/orchestration-stub.ps1)、[seed-invoicing-stub.mjs](scripts/seed-invoicing-stub.mjs)；账套准备与主数据复用 v0.4.0 的 `prepare.mjs`、`seed-trade.mjs`。

## 5. 范围与限制

- 未演示：销售方向、五页中的付款与收款、调整、报表、期间准入页的离开确认（只演示发票页，其余四页见用户文档，仅对照代码，未实跑）；待重试 / 读取失败的硬拦截；订单页自己的草稿确认。
- 取消后退时前进历史被丢弃（D275 已接受的限制）本 Demo 不演示。
- capture 没有用替身页面执行，走“逐条核对”路径，见 [run-through.md](run-through.md)。
- 日志与时段记录见 [run-through.md](run-through.md)。
