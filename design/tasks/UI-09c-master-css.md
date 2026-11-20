# UI-09c 科目表与主数据页样式：桌面 36px、滚动提示、删除重复规则

- Sprint：S4　依赖：[UI-09a](UI-09a-components-css.md)　建议分支：`ui-09c-master-css`
- 冲突域：web-ui:master（只改 `src/pages/accounts.css`、`src/pages/master.css`）
- 类型：**只改 CSS**
- 来源：[UI-1 审查](../reviews/UI-1.md) §8 F5、F2（科目表部分），§6 D-8（页面副本）

## 范围

1. **F5**：科目表、财务维度、贸易主数据页的桌面端（`pointer: fine` 且宽 > 760）控件统一为 36px，与其他页一致。窄屏和粗指针（`pointer: coarse` 或 ≤ 760）保持 44px。依据 [design/ui/README.md](../ui/README.md) §7，产品负责人决定 P1（见 [README S4 节](README.md#s4ui-1-后续--m1-遗留建议-v040)）。
2. **F2**：`.acct-scroll` 使用与 UI-09a 相同的纯 CSS 滚动阴影。
3. **D-8**：删除 `accounts.css`、`master.css` 中按页作用域的 `.message-bar p { margin: 0 }` 副本，像素差应为 0。

## 验收标准

1. 满足 [UI-1 通用验收标准](README.md#ui-1界面逐步改进) 1–9。PG-05：入口 JS 不变，CSS 合计不增（应减少或持平），路由 chunk 不变。
2. 截图：
   - F5：改前 / 改后两组（1440 中文 + 红、English + 绿），PR 中列出控件高度实测值（36 / 44）；
   - 390 与粗指针下仍为 44px，提供 390 截图，并用 `matchMedia('(pointer: coarse)')` 模拟证据或 Playwright `hasTouch` 截图；
   - D-8：像素差 0。
3. 虚拟列表行高 44 / 48 不变（行高不是控件高）。
4. 不改 `Accounts.tsx`、`Dimensions.tsx`、`TradeMaster.tsx`。
