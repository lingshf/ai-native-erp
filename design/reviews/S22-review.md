# S22 Sprint 评审（v0.21.0，设计 / 产品）

- 作者：设计 / 产品负责人。核对时点：main `0494020`（#319 合并后），核对时间 2026-11-24（UTC）。数字、状态、PR 号与 SHA 都以当时 `gh` / `git` 的输出为准，命令见 §5。格式沿用 [S21 评审](S21-review.md)。
- 范围：归属 S22 的 PR，共 8 个（不是 S22 时间段内合并的全部 PR）：
  - S21 遗留：S21 评审与回顾 [#314](https://github.com/lingshf/ai-native-erp/pull/314)；
  - 开发 [#311](https://github.com/lingshf/ai-native-erp/pull/311)（REFAC-12）、[#312](https://github.com/lingshf/ai-native-erp/pull/312)（SLOT-05）、[#316](https://github.com/lingshf/ai-native-erp/pull/316)（TLIST-06）；
  - 设计：D513 同步 [#315](https://github.com/lingshf/ai-native-erp/pull/315)；S23 计划 [#318](https://github.com/lingshf/ai-native-erp/pull/318)（按 S20 评审对 #300 的口径，计划 PR 计入它合并时所在的 Sprint，S23 评审不再重复计入）；
  - 发布流程文档：DOC-22(b) [#317](https://github.com/lingshf/ai-native-erp/pull/317)（DOC-22(a) #309 已计入 S21 评审）；
  - 版本管理：RC 与 Demo [#319](https://github.com/lingshf/ai-native-erp/pull/319)。
  - 不计入：v0.21.0 日期 PR [#321](https://github.com/lingshf/ai-native-erp/pull/321)（1 次打回，本 PR 送审后合并为 main `91f066e629fa54dba5da3913a126624670ec4351`，计入 S23 评审）；TSET-01 [#320](https://github.com/lingshf/ai-native-erp/pull/320)（S23 任务，未合并）。
- **v0.21.0 已发布**：annotated tag `v0.21.0`（tag 对象 `416b3090cb89bf8451f7a77ce09e9082b845c108`）指向 `01b16dbf36dd4feab80aee05f9583cfe9bc1de13`，即 `release/v0.21.0` 上 #319 审核通过的 RC head，不在 main 上（D484）。Release 发布于 2026-11-24T04:45:26Z。发布日期由 #321 写入（已合并，v0.21.0 发布收尾完成）。
- 只核对事实，只改 `design/` 文档，不改业务代码，不碰 CHANGELOG、`docs/release/` 与 `docs/demo/`。

## 1. 结论

**S22 通过。** SLOT-05、REFAC-12、TLIST-06 三项开发任务与 DOC-22 (a)(b) 全部合并，验收满足；DEMO-22 的 RC 与 Demo 已合并，v0.21.0 已打 tag 并发布。日期 PR #321 已合并。没有设计侧阻塞项。

- **用户可见变化 1 项**：TLIST-06 在付款与收款页的分配页签加“刷新列表” / “Refresh list”（D513：只重读未结项，不清草稿、预览与待确认信封）。版本取 MINOR（0.20.0 → 0.21.0，D514），与 S22 计划“TLIST-06 在冻结范围内取下一个 MINOR”一致。
- **迁移 0 个**（仍为 `020-trade-order-invoicing-credits.sql`，下一个可用编号 021；`git diff --name-only v0.20.0 v0.21.0` 中没有 `.sql` 文件）。
- tag 树与 RC 范围终点 `3ae4848` 相比，`packages`、`scripts`、`.github`、`package.json`、lock 都没有差异（§5.3，输出 0 行）。
- 产品与工具变更：`git diff --shortstat v0.20.0 3ae4848 -- packages` 为 16 个文件，+1081 / −535（REFAC-12 与 TLIST-06）；`-- scripts` 为 3 个文件，+398（SLOT-05）。`TradeSettlements` 入口 465 → 58 行，主文件 630 → 157 行。
- **S22 范围内的 main Full**：8 个合并提交，8 个 success，0 个 cancelled，0 个 failure（§5.2）。
- **评审打回 12 次、待证据 0 次**（S21 为 12 次、0 次）：设计 3（#314 一次、#318 两次）、开发 3（#311、#312、#316 各一次）、发布流程文档与版本管理 6（#317 三次、#319 三次）。#315 直接批准。#319 的打回点集中在证据不全，见 §2.2 与[回顾议题 1](S22-retro.md#议题-1demo-22-的-rc-退回-3-轮证据不全)。
- **预算例外 1 次**：D519，Sprint 累计 `TradeSettlements` 路由 +841 B 超过 +200 B，来自 REFAC-12（+775 B，按其自身预算已批准）；TLIST-06 本身 +66 B，首屏 +2 B。
- **冲突域越界 0 次**；派发后的补充裁定 2 次（都在 S23 任务或 DEMO-22 上，见 §3）：D520（TSET-01 N7 首屏预算自相矛盾）、D521（DEMO-22 K2 金额断言作废）。
- **真实时段 1 次，一次通过**：capture 干跑 exit 0，K1 / K3 通过；slot-run exit 0；`gate-snapshot.ps1` 窗口内 4 帧、129 数据行、0 error。K2 的金额断言因 capture 选择器缺陷作废（D521，不是产品缺陷），改由 TLIST-06 S3 证明。SLOT-05 第一次实用：窗内 59 个 node 行都能在同一帧找到父进程行，cwd 全部取到（§4、[回顾](S22-retro.md#s20--s21-回顾行动项检查)）。

## 2. 目标与验收逐项核对

### 2.1 Sprint 目标

| 目标 | 结果 | 证据 |
| --- | --- | --- |
| SLOT-05：开窗前与窗口内每分钟快照工具 `gate-snapshot.ps1` | 达成 | [#312](https://github.com/lingshf/ai-native-erp/pull/312) `7c7cafd`。首轮打回 4 处（查询失败被当作空闲、写入失败仍退出 0、补跑错过的节拍、G10 证据 SHA 不符），修改后批准（[6033341831](https://github.com/lingshf/ai-native-erp/pull/312#pullrequestreview-6033341831)）。合并时主脚本 160 / 160 物理行、自测 220 / 220（达上限未超），最长命名函数 12 / 15 行。DEMO-22 第一次实用见 §1 |
| REFAC-12：拆分 `SettlementEntry`（不改行为） | 达成 | [#311](https://github.com/lingshf/ai-native-erp/pull/311) `9c05266`。首轮打回只在 R4 送审证据（zh / en 序列不全、B / F 只有摘录）；产品代码无阻塞；入口 465 → 58 行、主文件 630 → 157 行，最大新函数 73 行；路由 +775 B（其预算内），首屏 +2 B（[6033095329](https://github.com/lingshf/ai-native-erp/pull/311#pullrequestreview-6033095329)） |
| TLIST-06：付款与收款页加“刷新列表” | 达成 | [#316](https://github.com/lingshf/ai-native-erp/pull/316) `eac0c37`。首轮打回：S3 没有在加载第二页后经 UI 勾选并改金额；S5 / S6 在请求发出而不是完成后观察。修改后 base 7 个新断言失败、head 15 / 15；路由 +66 B / +200 B，首屏与 CSS 不增（[6033358291](https://github.com/lingshf/ai-native-erp/pull/316#pullrequestreview-6033358291)） |
| DOC-22：(a) 送审清单 `git grep` 自查；(b) Demo 模板第 23 条引用快照工具 | 达成 | (a) #309 `a1a1244`（计入 S21）；(b) [#317](https://github.com/lingshf/ai-native-erp/pull/317) `3ae4848`，3 次打回后批准（[6033450925](https://github.com/lingshf/ai-native-erp/pull/317#pullrequestreview-6033450925)） |
| S21 回顾行动 1–3 | 行动 1 部分达成、行动 2 达成、行动 3 未达成 | 见[回顾](S22-retro.md#s20--s21-回顾行动项检查) |
| DEMO-22：v0.21.0 RC 与 Demo | 达成，D519 / D521 | [#319](https://github.com/lingshf/ai-native-erp/pull/319) main `0494020`；tag → `01b16db`。RC 范围终点 `3ae4848`；端口 4204；一个窗口，一次通过 |
| 门禁：开发任务都已结案，覆盖最后一个合并提交的 main Full 绿 | 达成 | RC 范围终点 `3ae4848`（#317）的 [Full 45323357311](https://github.com/lingshf/ai-native-erp/actions/runs/45323357311) success |

### 2.2 各 PR 评审

评审都以 COMMENTED 状态提交，结论按正文首行 `VERDICT:` 计。打回与待证据的区分按 D451，口径与 S21 相同。本 Sprint 没有“只要求补证据、代码与文档都不改”的轮次，`CHANGES_REQUESTED` 全部记为打回。

| PR | 合并 / 轮次 | main Full | 结论与打回点 |
| --- | --- | --- | --- |
| REFAC-12 [#311](https://github.com/lingshf/ai-native-erp/pull/311) | `9c05266`；1 轮打回（[6033013484](https://github.com/lingshf/ai-native-erp/pull/311#pullrequestreview-6033013484)），批准 [6033095329](https://github.com/lingshf/ai-native-erp/pull/311#pullrequestreview-6033095329)（同一 head `b3212de`，只补评论中的证据） | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45317584310) | 打回点只在 R4 证据：规定序列没有在 zh / en 各走一遍（各场景固定了一种语言）；B / F 的逐步输出只有截断摘录，没有可核对的完整采样 |
| SLOT-05 [#312](https://github.com/lingshf/ai-native-erp/pull/312) | `7c7cafd`；1 轮打回（[6033062950](https://github.com/lingshf/ai-native-erp/pull/312#pullrequestreview-6033062950)），批准 [6033341831](https://github.com/lingshf/ai-native-erp/pull/312#pullrequestreview-6033341831) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45321725958) | 4 处：G6 把整个 `ObjectNotFound` 类别当成无监听（查询失败会误放行）；`CreateNew` / `AppendAllText` 失败仍可退出 0；采样按全局起点补跑错过的节拍；G10 日志打印的是 `a1a1244` 而不是送审 head |
| S21 评审与回顾 [#314](https://github.com/lingshf/ai-native-erp/pull/314) | `94f1da3`；1 轮打回（[6033185156](https://github.com/lingshf/ai-native-erp/pull/314#pullrequestreview-6033185156)），批准 [6033208289](https://github.com/lingshf/ai-native-erp/pull/314#pullrequestreview-6033208289) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45319491679) | 设计文档的事实：把第二窗口快照写成有父进程链（`ppid_chain` 全空）；行动 3 仍写“待确认”（已采纳） |
| D513 同步 [#315](https://github.com/lingshf/ai-native-erp/pull/315) | `4382b41`；直接批准 [6033194520](https://github.com/lingshf/ai-native-erp/pull/315#pullrequestreview-6033194520) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45319259756) | 通过 |
| TLIST-06 [#316](https://github.com/lingshf/ai-native-erp/pull/316) | `eac0c37`；1 轮打回（[6033257137](https://github.com/lingshf/ai-native-erp/pull/316#pullrequestreview-6033257137)），批准 [6033358291](https://github.com/lingshf/ai-native-erp/pull/316#pullrequestreview-6033358291) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45321996156) | 产品改动符合 D513；阻塞在用例覆盖：S3 用预置的 `sessionStorage` 代替“加载第二页后经 UI 勾选并改金额”；S5 / S6 在请求发出时观察，可能在响应处理前误绿 |
| DOC-22(b) [#317](https://github.com/lingshf/ai-native-erp/pull/317) | `3ae4848`；3 轮打回（[6033394504](https://github.com/lingshf/ai-native-erp/pull/317#pullrequestreview-6033394504)、[6033414368](https://github.com/lingshf/ai-native-erp/pull/317#pullrequestreview-6033414368)、[6033432696](https://github.com/lingshf/ai-native-erp/pull/317#pullrequestreview-6033432696)），批准 [6033450925](https://github.com/lingshf/ai-native-erp/pull/317#pullrequestreview-6033450925)，共 4 轮 | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45323357311)（RC 冻结点） | 第 1 轮：第 23 条把“建停止文件”写成必然 exit 0（实际还有 8 / 9）；T1–T4 缺 TSV 原始片段与完整命令；第 23 条前后原文不全。第 2 轮：路径未加引号、停止文件须初始不存在、8 与 9 并存的优先级；T2 的 `Start-Job` 块内 `$D` 不继承外层变量，所贴命令复现不了日志。第 3 轮：示例命令三处路径仍未加引号（实测含空格路径被拆成多个参数）。见[回顾议题 4](S22-retro.md#议题-4s21-行动-3-没有达成doc-22b-退回-3-轮) |
| S23 计划 [#318](https://github.com/lingshf/ai-native-erp/pull/318) | `fcf2db8`；2 轮打回（[6033491860](https://github.com/lingshf/ai-native-erp/pull/318#pullrequestreview-6033491860)、[6033510677](https://github.com/lingshf/ai-native-erp/pull/318#pullrequestreview-6033510677)），批准 [6033520050](https://github.com/lingshf/ai-native-erp/pull/318#pullrequestreview-6033520050)，共 3 轮 | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45324543334) | 第 1 轮：SLOT-06 G5 延迟 40 s 小于 15 s + 30 s，到不了停止超时；TSET-01 后台刷新中 `isSuccess` 仍为真，与“加载中不显示”矛盾，既有用例数写成 13（实为 15）；S22.md 仍把 D515 标为未分配。第 2 轮：上轮第 1、2 项各有后半句没改（“首帧总在端口检查之前”“退出时机不变”；M1 比较两个时点的草稿）。没有历史事实错误 |
| DEMO-22：RC 与 Demo [#319](https://github.com/lingshf/ai-native-erp/pull/319) | main `0494020`；3 轮打回（[6033643731](https://github.com/lingshf/ai-native-erp/pull/319#pullrequestreview-6033643731)、[6033686652](https://github.com/lingshf/ai-native-erp/pull/319#pullrequestreview-6033686652)、[6033738959](https://github.com/lingshf/ai-native-erp/pull/319#pullrequestreview-6033738959)），批准 [6033760986](https://github.com/lingshf/ai-native-erp/pull/319#pullrequestreview-6033760986)（`01b16db`，即 tag 指向的提交），共 4 轮 | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45328479050) | 通过。各轮都写明不重开窗口、不改原始日志。**取证缺口**（改写法补不回来，经协调者接受）：放行时刻、步骤 1 与窗口快照命令的启动时刻没有原始记录（`Get-Date` 输出没有存文件，转述的时刻已作废）；K2 金额断言因选择器缺陷无效（D521）。**证据格式与可更正的表述**：K2 的证据边界在 README / run-through / PR 正文不一致；D492 全产物清单缺原路径、字节数、行数与清理前哈希，前置产物（`npm ci`、构建日志、`gate-pre.tsv`）不在清单；原件与 blob 哈希未分开；`git diff --check` 全量 exit 2 没有披露、命令用 `HEAD`；D511 `git grep` 没有原样输出；缺发布证据索引。见[回顾议题 1](S22-retro.md#议题-1demo-22-的-rc-退回-3-轮证据不全) |

### 2.3 S22 共同验收

1. **可读性**（上限见 [S22.md 共同验收](../tasks/S22.md)）：REFAC-12 入口 58 行、主文件 157 行、最大新函数 73 行、最大新文件 138 行、深度 ≤ 3；SLOT-05 合并时主脚本 160 / 160、自测 220 / 220 物理行（达上限未超），最长命名函数 12 / 15 行；TLIST-06 分配页签 74 行（≤ 80），测试净增 180（达上限，评审要求以替换代替加用例）。三份评审都写明没有可读性阻塞。
2. **用户可见变化**：TLIST-06 有该节；REFAC-12、SLOT-05、DOC-22 写“无”，与评审核对一致。
3. **中英双语、红 / 绿主题、键盘可用、教学模式可关闭**：TLIST-06 复用 `master.listRefresh`，不加 CSS、不加教学文案。DEMO-22 在真实 Chrome 中记录 K1（Tab 到“刷新列表”，Enter、空格各 1 次请求）与 K3；两组各 4 张 PNG（1440 / 390）。
4. **冲突域**：没有越界。
5. **base 失败、head 通过**：三份开发 PR 都附了两侧原文；TLIST-06 的 S3、S5、S6 在评审要求下改为经 UI 交互、等请求完成后断言。
6. **证明附原文**：REFAC-12 的 R4 在第 2 轮补齐两种语言与完整采样；DEMO-22 的 D504 体积用入库的 `scripts/measure`。
7. **评审计数可重放**：本评审 §5 附命令并实跑。
8. **只用虚构数据**：DEMO-22 的临时账套 `erp-demo-<guid>` 删除前都有含 `-wal` / `-shm` 的文件清单与 SHA-256（run-through“D492 清单”），端口 4204；没有接触真实旧账、4173 账套或 `.bak` 文件。
9. **D11（现有测试不删除、不削弱）**：满足。REFAC-12 不改测试；TLIST-06 原 8 个用例未改；DEMO-22 的 K2 是作废证据，没有改写原始 JSON。

## 3. 评审裁定与本期决定

决定原文见 [S22.md 决定表](../tasks/S22.md)（D513、D514）与 [S23.md 决定表](../tasks/S23.md#s23-期间决定)（D515–D522，D518–D522 由本 PR 写入）。时序与 SHA 角色以 [`docs/demo/v0.21.0/run-through.md`](../../docs/demo/v0.21.0/run-through.md) 为准。本评审不摘录决定内容，只列编号与归属：

| 编号 | 归属 | 记在 |
| --- | --- | --- |
| D513 | TLIST-06 刷新只调 `page.refetch()` | S22.md |
| D514 | S22 版本 v0.21.0 | S22.md |
| D515–D517 | S23 三份任务书的核心设计决定 | S23.md |
| D518 | TSET-01 焦点方案 | S23.md |
| D519 | DEMO-22 体积例外 | S23.md（DEMO-22 在 S23 计划期间开窗，按编号顺序记入现行决定表） |
| D520 | TSET-01 N7 首屏预算口径 | S23.md |
| D521 | DEMO-22 K2 金额断言作废，改由 TLIST-06 S3 证明 | S23.md |
| D522 | SLOT-06 快照日志命名 `.stdout.log` / `.stderr.log` | S23.md |

下一个可用编号 D523。

## 4. 遗留与待办

| 项 | 处理 | 落点 |
| --- | --- | --- |
| v0.21.0 日期 PR #321 | 已合并（`91f066e`，1 次打回），计入 S23 评审 | S23 |
| v0.21.0 不在 main 上（D484） | DEMO-23 按冻结的 RC 范围终点逐行分类并写明合并基（同 DEMO-22） | S23 DEMO-23 |
| K2 修正后的 capture 脚本未在真实浏览器验证（D521） | 不补取证；DEMO-23 若复用该脚本，按[回顾行动 2](S22-retro.md#行动项汇总)先在窗口外校验定位 | S23 DEMO-23 |
| 放行时刻与快照启动时刻没有原始记录 | 已由协调者接受；回顾行动 1 | S23 DEMO-23 |
| SLOT-06 派发条件 | DEMO-22 窗口已关闭，run-through 已记录 SLOT-05 第一次实用（4 帧、129 行、0 error）；设计已复核，任务书不需修改 | S23 |
| 本机并行跑 web 全量时 `waitFor` 超时 | 回顾议题 3、行动 4；main Full 未受影响 | S23 / 候选池 |
| Demo 脚本删除账套前写全产物清单的脚本化 | DEMO-22 已在 `run-main.ps1` 中手工实现账套清单，全产物清单仍是手工；回顾行动 1 | 候选池（S24） |
| `-HASH` 口径文档、`bundle-compare.mjs` 拆分、`scripts/measure` 接入 CI | 不变 | 候选池 |
| M2-05 真实演练、M2-06 | 仍待用户决定 A / B / C | 路线图 M2 |

## 5. 可重放的计数

### 5.1 评审轮次

```powershell
foreach ($n in 311,312,314,315,316,317,318,319) {
  "=== #$n"
  gh api --paginate repos/lingshf/ai-native-erp/pulls/$n/reviews --jq '.[] | "\(.id) \(.commit_id[0:7]) \((.body | split("\n"))[0])"'
}
```

输出（2026-11-24，main `0494020`）：#315 只有 1 次 `APPROVED`；#311、#312、#314、#316 各有 1 次 `CHANGES_REQUESTED` 和 1 次 `APPROVED`；#318 有 2 次 `CHANGES_REQUESTED` 和 1 次 `APPROVED`；#317、#319 各有 3 次 `CHANGES_REQUESTED` 和 1 次 `APPROVED`。`CHANGES_REQUESTED` 共 12 次，全部记为打回。

### 5.2 main Full

```powershell
git log --oneline --first-parent dcc6c5b..0494020   # 7 个提交；#311 的 9c05266 在 dcc6c5b 之前合并
gh run list --workflow full.yml --branch main --limit 12 --json databaseId,headSha,conclusion,event,attempt
```

| 合并提交 | PR | Full | 结论 |
| --- | --- | --- | --- |
| `9c05266` | #311 | [45317584310](https://github.com/lingshf/ai-native-erp/actions/runs/45317584310) | success |
| `4382b41` | #315 | [45319259756](https://github.com/lingshf/ai-native-erp/actions/runs/45319259756) | success |
| `94f1da3` | #314 | [45319491679](https://github.com/lingshf/ai-native-erp/actions/runs/45319491679) | success |
| `7c7cafd` | #312 | [45321725958](https://github.com/lingshf/ai-native-erp/actions/runs/45321725958) | success |
| `eac0c37` | #316 | [45321996156](https://github.com/lingshf/ai-native-erp/actions/runs/45321996156) | success |
| `3ae4848` | #317 | [45323357311](https://github.com/lingshf/ai-native-erp/actions/runs/45323357311) | success（RC 冻结点） |
| `fcf2db8` | #318 | [45324543334](https://github.com/lingshf/ai-native-erp/actions/runs/45324543334) | success |
| `0494020` | #319 | [45328479050](https://github.com/lingshf/ai-native-erp/actions/runs/45328479050) | success |

所有 run 都是 `event=push`、`attempt=1`。

### 5.3 发布

```powershell
git ls-remote origin refs/tags/v0.21.0 'refs/tags/v0.21.0^{}' refs/heads/release/v0.21.0
# 416b3090cb89bf8451f7a77ce09e9082b845c108 refs/tags/v0.21.0
# 01b16dbf36dd4feab80aee05f9583cfe9bc1de13 refs/tags/v0.21.0^{}
# 01b16dbf36dd4feab80aee05f9583cfe9bc1de13 refs/heads/release/v0.21.0
gh release view v0.21.0 --json publishedAt   # 2026-11-24T04:45:26Z
git merge-base --is-ancestor v0.21.0 origin/main   # 退出码 1：tag 不在 main 上
git diff --name-only 3ae4848 v0.21.0 -- packages scripts .github package.json package-lock.json   # 0 行
git diff --shortstat v0.20.0 3ae4848 -- packages   # 16 个文件，+1081 / −535
git diff --shortstat v0.20.0 3ae4848 -- scripts    # 3 个文件，+398
git diff --shortstat v0.20.0 v0.21.0    # 70 个文件，+4519 / −550
git diff --shortstat v0.20.0...v0.21.0  # 111 个文件，+6957 / −548
```

### 5.4 窗口快照（SLOT-05 第一次实用）

```powershell
$r = git show 0494020:docs/demo/v0.21.0/logs/gate-window.tsv | ConvertFrom-Csv -Delimiter "`t"
$r | Group-Object snapshot, kind | ForEach-Object { "$($_.Name)=$($_.Count)" }
# 每帧 node / ancestor / listen：1: 9/9/2，2: 21/23/2，3: 19/20/2，4: 10/10/2（共 129 行）
$nodes = $r | Where-Object kind -eq 'node'
$nodes | Where-Object { $n = $_; -not ($r | Where-Object { $_.snapshot -eq $n.snapshot -and $_.pid -eq $n.ppid }) -and -not $n.note }
# 0 行：59 个 node 行都能在同一帧找到父进程行
($r | Where-Object cwd -eq 'unreadable').Count   # 0
```

四帧的 4204 与 4173 都是 `kind=listen pid=none`。
