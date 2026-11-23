# M2-05b 期初未结项分批写入：导入峰值 RSS 回到 512 MiB 以内，关闭已知缺口 KG

- 里程碑：M2　决定：**D434**　依赖：**M2-05a 的 PR 合并后才能派发**（本任务改的 Bench 开关与手册段落由 M2-05a 引入）　建议分支：`m2-05b-opening-batched-write`
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

  中断时整体回滚。M2-03b 验收 8、9 由 `packages/infra/test/legacy-import-execute.test.ts` 覆盖。

## 范围与决定

1. **原子性口径不变（本任务的核心约束）**：
   - “分批”只指**内存分批**：从暂存表按批读出 → 写入目标 → 丢弃该批对象。它**不是分批提交**。
   - 期初阶段仍是 M2-03b 规定的**一个写事务**，提交内容、顺序与现在相同：新伙伴 → 期初项与 `legacy_refs` → 目标复核 → `opening='done'` 与状态 → `reconcileLegacy` → run 进度。
   - 事务中途不得 `COMMIT`，也不得用 `SAVEPOINT … RELEASE` 把部分写入提前落盘。
   - 不新增 run 状态、阶段标记或“写到第几批”的游标。
   - 因此 M2-03b §二“中断与续跑”的每一条照旧成立：
     - 期初阶段任何一批失败或中断，整个阶段回滚，目标中没有任何期初项、新伙伴、`opening_*` 引用或 `opening` 标记；
     - 已提交的 GL 批次不受影响；
     - 续跑时重新执行整个期初阶段，从第一批开始；
     - `opening='done'` 不存在时，目标中必然没有期初项。
   - **为什么单事务可行**：目标连接已设 `cache_size=-16384`（`legacy-import.ts:678`，约 16 MiB），事务内的脏页超出缓存后溢出到 WAL 文件，占的是磁盘而不是 RSS。占内存的是 JS 侧常驻的 10 万个对象，与事务大小无关。
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
  - `packages/infra/test/legacy-import-execute.test.ts` 与 `packages/infra/test/legacy-opening-items.test.ts`，只追加或改写本任务涉及的用例，**不新建测试文件**，不改 `scripts/test-shard-weights.json`；
  - `packages/infra/test/legacy-rehearsal.test.ts`（M2-05a 新增）不改，须原样通过。
- bench 开关：`scripts/bench-migration-rehearsal.mjs` 只删 KG 一项（第 6 条）。
- docs/runbook：`docs/migration-runbook.md` 只改 KG 两处（第 6 条）。
- **不改**：
  - `reconcile.ts`、`teaching.ts`、`import-plan.ts`；
  - `scripts/storage-admin-main.mjs`、`.github/workflows/*`；
  - 契约、迁移、Web。
- 与在岗任务的关系：
  - REFAC-01b（tests:trade-e2e）、REFAC-03（web-ui:journals）：不相交。
  - M2-05a：本任务在它合并后派发，不并行。

## 验收

- **N1 峰值 RSS（关闭 KG）**：在 PR head 上手动触发一次 `bench.yml`（`workflow_dispatch`），作业绿。`migration-rehearsal.json` 中：
  - `import.peakRssMiB` 的 `gate` 为 `hard`、值 ≤ 512，`import.seconds` ≤ 600；
  - dry-run 仍为两项 `hard` 且通过（≤ 120s、≤ 512 MiB）；
  - `KNOWN_GAPS` 为空。

  PR 正文贴运行链接与 JSON 摘要，并与 M2-05a 那次运行的数字并列：import 峰值 RSS、耗时，以及期初所在末批的耗时（仅记录）。
- **N2 分阶段内存说明**：PR 正文附一张本机实测表（用不提交的探针，借助现有 hooks 与新的 `beforeOpeningBatch` 采样 `process.memoryUsage().rss`），列出 base 与 head 在以下时点的 RSS：
  - 校验返回后；
  - GL 批次阶段结束；
  - 期初第 1 批写完、最后一批写完；
  - reconcile 前、reconcile 后。

  夹具同 J6（100 万 GL + 10 万期初）。用来证明常驻已消除，峰值不再随期初条数线性增长。另记录目标 WAL 文件在期初阶段提交前的大小（仅记录）。
