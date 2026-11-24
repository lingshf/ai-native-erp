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

**授权**：协调者的开窗批准原文（逐字）：“批准 DEMO-21 开窗申请，按原文执行（版本 v0.20.0 MINOR，含 TLIST-05；端口 4204；步骤 1、2 及紧接其后的 Add-Content 退出码行；不重试，失败即停）。D512 补充按你写的范围放行与 ERP 无关的长驻 node。”门禁条件：REFAC-12 worktree（`lingshf-congenial-funicular`）若仍有 node 进程，先等 10 分钟，超时不开窗并报告。外部进程放行来源就是这条消息里的 D512 补充（放行与 ERP 无关的长驻 node）；D512 正项是 #304 的 4c 在 `-Stub pass -Ports 4204` 下运行，不是本窗口授权。批准消息的时间戳我没有记录，只能以快照时间界定：开窗前快照 18:35:25 PST，窗内快照 18:36:10 PST（`logs/gate-snapshots-w1.tsv`）。

**批准的步骤 1 命令**（cwd=`demo21-app`，app head `7797e56…`，`$env:ERP_E2E_BROWSER_CHANNEL="chrome"`，`$W=C:\Users\shaoling\AppData\Local\Temp\demo21`），后接获批的退出码行：

```
powershell.exe -NoProfile -File docs\demo\v0.20.0\scripts\run-main.ps1 -Shots "$W\shots-dry" -Port 4204 *> "$W\logs\capture-dry-run.out.log"
Add-Content "$W\logs\capture-dry-run.out.log" "exit=$LASTEXITCODE"
```

（该窗口日志后来改名保存为 `capture-dry-run.out-w1.log`。）

**结果**：开窗 **18:36:10 PST**；步骤 1 退出码 **1**（`logs/capture-dry-run.out-w1.log` 第 40 行 `shots 8`、第 41 行 `CAPTURE FAILED: 键盘取证：编辑器打开时 Tab 应能到达“Refresh list”`、第 42 行 `port 4204 released`、第 50 行 `exit=1`）。截图文件的最后写入时间为 18:36:47，日志最后写入 18:36:52；**关窗时刻我没有逐秒记录**，只能说不晚于 18:38。步骤 2 未跑（D444 失败即停，不重试）。

**到了哪一步**：日志只证明拍完 8 张截图、在**草稿编辑器打开时的键盘场景**失败。队列视图的键盘场景在 `capture.mjs` 中排在这一断言之后，**未走到，不能算通过**；此前只有 `seed-credit ok` / `readiness ok` 与 8 张截图的记录。原因是 **我的 `capture.mjs` 缺陷，不是产品缺陷**：“草稿编辑器打开 → Tab 到刷新”一步先 `blur()` 再按 Tab，焦点起点落在编辑器位置，越过了按钮。临时账套已删除，4204 已释放。窗口前日志与快照保留为 `*-w1`：`build-app-w1.log`、`npm-ci-app-w1.log`、`skipcapture.out-w1.log`、`slot-stub-pass.out-w1.log`、`gate-snapshots-w1.tsv`。

### 脚本修正前后对比（断言不削弱）

| 项 | 修改前（`7797e56…`） | 修改后（`2e0ec13…`） |
| --- | --- | --- |
| 编辑器打开时的起点 | `blur()` 后按 Tab，起点不定 | 找到“刷新列表”之前最近的可聚焦（非禁用）元素，聚焦它，再按一次 Tab，并记录 `editorOpenFocusStart`（实测 `a:Trial balance`） |
| 到达断言 | Tab 后焦点应是“刷新列表” | 同，仍是 `must`，信息里含起点 |
| 草稿 | 只断言编辑器仍打开 | **新增**：先在“摘要”输入 `DEMO-21 draft memo`，刷新后摘要必须原样保留（`draftBefore` = `draftAfter`） |
| 请求 | Enter 触发 1 次请求 | 同，不变 |

## 第二窗口（通过）

