# DEMO-16 桩演练记录（`slot-run -Stub`，时段前，D460 行动 4 / TEMPLATE 第 12、16 条）

状态：**演练已做，真实时段尚未申请**。等协调者审阅本记录并安排 D478 式安静时段后再申请；不打 tag。

## 1 做了什么

- 基线：本分支提交 `b485c4f1f603311112a0367f3f3fc6a577291661`（`status=[]`，工作区干净；其上只有 docs 提交，产品代码基线 main `00d1ed4`）。
- 命令（外层 `powershell.exe -NoProfile -Command "pwsh -NoProfile -File ... ; exit $LASTEXITCODE"`），**手动 1 次**，无重试：
  `pwsh -NoProfile -File scripts\slot\slot-run.ps1 -OutDir <临时目录，仓库外> -StepsFile docs\demo\v0.15.0\scripts\steps-demo16.ps1 -Ports 4203 -Stub pass`
- 结果：退出码 **0**。日志 [`logs/slot-summary-stub.log`](logs/slot-summary-stub.log)（UTC 2026-11-23 19:58）：
  - 首行 `runner start head=b485c4f… rules=R3 ports=4203 status=[]`；第二行 `tooling head=b485c4f…`（本次工具与应用在同一工作树）。
  - `ports free phase=before-preflight ports=4203` 与 `phase=before-steps` 各一次，端口 4203 空闲。
  - head 静态预检 `exit=0 new-keys=0 reduced-keys=0`（`tsc errors=0`，基线 `{}`）；没有 `-BaseRoot`，base 预检按设计跳过。
  - 构建完成，dist 比 HEAD 提交新（`newer=True`）。
  - `STUB MODE pass: no browser, no vitest`；步骤 `demo-capture` 实际执行的是桩替换的 `node -e "console.log('stub demo-capture ok')"`，`exit=0`（[`logs/stub-demo-capture.out.log`](logs/stub-demo-capture.out.log)）。**子进程是 node，不是 `powershell.exe`。**
  - 桩模式的进程预检只采 1 次样且不作门控：`counted=2`；步骤后 `counted=3`。这些是别的 ai-native-erp 会话的 `npm ci` 等进程（规则 SR-C2），不是本会话的 node/vitest；真实运行会在这里以 exit 2 中止，所以**真实时段需要安静时段**。SR-X1 / SR-X5 排除了其他项目与系统进程（完整列表在 runner 的 `excluded.tsv`，本机临时文件，不入库）。
- 没有碰 4173；没有启动应用服务器；没有启动浏览器；没有打开端口 4203。

## 2 `-Stub` 证明什么、不证明什么（S15 回顾行动 4）

桩只证明 runner 的编排：steps 文件能被加载、`-Ports` 参数与端口空闲检查、预检与构建、日志中的 `runner start head=` / `tooling head=` 行、步骤退出码传递。它**没有**执行 `run-main.ps1` 和 `capture.mjs`，子进程也不是真实路径上的 `powershell.exe`，所以以下**未经实跑验证**：

| 项 | 状态 |
| --- | --- |
| `run-main.ps1`：迁移、启动、seed、就绪检查、清理 | 未跑（脚本由 v0.14.0 的 `run-main.ps1` 改来，只改了 `capture.mjs` 的路径和就绪文字；v0.14.0 的版本在 DEMO-15 真实时段跑通过）。启动 node 服务需协调者批准（D442），本次没有申请 `-SkipCapture` 演练。 |
| `seed-credit.mjs` | 复用 v0.14.0 的脚本，未改（见下）；DEMO-15 真实时段跑通过。本次未重跑。 |
| `capture.mjs` 的断言 | **全新脚本，没有跑过**。只做了源码对照：标签取自 `packages/web/src/ui/trade-order-labels.ts`（`tord.creditedQuantity`：“贷项冲回数量” / “Credited qty”；`tord.lines`、`tord.preview`、`tord.save`），列顺序取自 `packages/web/src/trade-orders/order-view.tsx`，最小宽 1040 px 取自 `packages/web/src/pages/trade-orders.css:97`。选择器（`div.grid-wrap`、表的 `aria-label`）可能与真实页面有出入，第一次真实运行才会暴露。 |

建议：真实时段前先批准一次**不带浏览器**的 `run-main.ps1 -SkipCapture` 演练（只起服务器和 seed，约 1 分钟，端口 4203），可提前发现 seed 与启动问题；但它也不覆盖 `capture.mjs` 的选择器。

## 3 脚本哈希（取自 git）

`git rev-parse b485c4f:<路径>`（`git hash-object` 的 blob 哈希，不是 SHA-256 内容摘要；这是该路径在运行提交中的对象 ID）：

| 脚本 | blob |
| --- | --- |
| `docs/demo/v0.15.0/scripts/capture.mjs` | `d15742f6d6dd3867b10b05c1487e31965b522d6a` |
| `docs/demo/v0.15.0/scripts/run-main.ps1` | `c9d656f60b23739f3880a18aa648e3b8a9753dd1` |
| `docs/demo/v0.15.0/scripts/steps-demo16.ps1` | `a5860c0b63aae33456e3776deb366c32ce305fcf` |
| `docs/demo/v0.14.0/scripts/seed-credit.mjs`（复用） | `80ea925377eeedf6b254d3d695f22c123f454f59` |

真实时段后，以真实运行的提交重新取一次并与本表对照；脚本在本表之后若有改动，必须重做桩演练。

## 4 D457 的两项

- 每页（每个语言、每个宽度）一个全新的 browser context：`capture.mjs` 的 `contextFor()` 在每个截图循环里调用，页面结束 `context.close()`。
- 桩演练：本记录。

## 5 真实时段申请

- 规则版本 **R3**，`-Ports 4203`，D444 单次手动、不重试。
- 真实运行要求所有 ai-native-erp 会话（含 S17 开发者）安静：SR-C2 仍计入它们的 node / vitest；SR-X6（归属未知的 `node.exe`）不计数但会完整记录。
- 申请前由 `slot-run.ps1` 自己的预检等待连续 6 次 counted=0（最多 15 分钟，超时则中止不重试）。
