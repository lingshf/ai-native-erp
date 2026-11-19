# UI-02a 报表组件 + 往来未结项与账龄页（样板页）

- 里程碑：UI-1 界面逐步改进　依赖：UI-01　建议分支：`ui-report-components`
- 冲突域：web-ui:components, web-ui:trade（仅 `TradeReports.tsx` 与其 labels）
- 设计依据：[design/ui/README.md](../ui/README.md) §4.2、§4.5、§5、§6；原型 [trade-reports.html](../ui/prototypes/trade-reports.html)

## 背景

问题 P1、P7、P8、P9、P10。第一个样板页选只读、交互最少的报表页；本任务**只落这一页实际用到的组件**，表单类组件（Field、FormGrid、FastTab）留给 [UI-02b](UI-02b-form-components-and-accounts.md)。

## 范围

- `src/theme/components.css` 只加本页用到的组件：按钮变体类 `.btn-primary / .btn-secondary / .btn-subtle / .btn-sm`、PageHeader、FilterBar、Segmented、KPI、DataGrid（表头、金额列、合计行）、Badge、MessageBar、EmptyState、TeachingTip。类名与原型 `prototype.css` 一致。
- 薄封装组件（`src/ui/components/`）：`PageHeader`、`TeachingTip`（教学关闭时返回 `null`）、`Badge`、`MessageBar`。不改子元素的 ID、名称和事件。
- `TradeReports.tsx` 按原型改布局：
  - 页头加公司选择；
  - 筛选栏；
  - 视图切换改为 `segmented`，并加 `aria-pressed`，按钮名称不变；
  - KPI；
  - 明细表金额右对齐；
  - 未结项、账龄、GL 核对三个视图共用同一模板；
  - “未结项来源详情”改为卡片。
- 页面样式放 `src/pages/trade-reports.css`。
- **影响范围限定在本页**：
  - 新组件样式只能经类名启用，不写元素选择器，也不改 `styles.css` 里全局 `button` 等元素规则的默认外观；
  - 其他页面截图应与改前一致，只允许 UI-01 外壳带来的差异。
- 不碰 `TradePeriodAdmission.tsx`，它由 [UI-07b](UI-07b-period-close.md) 负责。

## 验收标准

1. 满足 [UI-1 通用验收标准](README.md#ui-1界面逐步改进)。
2. 截图：
   - 未结项、账龄、GL 核对三个视图，改前 / 改后；中文 + 红、英文 + 绿；宽 1440 与 390。与 [原型截图](../ui/screenshots/after/trade-reports.png) 对照。
   - 另附发票页、凭证页各一张改后截图，证明除 UI-01 外壳外无视觉变化。
3. `trade-reports.test.tsx` 新增断言：当前视图按钮 `aria-pressed="true"`，其余为 `false`。原有断言不删改。
4. 教学关闭时报表页不出现 `TeachingTip`；`trpt.boundary`、`trpt.reconcileNote` 等边界说明仍显示。
5. 性能：报表请求、分页参数与次数不变；`TradeReports` 路由 chunk 的 gzip 体积与入口 chunk 的增量记入 PR（见通用验收第 9 条）。
