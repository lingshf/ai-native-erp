# Demo v0.14.0（S15：贷项冲减已开票数量、凭证页按钮、发票页拆分后的外观）

**状态：真实时段已跑 1 次并成功（2026-11-23，D473 / D478），12 张截图在 [`screenshots/`](screenshots/)。** 演练记录见 [`run-through.md`](run-through.md)。按 `design/tasks/S15.md` 的 DEMO-15 验收。运行环境：临时演示账套 `erp-demo-<guid>`，端口 **4203**（不是 4173），不连接真实账套、`.bak`、用户主检出。

## 1 计划拍摄（6 组 × zh-red / en-green，1440 宽，教学说明开，共 12 张）

| 名称 | 页面（路由） | 证明什么 |
| --- | --- | --- |
| `trade-orders-*` | 订单列表（`#/trade-orders`） | PO-C1 的开票状态是“部分开票 / Partly invoiced”（TINV-09） |
| `trade-orders-detail-*` | 点订单号 PO-C1 后的订单详情 | L1 数量 10、已开票 6、未开票 4 |
| `journals-*` | 凭证（`#/journals`） | 工具栏是“刷新列表 / Refresh list”，没有“重试 / Retry”（JV-FIX-01 J1） |
| `trade-invoices-*` | 采购与销售发票 | REFAC-06b / 06c 之后仍正常渲染 |
| `period-close-*` | 期末结账 | 同上 |
| `trade-reports-*` | 往来未结项与账龄 | 同上 |

PO-C1 的造数（`scripts/seed-credit.mjs`，在 v0.4.0 / v0.10.0 seed 之后运行）：订单 L1 订购 10 × 10；开票 10（已开完，对照态）；对该发票 L1 贷项 4 → 已开票 6、未开票 4。v0.13.1 及更早贷项不改订单状态，此时仍显示“已开完”；v0.14.0 显示“部分开票”。

## 2 口径

- 订单页与凭证页的断言是**内容断言**（具体文字和数字），截图拍错即中止；发票、期末结账、往来页只证明“能正常渲染”，不证明逐像素不变（没有 v0.13.1 的对比图）。溢出、页面错误、发票页间距只记录（D440 / D441、TEMPLATE 第 14、15 条）。
- D457：每页每语言一个新 browser context；先做桩演练（已做）。
- 脚本：`scripts/seed-credit.mjs`、`capture.mjs`、`run-main.ps1`、`steps-demo15.ps1`。Demo 证据脚本，按 D446 例外，不属于产品与 CI 代码。
- 运行：标准 `scripts/slot/slot-run.ps1 -OutDir <仓库外目录> -StepsFile docs\demo\v0.14.0\scripts\steps-demo15.ps1`，不跳预检；手动 1 次，不重试（D444）；连续 6 次采样为 0 才开始（D308）。

## 3 真实运行结果（2026-11-23，D473 / D478）

- 被测应用：`release/v0.14.0` + #264 的 docs 提交，`runner start head=fa037411c1989b3993187094ef2ef6f79ff185af`；`git diff --name-only 072a575 HEAD -- packages` 为空（0 行），被测代码与 RC `072a575` 相同。
- 时段工具：SLOT-03 #266 批准 head，`tooling head=33d5068e94f2fed8da2008afe628180301b379f6`（规则 R3，不合并）；`git merge-base --is-ancestor 33d5068 fa03741` 退出码 1。
- 调用：在应用 worktree 中 `pwsh -File <工具 worktree>\scripts\slot\slot-run.ps1 -OutDir <仓库外目录> -StepsFile docs\demo\v0.14.0\scripts\steps-demo15.ps1 -Ports 4203`；手动 1 次，无重试；退出码 0。
- 预检：head 预检 exit=0（new-keys=0、reduced-keys=0）；进程预检第 6 次起连续 6 次 counted=0（19:42:59Z），19:42:59Z–19:43:55Z 步骤运行，`step demo-capture exit=0 counted-after=0`，没有 ABORT。端口 4203 用后释放。
- 结果：12 张截图（6 组 × zh-red / en-green，1440 宽）；26 项检查全部通过：每页无横向溢出、无页面错误，发票页卡片标题到第一个标签 16 px（只记录）。内容断言：PO-C1 开票状态“部分开票 / Partly invoiced”，L1 数量 10 / 已开票 6 / 未开票 4；凭证页“刷新列表”1 个、“重试”0 个。
- SR-X6 日志：时段内 4 个归属不明的 `node.exe`（命令行读不到、无 D411 记录）被记为 SR-X6，不计数，见 `logs/sr-x6-lines-real.tsv`；外部 `chrome-headless-shell`（`dc-layer-check*`、`debate-coach`）为 SR-X1，msedge 为 SR-X2。
- 口径不变（§2）：发票、期末结账、往来页只证明页面正常渲染，不证明逐像素不变。被测应用不含 TORD-08，订单详情没有“贷项冲回数量”列（它属于 v0.15.0）。

## 4 偏差

- D457 的两项均已满足：时段前做过桩演练；每页每语言一个新 browser context。
- `slot-summary-real.log` 是未删减的原始日志（含 `excluded` 行）；`logs/` 下的文件为 OutDir 原件的拷贝，截图与 OutDir 原件的 SHA-256 一致（逐张核对）。
- 先前 D468 / D470 的三次真实时段（预检超时一次，取图中被外部进程中止两次）没有产出，记录见 `run-through.md` §7。