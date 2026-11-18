# M0-03 删除 PostgreSQL；SQLite WAL 与连接设置

- 里程碑：M0　依赖：M0-01（可与 M0-02 并行，冲突只在 lock 文件，后合并者重新生成）　建议分支：`remove-postgres-sqlite-wal`

## 目标

仓库只剩 SQLite 实现；SQLite 连接按[架构 §3](../m0-architecture.md#3-存储)统一设置。

## 范围

- 删除 `packages/infrastructure/src/storage/postgres.ts`、`schema.ts` 中的 PG 分支、`migrations` 中的 PG 部分、`test/databases/` 下 PG 测试、`storage-admin` CLI 的 `--provider postgres`/TLS/CA 相关选项与测试、`.env.example` 中的 PG 变量。
- 删除依赖 `pg`、`@types/pg`；`verify:databases` 脚本删除（或改为 SQLite 存储契约测试的别名，二选一，README 同步）。
- `storage-admin` CLI：参考暂停现场 `packages/infrastructure/test/storage-admin-cli.test.mjs` 的 SQLite-only 版本精简测试；`--provider` 参数可删除或只接受 `sqlite`。
- SQLite 打开读写连接时设置 `journal_mode=WAL`、`synchronous=NORMAL`、`foreign_keys=ON`、`busy_timeout=5000`。只读旧账读取器不改为 WAL（不得修改旧账文件）。
- 为双库存在的抽象（如 dialect 分支）若只剩一个实现，删掉多余分支，不保留“将来可能用”的接口。

不包含：application 层仓储端口本身——保留。

## 涉及文件

`packages/infrastructure/**`、`packages/application/src/storage.ts`（仅删 PG 专属类型，如有）、`scripts/storage-admin.mjs`、`package.json`、`.env.example`、`README.md`（PG 段落）、`package-lock.json`。

## 验收标准

- `packages`、`apps`、`scripts` 的运行代码和配置中不再引用 `pg`/PostgreSQL（历史文档除外）。
- 新增测试：新开库后 `PRAGMA journal_mode` 返回 `wal`，`foreign_keys` 为 1；只读旧账读取器打开后旧文件字节不变（已有测试覆盖则不重复）。
- 迁移指纹测试仍保证“陌生库/篡改结构拒绝且不改字节”。
- CI 绿，CI 时长不增加。

## 性能考虑

WAL 让读不阻塞写。记录 1 万次单行插入事务（默认 vs WAL+NORMAL）的总耗时，写入 PR 描述，作为后续基准参照，不设门槛。

## 测试要求

只为新行为（PRAGMA）加测试；删除 PG 测试，不保留跳过的空壳。
