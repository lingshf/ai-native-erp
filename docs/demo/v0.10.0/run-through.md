# v0.10.0 Demo 执行记录

状态：无浏览器部分与真实服务演练、真实 Chrome 取图（D330 时段，一次连续跑）均已完成，24 张截图与 `capture-log-main.json` 已入库（见 §5）。基线 main `c0189c7`（`packages/` 同 `108684d`）。

## 1. 已执行（无浏览器、无真实服务、无 build；2026-11-22 01:30 前后，PowerShell 5.1 / Node，退出码均为 0）

| 命令 | 结果 | 退出码 |
|---|---|---|
| `powershell -NoProfile -File docs\demo\v0.10.0\scripts\stub-check.ps1` | 场景 1（采购成功，22 请求）、1b（销售成功，31 请求 = 22 + SERVICE 商品 1 + 销售订单 2 + AR 发票预览与过账 4 + 开票查询 2）、1c（seed-sales 去掉 SERVICE 商品创建：销售订单被拒 `reference`，其后无请求）、1d（销售单商品改为 EXPENSE：被拒 `product`，其后无请求）、2（超量开票 400）、3（缺主数据）、4（缺税码）、5（缺参数退出 2）全部通过；真实截图目录未变（1 个文件） | 0 |
| `powershell -NoProfile -File docs\demo\v0.10.0\scripts\proc05-negatives.ps1` | 第 1a、1b、2、3、4、5 项都按预期失败或被拦住；真实截图目录未变 | 0 |
| `powershell -NoProfile -File docs\demo\v0.10.0\scripts\orchestration-stub.ps1` | A1 对照走完（seed-trade、seed-invoicing、seed-sales 都执行，端口释放）；A2 在 seed-invoicing 之前中止（`owner mismatch before seed-invoicing`）；A3 去掉该处 PID 比较后放行；**A4（新）**seed-invoicing 之后监听换成 B，在 seed-sales 之前中止（`owner mismatch before seed-sales`），seed-sales 未执行；**A5（新）**去掉该处 PID 比较后 seed-sales 被执行；README 渲染后按内容取出真实服务演练块（第 4 块）与取图块（第 6 块，共 6 块），B3、B6 在沙箱实际执行通过（B6 复制 24 张）；B6 负例两个（dist 缺筛选条文案、dist 时间等于 HEAD）均中止且不调用 run-main、不复制截图；端口 4201 已空闲，真实截图目录未变 | 0 |

相对 v0.9.0 的脚本改动：新增 `seed-sales.mjs`（SERVICE 商品、SO-I1、SO-I2、AR-I1-1、AR-I2-1，序列校验开票数量）；`run-main.ps1` 在 seed-invoicing 之后、seed-sales 之前加监听归属校验，readiness 增加 SO-I1、SO-I2、AR 订单与 AR 发票、4 张带来源订单的发票；`capture.mjs` 重写为 S10 的 6 类截图，并按 TEMPLATE 加入 390 宽 `scrollWidth <= innerWidth` 断言；替身与编排替身随之扩展；截图数 16 → 24；shots 目录名 `demo-s10-shots-*`。

## 2. 披露

- 真实服务演练、build、真实 Chrome 取图已在 D330 时段一次跑完（见 §5），无失败、无重跑。
- §3 各行的“工具判定复核”为“无”（取图未中止、其后产品代码未改）；各断言以 §5 的取图结果为准：脚本 24 张全部通过各断言，`capture-log-main.json` 的 `errors` 为空，所有 `overflowPx` 为 0。
- `capture.mjs` 没有替身页面路径，断言先对照源码逐条核对（§3），再由真实 Chrome 实跑验证；筛选时序、`selectOption("AR")` 次序与 390 宽下“应用”按钮可点，均在实跑中通过。
- 记账日期起止与两种输入错误提示、“加载更多”保持筛选：不在本 Demo 范围，见 README §5。

## 3. capture.mjs 断言逐条核对（对照 main c0189c7）

