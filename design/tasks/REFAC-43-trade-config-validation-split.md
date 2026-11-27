# REFAC-43：拆分贸易主数据校验 `validateTradeConfig`（不改行为）

- Sprint：S32（[计划](S32.md)）
- 类型：重构（core 领域纯函数；贸易伙伴、货物 / 服务、科目档案、付款条件与税码的配置校验）
- 优先级：P2
- 决定：[D629](S32.md#s32-期间决定)。REFAC-43 不改行为：导出名与签名（含 `.length`）、公开推断类型、对同一输入抛出的第一个错误（构造器、`code`、`issue` 全部字段与 `message`）以及检查先后都不变；只搬移与传参。详见“范围与决定”1–8。
- 建议分支：`refac-43-split-trade-config-validation`
- 来源：[S32 范围与验收](S32.md#范围与验收)第 3 行、[三项 REFAC 共用：可读性与嵌套复验](S32.md#三项-refac-共用可读性与嵌套复验)、[回顾行动落地](S32.md#回顾行动落地)；本任务书不放宽。
- 模板：[REFAC-40](REFAC-40-build-reports-split.md)（core 纯函数、R2b 公开类型声明对照、R4 返回值与错误等价、R5 结构规则）。
- 迁移：**不加**。
- 浏览器时段：**不需要**。本项是 core 纯函数，`web/src` 不导入它（见“现状”），等价由 R2b、R3、R4 在 node 中证明。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 为什么是它

- 按 [S30 统一量法](S30.md#s30-统一量法)（D615），`validateTradeConfig` **90** 行，是 S32 选题依据中 core 领域尚未拆分的超长函数（[S32 选题依据](S32.md#选题依据可复现)，D626）。
- 函数内是“公共检查 → 按 `kind` 分派的五段检查”。五个 `case` 互不引用，按 `kind` 抽出即可降长，不需要改检查逻辑。
- 它是贸易主数据保存与旧账期初导入（D25）的共同入口，错误的**先后**决定用户看到哪个字段报错，所以 R4 必须比到“第一个错误”与检查顺序，不能只看通过 / 不通过。

## 现状（main `218284a`）

下文 `file:line` 都按 `218284a372d4b84a2597665da863d1cd9120cc88`（S32 计划 [#480](https://github.com/lingshf/ai-native-erp/pull/480) 合并提交）；`packages/` 与 `34da911` 相同（`git diff --stat 34da911 218284a -- packages` 无输出）。

- `packages/core/src/domain/trade-master.ts` 共 **313** 行，最后一次改动为 `9bdc155`（[#63](https://github.com/lingshf/ai-native-erp/pull/63)，M2-03b）。
- **导入**（`:1-10`）：`DomainError`、`checkedCode`、`checkedName`、`checkedExpectedRevision`、`checkedJournalDay` 与类型 `Account`、`DimensionMap` 从 `./index.ts`；类型 `DimensionConfig` 从 `./dimensions.ts`。`domain/index.ts:7` 以 `export * from "./trade-master.ts"` 再导出，`:9` 另以 `import type` 引用 `TradeIssue`。
- **导出**（运行时 9 个、类型 13 个；`git grep -n "^export" 218284a -- packages/core/src/domain/trade-master.ts` 共 22 行）：
  - 运行时：`tradeKinds`、`tradeError`（`:97-99`）、`checkedTradePercent`（`:100-107`）、`checkedTradeWindow`（`:108-112`，`path = "data"` 默认参数）、`checkTradeDefaultDimensions`（`:117-143`）、`tradeEffective`（`:144-146`）、`validateTradeConfig`（`:147-236`）、`assertTradeAccount`（`:246-288`）、`selectTradeTax`（`:289-313`）；
  - 类型：`TradeKind`、`TradeWindow`、`TradePartyData`、`TradeProductData`、`TradeProfileData`、`TradeTermsData`、`TradeTaxRate`、`TradeTaxData`、`TradeData`、`TradeConfig`、`TradeWrite`、`TradeIssue`（`:91-95`）、`TradeAccountRole`。
- **抛错原语**：`tradeError(path, rule)` 抛 `DomainError("INVALID_INPUT", { scope: "trade", path, rule })`（`:97-99`）。`checkedCode`、`checkedName`、`checkedExpectedRevision`（`master-data.ts:72-93`）失败时都调用 `invalid()`，三者的错误**无法区分**；`checkedJournalDay`（`journals.ts:189-195`）失败时抛 journal 作用域的错误。
- **`validateTradeConfig` 检查先后**（`:147-236`）：
  1. 公共：`checkedCode(config.code)` `:148` → `checkedExpectedRevision(config.revision - 1)` `:149` → `kind` 不在 `tradeKinds` 或 `active` 不是布尔，`tradeError("kind", "shape")` `:150-151` → `checkedName(config.data.name, 160)` `:152` → `checkedTradeWindow(config.data)` `:153`；
  2. 内层 `taxes`（`:154-158`）：不是数组、长度 > 100 或有重复时 `tradeError("data.allowedTaxCodes", "shape")` `:156`；之后逐个 `checkedCode` `:157`；
  3. `switch (config.kind)`：
     - `tradeParty`（`:160-173`）：`role` / `apProfile` / `arProfile` 组合不符 → `"data.role","shape"` `:167`；`checkedCode` 依次查 `apProfile`（非 null 时，`:168`）、`arProfile`（非 null 时，`:169`）、`terms`（`:170`）；`taxes` `:171`；
     - `tradeProduct`（`:174-184`）：`type` 与两个科目组合不符 → `"data.type","shape"` `:181`；`taxes` `:182`；
     - `tradeProfile`（`:185-187`）：`side` 不是 `AP` / `AR` → `"data.side","shape"` `:186`；
     - `tradeTerms`（`:188-202`）：天数与 `allowPartialDiscount` 不符 → `"data.discountDays","shape"` `:199`；`checkedTradePercent(discountPercent, "data.discountPercent")` `:200`；
     - `taxCode`（`:203-234`）：`mode` → `"data.mode","shape"` `:205`；`checkedTradePercent(deductiblePercent)` `:206`；`rates` 形状 → `"data.rates","shape"` `:208`；**按 `from` 排序后**（`:210`）逐行：`checkedCode(rate.id)` `:212` → `checkedTradeWindow(rate, "data.rates")` `:213` → 重复 id、超出税码窗口或与前一行重叠 → `"data.rates","window"` `:220` → `checkedTradePercent(rate.ratePercent, "data.rates.ratePercent")` 非 0 且 `mode` 不是 `ordinary` → `"data.rates.ratePercent","shape"` `:223-226`；循环后科目配对 → `"data.inputAccount","account"` `:228-232`。
- **调用方**：`packages/core/src/application/trade-master.ts:11`、`:85`；`packages/infra/src/legacy/opening-items.ts:12`、`:336`（不改）；测试 `packages/core/test/domain/trade-master.test.ts`（294 行；导入 `:5`，直接调用 13 处：`:82`、`:85`、`:96`、`:117`、`:123`、`:129`、`:132`、`:135`、`:181`、`:183`、`:193`、`:196`、`:202`），另经 `packages/infra/test/http/trade-master.test.ts`、`packages/infra/test/legacy-opening-items.test.ts` 间接覆盖。
- `packages/web/src` 不导入 `@erp/core/domain`（`git grep -n -e "@erp/core/domain" -e "@erp/core/application" 218284a -- packages/web/src` 无输出），不进任何 web chunk。
- **文档引用**：`git grep -n "domain/trade-master.ts" 218284a -- docs README.md` 无输出。
- **新文件名**：`git ls-files packages/core/src/domain | grep trade-master-` 在 `218284a` 上无输出。

## 范围与决定

1. **只拆不改**：检查条件、正则、上限（`160`、`100`、`3650`）、错误的 `path` 与 `rule`、`sorted` 的排序方式都不变；不修缺陷。发现疑似缺陷时在 PR 正文记录并报协调者，另开 Backlog。
2. **检查先后不变**：“现状”所列 1–3 的顺序不变；抽出的函数在 `validateTradeConfig` 中的调用位置与原段位置相同（公共检查在前，`switch` 分派在后）。`taxCode` 的逐行检查仍在排序**之后**进行，行内四步顺序不变。
3. **签名不变**：9 个运行时导出的参数名、顺序、类型与默认值不变，`.length` 两侧相同（`checkedTradeWindow.length` 为 1）；`validateTradeConfig` 返回类型仍为 `void`。
4. **传参代替闭包**：内层 `taxes` 可提升为模块级函数（例如 `checkedAllowedTaxCodes`），以参数接收 `codes`；不得改为在 `switch` 之前统一调用（会改变先后）。
5. **建议拆法**（不强制）：五个 `case` 各抽为一个按 `kind` 命名的函数（例如 `validateTradeParty`、`validateTradeProduct`、`validateTradeProfile`、`validateTradeTerms`、`validateTaxCode`），放入同目录新文件 `trade-master-validation.ts`；`validateTradeConfig` 保留公共检查与 `switch` 分派。
6. **文件与依赖**：新文件为同目录 `trade-master-*.ts`；**不加入 `domain/index.ts`**（新文件的导出只在本任务文件内使用）。新文件不从 `./trade-master.ts` 导入运行时值（避免循环）；若需 `tradeError`、`checkedTradePercent`、`checkedTradeWindow`，把其定义移到新文件（例如 `trade-master-checks.ts`），`trade-master.ts` 以 `export { … } from` 再导出（导出名集合不变，`.d.ts` 差异由 R2b 处理）。新文件可从 `./index.ts` 导入 `DomainError` 与 `checked*`（既有模式），但不得在模块加载时调用任何导入的函数（R5b）。
7. **类型声明位置**：`TradeConfig`、`TradePartyData` 等导出类型的定义留在 `trade-master.ts`；新文件只以 `import type` 引用。
8. **不改的路径**：`packages/core/src/domain/index.ts`、`packages/core/src/domain/master-data.ts`、`packages/core/src/domain/journals.ts`、`packages/core/src/application/**`、`packages/infra/**`（含 `legacy/`）、`packages/web/**`、`packages/core/test/**`。

## 冲突域

写入域：`packages/core/src/domain/trade-master.ts` 与同目录新增 `trade-master-*.ts`（`218284a` 上不存在）。与 REFAC-41（web）、REFAC-42（infra）无文件交集，可并行（[S32 泳道](S32.md#泳道按冲突域)）。

## 验收

### base 失败、head 通过

量法用 [S30 统一量法](S30.md#s30-统一量法)（D615，命令见“可读性”）；base 为最终送审 head 的实际合并基（当前 `218284a`）。

| 编号 | 检查 | base `218284a` | head 要求 |
| --- | --- | --- | --- |
| R6a | 函数长度（不计空行与纯注释行，外层含内层） | `validateTradeConfig` **90**（失败） | `trade-master.ts` 与新文件中每个函数 ≤ 80 |
| R6b | 嵌套深度 | 最深为 `validateTradeConfig` 3、`checkTradeDefaultDimensions` 3（已满足） | 每个函数 ≤ 3（保持） |
| R6c | 文件行数（`(Get-Content <file>).Count`） | `trade-master.ts` **313** | `trade-master.ts` ≤ **260**；新文件各 ≤ **150** |

上表 head 要求都是**硬上限**。`trade-master.ts` ≤ 260 由设计角色按决定 5、6 估定（移出五个 `case` 约 75 行、保留分派约 12 行，拆后约 250 行），未经试拆实测。实测超出即停下，报设计角色与协调者；不得自行放宽，也不得为凑数字机械拆分。是否调整由 TL 决定，并记入 PR。

### 两侧都须成立的不变量

- **R1 范围**：`git diff --name-only <base>...<head>` 只含 `packages/core/src/domain/trade-master.ts` 与同目录新增的 `trade-master-*.ts`；决定 8 所列路径 diff 为空。不加迁移。
- **R2 导出不变**：用 `@babel/parser`（插件 `typescript`）解析：`trade-master.ts` 的导出名集合（运行时 9 个、类型 13 个）与 base 相同，签名源文本相同（只归一空白；再导出的函数比定义处）；base 与 head 上各用 node 导入 `@erp/core/domain`，打印排序后的 `Object.keys`，两侧相同（新文件导出不得出现在其中）；9 个运行时导出的 `.length` 两侧相同。新文件导出只在本任务文件内使用，PR 正文附 `git grep` 结果。`npm run typecheck`、`npm run check`、`npm run check:boundaries` 通过。
- **R2b 公开类型声明对照**（送审证据，产物与临时文件不提交）：方法同 [REFAC-40 R2b](REFAC-40-build-reports-split.md#两侧都须成立的不变量)，把文件换为 `packages/core/src/domain/trade-master.ts`：
  - **生成**：base 与 head 用同一份仓库外的临时 tsconfig 各运行一次 `npx tsc -p <该文件>`，退出码须为 0；tsconfig 设置同 REFAC-40（`files` 只列本文件）。
  - **比较**：两侧 `core/src/domain/trade-master.d.ts` 逐字节相同即通过。
  - **不同时**（例如决定 6 的再导出），对两侧**源码**做双向严格相等检查：`Eq<typeof B.x, typeof H.x>` 9 次（运行时导出）、`Eq<B.T, H.T>` 13 次（导出类型）、另加 `Eq<Parameters<typeof B.validateTradeConfig>, Parameters<typeof H.validateTradeConfig>>` 与 `Eq<ReturnType<…>, ReturnType<…>>` 各 1 次；编译退出码须为 0。反例：把 base 副本中 `checkedTradeWindow` 的默认参数 `path = "data"` 改为必填 `path: string`，`typeof` 一条须报 TS2344。送审前删除临时目录，`git status` 中不得残留。
  - **PR 正文附**：tsconfig 原文、两次生成的命令与退出码、两侧 `trade-master.d.ts` 的 SHA-256 与 diff（相同时写“无差异”）；不同时另附检查文件原文与编译输出、反例输出。
  - **可行性**：声明生成与双向检查都**未在 `218284a` 上实测**；开发先在 base 上生成，退出码不为 0 时先停下报告。
- **R3 既有测试原样通过**：`npx vitest run --project core` 全部通过；另跑 `npx vitest run --project infra packages/infra/test/http/trade-master.test.ts packages/infra/test/legacy-opening-items.test.ts`；测试文件 diff 为空。PR 正文附汇总行原文，base 与 head 各一次。
- **R4 返回值与错误等价**（送审证据，驱动不提交）：
  - **驱动**：临时 vitest 文件（例如 `packages/core/test/zz-r43-probe.test.ts`，送审前删除），在 base 与 head 上从 `../src/domain/index.ts` 导入，同一组虚构输入直接调用 `validateTradeConfig`，并调用 `tradeError`、`checkedTradePercent`、`checkedTradeWindow` 各一组（覆盖决定 6 的搬移）。
  - **记录与编码**：同 REFAC-17 R4：返回值（`undefined` 记为字面量）或抛错的构造器名、`code`、`issue` 的全部自有可枚举属性（键排序）与 `message`；确定性 JSON 编码；带其自测；同一驱动连续两次运行输出逐字节相同。
  - **夹具确定性**（[S31 回顾行动 1](../reviews/S31-retro.md#行动项汇总)，[S32 回顾行动落地](S32.md#回顾行动落地)）：
    1. 夹具为驱动内的对象字面量；日期一律写固定字符串（例如 `"2026-01-01"`），不得出现 `randomUUID`、`Math.random`、`Date.now`、`new Date(` 或任何读取当前时间的写法；`git grep -n -e randomUUID -e "Math.random" -e "Date.now" -e "new Date(" -- <驱动文件>` 须无输出，输出原文附 PR。
    2. 不借用测试 helper；如借用（例如 `core/test/domain/trade-master.test.ts` 中的构造函数），PR 正文逐个列出 helper 及其默认值，确认无随机值与当前时间（`218284a` 上该文件 `git grep -n -e randomUUID -e Date -e "Math.random"` 无输出）。
    3. 送审时固定夹具构建步骤（驱动内的生成顺序即步骤）与夹具 SHA-256（把全部输入按用例顺序做确定性 JSON 编码后取哈希）；附“在两个新目录中独立重建两次，夹具哈希相同”的原始输出。
    4. 不满足 1–3 就不送审。约束之间冲突时（例如某条直接断言只能用随机输入触发）停下上报，不得在证据中遮掉。
  - **用例**至少包含：五种 `kind` 各一个合法配置（返回 `undefined`）；“现状”第 1–3 步列出的**每一个**抛错点各一例（只违反该点）；以及下列**先后用例**——同一输入同时违反两个检查点，第一个错误须为先查的那一个：
    - `kind` 非法且 `name` 为空 → `"kind","shape"`（`:150-151` 先于 `:152`）；
    - `data.from > data.to` 且 `allowedTaxCodes` 重复 → `"data","window"`（`:153` 先于 `taxes`）；
    - `tradeParty`：`role` 组合不符且 `terms` 非法 → `"data.role","shape"`；`terms` 非法且 `allowedTaxCodes` 重复 → `checkedCode` 的错误（`:170` 先于 `:171`）；
    - `tradeProduct`：`type` 组合不符且 `allowedTaxCodes` 超过 100 项 → `"data.type","shape"`；
    - `tradeTerms`：`discountDays > dueDays` 且 `discountPercent` 为 `"101"` → `"data.discountDays","shape"`；
    - `taxCode`：`mode` 非法且 `deductiblePercent` 非法 → `"data.mode","shape"`；`rates` 为空数组且科目配对不符 → `"data.rates","shape"`；两行税率，**输入顺序**第 1 行 `from` 较晚且 `ratePercent` 非法、第 2 行 `from` 较早且 `id` 非法 → `checkedCode` 的错误（排序后先查第 2 行）；`mode` 为 `zero`，排序后第 2 行的窗口与第 1 行重叠且其 `ratePercent` 为 `"6"` → `"data.rates","window"`（`:220` 先于 `:223-226`）；`mode` 为 `zero`、`ratePercent` 为 `"6"` 且科目配对不符 → `"data.rates.ratePercent","shape"`（循环先于 `:228-232`）。
    `checkedCode`、`checkedName`、`checkedExpectedRevision` 三者的错误相同（见“现状”），它们之间的先后**无法由 R4 区分**，改由 R5a 原文比较证明；PR 正文照此写明，不得声称 R4 覆盖。
  - **判定**：两侧每个用例记录逐字节相同（附两侧输出 SHA-256）；并且**直接断言**：
    1. 五个合法配置都返回 `undefined`；
    2. 每个 `tradeError` 抛错点的错误为 `DomainError`、`code` 为 `INVALID_INPUT`、`issue` 为 `{ scope: "trade", path, rule }`，`path` 与 `rule` 等于“现状”所列；
    3. 上列每个先后用例的第一个错误等于括号中所写的那一个。
    断言 1–3 由设计角色从源码推出，**未用驱动在 base 上实测**；base 上任一直接断言不成立，先停下报协调者，不得改断言迁就，也不得改产品代码。
  - **驱动原件**：PR 正文贴原文件字节的 base64，或同时给原始字节与“UTF-8 解码、换行归一为 LF”两种 SHA-256。
- **R5 结构规则**（静态）：
  - **R5a 原文搬移**：公共检查 5 行（`:148-153`）、`taxes` 函数体（`:155-157`）、五个 `case` 的语句体（`:161-172`、`:175-183`、`:186-187`、`:189-201`、`:204-233`）base 与 head 逐字比较（只归一缩进）；`checkedCode` / `checkedExpectedRevision` / `checkedName` 三次调用的相对顺序须相同。为传参改自由变量（`config.data` → 参数、`taxes` → 新名）的地方逐处列表（决定 4）。不同且未列明即失败。
  - **R5b 无模块级可变状态**：`trade-master.ts` 与新文件的模块顶层只有 `import` / `export`、类型与接口、函数声明与不可变 `const`（不含 `let`、可变容器，不在加载时调用导入的函数）；附 Babel AST 检查输出。
  - **R5c 错误调用点不变**：`tradeError(` 调用的实参原文多重集两侧相同（定义行除外；按 `git grep -n "tradeError(" 218284a -- packages/core/src/domain/trade-master.ts` 计得），`checkedCode(`、`checkedTradePercent(`、`checkedTradeWindow(` 调用的多重集两侧相同；Babel AST 抽取，附两侧列表。
  - **R5d 依赖方向**：新文件不从 `./trade-master.ts` 导入运行时值（`import type` 允许）；新文件之间单向无环；`domain/index.ts` 无 diff；附导入图。
- **R6 尺寸**：见上表；PR 正文列出超过 60 行的函数，附行数与最深层数（base 与 head 两列）。
- **R7 打包字节**：不适用。`web/src` 不导入 core 领域（见“现状”），不进任何 web chunk，不跑 `bundle-measure.mjs`。编号保留。
- **R8 质量门**：R8a 合并前 `npm run typecheck`、`npm run check`、`npm run check:boundaries`、CI-02 预检通过，PR CI 绿；R8b 合并后第一次覆盖该合并提交的 main Full 须绿，失败报协调者，按 D456 暂停后续合并。
- **R9 可读性一节**：PR 正文按下文“可读性”逐项给出改前 / 改后数据。

### 测试命令

```powershell
npx vitest run --project core
npx vitest run --project infra packages/infra/test/http/trade-master.test.ts packages/infra/test/legacy-opening-items.test.ts
npm run typecheck; npm run check; npm run check:boundaries
```

## 性能考虑

- 检查次数与先后不变（R4、R5a）；按 `kind` 分派只多一层函数调用，不新增循环或分配。`rates` 的排序与逐行检查原样搬移。
- 不跑 Bench：本函数只在保存贸易主数据与导入旧账期初时调用，不在报表或列表路径上。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥ 与 [S32 共用要求](S32.md#三项-refac-共用可读性与嵌套复验)。PR 正文“可读性”一节按下表逐项给出**改前 / 改后**数据。

| 维度 | 要求 | 改前（`218284a`，设计角色实测） | PR 正文改后须列 |
| --- | --- | --- | --- |
| 函数长度（②） | `trade-master.ts` 与新文件每个函数 ≤ 80 | `validateTradeConfig` 90；其余 ≤ 43 | 量法对 `trade-master.ts` 与全部新文件的**完整输出**；超过 60 行的逐个列行数 |
| 嵌套深度（②） | 每个函数 ≤ 3 | `validateTradeConfig` 3、`checkTradeDefaultDimensions` 3、`selectTradeTax` 2；其余 ≤ 1 | 同一输出第 2 列；超过 2 层的逐个说明 |
| 文件长度（③） | `trade-master.ts` ≤ 260；新文件各 ≤ 150 | `trade-master.ts` 313；`trade-master-*.ts` 不存在 | `git diff --numstat <base> <head>` 与拆后行数 |
| 重复（④） | 第三次出现即抽取 | `checkedCode(` 在函数内 6 处（`:148`、`:157`、`:168`、`:169`、`:170`、`:212`），已是共享函数，保留；`taxes(` 2 处（`:171`、`:182`），已是函数，随决定 4 提升；没有需新抽取的重复 | 每处去向 |
| 命名（①） | 新函数、新文件名表达业务含义；不用 `step1`、`part2`、`helper`、`utils` | — | 新增名称清单，每个一句职责；附 `git diff --name-only <base>...<head> \| grep -i -E "step[0-9]\|part[0-9]\|helper\|util"` 输出（预期为空） |

### 量法

用 [S30 统一量法](S30.md#s30-统一量法) 的 `s30-measure.cjs`，脚本原文以 S30.md 该节为准，本任务书不另附。在仓库根目录运行：

```powershell
node <保存位置>\s30-measure.cjs 218284a packages/core/src/domain/trade-master.ts
node <保存位置>\s30-measure.cjs <head> packages/core/src/domain/trade-master.ts @(git diff --name-only --diff-filter=A <base> <head> -- packages/core/src/domain)
```

base 完整输出（`行数 / 层数 / 范围 / 名称`）：

```text
3   0  :97-99    tradeError
8   1  :100-107  checkedTradePercent
5   1  :108-112  checkedTradeWindow
27  3  :117-143  checkTradeDefaultDimensions
3   0  :144-146  tradeEffective
90  3  :147-236  validateTradeConfig
5   1  :154-158  taxes
43  1  :246-288  assertTradeAccount
10  0  :255-264  control
4   0  :265-268  general
25  2  :289-313  selectTradeTax
```

开发在 base 上重跑的输出与上表不符时，先停下报告。

### 其余各条

- **②**：拆后 `validateTradeConfig` 只做“公共检查 → 按 `kind` 分派”；每个按 `kind` 的函数只做该类配置的检查。
- **⑤**：`160`、`100`、`3650`、`100_000_000n`、`1_000_000n` 原样保留，不新增未命名数字。
- **⑥**：`:113-116` 的 `checkTradeDefaultDimensions` 文档注释随函数原样保留；不新增注释，除非拆分需要说明“为什么”。不留调试输出。
- **测试耗时**：PR 正文附 `core` 项目在 base 与 head 上的耗时（vitest 汇总行原文）；两侧差异 > 20% 时说明原因。

## 用户可见变化

- 无。贸易伙伴、货物 / 服务、科目档案、付款条件与税码的保存校验，以及旧账期初导入的校验，报错字段与顺序都不变（R3、R4）。

## 证据要求

- **原始输出固定**（S30 回顾行动 1）：摘要、哈希与驱动不算原始证据。R2、R2b、R3 汇总行、R4 两侧输出、夹具两次重建输出、R5 抽取输出与 R6 量法输出的原文，须固定到带修订号的链接（例如 gist 的某个 revision），PR 正文给出链接与该文件的 SHA-256。
- **分支清单**（S30 回顾行动 2）：PR 正文附 base 上的抛错与分支清单及枚举命令 `git grep -n -e "tradeError(" -e "checkedCode(" -e "checkedTradePercent(" -e "checkedTradeWindow(" -e "checkedName(" -e "checkedExpectedRevision(" -e "case \"" 218284a -- packages/core/src/domain/trade-master.ts`（只取 `:147-236` 内的行），并把 R4 用例逐一对到分支。无法触发的分支写明原因并报协调者，不得静默删去。
- **夹具确定性**（S31 回顾行动 1）：PR 正文附 R4“夹具确定性”1–3 的命令与输出原文；Reviewer 与 QA 各自独立重建一次，哈希须与 PR 正文相同。
- **QA 留证**（S30 回顾行动 3）：QA 在 base、head 两侧实跑 R3 与 R4，并独立重建夹具后，在本开发 PR 下发评论（PASS / FAIL、所跑命令、用例数、夹具哈希、对比结果）；时点为评审批准后、合并前；未发不合并。
- **可行性**：设计角色在 `218284a` 上实测了 R6 的 base 数字；R2b 与 R4 直接断言**未实测**，开发先在 base 上跑，不成立时先停下报告。

## 合并后项

- QA 结论（PR 评论链接），见 [S32 执行状态](S32.md#执行状态)。
- Product/Design 在合并提交上用 S30 统一量法复测 `trade-master.ts` 与 `trade-master-*.ts`，确认 main Full 结果，结论以评论发在开发 PR。

## 设计自查

- [x] 冲突域与 REFAC-41、REFAC-42 逐文件不相交；不改 `domain/index.ts`、`legacy/`、测试文件。
- [x] R6a 有 base 实测值（base 失败）；R6b base 已满足，要求保持；`trade-master.ts` ≤ 260 为估定硬上限，未试拆，超出即停下由 TL 决定。
- [x] 每个抛错点与 9 组先后用例都有直接断言；三个无法区分的公共检查改由 R5a 证明，已写明。
- [x] R4 一节写明 S31 回顾行动 1（无随机值与当前时间、helper 默认值、夹具 SHA-256、两次独立重建、不满足不送审、冲突停下上报）。
- [x] 可读性五项都有要求、改前数据（S30 统一量法完整输出）与改后须列；无用户可见变化。
- [x] 不加迁移，不碰 `scripts/slot/`、`scripts/measure/`。
