# 文档总入口

本页是系统文档的**唯一入口**：只导航、只登记覆盖状态，**不复制**各页内容。每个主题只有一页权威说明，别处用链接引用。

- 基线：main `3bbab1ef7a5c5bb68c6ab47104cd76f4d40d8549`（REFAC-30 #360）。表中“证据版本”是该页在此基线上最后一次改动的提交与日期（`git log -1 -- <页>`），表示“我核对过的版本”，不是页面已被所有者复核的证明。
- 产品边界（权威见[产品准则](../design/product-guidelines.md)与[路线图 §1](../design/roadmap.md#1-不变的产品方向)）：本地优先、SQLite、本机单用户、不做登录；教学模式可关闭。
- 事实以代码和测试为准；文档与代码冲突时，先报告并登记在下面的“缺口与冲突”，不改代码迁就文档。
- 版本说明：v0.21.0 是已发布的最新版本（[CHANGELOG](../CHANGELOG.md)）；v0.22.0 的 RC 尚未合并，其内容不在本页范围。

## 一、阅读路径

### 用户（使用产品、教学）
1. [项目 README](../README.md)：安装与启动。
2. [快速上手](user/getting-started.md) → [界面指南](user/ui-guide.md) → [教学模式](user/teaching-mode.md)。
3. 按业务读：[总账](user/ledger.md)、[贸易 AP/AR](user/trade.md)、[往来未结项与账龄](user/trade-reports.md)。
4. 需要流程图时看[界面流程图](flows/README.md)。
5. 备份、恢复与旧账工具：[备份与旧账工具](user/backup-and-legacy.md)。
6. 版本变化：[CHANGELOG](../CHANGELOG.md)，各版发布说明在 [docs/release](release/)。

### 开发者
1. [产品准则](../design/product-guidelines.md) → [路线图](../design/roadmap.md)（方向、里程碑、团队流程、决定记录）。
2. [M0 目标架构](../design/m0-architecture.md)（包与分层、存储、API、Web、测试）；[README “目录与工程命令”](../README.md#目录与工程命令)与各业务小节给出代码入口。
3. 当前任务与进度：[任务总表](../design/tasks/README.md)；单个任务书在 `design/tasks/`，评审与回顾在 `design/reviews/`。
4. 界面规范：[UI-1](../design/ui/README.md)。旧账导入契约：[legacy-import-mapping](../design/legacy-import-mapping.md)，快照工具：[legacy-snapshot](legacy-snapshot.md)。
5. 选型背景：[ADR-SME-001..006](../design/adr/ADR-SME-001.md)——**历史提案，见下方冲突 C1**。

### 运维与发布（本机运行、版本发布）
1. 启动、备份、恢复：[README](../README.md#安装与启动)、[备份与旧账工具](user/backup-and-legacy.md)。
2. 旧账迁移：[迁移操作手册](migration-runbook.md)（**真实旧账的任何一步都须用户书面授权**）。
3. 发布流程与送审清单：[发布流程](release/README.md)；Demo 规则：[Demo 模板](demo/TEMPLATE.md)；时段与测量工具：[scripts/slot](../scripts/slot/README.md)、[scripts/measure](../scripts/measure/README.md)。
4. CI：[`.github/workflows`](../.github/workflows/)（没有独立的 CI 说明页，见缺口 G6；已有部分说明：[README 目录与工程命令](../README.md#目录与工程命令)）。
5. 性能证据：[docs/performance](performance/)。

### 交接（接手者）
按顺序读：本页 → 产品准则 → 路线图 §5–§6 → M0 架构 → 任务总表与最近两个 Sprint 的任务书（`design/tasks/S*.md`）与评审（`design/reviews/`） → CHANGELOG 与最近的发布说明 → 迁移手册。再对照下面的覆盖矩阵，先看状态不是“covered”的行。

## 二、四目标覆盖矩阵

四个目标：**设计**（边界、组件、数据流）、**实现**（核心流程与代码入口）、**取舍**（背景、备选、理由、失效条件）、**使用**（启动、配置、场景、运维、排障）。

状态：`covered`（页面存在且我核对过与当前内容相符）、`gap`（缺少）、`conflict`（与权威页或当前实现冲突）、`stale`（已知过时）、`unknown`（页面存在，我没有核对到足以下结论）、`n/a`（不适用）。
“covered”须在证据列写出该页的完整 40 位 SHA（D559），无法钉版本的格一律写 partial 或 unknown；它只代表结构与内容对照，**不等于**事实所有者复核或 QA 实跑；本表没有任何一行经过这两步，所以它们仍是待办，不写完成度。

事实所有者按角色：产品 = 设计/产品负责人；开发 = 开发；发布 = Delivery/Release；知识 = Knowledge Lead。

| 范围 | 设计 | 实现 | 取舍 | 使用 | 事实所有者 | 证据版本 |
| --- | --- | --- | --- | --- | --- | --- |
| 产品范围与准则 | [产品准则](../design/product-guidelines.md) covered | n/a | [准则](../design/product-guidelines.md)、[路线图 §1](../design/roadmap.md) covered | [README](../README.md) partial（页面存在，未逐节核对） | 产品 | design/product-guidelines.md `15bc69b82d424e55d5b47c83b77c5a1768286100`；design/roadmap.md `ade6fba5948440e1d3592737f45dbb4b129b66e6`；README.md `69cd9cec128def7e0760465333569862a54f9fbc`（均为页首基线下的最后修改提交） |
| 架构与分层（core / infra / web） | [M0 架构](../design/m0-architecture.md) unknown（成文早于其后的拆分重构，未逐节对照代码） | [M0 架构 §2–§7](../design/m0-architecture.md)、[README 目录](../README.md#目录与工程命令) unknown | [ADR-SME-001](../design/adr/ADR-SME-001.md) **conflict（C1）** | [README](../README.md) partial（页面存在，未逐节核对） | 开发 | design/m0-architecture.md `50e9d0d0989272a6e9a041488ea7e7b2354aa47b`；design/adr/ADR-SME-001.md `430076f4ed35568c896eaa7f0c43e6cb721f1045`；README.md `69cd9cec128def7e0760465333569862a54f9fbc` |
| 总账（科目、维度、凭证、业务事件、报表、结账） | [M0 架构](../design/m0-architecture.md) unknown | [README M0-08..14 各节](../README.md#当前业务与统一规则) unknown | gap（G2） | [总账](user/ledger.md)、[凭证流程](flows/journal-flow.md)、[结账流程](flows/period-close-flow.md) covered（仅指页面存在且内容对应该主题，未经 QA 演练） | 开发 / 产品 | ledger `2ce7821000066d73a563de16a9d9f8601e704495`；journal-flow、period-close-flow 均 `093097990fcc158a44cd2a70b0b43ad0ac101358`（均为 页首基线下该页最后修改提交） |
| 贸易 AP/AR（发票、订单、付款/收款、预付、贷项、纠错） | [路线图 §3](../design/roadmap.md)、[M1 任务书](../design/reviews/M1.md) unknown | [README M1 各节](../README.md#账面付款收款与部分核销m1-04) unknown | gap（G2，决定散在各 Sprint 任务书） | [贸易](user/trade.md)、[往来未结项](user/trade-reports.md)、[贸易流程](flows/trade-flow.md)、[订单流程](flows/trade-order-flow.md) 等 partial（仅页面存在；各页所钉版本见证据列，未核对内容）；[界面指南](user/ui-guide.md) **stale（G3）**；付款与收款页没有独立流程图（G4） | 开发 / 产品 | docs/user/trade.md `3c9f5fda669151408f170ef21bedd2d5cf54d669`；docs/user/trade-reports.md `2910ca7fa50bf12e57cf761ab774cf1aa14bc0dc`；docs/flows/trade-flow.md `2910ca7fa50bf12e57cf761ab774cf1aa14bc0dc`；docs/flows/trade-order-flow.md `453b382e3e3d4d019e6b6f80fda57589a50333a3`；docs/user/ui-guide.md `22f32170f1bea2cbdcf749181e704c58b6a80be5` |
| 存储、备份、SQLite worker | [M0 架构 §3](../design/m0-architecture.md) unknown | [README SQLite worker](../README.md#sqlite-workerm0-13a)、[目标存储工具](../README.md#目标存储工具) unknown | [ADR-SME-001](../design/adr/ADR-SME-001.md) **conflict（C1）** | [备份与旧账工具](user/backup-and-legacy.md) covered | 开发 | docs/user/backup-and-legacy.md `1ff57df007d40b171330cfbe1fb810b541c631bd` |
| 旧账快照、导入、迁移 | [legacy-import-mapping](../design/legacy-import-mapping.md) partial（页面存在，未对照实现）；[architecture-migration](../design/architecture-migration.md) **conflict（C1）** | [legacy-snapshot](legacy-snapshot.md)、[README 历史导入](../README.md#历史导入m2-03-47m2-03b-63-已合并核对见-m2-04m2-04b) unknown | gap（G2） | [迁移手册](migration-runbook.md)、[导入流程](flows/legacy-import-flow.md)、[迁移页流程](flows/migration-page-flow.md) partial（页面存在；手册命令仅在虚构夹具验证，见手册首段；未经 QA 演练） | 开发 / 发布 | docs/migration-runbook.md `1c882437e8a92d659b19b32d845c09b51d62bc0e`；design/legacy-import-mapping.md `12f180edbec7d3e3dad5a88fd163e1edff9a29d8`；docs/flows/legacy-import-flow.md `037b3ceebf1e3854fa6a8abc24dbe07260fe1be5`；docs/flows/migration-page-flow.md `06255c7362c3a226a1b84b2832d213837593d82d`；docs/legacy-snapshot.md `3c0f346c7c4b5941c0dfeb1431d07a630ee2256f` |
| AI 助手（候选式） | gap（G1：没有独立设计页，仅 README 小节） | [README AI 与界面](../README.md#ai-与界面m0-14) unknown | gap（G2） | [总账](user/ledger.md) unknown（只确认其涉及助手，未逐节核对） | 开发 | README.md `69cd9cec128def7e0760465333569862a54f9fbc` |
| 界面与教学模式 | [UI-1 规范](../design/ui/README.md) **stale**（页首状态仍为“待评审”，未逐条对照现状） | n/a（见 `packages/web`） | [准则 PG-03/PG-04](../design/product-guidelines.md) covered | [教学模式](user/teaching-mode.md)、[教学开关流程](flows/teaching-toggle.md)（`093097990fcc158a44cd2a70b0b43ad0ac101358`）、[界面指南](user/ui-guide.md)（stale，G3）、[外壳与模板](flows/ui-shell-and-templates.md) | 产品 | design/ui/README.md `c7e5783797ea6bae83b6936a153969cc6e645f99`；design/product-guidelines.md `15bc69b82d424e55d5b47c83b77c5a1768286100`；docs/user/teaching-mode.md `fda79b7dd6562f30f2a2a0685f56a604efaa3b0b` |
| 测试与 CI 质量 | [路线图 §4](../design/roadmap.md) covered | gap（G6：无独立 CI 说明页；已有部分覆盖：README 目录与工程命令节的 PR CI/Full/Bench 描述，未与 workflow 逐条核对 unknown） | [路线图 §4](../design/roadmap.md) unknown | [README 目录与工程命令](../README.md#目录与工程命令) unknown | 开发 / 发布 | design/roadmap.md `ade6fba5948440e1d3592737f45dbb4b129b66e6`；[test-cases](../design/test-cases.md) `341300f988a01eecb71738b7d065f3c456a386c2` **stale** |
| 性能 | [准则 PG-05](../design/product-guidelines.md) covered（目标非 SLA） | [README 性能证据](../README.md#性能证据) unknown | gap | [docs/performance](performance/)（实验记录） unknown | 开发 | design/product-guidelines.md `15bc69b82d424e55d5b47c83b77c5a1768286100`；docs/performance 各页未钉版本 |
| 发布、版本、Demo | [发布流程](release/README.md) covered | [scripts/slot](../scripts/slot/README.md)、[scripts/measure](../scripts/measure/README.md) partial（页面存在；工具行为未核对） | [发布流程](release/README.md) 与各版 retro unknown | [Demo 模板](demo/TEMPLATE.md)、[CHANGELOG](../CHANGELOG.md)、[v0.21.0 发布说明](release/v0.21.0-release-notes.md) covered（仅限该文件在所钉版本，不含 release 目录其他页；v0.21.0 之后的 main 提交未纳入） | 发布 | release/README、demo/TEMPLATE `3ae4848d36c4c06c2e208173e58ed2cac3771564`；CHANGELOG、v0.21.0 发布说明 `91f066e629fa54dba5da3913a126624670ec4351`；scripts/slot/README.md `e4a9fecb6c22036b5243770689f67318d9ea8135`；scripts/measure/README.md `0c95401e30f209dd56fd9e3e55f2aa142a2d8808` |
| 团队流程与决定记录 | [路线图 §5](../design/roadmap.md) covered | n/a | **gap（G5：没有决定总索引）**，[路线图 §6](../design/roadmap.md#6-决定记录)不含 D20/D21 等 | [任务总表](../design/tasks/README.md) covered | 产品 / 协调者 | design/roadmap.md `ade6fba5948440e1d3592737f45dbb4b129b66e6`；design/tasks/README.md `2cad6d801bb6e0a474d514f1f00a09927451f4fb` |
| 安装与启动 | n/a | n/a | n/a | [README 安装与启动](../README.md#安装与启动)、[新手入门](user/getting-started.md) **stale→已在本 PR 修正**（G8：schema 019→020；未经 QA 演练 unknown） | 开发 / 发布 | README `69cd9cec128def7e0760465333569862a54f9fbc`、getting-started `6afaef980660a573aff95019ee115ff419d5ca07`（修正前）；代码依据 `packages/infra/src/storage/migrations.ts` 最新项 020 |
| 运维与排障（启动失败、锁、恢复） | n/a | n/a | n/a | gap（G7：没有独立排障页；已有部分覆盖：[迁移手册 §7 错误码速查](migration-runbook.md)、[README 安装与启动](../README.md#安装与启动)，均未经 QA 演练 unknown） | 开发 / 发布 | — |

## 三、目录覆盖（现有文档的归属）

| 位置 | 用途 | 状态 |
| --- | --- | --- |
| [`README.md`](../README.md) | 项目入口、命令、各模块当前行为 | partial（页面存在，未逐节核对）；含大量业务规则，与用户文档重复（见 D1） |
| [`design/`](../design/) 顶层 | 产品准则、路线图、M0 架构为现行；其余为历史记录（路线图页首已说明） | 现行页内容见矩阵；历史页 conflict/stale（C1、D2） |
| [`design/adr/`](../design/adr/ADR-SME-001.md) | 只有一份 ADR-SME-001..006 | conflict（C1） |
| `design/tasks/`（含 `S*.md`、任务书） | 任务书、Sprint 计划、决定表 | 现行；决定散在各文件（G5） |
| `design/reviews/` | Sprint / 任务评审与回顾 | 现行；与顶层 [`design/reviews.md`](../design/reviews.md)（公开验证记录）同名易混（D3） |
| `design/ui/`、`design/diagrams/` | UI-1 规范与原型、架构示意图 | UI-1 stale；diagrams 属 ARCH-SME-01，随 C1 |
| [`docs/user/`](user/README.md) | 用户文档 | 页面存在（版本见矩阵），索引页 stale（G3） |
| [`docs/flows/`](flows/README.md) | Mermaid 界面流程图 | 索引页写“v0.3.0”，见 G4 |
| [`docs/release/`](release/README.md) | 流程、各版发布说明、评审与回顾 | 仅 README.md 与 v0.21.0 发布说明已钉版本（见矩阵），其余未核对 |
| [`docs/demo/`](demo/TEMPLATE.md) | 每版 Demo 脚本与证据（v0.1.0..v0.21.0） | 证据存档，不是用户文档 |
| [`docs/migration-runbook.md`](migration-runbook.md) | 迁移操作手册 | partial（版本见矩阵；仅虚构夹具验证） |
| [`docs/legacy-snapshot.md`](legacy-snapshot.md) | 旧账快照生产者 | unknown |
| [`docs/performance/`](performance/) | 性能与 E2E 干扰实验记录 | unknown |
| `docs/images/` | 共用截图 | n/a |

## 四、缺口与冲突

**冲突（需要所有者决定，本页不改写其内容）**
- **C1**：[ADR-SME-001..006](../design/adr/ADR-SME-001.md)、[architecture](../design/architecture.md)、[architecture-migration](../design/architecture-migration.md)、[design](../design/design.md)、[requirements](../design/requirements.md) 描述 PostgreSQL / Server Compose / OIDC 试点与 M04..M09，而[路线图页首](../design/roadmap.md)与 [README](../README.md) 明确当前只做 SQLite、单用户、无登录，并称这些页已被取代。取舍这一目标没有一页既说明“为什么不再走双库/Server”又给出失效条件。

**缺口**
- **G1** AI 助手没有独立设计页。
- **G2** 取舍（决策背景与备选）散在 `design/tasks/S*.md`、`design/reviews/`，没有按主题汇总。
- **G3** [docs/user/README](user/README.md) 的状态叙述停留在 v0.3.0 与 v0.10/v0.11 “发布候选”，而 CHANGELOG 已到 v0.21.0；[界面指南](user/ui-guide.md)最后一节是 v0.16.0，v0.17.0 之后是否有用户可见变化需要开发/产品逐版确认（我只确认页内没有 v0.17+ 字样，没有判断是否应该有）。
- **G4** [flows/README](flows/README.md) 标题与结语仍写 v0.3.0；付款与收款页（含 v0.21.0 的“刷新列表”）没有独立流程图，只在贸易总图中出现。
- **G5** 没有决定总索引：[路线图 §6](../design/roadmap.md#6-决定记录)不含 D20/D21（[发布流程](release/README.md)已自述），D484、D514 等分散在评审与任务书。
- **G6** CI 工作流（ci、full、bench、legacy-snapshot-windows）没有独立说明页；现有覆盖：README“目录与工程命令”节（PR CI、Full、Bench 的时限与触发），未与 workflow 文件逐条核对。
- **G7** 没有独立的运维排障页；现有覆盖：迁移手册 §7 错误码速查（仅旧账迁移）和 README 安装与启动，均未经 QA 演练。
- **G8**（stale）启动文档的 schema 版本与代码不符：README 与 getting-started 原写“迁移到 019”，代码最新迁移为 `020-trade-order-invoicing-credits.sql`。本 PR 已直接改为 020（仅文档，两处各一字）；事实所有者：开发（确认 020 是当前最新）；之后每次新增迁移都要同步这两处。

**重复（单一权威待定）**
- **D1** [README](../README.md) 的业务规则小节与 [docs/user](user/README.md) 各页内容重叠。
- **D2** [design/tasks.md](../design/tasks.md)（历史）与 [design/tasks/README.md](../design/tasks/README.md)（现行）；[architecture](../design/architecture.md) 与 [M0 架构](../design/m0-architecture.md)。
- **D3** `design/reviews.md` 与 `design/reviews/` 目录同名。
- **D4** 迁移命令同时出现在 [README](../README.md#历史导入m2-03-47m2-03b-63-已合并核对见-m2-04m2-04b)、[迁移手册](migration-runbook.md)、[备份与旧账工具](user/backup-and-legacy.md)。
- **D5** [docs/user/README](user/README.md) 的版本叙述与 [CHANGELOG](../CHANGELOG.md) 重复。

## 五、维护

- 设计、代码、决定、配置或环境变化时，同步更新对应行的状态与证据版本；里程碑和交接前整体复核一次。
- 本页的状态由 Knowledge Lead 维护；事实核对属各所有者，关键步骤实跑属 QA。
