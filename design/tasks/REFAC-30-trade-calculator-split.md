# REFAC-30：拆分贸易计算器 `calculateTrade`（不改行为）

- Sprint：S24（[计划草案](S24.md)）
- 类型：重构（core 领域纯函数）
- 优先级：P2
- 决定：[D550](S24.md#s24-期间决定)。只改代码组织，不改返回值、错误与错误先后，详见“范围与决定”1–7。
- 建议分支：`refac-30-split-trade-calculator`
- 来源：[S24 候选](S24.md#候选s24-其余泳道s23-评审后定)“按 ② 拆 core / infra”。REFAC-29（[#355](https://github.com/lingshf/ai-native-erp/pull/355) 任务书已合并）占了本批唯一的页面拆分名额，本项不是页面拆分。
- 模板：[REFAC-20](REFAC-20-journal-plan-split.md)（core 领域纯函数：直接调用、返回值与错误逐字节等价、错误先后用例、`invalid` 调用点多重集不变）；记录与编码规则沿用 [REFAC-17 R4](REFAC-17-prepare-trade-action-split.md#两侧都须成立的不变量)。
- 迁移：**不加**。
- 浏览器时段：**不需要**，理由见“证据要求”。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 为什么是它

- 设计角色在 `0de5134` 上用 `node files/fnlen.cjs packages/web/src packages/core/src packages/infra/src` 实测，core 中除已拆或在途的函数外，超过 ② 上限最多的领域函数是 **`calculateTrade`（144 行）**；排在它前面的非页面函数要么属于旧账导入（`checkOpeningItems`、`reconcileLegacy`、`mapRow`、`executeLegacyImport`、`apply`，暂不动），要么在 REFAC-26 的冲突域（`tradeDocumentRepository`），要么是页面（不能排）。
- 它是采购 / 销售发票与单据的金额唯一来源：`application/trade-documents.ts:676` 与 `application/trade-invoice-calculation.ts:25` 都调用它，税额、可抵扣税、费用与现金折扣基数都从这里出来。读者最常需要弄懂“先校验什么、行舍入与整单舍入怎么分摊”。
- **纯函数**：不读写数据库、不取时钟、不调用 AI；等价可以直接用“同一输入 → 同一输出或同一错误”证明，取证成本低。
- `packages/web/src` 不导入 `@erp/core/domain` 或 `@erp/core/application`（`git grep` 计数 0），不进任何打包产物。

## 现状（main `0de5134`）

下文 `file:line` 都按 `0de51348ad77da9782429fcb58c103fc7b415ed8`。

- `packages/core/src/domain/trade-calculator.ts` 共 **284** 行。运行时导出：`roundTradeRatio`（`:105–110`）、`calculateTrade`（`:126–272`）；导出类型：`TradeCalculationIssue`、`TradeTax`、`TradeCalculationLine`、`TradeCalculationInput`、`TradeAmounts`、`CalculatedTradeLine`、`TradeCalculation`。模块私有：常量 `decimalUnit`、`percentUnit`（`:69–70`），函数 `invalid`（`:72`）、`shape`（`:76`）、`decimal`（`:87`）、`percent`（`:95`）、`halfUp`（`:101`）、`minorAmounts`（`:274–284`），接口 `WorkingLine`（`:113–123`）。文件从 `./index.ts` 导入 `checkedMinor`、`DomainError`（`:1`），`domain/index.ts:6` 又以 `export * from "./trade-calculator.ts"` 再导出——这是现有的导入环。
- fnlen 实测（只列本文件）：

  ```text
  144	packages/core/src/domain/trade-calculator.ts:126-272	calculateTrade
  ```

- **`calculateTrade(input)` 的顺序**（R4 的错误先后用例专门覆盖）：
  1. 文档级检查（`:127–144`）：`shape(input, 7 个键, "document")` → `side` → `priceMode` → `rounding` → 币种（格式且等于记账币种，rule `currency`）→ `checkedMinor(0, input.scale)`（scale 非法时抛 `INVALID_INPUT` 且 **`issue` 为 `undefined`**）→ `lines` 是数组且 1–100 行；
  2. `ids` Set 与 `groups` Map（`:145–146`）；**`Array.from(input.lines, …)`** 逐行（`:147–200`）：行 `shape` → `id`（非空、≤ 100、不重复）→ `tax` 形状 → `tax` 规则（code、treatment）→ `ratePercent` → `deductiblePercent` → 非 standard 且税率非 0（rule `tax`）→ `quantity`（含 0 检查）→ `unitPrice` → `discountPercent` → `taxableCharges`（小数位按 `input.scale`）→ `basis` 与 `checkedMinor(basis, scale)` → `denominator` / `numerator` / `lineTax`（`:178` 有一行注释）→ `group` 四元组与 `JSON.stringify(group)` 分组；
  3. `rounding === "document"` 时按组分摊（`:202–220`）：组内整除后按余数降序、余数相同按 `index` 升序补 1；
  4. 合计与逐行结果（`:222–261`）：每行先 `minorAmounts`、再累加 `totals`；
  5. `totals.gross === 0n` 报 `lines` / `decimal`（`:262`），**在所有逐行 `checkedMinor` 之后**；返回值（`:263–271`，键顺序固定）。
- **测试**：`packages/core/test/domain/trade-calculator.test.ts`（474 行，28 个用例）直接调用；`packages/infra/test/application/trade-documents.test.ts` 等经应用服务间接覆盖。
- 文件中的注释：`:125` 的 JSDoc（`/** Pure invoice arithmetic. … */`）、`:178` 的 `// Inclusive line rounding preserves rounded net; document rounding allocates exact tax.`，以及 `TradeCalculationLine.taxableCharges` 上的 JSDoc。

### chunk 归属与首屏（S22 回顾行动 3）

| 文件 | 落在哪个 chunk | 依据 |
| --- | --- | --- |
| `packages/core/src/domain/trade-calculator.ts`（改）与新文件 | **不进任何 web chunk** | `packages/web/src` 不导入 `@erp/core/domain` 或 `@erp/core/application`（`0de5134` 上 `git grep` 计数 0）；web 只用 `@erp/core/contracts` |
| 首屏 | **±0** | 同上；由 R7 的构建测量确认 |

## 范围与决定

1. **不改行为与错误先后**（D550）。对任何输入，返回的 `TradeCalculation`（键、值、键顺序、数组顺序）与抛出的错误（构造器、`code`、`issue` 全部字段、`message`）都不变；同一输入同时违反多条规则时，**先报的那条不变**。只改代码组织，不修 bug；拆分时发现的疑似缺陷登记在 PR 正文，留作后续任务。
2. **导出与类型不动**：`trade-calculator.ts` 的运行时导出集合（`roundTradeRatio`、`calculateTrade`）与导出类型集合不变，各导出类型与两个导出函数签名的源文本不变（只归一空白）；`@erp/core/domain` 的再导出集合不变（R2）。
3. **拆分方式**：
   - `calculateTrade` 留在 `trade-calculator.ts`，只做“文档级检查 → 逐行准备 → 整单舍入分摊 → 逐行结果与合计 → 毛额为 0 检查 → 组装返回值”的编排，≤ 50 行；
   - 文档级检查、单行校验与准备（返回 `WorkingLine`）、按组分摊整单舍入、单行结果（返回 `CalculatedTradeLine` 与该行未舍入金额）可以各成为顶层函数，以显式参数传递；`ids`、`groups`、`totals` 仍是 `calculateTrade` 每次调用新建的局部值，不得改为模块级变量（R5b）；
   - **逐行仍用 `Array.from(input.lines, …)`**：稀疏数组的空位在 base 上被当作 `undefined` 并报 `lines.<i>` / `shape`；改用 `map` / `forEach` 会跳过空位，属行为变化（R4 直接断言 1）；
   - **错误先后**：单行检查的先后（第 2 步所列）与“第 i 行全部检查（含 `basis` 溢出）完成后才处理第 i+1 行”不变；`totals.gross` 检查仍在全部逐行 `minorAmounts` 之后；
   - 每行的 `roundingSource.group` 仍是该行自己的四元组数组（不同行之间不共享引用）。
4. **私有工具**：`invalid`、`shape`、`decimal`、`percent`、`halfUp`、`minorAmounts`、`decimalUnit`、`percentUnit`、`WorkingLine` 可以留在原文件，也可以原样搬到新文件并导出给本任务的文件使用；`roundTradeRatio` 仍由 `trade-calculator.ts` 定义或以 `export { … } from` 再导出，并在 R2 中证明导出集合不变。
5. **注释与字面量**：`:125` 的 JSDoc 仍紧贴 `calculateTrade`；`:178` 的注释随 `lineTax` 的计算一起搬移，原文不变，仍紧贴其前。`100`、`"trade-v1-half-up-largest-remainder"`、正则、`0n` 等都是规则值；本任务**不**新增具名常量，原文不变。
6. **文件**：新文件放在 `packages/core/src/domain/`（平铺结构，不新建子目录），以 `trade-calculation-` 开头按职责命名（例如 `trade-calculation-values.ts`、`trade-calculation-lines.ts`、`trade-calculation-rounding.ts`），不得与该目录现有文件重名。新文件**不**加入 `domain/index.ts` 的再导出；它们导入 `checkedMinor`、`DomainError` 时沿用原写法（从 `./index.ts` 导入）；新文件的模块顶层不得在加载时调用任何导入的函数（R5b），以免受导入环的加载顺序影响（`10n ** …`、`100n * decimalUnit` 这类字面量运算不算调用）。
7. **不改**：
   - `packages/core/src/domain/` 下其他现有文件（含 `index.ts`、`trade-documents.ts`、`trade-master.ts`）；`packages/core/src/application/**`（含两个调用方）、`packages/core/src/contracts/**`；
   - `packages/core/test/**`、`packages/infra/**`、`packages/web/**`；
   - `scripts/**`（含 `scripts/slot/`、`scripts/measure/`）、`scripts/test-shard-weights.json`、`package.json` / lock、`vitest.config.ts`。

## 冲突域

- core-domain:trade-calculator：只改 `packages/core/src/domain/trade-calculator.ts`，并新增同目录下 `trade-calculation-*.ts`（决定 6）。
- 取证所需的观测点和新增测试文件：无（R4 驱动不提交）。
- 受影响的 e2e 断言（S13 回顾行动 1）：所有贸易单据场景（采购 / 销售发票录入、预览、过账、贷项、核销）**必须继续成立**；合并前由 R3 与 R4 保证，合并后由 R8b 的 main Full 复核；**须随本任务改**：无。
- 受影响的文档引用（D460）：`git grep -n -F "trade-calculator.ts" -- docs design` 在 `0de5134` 上命中 1 行，是当时的事实记录，不改。
- 与在途任务逐文件不相交：REFAC-29 只改 `packages/web/src/PeriodClose.tsx` 与 `period-close/`；REFAC-26 只改 `packages/infra/src/storage/trade-documents.ts` 与同目录 `trade-document-*.ts`。三者没有共享文件。本任务与 REFAC-26 都会运行 `infra` 项目的测试（R3），但都不改测试文件。

## 验收

### base 失败、head 通过

| 编号 | 检查 | base `0de5134` | head 要求 |
| --- | --- | --- | --- |
| R6a | `node fnlen.cjs packages/core/src/domain`（口径同 S16–S24）中 `calculateTrade` 的行数 | **144**（失败） | `calculateTrade` ≤ 50；本任务新增或改动的函数都 ≤ 80 |
| R6b | `trade-calculator.ts` 的总行数（`(Get-Content <file>).Count`） | **284**（失败：编排函数之外承载全部逐行与分摊逻辑） | ≤ 160；新文件各 ≤ 150 |

### 两侧都须成立的不变量

- **R1 范围**：`git diff --name-only <base> <head>` 只含 `packages/core/src/domain/trade-calculator.ts` 与同目录新增的 `trade-calculation-*.ts`；决定 7 所列文件的 diff 为空。不加迁移。
- **R2 导出不变**：用 `@babel/parser`（插件 `typescript`）解析，口径同 REFAC-14 R2：`trade-calculator.ts` 的导出名集合（运行时与类型）与 base 相同；7 个导出类型与 2 个导出函数签名的源文本相同（只归一空白）；在 base 与 head 上各用 node 导入 `@erp/core/domain`，打印 `Object.keys` 排序结果，两侧相同。新文件的导出只在本任务文件内使用，PR 正文附 `git grep` 结果。`npm run typecheck` 与 `npm run check:boundaries` 通过。
- **R3 既有测试原样通过**：`npx vitest run --project core --project infra --project infra-isolated` 全部通过；测试文件 diff 为空。PR 正文附汇总行原文，base 与 head 各一次；有失败时逐个列出，并附只对失败文件的串行重跑原文（`--no-file-parallelism`）。
- **R4 返回值与错误等价**（送审证据，驱动不提交，不加常驻 CI 用例）：
  - **驱动**：临时 vitest 脚本（例如 `packages/core/test/zz-r30-probe.test.ts`，送审前删除），在 base 与 head 上从源文件导入 `calculateTrade`，用同一组虚构输入逐个直接调用。被测函数是纯函数，不需要委托包装对象；若驱动为输入加包装，须照 REFAC-17 R4 用普通委托对象、不用 `Proxy`。可借用 `core/test/domain/trade-calculator.test.ts:10–34` 的 `tax`、`row`、`document` 构造。
  - **记录与编码**（复用 REFAC-17）：每个用例记录返回值（确定性 JSON 编码，`bigint`、`undefined` 等按 REFAC-17 规则编码）或抛出的错误（构造器名、`code`、`issue` 全部字段——`undefined` 也要编码、`message`）；同一驱动连续两次运行的输出逐字节相同。驱动须带 REFAC-17 的自测（a），并加一条：`encode({ k: undefined })` 与 `encode({})` 不同。任一自测失败即 R4 失败。
  - **用例**至少包含：
    - 成功路径：`ap` / `ar` × `exclusive` / `inclusive` × `line` / `document`（8 种组合各 1 个）；含折扣与 `taxableCharges` 的行；`zero` 与 `exempt` 行；同一单据中两个税组交错排列（整单舍入按组分摊）；`deductiblePercent` 为 0、50、100；`scale` 为 0 与 4；100 行；
    - 每个 `invalid` 调用点至少一个失败用例（`calculateTrade` 内 10 处，外加经由参数触发的 `shape` 内 1 处、`decimal` 内 2 处、`percent` 内 1 处），以及 `checkedMinor` 抛错的两类：`scale` 非法（`issue` 为 `undefined`）与金额溢出（`OVERFLOW`）；
    - **错误先后**：下列“直接断言”2–8 的输入。
  - **判定**：base 与 head 每个用例的记录逐字节相同（PR 正文附两侧输出的 SHA-256 与比较结果）；并且**直接断言**（只比两侧相同不够；以下期望值都由设计角色在 base `0de5134` 上用临时驱动实测，驱动已删除）。下文 `row()`、`document()` 指 `trade-calculator.test.ts:16–34` 的构造（`ap`、USD、scale 2、`exclusive`、`line`、一行 `L1`：数量 1、单价 `73.19`、税 `VAT` 12% 可抵扣 50%）；错误写作 `code` / `issue.path` / `issue.rule`，全部为 `DomainError`，`INVALID_INPUT` 的 `message` 为 `Invalid projection input.`，`OVERFLOW` 的为 `The exact integer range was exceeded.`：
    1. **稀疏数组**：`lines` 为长度 2、下标 0 为空位、下标 1 为合法行 → `INVALID_INPUT` / `lines.0` / `shape`；
    2. `side: "x"` 且 `priceMode: "y"` → `side` / `shape`；`currency: "usd"` 且 `scale: 9` → `currency` / `currency`；`scale: 9` 且 `lines: []` → `INVALID_INPUT`，`issue` 为 `undefined`；`document()` 多一个键 `extra` → `document` / `shape`；101 行 → `lines` / `shape`；
    3. 第 0 行 `unitPrice: "x"`、第 1 行与第 0 行同 `id` → `lines.0.unitPrice` / `decimal`；两行同 `id` 且都合法 → `lines.1.id` / `shape`；
    4. `id: " "` 且 `tax: {}` → `lines.0.id` / `shape`；
    5. `ratePercent: "101"` 且 `deductiblePercent: "x"` → `lines.0.tax.ratePercent` / `percent`；`treatment: "zero"`、`ratePercent: "5"` 且 `deductiblePercent: "x"` → `lines.0.tax.deductiblePercent` / `decimal`；只有 `treatment: "zero"`、`ratePercent: "5"` → `lines.0.tax.ratePercent` / `tax`；
    6. `quantity: "0"` 且 `unitPrice: "x"` → `lines.0.quantity` / `decimal`；`taxableCharges: "0.001"`（scale 2）→ `lines.0.taxableCharges` / `decimal`；
    7. 第 0 行数量与单价都为 `9999999999999999`、第 1 行 `unitPrice: "x"` → `OVERFLOW`，`issue` 为 `undefined`（第 0 行溢出先于第 1 行校验）；
    8. 唯一一行 `unitPrice: "0"`、`taxableCharges: "0.00"` → `lines` / `decimal`；
    9. **整单舍入**：`ar`、`document`、三行 `A`、`B`、`C`，单价 `0.05`、税率 10% → 行税 `[1, 1, 0]`，`lineRoundedTax` `[1, 1, 1]`，`adjustment` `[0, 0, -1]`，单据 `tax` 为 2（余数相同按行序补 1）；
    10. `document()` 的结果：`[net, tax, gross, deductibleTax, nonDeductibleTax, expense, cashDiscountBase]` 为 `[7319, 878, 8197, 439, 439, 7758, 7319]`；同单据改 `priceMode: "inclusive"`、单价 `81.97` → `net` 7319、`tax` 878、`gross` 8197、`roundingSource.exactTaxDenominator` 为 `"112000000"`；
    11. **键顺序**：返回值键为 `algorithm, currency, scale, priceMode, rounding, net, tax, gross, deductibleTax, nonDeductibleTax, expense, cashDiscountBase, lines`；行键为 `id, taxCode, treatment, net, tax, gross, deductibleTax, nonDeductibleTax, expense, cashDiscountBase, roundingSource`；`roundingSource` 键为 `lineIndex, group, exactTaxNumerator, exactTaxDenominator, lineRoundedTax, adjustment`；
    12. **不共享、不改输入**：断言 9 的结果中 `lines[0].roundingSource.group !== lines[1].roundingSource.group`（同组两行也各有自己的数组，JSON 比较看不出，须单独断言）；调用前后 `JSON.stringify(input)` 相同。
    base 上任一直接断言不成立，先停下并向协调者报告。PR 正文附驱动、用例清单、比较结果与直接断言结果。
  - **驱动原件**：PR 正文贴驱动**原文件字节的 base64**，或同时写出两种 SHA-256：原始字节、按 UTF-8 解码并把换行归一为 LF 后的字节。只给一种哈希不算满足。
- **R5 结构规则**（静态，评审按代码与 PR 表格核对）：
  - **R5a 原文搬移**：`invalid`、`shape`、`decimal`、`percent`、`halfUp`、`minorAmounts` 的函数体（若搬移），单行校验与准备的语句序列（`:148–199`），整单分摊的循环体（`:203–219`），逐行结果的回调体（`:232–260`），base 与 head 逐字比较（只归一缩进；为传参把自由变量改为参数的替换须逐处列表说明）；`:178` 注释原文不变。不同且未列明即失败。
  - **R5b 无模块级可变状态**：新文件与 `trade-calculator.ts` 的模块顶层只有 `import` / `export`、类型与接口、函数声明与 `const` 常量（不含 `let`、可变容器，且不在加载时调用导入的函数）；PR 正文附 Babel AST 检查脚本的输出。
  - **R5c 错误调用点不变**：base 与 head 中 `invalid(` 调用的实参原文多重集相同（base 共 15 处调用：`calculateTrade` 内 10 处，`shape`、`decimal`、`percent`、`roundTradeRatio` 内 5 处；Babel AST 抽取，PR 正文附两侧列表与比较结果）；`checkedMinor(` 调用的实参原文多重集相同（只归一空白；为传参改名的逐处说明）。
  - **R5d 依赖方向**：新文件之间的导入单向无环，`trade-calculator.ts` 位于顶端；新文件不从 `./trade-calculator.ts` 导入运行时值。PR 正文附导入图。
- **R6 尺寸**：除上表 R6a、R6b 外，每个新函数满足 ②（≤ 80 行、嵌套 ≤ 3 层）；PR 正文列出所有超过 50 行的函数，附计数行数与最深层数（base 与 head 两列）。
- **R7 打包字节**：首屏与全部 chunk **±0**。用 `scripts/measure/bundle-measure.mjs --d454`（不传 `--route` / `--chunk`，即全部 ±0），写明脚本所在的提交 SHA；base 为最终送审 head 的实际合并基。出现任何非 0 差异即停下报告。
- **R8 质量门**：
  - **R8a 合并前**：`typecheck`、`lint`、`check:boundaries`、CI-02 预检通过；PR CI（`ci.yml`）绿。
  - **R8b 合并后检查（不作合并门）**：合并后第一次覆盖该合并提交的 main Full 须绿，含所有贸易单据相关的真实 Chrome 场景；失败时报协调者，按 D456 暂停后续合并。
- **R9 可读性一节**：PR 正文按下节逐条说明。

## 测试命令

```powershell
npx vitest run --project core packages/core/test/domain/trade-calculator.test.ts
npx vitest run --project core --project infra --project infra-isolated
npm run typecheck; npm run lint; npm run check:boundaries
node scripts/measure/bundle-measure.mjs --base <合并基全 SHA> --head <head 全 SHA> --work <新目录> --d454
```

## 性能考虑

- 不跑 Bench：算法与数据结构不变（同样的 `Set`、`Map`、`JSON.stringify` 分组、组内一次排序），只多若干函数调用；没有数据库访问。若拆分引入额外的遍历或复制（例如为传参复制 `lines` 或 `groups`），PR 正文须说明并给出理由，否则评审退回。
- 不进打包产物（R7）。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥：

- **②**：本任务就是为满足 ② 而做。`calculateTrade` 从 144 行拆到 ≤ 50 行，其余函数 ≤ 80 行（R6a）。
- **③**：`trade-calculator.ts`（284 行）拆后 ≤ 160 行，新文件各 ≤ 150 行（R6b）。PR 正文贴 `git diff --numstat`。
- **①**：函数名表达规则，例如 `checkedTradeDocument`、`workingTradeLine`、`allocateDocumentTax`、`calculatedTradeLine`；不用 `step1`、`part2`、`helper`。
- **④**：读者能在 `calculateTrade` 中一屏看出“文档检查 → 逐行 → 整单分摊 → 结果与合计 → 毛额检查”；参数显式，不用上下文大对象隐藏依赖。
- **⑤**：不适用（决定 5）。
- **⑥**：保留 `:125` 与 `:178` 的注释并紧贴其代码；可以在逐行处加一行注释说明“用 `Array.from` 以把稀疏数组的空位当作 `undefined` 校验”，不加其他注释；不留调试输出。
- **测试耗时**：本任务不改测试；R4 驱动不提交。PR 正文附 `core` 与 `infra` 项目在 base 与 head 上的耗时（vitest 汇总行原文），两侧差异 > 20% 时说明原因。

## 用户可见变化

- 无。发票与单据的金额、税额、预览与错误提示都不变（R3、R4）。

## 证据要求

- **不需要浏览器时段**：行为等价由 R3 与 R4（返回值、错误及错误先后逐字节等价及直接断言）证明；贸易单据的 e2e 场景在 main Full 中运行，作合并后检查（R8b）。R4 与构建在本机运行，须服从协调者的时段静默通知（D442 / D480）。
- **可行性**（S13 回顾行动 4）：设计角色已在 `0de5134` 上用临时 vitest 驱动（`npx vitest run --project core <file> --no-file-parallelism --silent=false`）实测 R4 直接断言 1–12 全部成立，驱动已删除、未提交；`trade-calculator.test.ts` 在同一提交上 28 个用例通过。若某个 `invalid` 调用点在构造的输入上无法触发，PR 正文写明原因并报协调者，不得静默删去。
- PR 正文附：R2 导出比较与 `git grep` 结果；R3 汇总行；R4 驱动（原件 base64 或两种 SHA-256）、用例清单、比较结果与直接断言结果；R5a–R5d 各表；R6 行数表（base 与 head 两列）；R7 的 `bundle-measure.mjs` 完整输出与退出码；可读性一节。R8b 合并后补到 PR 评论。

## 设计自查

- 冲突域与 REFAC-29（web）、REFAC-26（infra storage）逐文件不相交；不是页面拆分；不加迁移；不碰 `scripts/slot/`、`scripts/measure/`。
- R6a / R6b 的 base 数字、R5c 的调用点数与 R4 直接断言的期望值都在 `0de5134` 上实测。
- 只改代码组织；疑似缺陷（若有）登记后另排任务。
