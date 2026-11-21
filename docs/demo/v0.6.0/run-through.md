# v0.6.0 Demo 运行记录

## 运行对象与时段

- 产品代码：RC `4f27906`（PR #149 当时的 head，仅文档提交，产品基线 main `0f74db9`）。运行在本地分支 `s6-demo`，其脚本提交为 `a798f7f`；开跑前 `git status --porcelain` 为空。
- 独占时段（D207）：开跑前静默观察，连续 6 次 precheck 均为 0（22:23:22–22:24:14，日志 `$env:TEMP\s6-precheck.log`）。计数规则：命令行含 vitest/playwright 的 node/浏览器进程与所有 headless 浏览器。
- 端口 4198（未用 4173）；构建 `npm run build` 退出码 0，约 4 秒。

## 成功运行所用脚本的精确版本

| 脚本 | git blob SHA | 说明 |
|---|---|---|
| `scripts/capture.mjs` | `51a17354e5b35355fc690aeb33476694479d42ba` | 成功运行时工作区里带有“预览响应非 200 即抛错并显示响应体”的两行改动，该改动随后在 `5675c9e` 提交，之后内容未再变，blob 即为所用版本 |
| `scripts/migration-setup.mjs` | `bfdcef4c1c989e4b18a709ba54ecd37ff16f5487` | 来自 v0.5.0 的同名脚本，仅把注释中的版本号改为 v0.6.0 |
| `scripts/run-main.ps1`、`scripts/run-migration.ps1`（**实际运行版**） | `bb568754eb14a48b41ff40aee7c0d882cf961d9d`、`8351ef2091e3bb159c136089541defbc58c11da7` | 运行时存放在 `$env:TEMP`（`s6-run-main.ps1`、`s6-run-mig.ps1`），事后原样复制进仓库（提交 `03c90c4`）；对 TEMP 原文件和该提交里的文件分别 `git hash-object`，两者一致 |
| 同两份脚本（**复审后修改版，当前仓库版本**） | 见 `git rev-parse HEAD:docs/demo/v0.6.0/scripts/run-main.ps1` 等 | capture 非零即 `throw`；seed 之后、capture 之前再次校验端口归属；README 块清空旧输出、整块遇错即停、不复制。**这些修改未实跑**，未获得新的独占时段 |

## 实际运行与输出

1. 主账套（`run-main.ps1`）共跑 3 次。
   - 第 1 次：脚本没有 seed 步骤，伙伴 `PARTY` 不存在，预览返回 400，等不到预览区而超时，capture 退出码 1。
   - 第 2 次：同样没有 seed；capture.mjs 已加状态校验，直接报出 `400 INVALID_REQUEST`（`api.error.tradeDocument.reference`），capture 退出码 1。
   - 第 3 次：补上 `seed-trade.mjs` 后成功。22:27:26 就绪（pid 31516，端口 4198），输出 `posted PARTY AP-DEMO 11300`、`posted PARTY2 AP-DEMO2 11300`、`[]`（无溢出、无页面错误、无 ≥400 响应）、`shots 12`，capture 退出码 0，随后 `port 4198 released`。
   - 三次的账套目录均由 `finally` 删除。
2. 迁移账套（`run-migration.ps1`）共跑 1 次：`legacy-reconcile --check` 的 verdict 为 `pending`，随后按流程确认；22:28:22 就绪（pid 31904），输出 `[]`、`shots 4`，capture 退出码 0，`port 4198 released`。每个组合 5 个键值表，页面无横向溢出；en/390 有 2 个键值表容器内部可横向滚动。
3. 订单页观察（zh/red/1440，来自 `capture-log-main.json`）：预览后焦点在预览区（`aria-labelledby="tord-preview-title"`），预览时列表 0 行；保存后列表 1 行、预览区消失；点列表订单号后查询框值为该订单号，焦点在只读详情区。4 个组合的首页图标均为 `/favicon.svg`，200，`image/svg+xml`。

## 数量与清理

