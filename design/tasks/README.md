# 任务总表（团队进度权威来源）

规则：一个任务 = 一个分支 = 一个 PR；状态 `todo` → `in-progress` → `in-review` → `done`，`blocked` 写原因。本表只由设计角色修改（开发/评审角色在 PR 中报告，设计角色同步）。方向与流程见 [路线图](../roadmap.md)，目标架构见 [M0 架构](../m0-architecture.md)。

PR 合并条件（无分支保护，靠约定）：CI 绿 + PR 评审角色通过 + 满足任务文档验收标准。

## M0：技术栈调整 + CI

| ID | 标题 | 依赖 | 冲突域 | 状态 | PR |
| --- | --- | --- | --- | --- | --- |
| [M0-01](M0-01-ci-and-paused-docs.md) | 落地暂停现场文档 + 建立 CI | — | — | done | [#3](https://github.com/lingshf/ai-native-erp/pull/3) |
| [M0-02](M0-02-api-pure-fastify.md) | API 去掉 NestJS，改为纯 Fastify | M0-01 | — | done | [#4](https://github.com/lingshf/ai-native-erp/pull/4) |
| [M0-03](M0-03-remove-postgres-sqlite-hardening.md) | 删除 PostgreSQL；SQLite WAL 与连接设置 | M0-01 | — | done | [#5](https://github.com/lingshf/ai-native-erp/pull/5) |
| [M0-04](M0-04-merge-packages.md) | 6 包合并为 core/infra/web，直接运行 TS 源码 | M0-02, M0-03 | — | done | [#6](https://github.com/lingshf/ai-native-erp/pull/6) |
| [M0-05](M0-05-vitest-biome.md) | 统一 Vitest；引入 Biome | M0-04 | — | done | [#7](https://github.com/lingshf/ai-native-erp/pull/7) |
| [M0-06](M0-06-pin-deps-dependabot.md) | 锁定依赖版本；配置 Dependabot | M0-04 | — | done | [#8](https://github.com/lingshf/ai-native-erp/pull/8) |
| [M0-06a](M0-06a-lockfile-public-registry.md) | lockfile 地址改回公共 registry + 防回归检查 | M0-06 | — | done | [#13](https://github.com/lingshf/ai-native-erp/pull/13) |
| [M0-07](M0-07-ci-layering.md) | CI 分层与预算 | M0-05 | — | done | [#14](https://github.com/lingshf/ai-native-erp/pull/14) |
| [M0-08](M0-08-ledger-companies-accounts.md) | 迁移 1：公司、科目、期间 + 应用外壳 | M0-05 | — | done | [#15](https://github.com/lingshf/ai-native-erp/pull/15) |
| [M0-09](M0-09-ledger-dimensions.md) | 迁移 2：财务维度 | M0-08 | — | done | [#17](https://github.com/lingshf/ai-native-erp/pull/17) |
| M0-09a | 启动先校验运行配置、重依赖延迟加载（M0-09 合并后修复 main Full，无单独任务文档） | M0-09 | — | done | [#18](https://github.com/lingshf/ai-native-erp/pull/18) |
| [M0-10](M0-10-ledger-journals.md) | 迁移 3：凭证草稿/预览/确认与纠错 | M0-09 | — | done | [#19](https://github.com/lingshf/ai-native-erp/pull/19) |
| [M0-11](M0-11-ledger-business-events.md) | 迁移 4：业务事件、过账规则、待转队列 | M0-10 | — | done | [#20](https://github.com/lingshf/ai-native-erp/pull/20) |
| [M0-12](M0-12-ledger-reports-benchmark.md) | 迁移 5：查询与报表 + 100 万 GL 行基准 | M0-10 | — | done | [#21](https://github.com/lingshf/ai-native-erp/pull/21) |
| [M0-13](M0-13-ledger-period-close.md) | 迁移 6：结账与期间推进 | M0-12 | — | done | [#22](https://github.com/lingshf/ai-native-erp/pull/22) |
| [M0-13a](M0-13a-sqlite-event-loop-blocking.md) | 同步 SQLite 阻塞事件循环：度量与处理 | M0-13 | — | done | [#25](https://github.com/lingshf/ai-native-erp/pull/25) |
| [M0-14](M0-14-ai-assistant.md) | 迁移 7：AI 助手（候选） | M0-10 | — | done | [#24](https://github.com/lingshf/ai-native-erp/pull/24) |
| [M0-15](M0-15-remove-legacy-code.md) | 删除旧代码 | M0-08..M0-14, M0-13a | — | done | [#27](https://github.com/lingshf/ai-native-erp/pull/27) |
| [M0-R](M0-R-milestone-review.md) | M0 里程碑评审 + 测试审计（设计角色） | M0-15, M0-06, M0-06a, M0-07, M0-13a | — | done | [#28](https://github.com/lingshf/ai-native-erp/pull/28) |
| [M0-R1](M0-R1-controlled-posting-dates.md) | 控制科目受控过账 + 单据日期/税日期 | M0-R | — | done | [#34](https://github.com/lingshf/ai-native-erp/pull/34) |
| [M0-R2](M0-R2-test-speedup.md) | 测试提速与精简（不阻塞 M1） | M0-R | — | done | [#41](https://github.com/lingshf/ai-native-erp/pull/41)、[#45](https://github.com/lingshf/ai-native-erp/pull/45) |
| [M0-R3](M0-R3-bench-nightly-trim.md) | 每晚 Bench 精简（不阻塞 M1） | M0-R | — | done | [#31](https://github.com/lingshf/ai-native-erp/pull/31) |
| [M0-R4](M0-R4-windows-invalid-snapshot.md) | Windows INVALID_SNAPSHOT 间歇失败（不阻塞 M1；M2 前必须） | M0-R | — | done | [#38](https://github.com/lingshf/ai-native-erp/pull/38) |
| [M0-R5](M0-R5-sqlite-backup-restore.md) | SQLite 目标库备份与恢复（不阻塞 M1；M2 前必须） | M0-R | — | done | [#37](https://github.com/lingshf/ai-native-erp/pull/37) |

## M1：贸易 AP/AR（非库存）

| ID | 标题 | 依赖 | 冲突域 | 状态 | PR |
| --- | --- | --- | --- | --- | --- |
| [M1-01](M1-01-trade-master-data.md) | 贸易主数据 | M0-R | — | done | [#36](https://github.com/lingshf/ai-native-erp/pull/36) |
| [M1-02](M1-02-trade-calculator.md) | 贸易计算器（纯函数） | M0-R | — | done | [#32](https://github.com/lingshf/ai-native-erp/pull/32) |
| [M1-03](M1-03-trade-invoices.md) | 采购/销售发票与未结项、订单行匹配 | M1-01, M1-02, M0-R1 | — | done | [#44](https://github.com/lingshf/ai-native-erp/pull/44) |
| [M1-04](M1-04-trade-settlements.md) | 付款/收款、部分核销与现金折扣 | M1-03 | — | done | [#46](https://github.com/lingshf/ai-native-erp/pull/46) |
| [M1-05](M1-05-trade-prepayments-credits-cancel.md) | 预付/预收、贷项、专用取消与反向 | M1-04 | — | done | [#48](https://github.com/lingshf/ai-native-erp/pull/48) |
| [M1-06](M1-06-trade-open-items-ageing.md) | 未结项、账龄、历史余额与 GL 核对 | M1-05 | — | done | [#49](https://github.com/lingshf/ai-native-erp/pull/49) |
| [M1-07](M1-07-trade-e2e-bench.md) | GUI 端到端验收与性能基准 | M1-06 | bench/CI, web-ui:trade | done | [#54](https://github.com/lingshf/ai-native-erp/pull/54)、[#56](https://github.com/lingshf/ai-native-erp/pull/56) |
| [M1-R](M1-R-milestone-review.md) | M1 里程碑评审 + 测试审计（设计角色） | M1-07 | — | done（随 #57 合并落地，不是基线 `336c0cd` 中已合并的内容） | [#57](https://github.com/lingshf/ai-native-erp/pull/57)，报告见 [design/reviews/M1.md](../reviews/M1.md) |
| [M1-R1](M1-R1-trade-order-entry.md) | 非库存订单录入 GUI（不阻塞 v0.2.0） | M1-R | — | 已拆分：M1-R1a、M1-R1b，见 [S4](#s4ui-1-后续--m1-遗留建议-v040) | |
| [M1-R2](M1-R2-trade-teaching-and-lists.md) | 贸易页教学提示补齐 + 调整页列表虚拟滚动（不阻塞 v0.2.0） | M1-R | — | 已拆分：M1-R2a、M1-R2b，见 [S4](#s4ui-1-后续--m1-遗留建议-v040) | |
| [M1-R3](M1-R3-trade-report-capacity.md) | 账龄/余额容量：带历史与并发的基准（不阻塞 v0.2.0） | M1-R | — | done | [#78](https://github.com/lingshf/ai-native-erp/pull/78) |
| [M1-R4](M1-R4-trade-test-trim.md) | 贸易 E2E 精简、断言、400 日志分类、LF 行尾（不阻塞 v0.2.0） | M1-R | — | done | [#81](https://github.com/lingshf/ai-native-erp/pull/81) |

## M2：账套迁移/切换（草案，需用户授权）

**开工门禁**：M0-R4、M0-R5 都合并后 M2 才开工。M2-01、M2-02 显式依赖两者，其余任务经依赖传递继承。开发、CI 和 Bench 只用虚构夹具。

| ID | 标题 | 依赖 | 冲突域 | 状态 | PR |
| --- | --- | --- | --- | --- | --- |
| [M2-01](M2-01-legacy-snapshot-producer.md) | 旧账快照与旧账备份生成 | M0-R4, M0-R5 | — | done | [#42](https://github.com/lingshf/ai-native-erp/pull/42) |
| [M2-02](M2-02-legacy-import-mapping.md) | 旧账→目标库映射与 dry-run | M0-R4, M0-R5 | — | done | [#43](https://github.com/lingshf/ai-native-erp/pull/43) |
| [M2-03](M2-03-legacy-import-execute.md) | 导入执行（写入新的目标库） | M2-02, M0-R1 | migrations(014)+migrations.ts, domain-posting, storage, admin-cli | done | [#47](https://github.com/lingshf/ai-native-erp/pull/47) |
| [M2-03b](M2-03b-legacy-opening-open-items.md) | 旧账 AP/AR 期初未结项导入与核对口径（D25） | M2-03, M1-06 | legacy-import, domain-posting, storage, admin-cli, web-ui:trade | done | [#63](https://github.com/lingshf/ai-native-erp/pull/63) |
| [M2-04](M2-04-legacy-reconciliation.md) | 迁移核对报告（首批，现行 `tradeReconciliation` + 期初门禁 fail-closed，D26） | M2-03 | — | done | [#59](https://github.com/lingshf/ai-native-erp/pull/59) |
| [M2-04b](M2-04-legacy-reconciliation.md#跟进-m2-04bd25d26) | M2-04 跟进：贸易子账按 P 公式核对、期初负例（D25/D26） | M2-04, M2-03b | — | done | [#70](https://github.com/lingshf/ai-native-erp/pull/70) |
| [M2-05](M2-05-migration-rehearsal.md) | 隔离试迁移演练与操作手册 | M2-01, M2-04b（D25 全部完成） | bench/CI, docs/runbook | todo | |
| [M2-06](M2-06-controlled-cutover.md) | 受控切换与回退 | M2-05 | admin-cli, docs/runbook | todo | |
| [M2-R](M2-R-milestone-review.md) | M2 里程碑评审 + 测试审计（设计角色） | M2-06 | — | todo | |

**待用户决定**（已报告协调者）。三项都**没有真实操作的默认值**：未决定时，任务的工具开发和虚构验收照常进行，只有对应的真实操作不能执行。

- A：是否授权对真实旧账的私有副本取快照并做隔离演练（M2-05）。未授权前不读取真实旧账。
- B：是否授权真实停写与切换（M2-06），以及切换后新运行时的端口（当前新运行时拒绝 4173）。未授权前不停 4173、不切换。
- C：导入范围——草稿（含 ID3）导入为草稿还是跳过；回执、来源事件、转账队列、封印、审计分别导入还是只做只读归档。未确认前，对真实数据只允许 dry-run 列出选项和数量，不做真实导入。虚构夹具测试中显式传入的选项只是测试数据，不代表这项决定。

**已决**：
- D25（协调者代定，M1-R 提出）：旧账 AP/AR 控制科目余额在切换时导入为期初未结项，使贸易子账与 GL 一致；不采用“其他来源差异另行清理”。由 M2-03b 实现，M2-04b 核对，M2-05 之前必须完成。
- D26（协调者代定）：M2-04 先按原边界交付首批，复用现行 `tradeReconciliation`。没有期初完成证据（M2-03b 的 `opening=done` 标记）时 fail-closed，判 `阻断`、标注“待 M2-03b 消除”，不因净额为 0 放行。M2-03b 不是首批的硬前置；P 公式和期初负例在 M2-03b 合并后由 M2-04b 验收。M2-05 要等 D25 全部完成（M2-03b 与 M2-04b）。
- D30（协调者代定）：M2-03b 在不新增迁移的前提下补足六处冲突/空白——期初来源记入 `legacy_refs`，来源凭证按唯一规则选取；主数据由明细文件提供；期初项科目角色放宽（同方向、同伙伴、同币种）；期初项只参与付款核销和 apply，贷项和取消以 `reference` 拒绝；切换日取旧账最后记账日；口径 5 用文件 `partnerDimension`。详见 [M2-03b](M2-03b-legacy-opening-open-items.md)。

见 [M1 评审 §7](../reviews/M1.md) 与[路线图 §6](../roadmap.md#6-决定记录)。

## UI-1：界面逐步改进

**目标**：在现有 `packages/web` 上分步调整，好看、简洁；业务功能与流程不变，不推倒重来。规范、原型和改前 / 改后截图见 [design/ui/README.md](../ui/README.md)。实施由协调者按下表派给开发（Opus 模型），设计角色负责评审截图与 UI-08 审查。

| ID | 标题 | 依赖 | 冲突域 | 状态 | PR |
| --- | --- | --- | --- | --- | --- |
| [UI-01](UI-01-tokens-and-shell.md) | 设计 token + 布局外壳（顶栏偏好、分组导航、对比度测试） | — | web-ui:shell | done | [#62](https://github.com/lingshf/ai-native-erp/pull/62) |
| [UI-02a](UI-02a-report-components-and-trade-reports.md) | 报表组件 + 往来未结项与账龄页（样板页，影响限本页） | UI-01 | web-ui:components, web-ui:trade | done | [#65](https://github.com/lingshf/ai-native-erp/pull/65) |
| [UI-02b](UI-02b-form-components-and-accounts.md) | 表单组件（Field / FormGrid / FastTab）+ 科目表页 | UI-02a | web-ui:components, web-ui:master | done | [#67](https://github.com/lingshf/ai-native-erp/pull/67) |
| [UI-03](UI-03-trade-invoices.md) | 采购与销售发票页 | UI-02b | web-ui:trade | done | [#75](https://github.com/lingshf/ai-native-erp/pull/75) |
| [UI-04](UI-04-master-data.md) | 主数据页：财务维度、贸易主数据 | UI-02b | web-ui:master, web-ui:trade | done | [#77](https://github.com/lingshf/ai-native-erp/pull/77) |
| [UI-05](UI-05-journals-and-events.md) | 凭证与业务事件页 | UI-02b | web-ui:journals | done | [#69](https://github.com/lingshf/ai-native-erp/pull/69) |
| [UI-06](UI-06-trade-settlements-and-adjustments.md) | 付款与收款、预付 / 贷项 / 专用纠错页 | UI-03 | web-ui:trade | done | [#76](https://github.com/lingshf/ai-native-erp/pull/76) |
| [UI-07a](UI-07a-ledger-reports.md) | 总账报表、快照报表、报表索引 | UI-02a | web-ui:ledger | done | [#68](https://github.com/lingshf/ai-native-erp/pull/68) |
| [UI-07b](UI-07b-period-close.md) | 期末结账 + 贸易期间准入 | UI-02b | web-ui:period-close, web-ui:trade | done | [#80](https://github.com/lingshf/ai-native-erp/pull/80) |
| [UI-07c](UI-07c-ai-panel.md) | AI 面板 | UI-05 | web-ui:journals | done | [#72](https://github.com/lingshf/ai-native-erp/pull/72) |
| [UI-07d](UI-07d-overview.md) | 运行状态页（`App.tsx` 中的 `Overview`） | UI-02a | web-ui:shell | done | [#71](https://github.com/lingshf/ai-native-erp/pull/71) |
| [UI-07e](UI-07e-migration.md) | 迁移核对页（#59 带入的 `Migration.tsx`） | UI-02a | web-ui:migration | done | [#74](https://github.com/lingshf/ai-native-erp/pull/74) |
| [UI-08](UI-08-polish-and-audit.md) | 收尾：删除兼容样式、组件提升、一致性审查（不重做页面） | UI-01 … UI-07e | web-ui:shell, web-ui:components | done | [#82](https://github.com/lingshf/ai-native-erp/pull/82) |

UI-1 的 13 项已全部合并，随 v0.3.0 发布。设计一致性审查 [design/reviews/UI-1.md](../reviews/UI-1.md) §6、§8 的后续项已立项为 UI-09a..g（只改 CSS）与 UI-10a..g（需改 `.tsx`），见下文 [S4](#s4ui-1-后续--m1-遗留建议-v040)。

**页面归属**（每个页面文件只有一个负责任务；UI-08 不接手任何页面）：

| 页面 / 文件 | 负责任务 |
| --- | --- |
| 外壳：`App.tsx` 顶栏、导航、`main`；`main.tsx` | UI-01 |
| 运行状态：`App.tsx` 中的 `Overview`、`useHealth` | UI-07d |
| `TradeReports.tsx` | UI-02a |
| `Accounts.tsx` | UI-02b |
| `TradeInvoices.tsx` | UI-03 |
| `Dimensions.tsx`、`TradeMaster.tsx` | UI-04 |
| `Journals.tsx`、`BusinessEvents.tsx` | UI-05 |
| `TradeSettlements.tsx`、`TradeAdjustments.tsx` | UI-06 |
| `LedgerReports.tsx`、`Reports.tsx`（含 `ReportIndex`） | UI-07a |
| `PeriodClose.tsx`、`TradePeriodAdmission.tsx` | UI-07b |
| `AiPanel.tsx` | UI-07c |
| `Migration.tsx` | UI-07e |
| `TradeOrders.tsx`（S4 新增） | M1-R1a |
| `styles.css` 兼容层清理 | UI-08（边界见任务文件）；全局元素规则删除归 UI-09g（只删已证实可删的属性；仍生效的保留，下一 Sprint 按页迁移） |

今后新增页面时，在同一 PR 中把它加入本表。新页面直接使用 token 与组件类，不写入 `styles.css`。

**派发与并行**：

1. UI-01 → UI-02a → UI-02b，依次串行。
2. UI-02a 合并后，可与 UI-02b 并行的有：
   - UI-07a（ledger）；
   - UI-07d（shell，与改 `App.tsx` 的其他任务串行）；
   - UI-07e（migration，与 M2-04 跟进等仍改 `web-ui:migration` 的任务串行）。
3. UI-02b 合并后分三条线并行：
   - 凭证线：UI-05 → UI-07c；
   - 贸易线：UI-03 → UI-06，UI-04、UI-07b 穿插。四个任务都改 `web-ui:trade`，同一时间只开一个，也不能与 M1-R1、M1-R2、M2-03b 同时开工；
   - 其余已就绪的 UI-07a、UI-07d、UI-07e。
4. 页面归属表全部完成后做 UI-08。

UI 任务不改迁移、领域和 infra 代码，与 `legacy-import`、`admin-cli` 等冲突域不相交。新增导航入口的任务会改 `App.tsx`，与 UI-01、UI-07d、UI-08 不能同时开工。

**UI-1 通用验收标准**（每个 UI 任务都必须满足，任务文件只列附加项）：

1. **截图对比**：PR 中附改前 / 改后截图，至少两组：中文 + 专业红、English + 专业绿，宽 1440 与 390，DPR = 1。PNG 宽度必须等于视口宽，且 `document.documentElement.scrollWidth` 不超过视口宽，表格只在自身容器内滚动；截图脚本断言这一点，写法参照 [capture-prototypes.mjs](../ui/capture-prototypes.mjs)。改前图若本身溢出（如 v0.2.0 发票页 2066px），在对比表注明实际尺寸，不与 1440 图按同条件对比。只用虚构夹具，不使用真实账套、4173 或 `.bak`。
2. **中英文**：所有新增或移动的文字走 labels，中英齐全；不出现硬编码文字；英文长文案不截断、不溢出。
3. **红绿主题**：两主题下都检查；组件只引用 token，不写裸色值。
4. **对比度达标**：`node design/ui/check-contrast.mjs`（UI-01 起为 `contrast.test.ts`）通过。文字 ≥ 4.5:1；控件边界及其悬停、按下、选中等交互态对实际底色 ≥ 3:1。新增颜色配对或交互态时，同时加入检查。
5. **现有测试不删除、不削弱**：
   - 涉及范围：
     - `packages/web/test/*.test.{ts,tsx}`；
     - 真实 Chrome 贸易场景：完整键盘主路径 `packages/infra/test/http/trade-gui-{zh-red,en-green}-{1,2}.slow.test.ts`（每个组合分两段）、四组合页面级冒烟 `trade-gui-smoke.slow.test.ts`，及其共享场景 `packages/infra/test/support/trade-gui-scenario.ts`；
     - `packages/infra/test/http/migration-gui.slow.test.ts`。
   - 不删用例、不放宽断言、不改选择器，只允许**新增**断言。
   - ID、按钮可访问名称、`nav a[href]`、`main h2`、`.workspace[data-theme]`、`html[lang]` 不变。
   - **精确 head 的真实浏览器证据**：PR 快速 CI 不跑 `*.slow.test.ts`，Full 只在 main push 与定时任务上运行，所以每个实施 PR 都要在 PR 当前 head 上本地运行上述 slow 测试：
     ```
     ERP_E2E_BROWSER_CHANNEL=chrome npx vitest run trade-gui- migration-gui.slow
     # PowerShell：$env:ERP_E2E_BROWSER_CHANNEL="chrome"; npx vitest run trade-gui- migration-gui.slow
     ```
     必须用真实 Chrome，不用 headless shell 或 Edge 替代。在 PR 中贴出 head SHA、命令、通过摘要和 `ERP_E2E_ARTIFACTS` 截图。head 每变一次（含 rebase），重新运行并更新证据；SHA 不符的证据无效。
   - 不把 slow 测试加入 PR 快速 CI，不改 workflow。
   - **合并后跟踪 main Full**：合并者记录合并提交，并跟踪覆盖该提交的 main Full 运行；被后续 push 取消时，按[路线图 §5](../roadmap.md#5-团队流程)的解锁规则处理。在它变绿之前，不派发同冲突域的下一个 UI 任务。若变红且与本任务相关，由同一任务修复或回退，不靠修改断言过关。
6. **键盘**：Tab 顺序与视觉一致；焦点框可见；E2E 键盘路径在 220 次 Tab 上限内不改即通过；快捷键不变。
7. **教学模式**：开 / 关两态截图；关闭后不隐藏边界说明、风险、必填信息、错误与警告。
8. **业务不变**：不改接口调用、字段、校验、按钮顺序语义与禁用逻辑；虚拟列表行高 44 / 48 不变。
9. **性能边界（PG-05）**：
   - **保留**：
     - `App.tsx` 现有 12 个 `lazy()` 路由，不把页面组件改为静态导入；
     - 各页请求次数、分页参数与 API 上限；
     - `useVirtualizer`（科目、维度、凭证、发票、贸易主数据、付款与收款）的行高与 overscan；
     - 不新增运行时依赖（`package.json` 的 `dependencies` 不变），不引入网络字体。
   - **包体积对照**：PR 中贴出 base 与 head 的 `npm run build` 输出对照（gzip）。基线为 main `f35aa54`：入口 `index-*.js` 164.17 kB、`index-*.css` 2.02 kB，各路由 chunk 0.45–7.38 kB。各任务预算：

     | 任务 | 入口 JS（gzip） | CSS 合计（gzip） | 本任务路由 chunk（gzip） |
     | --- | --- | --- | --- |
     | UI-01 外壳 | ≤ +2 kB | ≤ 6 kB | 不变 |
     | UI-02a / UI-02b 组件 | ≤ +2 kB（各） | ≤ +2 kB（各） | ≤ +15% |
     | 其余页面任务 | ≤ +0.5 kB | ≤ +1.5 kB | ≤ +15% |
     | UI-08 收尾 | 不增 | 不增（应减少） | 不增 |

     超出预算须在 PR 中说明原因，并经评审同意。
   - **首载与路由加载**：由上表的入口 / 路由 chunk 对照代表；不另设计时基准。
   - **不适用**：热读 p95、预览 / 确认 p95、100 万行 GL 基准均不适用，因为 UI 任务不改接口、查询和事务。PR 中注明“不适用（无接口变化）”。

## S4：UI-1 后续 + M1 遗留（建议 v0.4.0）

**目标**：在不改后端规则和迁移的前提下，做三件事：
- 收尾 UI-1 审查留下的小步改进；
- 补上 M1 遗留的订单录入 GUI 与贸易页教学、列表；
- 落实 v0.3.0 回顾的行动项。

版本号由协调者定。基线为 main `2a23025`（v0.3.0 之后）。

**不在本 Sprint**：
- M2-05 / M2-06：需要用户授权决定 A / B，见上文 M2 节；
- 订单列表：需要新增列表 API，见 M1-R1a 决定 P2；
- 任何新迁移。

M1-R3（#78）、M1-R4（#81）已完成。

| ID | 标题 | 类型 | 依赖 | 冲突域 | 状态 | PR |
| --- | --- | --- | --- | --- | --- | --- |
| [UI-09a](UI-09a-components-css.md) | 组件样式：禁用 subtle（F3）、segmented 选中态（F10）、窄表滚动提示（F2 组件部分）、`.message-bar p` 全局规则（D-8） | CSS | — | web-ui:components, tests:contrast | done | [#89](https://github.com/lingshf/ai-native-erp/pull/89) |
| [UI-09b](UI-09b-shell-brand-css.md) | 外壳窄屏品牌名（F1） | CSS | M1-R1a（外壳串行）、UI-09e（A 线前序） | web-ui:shell | done | [#102](https://github.com/lingshf/ai-native-erp/pull/102) |
| [UI-09c](UI-09c-master-css.md) | 科目表 / 主数据：桌面 36px（F5）、滚动提示（F2）、删除 D-8 副本 | CSS | UI-09a | web-ui:master | done | [#92](https://github.com/lingshf/ai-native-erp/pull/92) |
| [UI-09d](UI-09d-ledger-period-close-css.md) | 总账报表 / 期末结账：金额链接（F4）、行表头与复选框（F6）、36px（F5）、删除 D-8 副本 | CSS | UI-09c（A 线前序，含 UI-09a） | web-ui:ledger, web-ui:period-close, tests:contrast | done | [#98](https://github.com/lingshf/ai-native-erp/pull/98) |
| [UI-09e](UI-09e-journals-css.md) | 凭证新建去掉框中框（F7） | CSS | — | web-ui:journals | done | [#99](https://github.com/lingshf/ai-native-erp/pull/99) |
| [UI-09f](UI-09f-trade-css.md) | 发票 / 付款：桌面 36px（F5）、删除 D-8 副本 | CSS | UI-09a | web-ui:trade | done | [#97](https://github.com/lingshf/ai-native-erp/pull/97) |
| [UI-09g](UI-09g-global-element-rules.md) | 删除 `styles.css` 全局元素规则（D-7，属性级证据） | CSS | UI-09a..f、UI-10a（外壳串行最后） | web-ui:shell | done | [#106](https://github.com/lingshf/ai-native-erp/pull/106) |
| [UI-10a](UI-10a-shell-preference-messagebar.md) | 外壳偏好警告改用 MessageBar（D-1） | 页面 tsx | UI-09b | web-ui:shell | done | [#104](https://github.com/lingshf/ai-native-erp/pull/104) |
| [UI-10b](UI-10b-journals-action-column.md) | 凭证列表操作列表头与“查看”列宽（F8） | 页面 tsx | UI-09e | web-ui:journals | done | [#101](https://github.com/lingshf/ai-native-erp/pull/101) |
| [UI-10c](UI-10c-accounts-enabled-badge.md) | 科目表只读“启用”改徽标（D-6） | 页面 tsx | UI-09c、UI-09d（共用 `contrast.test.ts`） | web-ui:master, tests:contrast | done | [#100](https://github.com/lingshf/ai-native-erp/pull/100) |
| [UI-10d](UI-10d-trade-master-enabled-badge.md) | 贸易主数据只读“启用”改徽标（D-6） | 页面 tsx | UI-09c, UI-10c | web-ui:master, web-ui:trade | done | [#103](https://github.com/lingshf/ai-native-erp/pull/103) |
| [UI-10e](UI-10e-migration-header-and-details.md) | 迁移核对页：PageHeader、教学提示（D-3）、键值明细（F9） | 页面 tsx | — | web-ui:migration | done | [#87](https://github.com/lingshf/ai-native-erp/pull/87) |
| [UI-10f](UI-10f-invoice-add-line-label.md) | 发票“新增行”快捷键显示（F11） | 页面 tsx | — | web-ui:trade | done | [#93](https://github.com/lingshf/ai-native-erp/pull/93) |
| [UI-10g](UI-10g-period-admission-saved-message.md) | 期间准入保存提示措辞（Sprint 评审遗留） | labels | — | web-ui:trade | done | [#94](https://github.com/lingshf/ai-native-erp/pull/94) |
| [M1-R1a](M1-R1a-trade-order-entry-page.md) | 非库存订单录入页（新页面，懒加载） | 新页面 + shell | — | web-ui:trade-orders, web-ui:shell | done | [#91](https://github.com/lingshf/ai-native-erp/pull/91) |
| [M1-R1b](M1-R1b-trade-order-gui-e2e.md) | E2E 主路径改用 GUI 建订单 | 测试 | M1-R1a | tests:trade-e2e（可能 bench/CI） | done | [#95](https://github.com/lingshf/ai-native-erp/pull/95) |
| [M1-R2a](M1-R2a-trade-teaching-tests.md) | 贸易页教学提示补齐与开 / 关测试 | 贸易 | — | web-ui:trade | done | [#88](https://github.com/lingshf/ai-native-erp/pull/88) |
| [M1-R2b](M1-R2b-trade-adjust-picker-filter.md) | 纠错页未结项选择按伙伴筛选（替代虚拟滚动） | 贸易 | M1-R2a | web-ui:trade | done | [#90](https://github.com/lingshf/ai-native-erp/pull/90) |
| [PROC-01](PROC-01-release-claims-and-demo.md) | 发布流程：断言来源、Demo 实跑模板（版本管理） | 文档 | — | docs/release | done | [#86](https://github.com/lingshf/ai-native-erp/pull/86) |

回顾的另外两项由本 PR 直接落地：
- “合并检查清单加入任务表同步”与“运维可见变化写明旧值 → 新值”，写入[路线图 §5](../roadmap.md#5-团队流程)；
- “调整 Full 分片前先剖析 runner 冷启动”，写入[路线图 §4](../roadmap.md#4-ci-与测试策略设计角色牵头)；
- “UI-09 立项与排期”即本节。

**产品负责人决定**（协调者可推翻；推翻时由设计角色同步任务文件）：

- **P1**：F5 统一为桌面 36px，窄屏（≤ 760）和粗指针 44px，依据 [design/ui/README.md](../ui/README.md) §7，回应 v0.3.0 Sprint 评审问题 2。发布文档中的点击区说法按 PROC-01 改为分端说明。
- **P2**：M1-R1 按现有 API 收窄范围：无订单列表、无保存前金额预览，只显示服务端返回的金额。见 [M1-R1a](M1-R1a-trade-order-entry-page.md)。
- **P3**：D-6 改徽标后，`accounts.test.tsx:100` 的只读复选框断言以同等强度替换。本 Sprint 只有这一条已有断言允许替换，见 [UI-10c](UI-10c-accounts-enabled-badge.md)。贸易主数据目前没有断言行内只读复选框的测试（main `2a23025` 已核对），所以 [UI-10d](UI-10d-trade-master-enabled-badge.md) 只新增徽标断言，不替换任何断言；若实施时发现这类断言，停下报告设计角色，不自行替换。
- **P4**：F11 的“新增行”按钮可访问名称去掉括号中的快捷键，改由 `aria-keyshortcuts` 提供；测试都通过 `t()` 定位，不需要修改。见 [UI-10f](UI-10f-invoice-add-line-label.md)。
- **P5**：纠错页未结项是原生 `select`，属于 E2E 契约，不改为虚拟滚动，改为服务端按伙伴筛选。见 [M1-R2b](M1-R2b-trade-adjust-picker-filter.md)。

**通用验收**：所有 UI 任务都满足 [UI-1 通用验收标准](#ui-1界面逐步改进) 1–9。各任务的 PG-05 预算写在任务文件中，按以下口径度量（取代上面基线 `f35aa54`）：

- **基线**：PR 的实际 base，即 `git merge-base origin/main HEAD`。base 与 head 各在干净工作区运行 `npm run build -w packages/web`，贴出 Vite 输出中每个文件的 gzip 列。rebase 后重新对照。
- **“不变”**：该文件 gzip 差 ≤ 0.02 kB。文件名 hash 变化不算变化：只改 CSS 时，JS chunk 中引用的 CSS 文件名会变，hash 随之改变。只改 CSS 的任务另须证明 `git diff --stat <base>..HEAD -- '*.ts' '*.tsx'` 只含测试文件，即 JS 逻辑不变。
- **“不增 / ≤ +x kB”**：以 gzip 列计，CSS 合计 = 全部 `.css` 文件之和；“本任务路由 chunk”指该页面 `lazy()` 产生的 chunk。
- **文案任务**：labels 打包在入口 JS 中，改文案必然改入口。此类任务的预算写成入口 JS 的 gzip 上限，另要求请求次数与逻辑不变（见 [UI-10g](UI-10g-period-admission-saved-message.md)）。

**三名开发的并行安排**（同一行内串行；不同行同时进行时冲突域不相交）：

| 线 | 顺序 | 冲突域 |
| --- | --- | --- |
| A：CSS | UI-09a → UI-09c → UI-09d → UI-09e → UI-09b → UI-09g | components + contrast → master → ledger / period-close + contrast → journals → shell |
| B：贸易（web-ui:trade 串行） | M1-R2a → M1-R2b → UI-10f → UI-10g → UI-09f → UI-10d | trade（UI-10d 另含 master） |
| C：其他页面与新页 | UI-10e → M1-R1a → M1-R1b → UI-10b → UI-10c → UI-10a | migration → trade-orders + shell → tests:trade-e2e → journals → master + contrast → shell |

- **首批可同时开工**：UI-09a（A）、M1-R2a（B）、UI-10e（C）。
- **跨线等待**（都已写在表的“依赖”列；按表派发即可，不靠本段散文）：
  - UI-09b 等 M1-R1a（外壳）；
  - UI-09g 等 UI-10a（外壳）；
  - UI-10b 等 UI-09e；
  - UI-10c 等 UI-09c，并等 UI-09d：两者都改 `contrast.test.ts`（`tests:contrast`），而 C 线到 UI-10c 时 A 线可能正在做 UI-09d；
  - UI-10d 等 UI-09c 与 UI-10c；
  - UI-09f 等 UI-09a。
- **外壳串行**：M1-R1a → UI-09b → UI-10a → UI-09g，由上述表内依赖保证。这四个任务同一时间只开一个。
- **对比度测试串行**：UI-09a → UI-09d → UI-10c 依次修改 `contrast.test.ts`。其他任务若需要新增配对，先报告设计角色加入依赖，不并行修改。
- **UI-09g** 的证据覆盖全部页面。开工时若有改页面 CSS 的任务在进行，等其合并；rebase 后 main 上有新的页面 CSS，就重新采集证据。
- **M1-R1b** 改共享 E2E 场景，与它同时进行的贸易任务合并后要 rebase 并重跑真实 Chrome 场景。若需调整 Full 分片，同一时间只开一个改 workflow 的任务。
- **PROC-01** 由版本管理负责，不计入开发上限，随时可做。
- 每个任务合并后，按[路线图 §5 合并后动作](../roadmap.md#5-团队流程)跟踪 main Full，含 Full 被后续 push 取消时的解锁规则。变绿前不派发同一冲突域的下一个任务。
- S4 验收对照（Sprint 评审用）：[design/reviews/S4.md](../reviews/S4.md)。

## S5 待办：`styles.css` 剩余全局元素规则（候选，未排期）

来源：UI-09g [#106](https://github.com/lingshf/ai-native-erp/pull/106)（head `f269d23`，合并为 main `662a763`）的属性级证据表“保留”部分，摘要见 [UI-1.md §5.2](../reviews/UI-1.md#52-ui-09gstylescss-全局元素规则删除记录)。这些声明在 UI-09g 中原样保留，因为删除后计算值会改变，或者仍有采集状态覆盖不到的依赖。S5 立项时由设计角色拆成任务文件，以下是按冲突域的候选范围，ID 暂定。

共同方法与验收：
- 在各页（组件）CSS 中用类规则给出同等的值，需要类名时再改 `.tsx`。
- 用 UI-09g 的 `rules-probe.mjs` 证明该页命中的全局声明删除后计算值不变（“变”为 0），并补采原先覆盖不到的状态，如 BusinessEvents 的各个表单。
- 每个任务只改自己的冲突域，**不改 `styles.css`**。全局规则的最终删除只在 S5-g 做一次。
- 满足 [UI-1 通用验收标准](#ui-1界面逐步改进) 1–9，PG-05 口径同 S4。

| 暂定 ID | 冲突域 | 依赖全局规则的声明（UI-09g 证据） | 类型 |
| --- | --- | --- | --- |
| S5-a | web-ui:journals | BusinessEvents.tsx 无类的 `legend`（font-weight、padding）、`form > fieldset > label > select`（width / background / color / border / radius / padding / min-height）、无类按钮（:407 `.segmented`、1125、1183、1401/1402、1467、1701/1702 的 background / color / border / padding / cursor / font-weight / hover / active / disabled）、VirtualRows 表头 :860、1174 的 `th, td { padding }`；凭证页复选框 | 页面 tsx + CSS |
| S5-b | web-ui:migration | `dl { display }`、`dt { color }`、`dd { margin }`、`@media 680 dd { margin-bottom }`、`thead { background }`；另含已有问题：`.kv` 表不在独立滚动区（UI-10e 引入，版式检查报 `not in own scroller`） | CSS（必要时 tsx） |
| S5-c | web-ui:trade | 发票 / 结算复选框（width / height / flex-shrink / accent-color）、`.tinv-facts` / `.trpt-facts` 的 `dl { display }`、贸易报表 `button.cell-link { border-radius }`、发票过账预览 / PO 匹配 `caption` | CSS |
| S5-d | web-ui:trade-orders | 订单页复选框、`.tord-facts` 的 `dl { display }`（若仍依赖） | CSS |
| S5-e | web-ui:ledger、web-ui:period-close、web-ui:master | 报表 / 期末 `caption`（text-align / font-weight / padding）；总账明细 `th, td`（vertical-align / min-width / text-align）、总账 tfoot `td { padding }`；期末 fieldset 内 `.journal-scroll` 的 `th, td { padding }`；科目表 `td { text-align }`（left → start） | CSS |
| S5-f | web-ui:shell、web-ui:components | 外壳偏好 `legend { font-weight }`、`select { max-width }`、复选框；概览 `dd { font-weight }`；`.field` 下 `select { max-width }`；VirtualRows `tfoot { background }` | CSS |
| S5-g | web-ui:shell | 依赖 S5-a..f：删除 `styles.css` 中剩余全局元素规则，方法与证据同 UI-09g，全部采集点“变”为 0、像素差 0 | CSS |

## 派发顺序

1. 第一批（按顺序，同时只开一个以避免 `package.json`/lock 冲突）：M0-01 → M0-02 → M0-03 → M0-04 → M0-05 → M0-06→ M0-07。M0-02 与 M0-03 可并行，后合并者重新生成 lock。
2. 第二批：M0-08 → M0-09 → M0-10 → 之后 M0-11、M0-12、M0-14 可并行 → M0-13 → M0-13a → M0-15→ M0-R。
3. M1 在 M0-R 完成后开始；M1-01 与 M1-02 可并行。M0-R1 与它们并行，必须在 M1-03 之前合并；M0-R2..R5 不阻塞 M1，穿插派发（建议 M0-R3 优先，以节省 Actions 分钟数）；M0-R4、M0-R5 是 M2 的前置门禁。M0 评审报告见 [design/reviews/M0.md](../reviews/M0.md)。
4. **并行规则**（提高并行度，可同时派给多个开发角色或一个开发角色的多个分支）：
   - 依赖已满足、且“冲突域”不重叠的任务可以并行。冲突域列出的是实际会改的文件/测试范围，包括共用文件；只给未完成任务填写，已完成任务填 `—`。冲突域相交的任务不能同时开工，除非下面另有串行集成规则。
   - 冲突域含义：
     - `migrations(NNN)+migrations.ts`：新增的迁移 SQL 及预留编号，加上**所有迁移都会改的共用文件** `packages/infra/src/storage/migrations.ts`（manifest 数组与对象/schema 检查）。
     - `domain-posting`：凭证过账管道和控制科目/期间规则（core journals、business-events、period）。
     - `storage`：infra 存储层与事务。
     - `admin-cli`：存储管理 CLI。
     - `bench/CI`：`.github/workflows`、`packages/infra/bench`、`scripts/ci.ts`。
     - `tests`：跨模块的测试精简。
     - `legacy-reader`：只读旧账读取器。
     - `legacy-teaching 测试`：`packages/infra/test/**/legacy-teaching*` 用例及其夹具（M0-R2 要精简，M0-R4 要复现和修夹具）。
     - `pure-calc`：纯函数计算（M1-02）。
     - `legacy-snapshot`：只读旧账快照生成（M2-01）。
     - `legacy-import`：旧账映射、导入计划与核对（`packages/infra/src/legacy/` 下的新模块，不含已有读取器）。
     - `docs/runbook`：迁移操作手册 `docs/migration-runbook.md`。
     - `trade-master`/`trade-docs`：贸易主数据/单据代码。
     - `web-ui:<页面>`：对应页面及其 labels 文件。
     - `web-ui:shell`：`packages/web/src/App.tsx`（外壳与 `Overview` 运行状态页）、`main.tsx`、`src/theme/{tokens,base,shell}.css`、`styles.css`、`labels.ts` 中 `shell.*`。
     - `web-ui:components`：`src/theme/components.css` 与 `src/ui/components/`（UI-1 共享组件）；页面任务需要新通用样式时先放页面 CSS，由 UI-08 统一提升。
     - `web-ui:period-close`：`PeriodClose.tsx` 及其 labels；`web-ui:migration`：`Migration.tsx` 及其 labels（M2-04 与 UI-07e 共用）。
     - 页面 CSS `src/pages/<页面>.css` 属于对应页面的冲突域，例如 `trade-invoices.css` 属于 web-ui:trade，`accounts.css` 属于 web-ui:master。只改 CSS 的任务也按此计算。
     - `web-ui:trade-orders`（S4 新增）：`TradeOrders.tsx`、`trade-order-labels.ts`、`pages/trade-orders.css` 及其测试。
     - `tests:trade-e2e`：`packages/infra/test/support/trade-gui-scenario.ts` 与 `trade-gui-*.slow.test.ts`。只运行这些测试不算占用，修改才算。
     - `docs/release`：`docs/release/`、`docs/demo/` 下的流程文档与模板（版本管理）。
     - `tests:contrast`（S4 新增）：`packages/web/test/contrast.test.ts`。多个页面任务都会向它追加配对，修改它的任务互相串行，即使页面冲突域不相交。
   - **迁移的串行集成**（带迁移的任务可以并行开发，但集成必须串行）：
     - 运行器按 `migrations.ts` 中 manifest 数组的**位置**写入版本号（`index + 1`），并校验每个版本的 checksum（`migrations.ts:83-91,163-168,177-188`），不看文件名。已进入 main 的迁移前缀、顺序和 checksum 都不能改。
     - 编号由设计角色在本表预留（main 已到 013；M2-03 预留 014，必须在 013 之后，不参与下面的互换规则）。带迁移的 PR 必须按预留编号顺序合并。
     - 如果编号大的任务先就绪（例如 M1-01 的 009 先于 M0-R1 的 008）：由协调者重新分配编号，两个任务**同时改号**（例如 008/009 互换），不能只改其中一条；设计角色同步更新本表。
     - 集成由准备合并的那个任务的开发者串行完成：rebase 到最新 main，同步改迁移文件名、manifest 顺序和 schema/对象检查，跑包含从旧版本升级的 CI，评审角色按新 head 重新评审后才能合并。同一时间只做一个迁移集成。
     - 改同一张表的两个任务不能并行开发。
   - 公共文件（`package.json`/lockfile、`web/src/App.tsx` 路由与导航、`ui/index.ts`、contracts 汇总导出）：只做追加式小改动，由后合并者 rebase 解决。改 `package.json`/lockfile 的任务同时只开一个。
   - 当前前置状态：基线 main `336c0cd` 已含 M0 全部、M1-01..07（#54、#56）、M2-01..03（#47）；M1-R 随 #57 合并落地（结论通过，见 [design/reviews/M1.md](../reviews/M1.md)）。以上历史派发顺序不代表仍在开发。M1-R1..R4 不阻塞 v0.2.0，可与 M2-03b 按冲突域穿插派发。截至 main `2a23025`（v0.3.0 之后），迁移已到 016；S4 不新增迁移。
5. M2（草案）：M0-R4、M0-R5 都合并后，M2-01 与 M2-02 可并行（冲突域不重叠）。M2-03 需要 M2-02 和 M0-R1；迁移 014 必须在 M1 的 013 合并之后集成（M2-03 先就绪就等待，不互换编号）；M2-03 与 M1-03、M1-06 同属 `domain-posting`，不能同时开发，这条不因迁移串行集成规则而豁免。M2-01、M2-03、M2-04、M2-06 都改 `admin-cli`，不能同时进行。之后为 M2-04（首批）→ M2-03b → M2-04b → M2-05 → M2-06 → M2-R（D26）；M2-04、M2-03b、M2-04b 都改 `admin-cli`、`legacy-import`，串行。真实操作看决定 A/B/C；D25 已决（导入期初未结项），M2-03b 与 M2-04b 合并前不做真实导入演练。

## 决定记录

D1/D2/D3、D9、D10、D25、D26 已决定，见[路线图 §6](../roadmap.md)。
