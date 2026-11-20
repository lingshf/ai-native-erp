# UI-09a 组件样式：禁用 subtle、segmented 选中态、窄表滚动提示、MessageBar 段落

- Sprint：S4（UI-1 后续 + M1 遗留）　依赖：—　建议分支：`ui-09a-components-css`
- 冲突域：web-ui:components（只改 `src/theme/components.css`）、tests:contrast（`contrast.test.ts` 中新增配对；之后 UI-09d、UI-10c 依次修改此文件）
- 类型：**只改 CSS**，不改 `.tsx`、labels
- 来源：[UI-1 审查](../reviews/UI-1.md) §8 F3、F10、F2（组件部分），§6 D-8（全局规则部分）

## 范围

1. **F3**：`.btn-subtle:disabled` 保持无框、无底色，只降低文字对比度，与可用态外形一致。使用现有禁用态 token，不新增裸色值。
2. **F10**：segmented 选中态由实心主色改为浅主色底（`--color-primary-subtle` 或等价 token）加主色文字，再加一个非颜色提示（如加粗或 2px 内边框）。同屏只保留“应用筛选”一个实心主按钮。
3. **F2（组件部分）**：给共享滚动容器 `.journal-scroll` 加横向滚动提示。用纯 CSS 的滚动阴影，例如 `background-attachment: local, scroll` 两层渐变：右侧有未显示的内容时出现右缘渐隐，滚到底后消失。
   - 不改 DOM，不加 JS，不改行高 44 / 48。
   - `.acct-scroll`（科目表）属于 `web-ui:master`，在 [UI-09c](UI-09c-master-css.md) 做。
4. **D-8（全局部分）**：在 `components.css` 增加 `.message-bar p { margin: 0 }`。
   - 5 个页面 CSS 中的重复副本**本任务不删**，分别在 UI-09c、UI-09d、UI-09f 中删除。
   - 已有副本的页面像素差应为 0。

## 验收标准

1. 满足 [UI-1 通用验收标准](README.md#ui-1界面逐步改进) 1–9，PG-05 度量口径见 [README S4“通用验收”](README.md#s4ui-1-后续--m1-遗留建议-v040)。预算：入口 JS 不变，CSS 合计 ≤ +0.3 kB（gzip），路由 chunk 不变。
2. **改前 / 改后截图**：
   - F3：科目表内置科目“编辑”、发票“删除行”、凭证“删除行”的禁用态；
   - F10：往来报表 390 两主题；
   - F2：科目表以外使用 `.journal-scroll` 的表格（凭证列表、业务事件）在 390 下的滚动起点与滚动到底两态；
   - D-8：列出所有含 `.message-bar p` 的页面。已有副本的页面像素差为 0；其他页面的差异只出现在 MessageBar 段落外边距，并在 PR 中逐页注明。
3. **对比度**：`contrast.test.ts` 新增以下配对，并确认两主题都达标：
   - segmented 选中态的文字与浅主色底 ≥ 4.5:1；
   - 选中态边界与相邻底色 ≥ 3:1；
   - F3 禁用态文字使用现有 `--color-text-disabled` token，不新增颜色（禁用态按 [design/ui/README.md](../ui/README.md) §3 豁免对比度要求，但需与可用态的 subtle 文字明显可分）。
4. 键盘：F10 的选中态与焦点框同时可见、能区分。

## 不做

- 不改 `.acct-scroll`、各页 CSS、`styles.css`。
- 不调整 segmented 的交互与 `aria-pressed` / `role`。
