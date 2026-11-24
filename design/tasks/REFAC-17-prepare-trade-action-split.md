# REFAC-17：拆分 `prepareTradeAction`（不改行为）

- Sprint：S24（[计划草案](S24.md)）　类型：重构（核心应用层）　优先级：P2　决定：[D533](S24.md#s24-期间决定)（只改代码组织、不改行为；见“范围与决定”1–6）　建议分支：`refac-17-split-prepare-trade-action`
- 来源：② 存量。S24 之前的拆分都在 `packages/web/src`；按 `files/fnlen.cjs` 口径，`packages/core` 与 `packages/infra` 中还有多个超过 ② 上限的函数，本任务是第一个非页面、非工具脚本的拆分，验收沿用 REFAC-14/15 与 MEAS-02 的结构，把“DOM 等价”换成“返回值、抛出的错误与仓储调用序列等价”。
- 迁移：**不加**。浏览器时段：**不需要**（理由见“证据要求”）。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 为什么是它

- 设计角色在 `914f041` 上用 `node files/fnlen.cjs packages/core/src packages/infra/src` 实测，超过 ② 上限的前几名：

  ```text
  616	packages/infra/src/storage/trade-documents.ts:336-955	tradeDocumentRepository
  606	packages/infra/src/legacy/opening-items.ts:163-773	checkOpeningItems
  516	packages/core/src/application/trade-adjustments.ts:70-591	prepareTradeAction
  382	packages/infra/src/legacy/reconcile.ts:91-474	reconcileLegacy
  325	packages/infra/src/storage/business-events.ts:107-432	businessRepository
  290	packages/infra/src/storage/reports.ts:54-343	reportRepository
  ```

- 选 `prepareTradeAction`：
  - 它是贸易调整（预收预付、核销、贷项、作废、反向）五种动作的唯一准备入口，预览与过账都经过它（`trade-documents.ts:310`、`:336`）；之后 M2 期初未结项与多订单合并开票都会在这些分支旁边加规则，先拆小可以缩小评审面。
  - 它是纯应用层逻辑：输入是命令，输出是预览与日记账计划，副作用只有经 `repo` 的读取。行为等价可以不经浏览器、在 node 中逐字节比较（R4）。
  - 不选 `tradeDocumentRepository`（616）、`reportRepository`（290）、`businessRepository`（325）：它们是 SQL 仓储，拆分要同时核对 SQL 文本、执行计划与 Bench，宜在本任务的“非页面 R4”方法跑通之后再排。不选 `checkOpeningItems`（606）、`reconcileLegacy`（382）：属 legacy 导入与期初核对，验证会靠近真实旧账口径，本 Sprint 不碰。
- 不是页面拆分，不占“同一时间只有一个页面拆分在途”的名额；不改 web，不进任何打包产物。
- 冲突域与同批任务不相交：REFAC-16 只改 `packages/web/src/business-events/`（见“冲突域”）。

## 现状（main `914f041`）

下文 `file:line` 都按 `914f0410c083c734faa907815c67054b4aa811ed`。

- `packages/core/src/application/trade-adjustments.ts` 共 591 行，只导出 `prepareTradeAction`（`:70`）；模块内另有 `required`（`:28–31`）、`changed`（`:32–60`）、`consume`（`:61–69`）三个小函数。
- **导入方**：只有 `packages/core/src/application/trade-documents.ts:64`（`import { prepareTradeAction } from "./trade-adjustments.ts"`），在 `previewAction`（`:310`，`store.read` 内只取 `.preview`）与确认过账（`:336`）两处调用。`application/index.ts` 不导出它；`packages/web/src` 不导入 `@erp/core/application`（`git grep -n "@erp/core/application" -- packages/web/src` 无命中）。
- **`prepareTradeAction` 的结构**（`:70–591`，516 行）：
  1. **重复检查**（`:76–87`）：取公司；`tradeAction` → `journalEntry` → `openItem` → `tradePayment` 四个查询以 `||` 短路，任一存在即 `actionId` 重复（冲突）；再查 `journalSourceExists(sourceRef)`，`sourceRef = TRADE-<KIND>:<actionId>`。
  2. **共享可变状态**（`:88–100`）：`changes`、`creditLines`、`lines`、`master`、`exact`、`dependencies`、`checkedAccounts`、`checkedConfigs`、`links`，以及 `originalId`、`gross`、`historical`、`emptyReverse`。
  3. **四个闭包**：`push`（`:101–120`，写日记账行与维度默认值，`preserve` 时记入 `exact`）；`account`（`:121–151`，科目角色校验，D30：角色不符时才查 `tradeOpeningItems` 走备用角色，结果计入 `dependencies` 并去重）；`item`（`:152–161`，取未结项并校验版本、状态与日期，计入 `dependencies` 与 `links`）；`effective`（`:162–170`，校验主数据生效并去重）。
  4. **五个分支**：`advance`（`:171–225`）、`apply`（`:226–256`）、`credit`（`:257–405`，149 行，其中逐行循环 `:287–362`）、`cancel`（`:406–434`）、其余即 `reverse`（`:435–492`）。
  5. **日记账草稿**（`:493–507`）与**计划**（`:508–567`）：`emptyReverse` 时不调用适配器，自建空计划并取期间与配置戳；否则调用 `journals.adapter("TRADE").plan(...)`，非历史动作再核对 `exact` 维度、`advance` 回写维度与分段、`apply` 净额全为 0 时清空 `journals`。
  6. **指纹与返回**（`:568–590`）：`tools.hash(["trade-action-preview-v1", command, journal.fingerprint, journal.plan, dependencies, changes, creditLines])`，返回 `{ journal, preview }`，`links` 去重。
- **最容易被误改的顺序与细节**（R4 序列专门覆盖）：
  - **仓储读取的先后**决定错误的先后：例如 `credit` 分支先查 `tradeDocument`、只在单据不存在时查 `tradeOpeningItems`（`:259–264`），再 `item` → `journalEntry` → `tradeCreditLines` → `effective("tradeParty")` → `account`；逐行循环中先 `effective("tradeProduct")`、`effective("taxCode")` 再做数量校验（`:299–305`）。
  - `credit` 逐行循环中，`controlPosition` 与 `position` 在 `if (!selection) continue;`（`:298`）**之前**前进；未选中的行也会消耗位置。
  - `dependencies` 与 `links` 的**推入顺序**进入指纹；`checkedAccounts` / `checkedConfigs` 的去重使同一科目或主数据只查一次、只推入一次。
  - `account` 闭包内两层 `try`：只有 `DomainError` 才转为 `tradeDocumentError(code, "account")`，其他错误原样抛出（`:145–148`）。
  - `changes[0]` 在 `advance` 计划后被整体替换（`:546–556`）；`apply` 的净额清空只替换 `plan.journals`（`:557–566`）；两者都只在 `!historical` 时发生。
  - 六条英文“为什么”注释（`:134`、`:234`、`:258`、`:407` 四条 D30，`:308` 舍入切片，`:577` 指纹）须随代码保留，原文不变。
- **数字字面量**：`revision: 0` / `revision: 1`、`version: 1`、`discountPercent: "0"`、`tax: 0` 等都是领域语义值；指纹标签 `"trade-action-preview-v1"` 是版本标签。都不在 ⑤ 范围，原文不变。
- **测试**：
  - `packages/infra/test/application/trade-documents.test.ts`（4808 行，源码中 66 处 `it(` / `test(`）直接驱动五种动作，命令种类出现次数：`advance` 2、`apply` 15、`credit` 17、`cancel` 3、`reverse` 5；`trade-order-credit-invoicing.test.ts` 经过贷项。
  - 真实 Chrome（只在 main Full 中运行）：`trade-gui/scenario/adjustments-reports.ts`、`api-watch.ts`、`invoice-entry.ts` 经过贸易调整的预览与确认。
  - `packages/core/test` 没有直接针对本函数的用例。

### chunk 归属与首屏（S22 回顾行动 3）

| 文件 | 落在哪个 chunk | 依据 |
| --- | --- | --- |
| `packages/core/src/application/trade-adjustments.ts`（改）与新文件 | **不进任何 web chunk** | `packages/web/src` 不导入 `@erp/core/application`（“现状”检索）；服务端代码 |
| 首屏 | **±0** | 同上；由 R7 的构建测量确认 |

## 范围与决定

1. **不改行为**（D533）。对任何输入（含非法输入），以下全部不变：返回值（`preview` 与 `journal`，含 `fingerprint`）；抛出的错误（构造器、`code`、全部自有可枚举属性与 `message`）及其**先后**；对 `repo`、`journals`、`tools` 的调用序列（方法名、参数、先后与次数）；`dependencies`、`links`、`changes`、`creditLines` 的元素与顺序（它们进入指纹）。只改代码组织，不修 bug；拆分时发现的疑似缺陷登记在 PR 正文，留作后续任务。
2. **共享状态的组织**：`:88–100` 的共享状态与四个闭包可以收进一个由工厂函数创建的上下文对象（例如 `createTradeActionContext(repo, company, day)` 返回 `{ lines, changes, …, push, account, item, effective }`），或改为显式传参；不得改为模块级可变状态，不得在两次调用之间共享任何状态。闭包内的判断、去重键（`JSON.stringify([...])` 的元素与顺序）与推入顺序原样搬移。
3. **分支函数**：五个分支各抽成一个模块顶层函数（例如 `prepareAdvance`、`prepareApply`、`prepareCredit`、`prepareCancel`、`prepareReverse`），`prepareTradeAction` 只做重复检查、按 `command.kind` 分派、计划与指纹。`credit` 分支（149 行）须再拆：逐行计算（`:287–362`）抽成函数，`allocation` 与可抵扣税额的舍入公式**原文**搬移，表达式不重排、不合并；`controlPosition` / `position` 在 `continue` 之前前进的顺序保留。分支函数之间不互相调用。
4. **计划与指纹**：`:493–567` 可以抽成一到两个函数（例如 `planTradeJournal`、`emptyReversePlan`）；`tools.hash` 的输入数组元素与顺序、`"trade-action-preview-v1"` 标签、`links` 去重方式不变。
5. **注释与字面量**：“现状”所列的英文注释原文随代码保留；字面量原文不变（“现状”）。本任务**不**新增具名常量。
6. **文件**：新文件与 `trade-adjustments.ts` 同放在 `packages/core/src/application/`（该目录现为平铺结构，不新建子目录），以 `trade-action-` 开头按职责命名（例如 `trade-action-context.ts`、`trade-action-credit.ts`、`trade-action-settlement.ts`、`trade-action-journal.ts`），粒度由开发定，写入 PR 正文。新文件只被 `trade-adjustments.ts` 或本任务的新文件导入，**不**加入 `application/index.ts`；`prepareTradeAction` 仍从 `./trade-adjustments.ts` 导出，签名不变（`trade-documents.ts` 不改，R2）。`required`、`changed`、`consume` 可以原样搬到新文件。
7. **不改**：
   - `packages/core/src/application/trade-documents.ts`、`journals.ts`、`master-data.ts`、`index.ts` 与本目录其他现有文件；`packages/core/src/domain/**`、`packages/core/src/contracts/**`；
   - `packages/infra/**`（含 `src` 与 `test`）、`packages/web/**`；
   - `scripts/**`（含 `scripts/check-boundaries.mjs`、`scripts/slot/`、`scripts/measure/`）、`scripts/test-shard-weights.json`、`package.json` / lock、`vitest.config.ts`。

## 冲突域

- core-app:trade-adjustments：只改 `packages/core/src/application/trade-adjustments.ts`，并新增同目录下 `trade-action-*.ts`（决定 6）。
- 取证所需的观测点和新增测试文件：无（R4 驱动不提交）。
- 受影响的 e2e 断言（S13 回顾行动 1）：经过贸易调整的 `trade-gui` 场景（“现状”）**必须继续成立**；合并前由 R3 与 R4 保证，合并后由 R8b 的 main Full 复核；**须随本任务改**：无。
- 受影响的文档引用（D460）：`git grep -n -F "trade-adjustments.ts" -- docs design` 中指向 `packages/core` 的行都是当时的事实记录，不改。
- 与同批任务不相交：REFAC-16 只改 `packages/web/src/business-events/`。两者没有共享文件，也不在同一 vitest 项目（REFAC-16 跑 `web`，本任务跑 `core` / `infra` / `infra-isolated`）。

## 验收

### base 失败、head 通过

| 编号 | 检查 | base `914f041` | head 要求 |
| --- | --- | --- | --- |
| R6a | `node fnlen.cjs packages/core/src`（口径同 S16–S24）中 `prepareTradeAction` 的行数 | **516**（失败） | ≤ 80，且本任务新增或改动的函数都 ≤ 80 |
| R6b | `trade-adjustments.ts` 的总行数（`(Get-Content <file>).Count`） | **591**（失败，③ 热点） | ≤ 200；新文件各 ≤ 250 |

### 两侧都须成立的不变量

- **R1 范围**：`git diff --name-only <base> <head>` 只含 `packages/core/src/application/trade-adjustments.ts` 与同目录新增的 `trade-action-*.ts`；决定 7 所列文件的 diff 为空。不加迁移。
- **R2 导出不变**：`trade-adjustments.ts` 的导出集合与 base 相同（`prepareTradeAction`，async function），参数与返回类型的源文本相同（只归一空白）。用仓库根 devDependency `@babel/parser`（插件 `typescript`）解析，口径同 REFAC-14 R2。新文件的导出只在本任务文件内使用，PR 正文附 `git grep` 结果。`npm run check:boundaries` 通过。
- **R3 既有测试原样通过**：`npx vitest run --project core --project infra --project infra-isolated` 全部通过（含 `trade-documents.test.ts` 与 `trade-order-credit-invoicing.test.ts`）；测试文件 diff 为空。PR 正文附汇总行原文，base 与 head 各一次；有失败时逐个列出，并附只对失败文件的串行重跑原文（`--no-file-parallelism`）。
- **R4 返回值、错误与调用序列等价**（送审证据，驱动不提交，不加常驻 CI 用例）：
  - **驱动**：临时 node / vitest 脚本，在 base 与 head 上用同一份虚构数据建库（可借用 `trade-documents.test.ts` 的建账与开票步骤），**直接调用** `prepareTradeAction`（从源文件导入），传入的 `repo`、`journals`（含 `adapter(...)` 返回对象的 `plan`）与 `tools` 都用**委托包装对象**记录：按调用顺序记下方法名、参数与返回值摘要（SHA-256，按下面的记录编码）。`hash` 照常计算。
  - **委托包装对象，不用 `Proxy`**：`adapter(...)` 返回的对象是冻结的，用 `Proxy` 包它再替换 `plan` 会违反 Proxy 不变量而抛 `TypeError`。因此每个被记录的依赖都另建一个**普通的新对象**：对原对象的每个方法逐一写转发函数（`(...args) => { 记录调用; const r = original.method(...args); 记录返回; return r; }`，用 `original.method.call(original, ...args)` 保持 `this`），非函数属性原值复制。`journals.adapter` 的包装先调用原 `adapter(...)` 得到冻结对象，再返回一个新的普通对象：其余属性原值复制，`plan` 换成转发并记录的函数；**不得**修改、解冻或用 `Proxy` 包原冻结对象。转发函数不改参数、不改返回值、不吞错误（抛出的错误照样记录后原样抛出）。base 与 head 用同一份包装代码。
  - **记录编码**：参数、返回值和下一条“每个用例记录”中的返回值都先经同一个确定性编码函数再做 JSON / SHA-256，不得直接 `JSON.stringify`（`Set`、`Map` 会被编码成 `{}`，空集合与有内容的集合无法区分）。规则：`Set` → `{"$set": [按迭代顺序逐项编码]}`；`Map` → `{"$map": [[编码后的键, 编码后的值], …]}`（按迭代顺序）；`bigint` → `{"$bigint": "字符串"}`；`undefined` → `{"$undefined": true}`；`Date` → `{"$date": ISO 字符串}`；数组按下标逐项编码；普通对象按自有可枚举键的原顺序逐项编码；函数 → `{"$function": 名称}`；其余原值。`tradeOpeningItems()` 返回的 `Set` 由此保留内容与迭代顺序。驱动须带一条自测：`encode(new Set())` 与 `encode(new Set(["a"]))` 不同，`encode(new Map([["k", 1]]))` 含键 `k` 与值 `1`；自测失败即 R4 失败。
  - **每个用例记录**：返回值（按上述记录编码后的 JSON，键顺序照原样）或抛出的错误（构造器名、`code`、全部自有可枚举属性、`message`）；完整调用记录。
  - **用例**至少包含：
    - 五种动作各至少一个成功用例；`advance` 的 AP 与 AR 各一个（覆盖 `changes[0]` 回写维度与分段）；
    - **重复检查**：`actionId` 分别与已有动作、日记账、未结项、付款相同，以及 `sourceRef` 已存在，共 5 个用例；
    - `apply`：普通核销；D30 期初未结项走备用角色（`tradeOpeningItems` 命中）；角色不符且不是期初项（抛 `account` 错误）；净额全为 0 时 `journals` 被清空；币种、往来方、种类不符各一个；
    - `credit`：选部分行（含**未选中的行夹在中间**，覆盖 `continue` 前的位置推进）；累计数量超限；对期初项贷项（`invoiceId` 引用错误）；带舍入切片的第二次贷项（覆盖 `allocation` 与可抵扣税额公式）；`controlSegments` 为真与为假各一个；
    - `cancel`：有原始单据关联（`relatedRevision`）与无关联各一个；`relatedRevision` 形状错误两种；已有贷项的发票不可作废；
    - `reverse`：撤销核销（`apply` 回执）；撤销付款（有日记账）；`emptyReverse`（付款无日记账，走空计划与期间检查）；期间未开放；项目集合不符；已撤销；
    - 未结项版本过期（`stale`）与日期早于最近核销日。
  - **判定**：base 与 head 每个用例的记录逐字节相同（PR 正文附两侧输出的 SHA-256 与比较结果）；并且**直接断言**（只比两侧相同不够）：
    1. 重复检查：`tradeAction` 命中时，调用记录中**没有** `journalEntry`、`openItem`、`tradePayment` 与 `journalSourceExists`（`||` 短路）；
    2. D30：普通 `apply`（角色相符）的调用记录中 `tradeOpeningItems` 出现 0 次；期初项用例中出现且只在 `account` 校验失败之后；
    3. `emptyReverse`：`journals.adapter` 调用 0 次，`journal.plan.journals` 为空数组，`fingerprint` 非空；
    4. `apply` 净额为 0：`journal.plan.journals` 为空数组，`preview.changes` 有 2 项；
    5. `credit` 夹有未选中行的用例：贷项行的 `sourceLineId` 只含选中行，且其日记账行取自 base 记录中的同一位置（两侧相同之外，PR 正文写出该用例的期望值与推导）；
    6. 每个错误用例的 `code` 与 `path` / `rule` 与用例名所述一致。
    base 上任一直接断言不成立，先停下并向协调者报告。PR 正文附驱动全文、用例清单、比较结果与直接断言结果。
- **R5 结构规则**（静态，评审按代码与 PR 表格核对）：
  - **R5a 分派**：`prepareTradeAction` 中按 `command.kind` 的分派覆盖五种动作，分支顺序与 base 相同（`advance`、`apply`、`credit`、`cancel`、其余）；PR 正文列出 base 行段与 head 函数的对应表。
  - **R5b 无模块级可变状态**：新文件与 `trade-adjustments.ts` 的模块顶层只有 `import`、类型、函数声明与 `const` 常量（不含 `let`、可变容器）；PR 正文附 Babel AST 检查脚本的输出。
  - **R5c 公式原文**：`allocation` 与可抵扣税额的表达式、`changed` / `consume` 的函数体、“现状”所列注释，base 与 head 逐字比较（只归一缩进）；不同即失败。
  - **R5d 依赖方向**：新文件之间的导入单向无环，`trade-adjustments.ts` 位于顶端；PR 正文附导入图。
- **R6 尺寸**：除上表 R6a、R6b 外，每个新函数满足 ②（≤ 80 行、嵌套 ≤ 3 层）；PR 正文列出所有超过 50 行的函数，附计数行数与最深层数（base 与 head 两列）。
- **R7 打包字节**：首屏与全部 chunk **±0**。用 `scripts/measure/bundle-measure.mjs --d454`（不传 `--route` / `--chunk`，即全部 ±0），写明脚本所在的提交 SHA；base 为最终送审 head 的实际合并基。出现任何非 0 差异即停下报告（说明有 web 代码间接引用了本任务文件）。
- **R8 质量门**：
  - **R8a 合并前**：`typecheck`、`lint`、`check:boundaries`、CI-02 预检通过；PR CI（`ci.yml`）绿。
  - **R8b 合并后检查（不作合并门）**：合并后第一次覆盖该合并提交的 main Full 须绿，含经过贸易调整的 `trade-gui` 场景；失败时报协调者，按 D456 暂停后续合并。
- **R9 可读性一节**：PR 正文按下节逐条说明。

## 性能考虑

- 仓储调用的次数与顺序不变（R4 调用记录逐字节相同），因此查询次数、事务与锁不变；只多出函数调用开销。不跑 Bench。不进打包产物（R7）。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥：

- **②**：本任务就是为满足 ② 而做。`prepareTradeAction` 从 516 行拆到 ≤ 80 行（R6a）；`credit` 分支须再拆（决定 3）。
- **③**：`trade-adjustments.ts`（591 行）是热点；拆后 ≤ 200 行，新文件各 ≤ 250 行（R6b）。PR 正文贴 `git diff --numstat`。
- **①**：函数与文件名表达职责，例如 `createTradeActionContext`、`prepareAdvance`、`prepareCredit`、`creditLine`、`reverseAllocations`、`planTradeJournal`；不用 `step1`、`part2`。
- **④**：上下文对象（或显式参数）是五个分支共享状态的唯一入口；分支函数之间不互相调用（决定 3）。
- **⑤**：不适用（决定 5）。
- **⑥**：原有英文注释原文保留（R5c）；不新增注释，除非某处拆分需要说明“为什么”（例如上下文对象的推入顺序进入指纹）；不留调试输出。
- **测试耗时**：本任务不改测试；R4 驱动不提交。PR 正文附 `trade-documents.test.ts` 在 base 与 head 上的耗时（vitest 汇总行原文），两侧差异 > 20% 时说明原因。

## 用户可见变化

- 无。贸易调整五种动作的预览、确认、错误提示与过账结果都不变（R3、R4）。

## 证据要求

- **不需要浏览器时段**：行为等价由 R3（core / infra 既有用例）与 R4（返回值、错误与调用序列逐字节等价及直接断言）证明；经过贸易调整的 e2e 场景在 main Full 中运行，作合并后检查（R8b）。R4 与构建在本机运行，须服从协调者的时段静默通知（D442 / D480）。
- **可行性**（S13 回顾行动 4）：`trade-documents.test.ts` 已能在临时 SQLite 上建出五种动作所需的未结项、付款与贷项；`prepareTradeAction` 的三个依赖都是接口对象（`MasterDataRepository`、`JournalService`、`JournalTools`），可用委托包装对象逐方法转发并记录（不用 `Proxy`，见 R4“驱动”）。R6a、R6b 的 base 数字见“现状”与上表（设计角色实测）。本任务书**没有**试写驱动。若某个“用例”在虚构数据上构造不出来，PR 正文写明原因并报协调者，不得静默删去。
- PR 正文附：R2 导出与 `git grep` 结果；R3 汇总行；R4 驱动、用例清单、比较结果与直接断言结果；R5a–R5d 各表；R6 行数表（base 与 head 两列）；R7 的 `bundle-measure.mjs` 完整输出与退出码；可读性一节。R8b 合并后补到 PR 评论。
