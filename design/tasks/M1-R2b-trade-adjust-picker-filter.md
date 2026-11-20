# M1-R2b 纠错页未结项选择：按伙伴筛选

- Sprint：S4　依赖：[M1-R2a](M1-R2a-trade-teaching-tests.md)（同冲突域串行）　建议分支：`trade-adjust-picker`
- 冲突域：web-ui:trade（`TradeAdjustments.tsx`、`trade-labels.ts` 中 `tadj.*`、`test/trade-adjustments.test.tsx`）
- 原任务：[M1-R2](M1-R2-trade-teaching-and-lists.md) 的列表部分

## 设计决定 P5（产品负责人）：不改为虚拟滚动

原任务要求把未结项选择列表改为虚拟滚动。但现状是：

- 该列表是原生 `<select id="tadj-sourceId">` / `#tadj-targetId`，每页 100 条，带“加载更多”（`TradeAdjustments.tsx` 约第 250、410、694 行）；
- 真实 Chrome 场景按 `#tadj-sourceId option:not([value=""])` 选择（`trade-gui-scenario.ts:1035`），`select` 是契约；
- 原生 `select` 无法虚拟滚动，换成自定义列表会破坏契约和键盘行为。

所以改为**缩小候选范围**：保留原生 `select` 和“加载更多”，在它前面增加可选的“伙伴”筛选。选择后，用现有接口 `GET /api/v1/trade/open-items?company&party=&limit=100&cursor` 的 `party` 参数在服务端筛选（`openItemQuerySchema` 已支持 `party`、`status`）。这样不改后端，选项在 100 条以内即可找到。

## 范围

- 新增“伙伴”筛选，默认“全部”。可以用 `select`（选项来自现有伙伴接口）或带校验的输入框。
- 筛选值变化时重置分页、清空已选的来源 / 目标项，走现有的 `change()` 与离开守卫逻辑。
- 默认“全部”时，请求与 `select` 选项和改前**完全相同**，E2E 不受影响。
- 现有客户端过滤（排除 cancelled、按动作类型过滤种类）不变。
- 选项文字格式不变。

## 验收标准

1. Web 测试：
   - 选择伙伴后，请求带 `party=`，选项只含该伙伴；
   - 切回“全部”后与改前一致；
   - 切换筛选会清空来源 / 目标并重置分页；
   - 中英键一致。
2. 真实 Chrome 贸易场景在 PR head 上不改通过。新增控件加在 Tab 顺序里，总 Tab 数仍不超过 220。
3. 改前 / 改后截图：纠错页，中文 + 红、English + 绿，宽 1440 与 390。
4. PG-05：入口 JS 不变，CSS 合计 ≤ +0.2 kB，路由 chunk ≤ +15%；默认状态下请求次数不变，选择伙伴时每次 +1 次请求。
5. 不改后端，不改 `limit` 上限。
