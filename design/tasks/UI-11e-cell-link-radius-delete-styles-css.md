# UI-11e 订单列表 `button.cell-link` 圆角改由类规则提供；删除 `styles.css` 及入口 import（D-7 完成）

- Sprint：S7（[计划](README.md#s7订单列表筛选--d-7-完成--s6-遗留收尾建议-v070)，A 线第一项，P1）　依赖：UI-11d（已合并，[#142](https://github.com/lingshf/ai-native-erp/pull/142)，main `6be3bcf`）　建议分支：`ui-11e-cell-link-radius-delete-styles-css`
- 冲突域：
  - web-ui:trade-orders（`pages/trade-orders.css`，新增一条规则）；
  - web-ui:shell（删除 `src/styles.css`，删除 `src/main.tsx` 中 `import "./styles.css";` 这一行）。
  - 证据覆盖全部页面，所以**从开工到合并期间，不能有进行中的页面 CSS 任务**（与 UI-11d 相同）。
- 类型：CSS，外加删除入口 import 一行
- 来源：UI-11d [#142](https://github.com/lingshf/ai-native-erp/pull/142) 第二道检查发现的遗漏，由协调者登记：
  - `TradeOrders.tsx:841` 订单列表订单号 `button.cell-link`（TORD-03 [#132](https://github.com/lingshf/ai-native-erp/pull/132) 引入，在 `table.grid.tord-list` 内）的 `border-radius` 没有类规则覆盖：`components.css` 的 `.cell-link` 不给圆角；贸易报表的圆角由 `trade-reports.css` 的 `.trade-reports .journal-row .cell-link` 提供，只作用于该页；`trade-orders.css` 没有 cell-link 规则。
  - #142 的 control 运行（去掉 `button` 规则）显示，差异**只有**这个元素的 4 个 `border-*-radius`，共 40 条（普通、hover、active、hover+active）；像素差为 0，因为圆角只在焦点环上可见。
  - 所以 `styles.css` 只剩 `button { border-radius: var(--radius-sm) }` 一条。

## 设计决定

- 圆角写在页面 CSS：`pages/trade-orders.css` 中加一条作用于订单列表的规则，例如 `.trade-orders .tord-list .cell-link { border-radius: var(--radius-sm); }`（该文件的规则都以 `.trade-orders` 为根）。
- 不改 `components.css` 的 `.cell-link`。理由：
  1. 贸易报表已经由自己的页面规则给出同值圆角，先例是写在页面里；
  2. 改组件规则要再占 web-ui:components，扩大冲突域和取证范围。
- 合并后 `styles.css` 不再含任何规则，删除文件和入口 import。

## 范围

1. 在 `trade-orders.css` 中加上上面这条规则，值与全局规则相同（`var(--radius-sm)`），特异度高于 `button`。
2. 删除 `packages/web/src/styles.css` 和 `main.tsx` 中的 import。
3. 做第二道检查（增量），方法同 UI-11d：
   - 判定的是“页面是否仍**依赖**全局圆角”，不是“`button` 选择器匹配到哪些元素”（`button` 会匹配所有按钮，其中大多数已有类规则给出同值或不同值的圆角）。以 `6be3bcf` 为基线，在 control 中去掉全局圆角后，全部路由 × 两主题 × 1440 / 390 × 各状态的计算值差只出现在订单列表 `button.cell-link`，即它是唯一仍依赖全局圆角的元素；若出现其他元素，同样要在本任务中补类规则并列入检查表；
   - 对 `6be3bcf` 之后改过的 tsx，重新列出 button / checkbox / th / td，逐个核对。
4. 只改 CSS 的“JS 逻辑不变”证明：`git diff <base>..HEAD -- '*.ts' '*.tsx'` 只含 `main.tsx` 这一行删除。

## 不在范围

- 改 `.cell-link` 的其他外观（颜色、下划线、焦点环）或订单列表的版式。
- 其他页面的 CSS。

## 验收标准

1. 满足 [UI-1 通用验收标准](README.md#ui-1界面逐步改进) 1–9。PG-05 只用本任务自己的预算：相对 merge-base，CSS 合计 gzip **减少或不变**；入口 JS 除删除一个 import 外不变；路由 chunk 只有 trade-orders 的 CSS 变化。
2. 全部导航路由 × 两主题 × 1440 / 390，以及订单列表 `button.cell-link` 的普通、`:hover`、`:active`、`:focus-visible` 状态（`:focus-visible` 用键盘 Tab 进入，不只靠强制伪类）：计算值“变”为 0，像素差为 0。
3. 对照运行（control）：不加新规则，并去掉全局圆角，且必须可构建。二选一，PR 中写明用了哪种：(a) 只删除 `styles.css` 中的 `button { border-radius }` 声明，保留空文件和 `main.tsx` 的 import；(b) 同时删除 `styles.css` 文件和 `main.tsx` 的 import。不能只删文件而留下 import（构建会失败，探针无从运行）。control 必须检出订单列表 `button.cell-link` 的 `border-*-radius` 差异，且不出现其他元素的差异（见范围 3）。这证明探针能检出新规则修正的那处差异。
4. PR 描述附第二道检查表（元素、文件:行、覆盖它的类规则）。
5. 现有测试与 E2E 不删除、不削弱、不跳过（D11）；真实 Chrome 证据按[路线图 §5 UI PR 证据清单](../roadmap.md#5-团队流程)。
6. 合并后 main Full 12/12 测试步骤通过。设计角色把 D-7 改写为“完成”，并在 [UI-1.md §5](../reviews/UI-1.md#5-兼容层清理记录) 追加摘要。