2026-11-23 **18:40:42 PST 开 → 18:43:51 PST 关**（开关窗时间取自窗内快照与我的窗口记录；关窗后循环多记了 18:44:48 一次），端口 4204。授权原文（逐字）：“批准第二次开窗，按你发来的命令原文执行（不重试，失败即停）。我已再次通知 REFAC-12 暂停；门禁规则同前。SLOT-04 行改为 done（#304，5b6a4bf），在本 RC PR 里一并改。开窗、关窗各通知我一次。”与ERP无关的长驻 node 的放行来源是第一窗口批准消息中的 D512 补充（“门禁规则同前”）；批准消息时间戳同样没有记录。批准的命令逐字执行，无管道，不重试；退出码行是同一 PowerShell 进程内紧接着执行的独立语句，也属获批原文。

获批原文（cwd=`C:\GithubCopilot\copilot-worktrees\ai-native-erp\demo21-app`，`$env:ERP_E2E_BROWSER_CHANNEL="chrome"`，`$W=C:\Users\shaoling\AppData\Local\Temp\demo21`）：

```
# 步骤 1
powershell.exe -NoProfile -File docs\demo\v0.20.0\scripts\run-main.ps1 -Shots "$W\shots-dry" -Port 4204 *> "$W\logs\capture-dry-run.out.log"
Add-Content "$W\logs\capture-dry-run.out.log" "exit=$LASTEXITCODE"
# 步骤 2
pwsh -NoProfile -File C:\GithubCopilot\copilot-worktrees\ai-native-erp\demo21-tool\scripts\slot\slot-run.ps1 -OutDir "$W\out" -StepsFile C:\GithubCopilot\copilot-worktrees\ai-native-erp\demo21-app\docs\demo\v0.20.0\scripts\steps-demo21.ps1 -BaseRoot C:\GithubCopilot\copilot-worktrees\ai-native-erp\demo21-tool -Ports 4204 *> "$W\logs\slot-run.out.log"
Add-Content "$W\logs\slot-run.out.log" "exit=$LASTEXITCODE"
```

| 步 | 结果 | 日志 |
| --- | --- | --- |
| 1 | 末行 `exit=0`（第 43 行）；`shots 8`、`capture exit 0`、`port 4204 released` | `capture-dry-run.out.log` |
| 2 | 末行 `exit=0`（第 103 行）；`slot-summary-real.log` 第 101 行 `step demo-capture exit=0`，第 102 行 `runner done head=2e0ec13…` | `slot-run.out.log`、`slot-summary-real.log` |

快照：窗口内每分钟一次（18:41:42、18:42:44、18:43:46）；命令行含 `ai-native-erp` 的行为 0（命令行截取前 140 字符，不据此断言“无 ERP 进程”；slot-run 自己的 `processes-real.tsv` / `excluded.tsv` 是窗口内进程的记录来源）。slot-run 将 debate-coach 的 chrome-headless-shell 记为外来进程（SR-X1）。

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

