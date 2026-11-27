# S32 Sprint 评审（② 存量拆分三泳道，设计 / 产品）

- 作者：设计 / 产品负责人。核对时点：main `fdb2c49`（#484 合并后）。数字、状态、PR 号与 SHA 都以当时 `gh` / `git` 的输出为准，命令见 §5。格式沿用 [S31 评审](S31-review.md)。
- 对照基准：[S32 计划](../tasks/S32.md)（D625–D632）。各项验收以 [REFAC-41](../tasks/REFAC-41-business-event-editor-split.md)、[REFAC-42](../tasks/REFAC-42-business-event-routes-split.md)、[REFAC-43](../tasks/REFAC-43-trade-config-validation-split.md) 任务书，以及 S32 的[三项 REFAC 共用要求](../tasks/S32.md#三项-refac-共用可读性与嵌套复验)、[跨文件验收](../tasks/S32.md#跨文件验收d595按文件列验收句)为准。
- 范围：S32 计划基线 `34da911`（S31 收尾 [#477](https://github.com/lingshf/ai-native-erp/pull/477)）之后合并的 [#480](https://github.com/lingshf/ai-native-erp/pull/480)–[#484](https://github.com/lingshf/ai-native-erp/pull/484)，共 5 个 PR。本评审所在 PR 计入下一 Sprint。
- 只核对事实，只改 `design/` 文档。

## 1. 结论

**S32 accepted，无计划偏差。** 三项 REFAC 在本收尾 PR 中按[执行状态](../tasks/S32.md#执行状态)记为 done，“合并后项”已清空：独立 QA 结论都在合并前发在 PR 上，Product/Design 在合并提交上复测都是 PASS（§2.2）。没有触发 D625 的砍项规则。按 D625，本 Sprint 不承诺版本号，不做发布候选；须用户授权的事项都没有执行。

- **用户可见变化 0 项**：三项 REFAC 都按任务书证明不改行为（两侧原始记录逐字节相同，§2.1）。REFAC-41 的业务事件页 chunk gzip +184 B，在 +700 B 硬上限内（[#483 正文](https://github.com/lingshf/ai-native-erp/pull/483) R7）。
- **迁移 0 个**：最新迁移仍为 020（`packages/infra/src/storage/migrations.ts:106`），下一个迁移号为 021。
- **写入域**：`git diff --name-only 34da911 fdb2c49 -- packages` 列出 13 个文件，全部落在三条泳道的冲突域内（`web/src/business-events/` 5 个、`infra/src/http/business-event*.ts` 5 个、`core/src/domain/trade-master*.ts` 3 个）；`git diff --name-only 34da911 fdb2c49 -- '*test*'` 输出为空，没有改测试文件。`packages/` 之外只改了 `design/`，`docs/` 未改。
- **② 存量**：用计划选题时的 `fnlen.cjs`，超过 80 行的函数由 `34da911` 的 41 个降到 `fdb2c49` 的 37 个；少掉的 4 个正是目标函数（`EventEditor`、`ClearingEditor`、`registerBusinessRoutes`、`validateTradeConfig`），没有新增。
- **新增决定 D625–D632**（8 条）：D625–D626 在计划 [#480](https://github.com/lingshf/ai-native-erp/pull/480)，D627–D629 在任务书 [#481](https://github.com/lingshf/ai-native-erp/pull/481)，D630–D632（TL 在执行中决定，R4 夹具约束冲突）在本收尾 PR 补记。
- **评审打回 4 次**，都在 `design/` 的 PR：#480、#481 各打回 2 轮后批准；三个开发 PR 都一次批准（§2.2）。按第一个阻塞点分：
  - 事实不准（路由可达性、方法计数）2 次（#480）；
  - 任务书条款互相冲突 1 次（#481 第 1 轮）；
  - 比较规则未对照精确原文、会误判 1 次（#481 第 2 轮）。

  “原始证据不可复现”0 次，“仅待原始证据”0 次，等价证据漏分支 0 次。分析见 [S32 回顾](S32-retro.md)。
- **S32 范围内的 main Full**：5 个合并提交全部 success（§2.2）。

## 2. 目标与验收逐项核对

### 2.1 D625 目标

| 目标 / 项 | 判定 | 证据（PR / SHA / 复核） |
| --- | --- | --- |
| REFAC-41 `business-events/editors.tsx`（D627、D632） | accepted | [#483](https://github.com/lingshf/ai-native-erp/pull/483) `a3dab87`。改前 `EventEditor` 216 / `ClearingEditor` 116 行；改后 `EventEditor` 77、`ClearingEditor` 59 行，最长 79 行（`CashServiceFields`）、最深 3 层；`editors.tsx` 345 → 106 行（上限 150），新文件 4 个、最大 121 行（上限 150）。`ClearingEditor` 保留自身 Hook，未清项表与已选行抽成无 Hook 展示组件。R4 夹具两次独立重建哈希相同；R4 第 1 项 grep 按 D632 只命中 `vi.spyOn(crypto, "randomUUID")` 桩行。R7 chunk gzip +184 B / +700 B。一次批准 [6085129433](https://github.com/lingshf/ai-native-erp/pull/483#pullrequestreview-6085129433)。独立 QA PASS（[评论 7213178951](https://github.com/lingshf/ai-native-erp/pull/483#issuecomment-7213178951)）。Product/Design 合并后复测 PASS（[评论 7213216540](https://github.com/lingshf/ai-native-erp/pull/483#issuecomment-7213216540)） |
| REFAC-42 `registerBusinessRoutes`（D628、D630、D631） | accepted | [#484](https://github.com/lingshf/ai-native-erp/pull/484) `fdb2c49`。改前 120 行（内层 `ready` 14）；改后 `registerBusinessRoutes` 9 行，最长 43 行、最深 3 层（两个含循环的分组注册函数）；`business-events.ts` 153 → 16 行（上限 100），新文件 4 个、最大 59 行（上限 150）。R4 按路由 × 方法矩阵逐格，base、head 各两次共 4 份输出 SHA-256 相同；响应 `date` 头按 D630 在探针侧关闭，`randomUUID` 按 D631 只在 `vi.mock` 工厂内替换。一次批准 [6085178087](https://github.com/lingshf/ai-native-erp/pull/484#pullrequestreview-6085178087)。独立 QA PASS（[评论 7213493643](https://github.com/lingshf/ai-native-erp/pull/484#issuecomment-7213493643)）。Product/Design 合并后复测 PASS（[评论 7213541590](https://github.com/lingshf/ai-native-erp/pull/484#issuecomment-7213541590)） |
| REFAC-43 `validateTradeConfig`（D629） | accepted | [#482](https://github.com/lingshf/ai-native-erp/pull/482) `ceeebe2`。改前 90 行（内层 `taxes` 5）；改后 25 行、1 层，最长 43 行（`assertTradeAccount`，未改动）、最深 3 层（`checkTradeDefaultDimensions`，base 已是 3 层）；`trade-master.ts` 313 → 241 行（上限 260），新文件 `trade-master-validation.ts` 82 行、`trade-master-checks.ts` 19 行。R4 夹具 SHA-256 `897e37bd…6fc11`，base、head 各两次重建一致。一次批准 [6085043783](https://github.com/lingshf/ai-native-erp/pull/482#pullrequestreview-6085043783)。独立 QA PASS（[评论 7212994827](https://github.com/lingshf/ai-native-erp/pull/482#issuecomment-7212994827)）。Product/Design 合并后复测 PASS（[评论 7213027314](https://github.com/lingshf/ai-native-erp/pull/482#issuecomment-7213027314)） |
| S31 回顾行动 1（R4 夹具确定性生成） | 见回顾 | **达成**。详见 [S32 回顾](S32-retro.md#s31-回顾行动项检查) |
| 版本 | 不适用（D625） | 本 Sprint 不承诺版本号，不做发布候选；CHANGELOG 没有改 |
| BUG-05 打版本、v0.22.0 tag 与 Release、M2-05、M2-06、Dependabot、P12 | 待授权或待决策（不在 S32 范围） | 都没有执行。远端 tag 最新仍为 `v0.21.0`；Dependabot [#11](https://github.com/lingshf/ai-native-erp/pull/11)、[#389](https://github.com/lingshf/ai-native-erp/pull/389)、[#390](https://github.com/lingshf/ai-native-erp/pull/390) 仍开着 |
| 门禁：覆盖最后一个合并提交的 main Full 为绿 | 达成 | `fdb2c49` [Full 45965437873](https://github.com/lingshf/ai-native-erp/actions/runs/45965437873) success，12/12 作业 |

### 2.2 各 PR 评审

评审都以 COMMENTED 状态提交，结论按正文的 `VERDICT:` 行计，`CHANGES_REQUESTED` 记为打回。“打回点”一栏只写主要原因，分类口径见[回顾](S32-retro.md#打回分类)。

| PR | 合并 / 轮次 | main Full | QA 留证 | 打回点 |
| --- | --- | --- | --- | --- |
| S32 计划 [#480](https://github.com/lingshf/ai-native-erp/pull/480) | `218284a`；2 轮（[6084675890](https://github.com/lingshf/ai-native-erp/pull/480#pullrequestreview-6084675890)、[6084690747](https://github.com/lingshf/ai-native-erp/pull/480#pullrequestreview-6084690747)），批准 [6084704723](https://github.com/lingshf/ai-native-erp/pull/480#pullrequestreview-6084704723) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45957163703) | N/A（仅计划文档） | 事实不准：<br>• 第 1 轮：REFAC-42 验收要求每条路由验证 400/415，但 3 条纯 GET 路由进不了 `ready` 的非 GET 分支；<br>• 第 2 轮：方法计数写成 11/5，源码为 9 个 POST 可达、7 个 GET N/A；405 在允许方法组合里不可达，须与 403 分列 |
| 任务书 [#481](https://github.com/lingshf/ai-native-erp/pull/481) | `60ad4e0`；2 轮（[6084826346](https://github.com/lingshf/ai-native-erp/pull/481#pullrequestreview-6084826346)、[6084852381](https://github.com/lingshf/ai-native-erp/pull/481#pullrequestreview-6084852381)），批准 [6084862736](https://github.com/lingshf/ai-native-erp/pull/481#pullrequestreview-6084862736) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45959362093) | N/A（仅任务书） | • 第 1 轮，条款互相冲突：REFAC-41 要求 `ClearingEditor` 只能整体搬移，又要求它 ≤ 80 行；REFAC-42 允许展开循环和提取分页实参，R5a/R5c 却按原文比较；<br>• 第 2 轮，比较规则会误判：分页回替用一个通用字符串，`openItems`（base `:107-110`）原文带尾逗号，正确实现也会判失败 |
| REFAC-43 [#482](https://github.com/lingshf/ai-native-erp/pull/482) | `ceeebe2`；一次批准 [6085043783](https://github.com/lingshf/ai-native-erp/pull/482#pullrequestreview-6085043783) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45962133059) | [PASS](https://github.com/lingshf/ai-native-erp/pull/482#issuecomment-7212994827)（合并前） | — |
| REFAC-41 [#483](https://github.com/lingshf/ai-native-erp/pull/483) | `a3dab87`；一次批准 [6085129433](https://github.com/lingshf/ai-native-erp/pull/483#pullrequestreview-6085129433) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45963335881) | [PASS](https://github.com/lingshf/ai-native-erp/pull/483#issuecomment-7213178951)（合并前） | —（R4 约束冲突在送审前上报，TL 定 D632） |
| REFAC-42 [#484](https://github.com/lingshf/ai-native-erp/pull/484) | `fdb2c49`；一次批准 [6085178087](https://github.com/lingshf/ai-native-erp/pull/484#pullrequestreview-6085178087) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45965437873) | [PASS](https://github.com/lingshf/ai-native-erp/pull/484#issuecomment-7213493643)（合并前） | —（R4 约束冲突在送审前上报，TL 定 D630、D631） |

三个开发 PR 都一次批准，产品代码没有因评审而改动。

## 3. 补充裁定与偏差

S32 期间的决定（原文见 [S32 决定表](../tasks/S32.md#s32-期间决定)）：

- D625：接受计划；砍项依次 REFAC-43、REFAC-42、REFAC-41。没有触发砍项。
- D626：开发泳道排 REFAC-41..43。失效条件（用户授权 M2-05/06）在本 Sprint 内没有出现。
- D627–D629：三项 REFAC 不改行为，见 §2.1。
- D630（收尾补记）：Node 的 `date` 响应头不受冻结 `Date` 影响；探针侧关闭 `sendDate`，两侧对称，不改产品代码。
- D631（收尾补记）：REFAC-42 的 R4 grep 与 mock 冲突；驱动拆成 fixtures 与 probe 两个文件，probe 中 `randomUUID` 只允许出现在 `vi.mock` 工厂行。
- D632（收尾补记）：REFAC-41 的 R4 grep 与 spyOn 冲突，与 D631 同口径；唯一允许的命中是 `vi.spyOn(crypto, "randomUUID")` 桩行。

**偏差**：计划层面无。

**缺陷**：本 Sprint 没有发现新的产品缺陷，也没有新的不可达分支候选；BUG-06 未使用。

## 4. 未完成与遗留

- **R4 约束冲突的固定口径**：D630–D632 都是“任务书 R4 规则互相冲突”，由开发停下上报、TL 定口径。以后的任务书直接吸收这三条，见 [S32 回顾](S32-retro.md#行动项汇总)行动 2。
- **Backlog 候选**：`profit` 勾稽不可达分支、`:443` 不可达重抛，状态不变，不立任务号（[S31 收尾去向](../tasks/S31.md#sprint-收尾去向)）。
- **② 存量**：`fnlen.cjs` 计超过 80 行的函数还有 37 个；S33 计划时再选。`MasterSettings`（175，`business-events/settings.tsx`）是 S32 选题时留下的下一个页面候选。
- **KGAP-15**：按 D620，S33 计划时复查。
- **多订单合并开票**：按 D617 暂缓。
- **BUG-05 是否打版本**：**待用户授权**。没有打 tag，也没有发布任何版本。
- **v0.22.0 tag 与 Release、M2-05 真实演练、M2-06 的 A / B / C 选择、Dependabot**：待用户授权。
- **P12（是否采用本机模型）**：待用户决策，不代定。
- **Backlog 开放项**：`git grep -n -E "\| (todo|blocked|in_progress)( |\||（)" -- design/tasks/backlog/` 无输出。

## 5. 核对命令

均在 main `fdb2c49` 上运行：

- `gh pr view <n> --json mergeCommit,mergedAt,reviews`，取 #480–#484；
- `gh api repos/lingshf/ai-native-erp/pulls/<n>/reviews`：按 `VERDICT:` 行计打回，取打回点与批准；
- `gh api repos/lingshf/ai-native-erp/issues/<n>/comments`，取 #482–#484：独立 QA 结论 3 条、合并后复测评论 3 条，QA 评论时间都早于对应 PR 的 `mergedAt`；
- `gh api "repos/lingshf/ai-native-erp/actions/runs?head_sha=<sha>&branch=main"`，取 `218284a`、`60ad4e0`、`ceeebe2`、`a3dab87`、`fdb2c49`：5 个 Full run 都 success；
- `node <保存位置>\<统一量法脚本>.cjs <合并提交> <被拆文件与新文件>`（[S30 统一量法](../tasks/S30.md#s30-统一量法)），输出全文见三条合并后复测评论；
- `git diff --name-only 34da911 fdb2c49 -- packages`：13 个文件；`git diff --name-only 34da911 fdb2c49 -- '*test*'`：输出为空；
- `node files/fnlen.cjs packages/web/src packages/core/src packages/infra/src`，分别在 `34da911` 与 `fdb2c49` 上运行：41 与 37 行，差集正好是 4 个目标函数；
- `git ls-remote --tags origin`：最新为 `v0.21.0`；`gh pr list --state open`：只有 Dependabot #11、#389、#390；
- `git grep -n -E "\| (todo|blocked|in_progress)( |\||（)" -- design/tasks/backlog/`：无输出。
