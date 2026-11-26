# S27 Sprint 评审（知识矩阵剩余格复核 + 贸易设计缺口编号，设计 / 产品）

- 作者：设计 / 产品负责人。核对时点：main `830c444ce243676f707cdeb9391d75144c2ffef8`（#440 合并后），核对时间 2026-11-26（UTC）。数字、状态、PR 号与 SHA 都以当时 `gh` / `git` 的输出为准，命令见 §5。格式沿用 [S26 评审](S26-review.md)。
- 对照基准：[S27 计划](../tasks/S27.md)（D596），各项验收以 [KGAP 表](../tasks/backlog/KGAP.md)的对应行与 S27 的[跨文件验收](../tasks/S27.md#跨文件验收d595按文件列验收句)为准。
- 范围：S27 计划基线 `242e2b7`（S26 收尾 [#432](https://github.com/lingshf/ai-native-erp/pull/432)）之后合并的 [#433](https://github.com/lingshf/ai-native-erp/pull/433)–[#440](https://github.com/lingshf/ai-native-erp/pull/440)，共 8 个 PR。本评审所在 PR 计入下一 Sprint。
- 只核对事实，只改 `design/` 文档。

## 1. 结论

**S27 accepted。** 计划四项（KGAP-06、KGAP-07、KGAP-08、KGAP-09）全部记为 done。KGAP-09 按计划允许的方式逐格交付：只交付了派发清单中的一部分，其余项按 D601 转出、对应格保持 partial（§2.1、§4）。按 D596，本 Sprint 不承诺版本号，也不做发布候选；须用户授权的事项都没有执行。

- **用户可见变化 0 项**：`git diff --stat 13c3135 830c444 -- packages scripts .github` 为空。全部改动都在 `design/` 与 `docs/`。
- **迁移 0 个**。
- **新增决定 D596–D601**（6 条，都由 TL 决定）：
  - D596 接受计划；
  - D597–D600 是 KGAP-08 的补登编号，其中 D600 为事后补记；
  - D601 在收尾时决定 KGAP-09 未交付项的去向。
- **本 Sprint 修正的事实不符 8 处**，另有 5 处改为如实标注（§2.3）。修正后由原复核人在合并提交上复核，全部一致。
- **评审打回 9 次**：8 个 PR 中 7 个打回 1 轮，1 个打回 2 轮（#437），没有直接批准的（§2.2）。按主要原因分：
  - 事实不准 5 次；
  - 按评审 QA 结论更新矩阵 2 次；
  - 证据计划 1 次；
  - 证据钉点 1 次。

  分析见 [S27 回顾](S27-retro.md)。
- **S27 范围内的 main Full**：8 个合并提交中 7 个 success，1 个 cancelled（`8e4b03a`，被紧接的 #435 推送取代，下一提交 `baf0ae1` 的 Full 为绿），0 个 failure。
- **偏差 1 项（D601）**：KGAP-09 派发清单中有 3 类项没有交付：Product/Design 复核 4 项、Delivery/Release 复核 1 项、QA 演练 5 项。它们转为下一 Sprint 规划候选，不计入 KGAP-09 的 done（§4）。

## 2. 目标与验收逐项核对

### 2.1 D596 目标

| 目标 / 项 | 判定 | 证据（PR / SHA / 复核 / QA） |
| --- | --- | --- |
| 1a. 矩阵贸易行设计列可判定（KGAP-06） | accepted | **复核**：Developer 复核记录 `kgap-06-review.md`（会话 files/，基线 `13c3135e4c693b0d42a67a0a3abc2cff9d56c7b8`）。共 73 条断言：一致 69、不符 2（N1、N2）、无法判定 2（1.12 的 p95 停止规则、3.16 的 1440 布局），另有缺陷候选 D1。<br>**修正**：[#436](https://github.com/lingshf/ai-native-erp/pull/436) `46bcffa`，打回 1 轮后批准 [6079375519](https://github.com/lingshf/ai-native-erp/pull/436#pullrequestreview-6079375519)，QA not_applicable。<br>**合并后复核**：[评论 7201506866](https://github.com/lingshf/ai-native-erp/pull/436#issuecomment-7201506866) @ `46bcffaeb15246c5c5bbdb296ba14c89d5e3d78e`，5 项全部一致。<br>**矩阵**：[#438](https://github.com/lingshf/ai-native-erp/pull/438) `e974548`，打回 1 轮后批准 [6079500969](https://github.com/lingshf/ai-native-erp/pull/438#pullrequestreview-6079500969)，QA not_applicable。设计列升 covered，**仅限 `design/trade-design.md` 第 1–9 节** @ `46bcffa`。p95 与 1440 布局仍写“依据任务书，未实测”；第 10 节的缺口与 BUG-05 照写 |
| 1b. 矩阵 AI 行取舍格可判定（KGAP-07） | accepted | **复核**：Developer 复核记录 `kgap-07-review.md`（会话 files/，基线 `13c3135`）。31 条断言：事实 19 条，全部一致；产品判断 12 条（P1–P12），由 Product/Design 在同一记录中确认分类。<br>**修正**：没有不符项，所以没有修正 PR，也不需要合并后复核（S27“合并后证据”表的“无修正”一行）。<br>**矩阵**：[#437](https://github.com/lingshf/ai-native-erp/pull/437) `f06935b`，打回 2 轮后批准 [6079393366](https://github.com/lingshf/ai-native-erp/pull/437#pullrequestreview-6079393366)，QA not_applicable。取舍格升 covered，**仅限[路线图 §6.1](../roadmap.md#61-取舍补记d564) AI 补记行** @ `019ff9262dfb7c2c0668073c3757699805be7ccb`。KGAP-04 的服务端数据处理缺口照写 |
| 2. 贸易设计第 10 节编号（KGAP-08） | accepted | **编号**：[#434](https://github.com/lingshf/ai-native-erp/pull/434) `8e4b03a`，打回 1 轮后批准 [6079330902](https://github.com/lingshf/ai-native-erp/pull/434#pullrequestreview-6079330902)，QA not_applicable。登记 D597（TORD-05）、D598（TINV-05）、D599（TLIST-02）、D600（订单只插入，事后补记）。TORD-03/04 不登记编号，理由写在第 10 节：两份任务书都没有独立的“设计决定”节。`--check` 通过（D1–D600）。<br>**矩阵**：贸易行缺口句随 [#438](https://github.com/lingshf/ai-native-erp/pull/438) 更新 |
| 3. KGAP-01 剩余页的复核与 QA（KGAP-09） | accepted（按页面逐格交付，部分交付；D601） | **复核**：发布记录 `kgap09-fact-review-delivery.md`（基线 `13c3135`）；开发记录 `kgap-09-dev-review.md`（基线 `f06935b`，56 条：一致 51、部分复现 1、不符 2、无法判定 2）。<br>**修正**：[#435](https://github.com/lingshf/ai-native-erp/pull/435) `baf0ae1`（`ci.md`、`migration-runbook.md`，打回 1 轮后批准 [6079334363](https://github.com/lingshf/ai-native-erp/pull/435#pullrequestreview-6079334363)；合并后复核 [评论 7201255453](https://github.com/lingshf/ai-native-erp/pull/435#issuecomment-7201255453)，四处一致）；[#439](https://github.com/lingshf/ai-native-erp/pull/439) `9a66d00`（`user/ledger.md`、`user/backup-and-legacy.md`，打回 1 轮后批准 [6079563362](https://github.com/lingshf/ai-native-erp/pull/439#pullrequestreview-6079563362)；合并后复核 [评论 7201694178](https://github.com/lingshf/ai-native-erp/pull/439#issuecomment-7201694178)，全部一致）。<br>**矩阵**：[#440](https://github.com/lingshf/ai-native-erp/pull/440) `830c444`，打回 1 轮后批准 [6079614820](https://github.com/lingshf/ai-native-erp/pull/440#pullrequestreview-6079614820)。只有“测试与 CI 质量 → 实现契约 → `docs/ci.md`”升 covered，**仅限发布实跑过的本地命令**，钉 `baf0ae1`；workflow 触发与失败排查为 QA N/A。`operations.md`、`user/ledger.md`、`user/backup-and-legacy.md`、`migration-runbook.md` 已复核并钉版本，但仍为 partial。<br>**未交付**：派发清单中的其余项按 D601 转出，见 §4 |
| 4. 按 D595 写跨文件验收与 PR 正文证据计划 | accepted | 写在计划 [#433](https://github.com/lingshf/ai-native-erp/pull/433) `13c3135`（打回 1 轮后批准 [6079263284](https://github.com/lingshf/ai-native-erp/pull/433#pullrequestreview-6079263284)，QA not_applicable）。执行情况见[回顾](S27-retro.md#s26-回顾行动项检查) |
| 版本 | 不适用（D596） | 本 Sprint 不承诺版本号，不做发布候选 |
| v0.22.0 tag 与 Release、M2-05、M2-06、Dependabot | 待授权（不在 S27 范围） | 都没有执行。RC2 [#401](https://github.com/lingshf/ai-native-erp/pull/401) `50fce09` 仍是已备好、未发布 |
| 门禁：覆盖最后一个合并提交的 main Full 为绿 | 达成 | `830c444` [Full 45884997859](https://github.com/lingshf/ai-native-erp/actions/runs/45884997859) success。按 S27 证据计划，Full 只作门禁，不作为各项的验收证据 |

### 2.2 各 PR 评审

评审都以 COMMENTED 状态提交，结论按正文首行的 `VERDICT:` 计；`CHANGES_REQUESTED` 记为打回。“打回点”一栏只写主要原因，分类口径见[回顾](S27-retro.md#打回分类)。

| PR | 合并 / 轮次 | main Full | 打回点 |
| --- | --- | --- | --- |
| S27 计划 [#433](https://github.com/lingshf/ai-native-erp/pull/433) | `13c3135`；1 轮（[6079232491](https://github.com/lingshf/ai-native-erp/pull/433#pullrequestreview-6079232491)），批准 [6079263284](https://github.com/lingshf/ai-native-erp/pull/433#pullrequestreview-6079263284) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45880316608) | 证据计划：<br>• KGAP-06/09 缺合并后的复核与钉点证据；<br>• KGAP-07 按整列排除了事实；<br>• KGAP-08 跨文件表漏 `design/decisions.md` 的验收句；<br>• KGAP-09 清单外的剩余项没有写去向 |
| KGAP-08 [#434](https://github.com/lingshf/ai-native-erp/pull/434) | `8e4b03a`；1 轮（[6079309649](https://github.com/lingshf/ai-native-erp/pull/434#pullrequestreview-6079309649)），批准 [6079330902](https://github.com/lingshf/ai-native-erp/pull/434#pullrequestreview-6079330902) | cancelled（被 #435 的推送取代；`baf0ae1` [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45881455319)） | 事实不准：<br>• TORD-03/04 不登记的理由写成“只有接口规格”；<br>• D600 的 grep 证据不可重放 |
| KGAP-09 ci.md / runbook [#435](https://github.com/lingshf/ai-native-erp/pull/435) | `baf0ae1`；1 轮（[6079325414](https://github.com/lingshf/ai-native-erp/pull/435#pullrequestreview-6079325414)），批准 [6079334363](https://github.com/lingshf/ai-native-erp/pull/435#pullrequestreview-6079334363) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45881455319) | 事实不准：<br>• 把 `core.autocrlf=true` 写成 CRLF 的成因，而 `.gitattributes` 指定了 `eol=lf`；<br>• `test:changed` 的排除模式没有照抄 `package.json:22` |
| KGAP-06 修正 [#436](https://github.com/lingshf/ai-native-erp/pull/436) | `46bcffa`；1 轮（[6079349789](https://github.com/lingshf/ai-native-erp/pull/436#pullrequestreview-6079349789)），批准 [6079375519](https://github.com/lingshf/ai-native-erp/pull/436#pullrequestreview-6079375519) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45882006042) | 事实不准：<br>• N1 的离开确认把四种行为并成一句；<br>• 无效发票号没有区分两种情况；<br>• p95 没有把 bench 判据与人工报告规则分开；<br>• 页首缺复核记录名与基线 |
| KGAP-07 矩阵（KL） [#437](https://github.com/lingshf/ai-native-erp/pull/437) | `f06935b`；2 轮（[6079365326](https://github.com/lingshf/ai-native-erp/pull/437#pullrequestreview-6079365326)、[6079381820](https://github.com/lingshf/ai-native-erp/pull/437#pullrequestreview-6079381820)），批准 [6079393366](https://github.com/lingshf/ai-native-erp/pull/437#pullrequestreview-6079393366) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45882391194) | 第 1 轮按评审 QA 结论更新：评审判 QA not_applicable 后，要求升 covered 并删掉“QA 尚未记录”等旧说明。<br>第 2 轮钉点：完整 SHA 只写在取舍格，不在同一行的“证据版本”列（D559） |
| KGAP-06/08 矩阵（KL） [#438](https://github.com/lingshf/ai-native-erp/pull/438) | `e974548`；1 轮（[6079491874](https://github.com/lingshf/ai-native-erp/pull/438#pullrequestreview-6079491874)），批准 [6079500969](https://github.com/lingshf/ai-native-erp/pull/438#pullrequestreview-6079500969) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45883538741) | 按评审 QA 结论更新：<br>• 引用 QA 结论，把设计列升为仅限第 1–9 节的 covered；<br>• 写全复核文件名 |
| KGAP-09 ledger / backup-and-legacy [#439](https://github.com/lingshf/ai-native-erp/pull/439) | `9a66d00`；1 轮（[6079549361](https://github.com/lingshf/ai-native-erp/pull/439#pullrequestreview-6079549361)），批准 [6079563362](https://github.com/lingshf/ai-native-erp/pull/439#pullrequestreview-6079563362) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45884251781) | 事实不准：<br>• “约 9 小时”是估算，被与历史测量混写；<br>• 427 / 492 MiB 的差异被写成“与运行环境有关”，而开发记录只写“可能”，并未隔离变量（回顾议题 1） |
| KGAP-09 矩阵（KL） [#440](https://github.com/lingshf/ai-native-erp/pull/440) | `830c444`；1 轮（[6079597075](https://github.com/lingshf/ai-native-erp/pull/440#pullrequestreview-6079597075)），批准 [6079614820](https://github.com/lingshf/ai-native-erp/pull/440#pullrequestreview-6079614820) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45884997859) | 事实不准：<br>• 迁移手册的复核范围写反了（本轮复核的是 §6、§10 以外各节）；<br>• “泳道 C 收尾”的 CI 行仍是旧结论；<br>• PR 正文缺合并后复核链接与 D591 的 grep 输出 |

### 2.3 本 Sprint 修正的事实不符

所有修正都由原复核人在修正 PR 的合并提交上复核，结论全部一致（链接见 §2.1）。

| 页面 | 复核号 | 原断言 → 修正 | PR |
| --- | --- | --- | --- |
| `design/trade-design.md` | N1 | 原文“离开确认统一为 `trade.leaveConfirm`”，改为分开写四点：<br>• 订单页实际用 `tord.leaveConfirm`；<br>• 普通导航的共享行为；<br>• 修饰键点击的差异；<br>• busy 状态在预览与 `fromOrder` 读取时也会置位 | [#436](https://github.com/lingshf/ai-native-erp/pull/436) |
| `design/trade-design.md` | N2 | 超量开票的括注改为与代码一致：过账时超量直接拒绝。注明出处 S15 决定 4，并写明现行代码已与该决定不同 | [#436](https://github.com/lingshf/ai-native-erp/pull/436) |
| `docs/ci.md` | 发布 | Windows 下 `npm run check` 报换行错误：先用 `git ls-files --eol` 看实际检出状态，不再归因于某项 autocrlf 设置 | [#435](https://github.com/lingshf/ai-native-erp/pull/435) |
| `docs/ci.md` | 发布 | `test:changed` 也固定排除 `**/*.slow.test.{ts,tsx}`（照抄 `package.json:22`） | [#435](https://github.com/lingshf/ai-native-erp/pull/435) |
| `docs/migration-runbook.md` | 发布 | MB 改为 MiB（与 `scripts/bench-migration-rehearsal.mjs` 的 `PEAK_RSS_BUDGET_MIB` 一致） | [#435](https://github.com/lingshf/ai-native-erp/pull/435) |
| `docs/migration-runbook.md` | 发布 | 测试表中不存在的“M2-03 / M2-03b”标签，改为按用例名指向 `storage-admin-cli.test.ts:58,103` | [#435](https://github.com/lingshf/ai-native-erp/pull/435) |
| `docs/user/ledger.md` | K9-N1 | 原文“内置八个科目受保护”，改为：只有月度教学公司的内置八科目不可修改；年度模式公司同样建有这些科目，但可以编辑 | [#439](https://github.com/lingshf/ai-native-erp/pull/439) |
| `docs/user/ledger.md` | K9-N2 | 控制科目原文“只能由贸易单据过账”，改为：不能手工记账；贸易单据与旧账导入（`LEGACY`）都可以过账 | [#439](https://github.com/lingshf/ai-native-erp/pull/439) |

**改为如实标注的 5 处**：这些不是事实错误，而是原文没有区分证据的性质。

- `trade-design.md` 中的 p95 停止规则与 1440 布局：标为“依据任务书，未实测”（#436）。
- `backup-and-legacy.md`：
  - “约 9 小时”标为当时的估算；
  - 566 MiB 标为历史测量；
  - 427 MiB 保留为 D434 时的测量，并注明本机重测为 492 MiB，两次数值不同的原因未验证（#439）。

KGAP-07 的 19 条事实全部一致，没有修正。

## 3. 补充裁定与偏差

S27 期间由 TL 决定：

- D596：接受计划，不承诺版本号，砍项顺序 09 → 08 → 07；
- D597–D600：KGAP-08 补登编号，D600 为事后补记。

收尾时 TL 决定 D601：KGAP-09 按已交付的格记为 done，派发清单中未交付的项转为下一 Sprint 规划候选。原文见 [S27 决定表](../tasks/S27.md#s27-期间决定)。

**缺陷**：KGAP-06 的缺陷候选 D1 先查 [BUG 表](../tasks/backlog/BUG.md)确认编号未被占用，再登记为 **BUG-05**（P3，open）：发票详情页的前端 ID 校验比服务端的 UUIDv4 校验宽。按 S27 计划，本 Sprint 只登记、不修，也没有出现编号别名。

**产品判断 P12**：“是否采用本机模型”是用户的决定。Product/Design 在 KGAP-07 记录中只确认它属于产品判断，不代用户决定；它仍待用户决策（§4）。

## 4. 未完成与遗留

- **v0.22.0 tag 与 Release**：待用户授权。RC2 已备好；授权后若 main 已前移，按发布指南核对 RC 范围。
- **M2-05 真实演练、M2-06 的 A / B / C 选择、Dependabot**：待用户授权。
- **P12（是否采用本机模型）**：待用户决策。[路线图 §6.1](../roadmap.md#61-取舍补记d564) AI 补记行只写为未来另议，Product/Design 不代定。
- **KGAP-04**：仍开放。“官方服务端数据处理说明”没有专门的官方页面，作为已知缺口保留在 [`docs/ai-assistant.md`](../../docs/ai-assistant.md) §7 与矩阵 G1。AI 行升 covered 只限 §6.1 补记行，不覆盖这一缺口。
- **BUG-05**（P3，open）：已登记，未修。
- **KGAP-09 未交付项**（D601，转为下一 Sprint 规划候选，对应格保持 partial）：
  - Product/Design 复核：
    - `user/trade-reports.md` 全文；
    - `user/trade.md`、`teaching-mode.md`、`ui-guide.md` 的 U12、U29 逐版本细节；
    - `user/trade-main-path.md` 逐版本路径的文字；
    - `user/backup-and-legacy.md` 的 U21 基准数值（Developer 已核 :93、:99-102，并按 #439 标注了证据性质，但 Product/Design 没有单独复核）。
  - Delivery/Release 复核：`user/backup-and-legacy.md` 全文（此前只抽查）。
  - QA 演练：
    - `operations.md` 已死进程租约自动清除；
    - `backup-and-legacy.md` 无伙伴标记时的口径 5 与阻断类别；
    - `user/ledger.md` 保存、过账、AI（假 SDK）、队列分支的真实浏览器演练；
    - `ai-assistant.md` 整页本机 / 假 SDK 演练；
    - `flows/settlement-flow.md` 浏览器原生离开页面行为。
- **清单外剩余项**：按 [KGAP 表“未列入项去向”](../tasks/backlog/KGAP.md)处理。`legacy-snapshot.md`、`user/getting-started.md` 的事实复核由 TL 在下一 Sprint 规划时决定。
- **矩阵仍为 partial 的格**：
  - 贸易行的 M1 任务书与运行行为，以及设计第 10 节的缺口；
  - AI 行除 §6.1 补记行以外的部分；
  - 上述 KGAP-09 各页。

  逐格见 [docs/README](../../docs/README.md)。
- **KGAP-07 复核记录中的 R1**：[事实清单](../ai-assistant-facts.md)的出处行号有漂移。#437 在矩阵中注明以复核记录在 `13c3135` 上的行号为准，清单本身没有改，作为下一 Sprint 候选。

## 5. 核对命令

均在 main `830c444` 上运行：

- `gh pr view <n> --json title,mergeCommit`，取 #433–#440；
- `gh api repos/lingshf/ai-native-erp/pulls/<n>/reviews`：按正文首行 `VERDICT:` 计打回，取批准评审的 `QA:` 行；
- `gh api repos/lingshf/ai-native-erp/issues/<n>/comments`：合并后复核评论（#435、#436、#439）；
- `gh run list --workflow full.yml --branch main --limit 40 --json databaseId,headSha,conclusion`，与 `git log --first-parent 242e2b7..830c444` 对照；
- `git diff --stat 13c3135 830c444 -- packages scripts .github`（空）；
- `git diff --stat 13c3135 830c444`：9 个文件，都在 `design/` 与 `docs/` 下。
