# DEMO-20 run-through（v0.19.0 RC）

窗口：D480 静默窗口，2026-11-23（PST）**17:25:43 开 → 17:29:47 关**；批准 D503（端口 4204）、D505（6 个与 ERP 无关的长驻 node 服务按“静默”放行）。

## SHA 角色

| 角色 | 完整 SHA |
| --- | --- |
| RC 范围终点（= main，MEAS-01 #298） | `6156759c2aef6b9805aca70ba5505490e2bd4c5b` |
| 窗口内 runner（app worktree `demo20-app`）head | `73ea29a0291825ed3a386d823fab3f2561210069`（不是最终 RC head；其后只提交证据文档） |
| tool worktree `demo20-tool` / slot-run 的 base | `6156759c2aef6b9805aca70ba5505490e2bd4c5b` |
| v0.18.0 tag 指向 | `422d24b6c17c7cf47a576629a193d867fc9d4b00`（与 `5398eb8` 的 packages/scripts/package*.json 无差异） |

## 窗口前

- 两处 `npm ci`（app、tool）退出码均 0，`package-lock.json` blob 均为 `07c1aee8b9c3392b88c25f9bb670adbbc8f19201`，安装后 `git status --porcelain` 为空（D493，已在窗口申请中给出）。这两次安装的控制台输出当时没有存成文件，属于日志缺口；D506 按 D500 先例接受，不重跑。替代证据：两处退出码均 0；lock blob 均为完整 `07c1aee8b9c3392b88c25f9bb670adbbc8f19201`；安装后 `git status --porcelain --untracked-files=all` 为空（窗口申请中给出）。DEMO-21 起 npm ci 输出须用 `Tee-Object` 存成文件（回顾候选项）。
- D503 门禁：窗口开启前列出 node 进程，别项目的 vitest/playwright 自行结束；留下 6 个长驻服务（PID 22720、67836、17516、68596、71336、68508），按 D505 放行。`logs/gate-window-open.log` 含 PID、CPU 秒数、命令行，以及 4204/4173 无监听（`Get-NetTCPConnection` 结果为空）。窗口开启时另有一个 `npx playwright test`（PID 4056，CPU 1.23 s，开窗前已在运行）。**它是否与 ERP 无关目前无法判定**：门禁日志只记了 PID、CPU 秒数和命令行（`gate-window-open.log:8`，命令行 `"C:\Program Files\nodejs\node.exe" "C:\Program Files\nodejs/node_modules/npm/bin/npx-cli.js" playwright test`，不含 cwd），没有记录 cwd 和父进程；该进程在复审时已不存在（`Get-CimInstance Win32_Process -Filter "ProcessId=4056"` 为空），slot-run 的 `processes-real.tsv` 与 `slot-summary-real.log` 里也没有 PID 4056。同一台机器上 debate-coach 和 ERP 的其他 worktree 都会跑 playwright/vitest，所以这条命令行本身不足以归属。此事已报告协调者待裁决（未记为 D507，不自行结论）；窗口开启时 4204 与 4173 无监听（`gate-window-open.log:9`）。slot-run 把 debate-coach 的 playwright / ui-test-server / chrome-headless-shell 记为外来进程（见 `logs/processes-real.tsv`、`logs/slot-summary-real.log`）。slot-run 的 `processes-real.tsv` / `excluded.tsv` 是窗口内进程的记录来源；我没有另做逐进程比对，未发现新的 ERP 相关外来 node 进程，但这一点只以这两份记录为据。

## 步骤（每步一次，不重试，均退出码 0）

| 步 | 命令 | 日志 |
| --- | --- | --- |
| 1 | `npm run build`（app，17:25:51–17:25:55）；D481：dist index 时间 01:25:54.81Z 晚于 head 提交时间 01:16:37Z；slot-run 自带 dist check `newer=True` | `step1.out.log`、`build-app.log` |
| 2 | `run-main.ps1 -SkipCapture -Shots <W>\shots-skip -Port 4204`（不截图）。**这是新版 `-SkipCapture` 唯一一次实跑**（本 RC 之前没有跑过，窗口内也只此一次，不补跑）。原始日志 `docs/demo/v0.19.0/logs/skipcapture.out.log`，SHA-256 `f31306ad46c9b406aac768906d485382535c5f05b04ccf4c7f6452a059ff3c91`（git blob 与原文件一致，2166 字节、41 行）：第 1 行 `web-dist: ok`，第 2 行 `demo-account-path=`，第 4 行 `ready port=4204 pid=81036`，第 39 行 `readiness ok`，第 40 行 `capture skipped (dry-run)`（对应脚本 `run-main.ps1:39`），第 41 行 `port 4204 released` | `skipcapture.out.log` |
| 3 | `run-main.ps1 -Shots <W>\shots-dry -Port 4204`（干跑，6 张截图） | `capture-dry-run.out.log` |
| 4 | cwd=`demo20-app`：`pwsh -NoProfile -File <tool>\scripts\slot\slot-run.ps1 -OutDir <W>\out -StepsFile <app>\docs\demo\v0.19.0\scripts\steps-demo20.ps1 -BaseRoot <tool> -Ports 4204`，`ERP_E2E_BROWSER_CHANNEL=chrome` | `slot-summary-real.log`、`slot-demo-capture.*.log` 等 |

