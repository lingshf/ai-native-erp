# UI-14 侧栏导航分组：把“总账”组拆成三组

- Sprint：S11（[计划](S11.md)，D338 第三个开发名额）　依赖：S11 定稿 PR 合并（D339）　建议分支：`ui-14-nav-groups`
- 冲突域（逐个列文件）：
  - web-ui:shell：`packages/web/src/App.tsx`（只改第 211–223 行的导航分组标记）；`packages/web/src/ui/labels.ts`（追加 3 个 `shell.nav.*` 键，中英各一份）；`packages/web/src/ui/journal-labels.ts`（删除不再使用的 `journal.group`，第 2 行与第 98 行）；
  - 测试：`packages/web/test/App.test.tsx`（追加导航分组用例）；
  - 共享单文件：无（不改 `trade-gui-scenario.ts`；不新增测试文件，因而不改 `scripts/test-shard-weights.json`）；
  - **不涉及**：`packages/web/src/theme/shell.css`（现有规则已满足，见设计决定 4）；`TradeInvoices.tsx`、`trade-labels.ts`、`trade-invoices.css`（TINV-06 的冲突域）；路由、链接顺序与链接文字；迁移、契约、领域代码。
- 类型：页面（界面小步改进，D338）
- 优先级：P2（D338；不阻塞其他任务）

## 现状（main `ad70189`）

- 侧栏有 4 个 `nav-group`（`packages/web/src/App.tsx:199–229`）。第 3 组标题为 `journal.group`（“总账” / “General ledger”，`ui/journal-labels.ts:98`、`:2`），组内依次 10 个链接（`App.tsx:212–222`）：凭证、业务事件、采购 / 销售订单、采购与销售发票、付款与收款、预付 / 贷项与专用纠错、往来未结项与账龄、总账报表、总账明细、期末结账。其中 5 个是贸易往来页面（`:215–219`），与“总账”标题不符；英文下组标题“General ledger”与组内链接“General ledger”（`ledger.detail`，`ui/ledger-labels.ts:94`）同名。
- 其他组：首组无标题（运行状态、迁移，`:200–205`）；“基础配置”（`master.group`，`:206–210`）；“只读报表”（`reports.group`，`:224–228`）。
- `journal.group` 只在 `App.tsx:212` 使用：`git grep -n '"journal.group"\|t("journal.group")' -- packages/web/src` 只命中 `App.tsx:212`、`journal-labels.ts:2`、`:98`。
- 分组的样式（`packages/web/src/theme/shell.css`）：
  - 宽屏：`.nav-group { margin-top: var(--space-4) }`，首组为 0（`:176–181`）；组标题 `.nav-group > span` 为块级小号灰字（`:182–189`）；侧栏 `position: sticky`、`max-height: calc(100dvh - var(--appbar-h))`、`overflow-y: auto`（`:165–172`）。
  - 窄屏（`max-width: 760px`）：`.nav` 为横向 flex、`gap: var(--space-1)`、`overflow-x: auto`（`:278–283`）；`.nav-group` 为 flex、`gap: var(--space-1)`、`margin: 0`（`:284–288`）；组标题 `display: none`（`:289–291`）。所以窄屏下组与组之间、组内链接之间的间距都是 `--space-1`，拆组不改变窄屏横排。
- 没有测试依赖分组结构：`git grep -n "nav-group\|journal.group" -- packages/web/test packages/infra/test` 0 处命中；现有用例按链接名称定位侧栏链接（例如 `packages/web/test/trade-orders.test.tsx:188`）。

## 设计决定（产品负责人）

1. **只拆组，不改顺序**：第 3 组按现有顺序拆成三组，链接的先后、文字、路由一律不变，因此 Tab 顺序、键盘 E2E 与按名称定位的用例不受影响：
   - 组 A `shell.nav.posting`：“凭证与业务事件” / “Journals and events” —— 凭证、业务事件；
   - 组 B `shell.nav.trade`：“贸易往来” / “Trade” —— 采购 / 销售订单、采购与销售发票、付款与收款、预付 / 贷项与专用纠错、往来未结项与账龄；
   - 组 C `shell.nav.ledger`：“总账与结账” / “Ledger and close” —— 总账报表、总账明细、期末结账。
2. **标签位置**：3 个新键放在 `ui/labels.ts`（shell 标签），**不放 `trade-labels.ts`**（TINV-06 在改）。`journal.group` 不再使用，从 `journal-labels.ts` 中英两处删除；`ui.test.ts:16–17` 的键集合一致性仍成立。
3. **可访问性**：每个带标题的组（包括现有“基础配置”“只读报表”）加 `role="group"` 与 `aria-labelledby` 指向组标题 `span` 的 `id`。窄屏下标题 `display: none`，但 `aria-labelledby` 引用隐藏元素仍能计算可访问名称（accname 规则），因此窄屏下组名同样可被读屏读出。
4. **不改 CSS**：现有 `.nav-group` 规则（现状所列）直接适用于新组；宽屏多出两个组标题与两段 `--space-4` 间距，窄屏外观不变。
5. **用户可见变化**（PR 正文须有同名一节）：① 宽屏侧栏原“总账”组拆为“凭证与业务事件”“贸易往来”“总账与结账”三组，各有组标题；② 链接顺序与文字不变；③ 读屏软件会读出组名；④ 窄屏（≤ 760 px）横排导航外观不变。

