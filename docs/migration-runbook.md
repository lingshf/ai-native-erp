# 迁移操作手册（M2-05a 演练版）

本手册把旧账迁移的每一步写成可照做的命令，供 M2-05（正式演练）和 M2-06（切换）使用。**本手册中的命令目前只在虚构夹具上验证过**（D417）：对真实旧账执行任何一步，都须先取得用户对该步的书面授权（见“授权门槛”）。命令输出均为单行 JSON；退出码 0 表示成功，1 表示拒绝、失败或核对未通过。

每条命令都有对应的自动化证据（`packages/infra/test/legacy-rehearsal.test.ts` 用子进程逐步执行同样的参数），见文末“命令与测试对照”。

## 0. 不可违反的规则

- **不要对正在运行的 4173 目录或旧 checkout 做任何操作**：不复制、不打开、不放快照或目标库。快照只从已停写、已隔离的源目录生成。
- **不要用默认启动方式打开目标库**：不把目标库路径交给 `npm start`、`ERP_SQLITE_FILE` 或任何会初始化/迁移/写种子数据的命令，直到核对达到 `reconciled` 且用户批准切换（M2-06）。只读查看报告见第 6 步。
- 每一步都写**显式路径**，没有默认值；输出路径必须不存在。
- 快照、目标库、备份、确认文件和明细文件都是**私有证据**，不得提交到 Git、不得贴到 Issue/PR。存放位置见第 8 节。
- 不手动删除 `-wal`、`-shm`、`-journal` 或 `.maintenance-lock`；遇到时按第 7 节处理。

## 授权门槛

