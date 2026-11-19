# M0-R4 Windows 上 INVALID_SNAPSHOT 间歇失败

- 里程碑：M0 评审后续　依赖：M0-R　建议分支：`windows-invalid-snapshot`
- **阻塞 M1：否**（只影响本机 Windows 开发和只读旧账读取器；M2 导入前必须解决）

## 背景

`packages/infra/src/legacy/teaching.ts:120-155` 在头部、sidecar 或身份校验失败时报 `INVALID_SNAPSHOT`。在 Windows 本机上，相关测试（`legacy-teaching.test.ts:50,70,90-123`）偶尔失败；CI 只跑 Linux，从未失败。推测原因是 Windows 上文件句柄或 WAL sidecar 的时序竞争。

## 范围

1. 先复现：在 Windows 上循环跑相关测试（例如 50 次），记录失败率和失败时的具体校验点。
2. 按证据修复根因（例如等句柄释放后再读、读取前先 checkpoint、只读打开方式），**不能放宽校验**。
3. 如果确认是测试夹具的问题，只修夹具。

## 验收标准

- PR 描述写明复现方法、修复前失败率、根因证据。
- 修复后 Windows 循环 50 次 0 失败（贴出本机输出摘要）；Linux CI 绿。
- 校验条件没有被删除或放宽。

## 性能考虑

读取器只在导入时使用，不在热路径上；修复不应在每次读取时增加超过 50ms 的等待。
