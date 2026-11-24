# REFAC-26：拆分 `tradeDocumentRepository`（不改行为，SQL 逐字节不变）

- Sprint：S24（[计划草案](S24.md)）
- 类型：重构（基础设施 SQL 仓储，读写，贸易单据 / 未结项 / 核销写入）
- 优先级：P2
- 决定：[D546](S24.md#s24-期间决定)。只改代码组织，不改行为与 SQL，详见“范围与决定”1–9。
- 建议分支：`refac-26-split-trade-document-repository`
- 来源：[S24 候选](S24.md#候选s24-其余泳道s23-评审后定)“按 ② 拆 core / infra”。
  - [REFAC-21](REFAC-21-business-repository-split.md)（#343，已合并）与 [REFAC-25](REFAC-25-journal-repository-split.md)（#348，已合并）已用读写仓储跑通“SQL 逐字节 + 库内状态”方法。
  - REFAC-25 写明 `tradeDocumentRepository` 须等 REFAC-23 合并后再排。REFAC-23（#347）已合并，协调者确认本项可排。
  - 本任务沿用 REFAC-25 的验收结构，另加贸易链路特有的四点：模块级导出的搬移、`insertSegments` 单一实现、`insertTradeDocument` 的语句顺序、`refreshOrdersOfItem` 只在取消状态翻转时执行。
- 迁移：**不加**。
- 浏览器时段：**不需要**，理由见“证据要求”。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 为什么是它

- 设计角色在 `5be9496` 上用 `node files/fnlen.cjs packages/core/src packages/infra/src packages/web/src` 实测。core / infra 中超过 ② 上限的前几项：
  - **`tradeDocumentRepository`（616）**：全仓最长的函数。
  - legacy 的 `checkOpeningItems`（606）、`reconcileLegacy`（382）、`mapRow`（253）、`executeLegacyImport`（230）、`apply`（184）。本 Sprint 不碰。
  - `targetStorage`（218）、`masterDataRepository`（182）、`registerTradeDocumentRoutes`（181）、`compute`（179）、`prepareSettlement`（179，同批 [REFAC-27](REFAC-27-trade-settlement-prepare-split.md)）。
- 选它的理由：
  - **只用 `db.query`，不开事务**：事务由 core 应用层掌握。等价仍可以只看“SQL 文本 + 参数 + 返回值 / 错误 + 库内状态”。
  - **分组天然连续**：返回对象的 27 个键可分为“动作与未结项 / 付款与核销 / 订单 / 配置 / 发票 / 未结项查询”几组（见“现状”）。
  - **调用方少**：产品代码中只有 `master-data.ts:25,87` 展开它；模块级导出另有 bench、迁移与两个测试支持文件导入（见“现状”），本任务保持这些导入路径可用。
  - 文件内的 `insertTradeDocument` 本身也有 101 行，同样超过 ②。
- 不是页面拆分，不占页面拆分名额。`packages/web/src` 不导入 `packages/infra`，因此本任务不进任何打包产物。
- 冲突域与在评审的 REFAC-24、同批的 REFAC-27 不相交，详见“冲突域”。

## 现状（main `5be9496`）

下文 `file:line` 都按 `5be94963cbdf76b8df4209b000c57e5142e12617`。

- `packages/infra/src/storage/trade-documents.ts` 共 **955** 行，有 38 行以 `//` 开头的注释，另有若干 `/** … */` 块（多为 TORD- / TINV- 编号的“为什么”）。
- **模块级导出 8 项**（种类与导入方）：

  | 导出 | 种类 | 行 | 导入方 |
  | --- | --- | --- | --- |
  | `tradeOrderPageSql` | `const`（字符串） | `:132` | 无外部导入（`:138` 注释以它为“无过滤时的语句”基准；R2 比较其值） |
  | `tradeOrderPageStatement` | function | `:152` | `infra/bench/trade-order-list.ts:28` |
  | `tradeOrderPageInvoicedSql` | function | `:223` | 无外部导入 |
  | `tradeOrderInvoicingStatus` | function | `:228` | 无外部导入 |
  | `tradeOrderStatuses` | async function | `:239` | `infra/bench/trade-order-list.ts:28`、`infra/test/application/trade-order-credit-invoicing.test.ts:13`、`infra/test/support/trade-ledger.ts:25` |
  | `refreshTradeOrderInvoicing` | async function | `:277` | `infra/src/storage/migrations.ts:8`（第 445 行调用） |
  | `tradeDocumentPageStatement` | function | `:313` | `infra/bench/trade-invoice-list.ts:20` |
  | `tradeDocumentRepository` | function | `:336` | `infra/src/storage/master-data.ts:25,87` |

- **模块私有**：
  - 行映射与取值：`int`（非安全整数抛 `STORAGE_FAILURE`）、`str`（非字符串抛 `STORAGE_FAILURE`）、`json`、`optional`、`orderLineRow`、`documentLineRow`、`openItemRow(row, segments)`（`:30–114`）；
  - SQL 片段与构造：`openItemSelect`（`:115`）、`PageDriver`、`tradeOrderPageSelect`、`tradeOrderPageOrder`、`joinStatus`、`statusDrivenFrom`、`tradeOrderPageFrom`；
  - 订单开票状态：`invoicedLinesFrom`、`invoicedLinesWhere`、`invoicedOrderLines`、`placeholders`、`InvoicedLine`、`lineKey`、`creditedOrderLinesSql`、`subtractCredits`（无订单时 0 次查询）、`refreshChunk`、`refreshOrdersOfItem`（1 次 `SELECT … UNION …`，再调 `refreshTradeOrderInvoicing`）。
- 设计角色用 `node files/fnlen.cjs packages/infra/src/storage` 实测（只列本文件）：

  ```text
  616	packages/infra/src/storage/trade-documents.ts:336-955	tradeDocumentRepository
  101	packages/infra/src/storage/trade-documents.ts:787-888	insertTradeDocument
  ```

- **`tradeDocumentRepository(db)` 的结构**：
  1. **内部辅助**（由多个键共用）：
     - `segments(company, ids)`（`:337`；`ids` 为空时 0 次查询）；
     - `insertSegments(company, itemId, segments)`（`:356`；`insertTradeItem` 与 `insertTradeDocument` 共用，每段 1 次 `INSERT INTO trade_control_segments`）；
     - `document(where, params)`（`:370`；主查询含 `${where}` 插值，再查行；不存在时 1 次查询后返回 `null`，存在时 2 次）。
  2. **返回对象**（`:411`），**27 个键**，源码顺序即键顺序：

     | 组 | 键（行） |
     | --- | --- |
     | 动作与未结项写入 | `tradeAction` 412（`${byReceipt ? "receipt_key" : "action_id"}` 插值）、`tradeItemActions` 419、`tradeUndo` 426、`tradeItemSource` 436、`tradeOpeningItems` 449（空输入返回 `new Set()`，0 次查询；多行模板字符串）、`tradeCreditLines` 458、`insertTradeItem` 473、`changeOpenItem` 510、`insertTradeAction` 536、`latestSettlementDate` 580 |
     | 付款与核销 | `tradePayment` 587（`${byReceipt ? … }` 插值）、`insertTradePayment` 599、`settleOpenItem` 613、`itemSettlements` 654 |
     | 订单 | `tradeOrder` 661（2 次查询）、`insertTradeOrder` 685、`tradeOrderPage` 721、`tradeOrderInvoiced` 745（空输入返回 `[]`，0 次查询；之后 `subtractCredits`）、`tradeOrderLatestDate` 759 |
     | 配置 | `tradeConfigsByCodes` 766（空输入返回 `[]`；`${tradeTables[kind]}` 插值） |
     | 发票 | `tradeDocument` 774 与 `tradeDocumentByReceipt` 777（**非 `async`** 箭头，返回 `document(…)` 的 Promise）、`tradeDocumentByExternal` 780、`insertTradeDocument` 787、`tradeDocumentPage` 889 |
     | 未结项查询 | `openItem` 912、`openItemPage` 921（游标 `"due|item"`；`LIMIT` 参数为 `limit + 1`） |

     其余键都是 `async`。
  3. **写方法的语句顺序**（R4 直接断言依据）：
     - `changeOpenItem`：1 次 `UPDATE open_items … revision=? RETURNING item_id`，行数 ≠ 1 时 `tradeDocumentError("revision", "stale", true)`；再每段 1 次 `UPDATE trade_control_segments … RETURNING item_id`，≠ 1 时抛 `StorageError("STORAGE_FAILURE")`；只有 `before` / `after` 的“是否为 `cancelled`”不同时才调 `refreshOrdersOfItem`（`:531–533`，带 TORD-06 / TINV-09 注释）。
     - `insertTradeAction`：1 次 `INSERT INTO trade_actions`（`relatedId` 为嵌套三元式）；每个变更 1 次 `INSERT INTO trade_action_items`；非 `credit` 到此返回；`credit` 再每行 1 次 `INSERT INTO trade_credit_lines`，最后 `refreshOrdersOfItem`。
     - `settleOpenItem`：1 次 `UPDATE open_items`（≠ 1 → `revision` / `stale`，冲突）；`!a.segments` 时抛 `STORAGE_FAILURE`；每段 1 次带 `remaining_gross_minor>=?` 守卫的 `UPDATE`（≠ 1 → `segments` / `stale`，冲突）；最后 1 次 `INSERT INTO settlements … SELECT … FROM open_items`。
     - `insertTradeDocument`：1 次 `INSERT INTO trade_documents`；n 次 `INSERT INTO trade_document_lines`（含 `quantityMicros`）；1 次 `INSERT INTO open_items`（`'open',1`）；`!snapshot.settlementTerms` 时在此抛 `STORAGE_FAILURE`（此前共 n + 2 次查询）；1 次 `INSERT INTO trade_invoice_terms`；`insertSegments`（`controlSegments ?? [默认单段]`）；最后对去重后的关联订单调 `refreshTradeOrderInvoicing`（无关联订单时 0 次查询）。
- **`db` 的用法**：只调用 `db.query`，且只在方法被调用时调用；构造时不访问 `db` 的任何成员；没有 `begin` / `commit`。
- **库约束**（R4 构造数据时必须遵守；迁移 010、011、012、019）：
  - `trade_orders` 及其行、`trade_documents` 及其行、`settlements`、`trade_invoice_terms`、`trade_payments`、`trade_item_sources`、`trade_actions`、`trade_action_items`、`trade_credit_lines` 禁止 `UPDATE` / `DELETE`；
  - `open_items`、`trade_control_segments` 只允许改余额类列；`open_items` 禁止 `DELETE`；
  - `settlements_payment_source` 在插入前校验；`trade_documents_item_source` 在插入后写来源；`trade_order_invoicing` 只允许改 `status`，由 `trade_orders` 的 AFTER INSERT 触发器生成。
- **测试**：
  - infra：`test/application/trade-documents.test.ts`、`trade-order-credit-invoicing.test.ts`、`legacy-opening-items.test.ts` 及其他经过贸易单据的测试；
  - bench：`trade-order-list.ts`、`trade-invoice-list.ts`、`trade-settlement.ts`（本任务不跑，见“性能考虑”）；
  - 真实 Chrome（只在 main Full 中运行）：`trade-gui` 场景（订单、发票、付款核销、详情页）。

### chunk 归属与首屏（S22 回顾行动 3）

| 文件 | 落在哪个 chunk | 依据 |
| --- | --- | --- |
| `trade-documents.ts`（infra，改）与新文件 | **不进任何 web chunk** | `packages/web/src` 不导入 `packages/infra` |
| 首屏 | **±0** | 同上；由 R7 确认 |

## 范围与决定

1. **不改行为，SQL 逐字节不变**（D546）。对任何输入（含版本不符、段余额不足、不存在的 id、空数组输入、游标页与已损坏的存储行），以下全部不变：
   - 每次 `db.query` 的 **SQL 文本**：逐字节，含空白与换行；模板字符串比较拼出后的文本；
   - **参数数组**：元素、类型（含 `bigint`）与顺序；
   - 调用的先后与次数；
   - 返回值：键、值与键顺序；`Set` / `Map` 的元素与迭代顺序；
   - 抛出的错误：构造器、`code`、全部自有可枚举属性与 `message`，以及先后。

   只改代码组织，不修 bug，不改 SQL，“只是缩进”也不改。拆分时发现的疑似缺陷登记在 PR 正文，留作后续任务。
2. **返回对象的键与顺序不变**：`Object.keys(tradeDocumentRepository(db))` 两侧相同，共 27 个键，按“现状”所列顺序。
   - 可以按职责拆成若干工厂，由 `tradeDocumentRepository` 按原顺序展开组合；
   - 每个键是否 `async` 保持原样：`tradeDocument`、`tradeDocumentByReceipt` 仍是非 `async` 箭头函数，其余仍是 `async`。
3. **`insertSegments` 只有一份**：`insertTradeItem` 与 `insertTradeDocument` 仍调用**同一个**实现；可以搬到模块顶层，以 `db` 为参数。`segments`、`document` 同理，各只一份（R5d）。
4. **写方法内的语句顺序不变**：“现状”3 所列四个写方法的语句与判断顺序原样保留；`refreshOrdersOfItem` 的调用条件原样保留。`insertTradeDocument` 为满足 ② 可以提出“写发票行”“写未结项与条件”等函数，但调用先后与 `settlementTerms` 检查的位置（`INSERT INTO open_items` 之后、`INSERT INTO trade_invoice_terms` 之前）不变。
5. **SQL 的组织**：
   - 内联 SQL 字符串与模板字符串原样搬到新文件，含全部 `${…}` 插值与 `tradeOpeningItems` 的多行文本（缩进与换行是 SQL 文本的一部分）；
   - **不得**拆成片段再拼接，不得改插值的位置与表达式；已有的片段构造函数（`tradeOrderPageSelect` 等）原样搬移；
   - 参数数组原样搬移，元素顺序不变。
6. **模块级函数与导出**：
   - `trade-documents.ts` 的**导出集合不变**：8 个名称、种类（`const` / function / async function）与签名都与 base 相同。现有导入方（bench、`migrations.ts`、`master-data.ts`、两个测试支持文件）**不改**，仍从 `./trade-documents.ts` 导入。
   - 导出项的定义可以原样搬到新文件，由 `trade-documents.ts` 以 `export { … } from "./trade-document-….ts"` 重新导出；也可以留在原文件。两种做法都要求定义源文本逐字不变（R5c）。
   - 模块私有的辅助（`int`、`str`、`json`、`optional`、行映射、SQL 片段、订单开票状态）可以原样搬到新文件；被多个文件使用的放进一个共用文件，不复制。
   - 全部注释（含 TORD- / TINV- 编号的块注释）随所注释的代码原样搬移，一条不删。
7. **文件**：
   - 新文件与 `trade-documents.ts` 同放在 `packages/infra/src/storage/`（平铺，不建子目录）；
   - 新文件以 `trade-document-` 开头按职责命名，例如 `trade-document-rows.ts`（取值与行映射）、`trade-document-order-invoicing.ts`（订单开票状态与 `refreshTradeOrderInvoicing`）、`trade-document-order-page.ts`、`trade-document-items.ts`、`trade-document-settlements.ts`、`trade-document-invoices.ts`；粒度由开发定，写入 PR 正文；
   - 不得与该目录现有文件重名（现有 `trade-documents.ts`、`trade-master.ts`、`trade-reporting.ts`）；
   - **新文件不导入 `trade-documents.ts`**；新文件只被 `trade-documents.ts` 或本任务的新文件导入，**不**加入 `storage/index.ts`；
   - `tradeDocumentRepository` 仍从 `./trade-documents.ts` 导出，签名不变。
8. **`trade-documents.ts` 之外的 import 不变**：新文件从 `@erp/core/*`、`./trade-master.ts`、`./types.ts` 导入的名称都是 base 已在用的；不新增对其他模块的依赖。
9. **不改**：
   - `packages/infra/src/storage/` 下其他现有文件，含 `master-data.ts`、`migrations.ts`、`trade-master.ts`、`trade-reporting.ts`、`types.ts`、`index.ts`、`journal-*.ts`、`business-*.ts`、`report-*.ts`；迁移 SQL 文件；
   - `packages/infra/src/**` 其他目录（含 `http/trade-documents.ts`）；
   - `packages/infra/test/**`、`packages/infra/bench/**`；
   - `packages/core/**`（含 `TradeDocumentRepository` 接口、`StorageError`、`tradeDocumentError`）、`packages/web/**`；
   - `scripts/**`（含 `scripts/slot/`、`scripts/measure/`）、`scripts/test-shard-weights.json`、`package.json` / lock、`vitest.config.ts`。

## 冲突域

- infra-storage:trade-documents：只改 `packages/infra/src/storage/trade-documents.ts`，并新增同目录下的 `trade-document-*.ts`（决定 7）。
- 取证所需的观测点和新增测试文件：无。R4 驱动不提交。
- 受影响的 e2e 断言（S13 回顾行动 1）：订单、发票、付款核销、贷项 / 取消 / 反向与详情页的 `trade-gui` 场景**必须继续成立**；合并前由 R3 与 R4 保证，合并后由 R8b 复核。**须随本任务改**：无。
- 受影响的文档引用（D460）：`git grep -n -F "storage/trade-documents.ts" -- docs design` 在 `5be9496` 上命中 26 行，都是当时的事实记录，不改。
- 与在评审及同批任务不相交：
  - REFAC-24 只改 `packages/web/src/AiPanel.tsx` 与新目录 `packages/web/src/ai-panel/`；
  - REFAC-27 只改 `packages/core/src/application/trade-documents.ts` 与同目录新增的 `trade-settlement-*.ts`。

  三者没有共享文件。REFAC-27 的 R4 在仓储接口层记录调用，不受本任务影响；两者都跑 `core`、`infra`、`infra-isolated` 项目，谁先合并，另一方把 R3 / R4 的 base 换成实际合并基重跑。

## 验收

### base 失败、head 通过

| 编号 | 检查 | base `5be9496` | head 要求 |
| --- | --- | --- | --- |
| R6a | `node fnlen.cjs packages/infra/src/storage`（口径同 S16–S24）中 `tradeDocumentRepository` 与 `insertTradeDocument` 的行数 | **616**、**101**（失败） | 都 ≤ 80，且本任务新增或改动的函数都 ≤ 80 |
| R6b | `trade-documents.ts` 的总行数（`(Get-Content <file>).Count`） | **955**（失败，③ 热点） | ≤ 120；新文件各 ≤ 250 |

### 两侧都须成立的不变量

- **R1 范围**：
  - `git diff --name-only <base> <head>` 只含 `packages/infra/src/storage/trade-documents.ts` 与同目录新增的 `trade-document-*.ts`；
  - 决定 9 所列文件的 diff 为空；
  - 不加迁移。
- **R2 导出与键不变**：
  - 在 base 与 head 上各 `import * as m from ".../storage/trade-documents.ts"`，打印 `Object.keys(m).sort()`、每项的 `typeof` 与（函数的）`constructor.name`。两侧逐行相同（决定 6）；
  - `tradeOrderPageSql` 的值两侧逐字节相同；
  - 8 个导出的类型注解与定义源文本相同，只归一空白。用 `@babel/parser`（插件 `typescript`）解析，口径同 REFAC-14 R2；
  - 在 base 与 head 上各对一个只含 `query` 的连接对象调用 `tradeDocumentRepository`，打印 `Object.keys(…)` 与每个值的 `constructor.name`（`AsyncFunction` / `Function`）。两侧逐行相同（决定 2）；
  - 新文件的导出只在本任务文件内使用，PR 正文附 `git grep` 结果；
  - `npm run check:boundaries` 通过。
- **R3 既有测试原样通过**：
  - `npx vitest run --project core --project infra --project infra-isolated` 全部通过；
  - 测试文件 diff 为空；
  - PR 正文附汇总行原文，base 与 head 各一次；
  - 有失败时逐个列出，并附只对失败文件的串行重跑原文（`--no-file-parallelism`）。
- **R4 返回值、错误与数据库调用序列等价**（送审证据；驱动不提交，不加常驻 CI 用例）：
  - **驱动**：临时 node / vitest 脚本。
    - 在 base 与 head 上用同一份虚构数据建库：临时目录中新建 SQLite 并跑全部迁移；可借用 `trade-documents.test.ts` 与 `test/support/trade-ledger.ts` 的建账、主数据与订单步骤。
    - 从源文件导入 `tradeDocumentRepository` 与 8 个模块级导出，传入**委托包装的连接对象**，直接调用 27 个方法以及 `tradeOrderStatuses`、`refreshTradeOrderInvoicing`。`tradeOrderPageStatement`、`tradeDocumentPageStatement`、`tradeOrderPageInvoicedSql`、`tradeOrderInvoicingStatus` 不访问数据库，直接记录其返回值。
    - 单据、动作、付款与回执由驱动按固定值构造（固定 id、日期、`postedAt`、`fingerprint`），不用当前时间与随机值。
  - **记录规则**：与 [REFAC-25 R4](REFAC-25-journal-repository-split.md#两侧都须成立的不变量) 相同，后者复用 [REFAC-17 R4](REFAC-17-prepare-trade-action-split.md#两侧都须成立的不变量)。
    - 包装对象是**普通的新对象**，对原连接的每个方法逐一写转发函数，不用 `Proxy`。
    - 调用时分配递增序号，并立即写入 `{seq, method, args}`：SQL 文本**原样**写入，不归一空白；参数经确定性编码（`bigint` 须与 `number` 区分）。
    - 返回 Promise 时先记 `pending`，完成后在同一条记录写 `resolved` 与编码后的行，或写 `rejected` 与错误摘要。
    - 方法结束后不得有仍为 `pending` 的记录。
    - 返回值中的 `Set` / `Map` / `bigint` / `undefined` / `Date` / 函数按 `$set` / `$map` / `$bigint` / `$undefined` / `$date` / `$function` 编码，保留元素与迭代顺序（`tradeOpeningItems`、`tradeOrderStatuses` 返回集合类型）。
    - 驱动须带 REFAC-17 的自测（a）–（c），失败即 R4 失败。
  - **每个用例记录**：
    - 返回值（编码后的 JSON），或抛出的错误（构造器名、`code`、全部自有可枚举属性、`message`）；
    - 完整调用记录；
    - **写入类方法**另在调用后用驱动自己的查询（不经过包装对象、不计入记录）读出受影响的表行，按主键排序后编码，作为“库内状态”一并比较。涉及的表：`trade_documents`、`trade_document_lines`、`open_items`、`trade_control_segments`、`trade_invoice_terms`、`trade_item_sources`、`trade_actions`、`trade_action_items`、`trade_credit_lines`、`trade_payments`、`settlements`、`trade_orders`、`trade_order_lines`、`trade_order_invoicing`。
    - 预期抛错的写入用例在驱动自己开的事务中调用，记录后回滚，使后续用例的库不受影响；“库内状态”在回滚前读出。
  - **用例**至少包含（某个用例在虚构数据上构造不出来时，PR 正文写明原因并报协调者，不得静默删去）：
    - **发票写入**：
      - `insertTradeDocument`：无订单 2 行、带 `controlSegments` 2 段；无订单 1 行、不带 `controlSegments`（走默认单段）；关联 2 张订单（其中一张被两行引用，覆盖去重）；
      - `insertTradeDocument`：`snapshot.settlementTerms` 缺失。
    - **未结项与动作**：
      - `insertTradeItem`：带 2 段；
      - `changeOpenItem`：版本正确且状态不变（`open` → `open`）；`open` → `cancelled`；`cancelled` → `open`；版本错误；某段的维度键不存在；
      - `insertTradeAction`：`credit`（2 行贷项，原发票关联订单）、`cancel`、`reverse`、其他（`relatedId` 为 `null`）各一个；
      - `tradeAction` / `tradePayment`：按 id 与按回执键（`byReceipt = true`）各一次，存在与不存在；
      - `tradeItemActions`、`tradeUndo`、`tradeItemSource`、`tradeCreditLines`、`latestSettlementDate`（无核销时与有核销后各一次）；
      - `tradeOpeningItems`：空数组；含 2 个期初项与 1 个非期初项的数组（期初项即 `legacy_refs` 中 `object_type='opening_items'` 指向的未结项，可借用 `legacy-opening-items.test.ts` 的虚构导入步骤）。
    - **付款与核销**：`insertTradePayment`；`settleOpenItem` 部分核销（结果 `open`）、全额核销（结果 `settled`）、版本错误、`segments` 缺失、段余额不足；`itemSettlements`。
    - **订单**：`insertTradeOrder`；`tradeOrder` 存在与不存在；`tradeOrderPage` 不带过滤、按开票状态过滤、带游标；`tradeOrderInvoiced` 空数组、有贷项冲减的订单；`tradeOrderLatestDate`；`tradeOrderStatuses` 与 `refreshTradeOrderInvoicing`（空数组、1 张、超过 400 张以覆盖分块；后者可用较少数据时写明实际张数与理由）。
    - **配置**：`tradeConfigsByCodes` 空数组、2 个代码（每种 `kind` 至少覆盖 `tradeProduct` 与 `taxCode`）。
    - **发票与未结项查询**：`tradeDocument`、`tradeDocumentByReceipt`、`tradeDocumentByExternal` 各存在与不存在；`tradeDocumentPage` 不带过滤、按往来方、带游标；`openItem` 存在与不存在；`openItemPage` 不带游标、带游标，`limit` 等于与小于行数。
    - **已损坏的存储行**（独立的合成用例）：
      - 不可变表禁止 `UPDATE` / `DELETE`，因此**不得**改已有行，也**不得**关闭或删除触发器、关闭外键。
      - **不用超出安全整数的整数**：连接开了 `defaultSafeIntegers(true)`，读出的是 `bigint`，base 的 `int` 对 `bigint` 直接 `Number(value)`（舍入、不抛错），这样的行不会触发失败。本任务也不得改映射去“修”精度。
      - 做法：在该用例自己的库中（外键开启、触发器保留），先经服务正常过账一张发票，再用驱动自己的 SQL **插入一条独立的新发票行**：从该发票第 1 行 `INSERT … SELECT` 复制其余列，`line_id` 取新值（如 `'BAD-BLOB'`）、`line_no` 取该发票现有最大值 + 1，`unit_price` 为 BLOB `X'00'`（该列是无 `typeof` 检查的 `TEXT`，BLOB 原样保存）。然后对该发票调用 `tradeDocument`，行映射的 `str(row.unit_price)` 因值不是字符串而抛错。
      - 插入语句、`changes` 与 `SELECT typeof(unit_price)` 的结果写入 PR 正文。已在 base `5be9496` 上实测：插入 `changes = 1`、`typeof` 为 `blob`，插入前 `tradeDocument` 正常返回，插入后抛 `StorageError`、`code` 为 `STORAGE_FAILURE`。若在实际合并基上该行无法插入，写明约束名与错误原文并报协调者，不得绕过，也不得静默删去该用例。
    - **只含 `query` 的连接**：传入只有 `query` 方法的普通对象，构造后调用一次 `openItemPage`。
  - **判定**：base 与 head 每个用例的记录与库内状态逐字节相同。PR 正文附两侧输出的 SHA-256 与比较结果。并且**直接断言**，只比两侧相同不够：
    1. **发票写入顺序**：无订单 n 行、k 段时，调用记录依次为：1 条 `INSERT INTO trade_documents`、n 条 `INSERT INTO trade_document_lines`、1 条 `INSERT INTO open_items`、1 条 `INSERT INTO trade_invoice_terms`、k 条 `INSERT INTO trade_control_segments`，共 n + k + 3 次；不带 `controlSegments` 时 k = 1。关联订单的用例在其后依次出现开票状态查询与每张订单 1 条 `UPDATE trade_order_invoicing`，订单 id 各只出现一次。
    2. **条件缺失**：`settlementTerms` 缺失时抛 `StorageError`、`code` 为 `STORAGE_FAILURE`，调用记录恰好 n + 2 次，最后一条为 `INSERT INTO open_items`。
    3. **冲突与 `code` / `rule` 分开**：
       - `changeOpenItem` 与 `settleOpenItem` 版本错误：`DomainError`、`code` 为 `CONFLICT`、`issue` 为 `{scope: "tradeDocument", path: "revision", rule: "stale"}`，调用记录恰好 1 次；
       - `settleOpenItem` 段余额不足：`DomainError`、`code` 为 `CONFLICT`、`issue` 为 `{scope: "tradeDocument", path: "segments", rule: "stale"}`，不出现 `INSERT INTO settlements`；
       - `settleOpenItem` 的 `segments` 缺失、`changeOpenItem` 的维度键不存在：`StorageError`、`code` 为 `STORAGE_FAILURE`；前者调用记录恰好 1 次。

       以上按 base 实际抛出的错误写（`tradeDocumentError` 见 `packages/core/src/domain/trade-documents.ts`）；任一项在 base 上不成立时，先停下并报协调者，**不得**改产品代码来迁就断言。
    4. **订单刷新只在取消状态翻转时**：`changeOpenItem` 的 `open` → `open` 用例中不出现 `SELECT order_id FROM trade_document_lines … UNION …`；`open` → `cancelled` 与 `cancelled` → `open` 用例中各出现 1 次，且在所有段 `UPDATE` 之后。`insertTradeAction` 只在 `credit` 用例中出现该查询。
    5. **0 次查询的分支**：`tradeOpeningItems([])` 返回空 `Set`、`tradeOrderInvoiced([])` 与 `tradeConfigsByCodes(…, [])` 返回 `[]`、`refreshTradeOrderInvoicing(…, [])`，调用记录都为 0 次；不存在的 `tradeDocument` 恰好 1 次并返回 `null`。
    6. **集合返回值**：两个期初项的 `tradeOpeningItems` 用例中，编码后的 `$set` 恰好含这两个 id，与空数组用例的编码不同。
    7. **游标与上限**：`openItemPage` 的 `LIMIT` 参数为 `limit + 1`。
    8. **已损坏的存储行**：插入 BLOB `unit_price` 的新发票行本身成功（`changes = 1`，`typeof(unit_price) = 'blob'`）；插入前 `tradeDocument` 两侧都正常返回，插入后两侧都抛 `StorageError`、`code` 为 `STORAGE_FAILURE`。这是 base 的现有行为，本任务保留。
    9. **方法名**：调用记录中的方法名只有 `query`；只含 `query` 的连接用例不抛错，且返回值与完整连接上同一调用的返回值相同。

    base 上任一直接断言不成立，先停下并向协调者报告，不得把“两侧相同”当作通过。PR 正文附驱动、用例清单、比较结果与直接断言结果。
  - **驱动原件**：PR 正文贴驱动**原文件字节的 base64**；或者同时写出两种 SHA-256：原始字节的，以及按 UTF-8 解码并把换行归一为 LF 后的字节的（评审从代码块复制时得到的是 LF 文本）。只给一种哈希不算满足。
- **R5 结构规则**（静态；评审按代码与 PR 表格核对）：
  - **R5a SQL 原文**：base 与 head 中每一段 SQL 字符串与模板字符串逐字比较，**不**归一空白，含所有插值表达式的源文本。PR 正文附 Babel AST 抽取脚本与两侧输出的 SHA-256。不同即失败。
  - **R5b 无模块级可变状态**：新文件与 `trade-documents.ts` 的模块顶层只有 `import` / `export`、类型、函数声明与 `const` 常量，不含 `let` 与可变容器。PR 正文附 Babel AST 检查脚本的输出。
  - **R5c 原文搬移**：8 个导出的定义、模块私有函数与常量、`segments` / `insertSegments` / `document` 的函数体，base 与 head 逐字比较，只归一缩进；27 个方法体除 `db` 的取得方式与决定 4 允许的提取外逐字比较；注释逐条比较，条数相同。不同即失败；有差异时在 PR 正文逐处说明。
  - **R5d 单一实现**：在 `packages/infra/src/storage/trade-documents.ts` 与 `'packages/infra/src/storage/trade-document-*.ts'` 范围内用 `git grep -c -F`（各文件计数之和）检索，两侧相同：
    - `INSERT INTO trade_control_segments`：**1**；
    - `INSERT INTO trade_documents(`：**1**；
    - `INSERT INTO settlements(`：**1**；
    - `UPDATE trade_order_invoicing`：**1**；
    - `INSERT INTO open_items(`：**2**（`insertTradeItem` 与 `insertTradeDocument` 各一，列不同）。

    PR 正文附两侧检索原文。
  - **R5e 依赖方向**：新文件之间的导入单向无环，`trade-documents.ts` 位于顶端；新文件不导入 `trade-documents.ts`。PR 正文附导入图。
- **R6 尺寸**：
  - 除上表 R6a、R6b 外，每个新函数满足 ②：≤ 80 行，嵌套 ≤ 3 层；
  - PR 正文列出所有超过 50 行的函数，附计数行数与最深层数（base 与 head 两列）；
  - SQL 字符串的行数照计。
- **R7 打包字节**：
  - 首屏与全部 chunk **±0**；
  - 用 `scripts/measure/bundle-measure.mjs --d454`，不传 `--route` / `--chunk`；写明脚本所在的提交 SHA；
  - base 为最终送审 head 的实际合并基；
  - 出现任何非 0 差异即停下报告。
- **R8 质量门**：
  - **R8a 合并前**：`typecheck`、`lint`、`check:boundaries`、CI-02 预检通过；PR CI（`ci.yml`）绿。
  - **R8b 合并后检查（不作合并门）**：合并后第一次覆盖该合并提交的 main Full 须绿，含 `trade-gui` 场景；失败时报协调者，按 D456 暂停后续合并。
- **R9 可读性一节**：PR 正文按下节逐条说明。

## 性能考虑

- **不跑 Bench**：
  - SQL 文本与参数逐字节相同（R4、R5a），SQLite 生成相同的执行计划；
  - 查询次数与先后相同（R4 直接断言 1–5）；
  - 剩余差异只有 JS 函数调用与对象展开的开销，每次构造仓储一次。

  若 R4 / R5a 出现任何 SQL 差异，本任务即不成立，不以 Bench 结果补救。`trade-order-list.ts`、`trade-invoice-list.ts` 导入的函数原样保留（决定 6），本任务不改 bench。
- 不改事务边界（本仓储不开事务）；不进打包产物（R7）。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥：

- **②**：`tradeDocumentRepository` 从 616 行拆到 ≤ 80 行，`insertTradeDocument` 从 101 行拆到 ≤ 80 行（R6a）；拆后 `tradeDocumentRepository` 只是“按顺序组合各组”。
- **③**：`trade-documents.ts`（955 行）是全仓最大的仓储文件；拆后 ≤ 120 行，新文件各 ≤ 250 行（R6b）。PR 正文贴 `git diff --numstat`。
- **①**：文件名与工厂名表达职责，例如“行映射”“订单开票状态”“未结项与动作”“付款与核销”“发票”。不用 `part1`、`helpers2` 这类名字。
- **④**：
  - `db` 只通过参数传入；
  - `insertSegments`、`segments`、`document` 与行映射各只一份（决定 3、R5d），供各组共用；
  - SQL 与参数数组放在同一个方法内。
- **⑤**：`changeOpenItem` 与 `settleOpenItem` 的 `UPDATE open_items` 语句文本相同，但参数与后续守卫不同，**不**强行合并（合并会改变 R5d 之外的结构且易改错顺序）；PR 正文说明这一点。
- **⑥**：
  - TORD- / TINV- 等全部注释随代码原样保留（R5c）；
  - 不新增注释，除非某处拆分需要说明“为什么”，例如“键顺序须与接口一致”“`settlementTerms` 检查必须在写入未结项之后”；
  - 不留调试输出。
- **测试耗时**：本任务不改测试；R4 驱动不提交。PR 正文附 `trade-documents.test.ts` 在 base 与 head 上的耗时（vitest 汇总行原文）；两侧差异 > 20% 时说明原因。

## 用户可见变化

- 无。订单、发票、未结项、付款核销、贷项 / 取消 / 反向的读写、分页、列表筛选与错误提示都不变（R3、R4）。

## 证据要求

- **不需要浏览器时段**：
  - 行为等价由 R3 与 R4 证明；
  - 经过这些接口的 `trade-gui` 场景在 main Full 中运行，作合并后检查（R8b）；
  - R4 与构建在本机运行，须服从协调者的时段静默通知（D442 / D480）。
- **可行性**（S13 回顾行动 4）：
  - `trade-documents.test.ts` 与 `test/support/trade-ledger.ts` 已能在临时 SQLite 上建账、建订单、开票、核销与做贷项；
  - `tradeDocumentRepository` 只依赖 `Connection.query`，REFAC-21 #343 与 REFAC-25 #348 已跑通同一记录方法；
  - R6a、R6b 与 R5d 的 base 数字见“现状”与上表，由设计角色实测；
  - 本任务书**没有**试写驱动。坏行用例、超过 400 张订单的分块用例依赖迁移约束与数据量；构造不出来时写明原因并报协调者，不得静默删去。
- PR 正文附：
  - R2 的导出、键序与 `git grep` 结果；
  - R3 汇总行；
  - R4 驱动（原件 base64 或两种 SHA-256）、用例清单、比较结果与直接断言结果；
  - R5a–R5e 各表；
  - R6 行数表（base 与 head 两列）；
  - R7 的 `bundle-measure.mjs` 完整输出与退出码；
  - 可读性一节。

  R8b 在合并后补到 PR 评论。

## 设计自查

- [x] 冲突域与在评审 REFAC-24、同批 REFAC-27 逐文件不相交。
- [x] 每条 base 失败、head 通过的检查都有 base 实测值。
- [x] 发票写入顺序、条件缺失、冲突（`code` 与 `rule` 分开）、订单刷新条件与 0 次查询分支都有直接断言。
- [x] 模块级导出与现有导入路径保持不变；bench、迁移与测试不改。
- [x] 坏行构造遵守不可变触发器（插入独立坏行），构造不出时停下报告。
- [x] 可读性一节齐全；无用户可见变化。
- [x] 不加迁移，不碰 `scripts/slot/`、`scripts/measure/`。
