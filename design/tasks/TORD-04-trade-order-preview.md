# TORD-04 订单保存前预览

- Sprint：S6（[计划](README.md#s6订单列表与保存前预览--s5-遗留收尾建议-v060)）　依赖：[TORD-03](TORD-03-trade-order-list.md) 合并（同冲突域串行）　建议分支：`tord-04-trade-order-preview`
- 冲突域：同 TORD-03：trade-docs、contracts、web-ui:trade-orders
- 类型：后端 API + 页面
- 来源：S4 决定 P2 的后半（[M1-R1a](M1-R1a-trade-order-entry-page.md#设计决定-p2产品负责人按现有-api-收窄范围)）：保存前不显示任何金额，只在保存成功后显示服务端返回的 `net` / `tax` / `gross`。发票页已有保存前预览（`POST /api/v1/trade/invoices/preview`，`TradeInvoices.tsx:393`），订单页没有，两页体验不一致。

## 现状（main `49d936b`）

- `createOrder`（`packages/core/src/application/trade-documents.ts:711` 起）在写事务内：校验命令 → 解析公司、伙伴、税码 → 调用纯函数 `calculateTrade`（M1-02）→ 写入。
- 发票预览 `preview`（同文件 :1049）是只读的同类流程，路由在 `http/trade-documents.ts:138–144`。

## 范围

1. **API**：`POST /api/v1/trade/orders/preview`，请求体与 `POST /api/v1/trade/orders` 相同（`tradeOrderCommandSchema`），返回订单行的 `net` / `tax` / `gross` 及合计，不写库、不占用 `orderId`。
   - 实现：把 `createOrder` 中“解析 + 计算”这一段提取为一个共用的私有方法，`createOrder` 和新的 `previewOrder` 都调用它，**保证两者金额同源**。`createOrder` 的外部行为（幂等、`commandHash`、重复号 409）逐字不变。
   - 预览走读事务；`orderId` 已存在时不报错（预览不关心号是否被占用），保存时仍按原规则报 409。
   - 新契约 `tradeOrderPreviewSchema`；用例权限 `previewOrder: "read"`。
2. **页面**：订单录入表单增加“预览”按钮，位置和行为同发票页的预览：
   - 预览成功后，在行表格和合计区显示服务端返回的金额，并标为“预览”（`Badge`），表单任一字段改动后清除预览，避免显示过期数字；
   - 仍**不在客户端算税**（PG-01）；
   - 保存成功后显示的仍是保存返回的金额（与现状一致）；
   - 预览失败（校验错误、税码缺失等）在 `MessageBar` 中显示，字段级错误定位到对应输入；
   - 中英双语；教学模式下沿用该页 `TeachingTip`，可补一句“预览不保存、不占号”，教学模式关时不渲染。

## 验收标准

1. 金额同源：对同一命令，预览返回的每行 `net` / `tax` / `gross` 与随后 `POST` 保存返回的逐项相等。至少覆盖 4 组：价内税 / 价外税 × 行舍入 / 整单舍入，其中一组含折扣与应税费用，一组为 AP、一组为 AR。
2. 读路径不写库，用两条互相独立的判据，都要有：
   - **事务模式**：应用层测试中给 store 装一个记录调用的替身，`previewOrder`只调用 `store.read` 一次，`store.write` 调用 0 次；
   - **持久变化**：HTTP 层测试另开一个**独立的观察连接**（不是处理请求的那个连接）连到同一账套文件，请求前后各读一次全部用户表（`sqlite_schema` 中 `type='table'` 且不以 `sqlite_` 开头）的行数与 `trade_orders`、`trade_order_lines` 的全部主键，两次结果相同。
   - 不用 `PRAGMA data_version`：在执行请求的同一连接上读取时，它不反映该连接自己的提交。
   - 对已存在的 `orderId` 预览返回 200，随后用不同内容保存仍返回 409。
3. `createOrder` 原有测试不改、全部通过。
4. **性能（[PG-05](../product-guidelines.md#5-pg-05性能从设计开始)）**：≤ 100 行的预览 p95 ≤ 2 s，测量边界同 PG-05（本机真实 HTTP 请求到完整响应并通过契约解析）。覆盖 100 行、价内税与整单舍入，≥ 50 次请求，先预热。PR 描述列出一次预览的 SQL 语句数及其随行数的变化（与 `createOrder` 的解析段相同，不新增逐行查询）。基准放 `packages/infra/bench`（main / 每晚）或作为独立取证附在 PR 描述，**不加到 PR 快速套件**。
5. 页面：jsdom 测试覆盖预览显示、改字段后清除、预览失败提示、键盘操作（Tab 到“预览”，Enter 触发，焦点留在按钮上或移到结果区的规则写进 PR 描述并测试）。
6. 满足 [UI-1 通用验收](README.md#ui-1界面逐步改进) 1–9（两主题、1440 / 390、PG-05 新增 CSS gzip ≤ +0.3 kB），真实 Chrome 证据按[路线图 §5 UI PR 证据清单](../roadmap.md#5-团队流程)，含一次“预览 → 保存”的完整路径截图。
7. 现有测试与 E2E 不删除、不削弱（D11）。无迁移、无 `package.json` / lock 变化。
