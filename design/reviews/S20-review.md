# S20 Sprint 评审（v0.19.0，设计 / 产品）

- 作者：设计 / 产品负责人。核对时点：main `c6d5e24`（#302 合并后），核对时间 2026-11-24（UTC）。数字、状态、PR 号与 SHA 都以当时 `gh` / `git` 的输出为准，命令见 §5。格式沿用 [S19 评审](S19.md)。
- 范围：归属 S20 的 PR，共 7 个（不是 S20 时间段内合并的全部 PR）：
  - S19 遗留：S19 评审与回顾 [#297](https://github.com/lingshf/ai-native-erp/pull/297)；
  - 计划 [#294](https://github.com/lingshf/ai-native-erp/pull/294)（`5664fea`，在 S19 时段合并，S19 评审已注明归 S20）；
  - 开发 [#296](https://github.com/lingshf/ai-native-erp/pull/296)（TLIST-04）、[#298](https://github.com/lingshf/ai-native-erp/pull/298)（MEAS-01）、[#299](https://github.com/lingshf/ai-native-erp/pull/299)（REFAC-11）；
  - 版本管理：RC 与 Demo [#302](https://github.com/lingshf/ai-native-erp/pull/302)；
  - S21 计划 [#300](https://github.com/lingshf/ai-native-erp/pull/300)：按 S19 的口径计划 PR 归它所计划的 Sprint，这里按协调者给出的素材计入 S20，S21 评审不再重复计入。
  - 不计入：TLIST-05 [#301](https://github.com/lingshf/ai-native-erp/pull/301)（`f9024d5`，S21 任务；在 RC 范围冻结之后合并，RC 已记为延后）；v0.19.0 发布日 PR（由版本管理负责，核对时尚未开，归 S21 评审计入）。
- **v0.19.0 已发布**：annotated tag `v0.19.0`（tag 对象 `a858945bdb7f25072a259e31d64609be350d97a6`）指向 `10292ede0906f96d26806bdd9bb7e8b4e72279c8`，即 `release/v0.19.0` 上 #302 审核通过的 RC head，不在 main 上（D484 的做法，D510）。Release 发布于 2026-11-24T01:49:55Z。
- 只核对事实，只改 `design/` 文档，不改业务代码，不碰 CHANGELOG、`docs/release/` 与 `docs/demo/`（日期 PR 由版本管理负责）。

## 1. 结论

**S20 通过。** MEAS-01、REFAC-11、TLIST-04 三项开发任务全部合并，验收满足；DEMO-20 的 RC 与 Demo 已合并，v0.19.0 已打 tag 并发布。没有设计侧阻塞项。

- **用户可见变化 1 项**：TLIST-04 在财务维度“新建配置”之后加“刷新列表” / “Refresh list”；用户文档 `docs/user/ledger.md:14` 已补说明。
- **迁移 0 个**（仍为 020，下一个可用编号 021）。
- tag 树与 RC 范围终点 `6156759` 相比，`packages`、`scripts`、`.github`、`package.json`、lock 都没有差异（§5.3，输出 0 行）。
- 产品与工具变更：`git diff --shortstat v0.18.0 6156759 -- packages` 为 10 个文件，+709 / −196；`-- scripts` 为 4 个文件，+571（新增 `scripts/measure/`）。`order-view.tsx` 212 → 49 行，`OrderView` 函数 186 → 41 个计数行。
- **S20 范围内的 main Full**：7 个合并提交各由 push 触发一次 Full，6 次 success；1 次 failure 在计划 #294 的合并提交 `5664fea`（只改 `design/`），是 S19 评审已记下的偶发 `window is not defined`，没有同 SHA 重跑，由 S21 FLAKE-08 根治（[#303](https://github.com/lingshf/ai-native-erp/pull/303) 未合并），见 §4。三个开发任务与 RC 的合并提交都是绿。
- **评审打回 8 次、待证据 1 次**（与 S19 相同）：设计 3（#297 两次、#300 一次）、开发 2（#298 两次）、版本管理 3（#302 三次）；待证据 1 次（#299 R7 按 D502 口径重算）。版本管理的 3 次中，前两轮都有**取证缺口**，第 3 轮只剩证据格式，见 §2.2 与[回顾议题 3](S20-retro.md#议题-3rc-评审取证缺口与证据格式分开计)。
- **预算例外 0 次**：TLIST-04 首屏 ±0、`Dimensions` 路由 +103 B（上限 +200 B）；REFAC-11 首屏 ±0、`TradeOrders` 路由 +204 B（上限 +900 B）；MEAS-01 的 M8 54 项全部 ±0。DEMO-20 的 D504 用入库脚本复测，结论相同（RESULT PASS）。
- **冲突域越界 0 次**；派发后的补充裁定 1 次：D502（MEAS-01 任务书没有指定 M9 的哈希掩码写法，#288 与 #291 的写法不同）。
- **真实时段 1 次，步骤 4 一次调用成功**，没有 DEMO-19 那样的修正调用（D498 / D499 类）。但有 1 条门禁放行（D505）和 4 条窗口处置（D506–D509），都是记录或门禁缺口，结果被接受、不重开窗口，见 §3 与回顾议题 1、2。

## 2. 目标与验收逐项核对

### 2.1 Sprint 目标

| 目标 | 结果 | 证据 |
| --- | --- | --- |
| MEAS-01：体积测量脚本入库 | 达成 | [#298](https://github.com/lingshf/ai-native-erp/pull/298) `6156759`。`scripts/measure/bundle-measure.mjs`、`bundle-compare.mjs`、README 与 `bundle-compare.test.ts`；M8 54 项 ±0，两侧 42 份 SHA-256 与脚本清单逐路径一致；M9 按 D502 的 `-HASH` 复现 #288 首屏 160933 → 160942、#291 路由 18750 → 19014（[6032119139](https://github.com/lingshf/ai-native-erp/pull/298#pullrequestreview-6032119139)）。DEMO-20 的 D504 第一次就用它测量并通过 |
| REFAC-11：按 ② 拆分 `OrderView`，不改行为 | 达成 | [#299](https://github.com/lingshf/ai-native-erp/pull/299) `6fbc2da`。`order-view.tsx` 212 → 49 行，`OrderView` 186 → 41 个计数行；R4 五组共 36 步 base / head 摘要一致；R3 `--maxWorkers=2` 全量 358/358；R7 按 D502 重算 `TradeOrders` +204 B（[6031793036](https://github.com/lingshf/ai-native-erp/pull/299#pullrequestreview-6031793036)） |
| TLIST-04：财务维度加“刷新列表” | 达成 | [#296](https://github.com/lingshf/ai-native-erp/pull/296) `ea24f87`。5 个新用例 base 失败、head 8/8；`DimensionPane` 126 → 126 行，`DimensionActions` 26 行、无 Hook；`Dimensions.tsx` +27、测试 +136（上限 +30 / +140）；首屏 ±0，`Dimensions` +103 B（[6031547899](https://github.com/lingshf/ai-native-erp/pull/296#pullrequestreview-6031547899)）。原生键盘与 390 px 由 DEMO-20 真实 Chrome 取证 |
| S19 回顾行动 1、3、4 在 DEMO-20 落地 | 部分达成 | 行动 3（临时账套路径）达成；行动 1（逐字命令）因 D508 管道偏差部分达成；行动 4（证据格式四条）未达成，#302 三轮打回都含格式问题。见[回顾](S20-retro.md#s19-回顾行动项检查) |
| DEMO-20：v0.19.0 RC 与 Demo | 达成，D503–D510 | [#302](https://github.com/lingshf/ai-native-erp/pull/302) `c6d5e24`；tag → `10292ed`（D510）。RC 范围终点 `6156759`；runner head `73ea29a`，tool / base `6156759`；端口 4204（D503）；15 项检查 0 失败，6 张 PNG（财务维度中英红 / 绿 1440 与 390、订单详情中英 1440） |
| 门禁：开发任务都已结案，覆盖最后一个合并提交的 main Full 绿 | 达成 | RC 范围终点 `6156759`（#298）的 [Full 45303265071](https://github.com/lingshf/ai-native-erp/actions/runs/45303265071) success |

### 2.2 各 PR 评审

评审都以 COMMENTED 状态提交，结论按正文首行 `VERDICT:` 计。打回与待证据的区分按 D451，看评审内容，口径与 S19 相同：评审写明没有代码或测试范围的阻塞、只要求补证据或更正说法的轮次记为待证据；要求改代码、改测试、改文档内容，或因未处置的流程偏差而阻塞的轮次记为打回。

| PR | 合并 / 轮次 | main Full | 结论与打回点 |
| --- | --- | --- | --- |
| S20 计划 [#294](https://github.com/lingshf/ai-native-erp/pull/294) | `5664fea`；GitHub 上只有 1 次评审，直接批准 [6031282962](https://github.com/lingshf/ai-native-erp/pull/294#pullrequestreview-6031282962)（`dea34a6`） | [failure](https://github.com/lingshf/ai-native-erp/actions/runs/45291279585)（偶发，与本 PR 无关，§4） | 通过。起草期间协调者转达过一次对 `5bdda28` 的修改意见（历史耗时口径、M8 自比、截图与 RC 范围绑定），没有作为 GitHub 评审提交，按 §5.1 的命令口径不计入 |
| TLIST-04 [#296](https://github.com/lingshf/ai-native-erp/pull/296) | `ea24f87`；直接批准 [6031547899](https://github.com/lingshf/ai-native-erp/pull/296#pullrequestreview-6031547899) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45294377891) | 通过。一轮批准；首次全量失败原文已附，`--maxWorkers=2` 全量 363/363 |
| S19 评审与回顾 [#297](https://github.com/lingshf/ai-native-erp/pull/297) | `ea5c0a1`；2 轮打回（[6031598147](https://github.com/lingshf/ai-native-erp/pull/297#pullrequestreview-6031598147)、[6031640692](https://github.com/lingshf/ai-native-erp/pull/297#pullrequestreview-6031640692)），批准 [6031681853](https://github.com/lingshf/ai-native-erp/pull/297#pullrequestreview-6031681853) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45296436474) | 第 1 轮：把 #293 的打回写成“全是证据格式”，漏了首轮的 D500 取证缺口；S20 DEMO-20 的 4c 示例写死 `-Ports 4203`。第 2 轮：文首旧断言与新增更正并存、互相矛盾 |
| REFAC-11 [#299](https://github.com/lingshf/ai-native-erp/pull/299) | `6fbc2da`；1 轮**待证据**（[6031674649](https://github.com/lingshf/ai-native-erp/pull/299#pullrequestreview-6031674649)），批准 [6031793036](https://github.com/lingshf/ai-native-erp/pull/299#pullrequestreview-6031793036)，两次都在 `95d447f` | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45298302218) | 通过。评审确认改动范围、可读性、R3 / R4 都没有阻塞；只要求 R7 按 D502 的 `-HASH` 对同一对已核验的构建产物重算（原文沿用 #291 的 `-########`）。重算 `TradeOrders` 19014 → 19218（+204 B），代码未改 |
| S21 计划 [#300](https://github.com/lingshf/ai-native-erp/pull/300) | `ade6fba`；1 轮打回（[6031872135](https://github.com/lingshf/ai-native-erp/pull/300#pullrequestreview-6031872135)），批准 [6031954413](https://github.com/lingshf/ai-native-erp/pull/300#pullrequestreview-6031954413) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45300829164) | 打回点都是设计文档的事实或门禁：SLOT-04 把真实 4b 的 `-BaseRoot` 写成 tool（实为 app，只命中 R-steps）；FLAKE-08 要求“PR 的 Full”，但 `full.yml` 只在 main push 与定时触发，并误写“同一提交重跑为绿”；DEMO-21 让 SLOT-04 的 Stub 演练代替新版 `run-main -SkipCapture` 实跑 |
| MEAS-01 [#298](https://github.com/lingshf/ai-native-erp/pull/298) | `6156759`；2 轮打回（[6031621581](https://github.com/lingshf/ai-native-erp/pull/298#pullrequestreview-6031621581)、[6032047787](https://github.com/lingshf/ai-native-erp/pull/298#pullrequestreview-6032047787)），批准 [6032119139](https://github.com/lingshf/ai-native-erp/pull/298#pullrequestreview-6032119139)，共 3 轮 | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45303265071) | 通过。第 1 轮是 3 个脚本缺陷：`rel=prefetch` 的懒加载块被算入首屏；逐块与路由 CSS 缺原始字节；选项缺值时吞掉下一个选项（`--work --unknown`）；修正提交 `25f81f6` → `f4aa1e0` 改了 `bundle-compare.mjs`、`bundle-measure.mjs`、README 与测试。第 2 轮：M5 两段预算用例在满载下一次超过 15 s 全局超时、下一次 14.878 s（Ubuntu verify 上 8 项共 51 ms），要求去掉重复的整对 dist 读取与报告生成，不加超时、不加重试。修改提交 `f4aa1e0` → `40bcd1f0` 只改 `bundle-compare.test.ts`；修改后 M5 退出码用例 207–304 ms，整文件 1.55–1.71 s；评审注明这不是满载复现 |
| DEMO-20：RC 与 Demo [#302](https://github.com/lingshf/ai-native-erp/pull/302) | `c6d5e24`；3 轮打回（[6032330025](https://github.com/lingshf/ai-native-erp/pull/302#pullrequestreview-6032330025)、[6032374166](https://github.com/lingshf/ai-native-erp/pull/302#pullrequestreview-6032374166)、[6032389058](https://github.com/lingshf/ai-native-erp/pull/302#pullrequestreview-6032389058)），批准 [6032405849](https://github.com/lingshf/ai-native-erp/pull/302#pullrequestreview-6032405849)，共 4 轮 | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45307707283) | 通过（D503–D510）。不涉及产品或脚本，评审都写明不重开窗口、不重测。**取证缺口**（改写法补不回来，经协调者处置后解除）：开窗前没有实跑新版 `-SkipCapture`（第 1 轮发现；第 2 轮要求补处置记录，属该缺口的待办，不另计 → D509 处置）；开窗时多出的 PID 4056 无法归属（门禁日志没有 cwd 与父进程 → D507）；步骤 4 多了管道 `\| Select -First 8`，runner 退出码没有独立记录（→ D508）；账套 `-wal` / `-shm` 删除前是否存在没有记录（第 2 轮新增，第 3 轮接受为“无记录、未保留”）。另有 `npm ci` 控制台输出未存文件，版本管理在送审前自报（D506），不计为打回点。**证据格式**：第 1 轮 D492 的清理前值与入库 blob 没有分列、证据命令用省略 SHA、D483 用提交数代替 `git diff --shortstat`、TLIST-05 延后没有附 ancestry 命令；第 2 轮“当前状态”仍是旧 head、`HEAD:<路径>` 动态取证，以及 PR 正文、CHANGELOG、run-through 三处仍把步骤 4 写成实测退出码 0（与 D508 冲突；这是可更正的错误表述，与取证缺口“runner 退出码没有单独记录”分开计）；该轮之后先改了 PR 正文，第 3 轮只剩 CHANGELOG 与 run-through 标题两处。见[回顾议题 1–3](S20-retro.md) |

### 2.3 S20 共同验收

1. **可读性 ①–⑥**：
   - MEAS-01：`bundle-compare.mjs` 300 行（恰为上限 300）、`bundle-measure.mjs` 149 行、README 121 行（≤ 150）、`bundle-compare.test.ts` 201 行（≤ 300）；
   - REFAC-11：`order-view.tsx` 49 行（≤ 120）、`OrderView` 41 个计数行（≤ 80），新文件最大 `order-view-lines.tsx` 134 行（≤ 200）；
   - TLIST-04：见 §2.1。
   - 三份评审都写明没有可读性阻塞。`bundle-compare.mjs` 已到上限，以后再改它须先拆分（§4）。
2. **用户可见变化**：TLIST-04 有该节；MEAS-01、REFAC-11 写“无”，与评审核对一致。
3. **中英双语、红 / 绿主题、键盘可用、教学模式可关闭**：TLIST-04 复用 `master.listRefresh`，按钮是原生 `button`，不加 CSS 与教学文案。DEMO-20 截了财务维度中英、红 / 绿的 1440 与 390 图（两个按钮都在 390 视口内），订单详情中英 1440 图；真实 Chrome 中记录了 Tab 到“Refresh list”、Enter 与空格各触发 1 次列表请求，编辑器打开时 Tab / Enter 仍有效、编辑器保持打开（`docs/demo/v0.19.0/logs/capture-log-real.json`）。
4. **冲突域**：没有越界（三份评审逐一核对了文件范围）。
5. **base 失败、head 通过**：三份 PR 都附了两侧原文；派发后补充裁定 1 次（D502）。
6. **证明附原文**：L10 / R7 / M8 都在新建的分离 worktree 中、按实际合并基 `5664fea` 构建；#299 R7 的掩码口径由 D502 统一后重算。
7. **评审计数可重放**：本评审 §5 附命令并实跑。
8. **只用虚构数据**：真实时段用端口 4204 上的三个临时账套 `erp-demo-<guid>`（路径见 run-through 的 D500 表），没有接触真实旧账、4173 账套或 `.bak` 文件；窗口前已有的 4 个 `erp-demo-*` 未触碰。
9. **D11（现有测试不删除、不削弱）**：满足。REFAC-11 没有改测试；TLIST-04 只在既有测试文件里加用例；MEAS-01 的 M5 精简是去掉重复工作，保留限内、等于上限、超限 1 B、未列项变化 1 B 的覆盖，没有跳过用例、延长超时或加重试。

## 3. 评审裁定与本期决定

决定原文见 [S20.md 决定表](../tasks/S20.md#s20-期间决定)（D503–D510 由 [#305](https://github.com/lingshf/ai-native-erp/pull/305) 记入；本 PR 补记 D511，下一个可用 D512）。时序与 SHA 角色以 [`docs/demo/v0.19.0/run-through.md`](../../docs/demo/v0.19.0/run-through.md) 为准（固定来源，本评审只引用）。

本评审各处只引用决定号，不再摘录决定内容，以决定表为准。

## 4. 遗留与待办

| 项 | 处理 | 落点 |
| --- | --- | --- |
| main Full 在 `5664fea` 的偶发失败（`window is not defined`，[run 45291279585](https://github.com/lingshf/ai-native-erp/actions/runs/45291279585)，`run_attempt=1`） | S20 期间没有再出现（其后 9 个 main 提交的 Full 都绿，含 S21 的 `f9024d5`）；由 S21 FLAKE-08 根治，[#303](https://github.com/lingshf/ai-native-erp/pull/303) 进行中 | S21 |
| v0.19.0 不在 main 上（D484 / D510），`v0.19.0..main` 会列出已随 v0.19.0 发布的提交 | DEMO-21 按冻结的 RC 范围终点逐行分类并写明合并基（同 DEMO-20） | S21 DEMO-21 |
| TLIST-05 #301 已到 main 但不在 v0.19.0 内 | RC 已记为延后（ancestry 退出码 1），随 S21 版本发布 | S21 DEMO-21 |
| v0.19.0 发布日 PR | 版本管理按 D458 负责；本 PR 不改 CHANGELOG 与发布说明，不冲突 | 版本管理 |
| DEMO-20 的门禁与记录缺口（D506–D509） | 回顾行动 1–4 | S21 DEMO-21 |
| RC 三轮打回中的证据格式问题 | S19 回顾行动 4 未达成；送审清单已由 S21 DOC-21（#305 `276fd3b`）写入，回顾行动 5 补充“同一事实只写一处”的 `git grep` 自查（D511） | S21 DEMO-21 |
| `bundle-compare.test.ts` 的 M5 在满载下曾超过 15 s | 已精简，评审注明不是满载复现；回顾行动 6 | 观察；S22 任务书 |
| `bundle-compare.mjs` 恰为 300 行上限 | 以后改它的任务须先拆分或在任务书中写明新上限 | 候选池 |
| 任务书模板“构建来源”改为引用 `scripts/measure` | MEAS-01 已合并，由设计角色另开设计 PR（S20 候选池已列） | 设计，S21 期间 |
| M2-05 真实演练、M2-06 | 仍待用户决定 A / B / C | 路线图 M2 |

## 5. 可重放的计数

### 5.1 评审轮次

```powershell
foreach ($n in 294,296,297,298,299,300,302) {
  "=== #$n"
  gh api --paginate repos/lingshf/ai-native-erp/pulls/$n/reviews --jq '.[] | "\(.id) \(.commit_id[0:7]) \((.body | split("\n"))[0])"'
}
```

输出（2026-11-24，main `c6d5e24`）：#294、#296 各只有 1 次 `APPROVED`；#299、#300 各有 1 次 `CHANGES_REQUESTED` 和 1 次 `APPROVED`；#297、#298 各有 2 次 `CHANGES_REQUESTED` 和 1 次 `APPROVED`；#302 有 3 次 `CHANGES_REQUESTED` 和 1 次 `APPROVED`。`CHANGES_REQUESTED` 共 9 次，按 §2.2 的内容口径：#299 的 1 次（只要求按 D502 重算 R7，代码未改，与批准同在 `95d447f`）记为待证据；其余 8 次记为打回。

### 5.2 main Full

```powershell
git log --oneline --first-parent e2a30eb..c6d5e24   # 7 个提交：#296、#297、#299、#300、#298、#301、#302，其中 #301 归 S21
gh run list --workflow full.yml --branch main --limit 14 --json databaseId,headSha,conclusion,event,attempt
```

| 合并提交 | PR | Full | 结论 |
| --- | --- | --- | --- |
| `5664fea` | #294 | [45291279585](https://github.com/lingshf/ai-native-erp/actions/runs/45291279585) | failure（unit shard 2，`run_attempt=1`，见 §4） |
| `ea24f87` | #296 | [45294377891](https://github.com/lingshf/ai-native-erp/actions/runs/45294377891) | success |
| `ea5c0a1` | #297 | [45296436474](https://github.com/lingshf/ai-native-erp/actions/runs/45296436474) | success |
| `6fbc2da` | #299 | [45298302218](https://github.com/lingshf/ai-native-erp/actions/runs/45298302218) | success |
| `ade6fba` | #300 | [45300829164](https://github.com/lingshf/ai-native-erp/actions/runs/45300829164) | success |
| `6156759` | #298 | [45303265071](https://github.com/lingshf/ai-native-erp/actions/runs/45303265071) | success |
| `c6d5e24` | #302 | [45307707283](https://github.com/lingshf/ai-native-erp/actions/runs/45307707283) | success |
| `f9024d5` | #301（S21，不计入） | [45304259883](https://github.com/lingshf/ai-native-erp/actions/runs/45304259883) | success |

`5664fea` 在 `e2a30eb` 之前合并（S19 评审 §5.2 已注明归 S20）。

### 5.3 发布

```powershell
git ls-remote origin refs/tags/v0.19.0 'refs/tags/v0.19.0^{}' refs/heads/release/v0.19.0
# a858945bdb7f25072a259e31d64609be350d97a6 refs/tags/v0.19.0
# 10292ede0906f96d26806bdd9bb7e8b4e72279c8 refs/tags/v0.19.0^{}
# 10292ede0906f96d26806bdd9bb7e8b4e72279c8 refs/heads/release/v0.19.0
git merge-base --is-ancestor v0.19.0 origin/main   # 退出码 1：tag 不在 main 上
git diff --name-only 6156759 v0.19.0 -- packages scripts .github package.json package-lock.json   # 0 行
git diff --shortstat v0.18.0 6156759 -- packages   # 10 个文件，+709 / −196
git diff --shortstat v0.18.0 6156759 -- scripts    # 4 个文件，+571
git diff --shortstat v0.18.0 v0.19.0   # 60 个文件，+4280 / −208
git merge-base v0.18.0 v0.19.0         # 3f8f2ff9fd010ff63fb8d891b4a4b1209d4cd0ee
```