| 断言 | 组件 file:line | 装饰 / aria-hidden | 默认值 | 翻译键 | schema 字段 | seed 来源 | 工具判定复核 |
|---|---|---|---|---|---|---|---|
| 订单列表 5 行，SO-I1 `i部分开票`（class `badge info`）、SO-I2 `✓已开完`（`badge success`），采购三行同 v0.9.0 | `TradeOrders.tsx:1013`（表）、`:1044`（`td.tord-invoicing`） | Badge 符号在 `aria-hidden` 内（`ui/components/index.tsx`），textContent 为符号 + 文字，断言同时取符号 | 无筛选时列出全部订单 | `tord.invoicing.none/partial/full`（`trade-order-labels.ts:84–93`、`:187–196`） | 订单列表项 `invoicing`：none / partial / full | `seed-invoicing.mjs`（PO-I1..3）、`seed-sales.mjs`（SO-I1 开 L1 的 4、SO-I2 开满） | 替身 1b 校验开票数量与 side AR / party PARTY2；徽章与 class 无（取图未中止，产品代码未改；结果见 §5） |
| 深链接 SO-I1 行 L1 10/4/6、L2 4/0/4 | `TradeOrders.tsx:1205`（`.tord-lookup-result`）、`:1306`（`table.tord-amounts`） | 已开票列的 `✓` 前缀在比较前去掉 | 深链接直接打开只读详情 | `tord.*`（沿用 v0.9.0） | 开票接口 `invoiced[].invoicedQuantity` | `seed-sales.mjs` SO-I1：L1 10 单价 30、L2 4 单价 50，AR-I1-1 开 L1 的 4 个 | 替身 1b 校验已开票数量 SO-I1/L1 = 4、L2 未开；页面渲染无（取图未中止，产品代码未改；结果见 §5） |
| 发票列表 6 行（外部号排序）：AP-DEMO、AP-DEMO2 无来源；AP-I1-1→PO-I1、AP-I2-1→PO-I2；AR-I1-1→SO-I1、AR-I2-1→SO-I2；方向列 `应付/应收`（en `Accounts payable/receivable`），伙伴列 | `TradeInvoices.tsx:1145`（列）、`:1269`（方向 `trade.${side}`）、`:1032`（`SourceOrderCell`） | 无 `aria-hidden` 装饰；来源单元格的链接 `title` 为订单号 | 未筛选：全部发票 | `trade.AP/AR`（`trade-labels.ts:111–112`、`:351–352`）、`tinv.sourceOrder` | 发票列表项 `side`、`party`、`externalNo`、`orderId` | seed-trade（AP-DEMO PARTY、AP-DEMO2 PARTY2）、seed-invoicing、seed-sales；方向与伙伴取自各脚本的命令体 | 替身 1b 的请求日志校验 AR 发票 party / orderId；列文字无（取图未中止，产品代码未改；结果见 §5） |
| 点 SO-I1 链接进入销售单深链接，行同上 | `TradeInvoices.tsx:1032`（链接）；`TradeOrders.tsx:1205` | — | — | — | `orderId` | 同上 | 真实点击后断言实际 hash 为 `#/trade-orders?company=DEFAULT&order=SO-I1` 与订单行，再从点击后的页面截 `order-from-invoice-ar-*`（D331 起，替换 D330 的直接打开地址图；D332 重取已验证，见 §5.2）；工具判定复核：无（D332 重取未中止，产品代码未改） |
| 筛选条存在：`form[role=search]`，`#tinv-filter-party/-side/-from/-to`，提交按钮与“清除”按钮 | `TradeInvoices.tsx:1163`（`role="search"`）、`:1171`、`:1187`、`:1199`、`:1209`、`:1222`、`:1225` | 标签与控件一对一（`label[for]`） | 草稿与已应用均为空 | `tinv.filter.*`（`trade-labels.ts:201–214`、`:434–447`） | 请求参数 `party`、`side`、`from`、`to`（可选） | 无（页面控件） | 无替身；无（取图未中止，产品代码未改；结果见 §5） |
| 伙伴 `PARTY2` + 应用 → 3 行：AP-DEMO2、AR-I1-1、AR-I2-1（混合方向） | `TradeInvoices.tsx:1114`（`apply`）、`:1090–1102`（请求带 `party`） | — | 伙伴为空 = 不筛 | `tinv.filter.party` | `party` 精确匹配伙伴代码 | AP-DEMO2 的伙伴 PARTY2（seed-trade）；AR 发票伙伴 PARTY2（seed-sales） | 期望集合由 seed 脚本的 party 参数推出；服务端按 party 过滤由 #189 的测试覆盖，本 Demo 只在真实 Chrome 里观察；无（取图未中止，产品代码未改；结果见 §5） |
| 清除 → 回到 6 行，伙伴与方向输入为空 | `TradeInvoices.tsx:1124`（`clear`） | — | 清除后草稿 = 已应用 = 空 | `tinv.filter.clear` | — | — | 无（取图未中止，产品代码未改；结果见 §5） |
| 方向 `AR` + 应用 → 2 行：AR-I1-1、AR-I2-1 | `TradeInvoices.tsx:1187`（select 选项 `""` / `AP` / `AR`） | — | 方向为空 = 全部 | `tinv.filter.side/all/ap/ar` | `side` | 同上 | 无（取图未中止，产品代码未改；结果见 §5） |
| 伙伴 `PARTY` + 方向 `AR` → 无数据行，`p.empty-state` 为“没有符合条件的发票。” / `No invoices match the filters.` | `TradeInvoices.tsx:1288`（有已应用筛选时用 `tinv.filter.none`） | 无 | 无筛选的空态是 `tinv.empty`（本演示没有空账套，不断言） | `tinv.filter.none`（`trade-labels.ts:214`、`:447`） | 空列表 | PARTY 只有采购发票，方向 AR 求交为空（seed-trade / seed-invoicing 的伙伴 PARTY） | 无（取图未中止，产品代码未改；结果见 §5） |
| 筛选前后 `location.hash` 不变、无 `dialog` 事件 | `TradeInvoices.tsx:1077–1078`（筛选只在组件状态里） | — | — | — | — | — | 无（取图未中止，产品代码未改；结果见 §5） |
| 每张截图：语言 / 主题 / 宽度 / 教学开关 / `scrollY` 与文件名一致；390 宽 `scrollWidth <= innerWidth` | 脚本 `assertState`（按 TEMPLATE） | — | 教学模式开启（localStorage `erp.workspace.preferences.v1`） | — | — | — | 无（取图未中止，产品代码未改；结果见 §5）；截断类判定：本脚本没有截断类断言，容差公式不适用 |

