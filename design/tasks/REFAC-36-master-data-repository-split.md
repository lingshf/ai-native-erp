# REFAC-36：拆分主数据仓储 `masterDataRepository`（不改行为，SQL 逐字节不变）

- Sprint：S30（[计划](S30.md)）
- 类型：重构（infra 仓储，读写；公司 / 科目 / 期间 / 配置历史，并组合其余 8 个仓储）
- 优先级：P2
- 决定：[D613](S30.md#s30-期间决定)。REFAC-36 不改行为、SQL 逐字节不变；`createMasterDataStore` 只允许把 `run` 内的异步 IIFE 改为具名内层函数、函数体逐字不变。详见“范围与决定”1–10。
- 建议分支：`refac-36-split-master-data-repository`
- 来源：[S30 D609](S30.md#s30-期间决定)；验收基线见 [S30 范围与验收](S30.md#范围与验收) 第 3 行与[三项 REFAC 共用：可读性与嵌套复验](S30.md#三项-refac-共用可读性与嵌套复验)，本任务书不放宽。
- 模板：[REFAC-26](REFAC-26-trade-document-repository-split.md)（SQL 仓储、SQL 逐字节、调用序列 R4、不跑 Bench）；记录规则沿用 [REFAC-25 R4](REFAC-25-journal-repository-split.md#两侧都须成立的不变量)，组合与键序的写法参照 [REFAC-21](REFAC-21-business-repository-split.md)。
- 迁移：**不加**。
- 浏览器时段：**不需要**。本项不进任何 web chunk（见“chunk 归属与首屏”），等价由 R3、R4 在 node 中证明；理由见“证据要求”。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 为什么是它

- 设计角色在 `bae5d59` 上用 `node files/fnlen.cjs packages/web/src packages/core/src packages/infra/src` 实测，`masterDataRepository` 为 **182** 行（`packages/infra/src/storage/master-data.ts:84-265`）。`bae5d59` 与 `4d296bf` 之间只改了 `design/`（`git diff --stat bae5d59 4d296bf` 只列 4 个 `design/` 文件），数字在 `4d296bf` 上不变；下文“可读性”的量法脚本在 `4d296bf` 上复测得同一结果。
- S24 延后的原因已消失：[S24.md:132](S24.md) 写明它“展开 `tradeDocumentRepository`，与 REFAC-26 相邻，留到其合并后”；REFAC-26 已由 [#354](https://github.com/lingshf/ai-native-erp/pull/354) 合并（[README.md:833](README.md) 状态 done）。
- **核对 REFAC-31 / 32 / 34 的“汇总全部仓储，改动面大”**（[REFAC-31:17](REFAC-31-business-event-compute-split.md)、[REFAC-32:24](REFAC-32-copilot-ai-complete-split.md)、[REFAC-34:24](REFAC-34-trade-document-routes-split.md)）：
  - “汇总全部仓储”**成立**：`git grep -n -E "^export (async )?function [a-zA-Z]+Repository[(]" 4d296bf -- packages/infra/src` 输出 9 行，除 `masterDataRepository` 本身外的 8 个工厂都在 `master-data.ts:86-93` 被展开。
  - “改动面大”**不成立**：展开只占 8 行（`:86-93`）；超长来自其后 14 个自有方法（`:94-263`，公司 / 科目 / 期间 / 配置历史）。拆分只改 `master-data.ts` 并新增同目录文件，8 个被展开的仓储文件不动（决定 9）。
  - 真正的风险在**组合契约**而不在改动量：组合结果有 99 个键（见“现状”），被 34 个文件经 `createMasterDataStore` 或直接调用使用，`legacy-import.ts:377-378` 还以 `...repo` 展开它。本任务以 R2 锁定键、键序与属性描述符。
- 只用 `db.query`、不开事务（事务在 `createMasterDataStore` 的 `run`，`:273-314`，本任务只做决定 10 的机械改动），等价可以只看“SQL 文本 + 参数 + 返回值 / 错误 + 库内状态”，与 REFAC-26 相同。
- 同文件另有一处嵌套超标：按 [S30 统一量法](S30.md#s30-统一量法)，`run`（`:273-314`）为 **4** 层（异步 IIFE `:275` → `catch` `:289` → `if` `:290` → `try` `:291`），而 S30 要求被拆文件内每个函数 ≤ 3。设计角色决定一并纳入，只做最小机械改动（决定 10）。
- 方法按职责天然连续（公司 `:94-136`、科目 `:137-204`、期间 `:205-257`、配置历史 `:258-263`），按组拆成工厂再按原顺序展开即可保持键序。

## 现状（main `4d296bf`）

下文 `file:line` 都按 `4d296bf6c43b9a627cf13f55db7b9afe5e9185b9`（main `4d296bf`，S30 计划 [#464](https://github.com/lingshf/ai-native-erp/pull/464) 合并提交）；`packages/` 与 `bae5d59` 相同（`git diff --quiet bae5d59 4d296bf -- packages` 退出码 0）。

- `packages/infra/src/storage/master-data.ts` 共 **325** 行，无注释（`git grep -n -E "//|/\*" 4d296bf -- packages/infra/src/storage/master-data.ts` 无输出）。
- **模块级导出 2 项**（`git grep -n "^export" 4d296bf -- packages/infra/src/storage/master-data.ts`）：`masterDataRepository`（`:84`）、`createMasterDataStore`（`:266-325`）。
- **模块私有**（`:29-83`）：`decode`（`:29-33`，失败抛 `StorageError("STORAGE_FAILURE")`）、`numeric`（`:34`，模块顶层唯一的 `const`）、`companyRow`（`:35-45`）、`flag`（`:46-50`，非 0 / 1 抛 `STORAGE_FAILURE`）、`accountRow`（`:51-66`）、`periodRow`（`:67-74`，`JSON.parse(String(row.modules))`）、`page`（`:75-83`，`nextCursor` 由 `rows.length > query.limit` 决定）。
- **`masterDataRepository(db)` 的结构**（`:84-265`）：
  1. **展开 8 个仓储**（`:86-93`），依次为 `tradeRepository`、`tradeDocumentRepository`、`tradeReportingRepository`、`dimensionRepository`、`journalRepository`、`businessRepository`、`reportRepository`、`periodCloseRepository`。
  2. **14 个自有方法**（`git grep -n -E "^    async [a-zA-Z]+\(" 4d296bf -- packages/infra/src/storage/master-data.ts` 输出 15 行，其中 `:94-263` 内恰好这 14 行，另 1 行是 `createMasterDataStore` 的 `close`（`:318`）；14 个均为 `async` 方法简写），源码顺序即键顺序：

     | 组 | 键（行） | `db.query` 次数 |
     | --- | --- | --- |
     | 公司 | `company` 94、`companies` 98、`currencyScale` 109、`insertCompany` 115 | 1、1、1、4（`tenants` → `books` → `companies` → `ledger_companies`，`:116-135`） |
     | 科目 | `account` 137、`accounts` 153、`contraChildren` 164、`accountsByCodes` 169、`saveAccount` 178 | `account`：`at` 有值时查 `config_history`（`:139-145`），否则查 `accounts`（`:147-151`），各 1；`accountsByCodes`：空数组返回 `[]`、0 次（`:170`），否则 1 次模板字符串 `IN(${…})`（`:173`）；`saveAccount`：`expected === 0` 时 1 次 `INSERT`，否则 1 次 `UPDATE … RETURNING code`，行数 ≠ 1 抛 `StorageError("CONFLICT")`（`:192-203`） |
     | 期间 | `periods` 205、`period` 216、`periodChange` 223、`savePeriod` 235 | `periodChange`：无行返回 `null`；快照无 `command` 返回 `null`（`:228-233`）；`savePeriod`：同 `saveAccount` 的插入 / 带版本更新，≠ 1 抛 `CONFLICT`（`:236-256`） |
     | 配置历史 | `history` 258 | 1 次 `INSERT INTO config_history`（`:259-262`） |

  3. **组合结果的键**（设计角色在 `4d296bf` 上实测，方法见 R2）：8 个被展开仓储依次有 3、27、4、4、15、24、4、4 个键，共 85 个，互不重复；14 个自有键不与其中任何一个重名；`Object.keys(masterDataRepository(db))` 共 **99** 个，前 85 个为展开顺序，后 14 个为上表顺序。值的 `constructor.name` 只有 `AsyncFunction` 与 `Function` 两种。
- **`db` 的用法**：自有方法只调用 `db.query`，且只在方法被调用时调用；传入只含 `query`（调用即抛错）的对象构造组合结果不抛错（同一实测）。`git grep -c "db.query(" 4d296bf -- packages/infra/src/storage/master-data.ts` 为 20，全部位于 `:94-263`。
- **导入方**（导入路径须保持可用）：
  - `git grep -l -E "storage/master-data\.ts\"" 4d296bf -- packages design/ui docs` 共 34 个文件（不加路径限定时另含 `design/tasks/S30.md` 一处文字引用，共 35）：`packages/infra/src/workers/entry.ts`、`packages/infra/test/**` 18 个、`packages/infra/bench/**` 9 个、`design/ui/screenshots/*/capture.mjs` 5 个、`docs/demo/v0.4.0/scripts/prepare.mjs`；
  - 另有 `packages/infra/src/storage/legacy-import.ts:45` 以 `./master-data.ts` 导入，`:735` 调用 `masterDataRepository(raw)`，`:377-378` 在 `historicalRepository` 中以 `...repo` 展开；
  - 直接调用 `masterDataRepository` 的（`git grep -n "masterDataRepository" 4d296bf -- packages scripts`）：`legacy-import.ts:735`、`master-data.ts:285`、`bench/trade-order-preview.ts:169`（传入 `{...db, query}`）、`test/application/trade-documents.test.ts` 8 处、`test/support/trade-ledger.ts:503`。
- **库约束**（R4 构造数据时遵守）：`config_history` 禁止 `UPDATE` / `DELETE`（`002-master-data.sql:58-59`），`snapshot` 须 `json_valid`（`:54`）；`accounts.manual_allowed` 有 `CHECK(manual_allowed IN (0,1))`（`:28`）；`periods.modules` 须为 JSON 数组（`013-trade-reporting.sql:1-2`）。
- **测试**：`infra` 项目中经过 `createMasterDataStore` 的 18 个测试文件（见上）；按名称直接引用 `currencyScale` / `contraChildren` / `accountsByCodes` / `periodChange` 的测试文件只有 `test/http/master-data.test.ts`（`git grep -l -E "currencyScale|contraChildren|accountsByCodes|periodChange" 4d296bf -- packages/infra/test`）。`infra-isolated` 由行首含 `vi.mock(` 的测试文件组成（`vitest.config.ts:17` 起的 `moduleMockFiles`），其中没有 mock `storage` 的（`git grep -n -E "vi\.mock\(.*(master-data|storage)" 4d296bf -- packages/infra/test` 无输出）。真实 Chrome 场景 `packages/infra/test/http/*gui*.slow.test.ts`（`vitest.config.ts:12`，项目 `infra-browser`）经 `test/support/trade-gui/harness.ts:10` 使用本文件。

### chunk 归属与首屏

| 文件 | 落在哪个 chunk | 依据 |
| --- | --- | --- |
| `master-data.ts`（infra，改）与新文件 | **不进任何 web chunk** | `git grep -n -E "from .(@erp/infra\|[./]*infra/)" 4d296bf -- packages/web/src` 与 `git grep -n "erp/infra" 4d296bf -- packages/web/package.json` 均无输出 |
| 首屏 | **±0** | 同上；由 R7 确认 |

## 范围与决定

1. **不改行为，SQL 逐字节不变**（D613）。对任何输入（含版本不符、不存在的代码 / 月份、空数组、游标页、`at` 有无、快照无 `command`、不合契约的快照），以下全部不变：
   - 每次 `db.query` 的 SQL 文本：逐字节，含空白；模板字符串比较拼出后的文本；
   - 参数数组：元素、类型与顺序；
   - 调用的先后与次数；
   - 返回值：键、值与键顺序；
   - 抛出的错误：构造器、`code`、全部自有可枚举属性与 `message`，以及先后（含 `JSON.parse` 抛出的非 `StorageError`）。

   只改代码组织，不修 bug（例如 `currencyScale` 用 `Number(…)` 而非 `numeric`、`:113`），不改 SQL。疑似缺陷登记在 PR 正文，留作后续任务。
2. **组合结果不变**：`Object.keys(masterDataRepository(db))` 两侧相同，99 个键，顺序同“现状”。
   - 8 个仓储的展开顺序（`:86-93`）不变，且仍在自有方法之前；
   - 自有方法可按组拆成工厂，由 `masterDataRepository` 按“公司 → 科目 → 期间 → 配置历史”展开；
   - 每个键仍是组合对象的**自有、可枚举、可写、可配置的数据属性**，原型为 `Object.prototype`（`legacy-import.ts:378` 的 `...repo` 依赖这一点）；不用 class、getter、`Object.create` 或 `Proxy`；
   - 14 个自有方法保持 `async` 方法简写。
3. **单一实现**：`decode`、`numeric`、`flag`、`companyRow`、`accountRow`、`periodRow`、`page` 各只一份，供各组共用；不得复制到多个文件（R5d）。
4. **方法内语句顺序不变**：`insertCompany` 的 4 条语句、`saveAccount` / `savePeriod` 的“插入或带版本更新 → 行数检查”、`account` 的 `at` 分支、`accountsByCodes` 的空数组早退与 `periodChange` 的两处 `null` 原样保留。
5. **SQL 的组织**：字符串与 `accountsByCodes` 的模板字符串原样搬移，含插值表达式；不拆成片段再拼接；参数数组原样搬移。
6. **导出不变**：`master-data.ts` 仍导出且只导出 `masterDataRepository` 与 `createMasterDataStore`，签名不变；34 个导入方与 `legacy-import.ts` 不改。`createMasterDataStore`（`:266-325`）除决定 10 外**原文不动**。
7. **文件**：
   - 新文件与 `master-data.ts` 同放在 `packages/infra/src/storage/`，以 `master-data-` 开头按职责命名，例如 `master-data-rows.ts`（行解析与分页）、`master-data-companies.ts`、`master-data-accounts.ts`、`master-data-periods.ts`；`history` 可单独放 `master-data-history.ts` 或并入期间文件末尾，由开发定并写入 PR 正文。`git ls-tree --name-only 4d296bf packages/infra/src/storage/` 中现无 `master-data-` 开头的文件；
   - 名称禁用 `step1`、`part2`、`helper`、`utils` 及同类无业务含义的名字；
   - 新文件不导入 `master-data.ts`，只被 `master-data.ts` 或本任务的新文件导入，不加入 `storage/index.ts`；
   - 新文件各 ≤ 150 行；拆后 `master-data.ts` ≤ 110 行（估算：325 − 私有辅助 55 行 − 自有方法 170 行 − 迁出的契约 / 领域导入约 8 行 + 新导入与组合约 10 行 + 决定 10 净增 1 行 ≈ 103，留少量余量；此上限为设计角色估算，非实测）。
8. **import 不新增依赖**：新文件从 `@erp/core/application`、`@erp/core/domain`、`@erp/core/contracts`、`./types.ts` 导入的名称都是 base 的 `master-data.ts:1-27` 已在用的。
9. **不改**：
   - `packages/infra/src/storage/` 下其他现有文件，含 8 个被展开的仓储文件（`trade-master.ts`、`trade-documents.ts`、`trade-reporting.ts`、`dimensions.ts`、`journals.ts`、`business-events.ts`、`reports.ts`、`period-close.ts`）及其 `trade-document-*`、`journal-*`、`business-*`、`report-*` 文件、`legacy-import.ts`、`migrations.ts`、`queue.ts`、`sqlite.ts`、`errors.ts`、`types.ts`、`index.ts`；迁移 SQL；
   - `packages/infra/src/**` 其他目录（含 `http/master-data.ts`、`workers/entry.ts`）；
   - `packages/infra/test/**`、`packages/infra/bench/**`；
   - `packages/core/**`（含 `MasterDataRepository` 接口 `application/master-data.ts:42-77`）、`packages/web/**`；
   - `design/ui/screenshots/**`、`docs/**`、`scripts/**`、`package.json` / lock、`vitest.config.ts`。
10. **`run` 的嵌套降层（只此一处机械改动）**：
    - **改法**：把 `run` 内的 `const operation = (async () => {`（`:275`）……`})();`（`:307`）改为在同一位置声明具名内层函数 `async function transaction(): Promise<T> { … }`，紧接其后 `const operation = transaction();`。函数体（`:276-306`，31 行）逐字不变（缩进除外；函数声明与原 `const` 同缩进时函数体缩进也不变）。`:274` 的 `if (closed)` 早退仍在声明之前，`:308-313` 的 `inflight` 登记与 `void operation.then(…)` 及 `createMasterDataStore` 其他各行原文不动。
    - **为什么等价**：原 IIFE 与 `transaction()` 都在调用处同步执行到第一个 `await`（`queue.acquire()`，`:276`），返回同一种 Promise；函数体不用 `this`、`arguments`，也不引用名为 `transaction` 的绑定（`git show 4d296bf:packages/infra/src/storage/master-data.ts` 的 `:276-306` 中无 `this` / `arguments`；`git grep -n -w transaction 4d296bf -- packages/infra/src/storage/master-data.ts` 无输出），箭头函数与具名函数在这两点上的差异不涉及；`: Promise<T>` 只是把原先推断出的类型写明。队列获取、连接获取、`begin` / `commit` / `rollback`、`destroy`、`release` 与 `release()` 的先后，以及 `inflight` 的加入与删除、`close()` 等待 `inflight` 的语义都不变。
    - **改后预期**（S30 统一量法）：`run` 1 层（`if (closed)` 的受控语句与 `.then` 的两个回调）、43 行；`transaction` 3 层（`catch` → `if` → `try`）、33 行；`createMasterDataStore` 由 60 增为 61 行（设计角色在内存中对 base 源文本做此替换后以同一量法试测得出，未落盘）。
    - **证明方法**：R5c（函数体去缩进后逐字比对）、R5f（`createMasterDataStore` 的整体 diff 只含规定的行）与 R4b（行为驱动）；名称 `transaction` 可换成同样表达职责的名字，但禁用 `step1`、`part2`、`helper`、`utils`。

## 冲突域

- infra-storage:master-data：只改 `packages/infra/src/storage/master-data.ts`，并新增同目录下的 `master-data-*.ts`（决定 7）。由 R1 的 `git diff --name-only` 穷举。
- 取证所需的观测点与新增测试文件：无。R4 驱动与量法脚本不提交。
- 与 S30 其他泳道逐文件不相交：REFAC-35 改 `packages/web/src/Reports.tsx` 与 `packages/web/src/reports/`；REFAC-37 改 `packages/core/src/domain/dimensions.ts` 与同目录 `dimension-*.ts`（与 infra 的 `storage/dimensions.ts` 是不同文件，后者在决定 9 中不改）；KDOC-14 改 `docs/flows/invoice-detail-flow.md`。
  - 间接依赖：`storage/dimensions.ts:1-3` 只从 `@erp/core/application`、`@erp/core/contracts`、`@erp/core/domain` 导入类型与 schema；REFAC-37 承诺导出 API 不变。REFAC-37 若先合并，本项按实际合并基重跑 R3、R4。
- legacy 相邻：本任务不改 legacy 文件，但 `legacy-import.ts:735` 执行本函数，M2-05 演练路径经过它；等价由 R3（含 `test/legacy-import-execute.test.ts`）与 R4 保证。
- 受影响的 e2e：`infra-browser` 的 `*gui*.slow.test.ts` 须继续成立，合并后由 R8b 复核；须随本任务改：无。
- 受影响的文档引用（D460）：`git grep -n -F "storage/master-data.ts" 4d296bf -- docs README.md` 只命中 `docs/demo/v0.4.0/scripts/prepare.mjs:5`（导入 `createMasterDataStore`，路径保持可用）；`design/` 中的引用是当时的事实记录，不改。

## 验收

### base 失败、head 通过

| 编号 | 检查 | base `4d296bf` | head 要求 |
| --- | --- | --- | --- |
| R6a | [S30 统一量法](S30.md#s30-统一量法)对 `master-data.ts` 与全部新增 `master-data-*.ts` 的完整输出中，第 1 列（函数行数） | `masterDataRepository` **182**（失败） | 每个函数 ≤ 80 |
| R6c | 同一输出的第 2 列（嵌套层数） | `run` **4**（失败） | 每个函数 ≤ 3（决定 10） |
| R6b | `master-data.ts` 总行数 | 325 | ≤ 110；新文件各 ≤ 150（决定 7） |

### 两侧都须成立的不变量

- **R1 范围**：`git diff --name-only <base>...<head>` 只含 `packages/infra/src/storage/master-data.ts` 与同目录新增的 `master-data-*.ts`；不加迁移；测试文件 diff 为空。
- **R2 导出与组合**：在 base 与 head 上各：
  - `import * as m from ".../storage/master-data.ts"`，打印 `Object.keys(m).sort()` 与每项 `typeof`（预期 `createMasterDataStore`、`masterDataRepository`，均为 `function`）；
  - 对只含 `query`（调用即抛错）的普通对象调用 `masterDataRepository`，打印 `Object.keys(…)`（99 行，按序）、`Object.getPrototypeOf(…) === Object.prototype`、每个键的属性描述符（`writable` / `enumerable` / `configurable` 与是否为数据属性）、每个值的 `constructor.name`；再分别调用 8 个被展开的工厂，断言前 85 个键等于它们键的依次拼接；
  - 两侧输出逐行相同（决定 2）。`npm run check:boundaries` 通过；新文件的导出只在本任务文件内使用，PR 正文附 `git grep` 结果。
- **R3 既有测试原样通过**：`npx vitest run --project infra --project infra-isolated` 全部通过；PR 正文附 base 与 head 各一次的汇总行原文；有失败时逐个列出，并附只对失败文件的串行重跑原文（`--no-file-parallelism`）。
- **R4 返回值、错误与数据库调用序列等价**（送审证据；驱动不提交）：
  - **驱动**：临时 node / vitest 脚本，在 base 与 head 上用同一份虚构数据建库（临时目录中新建 SQLite 并跑全部迁移，可借用 `test/http/master-data.test.ts` 的建库步骤）；从源文件导入 `masterDataRepository`，传入委托包装的连接对象，直接调用 14 个自有方法；固定日期与 revision，不用当前时间与随机值。
  - **记录规则**：同 REFAC-26 R4（复用 REFAC-25 / REFAC-17）：包装对象为普通新对象、逐方法写转发、不用 `Proxy`；调用即记 `{seq, method, args}`，SQL 原样、参数确定性编码（`bigint` 与 `number` 区分）；Promise 记 `pending` → `resolved` / `rejected`；方法结束后无 `pending`；带 REFAC-17 自测（a）–（c）。
  - **每个用例记录**：返回值或错误（构造器名、`code`、全部自有可枚举属性、`message`）、完整调用记录；写入类方法另用驱动自己的查询（不经包装、不计入记录）读出 `tenants`、`books`、`companies`、`ledger_companies`、`accounts`、`periods`、`config_history` 的行，按主键排序编码，作为库内状态比较。预期抛错的写入用例在驱动自己开的事务中调用，读出状态后回滚。
  - **用例**至少包含（构造不出时 PR 正文写明原因并报协调者，不得静默删去）：
    - 公司：`company` 存在 / 不存在；`companies` 无游标、带游标、`limit` 等于与小于行数；`currencyScale` 存在 / 不存在；`insertCompany` 第一家、第二家（`ON CONFLICT DO NOTHING` 路径）、重复代码（`ledger_companies` 主键冲突）。
    - 科目：`account` 无 `at` 存在 / 不存在，有 `at` 命中 / 未命中 / 快照为合法 JSON 但不合 `accountSchema`（驱动自己 `INSERT INTO config_history`，允许插入）；`accounts` 分页；`contraChildren`；`accountsByCodes` 空数组与 2 个代码；`saveAccount` 新建、版本正确的更新、版本错误。
    - 期间：`periods` 分页；`period` 存在 / 不存在；`periodChange` 带 `command` 命中、无 `command` 命中、未命中、快照不合 `periodSchema`；`savePeriod` 新建、更新、版本错误。
    - 配置历史：`history` 三种 `kind` 各一次。
    - 只含 `query` 的连接：构造后调用一次 `companies`。
  - **判定**：base 与 head 每个用例的记录与库内状态逐字节相同，PR 正文附两侧输出 SHA-256 与比较结果。并且**直接断言**（只比两侧相同不够）：
    1. `insertCompany` 恰好 4 次调用，依次为 `tenants`、`books`、`companies`、`ledger_companies` 的 `INSERT`。
    2. `saveAccount` / `savePeriod` 版本错误：`StorageError`、`code` 为 `CONFLICT`，调用恰好 1 次（`UPDATE … RETURNING`），库内状态与调用前相同。
    3. `accountsByCodes([])` 返回 `[]`、0 次调用；2 个代码时 SQL 含 `IN(?,?)`，参数为 `[company, code1, code2]`。
    4. `account` 有 `at` 时恰好 1 次且只查 `config_history`；无 `at` 时恰好 1 次且只查 `accounts`。
    5. 分页的 `LIMIT` 参数为 `limit + 1`；无游标时游标参数为 `""`；行数 ≤ `limit` 时 `nextCursor` 为 `null`。
    6. 不合契约的快照：`account`（有 `at`）与 `periodChange` 抛 `StorageError`、`code` 为 `STORAGE_FAILURE`；`periodChange` 无 `command` 返回 `null`。
    7. 调用记录中的方法名只有 `query`；只含 `query` 的连接用例不抛错。

    任一直接断言在 base 上不成立，先停下报协调者，**不得**改产品代码迁就断言。
  - **驱动原件**：PR 正文贴原文件字节的 base64，或同时给出原始字节与“UTF-8 解码、换行归一为 LF”两种 SHA-256。
- **R4b `createMasterDataStore` 的队列、事务、关闭语义**（决定 10；送审证据，驱动不提交）：
  - **现有测试覆盖**（R3 中原样通过即为证据）：`work` 抛错后回滚、库内计数不变——`test/application/journals.test.ts:673-708`、`:759-777`（`StorageError` 经 `storageError` 映射为 `STORAGE_FAILURE`），`test/application/trade-documents.test.ts:1081-1089`、`:1531-1552`（普通 `Error` 映射为 `STORAGE_FAILURE`），`test/application/period-close.test.ts:204-216`（SQLite 触发器中止写入）；同一 `store`（`:1094` 建立）上两次并发写入一成一败——`trade-documents.test.ts:1396-1404`；`close()` 后以同一库文件重开——`test/http/master-data.test.ts:373-374`。
  - **现有测试未覆盖**：`close()` 等待进行中的操作（`inflight`，`:271`、`:308-312`、`:321`）、关闭后 `read` / `write` 以 `CLOSED` 拒绝（`:274`）、回滚失败转 `STORAGE_FAILURE` 并 `release(true)`（`:291-296`、`:302`）。依据：`git grep -l createMasterDataStore 4d296bf -- packages/infra/test` 的 18 个文件与 `git grep -l -E '"CLOSED"|inflight|allSettled' 4d296bf -- packages/infra/test` 的交集只有 `test/application/trade-documents.test.ts` 与 `test/support/trade-gui/harness.ts`，前者命中的是业务 `CONFLICT` 竞争（`:1140`、`:1396`），后者是浏览器与服务清理（`:139-146`）。本任务不改测试（S30 第 3 行），故由临时驱动在 base 与 head 上各跑一次、输出逐字节相同，并直接断言：
    1. 写入 A 的 `work` 挂起时调用 `close()`：A 解决之前 `close()` 不解决；记录的事件顺序为“A 开始 → close 调用 → A 结束 → close 解决”。
    2. `close()` 之后 `read` 与 `write` 都以 `StorageError`、`code` 为 `CLOSED` 拒绝，`work` 未被调用。
    3. 同一 `store` 上先后发起写入 A、B（A 的 `work` 挂起）：B 的 `work` 在 A 提交之后才开始。
    4. `work` 抛 `DomainError` 时原样抛出（同一对象）；抛普通 `Error` 时为 `STORAGE_FAILURE`；两者库内状态不变。
    5. （可选）回滚失败路径：驱动以委托包装替换连接的 `rollback` 使其抛错，断言 `STORAGE_FAILURE` 与 `release(true)`；若须改产品代码才能注入，写明原因并报协调者，不得为此改产品代码。
- **R5 结构规则**（静态）：
  - **R5a SQL 原文**：用 `@babel/parser` 抽取 base 与 head 中每个 `*.query(` 调用的第一个实参的源文本（不归一空白，含插值表达式），按“所在方法名 + 方法内先后”排序，两侧逐字比较；base 为 20 个调用。不同即失败。PR 正文附抽取脚本与两侧输出 SHA-256。
  - **R5b 无模块级可变状态**：新文件与 `master-data.ts` 顶层只有 `import` / `export`、类型、函数声明与 `const`；不含 `let` 与可变容器（`createMasterDataStore` 内部的 `let` / `Set` 是函数内状态，不在此列）。
  - **R5c 原文搬移**：`:29-83` 的私有辅助、14 个方法体，base 与 head 逐字比较，只归一缩进；`run` 的函数体：base `:276-306`（IIFE 花括号之间）与 head `transaction` 花括号之间的全部行，各自去掉行首空白后逐字节比较，须完全相同（预期连缩进都相同）。不同即失败，有差异时逐处说明。PR 正文附比较脚本与两侧去缩进文本的 SHA-256。
  - **R5f `createMasterDataStore` 只改规定的行**：`git diff -U0 <base> <head> -- packages/infra/src/storage/master-data.ts` 中落在 `createMasterDataStore` 内的块，删除行只有 `    const operation = (async () => {` 与 `    })();` 两行，新增行只有 `    async function transaction(): Promise<T> {`、`    }`、`    const operation = transaction();` 三行（名称按决定 10 可换）；PR 正文附该段 diff 原文。
  - **R5d 单一实现**：在 `packages/infra/src/storage/master-data.ts` 与 `'packages/infra/src/storage/master-data-*.ts'` 范围内用 `git grep -c -F`（各文件之和），两侧相同：`function decode` 1、`function page` 1、`function flag` 1、`const numeric` 1、`INSERT INTO accounts(` 1、`UPDATE accounts SET` 1、`INSERT INTO periods(` 1、`UPDATE periods SET` 1、`INSERT INTO config_history(` 1、`FROM config_history` 2（`account` 与 `periodChange`）。
  - **R5e 依赖方向**：新文件之间单向无环，`master-data.ts` 位于顶端；PR 正文附导入图。
- **R6 尺寸与嵌套**：见上表 R6a、R6b、R6c 与“可读性”五项。
- **R7 打包字节**：首屏与全部 chunk ±0；用 `scripts/measure/bundle-measure.mjs --d454`，不传 `--route` / `--chunk`，写明脚本所在提交 SHA；base 为最终送审 head 的实际合并基；任何非 0 差异即停下报告。
- **R8 质量门**：
  - **R8a 合并前**：`npm run typecheck`、lint、`npm run check:boundaries`、CI-02 预检通过；PR CI（`ci.yml`）绿。
  - **R8b 合并后（不作合并门）**：第一次覆盖合并提交的 main Full 须绿，含 `infra-browser` 场景；失败时报协调者，按 D456 暂停后续合并。
  - **R8c 合并后项**（[S30 合并后证据](S30.md#pr-正文证据计划d595)）：Product/Design 在合并提交上用 [S30 统一量法](S30.md#s30-统一量法)（`node <保存位置>\s30-measure.cjs <合并提交> packages/infra/src/storage/master-data.ts <全部 master-data-*.ts>`）复测 `master-data.ts` 与全部 `master-data-*.ts` 的**函数长度与嵌套深度**，在已合并 PR 下评论命令、输出与合并提交完整 SHA；S30 执行状态表“合并后项”据此清空。

## 性能考虑

- **不跑 Bench，不写“Bench 不退化”**（口径同 REFAC-26，[S30 范围与验收](S30.md#范围与验收) 第 3 行）：SQL 文本与参数逐字节相同（R4、R5a）、调用次数与先后相同（R4 直接断言 1–5），SQLite 执行计划相同；剩余差异只是构造组合对象时多几次工厂调用与展开。
- **出现任何 SQL 差异即本任务不成立**，不以 Bench 结果补救。`bench/trade-order-preview.ts:169` 直接调用 `masterDataRepository`，导入路径与签名不变（决定 6），本任务不改 bench。
- 不改事务边界（`createMasterDataStore` 只做决定 10 的具名化，语句与先后不变，R4b、R5c、R5f）；不进打包产物（R7）。

## 可读性

按[路线图完成定义 · 可读性](../roadmap.md#5-团队流程)（[roadmap.md:89-96](../roadmap.md)）与 [S30 共用表](S30.md#三项-refac-共用可读性与嵌套复验)。说明：roadmap.md:89 规定“纯搬移且按任务书证明文本不变的旧代码不按‘新写’计”；本任务仍按 S30 要求对被拆文件与新文件的**全部函数**列长度与嵌套。

### 量法：S30 统一量法

函数长度与嵌套深度一律用 [S30 统一量法](S30.md#s30-统一量法) 的 `s30-measure.cjs`（脚本原文只在 S30.md 维护，本任务书不另带脚本）。计层口径摘要：`if` / `else`、循环、`switch`、`try` / `catch` 的受控语句不论有无花括号各加 1；`else if` 与其前的 `if` 同层；任何不具名的函数体（含 JSX 属性回调与 IIFE）算内联回调，计入所在函数并加 1；具名内层函数单独计。行数不计空行与只有注释的行。

在仓库根目录运行（脚本以 `git show <rev>:<file>` 读源文件，不依赖工作区检出）：

```powershell
node <保存位置>\s30-measure.cjs 4d296bf packages/infra/src/storage/master-data.ts
node <保存位置>\s30-measure.cjs <head> packages/infra/src/storage/master-data.ts @(git diff --name-only --diff-filter=A <base> <head> -- packages/infra/src/storage)
```

输出每个具名函数一行：`行数	层数	文件:首行-末行	名称`，按源码顺序；内联回调不单独成行。

- **base 实测**（`4d296bf`，第一条命令的完整输出，27 行）：

  ```text
  5	1	packages/infra/src/storage/master-data.ts:29-33	decode
  1	0	packages/infra/src/storage/master-data.ts:34-34	numeric
  11	0	packages/infra/src/storage/master-data.ts:35-45	companyRow
  5	1	packages/infra/src/storage/master-data.ts:46-50	flag
  16	0	packages/infra/src/storage/master-data.ts:51-66	accountRow
  8	0	packages/infra/src/storage/master-data.ts:67-74	periodRow
  9	0	packages/infra/src/storage/master-data.ts:75-83	page
  182	0	packages/infra/src/storage/master-data.ts:84-265	masterDataRepository
  4	0	packages/infra/src/storage/master-data.ts:94-97	company
  11	1	packages/infra/src/storage/master-data.ts:98-108	companies
  6	0	packages/infra/src/storage/master-data.ts:109-114	currencyScale
  22	0	packages/infra/src/storage/master-data.ts:115-136	insertCompany
  16	2	packages/infra/src/storage/master-data.ts:137-152	account
  11	1	packages/infra/src/storage/master-data.ts:153-163	accounts
  5	0	packages/infra/src/storage/master-data.ts:164-168	contraChildren
  9	1	packages/infra/src/storage/master-data.ts:169-177	accountsByCodes
  27	2	packages/infra/src/storage/master-data.ts:178-204	saveAccount
  11	1	packages/infra/src/storage/master-data.ts:205-215	periods
  7	0	packages/infra/src/storage/master-data.ts:216-222	period
  12	1	packages/infra/src/storage/master-data.ts:223-234	periodChange
  23	1	packages/infra/src/storage/master-data.ts:235-257	savePeriod
  6	0	packages/infra/src/storage/master-data.ts:258-263	history
  60	0	packages/infra/src/storage/master-data.ts:266-325	createMasterDataStore
  42	4	packages/infra/src/storage/master-data.ts:273-314	run
  1	0	packages/infra/src/storage/master-data.ts:316-316	read
  1	0	packages/infra/src/storage/master-data.ts:317-317	write
  6	0	packages/infra/src/storage/master-data.ts:318-323	close
  ```

  超标 2 处：`masterDataRepository` 长度 182 > 80；`run` 嵌套 4 > 3（异步 IIFE `:275` 记 1 → `catch` 块 `:289` 记 2 → `if (begun && db)` `:290` 记 3 → 内层 `try` `:291` 记 4；外层 `try` `:280` 与 `catch` 同为 2 层，不叠加）。
### 五项要求

| 项 | 要求 | 改前（`4d296bf`） | PR 正文须列的改后数据 |
| --- | --- | --- | --- |
| 函数长度（②） | `master-data.ts` 与全部新文件中每个函数 ≤ 80 | 超标 1 个：`masterDataRepository` 182；其余最长 `createMasterDataStore` 60 | S30 统一量法对 `master-data.ts` 与全部新增 `master-data-*.ts` 的**完整**输出（base 与 head 各一份，附两条命令）；超过 60 行的函数逐个列行数（预期按科目组拆出的工厂最接近上限，约 72；`createMasterDataStore` 预期 61） |
| 嵌套深度（②） | 每个函数 ≤ 3 | 超标 1 个：`run` **4**（`:273-314`，路径见上）；`masterDataRepository` 0；自有方法最深 2（`account`、`saveAccount`） | 同一完整输出的第 2 列；拆后每个函数的最深层数（预期 `run` 1、`transaction` 3）；3 层的逐个说明路径 |
| 文件长度（③） | 非热点（325 < 800）；拆后 `master-data.ts` ≤ 110，新文件各 ≤ 150 | `master-data.ts` 325 | 逐文件 `git diff --numstat <base> <head>` 与拆后各文件行数（`git show <head>:<file> \| wc -l` 或 PowerShell `(git show <head>:<file>).Count`） |
| 重复（④） | 拆出的函数不复制同一业务规则或流程；第三次出现即抽取（只对新写代码） | 见下“现有重复片段” | 每处重复的去向：原样保留（附 R5c 证明文本未改）或抽取为哪个函数 |
| 命名（①） | 新函数、新文件名表达业务含义；禁用 `step1`、`part2`、`helper`、`utils` | — | 新增名称清单（文件与函数），每个一句职责 |

另：⑤ 本文件无新增数字阈值；⑥ base 无注释，拆分只在需要说明“为什么”时加注释（例如“展开顺序决定键序，须在 8 个仓储之后”），不留调试输出。

### 现有重复片段（`4d296bf`）

| 片段 | 位置 | 处理 |
| --- | --- | --- |
| 单行查询后 `rows[0] ? 映射(rows[0]) : null` | `company` `:95-96`、`account` `:147-151`、`period` `:217-221`（`currencyScale` `:110-113` 形近但映射为 `Number`） | 三处 SQL 与映射各不相同，属搬移的旧代码，原样保留；抽取会改方法体，违背 R5c |
| 分页调用 `page(await db.query(…, [..., query.cursor ?? "", query.limit + 1]), query, 映射, 取键)` | `companies` `:99-107`、`accounts` `:154-162`、`periods` `:206-214` | 共同部分已由 `page`（`:75-83`）抽取；剩余差异是 SQL 与取键，原样保留 |
| 乐观锁保存：`expected === 0` 时 `INSERT`，否则 `UPDATE … RETURNING`，行数 ≠ 1 抛 `CONFLICT` | `saveAccount` `:192-203`、`savePeriod` `:236-256` | 两次，未到第三次；原样保留 |
| 读 `config_history` 快照并 `decode` | `account` `:139-145`、`periodChange` `:224-232` | 两次，且查询条件、类型检查不同；原样保留 |
| `(…).map(accountRow)` | `contraChildren` `:165-167`、`accountsByCodes` `:171-176` | 两次；原样保留 |
| 行解析 `decode` / `numeric` / `flag` / `*Row` / `page` | `:29-83` | 被多个组共用，只放一份（决定 3、R5d），不得复制到各组文件 |

- **测试耗时**：本任务不改测试；PR 正文附 `test/http/master-data.test.ts` 在 base 与 head 上的耗时（vitest 汇总行原文），差异 > 20% 时说明原因。

## 用户可见变化

- 无。公司、科目、期间的查询、保存、分页、历史与错误提示不变（R3、R4）。

## 证据要求

- **不需要浏览器时段**：本项不进 web chunk；行为等价由 R3、R4 在 node 中证明；`infra-browser` 场景在 main Full 中运行，作合并后检查（R8b）。R4 与构建在本机运行，服从协调者的时段静默通知（D442 / D480）。
- **可行性**：`test/http/master-data.test.ts` 已能在临时 SQLite 上建库并跑迁移；自有方法只依赖 `Connection.query`，REFAC-21 / 25 / 26 已跑通同一记录方法；R2 的 99 个键与“只含 `query` 可构造”由设计角色在 `4d296bf` 上实测。本任务书**没有**试写 R4 驱动；“不合契约的快照”用例依赖 `config_history` 允许插入且 `json_valid` 通过的假设，构造不出时写明原因并报协调者。`account` 中 `typeof snapshot !== "string"`（`:144`）在 `snapshot TEXT … CHECK(json_valid(snapshot))` 下可能无法构造，不列为必需用例；`flag` 的失败分支受 `accounts.manual_allowed` 的 `CHECK`（`002-master-data.sql:28`）约束，同样不列为必需。
- PR 正文附：R1 的 `git diff --name-only` 原文；R2 输出；R3 汇总行；R4 驱动（base64 或两种 SHA-256）、用例清单、比较结果与直接断言结果；R4b 驱动、事件记录与断言 1–5 结果；R5a–R5f；“可读性”五项（含 `s30-measure.cjs` 两条运行命令与 base、head 两份完整输出；脚本原文不贴，链接 [S30 统一量法](S30.md#s30-统一量法)）；R7 完整输出与退出码。R8b、R8c 在合并后补到 PR 评论。

## 设计自查

- [x] 冲突域与 REFAC-35、REFAC-37、KDOC-14 逐文件不相交，R1 以 `git diff --name-only` 穷举。
- [x] base 失败、head 通过的检查有 base 实测值（182、325）。
- [x] 组合契约（99 个键、键序、数据属性）有 R2 断言；`legacy-import.ts:378` 的 `...repo` 依赖已列出。
- [x] SQL 逐字节、调用序列与库内状态等价（R4、R5a）；不跑 Bench、不写 Bench 不退化，SQL 差异即不成立。
- [x] 嵌套量法用 [S30 统一量法](S30.md#s30-统一量法)，base 数据为其在 `4d296bf` 上的完整输出（`masterDataRepository` 182/0、`run` 42/4）；任务书不另带脚本。
- [x] `run` 嵌套 4 纳入范围（决定 10），只允许 IIFE 具名化；函数体逐字比对（R5c）、diff 行限定（R5f）、语义驱动（R4b），现有测试覆盖与未覆盖处已列出。
- [x] “可读性”五项分别有要求、改前数据与改后须列；现有重复片段列到行；禁用名称已写明。
- [x] 合并后项：Product/Design 在合并提交上复测函数长度与嵌套深度（R8c）。
- [x] 不加迁移，不改测试、bench、`scripts/`。
