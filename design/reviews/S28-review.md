# S28 Sprint 评审（KGAP-09 转出项补证 + BUG-05 修复，设计 / 产品）

- 作者：设计 / 产品负责人。核对时点：main `fb4775e6eec1daf709f6e617f177f9699842de18`（#456 合并后），核对时间 2026-11-27（UTC）。数字、状态、PR 号与 SHA 都以当时 `gh` / `git` 的输出为准，命令见 §5。格式沿用 [S27 评审](S27-review.md)。
- 对照基准：[S28 计划](../tasks/S28.md)（D602、D603），各项验收以 [KGAP 表](../tasks/backlog/KGAP.md)、[BUG 表](../tasks/backlog/BUG.md)的对应行与 S28 的[跨文件验收](../tasks/S28.md#跨文件验收d595按文件列验收句)为准。
- 范围：S28 计划基线 `aca7e53`（S27 收尾 [#441](https://github.com/lingshf/ai-native-erp/pull/441)）之后合并的 [#442](https://github.com/lingshf/ai-native-erp/pull/442)–[#456](https://github.com/lingshf/ai-native-erp/pull/456)，共 15 个 PR。本评审所在 PR 计入下一 Sprint。
- 只核对事实，只改 `design/` 文档。

## 1. 结论

**S28 accepted，有 1 项偏差（D604）；另有 1 项证据记录遗漏，收尾时已补记（D604）。** 计划各项（KGAP-10 至 KGAP-15、BUG-05、任务总表状态同步）都已按[执行状态](../tasks/S28.md#执行状态)记为 done。KGAP-12 场景 03 按 D603 延期，转入 KGAP-16（blocked，范围待定）；KGAP-15 按验收③结束，缺口仍开放。按 D602，本 Sprint 不承诺版本号，不做发布候选；须用户授权的事项都没有执行。

- **用户可见变化 1 项（BUG-05）**：`git diff --stat aca7e53 fb4775e -- packages scripts .github` 只有 [#448](https://github.com/lingshf/ai-native-erp/pull/448) 的两个文件：`packages/web/src/TradeInvoiceDetail.tsx`（原位改 2 行）与 `packages/web/test/trade-invoice-links.test.tsx`。是否为它打版本，**待用户授权**（§4）。
- **迁移 0 个**：当前最新迁移仍为 020（`packages/infra/migrations/sqlite/020-trade-order-invoicing-credits.sql`），下一个迁移号为 021。
- **新增决定 D602–D604**（3 条）：
  - D602 接受计划（TL）；
  - D603 KGAP-12 QA 结果处置（PO）；
  - D604 在收尾时记录 BUG-05 的跨文件偏差与下一 Sprint 候选的去向（PO，§3）。
- **本 Sprint 修正的事实不符 27 处**（§2.3）。修正后都由原复核人或原 QA 在合并提交上复核，结论全部一致。
- **评审打回 10 次**：15 个 PR 中 6 个直接批准，8 个打回 1 轮，1 个打回 2 轮（#442）（§2.2）。按第一个阻塞点分：
  - 事实不准 5 次；
  - 计划或任务书的验收与证据计划 2 次；
  - 证据钉点 1 次；
  - 矩阵覆盖范围超出证据 1 次；
  - 缺合并后复核证据 1 次。

  分析见 [S28 回顾](S28-retro.md)。
- **S28 范围内的 main Full**：15 个合并提交中 13 个 success、2 个 cancelled、0 个 failure。两个 cancelled 的下一个合并提交 Full 都为绿（§2.2）。
- **证据记录遗漏 1 项（D604，已补记）**：BUG-05 合并提交上的 main Full run 链接（[45930106245](https://github.com/lingshf/ai-native-erp/actions/runs/45930106245)，success）没有按 S28 计划证据表（`S28.md:164`）与任务书（`BUG-05-invoice-detail-id-validation.md:118`）记入 #448 评论；收尾时由 Product/Design 补记（[评论 7208995742](https://github.com/lingshf/ai-native-erp/pull/448#issuecomment-7208995742)）。它与下面的偏差分开计，不并入。
- **偏差 1 项（D604）**：BUG-05 的跨文件验收中，`docs/flows/invoice-detail-flow.md:35`（Knowledge Lead，合并后修改）在 Sprint 内没有改。`design/trade-design.md:51` 由本收尾 PR 修改（§2.1、§4）。

## 2. 目标与验收逐项核对

### 2.1 D602 目标

| 目标 / 项 | 判定 | 证据（PR / SHA / 复核 / QA） |
| --- | --- | --- |
| 1a. KGAP-12 QA 演练 5 项 | accepted（03 延期，D603） | **QA**：会话 files/ `kgap-12-qa.md`（基线 `519fc22`），22 项中 18 PASS、2 FAIL、2 阻塞，未发现产品缺陷，不登记 BUG-06。<br>**处置**：[#450](https://github.com/lingshf/ai-native-erp/pull/450) `cff34ba`（D603），打回 1 轮后批准 [6082843199](https://github.com/lingshf/ai-native-erp/pull/450#pullrequestreview-6082843199)，QA N/A（纯任务书）。两处 FAIL 认定为计划预期写错，按已文档化的产品行为修订；原 FAIL 记录照留。<br>**文档修正**：[#452](https://github.com/lingshf/ai-native-erp/pull/452) `ff196c3`。<br>**复跑**：在包含 #452 的 `cff34ba` 上按 D603 复跑 5/5 PASS（[评论 7208547656](https://github.com/lingshf/ai-native-erp/pull/450#issuecomment-7208547656)，会话记录 `kgap-12-d603-qa.md`）。<br>**未完成**：03（口径 5 有标记）没有受支持的 CLI 输入路径，延期并登记为 KGAP-16（blocked） |
| 1b. KGAP-10 Product/Design 复核 4 项 | accepted | **复核**：会话 files/ `kgap-10-1-review.md`…`kgap-10-4-review.md`（基线 `519fc22`），共 20 处不符：① 3、② 12、③ 5、④ 0。<br>**修正**：[#447](https://github.com/lingshf/ai-native-erp/pull/447) `33e5e51`（③）、[#449](https://github.com/lingshf/ai-native-erp/pull/449) `bd9dc7b`（①②）、[#451](https://github.com/lingshf/ai-native-erp/pull/451) `bb18960`（① 两张截图）。<br>**合并后复核**：在 main `9290af7` 上 PASS 20/20（`kgap-10-postmerge.md`；评论 [#447](https://github.com/lingshf/ai-native-erp/pull/447#issuecomment-7208774737)、[#449](https://github.com/lingshf/ai-native-erp/pull/449#issuecomment-7208775069)、[#451](https://github.com/lingshf/ai-native-erp/pull/451#issuecomment-7208775415)） |
| 1c. KGAP-11 Delivery/Release 复核 `user/backup-and-legacy.md` | accepted | **复核**：会话 files/ `kgap-11-review.md`，2 处不精确（P1、P2）。<br>**修正**：[#443](https://github.com/lingshf/ai-native-erp/pull/443) `5a45630`，打回 1 轮后批准 [6082697800](https://github.com/lingshf/ai-native-erp/pull/443#pullrequestreview-6082697800)。<br>**合并后复核**：在 main `9290af7` 上 PASS（d687c768 会话 `kgap-11-postmerge.md`；[评论 7208797915](https://github.com/lingshf/ai-native-erp/pull/443#issuecomment-7208797915)） |
| 1d. 矩阵（KGAP-10/11/12/13） | accepted | [#454](https://github.com/lingshf/ai-native-erp/pull/454) `4852540`，打回 1 轮后批准 [6082917809](https://github.com/lingshf/ai-native-erp/pull/454#pullrequestreview-6082917809)，QA N/A（矩阵文档）。没有格升 covered。`user/backup-and-legacy.md` 与 `legacy-snapshot.md` 标为“已 QA（限定范围）”，并正面列出已验证的范围，其余部分照写 partial：口径 5 逐伙伴比较（03）、U21 数值只追溯出处、KGAP-11 非 UI 项、快照负例。`operations.md` 不共享这个标签，仍为 partial |
| 2. BUG-05 | accepted，有偏差（D604） | **任务书**：[#446](https://github.com/lingshf/ai-native-erp/pull/446) `1be05ec`，打回 1 轮后批准 [6082736366](https://github.com/lingshf/ai-native-erp/pull/446#pullrequestreview-6082736366)。<br>**实现**：[#448](https://github.com/lingshf/ai-native-erp/pull/448) `34ec97c`，直接批准 [6082801650](https://github.com/lingshf/ai-native-erp/pull/448#pullrequestreview-6082801650)。独立 QA PASS 6/6：真实 Chrome 158.0.8127.37，1440×900，中文，默认红；五种非法形状都显示「发票不存在或已不在本公司。」，无“重试”，零次详情请求；合法但不存在的 ID 恰好发一次 GET，得 HTTP 404。<br>**合并后**：<br>• QA 在合并提交上复验 PASS 2/2（[评论 7208410108](https://github.com/lingshf/ai-native-erp/pull/448#issuecomment-7208410108)）；<br>• 合并提交的 main Full 为绿（[45930106245](https://github.com/lingshf/ai-native-erp/actions/runs/45930106245)），但这条 run 链接合并后没有按任务书“合并后检查”写进 PR 评论（证据记录遗漏），收尾时补记（[评论 7208995742](https://github.com/lingshf/ai-native-erp/pull/448#issuecomment-7208995742)）；<br>• `design/trade-design.md:51` 由本收尾 PR 改为前后端同一规则，钉 `34ec97c`；<br>• `docs/flows/invoice-detail-flow.md:35` 仍写“格式不是 36 位 documentId”（该文件最后一次改动是 [#243](https://github.com/lingshf/ai-native-erp/pull/243) `25d1e3c`），未改，见 §4 |
| 3a. KGAP-13 Developer 复核 2 页 | accepted | **修正**：[#444](https://github.com/lingshf/ai-native-erp/pull/444) `96d0f27`（GS-14）、[#445](https://github.com/lingshf/ai-native-erp/pull/445) `4997611`（GS-13）。<br>**合并后复核**：在 main `9290af7` 上 PASS，`legacy-snapshot.md` 自 `519fc22` 起未改动（d3ced14d 会话 `kgap-13-postmerge.md`；评论 [#444](https://github.com/lingshf/ai-native-erp/pull/444#issuecomment-7208797538)、[#445](https://github.com/lingshf/ai-native-erp/pull/445#issuecomment-7208797821)） |
| 3b. KGAP-14 事实清单钉点刷新 | accepted | [#453](https://github.com/lingshf/ai-native-erp/pull/453) `395d9bd`，改钉到 `cff34ba`，打回 1 轮后批准 [6082907709](https://github.com/lingshf/ai-native-erp/pull/453#pullrequestreview-6082907709)；合并后复核 PASS（d3ced14d 会话 `kgap-14-postmerge.md`，在 main `395d9bd` 上只读） |
| 3c. KGAP-15 KGAP-04 限时复查 | accepted（按验收③：没有找到） | [#455](https://github.com/lingshf/ai-native-erp/pull/455) `9290af7`，打回 1 轮后批准 [6082924352](https://github.com/lingshf/ai-native-erp/pull/455#pullrequestreview-6082924352)。没有找到 GitHub Docs 中的服务端数据处理专页；查过的地址与结论写在 KGAP-15 行；缺口保持开放，`docs/` 不改，不另立决定 |
| 3d. 任务总表状态同步 | accepted | [#456](https://github.com/lingshf/ai-native-erp/pull/456) `fb4775e`：S23 表 REFAC-13、TSET-01、SLOT-06 三行改 done；S28 执行状态与 backlog 行同步 |
| 4. 按 D595 写跨文件验收与 PR 正文证据计划 | accepted | 写在计划 [#442](https://github.com/lingshf/ai-native-erp/pull/442) `519fc22`（打回 2 轮后批准 [6082633952](https://github.com/lingshf/ai-native-erp/pull/442#pullrequestreview-6082633952)）。执行中漏掉的跨文件项见 BUG-05 一行，以及[回顾议题 2](S28-retro.md#议题-2done-判定先于合并后证据bug-05456) |
| 版本 | 不适用（D602）；BUG-05 是否打版本待用户授权 | 本 Sprint 不承诺版本号，不做发布候选。BUG-05 不在 v0.22.0 RC2 的冻结范围内；CHANGELOG 没有改 |
| v0.22.0 tag 与 Release、M2-05、M2-06、Dependabot | 待授权（不在 S28 范围） | 都没有执行。RC2 [#401](https://github.com/lingshf/ai-native-erp/pull/401) `50fce09` 仍是已备好、未发布 |
| 门禁：覆盖最后一个合并提交的 main Full 为绿 | 达成 | `fb4775e` [Full 45933018416](https://github.com/lingshf/ai-native-erp/actions/runs/45933018416) success。按 S28 证据计划，Full 只作门禁；只有 BUG-05 用到 CI 产物 |

### 2.2 各 PR 评审

评审都以 COMMENTED 状态提交，结论按正文的 `VERDICT:` 行计；`CHANGES_REQUESTED` 记为打回。“打回点”一栏只写主要原因，分类口径见[回顾](S28-retro.md#打回分类)。除 #448 外，各 PR 的批准评审都写明 QA N/A（计划、任务书或纯文档）。

| PR | 合并 / 轮次 | main Full | 打回点 |
| --- | --- | --- | --- |
| S28 计划 [#442](https://github.com/lingshf/ai-native-erp/pull/442) | `519fc22`；2 轮（[6082597296](https://github.com/lingshf/ai-native-erp/pull/442#pullrequestreview-6082597296)、[6082618154](https://github.com/lingshf/ai-native-erp/pull/442#pullrequestreview-6082618154)），批准 [6082633952](https://github.com/lingshf/ai-native-erp/pull/442#pullrequestreview-6082633952) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45927594590) | 第 1 轮，验收与证据计划：<br>• BUG-05 的大写用例在 base 上本来就是绿的，不能算“先红后绿”；<br>• KGAP-14 既要求改钉到同一个 SHA，又要保留历史钉点，两句互相矛盾；<br>• KGAP-12 的场景没有可判定的预期。<br>第 2 轮，事实不准（预期与代码行为不符）：<br>• 旧账导入 CLI 的失败是非零退出加 `INVALID_INPUT`（`rule mapping` / `rule shape`），不是 `blocked` 判决；<br>• 口径 5 的 `partnerDimension`；<br>• AI 的 cancelled 与 HTTP 400 的区分；<br>• 付款页 F5 与关闭标签页 |
| KGAP-11 修正 [#443](https://github.com/lingshf/ai-native-erp/pull/443) | `5a45630`；1 轮（[6082691290](https://github.com/lingshf/ai-native-erp/pull/443#pullrequestreview-6082691290)），批准 [6082697800](https://github.com/lingshf/ai-native-erp/pull/443#pullrequestreview-6082697800) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45928607396) | 事实不准：“唯一例外”暗示存在已导入却没有报告的 run，实际该 run 记为 `failed` 并回滚 |
| KGAP-13 GS-14 [#444](https://github.com/lingshf/ai-native-erp/pull/444) | `96d0f27`；直接批准 [6082694480](https://github.com/lingshf/ai-native-erp/pull/444#pullrequestreview-6082694480) | cancelled（[45928525678](https://github.com/lingshf/ai-native-erp/actions/runs/45928525678)；下一合并提交 `5a45630` 绿） | — |
| KGAP-13 GS-13 [#445](https://github.com/lingshf/ai-native-erp/pull/445) | `4997611`；直接批准 [6082706313](https://github.com/lingshf/ai-native-erp/pull/445#pullrequestreview-6082706313) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45928825104) | — |
| BUG-05 任务书 [#446](https://github.com/lingshf/ai-native-erp/pull/446) | `1be05ec`；1 轮（[6082711474](https://github.com/lingshf/ai-native-erp/pull/446#pullrequestreview-6082711474)），批准 [6082736366](https://github.com/lingshf/ai-native-erp/pull/446#pullrequestreview-6082736366) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45929112722) | 验收：<br>• 验收 7 与 UI 质量项漏了五种非法形状中的大写形状；<br>• 页首写“S28 计划合并后可开工”，应为任务书合并后 |
| KGAP-10 ③ [#447](https://github.com/lingshf/ai-native-erp/pull/447) | `33e5e51`；1 轮（[6082715672](https://github.com/lingshf/ai-native-erp/pull/447#pullrequestreview-6082715672)），批准 [6082722536](https://github.com/lingshf/ai-native-erp/pull/447#pullrequestreview-6082722536) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45928967345) | 事实不准：写成“v0.3.0 起各版 Demo 只链接到这里”，而实际只有 v0.2.0、v0.3.0 的 Demo README 链接到该页 |
| BUG-05 实现 [#448](https://github.com/lingshf/ai-native-erp/pull/448) | `34ec97c`；直接批准 [6082801650](https://github.com/lingshf/ai-native-erp/pull/448#pullrequestreview-6082801650)（QA PASS 6/6） | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45930106245) | — |
| KGAP-10 ①② [#449](https://github.com/lingshf/ai-native-erp/pull/449) | `bd9dc7b`；直接批准 [6082824084](https://github.com/lingshf/ai-native-erp/pull/449#pullrequestreview-6082824084) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45930452162) | — |
| KGAP-12 处置 [#450](https://github.com/lingshf/ai-native-erp/pull/450) | `cff34ba`；1 轮（[6082830667](https://github.com/lingshf/ai-native-erp/pull/450#pullrequestreview-6082830667)），批准 [6082843199](https://github.com/lingshf/ai-native-erp/pull/450#pullrequestreview-6082843199) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45930822837) | 事实不准：<br>• KGAP-16 被写成“只补夹具”就能完成，实际没有受支持的 CLI 输入路径；<br>• 同轮要求 03 行直接标“延期”，①④⑤ 只记“原范围 QA PASS” |
| KGAP-10 ① 截图 [#451](https://github.com/lingshf/ai-native-erp/pull/451) | `bb18960`；直接批准 [6082840624](https://github.com/lingshf/ai-native-erp/pull/451#pullrequestreview-6082840624) | cancelled（[45930751796](https://github.com/lingshf/ai-native-erp/actions/runs/45930751796)；下一合并提交 `cff34ba` 绿） | — |
| KGAP-12 文档 [#452](https://github.com/lingshf/ai-native-erp/pull/452) | `ff196c3`；直接批准 [6082837099](https://github.com/lingshf/ai-native-erp/pull/452#pullrequestreview-6082837099) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45930635757) | — |
| KGAP-14 [#453](https://github.com/lingshf/ai-native-erp/pull/453) | `395d9bd`；1 轮（[6082899977](https://github.com/lingshf/ai-native-erp/pull/453#pullrequestreview-6082899977)），批准 [6082907709](https://github.com/lingshf/ai-native-erp/pull/453#pullrequestreview-6082907709) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45931714644) | 证据钉点：F32 重钉时漏了 `copilot-ai-cleanup.ts:79–88`（`directory && terminated` 删除守卫） |
| 矩阵（KL） [#454](https://github.com/lingshf/ai-native-erp/pull/454) | `4852540`；1 轮（[6082905824](https://github.com/lingshf/ai-native-erp/pull/454#pullrequestreview-6082905824)），批准 [6082917809](https://github.com/lingshf/ai-native-erp/pull/454#pullrequestreview-6082917809) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45931894522) | 覆盖范围超出证据：<br>• `legacy-snapshot.md` 的 QA 只到 S26 Windows 正常路径；<br>• `backup-and-legacy.md` 已 QA 的范围要正面列出 |
| KGAP-15 [#455](https://github.com/lingshf/ai-native-erp/pull/455) | `9290af7`；1 轮（[6082915894](https://github.com/lingshf/ai-native-erp/pull/455#pullrequestreview-6082915894)），批准 [6082924352](https://github.com/lingshf/ai-native-erp/pull/455#pullrequestreview-6082924352) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45932033734) | 事实不准：<br>• Trust Center 是 GitHub 官方链接、由 Vanta 托管，不能因为托管在 Vanta 就推断它非官方；<br>• session-data 页也讲 GitHub.com 上的云端会话记录 |
| 状态同步 [#456](https://github.com/lingshf/ai-native-erp/pull/456) | `fb4775e`；1 轮（[6082955811](https://github.com/lingshf/ai-native-erp/pull/456#pullrequestreview-6082955811)），批准 [6082987287](https://github.com/lingshf/ai-native-erp/pull/456#pullrequestreview-6082987287) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45933018416) | 缺合并后复核证据：KGAP-10、11、13 的验收要求在修正合并提交上复核，PR 里还没有 |

### 2.3 本 Sprint 修正的事实不符

逐条断言、原文与证据都在各复核记录中（会话 files/，不入仓库），本节只汇总。所有修正都在合并提交上复核过，结论全部一致（链接见 §2.1）。

| 页面 | 来源 | 不符数 | 修正 PR | 合并后复核 |
| --- | --- | --- | --- | --- |
| `docs/user/trade-reports.md` | KGAP-10 ① | 3（1.06、1.24、1.30：两张旧布局截图、GL 核对截图缺“期初”列） | [#449](https://github.com/lingshf/ai-native-erp/pull/449)、[#451](https://github.com/lingshf/ai-native-erp/pull/451) | Product/Design PASS |
| `docs/user/trade.md`、`teaching-mode.md` | KGAP-10 ② | 12（列名、过时行号、过时的“未实测”、非原文引语、截图说明） | [#449](https://github.com/lingshf/ai-native-erp/pull/449) | Product/Design PASS |
| `docs/user/trade-main-path.md` | KGAP-10 ③ | 5 | [#447](https://github.com/lingshf/ai-native-erp/pull/447) | Product/Design PASS |
| `docs/user/backup-and-legacy.md` | KGAP-11 | 2（P1、P2） | [#443](https://github.com/lingshf/ai-native-erp/pull/443) | Delivery/Release PASS |
| `docs/user/getting-started.md` | KGAP-13 | 2（GS-13、GS-14） | [#445](https://github.com/lingshf/ai-native-erp/pull/445)、[#444](https://github.com/lingshf/ai-native-erp/pull/444) | Developer PASS |
| `docs/ai-assistant.md`、`docs/user/ledger.md` | KGAP-12（D603 交 KL） | 3（`ai-assistant.md:12` 的按钮名；`ledger.md:54` 补“先采纳再手工保存”；`ledger.md:36` 编辑器保留只适用于“业务事件”视图） | [#452](https://github.com/lingshf/ai-native-erp/pull/452) | QA 在 `cff34ba` 上 D603 复跑 5/5 PASS |

**合计 27 处。** KGAP-10 ④ 的 U21 数值 7 行出处全部一致，没有修正；`legacy-snapshot.md` 26 条全部一致。KGAP-14 只改钉点、不改事实文字，不计入本表。

## 3. 补充裁定与偏差

S28 期间的决定：

- D602（TL）：接受计划，不承诺版本号，砍项顺序 KGAP-15 → KGAP-14 → KGAP-13 → BUG-05 → KGAP-11 → KGAP-10 → KGAP-12。没有触发砍项。
- D603（PO）：处置 KGAP-12 的结果。
  - 06、11 两处 FAIL 是计划的预期写错，修订预期，不改产品行为；
  - 10 拆为两个场景；
  - 03 延期并登记为 KGAP-16；
  - 矩阵 ①④⑤ 只记“原范围 QA PASS”。

收尾时 PO 决定 **D604**：

- BUG-05 的代码、测试、QA 与 `trade-design.md:51` 已满足验收；`invoice-detail-flow.md:35` 没有在 Sprint 内修改，未满足 D595 跨文件验收中的这一句，记为偏差。BUG-05 状态保持 done 由本决定（D604）授权，加注“流程图 :35 待 KL”，交 Knowledge Lead 作为 [KDOC-13](../tasks/backlog/KDOC.md)。
- 下一 Sprint 候选的去向见 §4。
- BUG-05 的 main Full run 链接漏记于 #448 评论，是独立的证据记录遗漏，不计入上述偏差；处置为收尾时补记（[评论 7208995742](https://github.com/lingshf/ai-native-erp/pull/448#issuecomment-7208995742)），run 本身为 success。
- BUG-05 是否打版本由用户决定，本收尾只写“待用户授权”。

原文见 [S28 决定表](../tasks/S28.md#s28-期间决定)。

**缺陷**：本 Sprint 的复核与 QA 都没有发现新的产品缺陷，BUG-06 未使用。

## 4. 未完成与遗留

- **BUG-05 是否打版本**：**待用户授权**。没有打任何 tag，也没有发布任何版本。若用户授权，由 Delivery/Release 按发布指南整理 CHANGELOG 与发布候选。
- **v0.22.0 tag 与 Release**：待用户授权。RC2 已备好；授权后若 main 已前移，按发布指南核对 RC 范围。
- **M2-05 真实演练、M2-06 的 A / B / C 选择、Dependabot**：待用户授权。
- **P12（是否采用本机模型）**：待用户决策，不代定。
- **KGAP-16**（P3，blocked）：口径 5 有标记分支缺 CLI 端证据，**由 PO/TL 在 S29 规划时定范围**。在此之前，`backup-and-legacy.md` 的 ② 格不因它升级。
- **KGAP-15 / KGAP-04 缺口**：仍开放。GitHub Docs 中没有服务端数据处理专页，**下次复查时再看**。
- **`docs/user/trade.md:162` 引语**（P3）：引号内“订单不过账、不生成凭证”不是界面原文。原文是 `trade-order-labels.ts:122` 的“订单不过账，也不生成凭证。”。这一处不在 KGAP-10 ② 的不符清单内（同句的 `teaching-mode.md:13` 已由 2.M15 修正），交 Knowledge Lead 作为 [KDOC-12](../tasks/backlog/KDOC.md)。
- **`docs/flows/invoice-detail-flow.md:35`**（BUG-05 偏差，D604）：交 Knowledge Lead 作为 [KDOC-13](../tasks/backlog/KDOC.md)。
- **矩阵仍为 partial 的格**：见 [docs/README](../../docs/README.md) “KGAP-10/11/12/13 复核与 QA（S28）”一节。本 Sprint 没有格升 covered。

## 5. 核对命令

均在 main `fb4775e` 上运行：

- `gh pr view <n> --json title,mergeCommit,files`，取 #442–#456；
- `gh api repos/lingshf/ai-native-erp/pulls/<n>/reviews`：按 `VERDICT:` 行计打回，取批准评审中的 QA 行；
- `gh api repos/lingshf/ai-native-erp/issues/<n>/comments`：合并后复核与复验评论（#443、#444、#445、#447、#448、#449、#450、#451）；
- `gh run list --workflow full.yml --branch main --json databaseId,headSha,conclusion`，与 `git log --first-parent aca7e53..fb4775e` 对照；
- `git diff --stat aca7e53 fb4775e -- packages scripts .github`：只有 #448 的两个文件；
- `git diff --shortstat aca7e53 fb4775e`：21 个文件；
- `git grep -n "36 位 documentId" fb4775e -- docs/flows/invoice-detail-flow.md` 与 `git log -1 fb4775e -- docs/flows/invoice-detail-flow.md`（`25d1e3c`，#243）；
- `git grep -n "订单不过账" fb4775e -- docs/user/trade.md packages/web/src`。
