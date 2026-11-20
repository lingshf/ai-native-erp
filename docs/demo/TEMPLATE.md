# Demo 模板

复制到 `docs/demo/vX.Y.Z/README.md` 使用，并按 [发布流程](../release/README.md)执行。

## 硬性要求

1. **每条命令在评审前已在 PowerShell 中实跑**。脚本旁或 `run-through.md` 记录：commit SHA、命令、实际输出摘要、退出码；有界面的步骤附截图路径。
2. **不出现 `<…>` 占位符**（PowerShell 会把 `<` 当作重定向）。路径与参数用先赋值的变量或写实际值，命令可直接复制运行。
3. **一次性数据集与独立端口**：账套放在 `erp-demo-<guid>` 临时目录（GUID 实际生成），端口取不同于 4173 及此前 Demo 的值（v0.1.0 4190、v0.2.0 4191、v0.3.0 4193）；不使用用户数据、真实旧账、`.bak`、用户主检出。
4. 复用端口前先停掉上一个演示服务。演练后停服务，只删除本次生成的目录。
5. 未实跑的分支（例如夹具无法覆盖的用法）写明“仅对照代码，未实跑”，不得写成已通过；预期结果与实测结果分开标注。

## 脚本骨架

```powershell
$demo = Join-Path ([IO.Path]::GetTempPath()) ("erp-demo-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $demo | Out-Null
$env:ERP_SQLITE_FILE = Join-Path $demo "demo.sqlite"
$env:ERP_PORT = "4195"
$env:ERP_HOST = "127.0.0.1"
$env:ERP_PROFILE = "local"
```

（端口 4195 仅为示例，按本版实际选用并写入脚本；其余命令以本版 README 为准，保持实际值。）

## 演练记录模板（`run-through.md`）

| 项 | 内容 |
| --- | --- |
| 对象 | tag / commit SHA |
| 环境 | 临时账套、端口、浏览器 |
| 命令 | 实际执行的命令（可复制） |
| 输出摘要 | 退出码与关键输出 |
| 截图 | 路径 |
| 未实跑 | 列出并说明原因 |
| 已知控制台错误 | 逐条归因（请求路径、状态、日志类型），预期与非预期分开 |
