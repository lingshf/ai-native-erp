# UI-12 迁移核对页：390 宽时 `.kv` 表英文词内断行

- Sprint：S6（[计划](README.md#s6订单列表与保存前预览--s5-遗留收尾建议-v060)），低优先级　依赖：—（web-ui:migration 本 Sprint 无其他任务）；UI-11d 开工时本任务不得在进行中　建议分支：`ui-12-migration-kv-narrow`
- 冲突域：web-ui:migration（`src/pages/migration.css`；必要时迁移核对页 `.tsx` 加类名）
- 类型：页面 CSS（必要时 tsx）
- 来源：v0.5.0 Demo [#129](https://github.com/lingshf/ai-native-erp/pull/129) 的产品观察（版本管理报告）：390 宽时 `.kv` 表第二列很窄，英文单词在词内断行，但没有溢出。

## 现状（main `49d936b`，`src/pages/migration.css:197–215`）

- `.migration-page .kv` 为 `table-layout: fixed; width: 100%`；`th, td` 为 `min-width: 0; overflow-wrap: anywhere`（S5-b #112 为让表放进自己的横向滚动区而设）。
- 固定布局下列宽不随内容变化；`overflow-wrap: anywhere` 允许在任意字符处断开，所以窄列中的普通英文单词也会被拆开。**推断**：这是 S5-b 的有意取舍（防溢出），不是回归；尚未核对 S5-b 前后的 390 截图是否相同。

## 范围

1. **先确认**：在 main 上采集迁移核对页 390 / 1440、中 / 英、两主题截图，标出词内断行的单元格；对照 S5-b base `28f9de8` 的同状态截图，写明这是 S5-b 引入还是之前已有（只作记录，不影响是否修）。
2. **修**：在不出现页面横向溢出的前提下，让普通英文词只在词边界断行。候选做法（开发择一并说明理由）：
   - 表头 `th` 与普通文本单元格改为 `overflow-wrap: break-word`（只有单个词比整格还宽时才在词内断开），`td` 中的标识符 / 哈希 / 路径等等宽长串仍允许 `anywhere`；
   - 或给第一列设合理宽度（如 `<colgroup>` / 百分比），把宽度让给第二列；
   - 或 390 宽时把 `.kv` 改为上下排列的键值对。
3. 不改 `styles.css`；不改其他页面。

## 验收标准

1. 390 宽、英文界面下，迁移核对页 `.kv` 表中普通英文词不在词内断行；只有比整格还宽的单个长串（标识符、哈希、路径）允许断开。PR 中列出所有允许断开的单元格类别。
2. 390 与 1440 下页面无横向溢出（`document.documentElement.scrollWidth <= clientWidth`），`.kv` 自身的滚动区行为与 S5-b 一致。
3. 1440 宽、中 / 英、两主题截图与 base 像素差为 0；如因列宽调整而非 0，逐图说明，且只允许 `.kv` 区域内的差异。
4. 满足 [UI-1 通用验收](README.md#ui-1界面逐步改进) 1–9，PG-05 新增 CSS gzip ≤ +0.1 kB；证据按[路线图 §5 UI PR 证据清单](../roadmap.md#5-团队流程)。
