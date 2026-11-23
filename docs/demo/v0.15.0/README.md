# Demo v0.15.0（S16：订单详情“贷项冲回数量”列、订单页拆分后的外观、390 px 记录）

**状态：真实时段已运行（2026-11-23，R3，端口 4203，退出码 0），6 张截图已在 `screenshots/`。** 演练记录见 [`run-through.md`](run-through.md)。按 `design/tasks/S16.md` 的 DEMO-16 验收。运行环境（真实时段时）：临时演示账套 `erp-demo-<guid>`，端口 **4203**（不是 4173），不连接真实账套、`.bak`、用户主检出。

## 1 计划拍摄（共 6 张，截图在 [`screenshots/`](screenshots/)）

| 名称 | 页面（路由） | 宽度 / 语言 / 主题 | 证明什么 |
| --- | --- | --- | --- |
| `trade-orders-entry-zh-red-1440`、`-en-green-1440` | 订单页（`#/trade-orders`，录入区） | 1440，教学说明开 | REFAC-05b 拆分后订单录入页正常渲染：命令条有“预览 / 保存订单”各 1 个按钮，录入用的订单行表存在 |
| `trade-orders-detail-zh-red-1440`、`-en-green-1440` | 点订单号 PO-C1 后的订单详情 | 1440 | 订单行表第 8 列“贷项冲回数量 / Credited qty”紧跟“未开票数量”，L1：数量 10、已开票 6、未开票 4、冲回 4（TORD-08） |
| `trade-orders-detail-zh-red-390-before-scroll`、`-after-scroll` | 同一订单详情 | 390，zh-red | K7：滚动前后各一张；文档不横向溢出，表格在 `div.grid-wrap` 内横向滚动，滚到新列后该列完整落在容器内 |

PO-C1 的造数复用 [v0.14.0 的 `seed-credit.mjs`](../v0.14.0/scripts/seed-credit.mjs)（不复制）：订单 L1 订购 10 × 10；开票 10；对该发票 L1 贷项 4。TORD-08 的新列显示冲回 4，已开票 6、未开票 4。

## 2 口径

- 订单录入页和订单详情的断言是**内容断言**（具体文字、列顺序和数字），拍错即中止；订单录入页只证明“能正常渲染、关键控件在”，**不证明逐像素不变**（没有与 v0.14.0 的对比图）。溢出、滚动位置、页面错误只记录（D440 / D441、TEMPLATE 第 14、15 条）。
- **390 px 记录（K7）**：`document.documentElement.scrollWidth`（期望 ≤ 390）；`div.grid-wrap` 的 `scrollWidth` 与 `clientWidth`（期望前者更大）；把“贷项冲回数量”表头 `scrollIntoView({inline:"nearest"})` 之后，记录容器的 `scrollLeft` 与容器、表头、L1 行该列单元格三个 `getBoundingClientRect()`，列矩形须完整落在容器矩形内。结果写入 `capture-log-main.json` 的 `k7` 条目，真实运行后抄进本文 §3。最小宽 1040 px 的出处是 `packages/web/src/pages/trade-orders.css:97`。
- D457：每页每语言每宽度一个新 browser context；先做桩演练（已做，见 `run-through.md`）。
- 脚本：`scripts/capture.mjs`、`run-main.ps1`、`steps-demo16.ps1`（以及 v0.14.0 的 `seed-credit.mjs`）。Demo 证据脚本，按 D446 例外，不属于产品与 CI 代码。
- 运行：标准 `scripts/slot/slot-run.ps1 -OutDir <仓库外目录> -StepsFile docs\demo\v0.15.0\scripts\steps-demo16.ps1 -Ports 4203`，规则版本 R3，不跳预检；手动 1 次，不重试（D444）；连续 6 次采样为 0 才开始（D308）。

## 3 真实运行结果

