# REFAC-39：拆分贸易报表仓储 `tradeReportingRepository`（不改行为，SQL 逐字节不变）

- Sprint：S31（[计划](S31.md)）
- 类型：重构（infra 仓储，只读；未结项报表、单项、账龄合计与子账 / GL 核对）
- 优先级：P2
- 决定：[D622](S31.md#s31-期间决定)。REFAC-39 不改行为：SQL 文本与参数逐字节不变、调用序列等价、返回键与键序不变；只搬移，不改 SQL 的切分方式。详见“范围与决定”1–8。
- 建议分支：`refac-39-split-trade-reporting-repository`
- 来源：[S31 范围与验收](S31.md#范围与验收)第 3 行、[三项 REFAC 共用：可读性与嵌套复验](S31.md#三项-refac-共用可读性与嵌套复验)；本任务书不放宽。
- 模板：[REFAC-36](REFAC-36-master-data-repository-split.md)（SQL 仓储、SQL 逐字节、调用序列 R4、不跑 Bench、无 R7）；记录规则沿用 [REFAC-25 R4](REFAC-25-journal-repository-split.md#两侧都须成立的不变量)。
- 迁移：**不加**。
- 浏览器时段：**不需要**。本项不进任何 web chunk（infra 不被 web 导入），等价由 R3、R4 在 node 中证明。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 为什么是它

- 按 [S30 统一量法](S30.md#s30-统一量法)，`tradeReportingRepository` **143** 行（含内层 `tradeReconciliation` 76、`tradeReport` 42），是 infra 仓储中尚未拆分的最长工厂之一（S31 计划按 D617 选定）。
- 四个方法职责清楚：报表戳、分页报表、单项、核对；SQL 片段与行解码是模块私有，可以原样搬移。
- 只用 `db.query`、不开事务、不写库，等价只看“SQL 文本 + 参数 + 返回值 / 错误”，与 REFAC-26 / 36 相同，但更简单（无库内状态比较、无 R4b）。
- 核对方法承载 D25 的单一核对规则（`:241` 注释、`:248-250` 公式），本任务锁定公式原文与键序，不改口径。

## 现状（main `3c571b8`）

下文 `file:line` 都按 `3c571b82062a3b599a332defdfa089d1631a402d`（S31 计划 [#471](https://github.com/lingshf/ai-native-erp/pull/471) 合并提交）；`packages/` 与 `67db1e3` 相同（`git diff --stat 67db1e3 3c571b8 -- packages` 无输出）。

- `packages/infra/src/storage/trade-reporting.ts` 共 **255** 行，最后一次改动为 `d6c5014`（[#147](https://github.com/lingshf/ai-native-erp/pull/147)）。
- **导入**（`:1-4`）：类型 `TradeReportingRepository`（`@erp/core/application`）、`StorageError`（`@erp/core/application/storage`）、类型 `TradeReportItem` / `TradeReportScope`（`@erp/core/domain`）、类型 `Connection` / `Row`（`./types.ts`）。
- **模块私有**：
  - 行解码：`integer`（`:6-11`，非安全整数抛 `StorageError("STORAGE_FAILURE")`）、`text`（`:12-15`，非字符串同样抛错）、`item`（`:16-39`）；
  - SQL 片段：`paidSum`（`:43-45`，注释 `:40-42`）、`changedFrom`（`:48-51`，注释 `:46-47`）、`changedSum`（`:52-53`）、`bucket`（`:54-56`）；
  - `projection`（`:57-111`）：`shape.detail` 为假时返回聚合形态（`:74-85`，`values` 为 `[cutoff, cutoff, ageingDate, ...scopeValues]`），否则返回明细形态（`:86-110`，`values` 为 8 个 `cutoff`、`ageingDate`、`...scopeValues`）；`:73` 有注释。
- **导出**只有 `tradeReportingRepository(db: Pick<Connection, "query">)`（`:112-255`），返回对象字面量，4 个 `async` 方法简写，源码顺序即键顺序：

  | 键（行） | `db.query` 次数与要点 |
  | --- | --- |
  | `tradeReportStamp` `:114-125` | 1 次，参数 `[company, company, company]`；返回 `journals:actions:settlements`（各经 `integer`） |
  | `tradeReport` `:126-167` | 2 次，依次为分页（明细形态，`where` 为 `AND o.item_id>?`，游标缺省 `""`，末参 `query.limit + 1`）与合计（聚合形态）；`nextCursor`：行数 > `limit` 时为最后一项的 `documentId`，否则 `null`（`:155`）；8 个合计字段经 `integer` |
  | `tradeReportItem` `:168-176` | 1 次（明细形态，`where` 为 `AND o.item_id=?`，范围 `{}`）；无行返回 `null`（`:175`） |
  | `tradeReconciliation` `:177-253` | 1 次（聚合形态，`ageingDate` = `cutoff`），参数为 `p.values`（5 项）后接 13 项（`:221-234`），共 18 项；逐行映射，`:241` 为 D25 注释，`otherSourceMinor` / `tradeDifferenceMinor` / `differenceMinor` 公式见 `:248-250` |

  `git grep -c "db.query(" 3c571b8 -- packages/infra/src/storage/trade-reporting.ts` 为 5。
- **接口**：`packages/core/src/application/trade-reporting.ts:18-34`。
- **使用方**（`git grep -n tradeReportingRepository 3c571b8 -- packages`）：
  - `packages/infra/src/storage/master-data.ts:18` 导入、`:31` 展开（8 个展开中的第 3 个；REFAC-36 的 99 键组合依赖其键序）；
  - `packages/infra/src/legacy/reconcile.ts:13` 导入，`:399-403` 以 `{ async query(sql, values = []) }` 包装构造，`:412` 调用 `tradeReconciliation`（本任务不改 `legacy/`）；
  - `packages/infra/test/application/trade-documents.test.ts:40`、`:105`（`compareWithLegacyReports`）。
- **覆盖它的测试**：`test/application/trade-documents.test.ts`、`test/http/trade-document-guards.test.ts`、`test/legacy-import-execute.test.ts`、`test/support/trade-reporting-legacy.ts`；浏览器场景 `test/support/trade-gui/scenario/adjustments-reports.ts`、`smoke/pages.ts`（`infra-browser`，只在 Full）。Bench `infra/bench/trade-http.ts` 经 HTTP 使用（不改 Bench，不跑 Bench）。
- **文档引用**：`git grep -n -e "storage/trade-reporting.ts" -- docs README.md` 无输出。

## 范围与决定

1. **只拆不改**：SQL 文本、参数数组、调用次数与顺序、返回对象的键与键序、错误类型与 `code` 全部不变；不修缺陷，不调性能。发现疑似缺陷时在 PR 正文记录并报协调者，另开 Backlog。
2. **SQL 不重切**：模板字符串及其插值原样搬移；不得把一个模板拆成多段再拼接，不得改片段常量的内容或调用方式（`paidSum("…")`、`changedSum("…")`、`${bucket}`、`${changedFrom}`、`${scoped}`）。
3. **组合与键序**：`tradeReportingRepository` 的签名（含参数类型 `Pick<Connection, "query">` 与返回类型注解 `TradeReportingRepository`）不变；返回对象的键仍为 `tradeReportStamp`、`tradeReport`、`tradeReportItem`、`tradeReconciliation`，均为自有、可枚举、可写、可配置的数据属性，值为 `AsyncFunction`。允许把某个方法搬到新文件的工厂中，再在原位置以 `...factory(db)` 展开，条件是键序不变（R2）。
4. **单一实现**：`integer`、`text`、`item`、`projection` 与四个 SQL 片段各只有一份实现（R5d）；新文件之间共享它们只能经导入，不得复制。
5. **建议拆法**（不强制）：行解码 `integer` / `text` / `item` → `trade-reporting-rows.ts`；SQL 片段与 `projection`（连同 `:40-47`、`:73` 注释）→ `trade-reporting-projection.ts`；`tradeReconciliation` → `trade-reporting-reconciliation.ts`，以工厂返回 `{ async tradeReconciliation(…) {…} }` 并在 `trade-reporting.ts` 末位展开；行映射（`:236-252`）可再抽为具名函数以降到 60 行以下。
6. **注释随代码原样搬移**：`:40-42`、`:46-47`、`:73`、`:241` 与 SQL 内的 `--` 注释（`:213-215`）。
7. **依赖方向**：新文件不从 `./trade-reporting.ts` 导入运行时值；新文件之间单向无环（R5e）。
8. **不改的路径**：`packages/infra/src/storage/master-data.ts`、`packages/infra/src/storage/types.ts`、`packages/infra/src/legacy/**`、`packages/infra/bench/**`、`packages/infra/test/**`、`packages/core/**`、`packages/web/**`。

## 冲突域

写入域：`packages/infra/src/storage/trade-reporting.ts` 与同目录新增 `trade-reporting-*.ts`（`3c571b8` 上不存在；已有的 `trade-document-*.ts` 不在本域）。与 REFAC-38（web）、REFAC-40（core）无文件交集，可并行（[S31 分道](S31.md)）。

## 验收

### base 失败、head 通过

量法用 [S30 统一量法](S30.md#s30-统一量法)（命令见“可读性”）；base 为最终送审 head 的实际合并基（当前 `3c571b8`）。

| 编号 | 检查 | base `3c571b8` | head 要求 |
| --- | --- | --- | --- |
| R6a | 函数长度（不计空行与纯注释行，外层含内层） | `tradeReportingRepository` **143**（失败） | `trade-reporting.ts` 与新文件中每个函数 ≤ 80 |
| R6b | 嵌套深度 | 最深为 1（已满足） | 每个函数 ≤ 3（保持） |
| R6c | 文件行数（`(Get-Content <file>).Count`） | `trade-reporting.ts` **255** | `trade-reporting.ts` ≤ **100**；新文件各 ≤ **150** |

上表 head 要求都是**硬上限**。`trade-reporting.ts` ≤ 100 由设计角色按决定 5 估定（保留导入、工厂外壳与前三个方法约 75 行），未经试拆实测。实测超出即停下，报设计角色与协调者；不得自行放宽，也不得为凑数字机械拆分。是否调整由 TL 决定，并记入 PR。

### 两侧都须成立的不变量

- **R1 范围**：`git diff --name-only <base>...<head>` 只含 `packages/infra/src/storage/trade-reporting.ts` 与同目录新增的 `trade-reporting-*.ts`；决定 8 所列路径 diff 为空。不加迁移。
- **R2 导出与键**：在 base 与 head 上各：
  - `import * as m from ".../storage/trade-reporting.ts"`，打印 `Object.keys(m).sort()` 与每项 `typeof`（预期只有 `tradeReportingRepository`，为 `function`）；
  - 对只含 `query`（调用即抛错）的普通对象调用 `tradeReportingRepository`，打印 `Object.keys(…)`（4 个，按序）、`Object.getPrototypeOf(…) === Object.prototype`、每个键的属性描述符与值的 `constructor.name`；
  - 对同一对象调用 `masterDataRepository`，打印第 `n` 到 `n + 3` 个键（`n` 为前两个展开工厂键数之和），须为上述 4 个键；
  - 两侧输出逐行相同。`npm run check:boundaries` 通过；新文件的导出只在本任务文件内使用，PR 正文附 `git grep` 结果。
- **R3 既有测试原样通过**：`npx vitest run --project infra --project infra-isolated` 全部通过；测试文件 diff 为空。PR 正文附 base 与 head 各一次的汇总行原文；有失败时逐个列出，并附只对失败文件的串行重跑原文（`--no-file-parallelism`）。
- **R4 返回值、错误与数据库调用序列等价**（送审证据；驱动不提交）：
  - **驱动 A（真实库）**：临时 node / vitest 脚本，在 base 与 head 上用同一份虚构数据建库（临时目录新建 SQLite，跑全部迁移，借用 `test/application/trade-documents.test.ts` 的建库、过账与核销步骤，覆盖发票、贷项、预付、部分核销、反向动作与期初未结项）；从源文件导入 `tradeReportingRepository`，传入委托包装的连接对象，直接调用 4 个方法；固定日期，不用当前时间与随机值。
  - **驱动 B（固定行）**：传入不连库的假连接，按调用序号返回预置行，用于触发解码失败与边界分支（见直接断言 6、7）。
  - **记录规则**：同 REFAC-36 R4：包装对象为普通新对象、逐方法写转发、不用 `Proxy`；调用即记 `{seq, method, args}`，SQL 原样、参数确定性编码（`bigint` 与 `number` 区分）；Promise 记 `pending` → `resolved` / `rejected`；方法结束后无 `pending`；带 REFAC-17 自测（a）–（c）。
  - **每个用例记录**：返回值或错误（构造器名、`code`、全部自有可枚举属性、`message`）与完整调用记录。
  - **用例**至少包含：`tradeReportStamp` 空库与有数据；`tradeReport` 无游标、带游标、`limit` 等于 / 小于 / 大于可见行数、`scope` 为 `{}` / 只带 `party` / 只带 `side` / 两者都带、`ageingDate` 落在每个账龄桶；`tradeReportItem` 存在 / 不存在；`tradeReconciliation` 无期初、有期初、有非贸易来源分录、某控制科目无子账行。构造不出时 PR 正文写明原因并报协调者，不得静默删去。
  - **判定**：base 与 head 每个用例的记录逐字节相同，PR 正文附两侧输出 SHA-256 与比较结果。并且**直接断言**（只比两侧相同不够；预期值由设计角色从 `3c571b8` 源码推出，**未用驱动在 base 上实测**）：
    1. `tradeReportStamp`：恰好 1 次调用，参数 `[company, company, company]`；返回值形如 `<整数>:<整数>:<整数>`。
    2. `tradeReport`：恰好 2 次调用，第 1 次 SQL 以 `WITH balances AS (` 开头、末参为 `limit + 1`，倒数第 2 参为游标（无游标时 `""`）；第 2 次 SQL 以 `WITH aged AS (` 开头、参数前 3 项为 `[cutoff, cutoff, ageingDate]`。
    3. `tradeReport` 分页：可见行数 ≤ `limit` 时 `nextCursor` 为 `null`；> `limit` 时 `items.length === limit` 且 `nextCursor` 为 `items.at(-1).documentId`。
    4. `tradeReportItem`：恰好 1 次调用，末参为 `id`；不存在时返回 `null`。
    5. `tradeReconciliation`：恰好 1 次调用，参数共 18 项，前 3 项为 `[cutoff, cutoff, cutoff]`；每行键序为 `account`、`subledgerMinor`、`glMinor`、`tradeGlMinor`、`openingGlMinor`、`otherSourceMinor`、`tradeDifferenceMinor`、`differenceMinor`，且三项派生值满足 `:248-250` 的公式。
    6. 驱动 B：`tradeReportStamp` 的行中某列为 `2 ** 53`（`number`）或 `"1"`（字符串）时抛 `StorageError`、`code` 为 `STORAGE_FAILURE`；为 `1n`（`bigint`）时成功。
    7. 驱动 B：`tradeReconciliation` 的行中 `account` 为数字时抛 `STORAGE_FAILURE`；`gl` 与 `trade`、`opening` 使 `otherSourceMinor` 超出安全整数时抛 `STORAGE_FAILURE`。
    8. 调用记录中的方法名只有 `query`；只含 `query` 的连接构造不抛错。

    任一直接断言在 base 上不成立，先停下报协调者，**不得**改产品代码迁就断言。
  - **驱动原件**：PR 正文贴原文件字节的 base64，或同时给出原始字节与“UTF-8 解码、换行归一为 LF”两种 SHA-256。
- **R5 结构规则**（静态）：
  - **R5a SQL 与参数原文**：用 `@babel/parser` 抽取 base 与 head 中每个 `*.query(` 调用的第一、二个实参的源文本（不归一空白，含插值表达式），按“所在方法名 + 方法内先后”排序，两侧逐字比较；base 为 5 个调用。另抽取 `projection` 两个返回分支中 `sql` 与 `values` 属性的源文本、四个 SQL 片段常量的初始化源文本，两侧逐字比较。不同即失败。PR 正文附抽取脚本与两侧输出 SHA-256。
  - **R5b 无模块级可变状态**：`trade-reporting.ts` 与新文件顶层只有 `import` / `export`、类型、函数声明与不可变 `const`；不含 `let` 与可变容器；附 Babel AST 检查输出。
  - **R5c 原文搬移**：`integer`、`text`、`item`、`projection` 的函数体与 4 个方法体，base 与 head 逐字比较，只归一缩进；为展开工厂而新增的外壳行逐处列出。不同且未列明即失败。
  - **R5d 单一实现**：在 `packages/infra/src/storage/trade-reporting.ts` 与 `'packages/infra/src/storage/trade-reporting-*.ts'` 范围内用 `git grep -c -F`（各文件之和），两侧相同：`function integer` 1、`function text` 1、`function item` 1、`function projection` 1、`const paidSum` 1、`const changedFrom` 1、`const changedSum` 1、`const bucket` 1、`subledger AS MATERIALIZED` 1、`D25 single rule` 1。
  - **R5e 依赖方向**：新文件不从 `./trade-reporting.ts` 导入运行时值；新文件之间单向无环，`trade-reporting.ts` 位于顶端；附导入图。
- **R6 尺寸**：见上表；PR 正文列出超过 60 行的函数，附行数与最深层数（base 与 head 两列）。
- **R7 打包字节**：不适用。infra 不被 web 导入，不进任何 web chunk，不跑 `bundle-measure.mjs`。编号保留。
- **R8 质量门**：
  - **R8a 合并前**：`npm run typecheck`、`npm run check`（`biome ci`；根 `package.json` 没有 `lint` 脚本）、`npm run check:boundaries`、CI-02 预检通过；PR CI（`ci.yml`）绿。
  - **R8b 合并后（不作合并门）**：第一次覆盖合并提交的 main Full 须绿，含 `infra-browser` 场景；失败时报协调者，按 D456 暂停后续合并。

### 测试命令

```powershell
npx vitest run --project infra packages/infra/test/application/trade-documents.test.ts
npx vitest run --project infra --project infra-isolated
npm run typecheck; npm run check; npm run check:boundaries
```

## 性能考虑

- SQL 文本与参数逐字节不变（R5a），查询计划不变；调用次数与顺序不变（R4）。展开工厂只在构造时多一次对象展开，构造只发生在建仓储时，不在请求路径上重复。
- 不跑 Bench（同 REFAC-26 / 36 的口径）：任何 SQL 差异都使 R5a 失败，故不需要以 Bench 兜底。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥ 与 [S31 共用要求](S31.md#三项-refac-共用可读性与嵌套复验)。PR 正文“可读性”一节按下表逐项给出**改前 / 改后**数据。

| 维度 | 要求 | 改前（`3c571b8`，设计角色实测） | PR 正文改后须列 |
| --- | --- | --- | --- |
| 函数长度（②） | `trade-reporting.ts` 与新文件中每个函数 ≤ 80 | `tradeReportingRepository` 143、`tradeReconciliation` 76、`projection` 54、`tradeReport` 42；其余 ≤ 24 | 量法对 `trade-reporting.ts` 与全部 `trade-reporting-*.ts` 的**完整输出**；超过 60 行的逐个列行数（`tradeReconciliation` 若保持 76 须列出并说明） |
| 嵌套深度（②） | 每个函数 ≤ 3 | `integer`、`text`、`projection`、`tradeReconciliation` 1；其余 0 | 同一输出第 2 列 |
| 文件长度（③） | `trade-reporting.ts` ≤ 100；新文件各 ≤ 150 | `trade-reporting.ts` 255 | `git diff --numstat <base> <head>` 与拆后行数 |
| 重复（④） | 第三次出现即抽取 | 片段已抽为 `paidSum` / `changedSum` / `changedFrom` / `bucket`；`projection` 被调用 4 次（`:127`、`:136`、`:169`、`:178`）；无第三次出现的未抽取片段 | 每处去向（预期“原样保留”）；SQL 内重复不处理（决定 2） |
| 命名（①） | 新函数、新文件名表达业务含义；不用 `step1`、`part2`、`helper`、`utils` | — | 新增名称清单，每个一句职责；附 `git diff --name-only <base>...<head> \| grep -i -E "step[0-9]\|part[0-9]\|helper\|util"` 输出（预期为空） |

### 量法

用 [S30 统一量法](S30.md#s30-统一量法) 的 `s30-measure.cjs`，脚本原文以 S30.md 该节为准。在仓库根目录运行：

```powershell
node <保存位置>\s30-measure.cjs 3c571b8 packages/infra/src/storage/trade-reporting.ts
node <保存位置>\s30-measure.cjs <head> packages/infra/src/storage/trade-reporting.ts @(git diff --name-only --diff-filter=A <base> <head> -- 'packages/infra/src/storage/trade-reporting-*.ts')
```

base 完整输出（`行数 / 层数 / 范围 / 名称`）：

```text
6   1  :6-11     integer
4   1  :12-15    text
24  0  :16-39    item
3   0  :43-45    paidSum
2   0  :52-53    changedSum
54  1  :57-111   projection
143 0  :112-255  tradeReportingRepository
12  0  :114-125  tradeReportStamp
42  0  :126-167  tradeReport
9   0  :168-176  tradeReportItem
76  1  :177-253  tradeReconciliation
```

开发在 base 上重跑的输出与上表不符时，先停下报告。

### 其余各条

- **⑤**：不新增未命名数字；`query.limit + 1` 原样保留。
- **⑥**：注释随代码搬移（决定 6），不新增注释，除非拆分需要说明“为什么”（例如工厂展开为何放在末位）。不留调试输出。

## 用户可见变化

- 无。应收 / 应付报表、单项详情、账龄合计、子账与 GL 核对（含 D25 期初口径）与旧账导入核对的结果都不变（R3、R4）。

## 证据要求

- **原始输出固定**（S30 回顾行动 1）：摘要、哈希与驱动不算原始证据。R2、R3 汇总行、R4 两侧输出、R5 抽取输出与 R6 量法输出的原文，须固定到带修订号的链接（例如 gist 的某个 revision），PR 正文给出链接与该文件的 SHA-256。
- **分支清单**（S30 回顾行动 2）：PR 正文附 base 上的抛错、提前返回与上限分支清单及枚举命令 `git grep -n -e throw -e "return " -e "limit" 3c571b8 -- packages/infra/src/storage/trade-reporting.ts`，并把 R4 用例逐一对到分支：`integer` 抛错（`:9`，直接断言 6、7）、`text` 抛错（`:13`，直接断言 7）、`projection` 聚合 / 明细分支（`:74`，直接断言 2）、`tradeReport` 的 `nextCursor` 两支（`:155`，直接断言 3）、`tradeReportItem` 的 `null` 分支（`:175`，直接断言 4）。无法触发的分支写明原因并报协调者，不得静默删去。
- **QA 留证**（S30 回顾行动 3）：QA 在 base、head 两侧实跑 R3 与 R4 后，在本开发 PR 下发评论（PASS / FAIL、所跑命令、用例数、对比结果）；时点为评审批准后、合并前；未发不合并。
- **可行性**：设计角色在 `3c571b8` 上实测了 R6 的 base 数字与 `db.query(` 计数；R4 直接断言**未实测**，开发先在 base 上跑，不成立时先停下报告。

## 合并后项

- QA 结论（PR 评论链接），见 [S31 执行状态](S31.md#执行状态)。
- Product/Design 在合并提交上用 S30 统一量法复测 `trade-reporting.ts` 与全部 `trade-reporting-*.ts`，确认 main Full（含 `infra-browser`）结果，结论以评论发在开发 PR（S30 回顾行动 4）。

## 设计自查

- [x] 冲突域与 REFAC-38、REFAC-40、KDOC-15 逐文件不相交；不改 `master-data.ts`、`legacy/`、Bench 与测试文件。
- [x] R6a、R6c 有 base 实测值（base 失败）；R6b base 已满足，要求保持；`trade-reporting.ts` ≤ 100 为估定硬上限，超出即停下由 TL 决定。
- [x] SQL 逐字节（R5a）、调用序列与返回 / 错误（R4）、键与键序（R2）、单一实现（R5d）都有命令或产物；D25 核对公式原文锁定。
- [x] 交付清单含 S30 回顾行动 1、2、3；合并后项含行动 4。
- [x] 不加迁移，不跑 Bench，不碰 `scripts/slot/`、`scripts/measure/`。
