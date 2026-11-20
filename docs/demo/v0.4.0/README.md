# v0.4.0 Demo 脚本（S4 用户可见变化）

基线：main `fda79b7`（#105 合并提交）。本 Demo 只演示 S4 的用户可见变化，条目来源见 [CHANGELOG `[0.4.0]`](../../../CHANGELOG.md) 与 [发布说明](../../release/v0.4.0-release-notes.md)。实际执行记录与未执行项见 [run-through.md](run-through.md)。

## 1. 截图与数据来源

- 数据为虚构的临时演示账套：`%TEMP%` 下新建的 GUID 目录中的 `demo.sqlite`；不使用 4173 账本、真实旧账或 `.bak`；演示端口 4194。
- 预置（公司、财年、控制科目、期间准入、主数据、两张已过账采购发票）由 `scripts/prepare.mjs` 与 `scripts/seed-trade.mjs` 脚本化完成，原因：这些是 S4 之前就有的前置条件，不是本次演示对象。订单 `PO-DEMO` 不预置，由 GUI 录入。
- 截图由 `scripts/capture.mjs` 用系统 Chrome 驱动真实页面产生（DPR 1、整页）；组合为 zh/专业红、en/专业绿 × 宽 1440、390。截图在 `screenshots/`，文件名 `<页面>-<语言>-<主题>-<宽度>.png`。
- 订单页每个组合录入一张不同编号的订单（`PO-DEMO`、`PO-DEMO-B`、`-C`、`-D`），服务端返回 201，金额均为 净额 100.00 / 税额 13.00 / 价税合计 113.00（见 `screenshots/capture-log.json`）。

## 2. 准备（同一个 PowerShell 终端，从仓库根目录执行）

这些命令按顺序在同一终端执行过（本次执行见 [run-through.md](run-through.md)）。服务用 `Start-Process` 后台启动，返回的进程对象保存在 `$server`，收尾只停这个对象；先确认 4194 空闲、服务就绪后才写入数据，避免误写入占用该端口的其他服务。

```powershell
$day = Get-Date -Format yyyy-MM-dd
$year = (Get-Date).Year
if (Get-NetTCPConnection -LocalPort 4194 -State Listen -ErrorAction SilentlyContinue) { throw "4194 已被占用，请换端口或先确认占用者归属，不要直接停止别人的进程" }
npm run build
$dir = Join-Path $env:TEMP ("erp-demo-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory $dir | Out-Null
$db = Join-Path $dir "demo.sqlite"
npm run storage:admin -- migrate --provider sqlite --file $db
node docs\demo\v0.4.0\scripts\prepare.mjs $db $year
$env:ERP_SQLITE_FILE = $db; $env:ERP_PORT = "4194"; $env:ERP_HOST = "127.0.0.1"; $env:ERP_PROFILE = "local"
$server = Start-Process node -ArgumentList "packages/infra/src/main.ts" -PassThru -WindowStyle Hidden
$ready = $false
1..20 | ForEach-Object { if (-not $ready) { try { $ready = (Invoke-WebRequest http://127.0.0.1:4194/ -UseBasicParsing).StatusCode -eq 200 } catch { Start-Sleep 1 } } }
if (-not $ready -or $server.HasExited) { throw "演示服务未就绪，不要继续写入" }
node docs\demo\v0.4.0\scripts\seed-trade.mjs http://127.0.0.1:4194 $day
$shots = Join-Path $env:TEMP "demo-shots"
node docs\demo\v0.4.0\scripts\capture.mjs http://127.0.0.1:4194 $shots
```

- `$day` 取当天，使预置数据的日期与订单页默认订单日期（当天）落在同一年、同一期间；`$year` 同理。
- 截图输出到 `$shots`；提交到仓库前再复制到 `docs\demo\v0.4.0\screenshots\`。
## 3. 演示脚本

| # | 页面与操作 | 要点（来源 PR） | 截图（zh 红 1440；其余组合同名替换） |
|---|---|---|---|
| 1 | 运行状态：打开应用 | 窄屏（390）顶栏品牌名视觉隐藏，仅留图标（#102） | `overview-zh-red-1440.png`、`overview-zh-red-390.png` |
| 2 | 采购 / 销售订单：填订单号、伙伴 `PARTY`、商品 `EXPENSE`、税码 `VAT`、数量 10、单价 10，点「保存订单」 | 订单录入走 GUI；行号自动为 `L1`；保存后服务端给出净额/税额/价税合计，订单不过账（#91） | `trade-orders-draft-*`、`trade-orders-saved-*` |
| 3 | 预付、贷项与专用纠错：操作选「非库存贷项」，在「按伙伴代码筛选未结项」输入 `PARTY2` 回车 | 未结项按伙伴筛选；留空为全部；预付类不显示该筛选（#90） | `trade-adjustments-all-*`、`trade-adjustments-filtered-*` |
| 4 | 科目表、贸易主数据 | 只读「启用」列使用徽标（#100、#103） | `accounts-*`、`trade-master-*` |
| 5 | 凭证：状态选「已过账」 | 操作列表头为「操作 / Actions」，按钮为「查看 / 编辑」（#101） | `journals-*` |
| 6 | 采购与销售发票 | 「新增行」按钮带 `Alt+Shift+N` 提示（#93） | `trade-invoices-*` |
| 7 | 期末结账 | 页面截图；表格链接样式见 #98 | `period-close-*` |
| 8 | 偏好读取失败（模拟） | 偏好无法读取时显示 MessageBar 警告，并回退默认设置（zh / 专业红 / 教学说明关闭）（#104）。脚本让 `localStorage.getItem` 抛错模拟，非真实故障；因必然回退默认，两张图都是 zh 红，不是 en 绿的保存失败分支 | `preference-read-failed-fallback-zh-red-1440.png`、`preference-read-failed-fallback-zh-red-390.png` |

## 4. 讲解提示

- 对比 1440 与 390 两组截图。`capture-log.json` 记录每张截图的页面级横向溢出（`overflowPx`），42 张均为 0；表格在窄屏内部可横向滚动（如凭证列表的操作列在 390 下需滚动才可见）。
- 36px / 44px：只对 #92、#97、#98 涉及的页面和控件成立；本 Demo 未做真机粗指针测量（见 run-through）。
- 迁移核对页（#87）本次未走真实流程，见 run-through；其用法见 [v0.3.0 Demo §4](../v0.3.0/README.md)。

## 5. 收尾

只停止本次启动的服务（`$server`），再删除本次的临时目录；不按历史进程号或进程名停进程。

```powershell
if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id }
Remove-Item -Recurse -Force $dir
```

完成后可再检查 4194 已无监听，且仓库内没有 `.bak`。