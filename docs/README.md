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
1. 安装：[README](../README.md#安装与启动)；启动配置、备份、恢复、故障排查：[运维与故障排查](operations.md)。
2. 旧账迁移：[迁移操作手册](migration-runbook.md)（**真实旧账的任何一步都须用户书面授权**）。
3. 发布流程与送审清单：[发布流程](release/README.md)；Demo 规则：[Demo 模板](demo/TEMPLATE.md)；时段与测量工具：[scripts/slot](../scripts/slot/README.md)、[scripts/measure](../scripts/measure/README.md)。
4. 改代码：[代码入口](code-entry.md)（三处 REFAC 拆分模块的入口、扩展点与调试命令）；CI：[CI 说明](ci.md)（工作流本体在 [`.github/workflows`](../.github/workflows/)）。
5. 性能证据：[docs/performance](performance/)。

### 交接（接手者）
按顺序读：本页 → 产品准则 → 路线图 §5–§6 → M0 架构 → 任务总表与最近两个 Sprint 的任务书（`design/tasks/S*.md`）与评审（`design/reviews/`） → CHANGELOG 与最近的发布说明 → 迁移手册。再对照下面的覆盖矩阵，先看状态不是“covered”的行。

## 二、四目标覆盖矩阵

四个目标：**设计**（边界、组件、数据流）、**实现**（核心流程与代码入口）、**取舍**（背景、备选、理由、失效条件）、**使用**（启动、配置、场景、运维、排障）。

状态：`covered`（页面存在且我核对过与当前内容相符）、`gap`（缺少）、`conflict`（与权威页或当前实现冲突）、`stale`（已知过时）、`unknown`（页面存在，我没有核对到足以下结论）、`n/a`（不适用）。
“covered”须在证据列写出该页的完整 40 位 SHA（D559），无法钉版本的格一律写 partial 或 unknown；它只代表结构与内容对照，**不等于**事实所有者复核或 QA 实跑；本表没有任何一行同时经过完整的这两步（个别页有范围受限的 QA 证据，逐 PR 见下“QA 范围”），所以它们仍是待办，不写完成度。矩阵里写“QA 见表”的格，指向该表。

**钉版本（D561，KDOC-08）**：`ui-guide`、`trade`、`teaching-mode`、`backup-and-legacy` 在 KDOC-05（#368）中改动，现按其合并提交 `04b576baf9f03c13055daf98be6b0831cf086648` 钉版本；内容仍只做了结构对照，未经事实所有者复核；QA 只有“QA 范围”表中 #368 的只读检查，所以保持 partial。

**QA 范围（MCF-06，D578）**：下表按各 PR 评审里 QA 结论的原文范围逐项汇总，每行只覆盖所写范围，不扩大到整页；没有列出的页面或 PR，其 QA 证据**未在此汇总，不代表不存在**。QA 证据类型分三种：只读（对照源码、现有测试）、jsdom / 假 SDK（自动化测试，不是真实浏览器或真实 Copilot）、安全夹具实跑。

| PR | QA 实际覆盖（精确 head） | 证据类型 | 未覆盖 |
|---|---|---|---|
| [#365](https://github.com/lingshf/ai-native-erp/pull/365) | `7d4b911f66ee75d0d06ca45885ab5972114753e1`：本入口页与启动阅读路径；根 README 与入门页的 schema 版本 020 对照迁移登记（G8）；npm 启动命令映射 | 只读（未启动服务、未打开数据库） | 其余矩阵各行；命令的实际执行 |
| [#368](https://github.com/lingshf/ai-native-erp/pull/368) | `66e15b59d98aebb49428dfe068e1fcba70137111`：KDOC-05 阅读路径；刷新列表与订单指引对照代码与现有 GUI 断言 | 只读（未启动服务、浏览器与数据库） | 其余用户页；界面实际操作 |
| [#370](https://github.com/lingshf/ai-native-erp/pull/370) | `f202df15abfd5139977998ed07060ca8fa9b5fb4`：`docs/ci.md` 的本地复现命令，在 Windows PowerShell 与 Git Bash 下实跑所写的 Vitest 文件选择（`CI_TEST_LAYER` 的 pr/full 切换）；此前各轮另对 `selectPrTests`、`shouldRun` 跑过固定用例 | 命令实跑（Vitest）；其余只读 | 没有触发任何 workflow，没有浏览器运行；Bench 与 Full 上传的实际运行 |
| [#373](https://github.com/lingshf/ai-native-erp/pull/373) | `61c9c6147004b82353fe1738c8eb47b48ce8c99d`：付款与收款流程图对照代码（v0.21.0 与 TSET-01 分开标注）；实跑付款与收款的 24 个 jsdom 用例（[评审](https://github.com/lingshf/ai-native-erp/pull/373#pullrequestreview-6048059068)） | jsdom（非真实浏览器） | 真实浏览器中的界面步骤 |
| [#374](https://github.com/lingshf/ai-native-erp/pull/374) | `503d9f13d81b6289bf42c679d587dbc403574d09`：运维页与迁移手册，在安全夹具上实际演练持锁（启动报 `StartupError`）、租约、迁移、备份与恢复；本轮复查链接与可执行文件未变（[评审](https://github.com/lingshf/ai-native-erp/pull/374#pullrequestreview-6048340633)） | 安全夹具实跑 | 旧账快照、dry-run、仅导入的健康验证没有跑 |
| [#375](https://github.com/lingshf/ai-native-erp/pull/375) | `c77bbd0ec666d5983e8580d94e7834346678baff`：当前 head 对照代码只读复核披露与配置路径；并保留此前定向的 jsdom AI 流程与假 SDK 测试证据（[评审](https://github.com/lingshf/ai-native-erp/pull/375#pullrequestreview-6048462623)） | 只读 + 继承的 jsdom / 假 SDK 测试 | 真实 Copilot；整页；之后 [#391](https://github.com/lingshf/ai-native-erp/pull/391) 改写的第 3、5、7 节（#392 只更新索引钉点，未改页面内容） |
| [#391](https://github.com/lingshf/ai-native-erp/pull/391) | `b2fd1b3daf0e3fefb1f7257d81e6fdfe9fc773fc`：D570/D571 修订范围；R6a 两平台证据；R6b 只采信 Linux 离线原生握手（[run 45525878329](https://github.com/lingshf/ai-native-erp/actions/runs/45525878329)）；沿用 Windows 假 SDK 测试 21/21 | 测试与 CI 运行 | Windows R6b 未验证；不扩大到 `ai-assistant.md` 整页 |
| [#386](https://github.com/lingshf/ai-native-erp/pull/386) | 不是 QA。设计的事实核对只覆盖 `7aabc4f` 上两项：官方链接属实；第 3、7 节符合 R7 时点 2 | 设计核对 | 其余一切，含整页事实与 QA |

**剩余缺口（QA 与复核）**：（1）没有真实浏览器的页面步骤演练，#373、#375 只有 jsdom / 假 SDK；（2）没有真实 Copilot 调用，Windows 原生 CLI 离线启动未验证（D571）；（3）旧账快照、dry-run、仅导入的健康验证没有演练（#374）；（4）没有 workflow 实际运行或按页面排查失败的演练（#370）；（5）`ai-assistant.md` 整页事实复核与整页 QA 未做，#391 改写后的第 3、5、7 节只有上表的 D570/D571 范围；（6）本表之外页面的 QA 证据未汇总。

**KDOC-07 的改动（D561）**：新增 `operations.md`，改动 `backup-and-legacy.md` 与根 `README.md`（“目标存储工具”“历史导入”两节改为链接）。另改动 `migration-runbook.md`（§6、新增 §10）、`user/getting-started.md`、`user/trade-main-path.md`、`legacy-snapshot.md`（快照命令改为链接）。这些页已在 KDOC-04 按 #374 合并提交 `66f3a47623e3b07f55447b06ac48fe84d153c34a` 钉版本，仍为 partial；README 其他小节未重新核对。`ledger.md`、`settlement-flow.md` 已钉到 KDOC-06 合并提交（见各行）。

事实所有者按角色：产品 = 设计/产品负责人；开发 = 开发；发布 = Delivery/Release；知识 = Knowledge Lead。

| 范围 | 设计 | 实现 | 取舍 | 使用 | 事实所有者 | 证据版本 |
| --- | --- | --- | --- | --- | --- | --- |
| 产品范围与准则 | [产品准则](../design/product-guidelines.md) covered | n/a | [准则](../design/product-guidelines.md)、[路线图 §1](../design/roadmap.md) covered | [README](../README.md) partial（页面存在，未逐节核对） | 产品 | design/product-guidelines.md `15bc69b82d424e55d5b47c83b77c5a1768286100`；design/roadmap.md `ade6fba5948440e1d3592737f45dbb4b129b66e6`；README.md `69cd9cec128def7e0760465333569862a54f9fbc`（均为页首基线下的最后修改提交） |
| 架构与分层（core / infra / web） | [M0 架构](../design/m0-architecture.md) unknown（成文早于其后的拆分重构，未逐节对照代码） | [M0 架构 §2–§7](../design/m0-architecture.md)、[README 目录](../README.md#目录与工程命令) unknown；[代码入口](code-entry.md) partial（MCF-08 新增，仅业务事件预览、AI 适配器、贸易单据路由三处；调试命令在 `664b37c` 实跑；Developer 只读事实复核已完成（对照 `664b37c`），钉合并提交 `37bb41731fa46f59084e4d5600ec5fc28666e7d6`） | [ADR-SME-001](../design/adr/ADR-SME-001.md) **conflict（C1）** | [README](../README.md) partial（页面存在，未逐节核对） | 开发 | design/m0-architecture.md `50e9d0d0989272a6e9a041488ea7e7b2354aa47b`；design/adr/ADR-SME-001.md `430076f4ed35568c896eaa7f0c43e6cb721f1045`；README.md `69cd9cec128def7e0760465333569862a54f9fbc` |
| 总账（科目、维度、凭证、业务事件、报表、结账） | [M0 架构](../design/m0-architecture.md) unknown | [README M0-08..14 各节](../README.md#当前业务与统一规则) unknown | gap（G2） | [总账](user/ledger.md) partial（AI 助手一节由 KDOC-06、KDOC-04 修改，已钉合并提交；D561）、[凭证流程](flows/journal-flow.md)、[结账流程](flows/period-close-flow.md) covered（仅指页面存在且内容对应该主题；QA 证据未在此汇总） | 开发 / 产品 | docs/user/ledger.md `4d3bd90bd79a518c2e6648383e327fc1a0fb4f83`；journal-flow、period-close-flow 均 `093097990fcc158a44cd2a70b0b43ad0ac101358`（均为 页首基线下该页最后修改提交） |
| 贸易 AP/AR（发票、订单、付款/收款、预付、贷项、纠错） | [路线图 §3](../design/roadmap.md)、[M1 任务书](../design/reviews/M1.md) unknown | [README M1 各节](../README.md#账面付款收款与部分核销m1-04) unknown | gap（G2，决定散在各 Sprint 任务书） | [贸易](user/trade.md) partial（钉版本，见证据列）、[往来未结项](user/trade-reports.md)、[贸易流程](flows/trade-flow.md)、[订单流程](flows/trade-order-flow.md) 等 partial（仅页面存在；各页所钉版本见证据列，未核对内容）；[界面指南](user/ui-guide.md) partial（钉版本，见证据列；G3 已修复，不再是 stale）；[付款与收款流程](flows/settlement-flow.md) partial（KDOC-06 新增，已钉合并提交；D561；依据 v0.21.0 标签的代码；另有一小节单独标注 v0.21.0 之后 main 上的 TSET-01 行为；QA 见“QA 范围”表：#373 是 jsdom 用例，非真实浏览器） | 开发 / 产品 | docs/user/trade.md `04b576baf9f03c13055daf98be6b0831cf086648`；docs/user/ui-guide.md `04b576baf9f03c13055daf98be6b0831cf086648`；docs/user/trade-reports.md `2910ca7fa50bf12e57cf761ab774cf1aa14bc0dc`；docs/flows/trade-flow.md `2910ca7fa50bf12e57cf761ab774cf1aa14bc0dc`；docs/flows/trade-order-flow.md `453b382e3e3d4d019e6b6f80fda57589a50333a3`；docs/flows/settlement-flow.md `8ed9d1b0fdfd053acf87f82dcaca3c0efeebb011` |
| 存储、备份、SQLite worker | [M0 架构 §3](../design/m0-architecture.md) unknown | [README SQLite worker](../README.md#sqlite-workerm0-13a) unknown（本 PR 未改）；[目标存储工具](../README.md#目标存储工具) partial（KDOC-07 改动，已钉合并提交 `66f3a47623e3b07f55447b06ac48fe84d153c34a`；仍未逐节核对） | [ADR-SME-001](../design/adr/ADR-SME-001.md) **conflict（C1）** | [运维与故障排查](operations.md)、[备份与旧账工具](user/backup-and-legacy.md) partial（KDOC-07 新增前者并改动后者；已钉合并提交，见证据列；D561） | 开发 | docs/operations.md `66f3a47623e3b07f55447b06ac48fe84d153c34a`；docs/user/backup-and-legacy.md `66f3a47623e3b07f55447b06ac48fe84d153c34a` |
| 旧账快照、导入、迁移 | [legacy-import-mapping](../design/legacy-import-mapping.md) partial（页面存在，未对照实现）；[architecture-migration](../design/architecture-migration.md) **conflict（C1）** | [legacy-snapshot](legacy-snapshot.md)、[README 历史导入](../README.md#历史导入m2-03-47m2-03b-63-已合并核对见-m2-04m2-04b) partial（KDOC-07 改动，README.md 已钉 `66f3a47623e3b07f55447b06ac48fe84d153c34a`；未逐节核对其余段落） | gap（G2） | [迁移手册](migration-runbook.md)（KDOC-07 改动 §6 并新增 §10，已钉合并提交，见证据列）、[导入流程](flows/legacy-import-flow.md)、[迁移页流程](flows/migration-page-flow.md) partial（页面存在；手册命令仅在虚构夹具验证，见手册首段；QA 见“QA 范围”表：#374 安全夹具演练，旧账快照、dry-run、仅导入健康验证未跑） | 开发 / 发布 | docs/migration-runbook.md `66f3a47623e3b07f55447b06ac48fe84d153c34a`；design/legacy-import-mapping.md `12f180edbec7d3e3dad5a88fd163e1edff9a29d8`；docs/flows/legacy-import-flow.md `037b3ceebf1e3854fa6a8abc24dbe07260fe1be5`；docs/flows/migration-page-flow.md `06255c7362c3a226a1b84b2832d213837593d82d`；docs/legacy-snapshot.md `66f3a47623e3b07f55447b06ac48fe84d153c34a` |
| AI 助手（候选式） | [AI 助手](ai-assistant.md) partial（MCF-06 改动第 3、7 节，钉合并提交 `6f34423e142baa1ae24e134253a84b8295ec4bc0`；据[事实清单](../design/ai-assistant-facts.md)概括；SEC-01 已验收、SEC-02 已实施（环境白名单；Windows 平台补入项按 D570 列为已知例外；原生 CLI 对补入键的依赖、真实认证兼容、代理与 CA、子进程端到端隔离未验证），Copilot 服务端数据处理仍为缺口；复核仅限两项（官方链接属实；§3、§7 符合 R7 时点 2；设计核对于 7aabc4f，[评论 7148480305](https://github.com/lingshf/ai-native-erp/pull/386#issuecomment-7148480305)），整页未复核；整页 QA 未完成，#375 范围内 QA PASS 仅限其原范围） | [README AI 与界面](../README.md#ai-与界面m0-14) unknown | gap（G2） | [总账](user/ledger.md) partial（“AI 助手”一节由 KDOC-04 改为引用事实清单；已钉合并提交；D561）；[AI 助手](ai-assistant.md) partial（钉合并提交 `6f34423e142baa1ae24e134253a84b8295ec4bc0`）；#375 范围内 QA PASS 保留，仅限其原范围，整页 QA 未完成 | 开发 | README.md `69cd9cec128def7e0760465333569862a54f9fbc`；docs/user/ledger.md `4d3bd90bd79a518c2e6648383e327fc1a0fb4f83`；docs/ai-assistant.md `6f34423e142baa1ae24e134253a84b8295ec4bc0`；design/ai-assistant-facts.md `6023f5003e6e822cc888a94fb10e612ed9df7b24`（SEC-02 改动 F22 与 §6-3；MCF-05/19 更正 F22） |
| 界面与教学模式 | [UI-1 规范](../design/ui/README.md) **stale**（页首状态仍为“待评审”，未逐条对照现状） | n/a（见 `packages/web`） | [准则 PG-03/PG-04](../design/product-guidelines.md) covered | [教学模式](user/teaching-mode.md) partial（钉版本，见证据列）、[教学开关流程](flows/teaching-toggle.md)（`093097990fcc158a44cd2a70b0b43ad0ac101358`）、[界面指南](user/ui-guide.md) partial（钉版本，见证据列）、[外壳与模板](flows/ui-shell-and-templates.md) | 产品 | design/ui/README.md `c7e5783797ea6bae83b6936a153969cc6e645f99`；docs/user/teaching-mode.md `04b576baf9f03c13055daf98be6b0831cf086648`；docs/user/ui-guide.md `04b576baf9f03c13055daf98be6b0831cf086648`；design/product-guidelines.md `15bc69b82d424e55d5b47c83b77c5a1768286100` |
| 测试与 CI 质量 | [路线图 §4](../design/roadmap.md) covered | [CI 说明](ci.md) partial（钉版本，见证据列；D561）。已按工作流与 `scripts/ci.ts` 对照，未经开发/发布复核；QA 见“QA 范围”表（#370：只实跑了所写的 Vitest 选择命令，未触发 workflow） | [路线图 §4](../design/roadmap.md) unknown | [README 目录与工程命令](../README.md#目录与工程命令) unknown | 开发 / 发布 | design/roadmap.md `ade6fba5948440e1d3592737f45dbb4b129b66e6`；docs/ci.md `08d9cf34e3623f01803d143caa14bfcb923d2561`；CI 说明所依据（各文件自己的最后提交，核对基线 `04b576baf9f03c13055daf98be6b0831cf086648`）：.github/workflows/ci.yml `5803ae831ca2132bf996a0a09536d62d6d7fe06b`；.github/workflows/full.yml `cc1ac7107538cbe0dcf0863f1cd600a476f55d48`；.github/workflows/bench.yml `69cd9cec128def7e0760465333569862a54f9fbc`；.github/workflows/legacy-snapshot-windows.yml `69cd9cec128def7e0760465333569862a54f9fbc`；scripts/ci.ts `ee95178f09a4e5e413c8056fd9d7d81580871ef3`；vitest.config.ts `fbff3636df02d35fb881e6d083d3d37465c70e6c`；scripts/test-shard-weights.json `6156759c2aef6b9805aca70ba5505490e2bd4c5b`；scripts/bench-migration-rehearsal.mjs `1c882437e8a92d659b19b32d845c09b51d62bc0e`；[test-cases](../design/test-cases.md) `341300f988a01eecb71738b7d065f3c456a386c2` **stale** |
| 性能 | [准则 PG-05](../design/product-guidelines.md) covered（目标非 SLA） | [README 性能证据](../README.md#性能证据) unknown | gap | [docs/performance](performance/)（实验记录） unknown | 开发 | design/product-guidelines.md `15bc69b82d424e55d5b47c83b77c5a1768286100`；docs/performance 各页未钉版本 |
| 发布、版本、Demo | [发布流程](release/README.md) covered | [scripts/slot](../scripts/slot/README.md)、[scripts/measure](../scripts/measure/README.md) partial（页面存在；工具行为未核对） | [发布流程](release/README.md) 与各版 retro unknown | [Demo 模板](demo/TEMPLATE.md)、[CHANGELOG](../CHANGELOG.md)、[v0.21.0 发布说明](release/v0.21.0-release-notes.md) covered（仅限该文件在所钉版本，不含 release 目录其他页；v0.21.0 之后的 main 提交未纳入） | 发布 | release/README、demo/TEMPLATE `3ae4848d36c4c06c2e208173e58ed2cac3771564`；CHANGELOG、v0.21.0 发布说明 `91f066e629fa54dba5da3913a126624670ec4351`；scripts/slot/README.md `e4a9fecb6c22036b5243770689f67318d9ea8135`；scripts/measure/README.md `0c95401e30f209dd56fd9e3e55f2aa142a2d8808` |
| 团队流程与决定记录 | [路线图 §5](../design/roadmap.md) covered | n/a | **gap（G5：没有决定总索引）**，[路线图 §6](../design/roadmap.md#6-决定记录)不含 D20/D21 等 | [任务总表](../design/tasks/README.md) covered | 产品 / 协调者 | design/roadmap.md `ade6fba5948440e1d3592737f45dbb4b129b66e6`；design/tasks/README.md `2cad6d801bb6e0a474d514f1f00a09927451f4fb` |
| 安装与启动 | n/a | n/a | n/a | [README 安装与启动](../README.md#安装与启动)（KDOC-07 把 migrate 命令改为指向手册 §10；已钉合并提交）、[新手入门](user/getting-started.md)（KDOC-07 再改；已钉合并提交）**stale→已在 KDOC-07 之前修正**（G8：schema 019→020；QA 见“QA 范围”表：#365 只读检查启动阅读路径与 schema 020） | 开发 / 发布 | README.md `66f3a47623e3b07f55447b06ac48fe84d153c34a`、docs/user/getting-started.md `66f3a47623e3b07f55447b06ac48fe84d153c34a`；代码依据 `packages/infra/src/storage/migrations.ts` 最新项 020 |
| 运维与排障（启动失败、锁、恢复） | n/a | n/a | n/a | [运维与故障排查](operations.md) partial（KDOC-07 新增，已钉合并提交；依据 `main.ts`、`index.ts`、`storage-admin-main.mjs` 与临时虚构库试跑；未经开发/发布复核；QA 见“QA 范围”表：#374 安全夹具演练）；迁移错误码见[迁移手册 §7](migration-runbook.md) | 开发 / 发布 | docs/operations.md `66f3a47623e3b07f55447b06ac48fe84d153c34a` |

## 三、目录覆盖（现有文档的归属）

| 位置 | 用途 | 状态 |
| --- | --- | --- |
| [`README.md`](../README.md) | 项目入口、命令、各模块当前行为 | partial（页面存在，未逐节核对）；含大量业务规则，与用户文档重复（见 D1） |
| [`design/`](../design/) 顶层 | 产品准则、路线图、M0 架构为现行；其余为历史记录（路线图页首已说明） | 现行页内容见矩阵；历史页 conflict/stale（C1、D2） |
| [`design/adr/`](../design/adr/ADR-SME-001.md) | 只有一份 ADR-SME-001..006 | conflict（C1） |
| `design/tasks/`（含 `S*.md`、任务书） | 任务书、Sprint 计划、决定表 | 现行；决定散在各文件（G5） |
| `design/reviews/` | Sprint / 任务评审与回顾 | 现行；与顶层 [`design/reviews.md`](../design/reviews.md)（公开验证记录）同名易混（D3） |
| `design/ui/`、`design/diagrams/` | UI-1 规范与原型、架构示意图 | UI-1 stale；diagrams 属 ARCH-SME-01，随 C1 |
| [`docs/user/`](user/README.md) | 用户文档 | 页面存在（版本见矩阵）；索引页已于 KDOC-05 去掉版本叙述，指向 CHANGELOG；含[贸易主路径演练](user/trade-main-path.md) |
| [`docs/ai-assistant.md`](ai-assistant.md) | AI 助手 | partial（钉合并提交 `6f34423e142baa1ae24e134253a84b8295ec4bc0`；KGAP-04、SEC-02、MCF-06 改动） |
| [`docs/tradeoffs.md`](tradeoffs.md) | 取舍汇总 | partial（KDOC-09 新增；钉合并提交 `70acd042726080ca1281bb857b6ce94321454a60`，含 SEC-02 对 §3 的改动；设计/产品核对不覆盖 SEC-02 改动；SEC-02 部分见“QA 范围”表 #391，其余 QA 证据未在此汇总） |
| [`docs/code-entry.md`](code-entry.md) | 代码入口、扩展点与调试（三处 REFAC 拆分模块） | partial（MCF-08 新增；钉合并提交 `37bb41731fa46f59084e4d5600ec5fc28666e7d6`；Developer 只读事实复核已完成，对照 `664b37c`） |
| [`docs/operations.md`](operations.md) | 运维与故障排查 | partial（钉合并提交 `66f3a47623e3b07f55447b06ac48fe84d153c34a`；KDOC-07 新增） |
| [`docs/ci.md`](ci.md) | CI 说明 | partial（钉版本 `08d9cf34e3623f01803d143caa14bfcb923d2561`；对照 workflow 与 `scripts/ci.ts`，未经复核） |
| [`docs/flows/`](flows/README.md) | Mermaid 界面流程图 | 索引页；新增付款与收款流程，见 G4（partial；`docs/flows/README.md` 钉 `8ed9d1b0fdfd053acf87f82dcaca3c0efeebb011`） |
| [`docs/release/`](release/README.md) | 流程、各版发布说明、评审与回顾 | 仅 README.md 与 v0.21.0 发布说明已钉版本（见矩阵），其余未核对 |
| [`docs/demo/`](demo/TEMPLATE.md) | 每版 Demo 脚本与证据（v0.1.0..v0.21.0） | 证据存档，不是用户文档 |
| [`docs/migration-runbook.md`](migration-runbook.md) | 迁移操作手册 | partial（版本见矩阵；仅虚构夹具验证） |
| [`docs/legacy-snapshot.md`](legacy-snapshot.md) | 旧账快照生产者 | partial（KDOC-07 改动；钉合并提交 `66f3a47623e3b07f55447b06ac48fe84d153c34a`，其余内容未核对） |
| [`docs/performance/`](performance/) | 性能与 E2E 干扰实验记录 | unknown |
| `docs/images/` | 共用截图 | n/a |

## 四、缺口与冲突

**冲突（需要所有者决定，本页不改写其内容）**
- **C1**：[ADR-SME-001..006](../design/adr/ADR-SME-001.md)、[architecture](../design/architecture.md)、[architecture-migration](../design/architecture-migration.md)、[design](../design/design.md)、[requirements](../design/requirements.md) 描述 PostgreSQL / Server Compose / OIDC 试点与 M04..M09，而[路线图页首](../design/roadmap.md)与 [README](../README.md) 明确当前只做 SQLite、单用户、无登录，并称这些页已被取代。取舍这一目标没有一页既说明“为什么不再走双库/Server”又给出失效条件。

**缺口**
- **G1** 已由 KDOC-04 处理：新增 [AI 助手](ai-assistant.md)。仍缺：整页事实复核（仅 KGAP-04 两项已由设计核对，见矩阵）、整页 QA（#375 范围内 PASS 不扩大）；KGAP-04 已补 SEC-01 评审与验收引用和 Copilot Agents 负责任使用说明链接（服务端数据处理仍为缺口）。SEC-02 已实施环境白名单，改写了第 3、5、7 节（未复核）；Windows 平台补入项按 D570 列为已知例外。
- **G2** 已由 KDOC-09 部分处理：新增[取舍汇总](tradeoffs.md)（存储与单用户、总账模型、AI、教学模式、旧账迁移、报表索引、依赖升级七个主题）。D1、D2、D3、D51 的补记已引用路线图 §6.1（D564）。仍缺：AI 一节的备选原记录未写，M0 其余决定未归纳。设计/产品核对已完成（#377 评论）。各行的“gap（G2）”格仍保留，直到相应主题被核对。
- **G3** 已由 KDOC-05 处理：[docs/user/README](user/README.md) 不再维护版本叙述；[界面指南](user/ui-guide.md)补了 v0.17.0–v0.21.0 一节（经 CHANGELOG 核对，这五版的用户可见变化仅为各列表页的“刷新列表”按钮）。G3 不再是 stale（#368 已合并）；未经产品复核，QA 只有 #368 的只读检查（见“QA 范围”表），相关页为 partial（已钉版本）。
- **G4** 已由 KDOC-06 处理：[flows/README](flows/README.md) 不再标 v0.3.0，新增[付款与收款流程](flows/settlement-flow.md)（含 v0.21.0 的“刷新列表”、结果未知与离开页面）。仍缺：对该图的开发复核；QA 只有 #373 的 jsdom 用例，没有真实浏览器演练；其余各图未逐一对照现行界面。
- **G5** 没有决定总索引：[路线图 §6](../design/roadmap.md#6-决定记录)不含 D20/D21（[发布流程](release/README.md)已自述），D484、D514 等分散在评审与任务书。
- **G6** 已由 KDOC-08 处理：新增 [CI 说明](ci.md)（分层、触发、分片、Bench、失败处理）。仍缺：开发/发布对其事实的复核，以及按页面实际触发 workflow、排查失败的演练（#370 只实跑了所写的 Vitest 选择命令）。
- **G7** 已由 KDOC-07 处理：新增[运维与故障排查](operations.md)（启动、备份恢复、锁、常见错误）；迁移错误码仍在手册 §7。仍缺：发布/开发复核；旧账快照、dry-run、仅导入健康验证未演练（#374 已在安全夹具演练持锁、租约、迁移、备份与恢复）。
- **G8**（stale）启动文档的 schema 版本与代码不符：README 与 getting-started 原写“迁移到 019”，代码最新迁移为 `020-trade-order-invoicing-credits.sql`。本 PR 已直接改为 020（仅文档，两处各一字）；事实所有者：开发（确认 020 是当前最新）；之后每次新增迁移都要同步这两处。

**重复（单一权威待定）**
- **D1** 已处理（KDOC-05）：根 README 里唯一与用户文档重复的是“贸易 GUI 主路径验收”演练，已移到 [trade-main-path](user/trade-main-path.md)，README 只留指针；其余业务规则小节是开发者契约（接口、迁移、不变量），不是用户文档的副本，保留。
- **D2** [design/tasks.md](../design/tasks.md)（历史）与 [design/tasks/README.md](../design/tasks/README.md)（现行）；[architecture](../design/architecture.md) 与 [M0 架构](../design/m0-architecture.md)。
- **D3** `design/reviews.md` 与 `design/reviews/` 目录同名。
- **D4** 已由 KDOC-07 处理：迁移与新建/升级目标库（`migrate`）的命令只在[迁移手册](migration-runbook.md)（§10 为 schema 迁移），备份恢复命令只在[运维页](operations.md)；README、入门、贸易演练与[备份与旧账工具](user/backup-and-legacy.md)改为链接。原重复位置： [README](../README.md#历史导入m2-03-47m2-03b-63-已合并核对见-m2-04m2-04b)、[迁移手册](migration-runbook.md)、[备份与旧账工具](user/backup-and-legacy.md)。
- **D5** 已处理（KDOC-05）：版本叙述只在 [CHANGELOG](../CHANGELOG.md)，[docs/user/README](user/README.md) 改为链接。

## 五、维护

- 设计、代码、决定、配置或环境变化时，同步更新对应行的状态与证据版本；里程碑和交接前整体复核一次。
- 本页的状态由 Knowledge Lead 维护；事实核对属各所有者，关键步骤实跑属 QA。
