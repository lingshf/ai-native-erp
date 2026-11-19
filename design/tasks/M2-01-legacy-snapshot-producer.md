# M2-01 旧账快照与旧账备份生成

- 里程碑：M2　依赖：M0-R4、M0-R5　建议分支：`legacy-snapshot-producer`
- 冲突域：legacy-snapshot, admin-cli
- **开工门禁**：M0-R4、M0-R5 都已合并（M2-01、M2-02 显式依赖两者，其余 M2 任务经依赖传递继承）。
- **数据**：开发、CI 和 Bench 只用虚构夹具。对真实旧账（4173 原账套、ID3 草稿、旧 checkout）的任何操作都需要 README“待用户决定”中对应的授权，本任务的开发与验收不需要真实数据。

## 背景

M0-15 退役了旧格式的快照创建命令，现在只保留“读取已存在、已验证的 M00 双账快照”的消费链（`scripts/legacy-snapshot-reader.mjs`、`scripts/legacy-snapshot-verifier.mjs`、`packages/infra/src/legacy/teaching.ts`）。M2 演练和最终切换都需要从旧账目录生成快照，同时保留一份含 WAL 已提交数据的旧账备份。

## 源边界（必须可验证）

- 对 WAL 源，`readonly`/`query_only` 连接仍可能创建或改写 `-shm`，也不能阻止读到某个 WAL 读快照，所以**本工具从不用 SQLite 打开源目录**，只做字节读取。
- **停服与写入隔离是前置门禁，哈希比较不能代替**（活动进程可能只是暂时空闲）。工具在复制前取得独占证据，并一直持有到复制和比较结束：
  - 以不共享方式（Windows 共享模式为 none）打开两库主文件及现有 `-wal`/`-shm`；任何其他进程（例如仍在运行的 4173）持有句柄都会打开失败 → 拒绝，非零退出。
  - 当前平台不能提供这种独占打开时，工具拒绝处理（`UNSUPPORTED_PLATFORM`）。真实操作在用户的 Windows 本机进行。
- **未处理的 rollback journal**：源中存在 `-journal`（异常停机遗留的热 journal，包含恢复所需的原页）时一律拒绝，不产出备份或快照。处理方式写进操作手册：由用户用旧 checkout 正常启动再停止一次旧应用完成恢复后，重新执行。本工具不自行回滚、不删除 journal。
- 持有独占句柄期间：
  1. 记录主文件及 `-wal`/`-shm` 的存在性、大小、mtime、SHA-256；
  2. 把主文件和 `-wal`（如有）按字节复制到私有暂存目录（`-shm` 不复制）；
  3. 再次记录并与第 1 步逐项比较，作为附加检查（不作为停服证据）；不同则删除暂存和输出，非零退出。
- 成功和失败路径都必须保持源的字节、sidecar 存在性和 mtime 不变（失败路径同样有测试）。
- 用法区分：
  - **禁止**对正在运行的 4173 目录操作：独占打开会失败，工具没有绕过参数。
  - 演练（决定 A）：对用户提供的、已隔离的私有副本操作。
  - 最终切换（决定 B）：用户停止 4173 后对原目录操作，独占检查通过才继续。

## 范围

- storage admin CLI 加 `legacy-snapshot` 子命令：显式 `--source-dir`、`--out-dir`（必须不存在），不使用默认值，不读 `.env`。
- **旧账备份**：第 2 步的字节副本（主文件 + `-wal`）原样保存到 `--out-dir/backup/`，私有 manifest 记录每个文件的大小和 SHA-256。验证方式：把备份再复制一份到临时目录，打开后跑 `integrity_check`，其逻辑摘要（复用 verifier 的摘要函数）必须等于快照的逻辑摘要——这就证明 WAL 中已提交的数据也在备份里。M0-R5 是新目标库的备份工具，不用于旧源目录。
- **快照**：在暂存副本上（不是源上）checkpoint(TRUNCATE) 并改为非 WAL 模式，再用 SQLite 备份 API 写出快照；manifest 的格式与摘要算法与现有 verifier 一致（复用函数，不复制算法），写出后立即用现有 verifier 校验，失败则不留输出。
- 两库各自一致，不保证跨库同一时刻；真实切换必须先停写（决定 B）。快照、备份和 manifest 不进 Git。

## 不做

不写旧账；不改旧快照格式，不放宽 verifier；不导入（M2-03）。

## 涉及文件

`scripts/storage-admin.mjs`（或其 TS 源）、`scripts/legacy-snapshot-verifier.mjs`（只导出摘要函数）、新增 `packages/infra/test/legacy-snapshot-producer.test.ts`。

## 验收标准

1. 虚构夹具（WAL 中有已提交数据、ID3 草稿、关闭月）：生成的快照能被现有 verifier 和读取器 CLI 读取，试算和总账与源一致；备份按上述方式验证通过，且包含 WAL 中的已提交数据。
2. 成功和失败两种路径下，源的全部文件字节、sidecar 存在性和 mtime 都不变。
3. 其他进程持有源文件句柄（独占检查失败）、平台不支持独占打开、复制期间源被改动或 sidecar 增删：都失败，非零退出，不留输出。
4. 源中有稳定残留的 `-journal`：拒绝，不产出备份也不产出快照，journal 原样保留。
5. `--out-dir` 已存在、源缺文件：失败，不留半成品。
6. 独占门禁的验收分工（D10）：
   - **Windows 每晚/手动 job**：用真实文件句柄验收——另一进程持有源主文件或任一 sidecar 的句柄时必须拒绝，句柄释放后通过。不进 PR CI，以保持 PR CI ≤ 10 分钟预算。
   - **Linux PR / main Full**：只覆盖注入的独占检查函数（拒绝和通过两条分支），以及“非 Windows 平台真实使用直接拒绝（`UNSUPPORTED_PLATFORM`）”。
   - **Bench**：不承担此项。
7. 其余验收在 Linux CI 通过；Windows job 同时跑本任务全部测试（依赖 M0-R4）。

## 性能考虑

字节复制和在线备份都在 CLI 离线进行，不经过 API 进程。Bench：100 万 GL 行生成快照和备份 ≤ 60s。PR CI 只跑小夹具。
