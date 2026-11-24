# REFAC-20：拆分 `buildJournalPlan`（不改行为）

- Sprint：S24（[计划草案](S24.md)）　类型：重构（core 领域函数）　优先级：P2　决定：[D536](S24.md#s24-期间决定)（只改代码组织、不改行为与错误先后；见“范围与决定”1–7）　建议分支：`refac-20-split-journal-plan`
- 来源：[S24 候选](S24.md#候选s24-其余泳道s23-评审后定)“按 ② 拆 core / infra”。验收沿用 [REFAC-17](REFAC-17-prepare-trade-action-split.md) 的“非页面 R4”结构；#335 已跑通该方法。本任务的被测对象是**纯函数**（不访问仓储、数据库或时钟），R4 直接调用、比较返回值与错误，不需要委托包装对象。
- 迁移：**不加**。浏览器时段：**不需要**（理由见“证据要求”）。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 为什么是它

- 设计角色在 `f3a7646` 上用 `node files/fnlen.cjs packages/core/src` 实测，core 领域中超过 ② 上限最多的是 **`buildJournalPlan`（253 行）**，其内部函数 `business` 也有 84 行。它是所有过账（手工分录、反向、替换、重分类、历史导入、贸易与期末结账生成的分录）共用的计划构建入口，读者最常需要读它。
- **纯函数**：输入是一个对象，输出是 `JournalPlan` 或抛出 `DomainError`；不读写数据库、不取当前时间。等价可以直接用“同一输入 → 同一输出或同一错误”证明，取证成本是本批三项中最低的。
- 不是页面拆分，不占“同一时间只有一个页面拆分在途”的名额；`packages/web/src` 不导入 `@erp/core/domain`（`git grep` 计数 0），不进任何打包产物。
- 冲突域与同批任务不相交：REFAC-18 只改 `packages/web/src/`，REFAC-19 只改 `packages/infra/src/storage/`（见“冲突域”）。

## 现状（main `f3a7646`）

下文 `file:line` 都按 `f3a764636a39ea8c2e9622b8e9f9782f16aa076a`。

- `packages/core/src/domain/journals.ts` 共 465 行。运行时导出：`journalError`（`:36`，返回类型 `never`）、`checkedJournalId`（`:150`）、`checkedJournalDraft`（`:157`）、`journalDates`（`:181`）、`checkedJournalDay`（`:204`）、`buildJournalPlan`（`:212–465`）；另有若干导出类型（`JournalDraft`、`JournalLine`、`PlannedJournal`、`JournalPlan` 等）。模块内私有函数 `amount`（`:187`）与 `totals`（`:194`）被 `buildJournalPlan` 使用（`:304–305`、`:320`、`:364`、`:371`）。文件从 `./index.ts` 导入领域工具（`:1–14`），`domain/index.ts:3` 又以 `export * from "./journals.ts"` 再导出——这是现有的导入环。
- 设计角色用 `node files/fnlen.cjs packages/core/src/domain` 实测（只列本文件）：

  ```text
  253	packages/core/src/domain/journals.ts:212-465	buildJournalPlan
  84	packages/core/src/domain/journals.ts:283-366	business
  ```

- **`buildJournalPlan(input)` 的顺序**（R4 的错误先后用例专门覆盖）：
  1. 参数类型（`:212–227`）是内联对象类型，含可选的 `adapter`（`module`、`controlModules`、`periodModules`）；
  2. 解构与 `historicalImport = input.adapter?.module === "LEGACY"`（`:228–229`）；草稿形状（`checkedJournalDraft`，历史导入上限 2000 行，否则 500）、`sourceRef` / `memo`、记账日、单据日、税务日、期间与模块期间检查（`:230–239`）；
  3. `accounts` Map（`:240`）；`compiled`（`:241–249`，历史导入时把维度与值配置视为启用）；`balance` 配置（`:250–252`）；
  4. 内部函数 `resolve`（`:253–282`：解析维度、超过 32 个维度报错、把维度错误路径改写为 `lines.${index}.…`）与 `business`（`:283–366`：逐行校验科目、手工 / 控制科目、暂记、金额；`totals`；平衡维度候选与补平行；再 `totals`）；`spec`（`:367–371`）；
  5. `operation === "journal"` 时 `[spec(business(), "normal")]`（`:373`）；否则更正分支（`:374–444`）：来源检查（`:375–383`）→ 更正链 `active` Map 与“已更正”冲突（`:384–392`）→ `latestDate` 与日期检查（`:393–397`）→ 注释 `// D6: …`（`:398`）与镜像行 `reversed`（`:399–409`）→ 镜像自检（`:410–420`）→ `reverse`（`:421`）；`replace` / `reclassify` 才调用 `business()`（`:423`），**在镜像检查之后**；重分类的经济金额比较（`:427–431`）与分组（`:432–441`）；
  6. 累计发生额上限（`:445–448`）；返回 `JournalPlan`（`:449–464`，键顺序固定）。
- **调用方**：`packages/core/src/application/journals.ts:3,192`；该文件 `:171`、`:229`、`:246` 用 `Parameters<typeof buildJournalPlan>[0]["adapter"]` 取参数类型——参数类型的源文本须保持不变（R2）。`core/test/domain/journals.test.ts:32` 也用 `Parameters<typeof buildJournalPlan>[0]`。
- **测试**：`packages/core/test/domain/journals.test.ts`（94 行，1 个用例）直接调用；`packages/infra/test/application/journals.test.ts` 与 `business-events`、`period-close`、`trade-documents`、`legacy-import` 等 infra 测试经 `JournalService` 间接覆盖。
- 文件中唯一的注释是 `:398` 的 `// D6: mirror immutable evidence; current defaults/availability must not prevent undoing history.`

### chunk 归属与首屏（S22 回顾行动 3）

| 文件 | 落在哪个 chunk | 依据 |
| --- | --- | --- |
| `packages/core/src/domain/journals.ts`（改）与新文件 | **不进任何 web chunk** | `packages/web/src` 不导入 `@erp/core/domain` 或 `@erp/core/application`（`git grep` 计数 0）；web 只用 `@erp/core/contracts`，后者只导入 `zod` 与同目录文件 |
| 首屏 | **±0** | 同上；由 R7 的构建测量确认 |

## 范围与决定

1. **不改行为与错误先后**（D536）。对任何输入，返回的 `JournalPlan`（键、值、键顺序、数组顺序）与抛出的错误（构造器、`code`、`issue` 全部字段、`message`）都不变；同一输入同时违反多条规则时，**先报的那条不变**。只改代码组织，不修 bug；拆分时发现的疑似缺陷登记在 PR 正文，留作后续任务。
2. **导出与类型不动**：`journals.ts` 的运行时导出集合与导出类型集合不变；`buildJournalPlan` 的参数类型（`:212–227` 的内联对象类型）与返回类型的源文本不变（只归一空白），`Parameters<typeof buildJournalPlan>[0]["adapter"]` 在调用方照常解析。可以为参数类型新增一个**不导出**的别名，但 R2 比较的是展开后的源文本；最简单的做法是参数类型原样留在原处。`@erp/core/domain` 的再导出集合不变（R2）。
3. **拆分方式**：
   - `buildJournalPlan` 保留在 `journals.ts`，只做“检查 → 准备上下文 → 按 `operation` 分派 → 发生额上限 → 组装返回值”的编排，≤ 80 行；
   - `resolve`、`business`（及其中的平衡维度补行）、更正分支（来源检查、更正链、镜像行与镜像自检、`reverse` / `replace` / `reclassify` 三种输出）可以各成为顶层函数，以一个只读上下文对象或显式参数传递 `draft`、`company`、`input`、`accounts`、`compiled`、`balance`、`historicalImport`；不得用模块级可变变量传递（R5b）；
   - `business` 拆后 ≤ 80 行（例如把逐行校验与平衡维度补行分开）；
   - **错误先后**：更正分支中 `business()` 仍在镜像自检之后调用；`totals` 的两次调用位置（逐行之后、补平行之后）不变；`resolve` 对补平行仍以 `lines.length` 为索引、以 `{}` 为表头维度。
4. **私有工具**：`amount`、`totals` 可以原样搬到新文件并导出给本任务的文件使用；`journalError`、`checkedJournalDay` 等现有导出仍由 `journals.ts` 导出——若新文件需要它们，二选一：定义留在 `journals.ts`、新文件以 `import` 引用（形成运行时导入环，见决定 6 的限制），或定义搬到新文件、`journals.ts` 以 `export { … } from` 再导出，并在 R2 中证明导出集合不变。
5. **注释与字面量**：`// D6: …` 注释随镜像行代码一起搬移，原文不变，仍紧贴 `reversed` 的定义之前。`2000`、`500`、`32`、`0n`、`"LEGACY"` 等都是规则值；本任务**不**新增具名常量，原文不变。
6. **文件**：新文件放在 `packages/core/src/domain/`（平铺结构，不新建子目录），以 `journal-plan-` 开头按职责命名（例如 `journal-plan-lines.ts`、`journal-plan-corrections.ts`），不得与该目录现有文件重名。新文件**不**加入 `domain/index.ts` 的再导出；它们导入领域工具时沿用 `journals.ts` 的写法（从 `./index.ts` 导入）或从定义该工具的文件导入；新文件的模块顶层不得在加载时调用任何导入的函数（R5b），以免受导入环的加载顺序影响。
7. **不改**：
   - `packages/core/src/domain/` 下其他现有文件（含 `index.ts`、维度与期间相关文件）；`packages/core/src/application/**`（含 `journals.ts`）、`packages/core/src/contracts/**`；
   - `packages/core/test/**`、`packages/infra/**`、`packages/web/**`；
   - `scripts/**`（含 `scripts/slot/`、`scripts/measure/`）、`scripts/test-shard-weights.json`、`package.json` / lock、`vitest.config.ts`。

## 冲突域

- core-domain:journals：只改 `packages/core/src/domain/journals.ts`，并新增同目录下 `journal-plan-*.ts`（决定 6）。
- 取证所需的观测点和新增测试文件：无（R4 驱动不提交）。
- 受影响的 e2e 断言（S13 回顾行动 1）：所有过账场景（手工分录、更正、贸易单据、期末结账、导入）**必须继续成立**；合并前由 R3 与 R4 保证，合并后由 R8b 的 main Full 复核；**须随本任务改**：无。
- 受影响的文档引用（D460）：`git grep -n -F "journals.ts" -- docs design` 在 `f3a7646` 上命中 24 行，都是当时的事实记录，不改。
- 与同批任务不相交：REFAC-18 只改 `packages/web/src/TradeMaster.tsx` 与 `trade-master/`；REFAC-19 只改 `packages/infra/src/storage/reports.ts` 与同目录 `report-*.ts`。三者没有共享文件；本任务与 REFAC-19 都会运行 `infra` 项目的测试（R3），但都不改测试文件。

## 验收

### base 失败、head 通过

| 编号 | 检查 | base `f3a7646` | head 要求 |
| --- | --- | --- | --- |
| R6a | `node fnlen.cjs packages/core/src/domain`（口径同 S16–S24）中 `buildJournalPlan` 与 `business` 的行数 | **253** 与 **84**（失败） | 两者（或其替代函数）都 ≤ 80，且本任务新增或改动的函数都 ≤ 80 |
| R6b | `journals.ts` 的总行数（`(Get-Content <file>).Count`） | **465**（失败，③ 热点） | ≤ 300；新文件各 ≤ 200 |

### 两侧都须成立的不变量

- **R1 范围**：`git diff --name-only <base> <head>` 只含 `packages/core/src/domain/journals.ts` 与同目录新增的 `journal-plan-*.ts`；决定 7 所列文件的 diff 为空。不加迁移。
- **R2 导出不变**：用 `@babel/parser`（插件 `typescript`）解析，口径同 REFAC-14 R2：`journals.ts` 的导出名集合（运行时与类型）与 base 相同；`buildJournalPlan` 的参数类型与返回类型源文本相同（只归一空白）；在 base 与 head 上各用 node 导入 `@erp/core/domain`，打印 `Object.keys` 排序结果，两侧相同。新文件的导出只在本任务文件内使用，PR 正文附 `git grep` 结果。`npm run typecheck`（含 `application/journals.ts` 的 `Parameters<…>` 用法）与 `npm run check:boundaries` 通过。
- **R3 既有测试原样通过**：`npx vitest run --project core --project infra --project infra-isolated` 全部通过；测试文件 diff 为空。PR 正文附汇总行原文，base 与 head 各一次；有失败时逐个列出，并附只对失败文件的串行重跑原文（`--no-file-parallelism`）。
- **R4 返回值与错误等价**（送审证据，驱动不提交，不加常驻 CI 用例）：
  - **驱动**：临时 node / vitest 脚本，在 base 与 head 上从源文件导入 `buildJournalPlan`，用同一组虚构输入（可借用 `core/test/domain/journals.test.ts` 的 `defaultAccounts` 与草稿构造）逐个直接调用。被测函数是纯函数，**不需要**委托包装对象；但若驱动为输入中的函数或对象加包装（例如统计 `catalog` 被读取的次数），须照 [REFAC-17 R4](REFAC-17-prepare-trade-action-split.md#两侧都须成立的不变量)用普通的委托对象、不用 `Proxy`。
  - **记录与编码**（复用 REFAC-17）：每个用例记录返回值（确定性 JSON 编码，`Set`、`Map`、`bigint`、`undefined`、`Date`、函数按 REFAC-17 的规则编码）或抛出的错误（构造器名、`code`、`issue` 的全部字段、`message`）；同一驱动连续两次运行的输出逐字节相同。驱动须带 REFAC-17 的自测（a），并加一条：`encode({ k: undefined })` 与 `encode({})` 不同；若驱动用了委托包装对象，还须带自测（b）（c）。任一自测失败即 R4 失败。
  - **用例**至少包含：
    - 成功路径：`journal`（普通科目、暂记科目、控制科目 + `adapter.controlModules`、带表头维度与行维度、平衡维度自动补行）；`reverse`；`replace`；`reclassify`（经济金额相同）；对重分类结果再 `reverse`；`historicalImport`（`adapter.module = "LEGACY"`：停用科目、停用维度配置、不允许手工的科目都可用；行数上限 2000）；`adapter.periodModules`；
    - 每个 `journalError` 调用点至少一个失败用例：`sourceRef` / `memo` 为空白、三种日期非法、期间缺失 / 月份不符 / 未开放、模块期间未开放、行数不足、科目不存在 / 停用、手工不允许、控制科目模块不符、暂记缺负责人 / 原因 / 复核日、金额格式 / 小数位 / 超安全整数、借贷同时为 0 或同时为正、借贷不平、维度超过 32 个、维度错误路径改写、平衡维度科目缺失（`balance.account`）、补平行维度不符、来源检查各分支（无原分录、结账分录、ID 不符、模块不符、原分录为反向、重分类后非反向）、已被更正（`CONFLICT`）、日期早于最近更正、镜像科目已不存在、重分类经济金额不同、累计发生额超上限；
    - **错误先后**：至少 6 个同时违反两条规则的输入，覆盖：草稿形状与期间、期间与科目、来源检查与已被更正、已被更正与日期、镜像科目缺失与 `replace` 的新行错误（应先报镜像）、逐行错误与借贷不平（应先报逐行）。
  - **判定**：base 与 head 每个用例的记录逐字节相同（PR 正文附两侧输出的 SHA-256 与比较结果）；并且**直接断言**（只比两侧相同不够）：
    1. 每个失败用例的 `code` 与 `issue.path`、`issue.rule` 与用例名所述一致（列表逐行写出期望值）；
    2. 每个错误先后用例报的是期望的那一条（写出期望的 `path` / `rule`）；
    3. `replace` 的 `journals` 为 2 项（`reversal`、`normal`），`reclassify` 为 1 项且行的 `group` 先 `originalReverse` 后 `newAllocation`，`reverse` 为 1 项且 `kind` 等于原分录的 `kind`；
    4. 平衡维度补行用例中补出的行 `role` 为 `"balance"`，且 `balancing.dimension` 等于配置的维度；
    5. `historicalImport` 用例在非历史导入时（去掉 `adapter.module`）对同一输入报错，证明该开关被用例实际覆盖。
    base 上任一直接断言不成立，先停下并向协调者报告。PR 正文附驱动、用例清单、比较结果与直接断言结果。
  - **驱动原件**：PR 正文贴驱动**原文件字节的 base64**，或同时写出两种 SHA-256：原始字节、按 UTF-8 解码并把换行归一为 LF 后的字节。只给一种哈希不算满足。
- **R5 结构规则**（静态，评审按代码与 PR 表格核对）：
  - **R5a 原文搬移**：`amount`、`totals`、`resolve` 的函数体，`business` 中逐行映射的回调体，以及镜像行映射与镜像自检的代码，base 与 head 逐字比较（只归一缩进；为传参把自由变量改为上下文字段的替换须逐处列表说明）；`// D6: …` 注释原文不变。不同且未列明即失败。
  - **R5b 无模块级可变状态**：新文件与 `journals.ts` 的模块顶层只有 `import` / `export`、类型、函数声明与 `const` 常量（不含 `let`、可变容器，且不在加载时调用导入的函数）；PR 正文附 Babel AST 检查脚本的输出。
  - **R5c 错误调用点不变**：base 与 head 中 `journalError(` 调用的 `(path, rule[, conflict])` 实参原文多重集相同（Babel AST 抽取，PR 正文附两侧列表与比较结果）。
  - **R5d 依赖方向**：新文件之间的导入单向无环；新文件不从 `./journals.ts` 导入运行时值时，`journals.ts` 位于顶端；若采用决定 4 中“新文件从 `journals.ts` 导入 `journalError`”的写法，PR 正文画出环并说明为何安全（只在函数体内使用、加载时不调用）。PR 正文附导入图。
- **R6 尺寸**：除上表 R6a、R6b 外，每个新函数满足 ②（≤ 80 行、嵌套 ≤ 3 层）；PR 正文列出所有超过 50 行的函数，附计数行数与最深层数（base 与 head 两列）。
- **R7 打包字节**：首屏与全部 chunk **±0**。用 `scripts/measure/bundle-measure.mjs --d454`（不传 `--route` / `--chunk`，即全部 ±0），写明脚本所在的提交 SHA；base 为最终送审 head 的实际合并基。出现任何非 0 差异即停下报告。
- **R8 质量门**：
  - **R8a 合并前**：`typecheck`、`lint`、`check:boundaries`、CI-02 预检通过；PR CI（`ci.yml`）绿。
  - **R8b 合并后检查（不作合并门）**：合并后第一次覆盖该合并提交的 main Full 须绿，含所有过账相关的真实 Chrome 场景；失败时报协调者，按 D456 暂停后续合并。
- **R9 可读性一节**：PR 正文按下节逐条说明。

## 性能考虑

- 不跑 Bench：算法与数据结构不变（同样的 `Map`、`reduce`、两次 `totals`），只多若干函数调用；没有数据库访问。若拆分引入了额外的整表遍历（例如为传参复制 `lines`），PR 正文须说明并给出理由，否则评审退回。
- 不进打包产物（R7）。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥：

- **②**：本任务就是为满足 ② 而做。`buildJournalPlan` 从 253 行、`business` 从 84 行拆到各 ≤ 80 行（R6a）。
- **③**：`journals.ts`（465 行）是热点；拆后 ≤ 300 行，新文件各 ≤ 200 行（R6b）。PR 正文贴 `git diff --numstat`。
- **①**：函数名表达规则，例如 `checkedJournalHeader`、`businessLines`、`balancingLines`、`checkedCorrectionSource`、`mirroredLines`、`correctionJournals`；不用 `step1`、`part2`、`helper`。
- **④**：上下文对象只读、字段显式；读者能在 `buildJournalPlan` 中一屏看出“先检查什么、后检查什么”。
- **⑤**：不适用（决定 5）。
- **⑥**：保留 `// D6` 注释并紧贴其代码；可以在 `buildJournalPlan` 的分派处加一行注释说明“`business()` 在镜像自检之后调用，错误先后依赖此顺序”，不加其他注释；不留调试输出。
- **测试耗时**：本任务不改测试；R4 驱动不提交。PR 正文附 `core` 与 `infra` 项目在 base 与 head 上的耗时（vitest 汇总行原文），两侧差异 > 20% 时说明原因。

## 用户可见变化

- 无。所有过账、更正、导入与错误提示都不变（R3、R4）。

## 证据要求

- **不需要浏览器时段**：行为等价由 R3 与 R4（返回值、错误及错误先后逐字节等价及直接断言）证明；过账相关的 e2e 场景在 main Full 中运行，作合并后检查（R8b）。R4 与构建在本机运行，须服从协调者的时段静默通知（D442 / D480）。
- **可行性**（S13 回顾行动 4）：`core/test/domain/journals.test.ts:32` 已展示如何构造完整的 `Parameters<typeof buildJournalPlan>[0]`；函数是纯函数，任一用例都只需构造输入对象。R6a、R6b 的 base 数字见“现状”与上表（设计角色实测）。本任务书**没有**试写驱动；若某个 `journalError` 调用点在构造的输入上无法触发（例如被前置检查挡住），PR 正文写明原因并报协调者，不得静默删去。
- PR 正文附：R2 导出比较与 `git grep` 结果；R3 汇总行；R4 驱动（原件 base64 或两种 SHA-256）、用例清单、比较结果与直接断言结果；R5a–R5d 各表；R6 行数表（base 与 head 两列）；R7 的 `bundle-measure.mjs` 完整输出与退出码；可读性一节。R8b 合并后补到 PR 评论。
