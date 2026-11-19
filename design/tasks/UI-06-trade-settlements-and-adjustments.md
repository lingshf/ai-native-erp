# UI-06 付款与收款、预付 / 贷项 / 专用纠错页

- 里程碑：UI-1 界面逐步改进　依赖：UI-03　建议分支：`ui-trade-settlements`
- 冲突域：web-ui:trade（`TradeSettlements.tsx`、`TradeAdjustments.tsx`）
- 设计依据：[design/ui/README.md](../ui/README.md) §4.4；参照 UI-03 已落地的发票页

## 范围

- `TradeSettlements.tsx`、`TradeAdjustments.tsx` 套用单据模板（与发票页一致）：操作栏主次、FastTab 常规 / 核销分配 / 预览、KPI（应付 / 已分配 / 剩余）。
- 核销分配表金额右对齐；付款与收款虚拟化行高 **48** 不变。
- 不可逆的反向 / 纠错确认按钮用 `danger`（描边红）+ 现有确认对话框，文字不变。
- 页面样式放 `src/pages/trade-settlements.css`。

依赖 UI-03 是为了复用发票页定型后的单据布局，避免两页各自试错。

## 验收标准

1. 满足 [UI-1 通用验收标准](README.md#ui-1界面逐步改进)。
2. 截图：付款、收款、预付、贷项、反向各一态，改前 / 改后（中文 + 红、英文 + 绿，1440 与 390 宽）。
3. `trade-settlements.test.tsx`、`trade-adjustments.test.tsx` 原有断言不删改；E2E 付款 / 收款 / 反向键盘路径不改即通过。
