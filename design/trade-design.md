# 现行贸易设计

本页汇总 M1 之后已合并的贸易设计（KGAP-05，D588）。它只做索引和摘要，不新定规则；出现分歧时以所链任务书、Sprint 决定表和合并代码为准。

- 历史来源（任务书、Sprint 节、早期口径）的链接钉在 `5c43f084b7b4f1cd0c91ce2a39e71275369b8ae8`（本页起草时的 main），PR 后括注的是合并提交的完整 SHA。
- S27 KGAP-06 复核：记录文件 `kgap-06-review.md`（开发会话 files/，不入仓库），复核基线 main `13c3135e4c693b0d42a67a0a3abc2cff9d56c7b8`。按复核修正时新增的代码与任务书出处钉在该基线。
- M1 的基础设计（主数据、计算器、发票与未结项、付款 / 收款与核销、预付 / 贷项 / 取消 / 反向、未结项与账龄、端到端与基准）见 [M1-01](https://github.com/lingshf/ai-native-erp/blob/5c43f084b7b4f1cd0c91ce2a39e71275369b8ae8/design/tasks/M1-01-trade-master-data.md) 至 [M1-07](https://github.com/lingshf/ai-native-erp/blob/5c43f084b7b4f1cd0c91ce2a39e71275369b8ae8/design/tasks/M1-07-trade-e2e-bench.md) 任务书、[M1 评审](https://github.com/lingshf/ai-native-erp/blob/5c43f084b7b4f1cd0c91ce2a39e71275369b8ae8/design/reviews/M1.md) 和[路线图 §3 M1](https://github.com/lingshf/ai-native-erp/blob/5c43f084b7b4f1cd0c91ce2a39e71275369b8ae8/design/roadmap.md#L40-L48)（关系表而不是事件重放的“简化决定”）。本页不重复这些内容。
- 每一主题先写现行规则，再列来源。来源里“决定”指任务书的“设计决定”小节或 Sprint 文件中的决定编号；没有编号的写明“无编号”。

## 1. 订单

现行规则：

- 录入：订单最多 100 行；税额只由服务端计算，客户端不算（PG-01）。来源：M1-R1a [任务书](https://github.com/lingshf/ai-native-erp/blob/5c43f084b7b4f1cd0c91ce2a39e71275369b8ae8/design/tasks/M1-R1a-trade-order-entry-page.md)，[#91](https://github.com/lingshf/ai-native-erp/pull/91)（`71e3c8eeb534ed344a64193cd2637f56a6ad3853`）。
- 列表：`GET /api/v1/trade/orders` 按 `order_id` 升序 keyset 分页，`limit` 1–500，页面用“加载更多”。来源：TORD-03 [任务书](https://github.com/lingshf/ai-native-erp/blob/5c43f084b7b4f1cd0c91ce2a39e71275369b8ae8/design/tasks/TORD-03-trade-order-list.md)，[#132](https://github.com/lingshf/ai-native-erp/pull/132)（`267d067f15c02b1acb4e65ac6bee3e8cb4547894`）。
- 预览：`POST /api/v1/trade/orders/preview` 与创建共用同一计算，不写库、不占订单号；任一字段改动后“预览”标记清除。来源：TORD-04 [任务书](https://github.com/lingshf/ai-native-erp/blob/5c43f084b7b4f1cd0c91ce2a39e71275369b8ae8/design/tasks/TORD-04-trade-order-preview.md)，[#138](https://github.com/lingshf/ai-native-erp/pull/138)（`7aac72f1bc77fc9aa3becaa9907d4d4ca4d2d16e`）。
- 筛选：`party`、`side`、`from`、`to`（订单日期，闭区间），组合为 AND；排序与游标不变；迁移 017 只加 `trade_orders_party(company_id, party_id, order_id)`；每页只执行一条语句。基准以 p95 ≤ 1000 ms 判定通过（[`bench/trade-order-list.ts:34,207-211`](https://github.com/lingshf/ai-native-erp/blob/13c3135e4c693b0d42a67a0a3abc2cff9d56c7b8/packages/infra/bench/trade-order-list.ts#L207-L211)）；p95 超过 1 s 时停下报告设计角色是任务书规定的人工流程（[TORD-05:29](https://github.com/lingshf/ai-native-erp/blob/13c3135e4c693b0d42a67a0a3abc2cff9d56c7b8/design/tasks/TORD-05-trade-order-list-filters.md#L29)）。依据任务书，本轮未实测。来源：TORD-05 [设计决定 1–5，D597](https://github.com/lingshf/ai-native-erp/blob/5c43f084b7b4f1cd0c91ce2a39e71275369b8ae8/design/tasks/TORD-05-trade-order-list-filters.md#L25-L35)，[#161](https://github.com/lingshf/ai-native-erp/pull/161)（`9421906712ca9aa794bd167fbb11a901dc9f8cd8`）。
- 开票状态：列表与筛选读已保存的状态表 `trade_order_invoicing`（`none` / `partial` / `full`，迁移 019），在发票过账与取消的同一事务内刷新；筛选为单选，排序不做。来源：TORD-06（D371）[S12 节](https://github.com/lingshf/ai-native-erp/blob/5c43f084b7b4f1cd0c91ce2a39e71275369b8ae8/design/tasks/S12.md#L123-L150)，[#209](https://github.com/lingshf/ai-native-erp/pull/209)（`6afaef980660a573aff95019ee115ff419d5ca07`）。
- 地址栏：订单筛选写入地址，规则与发票页相同（只用 replace；地址是唯一来源；任一键无效时整组忽略并提示）；`order` 与筛选可同时存在；订单详情小数用 `formatDecimal`。来源：TORD-07 [S13 节决定 1–9](https://github.com/lingshf/ai-native-erp/blob/5c43f084b7b4f1cd0c91ce2a39e71275369b8ae8/design/tasks/S13.md#L142-L152)，[#223](https://github.com/lingshf/ai-native-erp/pull/223)（`453b382e3e3d4d019e6b6f80fda57589a50333a3`）。
- 订单详情第 8 列“贷项冲回数量”：只读显示；“已开票数量”仍是净数。来源：TORD-08 [S16 节](https://github.com/lingshf/ai-native-erp/blob/5c43f084b7b4f1cd0c91ce2a39e71275369b8ae8/design/tasks/S16.md#L53-L80)，[#262](https://github.com/lingshf/ai-native-erp/pull/262)（`fe371bf2d3bfc1335e99fddc87b011e67820b1b8`）。
- 订单页“刷新列表”：按地址里已应用的筛选重读第一页，不改地址与历史、不弹离开确认、不清草稿。来源：TLIST-01 [S17 节设计决定](https://github.com/lingshf/ai-native-erp/blob/5c43f084b7b4f1cd0c91ce2a39e71275369b8ae8/design/tasks/S17.md#L144-L152)，[#271](https://github.com/lingshf/ai-native-erp/pull/271)（`0ce9940425f673c757a4a55ba3169342dd6e4ab7`）。

## 2. 从订单开票

现行规则：

- 已开票数量只有一个谓词：未取消发票上引用该订单行的数量，减去这些发票行上未取消贷项的数量。过账匹配、订单详情、开票状态共用此谓词。
- 被贷项冲回的数量可以再开票；取消贷项使已开票数量恢复，即使因此超过订单数量也不拒绝。过账时超量开票直接拒绝（[`trade-documents.ts:799-800`](https://github.com/lingshf/ai-native-erp/blob/13c3135e4c693b0d42a67a0a3abc2cff9d56c7b8/packages/core/src/domain/trade-documents.ts#L799-L800)），匹配例外只针对价格偏差；取消贷项不受此限。[S15 决定 4](https://github.com/lingshf/ai-native-erp/blob/13c3135e4c693b0d42a67a0a3abc2cff9d56c7b8/design/tasks/S15.md#L132) 原写“与现行‘超量开票需匹配例外、但不禁止’一致”，现行代码已与该说法不同，以代码为准。贷项过账与取消时在同一事务内刷新开票状态；迁移 020 只重算，不改 schema。
- 开票入口：`GET /api/v1/trade/orders/:orderId/invoicing` 返回逐行已开票数量；发票页 `?company=&fromOrder=` 生成新草稿，带入每个剩余未开票数量大于 0 的行（含部分开票的行），数量填剩余量；`fromOrder` 是一次性参数，页面读取时即用 replace 移除，不等草稿生成成功。
- 订单详情显示已开票 / 未开票数量、“已开完”标记与“开票”入口。

来源：

- TINV-01 [设计决定](https://github.com/lingshf/ai-native-erp/blob/5c43f084b7b4f1cd0c91ce2a39e71275369b8ae8/design/tasks/TINV-01-invoice-from-order.md#L23-L39)（D242），[#171](https://github.com/lingshf/ai-native-erp/pull/171)（`ad57e6a00983fa9286d5b62730a096573ecea7e3`）；
- TINV-02 [任务书](https://github.com/lingshf/ai-native-erp/blob/5c43f084b7b4f1cd0c91ce2a39e71275369b8ae8/design/tasks/TINV-02-order-invoice-entry.md)（D247、D248），[#172](https://github.com/lingshf/ai-native-erp/pull/172)（`3720e96ebc538ca85b1fbcac05d1028cca643cdc`）；
- TINV-03 [设计决定](https://github.com/lingshf/ai-native-erp/blob/5c43f084b7b4f1cd0c91ce2a39e71275369b8ae8/design/tasks/TINV-03-order-list-invoicing-status.md#L24-L35)（D267；深链接 `#/trade-orders?company=&order=`，“参数缺省 = 默认值，参数出现 = 必须校验”），[#179](https://github.com/lingshf/ai-native-erp/pull/179)（`e91a3f499cf6146ab6a8beb8c0e853bca8f29fb2`）；
- TINV-09 [S15 节决定 1–7](https://github.com/lingshf/ai-native-erp/blob/5c43f084b7b4f1cd0c91ce2a39e71275369b8ae8/design/tasks/S15.md#L129-L140)，[#250](https://github.com/lingshf/ai-native-erp/pull/250)（`bfeccb750e555f797282edfd1ff66542e7ad8d9d`）。

## 3. 发票列表与详情

现行规则：

- “来源订单”列链接到订单。离开确认用两个 hook，只有普通导航的行为相同：
  - 文案键：共用 `useInvoiceLeaveGuard` 的五个贸易页（发票、付款 / 收款、调整、报表、期间准入）用 `trade.leaveConfirm`；订单页用自己的 `useOrderLeaveGuard`，文案键 `tord.leaveConfirm`（[`TradeOrders.tsx:26`](https://github.com/lingshf/ai-native-erp/blob/13c3135e4c693b0d42a67a0a3abc2cff9d56c7b8/packages/web/src/TradeOrders.tsx#L26)）。
  - 共有行为：站内普通链接点击（左键、无修饰键、非 `_blank`）与前进 / 后退，busy 时不放行；有未保存输入时先确认，每次导航只确认一次。
  - 差异：带修饰键的点击，订单 hook 一律放行（[`use-order-leave-guard.ts:20-30`](https://github.com/lingshf/ai-native-erp/blob/13c3135e4c693b0d42a67a0a3abc2cff9d56c7b8/packages/web/src/trade-orders/use-order-leave-guard.ts#L20-L30)）；共用 hook 在 busy 时也不放行（[`use-invoice-leave-guard.ts:26-37`](https://github.com/lingshf/ai-native-erp/blob/13c3135e4c693b0d42a67a0a3abc2cff9d56c7b8/packages/web/src/trade-invoices/use-invoice-leave-guard.ts#L26-L37)）。
  - busy：未保存不算 busy（D264）；但发票页的预览与 `fromOrder` 读取期间也设 busy（[`invoice-entry-commands.ts:127,161`](https://github.com/lingshf/ai-native-erp/blob/13c3135e4c693b0d42a67a0a3abc2cff9d56c7b8/packages/web/src/trade-invoices/invoice-entry-commands.ts#L127)），不只是提交。
  - 来源：TINV-04 [设计决定](https://github.com/lingshf/ai-native-erp/blob/5c43f084b7b4f1cd0c91ce2a39e71275369b8ae8/design/tasks/TINV-04-invoice-list-source-order.md#L22-L36)（另有 D285、D288、D291、D292），[#181](https://github.com/lingshf/ai-native-erp/pull/181)（`6478d105bf007e87198f9272f8248811078ebc12`）。
- 筛选：`party`、`side`、记账日期 `from` / `to`（闭区间；选记账日期是因为列表、期间、账龄都用它）；按 `sequence` 倒序；迁移 018 只加 `trade_documents_party(company_id, party_id, sequence)`。来源：TINV-05 [设计决定 1–4，D598](https://github.com/lingshf/ai-native-erp/blob/5c43f084b7b4f1cd0c91ce2a39e71275369b8ae8/design/tasks/TINV-05-invoice-list-filters.md#L27-L37)，[#189](https://github.com/lingshf/ai-native-erp/pull/189)（`108684d2ee2ff9b5454f3a8c79ba912afd8bef30`）。
- 详情：只读模态对话框，每次打开都重新读取；教学模式开时显示凭证、控制科目与未结项的说明。来源：TINV-06 [设计决定](https://github.com/lingshf/ai-native-erp/blob/5c43f084b7b4f1cd0c91ce2a39e71275369b8ae8/design/tasks/TINV-06-invoice-detail-dialog.md#L23-L39)（D349、D353、D359），[#199](https://github.com/lingshf/ai-native-erp/pull/199)（`4bf2dccecc4766e74d96c4ff1d49bb65e746b5c4`）。
- 地址栏：`?invoice=` 深链接，筛选写入地址；只用 replace；地址是唯一来源；无效时整组忽略；`cursor`、`limit` 不写入地址；前端与服务端用同一小写 UUIDv4 规则（前端 [`TradeInvoiceDetail.tsx:30`](https://github.com/lingshf/ai-native-erp/blob/34ec97c9dfe0e309d657b3a07e4f9272ba2f14ab/packages/web/src/TradeInvoiceDetail.tsx#L30)，服务端 [`trade-document-http.ts:9`](https://github.com/lingshf/ai-native-erp/blob/34ec97c9dfe0e309d657b3a07e4f9272ba2f14ab/packages/infra/src/http/trade-document-http.ts#L9)），不符合的发票号不发请求，直接按“不存在”处理（BUG-05 [#448](https://github.com/lingshf/ai-native-erp/pull/448) 修正）。来源：TINV-07（D370；另有 D385、D386、D390、D399）[S12 节](https://github.com/lingshf/ai-native-erp/blob/5c43f084b7b4f1cd0c91ce2a39e71275369b8ae8/design/tasks/S12.md#L51-L122)，[#208](https://github.com/lingshf/ai-native-erp/pull/208)（`676d4f7045d9bd9fba8528d28ddabc17a22966a8`）。
- 打磨：筛选栏间距；匹配状态与未结项状态用 `Badge`（`poMatchTone`、`openItemTone`）；合计在 1440 下排一行（依据任务书，未实测：要求见 [S12:348](https://github.com/lingshf/ai-native-erp/blob/13c3135e4c693b0d42a67a0a3abc2cff9d56c7b8/design/tasks/S12.md#L348)，对应 CSS 规则在 [`trade-invoices.css:125-132`](https://github.com/lingshf/ai-native-erp/blob/13c3135e4c693b0d42a67a0a3abc2cff9d56c7b8/packages/web/src/pages/trade-invoices.css#L125-L132)，渲染宽度需截图核实）；小数用 `formatDecimal`。来源：TINV-08（D406）[S12 节](https://github.com/lingshf/ai-native-erp/blob/5c43f084b7b4f1cd0c91ce2a39e71275369b8ae8/design/tasks/S12.md#L324-L353)，[#219](https://github.com/lingshf/ai-native-erp/pull/219)（`ab2ba1c9452e04a043a93de4eb57b91bff19fa91`）。
- 发票页“刷新列表”：与订单页同一含义。来源：TLIST-01，同第 1 节。

## 4. 付款 / 收款与调整

现行规则：

- 调整页的未结项选择保留原生 `select` 与“加载更多”，不做虚拟滚动；前面加可选的“伙伴”筛选，用现有接口的 `party` 参数在服务端筛选，不改后端。来源：M1-R2b [任务书](https://github.com/lingshf/ai-native-erp/blob/5c43f084b7b4f1cd0c91ce2a39e71275369b8ae8/design/tasks/M1-R2b-trade-adjust-picker-filter.md)（P5），[#90](https://github.com/lingshf/ai-native-erp/pull/90)（`fa7b698623926b2d0dfe1c65d8343968c867b275`）。
- 付款 / 收款页“刷新列表”= `refetch()`，保留草稿、预览与回执，不弹确认。来源：TLIST-06 [任务书](https://github.com/lingshf/ai-native-erp/blob/5c43f084b7b4f1cd0c91ce2a39e71275369b8ae8/design/tasks/TLIST-06-settlements-refresh.md)（D513），[#316](https://github.com/lingshf/ai-native-erp/pull/316)（`eac0c373b236e290e214a8128566d9da00cf6cd7`）。
- 已选但不再未结的项：只在不处于读取中、已加载且没有下一页时判断；显示警告和“移除这些项”按钮，从不自动移除。来源：TSET-01 [任务书](https://github.com/lingshf/ai-native-erp/blob/5c43f084b7b4f1cd0c91ce2a39e71275369b8ae8/design/tasks/TSET-01-settlement-missing-selections.md)（D516、D518、D520、D523），[#320](https://github.com/lingshf/ai-native-erp/pull/320)（`2794c3af198cce1ce1fcfd43ec5d6a8825dd0b6e`）。
- 调整页在途请求结束后总是解除忙碌状态；过期结果照旧按 `sequence` 丢弃（取代，不中止）。无用户可见变化。来源：FIX-TADJ-BUSY [设计决定](https://github.com/lingshf/ai-native-erp/blob/5c43f084b7b4f1cd0c91ce2a39e71275369b8ae8/design/tasks/FIX-TADJ-BUSY-stale-preview-busy.md#L43-L55)、[S17 节](https://github.com/lingshf/ai-native-erp/blob/5c43f084b7b4f1cd0c91ce2a39e71275369b8ae8/design/tasks/S17.md#L206-L212)，[#278](https://github.com/lingshf/ai-native-erp/pull/278)（`b75d30a9bd7fc17fc8065d7eddd1db4293bb6429`）。

## 5. 主数据

- “刷新列表”= `resetQueries`，只读第一页。来源：TLIST-02 [任务书](https://github.com/lingshf/ai-native-erp/blob/5c43f084b7b4f1cd0c91ce2a39e71275369b8ae8/design/tasks/TLIST-02-trade-master-refresh.md)，[#284](https://github.com/lingshf/ai-native-erp/pull/284)（`34b5ae3f75a40aeb79270ec295ddb5fba04c4e5f`）；编号 [D599](tasks/S27.md#s27-期间决定)（S27 补登，见第 10 节）。
- 两个账期天数是 0–3650 的整数：契约与领域层原有的范围校验、折扣天数不大于到期天数的校验不变；TMAS-01 只新增前端校验与提示 `trade.issue.wholeDays`，保留文本框。来源：TMAS-01 [任务书](https://github.com/lingshf/ai-native-erp/blob/5c43f084b7b4f1cd0c91ce2a39e71275369b8ae8/design/tasks/TMAS-01-trade-days-validation.md)（D538、D539），[#342](https://github.com/lingshf/ai-native-erp/pull/342)（`3c9f5fda669151408f170ef21bedd2d5cf54d669`）。

## 6. 报表与容量

- 迁移 016 为账龄与余额查询加覆盖索引。来源：M1-R3 [任务书](https://github.com/lingshf/ai-native-erp/blob/5c43f084b7b4f1cd0c91ce2a39e71275369b8ae8/design/tasks/M1-R3-trade-report-capacity.md)，D51 见[路线图 §6](https://github.com/lingshf/ai-native-erp/blob/5c43f084b7b4f1cd0c91ce2a39e71275369b8ae8/design/roadmap.md#6-决定记录)，[#78](https://github.com/lingshf/ai-native-erp/pull/78)（`fdcfb11cee04d806d5e6a2b24d8fb3737460ed4a`）。

## 7. 路由与校验

- 贸易单据路由按 403 / 405 → 503 → 400 的顺序判断；`documentId`、`itemId` 与 `orderId` 一样先校验，非法时返回 400。来源：BUG-03a / BUG-03b [缺陷候选](https://github.com/lingshf/ai-native-erp/blob/5c43f084b7b4f1cd0c91ce2a39e71275369b8ae8/design/tasks/backlog/BUG.md#L12-L13)（D565，[任务总表“缺陷候选”](https://github.com/lingshf/ai-native-erp/blob/5c43f084b7b4f1cd0c91ce2a39e71275369b8ae8/design/tasks/README.md#L868)），[#383](https://github.com/lingshf/ai-native-erp/pull/383)（`612f46d5111eaf7c02c367e74062079448c2e5f0`）。

## 8. 期初未结项（相关）

旧账 AP/AR 控制科目余额导入为期初未结项，使贸易子账与 GL 一致（D25；交付顺序 D26）。这是迁移范围，只在此指路：M2-03b [任务书](https://github.com/lingshf/ai-native-erp/blob/5c43f084b7b4f1cd0c91ce2a39e71275369b8ae8/design/tasks/M2-03b-legacy-opening-open-items.md)，[#63](https://github.com/lingshf/ai-native-erp/pull/63)（`9bdc1552ca85cae3ec6a1e4cb5889d33f51fc7b7`）。

## 9. 被取代的早期口径

| 早期口径 | 出处 | 现行口径 |
| --- | --- | --- |
| 订单页不做列表、不做保存前预览 | M1-R1a [设计决定 P2](https://github.com/lingshf/ai-native-erp/blob/5c43f084b7b4f1cd0c91ce2a39e71275369b8ae8/design/tasks/M1-R1a-trade-order-entry-page.md#L11) | TORD-03 列表、TORD-04 预览（第 1 节） |
| 已开票数量不扣贷项 | TINV-01 [决定 2](https://github.com/lingshf/ai-native-erp/blob/5c43f084b7b4f1cd0c91ce2a39e71275369b8ae8/design/tasks/TINV-01-invoice-from-order.md#L31) | TINV-09 扣除未取消贷项（第 2 节） |
| 订单列表不加开票状态列与筛选 | TINV-02 [决定 4](https://github.com/lingshf/ai-native-erp/blob/5c43f084b7b4f1cd0c91ce2a39e71275369b8ae8/design/tasks/TINV-02-order-invoice-entry.md#L23) | TINV-03 状态列、TORD-06 筛选 |
| 开票状态按页聚合 | TINV-03 [决定 2](https://github.com/lingshf/ai-native-erp/blob/5c43f084b7b4f1cd0c91ce2a39e71275369b8ae8/design/tasks/TINV-03-order-list-invoicing-status.md#L29) | TORD-06 状态表 |
| 发票筛选不进地址栏 | TINV-05 [决定 5，D598](https://github.com/lingshf/ai-native-erp/blob/5c43f084b7b4f1cd0c91ce2a39e71275369b8ae8/design/tasks/TINV-05-invoice-list-filters.md#L38) | TINV-07 写入地址栏 |
| 发票详情不改地址栏 | TINV-06 [决定 2](https://github.com/lingshf/ai-native-erp/blob/5c43f084b7b4f1cd0c91ce2a39e71275369b8ae8/design/tasks/TINV-06-invoice-detail-dialog.md#L26) | TINV-07 `?invoice=` 深链接 |
| 订单开票状态筛选不写地址栏 | TORD-06 [S12 节](https://github.com/lingshf/ai-native-erp/blob/5c43f084b7b4f1cd0c91ce2a39e71275369b8ae8/design/tasks/S12.md#L147) | TORD-07 写入地址栏 |

## 10. 缺口

- 订单只插入、不修改、不取消：原始决定记录仍未找到；已按 D564 方式**事后补记**为 [D600](tasks/S27.md#s27-期间决定)（现状依据为 `010-trade-documents.sql:160-163` 的触发器与订单接口，钉 `13c3135e4c693b0d42a67a0a3abc2cff9d56c7b8`；开票状态由开票派生，改它不算修改订单；备选“原记录未写”）。现状描述见 TORD-06（[S12.md:130](https://github.com/lingshf/ai-native-erp/blob/5c43f084b7b4f1cd0c91ce2a39e71275369b8ae8/design/tasks/S12.md#L130)）。
- TORD-05 的设计决定已补登为 [D597](tasks/S27.md#s27-期间决定)；TINV-05 的设计决定已补登为 [D598](tasks/S27.md#s27-期间决定)（其决定 5 已被 TINV-07 取代）。
- TORD-03、TORD-04 不登记决定编号（TL，S27 KGAP-08）：两份任务书都没有独立的“设计决定”小节，接口、页面与实现约束写在各自“范围”节里（[TORD-03:14-28](https://github.com/lingshf/ai-native-erp/blob/13c3135e4c693b0d42a67a0a3abc2cff9d56c7b8/design/tasks/TORD-03-trade-order-list.md#L14-L28)、[TORD-04:13-24](https://github.com/lingshf/ai-native-erp/blob/13c3135e4c693b0d42a67a0a3abc2cff9d56c7b8/design/tasks/TORD-04-trade-order-preview.md#L13-L24)，@ `13c3135e4c693b0d42a67a0a3abc2cff9d56c7b8`），其中也有选择（如 TORD-03 把筛选与索引迁移留给独立任务，即后来的 TORD-05 / D597）。这些约束仍以原任务书为准，不单独补登编号；规则摘要见第 1 节。
- TLIST-02 任务书写的是“决定：待协调者定编号”（[TLIST-02:3](https://github.com/lingshf/ai-native-erp/blob/13c3135e4c693b0d42a67a0a3abc2cff9d56c7b8/design/tasks/TLIST-02-trade-master-refresh.md#L3)），已补登为 [D599](tasks/S27.md#s27-期间决定)；任务书原文未改，编号以 D599 为准。
- TINV-07/08/09、TORD-06/07/08、TLIST-01 没有独立任务书，设计写在 S12、S13、S15、S16、S17 的 Sprint 文件里（FIX-TADJ-BUSY 有独立任务书，见第 4 节）。
- 用户文档与流程图的事实核对与钉点归 Knowledge Lead，见 [`docs/README.md`](https://github.com/lingshf/ai-native-erp/blob/5c43f084b7b4f1cd0c91ce2a39e71275369b8ae8/docs/README.md#L105) 的贸易行。
