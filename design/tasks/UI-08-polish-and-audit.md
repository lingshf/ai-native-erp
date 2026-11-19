# UI-08 窄屏收尾、删除兼容样式、设计一致性审查

- 里程碑：UI-1 界面逐步改进　依赖：UI-01..UI-07　建议分支：`ui-polish-audit`
- 冲突域：web-ui:shell, web-ui:components
- 执行：开发实施 + 设计角色审查

## 范围

- 删除 `styles.css` 兼容层中已无引用的规则；最终不再有裸色值（`rg "#[0-9a-fA-F]{3,6}" packages/web/src --glob '!theme/tokens.css'` 为空）。
- 页面任务中临时放在页面 CSS 的通用样式，确认后提升到 `components.css`。
- 390 宽逐页检查：无横向溢出（表格容器内滚动除外）、控件 44px、导航横向滚动可用。
- 设计角色按 [规范](../ui/README.md) 逐页审查，产出 `design/reviews/UI-1.md`：通过 / 有条件通过 / 不通过，偏差列为待办。

## 验收标准

1. 满足 [UI-1 通用验收标准](README.md#ui-1界面逐步改进)。
2. 全部页面截图一套（中文 + 红、英文 + 绿，1440 与 390 宽）存入 `design/ui/screenshots/final/`。
3. 裸色值检查为空；`contrast.test.ts` 通过。
4. `design/reviews/UI-1.md` 结论为通过或有条件通过。
