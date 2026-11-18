# 任务总表（团队进度权威来源）

规则：一个任务 = 一个分支 = 一个 PR；状态 `todo` → `in-progress` → `in-review` → `done`，`blocked` 写原因。本表只由设计角色修改（开发/评审角色在 PR 中报告，设计角色同步）。方向与流程见 [路线图](../roadmap.md)，目标架构见 [M0 架构](../m0-architecture.md)。

PR 合并条件（无分支保护，靠约定）：CI 绿 + PR 评审角色通过 + 满足任务文档验收标准。

## M0：技术栈调整 + CI

| ID | 标题 | 依赖 | 状态 | PR |
| --- | --- | --- | --- | --- |
| [M0-01](M0-01-ci-and-paused-docs.md) | 落地暂停现场文档 + 建立 CI | — | todo | |
| [M0-02](M0-02-api-pure-fastify.md) | API 去掉 NestJS，改为纯 Fastify | M0-01 | todo | |
| [M0-03](M0-03-remove-postgres-sqlite-hardening.md) | 删除 PostgreSQL；SQLite WAL 与连接设置 | M0-01 | todo | |
| [M0-04](M0-04-merge-packages.md) | 6 包合并为 core/infra/web，直接运行 TS 源码 | M0-02, M0-03 | todo | |
| [M0-05](M0-05-vitest-biome.md) | 统一 Vitest；引入 Biome | M0-04 | todo | |
| [M0-06](M0-06-pin-deps-renovate.md) | 锁定依赖版本；配置定期升级 | M0-04, D2 | todo | |
| [M0-07](M0-07-ci-layering.md) | CI 分层与预算 | M0-05 | todo | |
| [M0-08](M0-08-ledger-companies-accounts.md) | 迁移 1：公司、科目、期间 + 应用外壳 | M0-05, D1 | blocked（待 D1） | |
| [M0-09](M0-09-ledger-dimensions.md) | 迁移 2：财务维度 | M0-08 | todo | |
| [M0-10](M0-10-ledger-journals.md) | 迁移 3：凭证草稿/预览/确认与纠错 | M0-09 | todo | |
| [M0-11](M0-11-ledger-business-events.md) | 迁移 4：业务事件、过账规则、待转队列 | M0-10 | todo | |
| [M0-12](M0-12-ledger-reports-benchmark.md) | 迁移 5：查询与报表 + 100 万 GL 行基准 | M0-10 | todo | |
| [M0-13](M0-13-ledger-period-close.md) | 迁移 6：结账与期间推进 | M0-12 | todo | |
| [M0-14](M0-14-ai-assistant.md) | 迁移 7：AI 助手（候选） | M0-10 | todo | |
| [M0-15](M0-15-remove-legacy-code.md) | 删除旧代码 | M0-08..M0-14, D3 | todo | |
| [M0-R](M0-R-milestone-review.md) | M0 里程碑评审 + 测试审计（设计角色） | M0-15, M0-06, M0-07 | todo | |

## M1：贸易 AP/AR（非库存）

| ID | 标题 | 依赖 | 状态 | PR |
| --- | --- | --- | --- | --- |
| [M1-01](M1-01-trade-master-data.md) | 贸易主数据 | M0-R | todo | |
| [M1-02](M1-02-trade-calculator.md) | 贸易计算器（纯函数） | M0-R | todo | |
| [M1-03](M1-03-trade-invoices.md) | 采购/销售发票与未结项、订单行匹配 | M1-01, M1-02 | todo | |
| [M1-04](M1-04-trade-settlements.md) | 付款/收款、部分核销与现金折扣 | M1-03 | todo | |
| [M1-05](M1-05-trade-prepayments-credits-cancel.md) | 预付/预收、贷项、专用取消与反向 | M1-04 | todo | |
| [M1-06](M1-06-trade-open-items-ageing.md) | 未结项、账龄、历史余额与 GL 核对 | M1-05 | todo | |
| [M1-07](M1-07-trade-e2e-bench.md) | GUI 端到端验收与性能基准 | M1-06 | todo | |
| [M1-R](M1-R-milestone-review.md) | M1 里程碑评审 + 测试审计（设计角色） | M1-07 | todo | |

## 派发顺序

1. 第一批（按顺序，同时只开一个以避免 `package.json`/lock 冲突）：M0-01 → M0-02 → M0-03 → M0-04 → M0-05 → M0-06（需 D2）→ M0-07。M0-02 与 M0-03 可并行，后合并者重新生成 lock。
2. 第二批（D1 确认后）：M0-08 → M0-09 → M0-10 → 之后 M0-11、M0-12、M0-14 可并行 → M0-13 → M0-15（需 D3）→ M0-R。
3. M1 在 M0-R 完成后开始；M1-01 与 M1-02 可并行。

## 待决定

D1/D2/D3 见[路线图 §6](../roadmap.md)。
