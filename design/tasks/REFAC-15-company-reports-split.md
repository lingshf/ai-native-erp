# REFAC-15：拆分 `CompanyReports` 函数体（不改行为）

- Sprint：S24（[计划草案](S24.md)）　类型：重构（页面）　优先级：P2　决定：[D528](S24.md#s24-期间决定)（只改代码组织、不改行为；见“范围与决定”1–4）　建议分支：`refac-15-split-company-reports`
- 来源：[S24 候选](S24.md#候选s24-其余泳道s23-评审后定)“按 ② 拆 `CompanyReports`（378）”。结构与验收照搬 [REFAC-14](REFAC-14-company-events-split.md)（#326 已合并），只换成“贸易报表”的事实；按 [S22 回顾行动 3](../reviews/S22-retro.md#行动项汇总) 写出 chunk 归属与首屏预算，按行动 4 写出本机全量 web 测试命令；按 #327 评审 6034449046 的口径，main Full 只作合并后检查，不作合并前门。
- 迁移：**不加**。浏览器时段：**不需要**（理由见“证据要求”）。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 为什么是它

- `CompanyReports` 按 `files/fnlen.cjs` 口径（非空、非注释行）为 **378 行**，是 REFAC-14 合并后 `packages/web/src` 中最长的函数，约为 ② 上限（80 行）的 4.7 倍；次长 `RuleSettings` 313 行。
- 它承载贸易报表页的全部交互：公司切换、筛选表单（月份、伙伴、方向）与离开守卫、三个视图（未结项、账龄、核对）、刷新与重试、未结项虚拟表格与“加载更多”、核对表与跳转总账、未结项详情。之后的报表打磨（例如 TLIST 系列的刷新与提示）都会经过这里，先拆小可以缩小评审面。
- **节奏**：S24 计划原写“一个 Sprint 一个页面函数体，REFAC-14 规模已大”，用意是不让两个大重构同时在途、同时送审。REFAC-14 已由 #326 合并，本任务派发时没有其他页面拆分在途，用意仍满足；本任务书把该句改为“同一时间只有一个页面拆分在途”（S24.md）。
- 冲突域与在途任务不相交：FLAKE-09 只改 `packages/web/test/setup.ts`，SLOT-06 只改 `scripts/slot/`（见“冲突域”）。

## 现状（main `ac8ac00`）

下文 `file:line` 都按 `ac8ac00e8bfd4c8694b662e82a834550909e8f2f`。

- `packages/web/src/TradeReports.tsx` 共 571 行，导出 `TradeReports`（`:20–79`，路由入口：公司列表查询与外层布局）；模块内另有 `CompanyReports`（`:80–457`，不导出）与 `ItemDetail`（`:458–571`，不导出）。
- 设计角色用 `node files/fnlen.cjs packages/web/src` 实测，本文件命中：

  ```text
  378	packages/web/src/TradeReports.tsx:80-457	CompanyReports
  114	packages/web/src/TradeReports.tsx:458-571	ItemDetail
  ```

- **Hook 调用**（`CompanyReports` 内，源码顺序，R5a 的 base 一侧）：
  1. `useSearchParams`（`:95`）；
  2. `useState`：`input`（`:102`，初值 `{ party, month, side }`）；
  3. `useEffect`，依赖 `[party, month, side]`（`:103`）：URL 变化时重置 `input`；
  4. `useInvoiceLeaveGuard({ busy: false, unsaved: dirty }, t("trade.leaveConfirm"))`（`:105`）；
  5. `useInfiniteQuery` `page`（`:117–130`）：键 `["tradeReport", company.code, month, side, party]`，`enabled: valid && view !== "reconciliation"`，`refetchOnMount: "always"`；
  6. `useQuery` `reconciliation`（`:131–139`）：键 `["tradeReconciliation", company.code, month]`；
  7. `useQuery` `detail`（`:141–151`）：键 `["tradeItemDetail", company.code, month, id]`，`enabled: valid && !!id`。
- **派生值与命令**（每次渲染重新计算）：`t`、`money`（`:96–98`）；`party` / `month` / `side`（`:99–101`）；`dirty`（`:104`）；`view`（`:106`）；`valid`（`:107–111`，含月份、伙伴、方向与视图的四项校验）；`scope` / `filtered`（`:112–116`）；`rows` / `totals`（`:152–153`）；`change`（`:154–156`）；`failure`（`:157–158`）；`refresh`（`:159–163`）。
- **JSX**：Fragment 下 10 个子表达式（R5d 的 base 一侧）：
  1. `header(…)`：公司选择（`dirty` 时禁用）与“加载更多公司”（`:166–189`）；
  2. `TeachingTip`（`:190–192`）；
  3. `form.filter-bar`：月份、伙伴（`maxLength={60}`）、方向、应用与清除（`:193–242`）；
  4. `div.toolbar-row`：视图切换 `nav.segmented` 与刷新按钮（`:243–260`）；
  5. `{!valid && <MessageBar>}`（`:261–265`）；
  6. `{failure && <MessageBar>}`（含重试，`:266–273`）；
  7. 加载提示 `<p role="status">`（`:274–276`）；
  8. `{valid && view !== "reconciliation" && !page.isError && totals && …}`：KPI 与 `card.trpt-items`（`VirtualRows`、空状态、加载更多，`:277–377`）；
  9. `{valid && view === "reconciliation" && …}`：说明与 `card.trpt-reconciliation`（`:378–451`）；
  10. `{detail.data && !detail.isError && id && <ItemDetail …/>}`（`:452–454`）。
- **相近但不相同的处理**（拆分时最容易被误合并，R4 序列专门覆盖）：
  - `change`（`:154–156`）在字段之后写 `item: ""`，应用筛选和切换视图都会清掉已选未结项；未结项行的单据号按钮（`:317–330`，`dirty` 时禁用）直接 `setParams`，写 `item: row.documentId`，**不**经 `change`；
  - “清除”按钮（`:234–240`）把 `input` 恢复为 URL 中的当前值，**不是**清空，也不写 URL；
  - `failure` 在核对视图取 `reconciliation.error`，否则取 `page.error`，再在有 `id` 时补 `detail.error`；`refresh` 同样分视图，并在有 `id` 时另刷新详情；
  - 加载提示按视图取 `reconciliation.isFetching` 或 `page.isFetching`，不看 `detail`。
- **数字字面量**（`CompanyReports` 内）：`100`（`:124`，未结项分页 `limit=100`）、`60`（`:214`，伙伴输入 `maxLength={60}`）。设计角色实测：`git grep -n -e 'limit=100' -e 'maxLength={60}' ac8ac00 -- packages/web/src/TradeReports.tsx` 命中 `:29`（`TradeReports` 的公司列表，不在本任务范围）、`:124`、`:214` 三行，退出码 0。伙伴校验正则 `/^[A-Z0-9][A-Z0-9_.:-]{0,59}$/u`（`:109`）中的 `59` 与 `60` 对应，见决定 5。
- **导入方**：`TradeReports.tsx` 只被 `App.tsx:23–24` 懒加载；`CompanyReports` 与 `ItemDetail` 不导出。`packages/web/src/trade-reports/` 目录在 `ac8ac00` 上不存在。
- **测试**：
  - jsdom：`packages/web/test/trade-reports.test.tsx` 338 行、5 个用例（`:241`、`:256`、`:278`、`:300`、`:321`）；`App.test.tsx`、`trade-invoice-links.test.tsx`、`trade-period-admission.test.tsx` 也经过贸易报表页或其标签（`git grep -l -e trade-reports -e trpt -e TradeReports -- packages/web/test`）。
  - 真实 Chrome（只在 main Full 中运行）：`git grep -n -e trade-reports -e trpt- -- packages/infra/test` 命中 18 行，其中**界面断言**在 `trade-gui/scenario/adjustments-reports.ts:84–121`（`#trpt-month` 键盘输入、`trpt.apply` / `trpt.ageing` / `trpt.reconciliation` 按钮、按可访问名称找表格）、`trade-gui/scenario/leave-guard.ts:76–216`（离开守卫）、`trade-gui-invoice-links.ts:101–110`、`:224`、`trade-gui/smoke/pages.ts:48` 与 `support/navigate-ready.ts:17`（页面标题）。

### chunk 归属与首屏（S22 回顾行动 3，base 实测）

设计角色在 `ac8ac00` 上运行 `node scripts/measure/bundle-measure.mjs --base ac8ac00e8bfd4c8694b662e82a834550909e8f2f --head ac8ac00e8bfd4c8694b662e82a834550909e8f2f --work C:\tmp\meas-s24-refac15`（退出码 0，`RESULT: PASS`）：

| 文件 | 落在哪个 chunk | 依据 |
| --- | --- | --- |
| `TradeReports.tsx`（改） | 路由入口 chunk `src/TradeReports.tsx`（`assets/TradeReports-*.js`） | `App.tsx:23–24` 以 `lazy(() => import("./TradeReports.tsx"))` 懒加载 |
| `trade-reports/` 下新文件（新增） | 同上 | 只允许被 `TradeReports.tsx` 或同目录新文件导入（决定 6），打包器把它们并入同一路由 chunk |
| 首屏（`index.html` 入口与预加载闭包） | **本任务不改任何首屏文件** | `ui/labels`、`ui/components` 等首屏模块只导入、不改（决定 7） |
| 共用 chunk（`virtual-rows`、`use-invoice-leave-guard`、`master-data-client`、`reports-data`、`useInfiniteQuery`、`useQuery` 等） | 不改 | 只导入；路由闭包中这些 chunk 须 ±0 |
| CSS `assets/TradeReports.css`（`pages/trade-reports.css`） | 不改 | 决定 7 |

base 数字（屏蔽哈希后的 gzip-9 / 原始字节，输出原文行）：

```text
| first-screen | first-screen | 531160 | 531160 | 161114 | 161114 | 0 | ±0 | PASS |
| route | src/TradeReports.tsx | 41077 | 41077 | 14670 | 14670 | 0 | ±0 | PASS |
| chunk | src/TradeReports.tsx | 11879 | 11879 | 3422 | 3422 | 0 | ±0 | PASS |
| chunk | assets/TradeReports.css | 1867 | 1867 | 602 | 602 | 0 | ±0 | PASS |
```

## 范围与决定

1. **不改行为**（D528）。以下全部不变：DOM 结构、类名、文本、属性（含 `id`、`htmlFor`、`aria-*`、`role`、`disabled`、`maxLength`、`type`）；URL 查询串的写法（`setParams` 的参数与键顺序）；请求的 URL、发出顺序与取消；查询键、`enabled` 与 `refetchOnMount`；离开守卫的参数（`busy: false`、`unsaved: dirty`、提示文案）；焦点与键盘行为。只改代码组织，不修 bug；拆分时发现的疑似缺陷登记在 PR 正文，留作后续任务。
2. **Hook 顺序不变**：Hook 可以留在 `CompanyReports`，也可以放进它顶层无条件调用的自定义 Hook（例如 `useCompanyReports`）。**展示组件不得调用任何 Hook**；不新增 `useCallback`、`useMemo`、`memo`。展开自定义 Hook 后，Hook 调用序列（种类、先后、参数与依赖的源文本，空白归一）与“现状”所列 base 序列逐项相同（R5a，唯一豁免见下）；`useInvoiceLeaveGuard`、`useInfiniteQuery`、`useQuery` 按一次调用计，不展开其内部。
   - **唯一豁免**（D528）：`useInfiniteQuery` 的 `queryFn` 中请求 URL 模板里的 `limit=100`（base `:124`）按决定 5 改为 `limit=${常量}`。比较时只把这一处替换项视为等同于 `100`，其余字符照旧逐字比较（只归一空白）；该参数中其他任何改动、或其他 Hook 参数中的任何改动都不在豁免内。豁免处的行为由 R4 直接核对：求值后的请求 URL 逐字节相同；Hook 顺序、查询键、`enabled`、`initialPageParam`、`refetchOnMount`、`getNextPageParam`、依赖与 `{ signal }` 的传递不变。
3. **派生值与命令**：`valid`、`scope` / `filtered`、`failure`、`change`、`refresh` 可以搬进自定义 Hook，或抽成同目录的纯函数（以参数接收 URL 值与查询结果），输入输出逐项不变；每次渲染仍读取当次状态，不改为缓存的闭包。**不合并**“现状”所列的相近处理：行内单据号按钮不经 `change`，“清除”只恢复 `input`，`failure` / `refresh` / 加载提示各自的分视图规则原样保留。账龄徽标的色调判断（`:344–350`，`notDue` → `success`、匹配 `/61|91/u` → `danger`、其余 `warning`）可以抽成具名纯函数（例如 `ageingTone`），正则与分支顺序不变。
4. **组件层级对等**：新组件一律在模块顶层定义。抽出的组件只替换“现状”所列 10 个子表达式之一（或其中一个子表达式内部的一段，例如未结项行的单元格或核对行的单元格）；只渲染该表达式原来渲染的内容，不把相邻兄弟合成一个返回 Fragment 的组件。条件渲染的条件留在父级原位置，或留在被抽出组件内与原来相同的位置。`header(…)` 的调用方式不变：仍由 `CompanyReports`（或其子组件）调用 props 中的 `header` 并传入同一结构的 `context`。
5. **具名常量**（⑤）：未结项分页大小 `100` 与伙伴编码最大长度 `60` 各用一个具名常量，值不变；`maxLength` 使用该常量。伙伴校验正则 `:109` **原文不变**（不改为由常量拼出），在常量旁用一行“为什么”注释写明正则中 `{0,59}` 与它对应。`TradeReports` 中 `:29` 的公司列表 `limit=100` 不在本任务范围，不改。
6. **文件**：新文件放在新目录 `packages/web/src/trade-reports/`，按职责命名（例如 `use-company-reports.ts`、`report-filters.tsx`、`report-toolbar.tsx`、`open-items-view.tsx`、`reconciliation-view.tsx`、`item-detail.tsx`），粒度由开发定，写入 PR 正文。新文件只被 `TradeReports.tsx` 或同目录文件导入。`TradeReports` 仍从 `./TradeReports.tsx` 导出，函数体**不改**（`App.tsx` 不改，R2）。
   - `ItemDetail`（114 行，`:458–571`）可以**原样搬移**到新文件，文本逐字不变，PR 正文附 `git diff --color-moved=plain -M` 或逐字比较的输出；它不在本任务拆分范围内（存量 114 行，登记入候选池），不得改动。
7. **不改**：
   - `TradeReports` 的导出名、props 与函数体；`App.tsx` 与路由表；
   - `trade-invoices/use-invoice-leave-guard.ts`、`journals/virtual-rows.tsx`、`master-data-client.ts`、`reports-data.ts`（只导入）；
   - 标签（`ui/labels*`）、CSS（含 `pages/trade-reports.css`）、契约（`@erp/core/contracts`）；
   - `packages/web/test/**`（含 FLAKE-09 的 `setup.ts`）、`packages/infra/test/**`、`scripts/test-shard-weights.json`、`package.json` / lock。

## 冲突域

- web-ui:trade-reports：只改 `packages/web/src/TradeReports.tsx`，并新增 `packages/web/src/trade-reports/` 下的文件（决定 6）。
- 取证所需的观测点和新增测试文件：无（R4 脚本不提交）。
- 受影响的 e2e 断言（S13 回顾行动 1）：见“现状”；**必须继续成立**：`adjustments-reports.ts`、`leave-guard.ts`、`trade-gui-invoice-links.ts`、`smoke/pages.ts` 中贸易报表页的选择器与可访问名称（`#trpt-month`、按钮文案、表格可访问名称、页面标题）；合并前由 R4 的 DOM 逐字节等价保证，合并后由 R8b 的 main Full 复核；**须随本任务改**：无。
- 受影响的文档引用（D460）：`git grep -n -F "TradeReports.tsx" -- docs design` 在 `ac8ac00` 上命中 35 行，都是当时的事实记录，不改。
- 与在途任务不相交：FLAKE-09 只改 `packages/web/test/setup.ts`；SLOT-06 只改 `scripts/slot/`。三者没有共享文件；本任务不改任何测试文件，FLAKE-09 不改产品代码。
- **测试基线随 FLAKE-09 变化**：FLAKE-09 若先合并，本任务的本机全量结果按实际合并基解读；两侧比较（R3、R4）都在同一合并基与 head 上做。

## 验收

### base 失败、head 通过

| 编号 | 检查 | base `ac8ac00` | head 要求 |
| --- | --- | --- | --- |
| R6a | `node fnlen.cjs packages/web/src`（口径同 S16–S24）中 `CompanyReports` 的行数 | **378**（失败） | ≤ 80，且 `TradeReports.tsx` 与新文件中没有本任务新增或改动的函数 > 80（原样搬移的 `ItemDetail` 114 行除外，见决定 6） |
| R6b | `CompanyReports` 及其新抽出的组件、Hook 与函数中，`limit=100` 与 `maxLength={60}` 的数字字面量 | 2 处（`:124`、`:214`，失败） | 0 处，改用具名常量（决定 5）；`TradeReports` 的 `:29` 不计 |

### 两侧都须成立的不变量

- **R1 范围**：`git diff --name-only <base> <head>` 只含 `TradeReports.tsx` 与 `trade-reports/` 下的新文件；决定 7 所列文件的 diff 为空。不加迁移。
- **R2 导出不变**：`TradeReports.tsx` 的导出集合与 base 相同（`TradeReports`，function），`TradeReports` 函数体逐字不变。用仓库根 devDependency `@babel/parser` 解析，口径同 REFAC-14 R2。新文件的导出只在 `trade-reports/` 与 `TradeReports.tsx` 内使用，PR 正文附 `git grep` 结果。
- **R3 既有测试原样通过**：`trade-reports.test.tsx` 的 5 个用例、`App.test.tsx`、`trade-invoice-links.test.tsx`、`trade-period-admission.test.tsx` 与 Web 全部 jsdom 测试通过；测试文件 diff 为空。本机全量命令见“测试命令”。
- **R4 DOM、URL、请求与离开守卫等价**（送审证据，脚本不提交，不加常驻 CI 用例）：
  - **驱动**：临时 jsdom 驱动脚本，借用 `trade-reports.test.tsx` 的渲染方式与 `fetch` 桩（`:139–140`），在 base 与 head 上按同一序列操作。`fetch` 桩改为**受控响应**，采样边界同 [REFAC-10 R4](REFAC-10-order-list-split.md#验收)。
  - **记录离开守卫**：`window.confirm` 换成记录桩（记下每次调用的消息原文，返回值由步骤指定）；在“输入未应用”与“已应用”两个状态各派发一次 `beforeunload`，记下 `defaultPrevented`。不用按钮 `disabled` 代替：公司选择与视图按钮的 `disabled` 直接取 `dirty`，漏掉守卫调用也不会改变它。
  - **记录 URL**：每步记下路由的 `location.hash`（含查询串原文，键顺序不归一）。
  - **序列**至少包含：
    - 首次进入（未结项视图）→ 切到账龄 → 切到核对 → 回到未结项；
    - 填月份、伙伴、方向 → 应用（URL 写入三项、`item` 为空）；再改伙伴不应用 → “清除”（`input` 恢复为 URL 值，URL 不变）；
    - 非法伙伴（小写）与非法月份经 URL 直接进入：出现校验错误提示，不发请求；
    - 有未应用输入时：公司选择与视图按钮禁用；点击总账链接或后退时 `confirm` 被调用一次（分别返回 `false` 与 `true`）；`beforeunload` 被阻止；
    - 未结项“加载更多”（第二页带 `cursor` 与 `snapshot`）；
    - 点未结项单据号 → 详情出现（URL 写 `item`）→ 再应用筛选（`item` 被清空、详情消失）；
    - 刷新：未结项视图有详情时，刷新同时重发列表与详情请求；核对视图只重发核对请求（有 `id` 时另加详情）；
    - 失败与重试：列表请求失败 → 错误条 → 重试成功；核对请求失败；详情请求失败；
    - 月份已选时核对行出现总账链接，未选时为纯文本；
    - 公司切换（`changeCompany`，组件按 `key` 重建）；
    - **在途请求取消**：在已应用筛选的未结项视图中，让当前列表请求的受控响应**保持未完成**，随后应用另一组筛选（查询键改变）。旧请求的 `signal` 必须变为已取消；之后再放行它的响应，页面不得显示它的数据。驱动对每个请求记录 `signal.aborted` 与 `abort` 事件是否触发（在 `fetch` 桩里给 `signal` 挂监听）。另在公司切换一步中同样保留一个在途请求，记录它是否被取消。
    - zh / en 各一遍；教学模式开与关各一遍。
  - **每步采样**：DOM（`document.body.innerHTML`）与焦点；`location.hash`；累计请求日志（序号、URL、结果、是否被取消）；查询缓存（`queryKey`、`status`、`isInvalidated`，按键排序）；累计 `confirm` 记录；`beforeunload` 记录。
  - **判定**：base 与 head 逐步、逐项、逐字节相同；并且**直接断言**：在“在途请求取消”一步中，两侧被保留的旧请求都记有 `signal.aborted === true` 且 `abort` 事件已触发（只比两侧相同不够：两侧都不取消时也会相同）。base 上若该断言不成立，先停下并向协调者报告，不得把“两侧都未取消”当作通过。PR 正文附脚本全文、步骤清单、两侧输出的 SHA-256 与比较结果，以及“清除只恢复输入”“单据号按钮与应用筛选对 `item` 的不同处理”“离开守卫”“刷新分视图”四组场景的逐步输出原文。
- **R5 结构规则**（静态，评审按代码与 PR 表格核对）：
  - **R5a Hook 序列**：PR 正文列出 base 与 head 的 Hook 调用序列（自定义 Hook 按调用处展开）及参数源文本（只归一空白），两侧逐行相同；base 一侧须与“现状”所列一致。唯一豁免是决定 2 所列 `queryFn` URL 模板中 `limit=100` → `limit=${常量}` 这一处：PR 正文给出该行两侧原文，并写明豁免后其余字符相同；除此之外的任何差异即失败。
  - **R5b 展示组件无 Hook**：新抽出的组件中没有任何 `use*` 调用；PR 正文附 Babel AST 检查脚本的输出。
  - **R5c 模块级定义**：所有组件、自定义 Hook 与函数都在模块顶层声明。
  - **R5d 插槽对等**：PR 正文用一张表列出“现状”中的 10 个子表达式，并标出 head 中对应的唯一组件或表达式。
  - **R5e 原样搬移**：`ItemDetail` 若搬移，PR 正文附逐字比较输出（不同即失败）。
- **R6 尺寸**：除上表 R6a、R6b 外，`TradeReports.tsx` ≤ 150 行；新文件各 ≤ 200 行；每个新函数满足 ②（≤ 80 行、嵌套 ≤ 3 层）；PR 正文列出所有超过 50 行的函数，附计数行数与最深层数（base 与 head 两列）。
- **R7 打包字节**：首屏按 D454。用 `scripts/measure/bundle-measure.mjs`，写明脚本所在的提交 SHA（[任务书模板“构建来源”](TEMPLATE.md#证据要求)）；base 为最终送审 head 的实际合并基，合并基变了就重新测量。预算（未列出的项 ±0）：

  | 项 | manifest 键 | 上限 | 依据 |
  | --- | --- | --- | --- |
  | 首屏 | — | **±0**（D454，`--d454`） | 改动文件都不在首屏闭包中（“chunk 归属”表）；首屏预算与路由预算互不矛盾 |
  | 贸易报表路由新增 | `src/TradeReports.tsx` | ≤ **+700 B** | 估定，见下 |
  | 贸易报表入口 chunk | `src/TradeReports.tsx` | ≤ **+700 B** | 同上 |
  | 共用 chunk 与其他路由 | 全部 | ±0 | 只导入、不改 |
  | CSS | 全部 | ±0 | 不改 CSS |

  命令参数：`--route src/TradeReports.tsx=+700 --chunk src/TradeReports.tsx=+700 --d454`。出现 base 没有的新 chunk 即停下报告；超出先停下，报设计角色与协调者，不得自行放宽。上限没有做试改构建：REFAC-12 与 REFAC-14 各定 +900 B；本函数规模约为 `CompanyEvents` 的 2 / 3，命令更少，按比例估 +700 B。
- **R8 质量门**：
  - **R8a 合并前**：`typecheck`、`lint`、CI-02 预检通过；PR CI（`ci.yml`）绿。
  - **R8b 合并后检查（不作合并门）**：合并后第一次覆盖该合并提交的 main Full 须绿，含 `trade-gui` 中经过贸易报表页的场景（“冲突域”所列）；失败时报协调者，按 D456 暂停后续合并。
- **R9 可读性一节**：PR 正文按下节逐条说明。

### 测试命令（S22 回顾行动 4）

- 本机全量 web 测试一律用 `npx vitest run --project web`（项目名见 `vitest.config.ts:160`），PR 正文附汇总行原文，base 与 head 各一次。
- 有失败时，逐个列出失败的文件与用例，并附只对这些文件的串行重跑原文：`npx vitest run --project web --no-file-parallelism <失败文件…>`。不得自行更换并发参数而不说明；串行重跑仍失败即按真实失败处理。

## 性能考虑

- 渲染次数不变：不加 `memo`，不改 Hook 与依赖；虚拟表格（`VirtualRows`）的 `items` 与 `render` 用法不变。不跑 Bench。打包变化由 R7 约束。其余项（规模、索引、查询次数、分页、事务）不适用：不改数据访问。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥：

- **②**：本任务就是为满足 ② 而做。`CompanyReports` 从 378 行拆到 ≤ 80 行（R6a）。最大的几块是未结项视图（`:277–377`，约 100 行，未结项行的单元格可再拆出）、核对视图（`:378–451`，约 75 行）与筛选表单（`:193–242`，约 50 行）；它们各自抽出后仍须 ≤ 80 行。
- **③**：`TradeReports.tsx`（571 行）是热点；拆后 ≤ 150 行，新文件各 ≤ 200 行。PR 正文贴 `git diff --numstat`。
- **①**：组件、Hook 与函数名表达职责，例如 `useCompanyReports`、`CompanySelect`、`ReportFilters`、`ReportToolbar`、`OpenItemsView`、`OpenItemCells`、`ReconciliationView`、`ageingTone`、`isValidReportQuery`；不用 `Part1`、`Section2`。
- **④**：分层对齐 REFAC-10–14 的做法：URL 状态、查询与命令在一个 Hook，展示组件只接收 props；不抽跨页共用件。
- **⑤**：见决定 5。
- **⑥**：新增的“为什么”注释只有决定 5 那一条；不留调试输出。
- **测试耗时**：本任务不改测试；R4 驱动脚本不提交。PR 正文附 `trade-reports.test.tsx` 在 base 与 head 上的耗时（vitest 汇总行原文），两侧差异 > 20% 时说明原因。

## 用户可见变化

- 无。贸易报表页的公司切换、筛选与清除、三个视图、刷新与重试、加载更多、核对跳转总账、未结项详情与离开提示的外观、文案、键盘与焦点行为、URL 与请求都不变（R3、R4）。

## 证据要求

- **不需要浏览器时段**：合并前的行为等价由 R3（既有 jsdom 用例）与 R4（逐步的 DOM、URL、请求与离开守卫等价）证明；经过本页的 e2e 场景在 main Full 中运行，作合并后检查（R8b）。R4 与构建在本机运行，须服从协调者的时段静默通知（D442 / D480）。
- **可行性**（S13 回顾行动 4）：R4 的驱动方式已在 REFAC-10（#291）至 REFAC-14（#326）跑通；`trade-reports.test.tsx` 已有按路径分派的 `fetch` 桩（`:139–140`），可改为受控响应；离开守卫的 `confirm` 桩写法见 `trade-reports.test.tsx:321` 的用例。R6a、R6b 的 base 数字与 chunk 归属见“现状”（设计角色实测）。本任务书**没有**做试改构建，R7 的上限按拆分规模估定。
- PR 正文附：R2 导出与 `git grep` 结果；R4 脚本、步骤清单、比较结果与四组场景的逐步输出；R5a–R5e 各表；R6 行数表（base 与 head 两列）；R7 的 `bundle-measure.mjs` 完整输出与退出码；“测试命令”的汇总行；可读性一节。R8b 合并后补到 PR 评论。
