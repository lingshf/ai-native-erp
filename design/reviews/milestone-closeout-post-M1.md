# 里程碑收尾检查与回顾：M1 之后的工程化与知识整理（MCLOSE-01）

- 任务与规则：[任务总表 · 里程碑收尾检查与回顾（D566）](../tasks/README.md#里程碑收尾检查与回顾d566)。本页按其第 1–8 节结构填写。
- 主持：Team Leader（协调者）；转录：Product/Design。证据由 TL 提供，转录人在 GitHub 上逐项核对了 PR 状态、合并提交、精确 head 评审与 QA 结论。
- 状态：**进行中**。第 3–5、7 节的输入已收齐；第 6 节各成员的确认待 TL 收集。
- 本回顾**不**授予任何合并、发布或部署权限，也**不**扩大重构范围（D566 第 7 节）。

## 1. 基线

- 名称：**M1 之后的工程化与知识整理**。用户经 M2 的 ask_user 确认，TL 转达，见 [D566 第 1 节](../tasks/README.md#1-里程碑基线用户已确认)。
- 基线提交：main `9b8fa9739b0c07cf2b346719b19c36b55ad00ebc`。
- 正式验收范围（只有这些进入分母）：REFAC-31、REFAC-32、REFAC-34；KDOC-01..11（D556；KDOC-10 已并入 KDOC-05，D558）；缺陷候选 BUG-01、BUG-02a–d、BUG-03a–b（D565）；SEC-01（D563）。
- 不在范围：M2-05/06 及其他未授权任务、Dependabot、DEMO-24 与发布工作。REFAC-14..30 与 REFAC-33 只放在 [历史成果对照](../tasks/README.md#历史成果对照)，不进入本页任何一组。

## 2. 触发证据

按 D566 第 2 节“正常情况”。三项条件都成立：

| 条件 | 证据 |
| --- | --- |
| 用户已确认基线 | D566 第 1 节（用户经 M2 ask_user 确认，TL 转达） |
| 范围内每一项都已结案 | 见第 3 节“已验收”：14 项以合并结案，SEC-01 以评审结论结案（不实施处置，D568）；状态以 [`design/tasks/README.md`](../tasks/README.md) 中的 done 行为准 |
| main Full 覆盖范围内最后一个合并且为绿 | 范围内最后一个合并是 [#387](https://github.com/lingshf/ai-native-erp/pull/387) 的 `dc14aca97765f9c246f45e143ae023dbd8a61518`（2026-11-24T16:52:25-08:00）；[Full run 45521461722](https://github.com/lingshf/ai-native-erp/actions/runs/45521461722) 在该提交上 `success` |

不是定时触发；由 TL 手动启动。这是**收尾**回顾，不是“阶段性”回顾。

## 3. 结果检查

分母是第 1 节列明的正式范围，固定且逐项可数。范围内各项都已结案，所以只写结案情况，不写百分比；提交数不算验收进度。

### 3.1 已验收

“精确 head 评审”指非作者评审在合并前最后一个 head 上给出 `VERDICT: APPROVED`；评审以 COMMENTED 状态提交，正文写结论。

| 项 | PR | 合并提交 | 精确 head 评审 | QA |
| --- | --- | --- | --- | --- |
| REFAC-31 | [#362](https://github.com/lingshf/ai-native-erp/pull/362) | `17640733b212533e48e8813689c8f3921a7fc3df` | [6049067663](https://github.com/lingshf/ai-native-erp/pull/362#pullrequestreview-6049067663)：`VERDICT: APPROVED` @ `b542929`（= 合并前 head） | `QA: PASS`（同一评审） |
| REFAC-32 | [#364](https://github.com/lingshf/ai-native-erp/pull/364) | `25c0855f0079cdcaceb65cdeb15355acc1a8799d` | [6049540504](https://github.com/lingshf/ai-native-erp/pull/364#pullrequestreview-6049540504)：`VERDICT: APPROVED` @ `0510178`（= 合并前 head） | `QA: PASS`（同一评审） |
| REFAC-34 | [#376](https://github.com/lingshf/ai-native-erp/pull/376) | `250f19a0fcfc308182f1e4ea9e22860ca2cc912d` | [6048893688](https://github.com/lingshf/ai-native-erp/pull/376#pullrequestreview-6048893688)：`VERDICT: APPROVED` @ `99e2a83`（= 合并前 head） | `QA: PASS`（同一评审） |
| KDOC-01、KDOC-02、KDOC-11 | [#367](https://github.com/lingshf/ai-native-erp/pull/367) | `a6037b0cf587fc862cf43b1a1a7d0d9ebfe5076d` | [6047496943](https://github.com/lingshf/ai-native-erp/pull/367#pullrequestreview-6047496943)：`VERDICT: APPROVED` @ `309b9b3`（= 合并前 head） | `QA: not_applicable`（同一评审） |
| KDOC-03 | [#369](https://github.com/lingshf/ai-native-erp/pull/369) | `577891ccc3756e48b05e9c123cc8330879f743a3` | [6047886670](https://github.com/lingshf/ai-native-erp/pull/369#pullrequestreview-6047886670)：`VERDICT: APPROVED` @ `2d95637`（= 合并前 head） | `QA: not_applicable`（同一评审） |
| KDOC-04（事实清单） | [#372](https://github.com/lingshf/ai-native-erp/pull/372) | `bc89191c1841ff8d8276d74ff1ece9e9950522ff` | [6047950768](https://github.com/lingshf/ai-native-erp/pull/372#pullrequestreview-6047950768)：`VERDICT: APPROVED` @ `422011f`（= 合并前 head） | `QA: not_applicable`（同一评审） |
| KDOC-04（页面） | [#375](https://github.com/lingshf/ai-native-erp/pull/375) | `4d3bd90bd79a518c2e6648383e327fc1a0fb4f83` | [6048462623](https://github.com/lingshf/ai-native-erp/pull/375#pullrequestreview-6048462623)：`VERDICT: APPROVED` @ `c77bbd0`（= 合并前 head） | `QA: PASS`（同一评审） |
| KDOC-05（含 KDOC-10，D558） | [#368](https://github.com/lingshf/ai-native-erp/pull/368) | `04b576baf9f03c13055daf98be6b0831cf086648` | [6047571650](https://github.com/lingshf/ai-native-erp/pull/368#pullrequestreview-6047571650)：`VERDICT: APPROVED` @ `66e15b5`（= 合并前 head） | `QA: PASS`（同一评审） |
| KDOC-06 | [#373](https://github.com/lingshf/ai-native-erp/pull/373) | `8ed9d1b0fdfd053acf87f82dcaca3c0efeebb011` | [6048059068](https://github.com/lingshf/ai-native-erp/pull/373#pullrequestreview-6048059068)：`VERDICT: APPROVED` @ `61c9c61`（= 合并前 head） | `QA: PASS`（同一评审） |
| KDOC-07 | [#374](https://github.com/lingshf/ai-native-erp/pull/374) | `66f3a47623e3b07f55447b06ac48fe84d153c34a` | [6048340633](https://github.com/lingshf/ai-native-erp/pull/374#pullrequestreview-6048340633)：`VERDICT: APPROVED` @ `503d9f1`（= 合并前 head） | `QA: PASS`（同一评审） |
| KDOC-08 | [#370](https://github.com/lingshf/ai-native-erp/pull/370) | `08d9cf34e3623f01803d143caa14bfcb923d2561` | [6047907715](https://github.com/lingshf/ai-native-erp/pull/370#pullrequestreview-6047907715)：`VERDICT: APPROVED` @ `f202df1`（= 合并前 head） | `QA: PASS`（同一评审） |
| KDOC-09 | [#377](https://github.com/lingshf/ai-native-erp/pull/377) | `6debbdf551242c269cbb22401b34f27a028f6e91` | [6048644791](https://github.com/lingshf/ai-native-erp/pull/377#pullrequestreview-6048644791)：`VERDICT: APPROVED` @ `1e6935c`（= 合并前 head） | `QA: not_applicable`（同一评审） |
| BUG-01 | [#382](https://github.com/lingshf/ai-native-erp/pull/382) | `4b2a7a8bdd4549e7694674a856426bcd58f91a33` | [6049101933](https://github.com/lingshf/ai-native-erp/pull/382#pullrequestreview-6049101933)：`VERDICT: APPROVED` @ `99af5f3`（= 合并前 head） | `QA: PASS`（同一评审） |
| BUG-02a–d | [#387](https://github.com/lingshf/ai-native-erp/pull/387) | `dc14aca97765f9c246f45e143ae023dbd8a61518` | [6049869271](https://github.com/lingshf/ai-native-erp/pull/387#pullrequestreview-6049869271)：`VERDICT: APPROVED` @ `9e769c6`（= 合并前 head） | `QA: PASS`（同一评审） |
| BUG-03a、BUG-03b | [#383](https://github.com/lingshf/ai-native-erp/pull/383) | `612f46d5111eaf7c02c367e74062079448c2e5f0` | [6049324493](https://github.com/lingshf/ai-native-erp/pull/383#pullrequestreview-6049324493)：`VERDICT: APPROVED` @ `c22a537`（= 合并前 head） | `QA: PASS`（同一评审） |
| SEC-01（只评审，不实施） | [#364](https://github.com/lingshf/ai-native-erp/pull/364) 中的评论 | — | 非作者安全评审：[#364 评论 7148351359](https://github.com/lingshf/ai-native-erp/issues/364#issuecomment-7148351359)（基线 `25c0855`） | 不适用（评审项）；Product/Design 已接受（D568） |

偏差：
- **KDOC 页面已合并，但都不是 “covered”**。各页 QA 结论多为“只读核对、未做界面演练”，事实所有者复核也不全。影响：文档可用，但覆盖矩阵仍是 partial。已作为候选登记为 KGAP-01（D567），另见第 4 节 K1/K2。
- **SEC-01 结案的是评审，不是实施**。依据是非作者评审结论（基线 `25c0855`）加 Product/Design 的接受（D568，记于 [#385](https://github.com/lingshf/ai-native-erp/pull/385)）。白名单由范围外的 SEC-02 实施（见 3.3），SEC-02 不计入 SEC-01 的结案证据。
- **REFAC-31、REFAC-34 的 R8b 记为“未确认”**（D576）。任务书要求合并后补 R8b，只有 REFAC-32 补了。`1764073` 与 `250f19a` 上的 main Full 都为绿，但绿灯不能代替 R8b。REFAC-31 R8b 列出的业务事件场景是否都在真实 Chrome 中跑过，Reviewer 未核实。影响：两项仍算“已验收”，但 R8b 单独标为未确认，由 MCF-17 补映射。

### 3.2 未完成

正式范围内**无**。

### 3.3 新增（范围外、同期完成或登记）

| 项 | 证据 | 说明与影响 |
| --- | --- | --- |
| SEC-02 环境变量白名单 | [#391](https://github.com/lingshf/ai-native-erp/pull/391)，合并 `70acd042726080ca1281bb857b6ce94321454a60`；[6050232627](https://github.com/lingshf/ai-native-erp/pull/391#pullrequestreview-6050232627) `VERDICT: APPROVED` @ `b2fd1b3`，`QA: PASS` | 由 SEC-01 结论立项（D568）。Windows R6a 的平台补入项列为已知例外（D570）；Windows R6b 未验证，R6b 只用 Linux 证据（D571）。影响：用户可见的行为变化，已写入 CHANGELOG |
| KGAP-04 | [#386](https://github.com/lingshf/ai-native-erp/pull/386)，合并 `13a437bd44ca39c13e1b7ee73c12e54f58f003f8`；[6049646657](https://github.com/lingshf/ai-native-erp/pull/386#pullrequestreview-6049646657) `VERDICT: APPROVED` @ `0aa0bdc`，`QA: not_applicable` | 按交付范围记 done（D569）；“官方服务端数据处理说明”保留为已知缺口 |
| 决定 D570 与 D571 | [#391 评论 7149632544](https://github.com/lingshf/ai-native-erp/pull/391#issuecomment-7149632544)；D571 为协调者决定 | 记入决定记录（#393） |
| KGAP-01..03 | D567 | 文档缺口候选，todo。不在正式范围 |

### 3.4 延后 / 不在范围

| 项 | 原因 | 影响 |
| --- | --- | --- |
| M2-05、M2-06 | 等待用户授权 | 旧账迁移的真实演练与切换未做 |
| Dependabot 升级 | 基线明确排除 | 依赖更新照常按各自 PR 处理 |
| DEMO-24 与发布工作 | 基线明确排除 | 见第 4 节 R2：DEMO-23 RC 已落后于 main |

## 4. 各角色自查

一人兼多个角色时按角色分别写。自查不替代独立评审或 QA。

### 4.1 Team Leader

- **流程问题**：附在计划批准里的反馈可能没有送达子会话。结果是 SEC-02 开发改动了 Windows 主机防火墙（D571）。
- **改进**：计划批准的条件一律另发一条消息重申；开发者在 `plan.md` 开头复述这些约束。→ MCF-13。

### 4.2 Product/Design（转录人自查）

负责：任务书（REFAC-31/32/34、SEC-02）、Backlog（D563、D565–D567 各节）、决定记录与索引、SEC-01 验收、KDOC 的事实核对。UI 与性能检查不适用：范围内没有界面或性能目标的改动。

| # | 发现 | 证据 | 处理 |
| --- | --- | --- | --- |
| PD-1 | 决定索引 `design/decisions.md` 由仓库外的脚本生成（存于转录人的会话文件），别人无法复现或核对 | `design/decisions.md` 无生成说明；`scripts/` 中没有该脚本 | MCF-14 |
| PD-2 | SEC-02 任务书初稿对证据类型与受影响文档写得不够细，评审两次补齐 | [#385](https://github.com/lingshf/ai-native-erp/pull/385) 评审 [6049596543](https://github.com/lingshf/ai-native-erp/pull/385#pullrequestreview-6049596543)（R6 拆两类、R7 三个时点）；实施中 R2 与平台行为冲突，需 D570 裁定 | MCF-15 |
| PD-3 | 部分交付被写成裸 done，需按交付范围改写 | [#388](https://github.com/lingshf/ai-native-erp/pull/388) 评审 6049884677 → D569 | MCF-15 |
| PD-4 | D566 触发条件初稿写“全部合并”，不适用于只评审的项 | [#379](https://github.com/lingshf/ai-native-erp/pull/379) 评审 6048678456 | 已在 #379 修正，不再立项 |
| PD-5 | D5/D6 没有原始决定记录；D8 摘要被截断 | KGAP-03（D567） | 已有 KGAP-03，不重复立项 |
| PD-6 | `design/tasks/README.md` 已 1056 行，所有状态同步都改它，状态 PR 需要排队和 rebase | [#381](https://github.com/lingshf/ai-native-erp/pull/381)、[#384](https://github.com/lingshf/ai-native-erp/pull/384)、[#388](https://github.com/lingshf/ai-native-erp/pull/388)、[#393](https://github.com/lingshf/ai-native-erp/pull/393) | MCF-16 |
| PD-7 | SEC-02 生效后对 F22、§6.3 与 AI 指南的改写，尚未由事实所有者核对 | [#391](https://github.com/lingshf/ai-native-erp/pull/391) 改动了 `design/ai-assistant-facts.md` 与 `docs/ai-assistant.md` | 并入 MCF-05 |

### 4.3 Developer

不适用：本检查点的开发会话都已归档，无法自查（TL 确认）。各开发项的证据见第 3 节的评审与 QA 结论。

### 4.4 QA

| # | 发现 | 处理 |
| --- | --- | --- |
| Q1 | REFAC-31、REFAC-32、REFAC-34 的 `QA: PASS` 只覆盖 R3/R4 的等价性，不是界面回归或业务回归 | 记为口径，不立项 |
| Q2 | BUG-01、BUG-02a–d、BUG-03a/b 的 `QA: PASS` 只覆盖各自评审正文写明的范围，见 [#382](https://github.com/lingshf/ai-native-erp/pull/382)、[#387](https://github.com/lingshf/ai-native-erp/pull/387)、[#383](https://github.com/lingshf/ai-native-erp/pull/383)，不外推 | 记为口径，不立项 |
| Q3 | 团队章程、决定索引、ADR、钉版本和取舍汇总都没有可演练的行为，行为 QA 不适用 | 不适用 |
| Q4 | KDOC 各页的 QA 措辞过宽：[#365](https://github.com/lingshf/ai-native-erp/pull/365)、[#368](https://github.com/lingshf/ai-native-erp/pull/368)、[#375](https://github.com/lingshf/ai-native-erp/pull/375) 的 PASS 只覆盖阅读路径、源码和现有测试；`docs/README.md` 笼统写的“未经 QA 演练”应逐页列出；[#386](https://github.com/lingshf/ai-native-erp/pull/386) 的事实核对只覆盖 `7aabc4f` 上的两项。矩阵保持 partial | MCF-06（D578） |

### 4.5 Reviewer

| # | 发现 | 处理 |
| --- | --- | --- |
| V1 | REFAC-31、REFAC-32、REFAC-34 与 BUG-01、BUG-02、BUG-03 的最终 `APPROVED` 都绑定在合并前的 head 上 | 已确认，无发现 |
| V2 | SEC-01 的结案依据是 `25c0855` 上的非作者结论加 D568 的接受（[#385](https://github.com/lingshf/ai-native-erp/pull/385)），不计入 SEC-02 | 已确认，见 3.1 的偏差 |
| V3 | Backlog 中 SEC-01 的“现在只去掉……”在 SEC-02 之后已不是现状 | 本 PR 改为历史基线措辞（D577） |
| V4 | 合并后的 R8b 补证：REFAC-32 有，REFAC-31 与 REFAC-34 没有。`1764073` 和 `250f19a` 上的 main Full 为绿。REFAC-31 R8b 的业务事件场景是否都在真实 Chrome 中跑过，未核实 | 不用绿灯补记，R8b 记为未确认：MCF-17、MCF-18（D576） |

### 4.6 Delivery/Release

| # | 优先级 | 发现 | 处理 |
| --- | --- | --- | --- |
| R1 | P1 | CHANGELOG `[Unreleased]` 没有 BUG-01 [#382](https://github.com/lingshf/ai-native-erp/pull/382)、BUG-02a–d [#387](https://github.com/lingshf/ai-native-erp/pull/387)、BUG-03a/b [#383](https://github.com/lingshf/ai-native-erp/pull/383)、REFAC-31/32/34 的条目（转录人核对：`[Unreleased]` 目前只有 SEC-02 一条） | MCF-01（D572） |
| R2 | P2 | 冻结在 `3566ddb` 的 DEMO-23 RC 已过时，main 之后有产品改动 | MCF-02（D573） |
| R3 | P3 | G5 没有总的决定索引 | MCF-03。转录人核对：索引已由 KDOC-03（[#369](https://github.com/lingshf/ai-native-erp/pull/369)，`577891c`）交付为 [`design/decisions.md`](../decisions.md)，但 `docs/README.md` 的 G5 条仍写“没有决定总索引”，这一条已过时。按过时条目处理 |

CI/CD、部署与回滚：本检查点不适用（没有发布或部署）。

### 4.7 Knowledge Lead

| # | 优先级 | 发现 | 处理 |
| --- | --- | --- | --- |
| K1 | P2 | 覆盖矩阵中没有一页是 “covered” | 并入 KGAP-01（D567），不另立项 |
| K2 | P2 | Knowledge Lead 写的 6 页缺完整的事实所有者复核；SEC-02 的改写未经核对 | 页面复核并入 KGAP-01；SEC-02 的改写 → MCF-05 |
| K3 | P3 | 每次钉版本都要单开一个 PR。建议：在同一 PR 的下一轮钉，或每个里程碑批量钉 | MCF-04（D574） |

## 5. Knowledge Lead 跨模块检查

| 方面 | 发现 | 优先级 | 处理 |
| --- | --- | --- | --- |
| 系统设计 | `docs/README.md` 矩阵第 53–56 行（架构 / 总账 / 贸易 / 存储）为 unknown；UI-1 为 stale | — | MCF-07 |
| 实现 | REFAC 拆分后没有代码入口、扩展点、调试的说明页 | P2 | MCF-08 |
| 取舍 | G2 未解决；SEC-02 / D570 的措辞未经设计核对 | P2 | G2 → MCF-09；SEC-02 / D570 措辞 → MCF-05 |
| 使用 | 官方数据处理说明缺失 | P3 | 已按 D569 保留为已知缺口，不另立项 |
| 使用 | 性能页为 unknown | P3 | MCF-10 |
| 过时 | G8 可以精简 | P3 | MCF-11 |
| 冲突 | 未发现 | — | — |
| 重复 | 根 README 的业务规则段与 `docs/user/` 重叠 | P3 | MCF-12 |
| 缺 QA | 运维、迁移手册、CI 说明、AI 助手四页没有在安全数据上演练 | P2 | 并入 KGAP-01（逐页“剩余”栏），不另立项 |

## 6. TL 对齐

- 分歧：
  - R3 与 KDOC-03 已交付的决定索引：转录人核对后认定是 `docs/README.md` G5 条目过时（见 4.6），按 MCF-03 处理。若 Release 指的是别的缺口，请在 MCF-03 中说明。
  - REFAC-31/34 的 R8b：TL 决定不用绿灯补记（D576）。
- 同一版本确认：_待收集。_ 每位成员需在自己的角色内确认读的是本页 head、[D566](../tasks/README.md#里程碑收尾检查与回顾d566) 与截至 D578 的决定。群发消息不算确认。

## 7. 发现项

全部写入 Backlog：[任务总表 · 收尾发现项（MCLOSE-01）](../tasks/README.md#收尾发现项mclose-01)，编号 MCF-01..19，各带负责人、优先级、验收标准与目标里程碑。修复走正常的评审与 QA 流程。K1、K2 的页面复核和“缺 QA”并入已有的 KGAP-01；官方数据处理说明按 D569 保留为已知缺口；它们都不重复立项。

本次的决定（记入 [S24 决定表](../tasks/S24.md)）：
- D572：补 CHANGELOG（R1）。
- D573：v0.22.0 改用新 RC（R2）。
- D574：钉版本口径，修订 D561（K3）。
- D575：其余 P2/P3 发现转为 MCF 候选。
- D576：R8b 不用绿灯补记，并改为合并前的 DoD 项。
- D577：SEC-01 改为历史措辞。
- D578：KGAP-01 的 QA 措辞。

## 8. 产出

即本页。第 4.4、4.5、6 节收齐并经 TL 确认后，MCLOSE-01 才改为 done。
