# UI-08 收尾：删除兼容样式、组件提升、设计一致性审查

- 里程碑：UI-1 界面逐步改进　依赖：[页面归属表](README.md#ui-1界面逐步改进)中全部任务（UI-01 … UI-07e）　建议分支：`ui-polish-audit`
- 冲突域：web-ui:shell（仅 `styles.css`），web-ui:components
- 执行：开发实施 + 设计角色审查

## 清理边界

UI-08 **不重做任何页面**。页面改版的责任在各页面任务；UI-08 只清理和审查。

- **前置条件**：页面归属表中每个页面的任务都已合并。若某页被协调者明确列为例外（暂不改版），它仍依赖的 `styles.css` 规则原样移到 `src/pages/<page>.css`，不删除；该页截图须与改前一致。
- **只改 CSS 和测试**：
  - 可改 `src/theme/*`、`src/pages/*.css`、`styles.css`；
  - 不改任何 `.tsx` 的结构、类名、ID 与文案。若发现页面级问题，记入审查报告的待办，交还对应页面任务。
- **删除规则**：
  - `styles.css` 中的选择器，在 `packages/web/src` 中无任何引用时才删除；
  - 仍被引用的，移到所属页面的 CSS；
  - 全局元素规则（如 `button`、`input`）只有在每个页面都已用组件类覆盖后才删除；
  - 删除后各页截图与删除前一致。
- **组件提升**：页面 CSS 中两页以上重复的通用样式，原样提升到 `components.css`；不改视觉。

## 范围

- 按上述边界清理 `styles.css`。最终没有裸色值：`rg "#[0-9a-fA-F]{3,6}" packages/web/src --glob '!theme/tokens.css'` 结果为空。
- 390 宽逐页检查：无横向溢出（表格容器内滚动除外）、控件 44px、导航横向滚动可用。
- 设计角色按 [规范](../ui/README.md) 逐页审查，产出 `design/reviews/UI-1.md`，结论为通过 / 有条件通过 / 不通过，偏差列为待办。

## 验收标准

1. 满足 [UI-1 通用验收标准](README.md#ui-1界面逐步改进)。
2. 全部页面截图一套（中文 + 红、英文 + 绿，宽 1440 与 390），存入 `design/ui/screenshots/final/`；与各页面任务合并时的改后截图一致。
3. 裸色值检查结果为空；`contrast.test.ts` 通过。
4. 入口 chunk 与 CSS 体积不高于 UI-07e 合并后的 main（清理只减不增）。
5. `design/reviews/UI-1.md` 结论为通过或有条件通过。
