# REFAC-37：拆分维度规则 `packages/core/src/domain/dimensions.ts`（不改行为）

- Sprint：S30（[计划](S30.md)）
- 类型：重构（core 领域纯函数）
- 优先级：P2
- 决定：[D614](S30.md#s30-期间决定)：REFAC-37 不改行为——只改 `packages/core/src/domain/dimensions.ts` 的代码组织（拆出同目录 `dimension-*.ts`），`dimensions.ts` 的 6 个运行时导出与 3 个导出类型及其签名、`compileDimensionRules` 的编译期检查与只含 `resolve` 的返回对象、`resolve` 与 `validateDimensionConfig` 的返回值、抛出的错误及错误先后都不变；不改测试文件、不加迁移、不修疑似缺陷。细则见“范围与决定”1–8。
- 建议分支：`refac-37-split-dimension-rules`
- 来源：[S30 D609](S30.md#s30-期间决定)；验收基线为 [S30 范围与验收](S30.md#范围与验收)第 4 行与[三项 REFAC 共用：可读性与嵌套复验](S30.md#三项-refac-共用可读性与嵌套复验)，本任务书不得放宽。
- 模板：[REFAC-30](REFAC-30-trade-calculator-split.md)（core 纯函数：直接调用、返回值与错误逐字节等价、错误先后直接断言、错误调用点多重集不变）；错误先后的写法同 [REFAC-20](REFAC-20-journal-plan-split.md)；记录与编码规则沿用 [REFAC-17 R4](REFAC-17-prepare-trade-action-split.md#两侧都须成立的不变量)。
- 迁移：**不加**。
- 浏览器时段：**不需要**：被测对象是纯函数，等价由 R3、R4 在 node 中证明；`packages/web/src` 不导入本模块（见“chunk 归属”）。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 为什么是它

- S30 计划第 4 名（[S30.md:34](S30.md)）：`compileDimensionRules` 124 行（内含 `resolve` 100 行）、`validateDimensionConfig` 106 行，超过[路线图 ②](../roadmap.md#5-团队流程) 的 80 行；按 ② 原文（`design/roadmap.md:91`），内层具名函数单独受约束，外层行数包含内层。
- 它是维度规则的入口：配置写入前由 `validateDimensionConfig` 校验，过账、统计事件与基准测试经 `compileDimensionRules(...).resolve(...)` 求出每行维度及其来源（调用方见“现状”）。读者最常要弄懂“来源覆盖顺序、派生、结构约束与错误先后”。
- **纯函数**：不读写数据库、不取时钟、不调用 AI；等价可直接用“同一输入 → 同一输出或同一错误”证明。

## 现状（main `4d296bf`）

下文 `file:line` 都按 `4d296bf`（S30 计划合并提交）。`git diff --stat bae5d59 4d296bf -- packages` 无输出，`packages/` 下源码与 `bae5d59` 相同。

- `packages/core/src/domain/dimensions.ts` 共 **370** 行（`(git show 4d296bf:<file>).Count`）。
  - 运行时导出（6 个）：`dimensionError`（`:52–54`）、`checkedDimensionDay`（`:55–63`）、`dimensionKey`（`:64–65`）、`validateDimensionConfig`（`:94–199`）、`compileDimensionRules`（`:200–323`）、`dimensionBalance`（`:324–370`）。
  - 导出类型（3 个）：`DimensionMap`（`:3`）、`DimensionConfig`（`:11–36`）、`DimensionFieldIssue`（`:37–51`）。
  - 模块私有：接口 `Base`（`:4–10`），函数 `effective`（`:66–67`）、`ordered`（`:68–69`）、`orderedRules`（`:70–93`）。
  - 内层具名函数：`validateDimensionConfig` 内 `reference`（`:132–134`）、`map`（`:135–142`）、`list`（`:143–147`）；`compileDimensionRules` 内 `matches`（`:219–220`）与返回对象的方法 `resolve`（`:222–321`）；`resolve` 内 `apply`（`:235–252`）。
  - 文件从 `./index.ts` 导入 `DomainError`、`checkedMinor`、`type Account`（`:1`），`domain/index.ts:2` 又以 `export * from "./dimensions.ts"` 再导出——现有导入环。
- **直接导入本模块路径的文件**（命令 `git grep -n -F "./dimensions.ts" 4d296bf -- packages/core/src/domain`，3 行）：`domain/index.ts:2`（再导出）、`domain/index.ts:11`（`import type { DimensionFieldIssue }`）、`domain/trade-master.ts:10`（`import type { DimensionConfig }`）。其他调用方经 `@erp/core/domain` 或 `./index.ts` 取用。
- **调用方**（命令 `git grep -n -w -E "compileDimensionRules|validateDimensionConfig|dimensionBalance|checkedDimensionDay|dimensionKey|dimensionError" 4d296bf -- packages ":!packages/core/src/domain/dimensions.ts"`，产品代码与基准部分）：
  - `compileDimensionRules`：`core/src/application/business-event-ledger.ts:68`（编译后立即 `.resolve`）；`core/src/domain/journal-plan-context.ts:35`（`.resolve` 在 `:66`），类型位置 `journal-plan-context.ts:25`、`domain/journals.ts:71`（`ReturnType<ReturnType<typeof compileDimensionRules>["resolve"]>`）；`infra/bench/sqlite.ts:53`、`:71`。
  - `validateDimensionConfig`：`core/src/application/dimensions.ts:78`、`infra/src/storage/legacy-import.ts:463`。
  - `dimensionKey`、`dimensionError`：`core/src/application/dimensions.ts:45`、`:74`、`:93`。
  - `checkedDimensionDay`：`core/src/domain/journals.ts:191`。
  - `dimensionBalance`：`core/src/domain/journal-plan-lines.ts:71`；`infra/bench/sqlite.ts:75`。
- **实测**（[S30 统一量法](S30.md#s30-统一量法)，`node <保存位置>\s30-measure.cjs 4d296bf packages/core/src/domain/dimensions.ts`；节选超过 80 行或嵌套超过 3 层的函数，完整输出见“可读性”）：

  ```text
  24	4	packages/core/src/domain/dimensions.ts:70-93	orderedRules
  106	4	packages/core/src/domain/dimensions.ts:94-199	validateDimensionConfig
  124	1	packages/core/src/domain/dimensions.ts:200-323	compileDimensionRules
  100	5	packages/core/src/domain/dimensions.ts:222-321	resolve
  ```

- **`validateDimensionConfig(config, catalog)` 的检查顺序**（R4 直接断言覆盖）：
  1. 形状与窗口（`:98–125`）：`code` 按 `kind` 选正则 → `revision` → `name`（仅 `dimension` / `value`）→ `account`（仅 `balance`）→ `from` → `to`（`checkedDimensionDay`）→ 序列化超过 64000 字节或 `active` 非布尔（path `form`）→ `from > to`（`to` / `window`）；
  2. 引用（`:126–150`）：每次调用新建 `definitions`、`values` 两个 Map；`value` / `balance` 的 `dimension` → `defaults` / `derivation` 的 `values`；`map` 内先查键数 > 32，再逐键查维度引用、值引用；
  3. `derivation`（`:151–162`）：`when` 引用 → `when` 或 `values` 为空（`when` / `required`）→ 与目录中其他有效派生规则一起排序检查环（`orderedRules`，`when` / `cycle`）；
  4. `structure`（`:163–198`）：`allowed` 或 `conditionals` 超过 100 → `required`、`optional`、`forbidden` 三个列表依次（每个列表：> 32、重复、逐项引用）→ 跨列表重复 → `fixed` 引用 → `fixed` 含禁用维度 → 逐个 `allowed`（引用、含禁用维度、按排序后签名查重）→ 逐个 `conditionals`（`when`、`fixed`、`required`、含禁用维度）。
- **`compileDimensionRules(catalog)`**：编译时（`:201–220`）建 `definitions`、`values`、`defaults`、`structures` 四个 Map，并对有效派生规则调用 `orderedRules`（有环在**编译时**抛 `when` / `cycle`，不等到 `resolve`）；返回只有 `resolve` 一个键的对象（方法简写，不用 `this`）。
- **`resolve(input)` 的顺序**（`:229–320`）：`checkedDimensionDay(input.day)` → 默认值按 `new Set(["LEDGER", input.account])` 顺序（`:253–257`）→ `master` → `header` → `explicit`（来源 `line`）；`apply` 对每个键先查键与值的形状（`dimensions` / `shape`）→ 按 `orderedRules` 顺序逐条派生：先查本轮写入冲突（`derivation.<code>.<key>` / `conflict`）再 `apply`（`:261–274`）→ 结构：条件固定值不动点循环（签名重复或 `seen.size > 200` 报 `conditionals` / `cycle`，冲突报 `fixed.<key>` / `conflict`）→ `explicit` 与固定值冲突 → `apply` 固定值 → 必填 → 禁用 → 组合（`:275–309`）→ 最后按 `result` 插入顺序查维度与值的引用及有效期（`:310–319`）。返回 `{ dimensions: ordered(result), dimensionOrigins: ordered(origins) }`（`:320`）。
- **测试**：`packages/core/test/domain/dimensions.test.ts`（294 行，5 个 `it`：`:31`、`:74`、`:145`、`:226`、`:250`）直接调用三个导出函数，`4d296bf` 工作树上 5 个用例通过；`packages/infra/test/http/dimensions.test.ts` 经应用服务与 HTTP 间接覆盖。

### chunk 归属与首屏（S22 回顾行动 3）

| 文件 | 落在哪个 chunk | 依据 |
| --- | --- | --- |
| `dimensions.ts`（改）与新文件 | **不进任何 web chunk** | `git grep -n -E "@erp/core/(domain|application)" 4d296bf -- packages/web/src` 计数 0；`packages/web/test` 有 2 行（`ledger-reports.test.tsx:4`、`period-close.test.tsx:5`，测试文件，不打包） |
| 首屏 | **±0** | 同上；由 R7 确认 |

## 范围与决定

1. **不改行为与错误先后**（D614）。对任何输入，三个被拆函数的返回值（键、值、键顺序、数组顺序）与抛出的错误（构造器、`code`、`issue` 全部字段、`message`）都不变；同一输入同时违反多条规则时，先报的那条不变；错误在编译时还是 `resolve` 时抛出不变。只改代码组织，不修 bug；疑似缺陷登记在 PR 正文，另排任务。
2. **导出与类型不动**：`dimensions.ts` 的 6 个运行时导出名与 3 个导出类型名不变，各自签名的源文本不变（只归一空白）；`@erp/core/domain` 的再导出集合不变。导出函数的定义可以搬到新文件，再由 `dimensions.ts` 以 `export { … } from` 再导出（R2 证明集合不变）。
3. **`compileDimensionRules` 与 `resolve`**：
   - 四个 Map 与 `rules` 仍在 `compileDimensionRules` 调用时一次建好（编译后修改 `catalog` 数组不影响已编译结果，R4 断言 13）；`orderedRules` 仍在编译时调用；
   - 返回值仍是只含 `resolve` 的对象字面量，`resolve` 仍为方法简写，参数类型源文本（`:222–228`）不变；方法体可委托给顶层函数，依赖以显式参数传递；
   - `result`、`origins`、`writes`、`seen`、`required` 仍是每次 `resolve` 调用新建的局部值，不得改为模块级或编译期共享变量（R5b）；
   - 来源顺序、派生的“先查冲突再 `apply`”、不动点循环中 `seen.size > 200` 的判断、必填 → 禁用 → 组合 → 引用的先后都不变。
4. **`validateDimensionConfig`**：`definitions`、`values` 仍每次调用新建；第 1–4 步（见“现状”）及每步内部的先后不变；`reference`、`map`、`list` 可提为顶层函数，以显式参数传入 Map；`orderedRules` 仍只为检查环而调用，返回值不用。
5. **`orderedRules`**：本身 24 行，但按 [S30 统一量法](S30.md#s30-统一量法)嵌套为 4（见“可读性”），S30 规定被拆文件内每个函数嵌套 ≤ 3（[S30.md:61](S30.md)、`:97`），故一并降层：可把 `:76–80` 的依赖判断提为具名函数；排序结果与报环条件不变。
6. **重复**：`JSON.stringify(ordered(…))` 在本文件出现 3 次（`:184`、`:281`、`:293`），都是“维度映射按键排序后的签名”，按 ④ 抽为一个具名函数；其余重复片段的去向见“可读性 · 重复”。
7. **文件**：新文件放在 `packages/core/src/domain/`，以 `dimension-` 开头按职责命名（例如 `dimension-config-validation.ts`、`dimension-resolution.ts`、`dimension-rule-order.ts`），`4d296bf` 上该目录无 `dimension-` 开头的文件（`git ls-tree --name-only 4d296bf packages/core/src/domain/`）。新文件不加入 `domain/index.ts`；从 `./dimensions.ts` 只可 `import type`，运行时依赖放在新文件之间或沿用 `./index.ts` 导入（`DomainError` 等）；新文件模块顶层不得在加载时调用导入的函数（R5b）。正则、`32`、`100`、`200`、`64000` 等规则值原文不变，本任务不新增具名常量。
8. **不改**：`packages/core/src/domain/` 下其他现有文件（含 `index.ts`、`journals.ts`、`journal-plan-*.ts`、`trade-master.ts`、`ai-assistant.ts`）；`packages/core/src/application/**`、`packages/core/src/contracts/**`；`packages/core/test/**`、`packages/infra/**`（含 `bench/`）、`packages/web/**`；`scripts/**`、`package.json` / lock、`vitest.config.ts`。

## 冲突域

- core-domain:dimensions：只改 `packages/core/src/domain/dimensions.ts`，并新增同目录 `dimension-*.ts`（决定 7）。PR 正文附 `git diff --name-only <base>...<head>` 原始输出。
- 取证所需观测点与新增测试文件：无（R4 驱动不提交）。
- 与 S30 其他泳道逐文件不相交：REFAC-35 改 `packages/web/src/Reports.tsx` 与 `packages/web/src/reports/`；REFAC-36 改 `packages/infra/src/storage/master-data.ts` 与同目录 `master-data-*.ts`（`master-data.ts:19` 导入的是 `infra/src/storage/dimensions.ts`，不是本文件）；KDOC-14 改 `docs/flows/invoice-detail-flow.md`。四者无共享文件。
- 受影响的 e2e 断言：涉及维度的过账、统计事件、维度配置场景须继续成立，合并前由 R3、R4 保证，合并后由 R8b 复核；须随本任务改：无。
- 受影响的文档引用：`git grep -n "domain/dimensions.ts" 4d296bf -- docs README.md` 无输出；`design/reviews/M0.md:39` 的 `dimensions.ts:307` 是当时提交上的历史证据，不改（[S30.md:155](S30.md)）。

## 验收

### base 失败、head 通过

量法用 [S30 统一量法](S30.md#s30-统一量法)（命令见“可读性”）；base 为最终送审 head 的实际合并基（当前 `4d296bf`）。

| 编号 | 检查 | base `4d296bf` | head 要求 |
| --- | --- | --- | --- |
| R6a | 函数长度（不计空行与纯注释行） | `compileDimensionRules` **124**、`validateDimensionConfig` **106**、`resolve` **100**（失败） | `dimensions.ts` 与新文件中每个函数 ≤ 80（外层含内层）；`validateDimensionConfig` ≤ 50、`resolve` ≤ 50 |
| R6b | 嵌套深度 | `resolve` **5**、`validateDimensionConfig` **4**、`orderedRules` **4**（失败） | 每个函数 ≤ 3 |
| R6c | 文件行数（`(Get-Content <file>).Count`） | `dimensions.ts` **370** | `dimensions.ts` ≤ 220；新文件各 ≤ 150 |

### 两侧都须成立的不变量

- **R1 范围**：`git diff --name-only <base>...<head>` 只含 `packages/core/src/domain/dimensions.ts` 与同目录新增的 `dimension-*.ts`；决定 8 所列路径 diff 为空。不加迁移。
- **R2 导出不变**：用 `@babel/parser`（插件 `typescript`）解析，口径同 REFAC-30 R2：`dimensions.ts` 的导出名集合（运行时 6 个、类型 3 个）与 base 相同，签名源文本相同（只归一空白；再导出的函数比定义处）；base 与 head 上各用 node 导入 `@erp/core/domain`，打印排序后的 `Object.keys`，两侧相同；`Object.keys(compileDimensionRules([]))` 两侧都为 `["resolve"]`，`resolve.length` 两侧相同。新文件导出只在本任务文件内使用，PR 正文附 `git grep` 结果。`npm run typecheck`（含 `journals.ts:71`、`journal-plan-context.ts:25` 的类型推导）、`npm run check`、`npm run check:boundaries` 通过。
- **R3 既有测试原样通过**：`npx vitest run --project core` 全部通过，另跑 `npx vitest run --project infra packages/infra/test/http/dimensions.test.ts`；测试文件 diff 为空。PR 正文附汇总行原文，base 与 head 各一次。
- **R4 返回值与错误等价**（送审证据，驱动不提交）：
  - **驱动**：临时 vitest 文件（例如 `packages/core/test/zz-r37-probe.test.ts`，送审前删除），在 base 与 head 上从 `../src/domain/index.ts` 导入，同一组虚构输入直接调用；可借用 `dimensions.test.ts:8–29` 的 `base`、`catalog`（`DEPT`、`COST`、`SITE` 各有值 `A`、`B`）、`structure`（`code: "1000"`）。
  - **记录与编码**：同 REFAC-17 R4（构造器名、`code`、`issue` 全部字段、`message`；返回值确定性 JSON 编码），带其自测；同一驱动连续两次运行输出逐字节相同。
  - **用例**至少包含：下列直接断言的输入；`dimensions.test.ts` 5 个用例中的输入；`account: "LEDGER"`（默认值集合去重）；`mode` 为 `fill` 与 `replace` 的派生；值与维度在有效期外；`explicit` 为 `null` 值；R5c 所列每个 `dimensionError` 调用点至少一个失败用例（无法触发的写明原因并报协调者，不得静默删去）。
  - **判定**：两侧每个用例记录逐字节相同（附两侧输出 SHA-256）；并且**直接断言**下列期望值（设计角色在 `4d296bf` 工作树上用 node 临时脚本实测，脚本未落盘）。记 `val = { ...base, kind: "value", dimension: "DEPT", code: "C", name: "C" }`、`der = { ...base, kind: "derivation", code: "R1", mode: "fill" }`、`S = structure`、`day = "2026-01-15"`、`account = "1000"`；错误全部为 `DomainError` / `INVALID_INPUT` / `message` `Invalid projection input.` / `issue.scope` `dimensions`，下文写作 `path` / `rule`：
    1. `V({ ...val, code: "bad", revision: 0 }, catalog)` → `code` / `shape`；`revision: 0` 且 `from: "x"` → `revision` / `shape`；
    2. `from: "2026-13-01"` 且 `to: "x"` → `from` / `window`；
    3. `active: "yes"` 且 `from > to` → `form` / `shape`；`dimension: "NOPE"` 且 `from > to` → `to` / `window`；
    4. `{ ...der, when: { NOPE: "A" }, values: { ZZZ: "A" } }` → `values.ZZZ` / `reference`（`values` 先于 `when`）；`when: {}, values: {}` → `when` / `required`；`when: { DEPT: "A" }, values: { DEPT: "B" }` → `when` / `cycle`；
    5. 结构：`required: ["DEPT","DEPT"]` 且 `optional: ["NOPE"]` → `required` / `duplicate`；`required: ["DEPT"]` 且 `optional: ["DEPT"]` → `optional.0` / `duplicate`；`forbidden: ["DEPT"]`、`fixed: { DEPT: "A" }`、`allowed: [{ DEPT: "A" }]` → `fixed` / `forbidden`；`allowed` 两个 `{ DEPT: "A" }` 且某个 `conditionals[0].when` 引用 `NOPE` → `allowed.1` / `duplicate`；101 个 `allowed` 且 `required: ["NOPE"]` → `allowed` / `shape`；
    6. **编译时报环**：`compileDimensionRules([...catalog, { ...der, when: { DEPT: "A" }, values: { DEPT: "B" } }])` 不调用 `resolve` 即抛 `when` / `cycle`；
    7. `resolve({ account, day: "2026-02-30", explicit: { dept: "A" } })` → `day` / `window`；同输入 `day` 合法 → `dimensions` / `shape`；
    8. 派生 `R1`、`R2` 都在 `when: { DEPT: "A" }` 时分别写 `COST: "A"`、`COST: "B"`，`explicit: { DEPT: "A" }` → `derivation.R2.COST` / `conflict`；
    9. 结构 `required: ["SITE"]`、`forbidden: ["COST"]`，`explicit: { COST: "A", ZZZ: "A" }` → `dimensions.SITE` / `required`；结构 `required: ["SITE"]`、`fixed: { DEPT: "A" }`，`explicit: { DEPT: "B" }` → `fixed.DEPT` / `conflict`；结构 `forbidden: ["COST"]`、`allowed: [{ DEPT: "B" }]`，`explicit: { COST: "A", DEPT: "A" }` → `dimensions.COST` / `forbidden`；
    10. 两条条件 `{ when: { DEPT: "A" }, fixed: { DEPT: "B" } }`、`{ when: { DEPT: "B" }, fixed: { DEPT: "A" } }`，`header: { DEPT: "A" }` → `conditionals` / `cycle`；结构 `required: ["SITE"]`、`fixed: { SITE: "A" }`、条件 `{ when: { SITE: "A" }, required: ["COST"] }`，`explicit: {}` → `dimensions.COST` / `required`；
    11. 无结构，`explicit: { ZZZ: "A", DEPT: "Q" }` → `dimensions.ZZZ` / `reference`（按插入顺序）；
    12. **来源与键顺序**：目录加 `defaults` `LEDGER` `{ SITE: "A" }`、`defaults` `1000` `{ SITE: "B", DEPT: null }`、`{ ...der, when: { SITE: "B" }, values: { COST: "A" } }`，输入 `master: { DEPT: "A" }`、`header: { DEPT: "B" }`、`explicit: { COST: "B" }` → 返回值 JSON 为 `{"dimensions":{"COST":"B","DEPT":"B","SITE":"B"},"dimensionOrigins":{"COST":[{"source":"line","value":"B"}],"DEPT":[{"source":"defaults:1000@1","value":null},{"source":"master","previous":null,"value":"A"},{"source":"header","previous":"A","value":"B"}],"SITE":[{"source":"defaults:LEDGER@1","value":"A"},{"source":"defaults:1000@1","previous":"A","value":"B"}]}}`；
    13. **编译期快照**：`const cat = [...catalog]; const r = compileDimensionRules(cat); cat.push({ ...S, required: ["SITE"] })` 后 `r.resolve({ account, day, explicit: { DEPT: "A" } })` 成功，`dimensions` 为 `{ DEPT: "A" }`；
    14. **不共享、不改输入**：同一编译结果对同一输入调用两次，两次 JSON 相同，返回对象与 `dimensionOrigins.DEPT` 数组引用不同；调用前后 `JSON.stringify(input)` 相同。
    base 上任一直接断言不成立，先停下报协调者。
  - **驱动原件**：PR 正文贴原文件字节的 base64，或同时给原始字节与“UTF-8 解码、换行归一为 LF”两种 SHA-256。
- **R5 结构规则**（静态）：
  - **R5a 原文搬移**：`apply` 循环体（`:236–251`）、派生循环（`:262–274`）、不动点循环（`:280–298`）、`structure` 校验块（`:164–197`）、`reference` / `map` / `list` 函数体，base 与 head 逐字比较（只归一缩进；为传参改自由变量、以签名函数替换 `JSON.stringify(ordered(…))` 的地方逐处列表）。不同且未列明即失败。
  - **R5b 无模块级可变状态**：`dimensions.ts` 与新文件的模块顶层只有 `import` / `export`、类型与接口、函数声明与不可变 `const`（不含 `let`、可变容器，不在加载时调用导入的函数）；附 Babel AST 检查输出。
  - **R5c 错误调用点不变**：`dimensionError(` 调用的实参原文多重集两侧相同（base 共 33 处：`checkedDimensionDay` 1、`orderedRules` 1、`validateDimensionConfig`（含内层）18、`resolve`（含 `apply`）9、`dimensionBalance` 4；按 `git show 4d296bf:<file> | Select-String "dimensionError\("` 去掉 `:52` 定义行计得，每行一处）；`checkedDimensionDay(` 调用（base 4 处：`:118`、`:119`、`:229`、`:330`）实参多重集相同。Babel AST 抽取，附两侧列表。
  - **R5d 依赖方向**：新文件不从 `./dimensions.ts` 导入运行时值；新文件之间单向无环；附导入图。
- **R7 打包字节**：首屏与全部 chunk **±0**，用 `scripts/measure/bundle-measure.mjs --d454`（`scripts/measure/README.md` 列有该参数），写明脚本所在提交 SHA；任何非 0 差异即停下报告。
- **R8 质量门**：R8a 合并前 `typecheck`、`check`、`check:boundaries`、CI-02 预检通过，PR CI 绿；R8b 合并后第一次覆盖该合并提交的 main Full 须绿，失败报协调者，按 D456 暂停后续合并。

### 测试命令

```powershell
npx vitest run --project core packages/core/test/domain/dimensions.test.ts
npx vitest run --project core
npx vitest run --project infra packages/infra/test/http/dimensions.test.ts
npm run typecheck; npm run check; npm run check:boundaries
node scripts/measure/bundle-measure.mjs --base <合并基全 SHA> --head <head 全 SHA> --work <新目录> --d454
```

`4d296bf` 的根 `package.json` 没有 `lint` 脚本，Biome 检查用 `npm run check`（`biome ci`）。

## 性能考虑

- 不跑 Bench（同 REFAC-30）：算法与数据结构不变（同样的 Map、Set、签名比较、不动点循环），只多若干函数调用；Map 仍只在编译时建一次。若拆分引入额外遍历或复制（例如每次 `resolve` 重建 Map、为传参复制 `result`），PR 正文须说明理由，否则退回。`infra/bench/sqlite.ts:53`、`:71` 调用本模块，不改。
- 不进打包产物（R7）。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程)与 [S30 共用表](S30.md#三项-refac-共用可读性与嵌套复验)。

**量法**（函数长度与嵌套深度共用）：用 [S30 统一量法](S30.md#s30-统一量法) 的 `s30-measure.cjs`（参数 `<rev> <files…>`，经 `git show` 读取指定提交），脚本原文以 S30.md 该节为准，本任务书不另附。把脚本存到仓库外（下记 `<保存位置>`），在仓库根目录运行：

```powershell
node <保存位置>\s30-measure.cjs 4d296bf packages/core/src/domain/dimensions.ts
node <保存位置>\s30-measure.cjs <head> packages/core/src/domain/dimensions.ts @(git diff --name-only --diff-filter=A <base> <head> -- packages/core/src/domain)
```

输出每个具名函数一行：`行数	层数	文件:首行-末行	名称`；内联回调计入所在函数，不单独成行，具名内层函数单独成行。改前数据一律取该脚本在 `4d296bf` 上的输出（设计角色实测，全文）：

```text
3	0	packages/core/src/domain/dimensions.ts:52-54	dimensionError
9	1	packages/core/src/domain/dimensions.ts:55-63	checkedDimensionDay
2	0	packages/core/src/domain/dimensions.ts:64-65	dimensionKey
2	0	packages/core/src/domain/dimensions.ts:66-67	effective
2	1	packages/core/src/domain/dimensions.ts:68-69	ordered
24	4	packages/core/src/domain/dimensions.ts:70-93	orderedRules
106	4	packages/core/src/domain/dimensions.ts:94-199	validateDimensionConfig
3	1	packages/core/src/domain/dimensions.ts:132-134	reference
8	2	packages/core/src/domain/dimensions.ts:135-142	map
5	1	packages/core/src/domain/dimensions.ts:143-147	list
124	1	packages/core/src/domain/dimensions.ts:200-323	compileDimensionRules
2	1	packages/core/src/domain/dimensions.ts:219-220	matches
100	5	packages/core/src/domain/dimensions.ts:222-321	resolve
18	2	packages/core/src/domain/dimensions.ts:235-252	apply
47	2	packages/core/src/domain/dimensions.ts:324-370	dimensionBalance
```

**计层口径**（摘要，以 S30 统一量法为准）：任何不具名的函数体（内联回调，含 IIFE）加 1 层；`if` / `else`、循环、`switch`、`try` / `catch` 的受控语句不论是否带花括号都加 1 层；else-if 与它前面的 if 同层；具名内层函数单独计。S30 初测（[S30.md:61](S30.md)）的 `validateDimensionConfig` 3、`resolve` 3 与“只给带花括号的块计层”的变体一致；改前数据以统一量法的输出为准（`resolve` 5、`validateDimensionConfig` 4、`orderedRules` 4）。

| 维度 | 要求 | 改前（`4d296bf`，上述量法） | PR 正文须列的改后数据 |
| --- | --- | --- | --- |
| 函数长度（②） | 每个函数 ≤ 80；`validateDimensionConfig`、`resolve` ≤ 50（R6a） | `compileDimensionRules` 124、`validateDimensionConfig` 106、`resolve` 100、`dimensionBalance` 47、`orderedRules` 24、`apply` 18，其余 ≤ 9 | 脚本对 `dimensions.ts` 与全部新文件的完整输出（base、head 两份）；超过 60 行的函数逐个列行数 |
| 嵌套深度（②） | 每个函数 ≤ 3（R6b） | `resolve` 5（最深处 `:276` if → `:280` for → `:287` for → `:288` for → `:289` if 体；`:294` 同为 5）、`validateDimensionConfig` 4（`:163` if → `:170` for → `:171` for → `:172` if 体）、`orderedRules` 4（`:73` while → `:74`、`:76`、`:79` 三层内联回调）；`map`、`apply`、`dimensionBalance` 2，其余 ≤ 1 | 同一输出中每个函数的层数；无 > 3 |
| 文件长度（③） | `dimensions.ts` ≤ 220；新文件各 ≤ 150；均非热点（< 800） | `dimensions.ts` 370 | 逐文件 `git diff --numstat <base> <head>` 与拆后行数 |
| 重复（④） | 拆出的函数不得复制同一规则或流程；第三次出现即抽取 | 见下表 | 每处去向 |
| 命名（①） | 新函数、新文件名表达业务含义；禁用 `step1`、`part2`、`helper`、`utils` 及同类序号名 | — | 新增名称清单，每个一句职责 |

**被拆函数中现有的重复片段**（`4d296bf`）：

| 编号 | 片段 | 位置 | 要求 |
| --- | --- | --- | --- |
| D-1 | 排序后签名 `JSON.stringify(ordered(…))` | `:184`、`:281`、`:293` | 3 处，抽为一个具名函数（决定 6） |
| D-2 | 按 `kind` 建目录索引 `new Map(catalog.filter(…).map(…))`；`definitions`、`values` 两段逐字相同 | `:126–131` 与 `:201–206`；同形 `:207–212` | 可抽取为一个函数；不得新增第三份；抽取后 `validateDimensionConfig` 仍每次调用新建、`compileDimensionRules` 仍编译时建一次 |
| D-3 | 维度代码正则 `/^[A-Z][A-Z0-9_]{0,31}$/u`、值代码正则 `/^[A-Z0-9][A-Z0-9_-]{0,39}$/u` | `:107`、`:238`；`:100`、`:240` | 本文件各 2 处，不强制抽取，不得新增第三份。`contracts/dimensions.ts:4–5`、`domain/ai-assistant.ts:58–59` 也有，超出冲突域，不动 |
| D-4 | “映射含禁用维度” | `:177`、`:182`（同形 `forbidden.some(hasOwn)`）；`:193–194`（写法不同：`Object.keys(…).some(includes)`） | 前两处可抽取；第三处对不可枚举自有属性的结果可能不同，**不得**与前两处合并 |
| D-5 | “同一维度两个不同值 → `conflict`” | `:265–266`（Map）、`:289–290`、`:300–301`（后两处报错实参相同） | 三处条件与数据结构不同；抽取或不抽取均可，PR 正文说明理由；R5c 多重集不得变 |
| D-6 | 派生规则过滤类型守卫 | `:156–158`、`:214–216` | 谓词不同（前者排除同 `code`），不属同一规则，不抽取 |

- **⑤**：不适用（决定 7，规则值原文不变）。
- **⑥**：可在 `resolve` 编排处加一行注释说明来源覆盖顺序；不留调试输出。
- **测试耗时**：不改测试；PR 正文附 `core` 项目 base 与 head 的 vitest 汇总行，差异 > 20% 时说明。

## 用户可见变化

- 无。维度配置的校验提示、过账与统计事件的维度结果及来源都不变（R3、R4）。

## 证据要求

- **不需要浏览器时段**：等价由 R3、R4 证明；涉及维度的 e2e 在 main Full 中运行，作合并后检查（R8b）。本机运行 R4 与构建须服从协调者的时段静默通知（D442 / D480）。
- **可行性**：设计角色在 `4d296bf` 工作树上实测 R4 直接断言 1–14 成立（node 直接导入 `packages/core/src/domain/index.ts`，脚本经标准输入运行、未落盘）；`dimensions.test.ts` 5 个用例通过；`s30-measure.cjs` 在 `4d296bf` 上的输出即“可读性”所列全文。
- PR 正文附：R1 原始输出；R2 导出比较；R3 汇总行；R4 驱动、用例清单、比较结果与直接断言结果；R5a–R5d 各表；`s30-measure.cjs` 的两条运行命令与 base、head 两份完整输出（脚本原文不贴，链接 [S30 统一量法](S30.md#s30-统一量法)）；R7 完整输出与退出码；可读性五项。
- **合并后项**（[S30 执行状态](S30.md#执行状态)）：Product/Design 在合并提交上用 `s30-measure.cjs` 复测 `dimensions.ts` 与新文件的函数长度与嵌套深度，在已合并 PR 下评论命令、输出与合并提交完整 SHA；R8b 结果补到 PR 评论。

## 设计自查

- 冲突域与 REFAC-35、REFAC-36、KDOC-14 逐文件不相交；不加迁移；不改测试；不碰 `scripts/`。
- R6a–R6c 的 base 数字、R5c 调用点数与 R4 直接断言期望值都在 `4d296bf` 上实测。
- S30 统一量法比 S30 初测严（无花括号的受控语句也计层），因此 `orderedRules` 也须降层（决定 5）；S30 未列 `orderedRules`，但其“被拆文件内每个函数”的要求覆盖它。
- 只改代码组织；疑似缺陷登记后另排任务。
