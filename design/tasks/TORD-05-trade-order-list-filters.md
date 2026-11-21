# TORD-05 订单列表筛选：伙伴 / 方向 / 订单日期（迁移 017，一条伙伴索引）

- Sprint：S7（[计划](README.md#s7订单列表筛选--d-7-完成--s6-遗留收尾建议-v070)）　依赖：UI-11e（A 线前一项，web-ui:trade-orders 串行）、CI-01（权重文件门禁：CI-01 合并且覆盖其合并提交的 main Full 变绿之前，本任务不得改动 `scripts/test-shard-weights.json`；门禁满足后 rebase，再登记权重，然后请求评审。见 [S7 泳道](README.md#s7订单列表筛选--d-7-完成--s6-遗留收尾建议-v070)）　建议分支：`tord-05-trade-order-list-filters`
- 冲突域：
  - **迁移/schema**：`packages/infra/migrations/sqlite/017-*.sql`、`packages/infra/src/storage/migrations.ts`（文件清单与期望对象清单）。S7 内唯一的迁移任务；**任何另一个要加迁移的任务都不能与它并行**（共用 `migrations.ts` 与编号）。
  - 存储：`packages/infra/src/storage/trade-documents.ts`（`tradeOrderPageSql`）。
  - trade-docs：`packages/infra/src/http/trade-documents.ts`、`packages/core/src/application/trade-documents.ts`。
  - contracts：`packages/core/src/contracts/trade-documents.ts`（`tradeOrderListQuerySchema`）。
  - web-ui:trade-orders：`TradeOrders.tsx`、`pages/trade-orders.css`、`ui/trade-order-labels.ts`、`test/trade-orders.test.tsx`。
  - bench/CI：`packages/infra/bench/trade-order-list.ts`（扩充）；新增测试文件时 `scripts/test-shard-weights.json`。该文件与 CI-01 共享，二者串行，按上面的权重文件门禁执行。
  - 不涉及领域过账：不改 `trade_orders` / `trade_order_lines` 的列、约束与触发器，不改任何过账或未结项代码。
- 类型：迁移（只加索引）+ 后端 API + 页面
- 优先级：P1（S7 的产品功能）
- 来源：TORD-03 明确不做筛选、“要新索引就是迁移，单独立项”（[TORD-03 范围 1](TORD-03-trade-order-list.md#范围)）；S6 计划“不在本 Sprint”。订单列表上线（[#132](https://github.com/lingshf/ai-native-erp/pull/132)）后只能从头翻页，“看某个伙伴的订单”“看本月的采购订单”都做不到；发票侧的未结项已有按伙伴的索引（`open_items_party_due`），订单侧没有。

## 现状（main `3548d58`）

- 列表查询契约 `tradeOrderListQuerySchema` 只有 `company`、`limit`、`cursor`（`packages/core/src/contracts/trade-documents.ts:490–494`），严格对象，未知参数 400。
- 读路径为一条语句 `tradeOrderPageSql`（`packages/infra/src/storage/trade-documents.ts` 中 `// TORD-03` 注释下）：`WHERE o.company_id=? AND o.order_id>? GROUP BY o.order_id ORDER BY o.order_id LIMIT ?`，走 `trade_orders` 主键 `(company_id, order_id)`。
- `trade_orders` 为 `WITHOUT ROWID`（`010-trade-documents.sql:1–14`），没有 `party_id`、`side`、`order_date` 上的索引。最新迁移为 016（`016-trade-report-capacity.sql`），文件名登记在 `migrations.ts:101` 附近，期望对象按 `latest >= N` 分组登记（`migrations.ts:300` 起）。
- 基准 `packages/infra/bench/trade-order-list.ts`：1 万张合成订单、每张 1–20 行，测首页与深处续页的 HTTP 热读 p95（预算 1 s）。

## 设计决定（产品负责人）

1. **排序与游标不变**：仍按 `order_id` 升序 keyset 分页，`cursor` 仍是上一页最后一个 `orderId`。筛选只缩小结果集，不改变顺序语义；调用方在筛选条件变化时从首页重新开始（游标只在同一组筛选条件下有意义，服务端不校验这一点）。不新增按日期排序，不改页契约 `tradeOrderPageSchema`。
2. **只加一条索引**：`CREATE INDEX trade_orders_party ON trade_orders(company_id, party_id, order_id);`，迁移文件 `017-trade-order-filters.sql`，内容只有这一条语句和一行说明注释。
   - 理由：按伙伴筛选的结果通常只占全部订单的一小部分，没有索引就要从游标处顺着主键扫到够一页或扫完；有了 `(company_id, party_id, order_id)`，等值 + 游标范围可以直接 `SEARCH`，且天然按 `order_id` 有序，不需要临时排序。
   - **方向与日期不加索引**：方向只有两个值，选择性低；日期索引要么需要 `USE TEMP B-TREE` 排序，要么要改成按日期排序并改游标契约，两者都超出本任务。这两种筛选走主键范围 + 行内过滤，由基准证明在 1 万张订单下满足 PG-05。
   - **验收 3 中任何一个必测场景的 p95 超过 1 s，都停下报告设计角色**，附原始输出；不自行加索引、改排序或改游标契约，也不调整预算。
3. **参数**（都可选，可组合，组合为 AND）：
   - `party`：伙伴代码，与订单命令中 `party` 字段同一 schema；不校验伙伴是否存在（不存在时结果为空，不是 400）。
   - `side`：`AP` 或 `AR`；其他值 400。
   - `from`、`to`：订单日期 `YYYY-MM-DD`（与契约中现有的 `day` 同一 schema），闭区间；`from > to` 返回 400。
4. **SQL 写法**：值一律绑定参数，不拼接；允许按“有无 `party`”等固定组合预先写好的少数几条语句，或由固定片段拼出语句文本，但每页仍只执行**一条**语句（保持 TORD-03 的无 N+1 判据）。不用 `(? IS NULL OR party_id=?)` 这类写法覆盖伙伴条件，因为它会让规划器放弃索引。
5. **页面**：筛选栏放在订单列表区上方，Dynamics 365 列表筛选的样式，复用现有表单控件与共享组件规则，**不新增全局元素规则**（UI-11e 合并后 `styles.css` 已删除，本任务不得恢复）。

## 范围

1. 迁移 017（决定 2），并在 `migrations.ts` 的文件清单与期望对象清单（`latest >= 17` 时期望 `index:trade_orders_party`）中登记。
2. 契约：`tradeOrderListQuerySchema` 增加 `party`、`side`、`from`、`to`（决定 3），仍为严格对象；HTTP `GET /api/v1/trade/orders` 把它们传给 `listOrders`；OpenAPI 文档随契约生成。
3. 存储：按决定 1、2、4 改 `tradeOrderPageSql`（或其替代的固定语句集合）。
4. 页面 `TradeOrders.tsx`：
   - 控件：伙伴代码（文本输入；若页面已有伙伴选择控件则复用，不新增组件）、方向（全部 / 采购 AP / 销售 AR）、订单日期起、订单日期止，以及“应用”“清除”两个按钮。在任一输入框中按 Enter 等同“应用”。
   - 应用筛选时从首页加载；“加载更多”带上当前筛选；“清除”恢复为无筛选首页；保存新订单成功后按当前筛选刷新首页。
   - 前端先校验日期区间：起 > 止时在控件旁显示错误、不发请求，错误文案经 `aria-describedby` 关联到输入框。
   - 空结果文案区分“还没有订单”和“没有符合条件的订单”。
   - 文案中英双语（`trade-order-labels.ts`）。教学模式：不新增教学组件；如需说明，只在 `tord.teaching` 中补一句，中英同时改，教学模式关时整块不渲染。
5. 基准：`trade-order-list.ts` 增加筛选场景（见验收 3）。

## 不在范围

- 按日期或金额排序、列排序切换、全文搜索、保存筛选方案、URL 中记住筛选条件。
- 发票列表筛选（另立任务）。
- 方向 / 日期索引（决定 2）。
- 改 `trade_orders` 的列、约束、触发器；任何过账、未结项、核销代码。
- `package.json` / lock 变化。

## 验收标准

1. **迁移**（`packages/infra/test`，最低能覆盖的层）：
   - 新账套建库后 `sqlite_schema` 中有 `trade_orders_party`，定义与决定 2 逐字一致；
   - 一个停在 016 的账套（含若干订单）升级到 017 后：索引存在，`trade_orders` 与 `trade_order_lines` 的全部行逐字不变（升级前后比较全部列）；
   - 重复打开已是 017 的账套不再执行迁移、不报错；
   - 现有迁移测试不改、全部通过。
2. **API 契约测试**：
   - 每个参数单独生效：`party`、`side`、`from`、`to` 各一个正例，结果集与按同一条件手工过滤全部订单的结果逐项相同；
   - 组合生效：`party + side + from + to` 同时给出；
   - 筛选下的分页：满足条件的 3 张订单、中间穿插不满足条件的订单、`limit=2`，第一页 2 条且 `nextCursor` 为第 2 条的 `orderId`，第二页 1 条且 `nextCursor` 为 `null`；
   - 日期边界：`from` / `to` 等于订单日期时包含；
   - 400：`side=XX`、`from=2026-13-01`、`from > to`、未知参数；不存在的 `party` 返回空页（不是 400）；
   - 另一公司的订单不出现；TORD-03 的原有列表测试与 `POST` 测试不改、全部通过。
3. **性能（[PG-05](../product-guidelines.md#5-pg-05性能从设计开始)）**：
   - **执行计划**（测试中断言 `EXPLAIN QUERY PLAN` 文本）：带 `party` 的首页与续页显示 `trade_orders` 走 `trade_orders_party`，且条件包含 `party_id=?` 与 `order_id>?`；不带 `party`（无筛选、只有 `side`、只有日期）时走主键 `(company_id=? AND order_id>?)`；所有组合下 `trade_order_lines` 走主键前缀，不出现 `USE TEMP B-TREE`。
   - **无 N+1**：每页语句数固定为 1，与 `limit`、筛选组合、每张订单的行数无关（同 TORD-03 的计数替身）。
   - **热读 p95 ≤ 1 s**：测量边界同 PG-05（本机真实 HTTP 请求发出到完整响应读取并通过契约解析）。以下每个场景各 ≥ 50 次、先预热，**每个场景都必须单独满足 p95 ≤ 1 s**。
   - **夹具**（固定、确定性，写在基准源码里，PR 描述给出生成规则）：沿用现有 1 万张订单、每张 1–20 行的账套，订单号 `PO-000001` … `PO-010000`，另外：
     - 伙伴：50 个，伙伴 `P01` 恰好拥有 100 张订单（1%），按订单号均匀分布；
     - 方向：按订单号交替 AP / AR；
     - 日期：订单号最大的 50 张（`PO-009951` … `PO-010000`）订单日期为 `2026-12-15`，其余 9,950 张都在 `2026-01-01` … `2026-11-30` 之间。
   - **必测场景**：
     - (a) `party=P01`，首页；
     - (b) 只给 `side`，深处续页（游标位于后 10%）；
     - (c) **日期长扫描**：`from=2026-12-01&to=2026-12-31`，无游标首页，`limit=100`。命中的只有订单号最靠后的 50 张，少于一页，查询必须从表头扫到表尾。基准先断言本场景返回 50 条、`nextCursor` 为 `null`，断言通过才计时；
     - (d) TORD-03 原有的无筛选首页与深处续页，作为回归对照。
   - 基准仍放在 `packages/infra/bench`，命令与原始输出附在 PR 描述，**不加到 PR 快速套件**。
   - 任何必测场景不达标时，按决定 2 停下报告设计角色。不自行加索引、改排序或改游标契约，也不调整预算或夹具。
4. **读路径不写库**：沿用 TORD-03 的两条判据（`store.read` 一次 / `store.write` 0 次；独立观察连接在请求前后读到的全部用户表行数与两张订单表的全部主键相同），在带全部四个筛选参数的请求上各做一次。
5. **页面**（jsdom）：
   - 应用、清除、按 Enter 应用；筛选下“加载更多”带上筛选；保存后按当前筛选刷新；
   - 日期区间无效时显示错误、不发请求，错误与输入框经 `aria-describedby` 关联；
   - 两种空结果文案；
   - 键盘：Tab 顺序为 伙伴 → 方向 → 起 → 止 → 应用 → 清除 → 列表，全部可用键盘完成；
   - 现有订单页测试不改、全部通过。
6. 满足 [UI-1 通用验收](README.md#ui-1界面逐步改进) 1–9：中 / 英、红 / 绿两主题、1440 / 390 截图（390 下筛选栏换行、不出现横向滚动）；PG-05 字节预算：新增 CSS gzip ≤ +0.3 kB，JS 按 PG-05 口径报告；真实 Chrome 证据按[路线图 §5 UI PR 证据清单](../roadmap.md#5-团队流程)。
7. 新增的测试文件在 `scripts/test-shard-weights.json` 中有权重条目，CI-01 守卫通过；该文件的改动发生在权重文件门禁满足之后（PR 中写明 rebase 所基于的 main 提交及其 Full run）。
8. 现有测试与 E2E 不删除、不削弱、不跳过、不按平台禁用（D11）。无 `package.json` / lock 变化。
