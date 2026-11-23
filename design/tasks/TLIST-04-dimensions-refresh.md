# TLIST-04：财务维度列表加“刷新列表”

- Sprint：S20（[计划](S20.md)）　类型：功能（列表，小步打磨）　优先级：P2　决定：待协调者定编号　建议分支：`tlist-04-dimensions-refresh`
- 来源：[S19 候选池](S19.md#候选池s19-之后)“财务维度的‘刷新列表’：与科目表同一写法，共用 `master.listRefresh`”；写法照搬 [TLIST-03](TLIST-03-accounts-refresh.md)（#288）。
- 迁移：**不加**。浏览器时段：**不需要**（原生键盘与 390 记录由 DEMO-20 的浏览器运行取证，见“证据要求”）。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 选哪一页（产品负责人）

还没有“刷新列表”的列表剩下财务维度、结算、业务事件。本 Sprint 选**财务维度**，理由：

1. **同组的科目表已有按钮**：科目表与财务维度都在“总账 / 科目与维度”下（`docs/user/ledger.md` 第 5 行起），共用 `master.*` 标签。科目表在 v0.18.0 有了“刷新列表”（TLIST-03），财务维度没有，同组两页的操作不一致。
2. **没有别的办法重读列表**：
   - 本页没有搜索框或“应用”按钮；
   - 切换“类型”会换一个列表，切回来才重读（`DimensionPane` 按 `kind:dimension` 重新挂载）；
   - 公司、类型、上级维度都是页面状态（`Dimensions.tsx:57`、`:135–136` 的 `useState`），地址只有 `#/dimensions`。按 F5 会回到第一个公司的“维度”类型，用户得重新选三项。
3. **维度会在页外变化**：M2-02 迁移导入会写入维度与值；Demo 会预置数据；另一个标签页也可能新建或停用。做 M2 准备与教学演示的用户正是这一页的使用者。
4. **改动更小**：直接用 TLIST-03 已加的 `master.listRefresh`（`ui/master-labels.ts:15`、`:98`），**不改标签文件**，首屏块不变。
5. **没选的页**：
   - **结算**：`SettlementEntry` 465 行，须先按 ② 拆分（候选池）；
   - **业务事件**：列表经 `business-events/` 内共用的 `PageTable`，按钮放在哪一层要先定，`CompanyEvents`（582 行）也在拆分候选池中。

## 现状（main `3f8f2ff`）

- `packages/web/src/Dimensions.tsx` 共 559 行，不是热点：
  - `Dimensions`（`:55–118`）：公司列表 `useInfiniteQuery`，所选公司 `useState`（`:57`）；按公司渲染 `<CompanyDimensions key={company.code} …>`（`:115`）。
  - `usePage(company, kind, dimension, enabled)`（`:119–133`）：`useInfiniteQuery`，键 `["dimensions", company, kind, dimension]`，`refetchOnMount: true`，每页 `limit=100`，带 `cursor`。
  - `CompanyDimensions`（`:134–205`）：类型 `kind` 与上级维度 `dimension` 两个 `useState`（`:135–136`）。`kind === "value"` 时另读一份上级维度下拉的列表（`definitions`，`:137`，键 `["dimensions", company, "dimension", ""]`），未选上级时显示提示（`:193`）。按 `key={`${kind}:${dimension}`}` 渲染 `DimensionPane`（`:194–202`）。
  - `DimensionPane`（`:206–334`）：按 `files/fnlen.cjs` 口径（非空、非注释行）计 **126 行**，已超过 ②，是存量超长函数。它包含：
    - `editing` 状态（`:217`）、`usePage`（`:218`）、虚拟化（`:220–226`，超过 100 行启用）；
    - 按钮区 `div.ui-master-actions`（`:236–244`）：只有“新建配置”（`dim.new`）一个按钮。编辑器打开时它的类是 `btn-secondary`，否则是 `btn-primary`；从不禁用；
    - 加载中、错误提示（`Notice`，含“重试”）、表格（`aria-rowcount` = 行数 + 1）、“加载更多”（`ui-master-more`）、`DimensionEditor`。
  - `DimensionEditor` 保存后与“重新读取”都执行 `invalidateQueries(["dimensions", company.code])`（`:448`、`:543`，前缀匹配）。
  - 本页**没有**离开保护：`git grep -n -E 'confirm|beforeunload|leave' -- packages/web/src/Dimensions.tsx` 无结果，退出码 1。
- 标签：`master.listRefresh` 已在 `ui/master-labels.ts:15`（中文“刷新列表”）与 `:98`（英文 “Refresh list”），TLIST-03 加入；`Dimensions.tsx` 已用 `master.*` 键（如 `master.loadMore`）。
- CSS：`pages/master.css:21–25` 的 `.ui-master-actions` 已是 `display: flex; flex-wrap: wrap; gap`，加一个按钮不用改 CSS。
- 测试：`packages/web/test/dimensions.test.tsx` 192 行、3 个用例。第 1 个用例（`:28–99`）的 `fetch` 桩在 `kind=value` 时返回两页各 100 行（`nextCursor: "V099"`）。
- e2e：`git grep -n -E '#/dimensions|dimension-kind|dimension-company|dim\.new' -- packages/infra/test/support` 在 `3f8f2ff` 上无结果；smoke 页表只有贸易页。
- base 一侧：`git grep -n -F listRefresh -- packages/web/src/Dimensions.tsx packages/web/test/dimensions.test.tsx` 在 `3f8f2ff` 上无结果，退出码 1（设计角色已核对）。

## 设计决定（产品负责人）

1. **位置与外观**：放在 `div.ui-master-actions` 里，紧跟“新建配置”；原生 `<button type="button" className="btn btn-secondary">`，不加图标与 CSS；文案用 `master.listRefresh`（“刷新列表” / “Refresh list”），与 TLIST-01 / 02 / 03 同词。
2. **不加标签键**：直接用 `master.listRefresh`，不在 `dimension-labels.ts` 另加 `dim.listRefresh`。科目表与财务维度同属 `master.*` 域，TLIST-03 加键时已说明供本页共用。
3. **行为**：执行 `client.resetQueries({ queryKey: ["dimensions", company.code, kind, dimension], exact: true })`，即当前面板自己的键：
   - 清掉已加载的各页，只重读第一页；进行中的请求被取消；
   - 公司、类型、上级维度不变（不重新挂载 `DimensionPane`）。
4. **只刷新当前列表**：`kind === "value"` 时，上级维度下拉（`definitions`）**不**刷新。它是选择器，不是本页的列表；要看新的上级维度，切到“维度”类型即可。`exact: true` 保证不误伤该键。
5. **编辑器打开时**：按钮仍可用；点它只重读列表，`editing` 与编辑器里未保存的内容不变（`DimensionEditor` 的 `key` 由 `editing` 决定，刷新不改 `editing`）；不弹确认框。
6. **不禁用**：请求进行中也不禁用，与 TLIST-02 / 03 一致。
7. **不改**：契约与服务端；“新建配置”的类名与行为；`DimensionEditor`、`CompanyDimensions`、`usePage`；标签文件；CSS；`Accounts.tsx` 与其他列表；教学文案；`scripts/test-shard-weights.json`。

## 范围

- 产品代码：`packages/web/src/Dimensions.tsx`。
- 测试：`packages/web/test/dimensions.test.tsx`（只加用例与共用桩辅助，不改原有 3 个用例）。不新建测试文件。

## 冲突域

- web-ui:dimensions：只改上面两个文件。
- 与 S20 其他任务不相交：REFAC-11 只改 `trade-orders/order-view.tsx` 并在 `trade-orders/` 下新增文件；MEAS-01 只改 `scripts/measure/`、一个新的 tooling 测试与 `scripts/test-shard-weights.json`。
- 受影响的 e2e 断言：无（检索见“现状”）。
- 受影响的文档引用：`docs/user/ledger.md:12`（财务维度一条）由 DEMO-20 补一句（见 [DEMO-20 验收](S20.md#demo-20-验收)）。本任务不改 `docs/`。

## 验收

### base 失败、head 通过

| 编号 | 断言 | base `3f8f2ff` | head |
| --- | --- | --- | --- |
| L2 | 中 / 英界面在“新建配置”之后各有一个名为“刷新列表” / “Refresh list”的按钮（“维度”与“维度值”两种类型都有） | 失败：没有该按钮 | 通过 |
| L3 | “维度值”类型、上级 `DEPT`、已加载两页（`aria-rowcount` = 201）后点“刷新列表”：恰好一个 `/api/v1/dimensions` 请求，`kind=value`、`dimension=DEPT`、`limit=100`、不带 `cursor`；完成后 `aria-rowcount` 回到 101，“加载更多”重新出现；**没有** `kind=dimension` 的请求（决定 4） | 失败：按钮不存在 | 通过 |
| L4 | 编辑器打开并改过名称时点“刷新列表”：编辑器内容不变，`window.confirm` 未被调用，类型与上级维度不变，列表重读 | 失败 | 通过 |
| L5 | 连续点两次：前一次请求 `signal.aborted`，最终只显示一次第一页、无重复行；请求失败时显示既有错误提示与“重试” | 失败 | 通过 |
| L6 | 有两个公司时选第二个公司再点刷新：请求 URL 的 `company` 是第二个公司，第一个公司没有请求 | 失败 | 通过 |
| L7 | 键盘可达的结构前提（jsdom 只证明结构，不模拟原生键盘）：“刷新列表”是原生 `<button type="button">`；在 DOM 顺序上紧跟“新建配置”；编辑器打开时它仍未禁用；点击它触发刷新 | 失败 | 通过 |

- **base 上的判定方法**：把 head 的 `dimensions.test.tsx` 复制到 base 检出上运行；base 上按名称找不到按钮，L2–L7 失败。PR 正文附 base 与 head 两次运行的未截断汇总行，以及 L2–L7 每个用例在 base 上的失败原因。

### 两侧都须成立的不变量

- **L1 范围**：`git diff --name-only` 只含“范围”所列两个文件。不加迁移。
- **L8 中英**：不加标签键；中英键集合一致的既有用例（`packages/web/test/ui.test.ts`）通过。
- **L9 既有测试**：`dimensions.test.tsx` 原有 3 个用例不改、全部通过；Web 全部 jsdom 测试与 PR CI 绿；合并后覆盖该合并提交的 main Full 绿。
- **L10 打包**：构建来源按[任务书模板](TEMPLATE.md)“证据要求 / 构建来源”（D460 / D487），标准同 [#288](https://github.com/lingshf/ai-native-erp/pull/288)、[#291](https://github.com/lingshf/ai-native-erp/pull/291)，口径见 [S20 共同验收“L10 / 体积口径”](S20.md#l10--体积口径)：
  - **base 固定为最终送审 head 的实际合并基**（`git merge-base origin/main <head>` 的完整 SHA），不是 `3f8f2ff`；合并基变了就重新测量；
  - 两侧在新建的分离 worktree 中构建，附全部字段（`rev-parse HEAD`、`npm ci` 前后空的 `status --porcelain`、`npm ci` 输出、构建命令与退出码、两侧相同的 lockfile blob、OS / Node / npm、全部产物逐文件完整 SHA-256）；
  - 测量脚本：MEAS-01 已合并时用入库脚本（钉住提交 SHA），否则附脚本全文或钉住的版本（同 #288）；
  - **首屏 ±0**（不改标签文件；判定按 D454）；
  - `Dimensions` 路由块 **≤ +200 B**（掩码 gzip-9，同 D461 测法）；
  - 其他 JS 块与 CSS **±0**；
  - 上限沿用 TLIST-03 L10 的路由块预算，未经试算；超出即停下报告协调者，不自行放宽。
- **L11 PR 正文**须含：“用户可见变化”一节（内容同下）；“可读性”一节；L2–L7 的用例名与 `file:line` 对照表；L10 的“构建来源”一节与逐块数字原文。

## e2e 断言

- **必须继续成立**：无经过财务维度页的 e2e 断言；main Full 照常须绿（L9）。
- **须随本任务改**：无。

## 性能考虑

- 每次点击发一个第一页请求（100 条，走既有分页），与切换类型后回来时相同。不加轮询或自动刷新。打包按 L10。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥：

- **存量超长函数**：`DimensionPane`（126 行）本任务**净增 ≤ 0 行**，即 fnlen ≤ 126。做法同 TLIST-03 的 `AccountActions`：把按钮区移到模块级 `DimensionActions`，抵消新增的刷新函数。拆分 `DimensionPane` 不在本任务。
- **新组件**：`DimensionActions` ≤ 30 行，不含 Hook，嵌套 ≤ 3 层。
- **文件**：`Dimensions.tsx` 净增 ≤ +30 行；`dimensions.test.tsx` 净增 ≤ +140 行。
- **④**：新用例共用一个“维度值两页”的 `fetch` 桩辅助，不逐用例复制；原用例不改（L9）。
- **⑤**：测试里的页大小、行数用具名常量。
- PR 正文“可读性”一节贴 `git diff --numstat`，以及 `DimensionPane`、`DimensionActions` 的 fnlen 输出。

## 用户可见变化

- 财务维度页的“新建配置”之后多一个“刷新列表”按钮（英文 “Refresh list”）。
  - 点它按当前公司、类型与上级维度从第一页重新读取列表，所选项和正在编辑的内容都保留；
  - 编辑器打开时它仍可用；
  - Tab 顺序在“新建配置”之后多一站。

## 证据要求

- **不需要浏览器时段**：行为由 jsdom 用例证明（L2–L7）。原生键盘行为（Tab 从“新建配置”到“刷新列表”，编辑器打开时同样；Enter、空格触发刷新）由 DEMO-20 已计划的浏览器运行用真实键盘输入取证，不另申请时段：

  | 视口 | 测量 | 阈值或比较方式（依据） | 来源 |
  | --- | --- | --- | --- |
  | 390 | 财务维度页页面级 `document.documentElement.scrollWidth <= window.innerWidth` | 必须成立（路线图 §5 证据清单 9） | DEMO-20 取证步骤（新增） |
  | 390 | 两个按钮都在视口内：`getBoundingClientRect()` 的 `left >= 0`、`right <= 390` | 必须成立 | DEMO-20 取证步骤（新增） |
  | 1440 | 按钮区截图（中 / 英，红 / 绿主题） | 目视：两个按钮同组，顺序为新建配置、刷新列表 | DEMO-20 截图 |
  | 1440 | 原生键盘：用浏览器键盘输入（如 Playwright `keyboard.press`）从“新建配置”按 Tab 到“刷新列表”（编辑器打开时同样），Enter 与空格各触发一次 `/api/v1/dimensions` 请求 | 必须成立（L7 的行为部分） | DEMO-20 取证步骤（新增） |

- **可行性**（S13 回顾行动 4）：L3 的两页可仿照第 1 个用例的桩（`dimensions.test.tsx:41–66`）；L4 的 `confirm` 观测用 `vi.spyOn(window, "confirm")`；L6 的两个公司让 `/api/v1/companies` 返回两项，再用 `#dimension-company` 选择。同一写法已在 TLIST-03（#288）合并。设计角色**没有**做试改构建，L10 的字节由开发测量。
