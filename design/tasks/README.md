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
| [M1-R1](M1-R1-trade-order-entry.md) | 非库存订单录入 GUI（不阻塞 v0.2.0） | M1-R | web-ui:trade | todo | |
| [M1-R2](M1-R2-trade-teaching-and-lists.md) | 贸易页教学提示补齐 + 调整页列表虚拟滚动（不阻塞 v0.2.0） | M1-R | web-ui:trade | todo | |
| [M1-R3](M1-R3-trade-report-capacity.md) | 账龄/余额容量：带历史与并发的基准（不阻塞 v0.2.0） | M1-R | bench/CI, storage | todo | |
| [M1-R4](M1-R4-trade-test-trim.md) | 贸易 E2E 精简、断言、400 日志分类、LF 行尾（不阻塞 v0.2.0） | M1-R | bench/CI, http | todo | |

## M2：账套迁移/切换（草案，需用户授权）

**开工门禁**：M0-R4、M0-R5 都合并后 M2 才开工。M2-01、M2-02 显式依赖两者，其余任务经依赖传递继承。开发、CI 和 Bench 只用虚构夹具。

| ID | 标题 | 依赖 | 冲突域 | 状态 | PR |
| --- | --- | --- | --- | --- | --- |
| [M2-01](M2-01-legacy-snapshot-producer.md) | 旧账快照与旧账备份生成 | M0-R4, M0-R5 | — | done | [#42](https://github.com/lingshf/ai-native-erp/pull/42) |
| [M2-02](M2-02-legacy-import-mapping.md) | 旧账→目标库映射与 dry-run | M0-R4, M0-R5 | — | done | [#43](https://github.com/lingshf/ai-native-erp/pull/43) |
| [M2-03](M2-03-legacy-import-execute.md) | 导入执行（写入新的目标库） | M2-02, M0-R1 | migrations(014)+migrations.ts, domain-posting, storage, admin-cli | done | [#47](https://github.com/lingshf/ai-native-erp/pull/47) |
| [M2-03b](M2-03b-legacy-opening-open-items.md) | 旧账 AP/AR 期初未结项导入与核对口径（D25） | M2-03, M1-06 | legacy-import, domain-posting, storage, admin-cli, web-ui:trade | done | [#63](https://github.com/lingshf/ai-native-erp/pull/63) |
| [M2-04](M2-04-legacy-reconciliation.md) | 迁移核对报告（首批，现行 `tradeReconciliation` + 期初门禁 fail-closed，D26） | M2-03 | legacy-import, admin-cli, web-ui:migration | todo | |
| [M2-04b](M2-04-legacy-reconciliation.md#跟进-m2-04bd25d26) | M2-04 跟进：贸易子账按 P 公式核对、期初负例（D25/D26） | M2-04, M2-03b | legacy-import, admin-cli, web-ui:trade, web-ui:migration | in-review | [#70](https://github.com/lingshf/ai-native-erp/pull/70) |
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
| [UI-01](UI-01-tokens-and-shell.md) | 设计 token + 布局外壳（顶栏偏好、分组导航、对比度测试） | — | web-ui:shell | todo | |
| [UI-02a](UI-02a-report-components-and-trade-reports.md) | 报表组件 + 往来未结项与账龄页（样板页，影响限本页） | UI-01 | web-ui:components, web-ui:trade | todo | |
| [UI-02b](UI-02b-form-components-and-accounts.md) | 表单组件（Field / FormGrid / FastTab）+ 科目表页 | UI-02a | web-ui:components, web-ui:master | todo | |
| [UI-03](UI-03-trade-invoices.md) | 采购与销售发票页 | UI-02b | web-ui:trade | todo | |
| [UI-04](UI-04-master-data.md) | 主数据页：财务维度、贸易主数据 | UI-02b | web-ui:master, web-ui:trade | todo | |
| [UI-05](UI-05-journals-and-events.md) | 凭证与业务事件页 | UI-02b | web-ui:journals | todo | |
| [UI-06](UI-06-trade-settlements-and-adjustments.md) | 付款与收款、预付 / 贷项 / 专用纠错页 | UI-03 | web-ui:trade | todo | |
| [UI-07a](UI-07a-ledger-reports.md) | 总账报表、快照报表、报表索引 | UI-02a | web-ui:ledger | todo | |
| [UI-07b](UI-07b-period-close.md) | 期末结账 + 贸易期间准入 | UI-02b | web-ui:period-close, web-ui:trade | todo | |
| [UI-07c](UI-07c-ai-panel.md) | AI 面板 | UI-05 | web-ui:journals | todo | |
| [UI-07d](UI-07d-overview.md) | 运行状态页（`App.tsx` 中的 `Overview`） | UI-02a | web-ui:shell | todo | |
| [UI-07e](UI-07e-migration.md) | 迁移核对页（#59 带入的 `Migration.tsx`） | UI-02a | web-ui:migration | todo | |
| [UI-08](UI-08-polish-and-audit.md) | 收尾：删除兼容样式、组件提升、一致性审查（不重做页面） | UI-01 … UI-07e | web-ui:shell, web-ui:components | todo | |

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
| `styles.css` 兼容层清理 | UI-08（边界见任务文件） |

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
     - 四个真实 Chrome 场景 `packages/infra/test/http/trade-gui-{zh-red,zh-green,en-red,en-green}.slow.test.ts`，及其共享场景 `packages/infra/test/support/trade-gui-scenario.ts`；
     - `packages/infra/test/http/migration-gui.slow.test.ts`。
   - 不删用例、不放宽断言、不改选择器，只允许**新增**断言。
   - ID、按钮可访问名称、`nav a[href]`、`main h2`、`.workspace[data-theme]`、`html[lang]` 不变。
   - **精确 head 的真实浏览器证据**：PR 快速 CI 不跑 `*.slow.test.ts`，Full 只在 main push 与定时任务上运行，所以每个实施 PR 都要在 PR 当前 head 上本地运行上述五个 slow 测试：
     ```
     ERP_E2E_BROWSER_CHANNEL=chrome npx vitest run trade-gui- migration-gui.slow
     # PowerShell：$env:ERP_E2E_BROWSER_CHANNEL="chrome"; npx vitest run trade-gui- migration-gui.slow
     ```
     必须用真实 Chrome，不用 headless shell 或 Edge 替代。在 PR 中贴出 head SHA、命令、通过摘要和 `ERP_E2E_ARTIFACTS` 截图。head 每变一次（含 rebase），重新运行并更新证据；SHA 不符的证据无效。
   - 不把 slow 测试加入 PR 快速 CI，不改 workflow。
   - **合并后跟踪 main Full**：合并者记录合并提交，并跟踪该提交的 main Full 运行。在它变绿之前，不派发同冲突域的下一个 UI 任务。若变红且与本任务相关，由同一任务修复或回退，不靠修改断言过关。
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
   - **迁移的串行集成**（带迁移的任务可以并行开发，但集成必须串行）：
     - 运行器按 `migrations.ts` 中 manifest 数组的**位置**写入版本号（`index + 1`），并校验每个版本的 checksum（`migrations.ts:83-91,163-168,177-188`），不看文件名。已进入 main 的迁移前缀、顺序和 checksum 都不能改。
     - 编号由设计角色在本表预留（main 已到 013；M2-03 预留 014，必须在 013 之后，不参与下面的互换规则）。带迁移的 PR 必须按预留编号顺序合并。
     - 如果编号大的任务先就绪（例如 M1-01 的 009 先于 M0-R1 的 008）：由协调者重新分配编号，两个任务**同时改号**（例如 008/009 互换），不能只改其中一条；设计角色同步更新本表。
     - 集成由准备合并的那个任务的开发者串行完成：rebase 到最新 main，同步改迁移文件名、manifest 顺序和 schema/对象检查，跑包含从旧版本升级的 CI，评审角色按新 head 重新评审后才能合并。同一时间只做一个迁移集成。
     - 改同一张表的两个任务不能并行开发。
   - 公共文件（`package.json`/lockfile、`web/src/App.tsx` 路由与导航、`ui/index.ts`、contracts 汇总导出）：只做追加式小改动，由后合并者 rebase 解决。改 `package.json`/lockfile 的任务同时只开一个。
   - 当前前置状态：基线 main `336c0cd` 已含 M0 全部、M1-01..07（#54、#56）、M2-01..03（#47）；M1-R 随 #57 合并落地（结论通过，见 [design/reviews/M1.md](../reviews/M1.md)）。以上历史派发顺序不代表仍在开发。M1-R1..R4 不阻塞 v0.2.0，可与 M2-03b 按冲突域穿插派发；main 迁移已到 014。
5. M2（草案）：M0-R4、M0-R5 都合并后，M2-01 与 M2-02 可并行（冲突域不重叠）。M2-03 需要 M2-02 和 M0-R1；迁移 014 必须在 M1 的 013 合并之后集成（M2-03 先就绪就等待，不互换编号）；M2-03 与 M1-03、M1-06 同属 `domain-posting`，不能同时开发，这条不因迁移串行集成规则而豁免。M2-01、M2-03、M2-04、M2-06 都改 `admin-cli`，不能同时进行。之后为 M2-04（首批）→ M2-03b → M2-04b → M2-05 → M2-06 → M2-R（D26）；M2-04、M2-03b、M2-04b 都改 `admin-cli`、`legacy-import`，串行。真实操作看决定 A/B/C；D25 已决（导入期初未结项），M2-03b 与 M2-04b 合并前不做真实导入演练。

## 决定记录

D1/D2/D3、D9、D10、D25、D26 已决定，见[路线图 §6](../roadmap.md)。
