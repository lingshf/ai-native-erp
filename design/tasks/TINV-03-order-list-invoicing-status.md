# TINV-03 订单列表“开票状态”列 + 订单页 `?order=` 深链接

- Sprint：S9（[计划](README.md#s9订单--发票双向可追溯--v080-回顾行动建议-v090)）　依赖：无（A 线首项）　建议分支：`tinv-03-order-list-invoicing-status`
- 冲突域（逐个列文件）：
  - 存储：`packages/infra/src/storage/trade-documents.ts`（`tradeOrderPage` 增加按页聚合；把 `tradeOrderInvoiced` 的已开票谓词抽成共享 SQL 片段，两处共用）。
  - contracts：`packages/core/src/contracts/trade-documents.ts`（只改 `tradeOrderPageSchema` 的列表项与随之生成的 `TradeOrderPage` OpenAPI 组件）。
  - trade-docs：`packages/core/src/domain/trade-documents.ts:83` 的 `TradeOrderSummary` 类型加 `invoicing` 字段（只改类型）；不改任何命令或过账逻辑。
  - web-ui:trade-orders：`TradeOrders.tsx`、`trade-order-labels.ts`、`pages/trade-orders.css` 及其测试。
  - bench：`packages/infra/bench/trade-order-list.ts`（只在需要时更新解析；p95 预算不放宽）。
  - 共享单文件：`packages/core/src/contracts/trade-documents.ts`、`packages/infra/src/storage/trade-documents.ts`、`scripts/test-shard-weights.json`（TINV-03 在前，TINV-04 在后，见 [S9 泳道](README.md#s9订单--发票双向可追溯--v080-回顾行动建议-v090)）。
  - **不涉及**：迁移 / schema（不加列、不加索引）、领域过账与订单行匹配、`tradeOrderSchema`、`tradeOrderInvoicingSchema`、`tradeOrderListQuerySchema`、web-ui:trade（`TradeInvoices.tsx` 属 TINV-04）、`web-ui:components`（`components.css` 属 PROC-06）、`App.tsx` 路由（沿用 `/trade-orders`）、`contrast.test.ts`（Badge 沿用已有配色时不需要追加配对；需要时停下报告）。
- 类型：存储读 + 契约（只加响应字段）+ 页面
- 优先级：P1（S9 的产品功能，A 线首项）
- 来源：产品负责人选题（S9 计划“目标”，D263）。

## 现状（main `deb80fc`）

- 订单列表接口 `GET /api/v1/trade/orders`（`packages/infra/src/http/trade-documents.ts:88`）返回 `tradeOrderPageSchema`（`packages/core/src/contracts/trade-documents.ts:505`，严格 schema），列表项只有表头与金额字段；存储 `tradeOrderPage`（`packages/infra/src/storage/trade-documents.ts:530–550`）按 `tradeOrderPageStatement`（同文件 `:128`）取一页。列表上看不出哪些订单还没开票。
- 已开票数量只能按单张订单读：`tradeOrderInvoiced`（同文件 `:552–563`）对指定订单行汇总发票行数量，只计所属未结项不是 `cancelled` 的发票行，走 `trade_document_lines_order` 索引（`packages/infra/migrations/sqlite/010-trade-documents.sql:105`）。TINV-01 的 `GET …/orders/:orderId/invoicing` 与过账匹配都用它。
- 订单数量存为 TEXT 十进制（`trade_order_lines.quantity`），已开票数量是整数 micros（`quantity_micros`）。比较必须用精确的十进制 → micros 转换，不能用 SQLite REAL。
- 订单页的地址只承载列表筛选参数（`packages/web/src/TradeOrders.tsx:824` 附近）；打开详情靠列表点击后 `setOpened`（`:294`、`:793`），再由 `OrderLookup`（`:995` 起）执行与查询表单相同的读取。没有能直接打开某张订单的链接；发票页回到订单只能手工输入订单号。公司选择是组件内状态（`:188`、`:204`），地址里没有 `company`。
- 发票页已有同类入口 `?fromOrder=`，公司不在已加载列表时提示且不带入（`packages/web/src/TradeInvoices.tsx:289–297,359`，文案 `tinv.fromOrder.company`）。

## 设计决定（产品负责人）

1. **口径单一来源**：
   - 已开票 = 与 `tradeOrderInvoiced` 相同的谓词：同公司、同订单行、`order_id IS NOT NULL`、所属未结项 `status<>'cancelled'` 的发票行数量之和。谓词抽成一个共享 SQL 片段（或共享函数生成的 SQL），`tradeOrderInvoiced` 与新聚合都用它；不得复制两份。
   - 状态由一个纯函数按订单行计算：`none` = 每行已开票都是 0；`full` = 每行已开票 ≥ 订购量；其余为 `partial`。订购量按与过账匹配相同的十进制 → micros 转换（`quantityMicros`，过账匹配见 `packages/core/src/domain/trade-documents.ts:784–795`）。过账已拒绝超开（同处 `:794`），`≥` 只是防御写法，不需要专门的超开夹具。
2. **读取方式**：一页一次分组聚合，按本页的订单号（`IN (…)`）查，走 `trade_document_lines_order`；不能每张订单各查一次，也不能全表聚合。订单行的订购量可以在同一查询中 JOIN 取得，或用第二个按本页订单号的查询取得，总查询次数与页大小无关。
3. **契约**：`tradeOrderPageSchema` 的列表项增加必填 `invoicing: "none" | "partial" | "full"`。只改这一处响应 schema；`tradeOrderListQuerySchema`（请求）、`tradeOrderSchema`、`tradeOrderInvoicingSchema` 一字不改。
4. **深链接**：`/trade-orders?company=<code>&order=<orderId>` 在公司加载完成后选中该公司，并按列表点击的同一路径（`OrderLookup` 的 `request`）打开该订单详情。两个参数都存在时才算深链接；只有 `order` 时用当前公司。打开后保留参数，刷新页面得到同一视图；用户在页面上改选公司或打开另一张订单时，地址随之更新或移除 `order`，不能出现地址与详情不一致。
5. **未保存草稿**：深链接触发时若草稿有未保存改动，沿用现有离开确认（`tord.leaveConfirm`），取消则不切换。

## 范围

1. 存储：共享谓词片段；`tradeOrderPage` 返回每项的 `invoicing`。
2. contracts：上面第 3 条；OpenAPI `TradeOrderPage` 组件随 schema 生成。
3. 订单列表新列“开票状态”：文字 Badge（未开票 / 部分开票 / 已开完；英文 Not invoiced / Partly invoiced / Fully invoiced），不只靠颜色。
4. 订单页读取 `company`、`order` 参数并按下表处理异常。
5. 测试：存储、接口、web 单测；`order` 深链接的 web 用例；权重登记。

## 入口参数与异常

| 参数 | 情形 | 表现（提示文案键，新增于 `trade-order-labels.ts`） | 恢复路径（可操作） |
| --- | --- | --- | --- |
| `company` | 不在已加载的公司列表（含空串、大小写不符） | 不静默回退到第一家公司，不打开任何订单；提示“公司不存在”（`tord.deepLink.company`），显示地址里的值 | “改选公司”按钮，聚焦公司下拉框；改选后移除地址里的 `company`、`order` |
| `order` | 前端格式校验失败（`tradeOrderCommandSchema.shape.orderId`）或接口返回 400 | 提示“订单号无效”（沿用 `tord.issue.shape`），不当作“未找到” | “返回列表”：移除 `order`，焦点回到列表 |
| `order` | 订单不存在（404 `NOT_FOUND`） | 提示“订单不存在”（沿用 `tord.notFound`） | 同上 |
| — | 公司列表或订单读取的其他失败 | 提示读取失败（`master.error`） | “重试”按钮，重跑同一读取 |
| — | 只有一个账套 | 上面每一行的按钮仍然出现且可用 | 同上 |
| `company` / `order` | 公司列表尚未加载完 | 显示加载中，不提前判定“公司不存在” | — |

## 不在范围

- 按开票状态筛选或排序订单列表（D263：列入 S10 及以后的候选）。
- 在订单列表显示已开票数量或金额；多订单合并开票；贷项是否冲减已开票数量。
- 发票列表的“来源订单”列（TINV-04）。
- 迁移、新增索引、冗余存储已开票数量。

## 验收标准

1. **口径一致**：同一夹具下，每张订单列表上的 `invoicing` 等于由 `GET …/orders/:orderId/invoicing` 的各行已开票数量按设计决定 1 算出的状态。夹具至少覆盖：未开票、部分开票（多行订单只开一行）、全部开完、小数数量（如订购 `1.5`、已开 `1.5`）、发票被作废（未结项 `cancelled`）后从 `full` 回到 `partial` 或 `none`。
2. **单一谓词**：`tradeOrderInvoiced` 与新聚合引用同一个 SQL 片段或生成函数（`git diff` 可见；仓库中“`o.status<>'cancelled'`”与已开票相关的写法只出现一处）。TINV-01、TINV-02 的现有测试不改仍通过。
3. **查询方式**：存储测试断言一页 N 张订单（N ≥ 2）的已开票读取次数为常数，与 N 无关；`EXPLAIN QUERY PLAN` 断言聚合使用 `trade_document_lines_order`。
4. **性能**：TORD-05 列表基准 `packages/infra/bench/trade-order-list.ts` 的热读 p95 ≤ 1s；PR 正文给出改动前（base）与改动后（head）同机数字。
5. **契约**：`tradeOrderPageSchema` 列表项多出必填 `invoicing`；`tradeOrderListQuerySchema`、`tradeOrderSchema`、`tradeOrderInvoicingSchema` 的 `git diff` 为空。OpenAPI 测试覆盖新字段。
6. **深链接**：“入口参数与异常”表每一行有对应的 web 用例（mock fetch），并断言恢复按钮可用键盘激活；正常路径断言打开的是地址中那张订单、刷新后仍是同一张。
7. **UI**：中英文案；状态用文字 Badge；红 / 绿主题下 Badge 对比度符合 UI-1；390 px 宽度下列不被挤压溢出（可以隐藏或换行，PR 正文写明选择）；键盘可以到达该列与深链接打开后的详情。
8. **证据**：真实 Chrome 证据按[路线图 §5 UI PR 证据清单](../roadmap.md#5-团队流程) 1–8 项（含第 7 项断言对照、第 8 项先 build），在独占时段内用 PR head 取证；PG-05 在预算内，数字绑定最终送审 head。
9. 无迁移；新增测试文件登记权重并通过守卫。

## 证据要求

- 真实 Chrome：订单列表三种状态各一张截图（红 / 绿主题各一），深链接正常打开一次，“公司不存在”“订单号无效”“订单不存在”各一次。
- 断言对照（证据清单第 7 项）：列出每条文本断言对应的 `trade-order-labels.ts` 键与组件 `file:line`，以及 `invoicing` 在响应 schema 中的位置。
- PG-05：base 为 PR 实际 base；与取证 head 不同时分开写。

## 设计自查（路线图 §5 设计文档自查 1–8）

- [x] 1 事实断言有来源（见“现状”）
- [x] 2 不涉及进行中的 PR
- [x] 3 依赖列与泳道说明一致（A 线首项）
- [x] 4 不新增共享 CSS；页面 CSS 只在 `pages/trade-orders.css`
- [x] 5 覆盖类断言给出 `file:line`
- [x] 6 共享单文件已列入 S9 泳道
- [x] 7 入口参数逐个列了异常与恢复路径
- [x] 8 改动条款已通读上下文
