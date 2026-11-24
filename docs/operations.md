# 运维与故障排查

本页是**启动配置、备份恢复、锁与常见错误**的唯一说明。安装步骤见 [README“安装与启动”](../README.md#安装与启动)，迁移命令与迁移错误码见 [迁移操作手册](migration-runbook.md)，CI 见 [ci.md](ci.md)。以下事实按 `packages/infra/src/main.ts`、`packages/infra/src/index.ts`、`packages/infra/src/http/README.md` 与 `scripts/storage-admin-main.mjs` 整理，命令在临时虚构库上试跑过。

## 启动与环境变量

`npm run start:local` 不读取 `.env`，只认当前进程的环境变量（示例见 [`.env.example`](../.env.example)）。

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `ERP_SQLITE_FILE` | 未设置 | 目标库的绝对路径。未设置时只启动“未配置壳” |
| `ERP_PROFILE` / `ERP_HOST` / `ERP_PORT` | `local` / `127.0.0.1` / `4180` | 只允许 IPv4/IPv6 回环地址；端口 0 与保留的 4173 被拒绝 |
| `ERP_SQLITE_READERS` | 内置默认 | 只读连接数，取 2–32 的整数，否则启动失败 |
| `AI_PROVIDER` / `AI_MODEL` / `AI_TIMEOUT_MS` | `copilot` / 空 / `30000` | AI 助手；`AI_MODEL` 为空或 `auto`、超时不在 1–300000 毫秒时不启用助手，应用其余功能照常 |

启动只校验目标库已是最新 schema，**不自动迁移、不自动建库**；旧库先用 `storage:admin -- migrate` 升级。判断是否起来了：`GET /api/v1/health` 返回 `data:configured`（已连目标库）或 `data:unconfigured`（未配置壳）。

## 启动失败与异常现象

日志只含请求 ID 和固定分类，不含路径、SQL 或堆栈。

| 现象 | 常见原因 | 处理 |
| --- | --- | --- |
| 进程退出，`errorType: RuntimeConfigurationError` | `ERP_PORT` 为 4173 或 0、主机不是回环、`ERP_SQLITE_READERS` 不合规 | 改环境变量后重启 |
| 退出，`errorType: AddressInUse` | 端口被占用（端口冲突为致命错误） | 换 `ERP_PORT`，或停掉占用进程 |
| 退出，`errorType: StartupError` | 目标库不存在、schema 过旧或不匹配、被维护锁占用 | 先 `verify` 查看；过旧用 `migrate`；见下文“锁” |
| 页面可开但财务请求返回 503，health 为 `data:unconfigured` | 没设置 `ERP_SQLITE_FILE` | 设置绝对路径后重启 |
| 打开网页返回 503 | Web 尚未构建 | 根目录运行 `npm run build`（或 `npm run verify`） |
| 只开放“迁移核对”，业务页不可用 | 目标是未确认或失败的导入库 | 见 [迁移操作手册](migration-runbook.md)；不要把导入库当活动账套 |
| 命令返回 `BUSY` | 库被其他进程占用 | 停掉其他工具后重试（维护锁获取最多重试 50 次） |
| 命令返回 `SCHEMA_MISMATCH` | 文件不存在、不是本系统库或 schema 不是最新 | `verify` 确认；确属旧库再 `migrate` |
| 命令返回 `STORAGE_FAILURE` | 通用失败，如备份输出已存在、路径无效 | 核对两个路径；输出须是不存在的新文件 |

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

维护锁是库旁的 `<库文件>.maintenance-lock`。持锁时服务启动会失败。

- 异常终止遗留的锁：先确认没有维护进程在运行并调查原因，再由操作员处理；**不能直接删锁强启服务**。
- 恢复的回滚也失败时，锁会继续保留，错误信息给出已验证 `.bak` 的路径：先人工恢复并验证该 `.bak`，再处理锁。
- 不要把原账、快照或 `.bak` 选作目标库。

## 开发与 CI

本地验证用 `npm run verify`；CI 分层、复现命令与失败排查见 [ci.md](ci.md)。
