# S25 Sprint 评审（v0.22.0 重新切 RC + 收尾发现项补证，设计 / 产品）

- 作者：设计 / 产品负责人。核对时点：main `d937c85`（#415 合并后），核对时间 2026-11-26（UTC）。数字、状态、PR 号与 SHA 都以当时 `gh` / `git` 的输出为准，命令见 §5。格式沿用 [S22 评审](S22-review.md)；S23、S24 没有单独的评审文件，其后由 [MCLOSE-01 收尾](milestone-closeout-post-M1.md)统一检查。
- 对照基准：[S25 计划](../tasks/S25.md)（D580），各项验收以[收尾发现项](../tasks/backlog/MCF.md)表为准。
- 范围：S25 计划基线 `f72950d`（MCLOSE-01 #394）之后合并的 [#396](https://github.com/lingshf/ai-native-erp/pull/396)–[#416](https://github.com/lingshf/ai-native-erp/pull/416)，共 21 个 PR。不计入：MCLOSE-01 的状态同步 [#395](https://github.com/lingshf/ai-native-erp/pull/395)（属收尾）；本评审所在 PR 计入下一 Sprint。
- 只核对事实，只改 `design/` 文档。

## 1. 结论

**S25 accepted（有一项待授权）。** D580 目标中可在 Sprint 内完成的部分全部达成：CHANGELOG 已补全，从 main 新切的 RC2 已合并并通过 Demo 证据验收，MCLOSE-01 的 P1/P2 发现项全部 done，已排入的 P3 也全部 done。**v0.22.0 未发布**：tag 与 GitHub Release 须用户授权，至今未授权（远端没有 `v0.22*` tag，最新 Release 仍是 v0.21.0），列为“待授权”，不算已发布。

