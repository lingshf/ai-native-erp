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
| 10 | **通过，exit 0** | 18 张截图 + `capture-log-main.json` |

## 取证摘要（`shots/capture-log-main.json`）

- **TSET-01**：5 个未结项，选 1 项；拦截请求使其中一项在刷新后缺失，提示出现；键盘 Tab 1 次到“移除这些项”，Enter 后提示消失、只移除缺失项、焦点回到“刷新列表”。390 宽度 scrollWidth = 390。
- **TMAS-01**：`30.0`、`1e2`、`0x10`、`3651` 四种输入均显示 `data.dueDays: 请输入 0–3650 的整数。`（en：`Enter a whole number from 0 to 3650.`），写请求数为 0。
- **BUG-01**：维度为空时“维度值”禁用；Tab 越过它到“查询”；空维度下 Enter 不改变 hash（无孤立 `value=`）；填维度后可输入 `X1`；清空维度后值被清空并禁用；无校验错误提示。
- **BUG-03**：仅改 API 校验顺序，界面不可见，不截图。

## 未做

- 未做 bundle 体积测量：本 RC 的 Demo 范围（TSET-01、TMAS-01、BUG-01）不含该项，需要时另行安排。
- 未打 tag、未发布 Release（均未获授权）。
