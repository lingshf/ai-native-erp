# 决定索引

D1 起的全部决定编号各占一行，列出它记录在仓库哪里（D562，KDOC-03）。本页只是索引：决定的原文与生效范围以“位置”列链接的记录为准，本页不复述、不改写。下一个可用编号只在[任务总表](tasks/README.md)当前 Sprint 的摘要行写一处，本页不写。

本页表体由 [`scripts/gen-decisions-index.mjs`](../scripts/gen-decisions-index.mjs) 生成（MCF-14），不要手改：在仓库根目录运行 `node scripts/gen-decisions-index.mjs` 重新生成（默认到有表行或条目的最大编号，也可在命令后加编号）；加 `--check` 只核对不写，与已提交内容不一致时退出码为 1。下文的分类、摘要与排序规则就是脚本的规则。新增决定的 PR 合并前应重新生成。

## 怎么读

| 类型 | 含义 | 摘要列 |
| --- | --- | --- |
| 表 | 在某张决定表里有以该编号开头的一行（路线图 §6、`reviews/M0.md`、各 Sprint 计划或评审的决定表，以及 Demo 运行记录表） | 取该行第一段文字，过长时截到第一个“；”或“。”，否则截断加“…” |
| 条目 | 没有表行，但有以加粗文字开头、加粗或其后括号里含该编号的列表项（多为回顾行动、流程规则、评审核对） | 不自动摘取，按位置阅读 |
| 提及 | 只在正文中被引用，没有专门的记录行 | 空；规则原文只写在正文里的编号（目前是 D20、D21），由脚本指定原文位置排在第一处并给出摘要 |
| 无 | 仓库内没有任何记录。多为协调者在会话中作出、未写入仓库的决定（如独占时段的逐次批准） | 空 |

- “位置”列按表行、条目的顺序列出最多 3 处，各类型都是 `design/` 先于 `docs/` 与 `CHANGELOG.md`，再按文件名与行号；“提及”类若有指定的原文位置则排第一，同一行多次引用只算一处；超过 3 处写总数。行号对应本页所在的提交，之后的改动可能使行号漂移，以文件内搜索编号为准（`git grep -n -w D123 -- design docs CHANGELOG.md`）。
- 同名但不是决定的编号已排除：[S12 计划](tasks/S12.md) 中 UI 文案任务的验收项 D1–D6，以及[任务总表](tasks/README.md)、[`docs/README.md`](../docs/README.md) 中 KDOC 缺口编号 D1–D5（重复项）。D11 及以下只认表行与条目，不收正文提及。
- 本页只由上文的生成脚本更新（KDOC-03 首次生成时脚本附在 PR 正文中，MCF-14 起入库）；记录新决定的 PR 重新运行脚本，不手工增删行。

## 主要决定表

