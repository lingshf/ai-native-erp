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
| `scripts/run-main.ps1`、`scripts/run-migration.ps1` | 见仓库 | 运行时存放在 `$env:TEMP`（`s6-run-main.ps1`、`s6-run-mig.ps1`），事后原样复制进仓库 |

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

## 未在授权时段内验证的分支

- 两个 ps1 脚本是成功运行所用文件，但事后才复制进仓库；复制后没有再运行（本次修改按要求不启动浏览器）。
- 端口 4198 被占用的 `throw` 分支、监听进程归属不符的 `throw` 分支：本次未触发，未验证。`finally` 清理在前两次失败运行中实际执行过。
