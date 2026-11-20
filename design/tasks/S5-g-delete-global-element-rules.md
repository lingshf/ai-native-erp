# S5-g 删除 `styles.css` 剩余全局元素规则（D-7 收尾）

- Sprint：S5　依赖：S5-a、S5-b、S5-c、S5-d、S5-e、S5-f、S5-i 全部合并（外壳串行最后）　建议分支：`s5-g-delete-global-rules`
- 冲突域：web-ui:shell（**只改 `src/styles.css`，以及 `src/main.tsx:5` 的 `import "./styles.css";` 这一行**）。证据覆盖全部页面，开工时不应有正在进行的页面 CSS 任务；rebase 后 main 上有新的页面 CSS 时，重新采集证据。
- 类型：CSS，外加入口 import 一行。允许的 `.tsx` 改动**只有**：文件清空时删除 `src/main.tsx:5` 的 import。只改 CSS 的“JS 逻辑不变”证明相应改为：`git diff <base>..HEAD -- '*.ts' '*.tsx'` 只含测试文件与这一行删除
- 来源：[UI-1.md §5.2](../reviews/UI-1.md#52-ui-09gstylescss-全局元素规则删除记录)、D-7

## 范围

- 删除 `styles.css` 中剩余的全局元素规则（`button`、`select`、`legend`、`dl` / `dt` / `dd`、`thead`、`tfoot`、`th`、`td`、`caption`、复选框等）。
- 方法、证据格式同 [UI-09g](UI-09g-global-element-rules.md)。如果某个声明删除后计算值仍然变化，说明 S5-a..f、S5-i 漏了：**原样保留**，在证据表中列出归属冲突域，报告设计角色，不在本任务里改页面 CSS。
- main `66d8e15` 的 `styles.css` 只剩元素选择器（注释外第 8–80 行一带），没有文档级规则。全部删除后文件为空时，删除该文件，并删除 `src/main.tsx:5` 的 `import "./styles.css";`（同属 web-ui:shell，是本任务唯一允许的入口改动）。若仍有保留的声明，文件与 import 都保留。
- **44px 基线**：`button, select { min-height: 44px }` 是 v0.4.0 发布说明与 `docs/user/ui-guide.md` 写明的“未被其他样式覆盖的 `button` / `select` 最小高度基线”。删除须通过两道检查（同 UI-09g）：
  1. **探针**：所有采集点上计算值“变”为 0；
  2. **未采集状态的源码检查**：对截图和探针采不到的状态（BusinessEvents 的编辑、清账 / 预览对话框，禁用、hover / active，错误与空状态等），逐个列出全部 `<button>` 与 `<select>` 的用法（`git grep -n "<button\|<select" -- packages/web/src`），每处写明提供 `min-height` 的类规则。
  任一处没有类规则覆盖，这条声明就**保留**，交回对应泳道（S5-a..f 的冲突域）补齐，本任务不宣布 D-7 完成。删除后在 PR 描述中写明，并报告版本管理与文档负责方更新这句说法（开发者不改 `docs/`）。

## 验收标准

1. 满足 [S5 共同验收](README.md#s5stylescss-全局元素规则收尾--s4-回顾行动建议-v050) 1、3–5。PG-05：CSS 合计**减少**，入口 JS 与路由 chunk 不变。
2. 全部导航路由（含运行状态页）、两主题、1440 / 390，以及 S5-a..f 补采的状态：计算值“变”为 0，像素差为 0。
3. **第二道检查**：PR 描述附未采集状态的源码检查表（元素、文件:行、覆盖它的类规则）。每条被删的全局声明都要有这张表，不只 44px 基线；有遗漏的声明保留并交回对应泳道。D-7 只有在全部全局元素规则都删除后才算完成，否则写“部分完成”及剩余项。
4. 证据表写入 PR 描述，脚本与 JSON 输出作为 PR 产物。开发者不改 `design/`；合并后设计角色把摘要追加到 UI-1.md §5，并在发布前确认 D-7 是否可写为“完成”。
