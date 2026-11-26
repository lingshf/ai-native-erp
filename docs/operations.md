# 运维与故障排查

本页是**启动配置、备份恢复、锁与常见错误**的唯一说明。安装步骤见 [README“安装与启动”](../README.md#安装与启动)，迁移命令与迁移错误码见 [迁移操作手册](migration-runbook.md)，CI 见 [ci.md](ci.md)。以下事实按 `packages/infra/src/main.ts`、`packages/infra/src/index.ts`、`packages/infra/src/http/README.md` 与 `scripts/storage-admin-main.mjs` 整理，命令在临时虚构库上试跑过。

## 启动与环境变量

`npm run start:local` 不读取 `.env`，只认当前进程的环境变量（示例见 [`.env.example`](../.env.example)）。

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `ERP_SQLITE_FILE` | 未设置 | 目标库的绝对路径。未设置时只启动“未配置壳” |
| `ERP_PROFILE` / `ERP_HOST` / `ERP_PORT` | `local` / `127.0.0.1` / `4180` | `ERP_PROFILE` 只能是 `local`；`ERP_HOST` 只能是字面量 `127.0.0.1` 或 `::1`；`ERP_PORT` 须为 1–65535 的纯数字，端口 0 与保留的 4173 被拒绝。违反即 `RuntimeConfigurationError` |
| `ERP_SQLITE_READERS` | 内置默认 | 仅在已设置 `ERP_SQLITE_FILE` 时校验：须为 2–32 的整数，否则启动失败 |
| `AI_PROVIDER` / `AI_MODEL` / `AI_TIMEOUT_MS` | `copilot` / 空 / `30000` | AI 助手，仅在已连接业务库时才会创建。`AI_MODEL` 为空或 `auto`、`AI_PROVIDER` 已设置且不是 `copilot`、`AI_TIMEOUT_MS` 不是 1–300000 的整数时，助手不启用，不报启动错误，其余功能照常 |

启动只校验目标库已是最新 schema，**不自动迁移、不自动建库**；新建或升级目标库的步骤见[迁移操作手册 §10](migration-runbook.md#10-新建或升级目标库schema-迁移)。

`GET /api/v1/health` 的 `data` 只表示业务账套是否已打开：`configured` = 已打开；`unconfigured` = 没有打开，**有两种原因**，须区分：(a) 没设置 `ERP_SQLITE_FILE`（未配置壳）；(b) 已设置，但目标库里有未达 `reconciled` 的旧账导入记录，此时只开放“迁移核对”，不打开业务账套（`main.ts` 仅在没有导入记录或已 `reconciled` 时创建业务服务）。health 本身分不出两者，看是否设置了 `ERP_SQLITE_FILE`，并用“迁移核对”页确认状态。

## 启动失败与异常现象

日志只含请求 ID 和固定分类，不含路径、SQL 或堆栈。

| 现象 | 常见原因 | 处理 |
| --- | --- | --- |
| 进程退出，`errorType: RuntimeConfigurationError` | `ERP_PORT` 为 4173 或 0、主机不是回环、`ERP_SQLITE_READERS` 不合规 | 改环境变量后重启 |
| 退出，`errorType: AddressInUse` | 端口被占用（端口冲突为致命错误） | 换 `ERP_PORT`，或停掉占用进程 |
| 退出，`errorType: StartupError` | 目标库不存在、schema 过旧或不匹配、被维护锁占用 | 先 `verify` 查看；过旧用 `migrate`；见下文“锁” |
| 页面可开但财务请求返回 503，health 为 `data:unconfigured` | (a) 没设置 `ERP_SQLITE_FILE`；或 (b) 已设置但目标是未 `reconciled` 的导入库 | (a) 设置绝对路径后重启；(b) 重设无效，按[迁移操作手册](migration-runbook.md)完成核对，或改用正常的新目标库 |
| 打开网页返回 503 | Web 尚未构建 | 根目录运行 `npm run build`（或 `npm run verify`） |
| 只开放“迁移核对”，业务页不可用 | 目标是未确认或失败的导入库 | 见 [迁移操作手册](migration-runbook.md)；不要把导入库当活动账套 |
| 命令返回 `BUSY` | 见下文“锁”：恢复遇到正在使用的库或已有锁时**立即**拒绝，不等待；启动和在线备份取得共享租约时才会短暂重试（约 50 次×10ms） | 恢复：先停服务和其他工具再重试；启动/备份：确认没有恢复在进行 |
| 命令返回 `SCHEMA_MISMATCH` | 文件不存在、不是本系统库或 schema 不是最新 | `verify` 确认；确属旧库再 `migrate` |
| 命令返回 `INVALID_INPUT` | 备份输出与目标库相同，或指向保留路径（如 `-wal`） | 换成不存在的新文件路径 |
| 命令返回 `STORAGE_FAILURE` | 其他通用失败，如备份输出已存在 | 核对两个路径；输出须是不存在的新文件 |

迁移相关错误码（`SOURCE_BUSY`、`INVALID_SNAPSHOT`、`CONFLICT` 等）见手册 §7，此处不重复。

## 备份与恢复

```powershell
npm run storage:admin -- backup <db> <out>
npm run storage:admin -- restore <db> <in>   # 必须先停止服务和其他数据库工具
```

- **备份**：两个路径都必须显式给出；输出须不存在，且不能与目标同名或位于保留路径（`-wal`、`-shm`、`-journal`、`.maintenance-lock`、`.users`）。使用 SQLite 在线备份并校验，服务运行中也可执行。**不要**直接复制运行中的库文件当备份。
- **恢复**：全程持有独占维护锁。替换前把原库完整 checkpoint 为带时间戳的 `.bak`（与原库同目录），成功后输出其路径；新库验证失败则自动还原并保留 `.bak`。损坏或迁移不匹配的输入在写入前拒绝；库仍被使用则拒绝。
- 替换前若残留 `-wal`/`-shm`，会拒绝。**不要手动删除 WAL/SHM/journal 文件。**

## 锁与恢复失败

维护锁是库旁的 `<库文件>.maintenance-lock`。持锁时服务启动会失败（进程退出并记录 `errorType: StartupError`，不会对外返回 `BUSY`）。两条路径行为不同（`packages/infra/src/storage/maintenance.ts`）：

- **服务启动、在线备份**取得“共享租约”：锁被占用时短暂重试约 50 次（每次 10 ms）后内部得到 `BUSY`；服务启动对外表现为 `StartupError`，`storage:admin backup` 则输出 `BUSY` 错误。
- **恢复**要独占：不重试；已有锁或存在仍在运行的使用者租约就立即 `BUSY`，不会等服务关闭。须先停服务。恢复时若发现使用者租约文件对应的进程已不存在，会自动清除该租约；库旁可能残留空的 `<库文件>.users/` 目录，属正常。

- 异常终止遗留的锁：先确认没有维护进程在运行并调查原因，再由操作员处理；**不能直接删锁强启服务**。
- 恢复的回滚也失败时，锁会继续保留，错误信息给出已验证 `.bak` 的路径：先人工恢复并验证该 `.bak`，再处理锁。
- 不要把原账、快照或 `.bak` 选作目标库。

## 开发与 CI

本地验证用 `npm run verify`；CI 分层、复现命令与失败排查见 [ci.md](ci.md)。
