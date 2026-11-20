# UI-10g 期间准入保存提示措辞

- Sprint：S4　依赖：—（贸易线串行）　建议分支：`ui-10g-admission-saved`
- 冲突域：web-ui:trade（只改 `src/ui/trade-report-labels.ts` 中的 `trpt.saved`）。提示由 `PeriodClose.tsx:195` 渲染，但本任务不改 `.tsx`。
- 类型：labels（文案）
- 来源：[v0.3.0 Sprint 评审](../../docs/release/v0.3.0-sprint-review.md)“遗留”

## 范围

- `trpt.saved` 由“原操作已成功；请以当前期间状态为准。”改为“贸易期间准入已保存。”，英文由 “The original operation succeeded; refer to the current period state.” 改为 “Trade period admission saved.”。
- 若评审认为需要说明“列表已按最新状态刷新”，可以加一句，但不出现“原操作”。
- 不改出现条件、`role="status"` 和 tone。

## 验收标准

1. 满足 [UI-1 通用验收标准](README.md#ui-1界面逐步改进) 1–9，PG-05 度量口径见 [README S4“通用验收”](README.md#s4ui-1-后续--m1-遗留建议-v040)。labels 打包在入口 JS 中，所以本任务一定会改入口 JS：
   - 入口 JS（gzip）≤ +0.1 kB。新文案比旧文案短，预期会减少；
   - CSS 合计、各路由 chunk 不变（差 ≤ 0.02 kB）；
   - `git diff` 只改 `trade-report-labels.ts` 中 `trpt.saved` 的两个值，不改逻辑；请求次数不变。
2. 截图：期末结账页保存准入后的提示，改前 / 改后，中文 + 红、English + 绿。
3. `trade-period-admission.test.tsx:127,151` 和 `trade-gui-scenario.ts:807` 都通过 `t("trpt.saved")` 定位，不需要修改。PR 中写明旧文案 → 新文案。
