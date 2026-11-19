# v0.1.0 Demo 脚本

**时长**约 15 分钟。**数据**：全新的临时演示账套（虚构数据），**端口 4190**，不连接 4173 账套，不使用真实旧账、`.bak` 或用户主检出。

## 准备（演示前）

```powershell
npm ci; npm run build
$db = Join-Path $env:TEMP "erp-demo-v010\demo.sqlite"
New-Item -ItemType Directory -Force (Split-Path $db) | Out-Null
npm run storage:admin -- migrate --provider sqlite --file $db
$env:ERP_SQLITE_FILE = $db; $env:ERP_PORT = "4190"
npm run start:local
```

打开 `http://127.0.0.1:4190/`。演示后停止进程并删除临时目录。

## 脚本

| # | 操作 | 要说的话 | 截图 |
| --- | --- | --- | --- |
| 1 | 打开“运行状态” | 本地单用户，数据已配置；首次连接自动建 DEFAULT 公司，不创建示例凭证 | [01](screenshots/01-overview.png) |
| 2 | 科目表 | 八个内置科目受保护；无 AP/AR/税控制科目 | [02](screenshots/02-accounts.png) |
| 3 | 财务维度 | 六类维度与规则 | [03](screenshots/03-dimensions.png) |
| 4 | 凭证 → 新建 | 来源编号 DEMO-001、记账日期 2026-11-02、摘要“股东投入启动资金”；借 1000 / 贷 3000，10000.00 | [20](screenshots/20-journal-form.png) |
| 5 | 保存草稿 → 预览 | 预览只读；确认前须保存 | [21](screenshots/21-journal-preview.png) |
| 6 | 确认过账 | 同事务重算、回执、审计；演示另一笔 800.00 房租（借 5000 / 贷 1000） | [22](screenshots/22-journal-posted.png) |
| 7 | 凭证 → 已过账 | 已过账不可改，可镜像纠错 | [23](screenshots/23-journals-posted-list.png) |
| 8 | 总账报表 | 现金 9,200.00、投入资本 10,000.00、费用 800.00；点金额下钻到明细 | [25](screenshots/25-ledger-reports.png)、[26](screenshots/26-ledger-detail.png) |
| 9 | 期末结账 | 向导：预览 → 确认 → 推进 | [27](screenshots/27-period-close.png) |
| 10 | 勾选“显示教学说明” | 只多出说明文字，规则不变 | [13](screenshots/13-overview-teaching-on.png)、[14](screenshots/14-journals-teaching-on.png) |
| 11 | 贸易主数据 | 伙伴、商品、过账配置、付款条件、税码（预览） | [04](screenshots/04-trade-master.png) |
| 12 | 发票 / 付款与收款 / 预付、贷项与专用纠错 | 仅展示页面与规则；贸易端到端未验收（M1-07） | [07](screenshots/07-trade-invoices.png)、[08](screenshots/08-trade-settlements.png)、[09](screenshots/09-trade-adjustments.png) |
| 13 | 只读报表 → 试算平衡表 | 读取旧快照，未配置时提示“已验证快照不可用或未配置”（预期） | [12](screenshots/12-trial-balance.png) |

## 本次演示的限制（如实说明）

- 贸易步骤 11–12 只展示空账套下的页面，**未**录入贸易数据：需先建 AP/AR/税控制科目与主数据，且贸易验收尚未完成。
- 步骤 4–9 用 Playwright（Edge）自动操作生成截图；脚本不入库。