- **N3 结果与现行实现一致**：
  - `legacy-import-execute.test.ts`、`legacy-opening-items.test.ts`、`legacy-rehearsal.test.ts` 中现有的期初相关用例全部原样通过（含 M2-03b 验收 1–9 的对应用例），断言一行不改。确有必要改写的，只能改测试的构造方式（例如读取 `entryCount` 而不是 `entries.length`），并在 PR 正文逐条列出理由。
  - 新增一例：同一虚构夹具（至少 3 个公司 / 科目、≥ 25 条期初项）分别用 `openingBatchItems: 1`、`7` 与默认值导入。三个目标库的逻辑转储逐行相同：全部业务表与 `legacy_refs` 按主键排序导出，排除 run ID 与时间戳列。
- **N4 原子性：中途失败全无**（新增用例，写进 `legacy-import-execute.test.ts`；`openingBatchItems` 取一个使期初项至少分成 3 批的值）：
  - **N4a** 用 `beforeOpeningBatch` 在第 2 批前抛错，导入以错误结束。目标中满足以下各项：
    - `open_items` 与 `trade_item_sources` 中没有期初项；
    - 没有新伙伴，也没有 `object_type` 为 `opening_items` 或 `opening_accounts` 的 `legacy_refs`；
    - `opening` 不为 `done`，run 状态为 `importing`；
    - GL 批次全部保留，`write_seq` 等于期初阶段开始前的值。
  - **N4b** 去掉注入后续跑：结果与一次跑完相同（按 N3 的逻辑转储比较），没有重复也没有遗漏。
  - **N4c** 在最后一批写完之后、目标复核之前注入复核失败（沿用现有 `beforeOpeningRecheck`）：整个期初阶段回滚，run 为 `failed`，与 M2-03b 验收 9 的结果相同。
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
- WAL 在期初阶段提交前会增长到期初写入量的大小。这占磁盘，不占内存；数值在 N2 中记录，不设门槛。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程)可读性 ①–⑥：

- **①**：暂存表、批大小、钩子都用表达业务含义的名称，如 `opening_entries`、`OPENING_WRITE_BATCH`、`beforeOpeningBatch`，不用 `tmp`、`buf`、`n2`。
- **②**：`validateOpeningItems` 已是长函数（base 中 `:130–746`）。本任务**新写或改写**的部分须是独立的具名函数，例如“写暂存行”“按批读出”“写一批”，每个 ≤ 80 行、嵌套 ≤ 3 层。不得把暂存逻辑内联进现有长函数，使其进一步变长。`flush` 中期初分支改为调用一个具名函数。PR 正文列出新写或改写的、超过 60 行的函数及其行数与最深层数。
- **③**：按 PR 实际 base 实测。`opening-items.ts` 在 M2-05a 后约 784 行，若 base 中超过 800 行即为热点，净增 ≤ 100；暂存逻辑放进 `opening-staging.ts` 可避免触线。`legacy-import.ts` 现为 783 行，同样按实测判断。PR 正文贴逐文件 `git diff --numstat`。
- **④**：“在第 N 批前注入失败 → 断言目标无期初痕迹”的检查在 N4a、N4c、N4d 中会多次出现，抽成一个测试辅助函数，例如 `expectNoOpeningTrace(db)`。
- **⑤**：批大小 `OPENING_WRITE_BATCH` 为具名常量；测试中的批数、条数也用具名常量。
- **⑥**：在“为什么单事务、为什么批只在内存中”处写一行说明“为什么”的注释（引用 M2-03b 原子性与 D434）；不留调试输出。

## 用户可见变化

- 界面无变化。
- 运维可见：导入 10 万期初项时内存降到预算内；操作手册中的 KG 一段改为“已关闭”。

## 证据要求

- PR 正文附：N1 的 Bench 运行链接与 JSON 摘要（与 M2-05a 运行并列）、N2 分阶段 RSS 表、N3 / N4 新增用例清单、N6 文件清单、可读性一节。
- 不需要浏览器时段。Bench 在 GitHub Actions 上跑，不占本机独占时段；本机做 N2 探针时须服从协调者的时段停用通知。
