# S30 Sprint 评审（KDOC-14 + ② 存量拆分三泳道，设计 / 产品）

- 作者：设计 / 产品负责人。核对时点：main `5ce76d521f99ac820edebb88c1000a9c7dd0c666`（#469 合并后）。数字、状态、PR 号与 SHA 都以当时 `gh` / `git` 的输出为准，命令见 §5。格式沿用 [S29 评审](S29-review.md)。
- 对照基准：[S30 计划](../tasks/S30.md)（D608–D616）。各项验收以 [KDOC 表](../tasks/backlog/KDOC.md) KDOC-14 行、[REFAC-35](../tasks/REFAC-35-reports-page-split.md)、[REFAC-36](../tasks/REFAC-36-master-data-repository-split.md)、[REFAC-37](../tasks/REFAC-37-dimension-rules-split.md) 任务书，以及 S30 的[三项 REFAC 共用要求](../tasks/S30.md#三项-refac-共用可读性与嵌套复验)、[跨文件验收](../tasks/S30.md#跨文件验收d595按文件列验收句)为准。
- 范围：S30 计划基线 `bae5d59`（S29 收尾 [#463](https://github.com/lingshf/ai-native-erp/pull/463)）之后合并的 [#464](https://github.com/lingshf/ai-native-erp/pull/464)–[#469](https://github.com/lingshf/ai-native-erp/pull/469)，共 6 个 PR。本评审所在 PR 计入下一 Sprint。
- 只核对事实，只改 `design/` 文档。

## 1. 结论

**S30 accepted，无计划偏差；有 1 项证据缺口：三项 REFAC 的独立 QA 实跑没有在 PR 上留证（§3）。** 计划的四项（KDOC-14、REFAC-35、REFAC-36、REFAC-37）在本收尾 PR 中按[执行状态](../tasks/S30.md#执行状态)记为 done，“合并后项”一列已全部清空，依据都是 Product/Design 在合并提交上的核对评论，结论都是 PASS（§2.1）。没有触发 D608 的砍项规则。按 D608，本 Sprint 不承诺版本号，不做发布候选；须用户授权的事项都没有执行。

- **用户可见变化 0 项**：三项 REFAC 都按任务书证明不改行为（两侧原始记录逐字节相同，§2.2）；KDOC-14 只改文档行号引用。REFAC-35 的路由 chunk 与入口 chunk 各 +385 B（gzip），在 +800 B 硬上限内（评审 [6083628459](https://github.com/lingshf/ai-native-erp/pull/469#pullrequestreview-6083628459)）。
- **迁移 0 个**：最新迁移仍为 020（`packages/infra/src/storage/migrations.ts:106`），下一个迁移号为 021。
- **写入域**：`git diff --name-only bae5d59 5ce76d5 -- packages` 列出 32 个文件，全部落在三条泳道的冲突域内（`core/src/domain/dimension*.ts` 8 个、`infra/src/storage/master-data*.ts` 6 个、`web/src/Reports.tsx` 与 `web/src/reports/` 18 个）；`git diff --name-only bae5d59 5ce76d5 -- '*test*'` 输出为空，没有改测试文件。
- **② 存量**：用计划选题时的 `fnlen.cjs`，超过 80 行的函数由 `bae5d59` 的 52 个降到 `5ce76d5` 的 45 个；少掉的 7 个正是目标函数（`Ledger`、`Reports`、`Trial`、`masterDataRepository`、`compileDimensionRules`、`resolve`、`validateDimensionConfig`），没有新增。
- **新增决定 D608–D616**（9 条）：D608–D611 在计划 [#464](https://github.com/lingshf/ai-native-erp/pull/464)，D612–D615 在任务书 [#466](https://github.com/lingshf/ai-native-erp/pull/466)，D616（TL 决定，REFAC-35 开放问题 3 采用默认方案）在本收尾 PR 补记。
- **评审打回 6 次**：6 个 PR 各打回 1 轮后批准（§2.2）。按第一个阻塞点分：
  - 计划或任务书的验收与证据方法 2 次（#464、#466）；
  - 仅待原始证据（内容核对已通过）3 次（#465、#467、#469）；
  - 等价证据漏了一个分支 1 次（#468）。

  事实不准 0 次。分析见 [S30 回顾](S30-retro.md)。
- **S30 范围内的 main Full**：6 个合并提交全部 success（§2.2）。

## 2. 目标与验收逐项核对

### 2.1 D608 目标

| 目标 / 项 | 判定 | 证据（PR / SHA / 复核） |
| --- | --- | --- |
| 1. KDOC-14（D611） | accepted | [#465](https://github.com/lingshf/ai-native-erp/pull/465) `ee90deb`：`docs/flows/invoice-detail-flow.md:35` 的 `:51–57` 改为 `:52–58`，`:29–30` 与钉点 `34ec97c…` 未动。打回 1 轮（仅待证据）后批准，QA N/A。Product/Design 合并后核对 PASS（[评论 7209521357](https://github.com/lingshf/ai-native-erp/pull/465#issuecomment-7209521357)）：在 `34ec97c` 上 `:52` 为注释、`:58` 为 `enabled: wellFormed`，首尾行都对 |
| 2. REFAC-35 `Reports.tsx`（D612、D616） | accepted | [#469](https://github.com/lingshf/ai-native-erp/pull/469) `5ce76d5`。改前 `Ledger` 200 / `Reports` 189 / `Trial` 131 行；改后最长 78 行（`Reports`、`TrialBalanceCard`）、最深 2 层，`Reports.tsx` 623 → 122 行（上限 150），新文件 17 个、最大 90 行（上限 150）。两侧 R4 全量记录各 57 条、比较 0 差异（固定 gist 修订 `b0c3408`）。D616：3 处阶段判定合并为 `isTrialStage`，评审确认等价。Product/Design 合并后复测 PASS（[评论 7210329038](https://github.com/lingshf/ai-native-erp/pull/469#issuecomment-7210329038)） |
| 2. REFAC-36 `masterDataRepository`（D613） | accepted | [#467](https://github.com/lingshf/ai-native-erp/pull/467) `33809e1`。改前 182 行；改后最长 77 行、最深 3 层（`transaction`），`master-data.ts` 325 → 103 行（上限 110），新文件最大 82 行。14 个搬移方法与 20 个 SQL 调用原文及顺序不变，事务函数体逐字不变，R2/R4/R4b 两侧原始日志逐字节相同（固定 gist 修订 `0145654`）；按 D613 不跑 Bench。Product/Design 合并后复测 PASS（[评论 7210239210](https://github.com/lingshf/ai-native-erp/pull/467#issuecomment-7210239210)） |
| 2. REFAC-37 `dimensions.ts`（D614） | accepted | [#468](https://github.com/lingshf/ai-native-erp/pull/468) `2fb0096`。改前 `compileDimensionRules` 124、`resolve` 100 / 5 层、`validateDimensionConfig` 106 / 4 层、`orderedRules` 4 层；改后最长 47 行，`resolve` 23、`validateDimensionConfig` 13（上限 50），最深 3 层，`dimensions.ts` 370 → 152 行（上限 220），新文件最大 127 行。R4 两侧各 78 例逐字节相同，R2b 声明对照与 TS2344 反例齐全。Product/Design 合并后复测 PASS（[评论 7210284405](https://github.com/lingshf/ai-native-erp/pull/468#issuecomment-7210284405)） |
| 3. S29 回顾行动 1–3 | 见回顾 | 行动 1 **达成**、行动 2 **达成**、行动 3 不适用（本 Sprint 没有新的 QA 场景）。详见 [S30 回顾](S30-retro.md#s29-回顾行动项检查) |
| 版本 | 不适用（D608） | 本 Sprint 不承诺版本号，不做发布候选；CHANGELOG 没有改 |
| BUG-05 打版本、v0.22.0 tag 与 Release、M2-05、M2-06、Dependabot、P12、多订单合并开票（D610） | 待授权或待决定（不在 S30 范围） | 都没有执行。远端 tag 最新仍为 `v0.21.0`（`git ls-remote --tags origin`）；Dependabot [#11](https://github.com/lingshf/ai-native-erp/pull/11)、[#389](https://github.com/lingshf/ai-native-erp/pull/389)、[#390](https://github.com/lingshf/ai-native-erp/pull/390) 仍开着 |
| 门禁：覆盖最后一个合并提交的 main Full 为绿 | 达成 | `5ce76d5` [Full 45943474500](https://github.com/lingshf/ai-native-erp/actions/runs/45943474500) success，12/12 作业 |

### 2.2 各 PR 评审

评审都以 COMMENTED 状态提交，结论按正文的 `VERDICT:` 行计，`CHANGES_REQUESTED` 记为打回。“打回点”一栏只写主要原因，分类口径见[回顾](S30-retro.md#打回分类)。

| PR | 合并 / 轮次 | main Full | QA 行（批准评审原文） | 打回点 |
| --- | --- | --- | --- | --- |
| S30 计划 [#464](https://github.com/lingshf/ai-native-erp/pull/464) | `4d296bf`；1 轮（[6083310668](https://github.com/lingshf/ai-native-erp/pull/464#pullrequestreview-6083310668)），批准 [6083335952](https://github.com/lingshf/ai-native-erp/pull/464#pullrequestreview-6083335952) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45937703498) | N/A（仅计划文档） | 验收与证据计划：<br>• 验收没有可读性要求，嵌套 ≤ 3 层没有可复验的证据；<br>• “Bench 不退化（按 REFAC-26）”与 REFAC-26 不跑 Bench 矛盾；<br>• 砍项规则没有区分单项任务书超期与整体容量不足 |
| KDOC-14 [#465](https://github.com/lingshf/ai-native-erp/pull/465) | `ee90deb`；1 轮（[6083350624](https://github.com/lingshf/ai-native-erp/pull/465#pullrequestreview-6083350624)），批准 [6083356182](https://github.com/lingshf/ai-native-erp/pull/465#pullrequestreview-6083356182) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45937917742) | N/A（仅修正文档引用） | 仅待证据：内容核对通过，正文缺证据计划要求的两条 `git grep`（`待\|pending`、矩阵引用）及空结果；同一 head 补正文后批准 |
| 任务书 [#466](https://github.com/lingshf/ai-native-erp/pull/466) | `2a65710`；1 轮（[6083453880](https://github.com/lingshf/ai-native-erp/pull/466#pullrequestreview-6083453880)），批准 [6083486473](https://github.com/lingshf/ai-native-erp/pull/466#pullrequestreview-6083486473) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45940076106) | N/A（仅任务书） | 任务书证据方法：<br>• D615 量法文字与脚本不一致（注释后跟代码的行、具名内层函数的行）；<br>• REFAC-36 的 R7、R4b、R8a 与实际脚本或依赖不符；<br>• REFAC-37 公开推断类型缺独立证据；<br>• 估值未写成硬上限 |
| REFAC-36 [#467](https://github.com/lingshf/ai-native-erp/pull/467) | `33809e1`；1 轮（[6083614756](https://github.com/lingshf/ai-native-erp/pull/467#pullrequestreview-6083614756)），批准 [6083631631](https://github.com/lingshf/ai-native-erp/pull/467#pullrequestreview-6083631631) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45942823141) | “未独立执行 SQLite 行为用例，不计 PASS” | 仅待证据（D456）：正文只有摘要和 SHA，没有 R2、R4 两侧原始输出或固定证据链接；同一 head 补 gist 后批准 |
| REFAC-37 [#468](https://github.com/lingshf/ai-native-erp/pull/468) | `2fb0096`；1 轮（[6083621330](https://github.com/lingshf/ai-native-erp/pull/468#pullrequestreview-6083621330)），批准 [6083667375](https://github.com/lingshf/ai-native-erp/pull/468#pullrequestreview-6083667375) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45943119377) | “独立 QA 实跑结论另报” | 等价证据漏分支：`dimension-structure.ts:24` 的 `seen.size > 200` 没有被 R4 单独命中（`r10a` 只覆盖重复签名）；另缺 R4 逐用例原始记录。同一 head 补驱动用例与原始记录后批准 |
| REFAC-35 [#469](https://github.com/lingshf/ai-native-erp/pull/469) | `5ce76d5`；1 轮（[6083628459](https://github.com/lingshf/ai-native-erp/pull/469#pullrequestreview-6083628459)），批准 [6083684154](https://github.com/lingshf/ai-native-erp/pull/469#pullrequestreview-6083684154) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45943474500) | “独立 Web QA 实跑结果另报” | 仅待证据（D456）：R4 只有驱动和摘要，没有两侧未截断的全量记录；同一 head 补固定 gist 后批准 |

三个开发 PR 都在同一 head 上补证据后批准，产品代码没有因评审而改动。

### 2.3 本 Sprint 修正的事实不符

| 页面 | 来源 | 不符数 | 修正 PR | 合并后复核 |
| --- | --- | --- | --- | --- |
| `docs/flows/invoice-detail-flow.md:35` | KDOC-14（D611） | 1（引用范围 `:51–57` 改为 `:52–58`） | [#465](https://github.com/lingshf/ai-native-erp/pull/465) | Product/Design PASS |

**合计 1 处。** #469 批准评审指出 PR 正文早先写的“53 步”与固定原始记录的 56 步不一致，以原始记录为准；这是 PR 正文的描述，不在仓库文档中，不计入本表。

## 3. 补充裁定与偏差

S30 期间的决定（原文见 [S30 决定表](../tasks/S30.md#s30-期间决定)）：

- D608：接受计划；砍项依次 REFAC-37、REFAC-36、REFAC-35，KDOC-14 不砍。没有触发砍项。
- D609：开发泳道排 REFAC-35..37。失效条件（用户授权 M2-05/06 或批准多订单合并开票）在本 Sprint 内没有出现。
- D610：多订单合并开票不进 S30，**仍待用户决定**。
- D611：KDOC-14 范围改为 `:52–58`，已由 #465 落地。
- D612–D614：三项 REFAC 不改行为，见 §2.1。
- D615：统一量法。任务书、开发 PR 与三次合并后复测都用同一脚本，结果与评审读数一致。
- D616（收尾补记）：REFAC-35 开放问题 3 采用默认方案，3 处阶段判定合并为 `isTrialStage`；TL 决定，评审确认等价。

**偏差**：计划层面无。

**证据缺口（不改变 done 判定，交 TL）**：计划[证据计划](../tasks/S30.md#pr-正文证据计划d595)把“不改行为”的核对人写为 Reviewer、QA。三项 REFAC 的批准评审都写明 QA 未独立执行（原文见 §2.2 QA 行），截至核对时点 #467–#469 的 PR 评论中没有独立 QA 结论（`gh api repos/lingshf/ai-native-erp/issues/<n>/comments`，§5）。本收尾按评审批准、两侧等价原始记录、合并后复测与 main Full 记 done；QA 部分是否补交（贴到对应已合并 PR）或接受现有证据，由 TL 决定。改进见回顾行动 3。

**缺陷**：本 Sprint 没有发现新的产品缺陷，BUG-06 未使用。#467 评审提到的 `currencyScale` 的 `Number(...)` 是原有行为，评审判为超出范围，不登记缺陷。

## 4. 未完成与遗留

- **REFAC 独立 QA 实跑**：证据缺口，见 §3，由 TL 处置。
- **② 存量**：`fnlen.cjs` 计超过 80 行的函数仍有 45 个。legacy 相邻函数受 M2-05 约束，`Workspace`、`targetStorage`、`TradeInvoiceDetail.tsx` 等不选的理由见 [S30 选题依据](../tasks/S30.md#选题依据可复现)。S31 计划时再选。
- **KGAP-15 / KGAP-04 缺口**：仍开放。S30 内 `docs/ai-assistant.md` 没有改动（`git diff --stat bae5d59 5ce76d5 -- docs/ai-assistant.md` 输出为空），按 D607 在 S31 计划时复查。
- **多订单合并开票（D610）**：待用户决定，经 TL 询问。
- **BUG-05 是否打版本**：**待用户授权**。没有打 tag，也没有发布任何版本。
- **v0.22.0 tag 与 Release**：待用户授权。RC2 [#401](https://github.com/lingshf/ai-native-erp/pull/401) 已备好、未发布。
- **M2-05 真实演练、M2-06 的 A / B / C 选择、Dependabot**：待用户授权。
- **P12（是否采用本机模型）**：待用户决策，不代定。
- **Backlog 开放项**：KDOC-14 记 done 后，`git grep -n -E "\| (todo|blocked|in_progress)( |\||（)" -- design/tasks/backlog/` 在本收尾分支上无输出。

## 5. 核对命令

均在 main `5ce76d5` 上运行（最后一条在本收尾分支上运行）：

- `gh pr view <n> --json title,mergeCommit,reviews`，取 #464–#469；
- `gh api repos/lingshf/ai-native-erp/pulls/<n>/reviews`：按 `VERDICT:` 行计打回，取批准评审中的 QA 行；
- `gh api repos/lingshf/ai-native-erp/issues/<n>/comments`，取 #465–#469：合并后核对评论 4 条；无独立 QA 结论；
- `gh api "repos/lingshf/ai-native-erp/actions/runs?head_sha=<sha>&branch=main"`，取 `4d296bf`、`ee90deb`、`2a65710`、`33809e1`、`2fb0096`、`5ce76d5`：6 个 Full run 都 success；
- `node <保存位置>\s30-measure.cjs <合并提交> <被拆文件与新文件>`（[S30 统一量法](../tasks/S30.md#s30-统一量法)），输出全文见三条合并后复测评论；
- `git diff --name-only bae5d59 5ce76d5 -- packages`：32 个文件；`git diff --name-only bae5d59 5ce76d5 -- '*test*'`、`git diff --stat bae5d59 5ce76d5 -- docs/ai-assistant.md`：输出为空；
- `node files/fnlen.cjs packages/web/src packages/core/src packages/infra/src`，分别在 `bae5d59` 与 `5ce76d5` 上取第 1 列大于 80 的行：52 与 45；
- `git ls-remote --tags origin`：最新为 `v0.21.0`；`gh pr list --state open`：只有 Dependabot #11、#389、#390；
- `git grep -n -E "\| (todo|blocked|in_progress)( |\||（)" -- design/tasks/backlog/`：无输出。
