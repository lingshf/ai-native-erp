# UI-02 共享组件 + 往来未结项与账龄页

- 里程碑：UI-1 界面逐步改进　依赖：UI-01　建议分支：`ui-components-reports`
- 冲突域：web-ui:components, web-ui:trade（`TradeReports.tsx`、`TradePeriodAdmission.tsx`）
- 设计依据：[design/ui/README.md](../ui/README.md) §4.2、§4.5、§5、§6；原型 [trade-reports.html](../ui/prototypes/trade-reports.html)

## 背景

问题 P1、P7、P8、P9、P10。先做共享组件，再用信息最集中、交互最少的只读报表页做第一个样板，降低风险。

## 范围

- `src/theme/components.css`：§5 全部组件（按钮四种变体与 `sm`、字段 / FormGrid、FastTab、DataGrid、Badge、KPI、Facts、MessageBar、Segmented、FilterBar、EmptyState、TeachingTip）。类名与原型 `prototype.css` 一致。
- 薄封装组件（`src/ui/components/`）：`PageHeader`、`CommandBar`、`FastTab`（含“有错误时自动展开”）、`TeachingTip`（教学关闭时返回 `null`）、`Badge`、`MessageBar`。不改子元素的 ID、名称和事件。
- `TradeReports.tsx` 按原型改布局：页头 + 公司；筛选栏；视图切换改为 `segmented` 并加 `aria-pressed`（按钮名称不变）；KPI；明细表金额右对齐；GL 核对视图用同一模板；“未结项来源详情”和期间准入（`TradePeriodAdmission.tsx`）用卡片 / FastTab。
- 页面样式放 `src/pages/trade-reports.css`。
- 全局按钮默认样式改为 `secondary`；其他页面的实心主按钮在各自页面任务中再指定（本任务后其他页面暂时都是描边按钮，可接受，视觉回归仅限按钮外观）。

## 验收标准

1. 满足 [UI-1 通用验收标准](README.md#ui-1界面逐步改进)。
2. 截图：未结项、账龄、GL 核对三个视图改前 / 改后（中文 + 红、英文 + 绿，1440 与 390 宽），并与 [原型截图](../ui/screenshots/after/trade-reports.png) 对照。
3. `trade-reports.test.tsx` 增加：当前视图按钮 `aria-pressed="true"`、其余为 `false`。原有断言不删改。
4. 教学关闭时报表页不出现 `TeachingTip`，`trpt.boundary`、`trpt.reconcileNote` 等边界说明仍显示。
5. `FastTab` 单测：内部有 `role="alert"` 时展开且折叠按钮不能把它隐藏。
