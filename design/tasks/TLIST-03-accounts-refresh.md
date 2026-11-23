# TLIST-03：科目表加“刷新列表”

- Sprint：S19（[计划](S19.md)）　类型：功能（列表，小步打磨）　优先级：P2　决定：待协调者定编号　建议分支：`tlist-03-accounts-refresh`
- 来源：[S18 候选池](S18.md#候选池s18-之后)“科目表、财务维度、结算等列表的‘刷新列表’”；写法照搬 [TLIST-02](TLIST-02-trade-master-refresh.md)（#284）。
- 迁移：**不加**。浏览器时段：**不需要**（原生键盘与 390 记录由 DEMO-19 的浏览器运行取证，见“证据要求”）。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 选哪一页（产品负责人）

候选池里还没有“刷新列表”的列表有科目表、财务维度、结算、业务事件。本 Sprint 选**科目表**，理由：

1. **没有别的办法重读列表**：科目表没有搜索框，也没有“应用”按钮，切换类型之类的操作也不存在。要看到页外的改动，只能切到别的公司再切回来，或者离开再回来。
2. **F5 会丢掉所选公司**：公司选择是页面状态（`Accounts.tsx:64` `useState`），地址只有 `#/accounts`。按 F5 后回到第一个公司，用户还得重新选择。
3. **科目会在页外变化**：S18 的 TLIST-02 任务书曾把科目表列为“页外改动少，看反馈”。到 S19 计划时仍没有用户反馈，但页外改动的来源已经明确：
   - M2-02 迁移导入会写入科目；
   - Demo 演示时会先预置数据；
   - 另一个标签页也可能新建或停用科目。

   做 M2 准备与教学演示的用户正是这一页的主要使用者，所以不再等反馈。
4. **改动小、风险低**：一个按钮、一对标签键、一个函数，不动 CSS、契约与分页。
5. **没选的页**：
   - **财务维度**：与科目表共用 `master.*` 标签，使用频率更低；科目表的写法验证后，再按同一写法加；
   - **结算**：`SettlementEntry` 465 行，须先按 ② 拆分，才能加按钮；
   - **业务事件**：列表经 `business-events/` 内共用的 `PageTable`，事件列表与设置等子视图都用它（`company-events.tsx`、`editors.tsx`、`list.tsx`、`settings.tsx`）。按钮放在哪一层要先定，`CompanyEvents` 也还在拆分候选池中。

## 现状（main `1638445`）

- `packages/web/src/Accounts.tsx` 共 605 行，不是热点：
  - `Accounts`（`:62–133`）：公司列表的 `useInfiniteQuery`（`:65`），所选公司是 `useState`（`:64`）。按公司渲染 `<CompanyAccounts key={company.code} …>`（`:130`），所以切换公司会重新挂载 `CompanyAccounts`。
  - `CompanyAccounts`（`:135–223`）：按非空、非注释行计 **89 行**，已超过 ②，是存量超长函数。它包含：
    - `useQueryClient`（`:137`）、`editing` 状态（`:138`）；
    - `useInfiniteQuery`（`:139–150`）：键 `["accounts", company.code]`，`refetchOnMount: true`，每页 `limit=100`，带 `cursor`；
    - 按钮区 `div.acct-actions`（`:154–162`）：只有“新建科目”一个按钮。编辑器打开时它的类是 `btn-secondary`，否则是 `btn-primary`；它从不禁用；
    - 加载中、错误提示（`p.message-bar.danger` 加“重试”）、`AccountRows`（虚拟化表格，`:224` 起）、“加载更多”（`acct-more`）、`AccountEditor`；
    - 保存后执行 `invalidateQueries(["accounts", company.code])`（`:217`）。
  - 本页**没有**离开保护：在 `Accounts.tsx` 中搜索 `confirm|leave` 无结果，退出码 1。
- 标签：`ui/master-labels.ts` 共 163 行。`master.new` 在 `:14`（中文）与 `:96`（英文）。`ui/labels.ts:3` 静态导入该文件，所以它在**首屏**块中。
- CSS：`pages/accounts.css:5–9` 的 `.accounts .acct-actions` 已是 `display: flex; flex-wrap: wrap; gap`，加一个按钮不用改 CSS。
- 测试：`packages/web/test/accounts.test.tsx` 361 行、6 个用例。
  - `install()` 的 `fetch` 桩在 `:45–62`，单页、`nextCursor: null`。
  - 两页的桩在“加载更多”用例 `:221–260`：200 行，`nextCursor: "6099"`。
  - Tab 走查用例 `:85–120` 只遍历表格所在的 `region`（`AccountRows` 的 `section`，`:251–256`），不经过按钮区。
- e2e：`git grep -n -E '#/accounts|master-company|acct-|master\.new|path: "accounts"' -- packages/infra/test/support` 在 `1638445` 上无结果，退出码 1。smoke 页表（`trade-gui/smoke/pages.ts`）只有贸易页，不含科目表。

## 设计决定（产品负责人）

1. **位置与外观**：
   - 放在 `div.acct-actions` 里，紧跟“新建科目”；
   - 原生 `<button type="button" className="btn btn-secondary">`，不加图标与 CSS；
   - 中文“刷新列表”，英文 “Refresh list”，与 TLIST-01 / TLIST-02 同词。
2. **标签键**：新增 `master.listRefresh`，中英各一行，紧跟两处 `master.new`。不复用 `trade.listRefresh`：科目表的标签都在 `master.*` 域，跨域借键会让以后改贸易文案时误伤科目表。
3. **行为**：执行 `client.resetQueries({ queryKey: ["accounts", company.code], exact: true })`，与 TLIST-02 同一做法：
   - 清掉已加载的各页，只重读第一页；
   - 进行中的请求被取消；
   - 所选公司不变（不重新挂载 `CompanyAccounts`）。
4. **编辑器打开时**：按钮仍可用。点它只重读列表，`editing` 与编辑器里未保存的内容不变：`AccountEditor` 的 `key` 由 `editing` 决定，刷新不改 `editing`。不弹确认框。
5. **不禁用**：请求进行中也不禁用，与 TLIST-02 一致；再次点击即重新开始。
6. **不改**：
   - 契约与服务端；“新建科目”的类名与行为；`AccountRows`、`AccountEditor`；
   - CSS；`Dimensions.tsx` 与其他列表；
   - 教学文案（不加教学提示）；
   - `scripts/test-shard-weights.json`。

## 范围

- 产品代码：`packages/web/src/Accounts.tsx`、`packages/web/src/ui/master-labels.ts`（中英各 +1 行）。
- 测试：`packages/web/test/accounts.test.tsx`（只加用例与共用桩辅助，不改原有 6 个用例）。不新建测试文件。

## 冲突域

- web-ui:accounts：只改上面三个文件。
- 与 S19 其他任务不相交：REFAC-10 只改 `trade-orders/order-list.tsx`，并在 `trade-orders/` 下新增文件，不改任何标签文件。
- 受影响的 e2e 断言：无。检索见“现状”，结果为空。
- 受影响的文档引用：`docs/user/ledger.md:9`（科目表“可新建科目、编辑自有科目”）由 DEMO-19 补一句（见 [DEMO-19 验收](S19.md#demo-19-验收)）。本任务不改 `docs/`。

## 验收

### base 失败、head 通过

| 编号 | 断言 | base `1638445` | head |
| --- | --- | --- | --- |
| L2 | 中 / 英界面在“新建科目”之后各有一个名为“刷新列表” / “Refresh list”的按钮 | 失败：没有该按钮 | 通过 |
| L3 | 已加载两页后点“刷新列表”：恰好一个 `/api/v1/accounts` 请求，`company` 为当前公司、`limit=100`、不带 `cursor`；完成后只显示第一页（`aria-rowcount` 回到 101），“加载更多”重新出现 | 失败：按钮不存在 | 通过 |
| L4 | 编辑器打开并改过名称时点“刷新列表”：编辑器内容不变，`window.confirm` 未被调用，公司选择不变，列表重读 | 失败 | 通过 |
| L5 | 连续点两次：前一次请求 `signal.aborted`，最终只显示一次第一页、无重复行；请求失败时显示既有错误提示与“重试” | 失败 | 通过 |
| L6 | 有两个公司时选第二个公司再点刷新：请求 URL 的 `company` 是第二个公司，第一个公司没有请求 | 失败 | 通过 |
| L7 | 键盘可达的结构前提（jsdom 只证明结构，不模拟原生键盘）：<br>• “刷新列表”是原生 `<button type="button">`；<br>• 在 DOM 顺序上紧跟“新建科目”；<br>• 编辑器打开时它仍未禁用；<br>• 点击它触发刷新 | 失败 | 通过 |

- **base 上的判定方法**：把 head 的 `accounts.test.tsx` 复制到 base 检出上运行。base 上没有这个标签键，用例按名称找不到按钮，于是失败。
  - PR 正文附 base 与 head 两次运行的未截断汇总行，以及 L2–L7 每个用例在 base 上的失败原因。
  - 设计角色已核对 base 一侧：`git grep -n -F "listRefresh" -- packages/web/src/Accounts.tsx packages/web/src/ui/master-labels.ts` 在 `1638445` 上无结果，退出码 1。

### 两侧都须成立的不变量

- **L1 范围**：`git diff --name-only` 只含“范围”所列三个文件。不加迁移。
- **L8 中英**：中英标签同时加；检查中英键集合一致的既有用例（`packages/web/test/ui.test.ts:16–23`）通过。
- **L9 既有测试**：`accounts.test.tsx` 原有 6 个用例不改、全部通过。其中 Tab 走查用例（`:85–120`）只遍历表格区域，加按钮不改变它的期望。Web 全部 jsdom 测试与 PR CI 绿；合并后覆盖该合并提交的 main Full 绿。
- **L10 打包**：构建在新建的分离 worktree 中进行，`git status --porcelain` 为空（S17 回顾行动 3）。
  - 首屏预加载集合与 base 相同；首屏 JS 合计（掩码 gzip-9，同 D461 的测法）**≤ +40 B**（标签在首屏块，见“现状”）；
  - `Accounts` 路由块 **≤ +200 B**（gzip-9）；
  - 其他 JS 块与 CSS **±0**；
  - 上限与 TLIST-02 L10 相同。本任务书没有试改构建（见“证据要求”），也不给余量估计。超出即停下报告协调者，不自行放宽。
- **L11 PR 正文**须含：
  - “用户可见变化”一节（内容同下）；
  - “可读性”一节；
  - L2–L7 的用例名与 `file:line` 对照表；
  - L10 的 base / head 构建来源（`rev-parse HEAD`、空的 `status --porcelain`、Node / npm 版本、lockfile blob）与逐块数字原文。

## e2e 断言

- 检索命令与结果见“现状”（空）。
- **必须继续成立**：无经过科目表的 e2e 断言；main Full 照常须绿（L9）。
- **须随本任务改**：无。

## 性能考虑

- 每次点击发一个第一页请求（100 条，走既有分页），与切换公司后回来时相同。不加轮询或自动刷新。打包按 L10。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥：

- **存量超长函数**：`CompanyAccounts`（89 行）本任务**净增 ≤ 0 行**，即 fnlen ≤ 89。做法同 TLIST-02 的 `PaneActions`：把按钮区移到模块级 `AccountActions`，抵消新增的刷新函数。拆分 `CompanyAccounts` 不在本任务（候选池）。
- **新组件**：`AccountActions` ≤ 30 行，不含 Hook，嵌套 ≤ 3 层。
- **文件**：
  - `Accounts.tsx` 净增 ≤ +30 行；
  - `ui/master-labels.ts` 恰好 +2 行；
  - `accounts.test.tsx` 净增 ≤ +120 行。
- **④**：新用例共用一个“已加载两页”的 `fetch` 桩辅助，可以从 `:221–260` 的桩提炼，不逐用例复制。原用例不改（L9），所以提炼后的辅助只供新用例使用。
- **⑤**：测试里的页大小、行数用具名常量。
- PR 正文“可读性”一节贴 `git diff --numstat`，以及 `CompanyAccounts`、`AccountActions` 的 fnlen 输出。

## 用户可见变化

- 科目表页的“新建科目”之后多一个“刷新列表”按钮（英文 “Refresh list”）。
  - 点它按当前公司从第一页重新读取科目，所选公司和正在编辑的内容都保留；
  - 编辑器打开时它仍可用；
  - Tab 顺序在“新建科目”之后多一站。

## 证据要求

- **不需要浏览器时段**：行为由 jsdom 用例证明（L2–L7）。
  - 原生键盘行为不在 jsdom 中证明。它包括：Tab 从“新建科目”到“刷新列表”（编辑器打开时同样），以及 Enter、空格触发刷新。
  - 这部分由 DEMO-19 已计划的浏览器运行用真实键盘输入取证（下表最后一行），不另申请时段，也不新增必跑的 CI 套件。
  - 截图与 390 记录也由 DEMO-19 取（见 [DEMO-19 验收](S19.md#demo-19-验收)）：

  | 视口 | 测量 | 阈值或比较方式（依据） | 来源 |
  | --- | --- | --- | --- |
  | 390 | 科目表页页面级 `document.documentElement.scrollWidth <= window.innerWidth` | 必须成立（路线图 §5 证据清单 9） | DEMO-19 取证步骤（新增） |
  | 390 | 两个按钮都在视口内：每个按钮 `getBoundingClientRect()` 的 `left >= 0`、`right <= 390` | 必须成立 | DEMO-19 取证步骤（新增） |
  | 1440 | 按钮区截图（中 / 英，红 / 绿主题） | 目视：两个按钮同组，顺序为新建科目、刷新列表 | DEMO-19 截图 |
  | 1440 | 原生键盘：用浏览器键盘输入（如 Playwright `keyboard.press`）从“新建科目”按 Tab 到“刷新列表”（编辑器打开时同样），Enter 与空格各触发一次 `/api/v1/accounts` 请求 | 必须成立（L7 的行为部分） | DEMO-19 取证步骤（新增） |

- **可行性**（S13 回顾行动 4）：
  - L3 的“已加载两页”可仿照既有 `fetch` 桩（`accounts.test.tsx:221–260`）；
  - L4 的 `confirm` 观测用 `vi.spyOn(window, "confirm")`，同 TLIST-02；
  - L6 的两个公司可在 `install()` 风格的桩中让 `/api/v1/companies` 返回两项，再用 `#master-company` 选择；
  - 同一写法已在 TLIST-02（#284）合并。

  S19 计划期间处于 DEMO-18 静默窗口（协调者通知：不运行 node / npm / 构建），设计角色**没有**做试改构建。L10 的字节由开发在自己的 base / head 构建中测量（L11）。