- [路线图 §6](roadmap.md#6-决定记录)：D1–D3、D9、D10、D25、D26、D30、D51、D234、D338 共 11 条跨 Sprint 决定。
- [M0 评审](reviews/M0.md)：D1–D8 的落实情况。
- Sprint 计划的决定表：[S13](tasks/S13.md)–[S24](tasks/S24.md)（`design/tasks/S<n>.md`）。
- Sprint 评审中的决定表：[S5](reviews/S5.md)、[S8](reviews/S8.md)–[S12](reviews/S12.md)、[S15](reviews/S15.md)–[S19](reviews/S19.md)、[S22 评审](reviews/S22-review.md)。
- 流程规则（DoD、时段、评审计数等）多以“条目”形式写在[路线图 §4、§5](roadmap.md#5-团队流程)，并标注来源决定编号。

## 索引

| 编号 | 类型 | 摘要（仅表行） | 位置 |
| --- | --- | --- | --- |
| D1 | 表 | 一个总账模型，结账方式作为公司设置 | [design/reviews/M0.md:35](reviews/M0.md)；[design/roadmap.md:199](roadmap.md)；[design/roadmap.md:217](roadmap.md) |
| D2 | 表 | Dependabot | [design/reviews/M0.md:36](reviews/M0.md)；[design/roadmap.md:200](roadmap.md)；[design/roadmap.md:218](roadmap.md) |
| D3 | 表 | 4173 原账套不动 | [design/reviews/M0.md:37](reviews/M0.md)；[design/roadmap.md:201](roadmap.md)；[design/roadmap.md:219](roadmap.md) 等 4 处 |
| D4 | 表 | 存储与迁移版本 | [design/reviews/M0.md:38](reviews/M0.md) |
| D5 | 表 | 维度规则 | [design/reviews/M0.md:39](reviews/M0.md) |
| D6 | 表 | 凭证纠错 | [design/reviews/M0.md:40](reviews/M0.md) |
| D7 | 表 | 业务事件待转 | [design/reviews/M0.md:41](reviews/M0.md) |
| D8 | 表 | 报表水位：二元组 (`watermark`=凭证 `MAX(sequence)`, `accountRevision`=… | [design/reviews/M0.md:42](reviews/M0.md) |
| D9 | 表 | M0-R4 的 Windows `INVALID_SNAPSHOT` 无法复现时怎么结案（开发 5 在 main b0d… | [design/roadmap.md:202](roadmap.md) |
| D10 | 表 | M2 草案评审第三轮的两项分歧 | [design/roadmap.md:203](roadmap.md)；[docs/tradeoffs.md:39](../docs/tradeoffs.md)；[design/tasks/M2-04-legacy-reconciliation.md:18](tasks/M2-04-legacy-reconciliation.md) |
| D11 | 条目 |  | [design/reviews/S11.md:53](reviews/S11.md)；[design/reviews/S12.md:67](reviews/S12.md)；[design/reviews/S13.md:67](reviews/S13.md) 等 14 处 |
| D12 | 提及 | | [design/tasks/M0-R2-test-speedup.md:21](tasks/M0-R2-test-speedup.md) |
| D13 | 提及 | | [design/reviews/S4-retro.md:44](reviews/S4-retro.md)；[design/reviews/S4-retro.md:46](reviews/S4-retro.md)；[design/reviews/S4-retro.md:49](reviews/S4-retro.md) 等 17 处 |
| D14 | 无 | | |
| D15 | 提及 | | [design/reviews/M1.md:70](reviews/M1.md)；[design/reviews/M1.md:78](reviews/M1.md)；[design/reviews/M1.md:100](reviews/M1.md) 等 21 处 |
| D16 | 无 | | |
| D17 | 无 | | |
| D18 | 提及 | | [design/reviews/M1.md:46](reviews/M1.md)；[design/tasks/M1-R3-trade-report-capacity.md:14](tasks/M1-R3-trade-report-capacity.md)；[docs/performance/legacy-reconciliation-bench.md:46](../docs/performance/legacy-reconciliation-bench.md) 等 12 处 |
| D19 | 无 | | |
| D20 | 提及 | SemVer，tag 写作 `vX.Y.Z`，修复用 Z 位；“按里程碑划分 Sprint”已由 D555 取代（同页第 5 行） | [docs/release/README.md:3](../docs/release/README.md)；[design/tasks/PROC-01-release-claims-and-demo.md:10](tasks/PROC-01-release-claims-and-demo.md)；[docs/README.md:63](../docs/README.md) 等 6 处 |
| D21 | 提及 | tag 打在发布 PR 合并后的 squash 提交上 | [docs/release/README.md:3](../docs/release/README.md)；[design/reviews/S7.md:124](reviews/S7.md)；[design/tasks/PROC-01-release-claims-and-demo.md:10](tasks/PROC-01-release-claims-and-demo.md) 等 30 处 |
| D22 | 无 | | |
| D23 | 无 | | |
| D24 | 无 | | |
| D25 | 表 | 旧账 AP/AR 控制科目余额迁入后没有未结项，贸易子账与 GL 不一致（M1-R 提出） | [design/roadmap.md:204](roadmap.md)；[docs/tradeoffs.md:40](../docs/tradeoffs.md)；[design/tasks/M2-04-legacy-reconciliation.md:41](tasks/M2-04-legacy-reconciliation.md) 等 4 处 |
| D26 | 表 | M2-04 是否要等 M2-03b 才能交付 | [design/roadmap.md:205](roadmap.md)；[docs/tradeoffs.md:41](../docs/tradeoffs.md)；[design/tasks/M2-03b-legacy-opening-open-items.md:6](tasks/M2-03b-legacy-opening-open-items.md) 等 5 处 |
| D27 | 无 | | |
| D28 | 无 | | |
| D29 | 无 | | |
| D30 | 表 | M2-03b 规范与 M1 模型的六处冲突/空白（不新增迁移） | [design/roadmap.md:206](roadmap.md)；[design/tasks/M2-03b-legacy-opening-open-items.md:8](tasks/M2-03b-legacy-opening-open-items.md)；[design/tasks/M2-03b-legacy-opening-open-items.md:115](tasks/M2-03b-legacy-opening-open-items.md) 等 5 处 |
| D31 | 提及 | | [design/tasks/REFAC-31-business-event-compute-split.md:118](tasks/REFAC-31-business-event-compute-split.md) |
| D32 | 提及 | | [design/tasks/REFAC-31-business-event-compute-split.md:118](tasks/REFAC-31-business-event-compute-split.md) |
| D33 | 无 | | |
| D34 | 无 | | |
| D35 | 无 | | |
| D36 | 无 | | |
| D37 | 无 | | |
| D38 | 提及 | | [design/roadmap.md:77](roadmap.md)；[docs/release/v0.3.0-retrospective.md:18](../docs/release/v0.3.0-retrospective.md) |
| D39 | 无 | | |
| D40 | 无 | | |
| D41 | 无 | | |
| D42 | 无 | | |
| D43 | 无 | | |
| D44 | 无 | | |
| D45 | 无 | | |
| D46 | 无 | | |
| D47 | 无 | | |
| D48 | 无 | | |
| D49 | 无 | | |
| D50 | 无 | | |
| D51 | 表 | M1-R3 带核销/调整历史和并发后，账龄、余额和对账报表超出 D18 预算，是否允许新增迁移 | [design/roadmap.md:207](roadmap.md)；[design/roadmap.md:220](roadmap.md) |
| D52 | 无 | | |
| D53 | 无 | | |
| D54 | 无 | | |
| D55 | 无 | | |
| D56 | 无 | | |
| D57 | 无 | | |
| D58 | 无 | | |
| D59 | 无 | | |
| D60 | 无 | | |
| D61 | 无 | | |
| D62 | 无 | | |
| D63 | 无 | | |
| D64 | 无 | | |
| D65 | 无 | | |
| D66 | 提及 | | [CHANGELOG.md:623](../CHANGELOG.md)；[docs/release/v0.3.0-release-notes.md:3](../docs/release/v0.3.0-release-notes.md) |
| D67 | 无 | | |
| D68 | 无 | | |
| D69 | 无 | | |
| D70 | 无 | | |
| D71 | 无 | | |
| D72 | 无 | | |
| D73 | 无 | | |
| D74 | 无 | | |
| D75 | 无 | | |
| D76 | 无 | | |
| D77 | 提及 | | [design/reviews/S5.md:93](reviews/S5.md)；[design/tasks/S5-i-grid-table-component-rules.md:28](tasks/S5-i-grid-table-component-rules.md)；[design/tasks/UI-11b-s5g-leftover-button-checkbox.md:12](tasks/UI-11b-s5g-leftover-button-checkbox.md) |
| D78 | 无 | | |
| D79 | 提及 | | [design/reviews/S4.md:41](reviews/S4.md)；[CHANGELOG.md:611](../CHANGELOG.md)；[docs/release/v0.4.0-release-notes.md:51](../docs/release/v0.4.0-release-notes.md) |
| D80 | 无 | | |
| D81 | 无 | | |
| D82 | 无 | | |
| D83 | 无 | | |
| D84 | 无 | | |
| D85 | 无 | | |
| D86 | 无 | | |
| D87 | 无 | | |
| D88 | 无 | | |
| D89 | 无 | | |
| D90 | 条目 |  | [design/roadmap.md:133](roadmap.md) |
| D91 | 无 | | |
| D92 | 条目 |  | [design/roadmap.md:134](roadmap.md) |
| D93 | 无 | | |
| D94 | 无 | | |
| D95 | 无 | | |
| D96 | 无 | | |
| D97 | 无 | | |
| D98 | 无 | | |
| D99 | 无 | | |
| D100 | 无 | | |
| D101 | 无 | | |
| D102 | 提及 | | [CHANGELOG.md:585](../CHANGELOG.md)；[docs/release/v0.4.0-release-notes.md:3](../docs/release/v0.4.0-release-notes.md) |
| D103 | 无 | | |
| D104 | 无 | | |
| D105 | 无 | | |
| D106 | 无 | | |
| D107 | 无 | | |
| D108 | 无 | | |
| D109 | 无 | | |
| D110 | 提及 | | [design/tasks/S5-f-shell-components-global-rules.md:13](tasks/S5-f-shell-components-global-rules.md)；[design/tasks/S5-f-shell-components-global-rules.md:16](tasks/S5-f-shell-components-global-rules.md)；[design/tasks/S5-i-grid-table-component-rules.md:10](tasks/S5-i-grid-table-component-rules.md) 等 4 处 |
| D111 | 无 | | |
| D112 | 提及 | | [design/reviews/S5.md:24](reviews/S5.md)；[design/reviews/S5.md:66](reviews/S5.md)；[design/reviews/S5.md:75](reviews/S5.md) 等 9 处 |
| D113 | 无 | | |
| D114 | 无 | | |
| D115 | 条目 |  | [design/roadmap.md:139](roadmap.md) |
| D116 | 条目 |  | [design/tasks/S5-i-grid-table-component-rules.md:35](tasks/S5-i-grid-table-component-rules.md) |
| D117 | 无 | | |
| D118 | 条目 |  | [design/roadmap.md:139](roadmap.md) |
| D119 | 无 | | |
| D120 | 无 | | |
| D121 | 无 | | |
| D122 | 无 | | |
| D123 | 无 | | |
| D124 | 无 | | |
| D125 | 无 | | |
| D126 | 条目 |  | [design/roadmap.md:136](roadmap.md) |
| D127 | 无 | | |
| D128 | 无 | | |
| D129 | 无 | | |
| D130 | 无 | | |
| D131 | 表 | 改为 D133；S5 累计 CSS gzip +413 B | [design/reviews/S5.md:50](reviews/S5.md)；[design/roadmap.md:80](roadmap.md) |
| D132 | 无 | | |
| D133 | 条目 |  | [design/roadmap.md:80](roadmap.md) |
| D134 | 无 | | |
| D135 | 无 | | |
| D136 | 提及 | | [docs/release/v0.5.0-release-notes.md:37](../docs/release/v0.5.0-release-notes.md) |
| D137 | 无 | | |
| D138 | 无 | | |
| D139 | 无 | | |
| D140 | 提及 | | [design/reviews/S5.md:88](reviews/S5.md)；[design/reviews/S5.md:162](reviews/S5.md)；[design/tasks/README.md:342](tasks/README.md) |
| D141 | 无 | | |
| D142 | 无 | | |
| D143 | 无 | | |
| D144 | 无 | | |
| D145 | 无 | | |
| D146 | 提及 | | [docs/performance/e2e-01-concurrent-e2e.md:112](../docs/performance/e2e-01-concurrent-e2e.md) |
| D147 | 无 | | |
| D148 | 无 | | |
| D149 | 无 | | |
| D150 | 提及 | | [docs/performance/e2e-01-concurrent-e2e.md:54](../docs/performance/e2e-01-concurrent-e2e.md)；[docs/performance/e2e-01-concurrent-e2e.md:72](../docs/performance/e2e-01-concurrent-e2e.md)；[docs/performance/e2e-01-concurrent-e2e.md:105](../docs/performance/e2e-01-concurrent-e2e.md) 等 4 处 |
| D151 | 无 | | |
| D152 | 无 | | |
| D153 | 无 | | |
| D154 | 无 | | |
| D155 | 无 | | |
| D156 | 无 | | |
| D157 | 无 | | |
| D158 | 无 | | |
| D159 | 无 | | |
| D160 | 无 | | |
| D161 | 无 | | |
| D162 | 无 | | |
| D163 | 无 | | |
| D164 | 无 | | |
| D165 | 无 | | |
| D166 | 无 | | |
| D167 | 无 | | |
| D168 | 提及 | | [docs/performance/e2e-01-concurrent-e2e.md:115](../docs/performance/e2e-01-concurrent-e2e.md) |
| D169 | 无 | | |
| D170 | 提及 | | [docs/performance/e2e-01-concurrent-e2e.md:66](../docs/performance/e2e-01-concurrent-e2e.md) |
| D171 | 无 | | |
| D172 | 提及 | | [docs/performance/e2e-01-concurrent-e2e.md:115](../docs/performance/e2e-01-concurrent-e2e.md) |
| D173 | 无 | | |
| D174 | 无 | | |
| D175 | 无 | | |
| D176 | 无 | | |
| D177 | 无 | | |
| D178 | 无 | | |
| D179 | 无 | | |
| D180 | 无 | | |
| D181 | 无 | | |
| D182 | 无 | | |
| D183 | 无 | | |
| D184 | 无 | | |
| D185 | 无 | | |
| D186 | 无 | | |
| D187 | 无 | | |
| D188 | 无 | | |
| D189 | 提及 | | [design/tasks/FLAKE-05-legacy-cli-tests-under-full-load.md:8](tasks/FLAKE-05-legacy-cli-tests-under-full-load.md)；[design/tasks/README.md:359](tasks/README.md) |
| D190 | 无 | | |
| D191 | 无 | | |
| D192 | 无 | | |
| D193 | 无 | | |
| D194 | 提及 | | [design/tasks/FLAKE-05-legacy-cli-tests-under-full-load.md:20](tasks/FLAKE-05-legacy-cli-tests-under-full-load.md)；[design/tasks/FLAKE-05-legacy-cli-tests-under-full-load.md:30](tasks/FLAKE-05-legacy-cli-tests-under-full-load.md)；[design/tasks/FLAKE-05-legacy-cli-tests-under-full-load.md:32](tasks/FLAKE-05-legacy-cli-tests-under-full-load.md) |
| D195 | 无 | | |
| D196 | 无 | | |
| D197 | 无 | | |
| D198 | 无 | | |
| D199 | 条目 |  | [design/tasks/CI-01-shard-weight-guard-and-wallclock.md:12](tasks/CI-01-shard-weight-guard-and-wallclock.md)；[design/tasks/CI-01-shard-weight-guard-and-wallclock.md:33](tasks/CI-01-shard-weight-guard-and-wallclock.md)；[docs/release/v0.6.0-release-notes.md:41](../docs/release/v0.6.0-release-notes.md) 等 4 处 |
| D200 | 无 | | |
| D201 | 无 | | |
| D202 | 无 | | |
| D203 | 无 | | |
| D204 | 条目 |  | [design/tasks/CI-01-shard-weight-guard-and-wallclock.md:10](tasks/CI-01-shard-weight-guard-and-wallclock.md)；[design/tasks/CI-01-shard-weight-guard-and-wallclock.md:27](tasks/CI-01-shard-weight-guard-and-wallclock.md) |
| D205 | 无 | | |
| D206 | 无 | | |
| D207 | 提及 | | [docs/demo/v0.6.0/run-through.md:6](../docs/demo/v0.6.0/run-through.md)；[docs/release/v0.6.0-retro.md:10](../docs/release/v0.6.0-retro.md)；[docs/release/v0.6.0-sprint-review.md:57](../docs/release/v0.6.0-sprint-review.md) |
| D208 | 提及 | | [docs/demo/v0.6.0/run-through.md:33](../docs/demo/v0.6.0/run-through.md)；[docs/demo/v0.7.0/run-through.md:43](../docs/demo/v0.7.0/run-through.md) |
| D209 | 无 | | |
| D210 | 无 | | |
| D211 | 无 | | |
| D212 | 无 | | |
| D213 | 无 | | |
| D214 | 无 | | |
| D215 | 无 | | |
| D216 | 提及 | | [design/reviews/S7-retro.md:16](reviews/S7-retro.md)；[design/reviews/S7-retro.md:19](reviews/S7-retro.md)；[design/reviews/S7-retro.md:22](reviews/S7-retro.md) |
| D217 | 提及 | | [design/reviews/S7-retro.md:19](reviews/S7-retro.md)；[design/reviews/S7-retro.md:24](reviews/S7-retro.md)；[design/reviews/S7-retro.md:28](reviews/S7-retro.md) 等 9 处 |
| D218 | 无 | | |
| D219 | 无 | | |
| D220 | 无 | | |
| D221 | 无 | | |
| D222 | 无 | | |
| D223 | 无 | | |
| D224 | 无 | | |
| D225 | 无 | | |
| D226 | 无 | | |
| D227 | 提及 | | [design/reviews/S7-retro.md:33](reviews/S7-retro.md)；[design/reviews/S7.md:79](reviews/S7.md)；[design/tasks/PROC-04-demo-stub-write-scripts-and-dry-run.md:13](tasks/PROC-04-demo-stub-write-scripts-and-dry-run.md) 等 5 处 |
| D228 | 提及 | | [design/reviews/S7-retro.md:33](reviews/S7-retro.md)；[design/reviews/S7-retro.md:38](reviews/S7-retro.md)；[design/reviews/S7-retro.md:42](reviews/S7-retro.md) 等 8 处 |
| D229 | 提及 | | [design/reviews/S7.md:95](reviews/S7.md)；[docs/demo/v0.7.0/run-through.md:3](../docs/demo/v0.7.0/run-through.md)；[docs/demo/v0.7.0/run-through.md:5](../docs/demo/v0.7.0/run-through.md) 等 4 处 |
| D230 | 提及 | | [design/reviews/S7-retro.md:39](reviews/S7-retro.md)；[design/reviews/S7-retro.md:74](reviews/S7-retro.md)；[design/reviews/S7.md:97](reviews/S7.md) 等 6 处 |
| D231 | 无 | | |
| D232 | 无 | | |
| D233 | 提及 | | [design/reviews/S8.md:77](reviews/S8.md)；[design/reviews/S9.md:92](reviews/S9.md) |
| D234 | 表 | S7 回顾行动项如何采纳 | [design/roadmap.md:208](roadmap.md)；[design/roadmap.md:140](roadmap.md)；[design/roadmap.md:145](roadmap.md) |
| D235 | 无 | | |
| D236 | 无 | | |
| D237 | 无 | | |
| D238 | 无 | | |
| D239 | 无 | | |
| D240 | 无 | | |
| D241 | 无 | | |
| D242 | 表 | TINV-01 | [design/reviews/S8.md:86](reviews/S8.md) |
| D243 | 提及 | | [design/reviews/S8.md:30](reviews/S8.md)；[design/tasks/README.md:461](tasks/README.md) |
| D244 | 条目 |  | [design/reviews/S8.md:50](reviews/S8.md) |
| D245 | 提及 | | [design/reviews/S8.md:30](reviews/S8.md) |
| D246 | 无 | | |
| D247 | 表 | TINV-02 | [design/reviews/S8.md:87](reviews/S8.md) |
| D248 | 表 | TINV-02 | [design/reviews/S8.md:88](reviews/S8.md) |
| D249 | 提及 | | [design/reviews/S8-retro.md:29](reviews/S8-retro.md)；[design/reviews/S8.md:31](reviews/S8.md)；[design/tasks/README.md:462](tasks/README.md) |
| D250 | 条目 |  | [design/reviews/S8.md:52](reviews/S8.md) |
| D251 | 无 | | |
| D252 | 无 | | |
| D253 | 提及 | | [design/reviews/S8-retro.md:30](reviews/S8-retro.md)；[design/reviews/S8-retro.md:67](reviews/S8-retro.md)；[design/reviews/S8.md:61](reviews/S8.md) 等 5 处 |
| D254 | 表 | Demo | [design/reviews/S8.md:89](reviews/S8.md)；[docs/demo/v0.8.0/run-through.md:68](../docs/demo/v0.8.0/run-through.md) |
| D255 | 表 | Demo | [design/reviews/S8.md:90](reviews/S8.md)；[docs/demo/v0.8.0/run-through.md:69](../docs/demo/v0.8.0/run-through.md) |
| D256 | 表 | Demo | [design/reviews/S8.md:91](reviews/S8.md)；[docs/demo/v0.8.0/run-through.md:70](../docs/demo/v0.8.0/run-through.md) |
| D257 | 表 | `cc2aae8` | [docs/demo/v0.8.0/run-through.md:71](../docs/demo/v0.8.0/run-through.md) |
| D258 | 条目 |  | [design/roadmap.md:173](roadmap.md)；[design/roadmap.md:184](roadmap.md) |
| D259 | 提及 | | [design/reviews/S8.md:9](reviews/S8.md) |
| D260 | 无 | | |
| D261 | 无 | | |
| D262 | 无 | | |
| D263 | 条目 |  | [design/tasks/README.md:537](tasks/README.md)；[design/tasks/S10.md:17](tasks/S10.md)；[design/tasks/S11.md:19](tasks/S11.md) |
| D264 | 条目 |  | [design/tasks/TINV-04-invoice-list-source-order.md:36](tasks/TINV-04-invoice-list-source-order.md) |
| D265 | 无 | | |
| D266 | 条目 |  | [design/reviews/S9.md:59](reviews/S9.md) |
| D267 | 表 | TINV-03 | [design/reviews/S9.md:115](reviews/S9.md) |
| D268 | 提及 | | [design/reviews/S9.md:34](reviews/S9.md)；[design/reviews/S9.md:111](reviews/S9.md)；[design/tasks/README.md:509](tasks/README.md) |
| D269 | 条目 |  | [design/reviews/S9.md:55](reviews/S9.md) |
| D270 | 条目 |  | [design/reviews/S9.md:56](reviews/S9.md) |
| D271 | 无 | | |
| D272 | 提及 | | [design/reviews/S9-retro.md:21](reviews/S9-retro.md) |
| D273 | 无 | | |
| D274 | 提及 | | [design/reviews/S9-retro.md:21](reviews/S9-retro.md) |
| D275 | 条目 |  | [design/reviews/S9.md:57](reviews/S9.md)；[design/tasks/S16.md:19](tasks/S16.md)；[design/tasks/S17.md:19](tasks/S17.md) 等 6 处 |
| D276 | 条目 |  | [design/reviews/S9.md:58](reviews/S9.md) |
| D277 | 提及 | | [design/reviews/S9.md:111](reviews/S9.md) |
| D278 | 无 | | |
| D279 | 无 | | |
| D280 | 条目 |  | [design/tasks/GATE-01-minimal-resident-gate.md:72](tasks/GATE-01-minimal-resident-gate.md)；[CHANGELOG.md:422](../CHANGELOG.md) |
| D281 | 无 | | |
| D282 | 条目 |  | [design/tasks/GATE-01-minimal-resident-gate.md:72](tasks/GATE-01-minimal-resident-gate.md)；[CHANGELOG.md:422](../CHANGELOG.md) |
| D283 | 提及 | | [design/reviews/S9.md:43](reviews/S9.md)；[design/reviews/S9.md:111](reviews/S9.md) |
| D284 | 条目 |  | [design/reviews/S9.md:60](reviews/S9.md) |
| D285 | 表 | TINV-04 | [design/reviews/S9.md:116](reviews/S9.md) |
| D286 | 无 | | |
| D287 | 条目 |  | [design/reviews/S9.md:61](reviews/S9.md) |
| D288 | 表 | TINV-04 | [design/reviews/S9.md:117](reviews/S9.md) |
| D289 | 提及 | | [design/reviews/S9-retro.md:32](reviews/S9-retro.md)；[design/reviews/S9.md:35](reviews/S9.md) |
| D290 | 提及 | | [design/reviews/S10-retro.md:69](reviews/S10-retro.md)；[design/reviews/S9-retro.md:82](reviews/S9-retro.md)；[design/roadmap.md:175](roadmap.md) 等 5 处 |
| D291 | 表 | TINV-04 | [design/reviews/S9.md:118](reviews/S9.md) |
| D292 | 表 | TINV-04 | [design/reviews/S9.md:119](reviews/S9.md) |
| D293 | 提及 | | [design/reviews/S9-retro.md:12](reviews/S9-retro.md)；[design/reviews/S9-retro.md:33](reviews/S9-retro.md)；[design/reviews/S9.md:35](reviews/S9.md) 等 4 处 |
| D294 | 提及 | | [design/reviews/S9-retro.md:12](reviews/S9-retro.md)；[design/reviews/S9.md:35](reviews/S9.md)；[design/reviews/S9.md:111](reviews/S9.md) 等 5 处 |
| D295 | 条目 |  | [design/reviews/S9.md:62](reviews/S9.md) |
| D296 | 无 | | |
| D297 | 无 | | |
| D298 | 表 | Demo | [design/reviews/S9.md:120](reviews/S9.md)；[docs/demo/v0.9.0/run-through.md:19](../docs/demo/v0.9.0/run-through.md) |
| D299 | 表 | Demo | [design/reviews/S9.md:121](reviews/S9.md)；[docs/demo/v0.9.0/run-through.md:20](../docs/demo/v0.9.0/run-through.md) |
| D300 | 表 | 22:00:46–22:02:48 | [docs/demo/v0.9.0/run-through.md:21](../docs/demo/v0.9.0/run-through.md) |
| D301 | 无 | | |
| D302 | 提及 | | [design/reviews/S10.md:28](reviews/S10.md)；[design/reviews/S9-retro.md:74](reviews/S9-retro.md)；[design/reviews/S9.md:9](reviews/S9.md) 等 15 处 |
| D303 | 无 | | |
| D304 | 无 | | |
| D305 | 提及 | | [design/reviews/S10.md:93](reviews/S10.md)；[design/tasks/README.md:568](tasks/README.md)；[design/tasks/S10.md:5](tasks/S10.md) 等 4 处 |
| D306 | 无 | | |
| D307 | 条目 |  | [design/reviews/S10.md:58](reviews/S10.md) |
| D308 | 表 | （slot-1） | [design/reviews/S10.md:113](reviews/S10.md) |
| D309 | 无 | | |
| D310 | 表 | （slot-2） | [design/reviews/S10.md:114](reviews/S10.md) |
| D311 | 提及 | | [design/reviews/S10-retro.md:44](reviews/S10-retro.md)；[design/reviews/S10-retro.md:47](reviews/S10-retro.md)；[design/reviews/S10-retro.md:53](reviews/S10-retro.md) 等 8 处 |
| D312 | 表 | （slot-3） | [design/reviews/S10.md:115](reviews/S10.md)；[design/reviews/S10-retro.md:46](reviews/S10-retro.md)；[design/reviews/S10.md:60](reviews/S10.md) |
| D313 | 无 | | |
| D314 | 提及 | | [design/reviews/S10-retro.md:15](reviews/S10-retro.md)；[design/reviews/S10-retro.md:49](reviews/S10-retro.md)；[design/reviews/S10-retro.md:53](reviews/S10-retro.md) 等 6 处 |
| D315 | 提及 | | [design/reviews/S10-retro.md:49](reviews/S10-retro.md)；[design/reviews/S10-retro.md:50](reviews/S10-retro.md)；[design/reviews/S10-retro.md:55](reviews/S10-retro.md) 等 8 处 |
| D316 | 提及 | | [design/reviews/S10-retro.md:49](reviews/S10-retro.md)；[design/reviews/S10-retro.md:53](reviews/S10-retro.md)；[design/reviews/S10-retro.md:87](reviews/S10-retro.md) 等 14 处 |
| D317 | 表 | （slot-4） | [design/reviews/S10.md:116](reviews/S10.md) |
| D318 | 条目 |  | [design/reviews/S10.md:61](reviews/S10.md) |
| D319 | 表 | （slot-5） | [design/reviews/S10.md:117](reviews/S10.md) |
| D320 | 条目 |  | [design/reviews/S10.md:62](reviews/S10.md) |
| D321 | 表 | （slot-1） | [design/reviews/S10.md:118](reviews/S10.md) |
| D322 | 表 | （slot-2） | [design/reviews/S10.md:119](reviews/S10.md) |
| D323 | 表 | （slot-3） | [design/reviews/S10.md:120](reviews/S10.md)；[design/reviews/S10.md:59](reviews/S10.md) |
| D324 | 表 | CSS-02 | [design/reviews/S10.md:121](reviews/S10.md) |
| D325 | 条目 |  | [design/reviews/S10.md:63](reviews/S10.md) |
| D326 | 无 | | |
| D327 | 条目 |  | [design/reviews/S10.md:64](reviews/S10.md) |
| D328 | 条目 |  | [design/reviews/S10.md:64](reviews/S10.md) |
| D329 | 无 | | |
| D330 | 表 | / D332 / D333 | [design/reviews/S10.md:122](reviews/S10.md) |
| D331 | 提及 | | [docs/demo/v0.10.0/run-through.md:29](../docs/demo/v0.10.0/run-through.md)；[docs/demo/v0.10.0/run-through.md:63](../docs/demo/v0.10.0/run-through.md) |
| D332 | 提及 | | [design/reviews/S10-retro.md:21](reviews/S10-retro.md)；[design/reviews/S10-retro.md:24](reviews/S10-retro.md)；[design/reviews/S10-retro.md:71](reviews/S10-retro.md) 等 10 处 |
| D333 | 提及 | | [design/reviews/S10-retro.md:22](reviews/S10-retro.md)；[design/reviews/S10-retro.md:23](reviews/S10-retro.md)；[design/reviews/S10-retro.md:71](reviews/S10-retro.md) 等 9 处 |
| D334 | 提及 | | [design/reviews/S10-retro.md:81](reviews/S10-retro.md)；[design/tasks/PROC-08-s10-retro-actions.md:17](tasks/PROC-08-s10-retro-actions.md)；[design/tasks/PROC-08-s10-retro-actions.md:26](tasks/PROC-08-s10-retro-actions.md) 等 4 处 |
| D335 | 提及 | | [design/reviews/S10.md:5](reviews/S10.md)；[CHANGELOG.md:326](../CHANGELOG.md)；[CHANGELOG.md:362](../CHANGELOG.md) 等 5 处 |
| D336 | 提及 | | [design/reviews/S10.md:5](reviews/S10.md)；[design/tasks/README.md:585](tasks/README.md)；[design/tasks/S11.md:6](tasks/S11.md) |
| D337 | 无 | | |
| D338 | 表 | S10 回顾行动项如何采纳；S11 第三个开发名额与版本号 | [design/roadmap.md:209](roadmap.md)；[design/roadmap.md:147](roadmap.md)；[design/roadmap.md:187](roadmap.md) 等 5 处 |
| D339 | 提及 | | [design/reviews/S10-retro.md:6](reviews/S10-retro.md)；[design/reviews/S10.md:6](reviews/S10.md)；[design/reviews/S11.md:31](reviews/S11.md) 等 11 处 |
| D340 | 条目 |  | [design/tasks/WEIGHT-01-shard-weight-calibration.md:12](tasks/WEIGHT-01-shard-weight-calibration.md) |
| D341 | 条目 |  | [design/tasks/WEIGHT-01-shard-weight-calibration.md:22](tasks/WEIGHT-01-shard-weight-calibration.md) |
| D342 | 无 | | |
| D343 | 条目 |  | [design/reviews/S11.md:64](reviews/S11.md) |
| D344 | 条目 |  | [design/reviews/S11.md:64](reviews/S11.md) |
| D345 | 表 | （slot-1） | [design/reviews/S11.md:132](reviews/S11.md) |
| D346 | 无 | | |
| D347 | 条目 |  | [design/reviews/S11.md:66](reviews/S11.md) |
| D348 | 表 | （slot-2） | [design/reviews/S11.md:133](reviews/S11.md)；[design/reviews/S11.md:65](reviews/S11.md) |
| D349 | 表 | TINV-06 | [design/reviews/S11.md:134](reviews/S11.md) |
| D350 | 条目 |  | [design/reviews/S11.md:67](reviews/S11.md) |
| D351 | 表 | / D355 | [design/reviews/S11.md:137](reviews/S11.md) |
| D352 | 无 | | |
| D353 | 表 | TINV-06 | [design/reviews/S11.md:135](reviews/S11.md) |
| D354 | 条目 |  | [design/reviews/S11.md:66](reviews/S11.md) |
| D355 | 无 | | |
| D356 | 无 | | |
| D357 | 无 | | |
| D358 | 条目 |  | [design/reviews/S11.md:67](reviews/S11.md) |
| D359 | 表 | TINV-06 | [design/reviews/S11.md:136](reviews/S11.md)；[design/reviews/S11.md:67](reviews/S11.md) |
| D360 | 无 | | |
| D361 | 无 | | |
| D362 | 条目 |  | [design/reviews/S11.md:68](reviews/S11.md) |
| D363 | 条目 |  | [design/reviews/S11.md:68](reviews/S11.md) |
| D364 | 条目 |  | [design/reviews/S11.md:69](reviews/S11.md) |
| D365 | 无 | | |
| D366 | 条目 |  | [design/reviews/S11.md:70](reviews/S11.md) |
| D367 | 条目 |  | [design/reviews/S11.md:70](reviews/S11.md) |
| D368 | 提及 | | [design/tasks/README.md:604](tasks/README.md)；[design/tasks/S12.md:3](tasks/S12.md)；[design/tasks/S12.md:19](tasks/S12.md) |
| D369 | 条目 |  | [design/tasks/S12.md:7](tasks/S12.md)；[design/tasks/S12.md:8](tasks/S12.md) |
| D370 | 提及 | | [design/reviews/S11.md:110](reviews/S11.md)；[design/reviews/S12.md:26](reviews/S12.md)；[design/tasks/README.md:604](tasks/README.md) 等 9 处 |
| D371 | 提及 | | [design/reviews/S11.md:111](reviews/S11.md)；[design/reviews/S12.md:14](reviews/S12.md)；[design/reviews/S12.md:27](reviews/S12.md) 等 8 处 |
| D372 | 提及 | | [docs/demo/v0.11.0/run-through.md:60](../docs/demo/v0.11.0/run-through.md)；[docs/demo/v0.11.0/run-through.md:76](../docs/demo/v0.11.0/run-through.md)；[docs/demo/v0.11.0/run-through.md:90](../docs/demo/v0.11.0/run-through.md) |
| D373 | 条目 |  | [design/reviews/S11.md:71](reviews/S11.md)；[docs/demo/v0.11.0/run-through.md:73](../docs/demo/v0.11.0/run-through.md) |
| D374 | 无 | | |
| D375 | 条目 |  | [design/tasks/S12.md:205](tasks/S12.md)；[design/tasks/S12.md:230](tasks/S12.md)；[design/tasks/S12.md:262](tasks/S12.md) |
| D376 | 提及 | | [docs/demo/v0.11.0/README.md:39](../docs/demo/v0.11.0/README.md) |
| D377 | 条目 |  | [design/tasks/S12.md:10](tasks/S12.md)；[design/tasks/S12.md:230](tasks/S12.md)；[design/tasks/S12.md:262](tasks/S12.md) |
| D378 | 提及 | | [design/reviews/S12.md:29](reviews/S12.md)；[design/reviews/S12.md:45](reviews/S12.md)；[design/tasks/S12.md:3](tasks/S12.md) 等 4 处 |
| D379 | 无 | | |
| D380 | 提及 | | [docs/demo/v0.11.0/README.md:39](../docs/demo/v0.11.0/README.md) |
| D381 | 表 | TORD-06 B8 | [design/reviews/S12.md:156](reviews/S12.md)；[design/reviews/S12.md:75](reviews/S12.md) |
| D382 | 表 | Demo | [design/reviews/S11.md:141](reviews/S11.md) |
| D383 | 提及 | | [docs/demo/v0.11.0/run-through.md:40](../docs/demo/v0.11.0/run-through.md) |
| D384 | 条目 |  | [design/tasks/S12.md:11](tasks/S12.md)；[design/tasks/S12.md:262](tasks/S12.md) |
| D385 | 表 | TINV-07 A7 | [design/reviews/S12.md:157](reviews/S12.md)；[design/reviews/S12.md:74](reviews/S12.md)；[design/tasks/S12.md:423](tasks/S12.md) |
| D386 | 表 | TINV-07 A7 | [design/reviews/S12.md:158](reviews/S12.md)；[design/reviews/S11-retro.md:39](reviews/S11-retro.md)；[design/reviews/S12.md:74](reviews/S12.md) |
| D387 | 表 | Demo | [design/reviews/S11.md:142](reviews/S11.md)；[design/tasks/S12.md:466](tasks/S12.md) |
| D388 | 提及 | | [design/reviews/S11-retro.md:87](reviews/S11-retro.md)；[design/reviews/S11-retro.md:114](reviews/S11-retro.md)；[design/reviews/S11.md:112](reviews/S11.md) 等 8 处 |
| D389 | 无 | | |
| D390 | 表 | TINV-07 A7 | [design/reviews/S12.md:159](reviews/S12.md)；[design/reviews/S12.md:74](reviews/S12.md) |
| D391 | 无 | | |
| D392 | 表 | Demo | [design/reviews/S11.md:143](reviews/S11.md) |
| D393 | 无 | | |
| D394 | 无 | | |
| D395 | 表 | Demo | [design/reviews/S11.md:144](reviews/S11.md) |
| D396 | 表 | TORD-06 B8 | [design/reviews/S12.md:160](reviews/S12.md)；[design/reviews/S12.md:75](reviews/S12.md) |
| D397 | 无 | | |
| D398 | 提及 | | [design/reviews/S11.md:6](reviews/S11.md)；[design/reviews/S11.md:108](reviews/S11.md)；[design/reviews/S12.md:43](reviews/S12.md) 等 12 处 |
| D399 | 表 | TINV-07 A7 | [design/reviews/S12.md:161](reviews/S12.md)；[design/reviews/S12.md:74](reviews/S12.md) |
| D400 | 条目 |  | [design/roadmap.md:146](roadmap.md)；[design/roadmap.md:176](roadmap.md) |
| D401 | 条目 |  | [design/reviews/S12.md:76](reviews/S12.md) |
| D402 | 表 | REFAC-01 F4 | [design/reviews/S12.md:162](reviews/S12.md)；[design/reviews/S12.md:77](reviews/S12.md) |
| D403 | 条目 |  | [design/reviews/S12.md:77](reviews/S12.md) |
| D404 | 条目 |  | [design/reviews/S12.md:77](reviews/S12.md) |
| D405 | 表 | REFAC-01 F4 | [design/reviews/S12.md:163](reviews/S12.md)；[design/reviews/S12.md:77](reviews/S12.md) |
| D406 | 条目 |  | [design/reviews/S12.md:78](reviews/S12.md)；[design/tasks/S12.md:14](tasks/S12.md) |
| D407 | 条目 |  | [design/reviews/S12.md:79](reviews/S12.md)；[design/tasks/S12.md:15](tasks/S12.md)；[design/tasks/S12.md:430](tasks/S12.md) |
| D408 | 条目 |  | [design/reviews/S12.md:79](reviews/S12.md)；[design/tasks/S12.md:365](tasks/S12.md)；[design/tasks/S12.md:430](tasks/S12.md) 等 5 处 |
| D409 | 条目 |  | [design/reviews/S12.md:78](reviews/S12.md)；[design/reviews/S12.md:100](reviews/S12.md)；[docs/demo/v0.12.0/README.md:43](../docs/demo/v0.12.0/README.md) |
| D410 | 无 | | |
| D411 | 条目 |  | [design/reviews/S12.md:79](reviews/S12.md) |
| D412 | 条目 |  | [design/reviews/S12.md:79](reviews/S12.md) |
| D413 | 表 | （R2） | [design/reviews/S12.md:166](reviews/S12.md)；[design/reviews/S12.md:79](reviews/S12.md) |
| D414 | 条目 |  | [design/reviews/S12.md:80](reviews/S12.md) |
| D415 | 提及 | | [CHANGELOG.md:283](../CHANGELOG.md) |
| D416 | 提及 | | [design/roadmap.md:56](roadmap.md)；[design/tasks/README.md:624](tasks/README.md)；[design/tasks/README.md:626](tasks/README.md) 等 4 处 |
| D417 | 条目 |  | [design/tasks/S13.md:7](tasks/S13.md) |
| D418 | 条目 |  | [design/tasks/S13.md:8](tasks/S13.md) |
| D419 | 条目 |  | [design/tasks/S13.md:9](tasks/S13.md)；[CHANGELOG.md:262](../CHANGELOG.md) |
| D420 | 条目 |  | [design/reviews/S13.md:73](reviews/S13.md) |
| D421 | 条目 |  | [design/reviews/S13.md:73](reviews/S13.md)；[design/tasks/S13.md:246](tasks/S13.md) |
| D422 | 无 | | |
| D423 | 条目 |  | [design/reviews/S13.md:74](reviews/S13.md) |
| D424 | 条目 |  | [design/reviews/S13.md:78](reviews/S13.md) |
| D425 | 条目 |  | [design/reviews/S13.md:74](reviews/S13.md) |
| D426 | 提及 | | [design/reviews/S12-retro.md:28](reviews/S12-retro.md)；[design/reviews/S12.md:119](reviews/S12.md)；[docs/demo/v0.12.0/README.md:25](../docs/demo/v0.12.0/README.md) 等 4 处 |
| D427 | 条目 |  | [design/reviews/S13.md:74](reviews/S13.md) |
| D428 | 条目 |  | [design/reviews/S13.md:78](reviews/S13.md) |
| D429 | 条目 |  | [design/reviews/S13.md:74](reviews/S13.md) |
| D430 | 条目 |  | [design/reviews/S13.md:83](reviews/S13.md)；[CHANGELOG.md:257](../CHANGELOG.md) |
| D431 | 提及 | | [design/reviews/S13.md:30](reviews/S13.md)；[design/tasks/README.md:635](tasks/README.md)；[design/tasks/S13.md:3](tasks/S13.md) 等 5 处 |
| D432 | 条目 |  | [design/reviews/S13.md:79](reviews/S13.md)；[design/tasks/REFAC-03b-company-journals-split.md:161](tasks/REFAC-03b-company-journals-split.md)；[design/tasks/REFAC-05b-order-workspace-split.md:115](tasks/REFAC-05b-order-workspace-split.md) 等 14 处 |
| D433 | 条目 |  | [design/reviews/S13.md:79](reviews/S13.md)；[design/tasks/S13.md:316](tasks/S13.md) |
| D434 | 条目 |  | [design/reviews/S13.md:83](reviews/S13.md)；[design/tasks/README.md:642](tasks/README.md)；[design/tasks/S13.md:41](tasks/S13.md) 等 4 处 |
| D435 | 条目 |  | [design/reviews/S13.md:79](reviews/S13.md) |
| D436 | 条目 |  | [design/reviews/S13.md:87](reviews/S13.md)；[CHANGELOG.md:264](../CHANGELOG.md) |
| D437 | 条目 |  | [design/reviews/S12-retro.md:60](reviews/S12-retro.md)；[design/reviews/S13.md:83](reviews/S13.md) |
| D438 | 条目 |  | [design/reviews/S13.md:88](reviews/S13.md)；[design/tasks/README.md:641](tasks/README.md)；[design/tasks/S13.md:40](tasks/S13.md) 等 4 处 |
| D439 | 表 | REFAC-03b 的 P7 路由预算放宽：五个路由（凭证、业务事件、总账报表、期末结账、贸易报表）按同一口径（屏蔽哈希… | [design/tasks/S13.md:384](tasks/S13.md)；[design/reviews/S12-retro.md:61](reviews/S12-retro.md)；[design/reviews/S13.md:88](reviews/S13.md) 等 4 处 |
| D440 | 表 | DEMO-12 再给一次时段，不降级。“卡片标题与筛选栏间距 16 px”断言改为只记录实测值 | [design/tasks/S13.md:385](tasks/S13.md)；[design/reviews/S12.md:81](reviews/S12.md) |
| D441 | 表 | 上一次失败（准入徽标的正则把可访问名称中的 “trade” 当成原始键）按脚本问题处理，再给一次时段，排在 REFAC-… | [design/tasks/S13.md:386](tasks/S13.md)；[design/reviews/S12.md:81](reviews/S12.md) |
| D442 | 表 | 浏览器时段独占：本地 node / npm / vitest 只能在自己的修订轮次内运行 | [design/tasks/S13.md:387](tasks/S13.md)；[design/roadmap.md:141](roadmap.md)；[design/tasks/S14.md:43](tasks/S14.md) 等 13 处 |
| D443 | 表 | M2-05b 例外（方案 A）：允许新增 `packages/infra/test/legacy-opening-bat`… | [design/tasks/S13.md:388](tasks/S13.md)；[design/reviews/S12-retro.md:62](reviews/S12-retro.md)；[design/reviews/S13.md:89](reviews/S13.md) |
| D444 | 条目 |  | [design/reviews/S12.md:81](reviews/S12.md)；[design/roadmap.md:144](roadmap.md)；[design/tasks/S15.md:48](tasks/S15.md) 等 12 处 |
| D445 | 条目 |  | [design/tasks/README.md:622](tasks/README.md) |
| D446 | 条目 |  | [design/reviews/S12.md:81](reviews/S12.md)；[design/reviews/S13.md:90](reviews/S13.md) |
| D447 | 提及 | | [design/tasks/README.md:648](tasks/README.md)；[design/tasks/S14.md:3](tasks/S14.md) |
| D448 | 条目 |  | [design/reviews/S13.md:90](reviews/S13.md) |
| D449 | 条目 |  | [design/reviews/S13.md:90](reviews/S13.md) |
| D450 | 条目 |  | [design/reviews/S13.md:90](reviews/S13.md) |
| D451 | 表 | 认可 S12 回顾的 7 条行动项 | [design/tasks/S14.md:383](tasks/S14.md)；[design/reviews/S14.md:18](reviews/S14.md)；[design/reviews/S14.md:60](reviews/S14.md) 等 10 处 |
| D452 | 表 | 适用于 S14 各 REFAC 任务（REFAC-04 Q4a 及 REFAC-05、REFAC-06 的首屏条款）：首… | [design/tasks/S14.md:384](tasks/S14.md)；[design/reviews/S14.md:67](reviews/S14.md) |
| D453 | 表 | REFAC-04 修正 CSS 顺序的例外：① L2 只放宽一处：`journals/virtual-rows.tsx`… | [design/tasks/S14.md:385](tasks/S14.md)；[design/reviews/S14.md:68](reviews/S14.md)；[docs/release/v0.13.1-release-notes.md:17](../docs/release/v0.13.1-release-notes.md) |
| D454 | 表 | 修订 D452（适用范围不变：S14 各 REFAC 任务的首屏条款） | [design/tasks/S14.md:386](tasks/S14.md)；[design/reviews/S14.md:69](reviews/S14.md)；[design/tasks/REFAC-05b-order-workspace-split.md:115](tasks/REFAC-05b-order-workspace-split.md) 等 9 处 |
| D455 | 表 | 用户文档与流程图中指向拆分前文件的 `file:line` 来源引用，逐条改到 `48ba245` 上的实际位置（5 个… | [design/tasks/S14.md:387](tasks/S14.md)；[design/reviews/S14.md:70](reviews/S14.md) |
| D456 | 表 | ① 认可 S13 回顾的 7 条行动项，落点写入 S15 计划 | [design/tasks/S14.md:388](tasks/S14.md)；[design/reviews/S14.md:71](reviews/S14.md)；[design/roadmap.md:97](roadmap.md) 等 18 处 |
| D457 | 表 | 接受 DEMO-14 的偏差，不重跑：① 时段前没有做 `slot-run -Stub` 桩演练与无浏览器演练 | [design/tasks/S14.md:389](tasks/S14.md)；[design/reviews/S14.md:72](reviews/S14.md)；[design/reviews/S14.md:80](reviews/S14.md) |
| D458 | 表 | （协调者，2026-11-23）v0.13.1 的日期 PR #246 同时更新 `docs/release/v0.13`… | [design/tasks/S14.md:390](tasks/S14.md)；[design/reviews/S14.md:73](reviews/S14.md) |
| D459 | 表 | 批准 S15 计划 | [design/tasks/S15.md:373](tasks/S15.md)；[design/reviews/S15.md:71](reviews/S15.md) |
| D460 | 表 | 行动项 | [design/reviews/S15.md:48](reviews/S15.md)；[design/tasks/S15.md:374](tasks/S15.md)；[design/reviews/S15.md:72](reviews/S15.md) 等 13 处 |
| D461 | 表 | REFAC-06c 的 P7 上限放宽：每个发票块路由的“路由新增”JS 由 ≤ +400 B 改为 ≤ **+900 … | [design/tasks/S15.md:375](tasks/S15.md)；[design/reviews/S15.md:73](reviews/S15.md)；[design/tasks/REFAC-05b-order-workspace-split.md:121](tasks/REFAC-05b-order-workspace-split.md) |
| D462 | 表 | REFAC-06b 的例外：发票路由 +220 B（屏蔽哈希后的 gzip-9）作为例外接受 | [design/tasks/S15.md:376](tasks/S15.md)；[design/reviews/S15.md:74](reviews/S15.md) |
| D463 | 表 | / D464 | [design/reviews/S15.md:51](reviews/S15.md)；[design/tasks/S15.md:377](tasks/S15.md)；[design/reviews/S15.md:75](reviews/S15.md) |
| D464 | 表 | JV-FIX-01 拉入 S15，作为泳道 D：凭证列表工具栏的刷新按钮改用独立的 `journal.refresh` … | [design/tasks/S15.md:378](tasks/S15.md)；[design/reviews/S15.md:76](reviews/S15.md) |
| D465 | 表 | –D467 | [design/reviews/S15.md:55](reviews/S15.md)；[design/tasks/S15.md:379](tasks/S15.md)；[design/reviews/S15.md:75](reviews/S15.md) |
| D466 | 表 | 测量之后到较新 main 之间的合并没有改到被测文件时，字节数不必在较新 main 上重测 | [design/tasks/S15.md:380](tasks/S15.md)；[design/reviews/S15.md:77](reviews/S15.md) |
| D467 | 表 | `run-main.ps1 -SkipCapture` | [design/reviews/S15.md:163](reviews/S15.md)；[design/tasks/S15.md:381](tasks/S15.md)；[design/reviews/S15.md:78](reviews/S15.md) 等 4 处 |
| D468 | 表 | DEMO-15 的真实时段可以依靠 `slot-run` 自带的预检等待（连续 6 次 0，最长 15 分钟，不重试），… | [design/tasks/S16.md:368](tasks/S16.md)；[design/reviews/S15.md:79](reviews/S15.md) |
| D469 | 表 | `tradeGuiSmoke`（按 §5 计数 164 行）属存量超长函数。CI-03 获得例外：净增 ≤ 0 行 | [design/tasks/S16.md:369](tasks/S16.md)；[design/reviews/S16.md:70](reviews/S16.md)；[design/tasks/S17.md:10](tasks/S17.md) 等 4 处 |
| D470 | 表 | 协调者开全会话静默窗口：收到“resume”之前，各会话不启动本地 node / vitest / npm / 浏览器进… | [design/tasks/S16.md:370](tasks/S16.md)；[design/reviews/S15.md:79](reviews/S15.md) |
| D471 | 表 | DEMO-15 取图推迟，v0.14.0 的 tag 等 DEMO-15 完成 | [design/tasks/S16.md:371](tasks/S16.md)；[design/reviews/S15.md:79](reviews/S15.md) |
| D472 | 表 | S15 回顾 6 条行动项全部认可 | [design/tasks/S16.md:372](tasks/S16.md)；[design/reviews/S16.md:71](reviews/S16.md)；[design/tasks/S16.md:13](tasks/S16.md) |
| D473 | 表 | 取代 D472 的 tag 补充：v0.14.0 不在 main 上的任何合并提交打 tag | [design/tasks/S16.md:373](tasks/S16.md)；[design/reviews/S16.md:71](reviews/S16.md)；[design/tasks/S16.md:249](tasks/S16.md) 等 4 处 |
| D474 | 表 | 接受 SLOT-03 在冲突域外改 `scripts/slot/check-manifest.mjs` 一行：规则表的定… | [design/tasks/S16.md:374](tasks/S16.md)；[design/reviews/S16.md:72](reviews/S16.md)；[design/roadmap.md:191](roadmap.md) |
| D475 | 表 | 时段端口查询失败（提供程序报错或抛出异常）不算空闲：全量记录每条错误，exit 8，不重试 | [design/tasks/S16.md:375](tasks/S16.md)；[design/reviews/S16.md:73](reviews/S16.md)；[design/roadmap.md:191](roadmap.md) |
| D476 | 表 | REFAC-07 调整页路由“路由新增”JS（屏蔽哈希后的 gzip-9）沿用 D461 上限 **+900 B**，不… | [design/tasks/S17.md:275](tasks/S17.md)；[docs/release/v0.17.0-release-notes.md:20](../docs/release/v0.17.0-release-notes.md) |
| D477 | 表 | 批准：TLIST-01 对存量超长函数 `OrderList`、`InvoiceList` 各给净增 ≤ 6 行的例外（… | [design/tasks/S17.md:276](tasks/S17.md) |
| D478 | 表 | DEMO-15 真实时段的静默窗口：收到“resume”前，所有会话不启动 node / npm / git / pws… | [design/tasks/S16.md:376](tasks/S16.md)；[design/reviews/S16.md:74](reviews/S16.md) |
| D479 | 表 | #264 在 `f325792` 获批后：重跑 D473 祖先检查（`072a575` → exit 0，`fe371b`… | [design/tasks/S16.md:377](tasks/S16.md)；[design/reviews/S16.md:74](reviews/S16.md) |
| D480 | 表 | DEMO-16 时段的静默窗口：所有开发停止本地 node / npm / vite / tsc / biome / v… | [design/tasks/S16.md:378](tasks/S16.md)；[design/reviews/S16.md:75](reviews/S16.md)；[design/reviews/S16.md:80](reviews/S16.md) 等 12 处 |
| D481 | 表 | 后干跑、`-SkipCapture` | [design/reviews/S16.md:159](reviews/S16.md)；[design/tasks/S16.md:379](tasks/S16.md)；[design/reviews/S16.md:75](reviews/S16.md) 等 7 处 |
| D482 | 表 | v0.15.0 的 tag 打在 `release/v0.15.0` 的 `e66ddd8`（tag 对象 `121ea`… | [design/tasks/S16.md:380](tasks/S16.md)；[design/reviews/S16.md:75](reviews/S16.md) |
| D483 | 表 | 发布分支分叉时，三点比较（`vA...vB`）从合并基开始比，会把已发布的文件再列一遍 | [design/tasks/S16.md:381](tasks/S16.md) |
| D484 | 表 | v0.16.0 的 tag 打在 `release/v0.16.0` 上审核通过的 RC head（`ac1c1d4`，… | [design/tasks/S17.md:277](tasks/S17.md)；[design/reviews/S17.md:71](reviews/S17.md) |
| D485 | 表 | FIX-TADJ-BUSY F2 第 5 步“账套选择可用”的断言移到第 7 步“清除草稿”之后：账套选择的禁用条件是 … | [design/tasks/S17.md:278](tasks/S17.md)；[design/reviews/S17.md:72](reviews/S17.md) |
| D486 | 表 | ：时段前演练没有执行新的取图脚本 | [design/reviews/S17.md:82](reviews/S17.md)；[design/tasks/S17.md:279](tasks/S17.md)；[design/reviews/S17.md:73](reviews/S17.md) 等 10 处 |
| D487 | 表 | S17 回顾行动 1、3 的发布 / Demo 细则：新增或改动的脚本各有演练证据（`run-main.ps1` 时段前… | [design/tasks/S18.md:118](tasks/S18.md)；[design/tasks/MEAS-01-bundle-measure-script.md:41](tasks/MEAS-01-bundle-measure-script.md)；[design/tasks/S18.md:72](tasks/S18.md) 等 16 处 |
| D488 | 表 | RUNMAIN-01 的验证占用了端口 4203：记为偏差，不重跑 | [design/tasks/S18.md:119](tasks/S18.md)；[design/reviews/S18.md:25](reviews/S18.md)；[design/reviews/S18.md:70](reviews/S18.md) 等 4 处 |
| D489 | 表 | DEMO-18 第 0 步并入静默窗口内执行，但仍算作时段前门槛（不因并入而放宽） | [design/tasks/S18.md:120](tasks/S18.md)；[design/reviews/S18.md:71](reviews/S18.md)；[docs/demo/v0.17.0/README.md:26](../docs/demo/v0.17.0/README.md) |
| D490 | 表 | 补上缺失的 `-Shots` 参数后重跑：属于修正调用，不算 D444 意义上的重试 | [design/tasks/S18.md:121](tasks/S18.md)；[design/reviews/S18.md:72](reviews/S18.md)；[docs/demo/v0.17.0/README.md:26](../docs/demo/v0.17.0/README.md) 等 4 处 |
| D491 | 表 | 允许一次性修正 `capture.mjs` 的选择器，并加一次干跑后再正式运行 | [design/tasks/S18.md:122](tasks/S18.md)；[design/reviews/S18.md:73](reviews/S18.md)；[docs/demo/v0.17.0/README.md:26](../docs/demo/v0.17.0/README.md) 等 4 处 |
| D492 | 表 | ：时段产物清理前没有记录哈希 | [design/reviews/S18.md:84](reviews/S18.md)；[design/tasks/S18.md:123](tasks/S18.md)；[design/reviews/S18.md:74](reviews/S18.md) 等 9 处 |
| D493 | 表 | ：`npm ci` 在窗口内运行；D489 / D490：窗口内步骤与演练命令不一致 | [design/reviews/S18.md:85](reviews/S18.md)；[design/tasks/S18.md:124](tasks/S18.md)；[design/reviews/S18.md:25](reviews/S18.md) 等 7 处 |
| D494 | 表 | 授权 v0.17.0 打 tag 并发布：做法同 D484，tag 打在 `release/v0.17.0` 上 #28… | [design/tasks/S18.md:125](tasks/S18.md)；[design/reviews/S18.md:76](reviews/S18.md) |
| D495 | 表 | 采纳 S18 回顾行动 3“RC 数字自查”：RC 文档（CHANGELOG、发布说明、Demo README、PR 正… | [design/tasks/S18.md:126](tasks/S18.md)；[design/reviews/S18-retro.md:46](reviews/S18-retro.md)；[design/reviews/S18.md:77](reviews/S18.md) 等 12 处 |
| D496 | 表 | / D498 / D499：窗口内步骤与演练命令仍不一致，`slot-run` 调用方式出错两次 | [design/reviews/S19.md:84](reviews/S19.md)；[design/tasks/S19.md:164](tasks/S19.md)；[design/reviews/S19.md:72](reviews/S19.md) 等 4 处 |
| D497 | 条目 |  | [design/reviews/S19.md:73](reviews/S19.md) |
| D498 | 条目 |  | [design/reviews/S19.md:74](reviews/S19.md)；[design/tasks/S20.md:96](tasks/S20.md)；[docs/demo/TEMPLATE.md:28](../docs/demo/TEMPLATE.md) |
| D499 | 条目 |  | [design/reviews/S19.md:75](reviews/S19.md)；[design/tasks/S20.md:96](tasks/S20.md)；[docs/demo/TEMPLATE.md:28](../docs/demo/TEMPLATE.md) |
| D500 | 表 | ：临时账套的实际路径没有记录 | [design/reviews/S19.md:86](reviews/S19.md)；[design/reviews/S19.md:76](reviews/S19.md)；[design/reviews/S20-retro.md:10](reviews/S20-retro.md) 等 5 处 |
| D501 | 表 | 授权发布 v0.18.0：建 `release/v0.18.0`，在已批准的 RC 头 `422d24b6c17c7cf`… | [design/tasks/S19.md:165](tasks/S19.md)；[design/reviews/S19.md:77](reviews/S19.md) |
| D502 | 表 | MEAS-01 M9 的哈希掩码口径统一用 #288 的 `-HASH` | [design/tasks/S20.md:181](tasks/S20.md) |
| D503 | 表 | 批准 DEMO-20 窗口：端口 `-Ports 4204` / `-Port 4204` | [design/tasks/S20.md:182](tasks/S20.md) |
| D504 | 表 | 包体积测量不在窗口内跑：窗口关闭、D500 清单与哈希保存后，单独跑一次 `bundle-measure.mjs`（钉 … | [design/tasks/S20.md:183](tasks/S20.md) |
| D505 | 表 | 门禁发现的 6 个长驻 node 服务与 ERP 无关，按“静默”放行，不停止、不终止 | [design/tasks/S20.md:184](tasks/S20.md) |
| D506 | 表 | 两处 `npm ci` 的控制台输出未保存，按 D500 先例接受、不重跑 | [design/tasks/S20.md:185](tasks/S20.md)；[design/tasks/S20.md:200](tasks/S20.md)；[design/tasks/S22.md:95](tasks/S22.md) 等 5 处 |
| D507 | 表 | PID 4056（`npx playwright test`）来源保持“无法判定”，不写成“与 ERP 无关” | [design/tasks/S20.md:186](tasks/S20.md)；[design/tasks/S20.md:197](tasks/S20.md)；[design/tasks/S22.md:14](tasks/S22.md) 等 4 处 |
| D508 | 表 | 步骤 4 实际执行比批准原文多了 `\| Select -First 8` 管道：不重跑，接受这一偏差 | [design/tasks/S20.md:187](tasks/S20.md)；[design/tasks/S20.md:198](tasks/S20.md)；[docs/demo/TEMPLATE.md:31](../docs/demo/TEMPLATE.md) |
| D509 | 表 | 开窗前没有跑新版 `-SkipCapture` | [design/tasks/S20.md:188](tasks/S20.md)；[design/tasks/S20.md:199](tasks/S20.md)；[design/tasks/S22.md:95](tasks/S22.md) 等 7 处 |
| D510 | 表 | 授权发布 v0.19.0：建 `release/v0.19.0`，在已批准的 RC head `10292ede0906`… | [design/tasks/S20.md:189](tasks/S20.md) |
| D511 | 表 | 采纳 S20 回顾行动 5 与行动 7：(5) 同一事实（步骤结果、退出码、计数）只写在 run-through，CHA… | [design/tasks/S20.md:190](tasks/S20.md)；[design/tasks/S22.md:68](tasks/S22.md) |
| D512 | 表 | 批准 SLOT-04 的 4c 在 `-Stub pass -Ports 4204` 下运行（不起服务、不造数、不开浏览… | [design/tasks/S21.md:165](tasks/S21.md)；[design/tasks/S21.md:166](tasks/S21.md) |
| D513 | 表 | 同步 #315 | [design/reviews/S22-review.md:51](reviews/S22-review.md)；[design/reviews/S22-review.md:75](reviews/S22-review.md)；[design/tasks/S22.md:176](tasks/S22.md) |
| D514 | 表 | S22 版本 v0.21.0 | [design/reviews/S22-review.md:76](reviews/S22-review.md)；[design/tasks/S22.md:177](tasks/S22.md) |
| D515 | 表 | –D517 | [design/reviews/S22-review.md:77](reviews/S22-review.md)；[design/tasks/S23.md:165](tasks/S23.md) |
| D516 | 表 | TSET-01：只在没有请求进行中（`!page.isFetching`）且未结项已加载、无下一页时判定 | [design/tasks/S23.md:166](tasks/S23.md)；[design/tasks/TSET-01-settlement-missing-selections.md:35](tasks/TSET-01-settlement-missing-selections.md) |
| D517 | 表 | SLOT-06：`slot-run.ps1` 在所有退出码 4 的检查之后、端口检查之前自动起 `gate-snapsh`… | [design/tasks/S23.md:167](tasks/S23.md) |
| D518 | 表 | TSET-01 焦点方案 | [design/reviews/S22-review.md:78](reviews/S22-review.md)；[design/tasks/S23.md:168](tasks/S23.md) |
| D519 | 表 | DEMO-22 体积例外 | [design/reviews/S22-review.md:79](reviews/S22-review.md)；[design/tasks/S23.md:169](tasks/S23.md) |
| D520 | 表 | TSET-01 N7 首屏预算口径 | [design/reviews/S22-review.md:80](reviews/S22-review.md)；[design/tasks/S23.md:170](tasks/S23.md)；[design/tasks/TEMPLATE.md:117](tasks/TEMPLATE.md) |
| D521 | 表 | DEMO-22 K2 金额断言作废，改由 TLIST-06 S3 证明 | [design/reviews/S22-review.md:81](reviews/S22-review.md)；[design/tasks/S23.md:171](tasks/S23.md)；[design/reviews/S22-retro.md:25](reviews/S22-retro.md) 等 4 处 |
| D522 | 表 | SLOT-06 快照日志命名 `.stdout.log` / `.stderr.log` | [design/reviews/S22-review.md:82](reviews/S22-review.md)；[design/tasks/S23.md:172](tasks/S23.md) |
| D523 | 表 | TSET-01 测试行数超上限，接受 | [design/reviews/S22-review.md:83](reviews/S22-review.md)；[design/tasks/S23.md:173](tasks/S23.md) |
| D524 | 表 | SLOT-06 快照启动点不变；G6 只覆盖启动前的退出码 4 | [design/reviews/S22-review.md:84](reviews/S22-review.md)；[design/tasks/S23.md:174](tasks/S23.md) |
| D525 | 表 | REFAC-14 只改 `CompanyEvents` 的代码组织、不改行为：DOM、文案、请求顺序与焦点逐项不变 | [design/tasks/S24.md:166](tasks/S24.md) |
| D526 | 表 | REFAC-14 #326 中 `trade-orders.test.tsx` 的串行失败（导航用例超时）判为原有偶发，… | [design/tasks/S24.md:167](tasks/S24.md) |
| D527 | 表 | FLAKE-09 的原因推断与修法：证据支持的推断（未证明）是，web 测试的偶发失败来自 `isolate: fals`… | [design/tasks/S24.md:168](tasks/S24.md)；[design/tasks/FLAKE-09-web-async-wait.md:46](tasks/FLAKE-09-web-async-wait.md) |
| D528 | 表 | REFAC-15 只改 `CompanyReports` 的代码组织、不改行为：DOM、文案、URL 查询串写法、请求顺… | [design/tasks/S24.md:169](tasks/S24.md)；[design/tasks/REFAC-15-company-reports-split.md:83](tasks/REFAC-15-company-reports-split.md) |
| D529 | 表 | MEAS-02 只改 `scripts/measure/bundle-compare.mjs` 的代码组织、不改行为：同… | [design/tasks/S24.md:170](tasks/S24.md)；[design/tasks/MEAS-02-bundle-compare-split.md:47](tasks/MEAS-02-bundle-compare-split.md) |
| D530 | 表 | FLAKE-09 补充：高负载下，`setup.ts` 预加载路由的 `beforeAll` 会超过 15 s 的 ho… | [design/tasks/S24.md:171](tasks/S24.md)；[design/tasks/S24.md:13](tasks/S24.md) |
| D531 | 表 | FLAKE-09 补充：`asyncUtilTimeout` 由 3000 ms 提高到 5000 ms，R7 的预期失… | [design/tasks/S24.md:172](tasks/S24.md)；[design/tasks/S24.md:13](tasks/S24.md) |
| D532 | 表 | REFAC-16 只改 `RuleSettings` 的代码组织、不改行为：DOM、文案、请求顺序、查询键、锁定值序列与… | [design/tasks/S24.md:173](tasks/S24.md) |
| D533 | 表 | REFAC-17 只改 `prepareTradeAction` 的代码组织、不改行为：同样输入下返回值、错误（code… | [design/tasks/S24.md:174](tasks/S24.md) |
| D534 | 表 | REFAC-18 只改 `TradeEditor` 的代码组织、不改行为：DOM、文案、请求的 URL / 方法 / 请… | [design/tasks/S24.md:175](tasks/S24.md) |
| D535 | 表 | REFAC-19 只改 `reportRepository` 的代码组织、不改行为：对任何输入，每次 `db.query`… | [design/tasks/S24.md:176](tasks/S24.md) |
| D536 | 表 | REFAC-20 只改 `buildJournalPlan` 的代码组织、不改行为：对任何输入，返回的 `Journal`… | [design/tasks/S24.md:177](tasks/S24.md) |
| D537 | 表 | REFAC-18 R4 直接断言 4 改为 4a、4b（协调者代定）：原断言“付款条件 `dueDays` 为 `nul`… | [design/tasks/S24.md:178](tasks/S24.md) |
| D538 | 表 | `dueDays` / `discountDays` 前端空值映射 `null` 与契约不一致（#339 报告）的口径：… | [design/tasks/S24.md:179](tasks/S24.md)；[design/tasks/S24.md:21](tasks/S24.md)；[design/tasks/TMAS-01-trade-days-validation.md:67](tasks/TMAS-01-trade-days-validation.md) |
| D539 | 表 | TMAS-01 的口径（产品负责人，依据 D538）：付款条件 `dueDays` / `discountDays` 保… | [design/tasks/S24.md:180](tasks/S24.md) |
| D540 | 表 | REFAC-21 只改 `businessRepository` 的代码组织、不改行为：对任何输入，每次 `db.que`… | [design/tasks/S24.md:181](tasks/S24.md) |
| D541 | 表 | REFAC-22 只改 `AccountEditor` 的代码组织、不改行为：DOM（含属性顺序）、文案、请求的 URL… | [design/tasks/S24.md:182](tasks/S24.md) |
| D542 | 表 | REFAC-23 只改发票准备 `TradeDocumentService.prepare` 的代码组织、不改行为：返回… | [design/tasks/S24.md:183](tasks/S24.md) |
| D543 | 表 | REFAC-24 只改 `AiPanel` 的代码组织、不改行为：DOM（含属性顺序）、文案、请求的 URL / 方法 … | [design/tasks/S24.md:184](tasks/S24.md) |
| D544 | 表 | REFAC-25 只改 `journalRepository` 的代码组织、不改行为：SQL 文本（含空白与换行）、参数… | [design/tasks/S24.md:185](tasks/S24.md) |
| D545 | 表 | （协调者代定，REFAC-23 实施中）REFAC-23 R4 直接断言 1 改为：`gross = 0` 抛 `Dom`… | [design/tasks/S24.md:186](tasks/S24.md) |
| D546 | 表 | REFAC-26 只改 `tradeDocumentRepository` 的代码组织、不改行为：SQL 文本（含空白、… | [design/tasks/S24.md:187](tasks/S24.md) |
| D547 | 表 | REFAC-27 只改核销准备 `TradeDocumentService.prepareSettlement` 的代码… | [design/tasks/S24.md:188](tasks/S24.md) |
| D548 | 表 | REFAC-28 只改期末结账向导 `CloseWizard` 的代码组织、不改行为：DOM（含属性顺序）、请求 URL… | [design/tasks/S24.md:189](tasks/S24.md) |
| D549 | 表 | REFAC-29 只改期末结账页 `PeriodClose` 的代码组织、不改行为：DOM（含属性顺序）、请求 URL（… | [design/tasks/S24.md:190](tasks/S24.md) |
| D550 | 表 | REFAC-30 只改贸易计算器 `calculateTrade` 的代码组织、不改行为：返回值（键、值、键顺序、数组顺… | [design/tasks/S24.md:191](tasks/S24.md) |
| D551 | 表 | REFAC-31 只改业务事件预览计算 `compute` 的代码组织、不改行为：返回值（键、值、键顺序、`finger`… | [design/tasks/S24.md:192](tasks/S24.md) |
| D552 | 表 | REFAC-32 只改 AI 适配器 `CopilotAiAdapter.complete` 的代码组织、不改行为：结果… | [design/tasks/S24.md:193](tasks/S24.md) |
| D553 | 表 | REFAC-33 只改总账报表页 `LedgerReports.tsx` 的代码组织、不改行为：DOM（含属性顺序）、请… | [design/tasks/S24.md:194](tasks/S24.md) |
| D554 | 表 | REFAC-34 只改贸易单据路由 `registerTradeDocumentRoutes` 的代码组织、不改行为：每… | [design/tasks/S24.md:195](tasks/S24.md) |
| D555 | 表 | 团队迁移到 agile-ai-team `unified-agile-v1`：角色绑定、唯一待办（`design/tas`… | [design/tasks/S24.md:196](tasks/S24.md) |
| D556 | 表 | 知识待办 KDOC-01..11 的排序（排在 REFAC 之后，P3） | [design/tasks/S24.md:197](tasks/S24.md) |
| D557 | 表 | 设计阶段质量项的适用规则：纯重构只有不触及页面、也不触及有性能预算的路径时，才可把 UI / 性能标 `not_appl`… | [design/tasks/S24.md:198](tasks/S24.md)；[design/team-charter.md:86](team-charter.md) |
| D558 | 表 | KDOC 修正：KDOC-05 与 KDOC-07 共用 `docs/user/backup-and-legacy.md`… | [design/tasks/S24.md:199](tasks/S24.md) |
| D559 | 表 | #365 文档入口的证据口径：覆盖矩阵中每个标为“已覆盖”的格都要引用完整 SHA 与具体文件，否则降级为 partia… | [design/tasks/S24.md:200](tasks/S24.md) |
| D560 | 表 | KDOC-01、KDOC-02、KDOC-11 落地：新增 ADR-LOCAL-001（保持 SQLite 本机单用户，… | [design/tasks/S24.md:201](tasks/S24.md) |
| D561 | 表 | KDOC 文档页的钉版本口径：在 KDOC PR 中，本 PR 改动的页在 `docs/README.md` 覆盖矩阵中… | [design/tasks/S24.md:202](tasks/S24.md) |
| D562 | 表 | KDOC-03 落地：新增决定索引，用脚本从 `design/`、`docs/` 与 `CHANGELOG.md` 生成… | [design/tasks/S24.md:203](tasks/S24.md) |
| D563 | 表 | AI 讲解与教学模式（#372 §6b）：服务端**不**按教学模式拦截 `/api/v1/ai/explain`，界面… | [design/tasks/S24.md:204](tasks/S24.md) |
| D564 | 表 | KDOC-09 核对（#377）：D1、D2、D3、D51 原记录缺备选、代价、失效条件，由设计角色补记到路线图 §6.… | [design/tasks/S24.md:205](tasks/S24.md) |
| D565 | 表 | 重构 PR 中登记的现存缺陷立为候选：BUG-01（#371 孤立 `value`）、BUG-02a–d（#364 AI… | [design/tasks/S24.md:206](tasks/S24.md) |
| D566 | 表 | 用户要求（四个团队）：里程碑收尾时做一次合并的结果对目标检查与回顾，补充而不取代 Sprint 评审与回顾 | [design/tasks/S24.md:207](tasks/S24.md) |
| D567 | 表 | KDOC-01..11 全部合并或并入后，把 Knowledge Lead 报告的剩余文档缺口登记为候选 KGAP-01… | [design/tasks/S24.md:208](tasks/S24.md) |
| D568 | 表 | 接受 SEC-01 安全评审结论（#364 评论 7148351359），SEC-01 改为 done | [design/tasks/S24.md:209](tasks/S24.md)；[CHANGELOG.md:11](../CHANGELOG.md) |
| D569 | 表 | KGAP-04 记为 done，状态格写明交付范围：#386（`13a437b`）交付 SEC-01 结论引用与官方负责… | [design/tasks/S24.md:210](tasks/S24.md) |
| D570 | 表 | SEC-02 Windows R6a：接受由同机同 Node 版本 `env: {}` 对照 spawn 实测证实的平台… | [design/tasks/S24.md:211](tasks/S24.md) |
| D571 | 表 | SEC-02 R6b：Windows 防火墙下的运行不计入验收，只记为流程偏差 | [design/tasks/S24.md:212](tasks/S24.md) |
| D572 | 表 | MCLOSE-01 R1：Delivery/Release 用一个只改文档的 PR 补齐 CHANGELOG `[Unr`… | [design/tasks/S24.md:213](tasks/S24.md) |
| D573 | 表 | MCLOSE-01 R2：v0.22.0 改基于从当前 main 新切的 RC，DEMO-23 RC `3566ddb`… | [design/tasks/S24.md:214](tasks/S24.md) |
| D574 | 表 | MCLOSE-01 K3：修订 D561，钉版本在同一 PR 的下一轮完成，或每个里程碑批量钉 | [design/tasks/S24.md:215](tasks/S24.md) |
| D575 | 表 | MCLOSE-01：其余 P2/P3 发现转为 Backlog 候选，各带负责人、优先级、验收标准与目标里程碑 | [design/tasks/S24.md:216](tasks/S24.md) |
| D576 | 表 | MCLOSE-01 R8b：REFAC-31、REFAC-34 的 R8b 不用 main Full 绿灯补记，记为“未… | [design/tasks/S24.md:217](tasks/S24.md) |
| D577 | 表 | MCLOSE-01：Backlog 中 SEC-01 的“现在只去掉……”改为历史基线措辞，由设计在收尾 PR 中修改 | [design/tasks/S24.md:218](tasks/S24.md) |
| D578 | 表 | MCLOSE-01：KGAP-01 的 QA 措辞作为候选（Knowledge Lead，P2）：#365、#368、#… | [design/tasks/S24.md:219](tasks/S24.md) |
| D579 | 表 | MCLOSE-01 目标里程碑：MCF 中未定里程碑的 P1/P2 项定为 S25，P3 项定为“Backlog（S25… | [design/tasks/S24.md:220](tasks/S24.md) |
| D580 | 表 | 接受 S25 计划：目标为 v0.22.0 基于当前 main 新切 RC 且 CHANGELOG 完整，并补齐 MCL… | [design/tasks/S25.md:49](tasks/S25.md) |
| D581 | 表 | MCF-01（#396）覆盖 v0.21.0 以来所有缺 CHANGELOG 条目的 PR，不限于收尾 R1 列出的几项 | [design/tasks/S25.md:50](tasks/S25.md) |
| D582 | 表 | MCF-17 结案：REFAC-34 的 R8b 已确认 | [design/tasks/S25.md:51](tasks/S25.md) |
