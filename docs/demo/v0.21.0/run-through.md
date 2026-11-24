# DEMO-22 run-through（v0.21.0 RC）

## SHA 角色

| 角色 | 完整 SHA |
| --- | --- |
| RC 范围终点（= main，#317） | `3ae4848d36c4c06c2e208173e58ed2cac3771564` |
| app worktree `demo22-app` head（干跑与窗口 runner） | `199bf9ea979419adab33c274b578cca67e3ff10b`（不是最终 RC head；其后只提交文档） |
| tool worktree `demo22-tool` / slot-run 的 base | `3ae4848d36c4c06c2e208173e58ed2cac3771564` |
| v0.20.0 tag 指向（`release/v0.20.0`，不在 main 上） | `90c762f05de39723852d1a381058301cab4da997` |
| v0.20.0 与范围终点的合并基 | `a1a12448207372d6792b2497da852d08418c552b` |

## 祖先检查（`git merge-base --is-ancestor <合并提交> 3ae4848d36c4c06c2e208173e58ed2cac3771564`）

| 任务 | PR | 合并提交（完整 SHA） | 退出值 |
| --- | --- | --- | --- |
| SLOT-05 | #312 | `7c7cafd72092bfb04fc4fb895df05218bfeaca53` | 0 |
| REFAC-12 | #311 | `9c0526604521555226221099a34a93adbcd6b46a` | 0 |
| TLIST-06 | #316 | `eac0c373b236e290e214a8128566d9da00cf6cd7` | 0 |
| DOC-22 (a) | #309 | `a1a12448207372d6792b2497da852d08418c552b` | 0 |
| DOC-22 (b) | #317 | `3ae4848d36c4c06c2e208173e58ed2cac3771564` | 0 |

## 窗口外：键盘焦点路径（S21 回顾行动 2）

`@testing-library/user-event` 未安装，所以用 jsdom 按 DOM 顺序模拟 Tab 顺序（只在本 worktree 里临时追加用例，跑完已还原，产品测试文件未提交）。命令（cwd=仓库根）：`npx vitest run packages/web/test/trade-settlements.test.tsx -t "DEMO-22 focus path" --reporter=verbose`，输出 `logs/focus-path-jsdom.out.log`（末行 `exit=0`），用例源码 `scripts/focus-path.test.snippet.tsx`。

| 键盘步骤 | 焦点起点（确定元素） | 键 | 期望目标 | 窗口外验证 |
| --- | --- | --- | --- | --- |
| K1 | “核销分配”页签头按钮（`aria-controls=tset-allocation-body`） | Tab | “刷新列表”（有 / 无选择均如此） | 用例 K1 通过；K2（有选择时的保持）见 TLIST-06 S3，不属于窗口验收 |
| K3 | 同上，确认待定、表格锁定 | Tab | “刷新列表” | 用例 K3 通过 |
| K1 Enter / 空格 | “刷新列表” | Enter / Space | 各 1 次未结项第一页请求 | jsdom 无法证明浏览器的按键激活，留给窗口内的真实 Chrome（D487） |

## 窗口前（窗口外，针对 app head `199bf9e…`）

