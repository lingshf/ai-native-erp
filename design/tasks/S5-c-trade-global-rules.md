# S5-c 贸易页面：不再依赖全局元素规则

- Sprint：S5　依赖：—（B 线首个）　建议分支：`s5-c-trade-rules`
- 冲突域：web-ui:trade（发票、结算、纠错、贸易报表、贸易主数据及其页面 CSS）
- 类型：CSS
- 来源：UI-09g [#106](https://github.com/lingshf/ai-native-erp/pull/106) 证据表“保留”

## 范围

依赖 `styles.css` 全局规则的声明，改为页面 CSS 中的类规则，值不变。**不改 `styles.css`**：
- 发票 / 结算复选框：width / height / flex-shrink / accent-color；
- `.tinv-facts`、`.trpt-facts` 的 `dl { display }`；
- 贸易报表 `button.cell-link { border-radius }`；
- 发票过账预览与 PO 匹配表的 `caption`。

## 验收标准

1. 满足 [S5 共同验收](README.md#s5stylescss-全局元素规则收尾--s4-回顾行动建议-v050)。
2. 复选框的点击区不小于现值（窄屏 44px 规则不变）。
3. 贸易页测试和 `trade-gui-*.slow` 不删除、不削弱。
