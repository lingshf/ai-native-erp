# UI-02b 表单组件 + 科目表页

- 里程碑：UI-1 界面逐步改进　依赖：UI-02a　建议分支：`ui-form-components`
- 冲突域：web-ui:components, web-ui:master（仅 `Accounts.tsx` 与其 labels）
- 设计依据：[design/ui/README.md](../ui/README.md) §4.3、§5

## 背景

问题 P4、P6：标签与输入行内挤压，表单没有分组。表单组件随第一个消费页一起落地。选科目表页是因为它在 `web-ui:master`，不与贸易线串行，表单也最简单。

## 范围

- `src/theme/components.css` 加 Field / FormGrid、FastTab、`.btn-danger`。
- 薄封装 `FastTab`：
  - 标题栏为 `h3 > button[aria-expanded][aria-controls]`；
  - 内部有 `role="alert"` 时自动展开，且不能折叠。
- `Accounts.tsx` 套用列表页模板：
  - 页头 + 公司；
  - `card` 内 DataGrid，虚拟化行高 44 不变，表头粘顶；
  - 编辑表单放 FastTab（`form-grid`）；
  - 保存为主按钮，取消为轻按钮。
- 页面样式放 `src/pages/accounts.css`。
- 影响范围限定在本页（同 UI-02a）。

## 验收标准

1. 满足 [UI-1 通用验收标准](README.md#ui-1界面逐步改进)。
2. 截图：科目表的列表态与编辑态，改前 / 改后；中文 + 红、英文 + 绿；宽 1440 与 390。
3. 新增 `FastTab` 单测：内部有 `role="alert"` 时展开，折叠按钮不能把它隐藏。
4. `accounts.test.tsx` 原有断言不删改。
