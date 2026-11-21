# v0.7.0 Demo 运行记录

状态：第一个独占时段（D227）在 seed-orders 步中止；已修脚本（D228）、补替身并做了无浏览器的真实服务演练；第二个时段（D229）成功，16 张截图已入库。评审（D230）后复跑脚本又有修订，**修订版只经过替身验证，没有真实复跑**；16 张截图和日志由提交 `0d10871` 的脚本采集，不算在修订版名下。

## 脚本版本一：第二个时段（D229）实际运行的脚本（提交 `447c645`，运行时分支 head `0d10871`）

| 脚本 | git blob SHA |
|---|---|
| `scripts/capture.mjs` | `aaea9fb9ff85063c6769b916a09d46bebdf4eaf4` |
| `scripts/seed-orders.mjs` | `b3f5051f8269e5e8845b907b7c23a4220e1c5013` |
| `scripts/seed-orders-stub.mjs` | `1ad56601b81fb9471d73d682fec7cf1bc5267608` |
| `scripts/run-main.ps1` | `0498df2f0c144475d28987b42424e89711cd9bb4` |
| `scripts/stub-check.ps1` | `a0e4996793399da0aec83e0266287051e30ee1d6` |

第一个时段用的是提交 `27de52e`：`seed-orders.mjs` 为 `8e9f9a7c793e014aece5c4f3d32b5cf945daafa2`，`stub-check.ps1` 为 `445701f6413662dfc9d71cd7e867dc2d1ec50a55`，其余相同。`0d10871` 到时段 2 采集之间脚本没有变化。这一版是 16 张截图的采集脚本；后来评审指出的两处缺陷（第二个 seed 前无归属检查、固定共享截图暂存目录）属于这一版，修订见下。

## 第一个时段（D227，已中止）

- 11:53:14–11:54:07 连续 6 次 precheck 均为 0。可复制的预检命令见本文“预检命令”一节；时段 1 当时的原始命令没有保存，这里给的是同一规则的等价写法，不是原命令。第一次误用了更宽的匹配，把 `conhost --headless` 和 shell 自身算进去得 9，纠正后重做，没有动任何进程。
- `npm run build` 成功；`run-main.ps1` 迁移、启动、两条 seed 后，`seed-orders.mjs` 创建 SO-F3（销售，商品 EXPENSE）返回 `400 api.error.tradeDocument.product`：EXPENSE 是采购商品，没有收入科目，销售单不能用。PO-F1、PO-F2 已 201。capture 未执行，没有截图，未复制，脚本 `throw` 后 `finally` 清理：端口 4199 已释放、无 `erp-demo-*`。
- 时段 1 实跑命令：与时段 2 相同的 README §4 整块（当时脚本为 `27de52e` 版），原始输出没有保存，上面的结果来自当时的汇报记录。\n- 原因：`seed-orders.mjs` 的缺陷；第一版替身不执行 `seed-orders.mjs`，覆盖不到。按规则没有重试。

## 修复与新增检查（D228）

- `seed-orders.mjs` 先用 API 建服务类商品 `SERVICE`（`type: service`、`revenueAccount: 4000`，与 `tradeProduct` 校验一致），销售单改用它。
- 新增 `seed-orders-stub.mjs`：在回环临时端口起假 HTTP 服务（按产品规则拒绝没有收入科目的商品），原样运行 `seed-orders.mjs`，断言请求序列（先建商品，再 4 张订单）、AR 商品有收入科目、缺少财年参数时失败。对旧版 `seed-orders.mjs` 运行，它报 3 个问题并退出 1（复现第一个时段的失败）；对新版退出 0。`stub-check.ps1` 在场景之前调用它。
## 预检命令（可复制）\n\n`node`/`chrome`/`msedge`/`chrome-headless-shell` 进程中，命令行含 vitest、playwright 或 headless 的个数；独占时段要求连续 6 次均为 0（10 s 采样）：\n\n```powershell\n1..6 | ForEach-Object {\n  $n = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(node|chrome|msedge|chrome-headless-shell)(\.exe)?$' -and $_.CommandLine -match 'vitest|playwright|headless' }).Count\n  "{0:HH:mm:ss} {1}" -f (Get-Date), $n\n  if ($_ -lt 6) { Start-Sleep 10 }\n}\n```\n\n时段 2 当时的原始预检日志在 `$env:TEMP\s7-precheck2.log`（未入库）；上面的命令是同一规则的可复制写法，没有把它冒充成当时的原命令。\n\n## 无浏览器替身检查（D208，脚本版本一）

命令（仓库根目录）：

