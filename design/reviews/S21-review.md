# S21 Sprint 评审（v0.20.0，设计 / 产品）

- 作者：设计 / 产品负责人。核对时点：main `dcc6c5ba0c5a5f1d1188428a000a3524fcc07abc`（#313 合并后），核对时间 2026-11-24（UTC）。数字、状态、PR 号与 SHA 都以当时 `gh` / `git` 的输出为准，命令见 §5。格式沿用 [S20 评审](S20-review.md)。
- 范围：归属 S21 的 PR，共 10 个（不是 S21 时间段内合并的全部 PR）：
  - S20 遗留：S20 评审与回顾 [#306](https://github.com/lingshf/ai-native-erp/pull/306)；
  - 开发 [#301](https://github.com/lingshf/ai-native-erp/pull/301)（TLIST-05）、[#303](https://github.com/lingshf/ai-native-erp/pull/303)（FLAKE-08）、[#304](https://github.com/lingshf/ai-native-erp/pull/304)（SLOT-04）；
  - 发布流程文档：[#305](https://github.com/lingshf/ai-native-erp/pull/305)（DOC-21，同时是 v0.19.0 日期 PR）、[#307](https://github.com/lingshf/ai-native-erp/pull/307)（S20 回顾行动 1–4 写入 Demo 模板与送审清单）、[#309](https://github.com/lingshf/ai-native-erp/pull/309)（S22 的 DOC-22(a)，在 S21 时段合并且在 v0.20.0 的 RC 范围内，这里计入，S22 评审不再重复计入）；
  - 版本管理：RC 与 Demo [#310](https://github.com/lingshf/ai-native-erp/pull/310)、v0.20.0 日期 PR [#313](https://github.com/lingshf/ai-native-erp/pull/313)；
  - S22 计划 [#308](https://github.com/lingshf/ai-native-erp/pull/308)：按 S20 评审对 #300 的口径，计划 PR 计入它合并时所在的 Sprint 评审，S22 评审不再重复计入。
  - 不计入：S21 计划 [#300](https://github.com/lingshf/ai-native-erp/pull/300)（已计入 S20 评审）；REFAC-12 [#311](https://github.com/lingshf/ai-native-erp/pull/311)（`9c05266`，S22 任务，在 RC 范围冻结之后合并，不在 v0.20.0 内）；SLOT-05 [#312](https://github.com/lingshf/ai-native-erp/pull/312)（S22，未合并）。
- **v0.20.0 已发布**：annotated tag `v0.20.0`（tag 对象 `97e9a23d2a3f78cda15bd1601ab2b0233779adc3`）指向 `90c762f05de39723852d1a381058301cab4da997`，即 `release/v0.20.0` 上 #310 审核通过的 RC head，不在 main 上（D484）。Release 发布于 2026-11-24T03:08:57Z。发布日期与 D483 数字由 #313 写入 CHANGELOG 与发布说明。
- 只核对事实，只改 `design/` 文档，不改业务代码，不碰 CHANGELOG、`docs/release/` 与 `docs/demo/`。

## 1. 结论

**S21 通过。** SLOT-04、FLAKE-08、TLIST-05 三项开发任务与 DOC-21 全部合并，验收满足；DEMO-21 的 RC 与 Demo 已合并，v0.20.0 已打 tag 并发布，日期 PR 已合并。没有设计侧阻塞项。

- **用户可见变化 1 项**：TLIST-05 在“业务事件”与“待转队列”两个视图加“刷新列表” / “Refresh list”；用户文档 `docs/user/ledger.md` 已由 #310 补说明。版本取 MINOR（0.19.0 → 0.20.0），与 S21 计划“TLIST-05 在冻结范围内取下一个 MINOR”一致。
- **迁移 0 个**（仍为 `020-trade-order-invoicing-credits.sql`，下一个可用编号 021；`git diff --name-only v0.19.0 v0.20.0` 中没有迁移文件）。
- tag 树与 RC 范围终点 `a1a1244` 相比，`packages`、`scripts`、`.github`、`package.json`、lock 都没有差异（§5.3，输出 0 行）。
- 产品与工具变更：`git diff --shortstat v0.19.0 a1a1244 -- packages` 为 4 个文件，+239 / −30（其中 `packages/web/src` 2 个文件，+58 / −28）；`-- scripts` 为 3 个文件，+216 / −25（SLOT-04）。`CompanyEvents` 582 → 563 行。
- **S21 范围内的 main Full**：10 个合并提交，9 个 success、1 个 cancelled。cancelled 的一次在 S22 计划 #308 的合并提交 `89f5b48`（只改 `design/`），原因是 `full.yml` 的 `concurrency.cancel-in-progress`：30 s 后 #304 的 `5b6a4bf` 推上 main，同一 ref 的分片被取消，`5b6a4bf` 的 Full 绿（§5.2）。没有 failure。从 FLAKE-08 的合并提交 `49f3254` 起（含 S22 的 `9c05266`），main Full 7 次 success、1 次 cancelled、0 次 `window is not defined`；次数少，只作观察，不作根治的证明（§4）。
- **评审打回 12 次、待证据 0 次**（S20 为 8 次、1 次）：设计 3（#306 一次、#308 两次，其中第 2 次没有新增打回点）、开发 2（#303、#304 各一次）、发布流程文档与版本管理 7（#305 一次、#307 三次、#310 两次、#313 一次）。#310 两轮中只有第 1 轮有**取证缺口**，经协调者接受；其余都是证据格式或可更正的表述，见 §2.2 与[回顾议题 2、3](S21-retro.md)。
- **预算例外 0 次**：TLIST-05 首屏 ±0、`BusinessEvents` 路由块 +137 B（上限 +300 B）；DEMO-21 的 D504 用入库脚本复测，路由与入口 chunk 各 +137 B，RESULT PASS。
- **冲突域越界 0 次**；派发后的补充裁定 1 次：D512 与 D512 补充（SLOT-04 的 4c 在 `-Stub pass -Ports 4204` 下运行；放行与 ERP 无关的 debate-coach 长驻 node）。
- **真实时段 2 次**：第一窗口步骤 1 退出码 1，原因是 DEMO-21 新写的 `capture.mjs` 焦点路径缺陷（不是产品缺陷），按 D444 失败即停；修正脚本后第二窗口两步都退出 0，19 项检查 0 失败。S20 回顾行动 1、3、4 在 DEMO-21 达成，行动 2 部分达成（手动快照，cwd 未取）。见[回顾议题 1](S21-retro.md#议题-1第一窗口失败在-capture-新脚本的焦点路径)。

## 2. 目标与验收逐项核对

### 2.1 Sprint 目标

| 目标 | 结果 | 证据 |
| --- | --- | --- |
| SLOT-04：`slot-run.ps1` 调用位置自检，dist 检查改用 `assert-web-dist.ps1` | 达成 | [#304](https://github.com/lingshf/ai-native-erp/pull/304) `5b6a4bf`。调用位置错误退出 4（在执行步骤文件、查端口、预检、构建、采样之前），dist 失败退出 5；自测 base 0/8、head 8/8；runner 净增 30 行（上限 +30），`selftest-location.ps1` 148 行，README 净增 5 行。4b 在隔离的 app / tool 中实跑，只命中 R-steps、退出 4；4c 按 D512 只验收 `-Stub pass -Ports 4204`，a/b/c 退出 0（[6032746509](https://github.com/lingshf/ai-native-erp/pull/304#pullrequestreview-6032746509)）。DEMO-21 的 Stub 演练日志有 `call location ok` 与 `dist check web-dist: ok` |
| FLAKE-08：main Full 偶发 `window is not defined` | 达成 | [#303](https://github.com/lingshf/ai-native-erp/pull/303) `49f3254`。只改 `ledger-reports.test.tsx`（+13 / −1）：在原用例的同步滚动段换用假时钟，推进 150 ms 后待触发定时器归零；去掉推进这一行时 5/5 失败；base pending 1、head pending 0 各 5 次；未改 `setup.ts`、配置与产品；全量 Web 368/368（[6032563630](https://github.com/lingshf/ai-native-erp/pull/303#pullrequestreview-6032563630)）。合并后 main Full 见 §5.2 |
| TLIST-05：业务事件与待转队列加“刷新列表” | 达成 | [#301](https://github.com/lingshf/ai-native-erp/pull/301) `f9024d5`。L2–L7 五个新用例 base 失败、head 10/10，原五个用例未改；全量 Web 368/368；`CompanyEvents` 582 → 563 行；首屏 160942 → 160942，`BusinessEvents` 6734 → 6871（+137 B / +300 B）（[6032182900](https://github.com/lingshf/ai-native-erp/pull/301#pullrequestreview-6032182900)）。原生键盘与 390 px 由 DEMO-21 真实 Chrome 取证 |
| DOC-21：送审清单写入证据格式四条 | 达成 | [#305](https://github.com/lingshf/ai-native-erp/pull/305) `276fd3b`。`docs/release/README.md` 新增四条与 S19 回顾行动 1、3 两条；PR 正文附改动前后原文（[6032477390](https://github.com/lingshf/ai-native-erp/pull/305#pullrequestreview-6032477390)） |
| S20 回顾行动 1–4 在 DEMO-21 落地 | 大部分达成 | 先由 [#307](https://github.com/lingshf/ai-native-erp/pull/307) `013d681` 写入 Demo 模板第 17、22–25 条与送审清单；DEMO-21 中行动 1、3、4 达成，行动 2 部分达成。见[回顾](S21-retro.md#s20-回顾行动项检查) |
| DEMO-21：v0.20.0 RC 与 Demo | 达成，D512 / D512 补充 | [#310](https://github.com/lingshf/ai-native-erp/pull/310) `2ce7821`；tag → `90c762f`。RC 范围终点 `a1a1244`；第一窗口 runner `7797e56`（失败），第二窗口 runner `2e0ec13`；tool / base `a1a1244`；端口 4204；19 项检查 0 失败，8 张 PNG（其中 390 宽 4 张）；D504 路由与入口 chunk 各 +137 B，PASS |
| 门禁：开发任务都已结案，覆盖最后一个合并提交的 main Full 绿 | 达成 | RC 范围终点 `a1a1244`（#309）的 [Full 45312731336](https://github.com/lingshf/ai-native-erp/actions/runs/45312731336) success |

### 2.2 各 PR 评审

评审都以 COMMENTED 状态提交，结论按正文首行 `VERDICT:` 计。打回与待证据的区分按 D451，口径与 S20 相同。本 Sprint 没有“只要求补证据、代码与文档都不改”的轮次，`CHANGES_REQUESTED` 全部记为打回。

| PR | 合并 / 轮次 | main Full | 结论与打回点 |
| --- | --- | --- | --- |
| TLIST-05 [#301](https://github.com/lingshf/ai-native-erp/pull/301) | `f9024d5`；直接批准 [6032182900](https://github.com/lingshf/ai-native-erp/pull/301#pullrequestreview-6032182900)（`dc8d876`） | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45304259883) | 通过。一轮批准；L10 用测量前未合并 MEAS-01 时的旧脚本全文与 D502 `-HASH` 口径，评审接受、不要求复测 |
| DOC-21 与 v0.19.0 日期 [#305](https://github.com/lingshf/ai-native-erp/pull/305) | `276fd3b`；1 轮打回（[6032456848](https://github.com/lingshf/ai-native-erp/pull/305#pullrequestreview-6032456848)），批准 [6032477390](https://github.com/lingshf/ai-native-erp/pull/305#pullrequestreview-6032477390) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45308767454) | 打回点：CHANGELOG 把 #301 写成“窗口后合并”（实为 RC 范围冻结后、开窗前）；发布说明标题仍是“草稿”；PR 正文缺 DOC-21 改动前后的清单原文 |
| S20 评审与回顾 [#306](https://github.com/lingshf/ai-native-erp/pull/306) | `8146978`；1 轮打回（[6032514009](https://github.com/lingshf/ai-native-erp/pull/306#pullrequestreview-6032514009)），批准 [6032539510](https://github.com/lingshf/ai-native-erp/pull/306#pullrequestreview-6032539510) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45309745526) | 打回点都是设计文档的事实或口径：#298 首轮写成没改脚本（实际改了）；#302 的时间线写反，并把 D509 处置记录算作新增取证缺口；§3 摘录 D503–D510 而不是链接决定表；行动 4 另设窗口内例外，与 D509 冲突 |
| FLAKE-08 [#303](https://github.com/lingshf/ai-native-erp/pull/303) | `49f3254`；1 轮打回（[6032413285](https://github.com/lingshf/ai-native-erp/pull/303#pullrequestreview-6032413285)），批准 [6032563630](https://github.com/lingshf/ai-native-erp/pull/303#pullrequestreview-6032563630) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45310145252) | 第 1 轮：`setup.ts` 拦截并清除整个 Web 项目的 `setTimeout`，范围过宽，证据只指向一个用例；守护用例在 base 上也可能通过（定时器可能在断言前自然触发）。修改后只改原用例，用假时钟（`ledger-reports.test.tsx:588–597`） |
| S20 回顾行动 1–4 [#307](https://github.com/lingshf/ai-native-erp/pull/307) | `013d681`；3 轮打回（[6032534527](https://github.com/lingshf/ai-native-erp/pull/307#pullrequestreview-6032534527)、[6032555684](https://github.com/lingshf/ai-native-erp/pull/307#pullrequestreview-6032555684)、[6032574519](https://github.com/lingshf/ai-native-erp/pull/307#pullrequestreview-6032574519)），批准 [6032591099](https://github.com/lingshf/ai-native-erp/pull/307#pullrequestreview-6032591099)，共 4 轮 | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45310562803) | 全部是模板措辞与 S20 回顾行动的对齐：第 1 轮，第 25 条把 `-SkipCapture` 门禁限于改动过的 `run-main.ps1`，第 23 条要求记录 cwd 却给了取不到 cwd 的命令，第 24 条写成“加管道则退出码是管道的”通则（评审实测 `pwsh` 子进程接 `Tee-Object` 后仍得 7）；第 2 轮，退出码只要求抄进 run-through、没有写进原始日志，“端口无监听”被读成也适用于窗口内；第 3 轮，追加退出码的 `Add-Content` 没有要求列入获批命令原文。见[回顾议题 4](S21-retro.md#议题-4回顾行动写进模板时新增了未实测的技术断言) |
| S22 计划 [#308](https://github.com/lingshf/ai-native-erp/pull/308) | `89f5b48`；2 轮打回（[6032681088](https://github.com/lingshf/ai-native-erp/pull/308#pullrequestreview-6032681088)、[6032686120](https://github.com/lingshf/ai-native-erp/pull/308#pullrequestreview-6032686120)），批准 [6032705761](https://github.com/lingshf/ai-native-erp/pull/308#pullrequestreview-6032705761)，共 3 轮 | [cancelled](https://github.com/lingshf/ai-native-erp/actions/runs/45312364554)（被 `5b6a4bf` 取消，§5.2） | 第 1 轮：SLOT-05 的多端口参数在 `pwsh -File` 下怎么绑定没有写；G4 用固定 2.5 s 计时，与单次快照最长 5 s 冲突；DEMO-22 门禁没有要求快照退出 0、各端口明确空闲，也没有定义退出码 8 / 9 的优先级。第 2 轮复审的 head 只改了决定编号（D512 已被占用，改从 D513 起），上轮三项未改，**没有新增打回点**。没有历史事实错误（S20 回顾行动 7） |
| SLOT-04 [#304](https://github.com/lingshf/ai-native-erp/pull/304) | `5b6a4bf`；1 轮打回（[6032463537](https://github.com/lingshf/ai-native-erp/pull/304#pullrequestreview-6032463537)），批准 [6032746509](https://github.com/lingshf/ai-native-erp/pull/304#pullrequestreview-6032746509) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45312428848) | 第 1 轮：4b / 4c 只有历史推演，没有派发时追加要求的实际运行；没有单列与任务书 S4(b) / S5 的差异；S4(b) 的夹具写在固定目录并整体递归删除，并发自测会互相覆盖。修改后每次运行用独占的 GUID 子目录；4b 实跑，4c 经 D512 用 Stub 运行 |
| DOC-22(a) [#309](https://github.com/lingshf/ai-native-erp/pull/309) | `a1a1244`；直接批准 [6032776388](https://github.com/lingshf/ai-native-erp/pull/309#pullrequestreview-6032776388)（`88cb00d`） | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45312731336) | 通过。送审清单第 (3) 项按 D511 补 `git grep` 自查；只改一行（+1 / −1）。它是 DEMO-21 的 RC 范围终点 |
| DEMO-21：RC 与 Demo [#310](https://github.com/lingshf/ai-native-erp/pull/310) | `2ce7821`；2 轮打回（[6032991110](https://github.com/lingshf/ai-native-erp/pull/310#pullrequestreview-6032991110)、[6033053865](https://github.com/lingshf/ai-native-erp/pull/310#pullrequestreview-6033053865)），批准 [6033078086](https://github.com/lingshf/ai-native-erp/pull/310#pullrequestreview-6033078086)，共 3 轮 | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45317301058) | 通过。各轮都写明不重开窗口、不重拍、不重测。**取证缺口**（改写法补不回来，经协调者接受）：临时账套删除前没有列目录、没有哈希，`-wal` / `-shm` 是否存在无法补证（第 1 轮要求如实注明，第 2 轮接受）；两次批准消息的时间戳与第一窗口的精确关窗时刻没有记录，run-through 只能用快照时间界定（版本管理在送审文档中自报）。**证据格式与可更正的表述**：第 1 轮把第一窗口的队列键盘场景写成通过（日志只到编辑器场景就失败）、批准原文没有逐字给出、把 D512 正项写成开窗授权、D492 把 CSV 算作第 6 个换行差异、`shots-skip` 算作已留哈希、`git grep` 没有输出、同一结论在 PR 正文与 Demo README 重复、ancestry 表缺 DOC-21、缺无路径过滤的 D483 `shortstat`、体积一行混了路由与入口 chunk；第 2 轮只剩两处：两个 rev 文件的 CRLF 复原方法写错（只能替换最后一个 LF），`git grep` 没有固定 SHA 且所贴不是原始输出（把 v0.17.0 的 `CHANGELOG.md:89` 当成 v0.19.0）。见[回顾议题 2、3](S21-retro.md) |
| v0.20.0 日期 [#313](https://github.com/lingshf/ai-native-erp/pull/313) | `dcc6c5b`；1 轮打回（[6033106992](https://github.com/lingshf/ai-native-erp/pull/313#pullrequestreview-6033106992)），批准 [6033132942](https://github.com/lingshf/ai-native-erp/pull/313#pullrequestreview-6033132942) | [绿](https://github.com/lingshf/ai-native-erp/actions/runs/45318150142) | 第 1 轮：PR 正文含控制字符与未展开的变量，没有贴实际命令与输出；发布说明与 Release 正文缺 D483 的两条 compare 链接，CHANGELOG 页脚链接未更新 |

### 2.3 S21 共同验收

1. **可读性 ①–⑥**（上限见 [S21.md 共同验收](../tasks/S21.md#共同验收)）：
   - SLOT-04：`slot-run.ps1` 净增 30 行（≤ +30），`selftest-location.ps1` 148 行（≤ 200），README 净增 5 行（≤ +12）；
   - FLAKE-08：没有改 `setup.ts`；守护在原用例内 +13 / −1（≤ +60），没有 sleep；
   - TLIST-05：`CompanyEvents` 582 → 563（净增 ≤ 0），新组件在上限内（评审核对）。
   - 三份评审都写明没有可读性阻塞。
2. **用户可见变化**：TLIST-05 有该节；SLOT-04、FLAKE-08、DOC-21 写“无”，与评审核对一致。
3. **中英双语、红 / 绿主题、键盘可用、教学模式可关闭**：TLIST-05 复用已有中英标签、不加 CSS、不加教学文案。DEMO-21 截了两个视图的中英、红 / 绿 1440 图与 390 图（390 下按钮都在视口内）；真实 Chrome 中记录了事件视图与队列视图 Tab 到“Refresh list”，Enter 与空格各触发 1 次列表请求；草稿编辑器打开时按钮未禁用、Tab 可达、Enter 触发 1 次请求，编辑器保持打开、摘要草稿保留（`docs/demo/v0.20.0/logs/capture-log-real.json`）。
4. **冲突域**：没有越界（三份开发评审逐一核对了文件范围）。
5. **base 失败、head 通过**：三份开发 PR 都附了两侧原文；FLAKE-08 的守护在评审要求下改为不依赖机器速度的确定失败（5/5）。
6. **证明附原文**：TLIST-05 的 L10 在新建的分离 worktree 中按实际合并基 `ade6fba` 构建；DEMO-21 的 D504 用入库的 `scripts/measure`（钉 `a1a1244`），base 用 `v0.19.0^{commit}`。
7. **评审计数可重放**：本评审 §5 附命令并实跑。
8. **只用虚构数据**：两个窗口与窗口前演练共用到 5 个临时账套 `erp-demo-<guid>`（路径见 run-through 的 D500 表），端口 4204；没有接触真实旧账、4173 账套或 `.bak` 文件；窗口前已有的 4 个 `erp-demo-*` 未触碰。
9. **D11（现有测试不删除、不削弱）**：满足。FLAKE-08 保留原断言；TLIST-05 原五个用例未改；DEMO-21 修正 capture 时断言没有削弱，反而新增“草稿摘要刷新后保留”（run-through“脚本修正前后对比”）。

## 3. 评审裁定与本期决定

决定原文见 [S21.md 决定表](../tasks/S21.md#s21-期间决定)（D512 与 D512 补充，由 #310 记入）。时序与 SHA 角色以 [`docs/demo/v0.20.0/run-through.md`](../../docs/demo/v0.20.0/run-through.md) 为准（固定来源，本评审只引用）。本评审不摘录决定内容。S22 的决定从 D513 起（见 [S22.md](../tasks/S22.md)）。

## 4. 遗留与待办

| 项 | 处理 | 落点 |
| --- | --- | --- |
| FLAKE-08 的效果 | 从 `49f3254` 起 main Full 7 次 success、1 次 cancelled（并发取消），没有再出现 `window is not defined`；次数少，继续观察，再出现时按 run 日志重开 | 观察 |
| v0.20.0 不在 main 上（D484），`v0.20.0..main` 会列出已随 v0.20.0 发布的提交 | DEMO-22 按冻结的 RC 范围终点逐行分类并写明合并基（同 DEMO-21） | S22 DEMO-22 |
| REFAC-12 #311 已到 main 但不在 v0.20.0 内 | 在 RC 范围冻结（`a1a1244`）之后合并，随 S22 版本发布 | S22 |
| DEMO-21 取证缺口：临时账套删除前未列文件与哈希（`-wal` / `-shm`）；批准消息时间戳与关窗精确时刻未记录 | 已由协调者接受，不重开窗口；回顾行动 1 | S22 DEMO-22 |
| 第一窗口因 `capture.mjs` 焦点路径缺陷失败 | 回顾行动 2 | S22 DEMO-22 |
| 门禁快照工具（S20 回顾行动 2 的工具化） | SLOT-05 [#312](https://github.com/lingshf/ai-native-erp/pull/312) 按评审意见修改中；合并后 DOC-22(b) 把 Demo 模板第 23 条改为引用该工具 | S22 |
| TLIST-06（结算“刷新列表”） | 已派发，依赖 REFAC-12（已合并） | S22 |
| 测量时误传 `--hash`（工具以退出码 2 拒绝，没有产生测量） | Demo 模板或 `scripts/measure/README.md` 写明 `-HASH` 是掩码口径、不是参数；候选 | 候选池 |
| `bundle-compare.mjs` 恰为 300 行上限 | 以后改它的任务须先拆分或在任务书中写明新上限 | 候选池 |
| M2-05 真实演练、M2-06 | 仍待用户决定 A / B / C | 路线图 M2 |

## 5. 可重放的计数

### 5.1 评审轮次

```powershell
foreach ($n in 301,303,304,305,306,307,308,309,310,313) {
  "=== #$n"
  gh api --paginate repos/lingshf/ai-native-erp/pulls/$n/reviews --jq '.[] | "\(.id) \(.commit_id[0:7]) \((.body | split("\n"))[0])"'
}
```

输出（2026-11-24，main `dcc6c5b`）：#301、#309 各只有 1 次 `APPROVED`；#303、#304、#305、#306、#313 各有 1 次 `CHANGES_REQUESTED` 和 1 次 `APPROVED`；#308、#310 各有 2 次 `CHANGES_REQUESTED` 和 1 次 `APPROVED`；#307 有 3 次 `CHANGES_REQUESTED` 和 1 次 `APPROVED`。`CHANGES_REQUESTED` 共 12 次，按 §2.2 的内容口径全部记为打回（#308 第 2 次没有新增打回点）。

### 5.2 main Full

```powershell
git log --oneline --first-parent c6d5e24..dcc6c5b   # 10 个提交：除 #301 外的 9 个 S21 PR 与 #311（S22）；#301 在 c6d5e24 之前合并
gh run list --workflow full.yml --branch main --limit 14 --json databaseId,headSha,conclusion,event,attempt
gh run view 45312364554 --json createdAt   # 2026-11-24T02:26:18Z
gh run view 45312428848 --json createdAt   # 2026-11-24T02:26:49Z
```

`full.yml` 的 `concurrency` 为 `group: full-${{ github.ref }}-${{ matrix.lane }}-${{ matrix.shard }}`、`cancel-in-progress: true`。

| 合并提交 | PR | Full | 结论 |
| --- | --- | --- | --- |
| `f9024d5` | #301 | [45304259883](https://github.com/lingshf/ai-native-erp/actions/runs/45304259883) | success |
| `276fd3b` | #305 | [45308767454](https://github.com/lingshf/ai-native-erp/actions/runs/45308767454) | success |
| `8146978` | #306 | [45309745526](https://github.com/lingshf/ai-native-erp/actions/runs/45309745526) | success |
| `49f3254` | #303 | [45310145252](https://github.com/lingshf/ai-native-erp/actions/runs/45310145252) | success |
| `013d681` | #307 | [45310562803](https://github.com/lingshf/ai-native-erp/actions/runs/45310562803) | success |
| `89f5b48` | #308 | [45312364554](https://github.com/lingshf/ai-native-erp/actions/runs/45312364554) | cancelled（`5b6a4bf` 推上 main 后被取消） |
| `5b6a4bf` | #304 | [45312428848](https://github.com/lingshf/ai-native-erp/actions/runs/45312428848) | success |
| `a1a1244` | #309 | [45312731336](https://github.com/lingshf/ai-native-erp/actions/runs/45312731336) | success（RC 冻结点） |
| `2ce7821` | #310 | [45317301058](https://github.com/lingshf/ai-native-erp/actions/runs/45317301058) | success |
| `dcc6c5b` | #313 | [45318150142](https://github.com/lingshf/ai-native-erp/actions/runs/45318150142) | success |
| `9c05266` | #311（S22，不计入） | [45317584310](https://github.com/lingshf/ai-native-erp/actions/runs/45317584310) | success |

所有 run 都是 `event=push`、`attempt=1`。

### 5.3 发布

```powershell
git ls-remote origin refs/tags/v0.20.0 'refs/tags/v0.20.0^{}' refs/heads/release/v0.20.0
# 97e9a23d2a3f78cda15bd1601ab2b0233779adc3 refs/tags/v0.20.0
# 90c762f05de39723852d1a381058301cab4da997 refs/tags/v0.20.0^{}
# 90c762f05de39723852d1a381058301cab4da997 refs/heads/release/v0.20.0
gh release view v0.20.0 --json publishedAt   # 2026-11-24T03:08:57Z
git merge-base --is-ancestor v0.20.0 origin/main   # 退出码 1：tag 不在 main 上
git diff --name-only a1a1244 v0.20.0 -- packages scripts .github package.json package-lock.json   # 0 行
git diff --shortstat v0.19.0 a1a1244 -- packages   # 4 个文件，+239 / −30
git diff --shortstat v0.19.0 a1a1244 -- scripts    # 3 个文件，+216 / −25
git diff --shortstat v0.19.0 v0.20.0    # 64 个文件，+3827 / −77
git diff --shortstat v0.19.0...v0.20.0  # 92 个文件，+5506 / −71
```
