# TLIST-02：贸易主数据列表加“刷新列表”

- Sprint：S18（[计划](S18.md)）　类型：功能（列表，小步打磨）　优先级：P2　决定：待协调者定编号　建议分支：`tlist-02-trade-master-refresh`
- 来源：[S17 回顾 S18 候选](../reviews/S17-retro.md#s18-候选产品负责人建议)第 3 项；S17 计划“其他列表的‘刷新列表’（伙伴、结算、报表等）：先看 TLIST-01 的反馈，不一次铺开”。
- 迁移：**不加**。浏览器时段：**不需要**（截图与 390 记录由 DEMO-18 取）。
- 数据：只用测试桩与虚构 Demo 数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 选哪一页（产品负责人决定）

**选“贸易主数据”列表**（`packages/web/src/TradeMaster.tsx` 的 `TradePane`，伙伴、产品、记账配置、付款条件、税码五类共用）。理由：

1. **没有别的办法重读**：这一页的搜索框边输入边查询，没有“应用”按钮；base 上要看到别处的改动，只能改一下搜索词再改回去，或者刷新整页。
2. **刷新整页会丢状态**：公司、对象类型与搜索词都是页面内的 `useState`，不在地址里；按 F5 后回到默认公司、默认类型、空搜索。订单、发票、凭证列表的筛选在地址里，刷新整页不丢，这一页丢。
3. **数据会在页外变化**：主数据在 M2 迁移导入、Demo 预置、另一个标签页中都会被改。本页编辑器保存后会自动失效重读（`:527`、`:636`），页外的改动则看不到。
4. **一次改动覆盖五类对象**：`TradePane` 被五类对象共用，加一个按钮就覆盖伙伴（S17 计划点名的“伙伴”）与其他四类。
5. **改动小、不在热点上**：`TradeMaster.tsx` 660 行、`trade-master.test.tsx` 628 行，都不是热点；`TradePane` 本身不需要拆分即可加按钮（见“可读性”）。

**不选**：

| 列表 | 不选的原因 |
| --- | --- |
| 结算（付款与收款） | `SettlementEntry` 465 行，存量超长且是录入页，先拆分再加按钮（候选池） |
| 往来报表 / 总账报表 | 已有“查询”按钮，按当前条件重读，需求已被满足 |
| 业务事件 | 列表用共享的 `PageTable`，加按钮会影响所有用它的页面，范围大 |
| 科目表、财务维度 | 数据主要在本页内改动，页外改动少；保留为候选，看本任务的反馈 |

## 现状（main `350e77a`）

- `TradePane`（`TradeMaster.tsx:204–341`，按 §5 计 137 行，**存量超长**）：
  - 列表查询 `useInfiniteQuery`，键 `["trade", company.code, kind, search]`（`:219`），`refetchOnMount: true`，每页 100 条，带 `cursor` 的“加载更多”（`:318–327`）；
  - 列表上方的按钮区 `div.ui-master-actions`（`:247–256`）只有“新增配置”（`trade.new`）：编辑器打开时禁用（`:251`）；
  - 加载中显示 `master.loading`（`:257`）；失败显示既有 `Notice`，带“重试”（`:258`）；
  - 编辑器 `TradeEditor` 保存后 `invalidateQueries({ queryKey: ["trade", company.code, kind] })`（`:527`、`:636`）。
- `TradeMaster`：所选公司、对象类型（`#trade-kind`）与搜索词都是 `useState`，不写地址。
- 离开保护 `useTradeLeaveGuard`（`:27–64`）只拦截 `a[href]` 点击与 `beforeunload`；页内按钮不触发离开确认。
- 标签：`trade.new` 在 `ui/trade-labels.ts:77`（英文 “New configuration”）、`:318`（中文“新增配置”），该文件属于首屏块。
- 样式：`.ui-master-actions` 是可换行的 flex（`pages/master.css:21`），加第二个按钮不需要新 CSS。`Dimensions.tsx:236` 也用这个类，本任务不改它。
- 测试：`packages/web/test/trade-master.test.tsx` 628 行、9 个用例（`^\s*it\(` 计数），不是热点；`fetch` 用 `vi.stubGlobal` 桩（`:95–110` 起）。
- e2e：`trade-gui/scenario/part-one.ts:91–92` 用 `#trade-kind` 选类型、按名称点 `trade.new`；smoke 访问 `trade` 页（`trade-gui/smoke/pages.ts:20`），对该页做“另一种语言文本泄漏”检查。

## 设计决定（产品负责人）

1. **含义**：“刷新列表”= 按**当前**公司、对象类型与搜索词，从第一页重新读取列表。不改搜索框、类型与公司，不改地址与历史，不弹离开确认，不关闭也不改动已打开的编辑器（编辑器里的内容保持）。
2. **机制**：与 TLIST-01 相同，对当前查询键 `resetQueries({ queryKey: ["trade", company.code, kind, search], exact: true })`：已“加载更多”的后续页丢弃，只读一页；加载中显示既有的“加载中”状态。连续点击时 TanStack Query 取消前一次在途请求（`cancelRefetch` 默认开启）。失败时显示既有 `Notice` 与“重试”，不新增错误文案。
3. **按钮**：放在 `div.ui-master-actions` 中“新增配置”之后；`type="button"`；类 `btn btn-secondary`；**编辑器打开时不禁用**（它不碰编辑器），加载中也不禁用。
4. **代码组织**：按钮区抽成模块级、不含 Hook 的组件（建议名 `PaneActions`，接收 `editing` 是否打开、`onNew`、`onRefresh`、`t`），`TradePane` 里只加 `useQueryClient()` 与一行刷新函数；不在 JSX 里写多行内联处理器。
5. **标签**：新键 `trade.listRefresh`，中文“刷新列表”、英文 “Refresh list”（与 TLIST-01 同文案；按域定义，不借用其他域的键）。不加教学文案。

## 范围

- 产品代码：`packages/web/src/TradeMaster.tsx`；`packages/web/src/ui/trade-labels.ts`（中英各加一行）。
- 测试：`packages/web/test/trade-master.test.tsx`（新用例加在本文件，非热点，净增 ≤ 120 行，加完仍 < 800 行）。不新建测试文件，不改分片权重。
- 不改：CSS；`Dimensions.tsx`；其他页面与列表；契约与接口；e2e 文件；用户文档（由 DEMO-18 更新）。

## 冲突域

- web-ui:trade-master：`TradeMaster.tsx`、`trade-master.test.tsx`。
- 标签文件 `ui/trade-labels.ts`：S18 内只有本任务改它（REFAC-09 不改标签，见其决定）。
- 与 REFAC-09（`trade-invoices/`）、RUNMAIN-01（`scripts/demo/`）无共同文件。
- 受影响的 e2e 断言：见下文“e2e 断言”，都必须继续成立，不需要随本任务改。

## 验收

### base 失败、head 通过

| 编号 | 断言 | base `350e77a` | head |
| --- | --- | --- | --- |
| L2 | 中 / 英界面在“新增配置”之后各有一个名为“刷新列表” / “Refresh list”的按钮 | 失败：没有该按钮 | 通过 |
| L3 | 已加载两页后点“刷新列表”：恰好一个列表请求，URL 不带 `cursor`、带当前搜索词，完成后只显示第一页 | 失败：按钮不存在 | 通过 |
| L4 | 编辑器打开并改过内容时点“刷新列表”：编辑器内容不变，`window.confirm` 未被调用，搜索框、类型、公司不变，列表重读 | 失败 | 通过 |
| L5 | 连续点两次：前一次请求 `signal.aborted`，最终只显示一次第一页、无重复行；请求失败时显示既有 `Notice` 与“重试” | 失败 | 通过 |
| L6 | 切到另一类（`tradeProduct`）后点刷新：请求 URL 是 `/api/v1/trade/tradeProduct?…` | 失败 | 通过 |
| L7 | 键盘可达的结构前提（jsdom 只证明结构，不模拟原生键盘）：“刷新列表”是原生 `<button type="button">`，DOM 顺序紧跟“新增配置”，编辑器打开、“新增配置”禁用时它仍未禁用，点击它触发刷新 | 失败 | 通过 |

- **base 上的判定方法**：把 head 的 `trade-master.test.tsx` 复制到 base 检出上运行（标签键在 base 上不存在，用例按名称找不到按钮而失败）。PR 正文附 base 与 head 两次运行的未截断汇总行，以及 L2–L7 每个用例在 base 上的失败原因。设计角色已核对 base 一侧：`git grep -n -F "trade.listRefresh" -- packages/web/src` 在 `350e77a` 上无结果（退出码 1）；`TradeMaster.tsx` 中 `listRefresh` 也无结果。发票列表已有的 `tinv.listRefresh` 属于另一个域，不在本页渲染。

### 两侧都须成立的不变量

- **L1 范围**：`git diff --name-only` 只含“范围”所列三个文件。不加迁移。
- **L8 中英与 smoke**：中英标签同时加，中英键集合一致的既有检查（`packages/web/test/ui.test.ts:16–23`）通过；合并后 main Full 的 smoke 泄漏检查通过。
- **L9 既有测试**：`trade-master.test.tsx` 原有 9 个用例不改、全部通过；Web 全部 jsdom 测试与 PR CI 绿；合并后覆盖该合并提交的 main Full 绿。
- **L10 打包**（构建在新建的分离 worktree 中进行，`git status --porcelain` 为空，S17 回顾行动 3）：
  - 首屏预加载集合与 base 相同；首屏 JS 合计（掩码 gzip-9，同 D461 的测法）**≤ +40 B**；
  - `TradeMaster` 路由块 **≤ +200 B**（gzip-9）；
  - 其他 JS 块与 CSS **±0**。
  - 超出即停下报告协调者，不自行放宽。
- **L11 PR 正文**：“用户可见变化”一节（同下）；“可读性”一节；L2–L7 的用例名与 `file:line` 对照表；L10 的 base / head 构建来源（`rev-parse HEAD`、空 `status --porcelain`、Node / npm 版本、lockfile blob）与逐块数字原文。

### 设计试改（供参考，不是预算余量）

设计角色在 `350e77a` 的分离 worktree（`git status --porcelain` 为空；Node v26.13.0、npm 11.20.0、`package-lock.json` blob `07c1aee8b9c3392b88c25f9bb670adbbc8f19201`）按决定 2–5 试改后构建，与同一 worktree 的 base 构建对比：首屏 `index` 块掩码 gzip-9 +14 B；`TradeMaster` 块 +58 B；其他块不变；`TradePane` 137 → 136 行。试改已撤销，不入库。开发以自己的 base / head 构建为准（L10、L11）。

## e2e 断言

- 检索：`git grep -n -E "trade\.new|trade-kind|ui-master-actions" -- packages/infra/test/support`。
- **必须继续成立**：`trade-gui/scenario/part-one.ts:91–92`（`#trade-kind` 选类型、按名称点“新增配置”）；smoke 在 `trade` 页的泄漏检查（`trade-gui/smoke/pages.ts:20`，靠 L8）；Tab 走查用通用的 `keyboard.ts` `tabTo`（按目标定位，不依赖固定站数）。
- **须随本任务改**：无。

## 性能考虑

- 每次点击一个第一页请求（100 条，走既有分页），与切换类型时相同；不加轮询或自动刷新。打包按 L10。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥：

- **存量超长函数**：`TradePane`（137 行）本任务**净增 ≤ 0 行**（fnlen ≤ 137）：按钮区移到模块级 `PaneActions`，抵消新增的 Hook 与刷新函数。拆分 `TradePane` 不在本任务（候选池）。
- **新组件**：`PaneActions` ≤ 30 行、不含 Hook、嵌套 ≤ 3 层。
- **文件**：`TradeMaster.tsx` 净增 ≤ +30 行；`ui/trade-labels.ts` 恰好 +2 行；`trade-master.test.tsx` 净增 ≤ +120 行。
- **④**：新用例共用一个“已加载两页”的 `fetch` 桩辅助，不逐用例复制。
- **⑤**：测试里的页大小、行数用具名常量。
- PR 正文“可读性”一节贴 `git diff --numstat` 与 `TradePane`、`PaneActions` 的 fnlen 输出。

## 用户可见变化

- 贸易主数据页列表上方，“新增配置”之后多一个“刷新列表”按钮（英文 “Refresh list”），五类对象都有。点它按当前公司、类型与搜索词从第一页重新读取列表；搜索词、所选类型和正在编辑的内容都保留。编辑器打开时它仍可用。Tab 顺序在“新增配置”之后多一站。

## 证据要求

- 不需要浏览器时段：行为由 jsdom 用例证明（L2–L7）。原生键盘行为（Tab 从“新增配置”到“刷新列表”，含编辑器打开时；Enter、空格触发刷新）不在 jsdom 中证明，由 DEMO-18 已计划的浏览器运行用真实键盘输入取证（下表最后一行），不另申请时段、不新增必跑 CI 套件。截图与 390 记录也由 DEMO-18 取（见 [DEMO-18 验收](S18.md#demo-18-验收)）：

  | 视口 | 测量 | 阈值或比较方式（依据） | 来源 |
  | --- | --- | --- | --- |
  | 390 | 贸易主数据页页面级 `document.documentElement.scrollWidth <= window.innerWidth` | 必须成立（路线图 §5 证据清单 9） | DEMO-18 取证步骤（新增） |
  | 390 | 两个按钮都在视口内：每个按钮 `getBoundingClientRect()` 的 `left >= 0`、`right <= 390` | 必须成立 | DEMO-18 取证步骤（新增） |
  | 1440 | 按钮区截图（中 / 英，红 / 绿主题） | 目视：两个按钮同组，顺序为新增配置、刷新列表 | DEMO-18 截图 |
  | 1440 | 原生键盘：浏览器键盘输入（如 Playwright `keyboard.press`）Tab 从“新增配置”到“刷新列表”（编辑器打开时同样），Enter 与空格各触发一次列表请求 | 必须成立（L7 的行为部分） | DEMO-18 取证步骤（新增） |

- **可行性**（S13 回顾行动 4）：设计角色已在 `350e77a` 上试改并构建（见“设计试改”）；L3 的“已加载两页”可仿照既有 `fetch` 桩（`trade-master.test.tsx:95–110`）返回带 `nextCursor` 的第一页；L4 的 `confirm` 观测沿用 `:145` 的 `vi.spyOn(window, "confirm")`。
