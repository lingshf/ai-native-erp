# DEMO-21 run-through（v0.20.0 RC）

## SHA 角色

| 角色 | 完整 SHA |
| --- | --- |
| RC 范围终点（= main，#309） | `a1a12448207372d6792b2497da852d08418c552b` |
| 第一窗口 runner（app worktree `demo21-app`）head | `7797e5638da42fb90aaf535aee0d08ab1bdf15ec`（含有缺陷的 `capture.mjs`） |
| 第二窗口 runner（`demo21-app`，重建）head | `2e0ec13077f43a739de5ce6706ea7ce7ad812509`（不是最终 RC head；其后只提交证据文档） |
| tool worktree `demo21-tool` / slot-run 的 base | `a1a12448207372d6792b2497da852d08418c552b` |
| v0.19.0 tag 指向 | `10292ede0906f96d26806bdd9bb7e8b4e72279c8` |

## 窗口前（窗口外，针对第二窗口的 head `2e0ec13…`）

- 新建 `demo21-app`（detached 于 `2e0ec13…`），`npm ci` 经 `Tee-Object` 存为 `logs/npm-ci-app.log`，退出码 0（`logs/npm-ci-app.log` 末行 `exit=0`）；两处 lock blob 均为 `07c1aee8b9c3392b88c25f9bb670adbbc8f19201`，安装后 `git status --porcelain --untracked-files=all` 为空。tool 侧 `npm ci` 输出为 `logs/npm-ci-tool.log`（第一窗口前已跑，tool head 未变）。
- `npm run build`（app）退出码 0，`logs/build-app.log`。
- **`-SkipCapture` 实跑（D509，开窗前，本版本）**：cwd=`demo21-app`，`powershell.exe -NoProfile -File docs\demo\v0.20.0\scripts\run-main.ps1 -SkipCapture -Shots "$W\shots-skip" -Port 4204 *> "$W\logs\skipcapture.out.log"`，紧接 `Add-Content … "exit=$LASTEXITCODE"`。`logs/skipcapture.out.log`：第 1 行 `web-dist: ok`，第 4 行 `ready port=4204`（18:39:25，早于开窗），第 39 行 `readiness ok`，第 40 行 `capture skipped (dry-run)`，第 41 行 `port 4204 released`，第 42 行 `exit=0`。
- `-Stub pass` 演练（slot-run，`-Ports 4204`）退出码 0：`logs/slot-stub-pass.out.log` 含 `call location ok`、`dist check web-dist: ok`、`runner done head=2e0ec13…`。
- 门禁（开窗前，18:40:27 PST）：18 个 node 进程，命令行含 `ai-native-erp` 的 0 个（命令行截取前 140 字符，cwd 手动命令取不到，记“未取”）；4204 / 4173 / 4203 无监听；REFAC-12 worktree 无 node 进程。快照列：phase、时间、PID、父进程链、CPU 秒、cwd、命令行，见 `logs/gate-snapshots.tsv`。

## 第一窗口（失败，已记录，不重开）

2026-11-23 **18:36:10 PST** 开，约 18:38 关。批准的步骤 1（`run-main.ps1 -Shots "$W\shots-dry" -Port 4204`）退出码 **1**（`logs/capture-dry-run.out-w1.log` 末行 `exit=1`），步骤 2 未跑（D444 失败即停，不重试）。原因是 **我的 `capture.mjs` 缺陷，不是产品缺陷**：“草稿编辑器打开 → Tab 到刷新”一步先 `blur()` 再按 Tab，焦点起点落在编辑器位置，越过了按钮。此前 8 张截图与事件、队列视图的键盘记录均通过，0 页面错误；临时账套已删除，4204 已释放。窗口前日志与快照保留为 `*-w1`：`build-app-w1.log`、`npm-ci-app-w1.log`、`skipcapture.out-w1.log`、`slot-stub-pass.out-w1.log`、`gate-snapshots-w1.tsv`。

### 脚本修正前后对比（断言不削弱）

| 项 | 修改前（`7797e56…`） | 修改后（`2e0ec13…`） |
| --- | --- | --- |
| 编辑器打开时的起点 | `blur()` 后按 Tab，起点不定 | 找到“刷新列表”之前最近的可聚焦（非禁用）元素，聚焦它，再按一次 Tab，并记录 `editorOpenFocusStart`（实测 `a:Trial balance`） |
| 到达断言 | Tab 后焦点应是“刷新列表” | 同，仍是 `must`，信息里含起点 |
| 草稿 | 只断言编辑器仍打开 | **新增**：先在“摘要”输入 `DEMO-21 draft memo`，刷新后摘要必须原样保留（`draftBefore` = `draftAfter`） |
| 请求 | Enter 触发 1 次请求 | 同，不变 |

## 第二窗口（通过）

2026-11-23 **18:40:42 PST 开 → 18:43:51 PST 关**，端口 4204，D512 补充放行与 ERP 无关的长驻 node（debate-coach 的 playwright / ui-test-server 等）。批准原文逐字执行，无管道，不重试；紧接的 `Add-Content … "exit=$LASTEXITCODE"` 在同一 PowerShell 进程内执行。

