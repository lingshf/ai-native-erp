# v0.2.0 Demo 脚本

**时长**约 15 分钟。**数据**：全新的临时演示账套（虚构数据），**端口 4191**，不连接 4173 账套，不使用真实旧账、`.bak` 或用户主检出。

## 准备（演示前）

```powershell
npm ci; npm run build
# 每次创建独占的新目录；已存在或迁移失败即停止，绝不复用旧账套
$dir = Join-Path ([IO.Path]::GetTempPath()) ("erp-demo-" + [guid]::NewGuid().ToString("N"))
[IO.Directory]::CreateDirectory($dir) | Out-Null
$db = Join-Path $dir "demo.sqlite"
npm run storage:admin -- migrate --provider sqlite --file $db
if ($LASTEXITCODE -ne 0) { throw "migrate 失败，停止；仅可清理本次目录 $dir" }
$env:ERP_SQLITE_FILE = $db; $env:ERP_PORT = "4191"   # 不得使用 4173
npm run start:local
```

打开 `http://127.0.0.1:4191/`。演示后停止本次启动的进程，只删除本次的 `$dir`。

**日期**：首次连接建立“当前财年”公司。以下日期取该财年内、当前开放的期间；截图在 2026 财年（2026-11 期）下拍摄，仅作示例，请按实际财年替换。

## 脚本

| # | 操作 | 要说的话 | 截图 |
| --- | --- | --- | --- |
| 1 | 运行状态 | 本地单用户；首次连接自动建公司，不创建示例凭证 | [01](screenshots/01-overview.png) |
| 2 | 凭证（空） | v0.2.0 修复：空列表显示“没有凭证。” | [02](screenshots/02-journals-empty.png) |
| 3 | 只读报表 → 试算平衡表 | 未配置旧账快照时是中性提示并链接总账报表，可“重新加载快照” | [03](screenshots/03-trial-unconfigured.png) |
| 4 | 期末结账 → 期间贸易模块准入 | 勾选 trade、tax，填原因，保存；默认不准入 | [04](screenshots/04-period-admission-form.png)、[05](screenshots/05-period-admitted.png) |
| 5 | 贸易主数据 | 伙伴、商品、过账配置、付款条件、税码（科目需先建好） | [06](screenshots/06-trade-master.png) |
| 6 | 采购发票 | 订单只能经 API 创建（本演示脚本以 API 建 PO-DEMO）；预览后确认 | [07](screenshots/07-invoice-preview.png)、[08](screenshots/08-invoice-posted.png) |
| 7 | 付款与收款 | 预览账面核销，部分付款；折扣符合条件也须用户选择采用 | [09](screenshots/09-settlement-preview.png) |
| 8 | 预付/贷项/专用纠错 | 余额与来源；教学提示不覆盖此页 | [10](screenshots/10-adjustments.png) |
| 9 | 往来未结项与账龄 → 未结项 | 剩余 36.50；点单据下钻 | [11](screenshots/11-open-items.png) |
| 10 | 账龄 | 未到期与逾期分档，贷项/预付单列 | [12](screenshots/12-ageing.png) |
| 11 | GL 核对 | 2100 = -36.50，各项差异 0.00；永不自动抵平 | [13](screenshots/13-reconciliation.png) |

## 本次演示的限制（如实说明）

- 订单无录入界面（M1-R1），演示时由脚本经 API 创建 PO-DEMO。
- 截图由 Playwright（Edge）自动生成，脚本不入库；旧账导入（M2-03）仅命令行，不在演示范围，迁移尚未完成。
- 保存期间准入后的提示沿用“原操作已成功；请以当前期间状态为准。”。
