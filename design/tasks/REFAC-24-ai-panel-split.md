# REFAC-24：拆分 `AiPanel` 函数体（不改行为）

- Sprint：S24（[计划草案](S24.md)）
- 类型：重构（Web 页面拆分）
- 优先级：P2
- 决定：[D543](S24.md#s24-期间决定)。只改代码组织，不改行为，详见“范围与决定”1–7。
- 建议分支：`refac-24-split-ai-panel`
- 来源：[S24 候选](S24.md#候选s24-其余泳道s23-评审后定)“页面拆分”。REFAC-22（#344）已合并，页面拆分名额空出，本批只排这一项页面拆分。
- 模板：[REFAC-22](REFAC-22-account-editor-split.md)（Hook 序列逐项相同、展示组件无 Hook、DOM 含属性顺序逐字节相同）。
- 迁移：**不加**。
- 浏览器时段：**不需要**，理由见“证据要求”。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 为什么是它

- 设计角色在 `e89b0b4` 上用 `node files/fnlen.cjs packages/web/src` 实测，超过 ② 上限的前几项：
  - `Workspace`（295，`App.tsx`）：**首屏**，改动会动首屏字节，本 Sprint 不排。
  - **`AiPanel`（279，`AiPanel.tsx:11–289`）**
  - `CloseWizard`（263，`PeriodClose.tsx`）、`FinancialReport`（240）、`LedgerGrid`（218）等。
- 选 `AiPanel` 的理由：
  - **不在首屏**：只被 `journals/company-journals.tsx:4` 导入，落在懒加载的 `Journals` 路由 chunk（`App.tsx:47–48`）。
  - **自包含**：一个文件、一个导出、6 个 props，没有查询缓存，没有 `useQuery` / `useMutation`。
  - **既有测试覆盖完整**：`journals.test.tsx:133` 一个用例覆盖生成、放弃、采纳、取消、迟到响应、校验失败、教学门控、不可用与忙。
  - **行为关键点集中**：`AbortController` 的中止与失效、迟到响应丢弃、教学模式门控。拆分时最容易改坏的就是这些，R4 逐项直接断言。
- 不选 `CloseWizard`：`period-close.test.tsx` 只有 3 个用例，R4 的构造成本更高；留作后续。
- 冲突域与在岗的 REFAC-23、同批的 REFAC-25 不相交，详见“冲突域”。

## 现状（main `e89b0b4`）

下文 `file:line` 都按 `e89b0b43e5ab73c8520d04633bd3f1a8db454083`。

- `packages/web/src/AiPanel.tsx` 共 **289** 行，只导出 `AiPanel`（`:11`）。导入：`react` 的 3 个 Hook；`@erp/core/contracts` 的 2 个 schema 与 2 个类型；`./ui/index.ts`；`./master-data-client.ts`（`masterRequest`、`MasterDataFailure`）；`./ui/components/index.tsx`（`Badge`、`MessageBar`、`TeachingTip`）。
- 设计角色实测：

  ```text
  279	packages/web/src/AiPanel.tsx:11-289	AiPanel
  ```

- **props**：`company`、`month`、`language`、`teaching`、`disabled`、`adopt`。调用方 `company-journals.tsx:80–88` 以 `` key={`${draft.id}:${draft.date.slice(0, 7)}`} `` 渲染，凭证或月份变化即重新挂载。
- **Hook 调用序列**（base，按源码顺序；R5a 以此为准）：
  1. `useState("")`（`prompt`）
  2. `useState<"draft" | "explain">("draft")`（`mode`）
  3. `useState<AiDraftResultDto | null>(null)`（`candidate`）
  4. `useState<string | null>(null)`（`explanation`）
  5. `useState(false)`（`pending`）
  6. `useState<unknown>()`（`error`）
  7. `useState(false)`（`cancelled`）
  8. `useRef<AbortController | null>(null)`（`active`）
  9. `useRef<string[]>([])`（`lineKeys`）
  10. `useEffect(卸载时中止, [])`（`:36–42`）
  11. `useEffect(禁用或关闭教学时中止并复位, [disabled, teaching, mode])`（`:43–52`）
- **命令与派生值**：
  - `cancel()`（`:53`）：中止、清 `active`、`pending` 置假、`cancelled` 置真。
  - `send()`（`:59–96`）：
    - 守卫：`active.current` 已有、`disabled`、`month` 不匹配 `/^\d{4}-\d\d$/u`、`prompt.trim()` 为空，任一成立即返回，不发请求；
    - 新建控制器 → 复位 5 个状态 → 按 `mode` 发 `POST /api/v1/ai/draft` 或 `/api/v1/ai/explain`，请求体 `{ company, month, prompt }`；
    - 结果、错误与 `finally` 都以 `active.current === controller` 判断是否仍有效，迟到响应被丢弃；
    - 草稿结果按行用 `crypto.randomUUID()` 生成 `lineKeys`。
  - `reason` / `errorKey`（`:97–101`）：`MasterDataFailure` 的 `messageKey` 末段若属于 `unavailable`、`timeout`、`cancelled`、`busy`、`response`、`cleanup` 之一，错误条显示 `ai.<末段>`，否则 `ai.error`。
  - `issueText(key)`（`:102–111`）：`api.error.ai.candidate` → `ai.candidate`；`api.error.ai.explicitDimensions` → `ai.explicitDimensions`；`api.error.dimensions.*` → `journal.rule.dimensions`；其余 → `journal.rule.<末段>`；资源中没有该键时回落 `ai.invalid`。
  - `idle`（`:112`）。
- **JSX**（`:113–288`）：`section.card.ai-panel`（`aria-label`）→ `header` → `div.body`，`body` 内依次 10 项：
  1. 边界说明 `MessageBar`
  2. `div.ai-form`：模式 `select`（“讲解”选项只在教学模式出现；`onChange` 复位候选、讲解与错误）与 `textarea`（`maxLength={4000}`）
  3. 月份提示 `p.jv-hint`（月份不合法时）
  4. `div.ui-form-actions`：发送按钮、在途时的取消按钮
  5. 在途 `MessageBar`
  6. 已取消 `MessageBar`
  7. 错误 `MessageBar`
  8. 空状态 `p.empty-state`
  9. 候选 `article.ai-result`：标题与徽章、校验问题列表、草稿表（4 列，借贷列 `num`）、`TeachingTip` 理由、替换提示、采纳（只在 `candidate` 状态）与放弃按钮
  10. 讲解 `article.ai-result`（只在教学模式）
- **重复**：月份正则 `/^\d{4}-\d\d$/u` 出现 **3** 处（`:60` 守卫、`:148` 提示、`:154` 按钮禁用），是 R6b 的去重对象。
- **测试**：
  - `packages/web/test/journals.test.tsx` 6 个用例，其中 `:133` 专测 AI 面板；其余用例渲染同页。
  - 真实 Chrome：`git grep -n -e "ai/draft" -e "ai-panel" -- packages/infra/test` 在 `e89b0b4` 上**没有命中**；e2e 不操作 AI 面板。

### chunk 归属与首屏（S22 回顾行动 3，base 实测）

设计角色在 `e89b0b4` 上运行 `node scripts/measure/bundle-measure.mjs --base e89b0b43e5ab73c8520d04633bd3f1a8db454083 --head e89b0b43e5ab73c8520d04633bd3f1a8db454083 --work <新目录> --d454`。脚本取自 `e89b0b4`，该文件最后一次改动是 `6156759`；退出码 0，`RESULT: PASS`。

| 文件 | 落在哪个 chunk | 依据 |
| --- | --- | --- |
| `AiPanel.tsx`（改） | 路由入口 chunk `src/Journals.tsx` | 只被 `journals/company-journals.tsx` 导入，后者只被 `Journals.tsx` 导入；`App.tsx:47–48` 懒加载 |
| `ai-panel/` 下新文件（新增） | 同上 | 只允许被 `AiPanel.tsx` 或本任务的新文件导入（决定 6） |
| 首屏 | **本任务不改任何首屏文件** | `ui/*`、`ui/components`、`master-data-client.ts` 只导入、不改（决定 7） |
| CSS | 不改 | `pages/journals.css` 不改 |

base 数字（原始 / gzip-9 字节）：

| 项 | 键 | 原始 | gzip |
| --- | --- | --- | --- |
| first-screen | first-screen | 531281 | 161156 |
| route | `src/Journals.tsx` | 63255 | 20521 |
| chunk | `src/Journals.tsx` | 30916 | 8351 |

## 范围与决定

1. **不改行为**（D543）。以下全部不变：
   - DOM 结构、类名、文本；
   - 属性及其**先后顺序**，含 `disabled`、`value`、`maxLength`、`role`、`aria-label`、`scope`；
   - 请求的 URL、方法、请求体（含键顺序）与发出顺序；
   - `AbortController` 的创建与中止时机，`active.current` 的置空时机；
   - 迟到响应的丢弃条件（`active.current === controller`）；
   - 教学模式门控：“讲解”选项的出现条件、关闭教学时的中止与复位；
   - `adopt` 的调用条件、次数与参数；
   - 焦点与键盘行为。

   只改代码组织，不修 bug。拆分时发现的疑似缺陷登记在 PR 正文，留作后续任务。
2. **Hook 顺序不变**：
   - Hook 可以留在 `AiPanel`，也可以放进它在顶层无条件调用的自定义 Hook，例如 `useAiRequest`；
   - **展示组件不得调用任何 Hook**；不新增 `useCallback`、`useMemo`、`memo`；
   - 展开自定义 Hook 后，Hook 调用序列与“现状”所列 base 序列逐项相同：种类、先后、参数与依赖的源文本，只归一空白（R5a）；
   - 本任务**没有豁免**。
3. **命令**：
   - `send`、`cancel` 可以搬进自定义 Hook；
   - `send` 的守卫、控制器、5 个复位、两个分支、`try` / `catch` / `finally` 的三个有效性判断，顺序与结构都不变（R5c）；
   - 每次渲染仍读取当次状态，不改为缓存的闭包；
   - `reason`、`errorKey`、`issueText` 原样搬移（R5c）。
4. **组件层级对等**：
   - 新组件一律在模块顶层定义；
   - 抽出的组件只替换“现状”所列 `body` 内 10 项之一，或第 2、9 项内部的一段（例如模式选择、草稿表、问题列表）；只渲染该段原来渲染的内容；
   - 不把相邻兄弟合成一个返回 Fragment 的组件；
   - 条件渲染的条件留在父级原位置，或留在被抽出组件内与原来相同的位置。
5. **月份校验去重**（⑤，R6b）：
   - 3 处 `/^\d{4}-\d\d$/u.test(month)` 改为每次渲染求值一次的一个值（例如 `const monthValid = …`），3 处改用它；
   - 正则字面量逐字不变；
   - `send` 守卫中的顺序不变：`active.current || disabled || !monthValid || !prompt.trim()`。由于 `send` 在当次渲染中定义，读取的是同一次渲染的 `month`，行为不变。
6. **文件**：
   - 新建目录 `packages/web/src/ai-panel/`（base 上不存在），与 `accounts/`、`journals/` 等并列；
   - 新文件按职责命名，例如 `use-ai-request.ts`、`ai-form.tsx`、`ai-candidate.tsx`、`ai-explanation.tsx`，粒度由开发定，写入 PR 正文；
   - 新文件只被 `AiPanel.tsx` 或本任务的新文件导入；
   - `AiPanel` 仍从 `./AiPanel.tsx` 导出，props 类型不变，`company-journals.tsx` 不改。
7. **不改**：
   - `packages/web/src/journals/**`、`Journals.tsx`、`App.tsx` 与路由表；`master-data-client.ts`；`ui/**`（含 `ai-labels.ts` 与教学文案）；CSS（含 `pages/journals.css`）；契约（`@erp/core/contracts`）；
   - `packages/web/test/**`（含 `setup.ts`）、`packages/infra/**`、`packages/core/**`；
   - `scripts/**`（含 `scripts/slot/`、`scripts/measure/`）、`scripts/test-shard-weights.json`、`package.json` / lock、`vitest.config.ts`。

## 冲突域

- web-ui:ai-panel：只改 `packages/web/src/AiPanel.tsx`，并在 `packages/web/src/ai-panel/` 下新增文件（决定 6）。
- 取证所需的观测点和新增测试文件：无。R4 驱动不提交。
- 受影响的 e2e 断言（S13 回顾行动 1）：无，e2e 不操作 AI 面板。**须随本任务改**：无。
- 受影响的文档引用（D460）：`git grep -n -F "AiPanel" -- docs design` 在 `e89b0b4` 上命中 12 行，都是当时的事实记录，不改。
- 与在岗及同批任务不相交：
  - REFAC-23 只改 `packages/core/src/application/trade-documents.ts` 与同目录新增的 `trade-invoice-*.ts`；
  - REFAC-25 只改 `packages/infra/src/storage/journals.ts` 与同目录新增的 `journal-*.ts`。

  三者没有共享文件。本任务跑 `web` 项目，另两项跑 `core` / `infra` 项目。

## 验收

### base 失败、head 通过

| 编号 | 检查 | base `e89b0b4` | head 要求 |
| --- | --- | --- | --- |
| R6a | `node fnlen.cjs packages/web/src`（口径同 S16–S24）中 `AiPanel` 的行数 | **279**（失败） | ≤ 80；本任务新增或改动的函数也都 ≤ 80 |
| R6b | `git grep -n -F '/^\d{4}-\d\d$/u' <rev> -- packages/web/src/AiPanel.tsx packages/web/src/ai-panel` 的命中数 | **3**（失败） | **1**（决定 5）。PR 正文附 base 与 head 两侧检索原文 |

### 两侧都须成立的不变量

- **R1 范围**：
  - `git diff --name-only <base> <head>` 只含 `packages/web/src/AiPanel.tsx` 与 `packages/web/src/ai-panel/` 下的新文件；
  - 决定 7 所列文件的 diff 为空；
  - 不加迁移。
- **R2 导出不变**：
  - `AiPanel.tsx` 的导出集合与 base 相同，只有 `AiPanel`，类型为 function；
  - props 类型的源文本相同，只归一空白。用仓库根 devDependency `@babel/parser`（插件 `typescript`、`jsx`）解析，口径同 REFAC-14 R2；
  - 新文件的导出只在 `AiPanel.tsx` 与 `ai-panel/` 内使用，PR 正文附 `git grep` 结果。
- **R3 既有测试原样通过**：
  - `journals.test.tsx` 的 6 个用例、`App.test.tsx` 与 Web 全部 jsdom 测试通过；
  - 测试文件 diff 为空；
  - 本机全量命令见“测试命令”。
- **R4 DOM、请求、中止与失效等价**（送审证据；驱动不提交，不加常驻 CI 用例）：
  - **两个驱动**，都是临时 jsdom 脚本，在 base 与 head 上按同一序列操作。`fetch` 桩按路径分派，借用 `journals.test.tsx:133` 的写法，但改为**受控响应**：
    - AI 请求可以挂起，也可以返回草稿候选、校验失败候选、讲解文本、带指定 `messageKey` 的错误信封（503 / 409），或网络拒绝；
    - 桩记录每次收到的 `signal`，**不**自行响应中止，由驱动决定何时放行。

    `crypto.randomUUID` 在两侧都换成按调用递增的确定性桩（只影响 React `key`）。

    - **驱动 A（整页）**：渲染 `App`，进入凭证页新建凭证，按 `journals.test.tsx:133` 的路径操作 AI 面板。
    - **驱动 B（直接渲染）**：直接渲染导出的 `AiPanel`，props 由驱动控制，用 `rerender` 切换 `teaching`、`disabled`、`month`；`adopt` 传入记录函数；卸载用 `unmount()`。
  - **记录规则**：同 [REFAC-22 R4](REFAC-22-account-editor-split.md#两侧都须成立的不变量)。
    - 被记录的函数一律用委托包装对象或函数，不用 `Proxy`；
    - 调用时分配递增序号并立即写入记录；返回 Promise 时先记 `pending`，完成后在同一条记录写 `resolved` / `rejected` 与结果；
    - 参数与返回值都经确定性编码（`Set` → `{"$set": […]}`、`Map` → `{"$map": [[k, v], …]}`；其余同 REFAC-17）；
    - 驱动须带 REFAC-17 的自测（a）–（c），失败即 R4 失败。
  - **焦点**：`HTMLElement.prototype.focus` 装记录桩，保留原实现，记下每次调用的目标。
  - **序列**至少包含（驱动 B，另有标注的除外）：
    - **守卫**：
      1. `month` 为 `""` 与 `"2026-1"` 各一遍，填入提示词；
      2. 合法月份，提示词为纯空格 `"   "`；
      3. 合法月份与提示词，`disabled = true`。
    - **草稿成功**：发送 → 在途 → 放行候选（3 行，含 2 个维度）→ 采纳。
    - **放弃**：再次发送 → 放行候选 → 放弃。
    - **校验失败候选**：`issues` 依次含 `api.error.ai.candidate`、`api.error.ai.explicitDimensions`、`api.error.dimensions.required`、`api.error.journals.balance`、`api.error.synthetic.unknownRule`（资源中不存在）。另加一遍 `draft: null`、`rationale: null`（契约 `ai-assistant.ts:15–18` 允许）：没有标题 `h4`，没有草稿表。
    - **取消与迟到响应**：发送 → 在途时点取消 → 放行成功响应；再来一遍，取消后放行错误响应。
    - **在途时禁用**：发送 → 在途时 `rerender` 为 `disabled = true` → 放行成功响应 → `rerender` 回 `disabled = false`。
    - **教学门控**：
      1. `teaching = false` 时打开模式下拉；
      2. `teaching = true`，切到讲解，发送 → 放行讲解文本；
      3. `rerender` 为 `teaching = false`；
      4. 再设 `teaching = true`，切到讲解，发送 → 在途时 `rerender` 为 `teaching = false` → 放行讲解文本。
    - **模式切换复位**：有候选时把模式切到讲解再切回草稿。
    - **错误映射**：`messageKey` 依次为 `api.error.ai.unavailable`、`timeout`、`cancelled`、`busy`、`response`、`cleanup`、`api.error.ai.synthetic`，再加一遍网络拒绝。
    - **卸载时的在途请求**：发送 → 在途时卸载 → 放行成功响应。
    - 驱动 A：zh / en 各一遍；教学模式开与关各一遍。
  - **每步采样**：
    - DOM：`document.body.innerHTML`；
    - 累计请求日志：序号、方法、URL、请求体原文、`signal.aborted`、结果；
    - `adopt` 记录；
    - 焦点调用记录；
    - `console.error` 调用记录。
  - **判定**：base 与 head 逐步、逐项、逐字节相同。并且**直接断言**，只比两侧相同不够：
    1. **守卫**：三种守卫情形都发出请求 **0 次**，发送按钮带 `disabled`；月份不合法时出现 `p.jv-hint`，文本为 `ai.month` 的当前语言文本；月份合法时没有该节点。`disabled = true` 时模式下拉与提示词输入也带 `disabled`。
    2. **请求**：草稿模式为 `POST /api/v1/ai/draft`，讲解模式为 `POST /api/v1/ai/explain`；请求体原文为 `{"company":…,"month":…,"prompt":…}`，键顺序如此。在途时发送按钮带 `disabled`，只记 1 个请求。
    3. **采纳与放弃**：点采纳后 `adopt` 恰好记 1 次，参数与放行的 `draft` 深度相等，候选卡片消失；点放弃后 `adopt` 0 次，候选卡片消失。校验失败候选没有采纳按钮。
    4. **校验问题文本**：5 条 `issues` 的 `<li>` 文本依次为 `<path>: ` 加 `ai.candidate`、`ai.explicitDimensions`、`journal.rule.dimensions`、`journal.rule.balance`、`ai.invalid` 的当前语言文本。
    5. **草稿表**：表头 4 列，只有借、贷两列带 `class="num"`；维度单元格文本为 `code=value` 以 `", "` 连接。
    6. **取消与迟到响应**：点取消后 `signal.aborted` 为 `true`，在途条消失，出现 `ai.cancelled` 状态条；放行成功或错误响应后，DOM 与放行前**逐字节相同**，`adopt` 0 次。
    7. **在途时禁用**：`rerender` 为 `disabled = true` 后 `signal.aborted` 为 `true`、在途条消失；放行后 DOM 与放行前逐字节相同；恢复 `disabled = false` 后显示空状态 `p.empty-state`。
    8. **教学门控**：
       - `teaching = false` 时下拉中没有 `value="explain"` 的选项；
       - 讲解文本只在 `teaching = true` 时出现；`rerender` 为 `teaching = false` 后讲解卡片消失，下拉值为 `draft`，且没有讲解选项；
       - 在途时关闭教学：`signal.aborted` 为 `true`，放行后 DOM 不变，不出现讲解文本。
    9. **模式切换复位**：切换模式后候选卡片消失，错误条消失。
    10. **错误映射**：6 个已知末段的错误条文本为对应 `ai.<末段>`，`api.error.ai.synthetic` 与网络拒绝为 `ai.error`，都带 `role="alert"`。
    11. **卸载时的在途请求**：卸载后、放行前 `signal.aborted` 为 `true`；放行后 `console.error` 没有新增记录。

    base 上任一直接断言不成立，先停下并向协调者报告，不得把“两侧相同”当作通过。PR 正文附：驱动全文、步骤清单、两侧输出的 SHA-256 与比较结果，以及“取消与迟到响应”“在途时禁用”“教学门控”三组场景的逐步输出原文。
  - **驱动原件**：PR 正文贴驱动**原文件字节的 base64**；或者同时写出两种 SHA-256：原始字节的，以及按 UTF-8 解码并把换行归一为 LF 后的字节的（评审从代码块复制时得到的是 LF 文本）。只给一种哈希不算满足。
- **R5 结构规则**（静态；评审按代码与 PR 表格核对）：
  - **R5a Hook 序列**：PR 正文列出 base 与 head 的 Hook 调用序列（自定义 Hook 按调用处展开），以及参数与依赖的源文本（只归一空白）。两侧逐行相同，base 一侧须与“现状”所列 11 项一致。没有豁免，任何差异即失败。
  - **R5b 展示组件无 Hook**：新抽出的组件中没有任何 `use*` 调用。PR 正文附 Babel AST 检查脚本的输出。
  - **R5c 原文搬移**：以下各项在 base 与 head 之间逐字比较，只归一缩进；不同即失败：
    - `cancel` 的函数体；
    - `send` 的函数体，唯一允许的差异是决定 5 的月份校验改为引用同一个值；
    - `reason`、`errorKey`、`issueText` 的定义；
    - 两个 `useEffect` 的回调体。
  - **R5d 插槽对等**：PR 正文用一张表列出“现状”中 `body` 内的 10 项（第 2、9 项再按段列出），并标出 head 中对应的唯一组件或表达式。
- **R6 尺寸**：
  - 除上表 R6a、R6b 外，`AiPanel.tsx` ≤ 120 行（base 289 行）；
  - 新文件各 ≤ 200 行；每个新函数满足 ②：≤ 80 行，嵌套 ≤ 3 层；
  - PR 正文列出所有超过 50 行的函数，附计数行数与最深层数（base 与 head 两列）。
- **R7 打包字节**：
  - 首屏按 D454；
  - 用 `scripts/measure/bundle-measure.mjs`，写明脚本所在的提交 SHA；
  - base 为最终送审 head 的实际合并基；合并基变了就重新测量。

  预算（未列出的项 ±0）：

  | 项 | manifest 键 | 上限 | 依据 |
  | --- | --- | --- | --- |
  | 首屏 | — | **±0**（D454，`--d454`） | 改动文件都不在首屏闭包中（“chunk 归属”表） |
  | 凭证路由新增 | `src/Journals.tsx` | ≤ **+500 B** | 估定，见下 |
  | 凭证入口 chunk | `src/Journals.tsx` | ≤ **+500 B** | 同上 |
  | 共用 chunk 与其他路由 | 全部 | ±0 | 只导入、不改 |
  | CSS | 全部 | ±0 | 不改 CSS |

  命令参数：`--route src/Journals.tsx=+500 --chunk src/Journals.tsx=+500 --d454`。
  - 出现 base 没有的新 chunk，即停下报告；
  - 超出上限时先停下，报设计角色与协调者，不得自行放宽；
  - 上限没有做试改构建：REFAC-18（#339，292 行）实测为 +329 B，REFAC-22 沿用同一停止线；本函数 279 行，沿用。
- **R8 质量门**：
  - **R8a 合并前**：`typecheck`、`lint`、CI-02 预检通过；PR CI（`ci.yml`）绿。
  - **R8b 合并后检查（不作合并门）**：合并后第一次覆盖该合并提交的 main Full 须绿；失败时报协调者，按 D456 暂停后续合并。
- **R9 可读性一节**：PR 正文按下节逐条说明。

### 测试命令（S22 回顾行动 4）

- 本机全量 web 测试一律用 `npx vitest run --project web`。PR 正文附汇总行原文，base 与 head 各一次。
- 有失败时，逐个列出失败的文件与用例，并附只对这些文件的串行重跑原文：`npx vitest run --project web --no-file-parallelism <失败文件…>`。
  - 不得自行更换并发参数而不说明；
  - 串行重跑仍失败，即按真实失败处理。

## 性能考虑

- 渲染次数不变：不加 `memo`，不改 Hook 与依赖（决定 2）。
- 月份校验从每次渲染 2 次（另加发送时 1 次）变为每次渲染 1 次，差异可忽略。
- 不跑 Bench。打包变化由 R7 约束。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥：

- **②**：`AiPanel` 从 279 行拆到 ≤ 80 行（R6a）；拆后它只是“取状态 → 组合表单、状态条与结果卡片”。
- **③**：`AiPanel.tsx`（289 行）拆后 ≤ 120 行，新文件各 ≤ 200 行（R6）。PR 正文贴 `git diff --numstat`。
- **①**：文件与组件名表达职责，例如“请求状态”“表单”“候选卡片”“讲解卡片”。不用 `part1`、`helpers2` 这类名字。
- **④**：
  - 请求与中止逻辑集中在一个自定义 Hook（或留在 `AiPanel`），展示组件只接收值与回调；
  - 展示组件不读 `active`、`lineKeys` 以外的引用；需要 `lineKeys` 时以 `ref.current` 的当次值作为 prop 传入，渲染结果不变。
- **⑤**：月份校验去重（决定 5、R6b）。`setCandidate(null)` / `setExplanation(null)` 的成对复位分散在 `send`、`useEffect` 与模式切换中，各处语义不同，不强行合并。
- **⑥**：不新增注释，除非某处拆分需要说明“为什么”，例如“迟到响应以控制器身份判断”；不留调试输出。
- **测试耗时**：本任务不改测试；R4 驱动不提交。PR 正文附 `journals.test.tsx` 在 base 与 head 上的耗时（vitest 汇总行原文）；两侧差异 > 20% 时说明原因。

## 用户可见变化

- 无。AI 面板的生成、讲解、取消、采纳、放弃、错误提示、教学门控与中英文文本都不变（R3、R4）。

## 证据要求

- **不需要浏览器时段**：
  - 行为等价由 R3 与 R4（DOM 逐字节、请求与中止的直接断言）证明；
  - e2e 不操作 AI 面板；
  - R4 与构建在本机运行，须服从协调者的时段静默通知（D442 / D480）。
- **可行性**（S13 回顾行动 4）：
  - `journals.test.tsx:133` 已用受控 `fetch` 桩跑通挂起、取消、迟到响应与教学门控；
  - 驱动 B 只需 props，不需要查询缓存；
  - R6a、R6b 与 R7 的 base 数字见“现状”，由设计角色实测；
  - 本任务书**没有**试写驱动。若某个场景在 jsdom 中构造不出来，PR 正文写明原因并报协调者，不得静默删去。
- PR 正文附：
  - R2 的导出与 `git grep` 结果；
  - R3 汇总行；
  - R4 驱动（原件 base64 或两种 SHA-256）、步骤清单、比较结果、直接断言结果与三组场景的逐步输出；
  - R5a–R5d 各表；
  - R6 行数表（base 与 head 两列）；
  - R7 的 `bundle-measure.mjs` 完整输出与退出码；
  - 可读性一节。

  R8b 在合并后补到 PR 评论。

## 设计自查

- [x] 本批只有这一项页面拆分；冲突域与在岗 REFAC-23、同批 REFAC-25 逐文件不相交。
- [x] 每条 base 失败、head 通过的检查都有 base 实测值；R7 的 base 字节已实测。
- [x] 中止、迟到响应、教学门控、守卫 0 次请求都有直接断言。
- [x] 可读性一节齐全；无用户可见变化。
- [x] 不加迁移，不碰 `scripts/slot/`、`scripts/measure/`。
