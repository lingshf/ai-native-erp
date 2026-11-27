# S31 Sprint 评审（② 存量拆分三泳道 + KGAP-15 复查，设计 / 产品）

- 作者：设计 / 产品负责人。核对时点：main `2ee594046373f74d745e043c2ec1ec916a827a18`（#476 合并后）。数字、状态、PR 号与 SHA 都以当时 `gh` / `git` 的输出为准，命令见 §5。格式沿用 [S30 评审](S30-review.md)。
- 对照基准：[S31 计划](../tasks/S31.md)（D617–D624）。各项验收以 [KDOC 表](../tasks/backlog/KDOC.md) KDOC-15 行、[REFAC-38](../tasks/REFAC-38-dimensions-page-split.md)、[REFAC-39](../tasks/REFAC-39-trade-reporting-repository-split.md)、[REFAC-40](../tasks/REFAC-40-build-reports-split.md) 任务书，以及 S31 的[三项 REFAC 共用要求](../tasks/S31.md#三项-refac-共用可读性与嵌套复验)、[跨文件验收](../tasks/S31.md#跨文件验收d595按文件列验收句)为准。
- 范围：S31 计划基线 `67db1e3`（S30 收尾 [#470](https://github.com/lingshf/ai-native-erp/pull/470)）之后合并的 [#471](https://github.com/lingshf/ai-native-erp/pull/471)–[#476](https://github.com/lingshf/ai-native-erp/pull/476)，共 6 个 PR。本评审所在 PR 计入下一 Sprint。
- 只核对事实，只改 `design/` 文档。

## 1. 结论

**S31 accepted，无计划偏差。** 三项 REFAC 在本收尾 PR 中按[执行状态](../tasks/S31.md#执行状态)记为 done，“合并后项”已清空：Product/Design 在合并提交上复测都是 PASS，独立 QA 结论都在合并前发在 PR 上（§2.2）。KDOC-15 已合并、Product/Design 核对 PASS，但还剩一项合并后项：KL 把 `docs/ai-assistant.md` 的钉点改到合并提交（D561），因此记为 in_progress，转入 S32（§4）。没有触发 D618 的砍项规则。按 D618，本 Sprint 不承诺版本号，不做发布候选；须用户授权的事项都没有执行。

- **用户可见变化 0 项**：三项 REFAC 都按任务书证明不改行为（两侧原始记录逐字节相同，§2.2）；KDOC-15 只改文档。REFAC-38 的维度路由 chunk 与入口 chunk 各 +332 B，在 +700 B 硬上限内（评审 [6084312008](https://github.com/lingshf/ai-native-erp/pull/475#pullrequestreview-6084312008)）。
- **迁移 0 个**：最新迁移仍为 020（`packages/infra/src/storage/migrations.ts:106`），下一个迁移号为 021。
- **写入域**：`git diff --name-only 67db1e3 2ee5940 -- packages` 列出 20 个文件，全部落在三条泳道的冲突域内（`web/src/Dimensions.tsx` 与 `web/src/dimensions/` 13 个、`infra/src/storage/trade-reporting*.ts` 4 个、`core/src/domain/reports.ts` 与 `report-*.ts` 3 个）；`git diff --name-only 67db1e3 2ee5940 -- '*test*'` 输出为空，没有改测试文件。`docs/` 只有 KDOC-15 改的三个文件。
- **② 存量**：用计划选题时的 `fnlen.cjs`，超过 80 行的函数由 `67db1e3` 的 45 个降到 `2ee5940` 的 41 个；少掉的 4 个正是目标函数（`DimensionEditor`、`DimensionPane`、`tradeReportingRepository`、`buildReports`），没有新增。
- **新增决定 D617–D624**（8 条）：D617–D620 在计划 [#471](https://github.com/lingshf/ai-native-erp/pull/471)，D621–D623 在任务书 [#473](https://github.com/lingshf/ai-native-erp/pull/473)，D624（TL 决定，REFAC-38 的 R5a 例外）在本收尾 PR 补记。
- **评审打回 5 次**：6 个 PR 中 5 个各打回 1 轮后批准，#474 一次批准（§2.2）。按第一个阻塞点分：
  - 计划在 TL 确认后的状态同步 1 次（#471）；
  - 文档验收句未满足 1 次（#472）；
  - 事实不准（任务书参数计数）1 次（#473）；
  - 任务书约束未满足、由 TL 定例外 1 次（#475）；
  - 原始证据不可复现 1 次（#476）。

  “仅待原始证据”0 次，等价证据漏分支 0 次。分析见 [S31 回顾](S31-retro.md)。
- **S31 范围内的 main Full**：6 个合并提交全部 success（§2.2）。

## 2. 目标与验收逐项核对

### 2.1 D618 目标

| 目标 / 项 | 判定 | 证据（PR / SHA / 复核） |
| --- | --- | --- |
| 1. KGAP-15 复查 → KDOC-15（D620） | accepted（合并后项 1 项转 S32） | [#472](https://github.com/lingshf/ai-native-erp/pull/472) `28d26cd`：`docs/ai-assistant.md:41`、`:78` 链接 GitHub Docs [Hosting of models for GitHub Copilot](https://docs.github.com/en/copilot/reference/ai-models/model-hosting)，不复述承诺，写明 GitHub 自身服务端保存与使用仍是缺口；`docs/README.md:94`、`:134`、`:173` 与 `docs/tradeoffs.md:25` 改为“部分有官方说明”；矩阵不升 covered。打回 1 轮（`:78` 缺链接）后批准，QA N/A。Product/Design 合并后核对 PASS（[评论 7211782076](https://github.com/lingshf/ai-native-erp/pull/472#issuecomment-7211782076)）。`design/ai-assistant-facts.md:70` 由本收尾 PR 同步。KL 改钉点未做（§4） |
| 2. REFAC-38 `Dimensions.tsx`（D621、D624） | accepted | [#475](https://github.com/lingshf/ai-native-erp/pull/475) `9321a6e`。改前 `DimensionEditor` 215 / `DimensionPane` 126 行；改后最长 79 行（`DimensionEditor`）、最深 3 层（`parseDraftFields`），`Dimensions.tsx` 586 → 130 行（上限 200），新文件 12 个、最大 102 行（上限 150）。D624：`Draft` 作为 R5a 例外，评审复核类型等价后批准。独立 QA PASS（[评论 7211438778](https://github.com/lingshf/ai-native-erp/pull/475#issuecomment-7211438778)）。Product/Design 合并后复测 PASS（[评论 7211724275](https://github.com/lingshf/ai-native-erp/pull/475#issuecomment-7211724275)） |
| 2. REFAC-39 `tradeReportingRepository`（D622） | accepted | [#476](https://github.com/lingshf/ai-native-erp/pull/476) `2ee5940`。改前 143 行（内层 `tradeReconciliation` 76）；改后最长 68 行、最深 1 层，`trade-reporting.ts` 255 → 75 行（上限 100），新文件 3 个、最大 90 行（上限 150）。R5a 两侧 13 项 SQL / 参数源文本逐字节相同；R4 夹具改为确定性构建后，base、head 各 45 例输出逐字节相同（固定 gist 修订 `fc36280`）；按 D622 不跑 Bench。独立 QA 首轮 FAIL（[评论 7211683870](https://github.com/lingshf/ai-native-erp/pull/476#issuecomment-7211683870)，R4 原件不可复现，未发现产品行为差异），第二轮 PASS（[评论 7211752343](https://github.com/lingshf/ai-native-erp/pull/476#issuecomment-7211752343)）。Product/Design 合并后复测 PASS（[评论 7211784949](https://github.com/lingshf/ai-native-erp/pull/476#issuecomment-7211784949)，含 R8b） |
| 2. REFAC-40 `buildReports`（D623） | accepted | [#474](https://github.com/lingshf/ai-native-erp/pull/474) `e988b3f`。改前 107 行；改后 57 行、最深 2 层，`reports.ts` 190 → 138 行（上限 150），新文件 `report-measures.ts` 23 行、`report-sections.ts` 53 行。R2b 声明对照 13 个 `Eq` 检查通过，`trial.rows` 只有声明打印的属性顺序不同（评审 [6084189491](https://github.com/lingshf/ai-native-erp/pull/474#pullrequestreview-6084189491)）。独立 QA PASS（[评论 7211216227](https://github.com/lingshf/ai-native-erp/pull/474#issuecomment-7211216227)）。Product/Design 合并后复测 PASS（[评论 7211246234](https://github.com/lingshf/ai-native-erp/pull/474#issuecomment-7211246234)） |
| 3. S30 回顾行动 1–3 | 见回顾 | 行动 1 **部分达成**、行动 2 **达成**、行动 3 **达成**。详见 [S31 回顾](S31-retro.md#s30-回顾行动项检查) |
| 版本 | 不适用（D618） | 本 Sprint 不承诺版本号，不做发布候选；CHANGELOG 没有改 |
| BUG-05 打版本、v0.22.0 tag 与 Release、M2-05、M2-06、Dependabot、P12 | 待授权或待决策（不在 S31 范围） | 都没有执行。远端 tag 最新仍为 `v0.21.0`（`git ls-remote --tags origin`）；Dependabot [#11](https://github.com/lingshf/ai-native-erp/pull/11)、[#389](https://github.com/lingshf/ai-native-erp/pull/389)、[#390](https://github.com/lingshf/ai-native-erp/pull/390) 仍开着。多订单合并开票按 D617 暂缓（用户授权 TL 代定） |
| 门禁：覆盖最后一个合并提交的 main Full 为绿 | 达成 | `2ee5940` [Full 45953472850](https://github.com/lingshf/ai-native-erp/actions/runs/45953472850) success，12/12 作业 |

### 2.2 各 PR 评审

评审都以 COMMENTED 状态提交，结论按正文的 `VERDICT:` 行计，`CHANGES_REQUESTED` 记为打回。“打回点”一栏只写主要原因，分类口径见[回顾](S31-retro.md#打回分类)。

| PR | 合并 / 轮次 | main Full | QA 留证（S30 行动 3） | 打回点 |
| --- | --- | --- | --- | --- |
| S31 计划 [#471](https://github.com/lingshf/ai-native-erp/pull/471) | `3c571b8`；1 轮（[6083839819](https://github.com/lingshf/ai-native-erp/pull/471#pullrequestreview-6083839819)），批准 [6083850359](https://github.com/lingshf/ai-native-erp/pull/471#pullrequestreview-6083850359) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45945800783) | N/A（仅计划文档） | TL 确认后的状态同步：<br>• 计划首行、决定依据、任务索引仍写“待 TL 确认”；<br>• `backlog/KGAP.md:21` 仍指向旧行号 `:118/:157`，漏 `docs/tradeoffs.md:25` |
| KDOC-15 [#472](https://github.com/lingshf/ai-native-erp/pull/472) | `28d26cd`；1 轮（[6083862334](https://github.com/lingshf/ai-native-erp/pull/472#pullrequestreview-6083862334)），批准 [6083867598](https://github.com/lingshf/ai-native-erp/pull/472#pullrequestreview-6083867598) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45946083370) | N/A（仅文档） | 验收句未满足：`docs/ai-assistant.md:78` 没有可点击的模型托管页链接，且把负责任使用页并作证据 |
| 任务书 [#473](https://github.com/lingshf/ai-native-erp/pull/473) | `61def29`；1 轮（[6083942047](https://github.com/lingshf/ai-native-erp/pull/473#pullrequestreview-6083942047)），批准 [6083952901](https://github.com/lingshf/ai-native-erp/pull/473#pullrequestreview-6083952901) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45947406758) | N/A（仅任务书） | 事实不准：REFAC-39 任务书 `:38`、`:98` 把 `tradeReconciliation` 的参数数写成 18，精确 base 上为 16（5 + 11） |
| REFAC-40 [#474](https://github.com/lingshf/ai-native-erp/pull/474) | `e988b3f`；一次批准 [6084189491](https://github.com/lingshf/ai-native-erp/pull/474#pullrequestreview-6084189491) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45949739799) | [PASS](https://github.com/lingshf/ai-native-erp/pull/474#issuecomment-7211216227)（合并前） | — |
| REFAC-38 [#475](https://github.com/lingshf/ai-native-erp/pull/475) | `9321a6e`；1 轮（[6084312008](https://github.com/lingshf/ai-native-erp/pull/475#pullrequestreview-6084312008)），批准 [6084428845](https://github.com/lingshf/ai-native-erp/pull/475#pullrequestreview-6084428845) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45953067756) | [PASS](https://github.com/lingshf/ai-native-erp/pull/475#issuecomment-7211438778)（合并前） | 任务书约束未满足：R5a 要求 Hook 源文本只归一空白，`useState<Record<string, string>>` 改成了 `useState<Draft>`；TL 定 D624 例外、补类型等价证据后，同一 head 批准 |
| REFAC-39 [#476](https://github.com/lingshf/ai-native-erp/pull/476) | `2ee5940`；1 轮（[6084333401](https://github.com/lingshf/ai-native-erp/pull/476#pullrequestreview-6084333401)），批准 [6084455395](https://github.com/lingshf/ai-native-erp/pull/476#pullrequestreview-6084455395) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45953472850) | 首轮 [FAIL](https://github.com/lingshf/ai-native-erp/pull/476#issuecomment-7211683870)，第二轮 [PASS](https://github.com/lingshf/ai-native-erp/pull/476#issuecomment-7211752343)（合并前） | 原始证据不可复现：R4 夹具用 `randomUUID()` 与借用 helper 的随机外部单号、动作 ID，重建后 45 例中 23 例与固定原件不同，违反任务书 `:88` 的无随机值要求；夹具改为确定性构建后，同一 head 批准 |

两个开发 PR 都在同一 head 上补证据或补决定后批准，产品代码没有因评审而改动。

### 2.3 本 Sprint 修正的事实不符

| 页面 | 来源 | 不符数 | 修正 PR | 合并后复核 |
| --- | --- | --- | --- | --- |
| `docs/ai-assistant.md:41`、`:78`；`docs/README.md:94`、`:134`、`:173`；`docs/tradeoffs.md:25` | KDOC-15（D620） | 6 行缺口句改为“部分有官方说明，GitHub 服务端保存仍是缺口”（`:134` 一行两处） | [#472](https://github.com/lingshf/ai-native-erp/pull/472) | Product/Design PASS |
| `design/ai-assistant-facts.md:70` | KDOC-15 跨文件验收 | 1（“仓库里没有记录”改为指向设计页的新链接，并写明 GitHub 服务端保存仍无专门说明） | 本收尾 PR | — |

**合计 7 行。** #473 的参数计数错误在任务书合并前修正，不在已合并文档中，不计入本表。

## 3. 补充裁定与偏差

S31 期间的决定（原文见 [S31 决定表](../tasks/S31.md#s31-期间决定)）：

- D617：多订单合并开票暂缓（方案 C），用户授权 TL 代定。
- D618：接受计划；砍项依次 REFAC-40、REFAC-39、REFAC-38，KDOC-15 不砍。没有触发砍项。
- D619：开发泳道排 REFAC-38..40。失效条件（用户授权 M2-05/06）在本 Sprint 内没有出现。
- D620：KGAP-15 复查部分找到，登记 KDOC-15，已由 #472 落地。
- D621–D623：三项 REFAC 不改行为，见 §2.1。
- D624（收尾补记）：REFAC-38 的 `Draft` 作为 R5a 例外；TL 决定，评审复核类型等价后批准。

**偏差**：计划层面无。

**不改行为任务中发现的不可达分支**（两侧都不可达，按任务书原样保留，未在 REFAC 中修）：

- REFAC-40：`profit` 勾稽的不通过分支（`packages/core/src/domain/reports.ts:74`）；
- REFAC-38：非 `SyntaxError` 重抛（base `Dimensions.tsx:443`，现 `packages/web/src/dimensions/dimension-draft.ts:58`）。

两者都是 S30 行动 2“先列分支清单”的产物，登记为 Backlog 候选，见 [S31 收尾去向](../tasks/S31.md#sprint-收尾去向)。

**缺陷**：本 Sprint 没有发现新的产品缺陷，BUG-06 未使用。

## 4. 未完成与遗留

- **KDOC-15 钉点**：`docs/README.md:134` 中 `docs/ai-assistant.md` 仍钉 `ff196c3`（#452），按 D561 由 KL 另批改到 `28d26cd`；改完后 KDOC-15 记 done。本 Sprint 内没有派发，转入 S32。
- **Backlog 候选**：`profit` 勾稽不可达分支、`:443` 不可达重抛，不立任务号，见 §3。
- **② 存量**：`fnlen.cjs` 计超过 80 行的函数仍有 41 个；S32 计划时再选，`business-events/editors.tsx`（`EventEditor` 216）是下一个页面候选。
- **KGAP-15 / KGAP-04 缺口**：GitHub 自身服务端保存仍无专门说明，按 D620 的节奏复查。
- **BUG-05 是否打版本**：**待用户授权**。没有打 tag，也没有发布任何版本。
- **v0.22.0 tag 与 Release**：待用户授权。RC2 [#401](https://github.com/lingshf/ai-native-erp/pull/401) 已备好、未发布。
- **M2-05 真实演练、M2-06 的 A / B / C 选择、Dependabot**：待用户授权。
- **P12（是否采用本机模型）**：待用户决策，不代定。
- **Backlog 开放项**：`git grep -n -E "\| (todo|blocked|in_progress)( |\||（)" -- design/tasks/backlog/` 在本收尾分支上只有 KDOC-15 一行（in_progress，待钉点）。

## 5. 核对命令

均在 main `2ee5940` 上运行（最后一条在本收尾分支上运行）：

- `gh pr view <n> --json mergeCommit,baseRefOid,mergedAt`，取 #471–#476；
- `gh api repos/lingshf/ai-native-erp/pulls/<n>/reviews`：按 `VERDICT:` 行计打回，取打回点与批准；
- `gh api repos/lingshf/ai-native-erp/issues/<n>/comments`，取 #472、#474–#476：合并后核对评论 4 条；独立 QA 结论 4 条（#476 两轮），时间都早于对应 PR 的 `mergedAt`；
- `gh api "repos/lingshf/ai-native-erp/actions/runs?head_sha=<sha>&branch=main"`，取 `3c571b8`、`28d26cd`、`61def29`、`e988b3f`、`9321a6e`、`2ee5940`：6 个 Full run 都 success；
- `node <保存位置>\<统一量法脚本>.cjs <合并提交> <被拆文件与新文件>`（[S30 统一量法](../tasks/S30.md#s30-统一量法)），输出全文见三条合并后复测评论；
- `git diff --name-only 67db1e3 2ee5940 -- packages`：20 个文件；`git diff --name-only 67db1e3 2ee5940 -- '*test*'`：输出为空；`git diff --name-only 67db1e3 2ee5940 -- docs README.md`：`docs/README.md`、`docs/ai-assistant.md`、`docs/tradeoffs.md`；
- `node files/fnlen.cjs packages/web/src packages/core/src packages/infra/src`，分别在 `67db1e3` 与 `2ee5940` 上取第 1 列大于 80 的行：45 与 41，差集正好是 4 个目标函数；
- `git grep -n -e "服务端数据处理" -e "服务端的数据处理" 28d26cd -- docs`：6 行；
- `git ls-remote --tags origin`：最新为 `v0.21.0`；`gh pr list --state open`：只有 Dependabot #11、#389、#390；
- `git grep -n -E "\| (todo|blocked|in_progress)( |\||（)" -- design/tasks/backlog/`：只有 KDOC-15 一行。
