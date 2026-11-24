# REFAC-16：拆分 `RuleSettings` 函数体（不改行为）

- Sprint：S24（[计划草案](S24.md)）　类型：重构（页面）　优先级：P2　决定：[D532](S24.md#s24-期间决定)（只改代码组织、不改行为；见“范围与决定”1–5）　建议分支：`refac-16-split-rule-settings`
- 来源：[S24 候选](S24.md#候选s24-其余泳道s23-评审后定)“按 ② 拆 `RuleSettings`（313）”。结构与验收照搬 [REFAC-14](REFAC-14-company-events-split.md) 与 [REFAC-15](REFAC-15-company-reports-split.md)（#326、#332 已合并），只换成“过账规则设置”的事实；按 [S22 回顾行动 3](../reviews/S22-retro.md#行动项汇总) 写出 chunk 归属与首屏预算，按行动 4 写出本机全量 web 测试命令；main Full 只作合并后检查，不作合并前门（#327 评审 6034449046 的口径）。
- 迁移：**不加**。浏览器时段：**不需要**（理由见“证据要求”）。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 为什么是它

- REFAC-15 合并后，`RuleSettings` 按 `files/fnlen.cjs` 口径（非空、非注释行）为 **313 行**，是 `packages/web/src` 中最长的函数，约为 ② 上限（80 行）的 3.9 倍；次长 `Workspace` 295 行（`App.tsx`，首屏文件）、`TradeEditor` 292 行。
- 选它而不选 `Workspace`：`Workspace` 在 `App.tsx`，属于首屏闭包，任何组织变化都直接进首屏预算（D454）；`RuleSettings` 在路由 chunk `src/BusinessEvents.tsx` 内，首屏 ±0 可由构建直接证明。`TradeEditor` 与 `RuleSettings` 规模相近，但所在的 `TradeMaster.tsx` 由真实 Chrome 场景直接驱动，评审面更大；留作下一个页面拆分。
- 它承载过账规则的全部交互：规则列表、新建与编辑、对象与往来方范围的联动、科目候选列表与“加载更多”、维度、保存与失败重聚焦、以及向上层报告“编辑中”的锁定。两个范围下拉（对象 `:432–453`、往来方 `:463–484`）逐字相近，只差字段名，是本任务唯一的去重点（决定 5）。
- **节奏**：同一时间只有一个页面拆分在途。REFAC-15 已由 #332 合并，本任务派发时没有其他页面拆分在途。
- 冲突域与同批任务不相交：REFAC-17 只改 `packages/core/src/application/`（见“冲突域”）。

## 现状（main `914f041`）

下文 `file:line` 都按 `914f0410c083c734faa907815c67054b4aa811ed`。

- `packages/web/src/business-events/settings.tsx` 共 556 行：导出 `BusinessSettings`（`:18–66`，三个设置页签与锁定转发）；模块内另有 `MasterSettings`（`:67–242`，不导出）与 `RuleSettings`（`:243–556`，不导出）。
- 设计角色用 `node files/fnlen.cjs packages/web/src/business-events` 实测：

  ```text
  313	packages/web/src/business-events/settings.tsx:243-556	RuleSettings
  216	packages/web/src/business-events/editors.tsx:14-229	EventEditor
  175	packages/web/src/business-events/settings.tsx:67-242	MasterSettings
  116	packages/web/src/business-events/editors.tsx:230-345	ClearingEditor
  82	packages/web/src/business-events/business-plan.tsx:7-88	BusinessPlan
  ```

- **Hook 调用**（`RuleSettings` 内，源码顺序，R5a 的 base 一侧）：
  1. `usePage("posting-rules", company.code, postingRulesPageSchema)`（`:254`）；
  2. `usePage("accounts", company.code, accountsPageSchema)`（`:255`）；
  3. `useQueryClient()`（`:256`）；
  4. `useState`：`value`（`:257`，初值 `null`）、`busy`（`:258`，`false`）、`error`（`:259`，无初值）、`saved`（`:260`，`false`）；
  5. `useRef`：`working`（`:261`，`false`）、`alive`（`:262`，`true`）、`form`（`:263`，`null`）；
  6. `useEffect`，依赖 `[]`（`:265–270`）：挂载置 `alive.current = true`，卸载置 `false`；
  7. `useEffect`，依赖 `[editing, busy, lock]`（`:271–274`）：`lock(editing || busy)`，清理时 `lock(false)`；
  8. `useLayoutEffect`，依赖 `[editing, busy]`（`:276–279`）：进入编辑或保存失败后，聚焦表单中第一个未禁用的 `input`。
- **派生值与命令**：`editing = value !== null`（`:264`）；`newRule()`（`:280–294`，默认规则，日期取 `company.year` 的 1 月 1 日与 12 月 31 日）；提交处理（`:351–380`：`working` 防重入 → `busy` → `POST /api/v1/posting-rules` → 成功时在 `alive` 下清空表单、置 `saved`、失效查询键 `["business", company.code, "posting-rules"]`；失败时在 `alive` 下置 `error`；`finally` 复位 `working` 并在 `alive` 下复位 `busy`）。
- **JSX**：Fragment 下 5 个子表达式（R5d 的 base 一侧）：
  1. “新建”按钮（`:297–308`，`editing || busy` 时禁用）；
  2. `PageTable` 规则列表（`:309–345`，行内“编辑”按钮 `:330`）；
  3. `{error !== undefined && <BusinessError …/>}`（`:346`）；
  4. `{saved && <p role="status">…}`（`:347`）；
  5. `{value && (<form …>)}`（`:348–553`）：`fieldset disabled={busy}` 内依次为代码（`:383`，`revision > 0` 时禁用）、启用（`:392`）、方向（`:401`）、含义（`:418`）、对象范围（`:432`）、对象代码（`:454`）、往来方范围（`:463`）、往来方代码（`:485`）、科目（`:494`，`list="business-rule-accounts"`、`pattern="[1-9][0-9]{3}"`）、`datalist`（`:504`）、`PageControls`（`:513`，科目候选的“加载更多”）、起止日期（`:514`、`:523`）、`DimensionFields`（`:532`）、保存与取消（`:538`、`:541`）。
- **相近但不相同的处理**（拆分时最容易被误合并，R4 序列专门覆盖）：
  - 对象范围与往来方范围的 `onChange`（`:437–445`、`:468–476`）结构相同：只接受 `exact` / `group` / `all`，选 `all` 时代码写 `"*"`，否则写 `""`；分别写 `objectScope` / `objectCode` 与 `partyScope` / `partyCode`。选项文案 `group` 取 `business.groupScope`，其余取 `business.${item}`。
  - 方向与含义的 `onChange`（`:406–409`、`:423–426`）各自只接受两个值；含义的两个 `option` 是直接写出的，不是 `map`。
  - “取消”（`:541–550`）只清表单与错误；“新建”与行内“编辑”（`:301–305`、`:334–338`）还清 `saved`。（表单打开时 `saved` 必为 `false`，取消不清它在界面上不可见，但代码结构照原样保留。）
  - 新建时代码输入可编辑；编辑已有规则（`revision > 0`）时代码输入禁用，`useLayoutEffect` 因而聚焦“启用”复选框。
- **数字字面量**（`RuleSettings` 内）：只有 `revision > 0`（`:387`）与默认规则的 `revision: 0`（`:282`），都是语义值，不在 ⑤ 范围。`pattern="[1-9][0-9]{3}"` 是字符串，不改。
- **导入方**：`settings.tsx` 只被 `company-events.tsx:9` 导入（`BusinessSettings`）；`BusinessEvents.tsx` 由 `App.tsx:50–51` 懒加载。
- **锁定链**：`RuleSettings` 的 `lock` 就是 `BusinessSettings` 的 `setEditing`（`:53`）；`BusinessSettings` 再以 `useEffect` 把 `editing` 转给自己的 `lock` 属性（`:31–34`，来自 `company-events.tsx:34–39` 的 `state.setConfigEditing`），并以 `disabled={editing}` 禁用三个页签（`:45`）。
- **测试**：
  - jsdom：`packages/web/test/business-events.test.tsx` 736 行、10 个用例；经过过账规则的是 `:406`（保存重复规则失败后立即重聚焦第一个输入）与 `:470`（取消或保存成功后焦点留在页面）。没有用例直接记录规则编辑时上层收到的锁定值，也没有覆盖编辑已有规则、范围联动、科目“加载更多”、卸载时在途保存（R4 补充观测，不新增常驻用例）。
  - 真实 Chrome：`git grep -n -e posting-rules -e business-rule-accounts -e RuleSettings -- packages/infra/test` 在 `914f041` 上只命中 `http/business-events.test.ts`（服务端 API 用例），**没有** e2e 场景操作过账规则设置。

### chunk 归属与首屏（S22 回顾行动 3，base 实测）

设计角色在 `914f041` 上运行 `node scripts/measure/bundle-measure.mjs --base 914f0410c083c734faa907815c67054b4aa811ed --head 914f0410c083c734faa907815c67054b4aa811ed --work C:\tmp\meas-s24-wave3`（脚本取自 `914f041`，该文件最后一次改动是 `6156759`；退出码 0，`RESULT: PASS`）：

| 文件 | 落在哪个 chunk | 依据 |
| --- | --- | --- |
| `business-events/settings.tsx`（改） | 路由入口 chunk `src/BusinessEvents.tsx`（`assets/BusinessEvents-*.js`） | `App.tsx:50–51` 以 `lazy(() => import("./BusinessEvents.tsx"))` 懒加载；`settings.tsx` 只被同 chunk 的 `company-events.tsx` 导入 |
| `business-events/` 下新文件（新增） | 同上 | 只允许被 `settings.tsx` 或本任务的同目录新文件导入（决定 6） |
| 首屏（`index.html` 入口与预加载闭包） | **本任务不改任何首屏文件** | `ui/labels`、`ui/components` 等只导入、不改（决定 7） |
| 共用模块（`journals/dialogs.tsx` 的 `DimensionFields`、`business-events/list.tsx`、`master-data-client.ts`） | 不改 | 只导入；路由闭包中这些模块须 ±0 |
| CSS | 不改 | 路由闭包的 CSS 为 `components.css`、`index.css`、`virtual-rows.css`（输出原文），决定 7 |

base 数字（屏蔽哈希后的原始 / gzip-9 字节，输出原文行）：

```text
| first-screen | first-screen | 531160 | 531160 | 161115 | 161115 | 0 | ±0 | PASS |
| route | src/BusinessEvents.tsx | 64861 | 64861 | 19779 | 19779 | 0 | ±0 | PASS |
| chunk | src/BusinessEvents.tsx | 32522 | 32522 | 7609 | 7609 | 0 | ±0 | PASS |
```

## 范围与决定

1. **不改行为**（D532）。以下全部不变：DOM 结构、类名、文本、属性（含 `id`、`list`、`pattern`、`required`、`disabled`、`type`、`aria-*`、`role`）；请求的 URL、方法、请求体与发出顺序；查询键与失效的键；向上层报告的锁定值序列；焦点与键盘行为；`working` 防重入与 `alive` 卸载保护的语义。只改代码组织，不修 bug；拆分时发现的疑似缺陷登记在 PR 正文，留作后续任务。
2. **Hook 顺序不变**：Hook 可以留在 `RuleSettings`，也可以放进它顶层无条件调用的自定义 Hook（例如 `usePostingRuleEditor`）。**展示组件不得调用任何 Hook**；不新增 `useCallback`、`useMemo`、`memo`。展开自定义 Hook 后，Hook 调用序列（种类、先后、参数与依赖的源文本，空白归一）与“现状”所列 base 序列逐项相同（R5a）；`usePage` 与 `useQueryClient` 按一次调用计，不展开其内部。本任务**没有**豁免项。
3. **派生值与命令**：`newRule()` 可以抽成模块顶层的纯函数（以 `company.year` 为参数，例如 `newPostingRule(year)`），返回对象的键、值与键顺序不变；提交处理可以搬进自定义 Hook，`working` / `alive` / `busy` 的读写顺序与 `then` / `finally` 的结构不变；每次渲染仍读取当次状态，不改为缓存的闭包。
4. **组件层级对等**：新组件一律在模块顶层定义。抽出的组件只替换“现状”所列 5 个子表达式之一，或第 5 项表单内部的一段（例如某个字段的 `label`、范围下拉、科目与候选列表）；只渲染该段原来渲染的内容，不把相邻兄弟合成一个返回 Fragment 的组件。条件渲染的条件留在父级原位置，或留在被抽出组件内与原来相同的位置。**不合并**“现状”所列的相近处理：方向与含义的下拉各自保留；“取消”与“新建” / “编辑”的清理各自保留。
5. **范围下拉去重**（⑤ 去重，R6b）：对象范围与往来方范围两段（`:432–453`、`:463–484`）改为**同一个**模块顶层的展示组件（例如 `ScopeSelect`）各调用一次。它接收当前范围、标签文案与选择回调；`exact` / `group` / `all` 的校验、`"*"` / `""` 的写法与写哪两个字段留在调用方（或一个纯函数，例如 `scopeChange(scope)` 返回 `{ scope, code }`），由调用方写入 `objectScope` / `objectCode` 或 `partyScope` / `partyCode`。渲染出的 `label`、`select`、`option` 与文案逐字节不变（R4）。`MasterSettings` 中若有相近写法，不在本任务范围。
6. **文件**：新文件放在 `packages/web/src/business-events/`，按职责命名（例如 `rule-settings.tsx`、`use-posting-rule-editor.ts`、`rule-form.tsx`、`scope-select.tsx`），粒度由开发定，写入 PR 正文；不得与该目录现有文件重名。新文件只被 `settings.tsx` 或本任务的新文件导入。`BusinessSettings` 仍从 `./settings.tsx` 导出，函数体**不改**；`RuleSettings` 可以留在 `settings.tsx`，也可以整体搬到新文件，由 `settings.tsx` 导入。`MasterSettings`（175 行）**不改**、不搬移（存量，登记入候选池）。
7. **不改**：
   - `BusinessSettings` 与 `MasterSettings` 的函数体；`company-events.tsx`、`use-company-events.ts`、`list.tsx`、`business-error.tsx`、`types.ts` 与本目录其他现有文件；`journals/dialogs.tsx`、`master-data-client.ts`（只导入）；`App.tsx` 与路由表；
   - 标签（`ui/labels*`）、CSS、契约（`@erp/core/contracts`）；
   - `packages/web/test/**`（含 `setup.ts`）、`packages/infra/test/**`、`scripts/test-shard-weights.json`、`package.json` / lock。

## 冲突域

- web-ui:business-events（规则设置）：只改 `packages/web/src/business-events/settings.tsx`，并新增 `business-events/` 下的文件（决定 6）。
- 取证所需的观测点和新增测试文件：无（R4 脚本不提交）。
- 受影响的 e2e 断言（S13 回顾行动 1）：检索见“现状”；没有界面断言；**必须继续成立**：无浏览器场景，由 R3 的 jsdom 用例与 R4 覆盖；**须随本任务改**：无。
- 受影响的文档引用（D460）：`git grep -n -F "settings.tsx" -- docs design` 在 `914f041` 上命中 11 行，都是当时的事实记录，不改。
- 与同批任务不相交：REFAC-17 只改 `packages/core/src/application/trade-adjustments.ts` 与同目录新文件；不进 web 打包产物。两者没有共享文件。本任务不改任何测试文件。

## 验收

### base 失败、head 通过

| 编号 | 检查 | base `914f041` | head 要求 |
| --- | --- | --- | --- |
| R6a | `node fnlen.cjs packages/web/src`（口径同 S16–S24）中 `RuleSettings` 的行数 | **313**（失败） | ≤ 80，且本任务新增或改动的函数都 ≤ 80（`MasterSettings` 不改，不计） |
| R6b | 过账规则设置代码（`RuleSettings` 及其新抽出的组件、Hook 与函数）中 `(["exact", "group", "all"] as const)` 的出现次数；检索 `git grep -n -F '["exact", "group", "all"]' <rev> -- packages/web/src/business-events`，只计规则设置代码的命中行 | **2**（`:447`、`:478`，失败） | **1**（决定 5 的共用组件内）；PR 正文附 base 与 head 两侧检索原文与归属说明 |

### 两侧都须成立的不变量

- **R1 范围**：`git diff --name-only <base> <head>` 只含 `business-events/settings.tsx` 与 `business-events/` 下的新文件；决定 7 所列文件的 diff 为空。不加迁移。
- **R2 导出不变**：`settings.tsx` 的导出集合与 base 相同（`BusinessSettings`，function），`BusinessSettings` 与 `MasterSettings` 的函数体逐字不变。用仓库根 devDependency `@babel/parser` 解析，口径同 REFAC-14 R2。新文件的导出只在 `business-events/` 内使用，PR 正文附 `git grep` 结果。
- **R3 既有测试原样通过**：`business-events.test.tsx` 的 10 个用例（含 `:406`、`:470`）、`App.test.tsx` 与 Web 全部 jsdom 测试通过；测试文件 diff 为空。本机全量命令见“测试命令”。
- **R4 DOM、请求、锁定与焦点等价**（送审证据，脚本不提交，不加常驻 CI 用例）：
  - **两个驱动**，都是临时 jsdom 脚本，借用 `business-events.test.tsx` 的渲染方式与按路径分派的 `fetch` 桩，在 base 与 head 上按同一序列操作。`fetch` 桩改为**受控响应**（保存请求可挂起、成功、409 失败；规则与科目分页可返回第二页），采样边界同 [REFAC-10 R4](REFAC-10-order-list-split.md#验收)：
    - **驱动 A（整页）**：渲染 `App`，进入 `#/events` → 设置 → 规则；
    - **驱动 B（锁定直接观测）**：直接渲染导出的 `BusinessSettings`（套 `QueryClientProvider`），`lock` 属性换成**记录桩**，按调用顺序记下每个值。`BusinessSettings` 的 `lock` 由 `RuleSettings` 的 `lock(editing || busy)` 经 `setEditing` 与 `:31–34` 的效果直接转出，因此记录序列就是上层收到的锁定值，不以按钮 `disabled` 代替。
  - **焦点直接观测**：两个驱动都给 `HTMLElement.prototype.focus` 装记录桩（保留原实现），记下每次调用的目标（可访问名称与标签名）与调用次数；不只比较 `document.activeElement`。
  - **序列**至少包含：
    - 列表首屏 → 规则列表“加载更多”；
    - 新建：焦点调用一次，目标为代码输入；依次改方向（`pay`）、含义（`offset`）；对象范围 `exact` → `all`（对象代码变 `"*"` 且禁用）→ `group`（对象代码变 `""`）；往来方范围同样走 `all` → `exact`；填科目，科目候选“加载更多”（`PageControls`）后 `datalist` 增加选项；填维度；
    - 保存挂起：字段组禁用，再次派发 `submit`（同一时刻两次）只发出 1 个 POST（`working` 防重入）；放行成功 → `saved` 状态出现，表单关闭，`["business", <公司>, "posting-rules"]` 被失效并重新请求；焦点调用 0 次；
    - 编辑已有规则（`revision > 0`）：代码输入禁用，焦点调用一次，目标为“启用”复选框；保存返回 409 → 错误条，焦点调用一次，目标仍为“启用”复选框；
    - 取消（在 409 错误条显示时）：表单关闭，错误条消失；焦点调用 0 次；
    - **卸载时的在途保存**（驱动 B）：保存挂起时卸载组件，然后放行成功响应；
    - zh / en 各一遍；教学模式开与关各一遍（驱动 A）。
  - **每步采样**：DOM（`document.body.innerHTML`）；焦点调用记录与 `document.activeElement`；累计请求日志（序号、方法、URL、请求体原文、结果）；查询缓存（`queryKey`、`status`、`isInvalidated`，按键排序）；驱动 B 的锁定值记录；`console.error` 调用记录。
  - **判定**：base 与 head 逐步、逐项、逐字节相同；并且**直接断言**（只比两侧相同不够）：
    1. 驱动 B 的锁定记录：进入新建后最后一个值为 `true`；保存挂起期间为 `true`；保存成功、取消后最后一个值为 `false`；卸载后最后一个值为 `false`；
    2. 防重入：两次 `submit` 只记 1 个 POST；
    3. 焦点：新建与 409 失败各恰好 1 次焦点调用，目标如上；取消与保存成功后 0 次；
    4. 卸载时的在途保存：放行后不再发出规则列表请求，规则查询不被失效（`isInvalidated` 不变），`console.error` 无新增记录，锁定记录最后一个值为 `false`；
    5. 范围联动：`all` 时代码为 `"*"` 且输入禁用，切回其他范围时代码为 `""`。
    base 上任一直接断言不成立，先停下并向协调者报告，不得把“两侧相同”当作通过。PR 正文附脚本全文、步骤清单、两侧输出的 SHA-256 与比较结果，以及“锁定记录”“焦点调用记录”“卸载时的在途保存”三组场景的逐步输出原文。
- **R5 结构规则**（静态，评审按代码与 PR 表格核对）：
  - **R5a Hook 序列**：PR 正文列出 base 与 head 的 Hook 调用序列（自定义 Hook 按调用处展开）及参数与依赖的源文本（只归一空白），两侧逐行相同；base 一侧须与“现状”所列一致。任何差异即失败（本任务无豁免）。
  - **R5b 展示组件无 Hook**：新抽出的组件中没有任何 `use*` 调用；PR 正文附 Babel AST 检查脚本的输出。
  - **R5c 模块级定义**：所有组件、自定义 Hook 与函数都在模块顶层声明。
  - **R5d 插槽对等**：PR 正文用一张表列出“现状”中的 5 个子表达式（第 5 项再按字段列出），并标出 head 中对应的唯一组件或表达式。
  - **R5e 未改部分**：`BusinessSettings` 与 `MasterSettings` 逐字比较输出（不同即失败）。
- **R6 尺寸**：除上表 R6a、R6b 外，`settings.tsx` ≤ 300 行（base 556；`MasterSettings` 不动，故不设更低的线）；新文件各 ≤ 200 行；每个新函数满足 ②（≤ 80 行、嵌套 ≤ 3 层）；PR 正文列出所有超过 50 行的函数，附计数行数与最深层数（base 与 head 两列）。
- **R7 打包字节**：首屏按 D454。用 `scripts/measure/bundle-measure.mjs`，写明脚本所在的提交 SHA（[任务书模板“构建来源”](TEMPLATE.md#证据要求)）；base 为最终送审 head 的实际合并基，合并基变了就重新测量。预算（未列出的项 ±0）：

  | 项 | manifest 键 | 上限 | 依据 |
  | --- | --- | --- | --- |
  | 首屏 | — | **±0**（D454，`--d454`） | 改动文件都不在首屏闭包中（“chunk 归属”表）；首屏预算与路由预算互不矛盾 |
  | 业务事件路由新增 | `src/BusinessEvents.tsx` | ≤ **+500 B** | 估定，见下 |
  | 业务事件入口 chunk | `src/BusinessEvents.tsx` | ≤ **+500 B** | 同上 |
  | 共用 chunk 与其他路由 | 全部 | ±0 | 只导入、不改 |
  | CSS | 全部 | ±0 | 不改 CSS |

  命令参数：`--route src/BusinessEvents.tsx=+500 --chunk src/BusinessEvents.tsx=+500 --d454`。出现 base 没有的新 chunk 即停下报告；超出先停下，报设计角色与协调者，不得自行放宽。上限没有做试改构建：REFAC-14 定 +900 B（563 行），REFAC-15 定 +700 B（378 行）；本函数 313 行，且决定 5 的去重会减少一段重复的 JSX，按比例估 +500 B。
- **R8 质量门**：
  - **R8a 合并前**：`typecheck`、`lint`、CI-02 预检通过；PR CI（`ci.yml`）绿。
  - **R8b 合并后检查（不作合并门）**：合并后第一次覆盖该合并提交的 main Full 须绿；失败时报协调者，按 D456 暂停后续合并。
- **R9 可读性一节**：PR 正文按下节逐条说明。

### 测试命令（S22 回顾行动 4）

- 本机全量 web 测试一律用 `npx vitest run --project web`，PR 正文附汇总行原文，base 与 head 各一次。FLAKE-09（#330，D527、D530、D531）已合并，按新的测试设置解读。
- 有失败时，逐个列出失败的文件与用例，并附只对这些文件的串行重跑原文：`npx vitest run --project web --no-file-parallelism <失败文件…>`。不得自行更换并发参数而不说明；串行重跑仍失败即按真实失败处理。

## 性能考虑

- 渲染次数不变：不加 `memo`，不改 Hook 与依赖。不跑 Bench。打包变化由 R7 约束。其余项（规模、索引、查询次数、分页、事务）不适用：不改数据访问，请求序列由 R4 核对。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥：

- **②**：本任务就是为满足 ② 而做。`RuleSettings` 从 313 行拆到 ≤ 80 行（R6a）。最大的一块是表单（`:348–553`，约 200 行），须再按字段组拆分，各块 ≤ 80 行。
- **③**：`settings.tsx`（556 行）是热点；拆后 ≤ 300 行（R6），新文件各 ≤ 200 行。PR 正文贴 `git diff --numstat`。
- **①**：组件、Hook 与函数名表达职责，例如 `usePostingRuleEditor`、`PostingRuleList`、`PostingRuleForm`、`ScopeSelect`、`RuleAccountField`、`newPostingRule`、`scopeChange`；不用 `Part1`、`Section2`。
- **④**：分层对齐 REFAC-10–15 的做法：状态、请求与命令在一个 Hook，展示组件只接收 props；不抽跨页共用件（`ScopeSelect` 只在规则设置内使用）。
- **⑤**：见决定 5（两段范围下拉去重）。
- **⑥**：原有注释（`:275` 关于布局阶段重聚焦）随代码保留；不新增注释，除非某处拆分需要说明“为什么”；不留调试输出。
- **测试耗时**：本任务不改测试；R4 驱动脚本不提交。PR 正文附 `business-events.test.tsx` 在 base 与 head 上的耗时（vitest 汇总行原文），两侧差异 > 20% 时说明原因。

## 用户可见变化

- 无。过账规则设置的列表、新建与编辑、范围联动、科目候选、维度、保存与失败提示、取消、焦点与键盘行为、中英文与教学模式下的外观都不变（R3、R4）。

## 证据要求

- **不需要浏览器时段**：行为等价由 R3（既有 jsdom 用例）与 R4（逐步的 DOM、请求、锁定与焦点等价及直接断言）证明；没有 e2e 场景操作过账规则设置（“现状”检索）。R4 与构建在本机运行，须服从协调者的时段静默通知（D442 / D480）。
- **可行性**（S13 回顾行动 4）：R4 的驱动方式已在 REFAC-10（#291）至 REFAC-15（#332）跑通；`business-events.test.tsx` 的 `:406`、`:470` 已能挂起保存请求，`:291` 已有记录锁定值的写法（`locked()`），可移植到驱动 B。R6a、R6b 的 base 数字与 chunk 归属见“现状”（设计角色实测）。本任务书**没有**做试改构建，R7 的上限按拆分规模估定。
- PR 正文附：R2 导出与 `git grep` 结果；R4 脚本、步骤清单、比较结果、直接断言结果与三组场景的逐步输出；R5a–R5e 各表；R6 行数表（base 与 head 两列）；R6b 两侧检索原文；R7 的 `bundle-measure.mjs` 完整输出与退出码；“测试命令”的汇总行；可读性一节。R8b 合并后补到 PR 评论。
