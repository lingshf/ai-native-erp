# UI-10e 迁移核对页：页头、教学提示、键值明细

- Sprint：S4　依赖：—　建议分支：`ui-10e-migration-details`
- 冲突域：web-ui:migration（`Migration.tsx` 及其 labels、`src/pages/migration.css`）。M2-05/06 不在本 Sprint，无冲突任务。
- 类型：页面 tsx
- 来源：[UI-1 审查](../reviews/UI-1.md) §6 D-3、§8 F9

## 范围

1. **D-3**：改用共享 `PageHeader`，h2 文字不变，`main h2` 契约不变。增加教学提示（`TeachingTip`），例如“核对通过 ≠ 批准切换；切换须用户另行授权”。
   - 教学关闭时提示不渲染；
   - D26 门禁等边界与风险说明照常显示。
2. **F9**：每个核对项先展示**键值表**，即 `dl` 或两列 `table`，列出字段名、旧账值、目标值、差额，有差异的字段高亮（不只靠颜色，另加符号或文字“不符”）。
   - 原始 JSON 保留在**默认折叠**的 `details > summary` 中。
3. **不新增任何 `<button>`**：`migration.test.tsx:60` 和 `migration-gui.slow.test.ts:78` 断言按钮数为 0。现有 `details > summary` 的文字与结构不变（`migration.test.tsx:56` 依赖）。

## 验收标准

1. 满足 [UI-1 通用验收标准](README.md#ui-1界面逐步改进) 1–9。PG-05：入口 JS 不变，CSS 合计 ≤ +0.5 kB，路由 chunk ≤ +15%。
2. 截图：核对通过、期初门禁阻断、存在差额三态，改前 / 改后；中文 + 红、English + 绿；宽 1440 与 390；教学开 / 关。只用虚构夹具，不读取真实旧账、4173 账套或 `.bak` 文件。
3. `migration.test.tsx`、`migration-gui.slow.test.ts` 原断言不删改。新增断言：
   - 键值表存在；
   - 差异字段带非颜色标记；
   - 原始 JSON 默认折叠；
   - 教学提示随开关出现 / 消失。
4. 键值表的数据只来自现有接口响应，不改接口、不在客户端重新计算核对结论。
