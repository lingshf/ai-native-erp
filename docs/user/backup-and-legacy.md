# 备份与旧账工具

这些都是**命令行**能力，v0.1.0 没有对应界面。

## 备份与恢复（M0-R5）

```powershell
npm run storage:admin -- backup <db> <out>
npm run storage:admin -- restore <db> <in>   # 先停止服务
```

备份使用 SQLite 在线备份并校验；输出已存在、与目标同名或为保留路径时拒绝。恢复需离线，替换前自动生成带时间戳的完整 `.bak`，失败则校验回滚。不要手动删除 WAL/SHM/journal 文件。

## 旧账快照（M2-01）

```powershell
npm run storage:admin -- legacy-snapshot --source-dir <已停写的隔离源目录> --out-dir <不存在的新目录>
```

仅 Windows；两个路径必填，无默认值；源目录须已停止并隔离（独占句柄，冲突则 `SOURCE_BUSY`），残留 `-journal` 则拒绝。**对真实旧账的操作须另行取得授权**，开发和 CI 只用虚构夹具。生成的快照与备份不得提交到 Git。详见 [legacy-snapshot.md](../legacy-snapshot.md)。

## 导入映射与 dry-run（M2-02）

仅有库代码与测试，**没有命令行或界面入口**；不打开或写入任何目标库。决定 C（草稿、回执、来源事件、队列、封印、审计的处理）无默认值。因此用户在 v0.1.0 中无法执行旧账导入；导入执行（M2-03）尚未合并。

## 只读旧账报表

导航“只读报表 → 试算平衡表”及 `/api/v1/legacy/*` 读取已验证的旧快照。Unreleased 已将上下文接口有效 503 的展示改为中性“未配置或暂不可用”状态，不影响当前账套；可显式重新加载快照。网络、无效响应与实际报表读取失败仍显示错误。运行状态页只请求 health。当前账套的报表请用“总账报表”。
