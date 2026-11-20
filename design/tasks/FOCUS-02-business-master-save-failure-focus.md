# FOCUS-02 业务事件主数据：保存失败、忙碌结束后焦点晚一帧

- Sprint：S6（[计划](README.md#s6订单列表与保存前预览--s5-遗留收尾建议-v060)；S5 收尾后登记的 backlog，不计入 S5 目标）　依赖：[FOCUS-01](FOCUS-01-journals-events-passive-focus.md)（已合并，[#123](https://github.com/lingshf/ai-native-erp/pull/123)，main `2aaa610`）；与 [UI-11a](UI-11a-business-queue-actions-column.md) 同冲突域，**串行**，先后由协调者定　建议分支：`focus-02-business-master-save-failure`
- 冲突域：web-ui:journals（`BusinessEvents.tsx`、`business-events` 测试）
- 类型：调查 / 页面 tsx / 测试
- 来源：FOCUS-01 #123（head `6204171`）取证时的辅助发现，证据见 #123 描述及其 [gist](https://gist.github.com/lingshf/b3e452eb266e4cd81d19e2c91e559b0c)。#123 未改这一处。

## 观察（#123 报告）

1. FOCUS-01 中的 B3 是业务主数据编辑区的 effect（main `90569f7` 上为 `BusinessEvents.tsx` 中 `lock(editing || busy)` 那个 `useEffect`），依赖 `[editing, busy, lock]`。它同时做两件事：调用 `lock(...)`，以及 `editing` 为真时聚焦表单第一个可用输入框。
2. FOCUS-01 定义的路径（进入新建 / 编辑）没有复现：B3 10/10、B4 5/5 都已在目标上。
3. 辅助路径：服务端保存失败（重复代码，409）、`busy` 回到 `false` 时，这个 effect 会再执行一次；此时真实 Chrome 中观测起点焦点为 `body`，base `045fa59` 上 5/5。
4. 因为这个 effect 与 `lock` 共用，#123 为了不扩大范围没有改。B4（过账规则编辑区，结构相同）没有同等路径的证据。

## 推断（待验证，不是结论）

- 与 #117 / FOCUS-01 机制相同：保存失败的状态更新不是由事件同步提交，被动 effect 推迟到下一个宏任务，在此之前焦点停在 `body`。
- 现在“保存失败后焦点去哪”是 effect 依赖 `busy` 的副作用，而不是明确的设计：每次 `busy` 变化（开始保存、结束保存）都会重新聚焦第一个输入框。

## 范围

1. **先定目标**：保存失败后焦点应落在哪里。默认沿用现在的最终结果（第一个可用输入框），除非取证说明有更合适的目标（例如出错字段），这时先报告设计角色再改。成功保存、取消、进入编辑的最终焦点都不变。
2. 把“聚焦”和 `lock` 拆开：`lock` 的调用时机、参数和清理与改前一致；聚焦按明确的触发条件执行（进入编辑、保存失败），不再因 `busy` 的任何变化触发。可以用布局 effect，参考 #117。
3. B4 用同一路径在真实 Chrome 中取证；复现才改，未复现保持原样并在证据中注明。
4. 不改样式、文案、API 调用和其他页面。

## 验收标准

1. **真实 Chrome 证据是验收依据**：同一条真实交互路径（新建或编辑 → 填重复代码 → 保存 → 409 → 忙碌结束），base 上观测起点焦点为 `body`，head 上已在目标元素，各 5 次。观测方法同 #123（每次先跳转 `about:blank`）。在精确 head 上采集，记录首尾 `git rev-parse HEAD` 与 `git status --porcelain --untracked-files=all`。jsdom 注入只作辅助诊断。
2. `lock` 行为不变：编辑、保存中、保存失败、保存成功、取消各状态下 `lock` 的值与改前相同，有测试覆盖。
3. FOCUS-01 已核对的 B3 / B4 路径（进入新建 / 编辑、成功保存、取消）最终焦点与 base 相同。
4. 现有测试与 E2E 不删除、不削弱（D11）；不加重试，不放宽超时。证据运行保存完整日志，失败的也保存。
5. PG-05：`BusinessEvents` chunk gzip ≤ +0.02 kB，入口 JS 与 CSS 不变。
6. 验证分层同 [FLAKE-02](FLAKE-02-trade-gui-period-option-poll.md)：PR 快速 CI 不跑 slow E2E；合并前以精确 head 的本地真实 Chrome 为证据；合并后看 main Full，每个分片的测试步骤都为 success（[路线图 §5](../roadmap.md#5-团队流程)）。
