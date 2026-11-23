# REFAC-03b：拆分 `CompanyJournals` 函数体（不改行为）

- 类型：重构（页面）　优先级：P2　决定：**D438**　建议分支：`refac-03b-split-company-journals`
- 来源：REFAC-03（#226，main `e8ef434`）只搬移、不拆函数体，把“按 ② 拆 `CompanyJournals`（约 1030 行）”登记进候选池（[S13 REFAC-03 范围第 4 条、可读性 ②](S13.md#refac-03拆分-journalstsx只搬移不改行为)）。
- 排期：S13 追加，#226 合并后空出的名额可以马上派发。不进 DEMO-13 门禁；S13 收尾前未合并则顺延为 S14 项。
- 迁移：**不加**。浏览器时段：**不需要**（理由见“证据要求”）。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 现状（main `e8ef434`）

- `packages/web/src/journals/company-journals.tsx` 共 1101 行：
  - 模块层有 `emptyLine`、`fresh`、`url`、`toMinor`、`lineTotals`（`:36–74`）；
  - 其余基本都是 `export function CompanyJournals`（`:75–1100`），远超 ②。
- `CompanyJournals` 内部大致分两块：
  - **状态与命令**（`:75–377`）：
    - 15 个 `useState`、7 个 `useRef`；
    - `loadDetail`（`useCallback`）、4 个 `useEffect` / `useLayoutEffect`（加载明细、存活标记、新行聚焦、返回焦点、草稿载入聚焦）；
    - 3 个 `useInfiniteQuery`（凭证列表、科目、维度）；
    - 命令函数 `edit`、`run`、`save`、`preview`、`confirm`（约 50 行，`try` / `catch` 内嵌两层 `if`，嵌套已超 3 层）、`change`、`addLine`、`rowKey`、`correction`。
  - **JSX**（`:378–1099`），顶层 Fragment 下依次为：
    - 工具栏、列表（`VirtualRows`）、加载更多；
    - 错误、忙碌、已保存提示；
    - 编辑表单（`:494–852`，约 360 行：常规 FastTab、分录行表、合计、操作按钮）；
    - `AiPanel`、删除确认 `Modal`（`:871–904`）、过账确认 `Modal`（`:907–991`）；
    - 已排队提示、过账回执（`:1004–1026`）、已过账明细（`:1029–1097`）。
- 唯一导出是 `CompanyJournals`，导入方只有 `Journals.tsx:8`。
- 测试：`packages/web/test/journals.test.tsx` 有 5 个 jsdom 用例，覆盖新增行（Enter / Tab）、预览与确认、不确定确认重试、虚拟分页、AI 面板、教学模式、中英文。没有真实浏览器用例驱动凭证页（`packages/infra/test/support` 中无凭证页步骤）。
- 同目录的 `dialogs.tsx`（287 行）、`virtual-rows.tsx`（80 行）与 `Journals.tsx`（93 行）已满足 ③，本任务不改。

## 范围与决定

1. **不改行为**。以下内容全部不变：
   - DOM 结构、类名、文本、属性；
   - 焦点移动；
   - 请求的方法、URL、请求体与发出顺序；
   - 查询键与缓存失效。

   本任务只改代码组织，不修 bug；拆分时发现的疑似缺陷登记在 PR 正文，留作后续任务。
2. **状态只有一个主人**：
   - 所有 `useState`、`useRef`、`useCallback`、`useEffect`、`useLayoutEffect`、`useInfiniteQuery`、`useQueryClient` 调用，要么留在 `CompanyJournals`，要么放进它在顶层无条件调用的自定义 Hook（例如 `useJournalLookups`、`useJournalFocus`、`useJournalDetail`，名称由开发定）。
   - 新抽出的**展示组件不得调用任何 Hook**，只接收 props 渲染。原因：子组件里的状态会随条件渲染卸载而重置，子组件的 layout effect 会先于父组件执行，两者都会改变现有行为。
   - 展开自定义 Hook 之后，Hook 调用序列（种类、先后顺序、依赖数组源文本）与 base 相同（验收 P5a）。
3. **组件层级对等**：
   - 新组件一律在**模块顶层**定义，不得在渲染函数内定义，否则每次渲染都会重新挂载，输入框会失焦。
   - 抽出的组件只替换父级 JSX 中的**一个子表达式**，并且只渲染该表达式原来渲染的内容。不得把几个相邻的兄弟元素合成一个返回 Fragment 的组件，否则后续兄弟的位置会变，`VirtualRows`、`AiPanel`、`Modal`、`FastTab` 等有状态组件可能被重新挂载。
   - 条件渲染的条件（如 `{draft && …}`、`{deleting && …}`）留在父级原位置。
