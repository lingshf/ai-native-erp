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
| [M2-05a](S13.md#m2-05a迁移虚构端到端演练与操作手册) | M2-05 中不需授权的部分：`legacy-import --dry-run` 接入 CLI、虚构端到端演练进 Full、迁移链路 Bench、操作手册（S13） | M2-01, M2-04b | admin-cli（只改 `storage-admin-main.mjs` 参数解析与分派）, bench/CI, docs/runbook | done | [#227](https://github.com/lingshf/ai-native-erp/pull/227)（`69cd9ce`） |
| [M2-05b](M2-05b-opening-batched-write.md) | 期初未结项分批写入：明细落临时库暂存表、按批读写，期初阶段仍为单事务（M2-03b 原子性不变）；J6 导入峰值 RSS ≤ 512 MiB，关闭 KG（D434） | M2-05a | legacy-import（`opening-items.ts`、`legacy-import.ts`、可选新 `opening-staging.ts` 及两份现有测试）、bench 开关（只删 KG 一项）、docs/runbook（只改 KG 两处） | done | [#232](https://github.com/lingshf/ai-native-erp/pull/232)（`1c88243`） |
| [M2-05](M2-05-migration-rehearsal.md) | 隔离试迁移演练与操作手册（M2-05a 之后只剩真实演练，待决定 A / C） | M2-05a；决定 A / C | bench/CI, docs/runbook | todo | |
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

## S5：`styles.css` 全局元素规则收尾 + S4 回顾行动（建议 v0.5.0）

**目标**：
- 完成 D-7：各页不再依赖 `styles.css` 的全局元素规则，最后一次性删除（S5-a..g、S5-i）。**D-7：部分完成。** S5-g（[#126](https://github.com/lingshf/ai-native-erp/pull/126)，main `6c8724b`）第二道检查发现 4 项遗漏，相关声明保留；UI-11b、UI-11c 补齐后，UI-11d（[#142](https://github.com/lingshf/ai-native-erp/pull/142)，main `6be3bcf`）删除了其余保留声明，任务已完成，但只剩 `button { border-radius }` 一条未删。D-7 只有在 [UI-11e](UI-11e-cell-link-radius-delete-styles-css.md) 补上订单列表 `button.cell-link` 的圆角类规则、删除 `styles.css` 及 `main.tsx` 的 import、合并后 main Full 12/12 测试步骤通过时才完成（S7 候选）；
- 调查并修复 S4 回顾记录的焦点断言偶发失败 D92（S5-h，原因待证实），落实其余回顾行动（路线图 §4 / §5 已由 S4 回顾 PR 写入；发布流程部分为 PROC-02）。

版本号由协调者定。基线为 main `66d8e15`（v0.4.0 Demo #108 之后）。来源：UI-09g [#106](https://github.com/lingshf/ai-native-erp/pull/106)（head `f269d23`，合并为 main `662a763`）证据表的“保留”部分，摘要见 [UI-1.md §5.2](../reviews/UI-1.md#52-ui-09gstylescss-全局元素规则删除记录)；回顾见 [S4-retro.md](../reviews/S4-retro.md)。

**不在本 Sprint**：
- M2-05 / M2-06：需要用户授权决定 A / B，见上文 M2 节；
- 订单列表：需要新增列表 API（M1-R1a 决定 P2）；
- 任何新迁移、后端规则变化、`package.json` / lock 变化。

| ID | 标题 | 类型 | 依赖 | 冲突域 | 状态 | PR |
| --- | --- | --- | --- | --- | --- | --- |
| [S5-a](S5-a-journals-global-rules.md) | 凭证 / 业务事件：无类 `legend`（含凭证草稿与暂记户）、凭证预览合计行 `td` 的 `min-width` / `border-bottom`、`select`（含 `max-width`、`jv-status`）、按钮、VirtualRows 表头、复选框改为类规则，补采编辑 / 清账 / 预览状态 | 页面 tsx + CSS | S5-b（C 线前序） | web-ui:journals | done | [#118](https://github.com/lingshf/ai-native-erp/pull/118) |
| [S5-b](S5-b-migration-global-rules.md) | 迁移核对页：`dl` / `dt` / `dd` / `thead` 改为类规则；`.kv` 表进独立滚动区 | CSS（必要时 tsx） | — | web-ui:migration | done | [#112](https://github.com/lingshf/ai-native-erp/pull/112) |
| [S5-c](S5-c-trade-global-rules.md) | 贸易页面：复选框、`.tinv-facts` / `.trpt-facts`、`cell-link` 圆角、`caption` | CSS | — | web-ui:trade | done | [#113](https://github.com/lingshf/ai-native-erp/pull/113) |
| [S5-d](S5-d-trade-orders-global-rules.md) | 订单录入页：复选框、`.tord-facts` | CSS | S5-h（同冲突域） | web-ui:trade-orders | done | [#120](https://github.com/lingshf/ai-native-erp/pull/120) |
| [S5-e](S5-e-ledger-period-master-global-rules.md) | 总账报表 / 期末 / 科目表：`caption`、明细 `th, td`（不含对齐，归 S5-i）、tfoot | CSS | S5-i（A 线前序） | web-ui:ledger, web-ui:period-close, web-ui:master | done | [#125](https://github.com/lingshf/ai-native-erp/pull/125) |
| [S5-f](S5-f-shell-components-global-rules.md) | 外壳 / 共享组件：偏好区 `legend` / `select` / 复选框、概览 `dd`、`.ui-field` 与 `.field` 的 `select`、VirtualRows tfoot | CSS | S5-c（同改 `components.css`） | web-ui:shell（不含 `styles.css`）, web-ui:components | done | [#115](https://github.com/lingshf/ai-native-erp/pull/115) |
| [S5-i](S5-i-grid-table-component-rules.md) | 共享表格：`.grid` / `.journal-scroll` 的 `td` 对齐、`thead` 底色与 `.grid tfoot` 底色改为组件规则（#113 报告的缺口；`select` 的 `max-width` 已由 #115 覆盖）；`.fasttab-toggle:disabled` 的 opacity / cursor（D116） | CSS | S5-f、S5-c（同改 `components.css`） | web-ui:components | done | [#122](https://github.com/lingshf/ai-native-erp/pull/122) |
| [S5-g](S5-g-delete-global-element-rules.md) | 删除 `styles.css` 剩余全局元素规则（D-7 收尾，含 44px 基线的两道检查；文件清空时删除 `main.tsx:5` 的 import） | CSS + 入口 import 一行 | S5-a..f、S5-i 全部（外壳串行最后） | web-ui:shell | done | [#126](https://github.com/lingshf/ai-native-erp/pull/126) |
| [S5-h](S5-h-trade-orders-focus-race.md) | 订单录入页保存后焦点断言偶发失败：先复现、核对真实 Chrome，再修复（D92，原因待证实） | 测试 / 页面 tsx | S5-c（B 线前序） | web-ui:trade-orders | done | [#117](https://github.com/lingshf/ai-native-erp/pull/117) |
| [FLAKE-02](FLAKE-02-trade-gui-period-option-poll.md) | 贸易 GUI E2E：期末月份下拉选项轮询偶发为空；afterAll teardown 超时（两项分别记录，原因均未知）；已有 trace 只含旧标题与空读取，其余由定向诊断采集（排队，不计入 S5 目标） | 调查 / 测试 | —（与 S5-h 无文件重叠，可并行；共同原因则由设计角色决定合并） | tests:e2e | done | [#121](https://github.com/lingshf/ai-native-erp/pull/121)；合并后 [main Full 44817623175](https://github.com/lingshf/ai-native-erp/actions/runs/44817623175)（`7a142a3`，12/12 分片测试步骤通过） |
| [FOCUS-01](FOCUS-01-journals-events-passive-focus.md) | 凭证 / 业务事件：7 处在被动 effect 中设置焦点，可能晚一帧；逐处以同一真实交互的真实 Chrome base / head 证据判定（jsdom 注入仅作辅助），只修已复现的（排队，不计入 S5 目标） | 调查 / 页面 tsx / 测试 | **S5-a 合并后**（同冲突域，不能并行）；参考 S5-h #117 | web-ui:journals | done | [#123](https://github.com/lingshf/ai-native-erp/pull/123) |
| [UI-11a](UI-11a-business-queue-actions-column.md) | 业务事件“待转队列”操作列按钮截成“…”、`<td>` 拦截点击（FOCUS-01 取证发现，base `045fa59` 已存在）；1440 / 390 完整显示、可点击、这三个按钮命中区 ≥ 44 × 44（S5 收尾后 backlog，不计入 S5 目标） | 页面 CSS（必要时 tsx） | FOCUS-01（已合并，[#123](https://github.com/lingshf/ai-native-erp/pull/123)）、S5-g | web-ui:journals | 转入 S6 | — |
| [FOCUS-02](FOCUS-02-business-master-save-failure-focus.md) | 业务事件主数据（B3）：保存失败（409）、忙碌结束时同一 effect 再次执行，焦点晚一帧（#123 辅助发现，base `045fa59` 已存在）；把聚焦与 `lock` 拆开，`lock` 行为不变；真实 Chrome base / head 判定（S5 收尾后 backlog，不计入 S5 目标） | 调查 / 页面 tsx / 测试 | FOCUS-01（已合并，[#123](https://github.com/lingshf/ai-native-erp/pull/123)）；与 UI-11a 同冲突域串行 | web-ui:journals | 转入 S6 | — |
| [UI-11b](UI-11b-s5g-leftover-button-checkbox.md) | S5-g 第二道检查遗留：`.btn-primary` 缺 `:active`（components）；概览失败态重试按钮依赖全局 `button`（shell）；维度 `label.ui-master-hit` 复选框依赖全局复选框规则（master）（S5 收尾后 backlog） | CSS（必要时 tsx） | S5-g；与 UI-11c 同改 `components.css` 串行 | web-ui:components, web-ui:shell, web-ui:master | 转入 S6 | — |
| [UI-11c](UI-11c-virtualrows-spacer-cells.md) | S5-g 第二道检查遗留：VirtualRows 占位行 `td`（> 100 行时出现）缺 `border-bottom` / `vertical-align` / `min-width`，影响业务事件、凭证、贸易（S5 收尾后 backlog） | CSS（必要时 tsx） | S5-g；与 UI-11a、FOCUS-02（journals）及 UI-11b（components）串行 | web-ui:journals, web-ui:components | 转入 S6 | — |
| [UI-11d](UI-11d-delete-styles-css-remaining.md) | 删除 `styles.css` 保留的全局声明，推进 D-7（文件清空时删 `main.tsx` 的 import；实际未清空，D-7 收尾转 UI-11e） | CSS + 入口 import 一行 | UI-11b、UI-11c（外壳串行最后） | web-ui:shell | 转入 S6 | — |
| [PROC-02](PROC-02-release-rc-and-demo-checks.md) | 发布流程：RC 断言范围与 API / GUI 分条；Demo 截图状态断言与进程归属（版本管理） | 文档 | — | docs/release | done | [#111](https://github.com/lingshf/ai-native-erp/pull/111) |

**S5 共同验收**（S5-a..g、S5-i；S5-h、PROC-02、FLAKE-02、FOCUS-01、UI-11a、FOCUS-02、UI-11b..d 见各自文件）：
1. 满足 [UI-1 通用验收标准](#ui-1界面逐步改进) 1–9，PG-05 口径同 S4（基线为 PR 实际 base 的 gzip 列）。S5-a..f、S5-i 的 CSS 合计 gzip ≤ +0.3 kB（声明先复制到页面，S5-g 再删除全局规则）。
   - **D133（修订 D131）**，S5-g 的 PG-05 有两个条件：(a) 相对 PR 的 merge-base，CSS 合计 gzip **减少**；(b) 以 S5 起点 main `28f9de8` 为基线，S5 累计 CSS gzip 增量扣除 D112 允许的 `Journals.css` +222 B 后 ≤ +0.3 kB。口径同 PG-05：zlib gzip level 9，去掉 hash 后按文件名配对，CSS 合计为全部 `.css` 资产的 gzip 之和。
   - 理由：全局元素规则改为页面 / 组件类规则时，同一声明要写在多个限定选择器下，选择器必然重复，删除全局规则收回的字节抵不上。D131 要求的“S5 累计净减少”在 #126 的全删构建中仍不满足：删掉整个 `styles.css`，合计仍为 13,587 B，高于起点 13,259 B。这只说明这一实验达不到，不证明其他瘦身方案不可能。
   - 累计增量（#126 实测 +413 B，扣除 D112 后 +191 B）的来源以及是否瘦身，交 S5 Sprint 评审讨论，不阻塞 S5-g。
   - UI-11b..d 不计入 S5 累计；各自预算见任务文件。UI-11a..d、FOCUS-02 已转入 [S6](#s6订单列表与保存前预览--s5-遗留收尾建议-v060)，状态以 S6 表为准。
2. **只改本任务冲突域，不改 `styles.css`**（S5-g 除外）。在页面或组件 CSS 中用类规则给出与现值相同的声明，需要类名时再改 `.tsx`。
3. **计算值证据**：复用 UI-09g 的 `rules-probe.mjs`（#106 证据 gist，作为临时文件使用，不提交）。在一个**只用于取证、不提交**的构建中删去本任务涉及的全局声明，证明本任务页面在全部采集点上计算值“变”为 0；采集点含本页导航路由、两主题、1440 / 390，以及任务文件列出的补采状态。证据表格式同 [UI-1.md §5.1](../reviews/UI-1.md)。
4. 改前 / 改后截图像素差为 0（S5-b 的 `.kv` 滚动区除外，见其任务文件）。任何非 0 差异都说明值没有对齐，修正 CSS，不申请豁免。
5. 现有测试与 E2E 不删除、不削弱（D11）。作为证据的本机测试运行保存完整日志，失败的也保存（[路线图 §5 偶发失败](../roadmap.md#5-团队流程)）。
6. 证据表写入 PR 描述。开发者不改 `design/`；合并后由设计角色同步任务表，S5-g 合并后把摘要追加到 UI-1.md §5。

**三名开发的并行安排**（同一行内串行；不同行同时进行时冲突域不相交）：

| 线 | 顺序 | 冲突域 |
| --- | --- | --- |
| A：外壳与共享、报表 | S5-f → S5-i → S5-e → S5-g | shell + components → components → ledger / period-close / master → shell（`styles.css` 与 `main.tsx:5`） |
| B：贸易 | S5-c → S5-h → S5-d | trade → trade-orders → trade-orders |
| C：迁移与凭证 | S5-b → S5-a | migration → journals |

- **首批**：S5-c（B）、S5-b（C）可同时开工；S5-b 已合并（#112，main `f083e97`）。
- **共享 CSS 冲突**：S5-c（#113）与 S5-f 都改 `theme/components.css`，**不同时进行**：S5-f 在 #113 合并后再开工，基于合并后的 main 采集证据。S5-i 在 S5-f 与 S5-c 都合并后开工。
- **跨线等待**：S5-i 还要等 B 线的 S5-c 合并（#113 在 `components.css` 新增一条规则）。S5-g 等 S5-a..f、S5-i 全部合并，并且按[路线图 §5 合并后](../roadmap.md#5-团队流程)看到覆盖最后一个合并提交的完整 main Full。S5-g 的证据覆盖全部页面，开工时不应有正在进行的页面 CSS 任务。
- **外壳串行**：S5-f → S5-g，由表内依赖保证。
- **对比度测试**：本 Sprint 预计不改 `contrast.test.ts`。需要新增配对的任务先报告设计角色加入依赖（`tests:contrast` 串行）。
- **PROC-02** 由版本管理负责，不计入开发上限，随时可做，须在 v0.5.0 RC 开出前合并。
- 每个任务合并后，按[路线图 §5 合并后动作](../roadmap.md#5-团队流程)跟踪 main Full；设计角色按 §5 合并后第 2 条主动同步任务表，不等通知。worktree 中禁止 `git stash`（[路线图 §5 工作区隔离](../roadmap.md#5-团队流程)）。
- S5 Sprint 评审与回顾：[design/reviews/S5.md](../reviews/S5.md)。

## S6：订单列表与保存前预览 + S5 遗留收尾（建议 v0.6.0）

**目标**：
- **产品**：补齐订单页的两个缺口（S4 决定 P2 收窄的部分）：订单列表（TORD-03）与保存前预览（TORD-04），使订单页与发票页体验一致。不需要迁移。
- **推进 D-7**：UI-11b、UI-11c 补齐 S5-g 遗留的类规则后，UI-11d 删除 `styles.css` 保留的全局声明。实际结果：UI-11d 任务完成，D-7 部分完成；D-7 只有在 [UI-11e](UI-11e-cell-link-radius-delete-styles-css.md) 补上订单列表 `button.cell-link` 的圆角类规则、删除 `styles.css` 及 `main.tsx` 的 import、合并后 main Full 12/12 测试步骤通过时才完成。
- **S5 遗留缺陷**：业务事件“待转队列”按钮截断（UI-11a）、主数据保存失败后焦点晚一帧（FOCUS-02）；v0.5.0 Demo（[#129](https://github.com/lingshf/ai-native-erp/pull/129)）的两项观察（UI-12、UI-13）。
- **S5 回顾行动**：`navigate()` 等待目标页就绪（FLAKE-03）、并发 E2E 干扰调查（E2E-01），见 [S5 回顾](../reviews/S5.md#行动项汇总)。

版本号由协调者定。基线为 v0.5.0 tag 所在的 main（S5 Sprint 评审后由版本管理打）。**S6 开发任务在 v0.5.0 tag 打出后才派发**；本节由设计 PR 提前写入，不受此限。

**不在本 Sprint**：
- M2-05 / M2-06：需要用户授权决定 A / B，见上文 M2 节；
- 订单筛选（伙伴 / 日期 / 方向）：需要新索引即为迁移，单独立项（见 TORD-03）；
- “S5 累计 CSS +413 B 的瘦身”：协调者已决定不立任务（D140），理由见 [S5 回顾议题 1](../reviews/S5.md#议题-1d131-改为-d133s5-累计-css-413-b)；
- `package.json` / lock 变化（例外：FLAKE-05 按 D199 单项豁免，`packages/core/package.json` 新增 3 条 `exports`，lock 不变）；本 Sprint 计划内没有迁移任务。

| ID | 标题 | 类型 | 依赖 | 冲突域 | 状态 | PR |
| --- | --- | --- | --- | --- | --- | --- |
| [UI-11a](UI-11a-business-queue-actions-column.md) | 业务事件“待转队列”操作列按钮截断、`<td>` 拦截点击；1440 / 390 完整显示、可点击、命中区 ≥ 44 × 44 | 页面 CSS（必要时 tsx） | FOCUS-01（已合并，[#123](https://github.com/lingshf/ai-native-erp/pull/123)）、S5-g（已合并） | web-ui:journals | done | [#133](https://github.com/lingshf/ai-native-erp/pull/133)（`8df3874`，[Full](https://github.com/lingshf/ai-native-erp/actions/runs/44837057918)） |
| [FOCUS-02](FOCUS-02-business-master-save-failure-focus.md) | 业务事件主数据保存失败（409）后焦点晚一帧；聚焦与 `lock` 拆开 | 调查 / 页面 tsx / 测试 | UI-11a（同冲突域串行） | web-ui:journals | done | [#135](https://github.com/lingshf/ai-native-erp/pull/135)（`331f52a`，[Full](https://github.com/lingshf/ai-native-erp/actions/runs/44842809884)） |
| [UI-11b](UI-11b-s5g-leftover-button-checkbox.md) | S5-g 遗留：`.btn-primary:active`、概览重试按钮、维度命中列复选框 | CSS（必要时 tsx） | S5-g（已合并） | web-ui:components, web-ui:shell（不含 `styles.css`）, web-ui:master | done | [#134](https://github.com/lingshf/ai-native-erp/pull/134)（`ebd5e0d`，[Full](https://github.com/lingshf/ai-native-erp/actions/runs/44837526542)） |
| [UI-11c](UI-11c-virtualrows-spacer-cells.md) | S5-g 遗留：VirtualRows 占位行 `td` 的边框、对齐与最小宽度 | CSS（必要时 tsx） | FOCUS-02（journals 串行）、UI-11b（components 串行） | web-ui:journals, web-ui:components | done | [#141](https://github.com/lingshf/ai-native-erp/pull/141)（`e47b93b`，[Full](https://github.com/lingshf/ai-native-erp/actions/runs/44849765247)） |
| [UI-11d](UI-11d-delete-styles-css-remaining.md) | 删除 `styles.css` 保留的全局声明，推进 D-7 | CSS + 入口 import 一行 | UI-11b、UI-11c；从开工到合并期间无进行中的页面 CSS 任务（含 C 线） | web-ui:shell（`styles.css`、`main.tsx` import） | done（任务完成；D-7 部分完成，剩余项见 UI-11e） | [#142](https://github.com/lingshf/ai-native-erp/pull/142)（`6be3bcf`，[Full](https://github.com/lingshf/ai-native-erp/actions/runs/44864113434)） |
| [TORD-03](TORD-03-trade-order-list.md) | 订单列表：`GET /api/v1/trade/orders` keyset 分页（走主键，无迁移）+ 订单页列表 | 后端 API + 页面 | — | trade-docs, contracts, web-ui:trade-orders | done | [#132](https://github.com/lingshf/ai-native-erp/pull/132)（`267d067`，[Full](https://github.com/lingshf/ai-native-erp/actions/runs/44838308314)） |
| [TORD-04](TORD-04-trade-order-preview.md) | 订单保存前预览：`POST /api/v1/trade/orders/preview`，与保存金额同源 | 后端 API + 页面 | TORD-03（同冲突域串行） | trade-docs, contracts, web-ui:trade-orders | done | [#138](https://github.com/lingshf/ai-native-erp/pull/138)（`7aac72f`，[Full](https://github.com/lingshf/ai-native-erp/actions/runs/44845093526)） |
| [UI-12](UI-12-migration-kv-narrow-wrap.md) | 迁移核对页 390 宽 `.kv` 英文词内断行（Demo #129 观察） | 页面 CSS | TORD-04（C 线排序，无文件依赖） | web-ui:migration | done | [#148](https://github.com/lingshf/ai-native-erp/pull/148)（`0f74db9`，[Full](https://github.com/lingshf/ai-native-erp/actions/runs/44874949609)） |
| [UI-13](UI-13-favicon-404.md) | 首页每次加载一条 404，先抓包证实是否为 favicon，再修（Demo #129 观察） | 调查 + 静态资源 | UI-11b（B 线排序，无文件依赖） | web:entry（`index.html`、`public/`） | done | [#136](https://github.com/lingshf/ai-native-erp/pull/136)（`0a91b00`，[Full](https://github.com/lingshf/ai-native-erp/actions/runs/44839984864)） |
| [FLAKE-03](FLAKE-03-navigate-target-page-ready.md) | 贸易 GUI E2E：`navigate()` 等待目标页标志（已证实的提前返回；不宣称修复 FLAKE-02） | 测试 | UI-13（B 线排序） | tests:e2e | done | [#137](https://github.com/lingshf/ai-native-erp/pull/137)（`fbc1199`，[Full](https://github.com/lingshf/ai-native-erp/actions/runs/44842497843)） |
| [E2E-01](E2E-01-concurrent-e2e-interference.md) | 并发真实 Chrome E2E 是否互相干扰：静态核对 + 受控实验；结论交协调者决定独占时段 | 调查 | FLAKE-03（同冲突域）；需要整台机器 | tests:e2e | done | [#139](https://github.com/lingshf/ai-native-erp/pull/139)（`92e0306`，[Full](https://github.com/lingshf/ai-native-erp/actions/runs/44847056925)） |
| [FLAKE-04](FLAKE-04-legacy-reconciliation-cli-spawnsync-timeout.md) | 旧账核对 CLI 用例 `spawnSync` 3000 ms 超时间歇触发：测量冷启动分布（空载 / 受控负载）、归因，按 D11 修复（计划外插入，不计入 S6 目标） | 调查（附修复） | 无代码依赖；测量时段与 E2E-01 及其他独占时段错开 | tests:legacy-reconciliation；改 CLI 启动路径时加 admin-cli | done（部分修复：验收 3 未满足，后续见 FLAKE-05） | [#144](https://github.com/lingshf/ai-native-erp/pull/144)（`2c21b51`，[Full](https://github.com/lingshf/ai-native-erp/actions/runs/44863261267)） |
| [FLAKE-05](FLAKE-05-legacy-cli-tests-under-full-load.md) | 旧账核对 CLI 用例在整机满载（load-cpu）下仍超时：评估 CLI 用例改进程内调用 + 少量 spawn 冒烟、进一步减启动开销、3000 ms 预算的依据与 D11 关系（D189，FLAKE-04 后续；不计入 S6 目标）。评估已完成，D199：方向 1 + 2（`@erp/core` 新增 3 条子路径 exports），3000 ms 不调整，验收负载为 PR 层实际负载 | 调查 + 方案评估（附实施） | FLAKE-04（已合并，[#144](https://github.com/lingshf/ai-native-erp/pull/144)） | tests:legacy-reconciliation, admin-cli；实施时加 core:package-exports、tooling:boundaries 及 infra 中改导入的 6 个文件 | done（PR 层实际负载下本次未观察到回归，余量见 PR；load-cpu 下仍超时，为已知限制） | [#147](https://github.com/lingshf/ai-native-erp/pull/147)（`d6c5014`，[Full](https://github.com/lingshf/ai-native-erp/actions/runs/44874051073)） |

**S6 后 backlog（S7 候选）**：UI-11e 已排入 [S7](#s7订单列表筛选--d-7-完成--s6-遗留收尾建议-v070)。

**S6 共同验收**：
1. UI 任务满足 [UI-1 通用验收标准](#ui-1界面逐步改进) 1–9，PG-05 口径同 S5（基线为 PR 实际 base 的 gzip 列）。**不设 Sprint 累计 CSS 门槛**（[路线图 §4 累计预算](../roadmap.md#4-ci-与测试策略设计角色牵头)）：各任务的预算见任务文件；设计角色同步任务表时按 [S5 回顾议题 1](../reviews/S5.md#议题-1d131-改为-d133s5-累计-css-413-b) 的口径记录累计值，只作观察。
2. 真实 Chrome 证据按[路线图 §5 UI PR 证据清单](../roadmap.md#5-团队流程)，请求评审前逐项勾选写入 PR 正文。
3. 现有测试与 E2E 不删除、不削弱（D11）。作为证据的本机运行保存完整日志，失败的也保存。
4. 开发者不改 `design/`；合并后由设计角色同步任务表；UI-11d 合并后把摘要追加到 UI-1.md §5。

**泳道**（同时在岗的开发不超过 3 个；同一行内串行；不同行同时进行时冲突域不相交）：

| 线 | 顺序 | 冲突域 |
| --- | --- | --- |
| A：凭证 / 业务事件与 D-7 | UI-11a → FOCUS-02 → UI-11c → UI-11d | journals → journals → journals + components → shell |
| B：共享组件与 E2E | UI-11b → UI-13 → FLAKE-03 → E2E-01 | components + shell + master → web:entry → tests:e2e → tests:e2e（整机） |
| C：订单 | TORD-03 → TORD-04 → UI-12 | trade-docs + contracts + trade-orders → 同 → migration |
| 计划外 | FLAKE-04 → FLAKE-05（backlog） | tests:legacy-reconciliation（+ admin-cli） → 同 |

- **首批**（v0.5.0 tag 后）：UI-11a（A）、UI-11b（B）、TORD-03（C）同时开工，冲突域两两不相交。
- **跨线等待**：
  - UI-11c 等 A 线的 FOCUS-02 和 B 线的 UI-11b 都合并（journals 与 components 都串行）；
  - UI-11d 等 UI-11b、UI-11c 合并，并看到覆盖最后一个合并提交的完整 main Full；它的证据覆盖全部页面，要求全页零差的基线在取证期间不变：**从 UI-11d 开工、取证、评审直到合并，C 线不得有进行中的 TORD-03 / TORD-04 / UI-12 等页面 CSS 任务，也不得启动新的**。协调者在 C 线某个任务合并之后、下一个开工之前派发 UI-11d，C 线下一个任务等 UI-11d 合并后再开工；
  - UI-11b 与 UI-11d 都占 web-ui:shell，由 A 线的依赖保证串行。
- **FLAKE-04**（计划外，S6 中由协调者登记）：冲突域与 A / B / C 三条线都不相交，但占一个在岗名额，协调者在某条线空出时派发。它只用 node、不用 Chrome，但测量会产生整机 node 负载：空载组与负载组都按独占时段安排，不与 E2E-01 的并发实验或其他 session 的取证运行重叠。
- **迁移规则**：本 Sprint 计划内没有迁移任务。若 TORD-03 / TORD-04 发现必须加索引，停下报告设计角色，另立迁移任务；**两个要加迁移的任务不能并行**（共用 `migrations.ts` 与编号）。
- **E2E 时段**：在 E2E-01 有结论之前，仍按 D115 / D118 的独占时段（[路线图 §5 工作区隔离](../roadmap.md#5-团队流程)）。三条线需要真实 Chrome 的阶段尽量错开；**E2E-01 需要整台机器**，安排在其他两条线都处于编辑 / 评审阶段、没有 E2E 需求的时段，由协调者定时间。
- **对比度测试**：本 Sprint 预计不改 `contrast.test.ts`；需要新增配对的任务先报告设计角色（`tests:contrast` 串行）。
- 每个任务合并后，按[路线图 §5 合并后动作](../roadmap.md#5-团队流程)跟踪 main Full，变绿前不派发同一冲突域的下一个任务。

## S7：订单列表筛选 + D-7 完成 + S6 遗留收尾（建议 v0.7.0）

**目标**：
- **产品**：订单列表可按伙伴、方向、订单日期筛选（TORD-05）。TORD-03 上线后订单列表只能从头翻页，“看某个伙伴的订单”“看本月的采购订单”做不到；这是贸易页现阶段日常使用中最缺的能力，也是 S6 明确推迟、需要迁移的一项。只加一条伙伴索引（迁移 017）。
- **D-7 完成**：UI-11e 给订单列表 `button.cell-link` 补上类规则圆角，删除 `styles.css` 及 `main.tsx` 的 import；合并后 main Full 12/12 测试步骤通过，D-7 完成。**已完成**：[#159](https://github.com/lingshf/ai-native-erp/pull/159)，main `49cb443`，[Full](https://github.com/lingshf/ai-native-erp/actions/runs/44937384278) 12/12。
- **S6 遗留**：分片权重守卫、D204 墙钟的 Full 观察、D199 CLI 冒烟所在用例的耗时观察（不作为子进程余量，CI-01）；v0.6.0 回顾行动项 1–5 落入模板与清单（PROC-03）。

版本号由协调者定。基线为 v0.6.0 tag 所在的 main（`3548d58`）。**S7 开发任务在 v0.6.0 tag 打出后派发**（已打）；本节由设计 PR 写入。

**不在本 Sprint**：
- M2-05 / M2-06：仍需用户授权决定 A / B，见上文 M2 节；
- D199 load-cpu（整机 CPU 满载）下 CLI 冒烟仍超时：按 D199 是压力观察、不是验收负载，3000 ms 为防挂死阈值，**不立修复任务、不做新的满载实验**。CI-01 只观察 Full 上这些用例的整条耗时，不据此计算子进程余量；如需余量数据，要另立任务做逐路径子进程计时，由协调者决定；
- 方向 / 日期索引、按日期排序、发票列表筛选（见 TORD-05“不在范围”）；
- `package.json` / lock 变化。

| ID | 标题 | 类型 | 优先级 | 依赖 | 冲突域 | 状态 | PR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [UI-11e](UI-11e-cell-link-radius-delete-styles-css.md) | 订单列表 `button.cell-link` 圆角改由 `trade-orders.css` 类规则提供，删除 `styles.css` 与 `main.tsx` 的 import；D-7 完成 | CSS + 入口 import 一行 | P1 | UI-11d（已合并，[#142](https://github.com/lingshf/ai-native-erp/pull/142)）；从开工到合并期间无进行中的页面 CSS 任务 | web-ui:trade-orders, web-ui:shell | done（D-7 完成；PG-05 例外：CSS 合计 gzip-9 +8 B，评审按 UI-1 #9 批准，见 [UI-1.md §5.4](../reviews/UI-1.md#54-ui-11e订单列表-cell-link-圆角与-stylescss-删除记录d-7-完成)） | [#159](https://github.com/lingshf/ai-native-erp/pull/159)（`49cb443`，[Full](https://github.com/lingshf/ai-native-erp/actions/runs/44937384278) 12/12） |
| [TORD-05](TORD-05-trade-order-list-filters.md) | 订单列表按伙伴 / 方向 / 订单日期筛选；迁移 017 只加 `trade_orders_party` 索引；排序与游标不变；PG-05 计划与 p95 基准 | 迁移 + 后端 API + 页面 | P1 | UI-11e（web-ui:trade-orders 串行）；CI-01（共享 `scripts/test-shard-weights.json`：CI-01 合并且 main Full 绿之前不得改动该文件，见泳道“权重文件门禁”） | **迁移/schema**, 存储, trade-docs, contracts, web-ui:trade-orders, bench/CI（基准文件、`scripts/test-shard-weights.json`） | done（评审接受：`INDEXED BY` 固定语句；TORD-03 断言改为 `status=open`；像素差按对齐后收窄的结论） | [#161](https://github.com/lingshf/ai-native-erp/pull/161)（`9421906`，[Full](https://github.com/lingshf/ai-native-erp/actions/runs/44941838217) 12/12） |
| [CI-01](CI-01-shard-weight-guard-and-wallclock.md) | 分片权重完整性守卫（缺失 / 陈旧即失败）；D204 墙钟的 Full 观察（空载测量只作新基线）；D199 CLI 冒烟所在用例的耗时观察（不算余量） | CI 守卫 + 测量报告 | P2 | — | bench/CI（`scripts/test-shard-weights.json`、`scripts/ci.ts`、`vitest.config.ts`、`infra/test/tooling`） | done（守卫补登 5 个缺失权重；Full 观察与用例耗时见 PR） | [#157](https://github.com/lingshf/ai-native-erp/pull/157)（`ee95178`，[Full](https://github.com/lingshf/ai-native-erp/actions/runs/44934751859)） |
| [PROC-03](PROC-03-v060-retro-actions.md) | v0.6.0 回顾行动项 1–5 写入 Demo 模板与发布清单（版本管理，不占开发名额） | 文档 | P2（v0.7.0 RC 之前合并） | — | docs:release（`docs/demo/TEMPLATE.md`、`docs/release/README.md`） | done | [#156](https://github.com/lingshf/ai-native-erp/pull/156)（`3410daa`，[Full](https://github.com/lingshf/ai-native-erp/actions/runs/44933171837)） |

**Sprint 评审**：[design/reviews/S7.md](../reviews/S7.md)（main `1d507f3`，S7 通过；例外与遗留项见该文）。

**Sprint 回顾**：[design/reviews/S7-retro.md](../reviews/S7-retro.md)（main `08651f7`；3 个议题、7 条行动项，S6 回顾行动项检查）。

**S7 共同验收**：
1. UI 任务满足 [UI-1 通用验收标准](#ui-1界面逐步改进) 1–9，PG-05 口径同 S6（基线为 PR 实际 base 的 gzip 列），不设 Sprint 累计 CSS 门槛；真实 Chrome 证据按[路线图 §5 UI PR 证据清单](../roadmap.md#5-团队流程)，请求评审前逐项勾选写入 PR 正文。
2. 现有测试与 E2E 不删除、不削弱、不跳过、不按平台禁用（D11）。作为证据的本机运行保存完整日志，失败的也保存。
3. CI-01 合并后，任何新增测试文件的 PR 都要在 `scripts/test-shard-weights.json` 中登记权重；CI-01 合并且覆盖其合并提交的 main Full 变绿之前，其他任务不得改动该文件。
4. 迁移只有 TORD-05 一项（017）。若其他任务发现需要迁移，停下报告设计角色另立任务，且**不能与 TORD-05 并行**（共用 `migrations.ts` 与编号）。
5. 开发者不改 `design/`；合并后由设计角色同步任务表；UI-11e 合并后把 D-7 完成的摘要追加到 UI-1.md §5。

**泳道**（同时在岗的开发不超过 3 个；同一行内串行；不同行同时进行时冲突域不相交）：

| 线 | 顺序 | 冲突域 |
| --- | --- | --- |
| A：订单页与 D-7 | UI-11e → TORD-05 | trade-orders + shell → 迁移 + 存储 + trade-docs + contracts + trade-orders + `test-shard-weights.json`（门禁后） |
| B：CI | CI-01 | bench/CI（含 `test-shard-weights.json`） |
| 版本管理 | PROC-03 | docs:release |

- **首批**：UI-11e（A）、CI-01（B）两名开发同时开工，冲突域不相交；PROC-03 由版本管理并行处理。
- **UI-11e 先于 TORD-05**：UI-11e 的证据覆盖全部页面，要求取证期间没有进行中的页面 CSS 任务；它很小，先做可以让 TORD-05 在没有 `styles.css` 的基线上开发，也不让 TORD-05 的页面 CSS 卡住 D-7。TORD-05 等 UI-11e 合并、且覆盖其合并提交的 main Full 变绿后开工。
- **权重文件门禁（TORD-05 与 CI-01 串行）**：两者都会改 `scripts/test-shard-weights.json`，这个文件上二者必须串行，CI-01 在前。
  - CI-01 合并、且覆盖其合并提交的 main Full 变绿之前，TORD-05 **不得改动** `scripts/test-shard-weights.json`；在此之前 TORD-05 可以开工，只改自己冲突域内的其他文件。
  - 门禁满足后，TORD-05 先 rebase 到该 main，再登记新增测试文件的权重并通过守卫，然后才能请求评审。
  - 若 TORD-05 已准备请求评审而 CI-01 仍未合并，TORD-05 等待，不自行登记权重、不提前请求评审。
- **UI-11e 期间的派发限制**：UI-11e 的证据覆盖全部页面，从开工、取证、评审直到合并，**不得派发或进行任何会改动页面渲染样式的任务**，包括任何 CSS 文件、组件内联样式、类名或 DOM 结构的改动，无论其文件冲突域是否与 UI-11e 相交。这一限制同样适用于计划外插入的第三项。
- **第三个名额留空**：本 Sprint 计划内只占两个开发名额，第三个名额留给计划外插入（S5、S6 都有）。协调者如要追加，只能选：与 A / B 冲突域都不相交、不加迁移、不改 `scripts/test-shard-weights.json` 的任务；UI-11e 进行期间还须满足上一条。
- **E2E 与测量时段**：按 D115 / D118 与 E2E-01 结论安排独占时段（[路线图 §5 工作区隔离](../roadmap.md#5-团队流程)）。CI-01 若做可选的本机空载测量（只作新基线），会产生整机 node 负载，与 UI-11e / TORD-05 的真实 Chrome 取证错开。
- 每个任务合并后，按[路线图 §5 合并后动作](../roadmap.md#5-团队流程)跟踪 main Full，变绿前不派发同一冲突域的下一个任务。

## S8：从订单开票 + v0.7.0 回顾行动（建议 v0.8.0）

**目标**：
- **产品**：从订单开票（TINV-01、TINV-02）。M1 起后端已按订单行匹配发票数量与单价，但订单明细不返回已开票数量，发票页的订单号、订单行 ID 要手工抄录，剩余数量要用户自己算，抄错或超开到预览 / 过账才被拒绝。TORD-03..05 让订单能录、能查、能筛之后，“订单 → 发票”是贸易流程里下一个最常用、目前最费事的环节。无迁移、不改过账：只暴露已有的已开票数量（与过账匹配同一来源），并在发票页按订单带入草稿、在订单页给出入口。
- **流程**：S7 回顾行动项 3–5 写入 Demo 模板与发布清单（PROC-04、PROC-05，版本管理）；行动项 1、2 已由本 PR 写入[路线图 §5“E2E 独占时段”](../roadmap.md#5-团队流程)，行动项 6、7 写入路线图 §5“设计文档自查”，本表的泳道已按行动项 7 加“共享单文件”列（D234）。
- **S7 遗留**：遗留 8（筛选重置用例）并入 TINV-02；其余见下“不在本 Sprint”。

版本号由协调者定。基线为 v0.7.0 tag 所在的 main（本计划按 main `1bb9dbb` 编写，tag 打出后以 tag 所指提交为准）。**S8 开发任务在 v0.7.0 tag 打出之后才派发**；本节由设计 PR 写入。

**不在本 Sprint**：
- M2-05 / M2-06：仍需用户授权决定 A / B，见上文 M2 节；
- TORD-05“不在范围”的候选池（按日期 / 金额排序、发票列表筛选、方向 / 日期索引等，[S7 评审遗留 5](../reviews/S7.md#5-遗留项均不阻塞-v070)）：目前没有 p95 或用户反馈显示需要，不立项；
- 订单列表开票状态列、按开票状态筛选、多订单合并开票（见 TINV-01 / TINV-02“不在范围”）；
- D199 load-cpu、D204 墙钟（[S7 评审遗留 3、4](../reviews/S7.md#5-遗留项均不阻塞-v070)）：维持现状，不立任务；
- `components.css` 第 3–4 行过时注释（遗留 1）：S8 没有任务改该文件，继续留给下次改它的任务；
- Demo 脚本版本二的真实复跑（遗留 2）：v0.8.0 Demo 按 PROC-04 的新条目执行时一并完成；（结果：未复跑，D258 按“已被取代”结案，见 [S8 评审 §5](../reviews/S8.md#5-遗留项均不阻塞-v080)）
- 迁移、`package.json` / lock 变化。

| ID | 标题 | 类型 | 优先级 | 依赖 | 冲突域 | 状态 | PR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [TINV-01](TINV-01-invoice-from-order.md) | 新增只读接口 `GET …/orders/:orderId/invoicing`，返回每行已开票数量（与过账匹配同一来源；现有订单契约不变）；发票页 `?fromOrder=` 按订单带入草稿 | 后端只读字段 + 页面 | P1 | — | trade-docs, contracts, web-ui:trade；共享 `scripts/test-shard-weights.json`（A 线在前） | done（真实 Chrome D243；评审修复只改错误路径，沿用 D243 主流程证据，D244） | [#171](https://github.com/lingshf/ai-native-erp/pull/171)（`ad57e6a`，[Full](https://github.com/lingshf/ai-native-erp/actions/runs/44953274030) 12/12） |
| [TINV-02](TINV-02-order-invoice-entry.md) | 订单详情显示已开票 / 未开票数量与“开票”入口；补 S7 遗留 8 的筛选重置用例；端到端路径 | 页面 + 端到端测试 | P1 | TINV-01（仅开工可并行；TINV-01 合并且 main Full 绿、rebase 之后才跑端到端 / 取证、改权重文件、请求评审） | web-ui:trade-orders, tests:trade-e2e；共享 `scripts/test-shard-weights.json`（在 TINV-01 之后） | done（E2E D249；S7 遗留 8 已补；权重 D250 两项） | [#172](https://github.com/lingshf/ai-native-erp/pull/172)（`3720e96`，[Full](https://github.com/lingshf/ai-native-erp/actions/runs/44956152354) 12/12） |
| [PROC-04](PROC-04-demo-stub-write-scripts-and-dry-run.md) | Demo 替身执行每个写入脚本并按产品规则断言；时段前无浏览器真实服务演练（S7 回顾行动项 3、4；版本管理，不占开发名额） | 文档 | P2（v0.8.0 申请 Demo 时段之前） | — | docs:release（`docs/demo/TEMPLATE.md`，与 PROC-05 共享，在前） | done（在 Demo #174 首次执行） | [#169](https://github.com/lingshf/ai-native-erp/pull/169)（`4a11bf3`，[Full](https://github.com/lingshf/ai-native-erp/actions/runs/44948073972) 12/12） |
| [PROC-05](PROC-05-doc-code-negative-cases.md) | 含可执行代码的文档请求评审前跑固定负例组（S7 回顾行动项 5；版本管理，不占开发名额） | 文档 | P2（v0.8.0 RC 之前） | PROC-04（共享 `docs/demo/TEMPLATE.md`） | docs:release（`docs/release/README.md`、`docs/demo/TEMPLATE.md`） | done（在 Demo #174 首次执行） | [#170](https://github.com/lingshf/ai-native-erp/pull/170)（`536123e`，[Full](https://github.com/lingshf/ai-native-erp/actions/runs/44948861897) 12/12） |

**Sprint 评审**：[design/reviews/S8.md](../reviews/S8.md)（main `bb74141`，S8 通过；裁定接受的事项与遗留项见该文）。

**Sprint 回顾**：[design/reviews/S8-retro.md](../reviews/S8-retro.md)（main `bb74141`；3 个议题、6 条行动项，S7 回顾行动项检查）。

**S8 共同验收**：
1. UI 任务满足 [UI-1 通用验收标准](#ui-1界面逐步改进) 1–9，PG-05 口径同 S7（基线为 PR 实际 base 的 gzip 列）；真实 Chrome 证据按[路线图 §5 UI PR 证据清单](../roadmap.md#5-团队流程)，请求评审前逐项勾选写入 PR 正文。
2. 独占时段按[路线图 §5“E2E 独占时段”](../roadmap.md#5-团队流程)执行，时段内整机独占，其他会话只能编辑（D217 / D234）：批时段前协调者收齐所有在岗会话的“已停”回执；precheck 采到外部进程时报告其命令行与来源 worktree，由协调者处理后从头计数；运行中采到则立即中止，不在原时段内重新开跑。
3. 现有测试与 E2E 不删除、不削弱、不跳过、不按平台禁用（D11）。作为证据的本机运行保存完整日志，失败的也保存。
4. 新增测试文件的 PR 在 `scripts/test-shard-weights.json` 登记权重并通过 CI-01 的守卫；该文件按下表“共享单文件”的顺序改动。
5. S8 没有迁移。若任务发现需要迁移，停下报告设计角色另立任务。
6. 开发者不改 `design/`；合并后由设计角色同步任务表。

**泳道**（同时在岗的开发不超过 3 个；同一行内串行，唯一例外是下面注明“仅开工可并行”的 A 线；不同行同时进行时冲突域不相交；“共享单文件”列出两个及以上任务都会改的单个文件及其顺序，S7 回顾行动项 7）：

| 线 | 顺序 | 冲突域 | 共享单文件（顺序与门禁） |
| --- | --- | --- | --- |
| A：从订单开票 | TINV-01 → TINV-02（仅开工可并行；依赖验收、权重改动与送审串行，见下“TINV-02 评审门禁”） | trade-docs + contracts + web-ui:trade → web-ui:trade-orders + tests:trade-e2e | `scripts/test-shard-weights.json`：TINV-01 在前；TINV-01 合并且覆盖其合并提交的 main Full 变绿之前，TINV-02 不得改动该文件 |
| 版本管理 | PROC-04 → PROC-05 | docs:release | `docs/demo/TEMPLATE.md`：PROC-04 在前；PROC-04 合并后 PROC-05 才改该文件 |

- **首批**：v0.7.0 tag 打出后，TINV-01 与 TINV-02 两名开发同时开工（冲突域不相交）。TINV-02 在门禁前只按 TINV-01 任务书写定的接口与 mock 形状（TINV-01 范围 4）开发，只跑 mock fetch 的 web 测试。PROC-04 由版本管理并行处理。
- **TINV-02 评审门禁**：TINV-01 合并、且覆盖其合并提交的 main Full 变绿之前，TINV-02 不改权重文件、不跑真实接口路径（端到端、真实 Chrome）、不请求评审。门禁满足后依次 rebase → 登记权重（如有）→ 独占时段内跑端到端并取证 → 请求评审。TINV-02 已就绪而 TINV-01 未合并时，TINV-02 等待。
- **真实 Chrome 与 E2E 由谁、何时验证**：默认 PR CI（`verify`，`CI_TEST_LAYER=pr`）排除 `*.slow.test.*`（`vitest.config.ts:11`），Full 只在 push 到 main 与定时运行。因此 TINV-01 的真实 Chrome 演示与 TINV-02 的端到端用例，由各自开发者在独占时段内用 PR head 运行并附完整日志，评审核对日志；合并后由协调者跟踪覆盖合并提交的 main Full。两人各自申请时段，不同时取证。开发者不得为过验收修改 `CI_TEST_LAYER`、`vitest.config.ts` 或 workflow。
- **第三个名额留空**：本 Sprint 计划内占两个开发名额，第三个名额留给计划外插入。协调者如要追加，只能选：与 A 线冲突域不相交、不加迁移、不改 `scripts/test-shard-weights.json` 与 `contrast.test.ts` 的任务。
- 每个任务合并后，按[路线图 §5 合并后动作](../roadmap.md#5-团队流程)跟踪 main Full，变绿前不派发同一冲突域的下一个任务。

## S9：订单 ↔ 发票双向可追溯 + v0.8.0 回顾行动（建议 v0.9.0）

**目标**：
- **产品**：订单与发票双向可追溯。S8 做到了“订单 → 发票”，还缺两处：订单列表上看不出哪些订单还没开票，只能逐张打开；发票列表上看不出发票来自哪张订单（`tradeInvoicePageSchema` 列表项没有 `orderId`，`packages/core/src/contracts/trade-documents.ts:469–486`），发票页也没有详情视图。S9 给订单列表加“开票状态”列并支持 `?order=` 直接打开订单（TINV-03），给发票列表加“来源订单”列（TINV-04）。**无迁移，不改过账。**
- **流程**：[S8 回顾](../reviews/S8-retro.md) 6 条行动项（D258）落地：行动 4、5 写入[路线图 §5“设计文档自查”](../roadmap.md#5-团队流程)第 7、8 项与新建的[任务书模板](TEMPLATE.md)；行动 1、2 写入路线图 §5“UI PR 证据清单”第 7、8 项（以上由本 PR 写入）；行动 1、2、3、6 在 Demo 模板与发布清单中的落地由 PROC-06 完成（版本管理）。
- **遗留**：v0.8.0 release-notes 第 3 行的过时提示、`components.css` 第 3–4 行注释（S7 / S8 遗留 1），都并入 PROC-06（D263）。#174 文档残留（S8 遗留 6）已由 #176 修正。

版本号由协调者定。基线为 v0.8.0 tag 所指提交 `deb80fc`（= 本计划编写时的 main）。本节由设计 PR 写入，协调者确认见 D263。

**不在本 Sprint**：
- M2-05 / M2-06：仍需用户授权决定 A / B，见上文 M2 节；
- 按开票状态筛选或排序订单列表：需要跨页聚合，要么在订单行上冗余存储已开票数量（加迁移，并在发票过账事务里维护），要么每次全表聚合（不满足热读 p95）。D263：列入 S10 及以后的候选，看 TINV-03 上线后的使用情况再议；
- 多订单合并开票；贷项是否冲减已开票数量（同 TINV-01“不在范围”）；发票详情页；
- TORD-05 候选池、D199 load-cpu、D204 墙钟（[S7 评审遗留 3–5](../reviews/S7.md#5-遗留项均不阻塞-v070)）：维持现状；
- 迁移、`package.json` / lock 变化。

| ID | 标题 | 类型 | 优先级 | 依赖 | 冲突域 | 状态 | PR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [TINV-03](TINV-03-order-list-invoicing-status.md) | 订单列表“开票状态”列（未开票 / 部分开票 / 已开完，与过账匹配同一谓词）；订单页 `?company=…&order=…` 直接打开订单详情，逐个参数处理异常 | 存储读 + 契约（只加响应字段）+ 页面 | P1 | — | 存储、contracts（`tradeOrderPageSchema` 列表项）、domain 类型（`TradeOrderSummary`）、web-ui:trade-orders、bench（`trade-order-list.ts`）；共享单文件见泳道（A 线在前） | done（真实 Chrome D268；5 轮打回，D275 只用 `pushState`；D270 沿用取证 head `470fb6d`） | [#179](https://github.com/lingshf/ai-native-erp/pull/179)（`e91a3f4`，[Full](https://github.com/lingshf/ai-native-erp/actions/runs/44978941421) 12/12） |
| [TINV-04](TINV-04-invoice-list-source-order.md) | 发票列表“来源订单”列，链接到 TINV-03 的 `?order=`；无订单显示“—”；发票页等使用 `useInvoiceLeaveGuard` 的页面在草稿 dirty 时，站内跳转与浏览器后退 / 前进先确认（一次导航只确认一次）；busy 只表示真正提交，报表页与期间准入页不再把 dirty 算作 busy（D264） | 存储读 + 契约（只加响应字段）+ 页面 | P1 | TINV-03（仅开工可并行；TINV-03 合并且 main Full 绿之前不改任何共享单文件、不 rebase、不跑真实路径、不请求评审，见“TINV-04 评审门禁”） | 存储、contracts（`tradeInvoicePageSchema` 列表项）、domain 类型（`TradeDocumentSummary`）、web-ui:trade（含 `useInvoiceLeaveGuard` 及其四个调用页面的调用行）；共享单文件见泳道（在 TINV-03 之后） | done（真实 Chrome D294；PG-05 超预算 D284 / D295 接受；开发者按 D266 改了本任务书“现状”与决定 4；权重 +1 项） | [#181](https://github.com/lingshf/ai-native-erp/pull/181)（`6478d10`，[Full](https://github.com/lingshf/ai-native-erp/actions/runs/44985493365) 12/12） |
| [PROC-06](PROC-06-s8-retro-actions.md) | S8 回顾行动 1、2、3、6 写入 Demo 模板与发布清单；删除 v0.8.0 release-notes 第 3 行过时提示；`components.css` 第 3–4 行只改注释（原 CSS-01，D263）（版本管理，不占开发名额） | 文档 + 注释 | P2（v0.9.0 RC 之前） | — | docs:release、web-ui:components（只改注释） | done（CSS 12 个文件 SHA 不变） | [#178](https://github.com/lingshf/ai-native-erp/pull/178)（`7e88a68`，[Full](https://github.com/lingshf/ai-native-erp/actions/runs/44963425015) 12/12） |
| FLAKE-06/07（无任务书，协调者另立） | 计划外：FLAKE-06 首次过账在途时提前显示“结果不确定”警告；FLAKE-07 HashRouter `startTransition` 使 `fromOrder` 被取用两次。根因都在产品代码（不计入 S9 目标；TINV-03 合并后使用第三个名额） | 缺陷修复 | P1 | — | web-ui:trade（`TradeInvoices.tsx` 只改 `fromOrder` 消费 effect，D276 准许与 A 线相交） | done（3 条新增单元测试旧代码失败、新代码通过） | [#180](https://github.com/lingshf/ai-native-erp/pull/180)（`a6d3b86`，[Full](https://github.com/lingshf/ai-native-erp/actions/runs/44983909701) 12/12） |

**Sprint 评审**：[design/reviews/S9.md](../reviews/S9.md)（main `5c4f932`，S9 通过，D302；裁定接受的事项与遗留项见该文；RC [#182](https://github.com/lingshf/ai-native-erp/pull/182)、Demo [#183](https://github.com/lingshf/ai-native-erp/pull/183)）。

**Sprint 回顾**：[design/reviews/S9-retro.md](../reviews/S9-retro.md)（main `5c4f932`；5 个议题、7 条行动项（D302 已认可），S8 回顾行动项检查）。

**S9 共同验收**：
1. UI 任务满足 [UI-1 通用验收标准](#ui-1界面逐步改进) 1–9，PG-05 口径同 S8（基线为 PR 实际 base 的 gzip 列，数字绑定最终送审 head，与取证 head 分开写）；真实 Chrome 证据按[路线图 §5 UI PR 证据清单](../roadmap.md#5-团队流程) 1–8 项（含本计划新增的第 7 项断言对照、第 8 项先 build），请求评审前逐项勾选写入 PR 正文。
2. 独占时段按[路线图 §5“E2E 独占时段”](../roadmap.md#5-团队流程)执行，口径同 S8（D217 / D234）。TINV-03、TINV-04 各自申请时段，不同时取证；PROC-06 不需要时段。
3. 现有测试与 E2E 不删除、不削弱、不跳过、不按平台禁用（D11）。作为证据的本机运行保存完整日志，失败的也保存。
4. 新增测试文件的 PR 在 `scripts/test-shard-weights.json` 登记权重并通过 CI-01 的守卫；该文件按下表“共享单文件”的顺序改动。
5. S9 没有迁移。若任务发现需要迁移，停下报告设计角色另立任务。
6. 契约只在响应 schema 上增加字段（S8 TINV-01 的经验）；请求 schema 与其他共享的严格 schema 一字不改。
7. 开发者不改 `design/`；合并后由设计角色同步任务表。

**泳道**（同时在岗的开发不超过 3 个；同一行内串行，唯一例外是 A 线“仅开工可并行”；不同行同时进行时冲突域不相交）：

| 线 | 顺序 | 冲突域 | 共享单文件（顺序与门禁） |
| --- | --- | --- | --- |
| A：订单 ↔ 发票 | TINV-03 → TINV-04（仅开工可并行，见下“TINV-04 评审门禁”） | 存储 + contracts + domain 类型 + web-ui:trade-orders + bench → 存储 + contracts + domain 类型 + web-ui:trade | `packages/core/src/contracts/trade-documents.ts`、`packages/core/src/domain/trade-documents.ts`、`packages/infra/src/storage/trade-documents.ts`、`scripts/test-shard-weights.json`：都是 TINV-03 在前；TINV-03 合并且覆盖其合并提交的 main Full 变绿之前，TINV-04 不改这四个文件中的任何一个，也不 rebase |
| 版本管理 | PROC-06 | docs:release + web-ui:components（只改 `components.css` 注释） | 无；A 线不得改 `components.css`，确实需要时停下报告 |

- **首批**：TINV-03 与 TINV-04 两名开发同时开工。TINV-04 在门禁前只做任务书“评审门禁”列出的 mock-first 工作（离开确认、链接函数、列组件），只跑 mock fetch 的 web 测试。PROC-06 由版本管理并行处理。
- **TINV-04 评审门禁**：TINV-03 合并、且覆盖其合并提交的 main Full 变绿之前，TINV-04 不改上表四个共享单文件中的任何一个、不 rebase、不跑真实接口路径（端到端、真实 Chrome）、不请求评审。门禁满足后依次 rebase → 改共享单文件 → 补列渲染与接口用例 → 登记权重（如有）→ 独占时段内跑端到端并取证 → 请求评审。详见 [TINV-04 评审门禁](TINV-04-invoice-list-source-order.md#评审门禁)。
- **真实 Chrome 与 E2E 由谁、何时验证**：与 S8 相同。默认 PR CI 排除 `*.slow.test.*`（`vitest.config.ts:11`），所以端到端与真实 Chrome 证据由开发者在独占时段内用 PR head 运行并附完整日志；合并后由协调者跟踪覆盖合并提交的 main Full。开发者不得为过验收修改 `CI_TEST_LAYER`、`vitest.config.ts` 或 workflow。
- **第三个名额先空着**（D263）：等 TINV-03 合并后，由协调者看有没有可并行的小任务。插入的任务只能与 A 线冲突域不相交、不加迁移、不改 `scripts/test-shard-weights.json` 与 `contrast.test.ts`。
- 每个任务合并后，按[路线图 §5 合并后动作](../roadmap.md#5-团队流程)跟踪 main Full，变绿前不派发同一冲突域的下一个任务。

**遗留项处理**（承接 [S8 评审 §5](../reviews/S8.md#5-遗留项均不阻塞-v080)）：

| # | 遗留 | S9 处理 |
| --- | --- | --- |
| 1 | `components.css` 第 3–4 行注释（S7 遗留 1） | PROC-06（D263） |
| 2 | v0.7.0 Demo 脚本版本二复跑 | 已结案（D258，已被取代） |
| 3 | TINV-02 权重来自本机采样 | 不单独立项；TINV-03 / TINV-04 改权重文件时，由协调者附上最近一次 Full 的分片耗时作参考，是否校准由守卫和 D15 决定 |
| 4 | #172 证据注记 | 不变，只影响引用 |
| 5 | Demo 未演示的分支（销售方向、价格超容差、跨月、取消后恢复） | v0.9.0 Demo 至少补“销售方向”；TINV-04 验收 5 已覆盖销售发票到订单的跳转 |
| 6 | #174 文档残留 | 已由 #176（`deb80fc`）修正，结案 |
| 7 | S7 遗留 3–5 | 维持 |
| 8 | M2-05 / M2-06 | 仍待用户授权 |
| 9 | v0.8.0 发布收尾 | 已完成（tag `v0.8.0` → `deb80fc`） |
| 新 | `docs/release/v0.8.0-release-notes.md:3` 中过时的“仍须授权”与“（tag 创建后生效）” | PROC-06（D263；v0.5.0、v0.7.0 历史文档不改） |

**S8 回顾行动项落点**：

| # | 行动 | 落点 | 由谁 |
| --- | --- | --- | --- |
| 1 | 断言对照 main 上组件的实际渲染与响应 schema 字段位置 | 路线图 §5 UI PR 证据清单第 7 项；任务书模板“证据要求”；`docs/demo/TEMPLATE.md`“截图状态断言” | 设计（本 PR）；版本管理（PROC-06） |
| 2 | 取证先 build，断言 dist 新于 HEAD | 路线图 §5 UI PR 证据清单第 8 项；`docs/demo/TEMPLATE.md`“启动与检查” | 设计（本 PR）；版本管理（PROC-06） |
| 3 | 演练覆盖 capture，每步用新上下文；覆盖不了时至少逐条核对断言（D258） | `docs/demo/TEMPLATE.md` 要求 12 与演练记录模板 | 版本管理（PROC-06） |
| 4 | 入口参数逐个列异常与恢复路径 | 路线图 §5 设计文档自查第 7 项；任务书模板“入口参数与异常”（TINV-03 已按此写） | 设计（本 PR） |
| 5 | 改条款时检查上下文，旧口径在原处改掉 | 路线图 §5 设计文档自查第 8 项；任务书模板“设计自查” | 设计（本 PR） |
| 6 | CHANGELOG 只增不删；“已验证”写明命令与取证 head | `docs/release/README.md` 检查清单 | 版本管理（PROC-06） |

## S10：发票列表筛选 + 最小常驻闸门 + v0.9.0 回顾行动（建议 v0.10.0）

**计划正文**：[S10.md](S10.md)（目标、不在本 Sprint、每个任务的用户可见变化与验收要点、DEMO-10 验收、共同验收、泳道与共享单文件、遗留项与回顾行动项落点，以该文为准）。基线为 v0.9.0 tag 所指提交 `f943b8b`；版本号由协调者定。输入见 D305。

**不在本 Sprint**：M2-05 / M2-06（仍待用户授权）；按开票状态筛选订单列表（D263 候选）；发票筛选写入地址栏；多订单合并开票、贷项冲减已开票数量、发票详情页、保留前进历史；S7 遗留 3–5。

| ID | 标题 | 类型 | 优先级 | 依赖 | 冲突域 | 状态 | PR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [TINV-05](TINV-05-invoice-list-filters.md) | 发票列表筛选：伙伴 / 方向 / 记账日期（迁移 018，一条伙伴索引 `trade_documents_party`）；筛选不进地址栏；1 万张发票热读 p95 ≤ 1 s | 迁移（只加索引）+ API（请求 schema 加可选参数，旧请求响应逐字节不变）+ 页面 | P1 | — | 迁移 / schema、存储、trade-docs、contracts、web-ui:trade（`InvoiceList`）、bench；共享单文件见 [S10 泳道](S10.md#泳道) | done | [#189](https://github.com/lingshf/ai-native-erp/pull/189)（`108684d`，[Full](https://github.com/lingshf/ai-native-erp/actions/runs/45005112904) 12/12） |
| [GATE-01](GATE-01-minimal-resident-gate.md) | 拆出最小常驻闸门（`leave-guard-gate.ts`），入口块 gzip-9 减少 ≥ 75 B；行为不变（S9 遗留 1，D284） | 前端重构 | P2 | — | web-ui:shell（`App.tsx:4–5`）、`leave-guard-history.ts` 及其测试；共享单文件 `trade-gui-scenario.ts`（GATE-01 在前，结案后解除；新增首键后退与真实前进两个步骤） | done（入口块 gzip-9 −82 B） | [#188](https://github.com/lingshf/ai-native-erp/pull/188)（`94f297c`，[Full](https://github.com/lingshf/ai-native-erp/actions/runs/45001941732) 12/12） |
| [CSS-02](CSS-02-tinv-source-min-width.md) | 删除 `.tinv-source` 冗余的 `min-width: 8ch`；先证明（含全部为“—”的列表）像素差为 0，否则保留并经协调者确认不合并结案（S9 遗留 2，D295） | CSS 清理 | P3 | TINV-05（同一 CSS 文件，合并且 main Full 绿后开工） | web-ui:trade（只删 `trade-invoices.css:172`） | 结案（不合并，D325）：保留 `min-width: 8ch`。删除后在“全部为—”的列表、390 px 下表头从 60.4px 缩到 38px 并折行，表格变高（中文卡片高 549→582，英文 564→636）；有来源订单的列表与 1440 下差异为 0。D324 时段证据：head `665ce62`、base `108684d`，16 对截图中 12 对差为 0、(b) 390 的 4 对不为 0；分支未推送 | —（不合并） |
| [PROC-07](PROC-07-s9-retro-actions.md) | S9 回顾行动 3–6 写入 Demo 模板与发布清单（版本管理，不占开发名额） | 文档 | P2（v0.10.0 RC 之前） | — | docs:release | done | [#187](https://github.com/lingshf/ai-native-erp/pull/187)（`54c94d4`，[Full](https://github.com/lingshf/ai-native-erp/actions/runs/44996578796) 12/12） |
| DEMO-10（无任务书） | v0.10.0 RC 与 Demo，补销售方向截图（S9 遗留 3，D302），验收见 [S10.md](S10.md#demo-10-验收) | 发布 | P1（Sprint 末） | TINV-05、GATE-01、CSS-02 各自结案（合并且 main Full 绿，或经协调者确认的不合并结案，见 [S10.md](S10.md#不合并结案与门禁解锁)）；PROC-07 先合并；覆盖最后一个合并提交的 main Full 绿 | docs:release | done（v0.10.0 已发布，tag → `ae4fbaa`；评审见 [S10 评审](../reviews/S10.md)） | RC [#191](https://github.com/lingshf/ai-native-erp/pull/191)（`c0189c7`，[Full](https://github.com/lingshf/ai-native-erp/actions/runs/45007492058) 12/12）；Demo [#192](https://github.com/lingshf/ai-native-erp/pull/192)（`ae4fbaa`，[Full](https://github.com/lingshf/ai-native-erp/actions/runs/45010014104) 12/12）；[v0.10.0](https://github.com/lingshf/ai-native-erp/releases/tag/v0.10.0) |

- **并行**：TINV-05 ∥ GATE-01 ∥ PROC-07 可同时进行；CSS-02 在 TINV-05 之后。S10 只有 TINV-05 含迁移，不得插入其他加迁移的任务与它并行。开发同时在岗不超过 3 人，第三个名额先空着，由协调者决定（约束见 [S10.md](S10.md#泳道)）。
- **回顾行动项**：行动 1、2、7 与行动 3、4、5 的路线图清单部分由 S10 计划 PR 写入[路线图 §5](../roadmap.md#5-团队流程)与[任务书模板](TEMPLATE.md)；行动 3–6 的模板与清单部分由 PROC-07 完成。落点表见 [S10.md](S10.md#回顾行动项落点s9-回顾d302)。

## S11：发票详情 + 采样器入库 + 导航分组 + v0.10.0 回顾行动（v0.11.0）

**计划正文**：[S11.md](S11.md)（定稿；目标、不在本 Sprint、每个任务的用户可见变化与验收要点、DEMO-11 验收、共同验收、泳道与共享单文件、遗留项与回顾行动项落点，以该文为准；各任务细节以任务书为准）。基线为 main `ad70189`；版本号 v0.11.0（D338）。输入见 D336；D338 认可 S10 回顾 8 条行动项，并把第三个开发名额给 UI-14；D340 把 UI-14 纳入 DEMO-11 发布门禁。**包括 PROC-08 在内，所有 S11 任务都在定稿 PR 合并后才派发**（D339）。

**不在本 Sprint**：M2-05 / M2-06（仍待用户授权）；按开票状态筛选订单列表（D263 候选）；发票详情深链接与发票筛选写入地址栏；多订单合并开票、贷项冲减已开票数量、保留前进历史；S7 遗留 3–5；迁移。

| ID | 标题 | 类型 | 优先级 | 依赖 | 冲突域 | 状态 | PR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [TINV-06](TINV-06-invoice-detail-dialog.md) | 发票详情只读对话框：点击或键盘打开外部单号查看抬头、行、合计、未结项余额与核销记录；只用现有 `GET /api/v1/trade/invoices/:documentId`，不改契约、不改地址栏 | 页面 | P1 | S11 定稿 PR | web-ui:trade（`TradeInvoices.tsx`、新增 `TradeInvoiceDetail.tsx`、`trade-invoices.css`、`trade-labels.ts`）；共享单文件 `trade-gui-scenario.ts`（S11 仅此任务改） | done（TINV-06 #199 + 修复 #200） | [#199](https://github.com/lingshf/ai-native-erp/pull/199)（`4bf2dcc`；其 main Full [45018372615](https://github.com/lingshf/ai-native-erp/actions/runs/45018372615) 失败）；修复 [#200](https://github.com/lingshf/ai-native-erp/pull/200)（`8f251e1`；main Full [45113406623](https://github.com/lingshf/ai-native-erp/actions/runs/45113406623) 绿） |
| [SLOT-01](SLOT-01-slot-sampler-in-repo.md) | 独占时段进程采样器与自测入库 `scripts/slot/`；排除出口带规则编号，正反自测与清单检查（S10 回顾行动 8） | 开发工具 | P2 | S11 定稿 PR | `scripts/slot/`（新目录；不进 Vitest / CI） | done | [#198](https://github.com/lingshf/ai-native-erp/pull/198)（`2a2dca1`；main Full [45017085125](https://github.com/lingshf/ai-native-erp/actions/runs/45017085125) 绿；取证 gist cc42da5d984ca0f3ce07085ec6fdf84a，commit d338d39） |
| [UI-14](UI-14-nav-groups.md) | 侧栏导航分组：“总账”组拆为“凭证与业务事件”“贸易往来”“总账与结账”三组，链接与顺序不变（界面小步，D338） | 页面 | P2 | S11 定稿 PR | web-ui:shell（`App.tsx`、`ui/labels.ts`、`ui/journal-labels.ts`、`App.test.tsx`） | done | [#197](https://github.com/lingshf/ai-native-erp/pull/197)（`4461c0e`；main Full [45016229881](https://github.com/lingshf/ai-native-erp/actions/runs/45016229881) 绿；取证 gist 9cb12f653762fe2e221ff293e313a642，rev a9f2560） |
| [WEIGHT-01](WEIGHT-01-shard-weight-calibration.md) | 三项手估分片权重按 CI 实测校准（S9 遗留 4）；偏差都 ≤ 25% 时按证据结案 | CI 配置 | P3 | TINV-06、SLOT-01 结案且 main Full 绿 | `scripts/test-shard-weights.json` | done（完成：三项校准前偏差 +309.9% / +229.2% / +132.0%，合并新值；验收 3 复测偏差都 ≤ 25%） | [#201](https://github.com/lingshf/ai-native-erp/pull/201)（`669a50a`；测量 [Full 45113406623](https://github.com/lingshf/ai-native-erp/actions/runs/45113406623)，head `8f251e1`）；验收 3 复测 [Full 45114023942](https://github.com/lingshf/ai-native-erp/actions/runs/45114023942)（head `669a50a`，`fileWeights` 口径 / 写入值 / 偏差）：`trade-gui-en-green-2` 23998 / 30124 / −20.3%（`vitest-shard-browser-1`），`trade-gui-zh-red-2` 28280 / 25647 / +10.3%（`browser-2`），`leave-guard-history` 343 / 348 / −1.4%（`unit-2`） |
| [PROC-08](PROC-08-s10-retro-actions.md) | S10 回顾行动 1–4 写入 Demo 模板、发布清单与 Git 配置（版本管理，不占开发名额） | 文档 | P2（v0.11.0 RC 之前） | S11 定稿 PR | docs:release、`.gitignore`、`.gitattributes` | done | [#196](https://github.com/lingshf/ai-native-erp/pull/196)（`913d7c5`；main Full [45014683671](https://github.com/lingshf/ai-native-erp/actions/runs/45014683671) 绿） |
| DEMO-11（无任务书） | v0.11.0 RC 与 Demo，补演 TINV-05 未演示的分支（S10 遗留 3），验收见 [S11.md](S11.md#demo-11-验收) | 发布 | P1（Sprint 末） | 五项门禁（D340）：TINV-06、SLOT-01、PROC-08、UI-14 结案，WEIGHT-01 完成或按证据结案；PROC-08 先合并；覆盖最后一个合并提交的 main Full 绿 | docs:release、`docs/demo/v0.11.0/` | done（RC + Demo；[Release v0.11.0](https://github.com/lingshf/ai-native-erp/releases/tag/v0.11.0) 已发布，tag 指向 `024b7fa`，D398） | RC [#203](https://github.com/lingshf/ai-native-erp/pull/203)（`f5defcc`；main Full [45115520939](https://github.com/lingshf/ai-native-erp/actions/runs/45115520939) 绿）；Demo [#204](https://github.com/lingshf/ai-native-erp/pull/204)（`1d2602d`；main Full [45125136528](https://github.com/lingshf/ai-native-erp/actions/runs/45125136528) 绿） |

- **并行**：定稿 PR 合并后，TINV-06 ∥ SLOT-01 ∥ UI-14 ∥ PROC-08 可同时进行；WEIGHT-01 在 TINV-06、SLOT-01 之后。S11 没有加迁移的任务。开发同时在岗不超过 3 人，第三个名额给 UI-14（D338，约束见 [S11.md](S11.md#泳道)）。
- **Sprint 评审与回顾**：[S11 评审](../reviews/S11.md)（通过，无阻塞项）、[S11 回顾](../reviews/S11-retro.md)（7 条行动项，D400 认可）。
- **回顾行动项**：行动 1–3 与行动 4 的模板部分由 PROC-08 完成；行动 4–7 的路线图与任务书模板部分已由 S11 定稿 PR 写入；行动 8 由 SLOT-01 完成。落点表见 [S11.md](S11.md#回顾行动项落点s10-回顾)。

## S12：发票深链接 + 订单按开票状态筛选 + 期末结账页小步整理（v0.12.0，草案）

**计划正文**：[S12.md](S12.md)（草案；D368 起草，D369 把 TINV-07、TORD-06 排在最前并已先行派发，D370 / D371 决定两者的方案口径；各任务细节以该文为准）。基线 main `f5defcc`；版本号暂定 v0.12.0。S11 的 Sprint 评审与回顾见 [S11 评审](../reviews/S11.md) 与 [S11 回顾](../reviews/S11-retro.md)。

**不在本 Sprint**：M2-05 / M2-06（仍待用户授权）；多订单合并开票、贷项冲减已开票数量、保留前进历史；订单筛选写入地址栏；按开票状态排序（候选池）；发票来源订单链接样式（TINV-06 定的样式，不改）。

| ID | 标题 | 类型 | 优先级 | 依赖 | 冲突域 | 状态 | PR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [TINV-07](S12.md#tinv-07发票详情深链接与筛选写入地址栏) | 发票详情深链接 `?invoice=` 与筛选写入地址栏；只用 replace，切换账套写地址，非法筛选整组忽略并提示，非法 `invoice` 前端判 notFound（D370） | 页面 | P1 | — （D369 先行派发） | web-ui:trade（`TradeInvoices.tsx`、`TradeInvoiceDetail.tsx`、发票 labels 只追加、发票测试、`docs/flows/invoice-*.md`）；共享 `trade-gui-scenario.ts`、`scripts/test-shard-weights.json` 只追加 | done | [#208](https://github.com/lingshf/ai-native-erp/pull/208)（`676d4f7`） |
| [TORD-06](S12.md#tord-06订单按开票状态筛选) | 订单按开票状态筛选：迁移 019 存储状态，过账 / 作废事务内维护，列表列读存储值；`invoicing` 单值（D371） | 迁移 + 页面 | P1 | — （D369 先行派发） | migrations(019)+migrations.ts、domain-posting、storage、contracts（订单列表查询追加）、web-ui:trade-orders；共享文件同上 | done | [#209](https://github.com/lingshf/ai-native-erp/pull/209)（`6afaef9`） |
| [UI-15](S12.md#ui-15期末结账页小步整理) | 期末结账页小步整理：补页头说明，准入徽标与复选框显示本地化模块名（界面小步） | 页面 | P2 | 本 PR | web-ui:period-close（`PeriodClose.tsx`、`TradePeriodAdmission.tsx`、`ui/close-labels.ts`、`ui/trade-report-labels.ts` 中 `trpt.*`、`pages/period-close.css` 及测试） | done | #206 |
| [UI-16](S12.md#ui-16总账四页补页头说明) | 总账四页（科目表、财务维度、凭证、业务事件）补页头说明（界面小步，D377，不用槽位） | 页面 | P2 | UI-15 合并 | web-ui:master、web-ui:dimensions、web-ui:journals、web-ui:business-events（四个页面、对应 `ui/*-labels.ts` 只追加 `*.description` 及四页测试） | done | #210 |
| [UI-17](S12.md#ui-17通用加载与失败提示去掉主数据字样) | 通用加载与失败提示去掉“主数据”字样：只影响使用这两个共享键的现有提示，专用提示不改；只改 `master.loading` / `master.error` 的中英取值，不改键名（D384，不用槽位，不进截图与门禁） | 页面（文案） | P2 | UI-16 合并 | web-ui:master（`ui/master-labels.ts`）+ web-ui:migration（`test/migration.test.tsx` 只追加） | done | [#213](https://github.com/lingshf/ai-native-erp/pull/213)（`3427d0e`） |
| [REFAC-01](S12.md#refac-01拆分-trade-gui-scenariots只搬移不改行为) | 拆分 `trade-gui-scenario.ts`：把场景函数以外的顶层声明按职责搬到 `test/support/trade-gui/`，原名再导出，只搬移不改行为（2026-11-22 用户要求可读性） | 重构（测试） | P2 | TINV-07、TORD-06 合并且 main Full 绿（D388） | tests:trade-e2e（独占） | done | [#217](https://github.com/lingshf/ai-native-erp/pull/217)（`05ebe9c`） |
| [REFAC-02](S12.md#refac-02拆分-businesseventstsx只搬移不改行为) | 拆分 `BusinessEvents.tsx`：组件按职责搬到 `src/business-events/`，只搬移不改行为 | 重构（页面） | P2 | — （D388：有开发名额空出即派） | web-ui:business-events | done | [#214](https://github.com/lingshf/ai-native-erp/pull/214)（`b5f7129`） |
| [TINV-08](S12.md#tinv-08发票页小步打磨) | 发票页小步打磨：筛选栏间距、匹配 / 未结项状态徽标、详情合计一行、数量 / 单价 / 折扣按语言分组；不改标签、契约与 tests:trade-e2e | 页面 | P2 | TINV-07 已合并；D406（比照 D375，不占浏览器时段） | web-ui:trade 发票页（`TradeInvoices.tsx`、`TradeInvoiceDetail.tsx`、`trade-invoices.css`、新增 `trade-invoice-status.ts`、`decimal-format.ts` 及发票 jsdom 测试） | done | [#219](https://github.com/lingshf/ai-native-erp/pull/219)（`ab2ba1c`） |
| [SLOT-02](S12.md#slot-02runner-开跑前静态检查与子进程环境) | runner 开跑前 tsc 与 TDZ 静态检查（退出码 4 输入或配置错误、6 新发现，runner 原样传出）与子进程 `PSModulePath` 修正（S11 回顾行动 2、3；D407 / D408：重置 `PSModulePath`，只有新写与改动的脚本用 .NET） | 开发工具 | P2 | — | `scripts/slot/`（原定不改 `procs.ps1` 与规则 R1；D411 / D412 获准把采样规则升为 R2：SR-X1 外仓判定在命令行读不到时沿用，改动限于 `procs.ps1` 的沿用判定与 roadmap §5 相应行；不进 CI） | done | [#220](https://github.com/lingshf/ai-native-erp/pull/220)（`e703971`） |
| DEMO-12（无任务书） | v0.12.0 RC 与 Demo，验收见 [S12.md](S12.md#demo-12-验收) | 发布 | P1（Sprint 末） | TINV-07、TORD-06、UI-15 结案；覆盖最后一个合并提交的 main Full 绿 | docs/release | in progress（RC 已合并） | [#221](https://github.com/lingshf/ai-native-erp/pull/221) |

- **并行**：TINV-07 ∥ TORD-06 ∥ UI-15 冲突域不相交，可同时进行（D369）；UI-15 合并后由 UI-16 接替第三个名额（D377），UI-16 合并后由 UI-17 接替（D384）；REFAC-02 合并后空出的 2 个名额给 TINV-08 ∥ SLOT-02，两者与 REFAC-01 的冲突域不相交；只有 TORD-06 加迁移（019），其他任务不得新增迁移。开发同时在岗不超过 3 人。共享单文件与槽位规则见 [S12.md](S12.md#泳道)。
- **Sprint 评审与回顾**（D445）：[S12 评审](../reviews/S12.md)（通过，无阻塞项）、[S12 回顾](../reviews/S12-retro.md)（7 条行动项，已由 D451 认可；落点见 [S14 回顾行动项落点](S14.md#回顾行动项落点)）。

## S13：迁移虚构演练与操作手册 + 订单筛选写入地址栏 + 场景函数拆分（v0.13.0，D416）

**计划正文**：[S13.md](S13.md)（D416 批准；各任务细节以该文为准）。基线 main `e703971`（S12 功能全部合并）；DEMO-12 的 RC 已随 [#221](https://github.com/lingshf/ai-native-erp/pull/221) 合并，Demo 由版本管理继续推进。版本号 v0.13.0（D416）。

**不在本 Sprint**：M2-05 真实演练与 M2-06（仍待决定 A / B / C）；多订单合并开票、贷项冲减已开票数量、保留前进历史、按开票状态排序；OQ-01 后续域；迁移（三个任务都不加，下一个可用编号仍为 020）。

| ID | 标题 | 类型 | 优先级 | 依赖 | 冲突域 | 迁移 | 浏览器时段 | 状态 | PR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [M2-05a](S13.md#m2-05a迁移虚构端到端演练与操作手册) | 迁移虚构端到端演练（快照 → dry-run → 导入含期初 → 确认 → 备份校验 → 只读核对，进 Full ≤ 60s）、`legacy-import --dry-run` 接入 CLI、迁移链路 Bench、操作手册 `docs/migration-runbook.md` | 工具 + 测试 + 文档 | P1 | M2-01、M2-04b；D417（限虚构夹具） | admin-cli（`storage-admin-main.mjs`）、bench/CI（`bench.yml`、`legacy-snapshot-windows.yml`、新 Bench 脚本）、docs/runbook（含 `docs/user/backup-and-legacy.md`、根 `README.md` 各一行链接）、新测试 `legacy-rehearsal.test.ts`、`storage-admin-cli.test.ts` 只追加；权重只追加一条 | 不加 | 不需要 | done | [#227](https://github.com/lingshf/ai-native-erp/pull/227)（`69cd9ce`） |
| [TORD-07](S13.md#tord-07订单筛选写入地址栏与小数格式化) | 订单筛选写入地址栏（只用 replace、非法整组忽略并提示，口径同 TINV-07）+ 订单详情数量 / 单价 / 折扣按语言分组 | 页面 | P2 | D418 | web-ui:trade-orders（`TradeOrders.tsx`、新增 `trade-order-link.ts`、`trade-order-labels.ts`、`trade-orders.css`、`trade-orders.test.tsx`、`docs/flows/trade-order-flow.md`）；不改 tests:trade-e2e 与契约 | 不加 | 不需要（比照 D375 / D406） | done | [#223](https://github.com/lingshf/ai-native-erp/pull/223)（`453b382`） |
| [REFAC-01b](S13.md#refac-01b拆分-tradeguiscenario-函数体不改行为) | 拆分 `tradeGuiScenario` 函数体为按阶段的具名函数，不改行为（S11 回顾行动 7） | 重构（测试） | P2 | REFAC-01 已合并；D419 | tests:trade-e2e（`trade-gui-scenario.ts` 与新目录 `trade-gui/scenario/`），独占 | 不加 | 需要（L5 真实 Chrome；D419：排在 DEMO-12 截图之后） | done | [#224](https://github.com/lingshf/ai-native-erp/pull/224)（`ef0de69`） |
| [REFAC-03](S13.md#refac-03拆分-journalstsx只搬移不改行为) | 拆分 `Journals.tsx`：`CompanyJournals` 与共享组件按职责搬到 `src/journals/`，原文件保留全部导出，只搬移不改行为 | 重构（页面） | P2 | TORD-07 合并空出名额；D431 | web-ui:journals（`Journals.tsx` 与新目录 `src/journals/`）；导入方与测试不改 | 不加 | 不需要（比照 REFAC-02） | done | [#226](https://github.com/lingshf/ai-native-erp/pull/226)（`e8ef434`） |
| [M2-05b](M2-05b-opening-batched-write.md) | 期初未结项分批写入（单事务 + 内存分批，原子性同 M2-03b），J6 导入峰值 RSS ≤ 512 MiB，关闭 KG 恢复硬判定 | 性能修复（工具链） | P1 | M2-05a 的 PR #227 合并后才派发（同写 Bench 脚本与手册，串行）；D434 | legacy-import（`opening-items.ts`、`legacy-import.ts`、可选新 `opening-staging.ts`、两份现有测试只追加或改写）、bench 开关（`bench-migration-rehearsal.mjs` 只删 KG 一项）、docs/runbook（只改 KG 两处） | 不加 | 不需要 | done | [#232](https://github.com/lingshf/ai-native-erp/pull/232)（`1c88243`） |
| [REFAC-03b](REFAC-03b-company-journals-split.md) | 拆分 `CompanyJournals` 函数体（约 1030 行）为自定义 Hook 与无 Hook 展示组件，按 ② 每函数 ≤ 80 行，不改行为（REFAC-03 候选池） | 重构（页面） | P2 | REFAC-03 已合并（#226，`e8ef434`）；D438 | web-ui:journals（只改 `journals/company-journals.tsx`，并在 `journals/` 下新增文件）；`Journals.tsx`、`dialogs.tsx`、`virtual-rows.tsx` 与测试不改 | 不加 | 不需要（jsdom 既有用例 + P4 逐步 DOM / 焦点 / 请求等价） | done（P7 按 D439 放宽） | [#231](https://github.com/lingshf/ai-native-erp/pull/231)（`e84fa4c`） |
| DEMO-13（无任务书） | v0.13.0 RC 与 Demo，验收见 [S13.md](S13.md#demo-13-验收) | 发布 | P1（Sprint 末） | 四个任务结案；覆盖最后一个合并提交的 main Full 绿 | docs/release | 不加 | 需要（截图） | done | RC [#235](https://github.com/lingshf/ai-native-erp/pull/235)（`1ff57df`）、Demo [#236](https://github.com/lingshf/ai-native-erp/pull/236)（`9866728`） |

- **并行**：M2-05a ∥ TORD-07 ∥ REFAC-01b 冲突域不相交，可同时派出；TORD-07 合并后空出的名额给 REFAC-03（web-ui:journals，与另两条不相交）；开发同时在岗不超过 3 人。只有 REFAC-01b 申请浏览器时段；M2-05a 与 TORD-07 不申请，但服从时段停用通知。共享单文件与交界规则见 [S13.md](S13.md#泳道)。
- **追加 REFAC-03b**（D438）：#226 合并后空出的名额可以马上派；冲突域 web-ui:journals 与 M2-05a / M2-05b（legacy-import、Bench、手册）、REFAC-01b（tests:trade-e2e）都不相交；不进 DEMO-13 门禁。
- **追加 M2-05b**（D434）：M2-05a 合并后有空名额即派；与 REFAC-01b、REFAC-03 不相交；不进 DEMO-13 门禁，S13 收尾前未派出则顺延为 S14 首项。
- **Sprint 评审与回顾**：[S13 评审](../reviews/S13.md)（通过，无阻塞项）、[S13 回顾](../reviews/S13-retro.md)（7 条行动项，已由 D456 认可；落点写入 S15 计划）。DEMO-13 已随 RC [#235](https://github.com/lingshf/ai-native-erp/pull/235)、Demo [#236](https://github.com/lingshf/ai-native-erp/pull/236) 合并，v0.13.0 已发布。
- **S13 期间决定**：D439–D443 与 DEMO-12“开票列表 0 px 留白”发现的处置（判定不是缺陷）见 [S13.md](S13.md#s13-期间决定d439d443与-demo-12-处置)。

## S14：共用件直接导入 + 订单页、发票页文件拆分（v0.13.1，补丁版本，D456）

计划与任务书见 [S14.md](S14.md)。基线 main `ef0de69`（S13 五个开发任务均已合并）。S14 计划的决定编号为 D447。D451 追加 FIX-01 与 S12 回顾行动项；执行期间的决定（D451–D458）见 [S14.md](S14.md#s14-期间决定d451d458)。

**不在本 Sprint**：M2-05 真实演练与 M2-06（仍待决定 A / B / C）；DEMO-12 的 0 px 留白发现（判定不是缺陷，不立任务）；订单页、发票页函数体拆分（REFAC-05b / REFAC-06c）与 `useInvoiceLeaveGuard` 直接导入（REFAC-06b）；多订单合并开票等交易候选；OQ-01 后续域；迁移（三个任务都不加，下一个可用编号仍为 020）。

| ID | 标题 | 类型 | 优先级 | 依赖 | 冲突域 | 迁移 | 浏览器时段 | 状态 | PR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [REFAC-04](S14.md#refac-04共用件直接从-journals-导入d439-方案-b) | 业务事件、总账报表、期末结账、贸易报表直接从 `journals/*` 导入共用件，删掉 `Journals.tsx` 的再导出，`CompanyJournals` 不再进入非凭证路由（D439 方案 B） | 重构（页面导入） | P1 | REFAC-03b 已合并；D439 | 12 个文件，改动范围见 [S14 改动清单 L1–L3](S14.md#范围与决定)：`Journals.tsx` 删两条再导出、可删样式导入；`journals/dialogs.tsx`、`journals/virtual-rows.tsx` 各可加一条样式导入和一行注释；business-events 与三个报表页、`ledger-reports.test.tsx` 只改 `import` 语句 | 不加 | 不需要 | done | [#240](https://github.com/lingshf/ai-native-erp/pull/240)（`ca61d8a`） |
| [REFAC-05](S14.md#refac-05拆分-tradeorderstsx只搬移不改行为) | 拆分 `TradeOrders.tsx`（1483 行）到 `src/trade-orders/`，只搬移不改行为 | 重构（页面） | P2 | 无 | web-ui:trade-orders（`TradeOrders.tsx` 与新目录） | 不加 | 不需要 | done | [#238](https://github.com/lingshf/ai-native-erp/pull/238)（`c8add53`） |
| [REFAC-06](S14.md#refac-06拆分-tradeinvoicestsx只搬移不改行为) | 拆分 `TradeInvoices.tsx`（1465 行）到 `src/trade-invoices/`，导出集合不变，只搬移不改行为 | 重构（页面） | P2 | 无 | web-ui:trade 发票页（`TradeInvoices.tsx` 与新目录）；导入方不改 | 不加 | 不需要 | done | [#242](https://github.com/lingshf/ai-native-erp/pull/242)（`48ba245`） |
| [FIX-01](S14.md#fix-01修正期初夹具的类型错误只改测试代码) | 修正 M2-05b 引入的期初夹具 `legacy-opening-fixture.ts` 中的 2 个 tsc 错误，SLOT-02 预检基线外新键回到 0（D451） | 修复（测试代码） | P1 | 无 | tests:infra 夹具（只有 `legacy-opening-fixture.ts`） | 不加 | 不需要 | done | [#241](https://github.com/lingshf/ai-native-erp/pull/241)（`69106bd`） |
| DEMO-14（无任务书） | v0.13.1 RC 与 Demo，验收见 [S14.md](S14.md#demo-14-验收) | 发布 | P1（Sprint 末） | REFAC-04 / 05 / 06 与 FIX-01 结案；覆盖最后一个合并提交的 main Full 绿 | docs/release | 不加 | 需要（截图） | done | RC [#243](https://github.com/lingshf/ai-native-erp/pull/243)（`25d1e3c`）；Demo [#245](https://github.com/lingshf/ai-native-erp/pull/245)（`002c237`）；v0.13.1 已发布（tag `5feb803`） |

- **并行**：REFAC-04 ∥ REFAC-05 ∥ REFAC-06 冲突域两两不相交，可同时派出；开发同时在岗不超过 3 人。三个任务都不加迁移、不申请浏览器时段，但服从 D442 时段停用通知。时段顺序：DEMO-13 → DEMO-14（DEMO-12 已随 #233 合并），D444 时段内只允许手动单次运行。
- **Sprint 评审与回顾**：[S14 评审](../reviews/S14.md)（通过，无阻塞项；打回 7、待证据 3，main Full 零失败）、[S14 回顾](../reviews/S14-retro.md)（6 条行动项，已由 D460 认可）。v0.13.1 已发布（tag `5feb803` → `002c237`）；DEMO-14 偏差按 D457 接受。

## S15：CI 运行时段预检 + 贷项冲减已开票数量 + 发票页收尾拆分（v0.14.0，D459）

计划与任务书见 [S15.md](S15.md)。基线 main `002c237`（S14 全部合并，v0.13.1 已发布）。计划已由 D459 批准：三条泳道 A（CI-02 → REFAC-06b）、B（REFAC-06c）、C（TINV-09）；D464 加泳道 D（JV-FIX-01）。

**不在本 Sprint**：M2-05 真实演练与 M2-06（仍待决定 A / B / C）；REFAC-05b；按开票状态排序、多订单合并开票等交易候选；OQ-01 后续域。

| ID | 标题 | 类型 | 优先级 | 依赖 | 冲突域 | 迁移 | 浏览器时段 | 状态 | PR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [CI-02](S15.md#ci-02pr-ci-运行-slot-02-静态预检) | PR CI 的 verify 在 typecheck 之后运行 SLOT-02 静态预检（S13 回顾行动 3） | CI | P1 | 无 | bench/CI：`.github/workflows/ci.yml`、`scripts/slot/README.md` | 不加 | 不需要 | done | [#248](https://github.com/lingshf/ai-native-erp/pull/248)（`5803ae8`） |
| [TINV-09](S15.md#tinv-09贷项冲减订单的已开票数量) | 贷项冲减订单的已开票数量；被冲回的数量可再开票；开票状态随之重算 | 功能（贸易单据） | P1 | 无 | storage `trade-documents.ts`；migrations(020)+migrations.ts；infra `trade-documents.test.ts`；`ui/trade-order-labels.ts` 教学文案；D463 另含 infra 的 `trade-invoice-list-fixture.ts`、`trade-order-invoicing-migration.test.ts` | **020**（只重算，不改 schema） | 不需要 | done | [#250](https://github.com/lingshf/ai-native-erp/pull/250)（`bfeccb7`） |
| [REFAC-06b](S15.md#refac-06buseinvoiceleaveguard-直接导入) | 四个页面直接从 `trade-invoices/use-invoice-leave-guard.ts` 导入，删掉 `TradeInvoices.tsx` 的再导出 | 重构（页面导入） | P2 | REFAC-04、REFAC-06 已合并 | 4 个页面的导入行、`TradeInvoices.tsx:21`、2 处注释 | 不加 | 不需要 | done（D462 例外） | [#251](https://github.com/lingshf/ai-native-erp/pull/251)（`0d2cdd3`） |
| [REFAC-06c](REFAC-06c-invoice-entry-split.md) | 拆分 `InvoiceEntry` 函数体，不改行为 | 重构（页面） | P2 | REFAC-06 已合并 | `trade-invoices/invoice-entry.tsx` 与 `trade-invoices/` 下新文件 | 不加 | 不需要 | done（P7 上限按 D461，D466 不重测） | [#256](https://github.com/lingshf/ai-native-erp/pull/256)（`94aefc2`） |
| [JV-FIX-01](S15.md#jv-fix-01凭证列表刷新列表按钮) | 凭证列表工具栏按钮由“重试”改为“刷新列表”，行为不变（D464） | 用户可见修复 | P2 | 无 | web-ui:journals：`journal-list.tsx`、`ui/journal-labels.ts`、`test/journals.test.tsx` | 不加 | 不需要 | done | [#254](https://github.com/lingshf/ai-native-erp/pull/254)（`dd9859f`） |
| DEMO-15（无任务书） | v0.14.0 RC 与 Demo，验收见 [S15.md](S15.md#demo-15-验收) | 发布 | P1（Sprint 末） | 五个开发任务结案；覆盖最后一个合并提交的 main Full 绿 | docs/release | 不加 | 需要（截图） | in progress（RC 已合并；取图推迟，tag 等 DEMO-15，D471） | RC [#257](https://github.com/lingshf/ai-native-erp/pull/257)（`072a575`）；Demo [#258](https://github.com/lingshf/ai-native-erp/pull/258) |

- **并行**：泳道 A（CI-02 → REFAC-06b，已结案）∥ B（REFAC-06c）∥ C（TINV-09）∥ D（JV-FIX-01，D464），冲突域两两不相交，开发同时在岗不超过 3 人。只有 TINV-09 带迁移。五个开发任务都不申请浏览器时段，服从 D442 时段停用通知；DEMO-15 排在它们结案之后。
- **S13 回顾行动（D456）落点**：见 [S15.md](S15.md#回顾行动项落点s13-回顾d456)。
- **Sprint 评审与回顾**：[S15 评审](../reviews/S15.md)（有条件通过：五个开发任务与 RC 已合并，条件是 DEMO-15 取图与 v0.14.0 发布；打回 11、待证据 3，main Full 零失败）、[S15 回顾](../reviews/S15-retro.md)（6 条行动项已认可；行动 5 按 D472 立为 S16 的 SLOT-03）。

## S16：订单页函数体拆分 + 订单详情显示贷项冲回数量 + 清空预检 tsc 基线（v0.15.0，D482）

计划与任务书见 [S16.md](S16.md)。已完成，v0.15.0 打在 `release/v0.15.0` 的 `e66ddd8`（D482）。基线 main `bfeccb7`（S15 四个开发任务已合并，REFAC-06c #256 在评审中，与 S16 不相交）。三条泳道 A（REFAC-05b）、B（TORD-08）、C（CI-03），都不加迁移。

**不在本 Sprint**：M2-05 真实演练与 M2-06（仍待决定 A / B / C）；其他函数体拆分（一个 Sprint 一个）；按开票状态排序、多订单合并开票等交易候选；OQ-01 后续域。

| ID | 标题 | 类型 | 优先级 | 依赖 | 冲突域 | 迁移 | 浏览器时段 | 状态 | PR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [REFAC-05b](REFAC-05b-order-workspace-split.md) | 拆分 `OrderWorkspace` 函数体，不改行为 | 重构（页面） | P2 | REFAC-05 已合并 | — | 不加 | 不需要 | done | [#265](https://github.com/lingshf/ai-native-erp/pull/265)（`00d1ed4`） |
| [TORD-08](S16.md#tord-08订单详情显示贷项冲回数量) | 订单详情新增“贷项冲回数量”列（只读，口径不变） | 功能（贸易单据） | P2 | TINV-09 已合并 | — | 不加 | 不需要 | done | [#262](https://github.com/lingshf/ai-native-erp/pull/262)（`fe371bf`） |
| [CI-03](S16.md#ci-03清空-slot-02-预检的-tsc-基线) | 修掉预检基线中的 11 个 tsc 错误，基线 `tsc` 清空 | CI / 测试类型 | P2 | CI-02 已合并 | — | 不加 | 不需要 | done（`tradeGuiSmoke` 净增 0 行，D469） | [#261](https://github.com/lingshf/ai-native-erp/pull/261)（`22bd1ce`） |
| [SLOT-03](S16.md#slot-03进程采样规则-r3只计本仓库) | 进程采样规则 R3：归属不明改为 SR-X6（不计数、全量记日志），加端口硬检查（D472） | 工具 / 时段 | P1（DEMO-15 依赖） | CI-03 已合并 | `scripts/slot/` 的 `procs.ps1`、`slot-run.ps1`、`selftest.ps1`（可新建 `selftest-ports.ps1`）、`README.md`；路线图 §5“进程采样规则”一条 | 不加 | 不需要 | done（D474 越界一行，D475 exit 8） | [#266](https://github.com/lingshf/ai-native-erp/pull/266)（`1a7f2d7`） |
| DEMO-16（无任务书） | v0.15.0 RC 与 Demo（TORD-08 未合并则 v0.14.1），验收见 [S16.md](S16.md#demo-16-验收) | 发布 | P1（Sprint 末） | 每个开发任务已合并或经协调者决定移出；覆盖最后一个合并提交的 main Full 绿 | docs/release、`docs/user/` | 不加 | 需要（截图） | done（D480 静默窗口，D481 先构建；tag `e66ddd8`，D482） | [#269](https://github.com/lingshf/ai-native-erp/pull/269)（`a131586`） |

- **并行**：A ∥ B ∥ C（CI-03 已结案，由 C′ SLOT-03 接替，D472），冲突域两两不相交，开发同时在岗不超过 3 人；都不申请浏览器时段，服从 D442 时段停用通知；DEMO-16 排在它们结案之后，申请时段附 `-Stub` 记录（D460）。
- **Sprint 评审与回顾**：[S16 评审](../reviews/S16.md)（通过：四个开发任务与 RC 已合并，v0.15.0 已发布；打回 11、待证据 0，main Full 零失败）、[S16 回顾](../reviews/S16-retro.md)（6 条行动项已认可，设计侧已写入路线图与模板；DEMO-17 须补 CHANGELOG `[Unreleased]` 的 #271 / #270）。

## S17：调整页函数体拆分 + smoke 拆分 + 订单 / 发票列表“刷新列表”（v0.16.0，D484）

计划与任务书见 [S17.md](S17.md)，已由 [#267](https://github.com/lingshf/ai-native-erp/pull/267) 合并（`8cf9712`，D476 / D477）。基线 main `00d1ed4`（S16 三个开发泳道已合并；SLOT-03 #266 按 D473 顺序收尾，不占 S17 名额）。三条泳道 A（REFAC-07）、B（REFAC-08）、C（TLIST-01），都不加迁移；S15 回顾行动 1–3 由计划 PR 写入路线图 §5 与任务书模板。

**不在本 Sprint**：M2-05 真实演练与 M2-06（仍待决定 A / B / C）；其他函数体拆分（一个 Sprint 一个）；按开票状态排序、多订单合并开票等交易候选；其他列表的“刷新列表”；OQ-01 后续域。

| ID | 标题 | 类型 | 优先级 | 依赖 | 冲突域 | 迁移 | 浏览器时段 | 状态 | PR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [REFAC-07](REFAC-07-action-entry-split.md) | 拆分调整页 `ActionEntry` 函数体，不改行为 | 重构（页面） | P2 | 无 | `TradeAdjustments.tsx` 与新目录 `trade-adjustments/` 下新文件 | 不加 | 不需要 | done | [#275](https://github.com/lingshf/ai-native-erp/pull/275)（`35df068`） |
| [REFAC-08](S17.md#refac-08拆分-tradeguismoke不改断言) | 拆分 `tradeGuiSmoke`，不改断言（D469） | 重构（测试支持） | P2 | CI-03 已合并 | infra `trade-gui/smoke.ts` 与新目录 `trade-gui/smoke/` 下新文件 | 不加 | 不需要 | done | [#270](https://github.com/lingshf/ai-native-erp/pull/270)（`adeac52`） |
| [TLIST-01](S17.md#tlist-01订单列表与发票列表加刷新列表) | 订单列表与发票列表加“刷新列表”（按已应用的筛选重读第一页） | 功能（列表） | P2 | 无 | `trade-orders/order-list.tsx`、`trade-invoices/invoice-list.tsx`、`ui/trade-order-labels.ts`、`ui/trade-labels.ts`；两个既有测试的焦点顺序断言；新测试 `trade-list-refresh.test.tsx` 与一条分片权重 | 不加 | 不需要 | done（D477：`OrderList` 206 → 209、`InvoiceList` 290 → 294） | [#271](https://github.com/lingshf/ai-native-erp/pull/271)（`0ce9940`） |
| [FIX-TADJ-BUSY](FIX-TADJ-BUSY-stale-preview-busy.md)（补充） | 调整页在途预览被编辑取代后 busy 必须清除（REFAC-07 R4 场景 P 发现的原有缺陷） | 缺陷修复（页面状态） | P3 | REFAC-07 #275 已合并（`35df068`，满足；泳道 A 续） | `trade-adjustments/action-commands.ts`；`packages/web/test/trade-adjustments.test.tsx`（加 2 个用例） | 不加 | 不需要 | done（RC 之后合并，不在 v0.16.0；D484、D485） | [#278](https://github.com/lingshf/ai-native-erp/pull/278)（`b75d30a`） |
| DEMO-17（无任务书） | v0.16.0 RC 与 Demo（TLIST-01 未合并则 v0.15.1），验收见 [S17.md](S17.md#demo-17-验收) | 发布 | P1（Sprint 末） | 每个开发任务已合并或经协调者决定移出；覆盖最后一个合并提交的 main Full 绿；DEMO-16 已发布 | docs/release、`docs/user/` | 不加 | 需要（截图） | done（tag → `release/v0.16.0` 的 `ac1c1d4`，D484；D486） | [#277](https://github.com/lingshf/ai-native-erp/pull/277)（`22f3217`） |

- **并行**：A ∥ B ∥ C，冲突域两两不相交，开发同时在岗不超过 3 人；只有 C 可能新增一条分片权重；都不申请浏览器时段，服从 D442 时段停用通知；DEMO-17 排在它们结案之后，申请时段附 `-Stub` 记录（D460）。
- **Sprint 评审与回顾**：[S17 评审](../reviews/S17.md)（通过：三个开发任务与 RC 已合并，v0.16.0 已发布；打回 8、待证据 1，main Full 零失败）、[S17 回顾](../reviews/S17-retro.md)（4 条行动项已由协调者认可，由 S18 计划落地；S18 候选见回顾末节；#278 的 `[Unreleased]` 条目已由 #279 写入，下一个 RC 转入 `[0.17.0]`，不重复添加）。

## S18：拆分 InvoiceList + Demo 脚本缺 dist 明确报错 + 贸易主数据列表“刷新列表”（v0.17.0，D494）

计划与任务书见 [S18.md](S18.md)（计划 #282 = `b5a5bdf`）。基线 main `023f18b`（S17 回顾 #280 = `350e77a`；版本管理的 S17 行动 1–3 文档 #281，D487）。三条泳道 A（REFAC-09）、B（RUNMAIN-01）、C（TLIST-02），都不加迁移；S17 回顾行动 1、3、4 由计划 PR 写入路线图 §5 与任务书模板，行动 1–3 的发布 / Demo 一侧已由 #281 写入。TLIST-02 未合并则发 v0.16.1。

**不在本 Sprint**：M2-05 真实演练与 M2-06（仍待用户决定 A / B / C）；`OrderList` 拆分（S19）与其他函数体拆分；更多列表的“刷新列表”；`slot-run.ps1` 改用新的 dist 检查脚本；OQ-01 后续域。

| ID | 标题 | 类型 | 优先级 | 依赖 | 冲突域 | 迁移 | 浏览器时段 | 状态 | PR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [REFAC-09](REFAC-09-invoice-list-split.md) | 拆分发票列表 `InvoiceList` 函数体，不改行为 | 重构（页面） | P2 | 无 | `trade-invoices/invoice-list.tsx` 与同目录新文件 | 不加 | 不需要 | done | [#285](https://github.com/lingshf/ai-native-erp/pull/285)（`1638445`） |
| [RUNMAIN-01](RUNMAIN-01-web-dist-check.md) | Demo 运行脚本缺 dist 时明确报错退出（D481 根因） | 工具（Demo 脚本） | P2 | 无 | 新目录 `scripts/demo/`（两个新文件） | 不加 | 不需要 | done | [#283](https://github.com/lingshf/ai-native-erp/pull/283)（`afafe37`） |
| [TLIST-02](TLIST-02-trade-master-refresh.md) | 贸易主数据列表加“刷新列表” | 功能（列表） | P2 | 无 | `TradeMaster.tsx`、`ui/trade-labels.ts`、`trade-master.test.tsx` | 不加 | 不需要 | done | [#284](https://github.com/lingshf/ai-native-erp/pull/284)（`34b5ae3`） |
| DEMO-18（无任务书） | v0.17.0 RC 与 Demo（TLIST-02 未合并则 v0.16.1），验收见 [S18.md](S18.md#demo-18-验收) | 发布 | P1（Sprint 末） | 每个开发任务已合并或经协调者决定移出；RUNMAIN-01 已合并；覆盖最后一个合并提交的 main Full 绿 | docs/release、`docs/demo/`、`docs/user/` | 不加 | 需要（截图） | done | [#286](https://github.com/lingshf/ai-native-erp/pull/286)（`d519bb4`；tag `v0.17.0` → `release/v0.17.0` 的 `b874b1c`） |

- **并行**：A ∥ B ∥ C，冲突域两两不相交，开发同时在岗不超过 3 人；没有共享单文件；都不申请浏览器时段，服从 D442 / D480 时段停用通知；DEMO-18 排在它们结案之后，FIX-TADJ-BUSY（#278）的 `[Unreleased]` 条目转入新版本，不重复添加（D484）。
- **Sprint 评审与回顾**：[S18 评审](../reviews/S18.md)（通过：三个开发任务与 RC 已合并，v0.17.0 已发布；打回 11、待证据 1，main Full 零失败；D488–D494）、[S18 回顾](../reviews/S18-retro.md)（行动 1 清理前记录并保留时段产物哈希（D492）、行动 2 `npm ci` 在窗口开启前完成（D493）；行动 3 RC 数字自查（D495，送审清单由 S19 文档任务 DOC-19 写入）；行动 4 测量脚本入库（S20 候选）；S20 候选见回顾末节）。

## S19：拆分 OrderList + 科目表“刷新列表”（v0.18.0，D501）

计划与任务书见 [S19.md](S19.md)（计划 [#287](https://github.com/lingshf/ai-native-erp/pull/287) = `19cd963`；S19 新决定自 D496 起）。基线 main `1638445`（S18 三个开发任务都已合并）。两条泳道 A（REFAC-10）、B（TLIST-03），都不加迁移；第三个开发位置空着，理由见 [S19.md](S19.md#为什么只有两个开发任务)。TLIST-03 未合并则发 v0.17.1。

**不在本 Sprint**：M2-05 真实演练与 M2-06（仍待用户决定 A / B / C）；其他函数体拆分；财务维度、结算等列表的“刷新列表”；`slot-run.ps1` 改用新的 dist 检查脚本；OQ-01 后续域。

| ID | 标题 | 类型 | 优先级 | 依赖 | 冲突域 | 迁移 | 浏览器时段 | 状态 | PR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [REFAC-10](REFAC-10-order-list-split.md) | 拆分订单列表 `OrderList` 函数体，不改行为 | 重构（页面） | P2 | 无 | `trade-orders/order-list.tsx` 与同目录新文件 | 不加 | 不需要 | done | [#291](https://github.com/lingshf/ai-native-erp/pull/291)（`6787f52`） |
| [TLIST-03](TLIST-03-accounts-refresh.md) | 科目表加“刷新列表” | 功能（列表） | P2 | 无 | `Accounts.tsx`、`ui/master-labels.ts`、`accounts.test.tsx` | 不加 | 不需要 | done | [#288](https://github.com/lingshf/ai-native-erp/pull/288)（`bd8d71f`） |
| DEMO-19（无任务书） | v0.18.0 RC 与 Demo（TLIST-03 未合并则 v0.17.1），验收见 [S19.md](S19.md#demo-19-验收) | 发布 | P1（Sprint 末） | v0.17.0 已发布；每个开发任务已合并或经协调者决定移出；覆盖最后一个合并提交的 main Full 绿 | docs/release、`docs/demo/`、`docs/user/` | 不加 | 需要（截图与键盘取证） | done | [#293](https://github.com/lingshf/ai-native-erp/pull/293)（`5398eb8`；tag `v0.18.0` → `release/v0.18.0` 的 `422d24b`）；发布日 [#295](https://github.com/lingshf/ai-native-erp/pull/295)（`e2a30eb`） |

- **并行**：A ∥ B，冲突域不相交，没有共享单文件；都不申请浏览器时段，服从 D442 / D480 时段停用通知；DEMO-19 排在它们结案之后。
- **Sprint 评审与回顾**：[S19 评审](../reviews/S19.md)（通过：两个开发任务、DOC-19 与 RC 已合并，v0.18.0 已发布；打回 8、待证据 1，S19 范围 main Full 零失败；D496–D501）、[S19 回顾](../reviews/S19-retro.md)（行动 1 开窗申请附逐字命令（`pwsh`，在 app worktree 内调用 tool 的 `slot-run`）、行动 3 清单列出临时账套实际路径（D500）、行动 4 证据格式四条，均落到 S20 DEMO-20；行动 2 `slot-run.ps1` 调用位置自检为 S21 候选）。

## S20：测量脚本入库 + 拆分 OrderView + 财务维度“刷新列表”（建议 v0.19.0）

计划与任务书见 [S20.md](S20.md)（S20 新决定自 D502 起，D502–D511 已用（D502 MEAS-01 M9 哈希掩码口径；D503–D510 DEMO-20 时段与 v0.19.0 发布；D511 采纳 S20 回顾行动 5、7），下一个可用 D512；D496–D501 已由 DEMO-19 时段与 v0.18.0 发布使用）。基线 main `3f8f2ff`（S19 两个开发任务与 DOC-19 都已合并；DEMO-19 / v0.18.0 进行中）。三条泳道 A（MEAS-01）、B（REFAC-11）、C（TLIST-04），都不加迁移，可同时派给 3 名开发。TLIST-04 未合并则发 v0.18.1。

**不在本 Sprint**：M2-05 真实演练与 M2-06（仍待用户决定 A / B / C）；`OrderLookup` 等其他函数体拆分；结算、业务事件等列表的“刷新列表”；`slot-run.ps1` 改用新的 dist 检查脚本；把测量脚本接入 CI 或任务书模板；OQ-01 后续域。

| ID | 标题 | 类型 | 优先级 | 依赖 | 冲突域 | 迁移 | 浏览器时段 | 状态 | PR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [MEAS-01](MEAS-01-bundle-measure-script.md) | 体积测量脚本入库（S18 回顾行动 4） | 开发工具 | P1 | 无 | `scripts/measure/**`、`packages/infra/test/tooling/bundle-compare.test.ts`、`scripts/test-shard-weights.json`（加一行） | 不加 | 不需要 | done | [#298](https://github.com/lingshf/ai-native-erp/pull/298)（`6156759`） |
| [REFAC-11](REFAC-11-order-view-split.md) | 拆分订单详情 `OrderView` 函数体，不改行为 | 重构（页面） | P2 | 无 | `trade-orders/order-view.tsx` 与同目录新文件 | 不加 | 不需要 | done | [#299](https://github.com/lingshf/ai-native-erp/pull/299)（`6fbc2da`） |
| [TLIST-04](TLIST-04-dimensions-refresh.md) | 财务维度加“刷新列表” | 功能（列表） | P2 | 无 | `Dimensions.tsx`、`dimensions.test.tsx` | 不加 | 不需要 | done | [#296](https://github.com/lingshf/ai-native-erp/pull/296)（`ea24f87`） |
| DEMO-20（无任务书） | v0.19.0 RC 与 Demo（TLIST-04 未合并则 v0.18.1），验收见 [S20.md](S20.md#demo-20-验收) | 发布 | P1（Sprint 末） | v0.18.0 已发布；每个开发任务已合并或经协调者决定移出；覆盖最后一个合并提交的 main Full 绿 | docs/release、`docs/demo/`、`docs/user/` | 不加 | 需要（截图与键盘取证） | done | [#302](https://github.com/lingshf/ai-native-erp/pull/302)（`c6d5e24`；tag `v0.19.0` → `release/v0.19.0` 的 `10292ed`，D510） |

- **并行**：A ∥ B ∥ C，冲突域不相交；共享单文件 `scripts/test-shard-weights.json` 只有 A 改；都不申请浏览器时段，服从 D442 / D480 时段停用通知；DEMO-20 排在它们结案之后。体积口径见 [S20.md](S20.md#l10--体积口径)。
- **Sprint 评审与回顾**：[S20 评审](../reviews/S20-review.md)（通过：三个开发任务与 RC 已合并，v0.19.0 已授权发布；打回 8、待证据 1；D502–D510）、[S20 回顾](../reviews/S20-retro.md)（行动 1 `npm ci` 输出存文件、行动 2 门禁父进程与每分钟快照、行动 3 批准命令不加管道、行动 4 `-SkipCapture` 开窗前完成、行动 5 同一事实只写一处（D511），落到 S21 DEMO-21；行动 6 测试满载耗时条款、行动 7 设计文档核对固定来源（D511），落到设计侧）。

## S21：时段 runner 调用位置自检 + main Full 偶发失败根治 + 业务事件“刷新列表”（建议 S20 之后的下一个 MINOR）

计划与任务书见 [S21.md](S21.md)（S21 不预占决定编号，从 S20 决定表届时的下一个可用编号起）。基线 main `6fbc2da`（S20 的 TLIST-04 #296、REFAC-11 #299 已合并；MEAS-01 #298 进行中；DEMO-20 未开始）。三条泳道 A（SLOT-04，S19 回顾行动 2）、B（FLAKE-08，run 45291279585）、C（TLIST-05），都不加迁移；DOC-21 由版本管理把证据格式四条写入送审清单（S19 回顾行动 4）。TLIST-05 不在冻结的 RC 范围内则发补丁版本。

**不在本 Sprint**：M2-05 真实演练与 M2-06（仍待用户决定 A / B / C）；结算的“刷新列表”（须先拆 `SettlementEntry`）；函数体拆分（`CompanyEvents` 只要求净增 ≤ 0）；`slot-run.ps1` 进程采样与端口规则改版；任务书模板“构建来源”改为引用 `scripts/measure`（MEAS-01 合并后另开设计 PR）。

| ID | 标题 | 类型 | 优先级 | 依赖 | 冲突域 | 迁移 | 浏览器时段 | 状态 | PR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [SLOT-04](SLOT-04-call-location-check.md) | `slot-run.ps1` 调用位置自检 + dist 检查改用 `assert-web-dist.ps1` | 开发工具 | P1 | DEMO-20 窗口已关闭 | `scripts/slot/slot-run.ps1`、`scripts/slot/selftest-location.ps1`（新）、`scripts/slot/README.md` | 不加 | 不需要 | done | [#304](https://github.com/lingshf/ai-native-erp/pull/304)（`5b6a4bf63fb11c967e0c681380580faf7a2e9340`） |
| [FLAKE-08](FLAKE-08-virtualizer-timer-after-teardown.md) | 虚拟列表防抖定时器在 jsdom 拆除后触发（main Full 偶发 `window is not defined`） | 修复（测试基础设施） | P1 | 无 | `packages/web/test/setup.ts` 和 / 或 `packages/web/test/ledger-reports.test.tsx` | 不加 | 不需要 | done | [#303](https://github.com/lingshf/ai-native-erp/pull/303)（`49f32541c27ba2265146a056f468d2c478c8fb20`） |
| [TLIST-05](TLIST-05-business-events-refresh.md) | 业务事件与待转队列加“刷新列表” | 功能（列表） | P2 | 无 | `business-events/list.tsx`、`business-events/company-events.tsx`、`business-events.test.tsx` | 不加 | 不需要 | done | [#301](https://github.com/lingshf/ai-native-erp/pull/301)（`f9024d5`） |
| DOC-21（无任务书） | 送审清单写入证据格式四条，验收见 [S21.md](S21.md#doc-21-验收) | 文档（发布流程） | P2 | 无 | `docs/release/README.md` | 不加 | 不需要 | done | [#305](https://github.com/lingshf/ai-native-erp/pull/305)（`276fd3b`） |
| DEMO-21（无任务书） | `<S21 版本>` RC 与 Demo，验收见 [S21.md](S21.md#demo-21-验收) | 发布 | P1（Sprint 末） | `<S20 版本>` 已发布；每个开发任务与 DOC-21 已合并或经协调者决定移出；覆盖最后一个合并提交的 main Full 绿 | docs/release、`docs/demo/`、`docs/user/` | 不加 | 需要（截图与键盘取证） | done | [#310](https://github.com/lingshf/ai-native-erp/pull/310)（`2ce7821`；tag `v0.20.0` → `90c762f`） |

- **并行**：A ∥ B ∥ C，冲突域不相交，没有共享单文件；A 在 DEMO-20 窗口关闭后才派发，DEMO 窗口期间不改 `scripts/slot/`；都不申请浏览器时段，服从 D442 / D480 时段停用通知；DEMO-21 排在它们结案之后。体积口径见 [S21.md](S21.md#l10--体积口径)。
- **Sprint 评审与回顾**：[S21 评审](../reviews/S21-review.md)（通过：三个开发任务、DOC-21 与 RC 已合并，v0.20.0 已发布；打回 12、待证据 0；D512 / D512 补充）、[S21 回顾](../reviews/S21-retro.md)（行动 1 清理临时账套前留文件清单与哈希、记录批准与关窗的精确时刻，行动 2 capture 新脚本先在窗口外验证焦点路径，落到 S22 DEMO-22；行动 3 回顾行动写成条款时技术断言先实测（协调者已采纳），落到设计与版本管理；第二窗口快照无父进程链由 S22 SLOT-05 解决）。

## S22：窗口门禁快照工具 + 拆分 SettlementEntry + 付款与收款“刷新列表”（版本待 S21 发布后定）

计划与任务书见 [S22.md](S22.md)（S22 决定从 **D513** 起；D512 及其补充已在 S21 期间使用，由 S21 收尾时写入 S21 决定表）。基线 main `013d681`（S21 的 TLIST-05 #301、FLAKE-08 #303、DOC-21 #305 已合并；SLOT-04 #304 进行中；DEMO-21 未开始）。两条开发泳道 A（SLOT-05，S20 回顾行动 2）、B（REFAC-12 → TLIST-06，同一泳道先后），都不加迁移；DOC-22 由版本管理把 `git grep` 自查写进送审清单（S20 回顾行动 5），SLOT-05 合并后把 Demo 模板第 23 条改为引用该工具。任务书模板“构建来源”改为引用 `scripts/measure`、新增“测试在满载下的耗时”条款（S20 回顾行动 6），由 S22 计划 PR 完成。`<S22 版本>` 在 `<S21 版本>` 发布后由协调者定。

**不在本 Sprint**：M2-05 真实演练与 M2-06（仍待用户决定 A / B / C）；拆 `OrderLookup`（S23 起）；`bundle-compare.mjs` 拆分；`scripts/measure` 接入 CI；`slot-run.ps1` 自动调用快照工具。

| ID | 标题 | 类型 | 优先级 | 依赖 | 冲突域 | 迁移 | 浏览器时段 | 状态 | PR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [SLOT-05](SLOT-05-gate-snapshot.md) | 窗口门禁与每分钟快照工具 `gate-snapshot.ps1` | 开发工具 | P1 | SLOT-04 #304 已合并；不在 DEMO 窗口内派发或合并 | `scripts/slot/gate-snapshot.ps1`（新）、`scripts/slot/selftest-gate-snapshot.ps1`（新）、`scripts/slot/README.md` | 不加 | 不需要 | done | [#312](https://github.com/lingshf/ai-native-erp/pull/312)（`7c7cafd`） |
| [REFAC-12](REFAC-12-settlement-entry-split.md) | 拆分 `SettlementEntry` 函数体（不改行为） | 重构（页面） | P2 | 无 | `packages/web/src/TradeSettlements.tsx`、`packages/web/src/trade-settlements/`（新） | 不加 | 不需要 | done | [#311](https://github.com/lingshf/ai-native-erp/pull/311)（`9c05266`） |
| [TLIST-06](TLIST-06-settlements-refresh.md) | 付款与收款页加“刷新列表” | 功能（列表） | P2 | REFAC-12 已合并 | `trade-settlements/` 下的分配页签与查询文件、`trade-settlements.test.tsx` | 不加 | 不需要 | done | [#316](https://github.com/lingshf/ai-native-erp/pull/316)（`eac0c37`） |
| DOC-22（无任务书） | 送审清单加 `git grep` 自查；Demo 模板第 23 条引用快照工具，验收见 [S22.md](S22.md#doc-22-验收) | 文档（发布流程） | P2 | (b) 须 SLOT-05 已合并 | `docs/release/README.md`、`docs/demo/TEMPLATE.md` | 不加 | 不需要 | done | (a) [#309](https://github.com/lingshf/ai-native-erp/pull/309)（`a1a1244`）；(b) [#317](https://github.com/lingshf/ai-native-erp/pull/317)（`3ae4848`） |
| DEMO-22（无任务书） | `<S22 版本>` RC 与 Demo，验收见 [S22.md](S22.md#demo-22-验收) | 发布 | P1（Sprint 末） | `<S21 版本>` 已发布；每个开发任务与 DOC-22 已合并或经协调者决定移出；覆盖最后一个合并提交的 main Full 绿 | docs/release、`docs/demo/`、`docs/user/` | 不加 | 需要（截图与键盘取证） | done | [#319](https://github.com/lingshf/ai-native-erp/pull/319)（`0494020`；tag `v0.21.0` → `01b16db`） |

- **并行**：A ∥ B，冲突域不相交，没有共享单文件；B 内 REFAC-12 合并后才开 TLIST-06，REFAC-12 未在 RC 冻结前合并则 TLIST-06 顺延 S23；A 在 #304 合并且 DEMO-21 窗口关闭后派发，DEMO 窗口期间不改 `scripts/slot/`；都不申请浏览器时段，服从 D442 / D480 时段停用通知；DEMO-22 排在它们结案之后。体积口径见 [S22.md](S22.md#l10--体积口径)。
- **Sprint 评审与回顾**：[S22 评审](../reviews/S22-review.md)（通过：三个开发任务、DOC-22 与 RC 已合并，v0.21.0 已发布；打回 11、待证据 1；D513–D521）、[S22 回顾](../reviews/S22-retro.md)（行动 1 时刻与清单由命令写进日志、清理前一次产出全产物清单，行动 2 真实浏览器只验焦点与按键、取值先断言元素，落到 S23 DEMO-23；行动 3 任务书写明 chunk 归属与首屏预算、行动 4 本机全量 web 测试用指定命令，落到 S24 计划；行动 5 回应评审逐句对照；FLAKE-09 入候选池）。

## S23：拆分 OrderLookup + 付款与收款页提示已不在未结项中的已选项 + slot-run 自动门禁快照（版本待 v0.21.0 发布后定）

计划与任务书见 [S23.md](S23.md)（D514 = S22 版本定为 v0.21.0；S23 决定 D515 REFAC-13、D516 TSET-01、D517 SLOT-06；D518–D524 在 S23 期间由协调者指定，见 [S23 决定表](S23.md#s23-期间决定)，下一个可用编号 D525）。基线 main `eac0c37`（S22 的 REFAC-12 #311、SLOT-05 #312、TLIST-06 #316 已合并），rebase 到 `3ae4848`（DOC-22(b) #317 已合并，只改 `docs/`）；DEMO-22 未发布（起草时；之后 v0.21.0 已发布，#319 = `0494020`，tag → `01b16db`）。三条开发泳道 A（REFAC-13，存量拆分）、B（TSET-01，小步界面打磨）、C（SLOT-06，SLOT-05 经 DEMO-22 实用后的后续），冲突域逐文件不相交，都不加迁移。`<S23 版本>` 在 v0.21.0 发布后由协调者定。

**不在本 Sprint**：M2-05 真实演练与 M2-06（仍待用户决定 A / B / C）；Demo 脚本删除账套前写文件清单的脚本化（先看 DEMO-22 的实现）；`-HASH` 口径文档（版本管理文档任务）；`bundle-compare.mjs` 拆分；`scripts/measure` 接入 CI；多订单合并开票（加迁移）；门禁判定检查器。

| ID | 标题 | 类型 | 优先级 | 依赖 | 冲突域 | 迁移 | 浏览器时段 | 状态 | PR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [REFAC-13](REFAC-13-order-lookup-split.md) | 拆分 `OrderLookup` 函数体（不改行为） | 重构（页面） | P2 | 无 | `packages/web/src/trade-orders/order-lookup.tsx`、`trade-orders/` 下新文件 | 不加 | 不需要 | todo | — |
| [TSET-01](TSET-01-settlement-missing-selections.md) | 付款与收款页提示并移除已不在未结项中的已选项 | 功能（小步打磨） | P2 | 无 | `trade-settlements/` 下分配页签、`settlement-items.ts`、`settlement-table-parts.tsx`、新提示条文件；`ui/trade-labels.ts`；`trade-settlements.test.tsx` | 不加 | 不需要 | todo | — |
| [SLOT-06](SLOT-06-slot-run-snapshot.md) | `slot-run.ps1` 在运行期间自动做门禁快照 | 开发工具 | P2 | DEMO-22 窗口已关闭且 run-through 已记录 SLOT-05 的实际使用；设计角色已复核任务书；不在 DEMO 窗口内派发或合并 | `scripts/slot/slot-run.ps1`、`scripts/slot/selftest-slot-snapshot.ps1`（新）、`scripts/slot/README.md` | 不加 | 不需要 | todo | — |
| DEMO-23（无任务书） | `<S23 版本>` RC 与 Demo，验收见 [S23.md](S23.md#demo-23-验收) | 发布 | P1（Sprint 末） | v0.21.0 已发布；每个开发任务已合并或经协调者决定移出；覆盖最后一个合并提交的 main Full 绿 | docs/release、`docs/demo/`、`docs/user/` | 不加 | 需要（截图与键盘取证） | todo | — |

- **并行**：A ∥ B ∥ C，冲突域不相交，没有共享单文件（`ui/trade-labels.ts` 只有 B 改）；没有加迁移的任务；C 在 DEMO-22 窗口关闭并复核任务书后派发，DEMO 窗口期间不改 `scripts/slot/`；都不申请浏览器时段，服从 D442 / D480 时段停用通知；DEMO-23 排在它们结案之后。体积口径见 [S23.md](S23.md#l10--体积口径)。

## S24：拆分 CompanyEvents + 其余待定（计划草案，版本待 S23 发布后定）

计划草案见 [S24.md](S24.md)（D525 为 REFAC-14 不改行为；D526 为 #326 中 trade-orders 串行失败判为原有偶发；D527 为 FLAKE-09 的原因推断与修法；D528 为 REFAC-15 不改行为；D529 为 MEAS-02 不改行为；D530、D531 为 FLAKE-09 补充（预加载 `beforeAll` 60 000 ms、`asyncUtilTimeout` 5000 ms）；D532 为 REFAC-16 不改行为；D533 为 REFAC-17 不改行为；D534 为 REFAC-18 不改行为；D535 为 REFAC-19 不改行为、SQL 逐字节不变；D536 为 REFAC-20 不改行为与错误先后；D537 为 REFAC-18 R4 直接断言 4 改为 4a、4b；D538 为 `dueDays` / `discountDays` 空值与契约不一致的口径（以契约为准，列入候选 P3，REFAC-18 合并后再排）；D539 为 TMAS-01 的天数校验口径；D540 为 REFAC-21 不改行为、SQL 逐字节不变；D541 为 REFAC-22 不改行为；D542 为 REFAC-23 不改行为；D543 为 REFAC-24 不改行为；D544 为 REFAC-25 不改行为、SQL 逐字节不变；D545 为 REFAC-23 R4 直接断言 1 按 base 实际错误（`trade-calculator` / `lines` / `decimal`）改写（协调者代定）；D546 为 REFAC-26 不改行为、SQL 逐字节不变；D547 为 REFAC-27 不改行为；D548 为 REFAC-28 不改行为；D549 为 REFAC-29 不改行为；下一个可用编号 D550）。REFAC-14 按 main `2794c3a` 写，已由 #326 合并；FLAKE-09 与 REFAC-15 按 main `ac8ac00` 写（REFAC-13 #325 已合并）；MEAS-02 按 main `e4a9fec` 写（SLOT-06 #322 已合并）。FLAKE-09 #330、MEAS-02 #331、REFAC-15 #332 已合并，合并后检查已完成；REFAC-16、REFAC-17 按 main `914f041` 写，已由 #334、#335 合并；REFAC-18、REFAC-19、REFAC-20 按 main `f3a7646` 写，已由 [#339](https://github.com/lingshf/ai-native-erp/pull/339)、[#338](https://github.com/lingshf/ai-native-erp/pull/338)、[#337](https://github.com/lingshf/ai-native-erp/pull/337) 合并；TMAS-01、REFAC-21、REFAC-22 按 main `37362e7` 写，TMAS-01 已由 [#342](https://github.com/lingshf/ai-native-erp/pull/342) 合并，REFAC-21、REFAC-22 已由 [#343](https://github.com/lingshf/ai-native-erp/pull/343)、[#344](https://github.com/lingshf/ai-native-erp/pull/344) 合并（main `e89b0b4`）；REFAC-23 按 main `3c9f5fd` 写，已由 [#347](https://github.com/lingshf/ai-native-erp/pull/347) 合并；REFAC-24、REFAC-25 按 main `e89b0b4` 写，REFAC-25 已由 [#348](https://github.com/lingshf/ai-native-erp/pull/348) 合并（main `5be9496`）；REFAC-24 已由 [#349](https://github.com/lingshf/ai-native-erp/pull/349) 合并；REFAC-26、REFAC-27 按 main `5be9496` 写（[#350](https://github.com/lingshf/ai-native-erp/pull/350) 已合并）；REFAC-28 按 main `b74d526` 写，已由 [#352](https://github.com/lingshf/ai-native-erp/pull/352) 合并（main `7eb7b42`）；REFAC-29 按 main `7eb7b42` 写。`release/v0.22.0` 已固定在 `3566ddb`，之后 main 上的合并不影响 DEMO-23 RC。三项并行的理由见 [S24 泳道](S24.md#泳道)。

| ID | 标题 | 类型 | 优先级 | 依赖 | 冲突域 | 迁移 | 浏览器时段 | 状态 | PR |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [REFAC-14](REFAC-14-company-events-split.md) | 拆分 `CompanyEvents` 函数体（不改行为） | 重构（页面） | P2 | 无 | `packages/web/src/business-events/company-events.tsx`、`business-events/` 下新文件 | 不加 | 不需要 | done | [#326](https://github.com/lingshf/ai-native-erp/pull/326) |
| [FLAKE-09](FLAKE-09-web-async-wait.md) | web 测试在本机负载下的异步等待超时（只改测试设置） | 测试基础设施 | P2 | REFAC-13 已合并 | `packages/web/test/setup.ts`（单文件） | 不加 | 不需要 | done | [#330](https://github.com/lingshf/ai-native-erp/pull/330) |
| [REFAC-15](REFAC-15-company-reports-split.md) | 拆分 `CompanyReports` 函数体（不改行为） | 重构（页面） | P2 | REFAC-14 已合并 | `packages/web/src/TradeReports.tsx`、新目录 `trade-reports/` | 不加 | 不需要 | done | [#332](https://github.com/lingshf/ai-native-erp/pull/332) |
| [MEAS-02](MEAS-02-bundle-compare-split.md) | 拆分 `bundle-compare.mjs`（不改行为） | 重构（工具脚本） | P3 | SLOT-06 已合并 | `scripts/measure/` | 不加 | 不需要 | done | [#331](https://github.com/lingshf/ai-native-erp/pull/331) |
| [REFAC-16](REFAC-16-rule-settings-split.md) | 拆分 `RuleSettings` 函数体（不改行为） | 重构（页面） | P2 | REFAC-15 已合并 | `packages/web/src/business-events/settings.tsx`、`business-events/` 下新文件 | 不加 | 不需要 | done | [#334](https://github.com/lingshf/ai-native-erp/pull/334) |
| [REFAC-17](REFAC-17-prepare-trade-action-split.md) | 拆分 `prepareTradeAction`（不改行为） | 重构（核心应用层） | P2 | 无 | `packages/core/src/application/trade-adjustments.ts`、同目录新增 `trade-action-*.ts` | 不加 | 不需要 | done | [#335](https://github.com/lingshf/ai-native-erp/pull/335) |
| [REFAC-18](REFAC-18-trade-editor-split.md) | 拆分 `TradeEditor` 函数体（不改行为） | 重构（页面） | P2 | REFAC-16 已合并 | `packages/web/src/TradeMaster.tsx`、新目录 `trade-master/` | 不加 | 不需要 | done | [#339](https://github.com/lingshf/ai-native-erp/pull/339) |
| [REFAC-19](REFAC-19-report-repository-split.md) | 拆分 `reportRepository`（不改行为，SQL 逐字节不变） | 重构（基础设施） | P2 | REFAC-17 已合并 | `packages/infra/src/storage/reports.ts`、同目录新增 `report-*.ts` | 不加 | 不需要 | done | [#338](https://github.com/lingshf/ai-native-erp/pull/338) |
| [REFAC-20](REFAC-20-journal-plan-split.md) | 拆分 `buildJournalPlan`（不改行为） | 重构（core 领域） | P2 | 无 | `packages/core/src/domain/journals.ts`、同目录新增 `journal-plan-*.ts` | 不加 | 不需要 | done | [#337](https://github.com/lingshf/ai-native-erp/pull/337) |
| [TMAS-01](TMAS-01-trade-days-validation.md) | 贸易主数据“天数”字段的整数校验与专用提示 | 功能（小，Web） | P2 | REFAC-18 已合并 | `packages/web/src/trade-master/`（两个文件，可加 1 个）、`ui/trade-labels.ts`（单键）、`packages/web/test/trade-master.test.tsx`、`docs/user/trade.md` | 不加 | 不需要 | done | [#342](https://github.com/lingshf/ai-native-erp/pull/342) |
| [REFAC-21](REFAC-21-business-repository-split.md) | 拆分 `businessRepository`（不改行为，SQL 逐字节不变） | 重构（基础设施） | P2 | REFAC-19 已合并 | `packages/infra/src/storage/business-events.ts`、同目录新增 `business-*.ts` | 不加 | 不需要 | done | [#343](https://github.com/lingshf/ai-native-erp/pull/343) |
| [REFAC-22](REFAC-22-account-editor-split.md) | 拆分 `AccountEditor` 函数体（不改行为） | 重构（页面） | P2 | REFAC-18 已合并 | `packages/web/src/Accounts.tsx`、新目录 `accounts/` | 不加 | 不需要 | done | [#344](https://github.com/lingshf/ai-native-erp/pull/344) |
| [REFAC-23](REFAC-23-trade-invoice-prepare-split.md) | 拆分发票准备 `TradeDocumentService.prepare`（不改行为） | 重构（核心应用层） | P2 | TMAS-01 已合并 | `packages/core/src/application/trade-documents.ts`、同目录新增 `trade-invoice-*.ts` | 不加 | 不需要 | done | [#347](https://github.com/lingshf/ai-native-erp/pull/347) |
| [REFAC-24](REFAC-24-ai-panel-split.md) | 拆分 `AiPanel` 函数体（不改行为） | 重构（页面） | P2 | REFAC-22 已合并 | `packages/web/src/AiPanel.tsx`、新目录 `ai-panel/` | 不加 | 不需要 | done | [#349](https://github.com/lingshf/ai-native-erp/pull/349) |
| [REFAC-25](REFAC-25-journal-repository-split.md) | 拆分凭证仓储 `journalRepository`（不改行为，SQL 逐字节不变） | 重构（基础设施） | P2 | REFAC-21 已合并 | `packages/infra/src/storage/journals.ts`、同目录新增 `journal-*.ts` | 不加 | 不需要 | done | [#348](https://github.com/lingshf/ai-native-erp/pull/348) |
| [REFAC-26](REFAC-26-trade-document-repository-split.md) | 拆分贸易单据仓储 `tradeDocumentRepository`（不改行为，SQL 逐字节不变） | 重构（基础设施） | P2 | REFAC-23 已合并 | `packages/infra/src/storage/trade-documents.ts`、同目录新增 `trade-document-*.ts` | 不加 | 不需要 | todo | — |
| [REFAC-27](REFAC-27-trade-settlement-prepare-split.md) | 拆分核销准备 `TradeDocumentService.prepareSettlement`（不改行为） | 重构（核心应用层） | P2 | REFAC-23 已合并 | `packages/core/src/application/trade-documents.ts`、同目录新增 `trade-settlement-*.ts` | 不加 | 不需要 | todo | — |
| [REFAC-28](REFAC-28-close-wizard-split.md) | 拆分期末结账向导 `CloseWizard`（不改行为） | 重构（页面） | P2 | REFAC-24 已合并 | `packages/web/src/PeriodClose.tsx`（只改 `CloseWizard`）、新目录 `period-close/` | 不加 | 不需要 | done | [#352](https://github.com/lingshf/ai-native-erp/pull/352) |
| [REFAC-29](REFAC-29-period-close-page-split.md) | 拆分期末结账页 `PeriodClose`（不改行为） | 重构（页面） | P2 | REFAC-28 已合并 | `packages/web/src/PeriodClose.tsx`、`period-close/` 下新文件 | 不加 | 不需要 | todo | — |
| DEMO-24（无任务书） | `<S24 版本>` RC 与 Demo，验收待正式计划补写 | 发布 | P1（Sprint 末） | S23 版本已发布；开发任务已合并或移出；main Full 绿 | docs/release、`docs/demo/`、`docs/user/` | 不加 | 视范围 | todo | — |

- **并行**：REFAC-14 与 S23 在途的 REFAC-13（`trade-orders/`）、SLOT-06（`scripts/slot/`）冲突域逐文件不相交，没有共享单文件，路由 chunk 不同；FLAKE-09 只改 `packages/web/test/setup.ts`，与 SLOT-06 不相交，在途期间其他任务不得改该文件；REFAC-15 只改贸易报表页（`TradeReports.tsx` 与新目录 `trade-reports/`），不改测试，与 FLAKE-09、SLOT-06 不相交；MEAS-02 只改 `scripts/measure/`，不是页面拆分，与 FLAKE-09、REFAC-15 不相交；REFAC-16 是此时唯一在途的页面拆分（`business-events/`），REFAC-17 只改核心应用层、不进打包产物，两者逐文件不相交，都不碰 `scripts/slot/`、`scripts/measure/`；REFAC-18 是此时唯一在途的页面拆分（贸易主数据页），REFAC-19 只改报表仓储（`packages/infra/src/storage/`）、REFAC-20 只改日记账计划（`packages/core/src/domain/`），三者逐文件不相交，后两者不进打包产物；REFAC-22 是此时唯一在途的页面拆分（科目表页），TMAS-01 只改贸易主数据页的天数解析与 `ui/trade-labels.ts`（共享单文件，在途期间其他任务不得改），REFAC-21 只改业务事件仓储（`packages/infra/src/storage/`），三者逐文件不相交；TMAS-01 #342 合并后补位的 REFAC-23 只改发票准备（`packages/core/src/application/`），不是页面拆分、不进打包产物，与 REFAC-21、REFAC-22 逐文件不相交；REFAC-21 #343、REFAC-22 #344 合并后补位的 REFAC-24（凭证页 AI 面板，`AiPanel.tsx` 与 `ai-panel/`，本批唯一的页面拆分）与 REFAC-25（凭证仓储，`packages/infra/src/storage/journals.ts` 与 `journal-*.ts`）与 REFAC-23 三者逐文件不相交；REFAC-23 #347、REFAC-25 #348 合并后补位的 REFAC-26（贸易单据仓储，`packages/infra/src/storage/trade-documents.ts` 与 `trade-document-*.ts`）与 REFAC-27（核销准备，`packages/core/src/application/trade-documents.ts` 与 `trade-settlement-*.ts`）与在评审的 REFAC-24 三者逐文件不相交，本批不派页面拆分；REFAC-24 #349 合并后补位的 REFAC-28（期末结账向导，`PeriodClose.tsx` 的 `CloseWizard` 与 `period-close/`，唯一在途的页面拆分）与 REFAC-26、REFAC-27 三者逐文件不相交；REFAC-28 #352 合并后补位的 REFAC-29（期末结账页，`PeriodClose.tsx` 与 `period-close/` 下新文件，唯一在途的页面拆分）与 REFAC-26、REFAC-27 三者逐文件不相交；都不加迁移；不申请浏览器时段，服从 D442 / D480 时段停用通知。

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
5. M2（草案）：M0-R4、M0-R5 都合并后，M2-01 与 M2-02 可并行（冲突域不重叠）。M2-03 需要 M2-02 和 M0-R1；迁移 014 必须在 M1 的 013 合并之后集成（M2-03 先就绪就等待，不互换编号）；M2-03 与 M1-03、M1-06 同属 `domain-posting`，不能同时开发，这条不因迁移串行集成规则而豁免。M2-01、M2-03、M2-04、M2-06 都改 `admin-cli`，不能同时进行。之后为 M2-04（首批）→ M2-03b → M2-04b → M2-05a（S13，虚构部分）→ M2-05（真实演练，待决定 A / C）→ M2-06 → M2-R（D26）；M2-04、M2-03b、M2-04b 都改 `admin-cli`、`legacy-import`，串行。真实操作看决定 A/B/C；D25 已决（导入期初未结项），M2-03b 与 M2-04b 合并前不做真实导入演练。

## 决定记录

D1/D2/D3、D9、D10、D25、D26 已决定，见[路线图 §6](../roadmap.md)。
