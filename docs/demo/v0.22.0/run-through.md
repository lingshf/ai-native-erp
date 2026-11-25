# v0.22.0 RC2 Demo 运行记录（DEMO-23）

## SHA 角色

| 角色 | SHA |
|---|---|
| 被演示的产品代码 | `13a4199ec1e6b45904f0106e905d7d5cf21fb11c`（Full run 45529505073） |
| 演示应用工作树（detached） | `f8558cc82834ed0223b205e3891c45f02ffde02d`（RC2 分支头，仅比上行多文档） |
| 演示工具工作树（detached，slot-run 脚本） | `6f34423`（main 当时的提交） |
| 依赖 | `npm ci` 两个工作树均 exit 0，lock blob `07c1aee8b9c3392b88c25f9bb670adbbc8f19201`，`git status` 干净；无依赖变更 |
| 构建 | `npm run build` exit 0（`logs/build-app.log`），dist 新于 HEAD |

## 步骤与结果

1. 窗口前：`gate-pre.tsv` 显示无 node 进程，4205 与 4173 均无监听（exit 0，errors=0）。
2. 窗口前强制 `-SkipCapture` 空跑：exit 0，“port 4205 released”（`logs/skipcapture.out.log`）。
3. 窗口 2026-11-24 18:11:53（-08:00）起，协调者已按 D583 批准；窗口内进程快照 11 次，errors=0，timedOut=false（`logs/gate-window.*`）。
4. 捕获脚本 `scripts/capture.mjs` 是新脚本，窗口内先做试运行（下表 1–9），第 10 次为最终运行，exit 0。
5. 结束前运行脚本打印文件清单与 SHA-256（含 `-wal`、`-shm`），随后删除临时账套并释放 4205；清单见 `logs/capture-attempt10.out.log`。
   - `demo.sqlite` 647168 B，`A256A260970DB5BB24E6DE97EC23A2D1A603EB3890B157BBF55749EF69014877`
   - `demo.sqlite-wal` 1878752 B，`2DBE2404EF981AA8F0E51BFD52CEC18F5A92E0826E3E908FD0C5E8A3F30E08DD`
   - `demo.sqlite-shm` 32768 B，`0E9B918AE25826BD133AB14D9345103B48BFD052595E4CE2D5890AC110B5F618`
   - 三个 `.users` 空文件，各 0 B。
6. 窗口关闭约 18:22:48；快照工具正常退出（exit 0）。

## 试运行失败与修正（如实记录）

| 次 | 结果 | 原因与修正 |
|---|---|---|
| 1 | 失败 | “选择未结项”选择器同时匹配了禁用的折扣复选框；收窄为 `:enabled` |
| 2 | 失败 | 第二个未结项处于禁用状态（AR）；改为只选一项 |
| 3–4 | 失败 | 选中一项后其余锁定，脚本仍尝试多选；改为 `picked = 1` |
| 5 | TSET-01 通过，TMAS-01 失败 | 输入 `30.0` 回车后没有出现 alert |
| 6 | TMAS-01 再失败 | 加诊断截图：浏览器原生 `required` 拦截，必填“名称”未填 |
| 7 | 脚本语法错误 | 修正时误留一行 `+`；`node --check` 后再跑 |
| 8 | TMAS-01 通过，BUG-01 失败 | 走了“只读报表→试算平衡表”（旧账快照页），不是总账 |
| 9 | BUG-01 失败 | 同上，诊断截图确认；改为直接进入 `#/ledger?company=DEFAULT` |
| 10 | **通过：capture 子步骤 exit 0** | 17 张 PNG（TSET-01 5、TMAS-01 4、BUG-01 8）+ `capture-log-main.json`（JSON 不计截图） |

## 取证摘要（`shots/capture-log-main.json`）