- 截图共 **16 张** = 订单页 3 个阶段（预览、保存后列表、从列表打开）× 4 个组合 + 迁移页 × 4 个组合。favicon 是日志检查，不是截图。另有 2 个 `capture-log-*.json`。
- 结束：无残留 `erp-demo-*`、无 vitest/playwright/headless 浏览器进程，端口 4198 已释放，时段已释放。

## 无浏览器替身检查（D208，现版命令）

命令（仓库根目录；脚本只读取 README 第 4 节的复跑块并原样执行）：

```powershell
powershell -NoProfile -File docs\demo\v0.6.0\scripts\stub-check.ps1
```

最终运行：退出码 **0**，输出 `ALL ASSERTIONS PASSED (7 scenarios)`。对应提交即本记录所在 PR 的 head（见 PR 正文）。

- 替身用 PowerShell 函数遮蔽 `npm`、`node`、`Start-Process`、`Invoke-WebRequest`、`Stop-Process`、`Copy-Item`、`Get-NetTCPConnection`：没有启动 Chrome、Playwright、Vitest，没有监听端口，没有重拍截图；运行前后用进程查询确认无 headless/playwright 进程。
- **隔离**：运行期间 `TEMP`/`TMP` 指向独立目录 `s6-stub-<guid>`，shots 与 `erp-demo-*` 都落在其中，结束后整体删除；替身拦截任何不在隔离目录内的 capture 输出。`Copy-Item` 只记录，不真正复制。运行前先确认真实截图目录无未提交改动，并对其 16 张 PNG 与 2 个日志做 SHA256；运行后再比对，全部不变，`git status` 干净。
- **上一版缺陷**：上一版没有隔离，其 `Remove-Item` 清掉了真实的 `$env:TEMP\demo-s6-shots`（仓库里已提交的 `screenshots/` 未受影响，已核对与提交 `5675c9e` 逐字节一致）。本版不再触碰该目录。
- **断言**：每个场景断言是否抛出及抛出内容、`Copy-Item` 次数、capture 调用次数、被停止的 pid 列表、残留 `erp-demo-*` 数；任一断言失败即退出码 1。另做了一次反向验证（把场景 1 的期望 pid 改成 `[111]`），脚本如期报出 `ASSERT FAIL` 并以退出码 1 结束。
- **假 PID**：主账套 111，迁移账套 222；“端口被别的进程占用/归属不符”用 999 和 4242。因此能区分清理的是哪一个服务。

| 场景 | 抛出 | Copy-Item | capture 调用 | 停止的 pid | 残留 erp-demo-* |
|---|---|---|---|---|---|
| 1 成功 | 无 | 1 | 2 | 111、222 | 0 |
| 2 主账套 capture 退出码 3 | `capture failed, exit 3` | 0 | 1 | 111 | 0 |
| 3 迁移 capture 退出码 5 | `capture failed, exit 5` | 0 | 2 | 111、222 | 0 |
| 4 启动前端口被占用 | `port busy` | 0 | 0 | 无（未启动进程） | 0 |
| 5 启动后归属不符（主） | `owner mismatch` | 0 | 0 | 111 | 0 |
| 6 seed 之后归属不符（主） | `owner mismatch after seed` | 0 | 0 | 111 | 0 |
| 7 迁移账套归属不符 | `owner mismatch` | 0 | 1 | 111、222 | 0 |

这只验证脚本控制流（失败即停、不复制、只清本轮对象），**没有验证**真实 Chrome 截图、真实端口监听或真实 seed 行为。

## 未在授权时段内验证的分支

- 复审后修改的两份脚本和 README 复跑块未做真实实跑；失败分支与成功分支的控制流由上面的替身检查覆盖。
- 两个 ps1 脚本的实际运行版事后才复制进仓库；复制后没有再运行（本次修改按要求不启动浏览器）。
- 端口 4198 被占用的 `throw` 分支、监听进程归属不符的 `throw` 分支：本次未触发，未验证。`finally` 清理在前两次失败运行中实际执行过。
