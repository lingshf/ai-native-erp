# v0.2.0 Demo 脚本

**时长**约 20 分钟。**数据**：全新的临时演示账套（虚构数据），**端口 4191**，不连接 4173 账套，不使用真实旧账、`.bak` 或用户主检出。本脚本与根 [README「贸易 GUI 主路径验收」](../../../README.md#贸易-gui-主路径验收m1-07)使用同一套虚构数据，可逐步重现；金额以 README 为准。

## 1. 准备（演示前）

```powershell
npm ci; npm run build
# 每次创建独占的新目录；已存在或迁移失败即停止，绝不复用旧账套
$dir = Join-Path ([IO.Path]::GetTempPath()) ("erp-demo-" + [guid]::NewGuid().ToString("N"))
[IO.Directory]::CreateDirectory($dir) | Out-Null
$db = Join-Path $dir "demo.sqlite"
npm run storage:admin -- migrate --provider sqlite --file $db
if ($LASTEXITCODE -ne 0) { throw "migrate 失败，停止；仅可清理本次目录 $dir" }
$env:ERP_SQLITE_FILE = $db; $env:ERP_PORT = "4191"; $env:ERP_HOST = "127.0.0.1"; $env:ERP_PROFILE = "local"   # 不得使用 4173
npm run start:local
```

打开 `http://127.0.0.1:4191/`。演示后停止本次启动的进程，只删除本次的 `$dir`。

**日期**：首次连接建立“当前财年”公司。下文“当天”指演示当天；所有日期须在默认公司的当前财年内，主数据有效期设为该年 01-01 至 12-31，税率 JSON 中的年份改成当前财年。截图在 2026 财年（2026-11 期）拍摄，仅作示例。

## 2. 数据准备（在“科目表”“期末结账”“贸易主数据”页完成）

1. **科目表**：新建下表六个有效科目，均选用途 `control`、禁止手工输入；`1000`、`4000`、`5000` 为内置科目，无需新建。

   | 科目 | 类别 / 报表组 | 统驭模块 |
   | --- | --- | --- |
   | 2100 | LIABILITY / payables | AP |
   | 1250 | ASSET / prepayments | AP |
   | 1300 | ASSET / receivables | AR |
   | 2300 | LIABILITY / otherLiabilities | AR |
   | 1400 | ASSET / otherAssets | TAX |
   | 2200 | LIABILITY / taxLiabilities | TAX |

2. **期末结账 → 期间贸易模块准入**：选当天所在月份，勾选 `trade`、`tax`，填虚构原因，点“保存期间准入”。
3. **贸易主数据**：按顺序新建（均启用，未列出的引用留空、维度 `{}`）。

   | 类型 / 代码 | 字段 |
   | --- | --- |
   | 付款条件 `N30` | 到期 30 天、折扣 7 天、折扣率 `1.5`、允许部分付款折扣 |
   | 税码 `VAT` | ordinary、可抵扣 `100`、进项 `1400`、销项 `2200`；税率 `[{"id":"STANDARD","from":"<年>-01-01","to":"<年>-12-31","ratePercent":"13"}]` |
   | 过账配置 `PAY` | AP、统驭 `2100`、预付 `1250`、现金 `1000`、折扣 `4000` |
   | 过账配置 `REC` | AR、统驭 `1300`、预收 `2300`、现金 `1000`、折扣 `4000` |
   | 伙伴 `PARTY` | both、AP 配置 `PAY`、AR 配置 `REC`、条款 `N30`、允许税码 `VAT` |
   | 非库存商品 `EXPENSE` | expense、费用 `5000`、允许税码 `VAT` |
   | 非库存商品 `SERVICE` | service、收入 `4000`、允许税码 `VAT` |

4. **创建采购订单（仅 API，无录入界面）**：另开一个 PowerShell 窗口，与浏览器连同一临时实例：

   ```powershell
   $origin = "http://127.0.0.1:4191"
   $today = Get-Date -Format "yyyy-MM-dd"
   $po = @{
     company="DEFAULT"; orderId="PO-DEMO"; side="AP"; party="PARTY"; currency="CNY"
     orderDate=$today; priceIncludesTax=$false; rounding="line"
     lines=@(@{ lineId="OL1"; product="EXPENSE"; taxCode="VAT"; quantity="10"
       unitPrice="10"; discountPercent="0"; taxableCharge="0" })
   } | ConvertTo-Json -Depth 5
   Invoke-RestMethod "$origin/api/v1/trade/orders" -Method Post `
     -Headers @{Origin=$origin} -ContentType "application/json" -Body $po
   ```

## 3. 演示脚本

| # | 页面与操作 | 预期 / 要说的话 | 截图 |
| --- | --- | --- | --- |
| 1 | 运行状态 | 本地单用户；首次连接自动建公司，不创建示例凭证 | [01](screenshots/01-overview.png) |
| 2 | 凭证（空账套） | 空列表显示“没有凭证。”（v0.2.0 修复） | [02](screenshots/02-journals-empty.png) |
| 3 | 只读报表 → 试算平衡表 | 未配置旧账快照：中性提示，不影响当前账套，链接总账报表，可“重新加载快照” | [03](screenshots/03-trial-unconfigured.png) |
| 4 | 期末结账 → 准入（数据准备第 2 步） | 默认不准入；勾选 trade、tax、填原因、保存 | [04](screenshots/04-period-admission-form.png)、[05](screenshots/05-period-admitted.png) |
| 5 | 贸易主数据（第 3 步完成后） | 伙伴、商品、过账配置、付款条件、税码 | [06](screenshots/06-trade-master.png) |
| 6 | 采购和销售发票 | AP、`PARTY`、外部号 `AP-DEMO`、订单 `PO-DEMO`；行 `L1`：`EXPENSE`、`VAT`、数量 `10`、单价 `10`、订单行 `OL1`，其余 `0`。预览：净额 100.00、税 13.00、总额 113.00、匹配成功；再点“确认发票” | [07](screenshots/07-invoice-preview.png)、[08](screenshots/08-invoice-posted.png) |
| 7 | 付款与收款 | `PARTY`、AP，选 `AP-DEMO`；核销金额输入 `5650`（最小单位），勾选现金折扣。预览核销 56.50、现金 55.75、折扣 0.75、余款 56.50；确认账面核销。折扣符合条件也须用户勾选才采用 | [09](screenshots/09-settlement-preview.png) |
| 8 | 预付、贷项与专用纠错 | 新建 AP 预付 `PARTY`、总额 `2000`，预览确认；“应用预付/贷项”：来源选该预付、目标 `AP-DEMO`、金额 `2000`。发票余款 36.50、预付余款 0.00 | [10](screenshots/10-adjustments.png) |
| 9 | 往来未结项与账龄 → 未结项 | 月份留空（当前余额）：发票未结 36.50；点单据下钻到发票行、核销记录和凭证 | [11](screenshots/11-open-items.png) |
| 10 | 账龄 | 当天仍为未到期；贷项/预付单列，不抵消发票桶 | [12](screenshots/12-ageing.png) |
| 11 | GL 核对 | `2100`：子账与贸易 GL 均为 -36.50，贸易差异 0.00、其他来源 0.00；**看贸易差异，其他来源另列，从不自动抵平** | [13](screenshots/13-reconciliation.png) |

截图 1–13 与上表一一对应；若要加演销售发票与贷项/取消，按根 README 主路径表的后三行操作（本次截图未覆盖）。

## 4. 本次演示的限制与日志说明

- 订单无录入界面（M1-R1），由数据准备第 4 步经 API 创建。
- 截图由 Playwright（Edge）自动生成，脚本不入库；旧账导入（M2-03）仅命令行，不在演示范围，迁移尚未完成。
- 保存期间准入后的提示沿用“原操作已成功；请以当前期间状态为准。”。
- **服务器日志里的两条错误行均为预期，不是故障**（日志只含 `requestId` 与类型，不含路径；用响应体或浏览器网络面板里的 `requestId` 对应）：
  - `InternalError`：对应 `GET /api/v1/legacy/context` 返回 **503 UNAVAILABLE**。未配置旧账快照时该接口按设计返回 503，页面据此显示中性提示（服务器按 5xx 记为 `InternalError`）。
  - `HttpError`：对应浏览器自动请求 `GET /favicon.ico` 的 **404 NOT_FOUND**。页面未声明图标，服务器对未知路径返回 404 并记为 `HttpError`（4xx 且非 400/415）。无业务影响。
