# TINV-01 从订单开票：订单开票明细接口 + 发票页按订单带入草稿

- Sprint：S8（[计划](README.md#s8从订单开票--v070-回顾行动建议-v080)）　依赖：无（A 线首项）　建议分支：`tinv-01-invoice-from-order`
- 冲突域：
  - trade-docs：`packages/core/src/application/trade-documents.ts`（新增订单开票明细读取）、`packages/infra/src/http/trade-documents.ts`（新增 `GET /api/v1/trade/orders/:orderId/invoicing`）。
  - contracts：`packages/core/src/contracts/trade-documents.ts`（新增 `tradeOrderInvoicingSchema` 与 OpenAPI 路径 / 组件；**`tradeOrderSchema` 与 `TradeOrder` 组件一字不改**）。
  - 存储：只复用 `packages/infra/src/storage/trade-documents.ts` 的 `tradeOrderInvoiced`，**不改**其 SQL；如必须改，停下报告设计角色。
  - web-ui:trade：`TradeInvoices.tsx`、`pages/trade-invoices.css`、发票页 labels（`ui/trade-labels.ts` 中的 `tinv.*`；该文件属 web-ui:trade，TINV-02 不改它）及 `packages/web/test/` 下发票页测试。
  - 共享单文件：`scripts/test-shard-weights.json`（仅当新增测试文件；见 [S8 泳道](README.md#s8从订单开票--v070-回顾行动建议-v080)“共享单文件”）。
  - **不涉及**：迁移 / schema、领域过账（不改发票过账、订单行匹配 `matchTradeOrderLine` 与容差规则）、`web-ui:trade-orders`（由 TINV-02 做；订单页现有的保存与查询照旧解析 `tradeOrderSchema`，本任务不需要改 `TradeOrders.tsx`）、bench（`packages/infra/bench/` 解析 `tradeOrderSchema` 的地方不变）、`App.tsx` 路由（沿用现有 `/trade-invoices`）、`contrast.test.ts`。
- 类型：后端 API（只读字段）+ 页面
- 优先级：P1（S8 的产品功能，A 线首项）
- 来源：产品负责人选题（见 S8 计划“目标”）。

## 现状（main `1bb9dbb`）

- 发票与订单的关联已在后端完成：发票命令可带 `orderId`，每行可带 `orderLineId`；过账时取该订单行已开票数量 `previouslyInvoiced`，按订单数量、单价和容差匹配（`packages/core/src/application/trade-documents.ts:876–905`）。已开票数量来自 `tradeOrderInvoiced`：同一订单行上、所属未结项未取消的发票行数量之和（`packages/infra/src/storage/trade-documents.ts:552–560`），走 `trade_document_lines_order` 索引（`packages/infra/migrations/sqlite/010-trade-documents.sql:105`）。
- 但这个数字没有对外暴露：`GET /api/v1/trade/orders/:orderId`（`packages/infra/src/http/trade-documents.ts:153–162`）返回 `tradeOrderSchema`，行对象只有订单输入字段与金额（`packages/core/src/contracts/trade-documents.ts:41–53`），没有已开票数量。
- `tradeOrderSchema` 是严格 schema（`z.strictObject`），被多处共用：`POST /api/v1/trade/orders` 的 201 响应（`packages/infra/src/http/trade-documents.ts:107`）与上面的 GET（同文件 `:158`）；订单页保存（`packages/web/src/TradeOrders.tsx:403`）与按订单号查询（同文件 `:1039`）；bench（`packages/infra/bench/trade-http.ts:323`、`packages/infra/bench/trade-order-preview.ts:272`）；OpenAPI 的 `createTradeOrder` 与 `getTradeOrder` 都引用 `TradeOrder` 组件（`packages/core/src/contracts/trade-documents.ts:631,656`）。给它的行对象加必填字段，会让 POST 响应解析失败或迫使 POST 也返回该字段，并让 TINV-01 合并到 TINV-02 合并之间的订单页查询失败。
- 发票页的 `orderId`、`orderLineId` 是手工输入的文本框（`packages/web/src/TradeInvoices.tsx:33,42,553`）。用户要先去订单页记下订单号、逐行抄行 ID、自己算还剩多少没开票，再回发票页逐行录入；抄错或超开，要到预览 / 过账时才被拒绝。
- 已有先例：凭证页用查询参数跳到期间关闭页（`packages/web/src/Journals.tsx:1133`）；路由为 HashRouter，发票页路径 `/trade-invoices`（`packages/web/src/App.tsx:284`）。

## 设计决定（产品负责人）

1. **独立的只读开票明细契约，不动现有订单契约**：新增 `GET /api/v1/trade/orders/:orderId/invoicing?company=<公司>`，响应为新的严格 schema `tradeOrderInvoicingSchema`：
   ```
   { order: tradeOrderSchema,                 // 原样复用，字段与顺序不变
     invoiced: [ { lineId, invoicedQuantity } ] }  // 与 order.lines 一一对应、同序；invoicedQuantity 与 quantity 同一 decimal schema
   ```
   OpenAPI 新增 `getTradeOrderInvoicing` 路径与 `TradeOrderInvoicing` 组件。`tradeOrderSchema`、`TradeOrder` 组件、`POST /trade/orders` 与 `GET /trade/orders/:orderId` 的请求和响应都不变。订单不存在时与 `GET /trade/orders/:orderId` 返回相同的状态码与错误码。
2. **已开票数量只有一个来源**：`invoicedQuantity` 的值由**过账匹配时使用的同一个** `tradeOrderInvoiced` 求得，口径完全一致：已取消的发票不计；贷项不冲减（与现行匹配一致）。本任务不改这一口径；如认为口径应变，停下报告设计角色另立任务。
3. **只读、不加迁移、不加 N+1**：开票明细为该订单全部行调用一次 `tradeOrderInvoiced`（一条语句，≤ 100 个行 ID），不逐行查询。
4. **带入入口**：发票页接受 `#/trade-invoices?company=<公司>&fromOrder=<订单号>`。进入时读取开票明细接口（一次请求），生成一张**新草稿**：
   - 表头：方向（`side`）、伙伴（`party`）、`orderId`、含税标志（`priceIncludesTax`）、舍入方式（`rounding`）取自订单（订单头字段见 `packages/core/src/contracts/trade-documents.ts:27–35`，发票草稿字段见 `packages/web/src/TradeInvoices.tsx:35–48`）；外部发票号（`externalInvoice`）与各日期由用户填写或沿用页面默认值，不从订单猜测。币种由后端按订单校验（订单与发票币种不一致时拒绝，见 `application/trade-documents.ts:876–880`），页面不另做；
   - 行：只带入 `quantity − invoicedQuantity > 0` 的订单行，每行带入 `orderLineId`、商品、税码、单价、折扣、应税附加费，数量 = 未开票数量；行顺序同订单；
   - 带入后把 `fromOrder` 从地址中移除（`replace`，不新增历史记录），刷新页面不会再次带入或覆盖用户已改的内容；
   - 用户可以改数量、删行；预览和过账仍走现有校验，超开仍由后端拒绝（本任务不在前端另做一套校验）。
5. **异常情况**（都用页面已有的 MessageBar，不弹窗）：订单不存在 → 错误提示，草稿保持空白；全部行已开完 → 提示“该订单已全部开票”，不生成行；读取失败 → 错误提示并可重试。若用户当前已有未保存的发票草稿，先确认是否放弃，取消则保持原草稿、不带入。
6. **页面样式**：复用现有表单与共享组件规则，不新增颜色与全局规则；红 / 绿两主题沿用现有 token。

## 范围

1. 契约：新增 `tradeOrderInvoicingSchema`；OpenAPI 新增路径与组件（决定 1）。
2. 应用层 / HTTP：新增开票明细读取与路由（决定 1–3）。
3. 发票页：`fromOrder` 带入（决定 4、5）；中英文 labels；教学模式开时在带入后的草稿上方显示一句说明（“数量按订单未开票数量带入，过账时仍按订单匹配校验”的意思，措辞由开发定、评审核对），关闭教学模式时不显示。
4. 供 TINV-02 并行开发使用的 mock 形状（本任务书即为约定）：`POST /trade/orders` 与 `GET /trade/orders/:orderId` 返回现有 `tradeOrderSchema` 形状（不含 `invoicedQuantity`）；`GET /trade/orders/:orderId/invoicing` 返回决定 1 的 `tradeOrderInvoicingSchema` 形状。
5. 测试（在最低能覆盖的层各测一次）：
   - 应用层或 HTTP：无发票时为 0；部分开票；两张发票累加；取消一张发票后回退；与过账匹配的 `previouslyInvoiced` 取值一致（同一夹具同时断言二者）；订单不存在时的状态码与错误码与 `GET /trade/orders/:orderId` 相同；
   - 兼容：`POST /trade/orders` 的 201 响应与 `GET /trade/orders/:orderId` 的响应仍按未改动的 `tradeOrderSchema` 解析通过，且不含 `invoicedQuantity`；
   - 发票页（web 测试，mock fetch）：带入表头与行、跳过已开完的行、`fromOrder` 移除后刷新不再带入、订单不存在 / 全部开完 / 读取失败三种提示、已有草稿时取消带入保持原草稿；
   - 键盘：带入完成后焦点落在第一个需要用户填写的表头字段（外部发票号 `externalInvoice`），全程可用键盘完成预览与过账。

## 不在范围

- 订单页的“开票”入口、已开票 / 未开票列（TINV-02）。
- 订单列表显示开票状态、按开票状态筛选（需按页聚合，另议）。
- 从多张订单合并开一张发票；从发票反查订单的导航。
- 改匹配规则、容差、贷项是否冲减已开票数量。
- 迁移、`package.json` / lock 变化。

## 验收标准

1. `GET /api/v1/trade/orders/:orderId/invoicing` 按决定 1 返回，`invoiced` 与 `order.lines` 一一对应；测试覆盖范围 5 的取值情形，且同一夹具下与过账匹配的 `previouslyInvoiced` 相等。
2. **兼容**：`git diff` 中 `tradeOrderSchema` 定义、OpenAPI `TradeOrder` 组件、`createTradeOrder` / `getTradeOrder` 路径无变化；`POST /trade/orders`（201）与 `GET /trade/orders/:orderId` 的现有测试、订单页现有 web 测试与 bench 不改也通过；范围 5 的兼容用例通过。
3. 开票明细读取对已开票数量只发一条语句；测试或查询计划断言它使用 `trade_document_lines_order`，不逐行查询。若计划显示全表扫描，停下报告，不自行加索引。
4. 发票页按决定 4、5 工作，范围 5 的 web 用例全部通过（这些是非 slow 用例，在 PR CI 中运行）。
5. 真实 Chrome 演示（真实服务，PR head，在独占时段内取证，不是 PR CI 门禁）：用带入的草稿走完“预览 → 过账”；过账后再次带入同一订单，该行 `invoicedQuantity` **增加**、带入数量（未开票数量）**减少**；全部开完时提示“该订单已全部开票”、不生成行。
6. 中英文、红 / 绿两主题、1440 / 390 两种宽度下带入后的发票页完整可用；教学模式开 / 关两种状态都有截图。
7. 满足 [UI-1 通用验收标准](README.md#ui-1界面逐步改进) 1–9；PG-05 口径同 S7（基线为 PR 实际 base 的 gzip 列）；真实 Chrome 证据按 [路线图 §5 UI PR 证据清单](../roadmap.md#5-团队流程)，在独占时段内取证（含 D234 的停用与回执）。
8. 新增测试文件时在 `scripts/test-shard-weights.json` 登记权重并通过守卫；没有迁移；没有 `package.json` / lock 变化；现有测试不删除、不削弱、不跳过（D11）。
