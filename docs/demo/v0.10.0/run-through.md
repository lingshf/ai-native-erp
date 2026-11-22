# v0.10.0 Demo 执行记录

状态：无浏览器部分已完成；**真实服务演练与真实 Chrome 取图尚未执行**，等待协调者批准独占时段。截图与 `capture-log-main.json` 入库后本文会更新。基线 main `c0189c7`（`packages/` 同 `108684d`）。

## 1. 已执行（无浏览器、无真实服务、无 build；2026-11-22 01:30 前后，PowerShell 5.1 / Node，退出码均为 0）

| 命令 | 结果 | 退出码 |
|---|---|---|
| `powershell -NoProfile -File docs\demo\v0.10.0\scripts\stub-check.ps1` | 场景 1（采购成功，22 请求）、1b（销售成功，31 请求 = 22 + SERVICE 商品 1 + 销售订单 2 + AR 发票预览与过账 4 + 开票查询 2）、1c（seed-sales 去掉 SERVICE 商品创建：销售订单被拒 `reference`，其后无请求）、1d（销售单商品改为 EXPENSE：被拒 `product`，其后无请求）、2（超量开票 400）、3（缺主数据）、4（缺税码）、5（缺参数退出 2）全部通过；真实截图目录未变（1 个文件） | 0 |
| `powershell -NoProfile -File docs\demo\v0.10.0\scripts\proc05-negatives.ps1` | 第 1a、1b、2、3、4、5 项都按预期失败或被拦住；真实截图目录未变 | 0 |
| `powershell -NoProfile -File docs\demo\v0.10.0\scripts\orchestration-stub.ps1` | A1 对照走完（seed-trade、seed-invoicing、seed-sales 都执行，端口释放）；A2 在 seed-invoicing 之前中止（`owner mismatch before seed-invoicing`）；A3 去掉该处 PID 比较后放行；**A4（新）**seed-invoicing 之后监听换成 B，在 seed-sales 之前中止（`owner mismatch before seed-sales`），seed-sales 未执行；**A5（新）**去掉该处 PID 比较后 seed-sales 被执行；README 渲染后按内容取出真实服务演练块（第 4 块）与取图块（第 6 块，共 6 块），B3、B6 在沙箱实际执行通过（B6 复制 24 张）；B6 负例两个（dist 缺筛选条文案、dist 时间等于 HEAD）均中止且不调用 run-main、不复制截图；端口 4201 已空闲，真实截图目录未变 | 0 |

相对 v0.9.0 的脚本改动：新增 `seed-sales.mjs`（SERVICE 商品、SO-I1、SO-I2、AR-I1-1、AR-I2-1，序列校验开票数量）；`run-main.ps1` 在 seed-invoicing 之后、seed-sales 之前加监听归属校验，readiness 增加 SO-I1、SO-I2、AR 订单与 AR 发票、4 张带来源订单的发票；`capture.mjs` 重写为 S10 的 6 类截图，并按 TEMPLATE 加入 390 宽 `scrollWidth <= innerWidth` 断言；替身与编排替身随之扩展；截图数 16 → 24；shots 目录名 `demo-s10-shots-*`。

## 2. 未实跑（诚实披露）

- 真实服务演练（`run-main.ps1 -SkipCapture`）、build、真实 Chrome 取图：未执行，等待独占时段批准；批准后只跑一次（D308）。
- `capture.mjs` 没有替身页面路径，断言先对照源码逐条核对（§3），再由真实 Chrome 实跑验证。核对时最可能在真实 Chrome 里出问题的是：筛选后表格行的异步刷新时序（脚本用 poll 等待）、`selectOption("AR")` 后点“应用”的次序、390 宽下筛选条换行后“应用”按钮可点。某条断言失败则按 D234 中止，不放宽语义断言，原断言原文与日志位置记入本文。
- 记账日期起止与两种输入错误提示、“加载更多”保持筛选：不在本 Demo 范围，见 README §5。

## 3. capture.mjs 断言逐条核对（对照 main c0189c7）

