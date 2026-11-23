# Demo v0.16.0（S17：订单/发票列表“刷新列表”、调整页、390 px 记录）

**状态：真实时段已运行（2026-11-23，R3，端口 4203，退出码 0），8 张截图在 `screenshots/`。** 演练记录见 [`run-through.md`](run-through.md)。按 `design/tasks/S17.md` 的 DEMO-17 验收。临时演示账套 `erp-demo-<guid>`，端口 4203（不是 4173），不碰真实旧账、`.bak` 或本地主检出。

## 1 计划拍摄（共 8 张，另有 2 条无截图的行为记录）

| 名称 | 页面（路由） | 宽度 / 语言 / 主题 | 证明什么 |
| --- | --- | --- | --- |
| `trade-orders-list-zh-red-1440`、`-en-green-1440` | 订单页（`#/trade-orders`）筛选条 | 1440 | TLIST-01：按钮条有“应用 / 清除 / 刷新列表”三个按钮 |
| `trade-invoices-list-zh-red-1440`、`-en-green-1440` | 发票页（`#/trade-invoices`）筛选条 | 1440 | 同上 |
| `trade-adjustments-cancel-zh-red-1440`、`-en-green-1440` | 调整页（`#/trade-adjustments`），类型选“专用取消单据 / Cancel document” | 1440 | REFAC-07：拆分后调整页与取消动作正常渲染 |
| `trade-orders-list-zh-red-390`、`trade-invoices-list-zh-red-390` | 订单页、发票页 | 390，zh-red | K7：390 px 下三个按钮都在视口内，页面不横向溢出 |

行为记录（无截图，写入 `capture-log-main.json`）：选方向 AR 并应用；在“往来方”输入框键入 `ZZZ` 但不应用；点“刷新列表”。断言：输入框仍是 `ZZZ`、地址栏 hash 不变、请求带 `side=AR` 且不带 `party`、历史记录长度不变。订单页和发票页各一条。

## 2 口径

- 断言是内容断言（按钮文字、数量、请求参数），失败即中止；390 px 的溢出检查（页面 `scrollWidth ≤ 390`，每个按钮 `left ≥ 0` 且 `right ≤ 390`）只记录（D440 / D441）。
- 体积数字只引用 #275 的测量（trade-adjustments 路由 route-added JS，gzip-9，11774 → 12531 B，+757 B，D476 预算 +900 B，来源：[#275 评论](https://github.com/lingshf/ai-native-erp/pull/275#issuecomment-7113487980)）；#271、#270 没有体积测量；Demo 本身不重新测量（D454）。
- 每页每语言每宽度一个新 browser context（D457）。
- 脚本：`scripts/capture.mjs`、`run-main.ps1`、`steps-demo17.ps1`；造数复用 v0.4.0 的 `prepare.mjs`、`seed-trade.mjs`，v0.10.0 的 `seed-invoicing.mjs`、`seed-sales.mjs`，v0.14.0 的 `seed-credit.mjs`。Demo 证据脚本，按 D446 例外，不属于产品与 CI 代码。
- 运行序列（TEMPLATE 第 17 条）：两个 worktree 的 `npm ci` 在安静时段开始前完成；时段内各一次、不重试：`npm run build`（应用 worktree）→ capture 干跑 → `run-main.ps1 -SkipCapture` → `slot-run.ps1 -Ports 4203`（R3）。

## 3 真实运行结果

