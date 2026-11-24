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
| K1 | “核销分配”页签头按钮（`aria-controls=tset-allocation-body`） | Tab | “刷新列表”（有 / 无选择均如此） | 用例 K1/K2 通过 |
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

**时间线（PST，本机时间）：**

| 时间 | 事件 |
| --- | --- |
| 20:18:26 | 开窗前门禁：`pwsh -NoProfile -File "$T\scripts\slot\gate-snapshot.ps1" -OutFile "$W\logs\gate-pre-window.tsv" -Once -Ports "4204,4173"`，exit 0，errors=0，4204 与 4173 各一行 `pid=none`（`logs/gate-pre-window.tsv`）。开窗，已通知协调者 |
| 20:18:40 | 启动窗口快照（异步）：`pwsh -NoProfile -File "$T\scripts\slot\gate-snapshot.ps1" -OutFile "$W\logs\gate-window.tsv" -StopFile "$W\logs\gate.stop" -Ports "4204,4173"`，启动前 OutFile 与 StopFile 均不存在 |
| 20:18:43–20:19:29 | 步骤 1：`powershell.exe -NoProfile -File docs\demo\v0.21.0\scripts\run-main.ps1 -Shots "$W\shots-dry" -Port 4204 *> "$W\logs\capture-dry-run.out.log"`，紧接 `Add-Content … "exit=$LASTEXITCODE"`；exit=0，capture exit 0，4 张图，`port 4204 released` |
| 20:19:36–20:21:43 | 步骤 2：`pwsh -NoProfile -File "$T\scripts\slot\slot-run.ps1" -OutDir "$W\out" -StepsFile "$A\docs\demo\v0.21.0\scripts\steps-demo22.ps1" -BaseRoot $T -Ports 4204 *> "$W\logs\slot-run.out.log"`，紧接 `Add-Content … "exit=$LASTEXITCODE"`；exit=0，`step demo-capture exit=0 counted-after=0` |
| 20:21:46 | 关窗：创建 `gate.stop`；快照进程 `snapshots=4 rows=129 errors=0 timedOut=false exit=0`。已通知协调者 |

无失败、无重试、无管道。快照原始记录：`logs/gate-window.tsv`（SHA-256 `1093D2F9436022E96DD6C92C221EFEF6B5740C4DB31CC7D7B17DD28B0F76CC52`）；`logs/capture-dry-run.out.log`（`0ED3FEE170CB113CD0B802CDDF9F2BD0B1570BAD708AC5828804BBA2963DB844`）；`logs/slot-run.out.log`（`FBE71A884D9676376A116BC9FE23E111A2497A5DEB5A679ED70C0D82B0622640`）；步骤 2 的附属日志为 `logs/slot-*`。

**窗口内键盘证据（真实 Chrome，`shots/capture-log-main.json`，`settlements-keyboard-record`）：**

| 项 | 结果 |
| --- | --- |
| K1 | 起点 `button[aria-controls=tset-allocation-body]`，Tab 后落在“Refresh list”；Enter 与 Space 各产生 1 次 `/api/v1/trade/open-items?company=DEFAULT&status=open&limit=100` |
| K2 | 草稿金额 `on` → 刷新后仍为 `on`，勾选保持，草稿未清空 |
| K3 | 锁定态 fieldset disabled，“刷新列表”仍可用；刷新后“安全重试过账”仍显示、fieldset 仍禁用 |

readiness：`openItems 8`，DEFAULT 账套的未结项、PO-C1 部分开票/10→6 均满足。

**截图：** `shots/`（步骤 1）：`settlements-zh-red-1440/390.png`、`settlements-en-green-1440/390.png`；`shots-slot/` 是步骤 2 同脚本在 slot-run 中的第二次产物。按钮位于 fieldset 之前、表格之前；390 宽度无横向溢出（`documentScrollWidth` 390）。

**D492 清单（窗口内，删除前）：** 步骤 1 的账套 `C:\Users\shaoling\AppData\Local\Temp\erp-demo-a8f2f654-1469-446b-81e4-5fdb6aa5852d`：`demo.sqlite` 647168 B（`CE55C639…5953`）、`demo.sqlite-wal` 1878752 B（`52E018EF…028D`）、`demo.sqlite-shm` 32768 B（`061A691C…1A60`），`demo.sqlite.users\` 下 2 个 0 字节文件（`E3B0C442…B855`）；`-wal`、`-shm` 均 present。完整 SHA-256 见 `logs/capture-dry-run.out.log`；步骤 2 的清单见 `logs/slot-demo-capture.out.log`。

**未做：** `-Stub pass` 演练（本版本 SLOT 无改动）。
