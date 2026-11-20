# TORD-03 订单列表：列表 API 与订单页列表

- Sprint：S6（[计划](README.md#s6订单列表与保存前预览--s5-遗留收尾建议-v060)）　依赖：—（C 线第一项）　建议分支：`tord-03-trade-order-list`
- 冲突域：trade-docs（`packages/infra/src/http/trade-documents.ts`、`packages/infra/src/storage/trade-documents.ts`、`packages/core/src/application/trade-documents.ts`）、contracts（`packages/core/src/contracts/trade-documents.ts`）、web-ui:trade-orders（`TradeOrders.tsx`、`pages/trade-orders.css`、`ui/trade-order-labels.ts`、`test/trade-orders.test.tsx`）
- 类型：后端 API + 页面
- 来源：S4 决定 P2（[M1-R1a](M1-R1a-trade-order-entry-page.md#设计决定-p2产品负责人按现有-api-收窄范围)）：订单页只能按号查询，没有列表接口。S5 计划列为“不在本 Sprint”。

## 现状（main `49d936b`）

- `/api/v1/trade/orders` 只接受 `POST`（`packages/infra/src/http/trade-documents.ts:84–89`）；`GET /api/v1/trade/orders/:orderId?company=` 按号查询（:127–137）。
- 发票列表是现成的模式：`GET /api/v1/trade/invoices?company&limit&cursor`（:145 起），查询契约 `tradeInvoiceListQuerySchema`、页契约 `tradeInvoicePageSchema`（`packages/core/src/contracts/trade-documents.ts:433`、:451），存储为 keyset 分页（`storage/trade-documents.ts` 的 `tradeDocumentPage`，`limit + 1` 判断 `nextCursor`）。
- 表 `trade_orders`（`010-trade-documents.sql:1–14`）为 `WITHOUT ROWID`，主键 `(company_id, order_id)`，不可修改（触发器）。按 `order_id` 升序的 keyset 分页可直接走主键，**不需要新索引、不需要迁移**。

## 范围

1. **API**：同一路由 `/api/v1/trade/orders` 增加 `GET`（`boundary.assert` 改为 `["GET", "POST"]`，`POST` 行为逐字不变）。
   - 查询：`company`（必填）、`limit`（与发票列表同一 `limit` 定义，默认 100，1–500）、`cursor`（上一页最后一个 `orderId`，格式同 `companyCodeSchema`，可选）。新契约 `tradeOrderListQuerySchema`，严格对象，未知参数 400。
   - 排序：`order_id` 升序；`WHERE company_id=? AND order_id>? ORDER BY order_id LIMIT ?+1`。
   - 页：`{ items, nextCursor }`；每项为摘要，不含行：`orderId`、`side`、`party`、`orderDate`、`currency`、`priceIncludesTax`、`rounding`、行数、净额 / 税额 / 总额合计（由 `trade_order_lines` 汇总）、`recordedAt`。新契约 `tradeOrderPageSchema`。
   - 用例权限：新增 `listOrders: "read"`（`application/use-cases.ts`）。
   - **不做**筛选（伙伴、日期、方向）。若开发认为筛选必需，先报告设计角色：筛选要新索引就是迁移任务，单独立项，与其他迁移任务串行。
2. **页面**：`TradeOrders.tsx` 增加订单列表区，Dynamics 365 列表样式，复用 `PageTable` / 共享 `.grid` 组件规则，不新增全局规则。
   - 列：订单号、方向、伙伴、订单日期、币种、行数、总额（右对齐，`font-variant-numeric: tabular-nums`，同发票列表）。
   - 分页：“加载更多”按钮，用 `nextCursor`；无更多时不显示。
   - 订单号单元格为链接按钮，点击后进入现有按号查询的详情（与现有“查询”同一路径），不新增详情组件。
   - 保存新订单成功后刷新列表首页；按号查询的现有功能保留。
   - 空列表、加载中、错误三态，文案中英双语（`trade-order-labels.ts`）。
   - 教学模式：不新增教学组件。该页已有 `TeachingTip`（`TradeOrders.tsx:208`，由 `preferences.teaching` 控制）；若要说明列表，只在其文案 `tord.teaching` 中补一句，中英同时改。教学模式关时整块不渲染，与现状一致。

## 验收标准

1. API 契约测试（`packages/infra/test`，最低能覆盖的层）：
   - 空账套返回 `{ items: [], nextCursor: null }`；
   - 3 张订单、`limit=2`：第一页 2 条且 `nextCursor` 为第 2 条的 `orderId`，第二页 1 条且 `nextCursor` 为 `null`；顺序按 `orderId` 升序；
   - 合计等于逐行 `gross` 之和（含整单舍入的订单）；
   - 另一公司的订单不出现；`limit=0`、`limit=501`、未知参数、缺 `company` 返回 400；
   - `POST` 原有测试不改、全部通过。
2. 读路径不写库，用两条互相独立的判据，都要有：
   - **事务模式**：应用层测试中给 store 装一个记录调用的替身，`GET` 列表只调用 `store.read` 一次，`store.write` 调用 0 次；
   - **持久变化**：HTTP 层测试另开一个**独立的观察连接**（不是处理请求的那个连接）连到同一账套文件，请求前后各读一次全部用户表（`sqlite_schema` 中 `type='table'` 且不以 `sqlite_` 开头）的行数与 `trade_orders`、`trade_order_lines` 的全部主键，两次结果相同。
   - 不用 `PRAGMA data_version`：在执行请求的同一连接上读取时，它不反映该连接自己的提交。
3. **性能（[PG-05](../product-guidelines.md#5-pg-05性能从设计开始)）**：
   - **执行计划**：首页（无 `cursor`）与续页（有 `cursor`）两种查询的 `EXPLAIN QUERY PLAN` 都显示 `trade_orders` 走主键（`SEARCH trade_orders USING PRIMARY KEY`），行合计对 `trade_order_lines` 也走其主键前缀，不出现对两表的 `SCAN` 或 `USE TEMP B-TREE`。
   - **无 N+1**：每页的 SQL 语句数固定，与 `limit` 和每张订单的行数无关（例如一条带 `GROUP BY` / 子查询的语句，或“订单一条 + 行合计一条”）。测试用计数替身数 `db.query` 调用次数，`limit=2` 与 `limit=100` 时相同。
   - **热读 p95 ≤ 1 s**：测量边界同 PG-05，即本机真实 HTTP 请求发出到完整响应读取并通过契约解析。账套为 1 万张订单、每张 1–20 行（合成），分别测首页与深处续页（`cursor` 位于后 10%），各 ≥ 50 次请求，先预热。
   - 这项基准放在 `packages/infra/bench`（main / 每晚运行），或作为一次性独立取证附在 PR 描述（命令与原始输出）。**不加到 PR 快速套件。**
4. 页面：jsdom 测试覆盖列表渲染、加载更多、点击订单号进入详情、保存后刷新；键盘可达（Tab 到“加载更多”和订单号，Enter 触发）。
5. 满足 [UI-1 通用验收](README.md#ui-1界面逐步改进) 1–9：中 / 英、红 / 绿两主题、1440 / 390 截图，PG-05 字节预算：新增 CSS gzip ≤ +0.3 kB、JS 按 PG-05 口径报告；真实 Chrome 证据按[路线图 §5 UI PR 证据清单](../roadmap.md#5-团队流程)。
6. 现有测试与 E2E 不删除、不削弱（D11）。无迁移、无 `package.json` / lock 变化。
