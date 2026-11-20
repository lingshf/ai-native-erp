# v0.4.0 Demo 脚本（S4 用户可见变化）

基线：main `fda79b7`（#105 合并提交）。本 Demo 只演示 S4 的用户可见变化，条目来源见 [CHANGELOG `[0.4.0]`](../../../CHANGELOG.md) 与 [发布说明](../../release/v0.4.0-release-notes.md)。实际执行记录与未执行项见 [run-through.md](run-through.md)。

## 1. 截图与数据来源

- 数据为虚构的临时演示账套：`%TEMP%` 下新建的 GUID 目录中的 `demo.sqlite`；不使用 4173 账本、真实旧账或 `.bak`；演示端口 4194。
- 预置（公司、财年、控制科目、期间准入、主数据、两张已过账采购发票）由 `scripts/prepare.mjs` 与 `scripts/seed-trade.mjs` 脚本化完成，原因：这些是 S4 之前就有的前置条件，不是本次演示对象。订单 `PO-DEMO` 不预置，由 GUI 录入。
- 截图由 `scripts/capture.mjs` 用系统 Chrome 驱动真实页面产生（DPR 1、整页）；组合为 zh/专业红、en/专业绿 × 宽 1440、390。截图在 `screenshots/`，文件名 `<页面>-<语言>-<主题>-<宽度>.png`。
- 订单页每个组合录入一张不同编号的订单（`PO-DEMO`、`PO-DEMO-B`、`-C`、`-D`），服务端返回 201，金额均为 净额 100.00 / 税额 13.00 / 价税合计 113.00（见 `screenshots/capture-log.json`）。

## 2. 准备

```powershell
$dir = Join-Path $env:TEMP ("erp-demo-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory $dir | Out-Null
$db = Join-Path $dir "demo.sqlite"
npm run build
npm run storage:admin -- migrate --provider sqlite --file $db
node docs\demo\v0.4.0\scripts\prepare.mjs $db 2026
$env:ERP_SQLITE_FILE = $db; $env:ERP_PORT = "4194"; $env:ERP_HOST = "127.0.0.1"; $env:ERP_PROFILE = "local"
npm run start:local
```

最后一条会占用当前终端；另开终端后依次执行：

```powershell
node docs\demo\v0.4.0\scripts\seed-trade.mjs http://127.0.0.1:4194 2026-11-20
$shots = "docs\demo\v0.4.0\screenshots"
node docs\demo\v0.4.0\scripts\capture.mjs http://127.0.0.1:4194 $shots
```

（记录中实际以 `Start-Process node -ArgumentList "packages/infra/src/main.ts"` 后台启动，等价于 `start:local`。）

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
| 8 | 偏好存储不可用（模拟） | 偏好无法读取时显示 MessageBar 警告并使用默认设置（#104）；用脚本让 `localStorage.getItem` 抛错模拟，非真实故障 | `preference-warning-zh-red-1440.png`、`preference-warning-en-green-390.png` |

## 4. 讲解提示

- 对比 1440 与 390 两组截图。`capture-log.json` 记录每张截图的页面级横向溢出（`overflowPx`），42 张均为 0；表格在窄屏内部可横向滚动（如凭证列表的操作列在 390 下需滚动才可见）。
- 36px / 44px：只对 #92、#97、#98 涉及的页面和控件成立；本 Demo 未做真机粗指针测量（见 run-through）。
- 迁移核对页（#87）本次未走真实流程，见 run-through；其用法见 [v0.3.0 Demo §4](../v0.3.0/README.md)。

## 5. 收尾

先用 `Get-Process node` 找到演示服务的进程号（本次记录为 9036），再停止服务并删除本 Demo 的临时目录：

```powershell
Stop-Process -Id 9036
Remove-Item -Recurse -Force $dir
```

进程号每次不同，请换成自己查到的数字。只删除本 Demo 的临时目录，不碰其他账套。