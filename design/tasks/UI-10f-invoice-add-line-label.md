# UI-10f 发票“新增行”快捷键显示

- Sprint：S4　依赖：—（贸易线串行）　建议分支：`ui-10f-invoice-add-line`
- 冲突域：web-ui:trade（`TradeInvoices.tsx`、`trade-labels.ts` 中 `tinv.addLine`、`src/pages/trade-invoices.css`）
- 类型：页面 tsx
- 来源：[UI-1 审查](../reviews/UI-1.md) §8 F11

## 范围

- 按钮的可见文字由“新增行（Alt+Shift+N）”改为“新增行”加一个 `kbd` 徽标 `Alt+Shift+N`，去掉括号。英文同理：“Add line”加 `kbd`。
- 快捷键通过 `aria-keyshortcuts="Alt+Shift+N"` 暴露，徽标设 `aria-hidden="true"`，避免读屏重复朗读。

## 设计决定 P4（产品负责人）

通用验收 5 要求“按钮可访问名称不变”。本按钮是唯一例外：

- 可访问名称由 `t("tinv.addLine")` 的旧值变为新值“新增行” / “Add line”，快捷键信息改由 `aria-keyshortcuts` 提供；
- E2E 与 Web 测试都通过 `t("tinv.addLine")` 定位，所以选择器和断言不需要修改；
- 不得有任何测试改为字面量。

PR 中写明旧值 → 新值。

## 验收标准

1. 满足 [UI-1 通用验收标准](README.md#ui-1界面逐步改进) 1–9（第 5 条中可访问名称一项按 P4 执行）。PG-05：入口 JS 不变，CSS 合计 ≤ +0.1 kB，路由 chunk ≤ +15%。
2. 截图：发票编辑行区，改前 / 改后，中文 + 红、English + 绿，宽 1440 与 390。
3. Web 测试新增：按钮有 `aria-keyshortcuts="Alt+Shift+N"`；快捷键仍能新增行（原测试保留）。
4. 真实 Chrome 贸易场景在 PR head 上通过。
