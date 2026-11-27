# REFAC-41：拆分业务事件编辑器 `EventEditor` 与 `ClearingEditor`（不改行为）

- Sprint：S32（[计划](S32.md)）
- 类型：重构（web 页面；业务事件编辑表单与核销选行）
- 优先级：P2
- 决定：[D627](S32.md#s32-期间决定)。REFAC-41 不改行为：DOM、请求、焦点、键盘（含 Ctrl / ⌘ + Enter 预览）、Hook 序列、组件边界与 `key`、chunk 归属都不变；新增的只有无 Hook 的展示组件与原样搬移的组件。详见“范围与决定”1–9。
- 建议分支：`refac-41-split-business-event-editor`
- 来源：[S32 范围与验收](S32.md#范围与验收)第 1 行、[三项 REFAC 共用：可读性与嵌套复验](S32.md#三项-refac-共用可读性与嵌套复验)、[回顾行动落地](S32.md#回顾行动落地)；本任务书不放宽。
- 模板：[REFAC-38](REFAC-38-dimensions-page-split.md)（页面拆分、Hook 序列、jsdom 驱动 R4、打包字节 R7）。
- 迁移：**不加**。
- 浏览器时段：**不需要申请**。行为等价由 R3、R4 在 jsdom 中证明；R4 与构建在本机运行，须服从协调者的时段静默通知（D442 / D480）。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 为什么是它

- 按 [S30 统一量法](S30.md#s30-统一量法)（D615），`EventEditor` **216** 行、`ClearingEditor` **116** 行，是剩余页面中单文件超标函数最多的一处（[S32 选题依据](S32.md#选题依据可复现)，D626）。
- 两者职责可分：`EventEditor` = 表单外壳与键盘 + 公共字段 + 按业务类型的字段区 + 操作；`ClearingEditor` = 未清项查询 + 可勾选表格 + 已选行。拆分可以不动 Hook 与组件边界。
- 业务事件编辑是教学与日常记账的主入口；拆小可降低后续改动的评审面。

## 现状（main `218284a`）

下文 `file:line` 都按 `218284a372d4b84a2597665da863d1cd9120cc88`（S32 计划 [#480](https://github.com/lingshf/ai-native-erp/pull/480) 合并提交）；`packages/` 与 `34da911` 相同（`git diff --stat 34da911 218284a -- packages` 无输出）。

- `packages/web/src/business-events/editors.tsx` 共 **345** 行，最后一次改动为 `ca61d8a`（[#240](https://github.com/lingshf/ai-native-erp/pull/240)）。
- **导出**只有 `EventEditor`（`:14-229`，props 解构与类型 `:14-34`）；`ClearingEditor`（`:230-345`）不导出，只在 `:210` 使用。`EventEditor` 唯一的导入方是 `events-view.tsx:3`（渲染于 `:76-89`，只在有 `draft` 时挂载）。`BusinessEvents.tsx` 由 `App.tsx:50-51` 懒加载，自成路由 chunk。
- **`EventEditor` 结构**：
  - Hook：`useRef` `:35` → `usePage("services", company.code, businessMastersPageSchema, "", event.operation === "cash_service")` `:36-42` → `usePage("parties", …)` `:43-49`（同参，只换路径）→ `useEffect` `:50-52`（挂载时聚焦表单内第一个 `input`，依赖 `[]`）。
  - `form`：`onSubmit` 阻止默认、`!busy` 时 `preview()`（`:56-59`）；`onKeyDown` 在 `Enter` 且 `ctrlKey || metaKey` 时阻止默认、`!busy` 时 `requestSubmit()`（`:60-65`）。
  - `fieldset.ui-form-grid.jv-event[disabled=busy]` `:67`，`legend` `:68`。
  - 公共字段 `sourceRef` / `date` / `memo`（`:69-95`）。
  - `cash_service` 字段区（`:96-161`）：方向 `select`（`:98-110`）、服务输入 + `datalist#business-services`（`:111-128`）+ `PageControls` `:129`、往来单位输入 + `datalist#business-parties`（`:130-146`）+ `PageControls` `:147`、金额（`:148-159`）。
  - `statistics` 字段区（`:162-192`）：代码、数量、单位。
  - 维度区（`:193-203`，`cash_service` 或 `statistics`）：提示 + `DimensionFields`（`keys` 为 `dimensionKeys` 与已有键去重，`:198`）。
  - 冲销原单（`:204-208`，`cash_service.cancel`）。
  - `ClearingEditor`（`:209-217`，`clearing.match`）。
  - 操作（`:218-225`）：提交“预览”、按钮“取消”调 `close`。
- **`ClearingEditor` 结构**：Hook `useState(false)` `:243`（`enabled`）→ `usePage("events/open-items", company.code, openClearingPageSchema, "&account=…&date=…", enabled && valid)` `:245-251`；`valid` 为科目 4 位且日期 `YYYY-MM-DD`（`:244`）。科目输入改动时清空 `lines`（`:260`）；“未清项”按钮 `disabled={!valid}`，点击 `setEnabled(true)`，已启用时再 `refetch`（`:264-274`）；`enabled && valid` 时渲染 `PageTable`，每行一个勾选框，勾选追加、取消过滤（`:275-314`）；`VirtualRows` 列出已选行，“移除”按钮过滤（`:315-342`）。
- **`usePage`**（`list.tsx:11-30`）只有 1 个 Hook（`useInfiniteQuery`）；URL 为 `/api/v1/<path>?company=<code>&limit=100<query>[&cursor=]`（`list.tsx:8`、`:24`），键为 `["business", company, path, query]`（`list.tsx:9-10`）。
- **重复**：`label.ui-field > span.label` 外壳 10 处（`:69`、`:78`、`:87`、`:98`、`:111`、`:130`、`:148`、`:164`、`:172`、`:182`；`:148` 的标签含币种）；`datalist` 的 `pages.flatMap((p) => p.items).map(…)` 2 处（`:120-128`、`:138-146`）；按 `entryId` + `lineNo` 过滤已选行 2 处（`:302-305`、`:331-333`）。
- **产品代码中的随机值**：`crypto.randomUUID()` 在 `event-drafts.ts:9`（新草稿 `id`）与 `event-commands.ts:75`（预览复核 `key`）；业务事件 UI 中没有 `Date`、`Math.random` 调用（`git grep -n -e randomUUID -e "Date" -e "Math.random" 218284a -- packages/web/src/business-events packages/web/src/BusinessEvents.tsx` 只有这两处 `randomUUID` 与 `RuleDateField` 组件名）。
- **测试**：`packages/web/test/business-events.test.tsx`（736 行，`web` 项目；`fetch` 用 `vi.stubGlobal`；起始 `#/events` 见 `:44`；固定 `id` 与 `createdAt` 见 `:16-17`；用例起始行 `:43`、`:291`、`:406`、`:470`、`:523`、`:648`、`:679`、`:689`、`:701`、`:717`）。
- **新文件名**：`git ls-files packages/web/src/business-events | grep -E "event-editor-|clearing-editor"` 在 `218284a` 上无输出。
- **历史引用**：`MCF-20-business-event-gui.md:29`、`REFAC-14-company-events-split.md:25`、`:27`、`:85` 引用本文件行号，按各自 base，不改（[S32 跨文件验收](S32.md#跨文件验收d595按文件列验收句)）。

## 范围与决定

1. **只拆不改**：不改 DOM（元素、属性及其顺序、`className`、`id`、文本键）、请求、焦点、键盘、文案与样式；不修缺陷。发现疑似缺陷时在 PR 正文记录并报协调者，另开 Backlog。
2. **Hook 序列不变**：`EventEditor` 与 `ClearingEditor` 各自的 Hook 调用顺序、参数与依赖源文本不变（R5a）。允许把**整个** `ClearingEditor` 原样搬到 `clearing-editor.tsx`（Hook 随之搬移，序列不变）；不允许把 `usePage` 等 Hook 挪进新抽出的字段区组件。
3. **组件边界不变**：`EventEditor` 的 JSX 中直接渲染 `<ClearingEditor …>`，props 与条件不变；新抽出的展示组件是无 Hook、无状态的函数组件，以 props 接收 `event`、`change`、`t` 与所需的查询结果（例如 `services`、`parties`），不加 `memo`、不加 `key`。
4. **表单外壳留在 `EventEditor`**：`form` 的 `ref`、`onSubmit`、`onKeyDown`，`fieldset`、`legend` 与各区的出现条件原样留在 `EventEditor`；字段区组件只返回原 `<>…</>` 片段的内容。
5. **建议拆法**（不强制）：`EventCommonFields`（`:69-95`）、`CashServiceFields`（`:96-161` 片段内容，含两个 `PageControls`）、`StatisticsFields`（`:162-192`）、`EventDimensions`（`:193-203`）、`EventActions`（`:218-225`）→ `event-editor-fields.tsx` / `event-editor-cash.tsx`；`ClearingEditor` 与其 `OpenItemsTable`（`:275-314`）、`SelectedLines`（`:315-342`）→ `clearing-editor.tsx`。props 类型可抽为 `EventEditorProps`。
6. **重复抽取**：`label.ui-field > span.label` 外壳 10 处 → 一个展示组件（例如 `EventField({ label, children })`），**输入元素留在调用处**，属性及顺序原样；`:148` 的币种标签以 `label` 传入同样的子节点。`datalist` 与已选行过滤各 2 处，可不抽；若抽取，DOM 与 `change` 的实参须不变（R4 判定）。
7. **签名不变**：`EventEditor` 的导出名、props 名称与类型不变；`events-view.tsx` 无 diff。
8. **文件布局**：`editors.tsx` 保留 `EventEditor` 导出；新文件为同目录 `event-editor-*.tsx` 或 `clearing-editor*.tsx`（[S32 泳道](S32.md#泳道按冲突域) B）。新文件不从 `./editors.tsx` 导入运行时值；新文件之间单向无环（R5d）。
9. **不改的路径**：`packages/web/src/business-events/` 下其余文件、`packages/web/src/**` 其余文件、`packages/web/test/**`、`packages/core/**`、`packages/infra/**`、`docs/**`、CSS。

## 冲突域

写入域：`packages/web/src/business-events/editors.tsx` 与同目录新增 `event-editor-*.tsx`、`clearing-editor*.tsx`（`218284a` 上不存在）。与 REFAC-42（infra）、REFAC-43（core）无文件交集，可并行。

## 验收

### base 失败、head 通过

量法用 [S30 统一量法](S30.md#s30-统一量法)（D615，命令见“可读性”）；base 为最终送审 head 的实际合并基（当前 `218284a`）。

| 编号 | 检查 | base `218284a` | head 要求 |
| --- | --- | --- | --- |
| R6a | 函数长度（不计空行与纯注释行，外层含内层） | `EventEditor` **216**、`ClearingEditor` **116**（失败） | `editors.tsx` 与新文件中每个函数 ≤ 80 |
| R6b | 嵌套深度 | `EventEditor` 3、`ClearingEditor` 3（已满足） | 每个函数 ≤ 3（保持） |
| R6c | 文件行数（`(Get-Content <file>).Count`） | `editors.tsx` **345** | `editors.tsx` ≤ **150**；新文件各 ≤ **150** |

上表 head 要求都是**硬上限**。`editors.tsx` ≤ 150 由设计角色按决定 5 估定（`EventEditor` 拆后约 72 行，加导入与 props 类型），未经试拆实测。实测超出即停下，报设计角色与协调者；不得自行放宽，也不得为凑数字机械拆分。是否调整由 TL 决定，并记入 PR。

### 两侧都须成立的不变量

- **R1 范围**：`git diff --name-only <base>...<head>` 只含 `editors.tsx` 与同目录新增的 `event-editor-*.tsx`、`clearing-editor*.tsx`；决定 9 所列路径 diff 为空。不加迁移。
- **R2 导出不变**：用 `@babel/parser`（插件 `typescript`、`jsx`）解析，`editors.tsx` 的导出名集合两侧都为 `["EventEditor"]`，签名源文本相同（只归一空白）；`events-view.tsx` 无 diff。新文件的导出只在 `editors.tsx` 与新文件之间使用，PR 正文附 `git grep` 结果。`npm run typecheck`、`npm run check` 通过。
- **R3 既有测试原样通过**：`npx vitest run --project web` 全部通过；测试文件 diff 为空。PR 正文附汇总行原文，base 与 head 各一次。
- **R4 DOM、请求、焦点、键盘等价**（送审证据；驱动不提交，不加常驻 CI 用例）：
  - **驱动**：临时 jsdom 脚本（`web` 项目），在 base 与 head 上按同一序列操作；渲染 `App`，起始 `#/events`（同 `business-events.test.tsx:44`），`HTMLDialogElement` 桩同 `:19-40`。`fetch` 桩改为受控响应：公司、事件列表等页面所需请求返回固定夹具；`services` / `parties` 首页可带 `nextCursor`；`events/open-items` 可返回 0 行、3 行或带 `nextCursor`；`events/preview` 可返回固定预览、挂起或 409 `CONFLICT` 信封；事件详情返回一个已确认的 `cash_service`（用于进入冲销）。
  - **记录**：每次请求的序号、方法、URL（`pathname + search`）、请求体与 `signal.aborted` 最终值；`HTMLElement.prototype.focus` 装记录桩；`HTMLFormElement.prototype.requestSubmit` 用委托包装记录调用（保留原实现）。记录规则同 [REFAC-28 R4](REFAC-28-close-wizard-split.md#两侧都须成立的不变量)（委托包装、不用 `Proxy`、递增序号、确定性编码），并带 REFAC-17 自测（a）–（c）。同一驱动连续两次运行输出逐字节相同。
  - **每步采样**：`document.body.innerHTML`；累计请求日志；焦点记录与 `document.activeElement`；`fieldset` 的 `disabled`；`console.error` 记录。
  - **夹具确定性**（[S31 回顾行动 1](../reviews/S31-retro.md#行动项汇总)，[S32 回顾行动落地](S32.md#回顾行动落地)）：
    1. 夹具（`fetch` 响应、输入值、事件 `id`、日期、`createdAt`）一律写固定值，不得出现 `randomUUID`、`Math.random`、`Date.now`、`new Date(` 或读取当前时间的写法；`git grep -n -e randomUUID -e "Math.random" -e "Date.now" -e "new Date(" -- <驱动文件>` 须无输出，原文附 PR。
    2. **产品代码中的随机值**：新草稿 `id`（`event-drafts.ts:9`）与复核 `key`（`event-commands.ts:75`）调 `crypto.randomUUID`，草稿 `id` 会进入预览请求体。驱动用 `vi.spyOn(crypto, "randomUUID")` 换成从 1 起的计数器（格式仍为 UUID，例如 `00000000-0000-4000-8000-000000000001`），不得在记录中删去或改写这些值。
    3. **时间**：`vi.useFakeTimers({ toFake: ["Date"] })` 并 `vi.setSystemTime` 为固定值（例如 `2026-01-31T00:00:00.000Z`），只冻结 `Date`，不冻结定时器。若冻结后 base 上驱动行为变化或报错，停下上报，不得改为不冻结。
    4. **借用 helper**：不借用 `web/test/` 的数据构造 helper；如必须借用，PR 正文逐个列出其随机默认值并在调用处覆盖。照抄 `business-events.test.tsx` 的常量（`:7-17`）可以，它们是固定值。
    5. 送审时固定夹具构建步骤与夹具 SHA-256（把全部 `fetch` 响应与输入序列按步骤顺序做确定性 JSON 编码后取哈希）；附“在两个新目录中独立重建两次，夹具哈希相同”的原始输出。
    6. 不满足 1–5 就不送审。约束之间冲突时停下上报，不得在证据中遮掉。
  - **判定**：base 与 head 逐步、逐项、逐字节相同，并且**直接断言**下列期望值。预期值由设计角色从 `218284a` 源码推出，**未用驱动在 base 上实测**；开发须先在 base 上跑通，任一条不成立即停下报协调者与设计角色，不得改断言迁就，也不得改产品代码。语言 zh，公司 `DEFAULT`（夹具同 `business-events.test.tsx:7-15`）。
    1. **新建现金服务**：点“新建 · 现金服务”：编辑器出现，新增请求依次含 `GET /api/v1/services?company=DEFAULT&limit=100`、`GET /api/v1/parties?company=DEFAULT&limit=100`（`:36-49`、`list.tsx:24`）；焦点记录最后一项为 `sourceRef` 输入（`:50-52`）。
    2. **服务分页**：服务首页带 `nextCursor` 时，`datalist#business-services` 的 `option` 数等于首页条数，并出现“加载更多”；点一次追加 `GET /api/v1/services?company=DEFAULT&limit=100&cursor=<值>`，`option` 数为两页之和。
    3. **Ctrl + Enter 预览**：填齐必填项后在任一输入上按 `Ctrl+Enter`：`requestSubmit` 1 次，1 次 `POST /api/v1/events/preview`，请求体中的事件 `id` 为计数器值；`⌘ + Enter`（`metaKey`）同样。只按 `Enter` 不触发 `requestSubmit`（`:60-65`）。
    4. **忙时**：预览请求挂起时 `fieldset` 为 `disabled`；再按 `Ctrl+Enter` 不新增请求。
    5. **统计**：取消后点“新建 · 统计”：出现代码、数量、单位与维度区；不新增 `services` / `parties` 请求（`enabled` 为 `false`）。
    6. **核销**：点“新建 · 核销”：“未清项”按钮 `disabled`；填科目 `1122` 与日期 `2026-01-31` 后可点；点一次追加 `GET /api/v1/events/open-items?company=DEFAULT&limit=100&account=1122&date=2026-01-31`；再点一次重新请求同一 URL（`:268-271`）。勾选 2 行后“已选”表有 2 行；移除 1 行后剩 1 行；改科目后“已选”表为空（`:260`）。
    7. **冲销**：打开已确认现金服务的详情，点“冲销”（`event-detail.tsx:77`）：编辑器只显示公共字段、原单号与操作，不出现维度区。
    8. **取消**：点“取消”：编辑器卸载，`close` 生效（`events-view.tsx:85-88`）。
    9. **焦点与键盘**：每次打开编辑器（断言 1、5、6、7）焦点记录各新增一项且为 `sourceRef` 输入（`:50-52`）；其余焦点记录只比两侧相同；Tab 顺序（按 DOM 顺序列出可聚焦元素）两侧相同。
    驱动另跑一遍 en、教学模式开与关各一遍，只比两侧相同。
  - **PR 正文附**：驱动全文与步骤清单；两侧输出的 SHA-256 与比较结果；直接断言 1、3、6 的逐步输出原文。
  - **驱动原件**：PR 正文贴原文件字节的 base64，或同时给原始字节与“UTF-8 解码、换行归一为 LF”两种 SHA-256。
- **R5 结构规则**（静态）：
  - **R5a Hook 序列**：PR 正文按组件列出 base 与 head 的 Hook 调用序列（自定义 Hook 按调用处展开），附参数与依赖源文本（只归一空白）。两侧逐行相同；base 一侧须与“现状”一致（`EventEditor` 4 项：`useRef`、`useInfiniteQuery`（`services`）、`useInfiniteQuery`（`parties`）、`useEffect`；`ClearingEditor` 2 项：`useState`、`useInfiniteQuery`（`events/open-items`）；`usePage` 在三处调用处展开）。没有豁免。
  - **R5b 展示组件无 Hook**：新抽出的组件中没有任何 `use*` 调用；附 Babel AST 检查脚本输出。
  - **R5c 原文搬移**：下列各项 base 与 head 逐字比较，只归一缩进；决定 6 的抽取是仅有的例外，PR 正文逐处贴出两侧原文：
    - `onSubmit`、`onKeyDown` 回调（`:56-65`）与 `useEffect` 回调及依赖（`:50-52`）；
    - 每个输入 / 选择元素的全部属性（含 `onChange` 回调原文）；
    - 各区的出现条件（`:96`、`:162`、`:193`、`:204`、`:209`）；
    - `ClearingEditor` 的 `valid` 表达式（`:244`）、查询串模板（`:249`）、按钮 `onClick`（`:268-271`）、勾选 `checked` 与 `onChange`（`:294-307`）、移除 `onClick`（`:328-335`）。
  - **R5d 依赖方向**：新文件不从 `./editors.tsx` 导入运行时值；新文件之间单向无环；`events-view.tsx` 无 diff；附导入图。
- **R6 尺寸**：见上表；PR 正文列出超过 60 行的函数，附行数与最深层数（base 与 head 两列）。
- **R7 打包字节**：用 `scripts/measure/bundle-measure.mjs`（写明脚本所在提交 SHA；`218284a` 上该文件最后一次改动为 `6156759`），base 取最终送审 head 的实际合并基，合并基变了就重测。预算（未列出项为 ±0）：

  | 项 | manifest 键 | 上限 | 依据 |
  | --- | --- | --- | --- |
  | 首屏 | — | **±0**（D454，`--d454`） | 改动文件不在首屏闭包 |
  | 业务事件页路由 | `src/BusinessEvents.tsx` | ≤ **+700 B**（硬上限） | 估定，见下 |
  | 业务事件页入口 chunk | `src/BusinessEvents.tsx` | ≤ **+700 B** | 同上 |
  | CSS 与其他路由、共用 chunk | 全部 | ±0 | 不改 CSS，只导入 |

  命令参数：`--route src/BusinessEvents.tsx=+700 --chunk src/BusinessEvents.tsx=+700 --d454`。上限未做试改构建：REFAC-28 拆 263 行实测 +450 B（gzip），本任务要拆的两个组件合计 332 行，按比例约 +570 B，取 +700 B。出现 base 没有的新 chunk、或超出上限，即停下报设计角色与协调者；不得自行放宽，也不得为压字节改变拆分结构或行为。
- **R8 质量门**：R8a 合并前 `npm run typecheck`、`npm run check`、CI-02 预检通过，PR CI 绿；R8b 合并后第一次覆盖该合并提交的 main Full 须绿，失败报协调者，按 D456 暂停后续合并。
- **R9 可读性一节**：PR 正文按下文“可读性”逐项给出改前 / 改后数据。

### 测试命令

```powershell
npx vitest run --project web packages/web/test/business-events.test.tsx
npx vitest run --project web
npm run typecheck; npm run check
node scripts/measure/bundle-measure.mjs --base <合并基全 SHA> --head <head 全 SHA> --work <新目录> --route src/BusinessEvents.tsx=+700 --chunk src/BusinessEvents.tsx=+700 --d454
```

全量 web 测试有失败时，逐个列出失败文件与用例，并附 `npx vitest run --project web --no-file-parallelism <失败文件…>` 的串行重跑原文；串行仍失败的按真实失败处理。

## 性能考虑

- 渲染次数不变：组件边界与 `key` 不变，不加 `memo`，Hook 与依赖不变（决定 2、3）。新增展示组件是无状态函数组件，只多一层函数调用。
- 请求次数与时机不变（R4 直接断言 1–6）；查询的 `enabled` 条件原样保留。
- 不跑 Bench。打包变化由 R7 约束。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥ 与 [S32 共用要求](S32.md#三项-refac-共用可读性与嵌套复验)。PR 正文“可读性”一节按下表逐项给出**改前 / 改后**数据。

| 维度 | 要求 | 改前（`218284a`，设计角色实测） | PR 正文改后须列 |
| --- | --- | --- | --- |
| 函数长度（②） | `editors.tsx` 与新文件每个函数 ≤ 80 | `EventEditor` 216、`ClearingEditor` 116 | 量法对 `editors.tsx` 与全部新文件的**完整输出**；超过 60 行的逐个列行数 |
| 嵌套深度（②） | 每个函数 ≤ 3 | `EventEditor` 3、`ClearingEditor` 3 | 同一输出第 2 列；超过 2 层的逐个说明 |
| 文件长度（③） | `editors.tsx` ≤ 150；新文件各 ≤ 150 | `editors.tsx` 345；`event-editor-*.tsx`、`clearing-editor*.tsx` 不存在 | `git diff --numstat <base> <head>` 与拆后行数 |
| 重复（④） | 第三次出现即抽取 | `label.ui-field > span.label` 外壳 10 处；`datalist` 选项 2 处；已选行过滤 2 处 | 外壳的去向（决定 6）；2 处的两类写明抽或不抽及理由 |
| 命名（①） | 新组件、新文件名表达业务含义；不用 `step1`、`part2`、`helper`、`utils` | — | 新增名称清单，每个一句职责；附 `git diff --name-only <base>...<head> \| grep -i -E "step[0-9]\|part[0-9]\|helper\|util"` 输出（预期为空） |

### 量法

用 [S30 统一量法](S30.md#s30-统一量法) 的 `s30-measure.cjs`，脚本原文以 S30.md 该节为准，本任务书不另附。在仓库根目录运行：

```powershell
node <保存位置>\s30-measure.cjs 218284a packages/web/src/business-events/editors.tsx
node <保存位置>\s30-measure.cjs <head> packages/web/src/business-events/editors.tsx @(git diff --name-only --diff-filter=A <base> <head> -- packages/web/src/business-events)
```

base 完整输出（`行数 / 层数 / 范围 / 名称`）：

```text
216  3  :14-229   EventEditor
116  3  :230-345  ClearingEditor
```

开发在 base 上重跑的输出与上表不符时，先停下报告。

### 其余各条

- **②**：拆后 `EventEditor` 只做“Hook → 表单外壳与键盘 → 按业务类型挑选字段区 → 操作”；`ClearingEditor` 只做“Hook → 科目与加载按钮 → 未清项表 → 已选行”。
- **⑤**：`maxLength` 的 `100`、`200`、`40` 与正则原样保留，不新增未命名数字。
- **⑥**：不新增注释，除非拆分需要说明“为什么”。不留调试输出。
- **测试耗时**：PR 正文附 `business-events.test.tsx` 在 base 与 head 上的耗时（vitest 汇总行原文）；两侧差异 > 20% 时说明原因。

## 用户可见变化

- 无。新建现金服务 / 统计 / 核销、冲销、服务与往来单位分页、未清项勾选与移除、Ctrl / ⌘ + Enter 预览、中英文与教学提示都不变（R3、R4）。

## 证据要求

- **原始输出固定**（S30 回顾行动 1）：摘要、哈希与驱动不算原始证据。R3 汇总行、R4 两侧输出、夹具两次重建输出、R5 抽取输出、R6 量法输出、R7 测量输出的原文，须固定到带修订号的链接（例如 gist 的某个 revision），PR 正文给出链接与该文件的 SHA-256。
- **分支清单**（S30 回顾行动 2）：PR 正文附 base 上被拆组件的条件分支清单及枚举命令 `git grep -n -e "&&" -e "?" -e "if (" 218284a -- packages/web/src/business-events/editors.tsx`，并把 R4 直接断言逐一对到分支：`!busy`（`:58`、`:63`，断言 3、4）；`Enter` 与修饰键（`:61`，断言 3）；各业务类型区（`:96`、`:162`、`:193`、`:204`、`:209`，断言 1、5、6、7）；方向选择的取值守卫（`:103`）；`party` 空串转 `null`（`:135`）；`enabled` 与 `valid`（`:244`、`:250`、`:267`、`:270`、`:275`，断言 6）；勾选与取消（`:300-305`，断言 6）。没有被断言覆盖的分支写明原因。
- **夹具确定性**（S31 回顾行动 1）：PR 正文附 R4“夹具确定性”1–5 的命令与输出原文；Reviewer 与 QA 各自独立重建一次，哈希须与 PR 正文相同。
- **QA 留证**（S30 回顾行动 3）：QA 在 base、head 两侧实跑 R3 与 R4，并独立重建夹具后，在本开发 PR 下发评论（PASS / FAIL、所跑命令、用例数、夹具哈希、对比结果）；时点为评审批准后、合并前；未发不合并。
- **可行性**：设计角色在 `218284a` 上实测了 R6 的 base 数字；R4 直接断言与 R7 base 字节**未实测**，开发先在 base 上跑，不成立或缺数时先停下报告。

## 合并后项

- QA 结论（PR 评论链接），见 [S32 执行状态](S32.md#执行状态)。
- Product/Design 在合并提交上用 S30 统一量法复测 `editors.tsx` 与新文件，确认 main Full 结果，结论以评论发在开发 PR。

## 设计自查

- [x] 冲突域与 REFAC-42、REFAC-43 逐文件不相交；不改 `events-view.tsx`、测试文件、CSS 与 `docs/`。
- [x] R6a 有 base 实测值（base 失败）；R6b base 已满足，要求保持；`editors.tsx` ≤ 150 与 R7 +700 B 为估定硬上限，未试拆、未实测 base 字节，超出即停下由 TL 决定。
- [x] Hook 序列 base 一侧逐项列出（4 + 2）；新组件无 Hook；`ClearingEditor` 只能整体搬移。
- [x] 键盘：Ctrl / ⌘ + Enter 预览、忙时不提交、只按 Enter 不触发，均有直接断言，注明未实测。
- [x] R4 一节写明 S31 回顾行动 1（无随机值与当前时间、`randomUUID` 用计数器替换、冻结 `Date`、helper 默认值、夹具 SHA-256、两次独立重建、不满足不送审、冲突停下上报）。
- [x] 可读性五项都有要求、改前数据（S30 统一量法完整输出）与改后须列；无用户可见变化。
- [x] 不加迁移，不碰 `scripts/slot/`、`scripts/measure/`。
