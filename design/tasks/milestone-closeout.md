# 里程碑收尾检查与回顾（D566）

用户要求四个团队都执行：里程碑收尾时做一次合并的“结果对目标”检查与回顾。它**补充**现有 Sprint 评审与回顾（RC → Demo → Review → Retro），不取代、不取消它们。Team Leader（协调者）提供证据，设计角色转录。

| ID | 内容 | 负责 | 产出 | 状态 |
| --- | --- | --- | --- | --- |
| MCLOSE-01 | 按下文 1–8 对当前检查点做一次收尾检查与回顾 | Team Leader 主持；各实际在岗角色自查；Knowledge Lead 跨模块协调；设计角色转录 | [`design/reviews/milestone-closeout-post-M1.md`](../reviews/milestone-closeout-post-M1.md) | 完成（#394，f72950d；发现项见[下表](backlog/MCF.md)） |

### 1. 里程碑基线（**用户已确认**）

- 来源：用户通过 M2 的 ask_user 确认了回顾基线“**M1 之后的工程化与知识整理**”，由 TL 转达。
- 事实：M1 已完成；M2 待用户授权；S4–S24 与 KDOC 没有归入任何里程碑。
- **正式验收范围**（只有这些进入验收分母）：
  - S24 的 [REFAC-31](REFAC-31-business-event-compute-split.md)、[REFAC-32](REFAC-32-copilot-ai-complete-split.md)、[REFAC-34](REFAC-34-trade-document-routes-split.md)；
  - KDOC（D556，见上文 KDOC 表）；
  - [缺陷候选](backlog/BUG.md)（D565，BUG-01..03）；
  - [SEC-01](backlog/SEC.md)。
- 基线提交：main `9b8fa9739b0c07cf2b346719b19c36b55ad00ebc`（登记确认时的 main）。
- 不在范围内：M2-05/06 及其他尚未授权的任务；Dependabot；DEMO-24 与发布工作。
- 这次确认**只针对回顾基线**：不批准任何 M2 开发，也不增加任何合并、发布或部署权限。
- 关于 REFAC-33 与 REFAC-14..30：原提案只列了当时未完成的任务，漏掉了已合并的 REFAC-33（#371）和 REFAC-14..30。这是提案的遗漏，**不改变范围**。它们只放在下文“[历史成果对照](#历史成果对照)”中，不算“已验收”。若要把它们纳入正式范围，必须明确写出，不得默认加入。
- Sprint 结束、打 tag 或出 RC，都**不等于**里程碑完成。

### 2. 触发条件（结果回顾与交付验收分开）

- **正常情况**：范围内每一项都已结案，且覆盖范围内最后一个合并提交的 main Full 运行为绿 → 进行收尾回顾。“结案”指以下二者之一：
  - 已合并；
  - 有已记录、已被接受的**不实施处置**，并满足该项适用的证据要求（例如 SEC-01 这类只做评审的项，以非作者评审结论为证据；D565 缺陷候选可在核实后以不立项结案）。
  - 本条不强制任何项合并或移出范围，也不意味着授予实施权限；是否实施仍按各项原有的派发与授权规则。
- **受阻情况**：某个门禁一直不通过，或缺陷一直未关闭 → 可以进行回顾，但必须标明“**阶段性**”，并持续记录哪些门禁未通过。阶段性回顾**不算**里程碑完成。
- **移出范围**：协调者可以提议移出某些项；对用户已确认范围的任何实质性删减，都需要用户确认。不得为了宣布完成而把未完成的任务移出范围。
- 不会自动触发，也没有定时任务。

### 历史成果对照

仅作历史背景：**不进入**正式验收分母，**不扩大**已确认范围。按任务记录合并事实、原有验收证据和当时适用的 DoD；缺证据的标为未知。评审结论都以 COMMENTED 状态提交，正文写 `VERDICT: APPROVED`；“QA”列只认 PR 评审或评论中的 `QA: PASS / not_applicable`。