- **TSET-01**：5 个未结项，只选 1 项；拦截请求使该项在刷新后缺失，提示出现；键盘 Tab 1 次到“移除这些项”，Enter 后提示消失、分配归零（`checkedBeforeRemove` 0 → `checkedAfterRemove` 0）、焦点回到“刷新列表”。**只证明能移除这一缺失项并恢复焦点，不证明其他正常选项被保留**（选一项后其余锁定，Demo 无法同时选两项；保留行为以固定基线的测试为准，不是 Demo 独立取证）。390 宽度 scrollWidth = 390。
- **TMAS-01**：脚本在同一表单内依次提交 `30.0`、`1e2`、`0x10`、`3651`，每次读到同一个 `#trade-error` 文案（zh `data.dueDays: 请输入 0–3650 的整数。`，en `Enter a whole number from 0 to 3650.`），总写请求数为 0。**`tmas01-*` 截图拍的是首次提交 `30.0` 后的状态，不是最后一次输入。只有第一个值（`30.0`）可视为独立触发的取证；后三个值的提示可能是前一次遗留的同一节点，Demo 没有在两次之间清除或重载，故不证明它们各自触发了新校验**。每个语言/主题组合有 1440 与 390 两张截图，均为首次提交 `30.0` 后的状态。
- **BUG-01**：维度为空时“维度值”禁用；Tab 越过它到“查询”；空维度下 Enter 不改变 hash（无孤立 `value=`）；填维度后可输入 `X1`；清空维度后值被清空并禁用；无校验错误提示。
- **BUG-03**：仅改 API 校验顺序，界面不可见，不截图。

## 命令与 runner 来源

- 应用工作树 `demo23-app`（detached `f8558cc82834ed0223b205e3891c45f02ffde02d`）、工具工作树 `demo23-tool`（detached `6f34423`）；两处 `npm ci` 的输出见 `logs/npm-ci-*.log`。
- 窗口前空跑命令（取自 `logs/skipcapture.out.log` 第 1 行）：`powershell.exe -NoProfile -File docs\demo\v0.22.0\scripts\run-main.ps1 -SkipCapture -Shots %TEMP%\demo23\skip -Port 4205`。
- 窗口内试跑与最终运行的命令形式相同，仅去掉 `-SkipCapture`、`-Shots` 指向 `shotsN`，环境变量 `ERP_E2E_BROWSER_CHANNEL=chrome`，在 `demo23-app` 根目录执行；每次的控制台输出为 `logs/capture-attempt<N>.out.log`。
- **偏离，须协调者处置**：窗口内是直接运行 `run-main.ps1`，没有通过 `slot-run.ps1`（`scripts/steps-demo23.ps1` 已入库但未被执行）。因此没有 slot-run 的 runner 摘要与 runner 退出码；各次的 `exit=` 只出现在会话控制台，**not retained**（日志里只有子步骤的 `capture exit 0` 或失败信息，不能当作 runner 结果）。
- 进程快照用 `gate-snapshot.ps1` 生成（`logs/gate-pre.tsv`、`logs/gate-window.tsv`；结束状态见 `logs/gate-window.out.log`）。

## 产物清单

路径、字节数与 SHA-256（取自 git blob 内容）见 [inventory.tsv](inventory.tsv)（39 个文件：17 张 PNG、JSON、日志、脚本；不含 README、run-through 与清单本身）。截图数量命令：`git ls-files docs/demo/v0.22.0/shots` 中 `.png` 共 17 个。

**not retained**（窗口内产生但未入库，已随临时目录删除，交协调者处置）：试跑 1–9 的截图与诊断图；每次的 runner `exit=` 值；两处 `npm ci` 的退出码（只在会话中记录，日志文件里没有）。临时账套按设计在清理前列出清单后删除，清单在 `logs/capture-attempt10.out.log`。
## 未做

- 未做 bundle 体积测量：本 RC 的 Demo 范围（TSET-01、TMAS-01、BUG-01）不含该项，需要时另行安排。
- 未打 tag、未发布 Release（均未获授权）。