- **用户可见变化 0 项**：S25 不改产品代码。`git diff --shortstat f72950d d937c85 -- packages package.json package-lock.json .github` 输出为空；`scripts/` 只新增 `gen-decisions-index.mjs`（+173 行，MCF-14）。改动集中在 `docs/`（50 个文件）、`design/`（13 个）、`CHANGELOG.md` 与根 `README.md`。
- **迁移 0 个**。
- **新增决定 D580–D590**（11 条，都由协调者决定）；收尾时另增 D591（TL 决定：采纳[回顾](S25-retro.md#行动项汇总)三条行动，行动 3 并入 MCF-21，行动 1、2 写入任务书模板）。
- **评审打回 22 次**，21 个 PR 中 4 个直接批准、12 个打回 1 轮、5 个打回 2 轮（§2.2）。按主要原因：事实不准 8、措辞范围过宽 6、文档内或与 PR 正文不一致 4、证据钉点位置 2、生成脚本缺陷与 rebase 后重新生成 2。分析见 [S25 回顾](S25-retro.md)。
- **S25 范围内的 main Full**：21 个合并提交，19 个 success，2 个 cancelled（`4e4dd9c`、`9da0bec`，都被紧接的下一次推送取代，下一提交的 Full 绿），0 个 failure。
- **冲突域越界 0 次**；已记录的偏差 1 项（D586：#401 Demo 时段未经 slot-run，试运行 1–9 的截图与诊断图片未保留，接受不重跑）。

## 2. 目标与验收逐项核对

### 2.1 D580 目标

| 目标（D580） | 判定 | 证据 |
| --- | --- | --- |
| CHANGELOG 完整（MCF-01） | accepted | [#396](https://github.com/lingshf/ai-native-erp/pull/396) `13a4199`；覆盖 v0.21.0 以来所有缺条目的 PR（D581）；非作者复审逐条对照合并 diff 后批准 [6050463944](https://github.com/lingshf/ai-native-erp/pull/396#pullrequestreview-6050463944) |
| 基于当前 main 新切 RC（MCF-02） | accepted | [#401](https://github.com/lingshf/ai-native-erp/pull/401) `50fce09`：RC2 范围终点 `13a4199`，旧 RC `3566ddb` 标为已取代；QA PASS 只覆盖 D583 的 Demo 范围（TSET-01、TMAS-01、BUG-01）[6050885981](https://github.com/lingshf/ai-native-erp/pull/401#pullrequestreview-6050885981)；两项偏差按 D586 接受 |
| v0.22.0 发布（tag 与 GitHub Release） | **待授权** | D580 列为须用户授权；`git ls-remote --tags origin "v0.22*"` 无输出，`gh release list` 最新为 v0.21.0。RC2 已备好，不算已发布 |
| 补 R8b 证据（MCF-17） | accepted（按 D582 结案） | REFAC-34 的 R8b 已确认；REFAC-31 的 R8b 永久记为“未确认”，缺的真实 Chrome 断言转 MCF-20（Backlog）。证据缺口本身没有补上，只是如实记录 |
| SEC-02 事实复核（MCF-05、MCF-19） | accepted | 新派只读 Developer 复核：[#391 评论 7150097720](https://github.com/lingshf/ai-native-erp/pull/391#issuecomment-7150097720)；`design/` 修正 [#398](https://github.com/lingshf/ai-native-erp/pull/398) `6023f50`；`docs/` 修正并入 [#399](https://github.com/lingshf/ai-native-erp/pull/399) `6f34423` |
| 决定索引生成脚本（MCF-14） | accepted | [#400](https://github.com/lingshf/ai-native-erp/pull/400) `f294dd7`；此后每个新增决定的 PR 都重新生成并通过 `--check`。已知两处误判转 MCF-21 |
| 流程规则（MCF-13、MCF-18a、MCF-18b） | accepted | [#404](https://github.com/lingshf/ai-native-erp/pull/404) `8ca7ddf`，D585：写入团队章程 §3 第 7、8 项与任务书模板；按 D585，规则落文即算完成，尚未在后续任务中实际执行 |
| KL 文档批次（MCF-06 → MCF-08 → MCF-09） | accepted | [#399](https://github.com/lingshf/ai-native-erp/pull/399) `6f34423`、[#405](https://github.com/lingshf/ai-native-erp/pull/405) `37bb417`（Developer 只读事实复核已采纳）、[#407](https://github.com/lingshf/ai-native-erp/pull/407) `d98347a`；三页仍为 partial |
| MCF-05/08 由新派只读 Developer 做事实所有者 | accepted | MCF-05 见上；MCF-08 的复核记在 #405 正文与 `docs/code-entry.md` |
| 可选 P3 | accepted | MCF-03/11 [#410](https://github.com/lingshf/ai-native-erp/pull/410) `33b40e1`；MCF-07 [#413](https://github.com/lingshf/ai-native-erp/pull/413) `c0d44ab`；MCF-10 [#411](https://github.com/lingshf/ai-native-erp/pull/411) `1e23550`；MCF-12 [#414](https://github.com/lingshf/ai-native-erp/pull/414) `5780f95`；MCF-15/16 [#402](https://github.com/lingshf/ai-native-erp/pull/402) `39c5646`、[#403](https://github.com/lingshf/ai-native-erp/pull/403) `664b37c`；MCF-19 随 #398；MCF-04 [#415](https://github.com/lingshf/ai-native-erp/pull/415) `d937c85`（首次按里程碑批量钉版本） |
| M2-05/06、Dependabot | 待授权（不在 S25 范围） | 没有执行；S25 范围内没有 Dependabot PR 合并 |
| 门禁：覆盖最后一个合并提交的 main Full 绿 | 达成 | `d937c85` [Full 45541004134](https://github.com/lingshf/ai-native-erp/actions/runs/45541004134) success |

### 2.2 各 PR 评审

评审都以 COMMENTED 状态提交，结论按正文首行 `VERDICT:` 计；`CHANGES_REQUESTED` 记为打回。原因一栏只写主要打回点，分类口径见[回顾](S25-retro.md#打回分类)。

| PR | 合并 / 轮次 | main Full | 打回点 |
| --- | --- | --- | --- |
| MCF-01 CHANGELOG [#396](https://github.com/lingshf/ai-native-erp/pull/396) | `13a4199`；1 轮打回（[6050449862](https://github.com/lingshf/ai-native-erp/pull/396#pullrequestreview-6050449862)），批准 [6050463944](https://github.com/lingshf/ai-native-erp/pull/396#pullrequestreview-6050463944) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45529505073) | 事实：REFAC-20、REFAC-24 的合并 SHA 写成 `373620000000`、`4.3E+132`；SEC-02 缺 PR/SHA；“不需要条目”漏 #366 |
| S25 计划 [#397](https://github.com/lingshf/ai-native-erp/pull/397) | `9923025`；1 轮打回（[6050428410](https://github.com/lingshf/ai-native-erp/pull/397#pullrequestreview-6050428410)），批准 [6050454376](https://github.com/lingshf/ai-native-erp/pull/397#pullrequestreview-6050454376) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45529344311) | 一致性：泳道 D/E 对 `design/ai-assistant-facts.md` 没有写入方；泳道 B 与状态同步的写入方矛盾 |
| F22 修正 + 状态同步（D581、D582） [#398](https://github.com/lingshf/ai-native-erp/pull/398) | `6023f50`；直接批准 [6050480721](https://github.com/lingshf/ai-native-erp/pull/398#pullrequestreview-6050480721) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45529659427) | 直接批准 |
| MCF-06 QA 范围 [#399](https://github.com/lingshf/ai-native-erp/pull/399) | `6f34423`；2 轮打回（[6050488367](https://github.com/lingshf/ai-native-erp/pull/399#pullrequestreview-6050488367)、[6050509107](https://github.com/lingshf/ai-native-erp/pull/399#pullrequestreview-6050509107)），批准 [6050526649](https://github.com/lingshf/ai-native-erp/pull/399#pullrequestreview-6050526649) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45530212464) | 第 1 轮措辞过宽：“其余页面没有 QA 记录”抹掉已有证据，三条 PASS 统一写成只读；第 2 轮事实：“启动阅读路径与 schema 020”误归 #368 |
| MCF-14 生成脚本 [#400](https://github.com/lingshf/ai-native-erp/pull/400) | `f294dd7`；2 轮打回（[6050521611](https://github.com/lingshf/ai-native-erp/pull/400#pullrequestreview-6050521611)、[6050552817](https://github.com/lingshf/ai-native-erp/pull/400#pullrequestreview-6050552817)），批准 [6050584444](https://github.com/lingshf/ai-native-erp/pull/400#pullrequestreview-6050584444) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45530797107) | 第 1 轮工具缺陷：未知参数静默进入写入模式（`--chek 1` 只剩 D1）；同页新旧维护指令矛盾。第 2 轮只因 rebase：与 #399 合并后 `--check` 退出 1，D20 行 `docs/README.md:63` 应为 `:78` |
| MCF-02 v0.22.0 RC2 [#401](https://github.com/lingshf/ai-native-erp/pull/401) | `50fce09`；2 轮打回（[6050573708](https://github.com/lingshf/ai-native-erp/pull/401#pullrequestreview-6050573708)、[6050813503](https://github.com/lingshf/ai-native-erp/pull/401#pullrequestreview-6050813503)），批准 [6050885981](https://github.com/lingshf/ai-native-erp/pull/401#pullrequestreview-6050885981) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45533675823) | 第 1 轮事实：旧 RC 名称含回车；称 BUG-01 无用户文档（实有）；范围尾注口径。第 2 轮事实与证据：截图写 18 张（实 17）；capture 证据被写得超出实际；缺可复跑命令与窗口产物清单（偏差按 D586 接受） |
| MCF-15 模板、MCF-16 方案（D583） [#402](https://github.com/lingshf/ai-native-erp/pull/402) | `39c5646`；1 轮打回（[6050655824](https://github.com/lingshf/ai-native-erp/pull/402#pullrequestreview-6050655824)），批准 [6050681507](https://github.com/lingshf/ai-native-erp/pull/402#pullrequestreview-6050681507) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45531730039) | 措辞过宽：“正文逐字一致”与 grep 匹配范围 |
| MCF-16 实施（D584） [#403](https://github.com/lingshf/ai-native-erp/pull/403) | `664b37c`；直接批准 [6050749862](https://github.com/lingshf/ai-native-erp/pull/403#pullrequestreview-6050749862) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45532374500) | 直接批准 |
| MCF-13/18a/18b（D585） [#404](https://github.com/lingshf/ai-native-erp/pull/404) | `8ca7ddf`；1 轮打回（[6050831669](https://github.com/lingshf/ai-native-erp/pull/404#pullrequestreview-6050831669)），批准 [6050856431](https://github.com/lingshf/ai-native-erp/pull/404#pullrequestreview-6050856431) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45533387732) | 一致性：合并门槛对象不明；D456 的例外未保留；PR 正文仍是选项待定 |
| MCF-08 代码入口 [#405](https://github.com/lingshf/ai-native-erp/pull/405) | `37bb417`；2 轮打回（[6050990909](https://github.com/lingshf/ai-native-erp/pull/405#pullrequestreview-6050990909)、[6051010106](https://github.com/lingshf/ai-native-erp/pull/405#pullrequestreview-6051010106)），批准 [6051028943](https://github.com/lingshf/ai-native-erp/pull/405#pullrequestreview-6051028943) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45535016862) | 第 1 轮事实：`AI_TIMEOUT_MS` 写成“请求整体超时”；Demo 截图数量矛盾；仍称待 Developer 事实复核。第 2 轮：上轮两点只改了一半（一致性） |
| 钉版本（D561、D574） [#406](https://github.com/lingshf/ai-native-erp/pull/406) | `7693a7b`；直接批准 [6051057030](https://github.com/lingshf/ai-native-erp/pull/406#pullrequestreview-6051057030) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45535307631) | 直接批准 |
| MCF-09 G2 取舍 [#407](https://github.com/lingshf/ai-native-erp/pull/407) | `d98347a`；1 轮打回（[6051083731](https://github.com/lingshf/ai-native-erp/pull/407#pullrequestreview-6051083731)），批准 [6051100828](https://github.com/lingshf/ai-native-erp/pull/407#pullrequestreview-6051100828) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45535748239) | 事实：AI 行误用总账行的缺口；§8 多列了实现口径编号 |
| 钉 tradeoffs.md [#408](https://github.com/lingshf/ai-native-erp/pull/408) | `4e4dd9c`；1 轮打回（[6051118221](https://github.com/lingshf/ai-native-erp/pull/408#pullrequestreview-6051118221)），批准 [6051144109](https://github.com/lingshf/ai-native-erp/pull/408#pullrequestreview-6051144109) | cancelled（被 #409 的推送取代；`5472170` [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45536239871)） | 措辞：把两个独立说明连成一句，漏掉改写对象 |
| 状态同步（D586、D587） [#409](https://github.com/lingshf/ai-native-erp/pull/409) | `5472170`；1 轮打回（[6051135628](https://github.com/lingshf/ai-native-erp/pull/409#pullrequestreview-6051135628)），批准 [6051152675](https://github.com/lingshf/ai-native-erp/pull/409#pullrequestreview-6051152675) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45536239871) | 措辞过宽：D586 写成“产物未保留”，控制台日志其实在 #401 |
| MCF-03/11 [#410](https://github.com/lingshf/ai-native-erp/pull/410) | `33b40e1`；1 轮打回（[6051176256](https://github.com/lingshf/ai-native-erp/pull/410#pullrequestreview-6051176256)），批准 [6051196628](https://github.com/lingshf/ai-native-erp/pull/410#pullrequestreview-6051196628) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45536683078) | 措辞过宽：“D1 起每个编号一行并链接到记录位置”，实际有“无” |
| MCF-10 性能索引 [#411](https://github.com/lingshf/ai-native-erp/pull/411) | `1e23550`；2 轮打回（[6051423187](https://github.com/lingshf/ai-native-erp/pull/411#pullrequestreview-6051423187)、[6051440409](https://github.com/lingshf/ai-native-erp/pull/411#pullrequestreview-6051440409)），批准 [6051449408](https://github.com/lingshf/ai-native-erp/pull/411#pullrequestreview-6051449408) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45540595317) | 第 1 轮事实：三个基准入口混淆；512 MB 与 512 MiB；PR 正文与复核状态不一致。第 2 轮措辞过宽：“不读取上一条输出”写成无条件 |
| 状态同步（D588–D590） [#412](https://github.com/lingshf/ai-native-erp/pull/412) | `976519c`；1 轮打回（[6051246906](https://github.com/lingshf/ai-native-erp/pull/412#pullrequestreview-6051246906)），批准 [6051261929](https://github.com/lingshf/ai-native-erp/pull/412#pullrequestreview-6051261929) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45537695339) | 一致性：D590 授权角色与 MCF-12 状态不一致 |
| MCF-07 矩阵设计列 [#413](https://github.com/lingshf/ai-native-erp/pull/413) | `c0d44ab`；1 轮打回（[6051255159](https://github.com/lingshf/ai-native-erp/pull/413#pullrequestreview-6051255159)），批准 [6051276380](https://github.com/lingshf/ai-native-erp/pull/413#pullrequestreview-6051276380) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45537937601) | 钉点位置：设计列改为 partial，证据列却没有新设计证据的完整 SHA |
| MCF-12 根 README 去重 [#414](https://github.com/lingshf/ai-native-erp/pull/414) | `5780f95`；1 轮打回（[6051293600](https://github.com/lingshf/ai-native-erp/pull/414#pullrequestreview-6051293600)），批准 [6051303711](https://github.com/lingshf/ai-native-erp/pull/414#pullrequestreview-6051303711) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45538398092) | 事实：压缩时丢了“以正金额单列” |
| 钉版本批次（D574） [#415](https://github.com/lingshf/ai-native-erp/pull/415) | `d937c85`；1 轮打回（[6051462727](https://github.com/lingshf/ai-native-erp/pull/415#pullrequestreview-6051462727)），批准 [6051473612](https://github.com/lingshf/ai-native-erp/pull/415#pullrequestreview-6051473612) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45541004134) | 钉点位置：`5780f95` 只写在矩阵上方说明，没进总账、贸易两行的证据列 |
| 状态同步（MCF-07/10/12） [#416](https://github.com/lingshf/ai-native-erp/pull/416) | `9da0bec`；直接批准 [6051468486](https://github.com/lingshf/ai-native-erp/pull/416#pullrequestreview-6051468486) | cancelled（被 #415 的推送取代；`d937c85` [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45541004134)） | 直接批准 |

## 3. 补充裁定与偏差

S25 期间由协调者补充的决定：D581（MCF-01 范围）、D582（MCF-17 结案、新增 MCF-20）、D583（RC2 Demo 范围）、D584（MCF-16 方案）、D585（MCF-13/18a/18b 规则）、D586（#401 两项偏差）、D587（D7 并入 KGAP-03）、D588（新增 KGAP-05）、D589（关闭 C1）、D590（MCF-12 根 README 授权）。原文见 [S25 决定表](../tasks/S25.md#s25-期间决定)。

## 4. 未完成与遗留

- **v0.22.0 tag 与 Release**：待用户授权。RC2 已备好；授权后若 main 已前移，按发布指南核对 RC 范围。
- **Backlog**：MCF-20、MCF-21；KGAP-01、02、03、05（KGAP-04 已按 D569 完成）。排序建议见[回顾](S25-retro.md#下一-sprint-候选产品负责人建议)。
- **矩阵状态**：MCF-06/08/09/10 等页仍为 partial，转 covered 需 KGAP-01 的事实复核与 QA。

## 5. 核对命令

均在 main `d937c85` 上运行：

- `gh pr list --state all --limit 40 --json number,title,state,mergeCommit`，取 #396–#416；
- `gh api repos/lingshf/ai-native-erp/pulls/<n>/reviews`，按正文首行 `VERDICT:` 计打回；
- `gh run list --branch main --limit 200 --json headSha,workflowName,conclusion`，与 `git rev-list f72950d..d937c85` 对照；
- `git diff --shortstat f72950d d937c85 -- packages package.json package-lock.json .github`（空）；
- `git ls-remote --tags origin "v0.22*"`（空）、`gh release list --limit 3`；
- `git log --oneline f72950d..d937c85 -- design/decisions.md`（13 个提交）。