**D508（偏差，已接受，不重跑）**：步骤 4 实际执行的命令比批准原文多了一个管道 `| Select -First 8`，这是唯一差异，其余参数逐字相同。管道只截断控制台显示，pwsh 进程（PID 95560）继续跑完；当时显示的 “exit 0” 是管道的退出码，**不算 runner 的实测值**。runner 的完成状态和退出码以 runner 日志和 `slot-summary-real.log`（demo-capture exit 0，runner done）为准；`slot-console.log` 只有被管道截取的前 8 行控制台输出。DEMO-21 起禁止在批准命令后附加任何管道（回顾候选项）。

### D503 条款 3：与 DEMO-19 获批原文（D496–D499）逐项对照

| 项 | DEMO-19（D499） | DEMO-20 | 语义 |
| --- | --- | --- | --- |
| 调用 | `pwsh -NoProfile -File <tool>\scripts\slot\slot-run.ps1` | 相同 | 相同 |
| cwd | app worktree（Root 取 `git rev-parse --show-toplevel`） | app worktree `demo20-app` | 相同 |
| `-BaseRoot` | tool（main `3f8f2ff`，#293 合并基） | tool（main `6156759`，也是 app head 的父提交） | 相同；tool head 与 base head 现在同为 `6156759` |
| `-StepsFile` | `docs\demo\v0.18.0\scripts\steps-demo19.ps1` | `docs\demo\v0.19.0\scripts\steps-demo20.ps1` | 仅版本不同 |
| `-Ports` | 4203 | 4204（D503） | 仅端口不同；脚本写死 4204 |
| 环境 | `ERP_E2E_BROWSER_CHANNEL=chrome` | 相同 | 相同 |

slot-summary 前几行：runner head `73ea29a…`，tooling/base head `6156759…`，结论语义与 DEMO-19 一致，无需停下。

## 结果

- capture：15 项检查，0 失败，6 张截图（`shots/`）。键盘记录（1440 英文绿色）：焦点起点“New configuration”，Tab 后“Refresh list”，Enter 与空格各 1 次 `/api/v1/dimensions?company=DEFAULT&kind=dimension&limit=100` 请求；编辑器打开时刷新按钮未禁用、Tab 到“Refresh list”、Enter 1 次请求、编辑器保持打开（`logs/capture-log-real.json`）。
- 390 px：`dimensions-en-green-390.png`、`dimensions-zh-red-390.png` 两个按钮均在视口内。
- 干跑与正式运行：4 张维度截图及 JSON 字节一致；2 张订单详情截图的 SHA-256 不同（只记录事实，未做归因；以正式运行的截图为准）。

## D500 / D492：真实临时账套路径（窗口内三个，均已由 `finally` 删除）

| 步 | 路径 | 来源 |
| --- | --- | --- |
| 2 | `C:\Users\shaoling\AppData\Local\Temp\erp-demo-fd0f913e-472e-4dc0-8c9b-64e1b94f80a6` | `skipcapture.out.log:2` |
| 3 | `C:\Users\shaoling\AppData\Local\Temp\erp-demo-3ef47b61-ebee-466f-903c-a1d4aaaabb68` | `capture-dry-run.out.log:2` |
| 4 | `C:\Users\shaoling\AppData\Local\Temp\erp-demo-91e69eaa-5a11-4b61-a09c-1ac02b7d937a` | `slot-demo-capture.out.log:2` |

窗口前遗留的 4 个 `erp-demo-*` 目录（`38ee77b6…`、`39541e54…`、`bc986617…`、`ea3fe46f…`）早于本窗口，不是本次产物，未触碰。此清单先于清理保存；窗口临时目录 `%TEMP%\demo20` 在哈希与复制完成后删除。

## D492：清理前产物哈希

全部 30 项窗口产物（含未入库的）的完整 SHA-256、字节数、行数见 `logs/d492-artifacts-before-cleanup.csv`（路径相对 `%TEMP%\demo20`，清理前生成）。逐项核对用 `git show HEAD:<入库路径>` 取 blob 再算 SHA-256，与 CSV 比较：**22 项入库，其中 19 项 blob 与 CSV 哈希一致，3 项因换行不同；8 项不入库。**

### 入库 19 项（blob 哈希 = CSV 哈希，完整 64 位见 CSV 对应行）

`logs/`：build-app.log、capture-dry-run.out.log、gate-window-open.log、skipcapture.out.log、slot-console.log、step1.out.log、slot-build.log（原 `out\build.log`）、slot-demo-capture.err.log（0 字节，`e3b0c442…b855` 即空文件哈希）、slot-demo-capture.out.log、preflight-base.log、preflight-head.log、slot-summary-real.log（原 `out\slot-summary.log`）、capture-log-real.json（原 `out\shots\capture-log-main.json`）；`shots/`：6 张 PNG。

### 入库但换行不同 3 项