决定定义见 [design/tasks/README.md 的 M2 一节](../design/tasks/README.md#m2账套迁移切换草案需用户授权)：A = 对真实旧账私有副本取快照并隔离演练；B = 真实停写与切换；C = 六项导入范围选项。

| 步骤 | 对真实旧账执行前需要的用户决定 |
| --- | --- |
| 2 快照 | A |
| 3 dry-run（不带选项，列出六项与数量） | A；此时 C 可以尚未决定 |
| 3 dry-run（带齐选项）与 4 导入 | A + C（六项逐项确认）；期初明细文件由用户提供（D25） |
| 5 确认核对 | A；确认文件由用户逐项核实已知差异后自己写出 |
| 6 备份与校验 | A |
| M2-06 停写与切换 | B；核对通过 ≠ 批准切换 |

## 1. 前置检查

1. 确认 4173 服务与旧 checkout 都不在本次操作的任何路径下。
2. 准备一个空的私有工作目录 `<WORK>`，磁盘空余至少为旧账大小的 4 倍（快照、目标库、WAL、备份）。
3. `npm run storage:admin -- --help` 能输出用法，且其中包含 `legacy-import --dry-run`。

## 2. 生成快照（仅 Windows）

```powershell
npm run storage:admin -- legacy-snapshot --source-dir <已停写的隔离源目录> --out-dir <WORK>\snapshot
```

期望：退出码 0，输出 `{"status":"ok","action":"legacy-snapshot"}`；`<WORK>\snapshot\manifest.json` 记录 `status: "verified"` 与两本账的 SHA-256。源目录被其他进程打开时以 `SOURCE_BUSY` 拒绝；复制期间源有变化时以 `SOURCE_CHANGED` 失败，此时停写未生效，须停止并重新快照（见第 7 节）。非 Windows 平台报 `UNSUPPORTED_PLATFORM`。耗时预算 100 万 GL 行 ≤ 60s，由 Windows 每晚工作流 `scripts/bench-legacy-snapshot.mjs` 记录。

## 3. dry-run（不写任何目标）

先不带选项，列出六项决定 C 及其影响条数：

```powershell
npm run storage:admin -- legacy-import --snapshot-dir <WORK>\snapshot --dry-run
```

期望：退出码 0，输出 `{"dryRun":true,"snapshotSha256":{...},"choices":[{"option":"drafts","allowed":["import-as-draft","skip"],"affected":1,"selected":null}, ...]}`。

用户对六项逐项作出决定后，带齐选项再跑一次：

```powershell
npm run storage:admin -- legacy-import --snapshot-dir <WORK>\snapshot --dry-run --drafts import-as-draft --receipts archive-only --source-events archive-only --transfer-queue archive-only --seals archive-only --audit archive-only
```

期望：退出码 0，输出增加 `executable`、`counts`（逐对象的 source/mapped/unmappable/archive-only/skipped 条数）、`drafts` 与 `reasons`（不可映射原因计数）。`executable` 必须为 `true` 才能进入下一步。示例选项只是虚构演示，不是授权。

dry-run 不接受 `--target` 或 `--opening-items`，也不接受只给部分选项（`INVALID_INPUT`）。

## 4. 导入到全新目标

```powershell
npm run storage:admin -- legacy-import --snapshot-dir <WORK>\snapshot --target <WORK>\target.sqlite --drafts import-as-draft --receipts archive-only --source-events archive-only --transfer-queue archive-only --seals archive-only --audit archive-only --opening-items <WORK>\opening-items.json
```

期望：退出码 0，输出 `{"runId":"...","status":"imported","batches":N}`。

**期初未结项声明规则**（AP/AR，D25 / D30）：只要导入范围含 AP/AR 控制科目，就必须提供 `--opening-items` 文件；每个控制科目恰有一条声明：

- 有未结项的科目写 `"declaration":"detail"` 并列出明细，合计必须等于切换日 LEGACY GL 余额；
- 没有未结项的科目写 `"declaration":"empty"`，不能省略，也不会从净额为 0 推断。

文件格式见 [备份与旧账工具](user/backup-and-legacy.md) 的“期初未结项”一节。合计不符（口径 2）等阻断在任何写入之前报 `INVALID_INPUT`，不会建库；修正文件后重跑同一命令。

中断（`importing`）时，用同一快照、同一选项和同一明细文件重跑原命令即可续跑。

## 5. 核对与确认

导入报告保存在目标库中。确认前先只读核对：

```powershell
npm run storage:admin -- legacy-reconcile --snapshot-dir <WORK>\snapshot --target <WORK>\target.sqlite --check
```

期望：存在已知差异时退出码 1，`verdict` 为 `pending`，`knownDifferences` 列出完整清单，`knownDifferencesSha256` 为清单散列；目标文件字节不变，run 仍为 `imported`。用户逐项核实后自行写确认文件（散列复制自本次报告，不能用示例值）：

```json
{"knownDifferencesSha256":"<本次报告中的 SHA-256>"}
```

```powershell
npm run storage:admin -- legacy-reconcile --snapshot-dir <WORK>\snapshot --target <WORK>\target.sqlite --confirm <WORK>\confirmation.json
```

期望：退出码 0，`verdict` 为 `pass`，run 变为 `reconciled`。之后再跑一次 `--check` 应退出码 0、`verdict: "pass"`，`trade-reconciliation` 段每个控制科目的 `tradeDifferenceMinor` 与 `otherSourceMinor` 都是 `"0"`。

## 6. 备份并校验目标库

备份命令及其规则见[运维与故障排查](operations.md#备份与恢复)；备份后校验：

```powershell
npm run storage:admin -- verify --provider sqlite --file <WORK>\target-backup.sqlite
```

期望：备份与校验都退出码 0；备份输出路径须不存在。在 M2-06 授权之前，查看核对结果只用 `--check` 输出，不要把目标库配置给服务启动。

## 7. 错误码速查

| 错误码 | 现象 | 原因 | 处理 |
| --- | --- | --- | --- |
| `INVALID_INPUT` | 参数被拒、或导入前列出口径 1–5 | 缺/多选项、dry-run 带了 `--target`、明细文件缺失/不可读/合计不符；快照时源文件是符号链接或非常规文件、输出目录已存在 | 按消息修正参数或明细文件后重跑；目标未创建；快照输出须为新路径 |
| `UNSUPPORTED_PLATFORM` | 快照立即失败 | `legacy-snapshot` 只在 Windows 上运行（源文件由 Windows 文件锁代理独占打开） | 在旧账所在的 Windows 机器上执行；不要在其他平台直接复制旧账文件代替快照 |
| `SOURCE_BUSY` | 快照失败 | 源目录仍被进程打开，或无法取得独占访问 | 确认旧服务已停写并隔离后重试 |
| `SOURCE_CHANGED` | 快照失败，输出目录已被删除 | 复制或校验期间源文件的大小、时间或 SHA 发生变化，即仍有进程在写旧账 | **不是普通的忙**：说明停写没有生效。停止演练，找出写入方并确认停写，再从头重新生成快照；不得重试后继续使用这次或任何部分快照 |
| `ROLLBACK_JOURNAL` | 快照失败 | 源目录存在 `-journal` 回滚日志，旧账有未完成事务 | 让旧系统正常启动并关闭以完成恢复，确认停写后再快照；不要删除日志文件 |
| `SNAPSHOT_FAILED` | 快照失败，输出目录已被删除 | 私有副本的 WAL 检查点或备份失败，或其他未分类错误 | 保留源目录不动，记录输出后上报；不要使用残留文件 |
| `INVALID_SNAPSHOT` | 快照被拒 | manifest 与文件 SHA 不符、快照被改动 | 重新生成快照；不要手改快照 |
| `CONFLICT` | 导入或确认被拒 | 目标已存在且不是可续跑的同一 run；明细文件字节变了；确认散列不匹配；确认后 `write_seq` 变化 | 换新目标路径从快照重导；确认文件须复制本次散列 |
| `SCHEMA_MISMATCH` / `TARGET_SCHEMA_UNSUPPORTED` | 目标被拒 | 目标库结构不是当前迁移版本 | 从同一快照导入新目标 |
| `BUSY` | 命令被拒 | 维护锁被占用 | 确认没有其他维护进程；遗留锁须人工调查，不得删锁强启 |
| `NOT_FOUND` | 校验或核对失败 | 路径不存在 | 检查显式路径 |
| `STORAGE_FAILURE` | 其他失败 | 磁盘、权限或未分类错误 | 保留现场与 WAL/SHM，记录输出后上报 |
| （退出码 1，无 `error`） | `--check`/`--confirm` 输出 `verdict` ≠ `pass` | `difference` / `blocked` / `pending` | 见下面的回滚条件 |

## 8. 回滚条件与证据存放

出现以下任一情况，**作废当前目标库**（保留供排查，不再使用），修正原因后从同一快照导入新目标：

- 导入以 `failed` 结束，或核对 `verdict` 为 `difference`；
- 核对 `blocked`（例如缺 `opening=done`）；
- 确认后 `write_seq` 变化导致复查拒绝；
- 期初明细需要调整（期初项不能开贷项或取消，只能重导）。

旧账源与快照始终只读，回滚不涉及它们。

私有证据（快照、目标库、备份、明细文件、确认文件、各步 JSON 输出）存放在用户授权决定 A 时指定的私有目录，不放在仓库工作区、不提交 Git、不上传到 CI 工件。

## 9. 耗时预算与 Bench

| 步骤 | 预算 | 记录位置 |
| --- | --- | --- |
| 快照 100 万 GL 行 | ≤ 60s | Windows 每晚工作流 `scripts/bench-legacy-snapshot.mjs` |
| dry-run | ≤ 120s，峰值 RSS ≤ 512 MiB | Bench 工作流 `migration-rehearsal` 作业 |
| 导入（100 万 GL 行 + 10 万期初未结项） | ≤ 10min；峰值 RSS ≤ 512 MiB（KG 已于 M2-05b 关闭，见下） | 同上；期初验证、期初写入、期初复核、最终提交各自耗时仅记录（D437） |
| 确认核对 | ≤ 120s | 同上（RSS 仅记录） |
| 备份 + 校验 | 仅记录 | 同上 |

Bench 作业运行 `node scripts/bench-migration-rehearsal.mjs`，结果写入工件 `artifacts/ci/migration-rehearsal.json`，每项指标标明 `hard`（超出则作业失败）、`record-only` 或 `known-gap`（报告预算与是否超出，但不使作业失败）。备份期间热读 p95 由 M0-R5 自己的 Bench 覆盖。

**已知缺口 KG：已于 M2-05b 关闭（D434）**。M2-05a 时导入峰值 RSS 在 10 万条期初时为 566–721 MiB，超出 512 MiB，原因是期初计划（10 万个未结项）在整个导入期间常驻内存。M2-05b 把校验通过的期初项暂存在临时计划库中，在仍为单一写事务的期初阶段内每批读出 1000 项写入目标库。Bench 实测导入峰值 RSS 为 427 MiB（100 万 GL 行 + 10 万期初，Linux CI）。导入峰值 RSS 已恢复为 `hard` 判定，脚本的 `KNOWN_GAPS` 现为空。

## 10. 新建或升级目标库（schema 迁移）

服务启动不会自动建库或迁移（见[运维与故障排查](operations.md#启动与环境变量)），须先显式执行；这是启动前的标准步骤，对全新库和旧版本库相同：

```powershell
npm run storage:admin -- migrate --provider sqlite --file <新文件>.sqlite
npm run storage:admin -- verify --provider sqlite --file <新文件>.sqlite
```

期望：`migrate` 输出 `{"status":"ok","action":"migrate","provider":"sqlite"}` 且退出码 0；父目录须已存在；当前最新 schema 为 020，已发布迁移与 checksum 不变。`verify` 对文件不存在、非本系统库或 schema 不是最新的库以 `SCHEMA_MISMATCH` 退出 1。然后把 `ERP_SQLITE_FILE` 设为该文件的绝对路径再启动服务。不要把原账、快照或 `.bak` 选作目标库。

## 命令与测试对照

| 手册步骤 | 自动化证据 |
| --- | --- |
| 2 快照（Windows 真实 `legacy-snapshot`） | `legacy-rehearsal.test.ts` J5 用例（Windows 工作流） |
| 3 dry-run 不带选项 / 带齐选项 / 拒绝部分选项与 `--target` | `storage-admin-cli.test.ts` 末尾 J1 用例；`legacy-rehearsal.test.ts` `rehearse` |
| 4 导入缺决定 C 选项被拒 | `storage-admin-cli.test.ts` 用例 “legacy-import CLI requires six explicit decisions, imports only a new target…” |
| 4 缺可读期初文件被拒 | `storage-admin-cli.test.ts` 用例 “legacy-import CLI requires a readable opening-items file when AP/AR controls are in scope” |
| 4 期初合计不符（口径 2）不建库 | `legacy-rehearsal.test.ts` J4a |
| 5 确认前 `--check` 只读、非通过 | `legacy-rehearsal.test.ts` J4b |
| 5 确认、复核通过、贸易子账平衡 | `legacy-rehearsal.test.ts` `rehearse` |
| 6 备份与校验 | `legacy-rehearsal.test.ts` `rehearse` |
| 9 预算 | `scripts/bench-migration-rehearsal.mjs` |
