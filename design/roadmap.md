# 路线图（当前权威）

本文件是当前方向、里程碑和团队流程的权威来源；任务进度以[任务总表](tasks/README.md)为准。产品准则见[product-guidelines](product-guidelines.md)，目标架构见[M0 架构](m0-architecture.md)。`design/` 下其余旧文档（architecture、architecture-migration、design、requirements、tasks、test-cases、reviews、project、ADR）是历史记录：其中的 FG/OQ 需求与会计政策继续有效，但 G3/G5/G6 门禁、MODEL01、双库/Server、M04..M09 排期均已被本文件取代。

## 1. 不变的产品方向

- 只做 SQLite、本机单用户、loopback 无登录。PostgreSQL、Docker、登录/权限延后，不维护、不测试。
- 产品目标：覆盖 44 个 FG 的完整 ERP 场景，按小企业主流程简化，可关闭教学模式；UI 参考 Dynamics 365 信息组织但原创。当前 44FG：0 完成 / 13 部分 / 31 未实现。
- 性能目标（设计期就考虑）：热读 p95 ≤ 1s；≤100 行预览/确认各 p95 ≤ 2s；100 万 GL 行合成基准。
- AI 只建议，不保存、不过账。会计不变量（复式、精确金额、过账后不可改删、显式反向、原子事务、幂等）不可为简化或性能让步。
- 原 4173 账套和 ID3 草稿不动。账套迁移/切换（原 M08/M09）是后续里程碑，需用户另行授权。

## 2. 暂停现场的处置

| 现场 | 处置 |
| --- | --- |
| 旧会话工作区未提交改动（lingshf-shiny-garbanzo） | 只读参考，目录保留为备份。`product-guidelines.md` 由本 PR 落地（改为轻量流程）；README 的产品目标/SQLite 路线说明和 `developer.agent.md` 准则引用由 [M0-01](tasks/M0-01-ci-and-paused-docs.md) 落地。其余 SQLite 改向文档内容已被本路线图取代，不再逐段搬运；`deferred-postgres` 测试归档不落地（PG 在 [M0-03](tasks/M0-03-remove-postgres-sqlite-hardening.md) 整体删除）；未跟踪夹具 `apps/api/.legacy-fixture-*` 不提交。 |
| stash `b9f00dbf…`：M04 身份 | 继续延后，不落地。stash 保留不删。 |
| stash `b9f00dbf…`：M-TRADE 贸易（TASK24 GUI 验收前暂停） | 不 apply 旧代码。M1 以 stash 中的 `src/enterprise-trade*.mjs`、`public/enterprise-trade.js` 及其测试为**行为参考**，在新架构中重新实现并完成原 TASK24 的 GUI 验收。 |

## 3. 里程碑

### M0：技术栈调整 + CI（必须先完成，再做新功能）

目标：一套架构、一套测试框架、有 CI。完成后仓库里不再有 `src/*.mjs`、`public/*.js`、NestJS、pg。

1. **CI 先行**：M0-01 落地暂停现场文档并建立 PR CI，此后所有 PR 有 CI。
2. **工具链收敛**（M0-02..M0-07）：纯 Fastify、删除 PG + SQLite WAL、6 包合并为 3 包且直接跑 TS 源码、Vitest + Biome、依赖锁定 + Dependabot、CI 分层与预算。
3. **旧代码迁移**（M0-08..M0-14）：按纵向切片把 `src/*.mjs` + `public/*.js` 的功能迁入新架构（core → infra → Fastify → React），每片带 Vitest 测试和行为对照表，最后 M0-15 删除旧代码。

