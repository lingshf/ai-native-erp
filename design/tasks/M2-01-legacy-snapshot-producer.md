# M2-01 旧账一致快照生成（只读）

- 里程碑：M2　依赖：M0-R4　建议分支：`legacy-snapshot-producer`
- 冲突域：legacy-snapshot, admin-cli
- **前置门禁**：M0-R4（Windows `INVALID_SNAPSHOT`，只读读取器是导入入口）、M0-R5（目标库备份/恢复）必须已合并；未合并前本任务不得开工。
- **真实数据**：开发和 CI 只用虚构夹具。任何读取真实旧账（4173 原账套、ID3 草稿、旧 checkout）的操作都需要用户另行授权（见 D3）；本任务不需要真实数据。

## 背景

M0-15 退役了旧格式的快照创建命令，现在只保留“读取已存在、已验证的 M00 双账快照”的消费链（`scripts/legacy-snapshot-reader.mjs`、`scripts/legacy-snapshot-verifier.mjs`、`packages/infra/src/legacy/teaching.ts`）。M2 的最终切换要求“停写后重新取一对快照”（architecture.md M09），所以需要一个只读的快照生成命令，产出与现有 verifier 完全兼容的快照目录。

## 范围

- 在 storage admin CLI 中加 `legacy-snapshot` 子命令：显式 `--source-dir`（旧账套目录）和 `--out-dir`（必须不存在），不使用默认值，不读 `.env`。
- 只用只读连接（`readonly` + `query_only`）打开教学库和 Enterprise 库，用 SQLite 在线备份 API 各复制一份；源文件字节不变。
- 生成 manifest：格式、字节/逻辑摘要算法与现有 verifier 一致（复用 verifier 的摘要函数，不复制算法）。生成后立即用现有 verifier 校验，失败则删除输出目录并非零退出。
- 两库分别一致，**不保证跨库同一时刻**；文档和输出都要写明：真实切换必须先停写再取快照。
- 输出不含源绝对路径之外的敏感信息；manifest 和快照不进 Git。

## 不做

- 不写旧账，不迁移，不改旧快照格式或放宽 verifier 检查。
- 不支持“活动账套目录直接导入”，导入只消费快照（M2-03）。

## 涉及文件

`scripts/storage-admin.mjs`（或其 TS 源）、`scripts/legacy-snapshot-verifier.mjs`（只导出摘要函数）、新增 `packages/infra/test/legacy-snapshot-producer.test.ts`。

## 验收标准

1. 用已提交的虚构夹具（含 WAL 中已提交数据、ID3 草稿、关闭月）生成快照，现有 verifier 和读取器 CLI 都能读出与源相同的试算和总账；冻结的 `posted-snapshot` 夹具摘要算法一致。
2. 源目录生成前后的全部文件 SHA-256 不变（包括 `-wal`/`-shm` 是否存在）。
3. `--out-dir` 已存在、源缺文件、源是 4173 运行目录标记、源有写锁（写事务进行中）时：明确失败、非零退出、不留半成品。
4. Windows 与 Linux 都通过（依赖 M0-R4 的修复）。

## 性能考虑

在线备份按页分步（每步 ≤ 1000 页），CLI 离线运行，不在 API 进程内。Bench 记录 100 万 GL 行快照耗时（目标 ≤ 60s），PR CI 只跑小夹具。
