# FLAKE-04 旧账核对 CLI 用例：`spawnSync` 3000 ms 超时间歇触发

- Sprint：S6（[计划](README.md#s6订单列表与保存前预览--s5-遗留收尾建议-v060)）　依赖：无代码依赖；测量时段不能与 [E2E-01](E2E-01-concurrent-e2e-interference.md) 的并发实验或其他独占时段重叠，由协调者排期　建议分支：`flake-04-legacy-cli-timeout`
- 冲突域：tests:legacy-reconciliation（`packages/infra/test/legacy-reconciliation.test.ts`）；若修复要改 CLI 启动路径，同时占 admin-cli（`scripts/storage-admin.mjs`）。S6 其他任务都不改这两处。
- 类型：调查（结论成立时附修复）
- 环境：只用 node，不用 Chrome；**测量会产生 node 负载**。空载组需要整台机器（同 [路线图 §5 E2E 独占时段](../roadmap.md#5-团队流程)：其他 session 不跑真实 Chrome、Playwright、vitest slow，也不跑本机 vitest 全量），由协调者安排时段；负载组的负载由本任务自己产生，也要在无外部负载时进行。
- 来源：协调者汇总，以下都是**观察**：
  1. UI-13、FLAKE-03、TORD-04、UI-11c 四个 session 在 PR 层快速套件中都遇到过，每次 2–3 个用例失败，失败时 `spawnSync` 返回 `status=null`。**待验证**：`status=null` 本身不能说明原因：`spawnSync` 超时（`error.code === "ETIMEDOUT"`）、被外部信号终止（`signal` 非空），以及启动失败（如 `status=null, signal=null, error.code=ENOENT`）都会得到 null；历史日志没有记录 `error.code` 与 `signal`，不能据此认定为超时；
  2. 单独跑这个文件，同一 base `0a91b00` 一次 30/30 通过，一次 3/30 失败；
  3. CLI 的导入耗时约 1 s（未附测量方法，待本任务复测）；
  4. 失败时机器上通常有外部 node 并行负载（未定量，不能据此归因于负载，见[路线图 §4 本机数字的地位](../roadmap.md#4-ci-与测试策略设计角色牵头)）。

## 现状（main `7aac72f`）

`legacy-reconciliation.test.ts` 中共有 9 个用例启动子进程，都用 `timeout: 3000`：

| 位置 | 用例 | 子进程 |
| --- | --- | --- |
| :310–329（spawn 在 :317） | `confirmation excludes another process's business admission…` | `node --input-type=module -e`，导入 `packages/infra/src/storage/maintenance.ts` 取租约（:323） |
| :376–398（spawn 在 :388） | `CLI explicit %s preserves the verdict and exit status`（check / confirm，2 个） | `scripts/storage-admin.mjs legacy-reconcile` |
| :466–491（spawn 在 :476） | `CLI opening gate exits nonzero: $name / $action`（3 场景 × 2，6 个） | 同上 |

- vitest 为 `pool: "forks"`、`maxWorkers: availableParallelism()`、`testTimeout: 15_000`（`vitest.config.ts:105–110`）。所以 PR 层套件运行时，本文件的子进程与其他测试文件的 fork 同时争用 CPU。
- `scripts/storage-admin.mjs` 在解析参数后才动态导入业务模块（:170–219），其中直接导入 `.ts` 源文件（如 :174 `../packages/infra/src/legacy/import-plan.ts`、:175 `../packages/infra/src/storage/legacy-import.ts`、:196 起的核对模块）。每次启动都要重新加载并去除类型。**推断**：这可能是启动开销的主要来源，尚未测量。

## 范围

1. **测量冷启动耗时分布**（不改测试、不改 CLI；临时脚本不提交，放进证据 gist）：
   - **fixture 隔离**：`--check` 会写入核对报告，`--confirm` 成功时会写 baseline 并把运行标为 `reconciled`，同一份数据库上连续采样会让后续样本走不同路径。所以：
     - 按测试文件已有的 fixture 构造方式，各准备一份固定的基准状态：`--check` 与 `--confirm` 分别采用 :376–398 用例中对应分支调用 CLI 之前的前置状态（gate 场景同理取 :466–491 的前置状态）；每份基准写明预期的 stdout 判定与退出码；
     - **每次采样**都从对应基准复制出独立的临时目录（快照目录 + 目标库），复制不计时，采样后删除；不在同一副本上连续采样；
     - 修复前、修复后两侧对照也各自从同一基准复制，不复用对方用过的副本；
     - 每次采样核对实际退出码与 stdout 判定等于预期，不等的样本单列，不混入耗时统计；
     - 只用 OS 临时目录下由测试 fixture 生成的账套，不触碰任何现有账套（真实旧账、4173 账套、`.bak` 等一律不读）。
   - 分段测量，每段重复 N ≥ 30 次。每次运行都通过 `spawnSync` 发起（与测试相同），记录墙钟耗时、`status`、`signal`、`result.error?.code`：
     - (a) `node -e ""`：进程启动基线；
     - (b) `node scripts/storage-admin.mjs --help`：解析参数，不导入业务模块；
     - (c) 只导入 CLI 在 `legacy-reconcile` 路径上导入的模块，然后退出；
     - (d) 完整的 `legacy-reconcile --check` 与 `--confirm`（各用自己的基准副本）；
     - (e) :317 的租约子进程。
   - 每组给出 p50 / p95 / p99 / max，以及超过 3000 ms 的次数。
   - **失败分类**：只有 `error.code === "ETIMEDOUT"` 的样本记为 `spawnSync` 超时；其余失败中，`signal` 非空的才记为“被信号终止”，并记录 signal；剩下的非 `ETIMEDOUT` 失败（如 `signal=null` 且 `error.code=ENOENT`，或没有 `error`）单列为“其他执行 / 启动失败或未知”，记录 `error.code`（没有则记为空）。只是墙钟超过 3000 ms 而没有 `ETIMEDOUT` 的，不计为已证实的超时。超时、信号终止、其他 / 未知三类分开统计。
   - 测量时 `spawnSync` 的 `timeout` 取测试的 3000 ms，另用一组不设 `timeout` 的采样得到无截断的耗时分布；两组分开报告。
   - **两组条件**：
     - 空载：开跑前连续两次确认外部 node / 浏览器进程为 0（D118 口径），运行中每 10 s 采样 CPU；
     - 受控并行负载：负载形式和强度预先写进 PR 描述，不中途调整。建议用 `availableParallelism()` 个 node 进程各跑 CPU 密集循环，再加一组“同时跑 PR 层快速套件的其他测试文件”。两组都记录 CPU 采样。
   - 再在两组条件下各完整跑本文件 K 次（K 预先写明，建议 10），记录通过 / 失败、失败用例，以及每个失败用例的 `status` / `signal` / `error.code` / 耗时（为此可在临时副本中打印 `result`，不提交）。失败也保存，不重跑到通过为止。
2. **找出原因**，按[路线图 §4](../roadmap.md#4-ci-与测试策略设计角色牵头) 区分观察 / 推断 / 归因，回答两个问题：
   - 3 s 预算对这条路径是否太紧：空载与负载下 (d) 的分布相对 3000 ms 的位置；
   - 启动路径上有没有可以消除的开销：(c) 占 (d) 的比例；导入了哪些与 `legacy-reconcile` 无关的模块（用 `--cpu-prof` 或模块加载计时取证）；`.ts` 去类型的耗时。
   - 只有在受控负载下复现超时，并且分段数据能说明机制，才能写“归因”；否则写“未知”，附全部数据。
3. **修复**（只在第 2 步得出归因后做；否则只交调查报告，修复另行立项）：
   - 按 D11，**不能只加长超时，也不能加重试；不能跳过用例（`skip` / `todo` / 条件跳过），也不能按平台禁用用例**。为有数据支持的局部预算做调整，不等于可以放宽其他门禁。
   - 优先消除启动路径上可以消除的开销：例如 `legacy-reconcile` 只导入它用到的模块。CLI 的参数、输出、退出码逐字不变（运维可见变化为 0；如有变化，按[路线图 §5](../roadmap.md#5-团队流程)附旧值 → 新值对照）。
   - 如果消除开销后仍需调整预算，新值必须由测量数据推出：PR 写明依据的分布、条件和余量，例如“受控负载下 (d) 的 p99 × 余量系数”。由评审核对数据与新值的推导，不接受“改成 10 s 试试”。
   - 不删除 CLI 用例，不把 CLI 断言搬到进程内替代（那会不再覆盖真实退出码与 stdout）。如果认为某个用例应改层，先报告设计角色。

## 验收标准

1. 测量数据完整：五段 × 两组条件的原始耗时、每次的 `status` / `signal` / `error.code`、按“超时 / 信号终止 / 其他执行或启动失败或未知”三类分开的失败统计、统计值、CPU 采样与负载描述都在 gist 中；fixture 基准的构造方式与预期结果写明；首尾记录精确 head 与空的 `status --porcelain --untracked-files=all`。
2. 原因结论只用“观察 / 推断 / 归因”三种表述；未归因时明确写“原因未知”，不按负载结案。
3. 若有修复：
   - 在同样的受控负载下，修复前后各跑本文件 K 次（两侧 fixture 都从同一基准新建）；修复后 0 次 `ETIMEDOUT`，也没有信号终止或其他执行 / 启动失败，且 (d) 的分布有可比较的改善，附前后对照表；
   - CLI 行为不变：现有 9 个用例原样通过，另以同一基准各自复制的副本比对修复前后 CLI 的 stdout、stderr 与退出码一致；
   - 超时值若改动，推导过程写在 PR 描述并能在 gist 数据中复算。
4. 现有测试与 E2E 不删除、不削弱、不跳过、不按平台禁用（D11）；不改 `vitest.config.ts` 的并行度与全局超时；无 `package.json` / lock 变化。
5. 合并后 main Full 12/12 测试步骤通过。
