# UI-1 设计一致性审查

- 范围：[UI-08](../tasks/UI-08-polish-and-audit.md) 收尾，对照 [设计规范](../ui/README.md) 与 [UI-1 通用验收标准](../tasks/README.md#ui-1界面逐步改进)
- 基线：main `99d55de`（UI-07b 合并，页面归属表 UI-01 … UI-07e 全部合并）
- 起草：开发 39（UI-08 实施者）；审阅：设计 / 产品负责人（[审阅评论](https://github.com/lingshf/ai-native-erp/pull/82#issuecomment-7031592326)，head `33f0e5e`）
- 结论：**有条件通过**。合并前条件 C1–C5 已在 UI-08（#82）内完成，结果见 §7；D 项裁定见 §6，后续待办见 §8

## 1. 证据

- 截图：[`design/ui/screenshots/final/`](../ui/screenshots/final/)，19 个页面状态 × 5 组 = 95 张（DPR 1，整页）：
  - 教学开启 4 组：中文 + 专业红、English + 专业绿，宽 1440 与 390；
  - 教学关闭 1 组：中文 + 专业红，宽 1440，文件名后缀 `-teaching-off`（C3）。
- 采集脚本：[`capture.mjs`](../ui/screenshots/final/capture.mjs)。它用虚构夹具，在临时目录启动独立服务，不连 4173，也不读真实账套或 `.bak`。每张截图自动断言以下几点，结果写入 [`report.json`](../ui/screenshots/final/report.json)：
  1. PNG 自身尺寸（读 IHDR）宽 = 视口宽、高 = 文档高；`main` 的 `scrollWidth` ≤ `clientWidth`（表格容器内滚动除外）；
  2. 可见控件（按钮、输入、选择、复选框实际点击区、表格外链接）在 390 宽下 ≥ 44px。表格内禁用的复选框是只读状态指示，不参与检查（D-6 裁定：不可交互的指示不计入 44px）；
  3. 390 宽下导航可横向滚动（`scrollWidth > clientWidth`，且 `scrollLeft` 可改变）；
  4. 教学关闭态：`TeachingTip` 数量为 0；边界说明、warning、danger、alert 类 MessageBar 数量与同页教学开启（中文 + 红 + 1440）时相同。
- 清理前后对比：同一夹具、同一脚本分别截取 `99d55de` 构建与本分支构建，逐像素比较；除 `INTENDED` 中逐张说明的有意改动外，差异必须为 0。
  - 同态等待（审阅 [5988138449](https://github.com/lingshf/ai-native-erp/pull/82#pullrequestreview-5988138449) 后加入，两个构建完全相同，不重试）：ready 选择器出现 → `networkidle` → 页面与外壳无 `aria-busy`、无“加载中”文字 → 失焦、回顶、鼠标移到视口外角 → `document.fonts.ready` → DOM 无变动且布局签名连续 10 帧不变 → 连续两次整页截图逐字节相同才采用（最多 5 次，不稳定判失败）。
  - 业务状态指纹（`body` 文本哈希、`main` 行数、控件与 MessageBar 计数）：两个构建必须相同，否则判失败。
  - 审阅复跑中的 5 张不明差异：
    - 总账中文 390 高 1874→2036：真实的状态差异。总账报表首张表先出、其余分区稍后才到，旧脚本只等 ready 选择器；加“无加载中文字”等待后为 0。
    - 往来 / 总账明细 1440 的 5px、试算顶栏的 12–14px：差异框都落在原生 `<select>` 的圆角或左边框上（`#ledger-month` 为 [301,284,303,285]，`#business-company` 为 [1122,91,1125,125]，以及顶栏语言 / 主题选择框），差 1–2 个灰阶。
      - 两个构建中该元素的盒模型相同，全部计算样式按属性逐一比较也相同，业务指纹相同。旧版样式哈希曾显示“不同”，原因是计算样式中自定义属性的枚举顺序随样式文件顺序变化，改为按属性名排序后相同。
      - 同一构建对比自身（A/A）也会出现，且时有时无，说明不是 CSS 差异，而是栅格化差异。
    - 根因：Chrome 默认做局部栅格化（partial raster）。数据异步到达的先后决定哪些分块被局部重绘，原生控件圆角的抗锯齿随之变化。
      - 实验：`events` 与 `ledger-detail` 定向连跑 4 次，默认参数下出现 5 张差异；加 `--disable-partial-raster` 后 4 次均为 0。`--disable-gpu` 反而更多，不采用。
      - 处理：`capture.mjs` 固定带 `--disable-partial-raster`。它是确定性设置，不是重试，也不放宽阈值或白名单。
      - 脚本仍对非 0 差异自动标注来源（哪个原生下拉框、两次构建的盒与样式是否相同），只作证据，判定照样失败。
    - 最终两次完整采集（各 95 张，都对比 `99d55de`）：两次都是 95/95 通过，81 张差异为 0，14 张为下方的有意差异，没有不明差异。PNG 尺寸、稳定帧、业务指纹全部通过。
    - 跨次复现：两次本分支截图中，业务指纹相同的 70 张逐字节相同。其余 25 张的指纹不同，因为每次夹具都新生成 UUID 和单据号（凭证、总账明细、往来报表、付款），这些不是同一状态，不做跨次比较。改前 / 改后对比始终在同一次运行、同一夹具内进行。
  - 有意差异（共 14 张），其余 81 张差异为 0：
    - 44px 点击区修复（第 1 轮，§4）：`trade-reports-*-390`（4px）、`trade-reports-detail-*-390`（高 +20）；
    - C1：`journals-detail-*` 5 张，差异只在“查看”按钮列；
    - C2：`trade-settlements-*` 5 张，差异只在分配表行间分隔线。
  - 删除和移动规则造成的差异为 0px。

## 2. 外壳（UI-01）

| 审查项 | 规范 | 观察 | 偏差 |
| --- | --- | --- | --- |
| 顶栏 | §4.1 品牌块 + h1“ERP 工作区”，偏好始终可见 | 符合；两主题顶栏只换主色 | — |
| 导航 | 分组标题 12px，链接 36px，当前页浅主色底 + 3px 指示条 | 符合 | — |
| 窄屏导航 | ≤760 横向滚动、粘顶、控件 44 | 95 张截图断言通过 | F1 |
| `main` 溢出 | 页面不横向溢出 | `main { overflow-x: auto }` 原为“临时例外”。UI-03 起发票表格已有自己的滚动容器，脚本断言每页 `main` 都不溢出，所以此规则改为兜底保护，注释已改写。保留它是为了避免以后新增宽内容时撑破外壳 | — |
| 偏好警告 `.warning` | MessageBar warning | `App.tsx` 仍用 `section.warning`。规则从 `styles.css` 原样移到 `shell.css`，外观不变 | 待办 D-1 |

## 3. 逐页审查

各列：页头 = `PageHeader`（h2 + 边界说明 + 公司上下文）；主次 = 每屏实心主按钮 ≤ 1；结构 = FastTab / filter-bar / segmented 等布局模板；金额 = `num` 右对齐等宽；教学 = `TeachingTip`；消息 = MessageBar。

| 页面（任务） | 页头 | 主次 | 结构 | 金额 | 教学 | 消息 | 390 断言 | 备注 / 偏差 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 运行状态（UI-07d） | ✓ | ✓ | 状态卡 + 徽标 | 不适用 | ✓ | ✓ | 通过 | `overview.css` 保留一份 `.message-bar.warning`，D-2 接受（注释写明两处同步） |
| 迁移核对（UI-07e） | ✗ 未用 `PageHeader` | 无按钮（契约） | card + kpi + `details` | 不适用 | ✗ 无 | ✓ | 通过 | D-3、F9 |
| 科目表（UI-02b） | ✓ | ✓ 新建与编辑互斥切换 | FastTab + 虚拟表 44 | 不适用 | ✓ | ✓ | 通过 | “启用”列禁用复选框为 18px 指示，D-6；F2、F3 |
| 财务维度（UI-04） | ✓ | ✓ | filter-bar + FastTab | 不适用 | ✓ | ✓ | 通过 | — |
| 贸易主数据（UI-04） | ✓ | ✓ | filter-bar + FastTab | 不适用 | ✓ | ✓ | 通过 | — |
| 凭证列表 / 新建 / 详情（UI-05） | ✓ | 页面 1 个；预览对话框内另有 1 个“确认过账” | FastTab + 虚拟表 44 | ✓ | ✓ | ✓ | 通过 | 模态对话框单独计数，背后“预览”已禁用，D-4 接受；“查看”按钮截断已修（C1）；F2、F7、F8 |
| AI 面板（UI-07c） | 卡片内 h3 | ✓ | card + ui-field | ✓ | ✓ | ✓ | 通过（随凭证页） | — |
| 业务事件（UI-05） | ✓ | 同凭证（对话框内主按钮） | segmented + grid | 不适用 | ✓ | ✓ | 通过 | D-4 接受 |
| 采购与销售发票（UI-03） | ✓ | ✓ | command-bar + FastTab×3 + kpi | ✓ | ✓ | ✓ | 通过 | 表格内无链接；F5、F11 |
| 付款与收款（UI-06） | ✓ | ✓ | command-bar + FastTab + 虚拟表 48 | ✓ | ✓ | ✓ | 通过 | 表格内无链接；双分隔线已修（D-5 / C2）；F5 |
| 预付 / 贷项 / 纠错（UI-06） | ✓ | ✓ 不可逆时改为 `btn-danger` | command-bar + FastTab×3 | ✓ | ✓ | ✓ | 通过 | — |
| 往来未结项与账龄（UI-02a） | ✓ | ✓ | filter-bar + segmented + kpi | ✓ | ✓ | ✓ | 修复后通过 | 表格内 `.cell-link` 和明细链接已修为 44px，见 §4；F10 |
| 总账报表 / 明细账（UI-07a） | ✓ | ✓ | filter-bar + kpi + grid | ✓ | ✓ | ✓ | 通过 | 表格内链接在 UI-07a 已是 44px；F4 |
| 报表索引 / 试算（UI-07a） | ✓ | ✓ | 卡片入口 + kpi | ✓ | ✓ | ✓ | 通过 | F4 |
| 期末结账 + 期间准入（UI-07b） | ✓ | ✓ | FastTab + kpi + 分录表 | ✓ | ✓ | ✓ | 修复后通过 | 表格内金额链接已修为 44px，见 §4；F4、F5、F6 |

**未改版页面**：无。页面归属表中每个页面都已由各自任务改版，没有按例外规则保留的 `styles.css` 规则。

## 4. 表格内金额链接（遗留项）

390 宽逐页检查结果如下。

| 页面 | 改前（390） | 处理 |
| --- | --- | --- |
| 期末结账 | 链接高 19px，行高 44 | 只用 CSS 修复：`≤760px` 或 `pointer: coarse` 时链接改为 `inline-flex; min-height: 44px`，行高不变，像素差 0 |
| 往来未结项与账龄 | `.cell-link` 按钮 56–64×20；明细卡片“凭证”链接 26×17 | 只用 CSS 修复：按钮 `min-height: 44px`，表内链接同上，明细链接 `min-width/min-height: 44px`。明细页在 390 宽高度 +20px |
| 总账报表、明细账、报表 | 已是 44px（`ledger.css`） | 无需处理 |
| 发票、付款与收款 | 表格内没有链接（标记中无 `<Link>` 或 `cell-link`） | 不适用 |

1440 宽桌面指针不受影响（36px 控件规范只针对控件，表格内文字链接保持行内）。

## 5. 兼容层清理记录

- `styles.css` 只剩全局元素基线：`button`、`select`、`legend`、复选框、`dl/dt/dd`、`table/caption/th/td/thead/tfoot`，以及窄屏 `dl`，顺序不变。
  - 按边界“全局元素规则只有在每个页面都已用组件类覆盖后才删除”，这些规则未删，见 D-7。
  - 所有类选择器已移出或删除。
- 移动（选择器仍被引用）：
  - `.checkbox-label` 和 `.warning`（含 `h2/ul/p`）移到 `theme/shell.css`。它们是外壳和多页共用，`.warning` 同时给 `.badge.warning` 提供外框，并作为组件 chunk 加载失败时的退化样式；
  - VirtualRows 基础规则（`.journal-scroll`、`.journal-row`…）移到 `components.css`，它们是多页共用组件；
  - `.ai-panel .explanation`、`.journal-actions`、`.journal-dimensions label`、`.journal-dialog` 移到 `journals.css`；
  - `.snapshot-identity` 移到 `ledger.css`；
  - 付款表 `.accounts-scroll` 的生效声明移到 `trade-settlements.css`。
- 删除：
  - 在 `packages/web/src` 中已无引用的选择器，如 `.status-card`、`.intro`、`.report-card`、`.report-totals`、`.teaching`、`.data-warning`、`.connected`、`.account-editor`、`.journal-editor` 等；
  - 以“完全覆盖”为由删除的旧规则：`.ai-panel`、`.ai-panel textarea` 和 `.accounts-scroll` 一组。逐属性证据见下方 C4 对照表；唯一找不到覆盖来源的 `td { text-align: left }` 已恢复到 `trade-settlements.css`。
- 组件提升：`.message-bar.warning` 和 `.message-bar.success` 原本在期末、发票、付款、总账等页面 CSS 中重复，原样提升到 `components.css`，各页副本已删除。
- 裸色值：`rg "#[0-9a-fA-F]{3,6}" packages/web/src --glob '!theme/tokens.css'` 结果为空；`contrast.test.ts` 通过。

### 5.1 C4：“完全覆盖”删除的属性级证据

方法（设计审阅问题 1）：两层都成立，再加像素差 0，才算完全覆盖。

1. 选择器级：被删规则命中的元素也一定被覆盖规则命中，且覆盖规则特异度更高，或特异度相同但在层叠中更靠后。
2. 属性级：被删规则的每个属性（含伪类和 `@media` 分支）在覆盖规则中都有同名属性。

公共前提：

- 原规则都在入口 `index-*.css`（`styles.css`）。`components-*.css` 与页面 CSS 是按需插入的 `<link>`，排在入口样式之后：`dist/index.html` 只有 `index-*.css` 一条 stylesheet。所以特异度相同时，组件 / 页面规则胜出。
- 原 `styles.css` 里这些规则没有伪类变体（`.accounts-scroll button:disabled` 除外，见下）。唯一的 `@media (max-width: 680px)` 分支只含 `.status-card` / `dl` / `dd`，不涉及这些选择器。
- 覆盖规则本身无条件生效（不在 `@media` 或伪类里）。`.grid td` 的 `--row-h` 在窄屏 / 粗指针下变为 44，仍是同名属性覆盖。
- 选择器命中数：`SELECTORS` 传入原 `styles.css` 的全部 51 个类选择器，在 95 个页面状态的基线构建（`99d55de`）中统计最大命中数，写入 `report.json` 的 `selectors` 字段。

#### `.ai-panel`

选择器级 grep：
- 全仓 `.tsx` 中只有 `AiPanel.tsx:114` `<section className="card ai-panel">` 一处。
- `<AiPanel` 只在 `Journals.tsx:923`（`CompanyJournals`）渲染，位于 `Journals.tsx:95` 的 `<section className="page journals">` 内。
- 该元素因此必然同时命中 `.card` 与 `.journals .ai-panel`。基线命中数为 1。

| 被删属性 | 原值 | 覆盖来源 | 覆盖方式 |
| --- | --- | --- | --- |
| `margin-block` | `var(--space-4)` | `journals.css` `.journals .ai-panel { margin: 0 }` | 特异度 (0,2,0) > (0,1,0) |
| `padding` | `var(--space-4)` | 同上 `padding: 0` | 同上 |
| `border` | `1px solid var(--color-border)` | 同上 `border: 0` | 同上 |
| `background` | `var(--color-surface)` | `components.css:421` `.card { background: var(--color-surface) }` | 特异度相同 (0,1,0)，组件样式在后；值相同 |

#### `.ai-panel textarea`

选择器级：命中元素是上述 `section.card.ai-panel` 内的 textarea，同时命中以下两条：
- `:is(.business-events .ui-field, .journals .ai-panel) textarea`（`journals.css:13`、`:24`），特异度取列表最大值，为 (0,2,1)；
- `.journals .ai-panel textarea`（`journals.css:152`）。

| 被删属性 | 原值 | 覆盖来源 | 覆盖方式 |
| --- | --- | --- | --- |
| `display` | `block` | `.journals .ai-panel textarea { display: block }` | (0,2,1) > (0,1,1)；值相同 |
| `width` | `min(100%, 768px)` | `journals.css:13` `width: 100%` | (0,2,1) > (0,1,1)。原值本来就不生效 |
| `min-height` | `96px` | `journals.css:24` `min-height: 88px` | 同上 |
| `resize` | `vertical` | `.journals .ai-panel textarea { resize: vertical }` | (0,2,1) > (0,1,1)；值相同 |

#### `.accounts-scroll` 一组

选择器级 grep：
- 全仓 `.tsx` 中只有 `TradeSettlements.tsx:443` `<div className="grid-wrap accounts-scroll">` 一处。
- 其内表格是 `TradeSettlements.tsx:444` `<table className="grid">`，所以每个 `.accounts-scroll th/td` 同时是 `.grid th/td`。
- 页面根为 `section.page.trade-settlements`。
- 基线命中数：容器 1、table 1、th 6、td 12。`button` 与 `button:disabled` 为 0。

| 被删规则 | 被删属性 | 原值 | 覆盖来源 | 覆盖方式 |
| --- | --- | --- | --- | --- |
| `.accounts-scroll` | `max-height` | `480px` | `trade-settlements.css` `.trade-settlements .accounts-scroll` | 迁入原值，(0,2,0) |
| | `overflow` | `auto` | `components.css:454` `.grid-wrap { overflow: auto }` | (0,1,0) 相同，组件在后；值相同 |
| | `margin` | `var(--space-4) 0` | `.trade-settlements .accounts-scroll { margin: 0 }` | (0,2,0) > (0,1,0)。原值本来就不生效 |
| | `background` | `var(--color-surface)` | `.grid-wrap { background: var(--color-surface) }` | (0,1,0) 相同，组件在后；值相同 |
| `.accounts-scroll table` | `border-collapse` | `separate` | `components.css:465` `.grid` | 原 (0,1,1) 高于 `.grid` (0,1,0)，但值相同，计算值不变 |
| | `border-spacing` | `0` | 同上 | 同上 |
| | `width` | `100%` | 同上 | 同上 |
| `.accounts-scroll th` | `position` / `top` / `z-index` | `sticky` / `0` / `1` | `components.css:479` `.grid th` | (0,1,1) 相同，组件在后；值相同 |
| | `background` | `var(--color-primary-soft)` | `.grid th { background: var(--color-surface-alt) }` | (0,1,1) 相同，组件在后。原值本来就不生效（基线截图表头即为灰底） |
| `.accounts-scroll td, th` | `white-space` | `nowrap` | `.grid td`（`:470`）/ `.grid th` | (0,1,1) 相同，组件在后；值相同 |
| | `height` | `44px` | `.grid td { height: var(--row-h) }`、`.grid th { height: 40px }` | 同上。原值本来就不生效 |
| | `padding` | `0 var(--space-2)` | `.grid td/th { padding: 0 var(--space-3) }` | 同上。原值本来就不生效 |
| | `text-align`（th） | `left` | `.grid th { text-align: left }` | (0,1,1) 相同，组件在后；值相同 |
| | **`text-align`（td）** | `left` | **无**：`.grid td` 不设 `text-align` | **已恢复**：`trade-settlements.css` `:where(.trade-settlements) .accounts-scroll td { text-align: left }`，特异度 (0,1,1) 与原规则相同。第 4、5 列的右对齐规则 (0,3,1) 仍胜出。像素差 0（td 默认 `start` 在 LTR 下即 left），恢复只为让声明有来源 |
| `.accounts-scroll td` | `border-bottom` | `0` | `.grid td { border-bottom: 1px solid var(--color-border) }` | (0,1,1) 相同，组件在后。原值本来就不生效 |
| | `box-shadow` | `inset 0 -1px var(--color-border)` | — | 与 `.grid td` 底边叠成双线，D-5 裁定删除（C2），属有意视觉改动 |
| `.accounts-scroll button` | `height` / `padding` | `44px` / `var(--space-2) var(--space-3)` | — | 无引用：表内只有复选框、数字输入和文字（`TradeSettlements.tsx:443–573`），95 个状态的命中数为 0 |
| `.accounts-scroll button:disabled` | `cursor` | `not-allowed` | — | 同上，伪类分支命中数 0 |

#### 无引用删除

以下选择器在 `packages/web/src` 的 `.tsx` 中已无对应类名，且 95 个页面状态的基线命中数为 0：
- `.intro`、`.status-card`、`.connected`、`.error`、`.data-warning`；
- `.report-card`（含 `> select`）、`.report-boundary`、`.report-scroll`、`.report-totals`（含 `dd`）；
- `.teaching`（现为 `.teaching-tip`）、`.account-editor*`、`.journal-editor*`；
- `.reports > label`、`.dimensions > label`。

### 5.2 UI-09g：`styles.css` 全局元素规则删除记录

来源：UI-09g [#106](https://github.com/lingshf/ai-native-erp/pull/106)，head `f269d23`（评审通过的 head），base `02ede86`，合并为 main `662a763`。完整证据表与产物见 PR 正文和 [gist](https://gist.github.com/lingshf/bff06726d3a329b9fd39b5fbf9194df3)（`capture.mjs`、`rules-probe.mjs`、逐声明 JSON）。本节只记摘要。

**方法**：
- `rules-probe.mjs` 在打包后的入口 CSS 中逐条声明“删除 → 测量所有 longhand 与外框 → 恢复”。覆盖来源用 CDP `CSS.getMatchedStylesForNode` 查询，`:hover` / `:active` 用 `CSS.forcePseudoState` 强制。
- 采集 100 个点：20 页（含运行状态页），zh + 红 / en + 绿 × 1440 / 390，另加 zh + 红 1440 教学关闭。
- 可删的两个条件：(a) 所有采集点删除前后计算值逐项相等；(b) 采集覆盖不到的源码用法，经静态逐处检查也有类规则覆盖。只满足 (a) 的一律保留。

**删除**（diff 只有 `styles.css` +2 / −12）：

| 声明 | 命中 / 变 | 覆盖来源 |
| --- | --- | --- |
| `dl { grid-template-columns; gap; margin-bottom }` | 各 45 / 0 | `.overview-facts`、`.jv-facts`、`.kpis`、`.tinv-facts` / `.tord-facts` / `.trpt-facts`、`.migration-page .card > dl` |
| `@media (max-width: 680px) dl { grid-template-columns; gap }`（整条） | 各 18 / 0 | 同上类规则（类选择器优先级更高） |
| `table { border-collapse; width }` | 各 125 / 0 | `.grid`、`.journal-scroll table`、`.migration-page .kv` |
| `table { font-size }` | 125 / 0 | 无覆盖；与继承值 `--text-md` 相同，表格祖先中没有改字号的规则 |

**结果**：
- 100 张截图 base → head 像素差全部为 0；计算值快照 0 处不同。
- PG-05：入口 CSS gzip 3.11 → 3.07 kB（−0.04），入口 JS −0.01（视为不变），其余 chunk 不变。
- 真实 Chrome `trade-gui-` + `migration-gui.slow` 在 head 上 6 个文件 / 13 个用例通过；合并后 main Full [44772479885](https://github.com/lingshf/ai-native-erp/actions/runs/44772479885) 12 个分片的测试步骤全部为 `success`。

**保留**：仍在生效或有未采集依赖的声明，涉及 `legend`、`select`、`button`、`input[type=checkbox]`、`dl { display }`、`dt`、`dd`、`caption`、`th, td`、`thead, tfoot`。按冲突域登记为 [S5 待办](../tasks/README.md#s5stylescss-全局元素规则收尾--s4-回顾行动建议-v050) S5-a..g。D-7 至此部分完成：`dl` 布局与 `table` 已删除，其余规则移到 S5。

**已有问题**（与 #106 无关）：迁移页 `.kv` 表不在独立滚动区，版式检查报 `not in own scroller`，base 上已存在，由 UI-10e 引入，登记为 S5-b。


### 5.3 UI-11d：`styles.css` 保留声明删除记录

来源：UI-11d [#142](https://github.com/lingshf/ai-native-erp/pull/142)，head `b40f2e5`，base `e47b93b`，合并为 main `6be3bcf`（[Full](https://github.com/lingshf/ai-native-erp/actions/runs/44864113434) 12/12 测试步骤通过）。完整证据（四个时段的日志、第二道检查表、sha256 清单）见 PR 正文与证据 gist。本节只记摘要。前置：UI-11b [#134](https://github.com/lingshf/ai-native-erp/pull/134)、UI-11c [#141](https://github.com/lingshf/ai-native-erp/pull/141) 补齐了 S5-g（[#126](https://github.com/lingshf/ai-native-erp/pull/126)）登记的 4 项遗漏。

**删除**（只改 `styles.css`）：`input[type="checkbox"]` 整条；`button` 的 background / color / border / cursor；`button:hover:not(:disabled)`；`button:active:not(:disabled)`；`th, td` 整条。

**保留**：`button { border-radius: var(--radius-sm) }`。第二道检查发现订单列表 `button.cell-link`（`TradeOrders.tsx:841`，TORD-03 [#132](https://github.com/lingshf/ai-native-erp/pull/132) 引入）没有圆角的类规则。control 运行（去掉 `button` 规则）的差异只有这个元素的 4 个 `border-*-radius`，共 40 条，像素差 0（圆角只在焦点环上可见）。登记为 S7 候选 [UI-11e](../tasks/UI-11e-cell-link-radius-delete-styles-css.md)，文件清空后连同 `main.tsx` 的 import 一起删除。

**结果**（PR 自述）：
- r2（head 对 base）：全部导航路由 × 两主题 × 1440 / 390 共 160 张，计算值差 0，像素差 0；UI-11b / UI-11c 补采状态在时段 4 通过，含 UI-11b 时段漏采的 PeriodClose 结账按钮 8 个状态；真实 Chrome infra-browser E2E 6 个文件 / 13 个用例通过。
- PG-05（相对 `e47b93b`）：`index.css` gzip 2.97 → 2.92 kB（gzip-9 −52 B）；入口 JS +6 B，只是内嵌资产 hash，视为不变。

**D-7**：部分完成，剩余项见 UI-11e（已于 S7 完成，见 §5.4）。

### 5.4 UI-11e：订单列表 cell-link 圆角与 `styles.css` 删除记录（D-7 完成）

来源：UI-11e [#159](https://github.com/lingshf/ai-native-erp/pull/159)，证据 head `3f1fa92`（base `3410daa`），rebase 后 PR head `61fb51d`（base `ee95178`，相对证据 head 只多 #157 的 4 个 CI 文件，web 文件完全相同），合并为 main `49cb443`（[Full](https://github.com/lingshf/ai-native-erp/actions/runs/44937384278) 12/12 测试步骤通过）。完整证据（时段日志、第二道检查表、1025 项 sha256 清单）见 PR 正文与证据 gist。本节只记摘要。

**改动**：`pages/trade-orders.css` 新增 `.trade-orders .tord-list .cell-link { border-radius: var(--radius-sm); }`；删除 `src/styles.css`（只剩 `button { border-radius }` 一条）；删除 `main.tsx` 的 `import "./styles.css";`。

**第二道检查**（判定“页面是否仍依赖全局圆角”）：相对 #142 的增量（`6be3bcf` → `3410daa`）只有 UI-12 的迁移页改动，没有新增 button；唯一依赖者为订单列表 `button.cell-link`，已由上面的类规则同值覆盖。control（同时删除 `styles.css` 和 import，不加新规则）的差异只有该元素的 `border-*-radius`。

**结果**（PR 自述，评审核实）：全部页面状态 × 两主题 × 1440 / 390（另加教学关），head 对 base 计算值差 0、像素差 0，含 `:focus-visible`（键盘 Tab 进入）；真实 Chrome E2E 13 / 13 通过。

**PG-05 例外**：CSS 合计 gzip-9 **+8 B**（Vite gzip 列：入口 `index-*.css` 不变，`TradeOrders-*.css` +0.02 kB），超出任务预算“CSS 合计 gzip 减少或不变”。原因：新规则写进按需加载的 `TradeOrders.css`（+13 B），删除全局规则只让入口 `index.css` 少 5 B，两份文件分别压缩。已试的较小实现也未达到预算。评审按 [UI-1 通用验收](../tasks/README.md#ui-1界面逐步改进) #9 批准此例外，保留作用域更窄的类规则。**例外只适用于 UI-11e 本次改动，不改变后续任务的预算口径。**

**遗留**（不阻塞 D-7）：`theme/components.css` 第 3–4 行注释仍提到 `styles.css` 的全局 button 规则，已过时（web-ui:components，只改注释），留待下次改动该文件的任务顺带修正。

**D-7**：**完成**。`styles.css` 已不存在，全局元素规则全部由组件 / 页面类规则替代。

## 6. 偏差与裁定

裁定来自设计审阅评论。

| # | 页面 / 范围 | 偏差 | 裁定 | 归属 / 处理 |
| --- | --- | --- | --- | --- |
| D-1 | 外壳 `App.tsx` | 偏好警告用 `section.warning`，不是 MessageBar（缺左侧 4px 实色条和符号）。改需动 `.tsx` 类名，超出 UI-08 边界 | 转待办；本里程碑接受现状（外观未退化，文字未被隐藏） | **UI-01 后续** |
| D-2 | 运行状态 | `overview.css` 保留一份 `.message-bar.warning`，用于组件 chunk 加载失败时的 plainUi 退化，属有意重复 | 本里程碑接受 | 已在 `overview.css` 头注释写明“与 components.css 同源，修改时两处同步” |
| D-3 | 迁移核对 | 未用 `PageHeader`，h2 与说明由 `migration.css` 自绘，无教学提示 | 转待办；页面已有边界说明，且契约要求零按钮，本里程碑接受 | **UI-07e 后续**：改用 `PageHeader`，补教学提示（如“核对通过 ≠ 批准切换”），需改 `.tsx`；与 F9 一起做 |
| D-4 | 凭证、业务事件 | 预览对话框内“确认过账 / 确认”是第二个实心主按钮 | 本里程碑接受：模态对话框单独计数，背后“预览”已禁用 | 规则已写入 [README §5](../ui/README.md#5-核心组件) |
| D-5 | 付款与收款 | `.accounts-scroll td` 的 `inset box-shadow` 与 `.grid td` 底边叠成双分隔线 | 必须在 UI-08 修复 | 已修（C2） |
| D-6 | 科目表、贸易主数据 | 表格内禁用复选框（只读状态）为 18px，不可交互 | 转待办；不可交互的指示不计入 44px 目标尺寸，本里程碑接受 | **UI-02b 后续**（UI-04 同理）：改为徽标（✓ 启用 / 停用），需改 `.tsx` |
| D-7 | 全局 | `styles.css` 的全局元素规则未删 | 本里程碑接受，转待办 | **UI-09**（新开，只改 CSS）：按 §5.1 的属性级方法逐页列出 `button/select/table` 覆盖情况后再删除。**已完成**（S7 UI-11e [#159](https://github.com/lingshf/ai-native-erp/pull/159)，main `49cb443`；PG-05 +8 B 例外按 UI-1 #9 批准，见 §5.4） |
| D-8 | 科目表、主数据、期末、发票、付款 / 纠错 | `.message-bar p { margin: 0 }` 在 5 个页面 CSS 中按页作用域重复 | 本里程碑接受，转待办；会改变其他页段落间距，不能在像素差 0 的清理中顺带做 | **UI-09**（只改 CSS）：提升为 `.message-bar p { margin: 0 }`，逐页截图对比 |
| D-9 | 全部 | 截图只有教学开启态 | 必须在 UI-08 补证据 | 已补（C3） |

## 7. 合并前条件 C1–C5 结果

| # | 条件 | 处理 | 证据 |
| --- | --- | --- | --- |
| C1 | 凭证已过账列表“查看 TRADE-…:<uuid>”按钮文字被截成中间一段 | `journals.css`：`.journals .jv-list .journal-row .btn { display: inline-block; max-width: 100%; line-height: calc(var(--control-h) - 2px); text-align: start; vertical-align: middle; }`。文字从行首显示，以省略号结尾。按钮高度、无障碍名称和 `.tsx` 均不变 | `journals-detail-*` 5 张（1440 与 390 都有）的差异框只在按钮所在列：1440 为 x 1295–1394，390 为 x 261–360。改前 / 改后裁剪图见 PR 正文 |
| C2 | 付款与收款表格双分隔线 | 删除 `.trade-settlements .accounts-scroll td` 的 `inset box-shadow`，只保留 `.grid td` 的 1px 底边 | `trade-settlements-*` 5 张的差异只在分配表行区域，整页高度不变，行高仍为 48。改前 / 改后（含 4× 放大）见 PR 正文 |
| C3 | 教学关闭态终态证据 | `capture.mjs` 新增 19 张 `*-zh-red-1440-teaching-off.png` | `report.json`：19 张教学关闭截图的 `teaching.tips` 均为 0。`boundary/warning/danger/alert` 计数与同页教学开启时相同（`hidden` 为空） |
| C4 | “完全覆盖”删除的属性级证据 | 见 §5.1。唯一无覆盖来源的 `.accounts-scroll td { text-align: left }` 已恢复 | §5.1 对照表与 grep 行号；`report.json` `selectors` 命中数 |
| C5 | 报告定稿与 README | 本文件：结论、D 裁定、C1–C4、§8 待办。README §5 Button 行补充模态对话框计数规则 | 文档 diff |

## 8. 后续待办（不阻塞，以设计评论为准）

| # | 位置 | 问题 | 建议 | 归属 |
| --- | --- | --- | --- | --- |
| F1 | 外壳 390，英文 | 品牌名被截成 “E…”，语言、主题选择框占满顶栏 | ≤760 时只显示 logo 并保留无障碍名称，或缩短主题选项的显示宽度（只改 CSS） | UI-01 后续 |
| F2 | 科目表、凭证 390 | 表格右侧列（启用、编辑、摘要、操作）被裁掉，看不出可以横向滚动 | 滚动容器右缘加渐隐提示，或在窄屏把关键列固定在左侧 | UI-02b、UI-05 后续 |
| F3 | 科目表“编辑”（内置科目）、发票和凭证的“删除行” | 禁用态的 subtle 按钮显示为灰色方框，可用态却是纯文字，两者不一致 | `.btn-subtle:disabled` 保持无框，只降低文字对比度（仍须达到禁用态要求） | UI-09（components.css） |
| F4 | 总账报表、试算、期末结账 | 所有金额（包括 0.00）都带实线下划线，表格显得嘈杂 | 链接改为低调的虚线或细下划线，hover / focus 时加深。保留非颜色提示（WCAG 1.4.1） | UI-07a / 07b 后续 |
| F5 | 主数据、期末结账、发票、付款与收款 | 这几页桌面端控件也用 44px，其他页是 36px，表单密度不统一 | 按 §7 桌面统一 36px，窄屏和粗指针 44px | UI-09（各页 CSS） |
| F6 | 期末结账 | 分录表“科目”列整列灰底（行表头样式），像是渲染错误；准入复选框上下间距过大 | 行表头去掉底色，只加粗；复选框之间用 `--space-2` | UI-07b 后续 |
| F7 | 凭证新建 | `fieldset` “凭证草稿” 外框里又套 FastTab 卡片，框中有框 | 去掉 `fieldset` 外框，只保留 legend 作为节标题 | UI-05 后续 |
| F8 | 凭证列表 | 操作列表头为空 | 表头补“操作 / Actions”，需改 `.tsx`。按钮名称不变 | UI-05 后续 |
| F9 | 迁移核对 | 核对明细直接展示原始 JSON，对教学不友好 | 改为键值表并高亮差异字段，原始 JSON 折叠，需改 `.tsx` | UI-07e 后续（与 D-3 一起） |
| F10 | 往来报表 390 | segmented 选中态是实心主色，与“应用筛选”主按钮在同一屏，出现两块实心主色 | segmented 选中态改为浅主色底加主色字 | UI-09（components.css） |
| F11 | 发票 | “新增行（Alt+Shift+N）”中括号包着 kbd 徽标，显得杂乱 | 去掉括号，只保留 kbd 徽标，需改文案和 `.tsx` | UI-03 后续 |
