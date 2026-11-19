# M2-01 旧账快照与旧账备份生成

- 里程碑：M2　依赖：M0-R4、M0-R5　建议分支：`legacy-snapshot-producer`
- 冲突域：legacy-snapshot, admin-cli
- **开工门禁**：M0-R4、M0-R5 都已合并（M2-01、M2-02 显式依赖两者，其余 M2 任务经依赖传递继承）。
- **数据**：开发、CI 和 Bench 只用虚构夹具。对真实旧账（4173 原账套、ID3 草稿、旧 checkout）的任何操作都需要 README“待用户决定”中对应的授权，本任务的开发与验收不需要真实数据。

## 背景

M0-15 退役了旧格式的快照创建命令，现在只保留“读取已存在、已验证的 M00 双账快照”的消费链（`scripts/legacy-snapshot-reader.mjs`、`scripts/legacy-snapshot-verifier.mjs`、`packages/infra/src/legacy/teaching.ts`）。M2 演练和最终切换都需要从旧账目录生成快照，同时保留一份含 WAL 已提交数据的旧账备份。

## 源边界（必须可验证）

- 对 WAL 源，`readonly`/`query_only` 连接仍可能创建或改写 `-shm`，也不能阻止读到某个 WAL 读快照，所以**本工具从不用 SQLite 打开源目录**。
- 工具只对源文件做字节读取：
  1. 记录源目录中两库主文件及 `-wal`/`-shm`/`-journal` 的存在性、大小、mtime、SHA-256；
  2. 把主文件和 `-wal`（如有）按字节复制到私有暂存目录；
  3. 再次记录第 1 步的全部信息，与第 1 步逐项比较。任何不同（含 sidecar 出现/消失、mtime 变化）都说明源不是静止的：删除暂存和输出，非零退出。
- 成功和失败路径都必须保持源的字节、sidecar 存在性和 mtime 不变（测试在失败路径同样检查）。
- 两种用法要区分：
  - **禁止**对正在运行的 4173 目录直接操作（不会静止，上面的检查会失败；工具不提供绕过参数）。
  - 演练（决定 A）：在用户授权后，对用户提供的私有副本目录操作。
  - 最终切换（决定 B）：用户停写并停止 4173 后，对原目录取最终快照。

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
3. 复制期间源被写入（测试中在第 1、3 步之间改动源或增删 sidecar）：失败，非零退出，不留输出。
4. `--out-dir` 已存在、源缺文件：失败，不留半成品。
5. Windows 与 Linux 都通过（依赖 M0-R4）。

## 性能考虑

字节复制和在线备份都在 CLI 离线进行，不经过 API 进程。Bench：100 万 GL 行生成快照和备份 ≤ 60s。PR CI 只跑小夹具。
