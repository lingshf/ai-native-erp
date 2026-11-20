# S5-g 删除 `styles.css` 剩余全局元素规则（D-7 收尾）

- Sprint：S5　依赖：S5-a、S5-b、S5-c、S5-d、S5-e、S5-f 全部合并（外壳串行最后）　建议分支：`s5-g-delete-global-rules`
- 冲突域：web-ui:shell（**只改 `src/styles.css`**）。证据覆盖全部页面，开工时不应有正在进行的页面 CSS 任务；rebase 后 main 上有新的页面 CSS 时，重新采集证据。
- 类型：只改 CSS
- 来源：[UI-1.md §5.2](../reviews/UI-1.md#52-ui-09gstylescss-全局元素规则删除记录)、D-7

## 范围

- 删除 `styles.css` 中剩余的全局元素规则（`button`、`select`、`legend`、`dl` / `dt` / `dd`、`thead`、`tfoot`、`th`、`td`、`caption`、复选框等）。
- 方法、证据格式同 [UI-09g](UI-09g-global-element-rules.md)。如果某个声明删除后计算值仍然变化，说明 S5-a..f 漏了：**原样保留**，在证据表中列出归属冲突域，报告设计角色，不在本任务里改页面 CSS。
- main `66d8e15` 的 `styles.css` 只剩元素选择器（注释外第 8–80 行一带），没有文档级规则。全部删除后文件为空时，删除该文件及其在入口中的 import（同属 web-ui:shell）。
- **44px 基线**：`button, select { min-height: 44px }` 是 v0.4.0 发布说明与 `docs/user/ui-guide.md` 写明的“未被其他样式覆盖的 `button` / `select` 最小高度基线”。只有探针证明所有采集点上这条声明都已被类规则覆盖（计算值不变）才删除；删除后在 PR 描述中写明，并报告版本管理与文档负责方更新这句说法（开发者不改 `docs/`）。

## 验收标准

1. 满足 [S5 共同验收](README.md#s5stylescss-全局元素规则收尾--s4-回顾行动建议-v050) 1、3–5。PG-05：CSS 合计**减少**，入口 JS 与路由 chunk 不变。
2. 全部导航路由（含运行状态页）、两主题、1440 / 390，以及 S5-a..f 补采的状态：计算值“变”为 0，像素差为 0。
3. 证据表写入 PR 描述，脚本与 JSON 输出作为 PR 产物。开发者不改 `design/`；合并后设计角色把摘要追加到 UI-1.md §5，并在发布前确认 D-7 是否可写为“完成”。
