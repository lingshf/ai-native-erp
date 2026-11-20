# UI-10d 贸易主数据“启用”改为徽标

- Sprint：S4　依赖：[UI-10c](UI-10c-accounts-enabled-badge.md)（沿用同一徽标写法）、[UI-09c](UI-09c-master-css.md)　建议分支：`ui-10d-trade-master-badge`
- 冲突域：web-ui:master、web-ui:trade（`TradeMaster.tsx` 及其 labels、`src/pages/master.css`）。属于贸易线。
- 类型：页面 tsx
- 来源：[UI-1 审查](../reviews/UI-1.md) §6 D-6（UI-04 同理）

## 范围

- 贸易主数据列表（伙伴、商品、过账配置、付款条件、税码）行内只读的启用复选框改为 `Badge`，写法与 UI-10c 相同。
- 编辑表单中可交互的复选框不变。

## 验收标准

1. 满足 [UI-1 通用验收标准](README.md#ui-1界面逐步改进) 1–9。PG-05：入口 JS 不变，CSS 合计不增，路由 chunk ≤ +15%。
2. 截图：至少伙伴、税码两个页签，改前 / 改后。
3. **不替换已有断言**：main `2a23025` 上没有测试断言贸易主数据行内的只读复选框（`packages/web/test`、`packages/infra/test` 中的 `checkbox` 查询只涉及科目表、教学开关、外壳偏好和付款页 `tset.select` / `tset.discount`）。所以本任务只**新增**徽标断言：每个页签至少一个启用项、一个停用项（没有停用夹具时新增夹具）。P3 的唯一例外仍只属于 UI-10c；若实施时发现这类断言，停下报告设计角色，不自行替换。
4. 真实 Chrome 贸易场景在 PR head 上通过。场景中 `tset.select`、`tset.discount` 是付款页的可交互复选框，不受影响。
