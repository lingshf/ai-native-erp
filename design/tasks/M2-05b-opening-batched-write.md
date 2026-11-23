# M2-05b 期初未结项分批写入：导入峰值 RSS 回到 512 MiB 以内，关闭已知缺口 KG

- 里程碑：M2　决定：**D434**　依赖：**M2-05a 的 PR [#227](https://github.com/lingshf/ai-native-erp/pull/227) 合并后才能派发**（本任务改的 Bench 开关与手册段落由 M2-05a 引入，两者都写 Bench 脚本与迁移手册，须串行）　建议分支：`m2-05b-opening-batched-write`
- 排期：S13 追加。若 DEMO-13 开始前未合并，则顺延为 S14 首项。本任务不进 DEMO-13 门禁；若在 DEMO-13 前合并，发布说明写一行“导入峰值内存下降”。
- 类型：性能修复（工具链，无界面变化）　优先级：P1（M2 迁移链路的预算缺口）
- 迁移：**不加**。暂存表建在导入时的临时计划库（`plan.sqlite`，位于系统临时目录，每次运行新建、结束删除）中，不改目标库 schema。
- 浏览器时段：**不需要**（无浏览器步骤）。
- 数据：只用虚构夹具；不读取真实旧账、4173 账套或 `.bak` 文件。

## 现状（main `baddd6e`，M2-05a 分支 `21deabf`）

- **问题**：M2-05a 的 J6 Bench 用 100 万 GL 行加 10 万期初未结项，`legacy-import` 的峰值 RSS 为 **668 MiB**，超出 512 MiB 预算（[M2-03](M2-03-legacy-import-execute.md) `:54–56`）。0 条期初时为 373 MiB。M2-05a 把它登记为已知缺口 KG（D434）：
  - 脚本 `scripts/bench-migration-rehearsal.mjs` 中的 `KNOWN_GAPS["import.peakRssMiB"]`，该项判定为 `known-gap`，不使作业失败；
  - `docs/migration-runbook.md` 的“已知缺口 KG”一段。
- **原因**（协调者实测）：
  - `validateOpeningItems`（`packages/infra/src/legacy/opening-items.ts:130` 起）在导入开头一次返回完整的 `OpeningPlan`，其中 `entries`（`:47–52`、`:483`、`:649`、`:742`）是 10 万个 `OpeningEntry`，每个含一个 `OpenItem` 和一段 `evidence` 字符串。
  - `executeLegacyImport`（`packages/infra/src/storage/legacy-import.ts:556`）在 `:607` 持有 `opening`，并在整个 GL 批次阶段保持常驻。
  - 最后一次 `flush(true)`（`:687–739`）在同一个事务里先 `writeOpening`（`:200–250`，逐条 `insertTradeItem` 加写 `legacy_refs`），再做目标复核 `openingDifferences`，然后 `reconcileLegacy`。峰值出现在 reconcile，此时 10 万条期初数据仍常驻。
  - 只在写完后提前释放 `entries`，峰值仅降到 619 MiB。说明常驻的计划本身和写入时生成的对象都需要处理。
- **原子性现行口径**：见 [M2-03b §二](M2-03b-legacy-opening-open-items.md#二期初未结项与导入阶段)。以下内容在**一个写事务**里一起提交：
  - 期初阶段的全部写入：新伙伴、期初项、`opening_items` / `opening_accounts` 两类 `legacy_refs`、`opening='done'`、run 状态；
  - 目标复核；
  - `reconcileLegacy` 结果。

  中断时整体回滚。注意 `flush(true)`（`:693–737`）在**同一事务**中先写末批尚未提交的 GL（`pending`），再写期初，最后更新 `cursor` / `write_sequence`；因此期初阶段失败时末批 GL 也随之回滚，续跑从上次已提交的 `cursor` 补回。复核差异时 `:741–755` 在回滚后另记 run 为 `failed`。M2-03b 验收 8、9 的中断与复核用例在 `packages/infra/test/legacy-opening-items.test.ts`（`:167`、`:268`）。

## 范围与决定

1. **原子性口径不变（本任务的核心约束）**：
   - “分批”只指**内存分批**：从暂存表按批读出 → 写入目标 → 丢弃该批对象。它**不是分批提交**。
   - 期初阶段仍是 M2-03b 规定的**一个写事务**（即现有 `flush(true)`），提交内容、顺序与现在相同：末批 GL → 新伙伴 → 期初项与 `legacy_refs` → 目标复核 → `write_seq` → `opening='done'` 与状态 → `reconcileLegacy` → run 进度（`cursor`、`counts`、`write_sequence`）。不得为让用例通过而改变事务边界或 run 状态机。
   - 事务中途不得 `COMMIT`，也不得用 `SAVEPOINT … RELEASE` 把部分写入提前落盘。
   - 不新增 run 状态、阶段标记或“写到第几批”的游标。
   - 因此 M2-03b §二“中断与续跑”的每一条照旧成立：
     - 期初阶段任何一批失败或中断，整个阶段回滚，目标中没有任何期初项、新伙伴、`opening_*` 引用或 `opening` 标记；
     - 进入 `flush(true)` 前**已提交**的 GL 批次及持久游标不受影响；末批 GL 与期初同在一个事务，随之回滚；
     - 续跑时从已提交的 `cursor` 补回末批 GL，再重新执行整个期初阶段，从第一批开始；
     - `opening='done'` 不存在时，目标中必然没有期初项。
   - **为什么预期单事务可行**：目标连接已设 `cache_size=-16384`（`legacy-import.ts:678`，约 16 MiB），事务内超出页缓存的脏页会溢出到 WAL 文件。M2-05a 的实测（0 条期初 373 MiB、10 万条 668 MiB、只提前释放 `entries` 降到 619 MiB）指向 JS 侧常驻对象。这只是设计依据，不是 RSS 上限的保证：页缓存与 WAL 都不构成进程 RSS 的上界，是否达标只由 N1 实测判定。
   - **为什么不用分批提交**：分批提交要在 M2-03b 中新增“期初写入中”标记和续跑清理规则，会改变“无标记即无期初项”这一 M2-04 门禁所依赖的不变式，本任务不授权。若单事务方案实测仍超预算，**先停下报设计角色**，不自行改成分批提交。
2. **期初明细落暂存表，计划不再常驻**：
   - `validateOpeningItems` 校验通过的每条期初项，按文件顺序写入临时计划库中的一张暂存表（表名由开发定，例如 `opening_entries`）。写入字段须足以还原 `writeOpening` 当前使用的全部输入：`source`、`company`、`legacyId`、`journalLegacyRef`、序列化后的 `OpenItem`、`evidence`，另加一个按文件顺序递增的序号列。
   - 返回的 `OpeningPlan` 不再含 `entries` 数组，改为 `entryCount`（`sha`、`configs`、`accounts` 不变）。`configs` 与 `accounts` 的数量与伙伴主数据和控制科目数同级，可以常驻。
   - 校验时解析出的整份 JSON 树、逐行中间对象，以及 M2-05a 引入的 `historicalJournalsByAccount` 缓存，都只活在校验函数内部，返回后不得再被任何长寿命对象引用。
   - 暂存表随临时计划库一起删除（`legacy-import.ts` 现有的 `finally` 已删除临时目录）。
   - 库函数 dry-run `checkLegacyOpeningItems`（`:185`）走同一个校验函数，输出的 `sha` 与 `issues` 不变。
3. **按批写入**：
   - `writeOpening` 从暂存表按序号升序、每批 `OPENING_WRITE_BATCH` 行读出，逐行调用现有的 `insertTradeItem` 并写 `legacy_refs`。批大小是具名常量，建议值 1000，由开发实测后定，并在 PR 正文说明理由。
   - 写完一批后不保留该批对象：不得把批结果累积进数组，也不得建以条目为键的 Map。
   - 伙伴（`configs`）与 `opening_accounts` 引用照旧先后写入，顺序与现在相同。
   - 写入顺序与现行实现逐条相同，这样目标库内容（见验收 N3）与现行实现一致。
4. **测试注入点**：
   - `executeLegacyImport` 的 `hooks` 可新增一个 `beforeOpeningBatch?(batch: number)`，用于在第 N 批前注入失败。
   - `request` 可新增一个只供测试的 `openingBatchItems?: number`，取值 1 至 `OPENING_WRITE_BATCH`，越界以 `INVALID_INPUT` 拒绝，口径同现有 `batchLines`。用它让小夹具也跑出多批。
   - CLI（`scripts/storage-admin-main.mjs`）不暴露该参数，不改。
5. **reconcile 不改**：`packages/infra/src/legacy/reconcile.ts` 不在冲突域。上面两条落实后，reconcile 执行时 JS 侧不再常驻期初数据。若分阶段实测显示 reconcile 本身就超预算，先停下报设计角色。
6. **关闭 KG，恢复硬判定**：
   - 删除 `scripts/bench-migration-rehearsal.mjs` 中 `KNOWN_GAPS` 的 `"import.peakRssMiB"` 一项。该脚本只改这一处；`KNOWN_GAPS` 常量与机制保留，删空后为 `{}`。
   - `docs/migration-runbook.md` 只改两处：预算表中“已知缺口 KG，见下”的字样，以及“已知缺口 KG”一段。改为“已于 M2-05b 关闭（D434）”，并写出实测峰值。
7. **不在本任务**：
   - 改 CLI 的输入方式：当前把明细文件整份读成字节传入，这份字节由调用方持有。若实测证明它是剩余超额的主因，先停下报设计角色，不在本任务改 CLI。
   - 优化 GL 批次阶段（0 条期初时 373 MiB，已在预算内）。
   - 改 dry-run 的预算或判定。
   - 改 M2-04 核对。

## 冲突域

- legacy-import：
  - `packages/infra/src/legacy/opening-items.ts`；
  - `packages/infra/src/storage/legacy-import.ts`；
  - 可选新增 `packages/infra/src/legacy/opening-staging.ts`：暂存表的建表、写入和分批读取放在这里，以免 `opening-items.ts` 成为热点。
- 测试：
  - `packages/infra/test/legacy-import-execute.test.ts` 与 `packages/infra/test/legacy-opening-items.test.ts`（N4 写在后者），只追加或改写本任务涉及的用例，**不新建测试文件**，不改 `scripts/test-shard-weights.json`；
  - `packages/infra/test/legacy-rehearsal.test.ts`（M2-05a 新增）不改，须原样通过。
- bench 开关：`scripts/bench-migration-rehearsal.mjs` 只删 KG 一项（第 6 条）。
- docs/runbook：`docs/migration-runbook.md` 只改 KG 两处（第 6 条）。
- **不改**：
  - `reconcile.ts`、`teaching.ts`、`import-plan.ts`；
  - `scripts/storage-admin-main.mjs`、`.github/workflows/*`；
  - 契约、迁移、Web。
- 与在岗任务的关系：
  - REFAC-01b（tests:trade-e2e）、REFAC-03（web-ui:journals）：不相交。
  - M2-05a（#227）：两者都写 `bench-migration-rehearsal.mjs` 与 `docs/migration-runbook.md`，本任务在它合并后派发，串行，不并行。

## 验收

- **N1 峰值 RSS（关闭 KG）**：在 PR head 上手动触发一次 `bench.yml`（`workflow_dispatch`），作业绿。`migration-rehearsal.json` 中：
  - `import.peakRssMiB` 的 `gate` 为 `hard`、值 ≤ 512，`import.seconds` ≤ 600；
  - dry-run 仍为两项 `hard` 且通过（≤ 120s、≤ 512 MiB）；
  - `KNOWN_GAPS` 为空。

  PR 正文贴运行链接与 JSON 摘要，并与 M2-05a 那次运行的数字并列：import 峰值 RSS、耗时，以及期初所在末批的耗时（仅记录）。
- **N2 分阶段内存说明（送审证据，不进 CI）**：用不提交的临时探针采样 `process.memoryUsage().rss`，夹具同 J6（100 万 GL + 10 万期初），base 为 #227 合并后的实际 base。PR 正文附一张表，分两部分：
  - **两侧可比的阶段边界**（base 与 head 都能采样，用作 base / head 对比）：
    - B1 期初明细校验返回后（`validate()` 返回，进入 GL 批次前）；
    - B2 GL 批次阶段结束、进入 `flush(true)` 前（现有 `beforeBatchCommit` 的最后一次非末批回调之后，或在探针中包装 `flush`）；
    - B3 期初写入与复核之后、reconcile 之前（现有 `beforeReconcile`）；
    - B4 reconcile 返回后、事务提交前（现有 `beforeBatchCommit` 在末批的那次回调）；
    - 全程峰值（与 N1 同一口径）。
  - **只在 head 有的采样点**（只看 head 自身走势，不与 base 比）：`beforeOpeningBatch` 在第 1 批前、中间某批前、最后一批前。
  - **证据边界**：这一组只证明 10 万项**这一规模**下各阶段 RSS 的 base / head 差异，不能单独证明“峰值不再随期初条数线性增长”。“期初对象不常驻”由 N5 的生命周期证明（类型与代码核对）承担；本表只作为固定规模的实测佐证。可选另跑 1 万项一组作参考，不作判定。
  - 另记录目标 WAL 文件在 B3 时的大小（仅记录）。

- **N3 结果与现行实现一致**：
  - **N3a 既有用例**：`legacy-import-execute.test.ts`、`legacy-opening-items.test.ts`、`legacy-rehearsal.test.ts` 中现有的期初相关用例全部原样通过（含 M2-03b 验收 1–9 的对应用例），断言一行不改。确有必要改写的，只能改测试的构造方式（例如读取 `entryCount` 而不是 `entries.length`），并在 PR 正文逐条列出理由。
  - **N3b 批大小无关（CI 用例）**：同一虚构夹具（至少 3 个公司 / 科目、≥ 25 条期初项）在 head 上分别用 `openingBatchItems: 1`、`7` 与默认值导入，三个目标库的逻辑转储逐行相同。这一例只证明结果与批大小无关。
  - **N3c 与实际 base 一致（送审证据）**：把同一夹具在 #227 合并后的实际 base（PR 的 merge-base）上导入一次，与 head 默认批大小的结果比较逻辑转储，须逐行相同。这一项用来排除“三种批大小一起漏掉同一行”。不新增 CI 测试，PR 正文贴 base 提交号、比较脚本（不提交）的命令与结果（行数与差异为 0）。
  - **逻辑转储口径**（N3b、N3c、N4b 共用）：目标库全部业务表与 `legacy_refs`，按主键排序导出；排除 run ID 与时间戳列；两侧用同一排序与列归一规则。

- **N4 原子性：中途失败全无**（新增用例写进 `legacy-opening-items.test.ts`，与 M2-03b 验收 8、9 的现有用例同文件；`openingBatchItems` 取一个使期初项至少分成 3 批的值；夹具的 GL 至少有 2 个批次，使进入 `flush(true)` 前已有已提交的 GL）：
  - **基准**：进入 `flush(true)` 前最后一次**已提交**的 GL 快照，即该时刻目标库的逻辑转储，加上 run 行的持久 `cursor`、`counts`、`write_sequence` 与 `write_seq.value`。用例可先以中断让导入停在这一点并取快照，或用探针在 `flush(true)` 的 `BEGIN` 前取。
  - **N4a** 用 `beforeOpeningBatch` 在第 2 批前抛错，导入以错误结束。目标与基准逐项相同，即：
    - 末批 GL 随期初一起回滚，已提交的 GL 与持久游标不变；
    - 没有期初项（`open_items` 与 `trade_item_sources` 中没有期初来源的行），没有新伙伴，没有 `object_type` 为 `opening_items` 或 `opening_accounts` 的 `legacy_refs`；
    - `opening` 不为 `done`，run 状态为 `importing`。
  - **N4b** 去掉注入后续跑：从已提交的 `cursor` 补回末批 GL，再写完期初；结果与一次跑完相同（按 N3 的逻辑转储比较），没有重复也没有遗漏。
  - **N4c 复核失败**：沿用既有 `beforeOpeningRecheck` 注入方式（`legacy-opening-items.test.ts:268`：删除一条 `opening_accounts` 引用），在多批写完后制造**实际余额差异**，而不是直接抛错。断言：期初阶段与末批 GL 回滚到基准；随后 run 被另记为 `failed`；错误为 `CONFLICT`，消息列出差异科目，与 M2-03b 验收 9 相同。
  - **N4d** `openingBatchItems` 取 0、超过 `OPENING_WRITE_BATCH` 或非整数时，在任何目标写入前以 `INVALID_INPUT` 拒绝：新路径不建库，续跑路径目标字节不变。

- **N5 计划不再常驻（静态与单元）**：
  - `OpeningPlan` 类型中不再有 `entries`；
  - `executeLegacyImport` 中除暂存表外，没有持有期初项集合的变量；
  - `writeOpening` 不向函数外累积批数据。

  评审按代码核对，并在 `legacy-opening-items.test.ts` 加一例：校验 `n` 条明细后，暂存表正好 `n` 行、序号连续，返回值的 `entryCount === n`。dry-run 的阻断用例（M2-03b 验收 5–7）输出逐项不变。
- **N6 范围**：`git diff --name-only <base> <head>` 只含冲突域所列文件。不加迁移，不改契约，不改 `scripts/test-shard-weights.json`。
- **N7 质量门**：`typecheck`、`lint` 通过；PR CI 绿；合并后覆盖该合并提交的 main Full 绿，`legacy-rehearsal.test.ts` 的 Full 耗时不超过 M2-05a 的预算（J2，≤ 60s）。
- **N8 可读性**：PR 正文“可读性”一节按下文逐条说明。

## 性能考虑

- 预算沿用 M2-03（导入 ≤ 10min、RSS ≤ 512MB）与 M2-02（dry-run ≤ 120s、RSS ≤ 512MB）。本任务把导入 RSS 从 `known-gap` 恢复为 `hard`。
- 暂存表多一次写入和读取，在临时库中完成。末批（期初所在批）的耗时记录在 Bench 中；若导入总耗时比 M2-05a 那次运行慢 20% 以上，PR 正文说明原因。不设额外硬门槛。
- WAL 在期初阶段提交前会随期初写入量增长；数值在 N2 中记录，不设门槛。页缓存与 WAL 都不是 RSS 上界，内存是否达标只看 N1。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程)可读性 ①–⑥：

- **①**：暂存表、批大小、钩子都用表达业务含义的名称，如 `opening_entries`、`OPENING_WRITE_BATCH`、`beforeOpeningBatch`，不用 `tmp`、`buf`、`n2`。
- **②**：`validateOpeningItems` 已是长函数（base 中 `:130–746`）。本任务**新写或改写**的部分须是独立的具名函数，例如“写暂存行”“按批读出”“写一批”，每个 ≤ 80 行、嵌套 ≤ 3 层。不得把暂存逻辑内联进现有长函数，使其进一步变长。`flush` 中期初分支改为调用一个具名函数。PR 正文列出新写或改写的、超过 60 行的函数及其行数与最深层数。
- **③**：按 PR 实际 base 实测。`opening-items.ts` 在 M2-05a 后约 784 行，若 base 中超过 800 行即为热点，净增 ≤ 100；暂存逻辑放进 `opening-staging.ts` 可避免触线。`legacy-import.ts` 现为 783 行，同样按实测判断。PR 正文贴逐文件 `git diff --numstat`。
- **④**：“取基准快照 → 注入失败 → 断言目标与基准相同”在 N4a、N4c、N4d 中会多次出现，抽成测试辅助函数，例如 `committedSnapshot(db)` 与 `expectAtCommittedSnapshot(db, snapshot)`；逻辑转储（N3、N4b）共用一个辅助函数。
- **⑤**：批大小 `OPENING_WRITE_BATCH` 为具名常量；测试中的批数、条数也用具名常量。
- **⑥**：在“为什么单事务、为什么批只在内存中”处写一行说明“为什么”的注释（引用 M2-03b 原子性与 D434）；不留调试输出。

## 用户可见变化

- 界面无变化。
- 运维可见：导入 10 万期初项时内存降到预算内；操作手册中的 KG 一段改为“已关闭”。

## 证据要求

- PR 正文附：N1 的 Bench 运行链接与 JSON 摘要（与 M2-05a 运行并列）、N2 分阶段 RSS 表（注明 base 提交号与证据边界）、N3c 的 base 对比结果、N3 / N4 新增用例清单、N6 文件清单、可读性一节。
- 不需要浏览器时段。Bench 在 GitHub Actions 上跑，不占本机独占时段；本机做 N2 探针时须服从协调者的时段停用通知。
