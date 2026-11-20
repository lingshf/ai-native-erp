# FLAKE-03 贸易 GUI E2E：`navigate()` 等待目标页就绪

- Sprint：S6（[计划](README.md#s6订单列表与保存前预览--s5-遗留收尾建议-v060)）　依赖：[FLAKE-02](FLAKE-02-trade-gui-period-option-poll.md)（已合并，[#121](https://github.com/lingshf/ai-native-erp/pull/121)）；需要真实 Chrome 时段　建议分支：`flake-03-navigate-ready`
- 冲突域：tests:e2e（`packages/infra/test/support/trade-gui-scenario.ts`；如需同步 `migration-gui.slow.test.ts` 的同类等待，同属此域）
- 类型：测试
- 来源：FLAKE-02 #121 的诊断（`ERP_E2E_DIAG=1`，5 次运行）**证实**：`navigate()` 等到的 `main h2` 可能仍是旧页标题（“Runtime status”），返回时期末页尚未渲染。见 [S5 回顾议题 3](../reviews/S5.md#议题-3flake-02-两项故障原因仍未知)。

## 范围

- 把 `navigate()` 的就绪条件改为**目标页自己的**标志：目标路由对应的页标题文本（按当前语言取 labels），或页面根元素上的标志（例如页面根类）。只改等待条件，不改等待上限。
- 不加重试、不放宽任何超时、不改断言（D11）。新条件比原条件严格：原来能通过的路径，现在必须等到目标页才通过。
- 诊断（`ERP_E2E_DIAG=1`）保持默认关闭；默认路径除就绪条件外逐表达式不变（D126）。

## 不在范围

- 不宣称修复 FLAKE-02 的 option 空列表或 afterAll 超时。两项仍记为“原因未知”。PR 描述只能写“消除已证实的提前返回”。
- 不改 teardown。

## 验收标准

1. 单元级证据：用 jsdom 或最小页面替身构造“hash 已变、旧标题仍在”的状态，旧条件返回、新条件不返回，直到目标标题出现。这条测试只作辅助，不替代真实 Chrome。
2. 真实 Chrome：在精确 head 上跑一次完整 `trade-gui-*` 与 `migration-gui.slow`（文件数 / 用例数写全），按[路线图 §5 UI PR 证据清单](../roadmap.md#5-团队流程)保存日志；失败也保存，不重跑到通过。
3. 用 `ERP_E2E_DIAG=1` 跑一次，JSONL 中 `navigate()` 返回时的 `main h2` 都是目标页标题。
4. 合并后 main Full 12/12 测试步骤通过。
