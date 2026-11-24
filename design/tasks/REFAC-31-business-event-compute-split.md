# REFAC-31：拆分业务事件预览计算 `compute`（不改行为）

- Sprint：S24（[计划草案](S24.md)）
- 类型：重构（core 应用服务）
- 优先级：P2
- 决定：[D551](S24.md#s24-期间决定)。只改代码组织，不改返回值、指纹、错误及错误先后、仓储调用序列，详见“范围与决定”1–7。
- 建议分支：`refac-31-split-business-event-compute`
- 来源：[S24 候选](S24.md#候选s24-其余泳道s23-评审后定)“按 ② 拆 core / infra”。REFAC-29（`PeriodClose.tsx` 与 `period-close/`）占了本批唯一的页面拆分名额，本项不是页面拆分。
- 模板：[REFAC-27](REFAC-27-trade-settlement-prepare-split.md)（core 应用服务：经委托包装记录仓储、`journals` 与 `tools` 的调用序列，返回值与错误逐字节等价，错误先后用例）；记录与编码规则沿用 [REFAC-17 R4](REFAC-17-prepare-trade-action-split.md#两侧都须成立的不变量)；结构规则沿用 [REFAC-30](REFAC-30-trade-calculator-split.md)。
- 迁移：**不加**。
- 浏览器时段：**不需要**，理由见“证据要求”。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 为什么是它

- 设计角色在 `2c4406c` 上用 `node files/fnlen.cjs packages/web/src packages/core/src packages/infra/src` 实测，排除 legacy、页面与在途冲突域后，最长的非页面函数依次是 `targetStorage`（218，infra SQL 存储初始化）、`masterDataRepository`（182，SQL 仓储）、`complete`（181，`copilot-ai`）、`registerTradeDocumentRoutes`（181，HTTP 路由表）与 **`compute`（179，core 应用服务）**。
  - 前两个是 SQL 仓储 / 初始化，须另核 SQL 文本，且 `masterDataRepository` 汇总全部仓储，改动面大；`complete` 是 AI 适配器，取证需模拟模型响应；`registerTradeDocumentRoutes` 是一张路由表，拆分收益在“分组”而不在逻辑。
  - `compute` 在一个函数里串起**四种业务事件**（现金服务、冲销、统计、清账匹配）外加队列转入的凭证，读者要在 179 行中找到“这一种事件先查什么、报什么错、指纹由什么组成”。按事件拆开后每段可以单独读，可读性收益最大。
- 它是业务事件预览、确认、队列转入与待转确认的唯一计算入口：`preview`（`:434`）、`confirm`（`:493`）、队列（`:540`）、`transferPreview`（`:605`）、`transfer`（`:622`）都调用它；预览指纹与确认时重算的指纹必须一致（M0 评审 D7）。
- 只读：只调用仓储读方法、`JournalService.plan` 与 `tools.hash`，不写数据库、不取时钟；等价可以用“同一库状态、同一输入 → 同一调用序列、同一输出或同一错误”证明。
- `packages/web/src` 不导入 `@erp/core/application` 或 `@erp/core/domain`（`git grep` 计数 0），不进任何打包产物。

## 现状（main `2c4406c`）

下文 `file:line` 都按 `2c4406c22ccfcde9a0d73e546c5a34aae44ede20`。

- `packages/core/src/application/business-events.ts` 共 **719** 行。`compute` 是 `BusinessEventService` 的 `private async` 方法（`:250–428`），签名 `compute(repo: MasterDataRepository, company: string, event: EventCommand): Promise<BusinessPreview>`。构造器 `(store, tools)` 内部新建 `this.journals = new JournalService(store, tools)`。模块私有工具：`required`（`:105`）、`checkedEvent`（`:109`）、`dimensions`（`:227`）；`businessError`、`journalError`、`statisticsQuantity`、`compilePostingRules`、`compileDimensionRules` 从 domain 导入。
- fnlen 实测（只列本函数）：

  ```text
  179	packages/core/src/application/business-events.ts:250-428	compute
  ```

- **`compute` 的顺序**（R4 的调用序列与错误先后用例专门覆盖）：
  1. 公共前置（`:255–257`）：`required(repo.company)` → `repo.period(company, date 前 7 位)`；期间不存在或未开放报 `journals` / `date` / `period`；
  2. **`operation === "journal"`**（`:258–261`，只来自队列）：`this.journals.plan(repo, company, event)` 后直接返回 `{ ...current, matches: [], statistics: null, clearing: [] }`——**不调用 `businessStamp`，不再算业务指纹**，指纹就是凭证计划自己的；
  3. 其余事件先建 `draft`（`:262–275`）与局部值 `current`、`matches`、`statistics`、`clearing`、`evidence`（`:276–280`）；
  4. **`cash_service`**（`:281–340`）：币种 ≠ 公司币种报 `currency` / `shape` → `businessMaster(service)` → 若有 `party` 再 `businessMaster(party)`（都经 `required`，不存在先于停用检查）→ 停用报 `service` / `reference` → `compilePostingRules(postingCatalog)` 先匹配 `cash` 后 `offset` → **一次** `accountsByCodes(company, [cash 科目, offset 科目])`（两者相同也传两个）→ 按 cash、offset 顺序检查科目角色，失败报 `rules.<meaning>` / `account` → `this.journals.plan(repo, company, 两行草稿, [两行主数据维度])`；`evidence = [service, party]`；
  5. **`cash_service.cancel`**（`:341–350`）：`required(businessEvent(originalId))` → 原事件不是 `cash_service` 或凭证数 ≠ 1 报 `originalId` / `reference` → `this.journals.plan(…, { ...draft, operation: "reverse", originalId })`；`evidence = original.receipt`；
  6. **其余**（`:351–410`）：建空 `JournalPlan`（`version: 1`、`journals: []`）；
     - `statistics`（`:369–383`）：`compileDimensionRules(dimensionCatalog).resolve(...)` → 维度 > 32 报 `journals` / `dimensions` / `dimensionLimit` → `statistics = { code, quantity, scale: 6, unit, ...resolved }`；`evidence` 仍为 `null`；
     - `clearing.match`（`:384–401`）：`required(repo.account)` → 停用或用途不是 `clearing` / `suspense` 报 `account` / `account`（**此时不查 `clearingLines`**）→ `clearingLines` → 行数不符、科目不符、平衡行或日期晚于事件报 `lines` / `line` → 已匹配报 `lines` / `source`（`CONFLICT`）→ 借贷和不为 0 报 `lines` / `line` → `clearing = event.lines`（**同一引用**）、`evidence = [account, lines]`；
     - 然后 `current = { plan, fingerprint: tools.hash([owner, period, journalConfigurationStamp]) }`（`:402–409`）——**键顺序是 `plan` 在前**；
  7. 返回（`:411–427`）：`{ ...current, fingerprint: tools.hash(["business-plan-v1", company, event, current.fingerprint, businessStamp, matches, statistics, clearing, evidence]), matches, statistics, clearing }`。展开后 `fingerprint` 沿用 `current` 中的键位：现金服务、冲销的 `current` 来自 `plan`，键序为 `fingerprint, plan, …`；统计、清账为 `plan, fingerprint, …`。
- `compute` 内 `businessError(` 8 处、`journalError(` 2 处、`required(` 5 处（`2c4406c` 实测）。`compute` 内没有注释。
- **测试**：`packages/infra/test/application/business-events.test.ts`（497 行）在 `2c4406c` 上 5 个用例通过；经 HTTP 与 e2e 的业务事件场景另有间接覆盖。

### chunk 归属与首屏（S22 回顾行动 3）

| 文件 | 落在哪个 chunk | 依据 |
| --- | --- | --- |
| `packages/core/src/application/business-events.ts`（改）与新文件 | **不进任何 web chunk** | `packages/web/src` 不导入 `@erp/core/application` 或 `@erp/core/domain`（`2c4406c` 上 `git grep` 计数 0）；web 只用 `@erp/core/contracts` |
| 首屏 | **±0** | 同上；由 R7 的构建测量确认 |

## 范围与决定

1. **不改行为与错误先后**（D551）。对任何库状态与输入，`compute` 的返回值（键、值、键顺序、数组顺序、`fingerprint`）、抛出的错误（构造器、`code`、`issue` 全部字段、`message`）、仓储方法的调用先后、次数与实参、`this.journals.plan` 的调用次数与实参、`tools.hash` 的调用次数与实参都不变；同一输入同时违反多条规则时，**先报的那条不变**。只改代码组织，不修 bug；拆分时发现的疑似缺陷登记在 PR 正文，留作后续任务。
2. **导出与签名不动**：`business-events.ts` 的运行时导出集合与导出类型集合不变；`BusinessEventService` 的公开方法集合与签名不变；`compute` 仍是 `BusinessEventService` 的私有方法，签名与五个调用点不变；`@erp/core/application` 的导出键集合不变（R2）。
3. **拆分方式**：
   - `compute` 只做“公共前置 → 凭证直通 → 按事件取计划与证据 → 业务指纹 → 组装返回值”的编排，≤ 50 行；
   - 现金服务、冲销、统计、清账匹配各成为顶层函数（或同一新文件中的函数），以显式参数传递仓储、公司、事件、`owner`、`period`、`draft` 等，返回本事件的 `current`、`matches`、`statistics`、`clearing`、`evidence`（可用一个小的结果对象）；不得把它们改为模块级变量或在模块加载时创建（R5b）；
   - **`journals` 与 `tools` 在调用时从实例读取**：新函数通过参数接收 `this.journals`（或其 `plan` 的调用方）与 `this.tools`，不得在构造时或模块级缓存；R4 驱动会在构造后替换实例上的 `journals` 以记录调用；
   - **凭证直通**仍在公共前置之后、建 `draft` 之前返回，不调用 `businessStamp`、不调用第二次 `hash`；
   - **键顺序**：现金服务、冲销的 `current` 仍是 `plan` 的返回对象（`fingerprint, plan`）；统计、清账的 `current` 仍按 `plan`、`fingerprint` 的顺序构造；返回值仍以 `...current` 开头再覆盖 `fingerprint`（R4 直接断言 1、2、7）；
   - **调用先后**：`businessStamp` 仍在本事件的计划（或 `journalConfigurationStamp`）之后、业务 `hash` 之前；统计、清账的内层 `hash` 仍是 `[owner, period, journalConfigurationStamp]`，三者为同一对象；
   - `accountsByCodes` 仍只调用一次、实参仍是两元数组（科目相同也传两个）；科目角色检查仍先 cash 后 offset，`matches` 仍在每个通过检查的选择后 `push`；
   - `clearing` 仍是 `event.lines` 本身（不复制）；统计事件的 `evidence` 仍为 `null`。
4. **私有工具**：`required` 可以留在原文件，也可以原样搬到新文件并由 `business-events.ts` 导入；新文件不得从 `./business-events.ts` 导入运行时值（R5d）。`checkedEvent`、`dimensions`、`fresh` 不在范围内，不动。
5. **字面量**：`"business-plan-v1"`、`"LEDGER"`、`32`、`scale: 6`、`version: 1`、`"reverse"` 等是规则值或指纹格式，原文不变，不新增具名常量。
6. **文件**：新文件放在 `packages/core/src/application/`（平铺结构，不新建子目录），以 `business-event-` 开头按职责命名（例如 `business-event-cash.ts`、`business-event-clearing.ts`、`business-event-plan.ts`），不得与该目录现有文件重名（现有 `business-events.ts`）。新文件**不**加入 `application/index.ts` 的再导出；只被 `business-events.ts` 或本任务的新文件导入。
7. **不改**：
   - `packages/core/src/application/` 下其他现有文件（含 `index.ts`、`journals.ts`、`master-data.ts`、`use-cases.ts`、`trade-documents.ts`、`trade-settlement-*.ts`）；`packages/core/src/domain/**`（含 REFAC-30 的 `trade-calculator.ts`、`trade-calculation-*.ts`）、`packages/core/src/contracts/**`；
   - `packages/core/test/**`、`packages/infra/**`、`packages/web/**`；
   - `scripts/**`（含 `scripts/slot/`、`scripts/measure/`）、`scripts/test-shard-weights.json`、`package.json` / lock、`vitest.config.ts`。

## 冲突域

- core-application:business-events：只改 `packages/core/src/application/business-events.ts`，并新增同目录下 `business-event-*.ts`（决定 6）。
- 取证所需的观测点和新增测试文件：无（R4 驱动不提交）。
- 受影响的 e2e 断言（S13 回顾行动 1）：所有业务事件场景（现金服务收付、冲销、统计、清账匹配、待转队列转入与确认）**必须继续成立**；合并前由 R3 与 R4 保证，合并后由 R8b 的 main Full 复核；**须随本任务改**：无。
- 受影响的文档引用（D460）：`git grep -n -F "business-events.ts" -- docs design` 在 `2c4406c` 上命中 29 行（含 infra 同名文件与 Demo 日志），都是当时的事实记录，不改。
- 与在途任务逐文件不相交：REFAC-29 只改 `packages/web/src/PeriodClose.tsx` 与 `period-close/`；REFAC-30 只改 `packages/core/src/domain/trade-calculator.ts` 与同目录 `trade-calculation-*.ts`。三者没有共享文件。本任务与 REFAC-30 都跑 `core`、`infra` 项目的测试（R3），但都不改测试文件；先合并的一方之后，另一方的 R3 按实际合并基重做。

## 验收

### base 失败、head 通过

| 编号 | 检查 | base `2c4406c` | head 要求 |
| --- | --- | --- | --- |
| R6a | `node fnlen.cjs packages/core/src/application`（口径同 S16–S24）中 `compute` 的行数 | **179**（失败） | `compute` ≤ 50；本任务新增或改动的函数都 ≤ 80 |
| R6b | `business-events.ts` 的总行数（`(Get-Content <file>).Count`） | **719**（失败：四种事件的计算都在服务类内） | ≤ 600；新文件各 ≤ 200 |

### 两侧都须成立的不变量

- **R1 范围**：`git diff --name-only <base> <head>` 只含 `packages/core/src/application/business-events.ts` 与同目录新增的 `business-event-*.ts`；决定 7 所列文件的 diff 为空。不加迁移。
- **R2 导出不变**：用 `@babel/parser`（插件 `typescript`）解析，口径同 REFAC-14 R2：`business-events.ts` 的导出名集合（运行时与类型）与 base 相同；`BusinessEventService` 的方法名集合（含私有）与各公开方法签名的源文本相同（只归一空白），`compute` 的签名源文本相同；在 base 与 head 上各用 node 导入 `@erp/core/application`，打印 `Object.keys` 排序结果，两侧相同。新文件的导出只在本任务文件内使用，PR 正文附 `git grep` 结果。`npm run typecheck` 与 `npm run check:boundaries` 通过。
- **R3 既有测试原样通过**：`npx vitest run --project core --project infra --project infra-isolated` 全部通过；测试文件 diff 为空。PR 正文附汇总行原文，base 与 head 各一次；有失败时逐个列出，并附只对失败文件的串行重跑原文（`--no-file-parallelism`）。
- **R4 调用序列、返回值与错误等价**（送审证据，驱动不提交，不加常驻 CI 用例）：
  - **驱动**：临时 vitest 脚本（例如 `packages/infra/test/zz-r31-probe.test.ts`，送审前删除），在 base 与 head 上各运行一次。夹具借用 `business-events.test.ts` 的构造：`createSqliteStorage` 迁移后用 `createMasterDataStore`，建公司 A（CNY、scale 2、2026 年、`annual`），`saveMaster` 服务 `S`（启用）与 `OFF`（停用），四条过账规则（cash → `1000`，receive offset → `4000`，pay offset → `5000`）。
    - 以 `new BusinessEventService(store, 记录用 tools)` 构造被测实例，`tools` 为委托对象，`hash` 记录实参后调用 `journalTools.hash`；构造后把实例的 `journals` 换成委托对象，`plan` 记录实参后调用原实例的 `plan`；
    - 每个用例在 `store.read(repo => service["compute"](包装(repo), company, event))` 中直接调用；`包装(repo)` 照 REFAC-17 R4 用普通委托对象（遍历原型链上的方法名逐个转发），**不用 `Proxy`**；记录每次仓储调用的方法名与除 `company` 外的实参。
  - **记录与编码**（复用 REFAC-17）：每个用例按发生顺序记录仓储调用、`journals.plan` 调用（实参不含 `repo`）、`hash` 调用（实参）与结果——返回值（确定性 JSON 编码，含键顺序）或抛出的错误（构造器名、`code`、`issue` 全部字段——`undefined` 也要编码、`message`）；同一驱动连续两次运行的输出逐字节相同。驱动须带 REFAC-17 的自测（a）–（c）。任一自测失败即 R4 失败。
  - **用例**至少包含：
    - 成功路径：凭证直通（`operation: "journal"` 的两行草稿 `1000` / `3000`）；现金服务 `receive` 与 `pay`，各有无 `party`；冲销一笔已确认的现金服务；统计（`code: "H"`、`quantity: "-3.125"`）；清账匹配（复制 `1000` 为 `1280`、用途 `clearing`，过账两张凭证使 `1280` 一借一贷 10，引用这两行）；
    - `compute` 内每个 `businessError` / `journalError` / `required` 调用点至少一个失败用例，都用真实 SQLite 仓储构造，不以静态调用点计数替代；统计事件的 `dimensionLimit`（`:375`）**必测**，夹具见直接断言 11（`checkedEvent` 只查 code、quantity、unit，HTTP 契约的 32 项限制只约束显式维度，`resolve` 还会合并 `LEDGER` 默认维度，故可合法触发）；
    - **错误先后**：下列“直接断言”3–11 的输入。
  - **判定**：base 与 head 每个用例的记录逐字节相同（PR 正文附两侧输出的 SHA-256 与比较结果）；并且**直接断言**（只比两侧相同不够；以下期望值都由设计角色在 base `2c4406c` 上用临时驱动实测，驱动已删除）。下文“外层序列”只列 `compute` 自己发起的仓储调用与 `plan`、`hash`，`plan` 内部的仓储调用另列；错误写作 `code` / `issue.scope` / `issue.path` / `issue.rule`：
    1. **凭证直通**：外层序列为 `company`、`period`、`plan`（3 个实参）；`plan` 内部依次 `company`、`dimensionCatalog`、`accountsByCodes(["1000","3000"])`、`period`、`journalConfigurationStamp`、`journalTurnover`，然后 1 次 `hash`（首元素 `"journal-plan-v1"`）；**`businessStamp` 0 次、`hash` 共 1 次**；结果 `fingerprint` 等于 `plan` 返回的 `fingerprint`；结果键为 `fingerprint, plan, matches, statistics, clearing`，`matches` 为 `[]`、`statistics` 为 `null`、`clearing` 为 `[]`；
    2. **现金服务 `receive`、无 `party`**：外层序列为 `company`、`period`、`businessMaster`（1 次）、`postingCatalog`、`accountsByCodes(["1000","4000"])`、`plan`（4 个实参）、`businessStamp`、`hash`（9 个元素，首元素 `"business-plan-v1"`）；结果键为 `fingerprint, plan, matches, statistics, clearing`，`matches` 长度 2；结果 `fingerprint` 与 `plan` 返回的不同；同一库状态下同一事件调用两次，`fingerprint` 相同；
    3. 公司 `Z` 不存在 → `NOT_FOUND`，`issue` 为 `undefined`，仓储只调用 1 次（`company`）；
    4. 日期 `2025-01-15`（期间不存在）且币种 `USD` → `INVALID_INPUT` / `journals` / `date` / `period`，仓储调用为 `company`、`period`；只有币种 `USD` → `INVALID_INPUT` / `business` / `currency` / `shape`，仓储调用同上（**0 次 `businessMaster`**）；
    5. 服务 `OFF`（停用）且 `party: "NOPE"`（不存在）→ `NOT_FOUND`，`businessMaster` 2 次（不存在先于停用检查）；只有服务 `OFF` → `business` / `service` / `reference`，`businessMaster` 1 次；
    6. **科目角色**：把 pay offset 规则的科目改为 `1000` → `pay` 事件报 `business` / `rules.offset` / `account`，`accountsByCodes` 只调用 1 次、实参 `["1000","1000"]`；再把 pay cash 规则改为 `5000` → 报 `rules.cash` / `account`（cash 先于 offset），实参 `["5000","1000"]`；两者 `plan` 都是 0 次；
    7. **统计**：外层序列为 `company`、`period`、`dimensionCatalog`、`journalConfigurationStamp`、`hash`（3 个元素，首元素为公司对象）、`businessStamp`、`hash`（9 个元素）；`plan` 0 次；结果键为 **`plan, fingerprint, matches, statistics, clearing`**；`statistics` 键为 `code, quantity, scale, unit, dimensions, dimensionOrigins`；
    8. **清账匹配成功**：外层序列为 `company`、`period`、`account`、`clearingLines`、`journalConfigurationStamp`、`hash`（3 个元素）、`businessStamp`、`hash`（9 个元素）；结果键以 `plan, fingerprint` 开头；**`result.clearing === event.lines`**（同一引用）；
    9. **清账错误先后**：科目 `1000`（用途 `general`）→ `business` / `account` / `account`，仓储调用为 `company`、`period`、`account`（**0 次 `clearingLines`**）；引用一行 `1280` 借 10 与另一张凭证的 `1280` 借 7 → `lines` / `line`；引用不存在的行号 9 → `lines` / `line`；先确认一次清账匹配后再用同一组引用 → `CONFLICT` / `lines` / `source`；已匹配行加借贷不平的行 → `CONFLICT` / `source`（已匹配检查先于借贷和检查）；已匹配行加不存在的行号 → `INVALID_INPUT` / `line`（行数检查先于已匹配检查）；**除普通科目 `1000` 一例（0 次 `clearingLines`）外**，其余各例都在 1 次 `clearingLines` 之后报错；全部各例 `hash` 0 次；
    10. **冲销**：外层序列为 `company`、`period`、`businessEvent`、`plan`（3 个实参）、`businessStamp`、`hash`（9 个元素）；`plan` 内部含 `journalEntry`、`journalChain`；结果键为 `fingerprint, plan, …`；原事件为已确认的统计事件 → `business` / `originalId` / `reference`；原事件不存在 → `NOT_FOUND`；两者都在 `businessEvent` 之后、`plan` 0 次。
    11. **统计维度上限**（另建公司 A 的夹具，经 `DimensionService.save` 这一公开保存入口）：建 33 个维度 `D00`–`D32`，各有值 `V`；保存 `kind: "defaults"`、`code: "LEDGER"`、`values` 为 `D00`–`D31` 各取 `V`（32 个）。统计事件 `dimensions: {}` → `preview` 成功，`statistics.dimensions` 有 32 个键；`dimensions: { D32: "V" }` → `preview` 与直接 `compute` 都报 `DomainError` / `INVALID_INPUT` / `journals` / `dimensions` / `dimensionLimit`，`message` 为 `Invalid projection input.`，直接 `compute` 的仓储调用为 `company`、`period`、`dimensionCatalog`，`hash` 0 次、`businessStamp` 0 次；`dimensions: { D00: "V" }`（与默认重叠）→ 成功，仍为 32 个键，外层序列同断言 7。
    base 上任一直接断言不成立，先停下并向协调者报告。PR 正文附驱动、用例清单、比较结果与直接断言结果。
  - **驱动原件**：PR 正文贴驱动**原文件字节的 base64**，或同时写出两种 SHA-256：原始字节、按 UTF-8 解码并把换行归一为 LF 后的字节。只给一种哈希不算满足。
- **R5 结构规则**（静态，评审按代码与 PR 表格核对）：
  - **R5a 原文搬移**：现金服务分支（`:282–340`）、冲销分支（`:342–350`）、空计划（`:352–368`）、统计分支（`:370–383`）、清账分支（`:385–400`）、内层指纹（`:402–409`）与返回值（`:411–427`）的语句序列，base 与 head 逐字比较（只归一缩进；为传参把 `this.journals`、`this.tools`、自由变量改为参数，或把赋值局部变量改为返回结果的替换，须逐处列表说明）。不同且未列明即失败。
  - **R5b 无模块级可变状态**：新文件与 `business-events.ts` 的模块顶层只有 `import` / `export`、类型与接口、函数与类声明、`const` 常量（不含 `let`、可变容器，且不在加载时调用导入的函数）；PR 正文附 Babel AST 检查脚本的输出。
  - **R5c 错误调用点不变**：base `compute` 内与 head `compute` 加本任务新函数内的 `businessError(`（base 8 处）、`journalError(`（base 2 处）、`required(`（base 5 处）调用的实参原文多重集相同（Babel AST 抽取，只归一空白；为传参改名的逐处说明）；PR 正文附两侧列表与比较结果。
  - **R5d 依赖方向**：新文件之间的导入单向无环，`business-events.ts` 位于顶端；新文件不从 `./business-events.ts` 导入运行时值。PR 正文附导入图。
- **R6 尺寸**：除上表 R6a、R6b 外，每个新函数满足 ②（≤ 80 行、嵌套 ≤ 3 层）；PR 正文列出所有超过 50 行的函数，附计数行数与最深层数（base 与 head 两列）。
- **R7 打包字节**：首屏与全部 chunk **±0**。用 `scripts/measure/bundle-measure.mjs --d454`（不传 `--route` / `--chunk`，即全部 ±0），写明脚本所在的提交 SHA；base 为最终送审 head 的实际合并基。出现任何非 0 差异即停下报告。
- **R8 质量门**：
  - **R8a 合并前**：`typecheck`、`lint`、`check:boundaries`、CI-02 预检通过；PR CI（`ci.yml`）绿。
  - **R8b 合并后检查（不作合并门）**：合并后第一次覆盖该合并提交的 main Full 须绿，含所有业务事件相关的真实 Chrome 场景；失败时报协调者，按 D456 暂停后续合并。
- **R9 可读性一节**：PR 正文按下节逐条说明。

## 测试命令

```powershell
npx vitest run --project infra packages/infra/test/application/business-events.test.ts
npx vitest run --project core --project infra --project infra-isolated
npm run typecheck; npm run lint; npm run check:boundaries
node scripts/measure/bundle-measure.mjs --base <合并基全 SHA> --head <head 全 SHA> --work <新目录> --d454
```

## 性能考虑

- 不跑 Bench：仓储查询的条数、先后与实参不变（R4），只多若干函数调用；没有新增查询、遍历或复制。若拆分引入额外复制（例如复制 `event.lines`、`matches`）或额外查询，即违反 R4，评审退回。
- 不进打包产物（R7）。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥：

- **②**：本任务就是为满足 ② 而做。`compute` 从 179 行拆到 ≤ 50 行，其余函数 ≤ 80 行（R6a）。
- **③**：`business-events.ts`（719 行）拆后 ≤ 600 行，新文件各 ≤ 200 行（R6b）。PR 正文贴 `git diff --numstat`。
- **①**：函数名表达业务事件，例如 `cashServicePlan`、`cashServiceCancelPlan`、`statisticsPreview`、`clearingMatchPreview`、`emptyBusinessPlan`；不用 `step1`、`part2`、`helper`。
- **④**：读者能在 `compute` 中一屏看出“公共前置 → 凭证直通 → 按事件取计划与证据 → 业务指纹 → 返回”；每种事件一处可读，参数显式，不用上下文大对象隐藏依赖。
- **⑤**：不适用（决定 5）。
- **⑥**：可以在凭证直通处加一行注释说明“队列凭证不加业务指纹，指纹即凭证计划的指纹”，在返回处加一行注释说明“`fingerprint` 沿用 `current` 的键位”；不加其他注释；不留调试输出。
- **测试耗时**：本任务不改测试；R4 驱动不提交。PR 正文附 `core` 与 `infra` 项目在 base 与 head 上的耗时（vitest 汇总行原文），两侧差异 > 20% 时说明原因。

## 用户可见变化

- 无。业务事件的预览、确认、冲销、统计、清账匹配与待转队列的结果、指纹与错误提示都不变（R3、R4）；已生成的预览指纹在升级前后仍可确认。

## 证据要求

- **不需要浏览器时段**：行为等价由 R3 与 R4（调用序列、返回值、错误及错误先后逐字节等价及直接断言）证明；业务事件的 e2e 场景在 main Full 中运行，作合并后检查（R8b）。R4 与构建在本机运行，须服从协调者的时段静默通知（D442 / D480）。
- **可行性**（S13 回顾行动 4）：设计角色已在 `2c4406c` 上用临时 vitest 驱动（`npx vitest run --project infra <file> --no-file-parallelism --silent=false`）实测 R4 直接断言 1–11 全部成立，驱动已删除、未提交；`business-events.test.ts` 在同一提交上 5 个用例通过。科目角色用例通过 `saveRule` 改规则所指的科目构造，不改科目本身。
- PR 正文附：R2 导出比较与 `git grep` 结果；R3 汇总行；R4 驱动（原件 base64 或两种 SHA-256）、用例清单、比较结果与直接断言结果；R5a–R5d 各表；R6 行数表（base 与 head 两列）；R7 的 `bundle-measure.mjs` 完整输出与退出码；可读性一节。R8b 合并后补到 PR 评论。

## 设计自查

- 冲突域与 REFAC-29（web）、REFAC-30（core domain）逐文件不相交；不是页面拆分；不加迁移；不碰 `scripts/slot/`、`scripts/measure/`。
- R6a / R6b 的 base 数字、R5c 的调用点数与 R4 直接断言的期望值都在 `2c4406c` 上实测。
- 只改代码组织；疑似缺陷（若有）登记后另排任务。
