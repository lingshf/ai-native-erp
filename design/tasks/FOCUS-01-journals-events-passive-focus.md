# FOCUS-01 凭证 / 业务事件：在被动 effect 中设置焦点，可能晚一帧（排队，原因待证实）

- Sprint：S5（排队，不计入 S5 目标）　依赖：**S5-a 合并后才开工**（冲突域相同，不能并行）；S5-h [#117](https://github.com/lingshf/ai-native-erp/pull/117) 合并后作为参考模式　建议分支：`focus-01-journals-events-layout-focus`
- 冲突域：web-ui:journals（`Journals.tsx`、`BusinessEvents.tsx`、`journals.test.tsx`、`business-events.test.tsx`）
- 类型：调查 / 页面 tsx / 测试
- 来源：S5-h #117 作者报告（head `e5557ef`）。#117 证实：在 TradeOrders 里，被动 effect 被推迟到下一个 Scheduler 宏任务，jsdom 中停顿 ≥ 1 ms 即可稳定复现断言失败；真实 Chrome 中焦点晚 3.6–28.3 ms 才到位。改为 `useLayoutEffect` 后，两种问题都消失。

## 观察（main `8b16578`）

以下各处都在 `useEffect` 中调用 `focus()`，#117 没有改动。共 7 处：`BusinessEvents.tsx:271–276` 是设计角色核对时补充的同类位置，其余 6 处是 #117 作者报告的：

| 位置 | 作用 | 同一 effect 中的其他工作 |
|---|---|---|
| `BusinessEvents.tsx:271–276` | 复核 / 撤回 / 忙碌结束后归还焦点（`returnFocus`） | 无 |
| `BusinessEvents.tsx:911–913` | 表单挂载后聚焦第一个输入框 | 无 |
| `BusinessEvents.tsx:1280–1284` | 进入编辑时聚焦第一个可用输入框 | `lock(editing \|\| busy)` 及其清理 |
| `BusinessEvents.tsx:1445–1449` | 同上（另一个编辑器） | 同上 |
| `Journals.tsx:226–233` | 新增分录行后聚焦该行的科目输入框 | 无 |
| `Journals.tsx:234–240` | 忙碌 / 预览 / 删除结束后归还焦点（仅当 `activeElement === body`） | 无 |
| `Journals.tsx:241–243` | 打开草稿后聚焦第一个输入框 | 无 |

- 现有测试对这些焦点的断言都包在 `waitFor` 里（例如 `journals.test.tsx:398、400、613、630、643`），目前没有见到偶发失败的记录。
- 因此，这里的问题主要是**真实 Chrome 中焦点可能比界面晚一帧**（读屏用户和键盘用户会先落在 `body` 上），而不是已有的测试失败。

## 推断（待验证）

- 与 #117 机制相同：DefaultLane 更新在 Scheduler 任务中提交，被动 effect 被推迟到下一个宏任务，在此之前焦点停在 `body` 或原处。
- 由事件直接触发的同步更新（SyncLane）会在事件结束前刷新被动 effect，可能不受影响。所以每一处都要按实际触发路径单独确认，不能一概而论。
- 两处“归还焦点”（`Journals.tsx:234–240`、`BusinessEvents.tsx:271–276`）在结束状态提交后执行。`Journals.tsx:234–240` 还依赖“`activeElement === body`”这一判断。改到布局阶段后，被卸载元素的焦点可能还没回落到 `body`，判断结果可能不同。这一处需要单独证明行为不变，否则不改。

## 范围

1. **先逐处复现，再修复**。方法同 #117，草稿实验文件不进入 PR：
   - **jsdom**：在提交后注入可控停顿（例如忙等 3 ms），用同步断言（不包 `waitFor`）检查焦点；
   - **真实 Chrome**：在 DOM 插入的那个微任务里，以及第 0 帧记录 `document.activeElement`。
2. 只修复已复现的位置：把焦点调用移到 `useLayoutEffect`，每处加一行注释说明原因。
   - 与 `lock` 同在一个 effect 的位置，只移出 `focus()`，`lock` 及其清理保持在原 effect 中；
   - 要先确认布局阶段目标元素可聚焦，即不在禁用的 fieldset 内、不是 `disabled`。
3. 未复现的位置不改，在 PR 中写明“未复现”和所做的尝试。

## 验收标准

1. **D11**：不删除、不削弱断言，不放宽超时，不加重试。可以把已修复位置的 `waitFor` 断言收紧为同步断言，但不要求这样做。
2. PR 描述对每一处分别写“观察 / 推断 / 归因”。只有复现过、并证明修复后消失，才能写“已修复”。
3. 每个已修复位置都附证据：
   - jsdom 停顿实验在 base 上失败、在 head 上 20/20 通过；
   - 真实 Chrome 中，head 上的第 0 帧 `document.activeElement` 已是目标元素（截图或日志）。
4. 两处“归还焦点”若被修改，须证明每条结束路径的焦点归还结果与 base 相同：`Journals.tsx:234–240` 的忙碌、预览、删除，`BusinessEvents.tsx:271–276` 的复核、撤回、忙碌。否则不改该处。
5. **验证分层**同 [FLAKE-02](FLAKE-02-trade-gui-period-option-poll.md) 验收 3：合并前是 PR 精确 head 上本地的 jsdom 与真实 Chrome 证据（PR 的 `verify` 不跑 slow E2E）；合并后是覆盖该提交的 main Full。
6. 页面 chunk 的 gzip 不变（≤ 0.02 kB）。不改样式、文案和交互。
