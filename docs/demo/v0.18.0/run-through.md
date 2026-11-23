# DEMO-19 演练记录

状态：**真实时段已完成**（D497 批准，R3，端口 4203；D498、D499 批准步骤 4 的两次修正调用）。不打 tag。

## 1 SHA 角色表（唯一一张；README 与 PR 正文引用本表，不再另列）

| 角色 | SHA | 说明 |
| --- | --- | --- |
| RC 头 | 见 PR 正文“当前状态” | 每次推送都会变，文档里不写“当前头” |
| 被测运行器头（app worktree） | `0b82b1814aa9ce1566ac548a361703406e27a74d` | `slot-summary-real.log` 第 1 行 `runner start head=` 为该值，`status=[]`；其后的提交只改文档、日志与截图，用 `git diff --name-only 0b82b18 <RC头> -- docs/demo/v0.18.0/scripts packages scripts` 无输出证明 |
| 工具头（tool worktree） | `3f8f2ff9fd010ff63fb8d891b4a4b1209d4cd0ee` | main；`slot-summary-real.log` 第 2、3 行 `tooling head=`、`base head=` 均为该值 |
| 产品代码基线 | `6787f524838b13c0d1efd4fabdc5b8937b65c022` | REFAC-10 合并提交；`git diff --name-only 6787f52 3f8f2ff -- packages scripts` 无输出 |

## 2 时间线表（唯一一张；时刻取自日志，PST = UTC−8）

| 步骤 | 时刻 | 备注 |
| --- | --- | --- |
| 两处 `npm ci` | 开窗前（D493） | 退出码 0；0，lock blob `07c1aee8b9c3392b88c25f9bb670adbbc8f19201`，安装后 porcelain 空；`logs/npm-ci-{app,tool}.log` |
| 开窗（D497） | 2026-11-23 15:31:44 PST | R3，`-Ports 4203` |
| 1 `npm run build`（app，一次） | 开窗后立即 | 退出码 0；`logs/build-app.log` |
| 2 `run-main.ps1 -SkipCapture -Shots <目录>` | 步骤 1 之后 | 退出码 0；含 `port 4203 released`；`logs/skipcapture.out.log` |
| 3 capture 干跑（`run-main.ps1 -Shots <目录>`） | 步骤 2 之后 | 退出码 0；6 张截图，17 项显式检查全部通过，7 条取证记录；`logs/capture-dry-run.out.log`、`logs/capture-log-dry-run.json` |
| 4a `slot-run.ps1`，用 `powershell.exe` 调用 | 步骤 3 之后 | 退出码 2，输出 `slot-run.ps1 needs PowerShell 7 (pwsh)`；主体未运行（D498）；`logs/slot-failed1-powershell5.out.log` |
| 4b `slot-run.ps1`，`pwsh`，在 tool worktree 内调用 | 2026-11-23T23:33:45Z 起 | demo-capture 退出码 -196608，ABORT；Root 为 tool，找不到 app 里的 `run-main.ps1`；未开端口、未造数（D499）；`logs/slot-failed2-summary.log`、`logs/slot-failed2-demo-capture.err.log` |
| 4c `slot-run.ps1`，`pwsh`，在 app worktree 内调用 tool 的脚本（D499） | 2026-11-23T23:35:51Z 起，23:37:50Z 结束 | 退出码 0；demo-capture 退出码 0；`logs/slot-summary-real.log` |
| 清理前记录（D492） | 4c 之后 | `logs/d492-artifacts-before-cleanup.csv` |
| 关窗 | 清理 worktree 之后 | 4203 无监听 |

步骤 4c 的完整命令行：

```
cd <app>
pwsh -NoProfile -File <tool>\scripts\slot\slot-run.ps1 -OutDir <新的空目录> -StepsFile <app>\docs\demo\v0.18.0\scripts\steps-demo19.ps1 -BaseRoot <tool> -Ports 4203
```

`<app>` 为 `%TEMP%\demo19\demo19-slot-app`，`<tool>` 为 `%TEMP%\demo19\demo19-slot-tool`；环境变量 `ERP_E2E_BROWSER_CHANNEL=chrome`。4a、4b 都在 tool worktree 内调用 `<tool>` 的脚本（`-BaseRoot` 取 app，`-StepsFile` 同上，`-Ports 4203`），4a 用 `powershell.exe -NoProfile -File`，4b 用 `pwsh -NoProfile -File`。

## 3 D487 证据对照

