# DEMO-17 桩演练记录（`slot-run -Stub`，时段前）

状态：**演练与真实时段都已完成**（真实运行见 [`README.md`](README.md) §3）。不打 tag。

## 1 做了什么

- 基线：本分支提交 `2b696ce2a8effdd09e7e14660f96ecaeadfd3ea8`（`status=[]`），其上只有 docs；产品代码基线 main `35df068`（Full 45263713443 绿）。
- 命令，手动 1 次，无重试：
  `pwsh -NoProfile -File scripts\slot\slot-run.ps1 -OutDir <临时目录，仓库外> -StepsFile docs\demo\v0.16.0\scripts\steps-demo17.ps1 -Ports 4203 -Stub pass`
- 结果：退出码 **0**。日志 [`logs/slot-summary-stub.log`](logs/slot-summary-stub.log)：首行 `runner start head=2b696ce…`，第二行 `tooling head=2b696ce…`；端口 4203 空闲；head 静态预检 `new-keys=0 reduced-keys=0`；构建完成且 dist 比 HEAD 新；`STUB MODE pass`；步骤 `demo-capture` 实际执行的是桩替换的 `node -e`，`exit=0`（[`logs/stub-demo-capture.out.log`](logs/stub-demo-capture.out.log)）。
- 桩模式预检只采一次样且不门控：`counted=0`，被排除的进程（SR-X1 / SR-X5）见日志。
- 没有碰 4173，没有启动应用服务器、浏览器，也没有开 4203。

## 2 `-Stub` 证明什么、不证明什么

只证明 runner 编排（steps 文件可加载、`-Ports`、预检、构建、`head=` 行、退出码传递）。它**没有**运行 `run-main.ps1` 和 `capture.mjs`，以下**未经实跑验证**：

| 项 | 状态 |
| --- | --- |
| `run-main.ps1` | 由 v0.15.0 的版本改来，只改了 `capture.mjs` 的路径和文字；未跑 |
| `capture.mjs` | **全新脚本，没有跑过**，只做了 `node --check` 语法检查 |
| 选择器假设 | 页面标题 `.page-header h2`、发票页筛选 `#tinv-filter-*`、方向选项值 `AR`、列表接口的查询参数名 `side` / `party` 来自源码阅读，未在浏览器里验证；真实时段内的 capture 干跑负责验证 |
| `seed-*.mjs` | 复用旧脚本，未改，本次未重跑 |

按 TEMPLATE 第 12 条，真实时段内先做 capture 干跑（需要浏览器）。结果：干跑中 `capture.mjs` 的选择器（标题、发票筛选 id、方向值 `AR`、查询参数 `side`）全部命中，没有修补脚本；见 §5。

## 3 脚本哈希（取自 git）

`git rev-parse 2b696ce:<路径>`（blob 对象 ID，不是内容 SHA-256）：

| 脚本 | Stub（2b696ce） |
| --- | --- |
| `docs/demo/v0.16.0/scripts/capture.mjs` | `69d5037f432fd9e4c068dd7f35af1c5f705df0b9` |
| `docs/demo/v0.16.0/scripts/run-main.ps1` | `e26a0dd6339fb0b4cf67041ce903e255d78c3561` |
| `docs/demo/v0.16.0/scripts/steps-demo17.ps1` | `0ca1725758c47b26753742068dfffa1a15f39626` |
| `docs/demo/v0.14.0/scripts/seed-credit.mjs`（复用） | `80ea925377eeedf6b254d3d695f22c123f454f59` |

如果之后脚本再改，真实运行前会重新记录各列。

## 4 真实时段申请

- 规则版本 **R3**，`-Ports 4203`，D444 单次手动、不重试。
- 序列（TEMPLATE 第 17 条）：两个 worktree 的 `npm ci` 先完成 → 安静时段 → `npm run build`（应用 worktree）→ capture 干跑 → `run-main.ps1 -SkipCapture` → 真实 `slot-run.ps1 -Ports 4203`。任一步失败即停并上报。
- 只允许 FIX-TADJ-BUSY 在途（尚未派发）。SR-X6 行逐字记录采样器输出的 reason，不自行推断。

## 5 真实时段记录（D484 授权）

- 干跑与 `-SkipCapture` 一次，真实运行一次，均退出码 0，无重试，无 D481 式缺口：`npm run build` 先在 app worktree 做了一次。注意：“capture 干跑”实际是不带 `-SkipCapture` 的 `run-main.ps1`（含 capture，8 张）。
- 真实运行：`runner start head=6b33135…`，`tooling head=26b16b0…`（见 README §3）。
- 脚本哈希（`git rev-parse 6b33135:<路径>`）：`capture.mjs` `69d5037f…`、`run-main.ps1` `e26a0dd6…`、`steps-demo17.ps1` `0ca17257…`、`seed-credit.mjs` `80ea9253…`，与 §3 的 Stub 列相同（Stub 之后脚本没有改）。
- FIX-TADJ-BUSY 没有在窗口内运行；按 D484 推迟，不在 v0.16.0。
