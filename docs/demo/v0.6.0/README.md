# v0.6.0 Demo

运行对象：RC 提交 `4f27906`（PR #149 head）的产品代码（与 main `0f74db9` 的产品代码相同，RC 只含文档）。演示账套是临时目录里的虚构账套，端口 4198；未连接 4173，未碰真实旧账或 `.bak`。

## 1. S6 用户可见变化与演示点

| 变化 | PR | 演示 | 截图 |
|---|---|---|---|
| 订单页新增“订单列表”，保存后刷新，点订单号查看详情 | #132 | 空列表 → 保存 → 列表出现新订单 → 点订单号 | `trade-orders-saved-list-*`、`trade-orders-open-from-list-*` |
| 保存前“预览”（服务端计算，不保存、不占号） | #138 | 填单 → 点预览 → 金额预览区 | `trade-orders-preview-*` |
| 迁移核对页窄屏换行 | #148 | 390 宽打开迁移核对页 | `migration-*` |
| 标签页 SVG 图标，无 `/favicon.ico` 404 | #136 | 只做页面级核对（见 §3），无截图 | `capture-log-main.json` 的 `home-icon` |

文件名后缀 `*` = `zh-red-1440`、`zh-red-390`、`en-green-1440`、`en-green-390`（教学模式均开启）。

## 2. 流程图

订单页界面流程见 [docs/flows/trade-order-flow.md](../../flows/trade-order-flow.md)。

## 3. 演示脚本（口述顺序）

1. 打开“采购 / 销售订单”：订单列表为空，显示“本公司还没有订单。”
2. 填订单号、伙伴、商品、税码、数量、单价，点“预览”：出现“金额预览”区（净额 100.00、税额 13.00、价税合计 113.00），标注“预览”，此时列表仍为空（预览不保存）。
3. 点“保存订单”：出现保存提示，预览区消失，列表出现新订单。
4. 点列表里的订单号：查询框填入该号，显示只读详情。
5. 打开“迁移核对”，窄屏（390）下查看键值表：不再在单词中间断行。

## 4. 复跑（同一个 PowerShell 终端，从仓库根目录执行）

两个脚本都是一个 `. { ... try { ... } finally { ... } }` 块：开头清空 `$server/$demo/$db/$port`；启动前检查端口 4198 空闲；就绪后校验监听进程 == 本轮启动的 pid，之后才写入（seed、capture）；`finally` 只停本轮 `$server`、只删本轮创建的 `erp-demo-*` 目录，并报告端口是否释放。端口 4198 若被占用，脚本直接 `throw`，换端口后再跑；不要用 4173。

```powershell
$shots = Join-Path $env:TEMP "demo-s6-shots"
npm run build
if ($LASTEXITCODE -ne 0) { throw "构建失败，退出码 $LASTEXITCODE" }
& .\docs\demo\v0.6.0\scripts\run-main.ps1        # 主账套：订单预览 / 保存 / 列表，12 张截图
& .\docs\demo\v0.6.0\scripts\run-migration.ps1   # 迁移账套：迁移核对页，4 张截图
Copy-Item "$shots\*" docs\demo\v0.6.0\screenshots\
```

输出在 `$env:TEMP\demo-s6-shots`（16 张 PNG + 2 个 `capture-log-*.json`），提交前复制到 `screenshots/`。脚本里的 `$shots` 在脚本内部重新定义，与上面的变量值相同。

脚本入口：[run-main.ps1](scripts/run-main.ps1)、[run-migration.ps1](scripts/run-migration.ps1)、[capture.mjs](scripts/capture.mjs)、[migration-setup.mjs](scripts/migration-setup.mjs)；seed 与预置复用 v0.4.0 的 `prepare.mjs`、`seed-trade.mjs`。

## 5. 范围与限制（未演示的内容）

- “加载更多”需要超过 100 条订单，未演示。
- 业务事件“待转队列”操作列（#133）和保存失败后的焦点（#135）需要预置队列或制造 409，未演示。
- 预览失败的表现（网络失败）未在本 Demo 触发。
- 标签页图标在浏览器外框，页面截图无法拍到；只核对了 `<link rel="icon">` 指向 `/favicon.svg`（200，`image/svg+xml`），且首页加载无 ≥400 响应。
- 迁移页：390 宽下页面无横向溢出，en 下有 2 个键值表容器内部可横向滚动（见日志）；未做 S5 之前的前后对比截图，数值对比以 #148 正文为准。
- 日志与独占时段记录见 [run-through.md](run-through.md)。
