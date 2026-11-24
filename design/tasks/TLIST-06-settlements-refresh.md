# TLIST-06：付款与收款页加“刷新列表”

- Sprint：S22（[计划](S22.md)）　类型：功能（列表，小步打磨）　优先级：P2　决定：待协调者定编号　建议分支：`tlist-06-settlements-refresh`
- 来源：[S21 候选池](S21.md#候选池s21-之后)“按 ② 拆 `SettlementEntry`，再给结算加‘刷新列表’”。写法照搬 [TLIST-05](TLIST-05-business-events-refresh.md)（#301）/ [TLIST-03](TLIST-03-accounts-refresh.md)（#288）。
- **前置**：[REFAC-12](REFAC-12-settlement-entry-split.md) 已合并。本任务以 REFAC-12 合并后的 main 为 base，在同一泳道接着做；REFAC-12 未在 S22 的 RC 冻结前合并时，本任务顺延到 S23（见 [S22 计划](S22.md#泳道)）。
- 迁移：**不加**。浏览器时段：**不需要**（原生键盘与 390 宽度由 DEMO-22 的浏览器运行取证，见“证据要求”）。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 选哪一项（产品负责人）

1. **系列最后一页**：TLIST-01–05 之后，没有“刷新列表”的列表只剩付款与收款页的未结项分配表。
2. **未结项会在别处变化**：开票、贷项、其他标签页中的付款，或 AI 助手过账，都会改变未结项。现在只能切换伙伴再切回来，或按 F5。按 F5 会回到页面初始状态，只有 `sessionStorage` 中的草稿能恢复。
3. **改动小**：直接用 `master.listRefresh`（`ui/master-labels.ts:15` 中文“刷新列表”、`:98` 英文 “Refresh list”），`.toolbar-row` 已在 `theme/components.css:395`。不改标签文件与 CSS，首屏块不变。
4. **为什么先拆**：`SettlementEntry` 有 465 行（REFAC-12“现状”），直接在里面加按钮会继续加长超长函数。

## 现状（以 REFAC-12 合并后的 main 为准，下列行号取自 `276fd3b`）

- 分配表在 `FastTab#tset-allocation`（`TradeSettlements.tsx:440–600`）中。`<fieldset disabled={locked}>`（`:441`）包住 KPI、表格与“加载更多”，所以存在待确认信封（`locked`）时，fieldset 内的控件全部禁用。
- 未结项查询为 `useInfiniteQuery`（`:229–240`），键 `["tradeOpenItems", company.code]`，`refetchOnMount: "always"`，每页 `limit=100`。
- 过账成功后，`confirm` 先清空草稿的已选项并换新的 `paymentId`（`:325–330`），再调用 `await page.refetch()`（`:331`）。`refetch` 按已加载的页数逐页重读，保留已加载的页数；前提是重读的上一页仍返回 `nextCursor`。
- 表格没有 `aria-rowcount`；行只有 `aria-rowindex={index + 2}`（`:482`），超过 100 行时虚拟化（`:244`），jsdom 中渲染的行数不代表已加载的行数。
- 已选项保存在草稿 `saved` 中（写入 `sessionStorage`），与查询数据分离。已选但尚未加载的项显示“待加载”，不按 0 推算（`:349` 注释）。
- base 一侧：`git grep -n -F listRefresh 276fd3b -- packages/web/src/TradeSettlements.tsx packages/web/test/trade-settlements.test.tsx` 无结果，退出码 1（设计角色已核对）。REFAC-12 不改行为，合并后仍应无结果；开发在 PR 正文按实际 base 重跑一次。
- 测试：`packages/web/test/trade-settlements.test.tsx` 共 362 行、8 个用例，桩辅助为 `mockApi`（`:121`）与 `selectPartial`（`:178`）。
- e2e：`trade-gui/scenario/part-one.ts:105–128` 的 `settleWithDiscount` 经过本页（见“e2e 断言”）。

## 设计决定（产品负责人）

1. **位置**：在 `FastTab#tset-allocation` 内、`<fieldset disabled={locked}>` **之前**放一个 `<div className="toolbar-row">`，里面是一个原生 `<button type="button" className="btn btn-secondary">`，文案 `master.listRefresh`。放在 fieldset 之外，所以待确认时按钮不会被禁用（决定 4）。
2. **刷新方式与过账成功后相同，但不清空草稿**：调用该查询的 `refetch()`，按已加载的页数重读。确认成功时 `confirm` 会先清空已选项（`:325–330`），手动刷新**不做**这一步：已加载的页、已选项、金额与折扣输入都保留。不用 `resetQueries`，因为重置会丢掉已加载的页，已选的第 2 页以后的项会变成“待加载”，用户还得重新点“加载更多”。
3. **只刷新本页的未结项**：只重读当前公司的 `tradeOpenItems`；不刷新伙伴列表、公司列表或其他页的查询，也不改查询键与 `refetchOnMount`。
4. **待确认或请求进行中时仍可用**：
   - 不禁用，不弹确认框（与 TLIST-02–05 一致）；
   - 预览、待确认信封、回执、“结果未知”提示与草稿都不变；
   - “预览”“确认”“重试确认”的启用规则不变。
5. **不做的事**：不加自动刷新或轮询；刷新后不自动重算预览，也不清除预览；刷新后已选项若不在新数据中，沿用既有的“待加载”显示，不另加提示。
6. **组件**：按钮由 `trade-settlements/` 下一个模块级小组件实现（≤ 20 行，不调用 Hook，通过属性接收 `onRefresh`）。分配页签组件（REFAC-12 中对应 `FastTab#tset-allocation` 的组件，下称“分配页签”）只多渲染这一行。
7. **不改**：契约与服务端；标签文件与 `trade-settlement-teaching.ts`；CSS；`App.tsx`；查询键、`limit`、虚拟化参数；`scripts/test-shard-weights.json`；`docs/`（用户文档由 DEMO-22 补，见“冲突域”）。

## 范围

- 产品代码：`packages/web/src/trade-settlements/` 下的分配页签文件、`use-open-items`（或 REFAC-12 中持有该查询的文件，只在需要把 `refetch` 传出时改），以及按钮组件所在的文件（可以新建）。`TradeSettlements.tsx` 只在需要传递属性时改。
- 测试：`packages/web/test/trade-settlements.test.tsx`，只加用例与共用桩辅助，不改原有 8 个用例。不新建测试文件。

## 冲突域

- web-ui:trade-settlements：与 REFAC-12 相同，所以排在 REFAC-12 合并之后。
- 与 S22 其他任务不相交：SLOT-05 只改 `scripts/slot/`；DOC-22 只改 `docs/release/README.md` 与 `docs/demo/TEMPLATE.md`（以 [S22 计划](S22.md) 为准）。
- 受影响的 e2e 断言：见下节。
- 受影响的文档引用：`docs/user/trade.md` 的“付款与收款”一节（`276fd3b` 上 `:144` 起）由 DEMO-22 补一句（见 [DEMO-22 验收](S22.md#demo-22-验收)）。本任务不改 `docs/`。

## 验收

### base 失败、head 通过

| 编号 | 断言 | base（REFAC-12 合并后的 main） | head |
| --- | --- | --- | --- |
| S2 | 中 / 英界面：分配页签内、表格之前有一个名为“刷新列表” / “Refresh list”的按钮；页面其他位置没有该按钮 | 失败：没有该按钮 | 通过 |
| S3 | 桩返回两页（第一页 100 项并带 `nextCursor`，刷新时同样返回），点“加载更多”加载第二页后，勾选第二页的一项并改金额，再点“刷新列表”：恰好两个 `/api/v1/trade/open-items` 请求，依次为不带 `cursor` 的第一页与带第一页 `nextCursor` 的第二页，`limit=100`；完成后查询缓存 `["tradeOpenItems", <公司>]` 仍有 2 页、共 200 项；`sessionStorage` 草稿中该项与金额逐字不变；KPI 的应付 / 应收显示金额，不是“待加载”（证明第二页仍在已加载数据中）；没有其他 `/api/v1/…` 请求 | 失败：按钮不存在 | 通过 |
| S4 | 刷新后第一页的桩把一个**已勾选**项的未结余额改小：该行的剩余金额与 KPI 中的应付 / 应收（按已选项的未结余额求和，`276fd3b` `:350–353`）显示新值；预览（若已存在）不被清除，也不自动重算 | 失败 | 通过 |
| S5 | 已预览并存在待确认信封（`locked`）时：按钮**未禁用**，点后列表重读；fieldset 内控件仍禁用；“确认”仍可用；`sessionStorage` 中的待确认信封逐字不变；`window.confirm` 未被调用 | 失败 | 通过 |
| S6 | 确认时无服务器应答进入“结果未知”后点“刷新列表”：提示与“重试确认”仍在；之后“重试确认”成功时的请求体与不点刷新时逐字相同 | 失败 | 通过 |
| S7 | 键盘可达的结构前提（jsdom 只证明结构，不模拟原生键盘）：按钮是原生 `<button type="button">`，在 DOM 顺序上位于“常规”页签的最后一个控件之后、分配表的第一个选择框之前；点击触发刷新；连续点两次时最终只显示一次数据、无重复行；请求失败时显示既有的错误条 | 失败 | 通过 |

- **base 上的判定方法**：把 head 的 `trade-settlements.test.tsx` 复制到 base 检出上运行。base 上按名称找不到按钮，S2–S7 失败。PR 正文附两侧运行的未截断汇总行，以及 S2–S7 每个用例在 base 上的失败原因。
- S3 的请求为 `/api/v1/trade/open-items?company=…&status=open&limit=100`，翻页时加 `&cursor=…`（`276fd3b` `:234–235`）；REFAC-12 后以持有该查询的文件中的实际 URL 为准，PR 正文附原文。

### 两侧都须成立的不变量

- **S1 范围**：`git diff --name-only` 只含“范围”所列文件；决定 7 所列文件的 diff 为空。不加迁移。
- **S8 中英**：不加标签键；中英键集合一致的既有用例（`packages/web/test/ui.test.ts`）通过。
- **S9 既有测试**：`trade-settlements.test.tsx` 原有 8 个用例不改、全部通过；Web 全部 jsdom 测试与 PR CI 绿；合并后覆盖该合并提交的 main Full 绿，包括 tests:trade-e2e 的浏览器分片。
- **S10 打包**：口径见 [S22 共同验收“L10 / 体积口径”](S22.md#l10--体积口径)，构建来源按[任务书模板](TEMPLATE.md#证据要求)：
  - 用 `scripts/measure/bundle-measure.mjs`，base 为最终送审 head 的实际合并基（完整 SHA），合并基变了就重新测量；
  - **首屏 ±0**（判定按 D454）；
  - 付款与收款路由（manifest 键 `src/TradeSettlements.tsx`）的路由新增与该入口 chunk 各 **≤ +200 B**（掩码 gzip-9），即 `--route src/TradeSettlements.tsx=+200 --chunk src/TradeSettlements.tsx=+200 --d454`；构建中出现 base 没有的新 chunk 时停下报告；
  - 其他 JS 块与 CSS **±0**；
  - 上限未经试算；超出即停下报告协调者，不自行放宽。
- **S11 PR 正文**须含：“用户可见变化”一节（内容同下）；“可读性”一节；S2–S7 的用例名与 `file:line` 对照表；S10 的完整输出与退出码。

## e2e 断言

- **必须继续成立**：`trade-gui/scenario/part-one.ts:105–128` 的 `settleWithDiscount`。它按名称定位“选择 / 金额 / 折扣”控件与“预览”“确认”按钮，新按钮名称不同，不影响定位。S9 的 main Full 证明它仍通过。
- **须随本任务改**：无。

## 性能考虑

- 每次点击按已加载的页数发请求（每页 100 条），与过账成功后相同；加载了 n 页就是 n 个请求，不另加上限，因为用户主动点“加载更多”才会加载更多页。不加轮询或自动刷新。打包按 S10。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥：

- **②**：分配页签组件本任务净增 ≤ +3 行，且合并后仍 ≤ 80 行；按钮组件 ≤ 20 行、嵌套 ≤ 3 层、不调用 Hook；`SettlementEntry` 与持有查询的 Hook 净增 ≤ +2 行（只传 `refetch`）。
- **③**：`trade-settlements/` 下每个文件仍 ≤ 200 行；`trade-settlements.test.tsx` 净增 ≤ +180 行。
- **④**：新用例共用一个“未结项两页、第一页可改金额”的桩辅助，不逐用例复制；尽量复用 `mockApi` 与 `selectPartial`，原用例不改（S9）。
- **⑤**：测试里的页大小、行数与金额用具名常量。
- **测试耗时**（[任务书模板](TEMPLATE.md#证据要求)“满载耗时”条款）：新用例共用的准备放在 `beforeEach` / 辅助函数中，不重复渲染整页多于必要次数；PR 正文附 `trade-settlements.test.tsx` 在 base 与 head 上的耗时（vitest 汇总行原文）；单个新用例 > 2 s 须说明原因；不加 `timeout` 或重试。
- PR 正文“可读性”一节贴 `git diff --numstat`，以及分配页签、按钮组件与 `SettlementEntry` 的 fnlen 输出。

## 用户可见变化

- 付款与收款页的“分配”页签在表格上方多一个“刷新列表”按钮（英文 “Refresh list”）。
  - 点它按当前公司重新读取已加载的未结项，已勾选的项、输入的金额和折扣都保留；
  - 已预览、待确认或“结果未知”时它仍可用，不影响确认；
  - Tab 顺序在“常规”页签的控件之后、分配表之前多一站。
- 其余不变：预览、确认与回执不变，没有新的确认框。

## 证据要求

- **不需要浏览器时段**：行为由 jsdom 用例证明（S2–S7）。原生键盘行为与 390 宽度由 DEMO-22 已计划的浏览器运行用真实键盘输入取证，不另申请时段：

  | 视口 | 测量 | 阈值或比较方式（依据） | 来源 |
  | --- | --- | --- | --- |
  | 390 | 付款与收款页页面级 `document.documentElement.scrollWidth <= window.innerWidth` | 必须成立（路线图 §5 证据清单 9） | DEMO-22 取证步骤（新增） |
  | 390 | “刷新列表”按钮在视口内：`getBoundingClientRect()` 的 `left >= 0`、`right <= 390` | 必须成立 | DEMO-22 取证步骤（新增） |
  | 1440 | 分配页签按钮区截图（中 / 英，红 / 绿主题） | 目视：按钮在表格之前，位于页签内 | DEMO-22 截图 |
  | 1440 | 原生键盘：用浏览器键盘输入（如 Playwright `keyboard.press`）Tab 到“刷新列表”（待确认时同样），Enter 与空格各触发一次重读 | 必须成立（S7 的行为部分） | DEMO-22 取证步骤（新增） |

- **可行性**（S13 回顾行动 4）：
  - S3 的两页仿照 TLIST-05 的两页桩写法（`nextCursor` 非空的第一页）；
  - S5 / S6 复用既有用例进入待确认与“结果未知”的步骤（`mockApi` 的 `unknownFirst`）；
  - `confirm` 的观测用 `vi.spyOn(window, "confirm")`。同一写法已在 TLIST-03（#288）与 TLIST-05（#301）合并。
  - 设计角色**没有**做试改构建，S10 的字节由开发测量。
