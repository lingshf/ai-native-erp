# TINV-04 发票列表“来源订单”列

- Sprint：S9（[计划](README.md#s9订单--发票双向可追溯--v080-回顾行动建议-v090)）　依赖：TINV-03（仅开工可并行；见下“评审门禁”）　建议分支：`tinv-04-invoice-list-source-order`
- 冲突域（逐个列文件）：
  - 存储：`packages/infra/src/storage/trade-documents.ts` 的 `tradeDocumentPage`（`:689` 起）多取 `order_id`；保留现有 `INDEXED BY trade_documents_company`，不改 WHERE / ORDER BY。
  - contracts：`packages/core/src/contracts/trade-documents.ts` 的 `tradeInvoicePageSchema` 列表项（`:469–486`）与随之生成的 `TradeInvoicePage` OpenAPI 组件。
  - trade-docs：`packages/core/src/domain/trade-documents.ts:196` 的 `TradeDocumentSummary` 类型加 `orderId`（只改类型）。
  - web-ui:trade：`TradeInvoices.tsx` 的 `InvoiceList`（`:1006` 起）、`ui/trade-labels.ts` 中 `tinv.*`、`pages/trade-invoices.css` 及发票页测试。
  - 共享单文件：上面的 contracts 与存储文件、`scripts/test-shard-weights.json`（TINV-03 在前，见 [S9 泳道](README.md#s9订单--发票双向可追溯--v080-回顾行动建议-v090)）。
  - **不涉及**：迁移 / schema、领域过账、发票请求 schema 与发票详情 / 过账响应 schema、web-ui:trade-orders（`?order=` 由 TINV-03 实现，本任务只生成链接）、`components.css`、`App.tsx`、`contrast.test.ts`。
- 类型：存储读 + 契约（只加响应字段）+ 页面
- 优先级：P1（S9 的产品功能，A 线第二项）
- 来源：产品负责人选题（S9 计划“目标”，D263）。

## 现状（main `deb80fc`）

- 发票列表接口 `GET /api/v1/trade/invoices`（`packages/infra/src/http/trade-documents.ts:182`）返回 `tradeInvoicePageSchema`（`packages/core/src/contracts/trade-documents.ts:469–486`，严格 schema），列表项没有 `orderId`；存储 `tradeDocumentPage` 的 SELECT 也不取 `order_id`（`packages/infra/src/storage/trade-documents.ts:689–712`）。
- `trade_documents.order_id` 在过账时已写入（发票带订单时），可以为空。
- 发票页没有详情视图；列表上看不出发票来自哪张订单，要回到订单只能手工抄订单号。

## 设计决定（产品负责人）

1. `tradeInvoicePageSchema` 列表项增加必填 `orderId: string | null`；未关联订单为 `null`，不省略字段。只改这一处响应 schema。
2. 列表新列“来源订单”（英文 Source order）：有订单时显示订单号，是指向 `/trade-orders?company=<当前公司>&order=<orderId>` 的链接；没有时显示“—”，并给读屏文字“无来源订单”。
3. 链接是普通 `<a href>`（路由 Link），可用键盘激活、可在新标签页打开；不自带确认框。发票页草稿有未保存改动时，沿用发票页现有的离开确认（`useInvoiceLeaveGuard`，`TradeInvoices.tsx:199`）。

## 范围

1. 存储 SELECT 多取 `order_id` 并映射为 `orderId`。
2. contracts 与 OpenAPI 组件；`TradeDocumentSummary` 类型。
3. `InvoiceList` 新列与文案（中英）。
4. 测试：存储、接口、web 单测；从发票列表点链接到达订单详情的端到端用例；权重登记。

## 入口参数与异常

本任务不读取新的地址参数；生成的链接由 TINV-03 的“入口参数与异常”表处理（公司不存在、订单号无效、订单不存在、其他失败）。本任务只需保证生成的 `company` 是发票页当前公司代码、`order` 是接口返回的原值，并做 URL 编码。

## 不在范围

- 发票详情页；按来源订单筛选发票；在订单详情列出相关发票。
- 订单页 `?order=` 的实现与异常处理（TINV-03）。
- 迁移、新增索引。

## 验收标准

1. 采购、销售各有一张关联订单的发票和一张不关联的发票：接口分别返回订单号与 `null`；列表分别显示链接与“—”。
2. 契约：`tradeInvoicePageSchema` 列表项多出必填 `orderId`（可为 `null`）；发票请求 schema、详情与过账响应 schema 的 `git diff` 为空；OpenAPI 测试覆盖新字段。
3. 存储：`tradeDocumentPage` 的 SQL 仍带 `INDEXED BY trade_documents_company`，WHERE / ORDER BY 不变；发票列表现有测试不改仍通过。
4. 链接：web 用例断言 `href` 为 `/trade-orders?company=<当前公司>&order=<编码后的订单号>`，含需要编码的字符；键盘 Tab 可达并以 Enter 激活。
5. 端到端：从发票列表点链接，到达 TINV-03 的订单详情，显示的就是该订单（采购、销售各一次；满足 [S8 评审遗留 5](../reviews/S8.md#5-遗留项均不阻塞-v080) 中“销售方向”的覆盖）。
6. UI：中英文案；红 / 绿主题；390 px 宽度下列不溢出（可以隐藏或换行，PR 正文写明选择）。
7. 证据：真实 Chrome 证据按[路线图 §5 UI PR 证据清单](../roadmap.md#5-团队流程) 1–8 项，在独占时段内用 PR head 取证；PG-05 在预算内，数字绑定最终送审 head。
8. 无迁移；新增测试文件登记权重并通过守卫。

## 评审门禁

TINV-03 合并、且覆盖其合并提交的 main Full 变绿之前，TINV-04：

- 不 rebase 上述共享单文件的改动、不改权重文件；
- 只按本任务书写定的形状（`orderId` 字段、`?order=` 链接）开发，只跑 mock fetch 的 web 测试；
- 不跑真实接口路径（端到端、真实 Chrome），不请求评审。

门禁满足后依次 rebase → 登记权重（如有）→ 独占时段内跑端到端并取证 → 请求评审。

## 证据要求

- 真实 Chrome：发票列表（采购、销售，含“—”一行）截图，红 / 绿主题各一；点链接到达订单详情一次。
- 断言对照（证据清单第 7 项）：列出每条文本断言对应的 `tinv.*` 键与组件 `file:line`，以及 `orderId` 在响应 schema 中的位置。

## 设计自查（路线图 §5 设计文档自查 1–8）

- [x] 1 事实断言有来源
- [x] 2 不涉及进行中的 PR
- [x] 3 依赖列与泳道说明一致（仅开工可并行，门禁同上）
- [x] 4 不新增共享 CSS
- [x] 5 覆盖类断言给出 `file:line`
- [x] 6 共享单文件已列入 S9 泳道
- [x] 7 入口参数：本任务不读新参数，生成链接的异常由 TINV-03 处理
- [x] 8 改动条款已通读上下文
