# DEMO-15 桩演练记录（`slot-run -Stub`，时段前，D456 行动 5 / TEMPLATE 第 12 条）

状态：**演练已做，真实时段尚未申请**。等协调者审阅本记录并批准后再申请；不打 tag。

## 1 做了什么

- 基线：main `bfeccb7`（工作区只多出 `docs/demo/v0.14.0/scripts/` 下 4 个未提交脚本）。
- 命令（外层 `powershell.exe -NoProfile -Command "pwsh -NoProfile -File ... ; exit $LASTEXITCODE"`），**手动 1 次**，无重试：
  `pwsh -NoProfile -File scripts\slot\slot-run.ps1 -OutDir <临时目录，仓库外> -StepsFile docs\demo\v0.14.0\scripts\steps-demo15.ps1 -Stub pass`
- 结果（`logs/slot-summary.log`，UTC 2026-11-23 17:32）：
  - head 静态预检 `exit=0 new-keys=0 reduced-keys=0`；没有 `-BaseRoot`，base 预检按设计跳过。
  - 构建完成，dist 比 HEAD 提交新（`newer=True`）。
  - `STUB MODE pass: no browser, no vitest`；步骤 `demo-capture` 实际执行的是桩替换的 `node -e "console.log('stub demo-capture ok')"`，`exit=0`。**子进程是 node，不是 `steps-demo15.ps1` 里配置的 `powershell.exe -NoProfile -File run-main.ps1 ...`**，所以这次桩**没有**演练 PowerShell 步骤路径，不满足 TEMPLATE 第 13 条要求的“经 powershell.exe 的真实步骤”（评审 6026427118 (a) 指出，更正）。
  - 桩模式的进程预检只采 1 次样且不作门控：`counted=1`；步骤后 `counted=3`。这些都是别的会话的 vitest（`C:\GithubCopilot\p7-06c-r\wt-base\`，规则 SR-C2），不是我的进程；真实运行会在这里以 exit 2 中止，所以**真实时段必须等到连续 6 次采样为 0（D308）**，现在不满足。我没有结束任何别人的进程。
- 脚本 SHA-256 的更正（评审 6026427118）：本节第一次运行（17:32，`logs/slot-summary.log`）时，4 个脚本还是未提交的工作区文件，当时记下的 `run-main.ps1 F1AA123C00B2`、`steps-demo15.ps1 8C740B5D969F` 与提交后的文件不一致，原因无法复现（那份工作区副本已不存在），**这两个值作废**，不当作已评审脚本的哈希。`capture.mjs`、`seed-credit.mjs` 的值与提交一致。提交后（HEAD `3cb3fbf`）以工作区字节与 `git cat-file blob` 两种方式核对，完全一致（长度也一致）：`run-main.ps1 C4085AD9F6CC`（3744 字节）、`steps-demo15.ps1 066D0CCA2B1B`（368 字节）、`capture.mjs 43B76421A49D`、`seed-credit.mjs 4D425108EAA2`（SHA-256 前 12 位）。`node --check` 对 `capture.mjs`、`seed-credit.mjs` 通过。
- 没有碰 4173；没有启动应用服务器；没有启动浏览器；没有打开端口 4203（演练前后 4203 无监听）。

## 2 桩演练**没有**覆盖的部分（如实写明）

桩只验证：steps 文件能被加载、预检与构建、步骤退出码传递。它没有执行 `run-main.ps1` 和 `capture.mjs`，所以以下**未经实跑验证**：

| 项 | 状态 |
| --- | --- |
| `run-main.ps1`：迁移、启动、seed、就绪检查、清理 | 未跑。启动 node 服务按 D442 需协调者批准；本次只做了 `slot-run -Stub`。 |
| `seed-credit.mjs` 对真实 API 的调用 | 未跑。请求体按 `seed-invoicing.mjs`、`trade-adjustments.ts` 的命令结构编写；`/api/v1/trade/open-items` 的响应字段（`itemId`、`revision`）、`invoicing` 端点的 `invoiced[].lineId/invoicedQuantity` 形状只读了源码，没有实测。 |
| `capture.mjs` 的断言 | 只做了第 12 条的 (b)：逐行对照源码——订单页选择器与标签（`ui/trade-order-labels.ts`：已开票数量 / 未开票数量 / 部分开票 / Partly invoiced / 订单行；`order-list.tsx`、`order-view.tsx`）、凭证页按钮标签（`ui/journal-labels.ts`：刷新列表 / Refresh list）。未对真实页面运行。 |
| 对照态 | seed-credit 在贷项前后各断言一次（贷项前 `full`/10，贷项后 `partial`/6）；凭证页对照是 v0.13.1 的“重试”按钮（DEMO-14 记录）。 |

建议：真实时段前，请批准一次**不带浏览器**的 `run-main.ps1 -SkipCapture` 演练（只起服务器和 seed，约 1 分钟，端口 4203），它能抓出 seed 的接口形状问题；否则这类问题会在真实时段里、截图之前失败（DEMO-13 的先例）。

## 3 D457 的两项

- 每页（每个语言）一个全新的 browser context：`capture.mjs` 的 `contextFor()` 在每个页面循环里调用，页面结束 `context.close()`。
- 桩演练：本记录。

## 4 时段前不带浏览器演练（D467，`run-main.ps1 -SkipCapture`）

- 2026-11-23 09:35（本地），手动 1 次，端口 4203，演练前无监听；日志 `logs/run-main-skipcapture.log`。
- 迁移、启动、4 个 seed（含 `seed-credit.mjs`，贷项前 full 10/10 → 贷项 4 后 partial 6/10）、就绪检查全部通过；服务器已停，端口 4203 已释放，临时账套已删除。接口形状问题未出现。
- 仍未验证：`capture.mjs` 对真实页面（只做了源码对照）。真实时段待 06c #256 合并后按 D308 申请。

## 5 更正与补充（评审 6026427118 / 6026436310）

- **桩的子进程**：见 §1。桩模式下 runner 无条件把步骤换成 `node -e`，所以桩无法演练 PowerShell 步骤；powershell.exe 步骤路径只有真实时段才会经 runner 走到，这是已知缺口，不在桩里补。
- **桩重跑一次**（提交后的干净树，HEAD `3cb3fbf`，`status=[]`，退出码 0，`logs/slot-summary-stub2.log`）：head 预检 exit=0 new-keys=0 reduced-keys=0，构建后 dist 新于 HEAD，桩步骤 exit=0，precheck counted=0、步骤后 counted=0。子进程同样是 node 桩。哈希见 §1，与提交一致。
- **D467 的确切调用**（`logs/run-main-skipcapture.log`）：在仓库根目录、由本会话的 PowerShell 宿主执行 `powershell.exe -NoProfile -File docs\demo\v0.14.0\scripts\run-main.ps1 -Shots <TEMP>\demo15-dry-d9275520\shots -SkipCapture`（输出 `*>&1` 经 Tee-Object 写日志），`exit 0`，日期 2026-11-23 09:35 本地；工作区干净，HEAD `ec97664`（运行前未提交日志）。
- **是否经生产子 shell**：**部分是**。子 shell 的可执行文件和参数与 `steps-demo15.ps1` 配置的相同（`powershell.exe -NoProfile -File run-main.ps1 -Shots <目录>`，多了 `-SkipCapture`），所以 `run-main.ps1` 在 Windows PowerShell 5.1 的 `powershell.exe` 下跑通了；但它**不是经 slot-run 启动的**：没有 runner 的环境变量（`ERP_E2E_BROWSER_CHANNEL`）、没有 runner 的进程采样与超时、`-Shots` 目录不同，也没有带浏览器。真实时段仍是首次经 runner 走这条路径。
