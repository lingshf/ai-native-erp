# S5-d 订单录入页：不再依赖全局元素规则

- Sprint：S5　依赖：S5-h（同冲突域，先修焦点竞态）　建议分支：`s5-d-trade-orders-rules`
- 冲突域：web-ui:trade-orders（`TradeOrders.tsx`、`trade-order-labels.ts`、`pages/trade-orders.css` 及其测试）
- 类型：CSS
- 来源：UI-09g [#106](https://github.com/lingshf/ai-native-erp/pull/106) 证据表“保留”

## 范围

依赖 `styles.css` 全局规则的声明，改为 `pages/trade-orders.css` 中的类规则，值不变。**不改 `styles.css`**：
- 订单行复选框；
- `.tord-facts` 的 `dl { display }`。先用探针确认它是否仍依赖全局规则；不依赖就在 PR 证据中写明，不加规则。

## 验收标准

1. 满足 [S5 共同验收](README.md#s5stylescss-全局元素规则收尾--s4-回顾行动建议-v050)。
2. 证据覆盖保存前、保存成功后（`.tord-saved` 提示与 FastTab）两种状态。
3. `trade-orders.test.tsx` 与 `trade-gui-*.slow` 不删除、不削弱。