迁移的数据模型决定见 [M0 架构 §4](m0-architecture.md#4-旧代码迁移统一账模型)：旧“教学账”(`Book`) 和“法人账”(`EnterpriseBook`) 合并为**一个**以公司为作用域的总账模型，结账方式作为公司设置（月度教学结转 / 年度冻结）。已决定为 D1（协调者代定，见 §6）。

出口标准：
- `src/`、`public/`、`tests/`（旧）及依赖它们的脚本已删除；功能对照表中的每个旧行为在新架构有对应测试或明确“放弃”记录。
- 只有 3 个包（core / infra / web），无 NestJS、无 pg；dev/test 不需要先 build。
- 单一 Vitest 测试入口 + Biome；PR CI ≤ 10 分钟；完整套件和性能基准在 main/每晚运行。
- 100 万 GL 行基准已运行并记录（达标或如实记录差距并生成子任务）。
- 里程碑评审 + 测试审计完成。

### M1：贸易 AP/AR（非库存）闭环

目标：在新架构中实现原 M-TRADE-A（FR-T01..T08，FG09/10/13/14 部分 + FG41/42 限定）并完成原 TASK24 的 GUI 验收。

范围：贸易伙伴/非库存商品/过账配置/付款条件/税码 → 费用采购发票、服务销售发票（含订单行匹配）→ 付款/收款与部分核销、现金折扣 → 预付/预收及应用、贷项与专用取消 → 未结项/账龄/历史余额查询及与 GL 核对。

简化决定（防止过度设计）：旧实现用“事件全量重放 + 投影缓存”求未结项。新实现改为关系表（单据、单据行、未结项、核销记录）+ 索引，在同一 SQLite 事务内写业务行、GL、回执、审计；正确性由单事务和唯一约束保证，不再需要重放缓存。

出口标准：FR-T01..T08 的行为测试通过；GUI 端到端（中/英、红/绿、键盘）验收；未结项查询在 100 万 GL 行 + 10 万未结项数据上满足热读预算；里程碑评审 + 测试审计完成。

### 之后（仅列方向，开工前另行规划）

M2 账套迁移/切换（需用户授权，使用已有只读旧账读取器做导入，完整备份与核对；前置门禁 M0-R4、M0-R5；任务草案见 [design/tasks/README.md](tasks/README.md) 的 M2 一节）；之后按 OQ-01 顺序推进库存与成本、税、外币、银行、资产/租赁、期末与关账、公司间/合并、报表与现金流、教学与 AI。

S4（UI-1 后续 + M1 遗留，建议 v0.4.0）：UI-09 / UI-10 小步改进、订单录入 GUI、贸易页教学与列表、发布流程文档。任务与并行安排见 [tasks/README.md](tasks/README.md#s4ui-1-后续--m1-遗留建议-v040)。M2-05/06 仍待用户授权，不在 S4。

## 4. CI 与测试策略（设计角色牵头）

预算：**PR CI ≤ 10 分钟**（墙钟，含安装）。仓库为 GitHub Free 私有库：Actions 每月 2000 分钟，无分支保护。

基线（2026-11-18，main 341300f，本机 Windows、Node 26.13.0，单次）：`npm ci` 128s；`npm test` 182 项 14s；`check` 3s；`test:boundaries` 2s；`test:workspaces`（含每次全量 build）115s；`typecheck` 18s；合计约 4.7 分钟。主要浪费在每次测试前全量 build 和 node --check 文件列表，M0-04/M0-05 消除。

分层：

| 层 | 触发 | 内容 |
| --- | --- | --- |
| PR 快速套件 | `pull_request` | 安装（npm 缓存）→ Biome → typecheck → 受影响测试（`vitest --changed origin/main`，配置/锁文件变动时跑全部单元+集成）→ web build |
| 完整套件 | push 到 `main`、每晚 | 全部 Vitest（含慢集成/浏览器级）+ build |
| 性能基准 | 每晚、手动 | 100 万 GL 行合成基准等，结果写入 job summary 与 artifact |

分钟预算估算：PR 约 4–6 分钟 × 每 PR 2–3 次推送；main 每次 ≤ 8 分钟；每晚完整 + 基准 ≤ 20 分钟（仅当天 main 有新提交时运行）。目标月用量 ≤ 1200 分钟，留余量。超出时先削减每晚频率。

规则：
- `concurrency` 取消同一 PR 的旧运行；所有 job 设 `timeout-minutes`；只跑 ubuntu 单平台单 Node 版本。
- 每个里程碑末做一次测试审计：CI 总时长、最慢 10 个测试、重复/低价值用例 → 精简子任务。
- 调整 Full 分片或浏览器测试耗时之前，先剖析 runner 冷启动（如 Chrome 首启、磁盘预热），用数据确定瓶颈，再改分片（v0.3.0 回顾，D38 / R6b 教训）。
- **本机数字的地位**（S4 回顾）：耗时阈值只按合并后 Linux main Full 每个分片的 Vitest `Duration` 验收（D13 / D15），不用 step 时长。本机耗时只作参考，超出不阻塞，也不能作为达标证据。D13 只管耗时，不豁免、也不解释任何断言失败。记录失败时区分**观察**（日志里看到了什么）、**推断**（可能的机制）和**归因**（已复现并证实的原因）。失败日志、同一 head 重跑通过、该 head 的 PR CI 通过，只说明“未稳定复现”，不能确立负载根因；原因未证实时记为“未知”，按下文“偶发失败”处理。只有在受控负载下复现并找到机制，才能归因于负载。
- 测试原则：测试行为不测实现；同一行为只在最低能覆盖的层测一次；慢测试（真实浏览器、大数据）不进 PR 层。
- 因无法开启分支保护，约定：PR 必须 CI 绿 + 评审角色通过后才合并；不直接推 main（设计角色文档 PR 同样走 PR）。

## 5. 团队流程

- 角色：协调者（派发与对接用户）；设计角色（本文件、任务文档、里程碑评审、测试审计，唯一修改 `design/` 任务文档的角色）；开发角色（实现，一个任务 = 一个分支 = 一个 PR）；PR 评审角色（按任务验收标准评论）。
- 任务状态在 [tasks/README.md](tasks/README.md) 维护：`todo` → `in-progress` → `in-review` → `done`（附 PR 链接）；`blocked` 写原因。开发角色可在 PR 描述中报告，状态由设计角色同步。
- PR 评审清单：按任务文档完成；SOLID 但不过度设计；测试足够且不重复；性能考虑已落实；产品准则 PG-01..05。
- **合并检查清单**（v0.3.0 回顾）：
  - **合并前**（协调者逐项确认，任一不满足不合并）：
    1. 评审的 `commit_id` 等于 PR 当前 head，结论为通过，该 head 的 PR CI 为绿；
    2. 满足任务文档的验收标准。UI 任务还须附 PR 当前 head 的真实 Chrome 证据，见 [UI-1 通用验收 5](tasks/README.md#ui-1界面逐步改进)；
    3. PR 描述写明对应的任务 ID。若有运维可见变化，附旧值 → 新值对照（见下条）。
  - **合并后**（这些动作只能在合并后做，不作为合并条件）：
    1. 协调者记录合并提交 `M`，当天通知设计角色；
    2. **任务表同步**：设计角色把 [tasks/README.md](tasks/README.md) 中该任务改为 `done` 并填入 PR 链接（任务表只由设计角色修改；可攒入当天的文档 PR）。同步前，该任务不算完成，发布 PR 不得引用它。设计角色**不等通知**：每天至少一次，以及在派发同冲突域下一个任务前，用 `git log --oneline <上次同步的提交>..origin/main` 对照任务表（S4 回顾）；
    3. **跟踪 main Full**，以第一个“覆盖 `M`”的完整结果解锁同冲突域的下一个任务：
       - “覆盖 `M`”指运行的 SHA 等于 `M`，或是 `M` 的后代（`git merge-base --is-ancestor M <sha>`）；
       - “完整结果”指 `full.yml` 的 12 个 job（unit / browser 各 6 个分片）全部结束，没有任何 job 处于 cancelled 状态，并且**每个分片的测试步骤 “All tests including slow tests” 的结论都是 `success`**。job 绿不够：定时运行在 main 最新提交超过 24 小时时，由 `scripts/ci.ts gate` 跳过安装和全部测试（步骤结论为 `skipped`），12 个 job 仍然显示绿。核对命令：`gh run view <run-id> --json headSha,jobs --jq '.headSha, [.jobs[].steps[] | select(.name=="All tests including slow tests") | .conclusion]'`，要求 12 个值都是 `success`。
- **Full 被取消时**：`full.yml` 的 `concurrency` 按 main ref + lane + 分片分组，并且 `cancel-in-progress`（`.github/workflows/full.yml:26–27`）。后续 push，包括补任务表的文档 PR，会取消 `M` 的 Full。处理方式：
  - **cancelled 不算红，也不算绿**，不解锁也不触发回退；
  - 改看覆盖 `M` 的更新 SHA 的 Full，取第一个完整结果：全绿则解锁；红则按失败用例归因，与本任务相关时由本任务修复或回退；
  - 若连续合并使每次 Full 都被取消，协调者暂停 main 合并（文档 PR 同样暂停），然后重跑 main **当前** SHA 的 push 运行：`gh run rerun <该 SHA 的 push run-id>`。push 运行不经过 24 小时门禁；
  - 不以定时运行解锁，除非核对命令显示它确实执行了测试。门禁跳过的定时运行不算结果，处理方式同上：重跑当前 main SHA 的 push 运行；
  - 不重跑已被后续提交取代的旧 SHA：旧 SHA 不含之后合并的提交，它的结果不能代表当前 main。
- **工作区隔离**（S4 回顾，D90）：同一仓库的所有 worktree 共用一个 `refs/stash`，`git stash pop` 会取到别的任务的改动。worktree 中禁止 `git stash`，包括 `git rebase --autostash`。暂存改动改用本分支的 WIP 提交（之后 `git reset --soft`），或 `git diff --binary` 存为会话目录下的 patch 文件。发现疑似串入时先核对 `git stash list` 与 `git diff --stat origin/main...HEAD`，报告协调者，不丢弃别人的 stash。评审时，diff 出现任务冲突域以外的文件，要求说明来源。
- **偶发失败与失败日志**（S4 回顾，D92、#106）：
  - PR CI 出现与本 PR 无关的失败，可以重跑一次，但必须在 PR 描述记录失败 run 链接、用例名与失败断言，并报告设计角色登记修复任务。不能只重跑不记录。重跑要用 `gh run rerun <run-id>` 在**同一 head** 上进行；rebase 后新 head 通过不算重跑，要分开记录。
  - 作为 PR 证据的本机测试运行，一律用 `2>&1 | Tee-Object <log>` 保存完整输出，**失败的运行也保存**，与通过的日志一起放进证据 gist。没有日志的失败不能以“本机负载”结案。
- **运维可见变化**（日志字段或 `errorType`、错误码、端口、CLI 输出、配置项）：PR 描述必须写明旧值 → 新值的对照表（v0.3.0 回顾，#81）。
- 里程碑评审：里程碑最后一个任务合并后，由设计角色做一次（代码是否按设计、设计原则、性能、测试审计），问题生成子任务（`M0-R1`…）。
- 不再使用旧 G3/G5/G6 门禁、MODEL01 例外流程、逐阶段本地保护同步/新 clone 等重流程。

## 6. 决定记录

| ID | 问题 | 决定 | 来源 | 影响 |
| --- | --- | --- | --- | --- |
| D1 | 旧“教学账”和“法人账”是否合并为一个总账模型 | 合并为一个总账模型，结账方式（月度教学结转 / 年度）作为公司设置 | 协调者代定（2026-11-18），用户之后可以调整 | M0-08 起的迁移切片可开工 |
| D2 | 依赖升级工具 | 使用 GitHub 内置 Dependabot（无需安装 App），不用 Renovate | 协调者转达（2026-11-18） | M0-06 |
| D3 | 4173 原账套在 M0 删除旧代码后如何继续使用 | 原 4173 进程及其工作区保持原样，继续由原 checkout 运行；新 main 不再含旧服务器，直到 M2 账套迁移获用户授权 | 协调者转达（2026-11-18） | M0-15 可按计划执行 |
| D9 | M0-R4 的 Windows `INVALID_SNAPSHOT` 无法复现时怎么结案（开发 5 在 main b0dc14f 上 Windows 原测试 50 次、隔离夹具压测 500 次，均 0 失败） | 无法复现时不要求找到根因，用压测证据、带失败检查项及前后 size/mtime/ino 的诊断信息、不放宽校验的加固三项结案；只读验收不变；M2 仍须等 M0-R4 合并 | 协调者决定（2026-11-18） | M0-R4 验收 |
| D10 | M2 草案评审第三轮的两项分歧 | ① M2-04 `--confirm` 锁定首次基线 W，之后不可改写；再次确认只校验 `write_seq`==W，不等即拒绝；重建基线只能作废目标库、从快照重新导入。② Windows 独占门禁用真实文件句柄验收，放在 Windows 每晚/手动 job，不进 PR CI；Linux PR Full 只覆盖注入检查和“非 Windows 真实使用直接拒绝”；Bench 不承担 | 协调者决定（2026-11-18，两轮规则） | M2-01、M2-04 验收 |
| D25 | 旧账 AP/AR 控制科目余额迁入后没有未结项，贸易子账与 GL 不一致（M1-R 提出） | 切换时导入为期初未结项，使子账与 GL 一致；不采用“其他来源差异另行清理” | 协调者代定（2026-11-19） | 新增 M2-03b；M2-04b 依赖 M2-03b；M2-05 之前完成（交付顺序见 D26） |
| D26 | M2-04 是否要等 M2-03b 才能交付 | M2-04 首批按原边界交付，复用现行 `tradeReconciliation`；没有期初完成证据（M2-03b 的 `opening=done` 标记）时 fail-closed，判 `阻断`、标注“待 M2-03b 消除”，不因净额为 0 放行。M2-03b 不是首批的硬前置；P 公式和期初负例在 M2-03b 合并后由小跟进 M2-04b 验收。M2-05 要等 D25 全部完成（M2-03b 与 M2-04b 都已合并） | 协调者代定（2026-11-19） | M2-04 拆为首批与 M2-04b；M2-05 依赖 M2-04b |
| D30 | M2-03b 规范与 M1 模型的六处冲突/空白（不新增迁移） | 期初来源记入 `legacy_refs`；来源凭证按唯一规则选取（给定旧凭证 ID → 切换日及之前最后一张触及该科目的 LEGACY 凭证 → 拒绝）；主数据由明细文件提供；期初项科目角色放宽（同方向、同伙伴、同币种，GL 按各项自身科目）；期初项只参与付款核销和 apply，贷项和取消以 `reference` 拒绝；切换日 = 旧账最后记账日（无凭证取年末）；口径 5 用文件 `partnerDimension` | 协调者代定（2026-11-19） | 见 [M2-03b](tasks/M2-03b-legacy-opening-open-items.md) |
| D51 | M1-R3 带核销/调整历史和并发后，账龄、余额和对账报表超出 D18 预算，是否允许新增迁移 | 允许新增迁移 016，只建结算覆盖索引 `settlements_report`（不改表、不改业务口径）；报表 SQL 改写须逐字段与原 SQL 一致，并保留新旧 SQL 逐字段对照测试 | 协调者批准（M1-R3） | 见 [M1-R3](tasks/M1-R3-trade-report-capacity.md)、[基准证据](../docs/performance/trade-e2e-bench.md) |
