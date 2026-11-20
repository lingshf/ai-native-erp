# UI-1 设计一致性审查

- 范围：[UI-08](../tasks/UI-08-polish-and-audit.md) 收尾，对照 [设计规范](../ui/README.md) 与 [UI-1 通用验收标准](../tasks/README.md#ui-1界面逐步改进)
- 基线：main `99d55de`（UI-07b 合并，页面归属表 UI-01 … UI-07e 全部合并）
- 起草：开发 39（UI-08 实施者），只列审查项与偏差待办
- 结论：**待设计角色审阅后填写**（通过 / 有条件通过 / 不通过）

## 1. 证据

- 截图：[`design/ui/screenshots/final/`](../ui/screenshots/final/)，19 个页面状态 × 4 组（中文 + 专业红、English + 专业绿；宽 1440 与 390；DPR 1；整页）= 76 张。教学开启。
- 采集脚本：[`capture.mjs`](../ui/screenshots/final/capture.mjs)。它用虚构夹具，在临时目录启动独立服务，不连 4173，也不读真实账套或 `.bak`。每张截图自动断言以下几点：
  1. PNG 宽 = 视口宽；`main` 的 `scrollWidth` ≤ `clientWidth`（表格容器内滚动除外）；
  2. 可见控件（按钮、输入、选择、复选框实际点击区、表格外链接）在 390 宽下 ≥ 44px。表格内禁用的复选框是只读状态指示，不参与检查，见待办 D-6；
  3. 390 宽下导航可横向滚动（`scrollWidth > clientWidth`，且 `scrollLeft` 可改变）。
- 清理前后对比：同一夹具、同一脚本分别截取 `99d55de` 构建与本分支构建，逐像素比较。方法与结果见 PR 正文。
  - 删除和移动规则造成的差异为 0px；
  - 只有第 4 节列出的 44px 点击区修复有意改变视觉（共 4 张截图）。

## 2. 外壳（UI-01）

| 审查项 | 规范 | 观察 | 偏差 |
| --- | --- | --- | --- |
| 顶栏 | §4.1 品牌块 + h1“ERP 工作区”，偏好始终可见 | 符合；两主题顶栏只换主色 | — |
| 导航 | 分组标题 12px，链接 36px，当前页浅主色底 + 3px 指示条 | 符合 | — |
| 窄屏导航 | ≤760 横向滚动、粘顶、控件 44 | 76 张截图断言通过 | — |
| `main` 溢出 | 页面不横向溢出 | `main { overflow-x: auto }` 原为“临时例外”。UI-03 起发票表格已有自己的滚动容器，脚本断言每页 `main` 都不溢出，所以此规则改为兜底保护，注释已改写。保留它是为了避免以后新增宽内容时撑破外壳 | — |
| 偏好警告 `.warning` | MessageBar warning | `App.tsx` 仍用 `section.warning`。规则从 `styles.css` 原样移到 `shell.css`，外观不变 | 待办 D-1 |

## 3. 逐页审查

各列：页头 = `PageHeader`（h2 + 边界说明 + 公司上下文）；主次 = 每屏实心主按钮 ≤ 1；结构 = FastTab / filter-bar / segmented 等布局模板；金额 = `num` 右对齐等宽；教学 = `TeachingTip`；消息 = MessageBar。

| 页面（任务） | 页头 | 主次 | 结构 | 金额 | 教学 | 消息 | 390 断言 | 备注 / 偏差 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 运行状态（UI-07d） | ✓ | ✓ | 状态卡 + 徽标 | 不适用 | ✓ | ✓ | 通过 | `overview.css` 保留一份 `.message-bar.warning`，见 D-2 |
| 迁移核对（UI-07e） | ✗ 未用 `PageHeader` | 无按钮（契约） | card + kpi + `details` | 不适用 | ✗ 无 | ✓ | 通过 | D-3 |
| 科目表（UI-02b） | ✓ | ✓ 新建与编辑互斥切换 | FastTab + 虚拟表 44 | 不适用 | ✓ | ✓ | 通过 | “启用”列禁用复选框为 18px 指示，见 D-6 |
| 财务维度（UI-04） | ✓ | ✓ | filter-bar + FastTab | 不适用 | ✓ | ✓ | 通过 | — |
| 贸易主数据（UI-04） | ✓ | ✓ | filter-bar + FastTab | 不适用 | ✓ | ✓ | 通过 | — |
| 凭证列表 / 新建 / 详情（UI-05） | ✓ | 页面 1 个；预览对话框内另有 1 个“确认过账” | FastTab + 虚拟表 44 | ✓ | ✓ | ✓ | 通过 | 对话框内主按钮是否算“同屏”，请设计确认，见 D-4 |
| AI 面板（UI-07c） | 卡片内 h3 | ✓ | card + ui-field | ✓ | ✓ | ✓ | 通过（随凭证页） | — |
| 业务事件（UI-05） | ✓ | 同凭证（对话框内主按钮） | segmented + grid | 不适用 | ✓ | ✓ | 通过 | D-4 |
| 采购与销售发票（UI-03） | ✓ | ✓ | command-bar + FastTab×3 + kpi | ✓ | ✓ | ✓ | 通过 | 表格内无链接 |
| 付款与收款（UI-06） | ✓ | ✓ | command-bar + FastTab + 虚拟表 48 | ✓ | ✓ | ✓ | 通过 | 表格内无链接；可能有双分隔线，见 D-5 |
| 预付 / 贷项 / 纠错（UI-06） | ✓ | ✓ 不可逆时改为 `btn-danger` | command-bar + FastTab×3 | ✓ | ✓ | ✓ | 通过 | — |
| 往来未结项与账龄（UI-02a） | ✓ | ✓ | filter-bar + segmented + kpi | ✓ | ✓ | ✓ | 修复后通过 | 表格内 `.cell-link` 和明细链接已修为 44px，见 §4 |
| 总账报表 / 明细账（UI-07a） | ✓ | ✓ | filter-bar + kpi + grid | ✓ | ✓ | ✓ | 通过 | 表格内链接在 UI-07a 已是 44px |
| 报表索引 / 试算（UI-07a） | ✓ | ✓ | 卡片入口 + kpi | ✓ | ✓ | ✓ | 通过 | — |
| 期末结账 + 期间准入（UI-07b） | ✓ | ✓ | FastTab + kpi + 分录表 | ✓ | ✓ | ✓ | 修复后通过 | 表格内金额链接已修为 44px，见 §4 |

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
  - 声明已被同元素更高优先级规则全部覆盖的旧规则，如 `.ai-panel` 底色由 `.card` 提供、其余由 `.journals .ai-panel` 覆盖。这类删除以像素差 0 为证据，请设计确认可以接受。
- 组件提升：`.message-bar.warning` 和 `.message-bar.success` 原本在期末、发票、付款、总账等页面 CSS 中重复，原样提升到 `components.css`，各页副本已删除。
- 裸色值：`rg "#[0-9a-fA-F]{3,6}" packages/web/src --glob '!theme/tokens.css'` 结果为空；`contrast.test.ts` 通过。

## 6. 偏差待办

| # | 页面 / 范围 | 偏差 | 建议归属 |
| --- | --- | --- | --- |
| D-1 | 外壳 `App.tsx` | 偏好警告用 `section.warning`，不是 MessageBar（缺左侧 4px 实色条和符号）。改需动 `.tsx` 类名，超出 UI-08 边界 | UI-01 / UI-07d 后续 |
| D-2 | 运行状态 | `overview.css` 保留一份 `.message-bar.warning`，用于组件 chunk 加载失败时的 plainUi 退化，属有意重复 | 设计确认是否接受 |
| D-3 | 迁移核对 | 未用 `PageHeader`，h2 与说明由 `migration.css` 自绘，无边界说明区和教学提示；外观与其他页接近但不共用组件 | UI-07e 后续 |
| D-4 | 凭证、业务事件 | 预览对话框内“确认过账 / 确认”是第二个实心主按钮，背后页面上仍有“预览”主按钮 | 设计确认规则是否按对话框单独计 |
| D-5 | 付款与收款 | `.accounts-scroll td` 的 `inset box-shadow` 与 `.grid td` 底边可能叠成双分隔线。为保持像素一致而原样保留 | UI-06 后续 |
| D-6 | 科目表等 | 表格内禁用复选框（只读状态）为 18px 视觉尺寸，不可交互，脚本不检查；若视为控件应改成徽标（需改 `.tsx`） | UI-02b 后续 |
| D-7 | 全局 | `styles.css` 的全局元素规则未删：无法证明每页每个 `button/select/table` 都已被组件类覆盖（如对话框、details 内表格） | 后续逐页确认后删除 |
| D-8 | 科目表、主数据、期末、发票、付款 / 纠错 | `.message-bar p { margin: 0 }` 在 5 个页面 CSS（accounts、master、period-close、trade-invoices、trade-settlements）中按页作用域重复；提升到组件会影响其他页的 MessageBar 段落间距，未提升 | 设计确认后提升 |
| D-9 | 全部 | 本套截图只有教学开启态；开 / 关两态由各页面任务提供 | — |