| 步 | 命令（cwd=`demo21-app`，`ERP_E2E_BROWSER_CHANNEL=chrome`） | 结果 | 日志 |
| --- | --- | --- | --- |
| 1 | `powershell.exe -NoProfile -File docs\demo\v0.20.0\scripts\run-main.ps1 -Shots "$W\shots-dry" -Port 4204 *> "$W\logs\capture-dry-run.out.log"` | 末行 `exit=0`；`shots 8`、`capture exit 0`、`port 4204 released` | `capture-dry-run.out.log` |
| 2 | `pwsh -NoProfile -File <tool>\scripts\slot\slot-run.ps1 -OutDir "$W\out" -StepsFile <app>\docs\demo\v0.20.0\scripts\steps-demo21.ps1 -BaseRoot <tool> -Ports 4204 *> "$W\logs\slot-run.out.log"` | 末行 `exit=0`（第 103 行）；`slot-summary-real.log` 第 101 行 `step demo-capture exit=0`，第 102 行 `runner done head=2e0ec13…` | `slot-run.out.log`、`slot-summary-real.log` |

快照：窗口内每分钟一次（18:41:42、18:42:44、18:43:46），关窗后循环多记了 18:44:48 一次；命令行含 `ai-native-erp` 的行为 0（命令行截取前 140 字符，不据此断言“无 ERP 进程”；slot-run 自己的 `processes-real.tsv` / `excluded.tsv` 是窗口内进程的记录来源）。slot-run 将 debate-coach 的 chrome-headless-shell 记为外来进程（SR-X1）。

### 结果

- capture：19 项检查，0 失败，8 张截图（`shots/`）。键盘记录（1440 英文绿色，`logs/capture-log-real.json`）：事件视图焦点起点“New · Match clearing items”，Tab 后“Refresh list”，Enter 与空格各 1 次 `/api/v1/events?company=DEFAULT&limit=100`；编辑器打开时按钮未禁用，起点 `a:Trial balance`，Tab 后“Refresh list”，Enter 1 次请求，编辑器仍打开，草稿摘要前后均为 `DEMO-21 draft memo`；队列视图 Tab 到“Refresh list”，Enter 与空格各 1 次 `/api/v1/transfer-queue?company=DEFAULT&limit=100&status=failed`，状态筛选仍为 `failed`。
- 390 px：4 张截图的按钮均在视口内（`left` 16，`right` 106 / 119.6）。
- 干跑与 slot-run 截图对比：8 张 PNG 中 7 张 SHA-256 一致，`queue-en-green-1440.png` 不同（只记录事实，未做归因；入库的是 slot-run 的正式运行截图）；干跑 JSON 与正式运行 JSON 一致。
- 与第一窗口干跑相比，`queue-en-green-1440.png` 同样不同于正式运行的该张，其余 7 张一致。

## D500 / D492：真实临时账套路径（均由 `finally` 删除，未保留；`Get-ChildItem $env:TEMP -Filter erp-demo-*` 现只剩窗口前遗留的 4 个，不是本次产物，未触碰）

| 阶段 | 路径 | 来源 |
| --- | --- | --- |
| W1 预跑 SkipCapture | `C:\Users\shaoling\AppData\Local\Temp\erp-demo-ca43e2e0-ac3a-411f-80e6-02cd992f801e` | `skipcapture.out-w1.log:2` |
| W1 步骤 1 | `C:\Users\shaoling\AppData\Local\Temp\erp-demo-4bcff6c4-af3f-4169-9760-4993c5d76b04` | `capture-dry-run.out-w1.log:2` |
| 窗口前 SkipCapture | `C:\Users\shaoling\AppData\Local\Temp\erp-demo-f5bc7dbe-3d95-4892-9867-204bdd7cf476` | `skipcapture.out.log:2` |
| W2 步骤 1 | `C:\Users\shaoling\AppData\Local\Temp\erp-demo-1bc93bec-4a28-4080-8690-be4d08ceb8a6` | `capture-dry-run.out.log:2` |
| W2 步骤 2（slot-run 内） | `C:\Users\shaoling\AppData\Local\Temp\erp-demo-5ba3deef-460e-4fc9-9ac9-65c66c27cf70` | `slot-demo-capture.out.log:2` |

窗口前遗留的 4 个目录：`38ee77b6…`、`39541e54…`、`bc986617…`、`ea3fe46f…`。`logs/d492-artifacts-before-cleanup.csv` 列出 `%TEMP%\demo21`（72 项，含两个窗口与未入库文件）的完整 SHA-256、字节数、行数，清理前生成；逐项入库核对见 PR 正文。

## D504：打包体积测量（窗口关闭后单独运行一次）

- 工具：`scripts/measure/bundle-measure.mjs`（钉 `a1a1244`，从 `demo21-tool` 运行），先读源码核对参数。`-HASH` 是 `bundle-compare.mjs` 内置的哈希掩码，不是命令行参数（我第一次误传 `--hash`，工具以退出码 2 拒绝，未产生测量；日志已覆盖，只在此记录）。
- base：`git rev-parse v0.19.0^{commit}` = `10292ede0906f96d26806bdd9bb7e8b4e72279c8`；head `a1a12448207372d6792b2497da852d08418c552b`。
- 命令：`node scripts\measure\bundle-measure.mjs --base 10292ede… --head a1a12448… --work "$W\measure" --route src/BusinessEvents.tsx=+300 --chunk src/BusinessEvents.tsx=+300 *> "$W\logs\bundle-measure.out.log"`，退出码 0（日志末行 `exit=0`），**RESULT: PASS**。
- 路由与 chunk `BusinessEvents`：gzip 18904 → 19041，29491 → 29947 原始字节（+137 B gzip，限 +300 B）；首屏与其余 ±0。完整输出 `logs/bundle-measure.out.log`。测量工作区已按脚本打印的命令清理。

## 回顾候选

- 门禁快照的命令行截取 140 字符且 cwd 取不到，不足以判断窗口内进程归属，建议把 SLOT 快照工具做成脚本（S22 SLOT-05）。
- 我第一次测量误传 `--hash`：Demo 模板可写明 `-HASH` 是掩码口径而非参数。
