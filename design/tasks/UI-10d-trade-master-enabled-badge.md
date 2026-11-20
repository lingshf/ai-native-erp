# UI-10d 贸易主数据“启用”改为徽标

- Sprint：S4　依赖：[UI-10c](UI-10c-accounts-enabled-badge.md)（沿用同一徽标写法）、[UI-09c](UI-09c-master-css.md)　建议分支：`ui-10d-trade-master-badge`
- 冲突域：web-ui:master、web-ui:trade（`TradeMaster.tsx` 及其 labels、`src/pages/master.css`）。属于贸易线。
- 类型：页面 tsx
- 来源：[UI-1 审查](../reviews/UI-1.md) §6 D-6（UI-04 同理）

## 范围

- 贸易主数据列表（伙伴、商品、过账配置、付款条件、税码）行内只读的启用复选框改为 `Badge`，写法与 UI-10c 相同。
- 编辑表单中可交互的复选框不变。

## 验收标准

1. 满足 [UI-1 通用验收标准](README.md#ui-1界面逐步改进) 1–9。PG-05：入口 JS 不变，CSS 合计不增，路由 chunk ≤ +15%。
2. 截图：至少伙伴、税码两个页签，改前 / 改后。
3. 若已有测试断言行内只读复选框，按 [UI-10c 设计决定 P3](UI-10c-accounts-enabled-badge.md#设计决定-p3产品负责人) 以同等强度替换，并在 PR 中逐条列出；没有这类断言时，新增徽标断言。
4. 真实 Chrome 贸易场景在 PR head 上通过。场景中 `tset.select`、`tset.discount` 是付款页的可交互复选框，不受影响。
