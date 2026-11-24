# REFAC-23：拆分发票准备 `TradeDocumentService.prepare`（不改行为）

- Sprint：S24（[计划草案](S24.md)）　类型：重构（核心应用层）　优先级：P2　决定：[D542](S24.md#s24-期间决定)（只改代码组织、不改行为；见“范围与决定”1–7）　建议分支：`refac-23-split-trade-invoice-prepare`
- 来源：② 存量。TMAS-01 #342 合并后空出 1 个开发名额，协调者要求从候选池挑一项：与在岗的 REFAC-21（`packages/infra/src/storage/business-*`）、REFAC-22（`Accounts.tsx` 页面拆分）冲突域不相交，不是页面拆分，不加迁移。
- 迁移：**不加**。浏览器时段：**不需要**（理由见“证据要求”）。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 为什么是它

- 设计角色在 `3c9f5fd` 上用 `node files/fnlen.cjs packages/core/src packages/infra/src` 复测，超过 ② 上限的前几名：

  ```text
  616	packages/infra/src/storage/trade-documents.ts:336-955	tradeDocumentRepository
  606	packages/infra/src/legacy/opening-items.ts:163-773	checkOpeningItems
  382	packages/infra/src/legacy/reconcile.ts:91-474	reconcileLegacy
  325	packages/infra/src/storage/business-events.ts:107-432	businessRepository
  253	packages/infra/src/legacy/import-plan.ts:452-704	mapRow
  251	packages/core/src/application/trade-documents.ts:863-1114	prepare
  244	packages/infra/src/storage/journals.ts:78-321	journalRepository
  ```

- 逐项排除：
  - `businessRepository`：REFAC-21 在岗。
  - `tradeDocumentRepository`、`journalRepository`：读写 SQL 仓储，[S24 候选](S24.md#候选s24-其余泳道s23-评审后定)写明等 REFAC-21 合并、读写方法跑通后再排。
  - `checkOpeningItems`、`reconcileLegacy`、`mapRow`：legacy 导入与期初核对，验证会靠近真实旧账口径，本 Sprint 不碰。
  - 页面拆分（`Workspace`、`MasterSettings` 等）：REFAC-22 在岗，同一时间只一个。
  - Demo 全产物清单脚本化、门禁判定检查器：属 `scripts/slot/`；多订单合并开票、M2-05：加迁移。
- 选 `prepare`（发票的准备：计算、订单匹配、日记账行、科目角色、计划与指纹）：
  - 它是采购 / 销售发票**预览与确认的唯一准备入口**（`trade-documents.ts:1143` 的 `preview`、`:1176` 的 `confirm`）；多订单合并开票会在订单匹配旁加规则，先拆小可以缩小之后的评审面。
  - 纯应用层逻辑：副作用只有经 `repo` 的读取与 `journals.adapter("TRADE").plan`。等价可以沿用 [REFAC-17](REFAC-17-prepare-trade-action-split.md) 已跑通的“委托包装 + 调用记录”方法，不经浏览器、在 node 中逐字节比较（R4）。
  - 与 REFAC-17 同层、同类：REFAC-17 拆了同一服务的贸易调整入口，本任务拆发票入口，评审可以对照。
- 不是页面拆分；不改 web，不进任何打包产物。

## 现状（main `3c9f5fd`）

下文 `file:line` 都按 `3c9f5fda669151408f170ef21bedd2d5cf54d669`。

- `packages/core/src/application/trade-documents.ts` 共 **1346** 行，导出 `TradeDocumentService`（`:247`）等。`prepare` 是该类的 **private async 方法**（`:863–1114`），签名 `prepare(repo: Repo, command: TradeInvoiceCommand): Promise<Prepared>`；`Prepared` 是模块内接口（`:226–236`），`Repo` 是 `MasterDataRepository` 的别名（`:245`）。
- **调用方**：只有同类的 `preview`（`:1139–1145`，`store.read` 内先 `unique` 再 `prepare`，只取 `.preview`）与 `confirm`（`:1176`，取 `journal`、`lines`、`controlIndexes`、`settlementTerms` 与 `preview`）。`packages/web/src` 不导入 `@erp/core/application`（`git grep -n "@erp/core/application" -- packages/web/src` 无命中）。
- **`prepare` 的结构**（`:863–1114`，251 行）：
  1. **命令哈希、公司与主数据**（`:864–883`）：`tools.hash(["trade-invoice-v1", command])` → `this.company` → `this.party`（得 `party`、`profile`、`terms`）→ `this.resolveLines`（得 `resolved`、`configs`；`:874` 有一条英文注释说明税率按 `taxDate`、其余按 `accountingDate`）。
  2. **计算**（`:884–908`）：`calculateTrade({...})`，逐行把 `resolved[index].tax` 映射为 `tax`（`mode === "ordinary"` 时为 `"standard"`，否则原值）；`calculation.gross <= 0` 时抛 `lines` / `shape`。
  3. **订单匹配**（`:909–953`）：`command.orderId !== null` 时依次 `repo.tradeOrder` → 日期检查（`accountingDate < order.orderDate || accountingDate < await repo.tradeOrderLatestDate(...)`，`||` 短路）→ 方向 / 往来方 / 币种检查 → `referenced`（`orderLineId` 去重，`new Set`）→ `repo.tradeOrderInvoiced` → 逐行找订单行、校验产品、`matchTradeOrderLine`。之后 `outside` 与 `matchingException` 的一致性检查（不论有无订单都做），得 `poMatch`。
  4. **日记账行**（`:954–1029`）：`push` 闭包（`:957–974`，`minor === 0` 时不推入，否则同时推入 `journalLines` 与 `master`）。**先**对所有 `gross` 非 0 的行推入控制科目行并记 `controlIndexes`（`:978–988`），**再**逐行推入收入 / 费用科目行与税额行，同时生成 `TradeDocumentLine`（`:989–1029`）；税额 > 0 而税科目为 `null` 时抛 `lines.<index>.taxCode` / `account`。
  5. **科目角色**（`:1030–1062`）：`normalizeExternalInvoice` → `this.accountRoles(...)`，输入数组为控制科目在前，再逐行收入 / 费用科目与（税额 > 0 且有税科目时）税科目。
  6. **草稿、计划、日期与指纹**（`:1063–1091`）：`JournalDraft`（`sourceRef` 为 `` `TRADE-${command.side}-INV:${command.documentId}` ``，`memo` 为 `` `${command.side} invoice ${external}`.slice(0, 200) ``）→ `journals.adapter("TRADE").plan(repo, company, draft, master)` → `addTradeDays` 两次 → `tools.hash(["trade-invoice-preview-v1", commandHash, journal.fingerprint, party, profile, terms, configs, accounts, order, matches])`。
  7. **返回**（`:1092–1113`）：`Prepared`。
- **重复的表达式**（R6b）：税科目 `command.side === "AP" ? tax.tax.data.inputAccount : tax.tax.data.outputAccount` 与税额 `command.side === "AP" ? calc.deductibleTax : calc.tax` 在 `:1000–1003` 与 `:1040–1042` 各写了两遍；`git grep -c -F "tax.tax.data.inputAccount : tax.tax.data.outputAccount" -- packages/core/src` 为 **2**（都在本函数），`git grep -c -F "calc.deductibleTax : calc.tax" -- packages/core/src/application` 为 **2**。
- **最容易被误改的顺序与细节**（R4 专门覆盖）：
  - 错误先后：`lines` / `shape` 在任何订单读取之前；订单检查的顺序是“不存在 → 日期 → 方向 / 往来方 / 币种 → 逐行订单行”；`matchingException` 检查在订单检查之后、日记账行之前；税科目缺失在日记账行生成中、按行号先后；科目角色错误在之后；计划错误最后。
  - `tradeOrderLatestDate` 只在 `accountingDate >= order.orderDate` 时才调用（`||` 短路）。
  - 日记账行顺序：全部控制科目行在前，然后每行“收入 / 费用科目行、税额行”交替；`controlIndexes` 是控制科目行在 `journalLines` 中的下标；`minor === 0` 的行不推入，也不推入 `master`。`confirm` 用 `controlIndexes[0]` 取控制行（`:1181–1183`），顺序错了会写错未结项。
  - `master` 中每项的默认维度为 `{ ...party.data.defaultDimensions, ...product.data.defaultDimensions }`（产品覆盖往来方）。
  - `this.accountRoles` 输入数组的元素顺序决定其内部仓储读取顺序与报错的 `path`。
  - 两次 `tools.hash` 的输入数组元素与顺序、版本标签 `"trade-invoice-v1"` / `"trade-invoice-preview-v1"` 进入回执与幂等比较（`confirm` 的 `:1167` 也算一次 `"trade-invoice-v1"`）。
- **测试**：
  - `packages/infra/test/application/trade-documents.test.ts` 经服务直接调用 `preview` / `confirm`（源码中 32 处 `.preview(` / `.confirm(`，`matchingException` 9 处）；`trade-order-credit-invoicing.test.ts` 经订单开票。
  - Bench：`packages/infra/bench/trade-order-preview.ts` 等构造 `TradeDocumentService`，不改。
  - 真实 Chrome（只在 main Full 中运行）：`trade-gui/scenario/invoice-entry.ts`、`invoice-source-orders.ts`、`api-watch.ts` 等经过发票预览与确认。
  - `packages/core/test` 没有直接针对本方法的用例。

### chunk 归属与首屏（S22 回顾行动 3）

| 文件 | 落在哪个 chunk | 依据 |
| --- | --- | --- |
| `packages/core/src/application/trade-documents.ts`（改）与新文件 | **不进任何 web chunk** | `packages/web/src` 不导入 `@erp/core/application`（“现状”检索）；服务端代码 |
| 首屏 | **±0** | 同上；由 R7 的构建测量确认 |

## 范围与决定

1. **不改行为**（D542）。对任何输入（含非法输入），以下全部不变：`prepare` 的返回值（`Prepared` 全部字段，含 `preview.fingerprint`、`journal`、`lines`、`controlIndexes`、`settlementTerms`）；抛出的错误（构造器、`code`、全部自有可枚举属性与 `message`）及其**先后**；对 `repo`、`journals`（含 `adapter(...)` 返回对象的 `plan`）、`tools` 的调用序列（方法名、参数、先后与次数）。只改代码组织，不修 bug；拆分时发现的疑似缺陷登记在 PR 正文，留作后续任务。
2. **`prepare` 留在类内**：仍是 `TradeDocumentService` 的 `private async prepare(repo: Repo, command: TradeInvoiceCommand): Promise<Prepared>`，名称、参数与返回类型的源文本不变（R2）；它只做编排：按 base 顺序调用 `this.company`、`this.party`、`this.resolveLines`、新模块函数、`this.accountRoles`、`journals.adapter("TRADE").plan` 与两次 `tools.hash`。`this.company`、`this.party`、`this.resolveLines`、`this.accountRoles` 与类的其他成员**不改**，也不搬出类。
3. **新模块函数**：可以抽成模块顶层函数（例如 `invoiceCalculationInput`、`matchInvoiceOrder`、`invoiceJournalLines`、`invoiceAccountRoleInputs`、`invoiceDraft`），粒度由开发定，写入 PR 正文。要求：
   - 需要读仓储的函数（订单匹配）接收 `repo` 作参数，读取先后与 base 相同；不访问 `this`。
   - 日记账行生成保持“全部控制科目行在前、再逐行科目行与税额行”的两趟结构；`push` 的 `minor === 0` 判断与两数组同步推入原样搬移。
   - 订单检查与 `matchingException` 检查的先后不变，`||` 短路保留。
4. **税科目与税额去重**（R6b）：`:1000–1003` 与 `:1040–1042` 两处相同的“按方向取税科目、税额”合并为**一个**辅助（例如 `invoiceTaxPosting(side, calc, tax)` 返回 `{ account, minor }`），两处都调用它。两个三元表达式在辅助中**原文**各出现一次（R5c）。两处原有的取值都是纯属性读取，合并不改变副作用。
5. **注释与字面量**：`:874` 的英文注释原文随代码保留；`"trade-invoice-v1"`、`"trade-invoice-preview-v1"`、`"TRADE"`、`revision: 0`、`kind: "normal"`、`operation: "journal"`、`.slice(0, 200)` 等都是领域语义或版本标签，原文不变，**不**新增具名常量（不在 ⑤ 范围）。
6. **文件**：新文件与 `trade-documents.ts` 同放在 `packages/core/src/application/`（平铺，不新建子目录），以 `trade-invoice-` 开头按职责命名（例如 `trade-invoice-order-match.ts`、`trade-invoice-journal.ts`）。新文件**不**导入 `trade-documents.ts`（避免循环），只被 `trade-documents.ts` 或本任务的新文件导入，**不**加入 `application/index.ts`。`Prepared`、`Repo` 留在 `trade-documents.ts`；新文件需要的类型从 `@erp/core/domain` 或 `./master-data.ts`、`./journals.ts` 以 `import type` 取得。
7. **不改**：
   - `trade-documents.ts` 中 `prepare` 以外的成员与模块级声明（`preview`、`confirm`、`unique`、`company`、`party`、`resolveLines`、`accountRoles`、`calculateOrder` 等；只允许增加对新文件的 `import` 与删去因此不再使用的 `import` 名称）；`application/` 下其他现有文件（含 `trade-adjustments.ts`、`trade-action-*.ts`、`index.ts`）；`packages/core/src/domain/**`、`packages/core/src/contracts/**`；
   - `packages/infra/**`（含 `src`、`test`、`bench`）、`packages/web/**`；
   - `scripts/**`（含 `scripts/check-boundaries.mjs`、`scripts/slot/`、`scripts/measure/`）、`scripts/test-shard-weights.json`、`package.json` / lock、`vitest.config.ts`。

## 冲突域

- core-app:trade-invoice：只改 `packages/core/src/application/trade-documents.ts`，并新增同目录 `trade-invoice-*.ts`（决定 6）。
- 取证所需的观测点和新增测试文件：无（R4 驱动不提交）。
- 受影响的 e2e 断言（S13 回顾行动 1）：经过发票预览与确认的 `trade-gui` 场景（“现状”）**必须继续成立**；合并前由 R3 与 R4 保证，合并后由 R8b 的 main Full 复核；**须随本任务改**：无。
- 受影响的文档引用（D460）：`git grep -n -F "trade-documents.ts" -- docs design` 中指向 `packages/core` 的行都是当时的事实记录，不改。
- 与在岗任务不相交：
  - REFAC-21 只改 `packages/infra/src/storage/business-events.ts` 与同目录 `business-*.ts`；
  - REFAC-22 只改 `packages/web/src/Accounts.tsx` 与 `accounts/`。

  三者没有共享文件。本任务与 REFAC-21 都跑 `core`、`infra`、`infra-isolated` 项目，但互不改对方的被测文件；先合并的一方之后，另一方的 R3 / R4 按实际合并基重做。

## 验收

### base 失败、head 通过

| 编号 | 检查 | base `3c9f5fd` | head 要求 |
| --- | --- | --- | --- |
| R6a | `node fnlen.cjs packages/core/src`（口径同 S16–S24）中 `prepare`（`trade-documents.ts`）的行数 | **251**（失败） | ≤ 80，且本任务新增或改动的函数都 ≤ 80 |
| R6b | ① `git grep -c -F "tax.tax.data.inputAccount : tax.tax.data.outputAccount" -- packages/core/src/application`；② `git grep -c -F "calc.deductibleTax : calc.tax" -- packages/core/src/application`（各文件计数之和） | ① **2**、② **2**（失败） | ① **1**、② **1**（决定 4） |
| R6c | `trade-documents.ts` 的总行数（`(Get-Content <file>).Count`） | **1346**（失败） | ≤ 1200；新文件各 ≤ 250 |

### 两侧都须成立的不变量

- **R1 范围**：`git diff --name-only <base> <head>` 只含 `packages/core/src/application/trade-documents.ts` 与同目录新增的 `trade-invoice-*.ts`；决定 7 所列文件的 diff 为空。不加迁移。
- **R2 导出与签名不变**：
  - `trade-documents.ts` 的导出集合与 base 相同；`TradeDocumentService` 的成员集合（名称、`private` / 公开、`async`）与 base 相同；
  - `prepare` 的参数与返回类型源文本相同（只归一空白）；`prepare` 以外成员的函数体源文本相同（只归一空白）。

  用仓库根 devDependency `@babel/parser`（插件 `typescript`）解析，口径同 REFAC-17 R2。新文件的导出只在本任务文件内使用，PR 正文附 `git grep` 结果。`npm run check:boundaries` 通过。
- **R3 既有测试原样通过**：`npx vitest run --project core --project infra --project infra-isolated` 全部通过（含 `trade-documents.test.ts` 与 `trade-order-credit-invoicing.test.ts`）；测试文件 diff 为空。PR 正文附汇总行原文，base 与 head 各一次；有失败时逐个列出，并附只对失败文件的串行重跑原文（`--no-file-parallelism`）。
- **R4 返回值、错误与调用序列等价**（送审证据，驱动不提交，不加常驻 CI 用例）：
  - **驱动**：临时 node / vitest 脚本，在 base 与 head 上用同一份虚构数据建库（可借用 `trade-documents.test.ts` 的建账、主数据与订单步骤）。用包装后的 `journals` 与 `tools` 构造 `TradeDocumentService`，**直接调用** `service["prepare"](wrappedRepo, command)`（private 只在类型层面，驱动可用 `as any` 访问；决定 2 保证两侧可用同一调用方式）。`hash` 照常计算。
  - **记录方法**：**原样复用 REFAC-17 R4 的“委托包装对象”与“记录编码”两条规则及其自测 (a)–(c)**（[REFAC-17 R4](REFAC-17-prepare-trade-action-split.md#两侧都须成立的不变量)）：不用 `Proxy`；调用时编号并先写一条记录，Promise 完成后在同一条记录写 `resolved` / `rejected`；`prepare` 结束后不得有 `pending` 记录；`journals.adapter` 的包装返回新的普通对象，`plan` 换成记录函数，不修改冻结的原对象；`Set` / `Map` / `bigint` / `undefined` / `Date` / 函数按 `$set` / `$map` / `$bigint` / `$undefined` / `$date` / `$function` 编码。
  - **驱动原件**：PR 正文贴驱动原件的 base64，或同时写出原始字节与 UTF-8 / LF 归一后的两种 SHA-256。
  - **每个用例记录**：返回值（编码后的 JSON，键顺序照原样）或抛出的错误（构造器名、`code`、全部自有可枚举属性、`message`）；完整调用记录。
  - **用例**至少包含（某个用例在虚构数据上构造不出来时，PR 正文写明原因并报协调者，不得静默删去）：
    - **无订单**：AP 与 AR 各一个，至少 2 行；含税价与不含税价各一个；AP 的部分可抵扣税（`expense` ≠ `net`、`deductibleTax` ≠ `tax`）；零税额行（不推入税额行，也不进科目角色输入）；
    - **维度**：往来方与产品都有默认维度且有同名键（覆盖“产品覆盖往来方”）；带 `headerDimensions` 与行维度；
    - **错误**：`gross <= 0`；第 2 行税额 > 0 而税科目为 `null`（`lines.1.taxCode`）；科目角色不符（`this.accountRoles` 报错）；无订单而 `matchingException` 非 `null`；
    - **订单**：完全匹配；超出容差且带 `matchingException`；超出容差而不带（`price`）；容差内却带（`exception`）；订单不存在；`accountingDate` 早于 `orderDate`；早于订单的最近开票日期；方向、往来方、币种不符各一个；第 2 行的 `orderLineId` 不存在与产品不符各一个；两行引用同一 `orderLineId`（覆盖 `referenced` 去重）；
    - **其他**：`externalInvoice` 归一后使 `memo` 超过 200 字符（若契约长度上限使之不可达，PR 正文写明并删去该项）；付款条件 `dueDays` / `discountDays` 非 0。
  - **判定**：base 与 head 每个用例的记录逐字节相同（PR 正文附两侧输出的 SHA-256 与比较结果）；并且**直接断言**（只比两侧相同不够）：
    1. **`gross <= 0`**：错误为 `lines` / `shape`；调用记录中没有 `tradeOrder`、`tradeOrderInvoiced`，也没有 `adapter` / `plan`。
    2. **`||` 短路**：`accountingDate` 早于 `orderDate` 的用例中 `tradeOrderLatestDate` 出现 **0** 次；完全匹配的用例中出现 1 次。
    3. **日记账行顺序**：2 行 AP 含税无订单用例中，`plan` 调用记录的草稿 `lines` 依次为“控制科目、控制科目、第 1 行费用科目、第 1 行税科目、第 2 行费用科目、第 2 行税科目”；返回值 `controlIndexes` 为 `[0, 1]`；`master` 与 `lines` 等长。PR 正文写出该用例的期望科目序列与推导。
    4. **零额不推入**：零税额行用例中草稿 `lines` 比非零用例少 1 行，`master` 同样少 1 项。
    5. **税科目缺失**：错误路径为 `lines.1.taxCode`、`code` 为 `account`；调用记录中没有 `adapter` / `plan`。
    6. **指纹输入**：`tools.hash` 恰好 2 次；第 1 次参数的首元素为 `"trade-invoice-v1"`；第 2 次参数为 10 个元素的数组、首元素为 `"trade-invoice-preview-v1"`、第 2 个元素等于第 1 次的返回值。
    7. **`memo`**：超长用例中草稿 `memo` 长度为 200（若该用例已按上条删去，本断言随之删去）。
    8. 每个错误用例的 `code` 与 `path` / `rule` 与用例名所述一致；`poMatch` 与每行 `matchStatus` 与用例名所述一致。

    base 上任一直接断言不成立，先停下并向协调者报告。PR 正文附驱动、用例清单、比较结果与直接断言结果。
- **R5 结构规则**（静态，评审按代码与 PR 表格核对）：
  - **R5a 编排顺序**：PR 正文列出 base 行段（“现状”1–7）与 head 函数的对应表；`prepare` 中对 `this.*`、新模块函数、`journals` 与 `tools` 的调用先后与 base 相同。
  - **R5b 无模块级可变状态**：新文件的模块顶层只有 `import`、类型、函数声明与 `const` 常量（不含 `let`、可变容器）；PR 正文附 Babel AST 检查脚本的输出。
  - **R5c 公式原文**：以下表达式 base 与 head 逐字比较（只归一空白），不同即失败：税种映射 `mode === "ordinary" ? "standard" : …`；`command.side === "AP" ? calc.expense : calc.net`；R6b 的两个三元表达式（head 中各出现于辅助内一次）；`controlSide` / `lineSide`；默认维度合并；`poMatch`、`matchStatus` 的三元式；`sourceRef` 与 `memo` 的模板；两次 `tools.hash` 的数组；`:874` 注释。
  - **R5d 依赖方向**：新文件不导入 `trade-documents.ts`；新文件之间的导入单向无环；PR 正文附导入图。
- **R6 尺寸**：除上表外，每个新函数满足 ②（≤ 80 行、嵌套 ≤ 3 层）；PR 正文列出所有超过 50 行的函数，附计数行数与最深层数（base 与 head 两列）。
- **R7 打包字节**：首屏与全部 chunk **±0**。用 `scripts/measure/bundle-measure.mjs --d454`（不传 `--route` / `--chunk`，即全部 ±0），写明脚本所在的提交 SHA；base 为最终送审 head 的实际合并基。出现任何非 0 差异即停下报告（说明有 web 代码间接引用了本任务文件）。
- **R8 质量门**：
  - **R8a 合并前**：`typecheck`、`lint`、`check:boundaries`、CI-02 预检通过；PR CI（`ci.yml`）绿。
  - **R8b 合并后检查（不作合并门）**：合并后第一次覆盖该合并提交的 main Full 须绿，含经过发票预览与确认的 `trade-gui` 场景；失败时报协调者，按 D456 暂停后续合并。
- **R9 可读性一节**：PR 正文按下节逐条说明。

## 性能考虑

- 仓储调用的次数与顺序不变（R4 调用记录逐字节相同），因此查询次数、事务与锁不变；只多出函数调用开销。不跑 Bench。不进打包产物（R7）。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥：

- **②**：本任务就是为满足 ② 而做。`prepare` 从 251 行拆到 ≤ 80 行（R6a），只剩编排。
- **③**：`trade-documents.ts`（1346 行）是热点；拆后 ≤ 1200 行，新文件各 ≤ 250 行（R6c）。PR 正文贴 `git diff --numstat`。
- **④**：税科目与税额的取法只保留一处（R6b，决定 4）；日记账行的两趟结构集中在一个函数里，不分散到多个文件。
- **①**：函数与文件名表达职责，例如 `matchInvoiceOrder`、`invoiceJournalLines`、`invoiceTaxPosting`、`invoiceAccountRoleInputs`；不用 `step1`、`part2`、`helper`。
- **⑤**：不适用（决定 5）。
- **⑥**：`:874` 注释原文保留（R5c）；可以新增一条“为什么”的注释说明控制科目行在前、`confirm` 依赖 `controlIndexes[0]`；不留调试输出。
- **测试耗时**：本任务不改测试；R4 驱动不提交。PR 正文附 `trade-documents.test.ts` 在 base 与 head 上的耗时（vitest 汇总行原文），两侧差异 > 20% 时说明原因。

## 用户可见变化

- 无。采购 / 销售发票的预览、确认、订单匹配结果、错误提示与过账结果都不变（R3、R4）。

## 证据要求

- **不需要浏览器时段**：行为等价由 R3（core / infra 既有用例）与 R4（返回值、错误与调用序列逐字节等价及直接断言）证明；经过发票的 e2e 场景在 main Full 中运行，作合并后检查（R8b）。R4 与构建在本机运行，须服从协调者的时段静默通知（D442 / D480）。
- **可行性**（S13 回顾行动 4）：`trade-documents.test.ts` 已能在临时 SQLite 上建出往来方、产品、税码、付款条件与采购 / 销售订单；`TradeDocumentService` 的三个依赖都是接口对象（`MasterDataStore`、`JournalService`、`JournalTools`），驱动直接把包装后的 `repo` 传给 `prepare`，不经 `store`；REFAC-17 的委托包装与记录编码已由 #335 跑通。R6a–R6c 的 base 数字见“现状”与上表（设计角色实测）。本任务书**没有**试写驱动。
- PR 正文附：R2 导出、成员与 `git grep` 结果；R3 汇总行；R4 驱动（base64 或两种哈希）、用例清单、比较结果与直接断言结果；R5a–R5d 各表；R6 行数表（base 与 head 两列）；R7 的 `bundle-measure.mjs` 完整输出与退出码；可读性一节。R8b 合并后补到 PR 评论。