- 序列（D484 授权，各一次、不重试）：两个全新 worktree（app 在 PR 头，tooling 在 main `26b16b0`）的 `npm ci` 在窗口前完成 → `npm run build`（退出码 0）→ capture 干跑（`run-main.ps1`，含 capture，退出码 0，8 张）→ `run-main.ps1 -SkipCapture`（退出码 0）→ 真实 `slot-run.ps1 -Ports 4203`（R3，退出码 0）。
- `runner start head=6b3313573a4d583fed9cab9804ced4032af3a179`（`status=[]`，即 #277 当时的头）；`tooling head=26b16b089e77cbe558015e89d62dcb0c70154747`（main，含 R3 / SR-X6）。产品代码与 main 一致：`git diff --name-only 35df068 origin/main -- packages scripts` 为空。
- 预检共 13 次采样，前面有 counted=6、19、4 的波动，最后连续 6 次 `counted=0` 后才进入步骤（`ports free phase=before-steps`）；`step demo-capture exit=0 counted-after=0`；端口 4203 事后无监听。日志：[`logs/slot-summary-real.log`](logs/slot-summary-real.log)、[`logs/processes-real.tsv`](logs/processes-real.tsv)、[`logs/demo-capture-real.out.log`](logs/demo-capture-real.out.log)。干跑与 `-SkipCapture` 的输出：[`logs/capture-dry-run.out.log`](logs/capture-dry-run.out.log)、[`logs/skipcapture.out.log`](logs/skipcapture.out.log)。
- SR-X6 行（[`logs/sr-x6-lines-real.tsv`](logs/sr-x6-lines-real.tsv)）：3 条，逐字抄录采样器的 reason：`no repository evidence in process or 4 / 5 / 6 ancestor(s)`，分别是 pid 70876 `node.exe`（`npm run check:boundaries`）、pid 4864 `cmd.exe`、pid 24068 `node.exe`（`node scripts/check-boundaries.mjs`），三者的 `cwd=unreadable`，不计数，已完整记录。
- 内容断言全部通过：筛选条按钮文字与类型在订单页、发票页的中英文下都是 应用 / 清除 / 刷新列表（Apply / Clear / Refresh list），类型 submit / button / button；调整页标题正确，“专用取消单据 / Cancel document”可选，可选未结项 8 个。
- **刷新行为记录**（`capture-log-real.json` 的两条 `refresh`）：订单页与发票页都是：应用 AR 后 hash 带 `side=AR`；伙伴框输入 `ZZZ` 不应用后点“刷新列表”；输入框仍是 `ZZZ`，side 仍是 AR，hash 不变，请求查询为 `company=DEFAULT&limit=100&side=AR`（没有 party），历史长度 2 → 2。
- **390 px 记录**（zh-red，订单页、发票页相同；证据：[`logs/capture-log-real.json`](logs/capture-log-real.json) 中 `step` 为 `k7-390` 的两条）：`document.documentElement.scrollWidth` = **390**（≤ 390）；三个按钮同在一行，左右边界 应用 124–186、清除 194–256、刷新列表 264–354，都在 0–390 内。**没有换行**。英文 390 宽没有拍。1440 下页面无横向溢出，无页面错误。
- 不进截图的内容：地址栏 hash、请求查询、历史长度只在上面的 JSON 记录里，没有截图。

| 截图 | 内容 |
| --- | --- |
| [`trade-orders-list-zh-red-1440.png`](screenshots/trade-orders-list-zh-red-1440.png) | 订单页筛选条，中文、专业红 |
| [`trade-orders-list-en-green-1440.png`](screenshots/trade-orders-list-en-green-1440.png) | 订单页筛选条，English、绿色 |
| [`trade-invoices-list-zh-red-1440.png`](screenshots/trade-invoices-list-zh-red-1440.png) | 发票页筛选条，中文、专业红 |
| [`trade-invoices-list-en-green-1440.png`](screenshots/trade-invoices-list-en-green-1440.png) | 发票页筛选条，English、绿色 |
| [`trade-adjustments-cancel-zh-red-1440.png`](screenshots/trade-adjustments-cancel-zh-red-1440.png) | 调整页，专用取消单据，中文 |
| [`trade-adjustments-cancel-en-green-1440.png`](screenshots/trade-adjustments-cancel-en-green-1440.png) | 调整页，Cancel document，English |
| [`trade-orders-list-zh-red-390.png`](screenshots/trade-orders-list-zh-red-390.png) | 订单页，390 px |
| [`trade-invoices-list-zh-red-390.png`](screenshots/trade-invoices-list-zh-red-390.png) | 发票页，390 px |
