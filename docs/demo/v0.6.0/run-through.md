# v0.6.0 Demo 运行记录

- 运行对象：分支 `s6-rc` 的 `4f27906` 之上仅新增本目录脚本的提交（脚本提交 `a798f7f`，随后为让预览失败时能暴露响应体，在 capture.mjs 加了两行状态校验；产品代码未改）。开跑前 `git status --porcelain` 为空。
- 独占时段（D207）：开跑前静默观察，连续 6 次 precheck 均为 0（22:23:22–22:24:14，日志 `$env:TEMP\s6-precheck.log`）。计数规则：命令行含 vitest/playwright 的 node/浏览器进程与所有 headless 浏览器。
- 构建：`npm run build` 退出码 0，约 4 秒。
- 端口 4198（未用 4173）。
- 前两次主账套运行失败：运行脚本漏了 `seed-trade.mjs`，伙伴 `PARTY` 不存在，预览返回 400（`api.error.tradeDocument.reference`），第一次表现为等不到预览区超时，第二次（加了状态校验后）直接报出响应体。补上 seed 后第三次成功。三次的账套均已删除。
- 主账套（含 seed）：22:27:26 就绪，capture 退出码 0，12 张截图，页面错误与 ≥400 响应为空；4 个组合的首页图标均为 `/favicon.svg`，200，`image/svg+xml`。
- 迁移账套：22:28:22 就绪，`legacy-reconcile --check` 的 verdict 为 `pending`，随后按流程确认；capture 退出码 0，4 张截图；每个组合 5 个键值表，页面无横向溢出；en/390 有 2 个键值表容器内部可横向滚动。
- 订单页观察（zh/red/1440）：预览后焦点在预览区（`aria-labelledby="tord-preview-title"`），预览时列表为 0 行；保存后列表 1 行、预览区消失；点列表订单号后查询框值为该订单号，焦点在只读详情区。
- 结束：每轮用 `finally` 只停本轮 pid、只删本轮 `erp-demo-*`，端口 4198 均已释放；无残留 `erp-demo-*`、无 headless 浏览器进程。时段已释放。
- 截图 18 张，`capture-log-main.json`、`capture-log-migration.json` 与截图同目录。
