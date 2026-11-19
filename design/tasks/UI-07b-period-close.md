# UI-07b 期末结账与贸易期间准入

- 里程碑：UI-1 界面逐步改进　依赖：UI-02b　建议分支：`ui-period-close`
- 冲突域：web-ui:period-close（`PeriodClose.tsx`），web-ui:trade（`TradePeriodAdmission.tsx`，由 `PeriodClose` 渲染）
- 设计依据：[design/ui/README.md](../ui/README.md) §4.4、§5

## 范围

- `PeriodClose.tsx`：
  - 期间列表 + 操作栏；
  - 结账为主按钮，重开为 `danger`，沿用现有确认流程与文字；
  - 期间状态用 Badge。
- `TradePeriodAdmission.tsx` 在结账页内改为 FastTab，准入检查结果用 MessageBar 或 Badge；保留现有 `role` 与文字。
- 页面样式放 `src/pages/period-close.css`。
- 因 `TradePeriodAdmission.tsx` 属于 `web-ui:trade`，本任务与贸易线（UI-03、UI-04、UI-06）及 M1-R1、M1-R2、M2-03b 串行。

## 验收标准

1. 满足 [UI-1 通用验收标准](README.md#ui-1界面逐步改进)。
2. 截图：开放期间、已结账期间、准入有阻断项三态，改前 / 改后；中文 + 红、英文 + 绿；宽 1440 与 390。
3. `period-close.test.tsx`、`trade-period-admission.test.tsx` 原有断言不删改。
