# TINV-05 发票列表筛选：伙伴 / 方向 / 记账日期（迁移 018，一条伙伴索引）

- Sprint：S10（[计划](S10.md)）　依赖：无　建议分支：`tinv-05-invoice-list-filters`
- 冲突域（逐个列文件）：
  - **迁移 / schema**：`packages/infra/migrations/sqlite/018-trade-invoice-filters.sql`（新建）、`packages/infra/src/storage/migrations.ts`（文件清单与期望对象清单）。S10 内唯一的迁移任务；**任何另一个要加迁移的任务都不能与它并行**（共用 `migrations.ts` 与编号）。
  - 存储：`packages/infra/src/storage/trade-documents.ts`（`tradeDocumentPage`，`:730–760`）。
  - trade-docs：`packages/infra/src/http/trade-documents.ts`（`GET /api/v1/trade/invoices`，`:182–193`）、`packages/core/src/application/trade-documents.ts`（`tradeDocumentPage` 的查询类型，`:134`、`:1222`）。
  - contracts：`packages/core/src/contracts/trade-documents.ts`（`tradeInvoiceListQuerySchema`，`:451–458`）。
  - web-ui:trade：`packages/web/src/TradeInvoices.tsx`（只改 `InvoiceList`，`:1056` 起）、`packages/web/src/pages/trade-invoices.css`（只加筛选栏规则）、翻译文件、`packages/web/test/trade-invoices.test.tsx`。
  - bench：`packages/infra/bench/trade-invoice-list.ts`（新建）。
  - 共享单文件：`scripts/test-shard-weights.json`（仅在新增测试文件时）；`packages/web/src/pages/trade-invoices.css` 与 CSS-02 共享，本任务在前（见 [S10 泳道](S10.md#泳道)）。
  - **不涉及**：`trade_documents` / `trade_document_lines` 的列、约束与触发器；任何过账、未结项、核销代码；`InvoiceEntry`（草稿表单）与 `useInvoiceLeaveGuard`；`App.tsx`、`leave-guard-history.ts`（GATE-01 的域）；`.tinv-source` 相关规则（CSS-02 的域）。
- 类型：迁移（只加索引）+ 后端 API（请求 schema 增加可选参数）+ 页面
- 优先级：P1（S10 的产品功能）

## 现状（main `f943b8b`）

- 发票列表接口只接受 `company`、`limit`、`cursor`：`tradeInvoiceListQuerySchema` 为严格对象（`packages/core/src/contracts/trade-documents.ts:451–458`），HTTP 层只解构这三个字段（`packages/infra/src/http/trade-documents.ts:186`）。未知参数返回 400（严格对象）。
- 存储按 `sequence` 倒序 keyset 分页，一条语句，强制走 `trade_documents_company`：`packages/infra/src/storage/trade-documents.ts:730–736`；索引定义 `CREATE INDEX trade_documents_company ON trade_documents(company_id,sequence)`（`packages/infra/migrations/sqlite/010-trade-documents.sql:70`）。`trade_documents` 上没有以 `party_id` 开头且按 `sequence` 有序的索引（检索：`Select-String packages\infra\migrations\sqlite\*.sql -Pattern 'INDEX[^(]*trade_document'`，结果只有 `010:69` `trade_documents_external(company_id,party_id,external_no_normalized)`、`010:70`、`010:105`、`012:124` `trade_documents_order_events(company_id,order_id,accounting_date)` 四条）。
- 页面 `InvoiceList`（`packages/web/src/TradeInvoices.tsx:1056–1180`）用 `useInfiniteQuery`，`queryKey` 为 `["trade-invoices", company.code]`（`:1066`），请求 URL 只带 `company`、`limit=100`、`cursor`（`:1071`）；没有任何筛选控件。空列表只有一种文案 `tinv.empty`（`:1164`）。
- `InvoiceList` 在草稿表单 `<form>`（`:631–882`）之外渲染（`:412`），草稿的离开确认只看 `InvoiceEntry` 的状态（`useInvoiceLeaveGuard`，`:203`、`:304`）。
- 订单列表已有同类筛选：TORD-05（迁移 017 只加伙伴索引，`packages/infra/migrations/sqlite/017-trade-order-filters.sql:2`；方向、日期走行内过滤）。本任务沿用其口径，差别见“设计决定”1、5。
- 发票列表热读 p95 至今未测（TINV-04 性能小节标“未测”）；`packages/infra/bench` 下没有发票列表基准（检索：`Get-ChildItem packages\infra\bench`，只有 `trade-order-list.ts` 等，无 `trade-invoice-list*`）。

## 设计决定（产品负责人）

1. **排序与游标不变**：仍按 `sequence` 倒序 keyset 分页，`cursor` 仍是上一页最后一项的 `cursor`。筛选只缩小结果集；筛选条件变化时调用方从首页重新开始（服务端不校验游标与筛选是否同一组）。响应 schema `tradeInvoicePageSchema` 一字不改。
2. **只加一条索引**：迁移文件 `018-trade-invoice-filters.sql`，内容只有一行说明注释和
   `CREATE INDEX trade_documents_party ON trade_documents(company_id, party_id, sequence);`
   - 理由：按伙伴筛选的结果通常只占全部发票的一小部分；有了 `(company_id, party_id, sequence)`，等值 + 游标范围直接 `SEARCH`，并天然按 `sequence` 有序，不需要临时排序。
   - **方向与记账日期不加索引**：方向只有两个值；日期索引要么需要临时排序，要么要改成按日期排序并改游标契约，都超出本任务。两者走 `trade_documents_company` 范围 + 行内过滤，由基准证明在 1 万张发票下满足 PG-05。
   - **验收 3 任何必测场景 p95 超过 1 s，都停下报告设计角色**，附原始输出；不自行加索引、改排序或改游标契约，也不调整预算或夹具。
3. **参数**（都可选，可组合，组合为 AND）：
   - `party`：伙伴代码，与发票列表项 `party` 同一 schema（`companyCodeSchema`）；不校验伙伴是否存在（不存在时返回空页，不是 400）。
   - `side`：`AP` 或 `AR`；其他值 400。
   - `from`、`to`：**记账日期**（列表“记账日期”列，`accountingDate`）`YYYY-MM-DD`，与契约现有的 `day` 同一 schema，闭区间；`from > to` 返回 400。选记账日期而不是单据日期：列表显示的是记账日期，与期间、账龄一致。
4. **SQL 写法**：值一律绑定参数；按“有无 `party`”预先写好的固定语句（有 `party` 时 `INDEXED BY trade_documents_party`，没有时保持 `INDEXED BY trade_documents_company`），方向、日期由固定片段拼出；每页仍只执行**一条**语句。不用 `(? IS NULL OR party_id=?)` 这类写法。
5. **筛选不进地址栏**（与 TORD-05 不同）：发票页同时承载草稿表单、`?company=…&fromOrder=…` 入口（TINV-02）和历史离开确认（TINV-04）。筛选写进 URL 会让每次“应用”都成为一次站内导航，经过离开确认与历史闸门，草稿 dirty 时还会弹确认。因此筛选只放在 `InvoiceList` 组件状态里，不调用 `navigate`、`setSearchParams`、`pushState`、`replaceState`。**可接受的限制**：刷新页面、切换账套或离开再回来后筛选清空，恢复为无筛选首页。
6. **页面**：筛选栏放在发票列表卡片标题下、表格之上，样式同订单列表筛选栏（Dynamics 365 列表筛选），复用现有表单控件与组件规则，不新增全局元素规则。筛选栏是独立的 `<form role="search">`，不嵌套在草稿表单里（草稿表单在 `:631–882`，列表在其外）。
7. **用户可见变化**（PR 正文须有此节，逐条写明并附 `file:line` 或用例名）：
   - ① 发票列表上方新增筛选栏：伙伴、方向（全部 / 采购 AP / 销售 AR）、记账日期起止，“应用”“清除”两个按钮；
   - ② 有筛选且无结果时显示“没有符合条件的发票”，与“还没有发票”区分；
   - ③ 筛选不改变地址栏，刷新或切换账套后清空（决定 5）；
   - ④ 草稿 dirty 时操作筛选栏不弹离开确认（筛选不是离开）。

## 导航与历史

本任务不改地址、不新增 `popstate` / `hashchange` / `beforeunload` 监听，也不改 `useInvoiceLeaveGuard` 与 `leave-guard-history.ts`（决定 5）。“加载更多”与“应用”只改组件状态和查询键。可接受的限制见决定 5。

## 范围

1. 迁移 018（决定 2），在 `migrations.ts` 的文件清单与期望对象清单（`latest >= 18` 时期望 `index:trade_documents_party`）中登记，写法同 `:392` 对 017 的登记。
2. 契约：`tradeInvoiceListQuerySchema` 增加 `party`、`side`、`from`、`to`（决定 3），仍为严格对象，`from <= to` 用与 `tradeOrderListQuerySchema`（`:495–505`）相同的 `refine` 写法；HTTP 把它们传给应用层；OpenAPI 随契约生成。
3. 应用层与存储：`tradeDocumentPage` 的查询类型改为带筛选的专用类型（不改通用 `PageQuery`），存储按决定 1、2、4 改写。
4. 页面 `InvoiceList`：
   - 控件：伙伴代码（文本输入）、方向、记账日期起、记账日期止、“应用”“清除”；在任一输入框按 Enter 等同“应用”；
   - 应用筛选时从首页加载；“加载更多”带上当前已应用的筛选；“清除”恢复无筛选首页；
   - 查询键加入已应用的筛选（如 `["trade-invoices", company.code, filters]`）；现有按前缀 `["trade-invoices", company.code]` 的失效（过账后刷新）仍命中，过账成功后列表按当前筛选刷新；
   - 前端先校验日期区间：起 > 止时在控件旁显示错误、不发请求，错误经 `aria-describedby` 关联输入框；
   - 两种空结果文案；中英双语。
5. 基准 `packages/infra/bench/trade-invoice-list.ts`（验收 3）。

## 入口参数与异常

| 参数 | 情形 | 表现（提示文案键） | 恢复路径（可操作） |
| --- | --- | --- | --- |
| `party` | 格式非法（不符合 `companyCodeSchema`）：前端校验 | 控件旁错误（新键，如 `tinv.filter.partyInvalid`），不发请求 | 改正或点“清除” |
| `party` | 格式非法：直接调用接口 | 400（HTTP 层现有 `parse` 的错误映射，与其他参数相同） | 调用方改参数 |
| `party` | 伙伴不存在 | 空页；页面显示“没有符合条件的发票”（新键，如 `tinv.filter.none`） | 点“清除” |
| `side` | 不是 `AP` / `AR`（只可能来自直接调用；页面用下拉） | 400 | 调用方改参数 |
| `from` / `to` | 格式非法 / 不存在的日期（如 `2026-13-01`） | 页面日期控件不产生非法值；接口 400 | 调用方改参数 |
| `from` / `to` | `from > to` | 页面：控件旁错误（新键，如 `tinv.filter.range`），不发请求；接口 400 | 改日期或“清除” |
| — | 未知参数 | 400（严格对象，现状不变） | — |
| — | 请求失败 / 超时 | 现有错误条 + “重试”（`:1107–1114`） | “重试”按当前筛选重发；“清除”回到无筛选 |
| — | 只有一个账套 | 筛选栏照常可用；恢复路径不依赖切换账套 | 同上 |

## 不在范围

- 筛选写入地址栏、书签或深链接（决定 5）；按来源订单筛选；按金额、外部发票号筛选；按日期排序。
- 订单列表“按开票状态筛选”（D263 候选，仍需迁移或全表聚合，见 [S10 计划](S10.md)“不在本 Sprint”）。
- `trade_documents` 的列、约束、触发器；任何过账或未结项代码。
- CSS-02 的 `.tinv-source` 规则。

## 验收标准

1. **迁移**（`packages/infra/test`）：
   - 新账套建库后 `sqlite_schema` 中有 `trade_documents_party`，定义与决定 2 逐字一致；
   - 停在 017 的账套（含若干发票）升级到 018 后：索引存在，`trade_documents`、`trade_document_lines`、`open_items` 全部行逐字不变（升级前后比较全部列）；
   - 重复打开已是 018 的账套不再执行迁移、不报错；现有迁移测试不改、全部通过。
2. **API 契约测试**：
   - 每个参数单独生效（`party`、`side`、`from`、`to` 各一个正例），结果与按同一条件手工过滤全部发票逐项相同，且顺序为 `sequence` 倒序；
   - 组合生效：四个参数同时给出；
   - 筛选下的分页：满足条件的 3 张发票、中间穿插不满足条件的发票、`limit=2`：第一页 2 条且 `nextCursor` 为第 2 条的 `cursor`，第二页 1 条且 `nextCursor` 为 `null`；
   - 日期边界：`from` / `to` 等于记账日期时包含；
   - 400：`side=XX`、`from=2026-13-01`、`from > to`、未知参数；不存在的 `party` 返回空页；
   - **兼容（旧请求的响应逐字节不变）**：同一固定夹具分别在 PR 实际 base 与 head 上启动 HTTP 服务，用真实请求读取**未解析的响应体字节**（`await res.arrayBuffer()`，不经 `JSON.parse` 或契约解析）比较，至少两组：
     - ① 无游标首页：`?company=<C>&limit=2`；
     - ② 带游标续页：`?company=<C>&limit=2&cursor=<X>`，`X` 取自 base 首页响应体中的 `nextCursor`，两版使用同一个字符串；
     - 两组在两版上都断言状态 200、`Content-Type` 相同、响应体字节完全相同。PR 正文给出 base 提交号、命令，以及两版各两份响应体的字节长度与 SHA-256；
     - 夹具须确定（固定 ID、时间戳与序号）。若某字段在同一版本两次运行之间本身就不稳定，停下报告设计角色，不改为解析后比较；
     - 把 base 上取得的两份原始响应体作为字面量写进 head 的契约测试，断言 `await res.text()` 与之全等，防止以后回退。
   - 另一公司的发票不出现；TINV-04 及之前的发票列表测试不改、全部通过。
3. **性能（[PG-05](../product-guidelines.md#5-pg-05性能从设计开始)）**：
   - **执行计划**（测试中断言 `EXPLAIN QUERY PLAN` 文本）：带 `party` 时走 `trade_documents_party`，条件含 `party_id=?` 与 `sequence<?`；不带 `party` 时走 `trade_documents_company`；所有组合下不出现 `USE TEMP B-TREE`。
   - **无 N+1**：每页语句数固定为 1，与 `limit`、筛选组合无关。
   - **热读 p95 ≤ 1 s**：测量边界同 PG-05（本机真实 HTTP 请求到完整响应读取并通过契约解析）；每个场景 ≥ 50 次、先预热，**每个场景单独满足**。
   - **夹具**（固定、确定性，写在基准源码里，PR 描述给出生成规则；行满足迁移中的全部 CHECK 与外键）：1 万张发票，`sequence` 1 … 10000；伙伴 50 个，`P01` 恰好 100 张（1%）且按 `sequence` 均匀分布；方向按 `sequence` 交替 AP / AR；记账日期：`sequence` 1 … 50 为 `2025-12-15`，其余在 `2026-01-01` … `2026-11-30`。
   - **必测场景**：(a) `party=P01` 首页；(b) 只给 `side`，深处续页（游标位于最旧的 10%）；(c) **日期长扫描**：`from=2025-12-01&to=2025-12-31`、无游标、`limit=100`，命中的只有 `sequence` 最小的 50 张，查询必须从最新扫到最旧；基准先断言返回 50 条且 `nextCursor` 为 `null`，断言通过才计时；(d) 无筛选首页与深处续页（回归对照，同时补上 TINV-04 标“未测”的发票列表热读 p95）。
   - 基准放在 `packages/infra/bench`，命令与原始输出附在 PR 描述，不加到 PR 快速套件。
4. **读路径不写库**：沿用 TORD-03 / TORD-05 的两条判据（`store.read` 一次、`store.write` 0 次；独立观察连接在请求前后读到的全部用户表行数与 `trade_documents` 全部主键相同），在带全部四个筛选参数的请求上各做一次。
5. **页面**（jsdom，`packages/web/test/trade-invoices.test.tsx`）：
   - 应用、清除、按 Enter 应用；筛选下“加载更多”带上筛选；过账成功后按当前筛选刷新；
   - 日期区间无效时显示错误、不发请求，错误与输入框经 `aria-describedby` 关联；
   - 两种空结果文案；中英文案都存在；
   - 应用筛选不改变 `window.location.href`、不调用 `history.pushState` / `replaceState`；
   - 草稿 dirty 时操作筛选栏（输入、应用、清除、加载更多）不弹离开确认；没有草稿时只在筛选栏输入后离开页面，不弹确认；
   - 筛选栏内按 Enter 不提交草稿表单（草稿未过账、无过账请求）；
   - 键盘：Tab 顺序为 伙伴 → 方向 → 起 → 止 → 应用 → 清除 → 列表滚动区；
   - 现有发票页测试不改、全部通过。
6. 满足 [UI-1 通用验收](README.md#ui-1界面逐步改进) 1–9：中 / 英、红 / 绿两主题、1440 / 390 截图（390 下筛选栏换行；页面级 `scrollWidth <= innerWidth`）；教学模式开 / 关下筛选栏都可用，本任务不新增教学文案。PG-05：新增 CSS gzip-9 ≤ +0.3 kB，JS 按 PG-05 口径报告。
7. 新增测试文件在 `scripts/test-shard-weights.json` 有权重，CI-01 守卫通过。
8. 现有测试与 E2E 不删除、不削弱、不跳过、不按平台禁用（D11）。无 `package.json` / lock 变化。

## 性能考虑

- **规模 / 热点**：1 万张发票（验收 3 夹具）；一页上限 500（`limit` schema，`contracts/trade-documents.ts:446–449`），页面每页 100（`TradeInvoices.tsx:1071`）。
- **读写路径与索引**：有 `party` 走新增的 `trade_documents_party`；其余走 `trade_documents_company`（`010-trade-documents.sql:70`）+ 行内过滤。新增一条索引，写入发票时多维护一条索引项（过账路径的额外开销只是一次 B-tree 插入，不另测）。
- **查询次数**：每页 1 条语句，与页大小、筛选组合无关；不允许逐行查询。
- **分页**：`sequence` keyset，不用偏移。
- **事务 / 锁 / 缓存**：读路径只读一次快照，不写库（验收 4）；前端查询键含筛选，不同筛选各自缓存。
- **前端开销**：每次“应用”一次请求；不增加首屏请求；表格虚拟化（`:1080–1086`）不变。
- **预算与验证方式**：热读 p95 ≤ 1 s（验收 3，基准 `trade-invoice-list.ts`，PR 描述附命令与原始输出，base 无此基准，只报 head）；PG-05 前端体积必测：入口、`TradeInvoices` 块与 CSS 的 gzip-9，base 为 PR 实际 base，数字绑定最终送审 head。

## 证据要求

- 真实 Chrome 与 E2E：按[路线图 §5 UI PR 证据清单](../roadmap.md#5-团队流程) 1–9 项，请求评审前逐项勾选。
- **只能由真实 Chrome 证明的验收项**（各对应一条 `*.slow.test.*` 用例或取证步骤，mock 测试不能替代）：
  - 390 px 下筛选栏换行、页面不横向溢出（页面级 `document.documentElement.scrollWidth <= window.innerWidth`）：在 `packages/infra/test/support/trade-gui-scenario.ts` 新增步骤（可放在 `sourceOrders()`，`:1338`，之后），由 `trade-gui-*.slow.test.ts` 运行；
  - 1440 / 390 下“来源订单”列宽与行高不因筛选栏改变（沿用 `sourceOrders()` 中的列宽断言，`:1361–1397`，不改其期望值）；
  - 筛选应用后地址栏 hash 不变、未弹任何对话框（Playwright `dialog` 计数为 0）。
- PG-05：base 为 PR 实际 base；数字绑定最终送审 head，与取证 head 分开写。

## 设计自查（路线图 §5 设计文档自查 1–9）

- [x] 1 事实断言有来源（否定性断言附检索命令）
- [x] 2 不涉及进行中的 PR（编写时无打开的开发 PR）
- [x] 3 依赖列与泳道说明一致
- [x] 4 新增 CSS 只限筛选栏，规则写在 `.trade-invoices .tinv-filter…` 下，特异度与订单页筛选栏同级，不覆盖 `.tinv-source` 规则
- [x] 5 覆盖类断言给出 `file:line`
- [x] 6 共享单文件（`trade-invoices.css`、权重文件）已列入泳道
- [x] 7 入口参数逐个列了异常与恢复路径
- [x] 8 改动条款已通读上下文
- [x] 9 导航与历史：写明不改地址、不加监听及可接受的限制
