# REFAC-21：拆分 `businessRepository`（不改行为，SQL 逐字节不变）

- Sprint：S24（[计划草案](S24.md)）
- 类型：重构（基础设施 SQL 仓储，读写）
- 优先级：P2
- 决定：[D540](S24.md#s24-期间决定)。只改代码组织，不改行为与 SQL，详见“范围与决定”1–8。
- 建议分支：`refac-21-split-business-repository`
- 来源：[S24 候选](S24.md#候选s24-其余泳道s23-评审后定)“按 ② 拆 core / infra”。
  - REFAC-19 #338 已用只读的 `reportRepository` 跑通“SQL 逐字节”方法，任务书写明读写仓储随后可排。
  - 本任务是**第一个读写 SQL 仓储拆分**。验收沿用 [REFAC-19](REFAC-19-report-repository-split.md) 的结构，另加写路径：`INSERT` / `UPDATE … RETURNING` 与版本不符时的 `CONFLICT`。
- 迁移：**不加**。
- 浏览器时段：**不需要**，理由见“证据要求”。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 为什么是它

- 设计角色在 `37362e7` 上用 `node files/fnlen.cjs packages/core/src packages/infra/src` 实测。REFAC-19、REFAC-20 合并后，core / infra 中超过 ② 上限的有：
  - `tradeDocumentRepository`（616）
  - **`businessRepository`（325）**
  - `journalRepository`（244）
  - legacy 的 `checkOpeningItems`（606）与 `reconcileLegacy`（382）。本 Sprint 不碰。
- 选 `businessRepository` 的理由：
  - **读写但无事务控制**：24 个方法只调用 `db.query`。没有 `begin` / `commit`，没有锁，事务由调用方（core 应用层）掌握。等价仍可以只看“SQL 文本 + 参数 + 返回值 / 错误”。
  - **分组天然连续**：返回对象的 24 个键按职责连续排列，共 5 组（配置 / 事件 / 队列 / 清账 / 审计，见“现状”）。按组拆成几个工厂再展开组合，可以保持键顺序不变。
  - **自包含**：一个文件、一个导出函数。产品代码中的调用方只有 `master-data.ts:91`；测试支持脚本 `storage-raw-contract.mjs:8,201` 从源文件导入。
- 不选另外两个：
  - `tradeDocumentRepository`（616）：贸易单据的读写与锁最多，与 REFAC-17 同属贸易调整链路；评审面过大，等本任务把读写方法跑通后再排。
  - `journalRepository`（244）：参与过账事务与序号分配；本任务之后再排。
- 不是页面拆分，不占“同一时间只有一个页面拆分在途”的名额。`packages/web/src` 不导入 `packages/infra`，因此本任务不进任何打包产物。
- 冲突域与同批任务不相交：
  - TMAS-01 只改 `packages/web/src/trade-master/`、`ui/trade-labels.ts` 与一个 web 测试文件；
  - REFAC-22 只改 `packages/web/src/Accounts.tsx` 与新目录 `accounts/`。
  - 详见“冲突域”。

## 现状（main `37362e7`）

下文 `file:line` 都按 `37362e7a5c5bebefe127d08fdf3a8acdcff8b4e2`。

- `packages/infra/src/storage/business-events.ts` 共 432 行，只导出 `businessRepository`（`:107`）。

  导入：
  - `@erp/core/application`：`StorageError`、`canonicalJson` 与两个类型；
  - `@erp/core/contracts`：8 个 schema 与 `ContractSchema` 类型；
  - `./types.ts`：`Connection`、`Row`；
  - `./journals.ts`：`storedJournalPlan`（`:1–20`）。

  模块内的函数与常量：
  - 函数：`decoded`（`:21`）、`json`（`:26`）、`storedPreview`（`:30`）、`flag`（`:35`）；
  - 行映射：`master`（`:40`）、`rule`（`:50`）、`page`（`:67`）、`queueSummary`（`:76`）、`clearingLine`（`:91`）；
  - 投影常量：`queueProjection`（`:103`）、`lineProjection`（`:105`）。

  文件中只有 1 处注释（`:256`）。
- 设计角色用 `node files/fnlen.cjs packages/infra/src/storage` 实测（只列本文件）：

  ```text
  325	packages/infra/src/storage/business-events.ts:107-432	businessRepository
  ```

- **`businessRepository(db)` 的结构**：
  1. **内部 `save`**（`:108–130`），供配置写入共用：
     - `expected === 0` 时 1 次 `INSERT INTO ${table}(company_id,code,<列>) VALUES(?,?,<?…>)`；
     - 否则 1 次 `UPDATE ${table} SET <列>=?… WHERE company_id=? AND code=? AND revision=? RETURNING code`；
     - 返回行数 ≠ 1 时抛 `StorageError("CONFLICT")`。

     SQL 由 `${table}`、`columns.join(",")`、`columns.map(…)` 在运行时拼出。
  2. **返回对象**（`:131–431`），24 个键，源码顺序即键顺序：
     - **配置**（`:132–233`）：`businessMaster`、`businessMasters`、`saveBusinessMaster`（非 `async`，返回 `save(…)`）、`postingRules`、`postingCatalog`（`LIMIT 5001`）、`postingRule`、`savePostingRule`（非 `async`，12 列）、`businessHistory`、`businessStamp`；
     - **事件**（`:234–343`）：`businessEvent`、`businessByReceipt`、`journalBusinessEvent`（含注释 `:256`）、`businessCancelled`、`businessEvents`（多行 SQL，`:275–279`）、`insertBusinessEvent`、`linkBusinessJournal`、`insertBusinessEffects`。
       - `insertBusinessEffects` 有统计事实时先 1 次 `INSERT INTO statistics_facts`；然后每条清账行 1 次 `INSERT INTO business_clearing_links`。
     - **队列**（`:344–404`）：`queueItem`、`queuePage`、`saveQueue`、`pendingTransfers`。
       - `queuePage` 的游标按 `"~"` 切分，缺省为 `""`。
       - `saveQueue` 自带 `INSERT` / `UPDATE … RETURNING id` 与 `CONFLICT`，不经过 `save`。
     - **清账**（`:405–424`）：`clearingLines`、`openClearingLines`。
       - `clearingLines` 在 `refs` 为空时直接返回 `[]`，**0 次查询**。
       - `openClearingLines` 的游标按 `":"` 切分，`lineNo` 缺省 `"0"`，再 `Number(…)`。
     - **审计**（`:425–430`）：`businessAudit`，1 次 `INSERT … SELECT … coalesce(max(sequence),0)+1`。
- **`db` 的用法**：
  - `Connection`（`types.ts`）有 `query`、`script`、`begin`、`commit`、`rollback`、`release`；
  - `businessRepository` **只**调用 `db.query`，且只在方法被调用时调用；
  - 构造时不访问 `db` 的任何成员。
- **导入方**：
  - `packages/infra/src/storage/master-data.ts:21,91`（`...businessRepository(db)`，展开到组合仓储中）；
  - `packages/infra/test/support/storage-raw-contract.mjs:8,201`（从源文件导入）。
- **测试**：
  - infra：`test/application/business-events.test.ts`（5 个用例）、`test/http/business-events.test.ts`（1 个用例）；
  - `test/support/storage-contract.mjs`（12 个用例）与 `storage-raw-contract.mjs`（8 个用例），由 `infra` / `infra-isolated` 项目运行；
  - `ai-assistant`、`journals`、`legacy-import*`、贸易主数据的 HTTP 测试也经过本仓储；
  - 真实 Chrome（只在 main Full 中运行）：业务事件与过账规则相关场景经过 `/api/v1/business*`。

### chunk 归属与首屏（S22 回顾行动 3）

| 文件 | 落在哪个 chunk | 依据 |
| --- | --- | --- |
| `business-events.ts`（改）与新文件 | **不进任何 web chunk** | `packages/web/src` 不导入 `packages/infra` |
| 首屏 | **±0** | 同上；由 R7 确认 |

## 范围与决定

1. **不改行为，SQL 逐字节不变**（D540）。对任何输入（含版本不符、空引用、游标页与已损坏的存储行），以下全部不变：
   - 每次 `db.query` 的 **SQL 文本**：逐字节，含空白与换行；运行时拼出的 SQL 比较拼出后的文本；
   - **参数数组**：元素、类型与顺序；
   - 调用的先后与次数；
   - 返回值：键、值与键顺序；
   - 抛出的错误：构造器、`code`、全部自有可枚举属性与 `message`，以及先后。

   只改代码组织，不修 bug，不改 SQL，“只是缩进”也不改。拆分时发现的疑似缺陷登记在 PR 正文，留作后续任务。
2. **返回对象的键与顺序不变**：`Object.keys(businessRepository(db))` 两侧相同，共 24 个键，按“现状”所列顺序。

   - 可以按“现状”的 5 组拆成若干工厂（例如 `businessConfigRepository(db)`、`businessEventStore(db)`、`transferQueueStore(db)`、`clearingLineStore(db)`），由 `businessRepository` 按原顺序展开组合；
   - 组内的键顺序不变；
   - 每个方法是否 `async` 保持原样：`saveBusinessMaster`、`savePostingRule` 仍非 `async`。
3. **`save` 只有一份**：`saveBusinessMaster` 与 `savePostingRule` 仍调用**同一个** `save`。可以把它搬到模块顶层，以 `db` 为参数。不得为两个调用方各复制一份；不得与 `saveQueue` 的写入合并，因为两者的列、`RETURNING` 与参数顺序都不同（R5d）。
4. **SQL 的组织**：
   - 内联 SQL 字符串与模板字符串原样搬到新文件，含 `${table}`、`${kind === "service" ? … : …}`、`${queueProjection}`、`${lineProjection}`、`${refs.map(() => "(?,?)").join(",")}` 等插值；
   - **不得**拆成片段再拼接，不得改插值的位置与表达式；
   - `queueProjection`、`lineProjection` 可以搬到使用它们的新文件，值逐字节不变；
   - 参数数组原样搬移，元素顺序不变。
5. **辅助函数**：
   - `decoded`、`json`、`storedPreview`、`flag`、`master`、`rule`、`page`、`queueSummary`、`clearingLine` 可以原样搬到新文件，函数体逐字不变（R5c）；
   - 被多个新文件使用的放进一个共用文件（例如 `business-rows.ts`），不复制。
6. **字面量**：`5001`、`"~"`、`":"`、`"0"`、`""`、`+1` 等都是协议或语义值。本任务**不**新增具名常量，原文不变。
7. **文件**：
   - 新文件与 `business-events.ts` 同放在 `packages/infra/src/storage/`，该目录为平铺结构，不新建子目录；
   - 新文件以 `business-` 开头按职责命名，例如 `business-config.ts`、`business-event-store.ts`、`business-queue.ts`、`business-clearing.ts`、`business-rows.ts`；
   - 不得与该目录现有文件重名（现有 `business-events.ts`）；
   - 新文件只被 `business-events.ts` 或本任务的新文件导入，**不**加入 `storage/index.ts`；
   - `businessRepository` 仍从 `./business-events.ts` 导出，签名不变（`master-data.ts` 与 `storage-raw-contract.mjs` 不改，R2）。
8. **不改**：
   - `packages/infra/src/storage/` 下其他现有文件，含 `journals.ts`、`master-data.ts`、`types.ts`、`index.ts`、`sqlite.ts`、`schema.ts`、`migrations.ts` 与 REFAC-19 的 `report-*.ts`；
   - `packages/infra/src/**` 其他目录；迁移文件；
   - `packages/infra/test/**`（含 `storage-raw-contract.mjs`、`storage-contract.mjs`）、`packages/infra/bench/**`；
   - `packages/core/**`（含 `BusinessRepository` 接口与 `StorageError`）、`packages/web/**`；
   - `scripts/**`（含 `scripts/slot/`、`scripts/measure/`）、`scripts/test-shard-weights.json`、`package.json` / lock、`vitest.config.ts`。

## 冲突域

- infra-storage:business：只改 `packages/infra/src/storage/business-events.ts`，并新增同目录下的 `business-*.ts`（决定 7）。
- 取证所需的观测点和新增测试文件：无。R4 驱动不提交。
- 受影响的 e2e 断言（S13 回顾行动 1）：
  - 经过业务事件、过账规则、转账队列与清账接口的真实 Chrome 场景**必须继续成立**；
  - 合并前由 R3 与 R4 保证，合并后由 R8b 的 main Full 复核；
  - **须随本任务改**：无。
- 受影响的文档引用（D460）：`git grep -n -F "business-events.ts" -- docs design` 在 `37362e7` 上命中 7 行，都是当时的事实记录，不改。
- 与同批任务不相交：
  - TMAS-01、REFAC-22 只改 `packages/web/**` 与 `docs/user/trade.md`；
  - 本任务不改 `packages/web`，它们不改 `packages/infra`。

  本任务跑 `core`、`infra`、`infra-isolated` 项目；TMAS-01、REFAC-22 跑 `web` 项目，互不影响。

## 验收

### base 失败、head 通过

| 编号 | 检查 | base `37362e7` | head 要求 |
| --- | --- | --- | --- |
| R6a | `node fnlen.cjs packages/infra/src/storage`（口径同 S16–S24）中 `businessRepository` 的行数 | **325**（失败） | ≤ 80，且本任务新增或改动的函数都 ≤ 80 |
| R6b | `business-events.ts` 的总行数（`(Get-Content <file>).Count`） | **432**（失败，③ 热点） | ≤ 120；新文件各 ≤ 200 |

### 两侧都须成立的不变量

- **R1 范围**：
  - `git diff --name-only <base> <head>` 只含 `packages/infra/src/storage/business-events.ts` 与同目录新增的 `business-*.ts`；
  - 决定 8 所列文件的 diff 为空；
  - 不加迁移。
- **R2 导出与键不变**：
  - `business-events.ts` 的导出集合与 base 相同：只有 `businessRepository`，类型为 function。
  - 参数与返回类型的源文本相同，只归一空白。用 `@babel/parser`（插件 `typescript`）解析，口径同 REFAC-14 R2。
  - 在 base 与 head 上各对一个只含 `query` 的连接对象调用 `businessRepository`，打印 `Object.keys(…)` 与每个值的 `constructor.name`（`AsyncFunction` / `Function`）。两侧逐行相同（决定 2）。
  - 新文件的导出只在本任务文件内使用，PR 正文附 `git grep` 结果。
  - `npm run check:boundaries` 通过。
- **R3 既有测试原样通过**：
  - `npx vitest run --project core --project infra --project infra-isolated` 全部通过，含 `business-events.test.ts`、`storage-contract.mjs`、`storage-raw-contract.mjs`；
  - 测试文件 diff 为空；
  - PR 正文附汇总行原文，base 与 head 各一次；
  - 有失败时逐个列出，并附只对失败文件的串行重跑原文（`--no-file-parallelism`）。
- **R4 返回值、错误与数据库调用序列等价**（送审证据；驱动不提交，不加常驻 CI 用例）：
  - **驱动**：临时 node / vitest 脚本。
    - 在 base 与 head 上用同一份虚构数据建库，在临时目录中新建 SQLite 并跑全部迁移；可借用 `business-events.test.ts` 与 `storage-contract.mjs` 的建账步骤。
    - 从源文件导入 `businessRepository`，传入**委托包装的连接对象**，直接调用 24 个方法。
    - 两侧用同一个固定时间戳与固定 id，不用当前时间与随机值。
  - **记录规则**：与 [REFAC-19 R4](REFAC-19-report-repository-split.md#两侧都须成立的不变量) 相同，后者复用 [REFAC-17 R4](REFAC-17-prepare-trade-action-split.md#两侧都须成立的不变量)。
    - 包装对象是**普通的新对象**，对原连接的每个方法逐一写转发函数，不用 `Proxy`。
    - 调用时分配递增序号，并立即写入 `{seq, method, args}`：
      - SQL 文本**原样**写入，不归一空白；
      - 参数经确定性编码。
    - 返回 Promise 时先记 `pending`，完成后在同一条记录写 `resolved` 与编码后的行，或写 `rejected` 与错误摘要。
    - 方法结束后不得有仍为 `pending` 的记录。
    - 编码规则同 REFAC-17（`Set`、`Map`、`bigint`、`undefined`、`Date`、函数）。
    - 驱动须带 REFAC-17 的自测（a）–（c），失败即 R4 失败。
  - **每个用例记录**：
    - 返回值（编码后的 JSON），或抛出的错误（构造器名、`code`、全部自有可枚举属性、`message`）；
    - 完整调用记录；
    - **写入类方法**另在调用后用驱动自己的查询（不经过包装对象、不计入记录）读出受影响的表行，按主键排序后编码，作为“库内状态”一并比较。
  - **用例**至少包含：
    - **配置**：
      - `businessMaster`：`service` 与 `party` 各一个，存在与不存在各一个；
      - `businessMasters`：首页 + 用 `nextCursor` 的第二页；
      - `saveBusinessMaster`：新建（`expected = 0`）、按正确版本更新、按错误版本更新（`CONFLICT`）；
      - `postingRules` 分页；`postingCatalog`；
      - `postingRule`：存在与不存在各一个；
      - `savePostingRule`：新建、更新、`CONFLICT`；
      - `businessHistory` 写入后 `businessStamp` 计数。
    - **事件**：
      - `insertBusinessEvent`：普通事件与 `cash_service.cancel`（`original_event_id` 非空）各一个；
      - `linkBusinessJournal`；
      - `insertBusinessEffects`：有统计事实且 2 条清账行、无统计事实且 0 条清账行，各一个；
      - `businessEvent`：存在与不存在；
      - `businessByReceipt`；
      - `journalBusinessEvent`：`operation = 'journal'` 时为 `null`，其他操作返回 id；
      - `businessCancelled`：真与假；
      - `businessEvents`：首页与第二页，状态覆盖 `cancelled`、`recorded`、`posted` 与队列状态；
      - **已损坏的存储行**：用驱动自己的 SQL 把一条事件的 `preview` 改成不合契约的 JSON，再调用 `businessEvent`。两侧的错误逐字节相同。
    - **队列**：
      - `saveQueue`：新建、更新、`CONFLICT`；`plan` 为 `null` 与非 `null` 各一个；
      - `queueItem`：`transfer_plan` 为 `null` 与非 `null`，以及不存在；
      - `queuePage`：不带游标、带 `"<createdAt>~<id>"` 游标、`limit` 等于与小于行数；
      - `pendingTransfers`：真与假。
    - **清账**：
      - `clearingLines`：`refs` 为空、1 条、3 条，含已匹配（`matched`）与平衡行（`balancing`）；
      - `openClearingLines`：不带游标、带 `"<entryId>:<lineNo>"` 游标、日期截断。
    - **审计**：`businessAudit` 连续两次，序号递增。
    - **只含 `query` 的连接**：传入只有 `query` 方法的普通对象，构造后调用一次 `businessMasters`。
  - **判定**：base 与 head 每个用例的记录与库内状态逐字节相同。PR 正文附两侧输出的 SHA-256 与比较结果。并且**直接断言**，只比两侧相同不够：
    1. **调用次数**：
       - 读方法各 1 次 `query`；
       - `saveBusinessMaster` / `savePostingRule` / `saveQueue` 各 1 次，包括 `CONFLICT` 时；
       - `insertBusinessEffects` 为“统计事实 0 或 1 次 + 清账行数”次；
       - `businessAudit` 1 次。
    2. **空引用**：`clearingLines(company, [])` 的调用记录中 `query` 为 **0** 次，返回 `[]`。
    3. **写路径**：
       - 新建时第一条 SQL 以 `INSERT INTO ` 开头；
       - 更新时以 `UPDATE ` 开头，并以 `RETURNING code`（配置）或 `RETURNING id`（队列）结尾；
       - 版本不符时抛 `StorageError`、`code` 为 `CONFLICT`，且库内状态与调用前相同。
    4. **游标**：
       - `queuePage` 第二页的参数数组第 3、4 项等于上一页 `nextCursor` 按 `"~"` 切分的两段；
       - `openClearingLines` 第二页参数第 4 项是数值（`typeof === "number"`），等于游标 `":"` 后的部分。
    5. **键与方法**：调用记录中的方法名只有 `query`；只含 `query` 的连接用例不抛错，且返回值与完整连接上同一调用的返回值相同。
    6. **已损坏的存储行**：两侧都抛错，且错误的构造器与 `code` 在 PR 正文写明；这是 base 的现有行为，本任务保留。

    base 上任一直接断言不成立，先停下并向协调者报告。PR 正文附驱动、用例清单、比较结果与直接断言结果。
  - **驱动原件**：PR 正文贴驱动**原文件字节的 base64**；或者同时写出两种 SHA-256：原始字节的，以及按 UTF-8 解码并把换行归一为 LF 后的字节的。只给一种哈希不算满足。
- **R5 结构规则**（静态；评审按代码与 PR 表格核对）：
  - **R5a SQL 原文**：base 与 head 中每一段 SQL 字符串与模板字符串逐字比较，**不**归一空白，含 `queueProjection`、`lineProjection` 的值与所有插值表达式的源文本。PR 正文附 Babel AST 抽取脚本与两侧输出的 SHA-256。不同即失败。
  - **R5b 无模块级可变状态**：新文件与 `business-events.ts` 的模块顶层只有 `import` / `export`、类型、函数声明与 `const` 常量，不含 `let` 与可变容器。PR 正文附 Babel AST 检查脚本的输出。
  - **R5c 原文搬移**：决定 5 所列 9 个辅助函数与 `save` 的函数体，base 与 head 逐字比较，只归一缩进；24 个方法体除 `db` 的取得方式外逐字比较。不同即失败；有差异时在 PR 正文逐处说明并列出原因。
  - **R5d 单一 `save`**：`git grep -n -F 'RETURNING code' <head> -- 'packages/infra/src/storage/business-*.ts'` 只命中 1 行，即 `save` 内；`RETURNING id` 只命中 1 行，即 `saveQueue` 内。base 上同一命令各 1 行（`business-events.ts:124`、`:388`）。检索限定在 `business-*.ts`，因为 `journals.ts`、`master-data.ts`、`trade-master.ts` 自有同类语句，不在本任务范围。PR 正文附两侧检索原文。
  - **R5e 依赖方向**：新文件之间的导入单向无环，`business-events.ts` 位于顶端；仍只从 `./journals.ts` 导入 `storedJournalPlan`。PR 正文附导入图。
- **R6 尺寸**：
  - 除上表 R6a、R6b 外，每个新函数满足 ②：≤ 80 行，嵌套 ≤ 3 层；
  - PR 正文列出所有超过 50 行的函数，附计数行数与最深层数（base 与 head 两列）；
  - SQL 字符串的行数照计。
- **R7 打包字节**：
  - 首屏与全部 chunk **±0**；
  - 用 `scripts/measure/bundle-measure.mjs --d454`，不传 `--route` / `--chunk`，即全部 ±0；写明脚本所在的提交 SHA；
  - base 为最终送审 head 的实际合并基；
  - 出现任何非 0 差异即停下报告。
- **R8 质量门**：
  - **R8a 合并前**：`typecheck`、`lint`、`check:boundaries`、CI-02 预检通过；PR CI（`ci.yml`）绿。
  - **R8b 合并后检查（不作合并门）**：合并后第一次覆盖该合并提交的 main Full 须绿；失败时报协调者，按 D456 暂停后续合并。
- **R9 可读性一节**：PR 正文按下节逐条说明。

## 性能考虑

- **不跑 Bench**：
  - SQL 文本与参数逐字节相同（R4、R5a），SQLite 对相同的语句与绑定值生成相同的执行计划；
  - 查询次数与先后相同（R4 直接断言 1）；
  - 剩余差异只有 JS 函数调用与对象展开的开销，每次构造仓储一次。

  若 R4 / R5a 出现任何 SQL 差异，本任务即不成立，不以 Bench 结果补救。
- 不改事务边界（本仓储不开事务）；不进打包产物（R7）。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥：

- **②**：本任务就是为满足 ② 而做。`businessRepository` 从 325 行拆到 ≤ 80 行（R6a）；拆后它只是“按顺序组合各组”。
- **③**：`business-events.ts`（432 行）是热点；拆后 ≤ 120 行，新文件各 ≤ 200 行（R6b）。PR 正文贴 `git diff --numstat`。
- **①**：文件名与工厂名表达职责，例如“配置”“事件”“转账队列”“清账行”“行映射”。不用 `part1`、`helpers2` 这类名字。
- **④**：
  - `db` 只通过参数传入；
  - 各组之间不互相调用，配置组内共用 `save`；
  - SQL 与参数数组放在同一个方法内，读者在一处就能看到“语句 + 绑定值”。
- **⑤**：`save` 保持单一实现（决定 3、R5d）。`saveQueue` 与 `save` 看似相近，实则不同，不合并（R5d）。
- **⑥**：
  - `:256` 的注释随方法原样搬移；
  - 不新增注释，除非某处拆分需要说明“为什么”，例如“键顺序须与接口一致，组合顺序不可调换”；
  - 不留调试输出。
- **测试耗时**：本任务不改测试；R4 驱动不提交。PR 正文附 `business-events.test.ts` 在 base 与 head 上的耗时（vitest 汇总行原文）；两侧差异 > 20% 时说明原因。

## 用户可见变化

- 无。业务事件、过账规则、转账队列、清账与审计记录的读写、分页与错误提示都不变（R3、R4）。

## 证据要求

- **不需要浏览器时段**：
  - 行为等价由 R3（既有用例）与 R4（SQL、参数、返回值、错误与库内状态逐字节等价，并有直接断言）证明；
  - 经过这些接口的 e2e 场景在 main Full 中运行，作合并后检查（R8b）；
  - R4 与构建在本机运行，须服从协调者的时段静默通知（D442 / D480）。
- **可行性**（S13 回顾行动 4）：
  - `business-events.test.ts` 与 `storage-contract.mjs` 已能在临时 SQLite 上建出业务事件、过账规则、转账队列与清账链接；
  - `businessRepository` 只依赖 `Connection.query`，可用委托包装对象逐方法转发并记录，REFAC-19 #338 已跑通同一方法；
  - R6a、R6b 的 base 数字见“现状”与上表，由设计角色实测；
  - 本任务书**没有**试写驱动。若某个用例在虚构数据上构造不出来（例如某种队列状态），PR 正文写明原因并报协调者，不得静默删去。
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

- [x] 冲突域与同批任务逐文件不相交，没有共享单文件。
- [x] 每条 base 失败、head 通过的检查都有 base 实测值。
- [x] 写路径（新建、更新、`CONFLICT`）与 0 次查询的分支都有直接断言。
- [x] 可读性一节齐全；无用户可见变化。
- [x] 不加迁移，不碰 `scripts/slot/`、`scripts/measure/`。
