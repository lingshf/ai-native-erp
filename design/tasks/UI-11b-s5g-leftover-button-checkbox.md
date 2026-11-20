# UI-11b S5-g 遗留：`.btn-primary:active`、概览重试按钮、维度命中列复选框

- Sprint：S5 收尾后的 backlog（不计入 S5 目标，版本由协调者定）　依赖：S5-g [#126](https://github.com/lingshf/ai-native-erp/pull/126) 合并（基于其保留后的 `styles.css` 取证）；与 [UI-11c](UI-11c-virtualrows-spacer-cells.md) 同改 `theme/components.css`，**串行**　建议分支：`ui-11b-s5g-leftover-controls`
- 冲突域：web-ui:components（`theme/components.css`）、web-ui:shell（`App.tsx` 概览、`pages/overview.css`，**不含 `styles.css`**）、web-ui:master（`Dimensions.tsx`、`pages/master.css`）。三项互不依赖，可以一个 PR，也可以按冲突域拆成三个 PR；拆开时各自只占自己的冲突域。
- 类型：CSS（必要时 tsx 加类名）
- 来源：S5-g #126（head `a456f33`）第二道检查（未采集状态的源码检查），证据 [gist](https://gist.github.com/lingshf/a5d44f3ae2f4eb51cdf4cfaff7533084)。这三项使 `styles.css` 中的 `button`、`button:hover`、`button:active` 与 `input[type="checkbox"]` 声明仍须保留。

## 范围

以下“现值”指 S5-g 保留的全局声明在这些元素上给出的计算值；本任务用类规则给出**相同的值**，让这些全局声明不再被依赖。

1. **web-ui:components**：`.btn-primary` 没有 `:active` 规则。只处于 `:active`、不在 `:hover` 时（键盘按住空格，或触屏按下且无 hover），背景来自全局 `button:active:not(:disabled)` 的 `--color-primary-active`。在 `theme/components.css` 补 `.btn-primary:active:not(:disabled)`，一条覆盖 #126 列出的 19 处 `.btn-primary`（含条件分支），不在页面 CSS 里逐页重复（D77）。
   - **层叠结果不变**：新规则与现有 `.btn-primary:hover:not(:disabled)` 特异度相同（0,3,0），由源码顺序决定谁胜出。现在鼠标按住且仍悬停时（同时命中 `:hover` 与 `:active`），hover 规则胜过全局 `button:active`（0,2,1），背景为 `--color-primary-hover`。改动后两态同时命中时必须仍是这个结果，例如把新规则放在 hover 规则**之前**；不能因为新规则写在后面而改用 active 背景。
2. **web-ui:shell**：`App.tsx` 概览加载失败态（`.overview-failed` 页 `.overview-ui-error` 内，main `c5c9224` 第 436 行）的重试按钮没有类，背景、颜色、边框、圆角、指针及 `:hover` / `:active` 背景都来自全局 `button`。可以给它加 `.btn` 变体类（按设计 token 选与现值相同的变体），或在 `pages/overview.css` 用限定类规则给出相同的值。
3. **web-ui:master**：`Dimensions.tsx`（main `c5c9224` 第 280 行）`label.ui-master-hit` 内的禁用复选框不在 `.ui-check` 内，`master.css` 没有匹配规则；宽高 18px、`flex-shrink`、`accent-color` 都来自全局复选框规则。在 `pages/master.css` 用 `.ui-master-hit input[type="checkbox"]` 之类的类规则给出相同的值。

- 不改 `styles.css`（删除由 [UI-11d](UI-11d-delete-styles-css-remaining.md) 做），不改其他页面。按钮可访问名称、行为与焦点不变。

## 验收标准

1. 满足 [S5 共同验收](README.md#s5stylescss-全局元素规则收尾--s4-回顾行动建议-v050) 2–5。PG-05：入口 JS 不变，CSS 合计 ≤ +0.2 kB，路由 chunk ≤ +15%。
2. **计算值证据**：在只用于取证、不提交的构建中删去对应的全局声明（`button` 的 background / color / border / border-radius / cursor、`button:hover:not(:disabled)`、`button:active:not(:disabled)`、`input[type="checkbox"]` 整条），下列状态计算值“变”为 0，两主题、1440 / 390：
   - 第 1 项：任一页 `.btn-primary` 的两种状态，在同一取证路径上依次采集：(i) 只处于 `:active`、不在 `:hover`（Playwright 键盘聚焦后按住空格，鼠标移出按钮），背景为 `--color-primary-active`；(ii) 同时处于 `:hover` 与 `:active`（鼠标移入后按下不放），背景仍为 `--color-primary-hover`，与改前相同。不为此新增重复测试。至少采 3 个不同冲突域的页面，另附 #126 第 1 节的 19 处清单逐行确认都只靠 `.btn-primary` 一条规则。
   - 第 2 项：概览加载失败态（拦截 UI 加载使其失败），重试按钮的默认、`:hover`、`:active`（不在 hover）三个状态。
   - 第 3 项：财务维度列表**有数据行**时的命中列复选框（虚构夹具需补维度行；#126 的夹具里没有，未采集）。
3. 截图：第 2、3 项状态改前 / 改后像素差为 0（中文 + 红、English + 绿，1440 与 390）。第 1 项为瞬时状态，以计算值证据为准。
4. 第二道检查：对本任务改动涉及的元素，重新列 `git grep -n "<button\|type=\"checkbox\"" -- packages/web/src` 中仍不带类规则覆盖的用法；若发现 #126 之外的新遗漏（例如之后合并的页面），列出并报告设计角色，不在本任务里扩大范围。
5. 现有测试与 E2E 不删除、不削弱（D11）。验证分层同 [FLAKE-02](FLAKE-02-trade-gui-period-option-poll.md)。
