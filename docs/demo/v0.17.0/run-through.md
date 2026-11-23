# DEMO-18 演练记录

状态：**真实时段已完成**（见 [`README.md`](README.md) §3、§4）。不打 tag。

## 1 时段前的演练

没有单独的时段前演练：`run-main.ps1` 的浏览器外 `-SkipCapture` 需要端口 4203，D489 把它并入安静时段，作为 D487 的 run-main 证据（[`logs/skipcapture.out.log`](logs/skipcapture.out.log)）。因此没有 `-Stub` 运行。

## 2 D487 证据对照

| 脚本 | 要求 | 证据 |
| --- | --- | --- |
| `run-main.ps1`（改） | 浏览器外 `-SkipCapture` | `logs/skipcapture.out.log`，退出码 0，含 `web-dist: ok` |
| `capture.mjs`（新） | 窗口内干跑（TEMPLATE 第 17 条）后才真实运行 | `logs/capture-dry-run.out.log` 与 `capture-log-dry-run.json`，退出码 0；第一次干跑失败的记录见 `logs/capture-dry-run1-failed.out.log` |

## 3 复盘与建议（S18 回顾的输入）

- 新 capture 脚本第一次干跑就在窗口内失败（选择器 `#trade-editor` 不存在，D491）；浏览器外预演无法覆盖它，所以窗口内干跑是必需步骤。建议：写 capture 选择器前先读组件源码确认 id 落在哪个元素（`FastTab` 只给正文 `<id>-body`）。
- `run-main.ps1` 的 `-Shots` 是必填参数，即使 `-SkipCapture`（D490）；模板的 `-SkipCapture` 示例应带 `-Shots <目录>`。
- 提交晚于 dist 时 `assert-web-dist` 报 `stale`，干跑前要重新构建一次；这是预期行为，建议模板写明“RC 头每变一次，窗口内重新构建”。

## 4 证据清单（provenance manifest）

对象：被测运行器头 `319778cc86481d03037b24eb8d978d161ba169cc`（`status=[]`）；其后的提交只改文档：`git diff --name-only 319778c 1dc5288 -- docs/demo/v0.17.0/scripts packages scripts` 无输出。tooling：main `1638445c536467d488f3f455ecdbefbdc4686c7b`。环境：Windows 11 Enterprise，node v26.13.0，npm 11.20.0，`package-lock.json` blob `07c1aee8b9c3392b88c25f9bb670adbbc8f19201`（`git rev-parse 1638445:package-lock.json`）。账套：`erp-demo-<guid>` 临时目录，端口 4203。

**命令与退出码**（均在窗口内手动各一次；app 为 `%TEMP%\demo18\demo18-slot-app`，tool 为 `%TEMP%\demo18\demo18-slot-tool`）：

| 顺序 | 命令 | 退出码 |
| --- | --- | --- |
| 1 | `npm ci`（app，503aee8）；`npm ci`（tool，1638445） | 0；0 |
| 2 | `npm run build`（app，503aee8） | 0 |
| 3 | `powershell.exe -NoProfile -File docs\demo\v0.17.0\scripts\run-main.ps1 -SkipCapture`（D490：漏 `-Shots`） | 1（参数绑定失败，主体未运行） |
| 4 | 同上加 `-Shots <临时目录>`（D490 批准的重跑，浏览器外） | 0 |
| 5 | `run-main.ps1 -Shots <临时目录>`（第一次 capture 干跑，503aee8） | 1（D491：`#trade-editor`） |
| 6 | 提交 `319778c`，app 切到 `319778c`；`assert-web-dist.ps1` 报 `stale` | 4 |
| 7 | `npm run build`（app，319778c，一次） | 0 |
| 8 | `run-main.ps1 -Shots <临时目录>`（第二次 capture 干跑，319778c） | 0 |
| 9 | `slot-run.ps1 -Ports 4203`（R3；tooling 取自 main `1638445`，步骤文件为 app 的 `steps-demo18.ps1`，见 `slot-summary-real.log` 前三行；完整命令行未保留） | 0 |