```powershell
powershell -NoProfile -File docs\demo\v0.7.0\scripts\stub-check.ps1
```

结果（当前版本）：退出码 0，`ALL ASSERTIONS PASSED (10 scenarios + seed-orders stub)`。替身只在专用临时目录里读写，运行前后真实截图目录（只有哨兵 `.gitkeep`）SHA256 不变，git 状态干净，专用目录已删除。未启动 Chrome、Playwright、Vitest，没有启动浏览器；唯一的监听是 `seed-orders-stub.mjs` 在回环临时端口起的假 HTTP 服务，只活在那一步（不是产品服务，更不是 4199/4173）。假服务 PID 111；不属于本轮的监听进程 999 在任何场景都没有被停止。

| # | 场景 | 抛出 | Copy-Item | seed-orders | capture | 停止的 pid | 残留 |
|---|---|---|---|---|---|---|---|
| 1 | 成功 | 否 | 1 | 1 | 1 | 111 | 0 |
| 2 | capture 退出 3 | `capture failed, exit 3` | 0 | 1 | 1 | 111 | 0 |
| 3 | 构建失败 | `构建失败` | 0 | 0 | 0 | 无 | 0 |
| 4 | 启动前端口被占 | `port busy` | 0 | 0 | 0 | 无 | 0 |
| 5 | 启动后监听进程不是本轮的 | `owner mismatch` | 0 | 0 | 0 | 111 | 0 |
| 6 | seed 后监听进程不是本轮的 | `owner mismatch after seed` | 0 | 1 | 0 | 111 | 0 |
| 7 | seed-orders 失败 | `seed-orders` | 0 | 1 | 0 | 111 | 0 |
| 8 | 就绪清单：缺订单 SO-F4 | `readiness: order SO-F4 missing` | 0 | 1 | 0 | 111 | 0 |
| 9 | 就绪清单：缺伙伴 PARTY2 | `readiness: partner PARTY2 missing` | 0 | 1 | 0 | 111 | 0 |
| 10 | 截图数 15 | `截图数 15，不是 16，不复制` | 0 | 1 | 1 | 111 | 0 |

替身首次运行（修复前）时，场景 7–9 的假端口查询队列比实际多一次，`finally` 里误报“port still listening”；这是替身队列写错，不是脚本问题，已改为短队列后重跑，上表是重跑结果。

## 替身不能证明的事

- 替身不执行 `capture.mjs`；其中对筛选请求参数、列表行数、日期错误无请求的断言，只有真实运行才验证（`capture.mjs` 并不断言 `aria` 属性；日期错误靠 `#tord-filter-range-error` 的文字与“无请求”核对）。`capture.mjs` 通过了 `node --check` 语法检查，选择器与 id 对照了 `TradeOrders.tsx`，但在替身与无浏览器演练阶段没有在浏览器里跑过；真实浏览器运行只发生在时段 2（见下）。
- 假服务的规则是对产品规则的手写近似；是否被真实服务接受，由下面的真实服务演练验证。

## 无浏览器的真实服务演练（D228，提交 `447c645`）

用 `run-main.ps1` 去掉 capture 一行的临时副本（放在 `$env:TEMP`，用后删除，不入库），对真实服务执行：临时账套迁移 → prepare → 启动（端口 4199，pid 与监听归属核对）→ seed-trade → seed-orders → 就绪清单 → 清理。不启动 Chrome、Playwright、Vitest。

输出摘要：`ready port=4199 pid=29000`；`posted product SERVICE 201`；PO-F1、PO-F2、SO-F3、SO-F4 均 201；`readiness ok: partners and 4 orders present`；`port 4199 released`。结束后无监听 4199、无 `erp-demo-*`，工作区只有预期改动。

## 无浏览器的真实服务演练：命令\n\n演练用的是 `run-main.ps1` 去掉 capture 一行的临时副本，副本和原始终端输出没有保存；复现方法是复制 `scripts/run-main.ps1`，删去 `capture.mjs` 那一行，用 `-Shots` 以外的版本参数照旧调用（脚本版本一不含 `-Shots` 参数，直接运行）。上面“输出摘要”来自当时汇报，如实说明：不是可重放的保存日志。\n\n## 真实运行（第二个时段，D229，脚本版本一）