- 命令（从应用 worktree 运行，一次，不重试）：`pwsh -NoProfile -File <tooling>\scripts\slot\slot-run.ps1 -OutDir <仓库外目录> -StepsFile docs\demo\v0.15.0\scripts\steps-demo16.ps1 -Ports 4203`，退出码 **0**，规则版本 R3。
- `runner start head=c7dd7cc3e160f2d29160135a6e8184f99dbc2af8`（`status=[]`，即 #269 的头）；`tooling head=93d5b0419bf08289b4193f7ec1d065fcada52485`（main，含 R3 / SR-X6）。
- 预检连续 6 次 `counted=0`，之后 `step demo-capture exit=0 counted-after=0`；端口 4203 事后无监听。完整日志：[`logs/slot-summary-real.log`](logs/slot-summary-real.log)、[`logs/processes-real.tsv`](logs/processes-real.tsv)、[`logs/preflight-head-real.log`](logs/preflight-head-real.log)、[`logs/demo-capture-real.out.log`](logs/demo-capture-real.out.log)、[`logs/capture-log-real.json`](logs/capture-log-real.json)。
- SR-X6 行（[`logs/sr-x6-lines-real.tsv`](logs/sr-x6-lines-real.tsv)）：2 条，均为命令行不可读的 `chrome-headless-shell.exe`（pid 58536、90812），父进程是本次运行自己的 Chrome，不计数，已完整记录。
- 产品代码基线：`git diff --name-only 00d1ed4 HEAD -- packages` 为空（以 v0.15.0 的产品基线 00d1ed4 计）。`scripts/` 与 00d1ed4 的差异是 `scripts/slot/` 下的 6 个文件（SLOT-03 的 `-Ports` / SR-X6 等，运行用的是 tooling 的 main 版本），不影响产品。
- 内容断言全部通过（拍错即中止）：订单录入页（zh-red、en-green）命令条“预览 / 保存订单”各 1 个、录入行表 1 个；订单详情 PO-C1 L1：数量 10 / 已开票 6 / 未开票 4 / 冲回 4，共 13 列，“贷项冲回数量”在第 8 列（索引 7），紧跟“未开票数量”。
- **390 px 记录（K7，`capture-log-real.json` 的 `k7` 条目）**：滚动前后 `document.documentElement.scrollWidth` 都是 **390**（≤ 390）；`div.grid-wrap` 的 `scrollWidth` **1040** > `clientWidth` **316**；`scrollIntoView` 之后 `scrollLeft` = 335，容器矩形 left 36 / right 354，“贷项冲回数量”表头 left 230.2 / right 352.9，L1 行该列单元格 left 230.2 / right 352.9，均完整落在容器内。滚动前该列在容器之外（left 565.2 / right 687.9）。

| 截图 | 内容 |
| --- | --- |
| [`trade-orders-entry-zh-red-1440.png`](screenshots/trade-orders-entry-zh-red-1440.png) | 订单页录入区，中文、专业红 |
| [`trade-orders-entry-en-green-1440.png`](screenshots/trade-orders-entry-en-green-1440.png) | 订单页录入区，English、绿色主题 |
| [`trade-orders-detail-zh-red-1440.png`](screenshots/trade-orders-detail-zh-red-1440.png) | PO-C1 详情，“贷项冲回数量”列（中文） |
| [`trade-orders-detail-en-green-1440.png`](screenshots/trade-orders-detail-en-green-1440.png) | PO-C1 详情，“Credited qty”列（English） |
| [`trade-orders-detail-zh-red-390-before-scroll.png`](screenshots/trade-orders-detail-zh-red-390-before-scroll.png) | 390 px，滚动前 |
| [`trade-orders-detail-zh-red-390-after-scroll.png`](screenshots/trade-orders-detail-zh-red-390-after-scroll.png) | 390 px，新列滚入容器后 |

**运行前的首次干跑失败（D481）**：第一次直接运行 `run-main.ps1 -Shots <临时目录>`（头 c7dd7cc，退出码 1）在“服务器就绪”处报 `not ready`，原因是新建应用 worktree 里没有 `packages\web\dist`（`run-main.ps1` 不构建，真实的 `slot-run.ps1` 才构建）。这是干跑流程的缺口，不是脚本缺陷；已停下上报，未进入后两步，输出在仓库外临时目录、未入库。协调者按 D481 批准在应用 worktree 先 `npm run build` 一次（流程修正，不算重试），再依次做下面的干跑与真实运行。详见 `run-through.md` §6。
运行前的两次演练（不在本节日志里）：`-Stub`（见 `run-through.md`）；按 D481 在同一应用 worktree 先 `npm run build`，再 capture 干跑一次（出 6 张图，退出码 0）、`run-main.ps1 -SkipCapture` 一次（退出码 0）。这两次的输出写入仓库外临时目录，未入库。
## 4 偏差与没做的事

- 没有 REFAC-05b 前后的对比图；没有首屏字节的 Demo 对比，字节数见发布说明（取自 #262、#265 正文，未重测）。
- 订单录入页只拍了录入区，没有演练“保存订单”或“预览”的写入流程（Demo 不证明这些流程）。
- `-Stub` 不运行步骤脚本；`run-main.ps1` 与 `capture.mjs` 的真实行为由 §3 的真实运行验证（先前为空白，见 `run-through.md` §6 的 D481 记录）。
