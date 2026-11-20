# M1-R1b E2E 主路径改用 GUI 建订单

- Sprint：S4　依赖：[M1-R1a](M1-R1a-trade-order-entry-page.md)　建议分支：`trade-order-gui-e2e`
- 冲突域：**tests:trade-e2e**（`packages/infra/test/support/trade-gui-scenario.ts`、`packages/infra/test/http/trade-gui-*.slow.test.ts`）、bench/CI（只在需要调整 Full 分片权重时）
- 原任务：[M1-R1](M1-R1-trade-order-entry.md) 验收 3

## 范围

- `trade-gui-scenario.ts` 中主路径的 `fetch("/api/v1/trade/orders")` 前置步骤（main `2a23025` 约第 845–870 行，注释写着 “Orders currently have an API, not an order-entry GUI”），改为在订单页用键盘录入并保存 PO-DEMO，然后照常在发票页按订单行匹配。
- 只改主路径那一处。夹具 / 冒烟里用 API 建订单的地方（约第 269 行）保持不变。
- 断言只增不减：增加订单保存成功、服务端金额显示的断言。

## 验收标准

1. 四个组合（zh-red、en-green × 两段）的真实 Chrome 场景在 PR head 上通过。证据格式按 [UI-1 通用验收 5](README.md#ui-1界面逐步改进)：head SHA、命令、通过摘要、`ERP_E2E_ARTIFACTS` 截图。
2. 220 次 Tab 上限不放宽；若订单录入使总 Tab 数超限，就改用页面内更短的键盘路径，例如订单页的首字段自动聚焦。不改上限。
3. **Full 分片耗时**：每个浏览器分片 ≤ 25s（D15 / R6b）。
   - PR 中贴出改前 / 改后各分片在 Linux 上的实测时长；
   - 超出时按 R6b 的方法先剖析，再调整分片权重（此时冲突域含 bench/CI，同一时间只开一个改 workflow 的任务）。
4. 合并后跟踪 main Full 直到变绿。
5. 删除上述“Orders currently have an API…”注释，并同步 README 主路径中“订单仅 API”的说法。README 是否改由版本管理在发布 PR 中处理；本任务在 PR 中列出需要改的位置。