| 断言 | 组件 file:line | 装饰 / aria-hidden | 默认值 | 翻译键 | schema 字段 | seed 来源 | 工具判定复核 |
|---|---|---|---|---|---|---|---|
| 订单列表 5 行，SO-I1 `i部分开票`（class `badge info`）、SO-I2 `✓已开完`（`badge success`），采购三行同 v0.9.0 | `TradeOrders.tsx:1013`（表）、`:1044`（`td.tord-invoicing`） | Badge 符号在 `aria-hidden` 内（`ui/components/index.tsx`），textContent 为符号 + 文字，断言同时取符号 | 无筛选时列出全部订单 | `tord.invoicing.none/partial/full`（`trade-order-labels.ts:84–93`、`:187–196`） | 订单列表项 `invoicing`：none / partial / full | `seed-invoicing.mjs`（PO-I1..3）、`seed-sales.mjs`（SO-I1 开 L1 的 4、SO-I2 开满） | 替身 1b 校验开票数量与 side AR / party PARTY2；徽章与 class 待真实 Chrome |
| 深链接 SO-I1 行 L1 10/4/6、L2 4/0/4 | `TradeOrders.tsx:1205`（`.tord-lookup-result`）、`:1306`（`table.tord-amounts`） | 已开票列的 `✓` 前缀在比较前去掉 | 深链接直接打开只读详情 | `tord.*`（沿用 v0.9.0） | 开票接口 `invoiced[].invoicedQuantity` | `seed-sales.mjs` SO-I1：L1 10 单价 30、L2 4 单价 50，AR-I1-1 开 L1 的 4 个 | 替身 1b 校验已开票数量 SO-I1/L1 = 4、L2 未开；页面渲染待真实 Chrome |
| 发票列表 6 行（外部号排序）：AP-DEMO、AP-DEMO2 无来源；AP-I1-1→PO-I1、AP-I2-1→PO-I2；AR-I1-1→SO-I1、AR-I2-1→SO-I2；方向列 `应付/应收`（en `Accounts payable/receivable`），伙伴列 | `TradeInvoices.tsx:1145`（列）、`:1269`（方向 `trade.${side}`）、`:1032`（`SourceOrderCell`） | 无 `aria-hidden` 装饰；来源单元格的链接 `title` 为订单号 | 未筛选：全部发票 | `trade.AP/AR`（`trade-labels.ts:111–112`、`:351–352`）、`tinv.sourceOrder` | 发票列表项 `side`、`party`、`externalNo`、`orderId` | seed-trade（AP-DEMO PARTY、AP-DEMO2 PARTY2）、seed-invoicing、seed-sales；方向与伙伴取自各脚本的命令体 | 替身 1b 的请求日志校验 AR 发票 party / orderId；列文字待真实 Chrome |
| 点 SO-I1 链接进入销售单深链接，行同上 | `TradeInvoices.tsx:1032`（链接）；`TradeOrders.tsx:1205` | — | — | — | `orderId` | 同上 | 链接地址 `#/trade-orders?company=DEFAULT&order=SO-I1` 为脚本断言；待真实 Chrome |
| 筛选条存在：`form[role=search]`，`#tinv-filter-party/-side/-from/-to`，提交按钮与“清除”按钮 | `TradeInvoices.tsx:1163`（`role="search"`）、`:1171`、`:1187`、`:1199`、`:1209`、`:1222`、`:1225` | 标签与控件一对一（`label[for]`） | 草稿与已应用均为空 | `tinv.filter.*`（`trade-labels.ts:201–214`、`:434–447`） | 请求参数 `party`、`side`、`from`、`to`（可选） | 无（页面控件） | 无替身；待真实 Chrome |
| 伙伴 `PARTY2` + 应用 → 3 行：AP-DEMO2、AR-I1-1、AR-I2-1（混合方向） | `TradeInvoices.tsx:1114`（`apply`）、`:1090–1102`（请求带 `party`） | — | 伙伴为空 = 不筛 | `tinv.filter.party` | `party` 精确匹配伙伴代码 | AP-DEMO2 的伙伴 PARTY2（seed-trade）；AR 发票伙伴 PARTY2（seed-sales） | 期望集合由 seed 脚本的 party 参数推出；服务端按 party 过滤由 #189 的测试覆盖，本 Demo 只在真实 Chrome 里观察；待真实 Chrome |
| 清除 → 回到 6 行，伙伴与方向输入为空 | `TradeInvoices.tsx:1124`（`clear`） | — | 清除后草稿 = 已应用 = 空 | `tinv.filter.clear` | — | — | 待真实 Chrome |
| 方向 `AR` + 应用 → 2 行：AR-I1-1、AR-I2-1 | `TradeInvoices.tsx:1187`（select 选项 `""` / `AP` / `AR`） | — | 方向为空 = 全部 | `tinv.filter.side/all/ap/ar` | `side` | 同上 | 待真实 Chrome |
| 伙伴 `PARTY` + 方向 `AR` → 无数据行，`p.empty-state` 为“没有符合条件的发票。” / `No invoices match the filters.` | `TradeInvoices.tsx:1288`（有已应用筛选时用 `tinv.filter.none`） | 无 | 无筛选的空态是 `tinv.empty`（本演示没有空账套，不断言） | `tinv.filter.none`（`trade-labels.ts:214`、`:447`） | 空列表 | PARTY 只有采购发票，方向 AR 求交为空（seed-trade / seed-invoicing 的伙伴 PARTY） | 待真实 Chrome |
| 筛选前后 `location.hash` 不变、无 `dialog` 事件 | `TradeInvoices.tsx:1077–1078`（筛选只在组件状态里） | — | — | — | — | — | 待真实 Chrome |
| 每张截图：语言 / 主题 / 宽度 / 教学开关 / `scrollY` 与文件名一致；390 宽 `scrollWidth <= innerWidth` | 脚本 `assertState`（按 TEMPLATE） | — | 教学模式开启（localStorage `erp.workspace.preferences.v1`） | — | — | — | 待真实 Chrome；截断类判定：本脚本没有截断类断言，容差公式不适用 |

## 4. 已知的预期控制台错误

本版 capture 不访问不存在的订单，预期没有 404；取图后逐条核对 `capture-log-main.json` 的 `errors`，出现任何控制台错误或 `overflowPx > 0`，按缺陷报告。

## 5. 独占时段记录

尚未申请 / 执行。
