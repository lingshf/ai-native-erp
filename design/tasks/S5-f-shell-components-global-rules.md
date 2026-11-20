# S5-f 外壳 / 共享组件：不再依赖全局元素规则

- Sprint：S5　依赖：S5-c（[#113](https://github.com/lingshf/ai-native-erp/pull/113) 也改 `theme/components.css`，合并后再开工；A 线首个，外壳串行 S5-f → S5-g）　建议分支：`s5-f-shell-rules`
- 冲突域：web-ui:shell（**不含 `styles.css`**：只改 `theme/shell.css` 与 `App.tsx`）、web-ui:components（`theme/components.css`、`ui/components/`）
- 类型：CSS（需要类名时改 `App.tsx` 或组件 tsx）
- 来源：UI-09g [#106](https://github.com/lingshf/ai-native-erp/pull/106) 证据表“保留”

## 范围

依赖 `styles.css` 全局规则的声明，改为 `shell.css` / `components.css` 中的类规则，值不变。**不改 `styles.css`**：
- 外壳偏好区：`legend { font-weight }`、`select { max-width }`、复选框；
- 运行状态页（`Overview`）：`dd { font-weight }`；
- `.field` 下的 `select { max-width }`；
- VirtualRows：`tfoot { background }`。

## 验收标准

1. 满足 [S5 共同验收](README.md#s5stylescss-全局元素规则收尾--s4-回顾行动建议-v050)。证据覆盖外壳偏好警告（UI-10a 的 MessageBar）出现与不出现两种状态。
2. 组件规则只用类选择器，不引入新的元素选择器。
3. 外壳、组件与对比度测试不删除、不削弱。若需新增对比度配对，先报告设计角色（`tests:contrast` 串行）。
