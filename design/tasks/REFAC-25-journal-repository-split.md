# REFAC-25：拆分 `journalRepository`（不改行为，SQL 逐字节不变）

- Sprint：S24（[计划草案](S24.md)）
- 类型：重构（基础设施 SQL 仓储，读写，过账写入）
- 优先级：P2
- 决定：[D544](S24.md#s24-期间决定)。只改代码组织，不改行为与 SQL，详见“范围与决定”1–8。
- 建议分支：`refac-25-split-journal-repository`
- 来源：[S24 候选](S24.md#候选s24-其余泳道s23-评审后定)“按 ② 拆 core / infra”。
  - [REFAC-21](REFAC-21-business-repository-split.md)（#343，已合并）已用读写仓储 `businessRepository` 跑通“SQL 逐字节 + 库内状态”方法。该任务书写明 `journalRepository` 随后可排。
  - 本任务沿用 REFAC-21 的验收结构，另加过账写入的三点：`insertEntry` 的语句顺序、结账凭证分支、不可变表上的坏行构造。
- 迁移：**不加**。
- 浏览器时段：**不需要**，理由见“证据要求”。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 为什么是它

- 设计角色在 `e89b0b4` 上用 `node files/fnlen.cjs packages/core/src packages/infra/src` 实测。REFAC-21、REFAC-22 合并后，core / infra 中超过 ② 上限的前几项：
  - `tradeDocumentRepository`（616）
  - legacy 的 `checkOpeningItems`（606）、`reconcileLegacy`（382）、`mapRow`（253）。本 Sprint 不碰。
  - `prepare`（251）：REFAC-23 在做。
  - **`journalRepository`（244）**
- 选 `journalRepository` 的理由：
  - **只用 `db.query`，不开事务**：过账事务由 core 应用层（`JournalService`）掌握。等价仍可以只看“SQL 文本 + 参数 + 返回值 / 错误 + 库内状态”。
  - **分组天然连续**：返回对象的 15 个键可分为“过账写入 / 草稿 / 查询 / 回执与审计”几组（见“现状”）。
  - **自包含**：产品代码中的调用方只有 `master-data.ts:90`；测试支持脚本 `storage-raw-contract.mjs:7,200` 从源文件导入。
- 不选 `tradeDocumentRepository`（616）：与在岗的 REFAC-23（`TradeDocumentService.prepare`）同属贸易发票链路，评审面过大；等 REFAC-23 合并后再排。
- 不是页面拆分，不占页面拆分名额。`packages/web/src` 不导入 `packages/infra`，因此本任务不进任何打包产物。
- 冲突域与在岗的 REFAC-23、同批的 REFAC-24 不相交，详见“冲突域”。

## 现状（main `e89b0b4`）

下文 `file:line` 都按 `e89b0b43e5ab73c8520d04633bd3f1a8db454083`。

- `packages/infra/src/storage/journals.ts` 共 **326** 行，导出 3 项：
  - `journalTools`（`:17–51`）：`id`、`now`、`hash`。被 bench、`legacy-import.ts`、`workers/entry.ts` 与 16 个测试文件导入。
  - `storedJournalPlan`（`:56–68`）：被 `business-event-store.ts`、`business-queue.ts`（REFAC-21 新文件）导入。
  - `journalRepository`（`:78–321`）。

  模块内其他：`json`（`:52`）、`journalTurnover(db, company)`（`:69–77`，1 次 `SELECT`，值非安全整数或为负时抛 `STORAGE_FAILURE`）、`correctionOperation`（`:322–326`）。文件中只有 1 处注释（`:58`）。
- 设计角色用 `node files/fnlen.cjs packages/infra/src/storage` 实测（只列本函数）：

  ```text
  244	packages/infra/src/storage/journals.ts:78-321	journalRepository
  ```

- **`journalRepository(db)` 的结构**：
  1. **内部 `insertEntry(company, entry, key, run)`**（`:79–133`），由两个键共用。按顺序：
     1. 1 次 `INSERT INTO journal_entries(…15 列…)`；`kind` 为 `closing` 时写入 `"normal"`；
     2. `entry.kind === "closing"` 时 1 次 `INSERT INTO period_closing_journals`；
     3. 每行 1 次 `INSERT INTO journal_lines`：`line_no` 为 `index + 1`，`evidence` 为去掉 `account`、`debit`、`credit`、`dimensions` 后的其余字段；
     4. `journalTurnover`：1 次 `SELECT`；
     5. 1 次 `INSERT INTO journal_seals`，`turnover_minor` 为 `BigInt(previous) + BigInt(entry.debit)`。
  2. **返回对象**（`:134–320`），**15 个键**，源码顺序即键顺序：
     1. `insertHistoricalJournal`（非 `async` 箭头，`insertEntry(company, entry, null, run)`）
     2. `journalTurnover`（非 `async` 箭头）
     3. `journalDraft`（1 次查询；`journalDraftSchema.parse` 后合并 `journalDates`）
     4. `saveJournalDraft`（`expected === 0` 时 `INSERT`，否则 `UPDATE … RETURNING id`，行数 ≠ 1 抛 `CONFLICT`）
     5. `deleteJournalDraft`（`DELETE … RETURNING id`，行数 ≠ 1 抛 `CONFLICT`）
     6. `journalPage`（按 `status` 选表，模板字符串含 `${…}` 插值；`LIMIT` 参数为 `limit + 1`；游标缺省 `""`）
     7. `journalEntry`：**3 次查询，顺序固定**：
        1. 主查询（`LEFT JOIN receipts`；`import_run` 非空时 `adapter_module` 为 `'LEGACY'`）；不存在时返回 `null`，只 1 次查询；
        2. 行查询；`evidence` 不是对象时抛 `STORAGE_FAILURE`；
        3. `period_closing_journals` 查询，写在返回对象字面量的 `kind` 键内，在行查询之后执行。
     8. `journalChain`（多行 `WITH RECURSIVE` 模板字符串，参数 `[id, company, company]`）
     9. `journalReceipt`
     10. `journalSourceExists`
     11. `journalConfigurationStamp`
     12. `insertJournalReceipt`（`canonicalJson`）
     13. `insertJournalEntry`（非 `async` 箭头，`insertEntry(company, entry, key, null)`）
     14. `insertJournalCorrection`
     15. `insertJournalAudit`（`INSERT … SELECT coalesce(max(sequence),0)+1`）
- **`db` 的用法**：只调用 `db.query`，且只在方法被调用时调用；构造时不访问 `db` 的任何成员；没有 `begin` / `commit`。
- **不可变约束**（R4 构造数据时必须遵守）：
  - `journal_entries`、`journal_lines`、`journal_seals`、`journal_corrections` 禁止 `UPDATE` / `DELETE`（`004-journals.sql` 末尾的触发器抛 `immutable journal`）；
  - `journal_seals` 插入前校验“至少 2 行、借贷相等、`turnover_minor` 等于上一条加本条借方”（`journal_seal_balance`）；已封存的凭证不能再插行（`journal_lines_sealed`）；
  - `journal_entries` 到 `journal_seals` 的外键是 `DEFERRABLE INITIALLY DEFERRED`；
  - 其后的迁移另有日期与结账触发器（`008`、`014`、`007`）；
  - `journal_drafts` 可改可删。
- **导入方**：
  - `packages/infra/src/storage/master-data.ts:20,90`（`...journalRepository(db)`）；
  - `packages/infra/test/support/storage-raw-contract.mjs:7,200`；
  - `journalTools` / `storedJournalPlan` 的导入方见上，本任务不改它们。
- **测试**：
  - infra：`test/application/journals.test.ts`（7 个用例）、`test/http/journals.test.ts`（2 个用例）；
  - `storage-contract.mjs`、`storage-raw-contract.mjs`；
  - 贸易单据、业务事件、结账、旧账导入、报表等测试都经过本仓储过账；
  - 真实 Chrome（只在 main Full 中运行）：凭证录入与过账场景。

### chunk 归属与首屏（S22 回顾行动 3）

| 文件 | 落在哪个 chunk | 依据 |
| --- | --- | --- |
| `journals.ts`（改）与新文件 | **不进任何 web chunk** | `packages/web/src` 不导入 `packages/infra` |
| 首屏 | **±0** | 同上；由 R7 确认 |

## 范围与决定

1. **不改行为，SQL 逐字节不变**（D544）。对任何输入（含版本不符、结账凭证、不存在的 id、游标页与已损坏的存储行），以下全部不变：
   - 每次 `db.query` 的 **SQL 文本**：逐字节，含空白与换行；模板字符串比较拼出后的文本；
   - **参数数组**：元素、类型（含 `bigint`）与顺序；
   - 调用的先后与次数；
   - 返回值：键、值与键顺序；
   - 抛出的错误：构造器、`code`、全部自有可枚举属性与 `message`，以及先后。

   只改代码组织，不修 bug，不改 SQL，“只是缩进”也不改。拆分时发现的疑似缺陷登记在 PR 正文，留作后续任务。
2. **返回对象的键与顺序不变**：`Object.keys(journalRepository(db))` 两侧相同，共 15 个键，按“现状”所列顺序。
   - 可以按职责拆成若干工厂，由 `journalRepository` 按原顺序展开组合；
   - 每个键是否 `async` 保持原样：`insertHistoricalJournal`、`journalTurnover`、`insertJournalEntry` 仍是非 `async` 箭头函数。
3. **`insertEntry` 只有一份**：`insertHistoricalJournal` 与 `insertJournalEntry` 仍调用**同一个** `insertEntry`。可以搬到模块顶层，以 `db` 为参数。不得复制，不得拆散其 5 步的顺序（R5d）。
4. **`journalEntry` 的查询顺序不变**：结账表查询仍在行查询之后。可以把它从对象字面量中提出来，但必须仍在行查询完成之后、`journalEntrySchema.parse` 之前执行；不存在时仍只 1 次查询。
5. **SQL 的组织**：
   - 内联 SQL 字符串与模板字符串原样搬到新文件，含 `journalPage` 的两处插值与 `journalChain` 的多行文本（缩进与换行是 SQL 文本的一部分）；
   - **不得**拆成片段再拼接，不得改插值的位置与表达式；
   - 参数数组原样搬移，元素顺序不变。
6. **模块级函数与导出**：
   - `journalTools`、`storedJournalPlan` 的定义与导出**留在 `journals.ts`**，逐字不变；
   - `json`、`journalTurnover`、`correctionOperation` 可以原样搬到新文件，函数体逐字不变（R5c）；被多个文件使用的放进一个共用文件，不复制；
   - `journals.ts` 若仍需 `json`，从共用文件导入，不留第二份。
7. **文件**：
   - 新文件与 `journals.ts` 同放在 `packages/infra/src/storage/`（平铺，不建子目录）；
   - 新文件以 `journal-` 开头按职责命名，例如 `journal-posting.ts`（`insertEntry`、`journalTurnover`）、`journal-drafts.ts`、`journal-queries.ts`、`journal-receipts.ts`、`journal-rows.ts`；粒度由开发定，写入 PR 正文；
   - 不得与该目录现有文件重名（现有 `journals.ts`）；
   - 新文件只被 `journals.ts` 或本任务的新文件导入，**不**加入 `storage/index.ts`；
   - `journalRepository` 仍从 `./journals.ts` 导出，签名不变。
8. **不改**：
   - `packages/infra/src/storage/` 下其他现有文件，含 `master-data.ts`、`types.ts`、`index.ts`、REFAC-19 的 `report-*.ts`、REFAC-21 的 `business-*.ts`；
   - `packages/infra/src/**` 其他目录；迁移文件；
   - `packages/infra/test/**`、`packages/infra/bench/**`；
   - `packages/core/**`（含 `JournalRepository` 接口与 `StorageError`）、`packages/web/**`；
   - `scripts/**`（含 `scripts/slot/`、`scripts/measure/`）、`scripts/test-shard-weights.json`、`package.json` / lock、`vitest.config.ts`。

## 冲突域

- infra-storage:journals：只改 `packages/infra/src/storage/journals.ts`，并新增同目录下的 `journal-*.ts`（决定 7）。
- 取证所需的观测点和新增测试文件：无。R4 驱动不提交。
- 受影响的 e2e 断言（S13 回顾行动 1）：凭证录入、过账与经过过账的贸易 / 业务事件场景**必须继续成立**；合并前由 R3 与 R4 保证，合并后由 R8b 复核。**须随本任务改**：无。
- 受影响的文档引用（D460）：`git grep -n -F "storage/journals.ts" -- docs design` 在 `e89b0b4` 上命中 1 行，是当时的事实记录，不改。
- 与在岗及同批任务不相交：
  - REFAC-23 只改 `packages/core/src/application/trade-documents.ts` 与同目录新增的 `trade-invoice-*.ts`；
  - REFAC-24 只改 `packages/web/src/AiPanel.tsx` 与新目录 `packages/web/src/ai-panel/`。

  三者没有共享文件。REFAC-23 的 R4 在仓储接口层记录调用，不受本任务影响；两者谁先合并，另一方把 R3 / R4 的 base 换成实际合并基重跑。本任务跑 `core`、`infra`、`infra-isolated` 项目。

## 验收

### base 失败、head 通过

| 编号 | 检查 | base `e89b0b4` | head 要求 |
| --- | --- | --- | --- |
| R6a | `node fnlen.cjs packages/infra/src/storage`（口径同 S16–S24）中 `journalRepository` 的行数 | **244**（失败） | ≤ 80，且本任务新增或改动的函数都 ≤ 80 |
| R6b | `journals.ts` 的总行数（`(Get-Content <file>).Count`） | **326**（失败，③ 热点） | ≤ 120；新文件各 ≤ 200 |

### 两侧都须成立的不变量

- **R1 范围**：
  - `git diff --name-only <base> <head>` 只含 `packages/infra/src/storage/journals.ts` 与同目录新增的 `journal-*.ts`；
  - 决定 8 所列文件的 diff 为空；
  - 不加迁移。
- **R2 导出与键不变**：
  - `journals.ts` 的导出集合与 base 相同：`journalTools`（object）、`storedJournalPlan`、`journalRepository`（function）；
  - 三者的类型注解与 `journalTools`、`storedJournalPlan` 的定义源文本相同，只归一空白。用 `@babel/parser`（插件 `typescript`）解析，口径同 REFAC-14 R2；
  - 在 base 与 head 上各对一个只含 `query` 的连接对象调用 `journalRepository`，打印 `Object.keys(…)` 与每个值的 `constructor.name`（`AsyncFunction` / `Function`）。两侧逐行相同（决定 2）；
  - 新文件的导出只在本任务文件内使用，PR 正文附 `git grep` 结果；
  - `npm run check:boundaries` 通过。
- **R3 既有测试原样通过**：
  - `npx vitest run --project core --project infra --project infra-isolated` 全部通过；
  - 测试文件 diff 为空；
  - PR 正文附汇总行原文，base 与 head 各一次；
  - 有失败时逐个列出，并附只对失败文件的串行重跑原文（`--no-file-parallelism`）。
- **R4 返回值、错误与数据库调用序列等价**（送审证据；驱动不提交，不加常驻 CI 用例）：
  - **驱动**：临时 node / vitest 脚本。
    - 在 base 与 head 上用同一份虚构数据建库：临时目录中新建 SQLite 并跑全部迁移；可借用 `journals.test.ts` 与 `storage-contract.mjs` 的建账步骤。
    - 从源文件导入 `journalRepository`，传入**委托包装的连接对象**，直接调用 15 个方法。
    - 凭证、回执与审计数据由驱动按固定值构造（固定 id、`postedAt`、`fingerprint`），不用当前时间与随机值。
  - **记录规则**：与 [REFAC-21 R4](REFAC-21-business-repository-split.md#两侧都须成立的不变量) 相同，后者复用 [REFAC-17 R4](REFAC-17-prepare-trade-action-split.md#两侧都须成立的不变量)。
    - 包装对象是**普通的新对象**，对原连接的每个方法逐一写转发函数，不用 `Proxy`。
    - 调用时分配递增序号，并立即写入 `{seq, method, args}`：SQL 文本**原样**写入，不归一空白；参数经确定性编码（`bigint` 须与 `number` 区分）。
    - 返回 Promise 时先记 `pending`，完成后在同一条记录写 `resolved` 与编码后的行，或写 `rejected` 与错误摘要。
    - 方法结束后不得有仍为 `pending` 的记录。
    - 驱动须带 REFAC-17 的自测（a）–（c），失败即 R4 失败。
  - **每个用例记录**：
    - 返回值（编码后的 JSON），或抛出的错误（构造器名、`code`、全部自有可枚举属性、`message`）；
    - 完整调用记录；
    - **写入类方法**另在调用后用驱动自己的查询（不经过包装对象、不计入记录）读出受影响的表行，按主键排序后编码，作为“库内状态”一并比较。涉及的表：`journal_entries`、`journal_lines`、`journal_seals`、`period_closing_journals`、`journal_drafts`、`journal_corrections`、`receipts`、`audit`。
  - **用例**至少包含：
    - **过账写入**（凭证都由驱动自己在本用例的库内按顺序过账，满足封存触发器）：
      - `insertJournalEntry`：普通凭证 2 行；普通凭证 3 行（含维度与额外证据字段）；
      - `insertJournalEntry`：`kind = "closing"` 的凭证（需先满足结账前提，可借用结账测试的建账步骤）；
      - `insertHistoricalJournal`：带 `run` 的凭证；
      - 连续两张凭证，第二张的 `turnover_minor` 等于第一张加本张借方；
      - `journalTurnover`：无凭证时与有凭证后各一次。
    - **草稿**：
      - `saveJournalDraft`：新建（`expected = 0`）、按正确版本更新、按错误版本更新（`CONFLICT`）；
      - `deleteJournalDraft`：正确版本、错误版本（`CONFLICT`）、不存在的 id（`CONFLICT`）；
      - `journalDraft`：存在与不存在。
    - **查询**：
      - `journalPage`：`status = "draft"` 与非草稿各一次；不带游标、带游标；`limit` 等于与小于行数；
      - `journalEntry`：普通凭证、结账凭证、`insertHistoricalJournal` 写入的凭证（`module` 为 `LEGACY`）、不存在的 id；
      - `journalChain`：无更正、`reverse` 一次、`replace` 后再 `reclassify` 的两级链；
      - `journalReceipt`：存在与不存在；
      - `journalSourceExists`：真与假；
      - `journalConfigurationStamp`：建账后一次。
    - **回执与审计**：`insertJournalReceipt`；`insertJournalCorrection`；`insertJournalAudit` 连续两次，序号递增。
    - **已损坏的存储行**（独立的合成用例）：
      - 不可变表禁止 `UPDATE` / `DELETE`，因此**不得**改已有行，也**不得**关闭或删除触发器、关闭外键。
      - 做法：在该用例自己的库中，用驱动自己的 SQL 在一个事务内依次 `INSERT` 一张新凭证的 `journal_entries` 行、2 条 `journal_lines`（其中 1 条的 `evidence` 为合法 JSON 但不是对象，例如 `[]`；借贷相等）、以及按上一条封存额计算的 `journal_seals` 行，然后提交；再对这张凭证调用 `journalEntry`。
      - 插入语句与列值写入 PR 正文。若某条迁移触发器使该行无法插入，写明触发器名与错误原文并报协调者，不得绕过，也不得静默删去该用例。
    - **只含 `query` 的连接**：传入只有 `query` 方法的普通对象，构造后调用一次 `journalPage`。
  - **判定**：base 与 head 每个用例的记录与库内状态逐字节相同。PR 正文附两侧输出的 SHA-256 与比较结果。并且**直接断言**，只比两侧相同不够：
    1. **过账语句顺序**：普通凭证 n 行时，调用记录依次为：1 条 `INSERT INTO journal_entries`、n 条 `INSERT INTO journal_lines`、1 条 `SELECT s.turnover_minor`、1 条 `INSERT INTO journal_seals`，共 n + 3 次；结账凭证在第 1 条之后多 1 条 `INSERT INTO period_closing_journals`，共 n + 4 次，且 `journal_entries.kind` 为 `normal`。
    2. **封存额**：`journal_seals` 插入的第 3 个参数类型为 `bigint`，值等于上一条封存额加本张借方。
    3. **`journalEntry` 查询次数与顺序**：存在时 3 次，依次为主查询、`journal_lines`、`period_closing_journals`；不存在时 1 次，返回 `null`。结账凭证返回 `kind = "closing"`；历史凭证返回 `module = "LEGACY"`。
    4. **写路径与冲突**：
       - `saveJournalDraft` 新建时 SQL 以 `INSERT INTO ` 开头，更新时以 `UPDATE ` 开头并以 `RETURNING id` 结尾；
       - `deleteJournalDraft` 以 `RETURNING id` 结尾；
       - 版本不符或不存在时抛 `StorageError`、`code` 为 `CONFLICT`，且 `journal_drafts` 的库内状态与调用前相同；
       - 各写方法都恰好 1 次 `query`，含 `CONFLICT` 时。
    5. **游标与上限**：`journalPage` 的参数数组第 2 项在无游标时为 `""`，第 3 项为 `limit + 1`。
    6. **已损坏的存储行**：插入坏行本身成功；随后 `journalEntry` 两侧都抛 `StorageError`、`code` 为 `STORAGE_FAILURE`，调用记录为 2 次（主查询与行查询），不执行结账表查询。这是 base 的现有行为，本任务保留。
    7. **方法名**：调用记录中的方法名只有 `query`；只含 `query` 的连接用例不抛错，且返回值与完整连接上同一调用的返回值相同。

    base 上任一直接断言不成立，先停下并向协调者报告，不得把“两侧相同”当作通过。PR 正文附驱动、用例清单、比较结果与直接断言结果。
  - **驱动原件**：PR 正文贴驱动**原文件字节的 base64**；或者同时写出两种 SHA-256：原始字节的，以及按 UTF-8 解码并把换行归一为 LF 后的字节的（评审从代码块复制时得到的是 LF 文本）。只给一种哈希不算满足。
- **R5 结构规则**（静态；评审按代码与 PR 表格核对）：
  - **R5a SQL 原文**：base 与 head 中每一段 SQL 字符串与模板字符串逐字比较，**不**归一空白，含所有插值表达式的源文本。PR 正文附 Babel AST 抽取脚本与两侧输出的 SHA-256。不同即失败。
  - **R5b 无模块级可变状态**：新文件与 `journals.ts` 的模块顶层只有 `import` / `export`、类型、函数声明与 `const` 常量，不含 `let` 与可变容器。`journalTools` 是 base 已有的常量对象，原样保留。PR 正文附 Babel AST 检查脚本的输出。
  - **R5c 原文搬移**：`json`、`journalTurnover`、`correctionOperation`、`insertEntry` 的函数体，base 与 head 逐字比较，只归一缩进；15 个方法体除 `db` 的取得方式与决定 4 允许的提取外逐字比较。不同即失败；有差异时在 PR 正文逐处说明。
  - **R5d 单一 `insertEntry`**：`git grep -n -F 'INSERT INTO journal_seals' <rev> -- packages/infra/src/storage/journals.ts 'packages/infra/src/storage/journal-*.ts'` 两侧都只命中 1 行；`INSERT INTO journal_entries(` 同样只命中 1 行。PR 正文附两侧检索原文。
  - **R5e 依赖方向**：新文件之间的导入单向无环，`journals.ts` 位于顶端；新文件不导入 `journals.ts`（`journalTools`、`storedJournalPlan` 不被新文件使用）。PR 正文附导入图。
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
  - **R8b 合并后检查（不作合并门）**：合并后第一次覆盖该合并提交的 main Full 须绿；失败时报协调者，按 D456 暂停后续合并。
- **R9 可读性一节**：PR 正文按下节逐条说明。

## 性能考虑

- **不跑 Bench**：
  - SQL 文本与参数逐字节相同（R4、R5a），SQLite 生成相同的执行计划；
  - 查询次数与先后相同（R4 直接断言 1、3、4）；
  - 剩余差异只有 JS 函数调用与对象展开的开销，每次构造仓储一次。

  若 R4 / R5a 出现任何 SQL 差异，本任务即不成立，不以 Bench 结果补救。`infra/bench/journals.ts` 只导入 `journalTools`，本任务不改它。
- 不改事务边界（本仓储不开事务）；不进打包产物（R7）。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥：

- **②**：`journalRepository` 从 244 行拆到 ≤ 80 行（R6a）；拆后它只是“按顺序组合各组”。
- **③**：`journals.ts`（326 行）是热点；拆后 ≤ 120 行，新文件各 ≤ 200 行（R6b）。PR 正文贴 `git diff --numstat`。
- **①**：文件名与工厂名表达职责，例如“过账写入”“草稿”“凭证查询”“回执与审计”。不用 `part1`、`helpers2` 这类名字。
- **④**：
  - `db` 只通过参数传入；
  - 各组之间不互相调用，`journalTurnover` 由过账写入组与组合处共用一份；
  - SQL 与参数数组放在同一个方法内。
- **⑤**：`insertEntry` 保持单一实现（决定 3、R5d）；`saveJournalDraft` 与 `deleteJournalDraft` 的 `CONFLICT` 判断看似相近，语句不同，不强行合并。
- **⑥**：
  - `:58` 的注释随 `storedJournalPlan` 原样保留；
  - 不新增注释，除非某处拆分需要说明“为什么”，例如“结账表查询必须在行查询之后”“键顺序须与接口一致”；
  - 不留调试输出。
- **测试耗时**：本任务不改测试；R4 驱动不提交。PR 正文附 `journals.test.ts` 在 base 与 head 上的耗时（vitest 汇总行原文）；两侧差异 > 20% 时说明原因。

## 用户可见变化

- 无。凭证草稿、过账、凭证查询、更正链、回执与审计的读写、分页与错误提示都不变（R3、R4）。

## 证据要求

- **不需要浏览器时段**：
  - 行为等价由 R3 与 R4 证明；
  - 经过这些接口的 e2e 场景在 main Full 中运行，作合并后检查（R8b）；
  - R4 与构建在本机运行，须服从协调者的时段静默通知（D442 / D480）。
- **可行性**（S13 回顾行动 4）：
  - `journals.test.ts` 与 `storage-contract.mjs` 已能在临时 SQLite 上建账、过账、更正与查询；
  - `journalRepository` 只依赖 `Connection.query`，REFAC-21 #343 已跑通同一记录方法；
  - R6a、R6b 的 base 数字见“现状”与上表，由设计角色实测；
  - 本任务书**没有**试写驱动。坏行用例与结账凭证用例依赖迁移触发器的前提；构造不出来时写明原因并报协调者，不得静默删去。
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

- [x] 冲突域与在岗 REFAC-23、同批 REFAC-24 逐文件不相交。
- [x] 每条 base 失败、head 通过的检查都有 base 实测值。
- [x] 过账语句顺序、结账分支、`CONFLICT` 与 1 次查询的分支都有直接断言。
- [x] 坏行构造遵守不可变触发器，构造不出时停下报告。
- [x] 可读性一节齐全；无用户可见变化。
- [x] 不加迁移，不碰 `scripts/slot/`、`scripts/measure/`。
