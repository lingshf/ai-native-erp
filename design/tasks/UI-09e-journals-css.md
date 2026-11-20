# UI-09e 凭证新建：去掉框中框

- Sprint：S4　依赖：—　建议分支：`ui-09e-journals-css`
- 冲突域：web-ui:journals（只改 `src/pages/journals.css`）
- 类型：**只改 CSS**
- 来源：[UI-1 审查](../reviews/UI-1.md) §8 F7

## 范围

- 凭证新建的 `fieldset`（“凭证草稿”）去掉边框和内边距，`legend` 作为节标题，字号与 FastTab 标题层级一致。内部 FastTab 卡片保持不变。
- `fieldset` 元素本身保留：`disabled` 语义和 legend 提供的分组名都要保留，所以只改样式。

## 验收标准

1. 满足 [UI-1 通用验收标准](README.md#ui-1界面逐步改进) 1–9。PG-05：入口 JS 不变，CSS 合计不增，路由 chunk 不变。
2. 截图：凭证新建改前 / 改后（1440 中文 + 红、390 English + 绿），以及预览中（`fieldset[disabled]`）一态。
3. 分组的可访问名称（legend）不变，`fieldset disabled` 行为不变。