- 运行对象：提交 `0d10871`（脚本提交 `447c645`），开跑前 `git status --porcelain` 为空；与产品基线 main `f06d30c` 的产品代码相同（本分支只改文档与 Demo 脚本）。
- 预检：11:57:36–11:58:28 连续 6 次，均为 0（10 s 采样，日志 `$env:TEMP\s7-precheck2.log`；规则：node / chrome / msedge 进程命令行含 vitest、playwright、headless）。
- 命令：README §4 整块，一次。`npm run build` 退出 0（约 3 s）；`run-main.ps1`：就绪 `ready port=4199 pid=50000 start=11:58:44`；`posted product SERVICE 201`，PO-F1、PO-F2、SO-F3、SO-F4 均 201；`readiness ok: partners and 4 orders present`；capture 输出 `[]`（无横向溢出、无错误）、`shots 16`、`capture exit 0`；`port 4199 released`；截图数 16，已复制。全程 39 s。
- 清理：端口 4199 已释放，无 `erp-demo-*`，无 vitest / playwright / headless 进程，时段已释放。
- 页面核对（`capture-log-main.json`，4 个组合一致）：无筛选 4 行（首次请求只带 `company`、`limit`）；仅伙伴 PARTY 2 行；伙伴 + 销售 + 日期区间 1 行（SO-F3）；清除后 4 行且四个控件清空；PARTY2 + 销售 + 截止 10-31 无结果，显示“没有符合条件的订单。” / “No orders match the filters.”；起始 12-01 晚于截止 11-01 时显示日期错误，没有发请求，列表仍 4 行。每个组合 6 次列表请求，0 个页面错误、0 个 ≥400 响应。
- 截图：16 张，在 `screenshots/`（`trade-orders-filter-{all,combined,no-match,range-error}-{zh-red-1440,zh-red-390,en-green-1440,en-green-390}.png`），另有 `capture-log-main.json`。截图前 `assertState` 通过。人工抽看了 zh/1440 日期错误与 en/390 组合筛选两张，内容与预期一致，教学说明里有“列表筛选……不会被记忆”的句子。
- 已知控制台错误：无。
- 未实跑：见 README §5。第一个时段的中止见上文。

## 评审后修订（D230）：脚本版本二

范围：`scripts/run-main.ps1`、README §4 复跑块、`scripts/stub-check.ps1`。`capture.mjs`、`seed-orders.mjs`、`seed-orders-stub.mjs` 不变；16 张截图和 `capture-log-main.json` 保留，由脚本版本一（`0d10871`）采集。

1. 第二个 seed（`seed-orders.mjs`）之前，独立检查服务仍在且端口监听属于本轮（`owner mismatch before seed-orders`）。
2. 截图暂存目录改为每轮唯一的 `$env:TEMP\demo-s7-shots-<GUID>`，作为 `-Shots` 参数传给 `run-main.ps1`；README 复跑块只在 `finally` 里删除自己创建的、名字以 `demo-s7-shots-` 开头的这个目录，不再递归删除固定共享目录。端口检查在 `run-main.ps1` 一开始，目录清理只发生在检查之后的 `finally`，且只针对本轮目录，因此端口被占时不会碰任何目录。
3. `stub-check.ps1`：新增场景 5b（第二个 seed 前归属变化：断言 seed-trade 已调用 1 次、seed-orders、capture、Copy-Item 均 0 次，停止 pid 111）；新增 `seed-trade` 调用计数断言；每个场景前预存两个目录（固定名 `demo-s7-shots` 和他轮目录 `demo-s7-shots-other-run`，各放一个哨兵文件），每个场景后断言它们未被读、复制、删除，且本轮唯一目录无残留。

### 替身验证（脚本版本二，无浏览器、无 Vitest、无时段）

```powershell
powershell -NoProfile -File docs\demo\v0.7.0\scripts\stub-check.ps1
```

- 结果：退出码 0，`ALL ASSERTIONS PASSED (11 scenarios + seed-orders stub)`。
- 对照：把 `run-main.ps1` 和 README 临时还原到脚本版本一（`0d10871`）运行同一份替身，退出 1，报告“预存目录被动过”（所有场景）、5b 抛错不符、seed-orders 调用 1 次而非 0 次、场景 6 抛错不符；随后恢复，`git status` 只有预期的三处修改。
- 同样的启动与监听说明：替身阶段没有启动浏览器；唯一监听是 `seed-orders-stub.mjs` 的回环假 HTTP 服务。
- 结论：**脚本版本二只经过替身验证，没有真实服务运行，也没有浏览器运行。** 时段 2 的真实运行证据、16 张截图和 `capture-log-main.json` 属于脚本版本一，不归给版本二。若需要版本二的真实复跑证据，需另申请独占时段。

脚本版本二 blob SHA（提交后固定）：

| 脚本 | git blob SHA |
|---|---|
| `scripts/run-main.ps1` | `RUNMAIN` |
| `scripts/stub-check.ps1` | `STUBCHECK` |