# UI-07 总账报表、快照报表、期末结账、AI 面板、运行状态

- 里程碑：UI-1 界面逐步改进　依赖：UI-02　建议分支：`ui-ledger-reports`
- 冲突域：web-ui:ledger
- 设计依据：[design/ui/README.md](../ui/README.md) §4.5、§9；原型 [overview.html](../ui/prototypes/overview.html)

## 范围

- `LedgerReports.tsx`、`Reports.tsx`（试算平衡表等快照报表）：报表模板（筛选栏、KPI、DataGrid、合计行）。
- `PeriodClose.tsx`：期间列表 + 操作栏（结账为主按钮、重开为 `danger`），状态用 Badge。
- `AiPanel.tsx`：候选结果卡片，“仅候选、需人工确认”的边界说明保持可见（不归入教学提示）。
- 运行状态页：状态卡片 + Badge；“常用入口”卡片**可选**，只能链接到已有导航目标，不新增功能。
- 页面样式放 `src/pages/ledger.css`。

## 验收标准

1. 满足 [UI-1 通用验收标准](README.md#ui-1界面逐步改进)。
2. 截图：总账报表、总账明细、试算平衡表、期末结账、AI 面板、运行状态，改前 / 改后（中文 + 红、英文 + 绿，1440 与 390 宽）。
3. `ledger-reports.test.tsx`、`reports.test.tsx`、`period-close.test.tsx`、`App.test.tsx` 原有断言不删改。
