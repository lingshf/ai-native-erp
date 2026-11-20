# FLAKE-02 贸易 GUI E2E：期末月份下拉选项轮询偶发为空，afterAll 关闭浏览器超时（原因未知）

- Sprint：S5（排队，不计入 S5 目标）　依赖：—（与 S5-h 无文件重叠，可并行，见下文“与 S5-h 的关系”）　建议分支：`flake-02-trade-gui-option-poll`
- 冲突域：tests:e2e（`packages/infra/test/support/trade-gui-scenario.ts`、`packages/infra/test/http/trade-gui-*.slow.test.ts`、`packages/infra/test/http/migration-gui.slow.test.ts`）。如果查明需要改页面，再报告设计角色，追加 web-ui:period-close（`PeriodClose.tsx`）
- 类型：调查 / 测试（必要时页面 tsx）
- 来源：S5-f [#115](https://github.com/lingshf/ai-native-erp/pull/115) 作者在 head `c2f0310`、干净工作树、真实 Chrome 上的本机 E2E 运行（协调者转报）

## 观察

1. `trade-gui-en-green-1` 失败，报错 `Missing keyboard-selectable option: 2026-01: expected [] to include '2026-01'`。
   - 位置：`trade-gui-scenario.ts:90` 的 `choose`，它在 10 s 的 `expect.poll` 中读取 `#close-month` 的全部 `option` 值。调用方是 `:843` 的 `setUp`（`navigate("period-close")` 之后）。
   - 轮询的最后一次结果是**空数组**：`#close-month` 下一个 `option` 都没读到，不是“有选项但缺 2026-01”。
   - 失败截图里下拉框已显示 2026-01。
2. 同一次运行中有两个 afterAll hook 超过 15 s 默认超时：`migration-gui.slow.test.ts:29`（`browser?.close()` 与删除临时目录），以及 `trade-gui-scenario.ts:413`（`harness.launching` 与 `browser.close()`）。
3. `#close-month` 的选项来自 `PeriodClose.tsx:123–125` 的 `periodOptions`（分页查询，`<option>` 没有 `value` 属性，值取文本）。
4. 尚未在其他 head 或 CI 上见到同样的失败，也没有复现。

## 推断（均待验证，不作为结论）

- 截图在轮询超时之后才拍，所以“截图显示 2026-01”不能说明轮询期间选项已存在。轮询期间的 10 s 内选项可能确实为空：期间数据未返回，或下拉在加载中被重新挂载。
- locator 可能在轮询期间命中了已卸载的旧节点，或其他同 id 的元素。
- afterAll 超时可能是第一处失败的后果：页面停在未完成状态，浏览器关闭变慢。也可能是本机负载或独立的问题。按 [S4 回顾](../reviews/S4-retro.md)议题 4 的结论，不能仅凭本机运行判定为负载造成。

## 范围

1. **先调查，后修复**：
   - 在同一 head 上按[路线图 §5 偶发失败](../roadmap.md#5-团队流程)重跑，用 Tee-Object 保存完整日志，包括失败的运行；
   - 失败时额外记录：轮询每一次读到的选项列表，`#close-month` 的元素数量与 `disabled` 状态，periods 查询的请求与响应时间；
   - 判断 afterAll 超时是否只在 `choose` 失败之后出现。
2. 查明原因后再修复。若原因在测试，修改测试的等待条件，改为等待真实的就绪信号（例如 periods 响应完成或选项出现），而不是加长时间。若原因在页面（例如加载中重新挂载），报告设计角色追加冲突域，再改 `PeriodClose.tsx`。
3. 若无法复现，PR 只提交诊断记录（只在失败时输出，不改断言），并在任务状态中写“原因待证实”，不得宣布已修复。

## 验收标准

1. **D11**：不加重试，不放宽 `choose` 的 10 s 轮询，不放宽 afterAll 的 15 s 超时，不删除、不削弱断言。等待条件可以改为更准确的就绪信号，但必须在 PR 中说明它比原条件严格或同样严格。
2. PR 描述按“观察 / 推断 / 未排除”三段写明原因结论。只有复现了失败、并证明修复后不再失败，才能写“已修复”。
3. 证据：同一 head 上真实 Chrome（`ERP_E2E_BROWSER_CHANNEL=chrome`）的 `trade-gui-*.slow` 与 `migration-gui.slow` 连续运行 ≥ 5 次的完整日志，含失败的运行；CI 上精确 head 的 E2E 结果。
4. afterAll 超时单独给出结论：是第一处失败的后果，还是独立问题。若是独立问题，在 PR 中另列，报告设计角色拆分任务。

## 与 S5-h 的关系

两者**不合并，也不互为依赖**：
- 共同点：都是间歇失败、原因待证实、按 D11 处理，调查方法相同（同一 head 重跑、保存失败日志、观察 / 推断分开写）。
- 不同点：
  - S5-h 验收 3 要求 `trade-gui-*.slow` 通过，FLAKE-02 未修复前可能使它偶发失败；此时按路线图 §5 同 head 重跑并在 S5-h PR 中引用 FLAKE-02，不算 S5-h 回退；
  - S5-h 是 jsdom 单元测试（`trade-orders.test.tsx`）在订单录入页保存后的焦点断言；FLAKE-02 是真实 Chrome E2E 在期末页的下拉选项轮询；
  - 冲突域（web-ui:trade-orders 对 tests:e2e）和文件都不重叠。
- 若调查发现两者的共同原因（例如外壳的路由切换后重新挂载、焦点与渲染时序），先完成的一方在 PR 中写明，设计角色再决定是否合并后续修复。
