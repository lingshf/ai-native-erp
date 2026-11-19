# UI-01 设计 token + 布局外壳

- 里程碑：UI-1 界面逐步改进　依赖：—　建议分支：`ui-tokens-shell`
- 冲突域：web-ui:shell
- 设计依据：[design/ui/README.md](../ui/README.md) §3、§4.1、§7、§8；原型 [overview.html](../ui/prototypes/overview.html)

## 背景

现状问题 P2、P3、P11（[§1](../ui/README.md#1-现状问题main-037b3ce)）：只有一份全局 `styles.css`，颜色写死在 `.workspace` 上；导航是带下划线的链接列；偏好在导航底部；没有内容宽度约束。

## 范围

- 新建 `packages/web/src/theme/tokens.css`（原样复制 `design/ui/tokens.css`）、`base.css`（重置、排版、焦点、`num` 等宽数字）、`shell.css`（顶栏、导航、`main` 边距与最大宽），在 `main.tsx` 中按 tokens → base → shell → styles 顺序引入。
- `styles.css` 中的颜色、字号、间距改为引用 token（视觉可微调），作为兼容层保留，页面任务逐步迁出。
- `App.tsx` 外壳：
  - 顶栏：品牌块 + `h1`；显示偏好 `fieldset` 移到顶栏右侧（`legend` 视觉隐藏），三个控件 ID 与 label 不变，始终可见。
  - 导航：分组样式、当前页指示（`aria-current`）、无下划线；窄屏（≤ 760px）横向滚动。
  - `shell.title` 改为“ERP 工作区 / ERP workspace”，`shell.documentTitle` 同步去掉“架构迁移 / architecture migration”（唯一的文案变更；现无测试断言这两项）。
- 把 `design/ui/check-contrast.mjs` 的检查移植为 `packages/web/test/contrast.test.ts`：读取 `src/theme/tokens.css`，两主题全部配对达标。
- 不改任何页面组件的结构和文案；`Overview`（运行状态页内容）的改版归 [UI-07d](UI-07d-overview.md)，本任务只改其外壳。
- 性能：`App.tsx` 中 12 个 `lazy()` 路由保持不变；外壳不新增运行时依赖。

## 验收标准

1. 满足 [UI-1 通用验收标准](README.md#ui-1界面逐步改进)。
2. 截图：运行状态页和任意两页（建议发票、未结项）改前 / 改后，中文 + 红、英文 + 绿，1440 与 390 宽；外壳与 [原型截图](../ui/screenshots/after/overview.png) 一致（像素级不要求）。
3. `contrast.test.ts` 覆盖 `check-contrast.mjs` 的全部配对，包括控件边界及其交互态；把 `--color-text-muted` 改浅（如 `#9aa3ad`）或把 `--color-border-strong` 改回 `#8a939e` 时，测试都失败。
4. 偏好控件在 1440 和 390 宽下都可见并可 Tab 到达；四个 `trade-gui-*.slow.test.ts` 与 `migration-gui.slow.test.ts` 不改动即在精确 head 上通过（通用验收第 5 条）。
5. `.workspace[data-theme]`、`html[lang]`、`nav a[href]`、`main h2` 契约不变；`App.test.tsx` 不改断言即通过。
