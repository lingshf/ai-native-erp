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
| [M1-R](M1-R-milestone-review.md) | M1 里程碑评审 + 测试审计（设计角色） | M1-07 | — | done | [#57](https://github.com/lingshf/ai-native-erp/pull/57)，报告见 [design/reviews/M1.md](../reviews/M1.md) |
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
| [M2-04](M2-04-legacy-reconciliation.md) | 迁移核对报告 | M2-03 | legacy-import, admin-cli, web-ui:migration | todo | |
| [M2-05](M2-05-migration-rehearsal.md) | 隔离试迁移演练与操作手册 | M2-01, M2-04 | bench/CI, docs/runbook | todo | |
| [M2-06](M2-06-controlled-cutover.md) | 受控切换与回退 | M2-05 | admin-cli, docs/runbook | todo | |
| [M2-R](M2-R-milestone-review.md) | M2 里程碑评审 + 测试审计（设计角色） | M2-06 | — | todo | |

**待用户决定**（已报告协调者）。四项都**没有真实操作的默认值**：未决定时，任务的工具开发和虚构验收照常进行，只有对应的真实操作不能执行。

- A：是否授权对真实旧账的私有副本取快照并做隔离演练（M2-05）。未授权前不读取真实旧账。
- B：是否授权真实停写与切换（M2-06），以及切换后新运行时的端口（当前新运行时拒绝 4173）。未授权前不停 4173、不切换。
- C：导入范围——草稿（含 ID3）导入为草稿还是跳过；回执、来源事件、转账队列、封印、审计分别导入还是只做只读归档。未确认前，对真实数据只允许 dry-run 列出选项和数量，不做真实导入。虚构夹具测试中显式传入的选项只是测试数据，不代表这项决定。
- D（M1-R 提出）：旧账 AP/AR 控制科目余额在切换时是否导入为期初未结项（需新增导入路径写 `open_items` 并与控制科目对平），还是接受它们在贸易核对中作为“其他来源”差异、另行清理。M2-03 目前只导入凭证、不建未结项；见 [M1 评审 §7](../reviews/M1.md)。须在 M2-05 前决定。

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
   - **迁移的串行集成**（带迁移的任务可以并行开发，但集成必须串行）：
     - 运行器按 `migrations.ts` 中 manifest 数组的**位置**写入版本号（`index + 1`），并校验每个版本的 checksum（`migrations.ts:83-91,163-168,177-188`），不看文件名。已进入 main 的迁移前缀、顺序和 checksum 都不能改。
     - 编号由设计角色在本表预留（main 已到 013；M2-03 预留 014，必须在 013 之后，不参与下面的互换规则）。带迁移的 PR 必须按预留编号顺序合并。
     - 如果编号大的任务先就绪（例如 M1-01 的 009 先于 M0-R1 的 008）：由协调者重新分配编号，两个任务**同时改号**（例如 008/009 互换），不能只改其中一条；设计角色同步更新本表。
     - 集成由准备合并的那个任务的开发者串行完成：rebase 到最新 main，同步改迁移文件名、manifest 顺序和 schema/对象检查，跑包含从旧版本升级的 CI，评审角色按新 head 重新评审后才能合并。同一时间只做一个迁移集成。
     - 改同一张表的两个任务不能并行开发。
   - 公共文件（`package.json`/lockfile、`web/src/App.tsx` 路由与导航、`ui/index.ts`、contracts 汇总导出）：只做追加式小改动，由后合并者 rebase 解决。改 `package.json`/lockfile 的任务同时只开一个。
   - 当前前置状态：M0 全部、M1 全部（含 M1-R，结论通过，见 [design/reviews/M1.md](../reviews/M1.md)）、M2-01..03 均已合并，以上历史派发顺序不代表仍在开发。M1-R1..R4 不阻塞 v0.2.0，可与 M2-04 按冲突域穿插派发；main 迁移已到 014。
5. M2（草案）：M0-R4、M0-R5 都合并后，M2-01 与 M2-02 可并行（冲突域不重叠）。M2-03 需要 M2-02 和 M0-R1；迁移 014 必须在 M1 的 013 合并之后集成（M2-03 先就绪就等待，不互换编号）；M2-03 与 M1-03、M1-06 同属 `domain-posting`，不能同时开发，这条不因迁移串行集成规则而豁免。M2-01、M2-03、M2-04、M2-06 都改 `admin-cli`，不能同时进行。之后依次为 M2-04 → M2-05 → M2-06 → M2-R。真实操作只看决定 A/B/C。

## 决定记录

D1/D2/D3、D9、D10 已决定，见[路线图 §6](../roadmap.md)。
