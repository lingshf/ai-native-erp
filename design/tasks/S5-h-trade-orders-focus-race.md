# S5-h 订单录入页：保存后焦点断言的时序竞态（D92）

- Sprint：S5　依赖：S5-c（B 线前序）　建议分支：`s5-h-trade-orders-focus`
- 冲突域：web-ui:trade-orders（`TradeOrders.tsx`、`trade-orders.test.tsx`）
- 类型：测试 / 页面 tsx
- 来源：[S4 回顾](../reviews/S4-retro.md) 议题 2；失败运行 [44761991208](https://github.com/lingshf/ai-native-erp/actions/runs/44761991208)

## 问题

- `TradeOrders.tsx:273–275` 在被动 `useEffect` 中把焦点移到保存提示 `.tord-saved`。
- `trade-orders.test.tsx:185–186` 在 `findByText` 找到提示文字后同步断言 `document.activeElement`。
- 保存由异步请求触发，被动 effect 可能晚于文字出现执行，负载高时断言先于聚焦，得到 `body`。

## 范围

二选一，在 PR 描述中写明理由：
- **改实现**：焦点移动改用 `useLayoutEffect`，或在设置 `saved` 的同一提交中完成聚焦，使提示出现时焦点已到位。测试断言不变。这一选择更好：读屏用户在提示出现的同时获得焦点。
- **改测试等待方式**：把同一断言包进 `await waitFor(...)`。断言内容和强度不变，不放宽为“存在即可”。

同时检查本冲突域内其他“`findBy*` 后同步断言焦点”的用例，按同样方式处理。其他冲突域发现的同类用例只报告设计角色，不在本任务里改。

## 验收标准

1. 不删除、不削弱任何断言（D11）。
2. 本机在 CPU 负载下（例如同时运行 `npm run build -w packages/web`）把 `trade-orders.test.tsx` 连续运行 30 次，0 失败。完整日志按[路线图 §5 偶发失败](../roadmap.md#5-团队流程)保存（失败的运行也保存）。
3. 改实现时：真实 Chrome 中保存订单后焦点落在保存提示上，附 PR head 的截图或录屏；`trade-gui-*.slow` 通过。
4. 页面 chunk gzip 不变（≤ 0.02 kB）。
