# S25 回顾（v0.22.0 重新切 RC + 收尾发现项补证，设计 / 产品视角）

- 作者：设计 / 产品负责人。核对时点：main `d937c85`，核对时间 2026-11-26（UTC）。评审事实与计数命令见 [S25 Sprint 评审](S25-review.md)。
- 格式沿用 [S22 回顾](S22-retro.md)。区分“观察”（有 PR、评审或提交记录）与“推断”。
- 协调者指定纳入的素材三条（本文议题 1–3）：多个文档 PR 经 1–2 轮退回，原因有事实不准、证据钉版本放错位置、措辞范围过宽；Developer 事实复核在 #411 中发现漏列预算；生成索引的 PR 需要串行 rebase。

## 做得好

- **一个 Sprint 清完 MCLOSE-01 的 P1/P2，可选 P3 也全部完成**（观察，[MCF 表](../tasks/backlog/MCF.md)）：只剩 MCF-20、MCF-21 两项候选在 Backlog。
- **不碰产品代码，main 没有变红**：21 个合并提交 19 个 Full success、2 个被下一次推送取代而 cancelled、0 个 failure；冲突域越界 0 次。
- **事实所有者复核有效**：MCF-05 由新派只读 Developer 对照 `70acd04` 复核，24 项事实中 22 项一致，另外 2 项在 [#398](https://github.com/lingshf/ai-native-erp/pull/398) 修正；[#411](https://github.com/lingshf/ai-native-erp/pull/411) 的 Developer 事实复核（head `68a2d1e`）补上了漏列的预算，并改正 D18 的措辞、PG-05 的“且”、`npm run bench` 的范围与迁移入口（见 #411 正文）。
- **决定索引可以复现**：MCF-14 之后，每个新增决定的 PR 都重新生成并通过 `--check`；评审在合并前用最新 main 临时合并后再跑 `--check`（如 [6050813503](https://github.com/lingshf/ai-native-erp/pull/401#pullrequestreview-6050813503)、[6050990909](https://github.com/lingshf/ai-native-erp/pull/405#pullrequestreview-6050990909)、[6051083731](https://github.com/lingshf/ai-native-erp/pull/407#pullrequestreview-6051083731)），合并后的索引没有漂移。
- **需要裁定的规则列出选项再交决定**：[#404](https://github.com/lingshf/ai-native-erp/pull/404) 在正文列出 A/B 选项与建议，协调者一次定为 D585，没有因为规则内容本身来回。
- **设计 PR 没有被二次打回**：#397、#402、#404、#409、#412 都是 1 轮打回后批准，S22 行动 5（回应评审逐句对照）在设计 PR 上的完成标准达到（见下方检查）。

## 打回分类

22 次打回按主要原因归类（一次评审有多个点时取第一个阻塞点的类别）：

| 类别 | 次数 | 评审 |
| --- | --- | --- |
| 事实不准（引用、计数、代码行为、证据归属、压缩时丢失内容） | 8 | #396 [6050449862](https://github.com/lingshf/ai-native-erp/pull/396#pullrequestreview-6050449862)；#399 第 2 轮 [6050509107](https://github.com/lingshf/ai-native-erp/pull/399#pullrequestreview-6050509107)；#401 两轮 [6050573708](https://github.com/lingshf/ai-native-erp/pull/401#pullrequestreview-6050573708)、[6050813503](https://github.com/lingshf/ai-native-erp/pull/401#pullrequestreview-6050813503)；#405 第 1 轮 [6050990909](https://github.com/lingshf/ai-native-erp/pull/405#pullrequestreview-6050990909)；#407 [6051083731](https://github.com/lingshf/ai-native-erp/pull/407#pullrequestreview-6051083731)；#411 第 1 轮 [6051423187](https://github.com/lingshf/ai-native-erp/pull/411#pullrequestreview-6051423187)；#414 [6051293600](https://github.com/lingshf/ai-native-erp/pull/414#pullrequestreview-6051293600) |
| 措辞范围过宽（“没有 / 全部 / 逐字 / 每个 / 不”超出证据） | 6 | #399 第 1 轮 [6050488367](https://github.com/lingshf/ai-native-erp/pull/399#pullrequestreview-6050488367)；#402 [6050655824](https://github.com/lingshf/ai-native-erp/pull/402#pullrequestreview-6050655824)；#408 [6051118221](https://github.com/lingshf/ai-native-erp/pull/408#pullrequestreview-6051118221)；#409 [6051135628](https://github.com/lingshf/ai-native-erp/pull/409#pullrequestreview-6051135628)；#410 [6051176256](https://github.com/lingshf/ai-native-erp/pull/410#pullrequestreview-6051176256)；#411 第 2 轮 [6051440409](https://github.com/lingshf/ai-native-erp/pull/411#pullrequestreview-6051440409) |
| 文档内或与 PR 正文不一致 | 4 | #397 [6050428410](https://github.com/lingshf/ai-native-erp/pull/397#pullrequestreview-6050428410)；#404 [6050831669](https://github.com/lingshf/ai-native-erp/pull/404#pullrequestreview-6050831669)；#405 第 2 轮 [6051010106](https://github.com/lingshf/ai-native-erp/pull/405#pullrequestreview-6051010106)；#412 [6051246906](https://github.com/lingshf/ai-native-erp/pull/412#pullrequestreview-6051246906) |
| 证据钉点位置 | 2 | #413 [6051255159](https://github.com/lingshf/ai-native-erp/pull/413#pullrequestreview-6051255159)；#415 [6051462727](https://github.com/lingshf/ai-native-erp/pull/415#pullrequestreview-6051462727) |
| 生成脚本缺陷与 rebase 后重新生成 | 2 | #400 两轮 [6050521611](https://github.com/lingshf/ai-native-erp/pull/400#pullrequestreview-6050521611)、[6050552817](https://github.com/lingshf/ai-native-erp/pull/400#pullrequestreview-6050552817) |

按作者：Release / Knowledge Lead 的文档 PR 15 次，Product/Design 的设计 PR 5 次、生成脚本 2 次。

## 议题 1：事实不准与措辞过宽（14 / 22）

**发生了什么（观察）**

- 事实不准：#396 两个合并 SHA 写成 `373620000000`、`4.3E+132`；#401 称 BUG-01 没有用户文档（`docs/user/ledger.md` 有），截图写 18 张（实为 17）；#405 把 `AI_TIMEOUT_MS` 写成“请求整体超时”（实际只计上下文加载后的适配器调用）；#411 混淆了三个基准入口，把 512 MiB 写成 512 MB；#414 把根 README 的规则改成链接时丢了“以正金额单列”。
- 措辞过宽：#399 “其余页面没有 QA 记录”；#402 “正文逐字一致”（实际有相对链接改写）；#409 D586 写成“试运行产物未保留”（控制台日志在 #401）；#410 “每个编号一行并链接到记录位置”（实际有“无”）；#411 “不读取上一条的输出”（设置 `ERP_BENCH_FIXTURE` 时会读）。
- #411 在 Developer 事实复核之后仍被打回 2 轮：复核补上了漏列的预算，评审又找到入口混淆、单位与条件限定三处。

**根因（推断）**

- 断言是按记忆或摘要写的，没有在送审前逐句回到所引来源（文件:行 @ 完整 SHA，或评审链接）核对；PR 正文没有“断言 → 来源”对照，评审只能自己重找来源。
- “没有 / 全部 / 逐字 / 每个 / 不”这类量词没有找反例；压缩改写（#414、#408）时只核对了保留的句子，没有核对删掉的部分是否仍在链接目标中。
- 事实所有者复核只核“列出的事实是否成立”，不核“表述是否超出事实”；两者都要，缺一个就会被评审打回。

**改进**：行动 1。

## 议题 2：证据钉点放错位置（2 / 22）

**发生了什么（观察）**

- [#413](https://github.com/lingshf/ai-native-erp/pull/413)：矩阵设计列改为 partial，证据列却没有新增设计证据的完整 SHA 与具体文件。
- [#415](https://github.com/lingshf/ai-native-erp/pull/415)：`5780f95` 只写在矩阵上方的 MCF-12 说明里，引用根 README 的总账、贸易两行证据列没有这个钉点；D590 原文写明“重新钉矩阵证据列中的 README 版本”。
- [#406](https://github.com/lingshf/ai-native-erp/pull/406)、[#408](https://github.com/lingshf/ai-native-erp/pull/408) 仍是单独的钉版本 PR；[#415](https://github.com/lingshf/ai-native-erp/pull/415) 是第一次按 D574 在里程碑批量钉版本（MCF-04）。

**根因（推断）**

D559 / D561 / D574 规定了“完整 SHA + 具体文件”和“何时钉”，没有规定“钉在哪一格”。钉版本时按“改了哪个文件”去找位置，而没有按“哪些格引用了这个文件”去找，所以漏掉了引用它的其他行。

**改进**：行动 2。

## 议题 3：生成索引的 PR 需要串行 rebase

**发生了什么（观察）**

- `git log --oneline f72950d..d937c85 -- design/decisions.md` 有 13 个提交（共 22 个），其中 #401、#410、#411、#413、#414 五个是 `docs/` PR，本身没有新增决定；它们对索引的改动有的来自新增或删除提及（如 #413 新增 D589 在 `docs/README.md` 的提及、#410 删除一处 D20 提及），有的只是行号漂移（如 #414）。
- [#400](https://github.com/lingshf/ai-native-erp/pull/400) 第 2 轮 [6050552817](https://github.com/lingshf/ai-native-erp/pull/400#pullrequestreview-6050552817) 只因与 #399 合并后 `--check` 退出 1 被打回：D20 行的 `docs/README.md:63` 应为 `:78`。#401（`103b452`）、#410（`570468d`）、#411（`68a2d1e`）都有 rebase 后重新生成的提交；#401、#404、#405、#407 的评审都要先临时合入最新 main 再跑 `--check`。
- 例：#414 只改根 README 与 `docs/README.md`，索引中 D589 的位置从 `docs/README.md:109` 变成 `:111`。

**根因（观察 + 推断）**

索引为每个决定的每处“提及”记录到行号（观察）。所以只要在某处提及之上增删行，即使没有新增或删除决定，索引也会变，同时在途的 PR 就互相冲突（推断：这是串行 rebase 的主要来源，S25 只有一次打回直接由它造成，其余成本落在作者重新生成与评审重复核对上）。

**改进**：行动 3。

## S22 回顾与 MCLOSE-01 行动项检查

S23、S24 没有单独的回顾；S22 行动项的落点见 [S23 计划](../tasks/S23.md#回顾行动项落点)与 [S24 计划](../tasks/S24.md#回顾行动项落点)，MCLOSE-01 的发现项见 [MCF 表](../tasks/backlog/MCF.md)。

| 来源 | 行动 | 完成标准 | S25 结论 | 依据 |
| --- | --- | --- | --- | --- |
| S22 行动 1 | 时刻与清单由命令写进日志，清理前一次产出全产物清单 | Demo 的 run-through 引用日志行号；清单一次送审就齐 | 部分达成 | #401 最后一次运行有 SHA-256 产物清单（D586 理由）；但试运行 1–9 的截图与诊断图片未保留、Demo 未经 slot-run，第 2 轮评审要求补可复跑命令与窗口产物清单，两项偏差按 D586 接受 |
| S22 行动 5 | 回应评审逐句对照 | 设计 PR 没有因“上轮要求只改了一半”再次打回 | 达成（设计 PR） | 5 个设计 PR 都是 1 轮后批准；但文档 PR #405 第 2 轮正是“上轮两点只改了一半”，该行动没有覆盖文档 PR，并入行动 1 |
| S22 行动 2–4 | Demo 取值断言、chunk 预算、本机 web 测试命令 | — | 不适用 | S25 没有开发任务；#401 capture 的证据范围由其第 2 轮评审处理 |
| MCLOSE-01 | MCF-01..21 | 各项验收 | P1/P2 与已排入的 P3 全部 done；MCF-20、MCF-21 在 Backlog | [S25 评审 §2.1](S25-review.md#21-d580-目标) |

## 行动项汇总

| # | 行动 | 负责人 | 落点 | 完成标准 |
| --- | --- | --- | --- | --- |
| 1 | **送审前“断言 → 来源”对照**（议题 1）：改动事实性语句（代码行为、数字、计数、证据归属、覆盖范围）的文档或设计 PR，在正文附一张表：每条新增或改写的断言 → 来源（文件:行 @ 完整 SHA，或评审 / 评论链接）；含“没有 / 全部 / 逐字 / 每个 / 不”的句子写明找过的反例；压缩或改链接时列出删去的句子，并注明各自在链接目标的位置。描述代码的页面先完成事实所有者复核再请 Reviewer，复核与送审是同一 head。回应评审时附“要求 → 改动位置”对照（把 S22 行动 5 扩到文档 PR） | 作者执行：Release + Knowledge Lead（`docs/`）、Product/Design（`design/`）；Reviewer 核对有无此表 | 下一 Sprint 计划 PR 起；写入[任务书模板](../tasks/TEMPLATE.md)的设计自查（随下一 Sprint 计划 PR） | 下一 Sprint 的打回中“事实不准”与“措辞过宽”两类合计少于 S25 的 14 次，并在其回顾中按本文同一口径分类计数 |
| 2 | **钉点按“引用格”找**（议题 2）：钉版本前对每个被钉文件运行 `git grep -n "<文件路径>" -- docs/README.md`，在每一行引用它的格中更新证据列，输出原样贴在 PR 正文；只写在说明段落里的钉点不算钉上 | Release + Knowledge Lead；Reviewer 核对 grep 输出 | 下一次钉版本批次起（MCF-04 规则的执行细则） | 下一 Sprint 没有“证据钉点位置”类打回 |
| 3 | **索引不再因行号漂移而变**（议题 3）：生成器对“提及”只记文件、不记行号（决定表所在的记录位置保留行号），使不增删决定、也不增删提及的 `docs/` PR 不改动 `design/decisions.md`；与 MCF-21 同改一个脚本，建议并入 MCF-21 一并做 | Product/Design 改脚本；Delivery/Release 评审 | MCF-21（Backlog）；是否并入须协调者决定 | 用 #414 的改动复现（它对索引的改动只有行号漂移）：新规则下重新生成，`design/decisions.md` 无变化；新增或删除提及的 PR 仍照常改动索引 |

## 下一 Sprint 候选（产品负责人建议）

只给 Backlog 排序建议，不启动；派发时机与名额由 Team Leader 定。

| 优先 | 候选 | 理由 | 冲突域 |
| --- | --- | --- | --- |
| 1 | **MCF-21**（P3，Product/Design；建议并入行动 3） | 生成器误判会静默漏掉决定行；行动 3 先做，可减少后面 KGAP-03、KGAP-05 等 `design/` PR 与 `docs/` PR 之间的串行 rebase | `scripts/gen-decisions-index.mjs`、`design/decisions.md` |
| 2 | **KGAP-01**（P2，事实所有者 + QA + KL） | 唯一的 P2；矩阵多页仍为 partial，转 covered 必须靠它；MCF-06/08/09/10 新增的页同样需要 | 只读复核 + `docs/README.md` |
| 3 | **KGAP-03**（P3，Product/Design） | D5/D6/D7/D8 摘要不全；D590 中根 README 的 D5/D6/D7 规则原文要等它完成 | `design/`，须重新生成索引 |
| 4 | **KGAP-05**（P3，Product/Design） | 贸易设计没有一页现行汇总（D588）；完成后矩阵贸易行的设计列才能指向一页 | `design/`；与 KGAP-03 串行 |
| 5 | **KGAP-02**（P3，Product/Design + KL） | AI 取舍缺备选；风险低，可与 KGAP-03 同批 | `design/roadmap.md` §6.1、`docs/tradeoffs.md` |
| 6 | **MCF-20**（P3，Developer） | REFAC-31 R8b 的真实 Chrome 断言；要开发名额并在 Full 中运行，价值主要在证据完整 | 测试代码 |
| — | v0.22.0 tag 与 Release、M2-05/06、Dependabot | 须用户授权，不在候选排序内 | — |

KGAP-04 已按 D569 完成，不再列入。
