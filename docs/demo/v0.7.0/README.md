# v0.7.0 Demo

运行对象：待运行前在 [run-through.md](run-through.md) 记录（RC 合并提交 `f06d30c`，产品代码与 main 相同）。演示账套是临时目录里的虚构账套，端口 4199；未连接 4173，未碰真实旧账或 `.bak`。

## 1. S7 用户可见变化与演示点

| 变化 | PR | 演示 | 截图 |
|---|---|---|---|
| 订单列表可按往来方、方向、日期区间筛选（组合条件取交集，日期含两端）；“清除”回到全部订单 | #161 | 全部 4 张 → 伙伴 + 方向 + 日期 → 清除 | `trade-orders-filter-all-*`、`trade-orders-filter-combined-*` |
| 有筛选而无结果，提示与“本公司还没有订单。”不同 | #161 | 伙伴 PARTY2 + 销售 + 截止日早于其订单 | `trade-orders-filter-no-match-*` |
| 起始日晚于截止日：就地提示，不发请求 | #161 | 起始 12-01、截止 11-01，点“应用” | `trade-orders-filter-range-error-*` |
| 删除 `styles.css`（D-7）、分片权重守卫（CI-01）、回顾行动项入模板（PROC-03）、文档（#160） | #159、#157、#156、#160 | 无界面变化，不演示 | — |

文件名后缀 `*` = `zh-red-1440`、`zh-red-390`、`en-green-1440`、`en-green-390`（教学模式均开启）。脚本内还断言并记录了：无筛选时请求只带 `company` 与 `limit`；每次“应用 / 清除”发出的 `party`、`side`、`from`、`to` 参数；日期错误时没有发出请求；伙伴格式无效的就地提示未演示（见 §5）。

## 2. 流程图

订单页筛选流程见 [docs/flows/trade-order-flow.md](../../flows/trade-order-flow.md) 的筛选细节图。

## 3. 演示脚本（口述顺序）

预置 4 张虚构订单（采购单用商品 EXPENSE，销售单用服务类商品 SERVICE，由 `seed-orders.mjs` 按现有契约建立，收入科目 4000）：`PO-F1` 采购 PARTY（10-05）、`PO-F2` 采购 PARTY2（11-05）、`SO-F3` 销售 PARTY（11-12）、`SO-F4` 销售 PARTY2（12-03）。

1. 打开“采购 / 销售订单”：筛选栏在列表上方，列表显示 4 张订单。
2. 伙伴填 PARTY，方向选“销售”，起始 11-01、截止 11-30，点“应用”：只剩 `SO-F3`。
3. 点“清除”：控件清空，4 张订单回来。
4. 伙伴填 PARTY2，方向选“销售”，截止 10-31，点“应用”：显示“没有符合条件的订单。”（不是“本公司还没有订单。”）。
5. 点“清除”，起始填 12-01、截止填 11-01，点“应用”：提示“起始日期不能晚于截止日期。”，列表不变，没有发出请求。

## 4. 复跑（同一个 PowerShell 终端，从仓库根目录执行）

`run-main.ps1` 是一个 `. { ... try { ... } finally { ... } }` 块：开头清空 `$server/$demo/$db/$port`；启动前检查端口 4199 空闲；就绪后校验监听进程 == 本轮启动的 pid；seed 之后做账套就绪清单（伙伴 PARTY、PARTY2 与 4 张订单都在，缺少就中止），并再次校验端口归属，才开始 capture；`finally` 只停本轮 `$server`、只删本轮创建的 `erp-demo-*` 目录，并报告端口是否释放。财年取当前年份，订单日期随之变化。端口 4199 若被占用，脚本直接 `throw`，换端口后再跑；不要用 4173。

```powershell
. {
  $ErrorActionPreference = "Stop"
  $shots = Join-Path $env:TEMP "demo-s7-shots"
  if (Test-Path $shots) { Remove-Item -Recurse -Force $shots }   # 清掉旧输出，失败时不会复制到上一轮的截图
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "构建失败，退出码 $LASTEXITCODE" }
  & .\docs\demo\v0.7.0\scripts\run-main.ps1        # 主账套：订单筛选，16 张截图
  $n = @(Get-ChildItem $shots -Filter *.png).Count
  if ($n -ne 16) { throw "截图数 $n，不是 16，不复制" }
  Copy-Item "$shots\*" docs\demo\v0.7.0\screenshots\
}
```

任一步骤（构建、seed、就绪清单、capture 非零退出、端口归属不符、截图数不对）都会 `throw` 中止整块，后面的复制不会执行。

输出在 `$env:TEMP\demo-s7-shots`（16 张 PNG + `capture-log-main.json`），提交前复制到 `screenshots/`。`screenshots/.gitkeep` 是替身检查用来证明“真实目录没被碰”的哨兵文件，别删。

无浏览器替身检查（不启动 Chrome / Playwright / Vitest，可随时跑）：

```powershell
powershell -NoProfile -File docs\demo\v0.7.0\scripts\stub-check.ps1
```

脚本入口：[run-main.ps1](scripts/run-main.ps1)、[capture.mjs](scripts/capture.mjs)、[seed-orders.mjs](scripts/seed-orders.mjs)、[stub-check.ps1](scripts/stub-check.ps1)、[seed-orders-stub.mjs](scripts/seed-orders-stub.mjs)（对假 HTTP 服务跑 seed-orders）；账套准备与主数据 seed 复用 v0.4.0 的 `prepare.mjs`、`seed-trade.mjs`。

## 5. 范围与限制（未演示的内容）

- 伙伴代码格式无效（“值或格式无效。”）的就地提示未演示；需要在前端输入非法字符，本 Demo 只演示日期区间错误。
- “加载更多”需要超过 100 条订单，筛选与分页的叠加未演示。
- 筛选条件不记忆（切换页面后重置）仅对照代码与 #161 的说明，未在 Demo 中切换页面验证。
- 读取失败（错误 + 重试）分支需要制造服务端失败，未演示。
- 迁移 017 `trade_orders_party` 只通过“新账套迁移后能筛选”间接体现，没有单独演示旧账套的升级。
- 日志与独占时段记录见 [run-through.md](run-through.md)。