## 4. 已知的预期控制台错误

本版 capture 不访问不存在的订单，预期没有 404；取图后逐条核对 `capture-log-main.json` 的 `errors`，出现任何控制台错误或 `overflowPx > 0`，按缺陷报告。

## 5. 独占时段记录

区分：§3 是时段前对照源码的核对（预期），本节是时段里实际跑出的结果（已验证）。

### 5.1 D330 首次取图（已验证）

取证完整 SHA：脚本提交 `9fdb98fdcf2ff0ce53b8ad45acf8f4f3d92d4868`（运行时工作树 head；产品代码同 `c0189c7`）。评审绑定 head `cf00c5dedfd5303ba84b79674859573247b274a2`（截图入库提交），[verify run 45008377010](https://github.com/lingshf/ai-native-erp/actions/runs/45008377010)。

D330 批准，2026-11-22 01:33:50 至 01:35:58（-08:00），约 2 分 08 秒，一次连续跑，未重跑。`ERP_E2E_BROWSER_CHANNEL=chrome`，端口 4201，基线 head `9fdb98f`（脚本提交）上的 `c0189c7` 产品代码。

| 步骤 | 结果 |
|---|---|
| 预检（6 次采样、间隔 10 秒） | 外部进程数均为 0 |
| 1) 真实服务演练 `run-main.ps1 -SkipCapture` | 通过：5 张订单、6 张发票的 readiness 均 ok（3 张采购单 none/partial/full + 2 张销售单 partial/full，4 张带来源订单的发票）；`seed-invoicing ok`、`seed-sales ok` |
| 2) `npm run build` 与 dist 断言 | 通过：dist 晚于 HEAD 提交时间，含 “Accounting date from”“No invoices match the filters” |
| 3) `run-main.ps1`（取图） | `shots 24`，`capture exit 0`，`port 4201 released`，复制 24 张 |

结果核对：24 张 PNG（6 类 × 4 组合：zh-red-1440、zh-red-390、en-green-1440、en-green-390）；`capture-log-main.json` 中 24 项 `overflowPx` 均为 0，4 个组合的 `errors` 均为 `[]`；390 宽 `scrollWidth` 均为 390。无断言失败，所以没有保留的失败现场；成功后临时 shots 目录已删除。

时段后残留：无本轮启动的 chrome/node 进程；端口 4201 无监听。系统中仍有 6 个 node 进程（启动于 11/15、11/20、11/21，早于本时段，不是本轮启动，未触碰）。日志在本机临时目录（`s10-slot-20261122-013350-12968f`：`preflight.log`、`rehearsal.log`、`build.log`、`capture-block.log`、`all.log`）。

### 5.2 D331 重取（详情图改为点击来源链接后截图）

取证完整 SHA：脚本提交 `587a4cc0a5b4f9adb37d0afef3ceffed75d1815c`（运行时工作树 head；产品代码同 `c0189c7`），其 [verify run 45008826269](https://github.com/lingshf/ai-native-erp/actions/runs/45008826269) 通过。

无浏览器替身准备（时段前，已验证）：orchestration-stub B7 在 Windows PowerShell 5.1 下实跑 README 取图块，成功、原生 stderr 后仍有 stdout 并以退出码 3 失败（日志记 `exit=3`）、runner 抛错三条路径均通过。

D332 批准，2026-11-22 01:43:47 至 01:45:33（-08:00），约 1 分 46 秒，一次连续跑，未重跑。`ERP_E2E_BROWSER_CHANNEL=chrome`，端口 4201，PowerShell 7.6（README 取图块原文执行，从 README 取出）。预检 6 次外部进程均为 0；按 README §4 取图块：build、dist 断言、`run-main.ps1`（seed-trade、seed-invoicing、seed-sales、readiness ok、capture）通过，`shots 24`，`capture exit 0`，`exit=0 ok=True`，端口 4201 已释放；shots 目录已清；日志 `$shots.run.log` 的内容在时段里完整输出到控制台并据此核对，之后该临时日志文件已被我删除，不再保留。本次没有重跑演练（D332 只批 1)–2)）。

结果：24 张全部重取并入库；删除 4 张 `order-deeplink-ar-*`，新增 4 张 `order-from-invoice-ar-*`（zh-red / en-green × 1440 / 390）。`capture-log-main.json` 里 4 条 `order-from-invoice-ar` 记录的实际 hash 均为 `#/trade-orders?company=DEFAULT&order=SO-I1`，`via` 为 `click td.tinv-source a[title=SO-I1]`；24 项 `overflowPx` 均为 0，4 个组合 `errors` 均为 `[]`。§3 “工具判定复核”为“无”（未中止，产品代码未改）。

残留：无本轮 chrome / node；系统另有 6 个更早启动的 node（11/15、11/20、11/21），未触碰。
