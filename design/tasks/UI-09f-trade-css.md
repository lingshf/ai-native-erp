# UI-09f 发票与付款页样式：桌面 36px、删除重复规则

- Sprint：S4　依赖：[UI-09a](UI-09a-components-css.md)　建议分支：`ui-09f-trade-css`
- 冲突域：web-ui:trade（只改 `src/pages/trade-invoices.css`、`src/pages/trade-settlements.css`）。属于贸易线，与其他 web-ui:trade 任务串行。
- 类型：**只改 CSS**
- 来源：[UI-1 审查](../reviews/UI-1.md) §8 F5（发票、付款与收款部分），§6 D-8（页面副本）

## 范围

1. **F5**：采购 / 销售发票、付款与收款、预付 / 贷项 / 专用纠错页的桌面端控件改为 36px，窄屏 / 粗指针为 44px，同 [UI-09c](UI-09c-master-css.md)。
2. **D-8**：删除两个页面 CSS 中的 `.message-bar p` 副本。

## 验收标准

1. 满足 [UI-1 通用验收标准](README.md#ui-1界面逐步改进) 1–9。PG-05：入口 JS 不变，CSS 合计不增，路由 chunk 不变。
2. 截图：发票编辑、付款与收款、纠错页改前 / 改后；PR 中列出控件高度实测值。
3. 真实 Chrome 贸易场景（`trade-gui-*.slow`）在 PR head 上通过，220 次 Tab 上限不变。
4. 若 [UI-10f](UI-10f-invoice-add-line-label.md) 已合并，本任务截图以其合并后的 main 为“改前”。
