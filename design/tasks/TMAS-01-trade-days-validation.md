# TMAS-01：贸易主数据“天数”字段的整数校验与专用提示

- Sprint：S24（[计划草案](S24.md)）　类型：功能（小，Web）　优先级：P2（D538 原列 P3；REFAC-18 已合并，协调者要求本批优先排）　决定：[D539](S24.md#s24-期间决定)（口径见“设计决定”1–6，依据 [D538](S24.md#s24-期间决定)）　建议分支：`tmas-01-trade-days-validation`
- 来源：[S24 候选](S24.md#候选s24-其余泳道s23-评审后定)“贸易主数据数值字段校验提示（D538）”。#339（REFAC-18）的开发报告：`dueDays` 留空时前端解析器把空值映射为 `null`，而契约不允许为空。D538 定了口径：以契约为准；REFAC-18 不修；排期后按“用户可见变化”验收。
- 迁移：**不加**。浏览器时段：**不需要**（理由见“证据要求”）。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 现状（main `37362e7`）

下文 `file:line` 都按 `37362e7a5c5bebefe127d08fdf3a8acdcff8b4e2`（REFAC-18 #339、REFAC-19 #338、REFAC-20 #337 都已合并）。

- **契约**：`packages/core/src/contracts/trade-master.ts:44–45`，付款条件（`tradeTerms`）的 `dueDays` 与 `discountDays` 都是 `z.number().int().min(0).max(3650)`，不可空。
- **草稿**：`packages/web/src/trade-master/trade-draft.ts` 中，`specific.tradeTerms`（`:14`）为 `dueDays`、`discountDays`、`discountPercent`、`allowPartialDiscount`；新建时默认值 `dueDays: "30"`、`discountDays: "7"`（`:48–49`）。草稿值一律是字符串。
- **解析**：`tradeFieldValue`（`trade-draft.ts:69–86`）是一条 6 个分支的链式条件表达式。两个天数字段走 `:79–82`：`value.trim() ? Number(value) : null`。
- **提交**：`submitTradeDraft`（`trade-editor-commands.ts:25–58`）先按字段逐个解析（`:30–38`），只捕获 `SyntaxError`，并置 `{ path: "data.<字段>", key: "trade.issue.shape" }`；然后整体 `tradeWriteSchema.safeParse`（`:40–55`），失败时取第一条 issue 的路径，键同样是 `trade.issue.shape`。
- **输入框**：`trade-field.tsx:60–61` 把天数字段渲染为 `type="text"` 的 `input`。它们不在 `nullable` 中，所以带原生 `required`。错误路径与字段相符时，输入框带 `aria-invalid` 与 `aria-describedby="trade-error"`（`:27–28`）。
- **错误条**：`trade-editor.tsx:64–66` 为 `<p role="alert" id="trade-error">{error.path}: {t(error.key)}</p>`。
- **标签**：`ui/trade-labels.ts` 的 `trade.issue.shape` 在 `:127`（en，"Invalid field value or unsupported field."）与 `:369`（zh，“字段值无效或含不支持的字段。”）。该文件经 `ui/labels.ts:10` 导入，**在首屏 chunk 中**（见“chunk 归属与首屏”）。

### 现有行为（用户可见的问题）

浏览器中，原生 `required` 先拦下**空串**，这一路与契约一致。其余输入都会到达解析器：

| 输入（天数字段） | 现在的结果 | 问题 |
| --- | --- | --- |
| `"30"`、`" 45 "`、`"007"` | 保存为 30、45、7 | 无 |
| `"  "`（只有空白） | 原生 `required` 不拦；解析为 `null`，`safeParse` 失败，错误条显示通用的“字段值无效或含不支持的字段。” | 提示不说明要求 |
| `"abc"`、`"３０"`（全角） | `Number` 得 `NaN`，`safeParse` 失败，显示通用提示 | 同上 |
| `"-1"`、`"3651"` | `safeParse` 的 `min` / `max` 失败，显示通用提示 | 同上 |
| `"30.0"`、`"1e2"`、`"0x10"` | `Number` 得 30、100、16，**静默保存** | 用户输入的不是整数天数，却被改写后保存 |

测试中直接 `fireEvent.submit` 绕过 `required`，因此空串也会走到 `null` 分支，见 [D537](S24.md#s24-期间决定) 4a。

### chunk 归属与首屏（S22 回顾行动 3，base 实测）

设计角色在 `37362e7` 上运行了 `node scripts/measure/bundle-measure.mjs --base 37362e7a5c5bebefe127d08fdf3a8acdcff8b4e2 --head 37362e7a5c5bebefe127d08fdf3a8acdcff8b4e2 --work <新目录> --d454`。脚本取自 `37362e7`，该文件最后一次改动在 `6156759`。结果为退出码 0、`RESULT: PASS`。

| 文件 | 落在哪个 chunk | 依据 |
| --- | --- | --- |
| `trade-master/trade-draft.ts`、`trade-editor-commands.ts`（改） | 路由入口 chunk `src/TradeMaster.tsx` | 只被 `TradeMaster.tsx` 及同目录文件导入（REFAC-18 决定 6） |
| `ui/trade-labels.ts`（改：每种语言各加 1 个键） | **首屏** | `ui/labels.ts:10` 导入；首屏闭包含 `ui/*`（同 [D520](S23.md#s23-期间决定) 所述） |
| CSS | 不改 | — |

base 数字（屏蔽哈希后的原始 / gzip-9 字节，输出原文行）：

```text
| first-screen | first-screen | 531160 | 531160 | 161115 | 161115 | 0 | ±0 | PASS |
| route | src/TradeMaster.tsx | 38712 | 38712 | 14020 | 14020 | 0 | ±0 | PASS |
| chunk | src/TradeMaster.tsx | 13918 | 13918 | 4987 | 4987 | 0 | ±0 | PASS |
```

## 设计决定（产品负责人，D539）

1. **保留文本框，不改为 `type="number"`**。原因有三：
   - 浏览器的数字输入接受 `1e2`、`-`，且滚轮会改值；
   - 输入非法时 `value` 为空串，用户看到的内容与提交值不一致；
   - jsdom 与浏览器对数字输入的行为不同，测试难以如实覆盖。

   输入框的 DOM 不变：`type`、`required`、`id`、`aria-*` 都不变，不加 `min`、`max`、`inputmode`、`pattern`。
2. **整数规则**（两个天数字段同一规则，单一实现）：
   - 先去掉首尾空白，结果须完全由 ASCII 数字 `0–9` 组成（至少 1 位），且数值 ≤ 3650；
   - 前导零允许，`"007"` 记为 7；
   - 通过时值为 `Number(去空白后的文本)`；
   - 不通过时置 `{ path: "data.<字段>", key: "trade.issue.wholeDays", conflict: false }`，**不发请求**。

   这一规则覆盖空串、只有空白、全角数字、负号、小数点、指数、十六进制与超过 3650 的情况。上下限与契约 `min(0).max(3650)` 相同；契约本身不改。
3. **去掉 `null` 分支**（D538 ①）：`tradeFieldValue` 对天数字段不再返回 `null`。
4. **校验位置与先后**：
   - 该规则在逐字段解析的循环中执行，与 JSON 字段的 `SyntaxError` 处理并列，因此**先于** `safeParse`；
   - 字段顺序不变，第一个出错的字段决定错误条，同一次提交只显示一条错误；
   - 由此带来一处先后变化：付款条件中，若名称、日期等字段（由 `safeParse` 报错）与天数字段同时有误，**现在先报天数字段**。这一变化列入“用户可见变化”，测试 V6 直接断言；
   - 其他字段的报错方式与键都不变。

   实现方式由开发决定，例如：解析器抛出一个只在 `trade-master/` 内定义的错误类（携带标签键），`submitTradeDraft` 的循环与 `SyntaxError` 一起捕获；其他异常原样抛出。写入 PR 正文。
5. **新提示**：新增标签键 `trade.issue.wholeDays`，在 `ui/trade-labels.ts` 中两种语言各一处：
   - zh：“请输入 0–3650 的整数。”
   - en："Enter a whole number from 0 to 3650."

   错误条格式不变，仍为 `<路径>: <提示>`，例如 `data.dueDays: 请输入 0–3650 的整数。`。`data.` 前缀的显示问题不在本任务范围。教学模式文案（`ui/trade-master-teaching.ts`）不改。红绿主题沿用现有错误样式，不改 CSS。
6. **只改 Web**：不改契约、服务端、迁移、种子数据与 e2e 场景。用户文档 `docs/user/trade.md:19` 在“付款条件（到期天数、折扣天数、……）”处补一句：两种天数须为 0–3650 的整数。

## 范围

- 改：
  - `packages/web/src/trade-master/trade-draft.ts`：天数规则；去掉 `null` 分支；
  - `packages/web/src/trade-master/trade-editor-commands.ts`：在循环中捕获新错误；
  - `packages/web/src/ui/trade-labels.ts`：只加 `trade.issue.wholeDays`，中英各一处；
  - `packages/web/test/trade-master.test.tsx`：只**新增**用例，不改现有 13 个；
  - `docs/user/trade.md`：一句话。
- 可新增：`trade-master/` 下 1 个小文件，用于放错误类或规则函数（可选）。
- 不改：
  - `trade-field.tsx`、`trade-editor.tsx` 与 `trade-master/` 的其他文件；`TradeMaster.tsx`；
  - 契约（`packages/core/**`）、`packages/infra/**`（含 `trade-gui` 场景与 `seed.ts`）；
  - CSS、`ui/labels.ts`、`ui/trade-master-teaching.ts`；
  - `packages/web/test/setup.ts`；
  - `scripts/**`（含 `scripts/slot/`、`scripts/measure/`）、`package.json` / lock、`vitest.config.ts`。
- 不在范围：
  - 百分比字段（`discountPercent`、`deductiblePercent`，契约为正则字符串）的专用提示；
  - 错误条 `data.` 前缀的显示；
  - 逐字段同时显示多条错误。

  以上需要时另列候选。

## 冲突域

- web-ui:trade-master：`trade-master/trade-draft.ts`、`trade-editor-commands.ts`（可加 1 个新文件）、`ui/trade-labels.ts`（单键）、`packages/web/test/trade-master.test.tsx`、`docs/user/trade.md`。
- `ui/trade-labels.ts` 是贸易各页共用的**单文件**。本任务在途期间，其他任务不得改它；同批的 REFAC-21、REFAC-22 都不改。
- 受影响的 e2e 断言（S13 回顾行动 1）：
  - `trade-gui/scenario/part-one.ts:52` 以 `config("tradeTerms", "N30", {})` 用默认值 `"30"`、`"7"` 保存，在新规则下仍合法，**必须继续成立**；由 R8b 的 main Full 复核；
  - **须随本任务改**：无。
- 受影响的文档引用（D460）：`docs/user/trade.md:19`（随本任务改，决定 6）。`git grep -n -e dueDays -- docs` 另命中 `docs/user/backup-and-legacy.md:76`（迁移 JSON 示例，值 30 / 0 合法）与 `docs/demo/v0.4.0/scripts/seed-trade.mjs:41`（历史 Demo）；这两处不改。
- 与同批任务不相交：
  - REFAC-21 只改 `packages/infra/src/storage/`；
  - REFAC-22 只改 `packages/web/src/Accounts.tsx` 与新目录 `accounts/`，不改标签与测试。

  本任务与 REFAC-22 都跑 `web` 项目测试、都做打包测量，但改动的文件与 chunk 不同（`src/TradeMaster.tsx` 与首屏 / `src/Accounts.tsx`）。各自在实际合并基上测量；合并基变了就重测（R7）。

## 验收

### base 失败、head 通过

V1–V6 写成 `trade-master.test.tsx` 中的新用例：
- 新建付款条件，按用例填写天数字段，再直接 `fireEvent.submit` 保存（绕过 `required`）。
- “0 次请求”指保存接口的 `POST` / `PUT` 次数。
- “专用提示”指错误条全文等于 `data.<字段>: ` 加当前语言的 `trade.issue.wholeDays` 文本，且该输入框带 `aria-invalid="true"` 与 `aria-describedby="trade-error"`。

| 编号 | 输入与操作 | base `37362e7` | head 要求 |
| --- | --- | --- | --- |
| V1 | `dueDays` = `"30.0"` | 发出 1 次请求，请求体 `dueDays` 为 30（失败） | 0 次请求；专用提示（`data.dueDays`） |
| V2 | `discountDays` 分别为 `"1e2"`、`"0x10"` | 各发出 1 次请求，值为 100、16（失败） | 各 0 次请求；专用提示（`data.discountDays`） |
| V3 | `dueDays` 分别为 `""`、`"   "` | 0 次请求，通用提示 `trade.issue.shape`（失败） | 0 次请求；专用提示 |
| V4 | `dueDays` 分别为 `"-1"`、`"3651"`、`"abc"`、`"３０"`（全角） | 0 次请求，通用提示（失败） | 0 次请求；专用提示 |
| V5 | 在 V3 的状态下切换语言 zh → en | 通用提示的英文（失败） | 错误条为 `data.dueDays: Enter a whole number from 0 to 3650.` |
| V6 | 名称留空，且 `dueDays` = `"x"` | 错误路径为 `safeParse` 的第一条，不是 `data.dueDays`（失败；PR 正文附 base 实际路径原文） | 错误路径为 `data.dueDays`，专用提示（决定 4 的先后变化） |

每个用例在 base 上的失败原文（断言差异）附在 PR 正文。若某个用例在 base 上**通过**，先停下报设计角色。

### 两侧都须成立的不变量

- **N1 合法值**：`dueDays` / `discountDays` 分别为 `"0"`、`"3650"`、`" 45 "`、`"007"` 时，各发 1 次请求，请求体中的值为 JSON 数值 0、3650、45、7，不是字符串。现有用例已覆盖的默认值 `"30"` / `"7"` 不重复写。
- **N2 其他字段不变**：
  - 税码 `rates` 填非法 JSON 时，错误仍为 `data.rates: ` 加 `trade.issue.shape` 的文本；
  - `discountPercent` 填 `"abc"` 时，仍为 `safeParse` 路径加 `trade.issue.shape`；

  两项都写成新用例的断言。
- **N3 既有测试原样通过**：`trade-master.test.tsx` 现有 13 个用例（含 D537 的 4a / 4b 场景所依赖的行为）与 Web 全部 jsdom 测试通过；现有用例的文本 diff 为空，只新增。`ui.test.ts:16` 的“中英键集合一致、非空”通过。
- **N4 DOM 不变**：天数输入框的属性集合不变（`type="text"`、`required`、`id`、`aria-*` 规则），由 V/N 用例中对 `type` 与 `required` 的断言及 R4 核对；不新增 `min` / `max` / `inputmode` / `pattern`。
- **N5 范围**：`git diff --name-only <base> <head>` 只含“范围”所列文件与可选的 1 个新文件；`trade-labels.ts` 的 diff 恰好是中英各 1 行新增（PR 正文贴 diff）。不加迁移。
- **R7 打包字节**：
  - 用 `scripts/measure/bundle-measure.mjs`，写明脚本所在的提交 SHA；base 为最终送审 head 的实际合并基，合并基变了就重新测量。
  - 首屏预算按 D520 的要求单独写明：`trade-labels.ts` 在首屏，因此首屏**不按 ±0**，而按下表上限计。
  - 预算（未列出的项 ±0）：

  | 项 | manifest 键 | 上限 | 依据 |
  | --- | --- | --- | --- |
  | 首屏 | — | ≤ **+150 B**（gzip-9） | 中英各 1 个短句。TSET-01 加 3 个键实测 +170 B（D520），本任务按 1 个键加余量估定 |
  | 贸易主数据路由新增 | `src/TradeMaster.tsx` | ≤ **+200 B** | 新增规则与 1 个错误类，并删去 `null` 分支；估定 |
  | 贸易主数据入口 chunk | `src/TradeMaster.tsx` | ≤ **+200 B** | 同上 |
  | 其他 chunk 与 CSS | 全部 | ±0 | 不改 |

  命令参数：`--first-screen +150 --route src/TradeMaster.tsx=+200 --chunk src/TradeMaster.tsx=+200`（不加 `--d454`：首屏的变化来自内容而非预加载顺序）。超出时先停下，报设计角色与协调者，不得自行放宽。
- **R8 质量门**：
  - **R8a 合并前**：`typecheck`、`lint`、`check:boundaries`、CI-02 预检通过；PR CI（`ci.yml`）绿。
  - **R8b 合并后检查（不作合并门）**：合并后第一次覆盖该合并提交的 main Full 须绿，含 `trade-gui` 真实 Chrome 场景；失败时报协调者，按 D456 暂停后续合并。
- **R4 键盘与焦点**（行为证据，不新增常驻用例；真实键盘与 V3 的合成提交分开取证）：
  - **纯空格，真实键盘**：在“到期天数”输入 `"   "`（V3 的纯空格输入），Tab 到“折扣天数”，再 Shift+Tab 回到“到期天数”，按 Enter 提交。断言：0 次请求；焦点仍在 `#trade-dueDays`；出现 `role="alert"` 的错误条节点，文本为专用提示（base 为通用提示）。jsdom 只断言该节点存在及其文本，不声称实测了读屏播报。
  - **空串，分两项检查**：
    - 原生拦截：`dueDays` 为 `""` 时，`#trade-dueDays` 的 `validity.valueMissing` 为 `true`，表单 `checkValidity()` 为 `false`。真实按 Enter 会被原生 `required` 在提交前拦下，不生成应用的错误条，所以空串不用 Enter 取证；
    - 合成提交：直接 `fireEvent.submit` 绕过 `required`，即 V3 的空串用例。
  - 两侧焦点行为与现有 `trade.issue.shape` 相同；本任务不改焦点逻辑，只记录不变。PR 正文附上述记录。

### 测试命令（S22 回顾行动 4）

- 本机全量 web 测试：`npx vitest run --project web`。PR 正文附汇总行原文，base 与 head 各一次；base 一侧的失败只应来自新增的 V1–V6。
- 有其他失败时，逐个列出，并附只对失败文件的串行重跑原文：`npx vitest run --project web --no-file-parallelism <失败文件…>`。

## 性能考虑

- 每次保存多一次正则匹配与数值比较（两个字段）；不改请求次数、渲染次数与查询键。不跑 Bench。
- 打包变化由 R7 约束：首屏 ≤ +150 B，路由 ≤ +200 B。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥：

- **②**：`tradeFieldValue` 现在是 6 个分支的链式条件表达式，天数分支内还套着一层 `? :`。新规则**不得**再往这个表达式里加层。天数规则写成具名的模块顶层函数（例如 `wholeDays(value)`），`tradeFieldValue` 中对应分支只调用它。改后 `tradeFieldValue` 的嵌套层数 ≤ base；PR 正文附 base 与 head 的层数。新函数 ≤ 80 行、嵌套 ≤ 3 层。
- **①**：错误类与函数名表达意图，例如 `TradeFieldIssue`、`wholeDays`；标签键名 `trade.issue.wholeDays` 与现有 `trade.issue.*` 一致。
- **④**：规则只有一处实现，两个字段共用。上限 3650 与契约同值：写成具名常量（例如 `MAX_TERM_DAYS = 3650`），并在常量旁用一行注释说明“与契约 `trade-master.ts` 的 `max(3650)` 相同”。不从 `@erp/core` 导出新常量，因为本任务不改契约。
- **⑤**：不复制 `SyntaxError` 的处理代码；两类解析错误在同一个 `catch` 中分派。
- **⑥**：除上面的常量注释外不加注释；不留调试输出。
- **测试**：新用例沿用文件内现有的渲染与 `fetch` 桩辅助函数，不复制辅助函数；用例名写明编号（例如 `"TMAS-01 V1–V4: rejects non-integer days with a dedicated message"`）。PR 正文附 `trade-master.test.tsx` 在 base 与 head 上的耗时，两侧差异 > 20% 时说明原因。

## 用户可见变化

- **新提示**：两个天数字段（“到期天数”“折扣天数”）输入不合法时，错误条显示“请输入 0–3650 的整数。”（英文：“Enter a whole number from 0 to 3650.”），取代原来的通用提示“字段值无效或含不支持的字段。”。
- **更严格**：`30.0`、`1e2`、`0x10` 这类输入以前被静默改写成 30、100、16 后保存，现在被拒绝并提示。全角数字、负数、超过 3650 的数也给出同一提示。
- **不变**：
  - 合法整数（含首尾空白与前导零）照常保存；
  - 浏览器中空串仍由原生必填提示先拦下；
  - 其他字段的提示不变；
  - 教学模式、键盘顺序与焦点、红绿主题不变。
- **先后**：付款条件同时有多个字段出错时，天数字段的提示会先于名称、日期等字段显示（决定 4）。
- **文档**：`docs/user/trade.md` 补一句规则说明。发布说明由 DEMO-24（版本管理）按本节撰写。

## 证据要求

- **不需要浏览器时段**：规则在 jsdom 中由 V1–V6 与 N1–N2 直接覆盖；浏览器中原生 `required` 的行为不变（N4）；e2e 场景作为合并后检查（R8b）。本机测试与构建须服从协调者的时段静默通知（D442 / D480）。
- **可行性**（S13 回顾行动 4）：
  - `trade-master.test.tsx` 已能新建付款条件并以 `submit` 派发保存（REFAC-18 R4 的 4a 已在 base 上跑通同一路径）；
  - V1–V6 的 base 行为由“现有行为”表推出，**没有**试写用例。若某个用例在 base 上的表现与表中不符，PR 正文写明并报设计角色。
- PR 正文附：
  - V1–V6 在 base 上的失败原文与 head 上的通过原文；
  - N1–N5 结果与 `trade-labels.ts` 的 diff；
  - R4 记录；
  - R7 的 `bundle-measure.mjs` 完整输出与退出码；
  - 测试汇总行；
  - 可读性一节，含嵌套层数表；
  - 用户可见变化（照抄本节，或说明差异）。

  R8b 在合并后补到 PR 评论。

## 设计自查

- [x] 冲突域与同批任务逐文件不相交，共享单文件 `trade-labels.ts` 只有本任务改。
- [x] 首屏预算单独写明（D520），与路由预算不矛盾。
- [x] 每条 base 失败、head 通过的检查都有 base 期望值。
- [x] 用户可见变化与可读性两节齐全。
- [x] 不加迁移，不碰 `scripts/slot/`、`scripts/measure/`。