- 新建 `demo22-app` 与 `demo22-tool`（detached），`npm ci` 经重定向存为 `logs/npm-ci-app.log`、`logs/npm-ci-tool.log`，末行均为 `exit=0`；安装后两处 `git status --porcelain` 均为空。`npm run build`（app）`logs/build-app.log` 末行 `exit=0`。
- **`-SkipCapture` 实跑（D509，协调者批准用端口 4204，仅作干跑，不当作窗口证据）**：cwd=`demo22-app`，`powershell.exe -NoProfile -File docs\demo\v0.21.0\scripts\run-main.ps1 -SkipCapture -Shots "$W\shots-skip" -Port 4204 *> "$W\logs\skipcapture.out.log"`，紧接 `Add-Content … "exit=$LASTEXITCODE"`。`logs/skipcapture.out.log`（SHA-256 `F23E2445649DE6EDC24937A5904AD4CDF99B07391A53C838C416980D82E3F15A`，51 行）：第 1 行 `web-dist: ok`，第 4 行 `ready port=4204`，第 39 行 `readiness ok`，第 40 行 `capture skipped (dry-run)`，第 41–49 行是删除前清单，第 50 行 `port 4204 released`，第 51 行 `exit=0`。干跑后 4204 无监听。
- **D492 清单（删除前，含 `-wal` / `-shm`）**：账套路径 `C:\Users\shaoling\AppData\Local\Temp\erp-demo-87673b50-7a74-420f-889e-342ca7c921fb`（日志第 2 行），清单在日志第 41–49 行：`demo.sqlite` 647168 B；`demo.sqlite-wal` 1878752 B（present）；`demo.sqlite-shm` 32768 B（present）；`demo.sqlite.users\` 下 2 个 0 字节文件；每个文件的 SHA-256 见日志。随后 runner 的 `finally` 删除该目录。
- 门禁（`gate-snapshot.ps1 -Once`，`pwsh`，`-Ports "4204,4173"`）退出码 0，`logs/gate-pre.tsv`（16 行含表头，`errors=0`）：7 个 node 进程及其祖先，`kind=listen pid=none` 在 4204 与 4173 各 1 行。cwd 取得情况见该 TSV 的 cwd 列。
## 体积（窗口外；`scripts/measure/bundle-measure.mjs`，masked gzip-9，D454 / D502，不开端口）

命令均带 `--route src/TradeSettlements.tsx=+200 --chunk src/TradeSettlements.tsx=+200 --d454`，输出与退出码存档（末行 `exit=`）。head 取 `3ae4848…` / `eac0c37…` 的产品代码（之后的 RC 提交只改文档，不进 dist）。

| 测量 | base → head | 首屏 gzip | `TradeSettlements` 路由 gzip（原始 B） | chunk gzip（原始 B） | 结果 | 日志 |
| --- | --- | --- | --- | --- | --- | --- |
| TLIST-06 单独 | `7c7cafd72092bfb04fc4fb895df05218bfeaca53` → `eac0c373b236e290e214a8128566d9da00cf6cd7` | 160944 → 160944（±0） | 15566 → 15632（+66；42584 → 42834） | 5062 → 5128（+66；14822 → 15072） | **PASS**（`exit=0`） | `logs/bundle-measure-tlist06.out.log`，SHA-256 `78E5ED7F45223EAD3C7867DA4336571606EE6690F9310A2C5141364D826FBEE0` |
| 整个 Sprint | `a1a12448207372d6792b2497da852d08418c552b` → `3ae4848d36c4c06c2e208173e58ed2cac3771564` | 160942 → 160944（+2，D454 ④ ≤10 B：true） | 14791 → 15632（+841；39993 → 42834） | 4287 → 5128（+841；12231 → 15072） | **FAIL**（`exit=1`，仅这两行超出 +200） | `logs/bundle-measure-sprint.out.log`，SHA-256 `1CDB26C15AE4156070FDB8145EDEF96311B513ED0CCAD618EC0105AC092E3673` |

TLIST-06 单独符合 +200 B 的上限（+66 B）。整个 Sprint 的 +841 B 超限，差额（+775 B）来自 TLIST-06 之前、同一路由的 REFAC-12（`SettlementEntry` 拆分为 `trade-settlements/` 多个模块），不是本版本才加入的按钮；这个上限是 TLIST-06 的，不是整个 Sprint 的。该差异已报告协调者，不在本 RC 里改产品代码。其余路由与 chunk 均 ±0。

## 版本差异（D483，固定完整 SHA，无路径过滤）

基线 `90c762f05de39723852d1a381058301cab4da997`（`v0.20.0^{commit}`，在 `release/v0.20.0` 上，不在 main 上）对 RC 范围终点 `3ae4848d36c4c06c2e208173e58ed2cac3771564`；合并基 `git merge-base` = `a1a12448207372d6792b2497da852d08418c552b`。两个形式口径不同，不能互相替代：两点是两棵树的差，三点是合并基到终点（只含 main 侧）。

| 形式 | 命令 | 输出 |
| --- | --- | --- |
| 两点 | `git diff --shortstat 90c762f05de39723852d1a381058301cab4da997 3ae4848d36c4c06c2e208173e58ed2cac3771564` | 30 files changed, 1757 insertions(+), 550 deletions(-) |
| 三点 | `git diff --shortstat 90c762f05de39723852d1a381058301cab4da997...3ae4848d36c4c06c2e208173e58ed2cac3771564` | 71 files changed, 4195 insertions(+), 548 deletions(-) |
| 提交数（两点） | `git rev-list --count 90c762f05de39723852d1a381058301cab4da997..3ae4848d36c4c06c2e208173e58ed2cac3771564` | 8 |
| 提交数（三点） | `git rev-list --count 90c762f05de39723852d1a381058301cab4da997...3ae4848d36c4c06c2e208173e58ed2cac3771564` | 13 |
| 产品与工具文件（合并基 → 终点） | `git diff --shortstat a1a12448207372d6792b2497da852d08418c552b 3ae4848d36c4c06c2e208173e58ed2cac3771564 -- packages scripts package.json package-lock.json` | 19 files changed, 1479 insertions(+), 535 deletions(-) |
| main 侧对照（8 行，与 CHANGELOG 的分类一致） | `git log --oneline --first-parent a1a12448207372d6792b2497da852d08418c552b..3ae4848d36c4c06c2e208173e58ed2cac3771564` | #317、#316、#312、#314、#315、#313、#311、#310 |

数字针对产品代码终点 `3ae4848`，不含本 RC PR 的文档提交；tag 对 tag 的数字在日期 PR 中补写。

## 窗口

**批准（D480，协调者，2026-11-23 约 20:18 PST 转达）原文：**“批准 DEMO-22 开窗（D480），端口 4204，按你提交的命令逐字执行，只改一处：快照脚本路径改用 demo22-tool 下的 scripts\slot\gate-snapshot.ps1，与 slot-run 同一基线 3ae4848，其余参数不变。REFAC-13 和 TSET-01 两位开发已收到暂停通知，但消息要到他们下一个回合边界才生效。所以先跑一次 gate-snapshot -Once -Ports "4204,4173"，两个端口都是 pid=none 才开始步骤 1，否则停下回报。 D519（体积）：放行。TLIST-06 本身 +66 B，在 +200 B 内；Sprint 累计 +841 B 中有 +775 B 来自 REFAC-12，那次拆分已按它自己的预算评审批准；首屏 +2 B，在 D454 的 10 B 内。在 run-through 和发布说明里写明这一例外和原因，不改产品代码。不重试，失败即停。开窗、关窗各通知我一次。”

**D519 体积例外：** Sprint 累计 `TradeSettlements` +841 B 超过 +200 B，原因是 REFAC-12 在同一路由上的拆分（+775 B，已按其自身预算评审批准）；TLIST-06 本身 +66 B，首屏 +2 B（D454 ≤10 B）。协调者放行，产品代码未改。

**时间线（PST，2026-11-23，只保留这一套数字；时间只取自仓库内的原始记录，不用我转述的 `Get-Date` 读数）：**

| 时间 | 事件（出处） |
| --- | --- |
| 20:18:28.605 | 开窗前门禁唯一一帧 `takenAt`（`logs/gate-pre-window.tsv`，`2026-11-23T20:18:28.6048693-08:00`） |
| 20:18:42.369 / 20:19:42.448 / 20:20:42.666 / 20:21:42.800 | 窗口快照 4 帧 `takenAt`（`logs/gate-window.tsv`） |
| 20:19:28 | 步骤 1 的账套删除前清单时间（`logs/capture-dry-run.out.log` `at=`），随后 `port 4204 released` |
| 20:19:38.628 | 步骤 2 runner 启动（`logs/slot-run.out.log` 第 1 行 `2026-11-24T04:19:38.628Z`） |
| 20:21:40 | 步骤 2 的账套删除前清单时间（`logs/slot-demo-capture.out.log` `at=`） |
| 20:21:43.448 | 步骤 2 runner 结束（`logs/slot-run.out.log` `runner done`，`04:21:43.448Z`） |
| 20:21:46.733 | 关窗：`gate.stop` 的创建时间（文件元数据，文件在 `%TEMP%\demo22\logs\gate.stop`，0 B，未入库） |

**缺口（诚实记录）：** ① 放行时刻、步骤 1 的启动时刻、窗口快照命令的启动时刻没有仓库内的原始记录；只能界定范围：放行在门禁帧 20:18:28.605 之后、窗口快照首帧 20:18:42.369 之前，步骤 1 在窗口快照启动之后、20:19:28 之前。我在转述里用过的 20:18:26 / 20:18:40 / 20:18:43 / 20:19:36 来自 shell 命令前的 `Get-Date` 输出，没有存成文件，**作废，不再使用**。② 快照命令的“原始启动记录”拿不到：`gate-window.out.log` 只有收尾两行（脚本只在结束时输出，无启动行）；PSReadLine 历史对由工具启动的命令没有记录（`ConsoleHost_history.txt` 中 `gate-window`、`slot-run`、`run-main` 的命中为 0）；`gate-window.tsv` 的进程行里没有快照进程自身。因此下面的命令文本只是我执行时的原文，没有独立的启动日志佐证；可交叉验证的只有第一帧时间、`-Ports "4204,4173"` 对应的 port 行和 `-StopFile` 触发的 `exit=0`。

**命令（原文，`$T` 的展开路径见评审修正一节）：**

| 步骤 | 命令 |
| --- | --- |
| 门禁 | `pwsh -NoProfile -File "$T\scripts\slot\gate-snapshot.ps1" -OutFile "$W\logs\gate-pre-window.tsv" -Once -Ports "4204,4173"`，exit 0，errors=0，4204 与 4173 各一行 `pid=none`（`logs/gate-pre-window.tsv`）。开窗，已通知协调者 |
| 窗口快照（异步） | `pwsh -NoProfile -File "$T\scripts\slot\gate-snapshot.ps1" -OutFile "$W\logs\gate-window.tsv" -StopFile "$W\logs\gate.stop" -Ports "4204,4173"`，启动前 OutFile 与 StopFile 均不存在 |
| 步骤 1 | `powershell.exe -NoProfile -File docs\demo\v0.21.0\scripts\run-main.ps1 -Shots "$W\shots-dry" -Port 4204 *> "$W\logs\capture-dry-run.out.log"`，紧接 `Add-Content … "exit=$LASTEXITCODE"`；exit=0，capture exit 0，4 张图，`port 4204 released` |
| 步骤 2 | `pwsh -NoProfile -File "$T\scripts\slot\slot-run.ps1" -OutDir "$W\out" -StepsFile "$A\docs\demo\v0.21.0\scripts\steps-demo22.ps1" -BaseRoot $T -Ports 4204 *> "$W\logs\slot-run.out.log"`，紧接 `Add-Content … "exit=$LASTEXITCODE"`；exit=0，`step demo-capture exit=0 counted-after=0` |
| 关窗 | 创建 `gate.stop`；快照进程 `snapshots=4 rows=129 errors=0 timedOut=false exit=0`。已通知协调者 |

无失败、无重试、无管道。快照原始记录：`logs/gate-window.tsv`（SHA-256 `1093D2F9436022E96DD6C92C221EFEF6B5740C4DB31CC7D7B17DD28B0F76CC52`）；`logs/capture-dry-run.out.log`（`0ED3FEE170CB113CD0B802CDDF9F2BD0B1570BAD708AC5828804BBA2963DB844`）；`logs/slot-run.out.log`（`FBE71A884D9676376A116BC9FE23E111A2497A5DEB5A679ED70C0D82B0622640`）；步骤 2 的附属日志为 `logs/slot-*`。

**窗口内键盘证据（真实 Chrome，`shots/capture-log-main.json`，`settlements-keyboard-record`）：**

| 项 | 结果 |
| --- | --- |
| K1 | 起点 `button[aria-controls=tset-allocation-body]`，Tab 后落在“Refresh list”；Enter 与 Space 各产生 1 次 `/api/v1/trade/open-items?company=DEFAULT&status=open&limit=100` |
| K2 | **不属于窗口验收（D521）。** 日志里的 `k2StillChecked`、`k2AmountBefore/After = on` 都不作为证据：金额断言用错了选择器（`on` 是 checkbox 的值，不是核销金额）；“刷新后选择与金额保持”整体改由产品测试 TLIST-06 S3 证明（7 passed，exit 0，`logs/s3-vitest.out.log`） |
| K3 | 锁定态 fieldset disabled，“刷新列表”仍可用；刷新后“安全重试过账”仍显示、fieldset 仍禁用 |

readiness：`openItems 8`，DEFAULT 账套的未结项、PO-C1 部分开票/10→6 均满足。

**截图：** `shots/`（步骤 1）：`settlements-zh-red-1440/390.png`、`settlements-en-green-1440/390.png`；`shots-slot/` 是步骤 2 同脚本在 slot-run 中的第二次产物。按钮位于 fieldset 之前、表格之前；390 宽度无横向溢出（`documentScrollWidth` 390）。

**D492 清单（窗口内，删除前）：** 步骤 1 的账套 `C:\Users\shaoling\AppData\Local\Temp\erp-demo-a8f2f654-1469-446b-81e4-5fdb6aa5852d`：`demo.sqlite` 647168 B（`CE55C639…5953`）、`demo.sqlite-wal` 1878752 B（`52E018EF…028D`）、`demo.sqlite-shm` 32768 B（`061A691C…1A60`），`demo.sqlite.users\` 下 2 个 0 字节文件（`E3B0C442…B855`）；`-wal`、`-shm` 均 present。完整 SHA-256 见 `logs/capture-dry-run.out.log`；步骤 2 的清单见 `logs/slot-demo-capture.out.log`。

**未做：** `-Stub pass` 演练（本版本 SLOT 无改动）。

## 评审 6033643731（绑定 3ea8a12）的修正

**1. K2 的 `on`：capture 脚本选择器问题，不是产品缺陷。D521（协调者代定）：不再开窗；窗口内 K2 的“金额不变”断言无效；真实浏览器证据只认焦点路径和 Enter / 空格激活（K1、K3）；“刷新后选择与金额保持”改由产品测试 TLIST-06 S3 证明（7 passed，exit 0，`logs/s3-vitest.out.log`）。截图只展示按钮位置与布局，不依赖 `on` 值。**
- 原选择器 `tbody input` 加 `filter({ hasNot: locator("[type=checkbox]") })`：`hasNot` 检查的是子孙元素，`input` 没有子孙，所以不会排除任何元素，`.first()` 取到的是行首的选择 checkbox，其未设 value，`inputValue()` 返回浏览器默认值 `on`。所以窗口里的 `k2AmountBefore/After = on` 是 checkbox 的值，不是核销金额，那一项等式没有证明金额不变。
- 产品侧：`packages/web/src/trade-settlements/settlement-row.tsx` 中，金额输入框是选中后才渲染的 `type="number"`（`aria-label` 为“核销总额 + 单号”），checkbox 另是 `type="checkbox"`；产品代码无缺陷。
- 脚本已改为 `tbody input[type=number]`（`capture.mjs`，`node --check` exit 0）。
- 窗口外影响说明（现有产品测试，未改测试）：`packages/web/test/trade-settlements.test.tsx` 的 TLIST-06 用例 S3 断言刷新后保留选择和金额。在 `demo22-app`（产品代码与 `3ae4848` 相同）根目录执行 `npx vitest run packages/web/test/trade-settlements.test.tsx -t "TLIST-06" *> "$env:TEMP\demo22\logs\s3-vitest.out.log"`，紧接 `Add-Content … "exit=$LASTEXITCODE"`：7 passed | 8 skipped，exit 0（`logs/s3-vitest.out.log`）。注：先从 `packages\web` 目录执行过一次，因缺少根配置的 jsdom 环境报 `window is not defined`（exit 1），已覆盖为根目录执行的结果。
- 窗口内真实 Chrome 的有效证据范围：K1（Enter、空格各 1 次请求）和 K3；K2 整体（选择、金额保持）不属于窗口验收，改由上述 jsdom 测试 TLIST-06 S3 证明；修正后的脚本未在真实浏览器里重跑。D521：不再开窗，不补真实浏览器取证。

**2. 快照命令与时间点。**
- `$T` 展开为 `C:\GithubCopilot\copilot-worktrees\ai-native-erp\demo22-tool`（基线 `3ae4848`），实际执行的是 `pwsh -NoProfile -File "C:\GithubCopilot\copilot-worktrees\ai-native-erp\demo22-tool\scripts\slot\gate-snapshot.ps1" -OutFile "C:\Users\shaoling\AppData\Local\Temp\demo22\logs\gate-window.tsv" -StopFile "C:\Users\shaoling\AppData\Local\Temp\demo22\logs\gate.stop" -Ports "4204,4173"`；开窗前门禁同样用该路径，参数为 `-OutFile "…\logs\gate-pre-window.tsv" -Once -Ports "4204,4173"`。没有使用 lingshf-animated-disco 下的脚本。
- 时间点只保留窗口一节的那一套（仅取自原始记录）；放行时刻等缺口也记在那里。批准原文的转达时间没有比“约 20:18”更细的时间戳。

**3. D492 清理前全部产物清单（窗口内，由 runner 在删除账套前写入日志，之后账套目录被删除）。**

| 账套（步骤） | 文件 | 字节 | SHA-256 |
| --- | --- | --- | --- |
| `…\Temp\erp-demo-a8f2f654-1469-446b-81e4-5fdb6aa5852d`（步骤 1，20:19:28） | `demo.sqlite` | 647168 | `CE55C63923B7B131DD3CF44D43A9FC43218BAE1C1B127D70036A934742505953` |
| | `demo.sqlite-wal` | 1878752 | `52E018EFB73B9648E2F795C0BA2E3396D247E227C95BC84095F79952B19E028D` |
| | `demo.sqlite-shm` | 32768 | `061A691C2CBF65230BDA8E7FC4770C5ED4C6158A7702F3E8FFCD2950055A1A60` |
| | `demo.sqlite.users\43876-b31552a8-…`、`…\43876-d0712800-…` | 0 ×2 | `E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855` |
| `…\Temp\erp-demo-7b84915f-8ce7-49e1-b670-5e7fd9a6c50e`（步骤 2，20:21:40） | `demo.sqlite` | 647168 | `FC336C2FB604C2D5C028E0634AF8A0CB57112172A2651DD48EF24F1C157D7B9A` |
| | `demo.sqlite-wal` | 1878752 | `43278D30254AD461DCEDF98C38A0F91E2FF84DCA7373471FBA5B170ACDB318D4` |
| | `demo.sqlite-shm` | 32768 | `885BFDB9A2F9CEF26D67C3C45F3F8E74D36275566F00EB92E21802B297E7C870` |
| | `demo.sqlite.users\86164-828690c4-…`、`…\86164-bf35d5a5-…` | 0 ×2 | `E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855` |

两个账套的 `-wal`、`-shm` 均 present（日志中有 `inventory demo.sqlite-wal present`、`inventory demo.sqlite-shm present` 行）。账套文件（sqlite、-wal、-shm、users 下的 0 字节文件）按规则在清单后删除，未入库：账套是一次性临时库，含演示数据，不作为证据保留，证据是清单中的字节数与哈希。

窗口产物逐项（原件指 `%TEMP%\demo22` 下执行时产生的文件，仍在本机；“仓库 blob”指 `git show HEAD:<路径>` 的字节。`-text` 的 `.log` 原样入库，原件与 blob 哈希一致；`.tsv`/`.txt` 受 `.gitattributes` 的 `* text=auto eol=lf` 影响，入库时 CRLF 被转成 LF，所以哈希不同）：

| 入库文件（`docs/demo/v0.21.0/logs/`） | 原件字节 | 原件 SHA-256 | 仓库 blob 字节 | 仓库 blob SHA-256 |
| --- | --- | --- | --- | --- |
| `capture-dry-run.out.log` | 3469 | `0ED3FEE170CB113CD0B802CDDF9F2BD0B1570BAD708AC5828804BBA2963DB844` | 3469 | 同左 |
| `slot-run.out.log` | 51964 | `FBE71A884D9676376A116BC9FE23E111A2497A5DEB5A679ED70C0D82B0622640` | 51964 | 同左 |
| `gate-window.tsv` | 83888 | `1093D2F9436022E96DD6C92C221EFEF6B5740C4DB31CC7D7B17DD28B0F76CC52` | 83888 | 同左（原件本就是 LF） |
| `gate-window.out.log` | 80 | `4E71B704EB5A1E11B7ECA45B6DB51DDB04D9AE2179CA707C508ABF699905614E` | 80 | 同左 |
| `gate-pre-window.tsv` | 16470 | `238F444566DDBB6CA9FE1190B22CBCFEDDFF03F1D7226F38D9415158F91F73AA` | 16470 | 同左（原件本就是 LF） |
| `s3-vitest.out.log` | 265 | `61AC62E4E990136530BB500F78084FD0EC6CBC2E69A7B5464FAB8084FC2867F5` | 265 | 同左 |
| `slot-slot-summary.log`（原 `out\slot-summary.log`） | 51956 | `947A079647C808D5AF8FB868E9CE80E34592166D8C8B907951B6CDAF434BA7DC` | 51956 | 同左 |
| `slot-demo-capture.out.log`（原 `out\demo-capture.out.log`） | 3425 | `7966CD62807BF8C7786369FA47B1B8B5D2C1F24B6D1D93624F65E2434AE67769` | 3425 | 同左 |
| `slot-preflight-base.log` | 392 | `F08B302B7AC1B1DFFD9A8616534E2B5F9F6732901D066AD375159A5B1CAC907E` | 392 | 同左 |
| `slot-preflight-head.log` | 389 | `D6FF23F4B2A720C2A39496450075368B50A59443BE62B13164026485C13AF7CA` | 389 | 同左 |
| `slot-build.log`（原 `out\build.log`） | 3881 | `7325C4B2C360E19D8F3E67E97EBACD4BDAC72C545E3505DBD56AA519448D5C6E` | 3881 | 同左 |
| `slot-demo-capture-start-rev.txt`、`slot-demo-capture-end-rev.txt`（两份内容相同） | 43 | `63564F52A8E3E2163952BA2F6D8D33797B4753460D391455C8839006A6076DC1` | 42 | `E123ECB20BFDA47BCEC958752AA958337FD49F525B623E4BB3C2D5F34E4ED9B6` |
| `slot-processes.tsv`（原 `out\processes.tsv`） | 550 | `8845E73C4B007FE586BF2AC160FA4757661A3B5917608D75C465CEFDCDEFCDEF` | 539 | `96240A41F3301FE45FD3864BC7698F336AF62A70FDB853774B58EB0D19AAB3FD` |

`slot-processes.tsv` 的原件是 CRLF（550 B，含 11 个 CR），仓库 blob 是 LF（539 B），差的 11 B 就是 11 个行尾的 CR，这是 `.gitattributes` 对 `.tsv` 的 `eol=lf` 规则造成的，内容无其他差异；rev 文本同理（43 → 42 B，少 1 个 CR）。要对哈希验证原件，请用原件的 CRLF 版本。

未入库的窗口产物（清理前元数据，原件仍在 `%TEMP%\demo22`）：

| 产物 | 字节 | SHA-256 | 未入库原因 |
| --- | --- | --- | --- |
| `out\excluded.tsv` | 341244 | `1ACB92608384361A83A12F3928D961502D69EBF1F07C23FA6019DE40D9959585` | 门禁排除进程的逐行明细，体积大；`slot-slot-summary.log` 已含同类 `excluded` 行 |
| `out\demo-capture.err.log` | 0 | `E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855` | 空文件 |
| `logs\gate.stop` | 0 | （空文件，同上） | 关窗标志文件，创建时间 20:21:46.733 |
| 账套全部文件 | 见上表 | 见上表 | 一次性临时库，清单后由 runner 删除，证据是字节数与哈希 |

截图原件与入库逐字节一致（`-text` 二进制）：`shots/`（步骤 1，原件在 `%TEMP%\demo22\shots-dry`）`settlements-en-green-1440.png` 127852 B `7D321DC33A5B56FDB8D62EFE01C57EF30C98C88B2EBDA2F27C6673425FC0B8FB`、`settlements-en-green-390.png` 86276 B `F956FC79260018C8BF557378750CB84720C48E28D29A71CD98B5CD0FB28C869D`、`settlements-zh-red-1440.png` 122223 B `393FAF7E34014068C49E84122D13CD7673965F3601D40AFA001EFEE20AF65DDA`、`settlements-zh-red-390.png` 85112 B `43A75C539A4C3B5CA585937367FF8449D778B06F51F1EADE5238C9AE0C0AA8D4`、`capture-log-main.json` 4330 B `533D390176093479E20B90557AFC9AA515B04B60C5CA1147E604E1B68DA27B35`；`shots-slot/`（步骤 2，原件在 `%TEMP%\demo22\out\shots`）`settlements-en-green-1440.png` 127478 B `3120D06DFC213FEF686ECC88A5A7C199597A40B9B8C4878AEEDD6022E38DF334`、`settlements-en-green-390.png` 86315 B `D9A2078FF3F62B40CB3D3553FD6EBBB9D6F4D83832DB14DB2162B9A7C38C85D5`、`settlements-zh-red-1440.png` 121282 B `D887FC6E849395D751F1524A2615F0E673DC1DC49262D1DCBEAC321EFC60E917`、`settlements-zh-red-390.png` 85123 B `AE021871D58E35B3072E861B52B44767C08CEBC1B489A2C3EAB986B601BC66B0`、`capture-log-main.json` 4330 B（与步骤 1 的同哈希）。

缺口：账套文件本身没有留存，窗口内也没有在清理前对 `out\` 之外的目录（例如 Chrome 的临时用户目录）做清单，那部分没有元数据。

**入库日志全表（HEAD blob，`docs/demo/v0.21.0/logs/`，共 22 个文件；行数 = 以 LF 计的文本行数；告警 = 完整 `git diff --check` 的 `path:line:` 条数，合计 1710，涉及 21 个文件，`slot-processes.tsv` 为 0）。** 前置（窗口外）产物是 `build-app.log`、`bundle-measure-*.out.log`、`focus-path-jsdom.out.log`、`gate-pre.tsv`、`npm-ci-*.log`、`skipcapture.out.log`；其余是窗口内产物或窗口后的测试（`s3-vitest.out.log`）：

| 文件 | 字节 | SHA-256 | 行数 | 告警 |
| --- | --- | --- | --- | --- |
| `build-app.log` | 3889 | `B1F7FA71658B871564FED71055ED80427E4CC243C1D69834FFEA2B13A8668F3B` | 61 | 61 |
| `bundle-measure-sprint.out.log` | 33739 | `1CDB26C15AE4156070FDB8145EDEF96311B513ED0CCAD618EC0105AC092E3673` | 516 | 516 |
| `bundle-measure-tlist06.out.log` | 34011 | `78E5ED7F45223EAD3C7867DA4336571606EE6690F9310A2C5141364D826FBEE0` | 524 | 524 |
| `capture-dry-run.out.log` | 3469 | `0ED3FEE170CB113CD0B802CDDF9F2BD0B1570BAD708AC5828804BBA2963DB844` | 52 | 52 |
| `focus-path-jsdom.out.log` | 3181 | `8F093FE6E06E7BD62FAF97E49A96DA6B19CA9A98483DA808ABD50FE9D0CDC6DD` | 27 | 27 |
| `gate-pre-window.tsv` | 16470 | `238F444566DDBB6CA9FE1190B22CBCFEDDFF03F1D7226F38D9415158F91F73AA` | 19 | 18 |
| `gate-pre.tsv` | 14529 | `5F1AD195007C0CDA944488DD58670566CB812C3B8332A7502CCD8518DDC5F05D` | 17 | 16 |
| `gate-window.out.log` | 80 | `4E71B704EB5A1E11B7ECA45B6DB51DDB04D9AE2179CA707C508ABF699905614E` | 2 | 2 |
| `gate-window.tsv` | 83888 | `1093D2F9436022E96DD6C92C221EFEF6B5740C4DB31CC7D7B17DD28B0F76CC52` | 130 | 129 |
| `npm-ci-app.log` | 159 | `1955BFC5AD631F71FD7A1BE1428F30D62B88E2CDAE8E9D85EC72F4E1EAEC7985` | 8 | 8 |
| `npm-ci-tool.log` | 106 | `D395D348B690F5DBAF43D7F31981CB8E0AECB61811D15929FFA31BD8777C7B7E` | 6 | 6 |
| `s3-vitest.out.log` | 265 | `61AC62E4E990136530BB500F78084FD0EC6CBC2E69A7B5464FAB8084FC2867F5` | 10 | 10 |
| `skipcapture.out.log` | 3471 | `F23E2445649DE6EDC24937A5904AD4CDF99B07391A53C838C416980D82E3F15A` | 51 | 51 |
| `slot-build.log` | 3881 | `7325C4B2C360E19D8F3E67E97EBACD4BDAC72C545E3505DBD56AA519448D5C6E` | 60 | 60 |
| `slot-demo-capture-end-rev.txt` | 42 | `E123ECB20BFDA47BCEC958752AA958337FD49F525B623E4BB3C2D5F34E4ED9B6` | 2 | 1 |
| `slot-demo-capture-start-rev.txt` | 42 | `E123ECB20BFDA47BCEC958752AA958337FD49F525B623E4BB3C2D5F34E4ED9B6` | 2 | 1 |
| `slot-demo-capture.out.log` | 3425 | `7966CD62807BF8C7786369FA47B1B8B5D2C1F24B6D1D93624F65E2434AE67769` | 51 | 15 |
| `slot-preflight-base.log` | 392 | `F08B302B7AC1B1DFFD9A8616534E2B5F9F6732901D066AD375159A5B1CAC907E` | 5 | 5 |
| `slot-preflight-head.log` | 389 | `D6FF23F4B2A720C2A39496450075368B50A59443BE62B13164026485C13AF7CA` | 5 | 5 |
| `slot-processes.tsv` | 539 | `96240A41F3301FE45FD3864BC7698F336AF62A70FDB853774B58EB0D19AAB3FD` | 11 | 0 |
| `slot-run.out.log` | 51964 | `FBE71A884D9676376A116BC9FE23E111A2497A5DEB5A679ED70C0D82B0622640` | 102 | 102 |
| `slot-slot-summary.log` | 51956 | `947A079647C808D5AF8FB868E9CE80E34592166D8C8B907951B6CDAF434BA7DC` | 101 | 101 |

行数与告警不等：告警按 `git diff --check` 实测计数；两者的差异原因（行尾空白、Tab 或混合行尾）未逐文件核查，不下结论。窗口外产物的原件与 blob 的字节对应关系未逐一比对，仅给出 blob 的元数据。
- `%TEMP%` 下还有 4 个我未创建于本窗口、也未触碰的 `erp-demo-*` 目录，不属于本窗口清单。

**4. D495 的 `git diff --check`（D511 做法：不改原始日志，按原样给出排除规则）。**
- 完整命令 `git diff --check 3ae4848d36c4c06c2e208173e58ed2cac3771564 <head>`：exit 2。告警全部落在 `docs/demo/v0.21.0/logs/` 下的原始日志（未改一字节，按 D511 保持原样；行尾为 CRLF 或有 Tab 分隔）。按文件的告警条数（`git diff --check` 的 `path:line:` 行数，实测：完整输出 3418 行，其中 `path:line:` 告警 1710 条，涉及 21 个文件，全部在 `docs/demo/v0.21.0/logs/`）：build-app.log 61、bundle-measure-sprint.out.log 516、bundle-measure-tlist06.out.log 524、capture-dry-run.out.log 52、focus-path-jsdom.out.log 27、gate-pre-window.tsv 18、gate-pre.tsv 16、gate-window.out.log 2、gate-window.tsv 129、npm-ci-app.log 8、npm-ci-tool.log 6、s3-vitest.out.log 10、skipcapture.out.log 51、slot-build.log 60、slot-demo-capture-end-rev.txt 1、slot-demo-capture-start-rev.txt 1、slot-demo-capture.out.log 15、slot-preflight-base.log 5、slot-preflight-head.log 5、slot-run.out.log 102、slot-slot-summary.log 101；非 `logs/` 路径为 0。
- 排除规则命令 `git diff --check 3ae4848d36c4c06c2e208173e58ed2cac3771564 <head> -- . ':!docs/demo/v0.21.0/logs'`：exit 0。
- 具体 head 的两条命令输出写在 PR 正文。
