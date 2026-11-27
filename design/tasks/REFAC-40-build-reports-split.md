# REFAC-40：拆分报表构建 `buildReports`（不改行为）

- Sprint：S31（[计划](S31.md)）
- 类型：重构（core 领域纯函数；试算、报表分组、利润表、资产负债表、权益汇总、备抵科目与勾稽）
- 优先级：P2
- 决定：[D623](S31.md#s31-期间决定)。REFAC-40 不改行为：导出名与签名、公开推断类型、返回值（含键序与 `-0` 归一）、抛错类型与先后、求值顺序都不变；只搬移与传参。详见“范围与决定”1–8。
- 建议分支：`refac-40-split-build-reports`
- 来源：[S31 范围与验收](S31.md#范围与验收)第 4 行、[三项 REFAC 共用：可读性与嵌套复验](S31.md#三项-refac-共用可读性与嵌套复验)；本任务书不放宽。
- 模板：[REFAC-37](REFAC-37-dimension-rules-split.md)（core 纯函数、R2b 公开类型声明对照、R4 返回值与错误等价、R5 结构规则）。
- 迁移：**不加**。
- 浏览器时段：**不需要**。本项是 core 纯函数，`web/src` 不导入它（见“现状”），等价由 R2b、R3、R4 在 node 中证明。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 为什么是它

- 按 [S30 统一量法](S30.md#s30-统一量法)，`buildReports` **107** 行，是 core 领域中尚未拆分的最长函数之一（S31 计划按 D617 选定）。
- 函数内是一串互不交错的段：度量辅助（`signed` / `category` / `income`）→ 损益与资产负债合计 → 试算 → 报表分组 → 备抵组 → 勾稽 → 组装返回值。按段抽出即可降长，不需要改算法。
- 返回类型未注解，`application/ai-assistant.ts:49` 用 `ReturnType<typeof buildReports>`，所以“公开推断类型不变”必须独立证明（R2b），typecheck 不够。

## 现状（main `3c571b8`）

下文 `file:line` 都按 `3c571b82062a3b599a332defdfa089d1631a402d`（S31 计划 [#471](https://github.com/lingshf/ai-native-erp/pull/471) 合并提交）；`packages/` 与 `67db1e3` 相同（`git diff --stat 67db1e3 3c571b8 -- packages` 无输出）。

- `packages/core/src/domain/reports.ts` 共 **190** 行，最后一次改动为 `9424be8`（[#22](https://github.com/lingshf/ai-native-erp/pull/22)）。
- **导入**：`DomainError` 从 `./index.ts`（定义于 `domain/index.ts:21`）；类型 `Account` / `Company` 从 `./master-data.ts`。`domain/index.ts:240` 以 `export * from "./reports.ts"` 再导出。
- **导出**（运行时 4 个、类型 7 个）：
  - 类型 `TrialStage`（`:4`）、接口 `ReportRow`（`:5-11`）、`ReportSnapshot`（`:16-19`）、`LedgerCursor`（`:150-160`）、`LedgerQuery`（`:161-169`）、`LedgerLine`（`:170-180`）、`LedgerPage`（`:181-190`）；
  - `reportMinor`（`:12-15`，非安全整数抛 `DomainError("INVALID_INPUT")`，`-0` 归一为 `0`）；
  - `checkedReportSnapshot`（`:20-37`，两字段都缺时返回 `latest`（`:24`），非法抛 `INVALID_INPUT`（`:33`），超前或版本不符抛 `CONFLICT`（`:35`））；
  - `reportCheck`（`:40-42`）；
  - `buildReports(company, month, stage, rows, incomeRows = rows)`（`:43-149`），返回类型未注解。
- **模块私有**：`sum`（`:38-39`，`BigInt` 累加后经 `reportMinor`）。
- **`buildReports` 求值顺序**：
  1. 内层 `signed`（`:50-51`）、`category`（`:52-56`）、`income`（`:57-61`）；
  2. `monthly`（`:62`，用 `incomeRows`）、`rawProfit`（`:63`，用 `rows`）、`ytd`（`:64`，用 `incomeRows`）；
  3. `incomeByCode`（`:65`）与内层 `activity`（`:66-70`，代码缺失抛 `INVALID_INPUT`，`:68`）；
  4. `cumulative`、`assets`、`liabilities`、`capitalAndRetained`、`equity`、`opening`、`movements`（`:71-79`）；
  5. `trial`（`:80-87`）；6. `groups`（`:88-105`，按 `reportGroup` 去重排序，`category` 取组内第一行）；7. `contraGroups`（`:106-121`，内层 `measure` `:110-111`）；8. `checks`（`:122-127`）；
  9. 返回对象（`:128-148`），键序 `company`、`month`、`currency`、`scale`、`stage`、`basis`（`"current-account-configuration" as const`）、`trial`、`groups`、`income`、`balanceSheet`、`equitySummary`、`contraGroups`、`reconciliation`。
- **使用方**：
  - `packages/core/src/application/reports.ts:3-5`、`:60`、`:68`、`:84`、`:87-89`、`:99-101`；
  - `packages/core/src/application/ai-assistant.ts:6`、`:49`（`ReturnType<typeof buildReports>`）、`:138`；
  - `packages/infra/src/storage/report-balances.ts`、`report-ledger-items.ts`、`report-ledger.ts`、`report-stages.ts`（`reportMinor`、`checkedReportSnapshot`）；
  - `packages/web/test/ledger-reports.test.tsx:4`、`:60`、`:109`、`:171`，`packages/web/test/period-close.test.tsx:5`、`:108`（测试直接调用）。
  - `packages/web/src` 不导入 `@erp/core/domain` 或 `@erp/core/application`（`git grep -n -e "@erp/core/domain" -e "@erp/core/application" 3c571b8 -- packages/web/src` 无输出），故不进任何 web chunk。
- **测试**：core 下没有直接测试 `reports.ts` 的文件；覆盖它的是 `packages/infra/test/application/reports.test.ts` 与上列两个 web 测试。
- **文档引用**：`git grep -n -e "domain/reports.ts" -- docs README.md` 无输出。

## 范围与决定

1. **只拆不改**：算法、取整与 `-0` 归一、`BigInt` 累加、排序、抛错类型与 `code`、返回键与键序都不变；不修缺陷。发现疑似缺陷时在 PR 正文记录并报协调者，另开 Backlog。
2. **求值顺序不变**：上节 1–9 的顺序不变；抽出的函数在 `buildReports` 中的调用位置与原段位置相同。`activity` 的首次调用仍发生在 `trial` 段（使代码缺失时的抛错时点不变）。
3. **签名不变**：`buildReports` 的参数名、顺序、类型与默认值 `incomeRows = rows` 不变（`buildReports.length` 两侧都为 4）；不加返回类型注解（加注解会改变 `.d.ts`，由 R2b 判定，不作为豁免）。
4. **传参代替闭包**：抽出的函数以参数接收 `rows`、`incomeRows`、`activity` 等原自由变量；为此改动的位置在 R5a 中逐处列出。
5. **建议拆法**（不强制）：度量辅助 `signed` / `category` / `income` → `report-measures.ts`；`trial`、`groups`、`contraGroups` 三段 → `report-sections.ts`；`checks` 与返回对象留在 `buildReports`。
6. **文件与依赖**：新文件为同目录 `report-*.ts`；不加入 `domain/index.ts`（新文件的导出只在本任务文件内使用）。新文件不从 `./reports.ts` 导入运行时值；若需 `reportMinor` 或 `sum`，可把其定义移到新文件，`reports.ts` 以 `export { … } from` 再导出（导出名集合不变，`.d.ts` 差异由 R2b 处理）。新文件可与 `reports.ts` 一样从 `./index.ts` 导入 `DomainError`（既有模式），但不得在模块加载时调用任何导入的函数（R5b）。
7. **类型声明位置**：`ReportRow`、`TrialStage` 等导出类型的定义留在 `reports.ts`；新文件只以 `import type` 引用，不产生运行时依赖。
8. **不改的路径**：`packages/core/src/domain/index.ts`、`packages/core/src/application/**`、`packages/infra/**`、`packages/web/**`、`packages/core/test/**`。

## 冲突域

写入域：`packages/core/src/domain/reports.ts` 与同目录新增 `report-*.ts`（`3c571b8` 上不存在；`domain/trade-reporting.ts` 不在本域）。与 REFAC-38（web）、REFAC-39（infra）无文件交集，可并行（[S31 分道](S31.md)）。

## 验收

### base 失败、head 通过

量法用 [S30 统一量法](S30.md#s30-统一量法)（命令见“可读性”）；base 为最终送审 head 的实际合并基（当前 `3c571b8`）。

| 编号 | 检查 | base `3c571b8` | head 要求 |
| --- | --- | --- | --- |
| R6a | 函数长度（不计空行与纯注释行，外层含内层） | `buildReports` **107**（失败） | `reports.ts` 与新文件中每个函数 ≤ 80 |
| R6b | 嵌套深度 | 最深为 `buildReports` 2（已满足） | 每个函数 ≤ 3（保持） |
| R6c | 文件行数（`(Get-Content <file>).Count`） | `reports.ts` **190** | `reports.ts` ≤ **150**；新文件各 ≤ **150** |

上表 head 要求都是**硬上限**。`reports.ts` ≤ 150 由设计角色按决定 5 估定（移出约 55 行后约 135 行），未经试拆实测。实测超出即停下，报设计角色与协调者；不得自行放宽，也不得为凑数字机械拆分。是否调整由 TL 决定，并记入 PR。

### 两侧都须成立的不变量

- **R1 范围**：`git diff --name-only <base>...<head>` 只含 `packages/core/src/domain/reports.ts` 与同目录新增的 `report-*.ts`；决定 8 所列路径 diff 为空。不加迁移。
- **R2 导出不变**：用 `@babel/parser`（插件 `typescript`）解析：`reports.ts` 的导出名集合（运行时 4 个、类型 7 个）与 base 相同，签名源文本相同（只归一空白；再导出的函数比定义处）；base 与 head 上各用 node 导入 `@erp/core/domain`，打印排序后的 `Object.keys`，两侧相同；`buildReports.length` 两侧都为 4。新文件导出只在本任务文件内使用，PR 正文附 `git grep` 结果。`npm run typecheck`、`npm run check`、`npm run check:boundaries` 通过。typecheck 只说明现有消费者能编译，不能证明推断出的公开类型不变，公开类型由 R2b 单独证明。
- **R2b 公开类型声明对照**（送审证据，产物与临时文件不提交）：方法同 [REFAC-37 R2b](REFAC-37-dimension-rules-split.md#两侧都须成立的不变量)，把文件换为 `packages/core/src/domain/reports.ts`：
  - **生成**：base 与 head 用同一份仓库外的临时 tsconfig 各运行一次 `npx tsc -p <该文件>`，退出码须为 0；tsconfig 为 `extends` 仓库根 `tsconfig.base.json`、`files` 只列 `packages/core/src/domain/reports.ts`、`noEmit: false`、`declaration: true`、`emitDeclarationOnly: true`、`types: []`、`rootDir` 为仓库 `packages`、`outDir` 为仓库外新目录（两侧各一个）。
  - **比较**：两侧 `core/src/domain/reports.d.ts` 逐字节相同即通过。
  - **不同时**（例如决定 6 的再导出），按 REFAC-37 R2b 第 1–6 步对两侧**源码**做双向严格相等检查：`Eq<typeof B.x, typeof H.x>` 4 次（运行时导出）、`Eq<B.T, H.T>` 7 次（导出类型）、另加 `Eq<ReturnType<typeof B.buildReports>, ReturnType<typeof H.buildReports>>` 与 `Eq<Parameters<typeof B.buildReports>, Parameters<typeof H.buildReports>>` 各 1 次；编译退出码须为 0。反例：把 base 副本中返回对象的 `basis` 去掉 `as const`（或把 `groups` 元素的 `category` 改为 `string`），`ReturnType` 一条须报 TS2344。送审前删除临时目录，`git status` 中不得残留。
  - **PR 正文附**：tsconfig 原文、两次生成的命令与退出码、两侧 `reports.d.ts` 的 SHA-256 与 diff（相同时写“无差异”）；不同时另附检查文件原文、tsconfig、编译输出与反例输出。
  - **可行性**：设计角色在 `packages/` 与 `3c571b8` 相同的工作树上实测声明生成：退出码 0，`reports.d.ts` 共 147 行，`buildReports` 返回类型完整展开；Windows 上 SHA-256 为 `f2335acf839d2a2a2d721075c314a3addb57a84522d919ebc586bc1cc62397c9`（换行符随平台不同，两侧须在同一平台生成）。源码双向检查与反例**未实测**。
- **R3 既有测试原样通过**：`npx vitest run --project core` 全部通过；另跑 `npx vitest run --project infra packages/infra/test/application/reports.test.ts` 与 `npx vitest run --project web packages/web/test/ledger-reports.test.tsx packages/web/test/period-close.test.tsx`；测试文件 diff 为空。PR 正文附汇总行原文，base 与 head 各一次。
- **R4 返回值与错误等价**（送审证据，驱动不提交）：
  - **驱动**：临时 vitest 文件（例如 `packages/core/test/zz-r40-probe.test.ts`，送审前删除），在 base 与 head 上从 `../src/domain/index.ts` 导入，同一组虚构输入直接调用 `buildReports`、`reportMinor`、`checkedReportSnapshot`、`reportCheck`。
  - **记录与编码**：同 REFAC-17 R4（构造器名、`code`、全部自有可枚举属性、`message`；返回值确定性 JSON 编码），**另须区分 `-0`**（`JSON.stringify` 会把 `-0` 写成 `0`，编码时以 `Object.is(v, -0)` 标记）；带其自测（含一条 `-0` 自测）；同一驱动连续两次运行输出逐字节相同。
  - **用例**至少包含：空 `rows`；含 5 种类别（ASSET / LIABILITY / EQUITY / REVENUE / EXPENSE）、多个 `reportGroup` 与 `normalSide` 反常余额的科目表；`incomeRows` 省略与显式传入不同的值；含 `contraOf` 的备抵科目（资产类与损益类各一）；四项勾稽各有通过与不通过；`incomeRows` 缺少某个代码；任一金额或合计超出安全整数；`checkedReportSnapshot` 的五条分支（`:24`、`:33` 的每个条件、`:35` 两个条件）与正常返回；`reportMinor(-0)`。
  - **判定**：两侧每个用例记录逐字节相同（附两侧输出 SHA-256）；并且**直接断言**：
    1. **空输入**（设计角色在 `3c571b8` 工作树上用 node 临时脚本实测，脚本未落盘）：`buildReports({ code: "C1", currency: "CNY", scale: 2, year: 2026, name: "x" }, "2026-01", "unadjusted", [])` 的 JSON 为 `{"company":"C1","month":"2026-01","currency":"CNY","scale":2,"stage":"unadjusted","basis":"current-account-configuration","trial":{"rows":[],"debit":0,"credit":0},"groups":[],"income":{"month":{"revenue":0,"expense":0,"profit":0},"ytd":{"revenue":0,"expense":0,"profit":0}},"balanceSheet":{"assets":0,"liabilities":0,"capitalAndRetained":0,"currentEarnings":0,"equity":0},"equitySummary":{"opening":0,"movements":0,"profit":0,"closing":0},"contraGroups":[],"reconciliation":{"checks":[{"id":"trial","left":0,"right":0,"difference":0,"pass":true},{"id":"balanceSheet","left":0,"right":0,"difference":0,"pass":true},{"id":"equitySummary","left":0,"right":0,"difference":0,"pass":true},{"id":"profit","left":0,"right":0,"difference":0,"pass":true}],"allPass":true}}`；
    2. **缺少损益行**（实测）：`incomeRows` 比 `rows` 少一个代码时抛 `DomainError`、`code` 为 `INVALID_INPUT`、`message` 为 `Invalid projection input.`；
    3. **溢出**（实测）：同一类别两行 `closing` 均为 `Number.MAX_SAFE_INTEGER` 时抛 `DomainError` / `INVALID_INPUT`；
    4. **键序**：返回对象 `Object.keys` 为上节第 9 步所列 13 个键，依次相同；`trial.rows` 每项在原科目字段之后依次为 `incomeNet`、`normalBalance`、`abnormal`；
    5. **分组**：`groups` 按 `reportGroup` 字符串升序；`category` 取组内第一行；收入 / 费用类的 `activity` 取 `incomeRows` 中同代码行的 `debit - credit`；
    6. **备抵**：某资产科目 `A` 有子科目 `contraOf: "A"`，`contraGroups` 只含 `A` 一项，`net` 为 `gross - contra`，`accounts` 为子科目代码按原行序；
    7. **`-0` 归一**：`reportMinor(-0)` 返回 `+0`（`Object.is(…, 0)` 为真）；`normalSide` 为 `CREDIT` 且 `closing` 为 0 的科目，其 `normalBalance` 为 `+0`、`abnormal` 为 `false`。
    断言 4–7 由设计角色从源码推出，**未用驱动在 base 上实测**；base 上任一直接断言不成立，先停下报协调者，不得改断言迁就，也不得改产品代码。
  - **驱动原件**：PR 正文贴原文件字节的 base64，或同时给原始字节与“UTF-8 解码、换行归一为 LF”两种 SHA-256。
- **R5 结构规则**（静态）：
  - **R5a 原文搬移**：`signed`、`category`、`income`、`activity` 的函数体，`trial`、`groups`、`contraGroups`、`checks` 的初始化表达式，与返回对象字面量，base 与 head 逐字比较（只归一缩进）；为传参改自由变量的地方逐处列表（决定 4）。不同且未列明即失败。
  - **R5b 无模块级可变状态**：`reports.ts` 与新文件的模块顶层只有 `import` / `export`、类型与接口、函数声明与不可变 `const`（不含 `let`、可变容器，不在加载时调用导入的函数）；附 Babel AST 检查输出。
  - **R5c 错误调用点不变**：`new DomainError(` 的实参原文多重集两侧相同（base 4 处：`:13`、`:33`、`:35`、`:68`；按 `git grep -n "new DomainError(" 3c571b8 -- packages/core/src/domain/reports.ts` 计得）；`reportMinor(` 调用的多重集两侧相同（定义行除外），Babel AST 抽取，附两侧列表。
  - **R5d 依赖方向**：新文件不从 `./reports.ts` 导入运行时值（`import type` 允许）；新文件之间单向无环；附导入图。
- **R6 尺寸**：见上表；PR 正文列出超过 60 行的函数，附行数与最深层数（base 与 head 两列）。
- **R7 打包字节**：不适用。`web/src` 不导入 core 领域（见“现状”），不进任何 web chunk，不跑 `bundle-measure.mjs`。编号保留。
- **R8 质量门**：R8a 合并前 `npm run typecheck`、`npm run check`、`npm run check:boundaries`、CI-02 预检通过，PR CI 绿；R8b 合并后第一次覆盖该合并提交的 main Full 须绿，失败报协调者，按 D456 暂停后续合并。

### 测试命令

```powershell
npx vitest run --project core
npx vitest run --project infra packages/infra/test/application/reports.test.ts
npx vitest run --project web packages/web/test/ledger-reports.test.tsx packages/web/test/period-close.test.tsx
npm run typecheck; npm run check; npm run check:boundaries
```

`3c571b8` 的根 `package.json` 没有 `lint` 脚本，Biome 检查用 `npm run check`（`biome ci`）。

## 性能考虑

- 算法与遍历次数不变（决定 1、2）；抽出的函数以参数代替闭包，只多函数调用开销，`rows` 规模为科目数（百级），可忽略。
- 不跑 Bench；core 不进 web chunk，无打包变化。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥ 与 [S31 共用要求](S31.md#三项-refac-共用可读性与嵌套复验)。PR 正文“可读性”一节按下表逐项给出**改前 / 改后**数据。

| 维度 | 要求 | 改前（`3c571b8`，设计角色实测） | PR 正文改后须列 |
| --- | --- | --- | --- |
| 函数长度（②） | `reports.ts` 与新文件中每个函数 ≤ 80 | `buildReports` 107；其余 ≤ 18 | 量法对 `reports.ts` 与全部 `report-*.ts` 的**完整输出**；超过 60 行的逐个列行数 |
| 嵌套深度（②） | 每个函数 ≤ 3 | `buildReports` 2；`reportMinor`、`checkedReportSnapshot`、`sum`、`category`、`activity` 1；其余 0 | 同一输出第 2 列；超过 2 层的逐个说明 |
| 文件长度（③） | `reports.ts` ≤ 150；新文件各 ≤ 150 | `reports.ts` 190 | `git diff --numstat <base> <head>` 与拆后行数 |
| 重复（④） | 第三次出现即抽取 | `["REVENUE", "EXPENSE"].includes(… .category) ? activity(…) : …` 2 处（`:98`、`:111`）；`rows.filter((child) => child.contraOf === row.code)` 形态 2 处（`:107`、`:109`）；`category("EQUITY", …)` 3 处（`:74`、`:77`、`:79`，度量不同，已共用 `category`，保留） | 每处去向 |
| 命名（①） | 新函数、新文件名表达业务含义；不用 `step1`、`part2`、`helper`、`utils` | — | 新增名称清单，每个一句职责；附 `git diff --name-only <base>...<head> \| grep -i -E "step[0-9]\|part[0-9]\|helper\|util"` 输出（预期为空） |

### 量法

用 [S30 统一量法](S30.md#s30-统一量法) 的 `s30-measure.cjs`，脚本原文以 S30.md 该节为准。在仓库根目录运行：

```powershell
node <保存位置>\s30-measure.cjs 3c571b8 packages/core/src/domain/reports.ts
node <保存位置>\s30-measure.cjs <head> packages/core/src/domain/reports.ts @(git diff --name-only --diff-filter=A <base> <head> -- 'packages/core/src/domain/report-*.ts')
```

base 完整输出（`行数 / 层数 / 范围 / 名称`）：

```text
4   1  :12-15    reportMinor
18  1  :20-37    checkedReportSnapshot
2   1  :38-39    sum
3   0  :40-42    reportCheck
107 2  :43-149   buildReports
2   0  :50-51    signed
5   1  :52-56    category
5   0  :57-61    income
5   1  :66-70    activity
2   0  :110-111  measure
```

开发在 base 上重跑的输出与上表不符时，先停下报告。

### 其余各条

- **②**：拆后 `buildReports` 只做“度量与合计 → 调用试算、分组、备抵三段 → 勾稽 → 组装返回值”。
- **⑤**：不新增未命名数字。
- **⑥**：不新增注释，除非拆分需要说明“为什么”（例如为何 `activity` 仍在试算段首次调用）。不留调试输出。

## 用户可见变化

- 无。试算表、报表分组、利润表、资产负债表、权益汇总、备抵组、勾稽结果与 AI 助手引用的报表数据都不变（R2b、R3、R4）。

## 证据要求

- **原始输出固定**（S30 回顾行动 1）：摘要、哈希与驱动不算原始证据。R2 / R2b 输出、R3 汇总行、R4 两侧输出、R5 抽取输出与 R6 量法输出的原文，须固定到带修订号的链接（例如 gist 的某个 revision），PR 正文给出链接与该文件的 SHA-256。
- **分支清单**（S30 回顾行动 2）：PR 正文附 base 上的抛错与提前返回清单及枚举命令 `git grep -n -e throw -e "return " 3c571b8 -- packages/core/src/domain/reports.ts`，并把 R4 用例逐一对到分支：`reportMinor` 抛错（`:13`，断言 3）与 `-0` 归一（`:14`，断言 7）、`checkedReportSnapshot` 的 `:24` 提前返回、`:33` 与 `:35` 抛错、`:36` 正常返回、`activity` 抛错（`:68`，断言 2）。无法触发的分支写明原因并报协调者，不得静默删去。
- **QA 留证**（S30 回顾行动 3）：QA 在 base、head 两侧实跑 R3 与 R4 后，在本开发 PR 下发评论（PASS / FAIL、所跑命令、用例数、对比结果）；时点为评审批准后、合并前；未发不合并。
- **可行性**：设计角色在 `3c571b8` 上实测了 R6 的 base 数字、R2b 的声明生成与 R4 直接断言 1–3；其余直接断言与 R2b 源码双向检查**未实测**，开发先在 base 上跑，不成立时先停下报告。

## 合并后项

- QA 结论（PR 评论链接），见 [S31 执行状态](S31.md#执行状态)。
- Product/Design 在合并提交上用 S30 统一量法复测 `reports.ts` 与全部 `report-*.ts`，确认 main Full 结果，结论以评论发在开发 PR（S30 回顾行动 4）。

## 设计自查

- [x] 冲突域与 REFAC-38、REFAC-39、KDOC-15 逐文件不相交；不改 `domain/index.ts`、`application/`、infra、web 与测试文件。
- [x] R6a、R6c 有 base 实测值（base 失败）；R6b base 已满足，要求保持；`reports.ts` ≤ 150 为估定硬上限，超出即停下由 TL 决定。
- [x] 公开推断类型由 R2b 独立证明（声明生成已实测）；返回值、`-0`、键序与抛错由 R4 直接断言；求值顺序由决定 2 与 R5a 约束。
- [x] 交付清单含 S30 回顾行动 1、2、3；合并后项含行动 4。
- [x] 不加迁移，不跑 Bench，不碰 `scripts/slot/`、`scripts/measure/`。
