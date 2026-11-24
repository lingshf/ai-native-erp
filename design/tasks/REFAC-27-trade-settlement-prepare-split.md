# REFAC-27：拆分 `TradeDocumentService.prepareSettlement`（不改行为）

- Sprint：S24（[计划草案](S24.md)）
- 类型：重构（core 应用层，付款 / 收款核销的预览与确认共用的准备步骤）
- 优先级：P2
- 决定：[D547](S24.md#s24-期间决定)。只改代码组织，不改行为，详见“范围与决定”1–8。
- 建议分支：`refac-27-split-prepare-settlement`
- 来源：[S24 候选](S24.md#候选s24-其余泳道s23-评审后定)“按 ② 拆 core / infra”。
  - [REFAC-17](REFAC-17-prepare-trade-action-split.md)（#335）拆了 `prepareTradeAction`，[REFAC-23](REFAC-23-trade-invoice-prepare-split.md)（#347）拆了同一类中的 `prepare`（发票）。两者都已合并。
  - `prepareSettlement` 是 `TradeDocumentService` 中剩下的最长函数；本任务沿用 REFAC-23 的验收结构（R4 在仓储、`journals`、`tools` 三个接口层记录调用）。
- 迁移：**不加**。
- 浏览器时段：**不需要**，理由见“证据要求”。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 为什么是它

- 设计角色在 `5be9496` 上用 `node files/fnlen.cjs packages/core/src packages/infra/src packages/web/src` 实测。core 中超过 ② 上限的项：
  - `compute`（179，`business-events.ts`）、**`prepareSettlement`（179）**、`calculateTrade`（144，领域计算器）、`compileDimensionRules`（124）、`confirm`（106，发票确认）。
- 选 `prepareSettlement` 的理由：
  - **可直接调用、依赖都是接口**：`TradeDocumentService` 的三个依赖（`MasterDataStore`、`JournalService`、`JournalTools`）都是接口对象。驱动可以把委托包装后的 `repo` 直接传给 `prepareSettlement`，不经 `store`，REFAC-23 已跑通同一方式。
  - **结构自然分段**：重复检查 → 往来方与档案 → 逐项分配与控制科目行 → 合计 → 科目角色 → 现金与折扣行 → 草稿与计划 → 维度核对 → 指纹（见“现状”）。
  - **调用方只有两个**：`previewSettlement`（`:567`）与 `confirmSettlement`（`:598`），两者都只用返回的 `{journal, commandHash, preview}`。
  - 与同批 [REFAC-26](REFAC-26-trade-document-repository-split.md)（infra 仓储）分别处在应用层与存储层，没有共享文件。
- 不选 `compute`（179）：业务事件的计算与 REFAC-21 刚拆完的 `business-*` 仓储同属业务事件链路，本 Sprint 先让贸易链路收尾。不选 `calculateTrade`：领域计算器，金额舍入集中，适合单独任务。
- 不是页面拆分，不占页面拆分名额。`packages/web/src` 不导入 `packages/core/src/application`，由 R7 确认。

## 现状（main `5be9496`）

下文 `file:line` 都按 `5be94963cbdf76b8df4209b000c57e5142e12617`。

- `packages/core/src/application/trade-documents.ts` 共 **1175** 行。`type Repo = MasterDataRepository`（`:248`）。
- 设计角色用 `node files/fnlen.cjs packages/core/src/application` 实测（只列本文件前几项）：

  ```text
  179	packages/core/src/application/trade-documents.ts:386-566	prepareSettlement
  106	packages/core/src/application/trade-documents.ts:976-1081	confirm
  ```

- **`private async prepareSettlement(repo: Repo, command: TradeSettlementCommand)`（`:386–566`）的结构**，按执行顺序：
  1. **重复检查**（`:387–392`）：`repo.tradePayment(company, paymentId)` `||` `repo.tradeAction(…)` `||` `repo.openItem(…)`，任一为真即 `tradeDocumentError("paymentId", "duplicate", true)`。`||` 短路：前一个为真时后面的不调用。
  2. **公司与往来方**（`:393–412`）：`this.company(repo, company, currency)`；`this.config(…, "tradeParty", party, accountingDate, "party")`；按方向取 `apProfile` / `arProfile`，为 `null` 时 `party` / `party`；`this.config(…, "tradeProfile", …)`；档案方向不符时 `party` / `party`。
     - **与 `this.party` 不同**：`this.party`（`:653–661`）还会读取 `tradeTerms`。`prepareSettlement` 不读付款条件，**不得**改用 `this.party`（会多 1 次 `repo.tradeConfig` 并可能多出 `party` / `reference` 错误）。
  3. **凭证来源重复**（`:413–414`）：`repo.journalSourceExists(company, "TRADE-PAY:" + paymentId)` 为真即 `paymentId` / `duplicate`（冲突）。
  4. **局部状态与 `push` 闭包**（`:415–430`）：`allocations`、`controls`、`controlLines`、`lines`、`ap`；`push` 跳过金额 0 的行，用 `formatMinor(amount, company.scale)` 写借或贷。
  5. **逐项循环**（`:431–496`），对第 `index` 个选择项按顺序：
     1. `repo.openItem`；不存在 → `items.${index}` / `reference`；
     2. 往来方或方向不符 → `party`；币种不符 → `currency`；版本不符 → `stale`（冲突）；`gross` 超过余额或状态非 `open` → `quantity`；
     3. 记账日早于未结项记账日 → `accountingDate` / `reference`（此时**不**调用 `latestSettlementDate`）；
     4. `repo.latestSettlementDate` 晚于记账日 → `accountingDate` / `reference`（`:446` 注释 “Accounting dates, not wall-clock acceptance times, define the dependency chain.”）；
     5. 发票与非发票混合 → `items.${index}` / `reference`；
     6. `net`（全额取余额，否则 `roundTradeRatio`）、`tax`、`discountAvailable`（5 个条件的 `&&` 链）；`takeDiscount` 而不可用 → `items.${index}.takeDiscount` / `reference`；`discount`（`roundTradeRatio(net × 折扣率微单位, 100_000_000n)`）；
     7. `allocateTradeSegments(item, gross)`；`allocations.push` 的 14 个字段（顺序即键顺序）；`controls.push(item)`；
     8. 每段先记 `controlLines`（`index` 为当前 `lines.length`），再 `push` 控制科目行，借贷方向为 `item.kind === "invoice" ? ap : !ap`。
  6. **合计**（`:497–504`）：`sum` 闭包按 `bigint` 求和，超过 `Number.MAX_SAFE_INTEGER` → `items` / `shape`；依次求 `gross`、`cash`、`discount`。
  7. **科目角色**（`:505–522`）：`this.accountRoles(repo, company, [控制科目…, 现金?, 折扣?])`。控制科目的 `role` 按 `advance` 取 `advanceAccount`，否则 `controlAccount`，`alternate` 取另一个（`:509` 注释 “D30: a legacy opening item may sit on either same-side trade account role.”），`openingItem` 为未结项 id，`path` 为 `"items"`；`cash` 非 0 时加现金科目、`discount` 非 0 时加折扣科目，`path` 都为 `"party"`。
  8. **现金与折扣行**（`:523–524`）：现金行方向为 `controls[0].kind === "invoice" ? !ap : ap`，折扣行为 `!ap`。
  9. **草稿**（`:525–538`）：`JournalDraft` 12 个字段；`sourceRef` 为 `` `TRADE-PAY:${command.paymentId}` ``，`memo` 为 `` `${command.side} book settlement ${command.party}` ``。
  10. **计划**（`:539–544`）：`this.journals.adapter("TRADE").plan(repo, company, draft, lines.map(() => ({})))`。
  11. **维度核对**（`:545–551`）：对每个 `controlLines`，计划中该行维度键与段维度键不同即 `` `items.${index}.dimensions` `` / `account`。**注意**：这里的 `index` 是日记账行序号，不是选择项序号。这是 base 现有行为，本任务保留，并在 PR 正文“疑似缺陷”中登记。
  12. **指纹**（`:552–561`）：`this.tools.hash(["trade-settlement-v1", command])`；再 `this.tools.hash(["trade-settlement-preview-v1", commandHash, journal.fingerprint, controls, party, profile, accounts])`（7 个元素）。
  13. 返回 `{journal, commandHash, preview}`；`preview` 的键依次为 `fingerprint`、`gross`、`cash`、`discount`、`allocations`、`journal`（`:562–566`）。
- `confirmSettlement` 自己也计算一次 `this.tools.hash(["trade-settlement-v1", command])`（`:590`），用于幂等比较；本任务不动它。
- **同目录已有文件**（新文件不得重名）：`trade-action-*.ts`（REFAC-17）、`trade-invoice-*.ts`（REFAC-23）、`trade-adjustments.ts`、`trade-master.ts`、`trade-reporting.ts`。REFAC-23 的新文件从 `./master-data.ts` 导入 `MasterDataRepository` 类型，不导入 `trade-documents.ts`；本任务照此办理。
- **测试**：`infra/test/application/trade-documents.test.ts`（28 处调用 `previewSettlement` / `confirmSettlement`）、`legacy-opening-items.test.ts`（期初项核销，覆盖 D30）；bench `infra/bench/trade-settlement.ts`（本任务不跑，见“性能考虑”）；真实 Chrome（只在 main Full 中运行）：`trade-gui` 的付款核销场景。

### chunk 归属与首屏（S22 回顾行动 3）

| 文件 | 落在哪个 chunk | 依据 |
| --- | --- | --- |
| core `trade-documents.ts`（改）与新文件 | **不进任何 web chunk** | `packages/web/src` 只从 `@erp/core/contracts` 等导入，不导入 `application` |
| 首屏 | **±0** | 同上；由 R7 确认 |

## 范围与决定

1. **不改行为**（D547）。对任何输入，以下全部不变：
   - 返回值：键、值与键顺序（含 `allocations` 每项 14 个字段的顺序、`preview` 的 6 个键）；
   - 抛出的错误：构造器、`code`、全部自有可枚举属性与 `message`，以及哪一个先抛；
   - 对 `repo`、`journals`（含 `adapter("TRADE").plan`）、`tools` 的调用：方法、参数、先后与次数。

   只改代码组织，不修 bug。拆分时发现的疑似缺陷（至少含“现状”11 的行序号问题）登记在 PR 正文，留作后续任务。
2. **`prepareSettlement` 留在类中，作编排**：名称、`private`、`async`、参数与返回类型不变，`previewSettlement` 与 `confirmSettlement` 的函数体逐字不变。`this.company`、`this.config`、`this.accountRoles`、`this.journals`、`this.tools` 只在 `prepareSettlement` 中调用，新模块函数不接收 `this`。
3. **类成员集合不变**：不新增、不删除、不改名任何成员（含 `private`）。拆出的逻辑放在新文件的模块函数中；读仓储的函数显式接收 `repo`。
4. **往来方与档案的读取保持原样**：不改用 `this.party`（“现状”2），也不新增读取付款条件的调用。这部分可以留在 `prepareSettlement` 中。
5. **逐项循环的拆分**：
   - 单项的“读取并校验”（`openItem`、`latestSettlementDate` 及其间的全部判断）可以提成一个 `async` 模块函数，按原顺序执行，校验与错误路径原样保留，含 `:446` 注释；
   - 分配计算（`net`、`tax`、`discountAvailable`、`discount`、14 个字段）可以提成纯函数；
   - 控制科目行与 `controlLines` 的生成可以与循环分开，前提是 `lines` 的最终顺序、`controlLines` 的 `index` 与 base 相同（R4 直接断言 3）。这些步骤不调用任何接口，也不会在后续选择项的读取之前抛错；若开发发现其中某步可能抛错，保持在循环内。
6. **公式与文本原文**：`roundTradeRatio` 的两处调用、`discountAvailable` 的 `&&` 链、控制科目行与现金行的方向三元式、`role` / `alternate` 三元式、`sum` 的上限判断、`sourceRef` 与 `memo` 模板、两次 `tools.hash` 的数组、`:446` 与 `:509` 注释，都原样搬移（R5c）。
7. **文件**：
   - 新文件放在 `packages/core/src/application/`（平铺），以 `trade-settlement-` 开头按职责命名，例如 `trade-settlement-allocation.ts`（单项读取、校验与分配）、`trade-settlement-journal.ts`（日记账行、科目角色输入与草稿）；粒度由开发定，写入 PR 正文；
   - 新文件**不导入** `trade-documents.ts`，需要的类型从 `./master-data.ts`、`../domain/*`、`../contracts/*` 等原处导入；不加入 `application/index.ts`；
   - 新文件之间单向无环。
8. **不改**：
   - core `trade-documents.ts` 中 `prepareSettlement` 以外的成员；`trade-action-*.ts`、`trade-invoice-*.ts`、`trade-adjustments.ts`、`master-data.ts`、`index.ts`、`packages/core/src/domain/**`、`packages/core/src/contracts/**`；
   - `packages/infra/**`（含测试与 bench）、`packages/web/**`；
   - `scripts/**`（含 `scripts/slot/`、`scripts/measure/`）、`scripts/test-shard-weights.json`、`package.json` / lock、`vitest.config.ts`。

## 冲突域

- core-app:trade-settlement：只改 `packages/core/src/application/trade-documents.ts` 中的 `prepareSettlement`，并新增同目录下的 `trade-settlement-*.ts`（决定 7）。
- 取证所需的观测点和新增测试文件：无。R4 驱动不提交。
- 受影响的 e2e 断言（S13 回顾行动 1）：`trade-gui` 的付款 / 收款核销场景**必须继续成立**；合并前由 R3 与 R4 保证，合并后由 R8b 复核。**须随本任务改**：无。
- 受影响的文档引用（D460）：`git grep -n -F "prepareSettlement" -- docs design` 在 `5be9496` 上命中 0 行；本任务书之外无须改。
- 与在评审及同批任务不相交：
  - REFAC-24 只改 `packages/web/src/AiPanel.tsx` 与新目录 `packages/web/src/ai-panel/`；
  - REFAC-26 只改 `packages/infra/src/storage/trade-documents.ts` 与同目录新增的 `trade-document-*.ts`。

  三者没有共享文件（两个 `trade-documents.ts` 分属 core 与 infra，是不同文件）。本任务的 R4 在仓储接口层记录调用，不依赖 REFAC-26 的 SQL 组织；两者都跑 `core`、`infra`、`infra-isolated` 项目，谁先合并，另一方把 R3 / R4 的 base 换成实际合并基重跑。

## 验收

### base 失败、head 通过

| 编号 | 检查 | base `5be9496` | head 要求 |
| --- | --- | --- | --- |
| R6a | `node fnlen.cjs packages/core/src`（口径同 S16–S24）中 `prepareSettlement` 的行数 | **179**（失败） | ≤ 80，且本任务新增或改动的函数都 ≤ 80 |
| R6b | core `trade-documents.ts` 的总行数（`(Get-Content <file>).Count`） | **1175**（失败，③ 热点） | ≤ 1080；新文件各 ≤ 200 |

### 两侧都须成立的不变量

- **R1 范围**：`git diff --name-only <base> <head>` 只含 `packages/core/src/application/trade-documents.ts` 与同目录新增的 `trade-settlement-*.ts`；决定 8 所列文件的 diff 为空。不加迁移。
- **R2 导出与签名不变**：
  - `trade-documents.ts` 的导出集合与 base 相同；`TradeDocumentService` 的成员集合（名称、`private` / 公开、`async`）与 base 相同；
  - `prepareSettlement` 的参数与返回类型源文本相同（只归一空白）；`prepareSettlement` 以外成员的函数体源文本相同（只归一空白）。

  用仓库根 devDependency `@babel/parser`（插件 `typescript`）解析，口径同 REFAC-17 R2。新文件的导出只在本任务文件内使用，PR 正文附 `git grep` 结果。`npm run check:boundaries` 通过。
- **R3 既有测试原样通过**：`npx vitest run --project core --project infra --project infra-isolated` 全部通过（含 `trade-documents.test.ts` 与 `legacy-opening-items.test.ts`）；测试文件 diff 为空。PR 正文附汇总行原文，base 与 head 各一次；有失败时逐个列出，并附只对失败文件的串行重跑原文（`--no-file-parallelism`）。
- **R4 返回值、错误与调用序列等价**（送审证据，驱动不提交，不加常驻 CI 用例）：
  - **驱动**：临时 node / vitest 脚本，在 base 与 head 上用同一份虚构数据建库（可借用 `trade-documents.test.ts` 的建账、主数据、开票与预收 / 预付步骤，以及 `legacy-opening-items.test.ts` 的虚构期初导入）。用包装后的 `journals` 与 `tools` 构造 `TradeDocumentService`，**直接调用** `service["prepareSettlement"](wrappedRepo, command)`（private 只在类型层面，驱动可用 `as any` 访问；决定 2 保证两侧可用同一调用方式）。每个 `command` 先经 `tradeSettlementCommandSchema` 校验通过（与 `previewSettlement` 的入口一致），校验不通过的输入不作用例。`hash` 照常计算。
  - **记录方法**：**原样复用 REFAC-17 R4 的“委托包装对象”与“记录编码”两条规则及其自测 (a)–(c)**（[REFAC-17 R4](REFAC-17-prepare-trade-action-split.md#两侧都须成立的不变量)）：不用 `Proxy`；调用时编号并先写一条记录，Promise 完成后在同一条记录写 `resolved` / `rejected`；`prepareSettlement` 结束后不得有 `pending` 记录；`journals.adapter` 的包装返回新的普通对象，`plan` 换成记录函数，不修改冻结的原对象；`Set` / `Map` / `bigint` / `undefined` / `Date` / 函数按 `$set` / `$map` / `$bigint` / `$undefined` / `$date` / `$function` 编码（`tradeOpeningItems` 返回 `Set`）。
  - **驱动原件**：PR 正文贴驱动**原文件字节的 base64**；或者同时写出两种 SHA-256：原始字节的，以及按 UTF-8 解码并把换行归一为 LF 后的字节的。只给一种哈希不算满足。
  - **每个用例记录**：返回值（编码后的 JSON，键顺序照原样）或抛出的错误（构造器名、`code`、全部自有可枚举属性、`message`）；完整调用记录。
  - **用例**至少包含（某个用例在虚构数据上构造不出来时，PR 正文写明原因并报协调者，不得静默删去）：
    - **成功**：
      - AP 发票 1 张全额付款；AR 发票 1 张部分收款（`net` 走 `roundTradeRatio`）；
      - AP 发票 2 张，其中第 2 张在折扣期内全额付款且 `takeDiscount`（现金、折扣两行都推入）；
      - 允许部分折扣的发票部分付款并 `takeDiscount`；
      - 带 2 个控制段的发票（`controlSegments` 2 段，`controlLines` 2 项）；
      - 预付 / 预收（`advance`）与贷项（`credit`）各一个，覆盖控制科目行与现金行的方向三元式；
      - 期初未结项位于同侧另一角色科目（D30，`tradeOpeningItems` 被调用 1 次）。
    - **错误**：
      - 重复：`paymentId` 已是付款、已是动作、已是未结项各一个（覆盖 `||` 短路）；`TRADE-PAY:` 来源已存在；
      - 公司币种不符；往来方不存在；往来方无该方向档案（`apProfile` / `arProfile` 为 `null`）；档案方向不符；
      - 第 2 个选择项：未结项不存在、往来方不符、币种不符、版本不符、`gross` 超过余额、状态非 `open`；
      - 记账日早于未结项记账日；记账日早于已有核销的最近日期；
      - 发票与非发票混合；`takeDiscount` 而不可用（折扣期已过）；
      - 现金科目角色不符（`this.accountRoles` 报 `party` / `account`）；控制科目角色不符且不是期初项（`items` / `account`）；
      - 维度核对失败（`items.<行序号>.dimensions` / `account`）：用维度规则自然构造；构造不出时，可在驱动的 `journals` 包装中对该用例返回改动了一行维度的计划副本，两侧完全相同，PR 正文写明改动；
      - 合计超过安全整数（`items` / `shape`）：构造不出时写明原因。
  - **判定**：base 与 head 每个用例的记录逐字节相同（PR 正文附两侧输出的 SHA-256 与比较结果）；并且**直接断言**（只比两侧相同不够）：
    1. **重复检查的短路**：`paymentId` 已是付款的用例中，调用记录只有 1 条 `tradePayment`；已是动作的只有 `tradePayment`、`tradeAction` 两条；已是未结项的依次为 `tradePayment`、`tradeAction`、`openItem` 三条。三者都抛 `DomainError`，`code` 为 `CONFLICT`，`issue` 为 `{scope: "tradeDocument", path: "paymentId", rule: "duplicate"}`。
    2. **不读付款条件**：所有用例的调用记录中，`repo.tradeConfig` 的 `kind` 参数只出现 `tradeParty` 与 `tradeProfile`，不出现 `tradeTerms`（决定 4）。
    3. **日记账行顺序**：2 张 AP 发票且第 2 张取折扣的用例中，`plan` 调用记录的草稿 `lines` 依次为“第 1 张控制科目（借）、第 2 张控制科目（借）、现金（贷）、折扣（贷）”；2 段发票用例中两段控制科目行相邻且在现金行之前。PR 正文写出期望科目序列与推导。
    4. **`latestSettlementDate` 的位置**：每个选择项恰好 1 次，紧跟该项的 `openItem` 之后；“记账日早于未结项记账日”的用例中，该项的 `latestSettlementDate` 出现 **0** 次。
    5. **科目角色**：`accountsByCodes` 恰好 1 次；其代码数组为“控制科目（按选择项顺序去重）、现金科目、折扣科目”，现金或折扣为 0 时不含对应科目；`tradeOpeningItems` 在非期初用例中出现 0 次，在 D30 用例中出现 1 次。
    6. **指纹输入**：成功用例中 `tools.hash` 恰好 2 次；第 1 次参数为 `["trade-settlement-v1", command]`；第 2 次参数为 7 个元素的数组、首元素为 `"trade-settlement-preview-v1"`、第 2 个元素等于第 1 次的返回值。`plan` 之前抛错的用例中 `tools.hash` 与 `plan` 都出现 0 次。
    7. **错误的 `code` 与 `issue` 分开断言**：`code` 是 `DomainError` 的错误码，`rule` 是 `issue.rule`，两者不得混写。`issue.scope` 都为 `"tradeDocument"`。按 base 实际行为：
       - `code` 为 `CONFLICT`：重复（`paymentId` / `duplicate`，含 `TRADE-PAY:` 来源）、版本不符（`items.1` / `stale`）；
       - `code` 为 `INVALID_INPUT`：公司币种不符 → `currency` / `currency`；往来方不存在 → `party` / `reference`；无档案或档案方向不符 → `party` / `party`；未结项不存在 → `items.1` / `reference`；往来方不符 → `items.1` / `party`；币种不符 → `items.1` / `currency`；超过余额或状态非 `open` → `items.1` / `quantity`；两种日期 → `accountingDate` / `reference`；混合 → `items.1` / `reference`；折扣不可用 → `items.<n>.takeDiscount` / `reference`；科目角色不符 → `party` 或 `items` / `account`；维度核对 → `items.<行序号>.dimensions` / `account`；合计超限 → `items` / `shape`。

       以上 `code`、`issue` 都按 base 实际抛出的错误写；任何一项在 base 上不成立时，先停下并报协调者，**不得**改产品代码的错误来迁就断言。

    base 上任一直接断言不成立，先停下并向协调者报告。PR 正文附驱动、用例清单、比较结果与直接断言结果。
- **R5 结构规则**（静态，评审按代码与 PR 表格核对）：
  - **R5a 编排顺序**：PR 正文列出 base 行段（“现状”1–13）与 head 函数的对应表；`prepareSettlement` 中对 `this.*`、新模块函数、`repo`、`journals` 与 `tools` 的调用先后与 base 相同；决定 5 中分开的纯步骤单独列出。
  - **R5b 无模块级可变状态**：新文件的模块顶层只有 `import`、类型、函数声明与 `const` 常量（不含 `let`、可变容器）；PR 正文附 Babel AST 检查脚本的输出。
  - **R5c 公式原文**：决定 6 所列表达式与注释 base 与 head 逐字比较（只归一空白），不同即失败；`allocations.push` 对象字面量的 14 个键顺序、`JournalDraft` 的 12 个键顺序、`preview` 的 6 个键顺序与 base 相同。
  - **R5d 依赖方向**：新文件不导入 `trade-documents.ts`；新文件之间的导入单向无环；PR 正文附导入图。
- **R6 尺寸**：除上表外，每个新函数满足 ②（≤ 80 行、嵌套 ≤ 3 层）；PR 正文列出所有超过 50 行的函数，附计数行数与最深层数（base 与 head 两列）。
- **R7 打包字节**：首屏与全部 chunk **±0**。用 `scripts/measure/bundle-measure.mjs --d454`（不传 `--route` / `--chunk`，即全部 ±0），写明脚本所在的提交 SHA；base 为最终送审 head 的实际合并基。出现任何非 0 差异即停下报告（说明有 web 代码间接引用了本任务文件）。
- **R8 质量门**：
  - **R8a 合并前**：`typecheck`、`lint`、`check:boundaries`、CI-02 预检通过；PR CI（`ci.yml`）绿。
  - **R8b 合并后检查（不作合并门）**：合并后第一次覆盖该合并提交的 main Full 须绿，含经过付款核销的 `trade-gui` 场景；失败时报协调者，按 D456 暂停后续合并。
- **R9 可读性一节**：PR 正文按下节逐条说明。

## 性能考虑

- 仓储调用的次数与顺序不变（R4 调用记录逐字节相同），因此查询次数、事务与锁不变；只多出函数调用开销。不跑 Bench（`infra/bench/trade-settlement.ts` 不改）。不进打包产物（R7）。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥：

- **②**：本任务就是为满足 ② 而做。`prepareSettlement` 从 179 行拆到 ≤ 80 行（R6a），只剩编排。
- **③**：core `trade-documents.ts`（1175 行）是热点；拆后 ≤ 1080 行，新文件各 ≤ 200 行（R6b）。PR 正文贴 `git diff --numstat`。
- **①**：函数与文件名表达职责，例如 `checkSettlementItem`、`settlementAllocation`、`settlementJournalLines`、`settlementAccountRoleInputs`、`settlementDraft`；不用 `step1`、`part2`、`helper`。
- **④**：往来方与档案的读取看似与 `this.party` 重复，但后者多读付款条件，**不**合并（决定 4）；PR 正文写一句说明，避免后来者误合并。`sum` 的三次调用共用一个函数。
- **⑤**：`confirmSettlement` 中重复的 `hash(["trade-settlement-v1", command])` 不在本任务范围（决定 2），保留。
- **⑥**：`:446`、`:509` 注释原文保留（R5c）；可以新增一条“为什么”的注释，说明“维度核对的 `index` 是日记账行序号（现状如此，见 PR 疑似缺陷）”；不留调试输出。
- **测试耗时**：本任务不改测试；R4 驱动不提交。PR 正文附 `trade-documents.test.ts` 在 base 与 head 上的耗时（vitest 汇总行原文），两侧差异 > 20% 时说明原因。

## 用户可见变化

- 无。付款 / 收款核销的预览、确认、折扣、金额分配、错误提示与过账结果都不变（R3、R4）。

## 证据要求

- **不需要浏览器时段**：行为等价由 R3（core / infra 既有用例）与 R4（返回值、错误与调用序列逐字节等价及直接断言）证明；经过核销的 e2e 场景在 main Full 中运行，作合并后检查（R8b）。R4 与构建在本机运行，须服从协调者的时段静默通知（D442 / D480）。
- **可行性**（S13 回顾行动 4）：`trade-documents.test.ts` 已能在临时 SQLite 上建出往来方、档案、发票、预收 / 预付、贷项并做核销；`legacy-opening-items.test.ts` 已能用虚构期初数据覆盖 D30；REFAC-17 的委托包装与记录编码已由 #335 跑通，REFAC-23 #347 已用同一方式直接调用 `prepare`。R6a、R6b 的 base 数字见“现状”与上表（设计角色实测）。本任务书**没有**试写驱动。
- PR 正文附：R2 导出、成员与 `git grep` 结果；R3 汇总行；R4 驱动（base64 或两种哈希）、用例清单、比较结果与直接断言结果；R5a–R5d 各表；R6 行数表（base 与 head 两列）；R7 的 `bundle-measure.mjs` 完整输出与退出码；疑似缺陷清单；可读性一节。R8b 合并后补到 PR 评论。

## 设计自查

- [x] 冲突域与在评审 REFAC-24、同批 REFAC-26 逐文件不相交。
- [x] 每条 base 失败、head 通过的检查都有 base 实测值。
- [x] `||` 短路、不读付款条件、日记账行顺序、`latestSettlementDate` 位置、科目角色与指纹输入都有直接断言；错误的 `code` 与 `rule` 分开写。
- [x] 明确禁止改用 `this.party`（会多一次读取）。
- [x] 可读性一节齐全；无用户可见变化。
- [x] 不加迁移，不碰 `scripts/slot/`、`scripts/measure/`。
