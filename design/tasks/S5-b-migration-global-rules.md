# S5-b 迁移核对页：不再依赖全局元素规则，`.kv` 表进独立滚动区

- Sprint：S5　依赖：—（C 线首个）　建议分支：`s5-b-migration-rules`
- 冲突域：web-ui:migration（`Migration.tsx`、其页面 CSS 与 labels）
- 类型：CSS（`.kv` 滚动区需要时改 tsx）
- 来源：UI-09g [#106](https://github.com/lingshf/ai-native-erp/pull/106) 证据表“保留”；`.kv` 问题为 UI-10e（[#87](https://github.com/lingshf/ai-native-erp/pull/87)）引入，#106 评审确认 base 同样存在

## 范围

1. **全局规则依赖**：`dl { display }`、`dt { color }`、`dd { margin }`、`@media (max-width: 680px) dd { margin-bottom }`、`thead { background }`，改为页面 CSS 中的类规则，值不变。**不改 `styles.css`**。
2. **`.kv` 滚动区**：迁移页两张 `.kv` 键值表放进各自的横向滚动容器（复用共享的表格滚动样式与滚动提示，同 F2），使 UI-09g 版式检查的 `not in own scroller` 消失。

## 验收标准

1. 第 1 项满足 [S5 共同验收](README.md#s5stylescss-全局元素规则收尾--s4-回顾行动建议-v050)。
2. 第 2 项会改变版式，不要求像素差为 0：
   - 附 1440 / 390、两主题的改前 / 改后截图；
   - 版式检查对迁移页的 5 个取景全部通过（PNG 宽 = 视口宽、`scrollWidth ≤` 视口宽、没有元素溢出到自身滚动容器外）；
   - 除 `.kv` 区域外像素差为 0。
3. D26 门禁、风险说明与 KPI 照常显示；`migration-gui.slow` 与迁移页测试不删除、不削弱。
4. 页面 chunk gzip ≤ +0.1 kB。
