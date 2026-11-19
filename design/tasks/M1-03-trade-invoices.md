# M1-03 费用采购发票、服务销售发票与未结项

- 里程碑：M1　依赖：M1-01、M1-02、M0-R1（控制科目受控过账 + 单据/税日期，由 M0 评审新增）　建议分支：`trade-invoices`

## 目标

实现 [FR-T03（简化）与 FR-T04](../requirements.md)：发票形成真实未结项与 GL；订单行匹配。

## 范围

- **简化决定（路线图 M1）**：不做事件全量重放 + 投影缓存（取代 FR-T03 的重放要求与 NFR-T01）。用关系表 `trade_documents`、`trade_document_lines`、`open_items`、`settlements`（后者在 M1-04 使用）+ 索引；在同一 `BEGIN IMMEDIATE` 事务写单据、未结项、GL、回执、审计；复用 M0-10 预览（零写入、指纹）/确认/幂等管道。
- 费用采购发票：供应商未结项、费用与可抵扣税；服务销售发票：客户未结项、收入与销项税；无库存/COGS。
- 订单行匹配：非库存订单（最小订单表，仅为匹配所需字段）逐行唯一 `orderLineId`，累计不超剩余数量，按原行净额比例比较价差 1%（含边界），超价需明确例外原因；无 PO 发票标“不适用 PO 匹配”。
- 外部发票号去重：NFKC、去首尾空白、大写，内部空白保留，同伙伴唯一（数据库唯一约束）。
- web：发票录入（键盘友好、预览显示计算明细）、单据列表（虚拟滚动）。
- 贸易适配器：在 M0-R1 的适配器静态表中登记 trade 模块（允许 `controlModule` 为 AP、AR、TAX 中实际用到的项），发票的 GL 只经这个适配器、通过 M0-10 管道过账到 AP/AR 控制科目。
- 日期（[FR-T02](../requirements.md)）：税率按发票 `taxDate` 在税码有效期中选取；GL 记账和期间校验按 `accountingDate`；付款条件起算按单据日期（`documentDate`）。

行为参考：stash `b9f00dbf` 中 `src/enterprise-trade.mjs` 发票部分、`public/enterprise-trade.js`、对应测试。

## 验收标准

- FR-T04 每条规则有测试；任一失败全部不变；同幂等键重试返回原回执；原单据不可改删。
- 外部发票号规范化与唯一约束测试（含全角/大小写/内部空白）。
- 控制科目集成验收：采购发票贷记 AP 控制科目、销售发票借记 AR 控制科目，均由已登记的贸易适配器过账成功，GL、未结项、回执一致；同一科目经手工凭证/AI 候选过账仍被拒绝。
- 日期集成验收：税码在某日切换税率时，`taxDate` 在切换日前后的两张发票分别取旧/新税率；`taxDate` 与 `accountingDate` 跨期（如 taxDate 在上月、accountingDate 在本月）时，GL 落在 `accountingDate` 的期间，期间校验也只看 `accountingDate`。M0-R1 的日期字段持久化测试不能代替这两条。
- CI 绿。

## 性能考虑

- 预览/确认 ≤ 100 行 p95 ≤ 2s（在 1M GL 行 + 10 万未结项数据上；M1-07 bench 验证）。
- 索引：`open_items(company_id, party_id, status, due_date)`、`trade_documents(company_id, party_id, external_no_normalized)` 唯一、`order_lines(order_id, line_id)`。

## 测试要求

application 层（真实 SQLite）为主；计算细节不重复测（由 M1-02 覆盖）。