| 脚本 | 要求 | 证据 |
| --- | --- | --- |
| `run-main.ps1`（改：只换 capture 路径） | 浏览器外 `-SkipCapture`，`-Shots` 必填；`-Stub` 不算 | `logs/skipcapture.out.log`，退出码 0（D496：step 0 并入窗口，沿用 D489） |
| `capture.mjs`（新） | 窗口内干跑后才真实运行 | `logs/capture-dry-run.out.log` 与 `logs/capture-log-dry-run.json`，退出码 0 |
| `steps-demo19.ps1`（新） | 随真实运行 | `logs/slot-summary-real.log` 第 4 行 `steps from …steps-demo19.ps1: demo-capture` |

干跑与真实运行的两份 JSON 字节相同。

## 4 复盘与建议（S19 回顾的输入）

- `slot-run.ps1` 有两个易错点：必须用 `pwsh`，并且必须在 app worktree 内调用 tool 的脚本（runner 以当前目录为 Root）。两次失败都是调用错误，没有副作用。已写入 TEMPLATE 第 21 条与发布清单。
- 建议：窗口申请里放逐字命令，不写“按约定”。
- 窗口内没有安装（D493 已遵守）；步骤 1 只构建。

## 5 证据清单（provenance manifest）

**环境**：Windows 11 Enterprise 10.0.26300，node v26.13.0，npm 11.20.0。lock blob `07c1aee8b9c3392b88c25f9bb670adbbc8f19201`（app 与 tool 相同）。

**清理前记录与入库核对**：窗口内所有产物在清理前记录了路径、SHA-256、字节数、行数（`logs/d492-artifacts-before-cleanup.csv`），入库后用 `git cat-file blob` 重算核对，输出见 PR 正文：19 个文件（13 个日志与 JSON、6 张截图）中 18 个与清理前的 SHA-256 和字节数完全一致；`.log` 与 JSON 的 blob 保持窗口内的字节（`.gitattributes` 为 `-text`）。**唯一不同的是 `logs/processes-real.tsv`**：窗口内文件 CRLF，550 字节、SHA-256 `3A24F5D5…DB38`；入库 blob 经换行规范化为 LF，539 字节（少 11 个 CR，共 11 行）、SHA-256 `CB10F8D3A64AD5F9C2F88375ABBE21DE43DA486BAA9D8BB7309515EC2D843054`（blob oid `04e83ae95f4fbe4215db637ec7f75211ad6d1ede`）。以 blob 为准，清理前值只作来源记录。

| 入库文件 | 窗口内来源 |
| --- | --- |
| `logs/skipcapture.out.log` | `out\skipcapture.out.log`（步骤 2） |
| `logs/capture-dry-run.out.log`、`logs/capture-log-dry-run.json` | `out\capture-dry-run.out.log`、`out\shots-dry\capture-log-main.json`（步骤 3） |
| `logs/slot-failed1-powershell5.out.log` | `out\slot-first-failed.log`（步骤 4a） |
| `logs/slot-failed2-summary.log`、`logs/slot-failed2-demo-capture.err.log` | `out\slot\slot-summary.log`、`out\slot\demo-capture.err.log`（步骤 4b） |
| `logs/slot-summary-real.log`、`logs/demo-capture-real.out.log`、`logs/processes-real.tsv`、`logs/capture-log-real.json` | `out\slot-final\` 下的 `slot-summary.log`、`demo-capture.out.log`、`processes.tsv`、`shots\capture-log-main.json`（步骤 4c） |
| `logs/build-app.log`、`logs/npm-ci-app.log`、`logs/npm-ci-tool.log` | 步骤 1 与窗口前的控制台输出 |
| `screenshots/*.png`（6 张） | `out\slot-final\shots\` |

**未入库的窗口内文件**（路径、SHA-256、字节数、行数都在 CSV 里）：两个 slot 输出目录下的 `excluded.tsv`、`preflight-*.log`、`build.log`、`demo-capture-*-rev.txt`，`out\shots-dry\` 的 5 张干跑截图（与真实运行截图 SHA-256 相同），`slot-console*.log`（与对应 `slot-summary.log` 同字节）。

**临时账套路径清单**（先保存于此，再清理）：每次 `run-main.ps1` 的 `finally` 删除自己的 `erp-demo-<guid>`；窗口内共 3 次 run-main（步骤 2、3、4c），结束后其账套均已删除。清理前 `%TEMP%` 下另有 4 个 `erp-demo-*`，创建时间均早于开窗（本机时间 2026-11-23 00:51、06:15、10:10、10:39），不是本窗口产生，未触碰。

**未保留（not retained）**：无。
