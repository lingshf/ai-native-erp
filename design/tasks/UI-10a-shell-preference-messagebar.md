# UI-10a 外壳偏好警告改用 MessageBar

- Sprint：S4　依赖：[UI-09b](UI-09b-shell-brand-css.md)（外壳串行：M1-R1a → UI-09b → UI-10a → UI-09g）　建议分支：`ui-10a-shell-messagebar`
- 冲突域：web-ui:shell（`App.tsx` 外壳部分、`shell.css`、labels `shell.*`）
- 类型：页面 tsx（外壳）
- 来源：[UI-1 审查](../reviews/UI-1.md) §6 D-1

## 范围

- 偏好读取 / 保存失败时的警告由 `section.warning` 改为共享 `MessageBar`（tone `warning`，带左侧 4px 实色条和符号）。
- 文字和出现条件不变。`role` 保持现状（若原为 `alert` / `status`，不改）。
- 删除改动后不再使用的外壳警告样式。

## 验收标准

1. 满足 [UI-1 通用验收标准](README.md#ui-1界面逐步改进) 1–9。PG-05：入口 JS ≤ +0.3 kB，CSS 合计不增，路由 chunk 不变。
2. 截图：偏好存储不可用时（用夹具让 `localStorage` 抛错）的改前 / 改后，中文 + 红与 English + 绿，宽 1440 与 390。
3. 现有偏好相关 Web 测试原断言不删改；新增断言：警告使用 MessageBar 且文字不变。
4. 关闭教学模式时警告仍显示（属于风险信息）。