窗口前遗留的 4 个目录：`38ee77b6…`、`39541e54…`、`bc986617…`、`ea3fe46f…`。`logs/d492-artifacts-before-cleanup.csv` 是清理前对 `%TEMP%\demo21` 生成的清单（路径、SHA-256、字节数、行数），**共 72 条，不含 CSV 文件本身**。核对在固定 head `ecec78bb0484fb9ab3d857fc7f6a07c18c7481c1` 上按原始路径逐项做（含 `out\` 下改名入库的日志），逐项表见 [d492-inventory.md](d492-inventory.md)（原始 SHA-256、字节、去向或不入库原因、blob OID、blob SHA-256）：

| 类别 | 条数 | 说明 |
| --- | --- | --- |
| 已入库、原字节匹配 | 28 | blob 的 SHA-256 等于清单值（`.log`、`.json`、8 张 PNG；`.gitattributes` 对 `logs/*.log` 为 `-text`） |
| 已入库、换行复原后匹配 | 5 | `gate-snapshots.tsv`、`gate-snapshots-w1.tsv`、`processes-real.tsv`、`demo-capture-start-rev.txt`、`demo-capture-end-rev.txt`：`* text=auto eol=lf` 在提交时把 CRLF 改成 LF；复原方法分两种：3 个 TSV 把 blob 中**每个** `\n` 逐字节替换为 `\r\n`；2 个 rev 文件的 blob 为 42 字节（40 位 SHA + `\n\n`），**只把最后一个 `\n` 替换为 `\r\n`**、保留第一个 `\n`，得 43 字节（与清单一致；全部替换会得 44 字节，哈希不符）。复原后 SHA-256 均与清单一致，rev 文件为 `98080B3EE04DD126080C3AF29CA1A33514653DF6F175195ED277E582DA73DD42` |
| **已入库小计** | **33** | |
| 未入库 | 39 | `out\excluded.tsv` 1、`shots-dry` 9、`shots-dry-w1` 9、`stub-out` 10、`stub-out-w1` 10；只留清单哈希，原因见逐项表。`shots-dry` 的 9 项中 8 张 PNG 有 7 张与步骤 2 入库的同名文件 SHA-256 相同（`queue-en-green-1440.png` 例外），`shots-dry` 的 JSON 是另一次运行；`shots-skip` 目录没有清单条目，不能算作已留哈希 |
| 合计 | 72 | 33 + 39 |

清单 CSV 本身是第 34 个入库文件（`logs/d492-artifacts-before-cleanup.csv`），不在上述 72 条里，也不是“第 6 个换行差异”：固定 head 上它的 blob OID 为 `cb0952bb5cf9d94c046c0771489c2a7fd1e9bdf7`，blob SHA-256 为 `60CD3BEBA5433A2FC96B6BAF1EC94B9F02F2111CCEA1FCB44BC9D3523DB6C804`（7967 字节，无 CR）。我没有保留它入库前的原始文件，也没有它入库前的哈希，所以它是否经过换行改写无法证明，只能以 blob 为准。

**`-wal` / `-shm`**：5 个临时账套目录由 `run-main.ps1` 的 `finally` 在退出前递归删除，我**没有**在删除前列目录或哈希 `demo.sqlite`、`-wal`、`-shm`，因此这些文件当时是否存在、是否保留，**无法补证，也不能倒推成“不存在”**。这是证据缺口，不是已核对的结论。处置建议由协调者定：接受该缺口（账套在 `finally` 中整目录删除，没有保留任何账套文件，与 DEMO-20 一致），并把“删除前对账套目录做文件清单与哈希（含 `-wal`/`-shm`）”列入回顾候选（见下）。

## D504：打包体积测量（窗口关闭后单独运行一次）

- 工具：`scripts/measure/bundle-measure.mjs`（钉 `a1a1244`，从 `demo21-tool` 运行），先读源码核对参数。`-HASH` 是 `bundle-compare.mjs` 内置的哈希掩码，不是命令行参数（我第一次误传 `--hash`，工具以退出码 2 拒绝，未产生测量；日志已覆盖，只在此记录）。
- base：`git rev-parse v0.19.0^{commit}` = `10292ede0906f96d26806bdd9bb7e8b4e72279c8`；head `a1a12448207372d6792b2497da852d08418c552b`。
- 命令：`node scripts\measure\bundle-measure.mjs --base 10292ede0906f96d26806bdd9bb7e8b4e72279c8 --head a1a12448207372d6792b2497da852d08418c552b --work "$W\measure" --route src/BusinessEvents.tsx=+300 --chunk src/BusinessEvents.tsx=+300 *> "$W\logs\bundle-measure.out.log"`，退出码 0（日志末行 `exit=0`），**RESULT: PASS**。
- 结果（原始字节与 gzip 字节分列，base → head，取自 `logs/bundle-measure.out.log`；列依次为 raw base、raw head、gzip base、gzip head、Δ gzip、预算）：

| 项 | 原始字节 | gzip 字节 | 日志行 |
| --- | --- | --- | --- |
| 路由 `src/BusinessEvents.tsx` | 61830 → 62286 | 18904 → 19041 | 第 400 行 |
| 入口 chunk `src/BusinessEvents.tsx` | 29491 → 29947 | 6734 → 6871 | 第 426 行 |

  两项 Δ 均为 gzip +137 B，限 +300 B；首屏与其余 ±0。完整输出见日志。测量工作区已按脚本打印的命令清理。

## 回顾候选

- 门禁快照的命令行截取 140 字符且 cwd 取不到，不足以判断窗口内进程归属，建议把 SLOT 快照工具做成脚本（S22 SLOT-05）。
- 我第一次测量误传 `--hash`：Demo 模板可写明 `-HASH` 是掩码口径而非参数。
- 临时账套在 `finally` 删除前没有列目录和哈希（含 `-wal` / `-shm`），留下证据缺口：窗口脚本应在删除前把账套目录文件清单与 SHA-256 写入日志。
