# UI-07a 总账报表与快照报表

- 里程碑：UI-1 界面逐步改进　依赖：UI-02a　建议分支：`ui-ledger-reports`
- 冲突域：web-ui:ledger（`LedgerReports.tsx`、`Reports.tsx`，含 `ReportIndex`）
- 设计依据：[design/ui/README.md](../ui/README.md) §4.5；参照 UI-02a 已落地的往来报表页

## 范围

- `LedgerReports.tsx`（总账报表、总账明细）套用报表模板：筛选栏、KPI、DataGrid、合计行。
- `Reports.tsx`（试算平衡表等快照报表、`/reports` 报表索引 `ReportIndex`）套用同一报表模板。
- 报表的快照水位、范围等边界说明保持可见，不归入教学提示。
- 页面样式放 `src/pages/ledger.css`。

## 验收标准

1. 满足 [UI-1 通用验收标准](README.md#ui-1界面逐步改进)。
2. 截图：报表索引、总账报表、总账明细、试算平衡表，改前 / 改后；中文 + 红、英文 + 绿；宽 1440 与 390。
3. `ledger-reports.test.tsx`、`reports.test.tsx` 原有断言不删改。
