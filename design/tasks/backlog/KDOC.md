# 知识与文档待办（KDOC，D556）

排序与 C1 的处理见 D556；KDOC-05 / KDOC-07 的依赖与 KDOC-10 并入 KDOC-05 见 D558。来源：Knowledge Lead 在 [#365](https://github.com/lingshf/ai-native-erp/pull/365) 中的覆盖审计。所有 KDOC 项都排在在途与待派的 REFAC 之后（P3），只改文档，不占开发名额。冲突域不涉及代码，可以与 REFAC 并行。下表的顺序就是优先级。排序理由：

- 先消除“写错了”的冲突，再补缺口，最后去重；
- 缺口按使用频率排：用户、运维、开发；
- 互相依赖的项排在被依赖项之后。

**C1 的处理（D556，产品负责人决定）**：

- **把旧的双库 / Server 设计标为已取代**：ADR-SME-001..006、`architecture.md`、`architecture-migration.md`、`design.md` 与 `requirements.md` 中的 ARCH-SME 部分，都标为“已取代（superseded）”。
- **新增一份 ADR**，说明为什么不走双库、Server、OIDC 路线，以及在什么条件下这些理由不再成立。
- **依据**：路线图 [§1 不变的产品方向](../../roadmap.md#1-不变的产品方向)（只做 SQLite、本机单用户、loopback 无登录）是用户定的方向。[M0 架构](../../m0-architecture.md) 已写明取代旧架构中的双库 / NestJS / Server 设计。因此这只是让文档状态与既定方向一致，不是新的价值或范围取舍，不需要再问用户。
- **不删除旧文档**：保留为历史记录，以便追溯。
- **失效条件**写成待核实的假设，例如：出现多用户并发、远程或多设备访问的需求；数据量超出 SQLite 已测的基准预算；出现必须登录或分权的合规要求。出现任一条时，重新评估，并由用户决定。

| 顺序 | ID | 标题 | 负责（执行） | 依赖 | 冲突域 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | KDOC-01 | C1：旧双库 / Server / OIDC 文档标为已取代，新增 ADR“保持 SQLite 单机、不走双库 / Server 路线”及失效条件；同时解决 D2 后半（`architecture.md` 与 `m0-architecture.md` 并存） | Product/Design（ADR 与状态标注）；Knowledge Lead 整合入口链接 | 无 | `design/adr/`、`design/architecture*.md`、`design/design.md`、`design/requirements.md` 的状态段 | done（[#367](https://github.com/lingshf/ai-native-erp/pull/367)，main `a6037b0`） |
| 2 | KDOC-02 | `design/test-cases.md` 交给 QA（评审会话 `5ec013bf`）：确认现有内容、维护方式与今后的更新时机（[团队章程 §7](../../team-charter.md#7-迁移范围与缺口)） | Team Leader 协调；Product/Design 交出、QA 接收 | 无 | `design/test-cases.md` 开头 | done（[#367](https://github.com/lingshf/ai-native-erp/pull/367)，main `a6037b0`） |
| 3 | KDOC-03 | G5 全部决定的索引；D2 前半（`design/tasks.md` 标为历史记录，指向任务总表）；D3（`reviews.md` 与 `reviews/` 同名，改名或加指引） | Product/Design（D562 改派，全部在 `design/` 下）；Knowledge Lead 接收交接并评审 | KDOC-01 | `design/decisions.md`（新增）、`design/tasks.md` 开头、`design/reviews.md` 开头、`design/reviews/README.md`（新增） | done（[#369](https://github.com/lingshf/ai-native-erp/pull/369)，main `577891c`） |
| 4 | KDOC-04 | G1 AI 助手设计页（范围、数据流、隐私边界、失败与降级） | Product/Design 提供事实；Knowledge Lead 整合 | KDOC-01（ADR-SME-005 中的 AI 部分被取代后由本页接替） | `design/` 下新增页面 | done（事实清单 [#372](https://github.com/lingshf/ai-native-erp/pull/372)，main `bc89191`；页面 [#375](https://github.com/lingshf/ai-native-erp/pull/375)，main `4d3bd90`） |
| 5 | KDOC-05 | G3 用户文档 `docs/user` 更新到当前版本；D1 README 业务规则与 `docs/user` 去重，README 改为链接；并入原 KDOC-10（D5）：`docs/user/README.md` 中的版本叙述与 `CHANGELOG.md` 去重，以 CHANGELOG 为准、用户文档改为链接（D558） | Knowledge Lead；Developer 与 Product/Design 核对事实；QA 演练关键步骤；Delivery/Release 核对 CHANGELOG 措辞 | 无 | `docs/user/`（含 `docs/user/README.md`、`docs/user/backup-and-legacy.md`）、`README.md` 业务规则段、`CHANGELOG.md` | done（[#368](https://github.com/lingshf/ai-native-erp/pull/368)，含原 KDOC-10，main `04b576b`） |
| 6 | KDOC-06 | G4 流程图更新到当前版本，补付款、收款流程图 | Knowledge Lead；Product/Design 核对流程 | KDOC-05 | `docs/flows/` | done（[#373](https://github.com/lingshf/ai-native-erp/pull/373)，main `8ed9d1b`） |
| 7 | KDOC-07 | G7 运维与排障页（启动、备份与恢复、常见错误）；D4 迁移命令三处合一，保留一处权威说明，其余改为链接 | Knowledge Lead；Delivery/Release 提供事实；QA 演练 | KDOC-05 已合并（共享 `docs/user/backup-and-legacy.md`，D558） | `docs/` 下新增运维页、`docs/migration-runbook.md` 及另两处迁移命令所在段落（含 `docs/user/backup-and-legacy.md`） | done（[#374](https://github.com/lingshf/ai-native-erp/pull/374)，main `66f3a47`） |
| 8 | KDOC-08 | G6 CI 说明页（分层、触发、分片、Bench、失败时怎么办） | Knowledge Lead；Delivery/Release 提供事实 | 无 | `docs/` 下新增 CI 页（不改 `.github/workflows/`） | done（[#370](https://github.com/lingshf/ai-native-erp/pull/370)，main `08d9cf3`） |
| 9 | KDOC-09 | G2 按主题汇总取舍（每个主题：备选、理由、代价、失效条件），链接到 ADR 与决定记录，不复制原文 | Knowledge Lead；Product/Design 核对 | KDOC-01、KDOC-03、KDOC-04 | `design/` 下新增页面 | done（[#377](https://github.com/lingshf/ai-native-erp/pull/377)，main `6debbdf`） |
| 10 | KDOC-10 | 已并入 KDOC-05（D558）：目标改为 `docs/user/README.md` 与 `CHANGELOG.md`，不改路线图 | — | — | — | 已并入 KDOC-05 |
| 11 | KDOC-11 | UI-1 规范页状态仍为“待评审”（`design/ui/README.md:3`）：核对实际评审记录后更新状态 | Product/Design；非作者评审 | 无 | `design/ui/README.md` 开头 | done（[#367](https://github.com/lingshf/ai-native-erp/pull/367)，main `a6037b0`） |
| 12 | KDOC-12 | `docs/user/trade.md:162` 引号内“订单不过账、不生成凭证”不是界面原文（原文为 `packages/web/src/ui/trade-order-labels.ts:122` 的“订单不过账，也不生成凭证。”）：改为原文或去掉引号（P3，S28 KGAP-10 合并后复核发现，见 [S28 评审 §4](../../reviews/S28-review.md#4-未完成与遗留)） | Knowledge Lead；Product/Design 核对 | 无 | `docs/user/trade.md` | done（S29：[#459](https://github.com/lingshf/ai-native-erp/pull/459) `af50e47`；合并后核对 PASS（[评论](https://github.com/lingshf/ai-native-erp/pull/459#issuecomment-7209186961)）） |
| 13 | KDOC-13 | `docs/flows/invoice-detail-flow.md:35` 仍写旧的前端 ID 校验说法：按 BUG-05（[#448](https://github.com/lingshf/ai-native-erp/pull/448) `34ec97c`）改为前端与服务端同一小写 UUIDv4 规则，行号钉 `34ec97c`（BUG-05 跨文件验收项，D604） | Knowledge Lead；Product/Design 核对 | 无 | `docs/flows/invoice-detail-flow.md` | done（S29：[#460](https://github.com/lingshf/ai-native-erp/pull/460) `e5af3ed`；合并后核对 PASS（[评论](https://github.com/lingshf/ai-native-erp/pull/460#issuecomment-7209187226)），引用范围另见 KDOC-14） |
| 14 | KDOC-14 | `docs/flows/invoice-detail-flow.md:35` 的引用 `TradeInvoiceDetail.tsx:51–57` 改为 `:52–58`（D611：登记时写 `:51–58`，S30 计划按 `34ec97c` 源码核对首尾行，`:51` 是 `useRef`，与校验无关；`:52` 注释、`:53` `wellFormed`）：在 `34ec97c` 上 `:58` 的 `enabled: wellFormed` 才是实际不发请求的一行（P3，S29 KDOC-13 合并后核对发现，见 [#460 评论](https://github.com/lingshf/ai-native-erp/pull/460#issuecomment-7209187226)、[S29 评审 §4](../../reviews/S29-review.md#4-未完成与遗留)；下一 Sprint 候选） | Knowledge Lead；Product/Design 核对 | 无 | `docs/flows/invoice-detail-flow.md` | done（S30：[#465](https://github.com/lingshf/ai-native-erp/pull/465) `ee90deb`；合并后核对 `:52–58` 首尾行 PASS（[评论](https://github.com/lingshf/ai-native-erp/pull/465#issuecomment-7209521357)）） |

- **共享文件串行**：KDOC-01 与 KDOC-03 都改 `design/` 根目录下的文档，按顺序做；KDOC-05 与 KDOC-06 按顺序做；KDOC-05 与 KDOC-07 共用 `docs/user/backup-and-legacy.md`，KDOC-07 在 KDOC-05 合并后才开始（D558）；其余各项冲突域不相交。
- **评审**：每项都由非作者评审。Knowledge Lead 写的文档，事实由对应负责人核对（[团队章程 §2](../../team-charter.md#2-权威路径)）。
