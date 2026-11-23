# DEMO-19 演练记录

状态：**窗口前（草稿）**。真实时段尚未开始；窗口内的步骤、退出码与哈希在窗口结束后补入。不打 tag。

## 1 SHA 角色表（唯一一张；README 与 PR 正文引用本表，不再另列）

| 角色 | SHA | 说明 |
| --- | --- | --- |
| RC 头 | 见 PR 正文“当前状态” | 每次推送都会变，文档里不写“当前头” |
| 被测运行器头（app worktree） | 窗口内定，见 §2 | 窗口内 app worktree 所在的提交；其后只改文档的，用 `git diff --name-only <被测头> <RC头> -- docs/demo/v0.18.0/scripts packages scripts` 无输出证明 |
| 工具头（tool worktree，`slot-run.ps1` 所在） | `3f8f2ff9fd010ff63fb8d891b4a4b1209d4cd0ee` | main，含 D492 / D493 / D495 规则 |
| 产品代码基线 | `6787f524838b13c0d1efd4fabdc5b8937b65c022` | REFAC-10 合并提交；`git diff --name-only 6787f52 3f8f2ff -- packages scripts` 无输出 |

## 2 时间线表（唯一一张）

| 步骤 | 时刻 / 状态 | 备注 |
| --- | --- | --- |
| 两处 `npm ci`（开窗前，D493） | 待做 | 退出码、lock blob、安装后空 porcelain 随窗口申请附上 |
| 开窗 | 待协调者授权 | R3，`-Ports 4203` |
| `npm run build`（一次） | 待做 | 窗口内；`assert-web-dist` 要求 dist 不早于 RC 头提交 |
| capture 干跑（一次） | 待做 | 新 capture 脚本，D487 要求的窗口内干跑日志，真实运行前必须在手 |
| `run-main.ps1 -SkipCapture -Shots <临时目录>` | 待做 | run-main 已改（路径指向 v0.18.0），D487 的浏览器外证据 |
| 真实运行 `slot-run.ps1 -Ports 4203` | 待做 | 一次，不重试 |
| 清理前记录（D492） | 待做 | 路径、SHA-256、字节、行数；先存临时账套路径清单 |
| 关窗 | 待做 | |

## 3 D487 证据对照

| 脚本 | 要求 | 证据 |
| --- | --- | --- |
| `run-main.ps1`（改：只换 capture 路径） | 浏览器外 `-SkipCapture`，`-Shots` 必填；`-Stub` 不算 | 待补 |
| `capture.mjs`（新） | 窗口内干跑后才真实运行 | 待补 |
| `steps-demo19.ps1`（新） | 随真实运行 | 待补 |

## 4 证据清单（provenance manifest）

待窗口结束后补入：命令与退出码、脚本 blob、已入库日志的 SHA-256 与字节数 / 行数（取自 git blob）、清理前记录、临时账套路径清单、未保留项。
