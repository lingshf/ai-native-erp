# Demo v0.16.0（S17：订单/发票列表“刷新列表”、调整页、390 px 记录）

**状态：真实时段尚未运行，`screenshots/` 暂无截图。** 本 RC 只做了 `-Stub` 演练（见 [`run-through.md`](run-through.md)）。按 `design/tasks/S17.md` 的 DEMO-17 验收；等协调者安排 D480 式安静时段后再做真实运行。临时演示账套 `erp-demo-<guid>`，端口 4203（不是 4173），不碰真实旧账、`.bak` 或本地主检出。

## 1 计划拍摄（共 8 张，另有 2 条无截图的行为记录）

| 名称 | 页面（路由） | 宽度 / 语言 / 主题 | 证明什么 |
| --- | --- | --- | --- |
| `trade-orders-filter-zh-red-1440`、`-en-green-1440` | 订单页（`#/trade-orders`）筛选条 | 1440 | TLIST-01：按钮条有“应用 / 清除 / 刷新列表”三个按钮 |
| `trade-invoices-filter-zh-red-1440`、`-en-green-1440` | 发票页（`#/trade-invoices`）筛选条 | 1440 | 同上 |
| `trade-adjustments-cancel-zh-red-1440`、`-en-green-1440` | 调整页（`#/trade-adjustments`），类型选“专用取消单据 / Cancel document” | 1440 | REFAC-07：拆分后调整页与取消动作正常渲染 |
| `trade-orders-390-zh-red`、`trade-invoices-390-zh-red` | 订单页、发票页 | 390，zh-red | K7：按钮条可换行，页面不横向溢出 |

行为记录（无截图，写入 `capture-log-main.json`）：选方向 AR 并应用；在“往来方”输入框键入 `ZZZ` 但不应用；点“刷新列表”。断言：输入框仍是 `ZZZ`、地址栏 hash 不变、请求带 `side=AR` 且不带 `party`、历史记录长度不变。订单页和发票页各一条。

## 2 口径

- 断言是内容断言（按钮文字、数量、请求参数），失败即中止；390 px 的溢出检查（页面 `scrollWidth ≤ 390`，每个按钮 `left ≥ 0` 且 `right ≤ 390`）只记录（D440 / D441）。
- 本次没有首屏体积数字：#271、#275、#270 的 PR 正文没有构建体积测量，Demo 也不重新测量（D454），所以文档中不写任何体积数字。
- 每页每语言每宽度一个新 browser context（D457）。
- 脚本：`scripts/capture.mjs`、`run-main.ps1`、`steps-demo17.ps1`；造数复用 v0.4.0 的 `prepare.mjs`、`seed-trade.mjs`，v0.10.0 的 `seed-invoicing.mjs`、`seed-sales.mjs`，v0.14.0 的 `seed-credit.mjs`。Demo 证据脚本，按 D446 例外，不属于产品与 CI 代码。
- 运行序列（TEMPLATE 第 17 条）：两个 worktree 的 `npm ci` 在安静时段开始前完成；时段内各一次、不重试：`npm run build`（应用 worktree）→ capture 干跑 → `run-main.ps1 -SkipCapture` → `slot-run.ps1 -Ports 4203`（R3）。

## 3 真实运行结果

尚未运行。待真实时段后补：`runner start head=`、`tooling head=`、SR-X6 行（逐字，含采样器输出的 reason）、8 张截图、行为记录和 390 px 数字。
