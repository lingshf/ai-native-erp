# REFAC-19：拆分 `reportRepository`（不改行为，SQL 逐字节不变）

- Sprint：S24（[计划草案](S24.md)）　类型：重构（基础设施 SQL 仓储）　优先级：P2　决定：[D535](S24.md#s24-期间决定)（只改代码组织、不改行为与 SQL；见“范围与决定”1–7）　建议分支：`refac-19-split-report-repository`
- 来源：[S24 候选](S24.md#候选s24-其余泳道s23-评审后定)“按 ② 拆 core / infra”。REFAC-17 的任务书写明 SQL 仓储“宜在本任务的‘非页面 R4’方法跑通之后再排”；#335 已用委托包装对象与记录编码跑通 34 个用例（两侧输出 SHA-256 相同，自测（a）–（c）通过）。本任务是**第一个 SQL 仓储拆分**，验收沿用 [REFAC-17](REFAC-17-prepare-trade-action-split.md) 的结构，把“仓储调用序列”换成“数据库调用序列（SQL 文本与参数逐字节）”。
- 迁移：**不加**。浏览器时段：**不需要**（理由见“证据要求”）。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 为什么是它

- 设计角色在 `f3a7646` 上用 `node files/fnlen.cjs packages/core/src packages/infra/src` 实测，SQL 仓储中超过 ② 上限的有 `tradeDocumentRepository`（616）、`businessRepository`（325）、**`reportRepository`（290）**、`journalRepository`（244）。
- 选 `reportRepository` 作为 SQL 仓储的**试点**：
  - **只读**：四个方法（`reportSnapshot`、`reportBalances`、`reportStages`、`ledgerPage`）都只执行 `SELECT`，不开事务、不写库，等价可以只看“SQL 文本 + 参数 + 返回值”；
  - **自包含**：一个文件、一个导出函数，调用方只有 `master-data.ts:92`（`...reportRepository(db)`）与 Bench 支持脚本；
  - **SQL 已有性能证据**：`REPORT_BALANCES_SQL` 与 `LEDGER_ROWS_SQL` 是导出常量，被正式 Bench（`packages/infra/bench/reports.ts:330`）直接引用；`reports.test.ts:300` 起有 `EXPLAIN QUERY PLAN` 断言。SQL 文本逐字节不变即执行计划不变，因此本任务**不需要**跑 Bench（理由见“性能考虑”）。
- 不选 `tradeDocumentRepository`（616）：读写混合、事务与锁、迁移相关的表最多，且与刚合并的 REFAC-17 同属贸易调整链路；等本任务把“SQL 逐字节”方法跑通后再排。不选 `businessRepository`（325）、`journalRepository`（244）：同为读写仓储，理由同上。不选 legacy 的 `checkOpeningItems`、`reconcileLegacy`：本 Sprint 不碰。
- 不是页面拆分，不占“同一时间只有一个页面拆分在途”的名额；`packages/web/src` 不导入 `packages/infra`，不进任何打包产物。
- 冲突域与同批任务不相交：REFAC-18 只改 `packages/web/src/`，REFAC-20 只改 `packages/core/src/domain/`（见“冲突域”）。

## 现状（main `f3a7646`）

下文 `file:line` 都按 `f3a764636a39ea8c2e9622b8e9f9782f16aa076a`。

- `packages/infra/src/storage/reports.ts` 共 343 行，导出：`REPORT_BALANCES_SQL`（`:12–25`）、`LEDGER_ROWS_SQL`（`:26–29`）、`reportRepository`（`:54–343`）。模块内另有 `amount`（`:30–34`，非安全整数抛 `StorageError("STORAGE_FAILURE")`）与 `cursor`（`:35–53`，base64url 游标解码与规范化校验）。文件中没有注释。
- 设计角色用 `node files/fnlen.cjs packages/infra/src/storage` 实测（只列本文件）：

  ```text
  290	packages/infra/src/storage/reports.ts:54-343	reportRepository
  149	packages/infra/src/storage/reports.ts:193-341	ledgerPage
  ```

- **`reportRepository(db)` 的结构**：
  1. `latestSnapshot`（`:55–68`）：1 次 `db.query`，取 `watermark` 与 `account_revision`；
  2. `reportBalances`（`:69–144`）：按 `stage === "unadjusted"` 与 `watermark !== undefined` 两次 `.replace("GROUP BY l.account_code", …)` 改写 `REPORT_BALANCES_SQL`；参数数组按条件展开（`:87–97`）；再 1 次期末结账分录查询（`:98–116`，`watermark` 时多一个条件与参数）；`effects` 以 `Map` 关联（`:117`）后逐行映射（`:118–143`，`postClosing` 时不扣结账影响）；
  3. 返回对象（`:145–342`）：`reportSnapshot: latestSnapshot`、`reportBalances`、`reportStages`（`:148–192`：先 `reportBalances(…, "postClosing", watermark)`，再 1 次调整 / 结账影响查询，依次推出 `adjusted` 与 `unadjusted`）、`ledgerPage`（`:193–341`）。
- **`ledgerPage` 的顺序**（R4 序列专门覆盖）：
  1. `stage` 默认 `"adjusted"`；`closingSql` 与 `stageSql` 字符串拼接（`:195–199`）；
  2. `cursor(query.cursor)`（`:200`），再逐项比对游标与查询（`:201–213`），不符抛 `DomainError("INVALID_INPUT")`——**这两步都在任何 `db.query` 之前**；
  3. `checkedReportSnapshot(…, await latestSnapshot(company))`（`:214–219`）；
  4. 维度条件与参数（`:220–223`）；合计查询（`:224–251`）；
  5. 有游标时前缀余额查询（`:256–272`，由 `LEDGER_ROWS_SQL.replace("SELECT l.*,…", "SELECT coalesce(sum(…),0) AS n")` 得到）；
  6. 明细查询（`:276–287`，`LIMIT query.limit + 1`）；逐行映射时**累加** `balance`（`:288–311`，顺序相关）；
  7. 下一页游标（`:312–328`）与返回（`:329–340`，`nextCursor` 为 JSON 的 base64url）。
- **`db` 的用法**：`Connection`（`types.ts`）有 `query`、`script`、`begin`、`commit`、`rollback`、`release`；`reportRepository` **只**调用 `db.query`，且只在方法被调用时调用，构造时不访问 `db` 的任何成员。`packages/infra/test/support/legacy-import-bench.mjs:210–234` 依赖这一点：它传入**只有 `query` 的对象**，并按 SQL 是否含 `"FROM accounts a"` 区分两类查询做性能剖析。
- **导入方**：`packages/infra/src/storage/master-data.ts:22,92`；`legacy-import-bench.mjs:17`（从源文件导入）。`REPORT_BALANCES_SQL` / `LEDGER_ROWS_SQL` 另被 `packages/infra/bench/reports.ts:330`（动态导入）与 `reports.test.ts` 引用。
- **测试**：
  - `packages/infra/test/application/reports.test.ts`（529 行，3 个用例：`:88` 多期间 / 阶段 / 对冲组与 GL 核对，`:214` 分页、运行余额、水位、维度与索引，`:326` 只读 HTTP 契约与公司隔离），含 `EXPLAIN QUERY PLAN` 断言（`:300` 起）；`ai-assistant.test.ts`、`period-close.test.ts` 也经过 `reportStages` / `ledgerPage`；`packages/infra/bench/reports.test.ts` 测 Bench 辅助函数。
  - 真实 Chrome（只在 main Full 中运行）：`trade-gui` 与账簿报表场景经过 `/api/v1/reports/*`。

### chunk 归属与首屏（S22 回顾行动 3）

| 文件 | 落在哪个 chunk | 依据 |
| --- | --- | --- |
| `packages/infra/src/storage/reports.ts`（改）与新文件 | **不进任何 web chunk** | `packages/web/src` 不导入 `packages/infra`（服务端代码） |
| 首屏 | **±0** | 同上；由 R7 的构建测量确认 |

## 范围与决定

1. **不改行为，SQL 逐字节不变**（D535）。对任何输入（含非法游标与过期快照），以下全部不变：每次 `db.query` 的 **SQL 文本**（逐字节，含空白、换行与缩进）、**参数数组**（元素、类型与顺序）及调用的先后与次数；返回值（键、值与键顺序，含 `nextCursor` 字节）；抛出的错误（构造器、`code`、全部自有可枚举属性与 `message`）及其先后。只改代码组织，不修 bug、不改 SQL（包括“只是缩进”）；拆分时发现的疑似缺陷登记在 PR 正文，留作后续任务。
2. **导出常量不动**：`REPORT_BALANCES_SQL`、`LEDGER_ROWS_SQL` 仍从 `reports.ts` 导出，值逐字节不变（R2）；不得改为从新文件再导出（Bench 与测试按 `reports.ts` 导入）。新文件需要它们时从 `./reports.ts` 导入会形成环，因此二选一：常量留在 `reports.ts`、由 `reports.ts` 以参数传给新函数；或常量的**定义**搬到新文件、`reports.ts` 以 `export { … } from` 再导出——后者须在 R2 中证明值与导出名不变。
3. **SQL 的组织**：内联 SQL 模板字符串可以原样搬到新文件，但**不得**拆成多个片段再拼接、不得改插值位置、不得改 `.replace` 的查找串与替换串。参数数组的展开（`...(cond ? [...] : [])`）原样搬移，元素顺序不变。可以把 SQL 抽成具名常量或返回 SQL 的纯函数（例如 `closingEffectsSql(watermark)`），但 R4 的 SQL 文本逐字节相同。
4. **函数拆分**：
   - `reportBalances`、`reportStages`、`ledgerPage`、`latestSnapshot` 各成为模块顶层函数（或由工厂以 `db` 为参数创建），`reportRepository(db)` 只组装并返回对象，**键名与键顺序不变**（`reportSnapshot`、`reportBalances`、`reportStages`、`ledgerPage`）；`reportStages` 仍调用同一个 `reportBalances`。
   - `ledgerPage`（149 行）须再拆：游标比对、合计查询、前缀余额、明细映射、下一页游标可以各成函数；游标解码与比对仍在任何 `db.query` 之前；`balance` 的累加顺序（先前缀、后逐行）不变。
   - `amount` 与 `cursor` 可以原样搬到新文件。
   - 构造时仍不访问 `db` 的任何成员，方法中仍只调用 `db.query`（`legacy-import-bench.mjs` 的只含 `query` 的对象须继续可用，R4 直接断言）。
5. **字面量**：`2048`（游标上限，`:37`、`:43` 两处）、`32`、`0`、`1`、`"-01"` 等都是协议或语义值；本任务**不**新增具名常量，原文不变。
6. **文件**：新文件与 `reports.ts` 同放在 `packages/infra/src/storage/`（该目录为平铺结构，不新建子目录），以 `report-` 开头按职责命名（例如 `report-balances.ts`、`report-ledger.ts`、`report-cursor.ts`），不得与该目录现有文件重名（现有 `reports.ts`、`trade-reporting.ts` 等）。新文件只被 `reports.ts` 或本任务的新文件导入，**不**加入 `storage/index.ts`；`reportRepository` 仍从 `./reports.ts` 导出，签名不变（`master-data.ts` 不改，R2）。
7. **不改**：
   - `packages/infra/src/storage/` 下其他现有文件（含 `master-data.ts`、`types.ts`、`index.ts`、`sqlite.ts`、`schema.ts`、`migrations.ts`）；`packages/infra/src/**` 其他目录；迁移文件；
   - `packages/infra/test/**`（含 `legacy-import-bench.mjs`）、`packages/infra/bench/**`；
   - `packages/core/**`（含 `ReportRepository` 接口、`checkedReportSnapshot`、`reportMinor`）、`packages/web/**`；
   - `scripts/**`（含 `scripts/slot/`、`scripts/measure/`）、`scripts/test-shard-weights.json`、`package.json` / lock、`vitest.config.ts`。

## 冲突域

- infra-storage:reports：只改 `packages/infra/src/storage/reports.ts`，并新增同目录下 `report-*.ts`（决定 6）。
- 取证所需的观测点和新增测试文件：无（R4 驱动不提交）。
- 受影响的 e2e 断言（S13 回顾行动 1）：经过 `/api/v1/reports/*` 的 `trade-gui` 与账簿报表场景**必须继续成立**；合并前由 R3 与 R4 保证，合并后由 R8b 的 main Full 复核；**须随本任务改**：无。
- 受影响的文档引用（D460）：`git grep -n -F "reports.ts" -- docs design` 在 `f3a7646` 上命中 14 行，都是当时的事实记录，不改。
- 与同批任务不相交：REFAC-18 只改 `packages/web/src/TradeMaster.tsx` 与 `trade-master/`；REFAC-20 只改 `packages/core/src/domain/journals.ts` 与同目录新文件。本任务不改 `packages/core`，REFAC-20 不改 `packages/infra`；三者没有共享文件。本任务与 REFAC-20 都会运行 `infra` 项目的测试（R3），但都不改测试文件，互不影响。

## 验收

### base 失败、head 通过

| 编号 | 检查 | base `f3a7646` | head 要求 |
| --- | --- | --- | --- |
| R6a | `node fnlen.cjs packages/infra/src/storage`（口径同 S16–S24）中 `reportRepository` 与 `ledgerPage` 的行数 | **290** 与 **149**（失败） | 两者都 ≤ 80，且本任务新增或改动的函数都 ≤ 80 |
| R6b | `reports.ts` 的总行数（`(Get-Content <file>).Count`） | **343**（失败，③ 热点） | ≤ 120；新文件各 ≤ 200 |

### 两侧都须成立的不变量

- **R1 范围**：`git diff --name-only <base> <head>` 只含 `packages/infra/src/storage/reports.ts` 与同目录新增的 `report-*.ts`；决定 7 所列文件的 diff 为空。不加迁移。
- **R2 导出不变**：`reports.ts` 的导出集合与 base 相同（`REPORT_BALANCES_SQL`、`LEDGER_ROWS_SQL`：string；`reportRepository`：function），`reportRepository` 的参数与返回类型源文本相同（只归一空白），用 `@babel/parser`（插件 `typescript`）解析，口径同 REFAC-14 R2。两个 SQL 常量：在 base 与 head 上各用 node 导入 `reports.ts`，打印值的 SHA-256 与长度，两侧相同。新文件的导出只在本任务文件内使用，PR 正文附 `git grep` 结果。`npm run check:boundaries` 通过。
- **R3 既有测试原样通过**：`npx vitest run --project core --project infra --project infra-isolated` 全部通过（含 `reports.test.ts` 的 `EXPLAIN QUERY PLAN` 断言、`ai-assistant.test.ts`、`period-close.test.ts`）；测试文件 diff 为空。PR 正文附汇总行原文，base 与 head 各一次；有失败时逐个列出，并附只对失败文件的串行重跑原文（`--no-file-parallelism`）。
- **R4 返回值、错误与数据库调用序列等价**（送审证据，驱动不提交，不加常驻 CI 用例）：
  - **驱动**：临时 node / vitest 脚本，在 base 与 head 上用同一份虚构数据建库（可借用 `reports.test.ts` 的建账、过账、调整与结账步骤），从源文件导入 `reportRepository`，传入**委托包装的连接对象**，直接调用四个方法。
  - **记录规则**（复用 [REFAC-17 R4](REFAC-17-prepare-trade-action-split.md#两侧都须成立的不变量)）：包装对象是**普通的新对象**，对原连接的每个方法逐一写转发函数（`original.query.call(original, …)`），不用 `Proxy`；调用时分配递增序号并立即写入记录 `{seq, method, args}`——`query` 的 SQL 文本**原样**写入（不归一空白），参数经确定性编码；返回 Promise 时先记 `pending`，完成后在同一条记录写 `resolved` 与编码后的行，或 `rejected` 与错误摘要；不对 Promise 本身取摘要。方法结束（返回或抛出）后不得有仍为 `pending` 的记录，否则 R4 失败。编码规则同 REFAC-17（`Set`、`Map`、`bigint`、`undefined`、`Date`、函数）；驱动须带 REFAC-17 的自测（a）–（c），失败即 R4 失败。
  - **每个用例记录**：返回值（编码后的 JSON）或抛出的错误（构造器名、`code`、全部自有可枚举属性、`message`）；完整调用记录。
  - **用例**至少包含：
    - `reportSnapshot`：空公司与有分录的公司各一个；
    - `reportBalances`：`unadjusted`、`adjusted`、`postClosing` 三个阶段 × `watermark` 有 / 无，共 6 个；含已结账期间（期末结账分录影响非 0）；
    - `reportStages`：有调整分录与结账分录的月份；`watermark` 有 / 无；
    - `ledgerPage`：三个阶段的首页；`limit` 恰好等于行数与小于行数（有 / 无 `nextCursor`）；用上一页 `nextCursor` 取第二页（前缀余额查询）；维度过滤（有值与 `null` 值）；同一分录多行跨页；
    - `ledgerPage` 错误：游标超长（> 2048）、非 base64url / 非 JSON、非规范编码、游标中公司 / 科目 / 月份 / 阶段 / 维度各不符一个、`watermark` 或 `accountRevision` 与游标不符、快照过期（`checkedReportSnapshot` 拒绝）；
    - **只含 `query` 的连接**：照 `legacy-import-bench.mjs:210` 的写法，传入只有 `query` 方法的普通对象，构造并调用一次 `reportBalances`。
  - **判定**：base 与 head 每个用例的记录逐字节相同（PR 正文附两侧输出的 SHA-256 与比较结果）；并且**直接断言**（只比两侧相同不够）：
    1. 调用次数：`reportSnapshot` 1 次 `query`；`reportBalances` 2 次；`reportStages` 3 次；`ledgerPage` 首页 3 次（快照、合计、明细），带游标的页 4 次（多前缀余额）；
    2. 游标错误与游标不符的每个用例：调用记录中 `query` 为 **0** 次，错误为 `DomainError`、`code` 为 `INVALID_INPUT`；
    3. 调用记录中的方法名只有 `query`；只含 `query` 的连接用例不抛错，且返回值与完整连接上同一调用的返回值相同；
    4. `reportBalances` 的 SQL：`watermark` 有时第一条 SQL 含 `AND l.entry_id IN (SELECT id FROM journal_entries WHERE company_id=? AND sequence<=?) GROUP BY l.account_code`，`unadjusted` 时含 `kind='adjusting'` 的排除条件；`adjusted` 或 `postClosing` 且无 `watermark` 时第一条 SQL 与 `REPORT_BALANCES_SQL` 逐字节相同；
    5. 第二页：首行的 `balance` 等于第一页末行的 `balance` 加该行借方减贷方（PR 正文写出该用例的数值与推导）；
    6. 每个错误用例的错误种类与 `code` 与用例名所述一致。
    base 上任一直接断言不成立，先停下并向协调者报告。PR 正文附驱动、用例清单、比较结果与直接断言结果。
  - **驱动原件**：PR 正文贴驱动**原文件字节的 base64**，或同时写出两种 SHA-256：原始字节、按 UTF-8 解码并把换行归一为 LF 后的字节。只给一种哈希不算满足。
- **R5 结构规则**（静态，评审按代码与 PR 表格核对）：
  - **R5a SQL 原文**：base 与 head 中每一段 SQL 模板字符串（含 `.replace` 的查找串与替换串、`closingSql`、`stageSql`、`dimensionSql`、`bound` 的字符串字面量）逐字比较（**不**归一空白）；PR 正文附 Babel AST 抽取脚本与两侧输出的 SHA-256。不同即失败。
  - **R5b 无模块级可变状态**：新文件与 `reports.ts` 的模块顶层只有 `import` / `export`、类型、函数声明与 `const` 常量（不含 `let`、可变容器）；PR 正文附 Babel AST 检查脚本的输出。
  - **R5c 原文搬移**：`amount`、`cursor` 的函数体与 `reportBalances` 中逐行映射（`:118–143`）、`ledgerPage` 明细映射（`:288–311`）的函数体，base 与 head 逐字比较（只归一缩进）；不同即失败。
  - **R5d 依赖方向**：新文件之间的导入单向无环，`reports.ts` 位于顶端；PR 正文附导入图。
- **R6 尺寸**：除上表 R6a、R6b 外，每个新函数满足 ②（≤ 80 行、嵌套 ≤ 3 层）；PR 正文列出所有超过 50 行的函数，附计数行数与最深层数（base 与 head 两列）。SQL 模板字符串的行数照计。
- **R7 打包字节**：首屏与全部 chunk **±0**。用 `scripts/measure/bundle-measure.mjs --d454`（不传 `--route` / `--chunk`，即全部 ±0），写明脚本所在的提交 SHA；base 为最终送审 head 的实际合并基。出现任何非 0 差异即停下报告。
- **R8 质量门**：
  - **R8a 合并前**：`typecheck`、`lint`、`check:boundaries`、CI-02 预检通过；PR CI（`ci.yml`）绿。
  - **R8b 合并后检查（不作合并门）**：合并后第一次覆盖该合并提交的 main Full 须绿，含经过报表接口的真实 Chrome 场景；失败时报协调者，按 D456 暂停后续合并。
- **R9 可读性一节**：PR 正文按下节逐条说明。

## 性能考虑

- **不跑 Bench，理由**：SQL 文本与参数逐字节相同（R4、R5a），SQLite 对相同的语句与绑定值生成相同的执行计划；查询次数与先后相同（R4 直接断言 1）；`reports.test.ts` 的 `EXPLAIN QUERY PLAN` 断言在 R3 中照常运行。剩余差异只有 JS 函数调用开销。若 R4 / R5a 出现任何 SQL 差异，本任务即不成立，不以 Bench 结果补救。
- 不进打包产物（R7）。不改事务（本仓储只读）。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥：

- **②**：本任务就是为满足 ② 而做。`reportRepository` 从 290 行、`ledgerPage` 从 149 行拆到各 ≤ 80 行（R6a）。
- **③**：`reports.ts`（343 行）是热点；拆后 ≤ 120 行，新文件各 ≤ 200 行（R6b）。PR 正文贴 `git diff --numstat`。
- **①**：函数与文件名表达职责，例如 `reportSnapshot`、`reportBalances`、`reportStages`、`ledgerTotals`、`ledgerPrefixBalance`、`ledgerItems`、`nextLedgerCursor`、`checkedLedgerCursor`；不用 `step1`、`part2`。
- **④**：`db` 只通过参数传入，四个方法之间只通过 `reportBalances` 共享（`reportStages` 调用它）；SQL 与参数数组放在同一个函数内，读者在一处看到“语句 + 绑定值”。
- **⑤**：不适用（决定 5）。
- **⑥**：`reports.ts` 现在没有注释；不新增注释，除非某处拆分需要说明“为什么”（例如游标校验必须先于查询）；不留调试输出。
- **测试耗时**：本任务不改测试；R4 驱动不提交。PR 正文附 `reports.test.ts` 在 base 与 head 上的耗时（vitest 汇总行原文），两侧差异 > 20% 时说明原因。

## 用户可见变化

- 无。试算平衡、报表阶段、明细账分页、运行余额、维度过滤与错误提示都不变（R3、R4）。

## 证据要求

- **不需要浏览器时段**：行为等价由 R3（既有用例，含执行计划断言）与 R4（SQL、参数、返回值与错误逐字节等价及直接断言）证明；经过报表接口的 e2e 场景在 main Full 中运行，作合并后检查（R8b）。R4 与构建在本机运行，须服从协调者的时段静默通知（D442 / D480）。
- **可行性**（S13 回顾行动 4）：`reports.test.ts` 已能在临时 SQLite 上建出调整、结账、维度与多页明细；`reportRepository` 只依赖 `Connection.query`，可用委托包装对象逐方法转发并记录（REFAC-17 #335 已跑通同一方法）。R6a、R6b 的 base 数字见“现状”与上表（设计角色实测）。本任务书**没有**试写驱动；若某个用例在虚构数据上构造不出来，PR 正文写明原因并报协调者，不得静默删去。
- PR 正文附：R2 导出、常量哈希与 `git grep` 结果；R3 汇总行；R4 驱动（原件 base64 或两种 SHA-256）、用例清单、比较结果与直接断言结果；R5a–R5d 各表；R6 行数表（base 与 head 两列）；R7 的 `bundle-measure.mjs` 完整输出与退出码；可读性一节。R8b 合并后补到 PR 评论。