3a. **命令函数**：
   - `run`、`save`、`preview`、`confirm`、`correction` 等可以搬进自定义 Hook，也可以搬成模块级函数（显式接收所需的状态与 setter）。
   - 为满足 ② 的嵌套上限，可以把 `confirm` 的成功分支与失败分支各抽成具名函数。但调用 setter 与 `invalidateQueries` 的顺序、`alive.current` 的检查位置都不变。
4. **文件**：新文件放在 `packages/web/src/journals/` 下，按职责命名（例如 `journal-toolbar.tsx`、`journal-list.tsx`、`journal-editor.tsx`、`journal-lines.tsx`、`journal-confirm.tsx`、`journal-detail.tsx`、`use-journal-*.ts`），粒度由开发定，写入 PR 正文。模块层的 `emptyLine`、`fresh`、`url`、`toMinor`、`lineTotals` 可以搬进共享的小文件，但不改实现。
5. **不改**：
   - `Journals.tsx`、`dialogs.tsx`、`virtual-rows.tsx`；
   - `packages/web/test/**`、`scripts/test-shard-weights.json`；
   - 标签文件（`ui/` 下的中英文案）、CSS、契约（`@erp/core`）；
   - 其他页面与导入方。
6. **旧名**：REFAC-03 登记的改名候选 `type T`、`url`、`fresh` 可以在本任务中改为表达职责的名字（①），但 `T` 由 `dialogs.tsx` 导出，本任务不改 `dialogs.tsx`，所以 `T` 只能以别名形式使用，不改其定义。

## 冲突域

- web-ui:journals：只改 `packages/web/src/journals/company-journals.tsx`，并在 `packages/web/src/journals/` 下新增文件。
- 与在岗任务不相交：
  - M2-05a / M2-05b：`legacy-import.ts`、`opening-items.ts`、`bench-migration-rehearsal.mjs`、迁移手册；
  - REFAC-01b：`trade-gui-scenario.ts`、`order-invoicing-filter.ts` 与 `trade-gui/scenario/`；
  - hotfix #229：tests:trade-e2e。
- 当前没有其他打开的 PR 改 `packages/web/src/journals/`。

## 验收