## 导航与历史

不适用：只改侧栏的静态分组标记与标签，不改路由、地址、历史，不加监听。

## 范围

1. `App.tsx:211–223` 拆为三组，加 `role="group"` / `aria-labelledby`（含现有两组带标题的组）。
2. `ui/labels.ts` 追加 `shell.nav.posting`、`shell.nav.trade`、`shell.nav.ledger` 中英文。
3. `journal-labels.ts` 删除 `journal.group` 两处。
4. `App.test.tsx` 追加用例。

## 入口参数与异常

不适用：不涉及 URL、查询或路径参数。

## 不在范围

- 调整链接顺序、合并或改名链接；把“贸易主数据”（`/trade`，在“基础配置”组）移入“贸易往来”组。
- 折叠 / 展开分组、图标、窄屏导航重新设计。
- 改 `shell.css`。

## 验收标准

1. `App.test.tsx` 新增用例：侧栏 `navigation` 内有名称为“凭证与业务事件”“贸易往来”“总账与结账”“基础配置”“只读报表”的 `group`（中英各一次）；各组内链接名称与顺序如设计决定 1；整个侧栏的链接序列（按 DOM 顺序）与 base 相同（用例写出完整的 16 个名称）。
2. `git grep -n "journal.group" -- packages/web` 0 处命中；`ui.test.ts` 通过。
3. 键盘：从页面顶部按 Tab 经过侧栏链接的顺序与 base 相同（真实 Chrome 步骤记录 `document.activeElement` 的文字序列，base 与 head 一致）。
4. 中 / 英、红 / 绿两主题满足 [UI-1 通用验收](README.md#ui-1界面逐步改进) 1–9；组标题沿用现有 `.nav-group > span` 的颜色，不新增颜色。教学模式开 / 关对侧栏无影响（截图各一张）。
5. 真实 Chrome：见“证据要求”按视口断言表。
6. 现有测试与 E2E 不删除、不削弱、不跳过（D11）。

## 性能考虑

- **规模 / 热点**：静态标记，16 个链接、5 个组标题。
- **读写路径与索引**：不适用（无数据访问）。
- **查询次数**：不适用（无请求）。
- **分页**：不适用。
- **事务 / 锁 / 缓存边界**：不适用。
- **前端开销**：入口块增加 3 组标签与 2 个 `div`，删除 1 个标签。
- **预算与验证方式**：PG-05 按 S10 口径（base 为 PR 实际 base 的 gzip-9，数字绑定最终送审 head）报告入口块与 CSS 增量；预算入口块 ≤ +0.2 kB，CSS 0 B（不改 CSS）。热读 p95：不适用（不涉及请求）。

## 证据要求

- 真实 Chrome 与 E2E：按[路线图 §5 UI PR 证据清单](../roadmap.md#5-团队流程) 1–9 项；第 4 项配对图至少覆盖发票页与概览页，zh-红、en-绿 × 1440 / 390。
- 只能由真实 Chrome 证明的验收（按视口逐行，路线图 §5 设计文档自查 10）：

  | 视口 | 测量 | 阈值或比较方式（依据） | 来源 |
  | --- | --- | --- | --- |
  | 390 | 页面级 `document.documentElement.scrollWidth <= window.innerWidth` | 必须成立（证据清单 9） | 新增取证步骤（PR 中给出脚本文件与函数名） |
  | 390 | 侧栏 `.sidebar` 区域的 base / head 配对图像素差 | 0（设计决定 4：窄屏间距相同、标题隐藏） | 同上，像素差日志 |
  | 390 | `.nav` 的 `scrollWidth` | base 与 head 相等 | 同上 |
  | 1440 | `main` 元素 `getBoundingClientRect()` | base 与 head 相等（只侧栏变化，内容区不动） | 同上 |
  | 1440 | 侧栏所有链接 | 都可通过侧栏滚动或 Tab 到达并可见（`scrollIntoView` 后在 `.sidebar` 可视范围内）；记录 `.sidebar` 的 `scrollHeight` 与 `clientHeight`，不设阈值 | 同上 |
  | 1440、390 | Tab 经过侧栏链接的文字序列 | base 与 head 相同 | 同上 |

- 不改 `trade-gui-scenario.ts`；取证脚本放在 PR 证据中，不入库。

## 设计自查（推送前勾选，路线图 §5 设计文档自查 1–10）

- [x] 1 事实断言有来源（否定性断言附检索命令；肯定性断言附 `file:line`）
- [x] 2 定稿时无进行中的 PR 改 `App.tsx`、`labels.ts`、`journal-labels.ts`（`gh pr list --state open` 只有 Dependabot #10、#11、#16）
- [x] 3 依赖列与泳道说明一致
- [x] 4 不新增 CSS
- [x] 5 转述带原限定语
- [x] 6 无共享单文件
- [x] 7 不涉及入口参数
- [x] 8 改动条款已通读上下文
- [x] 9 不涉及导航与历史，已写理由
- [x] 10 几何类验收已按视口逐行列表