| 任务 | PR | 合并提交 | 精确 head 评审 | QA | 适用 DoD | 原验收 |
| --- | --- | --- | --- | --- | --- | --- |
| REFAC-14 | [#326](https://github.com/lingshf/ai-native-erp/pull/326) | `ac8ac00e8bfd4c8694b662e82a834550909e8f2f` | [6034349199](https://github.com/lingshf/ai-native-erp/pull/326#pullrequestreview-6034349199)：`VERDICT: APPROVED` @ `53833bf`（= 合并前 head） | 无记录 | 当时任务书的验收标准（早于章程 #366） | **未知**（缺 QA 结论） |
| REFAC-15 | [#332](https://github.com/lingshf/ai-native-erp/pull/332) | `914f0410c083c734faa907815c67054b4aa811ed` | [6035325756](https://github.com/lingshf/ai-native-erp/pull/332#pullrequestreview-6035325756)：`VERDICT: APPROVED` @ `786afed`（= 合并前 head） | 无记录 | 当时任务书的验收标准（早于章程 #366） | **未知**（缺 QA 结论） |
| REFAC-16 | [#334](https://github.com/lingshf/ai-native-erp/pull/334) | `affb8a3914ed07196f703574983ce3b849566b5e` | [6035898774](https://github.com/lingshf/ai-native-erp/pull/334#pullrequestreview-6035898774)：`VERDICT: APPROVED` @ `a5e5000`（= 合并前 head） | 无记录 | 当时任务书的验收标准（早于章程 #366） | **未知**（缺 QA 结论） |
| REFAC-17 | [#335](https://github.com/lingshf/ai-native-erp/pull/335) | `f3a764636a39ea8c2e9622b8e9f9782f16aa076a` | [6036219176](https://github.com/lingshf/ai-native-erp/pull/335#pullrequestreview-6036219176)：`VERDICT: APPROVED` @ `9616770`（= 合并前 head） | 无记录 | 当时任务书的验收标准（早于章程 #366） | **未知**（缺 QA 结论） |
| REFAC-18 | [#339](https://github.com/lingshf/ai-native-erp/pull/339) | `a80d16f478722bec881b9cf54a793d95347cd7d9` | [6036985159](https://github.com/lingshf/ai-native-erp/pull/339#pullrequestreview-6036985159)：`VERDICT: APPROVED` @ `c10d17a`（= 合并前 head） | 无记录 | 当时任务书的验收标准（早于章程 #366） | **未知**（缺 QA 结论） |
| REFAC-19 | [#338](https://github.com/lingshf/ai-native-erp/pull/338) | `2b96afa4e4a1e4356af10f15e6a420ea578d3fbc` | [6036956443](https://github.com/lingshf/ai-native-erp/pull/338#pullrequestreview-6036956443)：`VERDICT: APPROVED` @ `a91e631`（= 合并前 head） | 无记录 | 当时任务书的验收标准（早于章程 #366） | **未知**（缺 QA 结论） |
| REFAC-20 | [#337](https://github.com/lingshf/ai-native-erp/pull/337) | `37362e7a5c5bebefe127d08fdf3a8acdcff8b4e2` | [6036995257](https://github.com/lingshf/ai-native-erp/pull/337#pullrequestreview-6036995257)：`VERDICT: APPROVED` @ `89b83b5`（= 合并前 head） | 无记录 | 当时任务书的验收标准（早于章程 #366） | **未知**（缺 QA 结论） |
| REFAC-21 | [#343](https://github.com/lingshf/ai-native-erp/pull/343) | `663c9872dc10925292939a6c657c20628e568cce` | [6037660309](https://github.com/lingshf/ai-native-erp/pull/343#pullrequestreview-6037660309)：`VERDICT: APPROVED` @ `56c6f2b`（= 合并前 head） | 无记录 | 当时任务书的验收标准（早于章程 #366） | **未知**（缺 QA 结论） |
| REFAC-22 | [#344](https://github.com/lingshf/ai-native-erp/pull/344) | `e89b0b43e5ab73c8520d04633bd3f1a8db454083` | [6037713270](https://github.com/lingshf/ai-native-erp/pull/344#pullrequestreview-6037713270)：`VERDICT: APPROVED` @ `f44c82d`（= 合并前 head） | 无记录 | 当时任务书的验收标准（早于章程 #366） | **未知**（缺 QA 结论） |
| REFAC-23 | [#347](https://github.com/lingshf/ai-native-erp/pull/347) | `2f46d193e7bdbbdf4c188e6463e6c9da2a6432c4` | [6041345496](https://github.com/lingshf/ai-native-erp/pull/347#pullrequestreview-6041345496)：`VERDICT: APPROVED` @ `984e8b8`（= 合并前 head） | 无记录 | 当时任务书的验收标准（早于章程 #366） | **未知**（缺 QA 结论） |
| REFAC-24 | [#349](https://github.com/lingshf/ai-native-erp/pull/349) | `430e130788dac16a6d2fa8233df9fbcf18191505` | [6041474849](https://github.com/lingshf/ai-native-erp/pull/349#pullrequestreview-6041474849)：`VERDICT: APPROVED` @ `48b1bfd`（= 合并前 head） | 无记录 | 当时任务书的验收标准（早于章程 #366） | **未知**（缺 QA 结论） |
| REFAC-25 | [#348](https://github.com/lingshf/ai-native-erp/pull/348) | `5be94963cbdf76b8df4209b000c57e5142e12617` | [6041413871](https://github.com/lingshf/ai-native-erp/pull/348#pullrequestreview-6041413871)：`VERDICT: APPROVED` @ `343bab3`（= 合并前 head） | 无记录 | 当时任务书的验收标准（早于章程 #366） | **未知**（缺 QA 结论） |
| REFAC-26 | [#354](https://github.com/lingshf/ai-native-erp/pull/354) | `2c4406c22ccfcde9a0d73e546c5a34aae44ede20` | [6045435212](https://github.com/lingshf/ai-native-erp/pull/354#pullrequestreview-6045435212)：`VERDICT: APPROVED` @ `88862f6`（= 合并前 head） | 无记录 | 当时任务书的验收标准（早于章程 #366） | **未知**（缺 QA 结论） |
| REFAC-27 | [#353](https://github.com/lingshf/ai-native-erp/pull/353) | `f3169c3ada0625d1653e7fcd130d301f0bf04509` | [6045029357](https://github.com/lingshf/ai-native-erp/pull/353#pullrequestreview-6045029357)：`VERDICT: APPROVED` @ `ae20971`（= 合并前 head） | 无记录 | 当时任务书的验收标准（早于章程 #366） | **未知**（缺 QA 结论） |
| REFAC-28 | [#352](https://github.com/lingshf/ai-native-erp/pull/352) | `7eb7b42f761dea093f6a29f6c85ec0506368bf49` | [6044980911](https://github.com/lingshf/ai-native-erp/pull/352#pullrequestreview-6044980911)：`VERDICT: APPROVED` @ `842c046`（= 合并前 head） | 无记录 | 当时任务书的验收标准（早于章程 #366） | **未知**（缺 QA 结论） |
| REFAC-29 | [#358](https://github.com/lingshf/ai-native-erp/pull/358) | `95e76bade32f4edd56204c12a46ce41c31507aae` | [6045992440](https://github.com/lingshf/ai-native-erp/pull/358#pullrequestreview-6045992440)：`VERDICT: APPROVED` @ `94e903d`（= 合并前 head） | 无记录 | 当时任务书的验收标准（早于章程 #366） | **未知**（缺 QA 结论） |
| REFAC-30 | [#360](https://github.com/lingshf/ai-native-erp/pull/360) | `3bbab1ef7a5c5bb68c6ab47104cd76f4d40d8549` | [6046817240](https://github.com/lingshf/ai-native-erp/pull/360#pullrequestreview-6046817240)：`VERDICT: APPROVED` @ `ba8c0d3`（= 合并前 head） | 无记录 | 当时任务书的验收标准（早于章程 #366） | **未知**（缺 QA 结论） |
| REFAC-33 | [#371](https://github.com/lingshf/ai-native-erp/pull/371) | `ab306460f9607403498fd54d0b0a2614b97c5b96` | [6047861626](https://github.com/lingshf/ai-native-erp/pull/371#pullrequestreview-6047861626)：`VERDICT: APPROVED` @ `d746daf`（= 合并前 head） | `QA: PASS`（同一评审） | 章程 D555/D557（#366 之后合并） | 原验收证据齐全 |

### 3. 结果检查

只对照第 1 节的正式验收范围，分四组列出：**已验收**、**未完成**、**新增**、**延后**；“历史成果对照”中的任务不进入任何一组。每项偏差写明原因和影响。没有可靠分母时不给百分比；提交数不算验收进度。

### 4. 每个实际在岗角色自查

角色：TL、Design、每位 Developer、QA、Reviewer、Delivery、Knowledge。一人兼多个角色时，按角色分别自查。

- 各角色检查自己负责的代码、测试、配置、文档、决定和交接，列出过时、遗漏或需细化之处，并附证据。
- 某项不适用时写明原因。
- 自查不替代独立评审或 QA。

### 5. Knowledge Lead

协调跨模块的缺口、重复、冲突和过时内容，以及系统设计、实现、取舍、使用说明四方面的覆盖情况。

### 6. TL 对齐

- TL 收集分歧。
- TL 确认每位成员读的是同一版本的目标、范围、接口、验收标准和最新决定。
- 每位成员在自己的角色内给出确认；群发消息不算确认。

### 7. 发现项

- 每个发现项都写入本 Backlog，带负责人、优先级、验收标准和目标里程碑。
- 修复走正常的评审与 QA 流程。
- 回顾不扩大重构范围，也不授予任何新的合并、发布或部署权限。

### 8. 产出

结果写入 `design/reviews/milestone-closeout-post-M1.md`（执行时新建）。本项状态从 todo 开始。
