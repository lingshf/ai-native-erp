# S29 Sprint 评审（KGAP-16 定范围 + S28 文档遗留，设计 / 产品）

- 作者：设计 / 产品负责人。核对时点：main `a2ba5f6982ae0ebc89e19813944cee0db9e4122c`（#462 合并后）。数字、状态、PR 号与 SHA 都以当时 `gh` / `git` 的输出为准，命令见 §5。格式沿用 [S28 评审](S28-review.md)。
- 对照基准：[S29 计划](../tasks/S29.md)（D605–D607）。各项验收以 [KGAP 表](../tasks/backlog/KGAP.md)、[KDOC 表](../tasks/backlog/KDOC.md)的对应行，以及 S29 的[跨文件验收](../tasks/S29.md#跨文件验收d595按文件列验收句)为准。
- 范围：S29 计划基线 `9631098`（S28 收尾 [#457](https://github.com/lingshf/ai-native-erp/pull/457)）之后合并的 [#458](https://github.com/lingshf/ai-native-erp/pull/458)–[#462](https://github.com/lingshf/ai-native-erp/pull/462)，共 5 个 PR。本评审所在 PR 计入下一 Sprint。
- 只核对事实，只改 `design/` 文档。

## 1. 结论

**S29 accepted，无偏差。** 计划的四项（KGAP-16、KGAP-15 复查节奏、KDOC-12、KDOC-13）在本收尾 PR 中按[执行状态](../tasks/S29.md#执行状态)记为 done，“合并后项”一列已全部清空（逐项证据见 §2.1）。没有触发 D605 的砍项顺序。按 D605，本 Sprint 不承诺版本号，不做发布候选；须用户授权的事项都没有执行。

- **用户可见变化 0 项**：`git diff --name-only 9631098 a2ba5f6` 列出 9 个文件，都在 `design/` 与 `docs/` 下；`git diff --stat 9631098 a2ba5f6 -- packages` 输出为空。
- **迁移 0 个**：`packages/` 无改动，最新迁移仍为 020（`packages/infra/src/storage/migrations.ts:106`），下一个迁移号为 021。
- **新增决定 D605–D607**（3 条，均在计划 [#458](https://github.com/lingshf/ai-native-erp/pull/458) 中）：D605 接受计划；D606 KGAP-16 改验收、不做输入路径；D607 KGAP-15 的复查节奏。收尾没有新增决定。
- **本 Sprint 修正的事实不符 4 处**（§2.3）。修正后都已在合并提交上复核，结论都是 PASS。
- **评审打回 3 次**：5 个 PR 中，#459、#460 直接批准；#458、#461、#462 各打回 1 轮（§2.2）。按第一个阻塞点分：
  - 计划的验收与证据计划 1 次（#458）；
  - 事实不准 2 次（#461 范围措辞、#462 状态描述过时）。

  分析见 [S29 回顾](S29-retro.md)。
- **S29 范围内的 main Full**：5 个合并提交中 3 个 success、2 个 cancelled、0 个 failure。两个 cancelled（`af50e47`、`e5af3ed`）之后的合并提交 `9a27329` 为绿，它包含这两个提交（§2.2）。
- **新登记 KDOC-14**（P3，todo，交 KL，下一 Sprint 候选，TL 指派）：KDOC-13 合并后核对时发现的引用范围问题，不在 S29 做（§4）。

## 2. 目标与验收逐项核对

### 2.1 D605 目标

| 目标 / 项 | 判定 | 证据（PR / SHA / 复核） |
| --- | --- | --- |
| 1. KGAP-16 定范围并完成（D606） | accepted | **改写**：[#461](https://github.com/lingshf/ai-native-erp/pull/461) `9a27329`，改 `docs/user/backup-and-legacy.md:82`、`:84` 与 `docs/README.md` 的口径 5 句。打回 1 轮（[6083136274](https://github.com/lingshf/ai-native-erp/pull/461#pullrequestreview-6083136274)）后批准（[6083145753](https://github.com/lingshf/ai-native-erp/pull/461#pullrequestreview-6083145753)），QA N/A（只改文档，未改导入行为）。<br>**Developer 复核**：送审时两轮（[评论 7209177016](https://github.com/lingshf/ai-native-erp/pull/461#issuecomment-7209177016)、[7209182374](https://github.com/lingshf/ai-native-erp/pull/461#issuecomment-7209182374)）；合并后在 `9a27329af44f07fcb2e3d2660b3a19695bf442dc` 上复核 PASS，`:82` 5 条、`:84` 4 条断言逐条一致（[评论 7209193875](https://github.com/lingshf/ai-native-erp/pull/461#issuecomment-7209193875)，Developer 会话 `kgap-16-postmerge.md`）。<br>**矩阵改钉**：[#462](https://github.com/lingshf/ai-native-erp/pull/462) `a2ba5f6`，打回 1 轮（[6083163191](https://github.com/lingshf/ai-native-erp/pull/462#pullrequestreview-6083163191)）后批准（[6083169341](https://github.com/lingshf/ai-native-erp/pull/462#pullrequestreview-6083169341)）。`docs/README.md:115` 与 `:132` 的 backup-and-legacy 现行钉点改为 `9a27329…`，`5a45630`（#443）归为历史；`:73` 保留 #420 当批的历史钉点（评审认可，不重钉）；`:90` 记 not_applicable 并指向 `:115`。<br>**场景 03**：`docs/README.md:122` 记 not_applicable（D606），不计 PASS；没有格升级 |
| 2. KDOC-13（BUG-05 跨文件项） | accepted | [#460](https://github.com/lingshf/ai-native-erp/pull/460) `e5af3ed`，直接批准（[6083136244](https://github.com/lingshf/ai-native-erp/pull/460#pullrequestreview-6083136244)），QA N/A。`docs/flows/invoice-detail-flow.md:35` 改为前后端同一小写 UUIDv4 规则，引用钉 `34ec97c`。Product/Design 合并后核对 PASS（[评论 7209187226](https://github.com/lingshf/ai-native-erp/pull/460#issuecomment-7209187226)），附一条非阻塞说明，已登记为 KDOC-14（§4）。BUG-05 的跨文件验收（S28 D604 偏差）由此满足 |
| 2. KDOC-12 | accepted | [#459](https://github.com/lingshf/ai-native-erp/pull/459) `af50e47`，直接批准（[6083136396](https://github.com/lingshf/ai-native-erp/pull/459#pullrequestreview-6083136396)），QA N/A。`docs/user/trade.md:162` 的引语与 `packages/web/src/ui/trade-order-labels.ts:122` 首句逐字一致。Product/Design 合并后核对 PASS（[评论 7209186961](https://github.com/lingshf/ai-native-erp/pull/459#issuecomment-7209186961)） |
| 3. KGAP-15 复查节奏（D607） | accepted | 计划 [#458](https://github.com/lingshf/ai-native-erp/pull/458) `67a707d` 已在 KGAP-15 行登记。S29 内 `docs/ai-assistant.md` 没有改动（`git diff --stat 9631098 a2ba5f6 -- docs/ai-assistant.md` 输出为空），改动触发没有发生，所以本 Sprint 不复查。下次在 S31 计划时复查 |
| 4. S28 回顾行动 1–3 | 见回顾 | 行动 1 **未达成**：#461 因范围措辞被打回；行动 2 不适用（本 Sprint 没有 QA 场景）；行动 3 **达成**：没有“合并后项”未清空就记 done 的任务。详见 [S29 回顾](S29-retro.md#s28-回顾行动项检查) |
| 版本 | 不适用（D605） | 本 Sprint 不承诺版本号，不做发布候选；CHANGELOG 没有改 |
| BUG-05 打版本、v0.22.0 tag 与 Release、M2-05、M2-06、Dependabot、P12 | 待授权或待决策（不在 S29 范围） | 都没有执行。远端 tag 最新仍为 `v0.21.0`（`git ls-remote --tags origin`） |
| 门禁：覆盖最后一个合并提交的 main Full 为绿 | 达成 | `a2ba5f6` [Full 45935880613](https://github.com/lingshf/ai-native-erp/actions/runs/45935880613) success。按 S29 证据计划，Full 只作门禁 |

### 2.2 各 PR 评审

评审都以 COMMENTED 状态提交，结论按正文的 `VERDICT:` 行计，`CHANGES_REQUESTED` 记为打回。“打回点”一栏只写主要原因，分类口径见[回顾](S29-retro.md#打回分类)。5 个 PR 的批准评审都写明 QA N/A（计划或纯文档）。

| PR | 合并 / 轮次 | main Full | 打回点 |
| --- | --- | --- | --- |
| S29 计划 [#458](https://github.com/lingshf/ai-native-erp/pull/458) | `67a707d`；1 轮（[6083096278](https://github.com/lingshf/ai-native-erp/pull/458#pullrequestreview-6083096278)），批准 [6083107622](https://github.com/lingshf/ai-native-erp/pull/458#pullrequestreview-6083107622) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45935115423) | 验收与证据计划：<br>• KGAP-16 的合并后改钉漏列 `docs/README.md:132` 存储总矩阵行上 `backup-and-legacy.md` 的现行钉点；<br>• KDOC-13 的 grep 只命中 `TradeInvoiceDetail.tsx:29` 注释，没有命中 `:30` 校验规则；<br>• D607 没有写明 S29 内的改动是否提前触发复查 |
| KDOC-12 [#459](https://github.com/lingshf/ai-native-erp/pull/459) | `af50e47`；直接批准 [6083136396](https://github.com/lingshf/ai-native-erp/pull/459#pullrequestreview-6083136396) | cancelled（[45935457961](https://github.com/lingshf/ai-native-erp/actions/runs/45935457961)；之后的 `9a27329` 绿） | — |
| KDOC-13 [#460](https://github.com/lingshf/ai-native-erp/pull/460) | `e5af3ed`；直接批准 [6083136244](https://github.com/lingshf/ai-native-erp/pull/460#pullrequestreview-6083136244) | cancelled（[45935496851](https://github.com/lingshf/ai-native-erp/actions/runs/45935496851)；之后的 `9a27329` 绿） | — |
| KGAP-16 [#461](https://github.com/lingshf/ai-native-erp/pull/461) | `9a27329`；1 轮（[6083136274](https://github.com/lingshf/ai-native-erp/pull/461#pullrequestreview-6083136274)），批准 [6083145753](https://github.com/lingshf/ai-native-erp/pull/461#pullrequestreview-6083145753) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45935585810) | 事实不准（范围措辞）：<br>• `:84` 写成“所有账户的旧分录都没有带伙伴维度的标记行”，而教学来源的普通科目可以带维度，不可达只成立于 AP/AR 控制科目；<br>• `:82` 没写比较的前提（须有匹配维度的标记行），读者会以为给出字段本身就多一条阻断校验 |
| 矩阵改钉 [#462](https://github.com/lingshf/ai-native-erp/pull/462) | `a2ba5f6`；1 轮（[6083163191](https://github.com/lingshf/ai-native-erp/pull/462#pullrequestreview-6083163191)），批准 [6083169341](https://github.com/lingshf/ai-native-erp/pull/462#pullrequestreview-6083169341) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45935880613) | 事实不准（状态描述过时）：`docs/README.md:122` 仍写“Developer 复核与改钉待合并后”，与同一 PR 的 `:115`、`:132` 及 #461 的复核评论冲突 |

### 2.3 本 Sprint 修正的事实不符

| 页面 | 来源 | 不符数 | 修正 PR | 合并后复核 |
| --- | --- | --- | --- | --- |
| `docs/user/backup-and-legacy.md:82`、`:84` | KGAP-16（D606） | 2（口径 5 逐伙伴比较的两句，按 D606 改为 CLI 不可达并限定于 AP/AR 控制科目） | [#461](https://github.com/lingshf/ai-native-erp/pull/461) | Developer PASS |
| `docs/user/trade.md:162` | KDOC-12 | 1（非原文引语） | [#459](https://github.com/lingshf/ai-native-erp/pull/459) | Product/Design PASS |
| `docs/flows/invoice-detail-flow.md:35` | KDOC-13 | 1（旧的“36 位 documentId”规则与行号） | [#460](https://github.com/lingshf/ai-native-erp/pull/460) | Product/Design PASS |

**合计 4 处。** `docs/README.md` 中随 KGAP-16 改写的矩阵句与改钉（#461、#462）属于证据同步，不计入本表。

## 3. 补充裁定与偏差

S29 期间的决定（原文见 [S29 决定表](../tasks/S29.md#s29-期间决定)）：

- D605：接受计划，不写代码，不承诺版本号；砍项顺序 KDOC-12 → KDOC-13 → KGAP-16。没有触发砍项。
- D606：KGAP-16 改验收，不做输入路径。失效条件（任一来源开始支持控制科目分录带伙伴维度）在本 Sprint 内没有出现：`git diff --stat 9631098 a2ba5f6 -- packages` 输出为空。
- D607：KGAP-15 的复查节奏。S29 内没有触发。

**偏差**：无。S28 记下的 BUG-05 跨文件偏差（D604）已由 KDOC-13 消除；BUG 表 BUG-05 行在本收尾 PR 中去掉“待 KL”的注记。

**缺陷**：本 Sprint 没有发现新的产品缺陷，BUG-06 未使用。

## 4. 未完成与遗留

- **KDOC-14**（P3，todo，Knowledge Lead，下一 Sprint 候选，TL 指派）：`docs/flows/invoice-detail-flow.md:35` 的引用 `TradeInvoiceDetail.tsx:51–57` 应扩为 `:51–58`。在 `34ec97c` 上，`:58` 的 `enabled: wellFormed` 才是实际不发请求的那一行（`git show 34ec97c:packages/web/src/TradeInvoiceDetail.tsx` 第 58 行）。#460 的批准评审写的是“`:57` 的 `enabled: wellFormed`”，与源码行号差一行，以源码为准。
- **KGAP-15 / KGAP-04 缺口**：仍开放。按 D607，下次在 S31 计划时复查，或在 `docs/ai-assistant.md` §3、§7 有改动时提前复查。
- **BUG-05 是否打版本**：**待用户授权**。没有打 tag，也没有发布任何版本。
- **v0.22.0 tag 与 Release**：待用户授权。RC2 [#401](https://github.com/lingshf/ai-native-erp/pull/401) 已备好、未发布。
- **M2-05 真实演练、M2-06 的 A / B / C 选择、Dependabot**：待用户授权。
- **P12（是否采用本机模型）**：待用户决策，不代定。
- **矩阵仍为 partial 的格**：见 [docs/README](../../docs/README.md) “KGAP-10/11/12/13 复核与 QA（S28）”一节。本 Sprint 没有格升 covered。

## 5. 核对命令

均在 main `a2ba5f6` 上运行：

- `gh pr view <n> --json title,state,mergeCommit,headRefOid,files`，取 #458–#462；
- `gh api repos/lingshf/ai-native-erp/pulls/<n>/reviews`：按 `VERDICT:` 行计打回，取批准评审中的 QA 行；
- `gh api repos/lingshf/ai-native-erp/issues/<n>/comments`：#459、#460、#461 的复核评论；
- `gh api "repos/lingshf/ai-native-erp/actions/runs?head_sha=<sha>&branch=main"`，取 `67a707d`、`af50e47`、`e5af3ed`、`9a27329`、`a2ba5f6`：5 个 Full run；
- `git diff --name-only 9631098 a2ba5f6`：9 个文件，都在 `design/`、`docs/` 下；
- `git diff --stat 9631098 a2ba5f6 -- packages docs/ai-assistant.md`：输出为空；
- `git grep -n -e 9a27329 -e not_applicable a2ba5f6 -- docs/README.md`：`:73`、`:90`、`:115`、`:122`、`:132` 等命中；
- `git ls-remote --tags origin`：最新为 `v0.21.0`。