- **P1 范围**：`git diff --name-only <base> <head>` 只含 `packages/web/src/journals/company-journals.tsx` 和 `packages/web/src/journals/` 下的新文件；`Journals.tsx`、`dialogs.tsx`、`virtual-rows.tsx`、`packages/web/test/**`、标签、CSS、`scripts/test-shard-weights.json` 的 diff 为空。不加迁移。
- **P2 导出不变**：`company-journals.tsx` 的导出集合（名称加类别）与 base 相同，即只有 `CompanyJournals`。用仓库根 devDependency `@babel/parser` 解析，口径同 [REFAC-03 M2c（D433）](S13.md#refac-03拆分-journalstsx只搬移不改行为)。新文件的导出只供 `journals/` 目录内部使用，`packages/web/src/journals/` 以外不得导入它们（PR 正文附 `git grep` 结果）。
- **P3 既有测试原样通过**：`packages/web/test/journals.test.tsx` 的 5 个用例和 Web 全部 jsdom 测试通过；测试文件 diff 为空。
- **P4 DOM 与请求等价**（送审证据，脚本不提交）：
  - 写一个临时的 jsdom 驱动脚本，可以借用 `journals.test.tsx` 的渲染与 `fetch` 桩，在 base 和 head 上按同一序列操作。
  - 渲染前固定 `crypto.randomUUID`（按调用次序返回确定值）和时钟。
  - 序列至少包含以下状态：
    - 空列表；
    - 有行的列表与加载更多；
    - 新建草稿；
    - 用 Enter 加行、用 Tab 加行；
    - 填写维度；
    - 预览（过账确认 `Modal`）；
    - 不确定确认后的错误；
    - 草稿保存提示；
    - 删除确认 `Modal`；
    - 过账回执；
    - 已排队提示；
    - 已过账明细，以及冲销、替换、重分类三种更正；
    - 教学模式开 / 关；
    - zh / en 两种语言。
  - 每一步之后记录三项：
    - `document.body.innerHTML`；
    - `document.activeElement` 的定位（标签名、`id`、`name`、`data-*`、在父级中的序号）；
    - 截至该步累计的请求日志（方法、URL、请求体 JSON）。
  - base 与 head 逐步逐字节相同。PR 正文附脚本全文、步骤清单、两边输出的 SHA-256 和比较结果（差异为 0）。这一项用来弥补 P3 断言覆盖不到的 DOM 细节。
- **P5 结构规则**（静态，评审按代码与 PR 表格核对）：
  - **P5a Hook 序列**：PR 正文列出 base 与 head 的 Hook 调用序列，自定义 Hook 按调用处展开。每行写 Hook 种类和依赖数组源文本（空白归一）。两边逐行相同。
  - **P5b 展示组件无 Hook**：新抽出的组件（首字母大写、返回 JSX 的函数）中没有任何 `use*` 调用。PR 正文附 Babel AST 检查脚本的输出。
  - **P5c 模块级定义**：所有组件与自定义 Hook 都在模块顶层声明，`CompanyJournals` 与 Hook 的函数体内不再声明组件。
  - **P5d 插槽对等**：PR 正文用一张表列出 base 中 `CompanyJournals` 顶层 Fragment 的子表达式，以及编辑表单内部被抽出的子表达式，标出 head 中对应的唯一组件或表达式，两边一一对应。
- **P6 尺寸与可读性**：
  - `CompanyJournals`、每个自定义 Hook、每个新组件与命令函数都满足 ②（≤ 80 行、嵌套 ≤ 3 层）；
  - `company-journals.tsx` ≤ 200 行，`journals/` 下每个新文件 ≤ 400 行；
  - PR 正文列出所有超过 60 行的函数，附计数行数与最深层数。
- **P7 打包字节**（构建条件、依赖图、D432 字节口径同 [REFAC-03 M4](S13.md#refac-03拆分-journalstsx只搬移不改行为)）：
  - 首屏集合相同，每块原始字节 ±0，屏蔽哈希后的 gzip-9 字节 ±0；
  - 凭证路由“路由新增”部分的 JS 合计（屏蔽哈希后的 gzip-9）增加不超过 300 B（拆分会新增少量 props 传递代码）；其他四个路由（业务事件、总账报表、期末结账、贸易报表）的“路由新增”部分增加不超过 200 B；
  - 各路由 CSS 字节不变。

  超出阈值先停下报设计角色。
- **P8 质量门**：`typecheck`、`lint` 通过；PR CI 绿；合并后覆盖该合并提交的 main Full 绿。
- **P9 可读性一节**：PR 正文按下节逐条说明。

## 性能考虑

- 渲染次数不变：不加 `memo`，不改 Hook 依赖，所以每次状态变化触发的渲染与 base 相同。组件层级加深只增加少量函数调用，不跑 Bench。
- 打包变化由 P7 约束。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥：

- **②**：本任务就是为满足 ② 而做。`CompanyJournals` 从约 1030 行拆到每个函数 ≤ 80 行、嵌套 ≤ 3 层（P6）。
- **③**：`company-journals.tsx`（1101 行）是热点，本任务对它大幅净减。PR 正文贴 `git diff --numstat`。
- **①**：组件与 Hook 名表达职责，如 `JournalEditor`、`JournalLineTable`、`PostingConfirmDialog`、`useJournalLookups`，不用 `Part1`、`Section2`。被搬移的旧局部名可以按范围第 6 条改为表达职责的名字。
- **④**：3 个 `useInfiniteQuery` 的分页调用样板（`initialPageParam`、`cursor` 拼接、`getNextPageParam`）重复三次，按 ④ 抽成一个函数；查询键、URL 与请求参数不变（P4 请求日志相同）。
- **⑤**：已有的 `500`（行数上限）、`100`（每页条数）、`100` / `200`（`maxLength`）改为具名常量，值不变。
- **⑥**：原有的“为什么”注释（layout phase 的两条、display-only totals、source reference 的 aria-label 说明）随代码搬移，不删改。不留调试输出。

## 用户可见变化

- 无。页面外观、文案、键盘与焦点行为、请求都不变（P3、P4）。

## 证据要求

- **不需要浏览器时段**：
  - 没有真实浏览器用例驱动凭证页；
  - 行为等价由 P3（既有 jsdom 用例）与 P4（逐步 DOM、焦点与请求日志等价）证明；
  - 比照 REFAC-02 / REFAC-03 的口径。

  P4 在本机运行，须服从协调者的时段停用通知。
- PR 正文附：
  - P2 导出与 `git grep` 结果；
  - P4 脚本、步骤清单与比较结果；
  - P5a Hook 序列表、P5b 检查输出、P5d 插槽对照表；
  - P6 函数行数表；
  - P7 字节表；
  - 可读性一节。