**脚本 blob**（`git rev-parse <提交>:<路径>`，319778c 与 1dc5288 相同）：`docs/demo/v0.17.0/scripts/capture.mjs` `2860dd3e24e8799ca7103e6ae2e946545d3f5532`（503aee8 上为 `4d9ec48fc80bfd1f38613ef5d62191917374951c`，即 D491 修复前）；`run-main.ps1` `3343db57c23347c5b260615b91bcba46c4ae9250`；`steps-demo18.ps1` `f99565af1b794bca62a2d412cba41b427a0fe7f2`；`scripts/demo/assert-web-dist.ps1`（1638445）`a6ed31b4948c4febc752c41c9ea89d707a7195d8`；`scripts/slot/slot-run.ps1`（1638445）`5cc761c979031dacf42adc7721d17667651daf54`。

**已入库日志**（字节原样；SHA-256 与行数是**入库后**在 1dc5288 的工作区计算的，只标识已提交的字节）：

| 文件 | 来源（窗口内的文件） | SHA-256 | 行数 |
| --- | --- | --- | --- |
| `logs/skipcapture.out.log` | 步骤 4 的控制台输出 | `56E48A00FE9C503942D7E8B3F4FDA16F64921C8271BCC75B711ED50DC12DCB7E` | 40 |
| `logs/capture-dry-run1-failed.out.log` | 步骤 5 | `0B4BF5EC1D08656E6EA6F9A2CE5E139E122416E8C94848A5F8B856411203F8FE` | 51 |
| `logs/capture-dry-run.out.log` | 步骤 8 | `82FE5BD65ACED23B032D52044EBB132A1AC6768DC6E5EC2004C152FB8A3FFFC6` | 41 |
| `logs/capture-log-dry-run.json` | 步骤 8 的 `capture-log-main.json` | `CCCAC122D2CC3F71B004FD3011BCB42B2181259F11F0C68EE6C4105926EF7355` | 401 |
| `logs/slot-summary-real.log` | 步骤 9 的 `slot-summary.log` | `573DD47A417349714E558F6A5D9358859E37CA4F70CFD9ECE90192395B2F7F14` | 60 |
| `logs/demo-capture-real.out.log` | 步骤 9 的 `demo-capture.out.log` | `F3B3AEDE5DB232A817BBDE08B5D1A96B21298C8CC58CC50686C719E812BF07AF` | 41 |
| `logs/processes-real.tsv` | 步骤 9 的 `processes.tsv` | `05DE358B621E4FFD7B905BBB9D0D3E4CB30542BE42A18D42C5BB14E69037ECF1` | 12 |
| `logs/capture-log-real.json` | 步骤 9 的 `shots\capture-log-main.json` | `CCCAC122D2CC3F71B004FD3011BCB42B2181259F11F0C68EE6C4105926EF7355` | 401 |

两个 JSON 字节相同（同一份脚本、同一份造数、无时间戳字段）。截图 SHA-256 见 `git ls-files -s` 的 blob 与下表之外的文件本身：`trade-invoices-list-en-green-1440` `36E7DDC2…74E`、`…en-green-390` `40E7C4E2…6A0`、`…zh-red-1440` `A16C2EC3…535`、`trade-master-en-green-1440` `419455FA…EE1`、`…en-green-390` `7221649E…E6F`、`…zh-red-1440` `E1847E5A…762`、`…zh-red-390` `69EA2CFD…E5E`、`trade-orders-list-en-green-390` `2BA9B36E…40D`（前 8 位与后 3 位，完整值用 `Get-FileHash` 重算）。

**未保留（not retained）** 的字段，以及原因：

- 日志**清理前**的路径 / SHA-256 / 行数记录（模板“日志入库前后的核对”要求）：窗口内只做了 `Copy-Item`，没有在复制前后记录哈希，窗口结束时临时目录已删除。上表的哈希是入库后重算的，**只能证明已提交的字节，不能证明与清理前的文件一致**；复制是整文件字节复制（`Copy-Item`）。请协调者给出明确处置（Dxxx）。
- 没有入库的窗口内文件：两次 `npm ci` 的输出（`npm-ci-app.log`、`npm-ci-tool.log`）、两次 `npm run build` 的输出、runner 输出目录里的其余文件（如 `preflight-head.log`）以及步骤 4 的 `-Shots` 目录。原因：没有计划入库，窗口结束时随临时目录删除，没有保留哈希。其中 runner 的关键行已抄入 `slot-summary-real.log`；退出码在上表。
- 步骤 3（D490）的失败输出没有日志文件，只有 README §4 里抄录的文字。
- 第一次 capture 干跑产出的 8 张截图与 JSON：按 D491 只作诊断，没有保留。
- node / npm / OS 版本没有落成日志；上面的值来自同一台机器、窗口期间的会话读数，不是日志证据。