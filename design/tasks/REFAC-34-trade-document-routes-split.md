# REFAC-34：按资源拆分贸易单据路由 `registerTradeDocumentRoutes`（不改行为）

- Sprint：S24（[计划草案](S24.md)）
- 类型：重构（infra HTTP 路由）
- 优先级：P2
- 决定：[D554](S24.md#s24-期间决定)。只改代码组织，不改状态码、响应头、响应体、服务调用的实参与键序、守卫与解析的先后、路由注册顺序，详见“范围与决定”1–8。
- 建议分支：`refac-34-split-trade-document-routes`
- 来源：[S24 候选](S24.md#候选s24-其余泳道s23-评审后定)“按 ② 拆 core / infra”。本任务书在设计空闲时提前写好，有开发名额时再派发。REFAC-33（`LedgerReports.tsx` 与 `ledger-reports/`）占了本批唯一的页面拆分名额，本项不是页面拆分。
- 模板：结构规则沿用 [REFAC-32](REFAC-32-copilot-ai-complete-split.md)（编排函数行数上限、原文搬移、调用点多重集、依赖方向）；R4 的“记录调用序列 + 逐字节比较 + 直接断言”方法沿用 [REFAC-17 R4](REFAC-17-prepare-trade-action-split.md#两侧都须成立的不变量)，被记录的对象换成注入的假 `tradeDocs` 服务与 `app.inject` 的响应。
- 迁移：**不加**。
- 浏览器时段：**不需要**，理由见“证据要求”。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件；R4 只用假服务与 `inject`，不打开数据库。

## 为什么是它

- 设计角色在 `c978a95` 上用 `node files/fnlen.cjs packages/web/src packages/core/src packages/infra/src` 实测。排除 legacy、页面与在途冲突域（REFAC-30、REFAC-31、REFAC-32、REFAC-33）后，最长的非页面函数依次是：
  - `targetStorage`（218）：SQL 存储初始化；
  - `masterDataRepository`（182）：SQL 仓储汇总；
  - **`registerTradeDocumentRoutes`（181）**：贸易单据 HTTP 路由表；
  - `inspectSchema`（175）：迁移的模式检查；
  - `tradeReportingRepository`（143）、`createApi`（127）。
- 为什么不选其他几个：
  - `targetStorage` 是写队列、读快照、超时与嵌套工作单元的并发闭包，拆开要把共享状态改成参数，评审面大；
  - `masterDataRepository` 汇总全部仓储，改动面大；
  - `inspectSchema` 须另核 SQL 文本；
  - `createApi` 是总装配函数，与每个路由模块都有接触面。
- REFAC-32 任务书曾判断本函数“收益在分组而不在逻辑”。这次在 base 上实测后发现，181 行里藏着读者很难一眼看出的差异，分组后才看得清：
  - **守卫与解析的先后不一致**：3 个报表路由与 `open-items/:itemId/actions` 先解析查询再调 `ready`，其余 12 个路由先调 `ready` 再解析。没有服务时，前者对坏查询报 400、后者报 503（直接断言 3）。
  - **路径参数校验不一致**：`orders/:orderId` 与 `orders/:orderId/invoicing` 用 `companyCodeSchema` 校验 `orderId`；`invoices/:documentId`、`reports/open-items/:itemId`、`open-items/:itemId/actions` 把参数原样交给服务（直接断言 6）。
  - **列表过滤条件**：订单、发票、未结项三个列表共写了 14 处 `...(x ? { x } : {})` 条件展开，每处只差键名。
  - 16 个 `server.all` 按添加的先后排列，同一资源分散在多处：订单的列表与预览在第 4–5 个，详情与开票在第 11–12 个。
- 按资源分组后，“报表”“订单”“动作与核销”“发票与未结项”各在一处，读者能在一个文件里看全一个资源的守卫顺序、参数校验与列表过滤，可读性收益最大。
- 取证成本低：`createApi` 已有 `tradeDocs` 注入点，`app.inject` 不开端口也能驱动，R4 不需要数据库。
- 不进打包产物：`packages/web/src` 不导入 `packages/infra`。

## 现状（base `c978a95`）

- 文件 `packages/infra/src/http/trade-documents.ts` 共 227 行：
  - `:1–39` 导入（31 个契约 schema、`DomainError`、`LocalFinanceBoundary` 类型、`httpError`）；
  - `:41–46` 模块级 `parse`：`safeParse` 失败抛 `DomainError("INVALID_INPUT", { scope: "tradeDocument", path: "form", rule: "shape" })`，映射为 400 `INVALID_REQUEST`，`fieldErrors` 为 `[{"path":"form","messageKey":"api.error.tradeDocument.shape"}]`；
  - `:47–227` `registerTradeDocumentRoutes(server, service, boundary)`。
- `ready` 闭包（`:52–65`）的检查顺序：
  1. 没有服务 → 503；
  2. 非 GET 且查询不是对象、为 `null` 或有任何键 → 400；
  3. 非 GET 且 `content-type` 按 `;` 切分、取首段 `trim()` 后不等于 `application/json`（区分大小写）→ 415。
- 16 个路由，按注册顺序：

  | # | 行 | 路径（前缀 `/api/v1/trade`） | 方法 | `ready` 与解析的先后 | 服务方法 |
  | --- | --- | --- | --- | --- | --- |
  | 1 | 66 | `/reports/open-items` | GET | 先解析查询 | `report` |
  | 2 | 73 | `/reports/reconciliation` | GET | 先解析查询 | `reconciliation` |
  | 3 | 78 | `/reports/open-items/:itemId` | GET | 先解析查询 | `itemDetail` |
  | 4 | 88 | `/orders` | GET、POST | 先 `ready` | `listOrders` / `createOrder` |
  | 5 | 111 | `/orders/preview` | POST | 先 `ready` | `previewOrder` |
  | 6 | 118 | `/actions/preview` | POST | 先 `ready`（成员表达式先于实参求值） | `previewAction` |
  | 7 | 124 | `/actions` | POST | 同上 | `confirmAction` |
  | 8 | 131 | `/open-items/:itemId/actions` | GET | 先解析查询 | `actions` |
  | 9 | 141 | `/settlements/preview` | POST | 先 `ready` | `previewSettlement` |
  | 10 | 147 | `/settlements` | POST | 先 `ready` | `confirmSettlement` |
  | 11 | 154 | `/orders/:orderId` | GET | 先 `ready` | `order` |
  | 12 | 165 | `/orders/:orderId/invoicing` | GET | 先 `ready` | `orderInvoicing` |
  | 13 | 176 | `/invoices/preview` | POST | 先 `ready` | `preview` |
  | 14 | 183 | `/invoices` | GET、POST | 先 `ready` | `list` / `confirm` |
  | 15 | 205 | `/invoices/:documentId` | GET | 先 `ready` | `detail` |
  | 16 | 214 | `/open-items` | GET | 先 `ready` | `openItems` |

- 函数内计数（base）：`parse(` 20 处、`Schema.parse(`（响应校验）18 处、`ready(request)` 16 处、`boundary.assert(` 16 处、`httpError(` 3 处、`reply.code(201)` 4 处、条件展开 14 处、`Number(limit)` 4 处。
- 调用方只有 `packages/infra/src/http/index.ts:141`，在 `registerAiRoutes` 与 `registerTradeRoutes`（`http/trade-master.ts`，不属本任务）之间。
- `boundary` 是 `http/legacy.ts` 的 `LocalFinanceBoundary.assert`：先写财务响应头（`cache-control: no-store`），再按 host / origin / sec-fetch-site 报 403，最后按方法报 405 并写 `Allow`。

## 范围与决定

1. **只改组织，不改行为**。以下逐项不变：
   - 每个请求的状态码、响应头（至少 `allow`、`cache-control`、`content-type`）与响应体字节；
   - 对服务的调用：方法名、次数、先后、实参与对象键序；
   - 每个路由内 `boundary.assert`、`ready`、查询解析、参数解析、请求体解析、服务调用、响应校验的先后（含“现状”表中的不一致，**原样保留**，不统一）；
   - 16 个 `server.all` 的注册顺序与路径字面量（直接断言 1）。
2. **按资源分组**。建议分四组，每组一个文件、一个或两个注册函数，参数显式：
   - 报表：路由 1–3；
   - 订单：路由 4–5 与 11–12；为保持注册顺序，订单组导出两个注册函数（例如 `registerOrderEntryRoutes` 与 `registerOrderLookupRoutes`），由 `registerTradeDocumentRoutes` 在原位置分别调用；
   - 动作与核销：路由 6–10；
   - 发票与未结项：路由 13–16。

   分组名与函数名可调整，但注册顺序不得改变。
3. **`parse` 与 `ready` 的语义不变**。`parse` 搬到共享的新文件，函数体原文不变；`ready` 可以保留为 `registerTradeDocumentRoutes` 内的闭包后作为参数传给各组，也可以改为“由 `service` 生成 `ready` 的工厂函数”，函数体原文不变。各组函数的参数形如 `(server, ready, boundary)`；不得在组内再判断 `service` 是否存在。
4. **可选：列表过滤条件的辅助函数**。可以把 14 处条件展开收成一个辅助函数，条件：
   - 只丢弃假值（与 `x ? { x } : {}` 相同），不改为 `!== undefined` 之类；
   - 键序与原写法相同，`limit` 仍在最前；
   - 在 R5a 的替换表中逐处列出。

   不做也可以；做了以后由直接断言 4 守住键序。
5. **导出与签名不变**：`registerTradeDocumentRoutes` 的名字与签名不变；`index.ts` 不改。新文件不导出给 `http/` 以外的模块。
6. **新文件**只放在 `packages/infra/src/http/`，命名 `trade-document-*.ts`（例如 `trade-document-http.ts`、`trade-document-reports.ts`、`trade-document-orders.ts`、`trade-document-actions.ts`、`trade-document-invoices.ts`）。
7. **不修缺陷**：上述守卫先后与参数校验的不一致都按现状保留；若认为是缺陷，登记到 PR 正文“疑似缺陷”一节，由设计另排任务。
8. **不改的文件**：
   - `packages/infra/src/http/` 下其他文件（含 `index.ts`、`legacy.ts`、`errors.ts`、`trade-master.ts`）；
   - `packages/infra/src/` 其他目录（含 REFAC-32 的 `copilot-ai.ts` 与 `copilot-ai-*.ts`）；
   - `packages/core/**`（含契约 schema 与 REFAC-30、REFAC-31 的文件）、`packages/web/**`（含 REFAC-33 的文件）；
   - `packages/infra/test/**`；
   - `scripts/**`（含 `scripts/slot/`、`scripts/measure/`）、`scripts/test-shard-weights.json`、`package.json` / lock、`vitest.config.ts`、`eslint` 与 `tsconfig` 配置。

## 冲突域

- infra-http:trade-documents：只改 `packages/infra/src/http/trade-documents.ts`，并新增同目录下 `trade-document-*.ts`（决定 6）。
- 取证所需的观测点和新增测试文件：无（R4 驱动不提交）。
- 受影响的 e2e 断言（S13 回顾行动 1）：无。e2e 只经 HTTP 访问这些路由，R4 证明 HTTP 行为逐字节不变，所以**须随本任务改**的也是无。
- 受影响的文档引用（D460）：`git grep -n -F "http/trade-documents" -- docs design` 在 `c978a95` 上命中 16 个文件 23 行：
  - `docs/demo/v0.8.0`–`v0.11.0` 的 `scripts/*-stub.mjs` 注释；
  - 早前任务书（TORD-03/04/05、TINV-01/03/04/05/06、S11、S12、M1-R1a、REFAC-26）。

  它们是当时版本的事实记录，引用的行号本来就已随后续提交漂移，本任务不改。
- 与在途任务逐文件不相交：
  - REFAC-30 只改 `packages/core/src/domain/trade-calculator.ts` 与 `trade-calculation-*.ts`；
  - REFAC-31 只改 `packages/core/src/application/business-events.ts` 与 `business-event-*.ts`；
  - REFAC-32 只改 `packages/infra/src/copilot-ai.ts` 与 `copilot-ai-*.ts`；
  - REFAC-33 只改 `packages/web/src/LedgerReports.tsx` 与 `ledger-reports/`。

  五者没有共享文件。本任务只跑 `infra` 项目（R3），不改测试文件；与 REFAC-30、REFAC-31、REFAC-32 中先合并的一方之后，本任务的 R3 按实际合并基重做。

## 验收

### base 失败、head 通过

| 编号 | 检查 | base `c978a95` | head 要求 |
| --- | --- | --- | --- |
| R6a | `node fnlen.cjs packages/infra/src`（口径同 S16–S24）中 `registerTradeDocumentRoutes` 的行数 | **181**（失败） | ≤ 30；本任务新增或改动的函数都 ≤ 80 |
| R6b | `trade-documents.ts` 的总行数（`(Get-Content <file>).Count`） | **227**（失败：16 个路由都在一个函数里） | ≤ 80；新文件各 ≤ 120 |

### 两侧都须成立的不变量

- **R1 范围**：`git diff --name-only <base> <head>` 只含 `packages/infra/src/http/trade-documents.ts` 与同目录新增的 `trade-document-*.ts`；决定 8 所列文件的 diff 为空。不加迁移。
- **R2 导出不变**：
  - 用 `@babel/parser`（插件 `typescript`）解析，口径同 REFAC-14 R2：`trade-documents.ts` 的导出名集合与 `registerTradeDocumentRoutes` 的签名源文本（只归一空白）与 base 相同。
  - `git grep -n "trade-document" -- packages/infra/src/http` 在 head 上只命中 `index.ts:18` 与本任务文件之间的导入；PR 正文附结果。
  - `npm run typecheck` 与 `npm run check:boundaries` 通过。
- **R3 既有测试原样通过**：
  - `npx vitest run --project infra` 全部通过，测试文件 diff 为空。
  - 其中 `packages/infra/test/application/trade-documents.test.ts` 覆盖 4 个 POST→201 路径（`:2435` 用例中的订单、发票、核销，`:2606` 用例中的动作）与订单预览（`:3313` TORD-04）；PR 正文附该文件单独运行的汇总行，base 与 head 各一次。
  - PR 正文附 `infra` 项目汇总行原文，base 与 head 各一次；有失败时逐个列出，并附只对失败文件的串行重跑原文（`--no-file-parallelism`）。
- **R4 HTTP 行为与服务调用等价**（送审证据，驱动不提交，不加常驻 CI 用例）：
  - **驱动**：
    - 临时 vitest 脚本，例如 `packages/infra/test/zz-r34-probe.test.ts`，送审前删除，在 base 与 head 上各运行一次。运行命令：`cd packages/infra; npx vitest run --config ../../vitest.config.ts --project infra test/zz-r34-probe.test.ts`。`console.log` 会被吞掉，输出写到临时文件。
    - 用 `createApi({ environment: { ERP_PORT: "0" }, allowPortZero: true, tradeDocs, logError: () => undefined })` 构造，`await app.listen()` 后用 `app.inject` 发请求，`headers` 带 `host: 127.0.0.1:<实际端口>`；用例结束后 `close()`。
    - `tradeDocs` 为**假服务**：普通对象，16 个方法各先记录方法名与实参，再按用例返回、抛错；不用 `Proxy`。“无服务”用例不传 `tradeDocs`。
    - 另用一个只实现 `all(path)` 的假 `server` 直接调用 `registerTradeDocumentRoutes(fake, undefined, {} as never)`，记录注册的路径序列。
  - **记录与编码**：每个请求记录方法、URL、请求头、请求体、状态码、`allow`、`cache-control`、`content-type` 响应头、响应体原文、本次请求引起的服务调用（方法名与实参的 JSON，保留键序）。用确定性 JSON 编码，同一驱动连续两次运行的输出须逐字节相同。驱动须带 REFAC-17 的自测（a）–（c），任一自测失败即 R4 失败。
  - **用例**至少包含下列直接断言 1–10 的全部输入，另须包含：
    - 每个路由的每个允许方法各一次“最小合法请求”（GET 带 `company=DEFAULT`，POST 带 `{}` 与 `application/json`）；
    - 每个路由各一次 `PUT`；
    - 订单、发票、未结项、报表四个列表各一次“全部可选查询参数，URL 中顺序打乱”。
  - **判定**：base 与 head 每个用例的记录逐字节相同，PR 正文附两侧输出的 SHA-256 与比较结果。只比两侧相同不够，以下**直接断言**也须成立。期望值都由设计角色在 base `c978a95` 上用临时驱动实测，驱动已删除。下文路径省略前缀 `/api/v1/trade`；“0 次调用”指假服务的方法都未被调用；`shape` 指 400 `INVALID_REQUEST` 且 `fieldErrors` 为 `[{"path":"form","messageKey":"api.error.tradeDocument.shape"}]`：
    1. **注册顺序**：假 `server` 记录的路径依次为 `reports/open-items`、`reports/reconciliation`、`reports/open-items/:itemId`、`orders`、`orders/preview`、`actions/preview`、`actions`、`open-items/:itemId/actions`、`settlements/preview`、`settlements`、`orders/:orderId`、`orders/:orderId/invoicing`、`invoices/preview`、`invoices`、`invoices/:documentId`、`open-items`（各带前缀），共 16 个。
    2. **方法与边界**（有服务）：
       - `PUT` 各路由都报 405，`cache-control: no-store`，0 次调用；`Allow` 为：
         - `GET`：`reports/open-items`、`reports/reconciliation`、`reports/open-items/X1`、`open-items/X1/actions`、`orders/PO-1`、`orders/PO-1/invoicing`、`invoices/D1`、`open-items`；
         - `GET, POST`：`orders`、`invoices`；
         - `POST`：`orders/preview`、`actions/preview`、`actions`、`settlements/preview`、`settlements`、`invoices/preview`；
       - `GET orders/preview` 报 405、`Allow: POST`（静态路径优先于 `:orderId`）；
       - `host: evil:1` 时，`GET` 与 `PUT` 都报 403 `FORBIDDEN`（403 在 405 之前），有无服务都一样，0 次调用。
    3. **无服务时的守卫先后**（不传 `tradeDocs`）：
       - 先解析查询的 4 个路由：`reports/open-items`、`reports/reconciliation`、`reports/open-items/X1`、`open-items/X1/actions` 带 `company=bad` 报 `shape`；带合法查询报 503 `UNAVAILABLE`（`retryable: true`）；
       - 先 `ready` 的 GET 路由：`orders`、`orders/po-1`、`orders/PO-1/invoicing`、`invoices`、`invoices/D1`、`open-items` 带 `company=bad` 都报 503；
       - 8 个 POST 路径带 `?x=1` 与 `content-type: text/plain` 都报 503（服务检查最先）。
    4. **列表实参与键序**（有服务）：
       - 最小查询：`listOrders("DEFAULT", {"limit":100})`、`list("DEFAULT", {"limit":100})`、`openItems("DEFAULT", {"limit":100})`、`report("DEFAULT", {"limit":100})`；
       - 全部可选参数、URL 中顺序打乱时：
         - `listOrders("DEFAULT", {"limit":5,"cursor":"PO-1","party":"P1","side":"AP","from":"2026-01-01","to":"2026-01-31","invoicing":"none"})`；
         - `list("DEFAULT", {"limit":7,"cursor":"12","party":"P1","side":"AR","from":"2026-01-01","to":"2026-01-31"})`；
         - `openItems("DEFAULT", {"limit":9,"cursor":"2026-01-01|<id>","party":"P1","status":"open"})`；
         - `report("DEFAULT", {"month":"2026-01","side":"AP","party":"P1","cursor":"<uuid>","snapshot":"<64 个 a>","limit":3})`（报表按 schema 形状顺序、去掉 `company`、`limit` 在最后，与另外三个列表不同）；
       - 订单列表 `from` 晚于 `to`、`cursor=`（空值）都报 400，0 次调用。
    5. **报表范围**：`reconciliation("DEFAULT", undefined)` 与 `reconciliation("DEFAULT", "2026-01")`；`itemDetail("DEFAULT", "anything", undefined)` 与带 `month=2026-01` 时第三个实参为 `"2026-01"`。
    6. **路径参数**：
       - `orders/PO-1` → `order("DEFAULT", "PO-1")`；`orders/po-1` 报 400，0 次调用；`orders/PO-1?company=DEFAULT&x=1` 报 400（严格查询）；
       - `orders/PO-1/invoicing` → `orderInvoicing("DEFAULT", "PO-1")`；`orders/po-1/invoicing` 报 400；
       - `invoices/not-a-uuid` → `detail("DEFAULT", "not-a-uuid")`（不校验）；
       - `reports/open-items/anything` 与 `open-items/raw%20id/actions` 把参数原样交给服务（后者为 URL 解码后的 `"raw id"`）。
    7. **有服务时 `ready` 的先后**：
       - `POST orders?x=1` 与 `POST invoices?x=1` 带 `text/plain` 报 400（`fieldErrors` 为 `[]`，查询检查在内容类型之前）；
       - `POST actions` 带 `text/plain` 报 415 `UNSUPPORTED_MEDIA_TYPE`，`cache-control: no-store`；
       - `POST orders?x=1` 带 JSON `{}` 报 400，`fieldErrors` 为 `[]`；
       - `POST orders` 带 `application/json; charset=utf-8` 与 `{}` 报 `shape`；带 `" Application/JSON "` 报 415；
       - `POST settlements/preview` 带 JSON `{}` 报 `shape`；
       - 以上都是 0 次调用。
    8. **框架层 415**：`POST orders` 带 `application/xml` 报 415 `UNSUPPORTED_MEDIA_TYPE`，**没有** `cache-control`（Fastify 不进处理函数，`boundary` 未运行），0 次调用。
    9. **响应校验**：假服务对列表返回 `{}` 或带多余键的页 → 500 `INTERNAL_ERROR`（`retryable: false`），调用仍发生 1 次；返回合法空页 → 200。
    10. **服务错误映射**：假服务抛 `new DomainError("NOT_FOUND")` → 404 `NOT_FOUND`。

    base 上任一直接断言不成立，先停下并向协调者报告。PR 正文附驱动、用例清单、比较结果与直接断言结果。
  - **驱动原件**：PR 正文贴驱动**原文件字节的 base64**，或同时写出两种 SHA-256：原始字节、按 UTF-8 解码并把换行归一为 LF 后的字节。只给一种哈希不算满足。
- **R5 结构规则**（静态，评审按代码与 PR 表格核对）：
  - **R5a 原文搬移**：以下各段在 base 与 head 之间逐字比较（只归一缩进）：
    - `parse`（`:41–46`）；
    - `ready` 的函数体（`:52–65`）；
    - 16 个路由各自的处理函数体（`server.all` 的第二个实参，含 `async (request, reply) =>`），以及带路径参数的路由的泛型实参 `<{ Params: … }>`。

    为传参把 `service`、`ready`、`boundary` 等自由变量改为参数的替换，以及决定 4 的辅助函数替换，须逐处列表说明。不同且未列明即失败。
  - **R5b 无模块级可变状态**：新文件与 `trade-documents.ts` 的模块顶层只能有：`import` / `export`、类型与接口、函数声明、`const` 常量（不含 `let`、可变容器，且不在加载时调用导入的函数）。PR 正文附 Babel AST 检查脚本的输出。
  - **R5c 调用点不变**：用 Babel AST 抽取实参原文（只归一空白），比较 base `registerTradeDocumentRoutes` 与 head 中本任务各函数内的多重集，须相同：
    - `parse(`（20 处）与 `*Schema.parse(`（18 处）的实参原文；
    - `boundary.assert(`（16 处）的方法数组原文；
    - `httpError(`（3 处）的实参；
    - `reply.code(201)`（4 处）所在路由。

    为传参改名的逐处说明；决定 4 的辅助函数若采用，14 处条件展开改为其调用，单列对照表。PR 正文附两侧列表与比较结果。
  - **R5d 依赖方向**：新文件之间的导入单向无环，`trade-documents.ts` 位于顶端；新文件不从 `./trade-documents.ts` 导入运行时值；只有 `trade-documents.ts` 被 `index.ts` 导入。PR 正文附导入图。
- **R6 尺寸**：除上表 R6a、R6b 外，每个新函数满足 ②（≤ 80 行、嵌套 ≤ 3 层）。PR 正文列出所有超过 50 行的函数，附计数行数与最深层数（base 与 head 两列）。
- **R7 打包字节**：首屏与全部 chunk **±0**。用 `scripts/measure/bundle-measure.mjs --d454`，不传 `--route` / `--chunk`，即全部 ±0；写明脚本所在的提交 SHA。base 为最终送审 head 的实际合并基。出现任何非 0 差异即停下报告。
- **R8 质量门**：
  - **R8a 合并前**：`typecheck`、`lint`、`check:boundaries`、CI-02 预检通过；PR CI（`ci.yml`）绿。
  - **R8b 合并后检查（不作合并门）**：合并后第一次覆盖该合并提交的 main Full 须绿；失败时报协调者，按 D456 暂停后续合并。
- **R9 可读性一节**：PR 正文按下节逐条说明。

## 测试命令

```powershell
npx vitest run --project infra packages/infra/test/application/trade-documents.test.ts
npx vitest run --project infra
npm run typecheck; npm run lint; npm run check:boundaries
node scripts/measure/bundle-measure.mjs --base <合并基全 SHA> --head <head 全 SHA> --work <新目录> --d454
```

## 性能考虑

- 不跑 Bench：路由注册只在启动时运行一次；请求处理函数原文搬移（R5a），只多一层注册函数调用，不新增 `await`、复制或中间对象。决定 4 的辅助函数若采用，只在列表请求时多构造一个小对象，可忽略；若 R4 出现新的服务调用或键序变化，即违反 R4，评审退回。
- 不进打包产物（R7）。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥：

- **②**：本任务就是为满足 ② 而做。`registerTradeDocumentRoutes` 从 181 行拆到 ≤ 30 行，新函数 ≤ 80 行（R6a、R6）。
- **③**：`trade-documents.ts`（227 行）拆后 ≤ 80 行，新文件各 ≤ 120 行（R6b）。PR 正文贴 `git diff --numstat`。
- **①**：函数名与文件名表达资源，例如 `registerTradeReportRoutes`、`registerOrderEntryRoutes`、`registerOrderLookupRoutes`、`registerTradeActionRoutes`、`registerInvoiceRoutes`；不用 `part1`、`group2`、`helper`。
- **④**：读者能在 `registerTradeDocumentRoutes` 中一屏看出“生成 `ready` → 依次注册报表、订单录入、动作与核销、订单查询、发票与未结项”；每个资源的守卫顺序、参数校验与列表过滤在一个文件内可读。
- **⑤**：不适用（不改测试）。
- **⑥**：可以加两行注释：
  - 在订单组的两个注册函数处说明“为保持注册顺序分两次注册”；
  - 在先解析查询的路由组处说明“这些路由先解析查询再检查服务，无服务时坏查询报 400”。

  不加其他注释；不留调试输出。
- **测试耗时**：本任务不改测试；R4 驱动不提交。PR 正文附 `infra` 项目在 base 与 head 上的耗时（vitest 汇总行原文），两侧差异 > 20% 时说明原因。

## 用户可见变化

- 无。贸易单据、报表、动作与核销的接口状态码、响应头与响应体都不变（R3、R4）。

## 证据要求

- **不需要浏览器时段**：行为等价由 R3 与 R4 证明；R4 用 `app.inject` 比较 HTTP 行为与服务调用逐字节等价，并核对直接断言。页面只经 HTTP 访问这些路由。R4 与构建在本机运行，须服从协调者的时段静默通知（D442 / D480）。
- **可行性**（S13 回顾行动 4）：设计角色已在 `c978a95` 上用两个临时 vitest 驱动（`inject` 驱动与假 `server` 驱动，都在 `infra` 项目）实测 R4 直接断言 1–10 全部成立，驱动已删除、未提交。`trade-documents.test.ts` 中 R3 所列 POST→201 用例在同一提交上通过。
- PR 正文附：R2 导出比较与 `git grep` 结果；R3 汇总行；R4 驱动（原件 base64 或两种 SHA-256）、用例清单、比较结果与直接断言结果；R5a–R5d 各表；R6 行数表（base 与 head 两列）；R7 的 `bundle-measure.mjs` 完整输出与退出码；可读性一节。R8b 合并后补到 PR 评论。

## 设计自查

- 冲突域与 REFAC-30（core domain）、REFAC-31（core application）、REFAC-32（infra `copilot-ai*`）、REFAC-33（web `LedgerReports`）逐文件不相交；不是页面拆分；不加迁移；不碰 `scripts/slot/`、`scripts/measure/`。
- R6a / R6b 的 base 数字、R5c 的调用点数与 R4 直接断言的期望值都在 `c978a95` 上实测。
- 只改代码组织；守卫先后与参数校验的不一致按现状保留，若评为缺陷另排任务。
