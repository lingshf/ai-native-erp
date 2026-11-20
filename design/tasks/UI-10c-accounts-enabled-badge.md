# UI-10c 科目表“启用”改为徽标

- Sprint：S4　依赖：[UI-09c](UI-09c-master-css.md)（同冲突域串行）、[UI-09d](UI-09d-ledger-period-close-css.md)（共用 `contrast.test.ts`）　建议分支：`ui-10c-accounts-badge`
- 冲突域：web-ui:master（`Accounts.tsx`、科目 labels、`src/pages/accounts.css`）、tests:contrast（UI-09d 之后修改 `contrast.test.ts`）
- 类型：页面 tsx
- 来源：[UI-1 审查](../reviews/UI-1.md) §6 D-6（科目表部分）

## 范围

- 科目表行内只读的禁用复选框（18px，不可交互）改为 `Badge`：“✓ 启用 / Active”或“停用 / Inactive”。tone 用中性或成功色，不只靠颜色区分。
- 编辑表单中**可交互**的启用复选框不变。

## 设计决定 P3（产品负责人）

原测试 `accounts.test.tsx:100` 用 `getByRole("checkbox", { name: "Active 1500" }).checked` 断言只读状态。改为徽标后，这条断言要换成**同等强度**的新断言：

- 按行定位科目 1500，断言其徽标文字为启用；
- 再选一个停用科目，断言其徽标为停用；
- 两个科目各断言一次，不放宽。

这是本 Sprint 唯一允许替换的已有断言，评审逐行核对。

## 验收标准

1. 满足 [UI-1 通用验收标准](README.md#ui-1界面逐步改进) 1–9。PG-05：入口 JS 不变，CSS 合计 ≤ +0.2 kB，路由 chunk ≤ +15%。
2. 截图：含启用与停用科目的列表，改前 / 改后，两组语言与主题，宽 1440 与 390。
3. **键盘**：禁用复选框本来就不在 Tab 序列中，所以 Tab 序列应与改前**逐项相同**，不会“少一项”。徽标不可聚焦：不加 `tabindex`，不是按钮或链接。Web 测试新增断言：徽标元素没有 `tabindex`，并且 `document.activeElement` 在科目表中 Tab 遍历时从未落在徽标上。
4. **对比度**：徽标文字与底色 ≥ 4.5:1。若使用现有 `Badge` tone，引用其已有的配对检查即可；若新增 tone，把新配对加入 `contrast.test.ts`（排在 UI-09d 之后修改）。
