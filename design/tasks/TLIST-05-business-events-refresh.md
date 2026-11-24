# TLIST-05：业务事件与待转队列加“刷新列表”

- Sprint：S21（[计划](S21.md)）　类型：功能（列表，小步打磨）　优先级：P2　决定：待协调者定编号　建议分支：`tlist-05-business-events-refresh`
- 来源：[S20 候选池](S20.md#候选池s20-之后)“刷新列表”系列剩下的页；写法照搬 [TLIST-04](TLIST-04-dimensions-refresh.md) / [TLIST-03](TLIST-03-accounts-refresh.md)（#288）。
- 迁移：**不加**。浏览器时段：**不需要**（原生键盘与 390 记录由 DEMO-21 的浏览器运行取证，见“证据要求”）。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 选哪一项（产品负责人）

候选是产品待办中“界面小步改进”一类、不加迁移、一个 Sprint 内能完成的项。本 Sprint 选**业务事件页的“刷新列表”**，理由：

1. **系列收尾的一页，不需先拆分**：TLIST-01–04 之后，没有“刷新列表”的列表只剩**结算**与**业务事件**。结算的 `SettlementEntry`（465 行）须先按 ② 拆分；业务事件的两个列表都经共用的 `PageTable`（`business-events/list.tsx:64–97`），加一个可选属性即可，`CompanyEvents` 本身可做到净增 ≤ 0。
2. **待转队列是工作队列**：用户在确认过账前查看“待转 / 失败 / 已转 / 已撤回”。转入、撤回可能在另一个标签页或由 AI 助手完成；现在只能切换视图再切回，或按 F5（回到第一个公司与“业务事件”视图，状态筛选丢失）。
3. **改动小、可复用**：直接用 `master.listRefresh`（`ui/master-labels.ts:15` 中文“刷新列表”、`:98` 英文 “Refresh list”），不改标签文件与 CSS，首屏块不变。
4. **没选的项**：
   - **结算的“刷新列表”**：先拆 `SettlementEntry`（候选池）；
   - **按开票状态排序 / 筛选订单**：订单页刚由 REFAC-11（#299，`6fbc2da`）拆分，先让新结构稳定一个 Sprint，留候选池；
   - **多订单合并开票**：需要迁移，不符合本 Sprint“不加迁移”；
   - **保留向前历史**：涉及导航模型，不是小步。

## 现状（main `ea5c0a1`）

- `packages/web/src/business-events/list.tsx` 共 97 行：
  - `usePage(path, company, schema, query = "", enabled = true)`（`:9–28`）：`useInfiniteQuery`，键 `["business", company, path, query]`，请求 `/api/v1/${path}?company=…&limit=100${query}`，翻页带 `cursor`。
  - `PageControls`（`:39–63`）：加载中、错误（`BusinessError` 加“重试”）、“加载更多”。
  - `PageTable`（`:64–97`，33 行）：`div.card` 内 `VirtualRows`（`:83`）与空状态，之后是 `PageControls`。
- `PageTable` 的使用点：`company-events.tsx:263`（业务事件）、`:342`（待转队列）、`editors.tsx:276`（编辑器内的选择列表）、`settings.tsx:119`、`:309`（设置视图的主数据与过账规则）。`PageControls` 另用于 `BusinessEvents.tsx:58`、`company-events.tsx:612`、`editors.tsx:129`、`:147`、`settings.tsx:513`。
- `packages/web/src/business-events/company-events.tsx` 共 697 行；`CompanyEvents`（`:33–615`）按 `files/fnlen.cjs` 口径 **582 行**，已超过 ②，是存量超长函数：
  - `editing = Boolean(draft || review || withdraw || configEditing)`（`:64`）；
  - `listing = usePage("events", company.code, …, "", view === "events")`（`:65`）；`queue = usePage("transfer-queue", …, `&status=${status}`, view === "queue")`（`:66–72`）；`dimensions`（`:73`，`&kind=dimension`，供编辑器使用）；
  - 视图切换 `div.segmented`（`:221` 起）：业务事件、待转队列、设置；
  - 业务事件视图：`div.toolbar-row`（`:250–262`）三个“新建 · …”按钮，`editing || busy` 时禁用；`PageTable`（`:263–298`）；`EventEditor`（`:299` 起）；
  - 待转队列视图：状态下拉 `label.ui-field.jv-status`（`:319–341`，23 行，`editing || busy` 时禁用）；`PageTable`（`:342` 起）；
  - 变更成功后 `invalidateQueries(["business", company.code])`（`:135`，前缀匹配）。
- `BusinessEvents` 经 `React.lazy` 加载（`App.tsx:51`），业务事件页的代码在 `BusinessEvents-*.js` 路由块中。
- CSS：`.toolbar-row` 已在 `theme/components.css:395`。
- 测试：`packages/web/test/business-events.test.tsx` 569 行、5 个用例（`:43`、`:291`、`:406`、`:470`、`:523`），渲染 `<App/>`，`fetch` 桩与 `HTMLDialogElement` 垫片在 `:21–40`。
- e2e：GUI e2e 没有经过业务事件页的断言（`packages/infra/test/support` 中相关引用只涉及存储与迁移）。
- base 一侧：`git grep -n -F listRefresh -- packages/web/src/business-events packages/web/test/business-events.test.tsx` 在 `ea5c0a1` 上无结果，退出码 1（设计角色已核对）。

## 设计决定（产品负责人）

1. **放在 `PageTable` 一层，按需开启**：`PageTable` 加一个可选属性（如 `refreshKey?: readonly unknown[]`）。给了它时，在 `div.card` **之前**渲染 `<div className="toolbar-row">` 内一个原生 `<button type="button" className="btn btn-secondary">`，文案 `master.listRefresh`；不给时渲染与现在完全相同。按钮由 `list.tsx` 内一个模块级小组件实现（≤ 25 行），用 `useQueryClient()`。
2. **键只有一个来源**：`list.tsx` 导出 `pageKey(company, path, query)`，`usePage` 与刷新都用它，不在调用处手写键数组。
3. **只有两个列表开启**：`company-events.tsx` 的业务事件列表与待转队列列表传 `refreshKey`；`editors.tsx`、`settings.tsx` 的 `PageTable` **不传**，不出现按钮（编辑器的选择列表与设置视图不在本任务范围）。
4. **行为**：`client.resetQueries({ queryKey: pageKey(…), exact: true })`：清掉已加载的各页，只重读第一页；进行中的请求被取消。待转队列的键含当前 `status`，所以只重读当前筛选；`dimensions` 与另一个视图的列表**不**刷新。
5. **编辑器打开或请求进行中**：按钮仍可用，不禁用；点它只重读列表，草稿、复核、撤回与设置编辑的状态不变，不弹确认框（与 TLIST-02 / 03 / 04 一致）。“新建 · …”按钮与状态下拉的禁用规则不变。
6. **`CompanyEvents` 净增 ≤ 0**：把待转队列的状态下拉（`:319–341`）移到模块级组件（如 `QueueStatusFilter`），抵消两处传参与新增的一行；拆分 `CompanyEvents` 不在本任务。
7. **不改**：契约与服务端；标签文件；CSS；`editors.tsx`、`settings.tsx`、`BusinessEvents.tsx`；`PageControls`；`VirtualRows`；教学文案；`scripts/test-shard-weights.json`。

## 范围

- 产品代码：`packages/web/src/business-events/list.tsx`、`packages/web/src/business-events/company-events.tsx`。
- 测试：`packages/web/test/business-events.test.tsx`（只加用例与共用桩辅助，不改原有 5 个用例）。不新建测试文件。

## 冲突域

- web-ui:business-events：只改上面三个文件。
- 与 S21 其他任务不相交：SLOT-04 只改 `scripts/slot/`；FLAKE-08 只改 `packages/web/test/ledger-reports.test.tsx` 和 / 或 `packages/web/test/setup.ts`（若后者，后合并的一方在合并前基于 main 重跑 web 测试）；DOC-21 只改 `docs/release/README.md`。
- 与 S20 PR 不相交：已合并的 #299 只改了 `trade-orders/`；进行中的 #298 只改 `scripts/measure/**`、tooling 测试与分片权重。
- 受影响的 e2e 断言：无（见“现状”）。
- 受影响的文档引用：`docs/user/ledger.md:31–33`（“业务事件与队列”）由 DEMO-21 补一句（见 [DEMO-21 验收](S21.md#demo-21-验收)）。本任务不改 `docs/`。

## 验收

### base 失败、head 通过

| 编号 | 断言 | base `ea5c0a1` | head |
| --- | --- | --- | --- |
| L2 | 中 / 英界面：“业务事件”视图与“待转队列”视图各有一个名为“刷新列表” / “Refresh list”的按钮，位于该视图表格之前；“设置”视图与编辑器内的选择列表**没有**该按钮 | 失败：没有该按钮 | 通过 |
| L3 | “业务事件”视图已加载两页（`aria-rowcount` = 201）后点“刷新列表”：恰好一个 `/api/v1/events` 请求，`limit=100`、不带 `cursor`；完成后 `aria-rowcount` 回到 101，“加载更多”重新出现；**没有** `/api/v1/transfer-queue` 与 `/api/v1/dimensions` 请求（决定 4） | 失败：按钮不存在 | 通过 |
| L4 | “待转队列”视图选状态“失败”后点“刷新列表”：恰好一个 `/api/v1/transfer-queue` 请求，`status=failed`、不带 `cursor`；下拉仍是“失败”；没有其他状态的请求 | 失败 | 通过 |
| L5 | 新建草稿的编辑器打开并改过内容时点“刷新列表”：编辑器内容不变，`window.confirm` 未被调用，按钮未禁用，列表重读；“新建 · …”按钮仍按原规则禁用 | 失败 | 通过 |
| L6 | 连续点两次：前一次请求 `signal.aborted`，最终只显示一次第一页、无重复行；请求失败时显示既有的 `BusinessError` 与“重试” | 失败 | 通过 |
| L7 | 键盘可达的结构前提（jsdom 只证明结构，不模拟原生键盘）：“刷新列表”是原生 `<button type="button">`；在 DOM 顺序上位于“新建 · …”按钮（业务事件视图）或状态下拉（待转队列视图）之后、表格之前；点击触发刷新 | 失败 | 通过 |

- **base 上的判定方法**：把 head 的 `business-events.test.tsx` 复制到 base 检出上运行；base 上按名称找不到按钮，L2–L7 失败。PR 正文附 base 与 head 两次运行的未截断汇总行，以及 L2–L7 每个用例在 base 上的失败原因。

### 两侧都须成立的不变量

- **L1 范围**：`git diff --name-only` 只含“范围”所列三个文件。不加迁移。
- **L8 中英**：不加标签键；中英键集合一致的既有用例（`packages/web/test/ui.test.ts`）通过。
- **L9 既有测试**：`business-events.test.tsx` 原有 5 个用例不改、全部通过；Web 全部 jsdom 测试与 PR CI 绿；合并后覆盖该合并提交的 main Full 绿。
- **L10 打包**：构建来源按[任务书模板](TEMPLATE.md)“证据要求 / 构建来源”（D460 / D487），口径见 [S21 共同验收“L10 / 体积口径”](S21.md#l10--体积口径)：
  - **base 固定为最终送审 head 的实际合并基**（`git merge-base origin/main <head>` 的完整 SHA），不是 `ea5c0a1`；合并基变了就重新测量；
  - 两侧在新建的分离 worktree 中构建，附全部字段（`rev-parse HEAD`、`npm ci` 前后空的 `status --porcelain`、`npm ci` 输出、构建命令与退出码、两侧相同的 lockfile blob、OS / Node / npm、全部产物逐文件完整 SHA-256）；
  - 测量脚本：MEAS-01 已合并时用入库脚本（钉住提交 SHA），否则附脚本全文或钉住的版本（同 #288）；哈希掩码按 D502 统一用 `-HASH`；
  - **首屏 ±0**（不改标签文件；判定按 D454）；
  - `BusinessEvents` 路由块 **≤ +300 B**（掩码 gzip-9，同 D461 测法）；
  - 其他 JS 块与 CSS **±0**；
  - 上限未经试算；超出即停下报告协调者，不自行放宽。
- **L11 PR 正文**须含：“用户可见变化”一节（内容同下）；“可读性”一节；L2–L7 的用例名与 `file:line` 对照表；L10 的“构建来源”一节与逐块数字原文。

## e2e 断言

- **必须继续成立**：无经过业务事件页的 e2e 断言；main Full 照常须绿（L9）。
- **须随本任务改**：无。

## 性能考虑

- 每次点击发一个第一页请求（100 条，走既有分页），与切换视图后回来时相同。不加轮询或自动刷新。打包按 L10。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥：

- **存量超长函数**：`CompanyEvents`（582 行）本任务**净增 ≤ 0 行**，即 fnlen ≤ 582，做法见决定 6。
- **`PageTable`** ≤ 45 行；新的刷新按钮组件与 `QueueStatusFilter` 各 ≤ 25 行，嵌套 ≤ 3 层；`pageKey` 一行。
- **文件**：`list.tsx` 净增 ≤ +30 行；`company-events.tsx` 净增 ≤ +30 行（状态下拉移到模块级，文件行数可小幅增加）；`business-events.test.tsx` 净增 ≤ +170 行。
- **④**：新用例共用一个“业务事件两页 / 待转队列按状态”的 `fetch` 桩辅助，不逐用例复制；原用例不改（L9）。
- **⑤**：测试里的页大小、行数用具名常量。
- PR 正文“可读性”一节贴 `git diff --numstat`，以及 `CompanyEvents`、`PageTable` 与新组件的 fnlen 输出。

## 用户可见变化

- 业务事件页的“业务事件”与“待转队列”两个视图，在表格上方各多一个“刷新列表”按钮（英文 “Refresh list”）。
  - 点它按当前公司（待转队列还按当前状态）从第一页重新读取列表，正在编辑的草稿与所选状态都保留；
  - 编辑器打开时它仍可用；
  - Tab 顺序在“新建 · …”按钮（或状态下拉）之后多一站。
- “设置”视图不变。

## 证据要求

- **不需要浏览器时段**：行为由 jsdom 用例证明（L2–L7）。原生键盘行为与 390 宽度由 DEMO-21 已计划的浏览器运行用真实键盘输入取证，不另申请时段：

  | 视口 | 测量 | 阈值或比较方式（依据） | 来源 |
  | --- | --- | --- | --- |
  | 390 | 业务事件页（两个视图各一次）页面级 `document.documentElement.scrollWidth <= window.innerWidth` | 必须成立（路线图 §5 证据清单 9） | DEMO-21 取证步骤（新增） |
  | 390 | “刷新列表”按钮在视口内：`getBoundingClientRect()` 的 `left >= 0`、`right <= 390` | 必须成立 | DEMO-21 取证步骤（新增） |
  | 1440 | 两个视图的按钮区截图（中 / 英，红 / 绿主题） | 目视：按钮在表格之前，业务事件视图在“新建 · …”一行之下 | DEMO-21 截图 |
  | 1440 | 原生键盘：用浏览器键盘输入（如 Playwright `keyboard.press`）Tab 到“刷新列表”（草稿编辑器打开时同样），Enter 与空格各触发一次第一页请求 | 必须成立（L7 的行为部分） | DEMO-21 取证步骤（新增） |

- **可行性**（S13 回顾行动 4）：L3 的两页仿照 TLIST-04 的两页桩写法（`nextCursor` 非空的第一页）；L4 用状态下拉的 `change` 事件；L5 的草稿编辑器用既有用例打开“新建 · …”的步骤，`confirm` 观测用 `vi.spyOn(window, "confirm")`。同一写法已在 TLIST-03（#288）合并。设计角色**没有**做试改构建，L10 的字节由开发测量。