| 入库文件 | CSV 原字节数 / SHA-256 | blob 字节数 / SHA-256 | 复原方法与结果 |
| --- | --- | --- | --- |
| `logs/processes-real.tsv` | 603 / `b8a6a5601e9c457e844c5c808bf72d341171f283fb7d4ec9cefda01905fbd341` | 591 / `56cedd1b50e7b4a8bc5b05b40a29c8f5a50f742b434a425d5f682a115b7b6e75` | 原文件是 CRLF，`text=auto eol=lf` 入库时转成 LF。把 blob 中每个 `\n` 换成 `\r\n`，得 603 字节，SHA-256 与 CSV 一致（已核对） |
| `logs/demo-capture-start-rev.txt` | 43 / `798e263d9cdd9aeff2abb4cfcec2336d457e1e7f50059294abe6345acdab293d` | 42 / `0cb33dcfad8d16fd657171cc7aa2d40cd7ee08afa9b795ea96b5352666e7a4c4` | 内容为 40 位 SHA（`73ea29a0…0069`）。原文件是「SHA + `\n` + `\r\n`」（混合换行），入库后变成「SHA + `\n\n`」。把末尾 `\n\n` 换回 `\n\r\n`，得 43 字节，SHA-256 与 CSV 一致（已核对；整体全换成 CRLF 则不一致） |
| `logs/demo-capture-end-rev.txt` | 同上 | 同上 | 同上（与 start 文件字节相同） |

### 不入库 8 项（原因）

| 文件（相对 `%TEMP%\demo20`） | SHA-256 | 字节 | 原因 |
| --- | --- | --- | --- |
| `out\excluded.tsv` | `2d45332234fa5f970816d27604c3a00e1aff503d43cb0e7ed9acaa5252f1d57e` | 328745 | slot-run 的外来进程排除明细，含其他项目的完整命令行，体量大且与证据无关；只保存哈希 |
| `shots-dry\capture-log-main.json` | `aadac2f7…3b17`（与入库的 `capture-log-real.json` 相同） | 4991 | 与正式运行的 JSON 字节一致，不重复入库 |
| `shots-dry\dimensions-en-green-1440.png`、`-390.png`、`dimensions-zh-red-1440.png`、`-390.png`（4 张） | 与 `shots/` 中同名文件相同（见 CSV） | — | 干跑与正式运行字节一致，不重复入库 |
| `shots-dry\trade-order-detail-en-green-1440.png` | `ad401326ab73da9205958837e639c5f66aba5976865ae8974c9bca6c22c182ae` | 188503 | 干跑截图，与正式运行 SHA-256 不同（正式运行 `09b4ff46…`）；只保存哈希，以正式运行截图为证据 |
| `shots-dry\trade-order-detail-zh-red-1440.png` | `92ccb22d57b18eed92673e4a6e82b156e1b9393df5548b752e64b3cc418473db` | 170222 | 同上（正式运行 `0c48ca6c…`） |

（上表按 8 项计：excluded.tsv 1 + 干跑 JSON 1 + 干跑维度 PNG 4 + 干跑订单详情 PNG 2。）

### 临时账套文件

三个窗口账套（路径见上表“D500”）均由 `run-main.ps1` 的 `finally` 删除，**未保留**；窗口内删除前没有对其 `demo.sqlite` 另行取哈希，状态为“已删除”。窗口前遗留的 4 个 `erp-demo-*` 目录仍在 `%TEMP%`，不是本窗口产物，未触碰。临时目录 `%TEMP%\demo20` 在哈希、清单和复制完成之后由我删除，`demo20-meas` 与其两个测量 worktree 在 D504 之后按脚本打印的命令清理。

## D504：打包体积测量（窗口关闭、清单与哈希保存之后单独运行一次）

- 工具与参数：`scripts/measure/bundle-measure.mjs`（钉 `6156759`，从 `demo20-tool` 运行），先读源码核对参数（`--base/--head/--work/--route/--chunk`）。
- base：`git rev-parse v0.18.0^{commit}` = `422d24b6c17c7cf47a576629a193d867fc9d4b00`；与 `5398eb8` 相比 packages、scripts、package*.json 无差异（`git diff --stat 422d24b 5398eb8 -- packages scripts package.json package-lock.json` 为空）。
- 命令：`node scripts\measure\bundle-measure.mjs --base 422d24b6… --head 6156759c… --work <新目录> --route src/Dimensions.tsx=+200 --route src/TradeOrders.tsx=+900 --chunk src/Dimensions.tsx=+200 --chunk src/TradeOrders.tsx=+900`，退出码 0，**RESULT: PASS**；完整输出 `logs/bundle-measure.out.log`（SHA-256 `82D9E2A2794586D71137CF6966CEBE46E11176E599546012037BE4408CF0D45A`，33506 字节；`-text`，注意这是工作区文件字节）。
- 掩码后 gzip-9：首屏 160942 → 160942（±0）；Dimensions 路由 12401 → 12504（+103，限 +200）；TradeOrders 路由 19014 → 19218（+204，限 +900）；其余路由、chunk、CSS 均 ±0。
- 测量工作区（含两个 detached worktree 与临时目录）已按脚本打印的命令清理。
