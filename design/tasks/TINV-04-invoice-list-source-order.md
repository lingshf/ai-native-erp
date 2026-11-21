# TINV-04 发票列表“来源订单”列

- Sprint：S9（[计划](README.md#s9订单--发票双向可追溯--v080-回顾行动建议-v090)）　依赖：TINV-03（仅开工可并行；见下“评审门禁”）　建议分支：`tinv-04-invoice-list-source-order`
- 冲突域（逐个列文件）：
  - 存储：`packages/infra/src/storage/trade-documents.ts` 的 `tradeDocumentPage`（`:689` 起）多取 `order_id`；保留现有 `INDEXED BY trade_documents_company`，不改 WHERE / ORDER BY。
  - contracts：`packages/core/src/contracts/trade-documents.ts` 的 `tradeInvoicePageSchema` 列表项（`:469–486`）与随之生成的 `TradeInvoicePage` OpenAPI 组件。
  - trade-docs：`packages/core/src/domain/trade-documents.ts:196` 的 `TradeDocumentSummary` 类型加 `orderId`（只改类型）。
  - web-ui:trade：`TradeInvoices.tsx` 的 `InvoiceList`（`:1006` 起）与 `useInvoiceLeaveGuard`（`:199–230`）；`ui/trade-labels.ts`（新增离开确认文案）；`pages/trade-invoices.css`；以及调用该 hook 的另外四个页面的调用行与测试：`TradeAdjustments.tsx:129`、`TradePeriodAdmission.tsx:51`、`TradeReports.tsx:105`、`TradeSettlements.tsx:97`（只改调用行，见设计决定 4、5）。
  - 共享单文件（TINV-03 在前，见 [S9 泳道](README.md#s9订单--发票双向可追溯--v080-回顾行动建议-v090)）：`packages/core/src/contracts/trade-documents.ts`（TINV-03 改 `tradeOrderPageSchema`，本任务改 `tradeInvoicePageSchema`）、`packages/core/src/domain/trade-documents.ts`（TINV-03 改 `TradeOrderSummary`，本任务改 `TradeDocumentSummary`）、`packages/infra/src/storage/trade-documents.ts`（TINV-03 改 `tradeOrderPage`，本任务改 `tradeDocumentPage`）、`scripts/test-shard-weights.json`。
  - **不涉及**：迁移 / schema、领域过账、发票请求 schema 与发票详情 / 过账响应 schema、web-ui:trade-orders（`?order=` 由 TINV-03 实现，本任务只生成链接）、`components.css`、`App.tsx`、`contrast.test.ts`。
- 类型：存储读 + 契约（只加响应字段）+ 页面
- 优先级：P1（S9 的产品功能，A 线第二项）
- 来源：产品负责人选题（S9 计划“目标”，D263）。

## 现状（main `deb80fc`）

- 发票列表接口 `GET /api/v1/trade/invoices`（`packages/infra/src/http/trade-documents.ts:182`）返回 `tradeInvoicePageSchema`（`packages/core/src/contracts/trade-documents.ts:469–486`，严格 schema），列表项没有 `orderId`；存储 `tradeDocumentPage` 的 SELECT 也不取 `order_id`（`packages/infra/src/storage/trade-documents.ts:689–712`）。
- `trade_documents.order_id` 在过账时已写入（发票带订单时），可以为空。
- 发票页没有详情视图；列表上看不出发票来自哪张订单，要回到订单只能手工抄订单号。
- 应用用 HashRouter（`packages/web/src/App.tsx:82`），站内链接只改 hash，不触发 `beforeunload`。`useInvoiceLeaveGuard`（`TradeInvoices.tsx:199–230`）对站内链接点击与 `popstate` / `hashchange` **只在 busy 时拦截**；草稿 dirty 只挂 `beforeunload`（`:219–223`），所以 dirty 草稿经站内链接离开时不确认。（D266 更正：发票、结算、调整三页的草稿与结果未知的 pending 按公司保存在 sessionStorage，离开后返回本页能恢复，并不丢失；往来未结项与账龄、期间准入两页的未应用 / 未提交输入离开后不保留。）该 hook 还被另外四个页面使用（见冲突域）。其中两页把 dirty 算进了 busy：`TradeReports.tsx:105` 传 `{ busy: dirty, unsaved: dirty }`，`TradePeriodAdmission.tsx:51–54` 的 busy 为 `busy || pending !== null || dirty || loaded.failed`。所以这两页 dirty 时站内跳转走 busy 分支，被直接阻止，不弹确认；即使 hook 加了 dirty 确认，这两页不改调用行也不会变。订单页的 `useOrderLeaveGuard`（`TradeOrders.tsx:138–183`）已经按“busy 拦截、dirty 用 `window.confirm` 确认、修饰键点击与 `_blank` 放行”处理。

## 设计决定（产品负责人）

1. `tradeInvoicePageSchema` 列表项增加必填 `orderId: string | null`；未关联订单为 `null`，不省略字段。只改这一处响应 schema。
2. 列表新列“来源订单”（英文 Source order）：有订单时显示订单号，是指向 `#/trade-orders?company=<当前公司>&order=<orderId>` 的链接；没有时显示“—”，并给读屏文字“无来源订单”。
3. 链接是路由 Link（`href` 为 `#/trade-orders?…`），可用键盘激活、可在新标签页打开；链接本身不自带确认框。
4. **dirty 草稿离开确认，按通用方案**（协调者倾向，本任务书采纳）：在 `useInvoiceLeaveGuard` 一处修改，规则与 `useOrderLeaveGuard` 相同：
   - busy：照旧拦截，不弹确认；
   - dirty 且不 busy：站内链接点击（左键、无修饰键、非 `_blank`）与 `popstate` / `hashchange` 先弹 `window.confirm`（新增文案键 `trade.leaveConfirm`，中英各一）。**取消**：不跳转，地址与草稿保持原样；**继续**：跳转，草稿按现状处理（发票、结算、调整三页的草稿保留在 sessionStorage，返回可恢复；其余两页的输入不保留；文案中性，见 D266）；
   - 修饰键点击、中键、`_blank`：放行，不弹确认（草稿留在原标签页）；
   - `beforeunload` 不变。

   - **一次导航只确认一次**：浏览器后退 / 前进改 hash 时，`popstate` 与 `hashchange` 可能针对同一次跳转先后触发，hook 只能弹一次确认；取消后恢复原地址时，也不能因恢复动作再触发确认。

   所以“来源订单”链接与导航栏等其他站内链接走同一个确认对话框，不为来源订单单独写确认。现有测试如断言“dirty 时站内跳转不确认”或“dirty 时站内跳转被直接阻止”，停下报告设计，不改断言（D11）。
5. **busy 只表示真正提交，全部调用页统一（D264）**：不保留“dirty 也算 busy、直接阻止”的第二套规则。
   - busy 只在提交请求进行中，或已提交、结果尚未确定时为真；dirty 不算 busy。
   - `TradeReports.tsx:105` 改为 `{ busy: false, unsaved: dirty }`：报表页只有筛选输入，没有提交。筛选输入改了未应用（dirty）时，站内跳转与其他页面一样弹同一个确认框。页内按 `dirty` 禁用的控件（`:173`、`:249`、`:257`、`:320`）不属于 hook，不改。
   - `TradePeriodAdmission.tsx:51–54` 的 busy 去掉 `dirty`，保留 `busy`（请求进行中）、`pending !== null`（已提交的命令等待重试确认）、`loaded.failed`（存储的待确认命令读不出，无法判断是否已提交）。`:56` 的公司切换锁 `lock(...)` 不属于 hook，不改。
   - `TradeAdjustments`、`TradeSettlements`、`TradeInvoices` 的 guard 已由编辑器回调分别给出 busy 与 unsaved，不改映射。
   - hook 签名增加文案参数时，四个调用页都传 `trade.leaveConfirm`。
   - **用户可见变化**（本任务 PR 正文须有此节，逐条写明）：① 发票、调整、核销、期间准入、往来未结项与账龄五页，草稿或输入 dirty 时经站内链接、导航栏或浏览器后退 / 前进离开，改为先弹确认；② 其中往来未结项与账龄与期间准入两页，原来 dirty 时直接阻止站内跳转，现在改为确认后可离开；③ 发票列表新增“来源订单”列。

## 范围

1. 存储 SELECT 多取 `order_id` 并映射为 `orderId`。
2. contracts 与 OpenAPI 组件；`TradeDocumentSummary` 类型。
3. `InvoiceList` 新列与文案（中英）；`useInvoiceLeaveGuard` 的 dirty 确认（设计决定 4）；`TradeReports` 与 `TradePeriodAdmission` 的 busy 映射（设计决定 5）。
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
4. 链接：web 用例断言 `href` 为 `#/trade-orders?company=<当前公司>&order=<编码后的订单号>`，含需要编码的字符；键盘 Tab 可达并以 Enter 激活。
5. 离开确认（设计决定 4）：web 用例在发票草稿 dirty 时，分别用点击与键盘（Enter）激活“来源订单”链接和一个导航栏链接：`confirm` 返回 false → 地址不变、草稿行与输入值保留；返回 true → 到达订单页。busy 时不弹确认且不跳转；草稿干净时不弹确认直接跳转；Ctrl / Meta 点击不弹确认。另在 `TradeAdjustments` / `TradeSettlements` 中任选一页补一条 dirty 取消用例；`TradeReports` 与 `TradePeriodAdmission` 各补一条：dirty 时站内跳转弹确认，取消则地址与输入保留、继续则到达目标（设计决定 5）。
5a. **真实历史导航**（设计决定 4“一次导航只确认一次”）：真实 Chrome 端到端用例一条，只在发票页做，不必每个调用页各写一套。步骤：从另一页经站内链接进入发票页（使历史中有上一条）→ 使草稿 dirty → 浏览器后退（Playwright `page.goBack()`）。
   - 每次后退只弹一次确认：用对话框计数断言恰好 1 次；
   - 取消：URL 仍是发票页地址，发票页标题可见，草稿行与输入值不变；再后退一次仍只弹一次确认；
   - 继续：到达上一页（URL 与页面标题均断言）。
   此用例属慢速端到端，默认 PR CI 不跑；在独占时段内用 PR head 运行，结果与运行命令写入 PR 正文。
6. 端到端：从发票列表点链接，到达 TINV-03 的订单详情，显示的就是该订单（采购、销售各一次；满足 [S8 评审遗留 5](../reviews/S8.md#5-遗留项均不阻塞-v080) 中“销售方向”的覆盖）。
7. UI：中英文案；红 / 绿主题；390 px 宽度下列不溢出（可以隐藏或换行，PR 正文写明选择）。
8. 证据：真实 Chrome 证据按[路线图 §5 UI PR 证据清单](../roadmap.md#5-团队流程) 1–8 项，在独占时段内用 PR head 取证；PG-05 在预算内，数字绑定最终送审 head。
9. 无迁移；新增测试文件登记权重并通过守卫。

## 评审门禁

TINV-03 合并、且覆盖其合并提交的 main Full 变绿之前（下称“门禁前”），TINV-04：

- **不改任何共享单文件**：冲突域列出的四个文件（contracts、domain、存储、权重）都不改，也不 rebase 到含 TINV-03 改动的 main；
- **门禁前可做的 mock-first 工作**，只动 web-ui:trade 的非共享文件：
  1. `useInvoiceLeaveGuard` 的 dirty 确认、`trade.leaveConfirm` 文案、四个调用行（含设计决定 5 的 busy 映射），以及验收 5 的 web 用例（与 `orderId` 无关，可以先完成）；验收 5a 是真实 Chrome 用例，门禁后在独占时段内运行；
  2. 生成 `#/trade-orders?company=…&order=…` 的链接函数及其单测（输入为公司代码与订单号字符串）；
  3. “来源订单”列的组件与样式，按 `orderId: string | null` 的形状写，但列表数据仍由现有 `tradeInvoicePageSchema` 解析，列的渲染用例等门禁后再加；
- 不跑真实接口路径（端到端、真实 Chrome），不请求评审。

门禁满足后依次：rebase → 改共享单文件（contracts、domain、存储）→ 补列渲染用例与接口用例 → 登记权重（如有）→ 独占时段内跑端到端并取证 → 请求评审。

## 性能考虑

按[产品准则](../product-guidelines.md)“性能考虑”小节。

- **规模**：发票列表一页最多 100 张（页面请求 `limit=100`，`TradeInvoices.tsx:1021`），keyset 分页。
- **读写路径与索引**：只读；`tradeDocumentPage` 的 SQL 只在 SELECT 中多取 `order_id`，WHERE / ORDER BY / `INDEXED BY trade_documents_company` 不变（`packages/infra/src/storage/trade-documents.ts:690–691`），访问路径不变。不加索引。
- **查询次数**：每页仍是 1 次，不为来源订单另查订单表。
- **事务 / 锁 / 缓存**：不涉及。
- **前端开销**：每行多一个链接，不额外请求；离开确认只在 busy 或 dirty 时挂监听，与现有 hook 相同。hook 改动会进入五个页面共用的代码。
- **预算与验证**，分两项写：
  1. **发票列表热读 p95：未测**。预算 ≤ 1s 不变。理由：现有 bench 没有发票列表基准（`packages/infra/bench/` 下只有订单列表的 `trade-order-list.ts`），本任务不新增；SQL 只在 SELECT 多取一列，WHERE / ORDER BY / 强制索引不变，每页查询次数仍为 1。静态证据为验收 3 的 SQL 不变断言，不加重复测试。
  2. **PG-05 前端构建体积：必须实测**，不豁免。按 [S9 共同验收](README.md#s9订单--发票双向可追溯--v080-回顾行动建议-v090) 的口径，base 与最终送审 head 各在干净工作区 `npm run build -w packages/web`，贴出每个文件的 gzip 列对照。预算：入口 JS（含新文案）≤ +0.3 kB；含 `useInvoiceLeaveGuard` 与 `InvoiceList` 的 chunk ≤ +1.0 kB；其余四个调用页 chunk 各 ≤ +0.05 kB；CSS 合计 ≤ +0.1 kB。超出时停下报告，按 UI-1 通用验收 9 由评审决定。

## 证据要求

- 真实 Chrome：发票列表（采购、销售，含“—”一行）截图，红 / 绿主题各一；点链接到达订单详情一次。
- 验收 5a 的运行命令、对话框计数与三处断言结果。
- PG-05 构建体积对照表（base、head 各列 SHA）。
- 断言对照（证据清单第 7 项）：列出每条文本断言对应的 `tinv.*` 键与组件 `file:line`，以及 `orderId` 在响应 schema 中的位置。

## 设计自查（路线图 §5 设计文档自查 1–8）

- [x] 1 事实断言有来源
- [x] 2 不涉及进行中的 PR
- [x] 3 依赖列与泳道说明一致（仅开工可并行，门禁同上；四个共享单文件含 domain）
- [x] 4 不新增共享 CSS
- [x] 5 覆盖类断言给出 `file:line`
- [x] 6 共享单文件已列入 S9 泳道
- [x] 7 入口参数：本任务不读新参数，生成链接的异常由 TINV-03 处理
- [x] 8 改动条款已通读上下文（设计决定 5 已核对四个调用页的 guard 映射；性能小节与验收 8 的 PG-05 口径一致）
