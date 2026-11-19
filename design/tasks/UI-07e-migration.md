# UI-07e 迁移核对页

- 里程碑：UI-1 界面逐步改进　依赖：UI-02a　建议分支：`ui-migration`
- 冲突域：web-ui:migration（`Migration.tsx` 与其 labels，随 #59 进入基线）
- 设计依据：[design/ui/README.md](../ui/README.md) §4.5、§5

## 范围

- `Migration.tsx` 套用只读报表模板：
  - 页头；
  - 核对摘要用 KPI 与 Badge，D26 期初门禁的阻断状态用 MessageBar warning / error；
  - 明细保持现有 `details > summary` 展开结构。
- 该页**没有按钮**，`migration-gui.slow.test.ts` 断言按钮数为 0。本任务不新增任何 `<button>`，不改 `details`、`summary`、`pre` 的结构与文字。
- “待 M2-03b 消除”等门禁说明属于边界与风险信息，教学关闭时仍显示。
- 样式放 `src/pages/migration.css`。
- 与仍改 `web-ui:migration` 的 M2 任务（M2-04 跟进等）串行。

## 验收标准

1. 满足 [UI-1 通用验收标准](README.md#ui-1界面逐步改进)。
2. 截图：核对通过、期初门禁阻断两态，改前 / 改后；中文 + 红、英文 + 绿；宽 1440 与 390。只用虚构夹具，不读取真实旧账、4173 账套或 `.bak` 文件。
3. `migration.test.tsx`、`migration-gui.slow.test.ts` 原有断言不删改。
