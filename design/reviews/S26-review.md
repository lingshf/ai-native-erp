# S26 Sprint 评审（知识缺口补齐 + 决定索引生成器可靠性 + REFAC-31 R8b 补证，设计 / 产品）

- 作者：设计 / 产品负责人。核对时点：main `bf31631`（#431 合并后），核对时间 2026-11-26（UTC）。数字、状态、PR 号与 SHA 都以当时 `gh` / `git` 的输出为准，命令见 §5。格式沿用 [S25 评审](S25-review.md)。
- 对照基准：[S26 计划](../tasks/S26.md)（D592），各项验收以 [MCF 表](../tasks/backlog/MCF.md)、[KGAP 表](../tasks/backlog/KGAP.md)、[BUG 表](../tasks/backlog/BUG.md)的对应行为准。
- 范围：S26 计划基线 `2d369c5`（S25 收尾 [#417](https://github.com/lingshf/ai-native-erp/pull/417)）之后合并的 [#418](https://github.com/lingshf/ai-native-erp/pull/418)–[#431](https://github.com/lingshf/ai-native-erp/pull/431)，共 14 个 PR。本评审所在 PR 计入下一 Sprint。
- 只核对事实，只改 `design/` 文档。

## 1. 结论

**S26 accepted。** 计划范围六项（MCF-21、KGAP-01、KGAP-03、KGAP-05、KGAP-02、MCF-20）全部 done；MCF-20 实施中发现的统计预览缺陷按 D594 登记为 BUG-04 并在 Sprint 内修复。按 D592，本 Sprint 不承诺版本号，不做发布候选；v0.22.0 的 tag 与 Release 仍待用户授权。

- **用户可见变化 1 项**：BUG-04（[#428](https://github.com/lingshf/ai-native-erp/pull/428)）——业务事件页新建统计事件后点“预览”不再整页崩溃。其余代码改动只有测试与生成脚本：`git diff --stat 2d369c5 bf31631 -- packages scripts` 共 8 个文件，产品源码只有 `packages/web/src/reports-data.ts`（+/-10）与 `business-events/business-plan.tsx`（+/-3），都属 BUG-04；`.github/workflows/full.yml` 只改 3 行注释（#425 的分片说明）。
- **迁移 0 个**。
- **新增决定 D592–D595**（4 条，都由 TL 决定；D595 在收尾时采纳回顾行动）。
- **评审打回 18 次**：14 个 PR 中 3 个直接批准、4 个打回 1 轮、7 个打回 2 轮（§2.2）。按主要原因：事实不准 5、文档内或与 backlog 不一致 4、任务书验收步骤或证据计划 3、措辞范围过宽 2、证据钉点或链接位置 2、生成脚本缺陷 2。分析见 [S26 回顾](S26-retro.md)。
- **S26 范围内的 main Full**：14 个合并提交，11 个 success，3 个 cancelled（`474ef0c`、`a289f50`、`d829539`，都被紧接的推送取代，下一提交 `5c43f08`、`3feebca` 的 Full 绿），0 个 failure。
- **偏差 1 项**：D594——#425 合并时验收 3 为 partial（GUI 只验到预览请求），由 BUG-04（[#428](https://github.com/lingshf/ai-native-erp/pull/428)）补齐断言后 MCF-20 才记 done。

## 2. 目标与验收逐项核对

### 2.1 D592 目标

| 目标 / 项 | 判定 | 证据（PR / SHA / QA） |
| --- | --- | --- |
| 1. 生成器不再静默漏行、误判记录；提及不再因行号漂移改动索引（MCF-21，含 D591 第 ③ 项） | accepted | [#419](https://github.com/lingshf/ai-native-erp/pull/419) `d78b3d4`；打回 2 轮后批准 [6067942951](https://github.com/lingshf/ai-native-erp/pull/419#pullrequestreview-6067942951)，QA PASS（生成器；不涉及 ERP 行为）。按 D593 逐行改写 33 行；两类形似决定但无法解析的输入（D584 表格行、#404 初稿第 7 项条目）及缺冒号、缺右括号、缺结束粗体的条目都以退出码 2 结束且不写索引（回归测试 `packages/infra/test/tooling/decisions-index.test.ts`）。第 ③ 项：用 #414 的改动复现，重新生成后 `design/decisions.md` 无变化；#419 之后的 `docs/` PR（#420、#422、#424、#427、#431）都没有改动索引（`git log 2d369c5..bf31631 -- design/decisions.md` 只有 6 个 `design/` 提交） |
| 2a. KDOC 页面事实复核与剩余 QA（KGAP-01） | accepted（按格交付） | 四方复核记录（发布、开发、设计、QA，各会话 files/，文件名见 [docs/README](../../docs/README.md) “KGAP-01 泳道 B/C 复核”）；KL 矩阵 [#420](https://github.com/lingshf/ai-native-erp/pull/420) `1ca22e9`（打回 2 轮，批准 [6068028951](https://github.com/lingshf/ai-native-erp/pull/420#pullrequestreview-6068028951)，QA PASS 限贸易报表的教学开关定位）、[#422](https://github.com/lingshf/ai-native-erp/pull/422) `474ef0c`（打回 2 轮，批准 [6068092785](https://github.com/lingshf/ai-native-erp/pull/422#pullrequestreview-6068092785)，QA not_applicable）。结果：用户导航索引 `docs/user/README.md` 与 `docs/tradeoffs.md` 摘要本身在写明的范围内升 covered；#420 改动的六页按 `1ca22e9` 钉版本，保持 partial，剩余项逐页列在矩阵“泳道 C 收尾”。按 KGAP-01 规则，FAIL 或缺复核的格不升 covered |
| 2b. M0 决定摘要（KGAP-03） | accepted | [#423](https://github.com/lingshf/ai-native-erp/pull/423) `5c43f08`；打回 2 轮（都是出处归属），批准 [6068146216](https://github.com/lingshf/ai-native-erp/pull/423#pullrequestreview-6068146216)，QA not_applicable。D5–D8 补记页 [M0-decisions](M0-decisions.md)，早期证据与原始决定记录分开写，原始记录仍为“未找到”。KL 跟进根 README 链接 [#424](https://github.com/lingshf/ai-native-erp/pull/424) `ca93fc3`（直接批准 [6068156750](https://github.com/lingshf/ai-native-erp/pull/424#pullrequestreview-6068156750)） |
| 2c. 现行贸易设计（KGAP-05） | accepted | 设计页 [#426](https://github.com/lingshf/ai-native-erp/pull/426) `a289f50`（打回 1 轮，批准 [6068213475](https://github.com/lingshf/ai-native-erp/pull/426#pullrequestreview-6068213475)，QA not_applicable）；KL 矩阵 [#427](https://github.com/lingshf/ai-native-erp/pull/427) `3feebca`（直接批准 [6068224807](https://github.com/lingshf/ai-native-erp/pull/427#pullrequestreview-6068224807)）。**矩阵贸易行保持 partial**：设计页缺 Developer 对整页逐条事实的事实所有者复核（PR 评审不等于事实所有者复核）；页内“缺口”节所列项仍开放（订单只插入不修改无原始决定记录、TORD-03/04/05 与 TINV-05 决定无编号、TLIST-02 编号待定等） |
| 2d. AI 取舍备选（KGAP-02） | accepted | 补记 [#429](https://github.com/lingshf/ai-native-erp/pull/429) `019ff92`（打回 1 轮，批准 [6079044050](https://github.com/lingshf/ai-native-erp/pull/429#pullrequestreview-6079044050)，QA not_applicable）；KL 链接 [#431](https://github.com/lingshf/ai-native-erp/pull/431) `bf31631`（打回 2 轮，批准 [6079083581](https://github.com/lingshf/ai-native-erp/pull/431#pullrequestreview-6079083581)，QA not_applicable）：`docs/tradeoffs.md` §3 改为链接[路线图 §6.1](../roadmap.md#61-取舍补记d564)，不再出现“原记录未写”。**矩阵 AI 行取舍格保持 partial**：补记行缺事实所有者复核记录，补记是事后补记、不等于原始决定记录；KGAP-04 保留的缺口（Copilot 服务端数据处理说明，D569）仍开放 |
| 3. R8b 六行真实 Chrome 断言并在 Full 运行（MCF-20） | accepted | 任务书 [#421](https://github.com/lingshf/ai-native-erp/pull/421) `ff9a470`（打回 1 轮，批准 [6068068481](https://github.com/lingshf/ai-native-erp/pull/421#pullrequestreview-6068068481)）；实施 [#425](https://github.com/lingshf/ai-native-erp/pull/425) `d829539`（打回 2 轮，都只要求补 PR 正文证据；批准 [6068216152](https://github.com/lingshf/ai-native-erp/pull/425#pullrequestreview-6068216152)，QA：1、2、4–6 PASS，3 PARTIAL（D594），7、8、10 已核实）。验收 3 经 D594 由 BUG-04 [#428](https://github.com/lingshf/ai-native-erp/pull/428) `961c278` 补齐 `business.noGl`、确认、`business.recorded` 断言（直接批准 [6068270981](https://github.com/lingshf/ai-native-erp/pull/428#pullrequestreview-6068270981)，QA PASS，Windows 真 Chrome、虚构临时账套），合并后 Full [45750995528](https://github.com/lingshf/ai-native-erp/actions/runs/45750995528) 中用例 B 通过。验收 9：首个完成且成功覆盖 `d829539` 的 Linux main Full 为 [45750224352](https://github.com/lingshf/ai-native-erp/actions/runs/45750224352)（head `3feebca`；head 即 `d829539` 的 [45750080825](https://github.com/lingshf/ai-native-erp/actions/runs/45750080825) 被取消），见 #428 正文 |
| 4. S25 回顾行动 1、2 写入任务书模板（D591） | accepted | 随计划 [#418](https://github.com/lingshf/ai-native-erp/pull/418) `2150b6e`（打回 2 轮，批准 [6067739737](https://github.com/lingshf/ai-native-erp/pull/418#pullrequestreview-6067739737)，QA not_applicable） |
| 版本 | 不适用（D592） | 本 Sprint 不承诺版本号，不做发布候选 |
| v0.22.0 tag 与 Release、M2-05、M2-06、Dependabot | 待授权（不在 S26 范围） | 没有执行；RC2 [#401](https://github.com/lingshf/ai-native-erp/pull/401) `50fce09` 仍是已备好、未发布 |
| 门禁：覆盖最后一个合并提交的 main Full 绿 | 达成 | `bf31631` [Full 45877813429](https://github.com/lingshf/ai-native-erp/actions/runs/45877813429) success |

### 2.2 各 PR 评审

评审都以 COMMENTED 状态提交，结论按正文首行 `VERDICT:` 计；`CHANGES_REQUESTED` 记为打回。原因一栏只写主要打回点，分类口径见[回顾](S26-retro.md#打回分类)。

| PR | 合并 / 轮次 | main Full | 打回点 |
| --- | --- | --- | --- |
| S26 计划 [#418](https://github.com/lingshf/ai-native-erp/pull/418) | `2150b6e`；2 轮（[6067719958](https://github.com/lingshf/ai-native-erp/pull/418#pullrequestreview-6067719958)、[6067730825](https://github.com/lingshf/ai-native-erp/pull/418#pullrequestreview-6067730825)），批准 [6067739737](https://github.com/lingshf/ai-native-erp/pull/418#pullrequestreview-6067739737) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45742368385) | 与 backlog 不一致：第 1 轮 KGAP-01 把复核与 QA 演练都写成只读、MCF-21 退出 2 的对象写成“指针”；第 2 轮两类坏输入统称“表格行” |
| MCF-21 [#419](https://github.com/lingshf/ai-native-erp/pull/419) | `d78b3d4`；2 轮（[6067866105](https://github.com/lingshf/ai-native-erp/pull/419#pullrequestreview-6067866105)、[6067917130](https://github.com/lingshf/ai-native-erp/pull/419#pullrequestreview-6067917130)），批准 [6067942951](https://github.com/lingshf/ai-native-erp/pull/419#pullrequestreview-6067942951) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45745813528) | 生成脚本缺陷：第 1 轮缺冒号或右括号的条目静默漏掉、括注校验被粗体编号绕过；第 2 轮仅括注带编号缺冒号、缺结束粗体仍漏掉 |
| KGAP-01 矩阵（KL） [#420](https://github.com/lingshf/ai-native-erp/pull/420) | `1ca22e9`；2 轮（[6067988003](https://github.com/lingshf/ai-native-erp/pull/420#pullrequestreview-6067988003)、[6068006969](https://github.com/lingshf/ai-native-erp/pull/420#pullrequestreview-6068006969)），批准 [6068028951](https://github.com/lingshf/ai-native-erp/pull/420#pullrequestreview-6068028951) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45747136988) | 第 1 轮事实：`cleanup` 的重启判断不准；第 2 轮措辞过宽：`partnerDimension` 逐伙伴匹配缺“有标记行”条件 |
| MCF-20 任务书 [#421](https://github.com/lingshf/ai-native-erp/pull/421) | `ff9a470`；1 轮（[6068021655](https://github.com/lingshf/ai-native-erp/pull/421#pullrequestreview-6068021655)），批准 [6068068481](https://github.com/lingshf/ai-native-erp/pull/421#pullrequestreview-6068068481) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45747702753) | 验收步骤：验收 6 缺切换到 `transferred` 过滤；拆分备选只覆盖第一个文件 |
| KGAP-01 钉版本（KL） [#422](https://github.com/lingshf/ai-native-erp/pull/422) | `474ef0c`；2 轮（[6068055765](https://github.com/lingshf/ai-native-erp/pull/422#pullrequestreview-6068055765)、[6068081474](https://github.com/lingshf/ai-native-erp/pull/422#pullrequestreview-6068081474)），批准 [6068092785](https://github.com/lingshf/ai-native-erp/pull/422#pullrequestreview-6068092785) | cancelled（被 #423 的推送取代；`5c43f08` [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45748834054)） | 第 1 轮钉点：现行矩阵未完整换钉，trade-main-path 无逐页钉点；第 2 轮同页结论相反（“保持 partial”与 scoped covered） |
| KGAP-03 [#423](https://github.com/lingshf/ai-native-erp/pull/423) | `5c43f08`；2 轮（[6068119782](https://github.com/lingshf/ai-native-erp/pull/423#pullrequestreview-6068119782)、[6068138050](https://github.com/lingshf/ai-native-erp/pull/423#pullrequestreview-6068138050)），批准 [6068146216](https://github.com/lingshf/ai-native-erp/pull/423#pullrequestreview-6068146216) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45748834054) | 事实：D7、D8 最早出处归属；第 2 轮 #21 评审与正文、实现的归属未分开 |
| 根 README D5–D8 链接（KL） [#424](https://github.com/lingshf/ai-native-erp/pull/424) | `ca93fc3`；直接批准 [6068156750](https://github.com/lingshf/ai-native-erp/pull/424#pullrequestreview-6068156750) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45749027514) | 直接批准 |
| KGAP-05 设计页 [#426](https://github.com/lingshf/ai-native-erp/pull/426) | `a289f50`；1 轮（[6068204426](https://github.com/lingshf/ai-native-erp/pull/426#pullrequestreview-6068204426)），批准 [6068213475](https://github.com/lingshf/ai-native-erp/pull/426#pullrequestreview-6068213475) | cancelled（被 #425 的推送取代；`3feebca` [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45750224352)） | 事实：TMAS-01 写成“只在前端校验”；`fromOrder` 带入口径；锚点与节号 |
| MCF-20 实施 [#425](https://github.com/lingshf/ai-native-erp/pull/425) | `d829539`；2 轮（[6068191631](https://github.com/lingshf/ai-native-erp/pull/425#pullrequestreview-6068191631)、[6068208667](https://github.com/lingshf/ai-native-erp/pull/425#pullrequestreview-6068208667)），批准 [6068216152](https://github.com/lingshf/ai-native-erp/pull/425#pullrequestreview-6068216152) | cancelled（被 #427 的推送取代；`3feebca` [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45750224352)） | 证据计划：第 1 轮 PR 正文缺合并后六行取证计划与验收 7/8/10 原始输出；第 2 轮计划不可执行（CI 只在失败时上传截图） |
| KGAP-05 矩阵（KL） [#427](https://github.com/lingshf/ai-native-erp/pull/427) | `3feebca`；直接批准 [6068224807](https://github.com/lingshf/ai-native-erp/pull/427#pullrequestreview-6068224807) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45750224352) | 直接批准 |
| BUG-04 [#428](https://github.com/lingshf/ai-native-erp/pull/428) | `961c278`；直接批准 [6068270981](https://github.com/lingshf/ai-native-erp/pull/428#pullrequestreview-6068270981) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45750995528) | 直接批准 |
| KGAP-02 补记 [#429](https://github.com/lingshf/ai-native-erp/pull/429) | `019ff92`；1 轮（[6079025209](https://github.com/lingshf/ai-native-erp/pull/429#pullrequestreview-6079025209)），批准 [6079044050](https://github.com/lingshf/ai-native-erp/pull/429#pullrequestreview-6079044050) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45877152520) | 事实：把“AI 不过账”边界写成会计不变量；D563 范围写错 |
| S26 状态同步 [#430](https://github.com/lingshf/ai-native-erp/pull/430) | `61c696c`；1 轮（[6079025588](https://github.com/lingshf/ai-native-erp/pull/430#pullrequestreview-6079025588)），批准 [6079067234](https://github.com/lingshf/ai-native-erp/pull/430#pullrequestreview-6079067234) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45877485903) | 措辞过宽：“第一个覆盖 `d829539` 的 Full”漏“完成且成功” |
| KGAP-02 链接（KL） [#431](https://github.com/lingshf/ai-native-erp/pull/431) | `bf31631`；2 轮（[6079059085](https://github.com/lingshf/ai-native-erp/pull/431#pullrequestreview-6079059085)、[6079077749](https://github.com/lingshf/ai-native-erp/pull/431#pullrequestreview-6079077749)，中间一次批准 6079071357 被第二次退回取代），批准 [6079083581](https://github.com/lingshf/ai-native-erp/pull/431#pullrequestreview-6079083581) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45877813429) | 第 1 轮链接位置：§6.1 链接落在页首；第 2 轮与 backlog 验收不一致：§3 仍有加粗“原记录未写” |

## 3. 补充裁定与偏差

S26 期间由 TL 决定：D592（接受计划，不承诺版本号，砍项顺序）、D593（MCF-21 严格规则，逐行改写）、D594（#425 照常评审，统计预览缺陷与验收 3 断言由后续缺陷任务补上）。收尾时 TL 决定 D595：采纳 [S26 回顾](S26-retro.md#行动项汇总)三项行动，写入任务书模板与 BUG 表命名说明。原文见 [S26 决定表](../tasks/S26.md#s26-期间决定)。

缺陷编号：#428 标题、提交信息与 D594 原话称“BUG-03”，与 [BUG 表](../tasks/backlog/BUG.md)中已完成的 BUG-03a/b（#383）同号；状态同步 [#430](https://github.com/lingshf/ai-native-erp/pull/430) 登记为 BUG-04 并在行内注明别名，评审确认（[6079067234](https://github.com/lingshf/ai-native-erp/pull/430#pullrequestreview-6079067234)）。main 历史中的提交信息无法更改，别名永久保留。

## 4. 未完成与遗留

- **v0.22.0 tag 与 Release**：待用户授权。RC2 已备好；授权后若 main 已前移，按发布指南核对 RC 范围。
- **M2-05 真实演练、M2-06 的 A / B / C 选择、Dependabot**：待用户授权。
- **矩阵仍为 partial 的格**（KGAP 各项已按验收交付，以下是验收允许保留的剩余部分）：
  - 贸易行设计列：缺 Developer 对 `design/trade-design.md` 的事实所有者复核；页内“缺口”节各项。
  - AI 行取舍格：缺事实所有者对路线图 §6.1 AI 补记行的复核；KGAP-04 保留的服务端数据处理说明缺口。
  - #420 改动的六页及其他未复核页：剩余项逐页列在 [docs/README](../../docs/README.md) “KGAP-01 泳道 C 收尾”。
- **Backlog**：KGAP、MCF 表中没有剩余 todo；新候选由 S27 计划提出。

## 5. 核对命令

均在 main `bf31631` 上运行：

- `gh pr view <n> --json title,mergeCommit`，取 #418–#431；
- `gh api repos/lingshf/ai-native-erp/pulls/<n>/reviews`，按正文首行 `VERDICT:` 计打回，取批准评审的 `QA:` 行；
- `gh run list --workflow full.yml --branch main --limit 60 --json databaseId,headSha,conclusion`，与 `git rev-list --first-parent 2d369c5..bf31631` 对照；
- `git diff --stat 2d369c5 bf31631 -- packages scripts .github`；
- `git log --oneline 2d369c5..bf31631 -- design/decisions.md`（6 个提交，都是 `design/` PR）；
- `gh run view 45750995528 --log`，确认 `business-events-gui.slow.test.ts` 4 个用例通过，含“B statistics records evidence without GL (zh/red)”。
