# S26 回顾（知识缺口补齐 + 决定索引生成器可靠性 + REFAC-31 R8b 补证，设计 / 产品视角）

- 作者：设计 / 产品负责人。核对时点：main `bf31631`，核对时间 2026-11-26（UTC）。评审事实与计数命令见 [S26 Sprint 评审](S26-review.md)。
- 格式沿用 [S25 回顾](S25-retro.md)。区分“观察”（有 PR、评审或提交记录）与“推断”。
- 协调者建议纳入的素材三条（本文议题 1–3）：#425 正文多轮打回；缺陷编号与 BUG 表冲突；跨文件验收（KGAP-02 的 §3 链接）。

## 做得好

- **计划范围六项一个 Sprint 全部 done**（观察，[S26 评审 §2.1](S26-review.md#21-d592-目标)）：没有触发 D592 的砍项顺序。
- **MCF-21 的第 ③ 项立即见效**（观察）：#419 之后，5 个 `docs/` PR（#420、#422、#424、#427、#431）都没有改动 `design/decisions.md`；S25 中有 5 个 `docs/` PR（#401、#410、#411、#413、#414）改动了索引。#429 与 #430 都改索引，#430 rebase 后重新生成无差异。
- **发现缺陷时不扩大 PR 范围**（观察）：MCF-20 实施中发现统计预览崩溃，按 D594 由 #425 照常评审，缺陷单独由 #428 修复并补断言；#428 一次批准。
- **main 没有变红**：14 个合并提交 11 个 Full success、3 个被下一次推送取代而 cancelled、0 个 failure。
- **S25 行动 1 达成计数目标**：“事实不准”与“措辞过宽”合计 7 次，少于 S25 的 14 次（见下方检查）。

## 打回分类

18 次打回按主要原因归类（一次评审有多个点时取第一个阻塞点的类别；口径同 S25，新增“任务书验收步骤或证据计划”一类）：

| 类别 | 次数 | 评审 |
| --- | --- | --- |
| 事实不准（代码行为、出处归属、决定范围） | 5 | #420 第 1 轮 [6067988003](https://github.com/lingshf/ai-native-erp/pull/420#pullrequestreview-6067988003)；#423 两轮 [6068119782](https://github.com/lingshf/ai-native-erp/pull/423#pullrequestreview-6068119782)、[6068138050](https://github.com/lingshf/ai-native-erp/pull/423#pullrequestreview-6068138050)；#426 [6068204426](https://github.com/lingshf/ai-native-erp/pull/426#pullrequestreview-6068204426)；#429 [6079025209](https://github.com/lingshf/ai-native-erp/pull/429#pullrequestreview-6079025209) |
| 文档内或与 backlog 不一致 | 4 | #418 两轮 [6067719958](https://github.com/lingshf/ai-native-erp/pull/418#pullrequestreview-6067719958)、[6067730825](https://github.com/lingshf/ai-native-erp/pull/418#pullrequestreview-6067730825)；#422 第 2 轮 [6068081474](https://github.com/lingshf/ai-native-erp/pull/422#pullrequestreview-6068081474)；#431 第 2 轮 [6079077749](https://github.com/lingshf/ai-native-erp/pull/431#pullrequestreview-6079077749) |
| 任务书验收步骤或证据计划（步骤缺失、PR 正文证据计划不全或不可执行） | 3 | #421 [6068021655](https://github.com/lingshf/ai-native-erp/pull/421#pullrequestreview-6068021655)；#425 两轮 [6068191631](https://github.com/lingshf/ai-native-erp/pull/425#pullrequestreview-6068191631)、[6068208667](https://github.com/lingshf/ai-native-erp/pull/425#pullrequestreview-6068208667) |
| 措辞范围过宽 | 2 | #420 第 2 轮 [6068006969](https://github.com/lingshf/ai-native-erp/pull/420#pullrequestreview-6068006969)；#430 [6079025588](https://github.com/lingshf/ai-native-erp/pull/430#pullrequestreview-6079025588) |
| 证据钉点或链接位置 | 2 | #422 第 1 轮 [6068055765](https://github.com/lingshf/ai-native-erp/pull/422#pullrequestreview-6068055765)；#431 第 1 轮 [6079059085](https://github.com/lingshf/ai-native-erp/pull/431#pullrequestreview-6079059085) |
| 生成脚本缺陷 | 2 | #419 两轮 [6067866105](https://github.com/lingshf/ai-native-erp/pull/419#pullrequestreview-6067866105)、[6067917130](https://github.com/lingshf/ai-native-erp/pull/419#pullrequestreview-6067917130) |

按作者：Product/Design 的设计 PR 8 次、生成脚本 2 次；Knowledge Lead 的文档 PR 6 次；Developer 2 次（都在 #425，只涉及 PR 正文）。

## 议题 1：PR 正文证据计划要多轮补（#425，3 / 18）

**发生了什么（观察）**

- #425 的产品改动与测试本身没有被打回；两轮打回都只要求补 PR 正文：第 1 轮缺“合并后六行取证计划”（任务书 `MCF-20-business-event-gui.md:184–187` 把它列为合并前门槛）以及验收 7/8/10 的原始输出（`fileWeights`、分片命令与输出）；第 2 轮计划不可执行——`.github/workflows/full.yml` 只在失败时上传 `trade-e2e` 截图，成功的 run 拿不到截图。
- #421（任务书）第 1 轮同类：验收 6 缺切换过滤的步骤；拆分备选只给了第一个文件的命令。

**根因（推断）**

任务书写了“要有证据计划”，没有写计划的形状：逐条验收 → 证据类型 → 命令或产物 → 在哪里取（本机 / CI 成功 run / CI 失败 run）。写任务书时没有核对 CI 在成功 run 中实际保留哪些产物，计划落到 PR 正文时才由评审发现。

**改进**：行动 1。

## 议题 2：缺陷编号与 BUG 表冲突（#428）

**发生了什么（观察）**

- D594 原话与 #428 的标题、提交信息称该缺陷为“BUG-03”；[BUG 表](../tasks/backlog/BUG.md)中 BUG-03a/b 已是 #383 修复的另一缺陷（路由校验顺序）。
- 状态同步 #430 时才发现，登记为 BUG-04 并注明别名；main 的提交信息 `fix(BUG-03): …` 无法更改，同号两义在历史中永久保留。

**根因（推断）**

D565 规定实施中发现的现存缺陷立为候选，但没有规定由谁、在什么时点分配编号；编号在决定与派发消息中先出现，登记在后。

**改进**：行动 2。

## 议题 3：跨文件验收在派发时没有列全（#431）

**发生了什么（观察）**

- KGAP-02 的验收在 backlog 行中有两部分：`design/roadmap.md` §6.1 补记（Product/Design，#429），以及 `docs/tradeoffs.md` §3 “改为链接补记，不再出现‘原记录未写’”（KL，#431）。
- #431 第 1 轮只发现链接落在页首；改完后先被批准（6079071357），随后第二次评审 [6079077749](https://github.com/lingshf/ai-native-erp/pull/431#pullrequestreview-6079077749) 按 backlog 原文退回：§3 仍有加粗的“原记录未写”。
- S26 计划的范围表把这条写在 KGAP-02 一行的验收要点里，泳道表只写“KGAP-02 `tradeoffs.md` 链接”。

**根因（推断）**

一项验收跨两个泳道、两个文件时，派给后一个泳道的只有“做什么”（改链接），没有带上落在该文件上的验收句（不再出现某句话）；评审也是第二次才回到 backlog 原文核对。

**改进**：行动 3。

## S25 回顾行动项检查

| 来源 | 行动 | 完成标准 | S26 结论 | 依据 |
| --- | --- | --- | --- | --- |
| S25 行动 1 | 送审前“断言 → 来源”对照 | 打回中“事实不准”与“措辞过宽”合计少于 14 次 | 达成 | 合计 7 次（5 + 2），见上方分类 |
| S25 行动 2 | 钉点按引用格找 | 下一 Sprint 没有“证据钉点位置”类打回 | 未达成 | #422 第 1 轮：现行矩阵未完整换钉，trade-main-path 没有逐页钉点（[6068055765](https://github.com/lingshf/ai-native-erp/pull/422#pullrequestreview-6068055765)）；第 2 轮即通过 |
| S25 行动 3（并入 MCF-21） | 索引的提及不记行号 | 用 #414 复现无变化；增删提及仍改动索引 | 达成 | #419 验收；此后 5 个 `docs/` PR 均未改动索引 |

## 行动项汇总

| # | 行动 | 负责人 | 落点 | 完成标准 |
| --- | --- | --- | --- | --- |
| 1 | **任务书写明 PR 正文的证据计划**（议题 1）：需要开发的任务书逐条验收列出“证据类型 → 命令或产物 → 取证位置（本机 / CI 成功 run / CI 失败 run）→ 由谁核对”，并核对所引 CI 产物在成功 run 中确实保留（如 `full.yml` 的上传条件）；合并后才有的证据（首个覆盖合并 SHA 的 Full 等）单列，写明由谁在何处记录 | Product/Design 写任务书；Reviewer 核对任务书与 PR 正文 | [任务书模板](../tasks/TEMPLATE.md)（D595 采纳） | 下一 Sprint 的开发任务 PR 没有因证据计划不全或不可执行被打回 |
| 2 | **缺陷编号先查 BUG 表再命名**（议题 2）：发现缺陷候选后，先由 Product/Design 在 [BUG 表](../tasks/backlog/BUG.md)登记一行并分配下一个未用编号，决定、派发消息、PR 标题与提交信息都用该编号 | Product/Design 登记；TL 派发时引用 | [BUG 表](../tasks/backlog/BUG.md)命名说明（D595 采纳） | 下一 Sprint 没有缺陷编号别名或同号两义 |
| 3 | **跨文件验收在派发时列全**（议题 3）：一项验收涉及多个泳道或文件时，计划泳道表与派发消息按文件列出落在该文件上的验收句原文（如“`tradeoffs.md` §3 不再出现‘原记录未写’”），评审按同一清单核对 | Product/Design 写计划；TL 派发；Reviewer 核对 | [任务书模板](../tasks/TEMPLATE.md)；下一 Sprint 计划的泳道表（D595 采纳） | 下一 Sprint 没有因漏掉 backlog 中跨文件验收句而被打回 |

S25 行动 2 未达成，不另立新行动：#422 第 2 轮即通过，且下一次钉版本批次仍按 D591 写入模板的规则执行，在下一 Sprint 回顾中再检查。

## 下一 Sprint 候选

Backlog 中 KGAP、MCF 表已无 todo；S27 的候选与排序由单独的 S27 计划 PR 提出（本收尾合并后再开），不在本文排序。
