# ADR-LOCAL-001：保持 SQLite 本机单用户，不走双库 / Server / OIDC 路线

- **状态**：ACCEPTED（D560 记录；方向由用户在[路线图 §1](../roadmap.md#1-不变的产品方向)确定，提交 `15bc69b`，2026-11-18）。
- **取代**：[ADR-SME-001..006](ADR-SME-001.md) 中关于双数据库（SQLite / PostgreSQL）、Server 档案、OIDC 身份、多用户批准流与 NestJS 的部分。
- **未取代**：ADR-SME 中与本 ADR 不冲突的结论（模块化单体、前后端分层、React + Vite + TypeScript、Kysely）已由 [M0 架构](../m0-architecture.md)按单机形态重新写定，以 M0 架构为准。
- **来源**：[任务总表 KDOC-01](../tasks/README.md#知识与文档待办kdocd556)（D556 的 C1 处理）。

## 背景

ARCH-SME-01（[architecture.md](../architecture.md)、[ADR-SME-001..006](ADR-SME-001.md)）曾计划同时交付本机 SQLite 档案和 Server 档案（PostgreSQL、本地开发 OIDC、多用户批准）。2026-11-18 用户改定产品方向（路线图 §1）：

- 只做 SQLite、本机单用户、loopback 无登录；
- PostgreSQL、Docker、登录与权限延后，不维护、不测试。

M0 随后删除了 PostgreSQL 实现（[M0-03](../tasks/M0-03-remove-postgres-sqlite-hardening.md)），现行形态见 [M0 架构](../m0-architecture.md)：

- `core`、`infra`、`web` 三个包；
- Kysely + better-sqlite3；
- Fastify 只监听 loopback。

## 决定

1. **存储**：只保留 SQLite 一种实现，不保留 PostgreSQL 适配层或“双库可切换”的抽象。
2. **部署**：本机单用户，HTTP 只监听 loopback，不提供 Server / Compose 档案。
3. **身份**：不做登录、OIDC、角色或多人批准；作用域沿用 tenant / book / company 模型，tenant 与 book 取固定值。
4. **不因此放松的约束**：会计不变量（复式、精确金额、过账后不可改删、显式反向、原子事务、幂等）与性能目标不变。

## 备选方案

| 方案 | 不采用的理由 | 采用它的代价（若采用） |
| --- | --- | --- |
| 双库（SQLite + PostgreSQL）并行维护 | 目标用户是本机单用户的小企业；第二种数据库的迁移、测试与 CI 成本没有对应的用户价值 | 每个迁移、仓储与基准都要写两份并在两种引擎上测，CI 时长与失败面随之增加（未经测量的估计，不是实测的翻倍） |
| Server 档案 + OIDC + 多用户批准 | 单用户场景不需要身份与分权；loopback 无登录已是用户定的边界 | 要引入身份提供方、会话、权限模型、多用户并发与审计，运维责任落在用户身上 |
| 先做 Server，再降级出本机版 | 与“本机优先”方向相反，且会把多用户复杂度带进每个切片 | 本机形态长期被 Server 设计牵制 |

## 后果

- **好处**：一种存储引擎、一套迁移与测试；CI 和基准只覆盖 SQLite；事务语义简单（一个写用例 = 一个 `BEGIN IMMEDIATE` 事务）。
- **代价**：
  - 不支持多人同时使用或远程访问；
  - better-sqlite3 是同步调用，长查询会占住执行它的 SQLite worker（M0-13a：1 个写 worker、若干只读 worker；HTTP 主线程不加载 better-sqlite3），不阻塞 HTTP 事件循环；但 worker 被占满时后续用例要排队，需要在基准中观测（见仓库 `README.md` 的“SQLite worker（M0-13a）”一节与 `packages/infra/src/main.ts`）；
  - 如果以后需要 Server，要重新设计身份与并发，而不是打开一个现成开关。
- **旧文档**：ADR-SME-001..006、`architecture.md`、`architecture-migration.md`、`design.md`、`requirements.md` 中的 ARCH-SME 部分保留为历史，开头标注“已取代”并链接本 ADR；其中仍有效的 FG / OQ 需求与会计政策，按路线图开头的说明继续有效。

## 失效条件（待核实的假设）

下列任一条成立时，本 ADR 的理由不再成立，需重新评估，并由用户决定：

1. 出现多人同时使用、远程访问或多设备同步的产品需求。
2. 实际或合成数据量下，SQLite 超出已测的性能预算（路线图 §1：热读 p95 ≤ 1s；≤100 行预览 / 确认 p95 ≤ 2s；100 万 GL 行合成基准），且索引与期间余额表都不能解决。
3. 出现必须登录、分权或职责分离的合规要求。
4. 单机文件存储无法满足备份、恢复或数据保留要求。

这些条件是假设，不是已观察到的需求；本 ADR 不为它们设定新的数字阈值。
