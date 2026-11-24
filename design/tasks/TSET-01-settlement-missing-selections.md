# TSET-01：付款与收款页提示并移除已不在未结项中的已选项

- Sprint：S23（[计划](S23.md)）　类型：功能（小步打磨）　优先级：P2　决定：[D516](S23.md#s23-期间决定)（列表已全部加载且已选项缺失时提示，只由用户按“移除这些项”移除缺失项，不自动移除，见“设计决定”）　建议分支：`tset-01-missing-selections`
- 来源：[TLIST-06](TLIST-06-settlements-refresh.md)（#316）设计决定 5 明确留下的缺口：“刷新后已选项若不在新数据中，沿用既有的‘待加载’显示，不另加提示”。S22 加了“刷新列表”之后，这种情况在正常使用中就会出现（见“为什么”）。写法照搬 TLIST-06。
- 迁移：**不加**。浏览器时段：**不需要**（中英截图、390 宽与原生键盘由 DEMO-23 的浏览器运行取证，见“证据要求”）。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 为什么（产品负责人）

1. **S22 之后会正常出现**：用户在付款与收款页选了一张发票，又在另一个标签页（或经 AI 助手）把它核销或冲回，回来按“刷新列表”（TLIST-06，[D513](S22.md#s22-期间决定)：刷新不清草稿）。这张发票不再出现在未结项中，但仍留在已选项里。
2. **现在的显示是错的，而且出不去**：
   - KPI 的应付 / 应收与剩余显示“待加载”（`settlement-items.ts:64–72` 用 `NaN`，`settlement-table-parts.tsx:23` 显示 `tset.unloaded`）。列表已经全部加载、没有“加载更多”时，“待加载”是错误的说法；
   - 这一项没有表格行，用户无法取消勾选。唯一的出路是改方向或伙伴（`settlement-general-tab.tsx` 会把 `items` 清空），这会丢掉其他已选项与金额；
   - 点“预览”时服务端按未结项校验，会以错误条拒绝，但不说是哪一项。
3. **改动小**：只在分配页签里多一个提示条和一个按钮，复用既有的 `MessageBar`（`tone="warning"`，已在 `App.tsx:517`、`Reports.tsx:355` 使用）与 `.btn`，不加 CSS，不改契约与服务端。
4. **为什么不选“按开票状态排序”**（S22 候选池中另一项界面打磨）：订单列表用服务端游标分页（`limit=100`），排序要改 API 与契约，不是小步；而且它在 `trade-orders/` 中，与 REFAC-13 冲突。

## 现状（main `eac0c37`）

- `trade-settlements/settlement-allocation-tab.tsx` 共 93 行，`SettlementAllocationTab`（`:20–93`）：
  - `:22` 从 `openItems` 取 `page`、`rows` 等；`:23` `firstSelected`；`:24` `settlementTotals(command.items, rows)`；
  - `:27` `SettlementListToolbar`（“刷新列表”，在 fieldset 之外）；
  - `:28` `<fieldset disabled={locked}>` 包住提示、KPI（`:30–38`）、表格（`:39–79`）与“加载更多”（`:80–89`，仅 `page.hasNextPage`）。
- `settlement-items.ts:64–72` `settlementTotals`：已选项在 `rows` 中找不到时按 `NaN` 计入 `due`（注释 `:65`）。
- `settlement-table-parts.tsx:17–28` `SettlementKpis`：值为 `NaN` 时显示 `t("tset.unloaded")`（`:23`）。
- 标签：`ui/trade-labels.ts:55` `"tset.unloaded": "Not loaded"`，`:298` `"tset.unloaded": "待加载"`。
- 已选项的修改都经 `onChange` → `changeCommand`（`settlement-commands.ts:21–27`）：递增序号，写入草稿，清除预览、回执与错误。
- `use-open-items.ts`：`useInfiniteQuery`，`getNextPageParam` 取 `nextCursor`；`rows` 是已加载各页的合并。
- 测试：`packages/web/test/trade-settlements.test.tsx` 542 行、13 个用例。`:305` 的用例断言未结项尚未返回时 KPI 显示两处“待加载”。TLIST-06 的用例（`:424` 起）已有分页桩 `mockOpenItemPages`（`:386`）、`refreshButton`（`:412`）、`kpis`（`:414`）、`previewPartial`（`:418`）等辅助。
- base 一侧：`git grep -n -e "tset.notOpen" -e "tset.removeMissing" eac0c37 -- packages/web` 无结果，退出码 1（设计角色已核对）。
- e2e：`trade-gui/scenario/part-one.ts:105–128` 的 `settleWithDiscount` 经过本页，不涉及缺失的已选项。

## 设计决定（产品负责人）

1. **何时算“已不在未结项中”**：同时满足：
   - 未结项查询成功（`page.isSuccess`）；
   - 没有下一页（`!page.hasNextPage`），即全部已加载；
   - 某个已选项的 `itemId` 不在 `rows` 中。

   只要还有下一页，或查询尚未成功（加载中、出错），一律沿用“待加载”，不显示提示条。这一判定写成 `settlement-items.ts` 中的一个纯函数（例如 `missingSelections(items, rows, complete)`，返回缺失项的 `itemId` 列表）。
2. **KPI 文案**：满足决定 1 时，KPI 中原来显示“待加载”的值改为显示新标签 `tset.notOpen`（中文“含已不在未结项中的项”，英文 “Includes items no longer open”）。不按 0 推算，不改 `settlementTotals` 的 `NaN` 口径。
3. **提示条**：满足决定 1 时，在 fieldset 内、KPI 之后、表格之前显示一个 `MessageBar tone="warning" role="status"`：
   - 文字 `tset.missingNotice`（中文“已选项中有 N 项已不在未结项中，可能已在别处核销或冲回。预览前请移除。”，英文 “N selected items are no longer open; they may have been settled or reversed elsewhere. Remove them before previewing.”）。N 用数字插在标签文字之前或之后由开发定，中英文都须读得通；标签文件里没有插值约定，可以拆成两个键，或文字与 `<strong>{N}</strong>` 相邻渲染；
   - 一个原生按钮 `<button type="button" className="btn btn-secondary">`，文案 `tset.removeMissing`（中文“移除这些项”，英文 “Remove these items”）。
4. **按钮只移除缺失项**：调用 `onChange({ ...command, items: command.items.filter(…) })`，只去掉决定 1 列出的项；其余已选项、金额与折扣保持不变。经 `changeCommand`，预览、回执与错误按既有规则清除。移除后焦点移到同一页签的“刷新列表”按钮（提示条已消失，焦点不能落在 `body`）。
5. **待确认时不可移除**：提示条在 fieldset 内，存在待确认信封（`locked`）时按钮随 fieldset 禁用，提示条照常显示。不弹确认框。
6. **不自动移除**：刷新、加载或重新挂载都不自动改动已选项，与 D513（刷新不清草稿）一致。只有用户按按钮才移除。
7. **组件**：提示条由 `trade-settlements/` 下一个新的模块级组件实现（例如 `settlement-missing-notice.tsx`，≤ 40 行，不调用 Hook，通过属性接收缺失数量与 `onRemove`）。`SettlementAllocationTab` 只多调用一次纯函数，并多渲染这一个组件。`SettlementKpis` 可以加一个属性，指定 `NaN` 时显示哪个标签键。
8. **不加教学文案**：教学模式开关不影响本任务；`trade-settlement-teaching.ts` 不改。
9. **不改**：契约与服务端；`use-open-items.ts` 的查询键、`limit`、虚拟化参数；`settlement-commands.ts`；`SettlementListToolbar`；CSS；`App.tsx`；`scripts/test-shard-weights.json`；`docs/`（用户文档由 DEMO-23 补）。

## 冲突域

- web-ui:trade-settlements：`trade-settlements/settlement-allocation-tab.tsx`、`settlement-items.ts`、`settlement-table-parts.tsx`、新文件 `settlement-missing-notice.tsx`；`ui/trade-labels.ts`（只加 3 个 `tset.*` 键，中英各一处）；`packages/web/test/trade-settlements.test.tsx`。
- 受影响的 e2e 断言（S13 回顾行动 1）：**必须继续成立**：`settleWithDiscount`（`part-one.ts:105–128`）；**须随本任务改**：无。
- `ui/trade-labels.ts` 也是订单页之外的贸易页标签文件；S23 的 REFAC-13 不改任何标签文件，SLOT-06 不涉及 Web，不相交。

## 验收

### base 失败、head 通过

新增用例写在 `trade-settlements.test.tsx` 的新 `describe("TSET-01 …")` 中，复用 TLIST-06 的分页桩与辅助。每条在 base `eac0c37` 上失败、在 head 上通过；PR 正文附两侧未截断输出。

| 编号 | 场景 | head 要求 |
| --- | --- | --- |
| M1 | 选中同一伙伴的两项（例如 `item` 与一个 `filler`）并改金额；桩改为下一次只返回其中一项且没有下一页；按“刷新列表” | 出现一个 `role="status"` 的警告提示条，数量为 1，含“移除这些项”按钮；KPI 显示 `tset.notOpen`，不再出现 `tset.unloaded` |
| M2 | 接 M1，按“移除这些项” | 草稿只剩仍在未结项中的一项，金额不变；`sessionStorage` 草稿同步；提示条消失；KPI 显示数字；预览被清除；`document.activeElement` 是“刷新列表”按钮 |
| M3 | 同 M1，语言为英文 | 提示条与按钮显示英文标签，KPI 显示 “Includes items no longer open” |
| M4 | 存在待确认信封（`locked`）时出现缺失项 | 提示条显示，按钮 `:disabled`；按 Enter 或点击都不改草稿 |
| M5 | 接 M2，按“预览” | 预览请求体的 `items` 只含剩余的一项（与移除前相比少了缺失项，其余字段不变） |

### 两侧都须成立的不变量

- **N1**：还有下一页时（`mockOpenItemPages` 两页，只加载第一页），缺失的已选项仍显示“待加载”，不显示提示条与按钮。
- **N2**：未结项查询尚未返回或失败时，不显示提示条（`:305` 的既有用例继续成立）。
- **N3**：没有缺失项时不显示提示条，KPI 与 base 相同。
- **N4**：既有 13 个用例原样通过（`trade-settlements.test.tsx` 只追加，不改既有用例）；Web 全部 jsdom 测试通过。
- **N5**：`settleWithDiscount` 在覆盖合并提交的 main Full 浏览器分片中通过。
- **N6 范围**：`git diff --name-only` 只含“冲突域”所列文件；不加迁移。
- **N7 打包字节**：首屏 ±0（`--d454`）；付款与收款路由（manifest 键 `src/TradeSettlements.tsx`）的路由新增与入口 chunk 各 ≤ **+400 B**：`--route src/TradeSettlements.tsx=+400 --chunk src/TradeSettlements.tsx=+400 --d454`。`ui/trade-labels.ts` 所在的 chunk（按 `bundle-measure.mjs` 输出确定）≤ +400 B；其他 ±0；CSS 不变。超出先停下报设计角色与协调者。口径见 [S23 共同验收“L10 / 体积口径”](S23.md#l10--体积口径)。
- **N8 质量门**：`typecheck`、`lint`、CI-02 预检通过；PR CI 绿。

## 性能考虑

- `missingSelections` 对每个已选项在 `rows` 中查找，与 `settlementTotals` 同一量级（单次最多选择 100 项，`rows` 按页加载）；不加 `memo`。不跑 Bench。不改查询与请求次数。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥：

- **②**：`SettlementAllocationTab` 净增 ≤ +6 行且仍 ≤ 80 行（按 `fnlen.cjs` 口径）；新组件 ≤ 40 行；`missingSelections` ≤ 15 行；嵌套 ≤ 3 层。
- **③**：涉及的文件都远低于 800 行；`settlement-allocation-tab.tsx` 净增 ≤ +6 行；测试净增 ≤ +150 行。PR 正文贴 `git diff --numstat`。
- **①**：名称表达语义，例如 `missingSelections`、`SettlementMissingNotice`、`onRemoveMissing`；不用 `flag2`、`list2`。
- **④**：判定是纯函数，放在 `settlement-items.ts`，与 `settlementTotals` 同处；组件只渲染。
- **⑤**：不引入新的数字字面量；测试中的页大小、数量沿用 TLIST-06 的具名常量。
- **⑥**：在纯函数上写一行“为什么”（全部加载后才能断定缺失；未加载完仍是“待加载”）。不留调试输出。
- **测试在满载下的耗时**（[TEMPLATE](TEMPLATE.md#证据要求)）：新用例复用 `mockOpenItemPages`，不为每个用例重建大桩；PR 正文附 `trade-settlements.test.tsx` 在 base 与 head 上的耗时（vitest 汇总行原文）；单个用例 > 2 s 写明原因；不加 `timeout` 或重试。

## 用户可见变化

- **有**。付款与收款页的分配页签中，当某个已选项已不在未结项中（列表全部加载之后）：
  - KPI 不再显示“待加载”，改为“含已不在未结项中的项”（英文 “Includes items no longer open”）；
  - 表格上方出现一条黄色警告提示，说明有几项已不在未结项中，并提供“移除这些项”（“Remove these items”）按钮；
  - 按下后只移除这些项，其他已选项与金额保留，焦点回到“刷新列表”。
- 列表还没有全部加载、或没有缺失项时，页面与 S22 相同。
- 红 / 绿主题沿用 `MessageBar` 的 warning 配色（已有对比度用例覆盖，不改 `tests:contrast`）；按钮是原生按钮，可用 Tab 到达，Enter / Space 触发；教学模式开关不影响。

## 证据要求

- 不需要浏览器时段：行为由 M1–M5 与 N1–N4 的 jsdom 用例证明。构建与测试在本机运行，须服从协调者的时段静默通知（D442 / D480）。
- **DEMO-23 取证**（本任务在冻结的 RC 范围内时，由版本管理在 Demo 中执行）：中英各一张分配页签截图（红 / 绿主题，1440），展示提示条与按钮；390 宽一张；原生键盘：Tab 到“移除这些项”，按 Enter，记录移除后焦点所在元素。
- **可行性**（S13 回顾行动 4）：TLIST-06 的用例已能让桩在刷新后返回不同的数据（S4 `:477` 让已选项余额变小），M1 只需让桩少返回一项；`locked` 场景可沿用 `:491`（S5）的待确认信封设置。设计角色**没有**做试改构建，N7 的上限按“一个提示条加一个按钮加三个标签键”估定（TLIST-06 一个按钮的上限为 +200 B）。
- PR 正文附：M1–M5 两侧未截断输出；N1–N4 的测试输出；N7 的 `bundle-measure.mjs` 完整输出与退出码；“可读性”与“用户可见变化”两节。
