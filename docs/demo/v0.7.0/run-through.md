# v0.7.0 Demo 运行记录

状态：第一个独占时段（D227）在 seed-orders 步中止；已修脚本（D228）、补替身并做了无浏览器的真实服务演练；第二个时段（D229）成功，16 张截图已入库。

## 脚本版本（第二个时段将使用，提交 `447c645`）

| 脚本 | git blob SHA |
|---|---|
| `scripts/capture.mjs` | `aaea9fb9ff85063c6769b916a09d46bebdf4eaf4` |
| `scripts/seed-orders.mjs` | `b3f5051f8269e5e8845b907b7c23a4220e1c5013` |
| `scripts/seed-orders-stub.mjs` | `1ad56601b81fb9471d73d682fec7cf1bc5267608` |
| `scripts/run-main.ps1` | `0498df2f0c144475d28987b42424e89711cd9bb4` |
| `scripts/stub-check.ps1` | `a0e4996793399da0aec83e0266287051e30ee1d6` |

第一个时段用的是提交 `27de52e`：`seed-orders.mjs` 为 `8e9f9a7c793e014aece5c4f3d32b5cf945daafa2`，`stub-check.ps1` 为 `445701f6413662dfc9d71cd7e867dc2d1ec50a55`，其余相同。真实运行使用当前版本，运行后不为“整理”再改。

## 第一个时段（D227，已中止）

- 11:53:14–11:54:07 连续 6 次 precheck 均为 0（规则：node/chrome/msedge 进程命令行含 vitest/playwright/headless）。第一次误用了更宽的匹配，把 `conhost --headless` 和 shell 自身算进去得 9，纠正后重做，没有动任何进程。
- `npm run build` 成功；`run-main.ps1` 迁移、启动、两条 seed 后，`seed-orders.mjs` 创建 SO-F3（销售，商品 EXPENSE）返回 `400 api.error.tradeDocument.product`：EXPENSE 是采购商品，没有收入科目，销售单不能用。PO-F1、PO-F2 已 201。capture 未执行，没有截图，未复制，脚本 `throw` 后 `finally` 清理：端口 4199 已释放、无 `erp-demo-*`。
- 原因：`seed-orders.mjs` 的缺陷；第一版替身不执行 `seed-orders.mjs`，覆盖不到。按规则没有重试。

## 修复与新增检查（D228）

- `seed-orders.mjs` 先用 API 建服务类商品 `SERVICE`（`type: service`、`revenueAccount: 4000`，与 `tradeProduct` 校验一致），销售单改用它。
- 新增 `seed-orders-stub.mjs`：在回环临时端口起假 HTTP 服务（按产品规则拒绝没有收入科目的商品），原样运行 `seed-orders.mjs`，断言请求序列（先建商品，再 4 张订单）、AR 商品有收入科目、缺少财年参数时失败。对旧版 `seed-orders.mjs` 运行，它报 3 个问题并退出 1（复现第一个时段的失败）；对新版退出 0。`stub-check.ps1` 在场景之前调用它。
## 无浏览器替身检查（D208）

命令（仓库根目录）：

```powershell
powershell -NoProfile -File docs\demo\v0.7.0\scripts\stub-check.ps1
```

结果（当前版本）：退出码 0，`ALL ASSERTIONS PASSED (10 scenarios + seed-orders stub)`。替身只在专用临时目录里读写，运行前后真实截图目录（只有哨兵 `.gitkeep`）SHA256 不变，git 状态干净，专用目录已删除。未启动 Chrome、Playwright、Vitest，未监听端口。假服务 PID 111；不属于本轮的监听进程 999 在任何场景都没有被停止。

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

- 替身不执行 `capture.mjs`；其中对筛选请求参数、列表行数、日期错误无请求、aria 属性的断言，只有真实运行才验证。`capture.mjs` 通过了 `node --check` 语法检查，选择器与 id 对照了 `TradeOrders.tsx`，但没有在浏览器里跑过。
- 假服务的规则是对产品规则的手写近似；是否被真实服务接受，由下面的真实服务演练验证。

## 无浏览器的真实服务演练（D228，提交 `447c645`）

用 `run-main.ps1` 去掉 capture 一行的临时副本（放在 `$env:TEMP`，用后删除，不入库），对真实服务执行：临时账套迁移 → prepare → 启动（端口 4199，pid 与监听归属核对）→ seed-trade → seed-orders → 就绪清单 → 清理。不启动 Chrome、Playwright、Vitest。

输出摘要：`ready port=4199 pid=29000`；`posted product SERVICE 201`；PO-F1、PO-F2、SO-F3、SO-F4 均 201；`readiness ok: partners and 4 orders present`；`port 4199 released`。结束后无监听 4199、无 `erp-demo-*`，工作区只有预期改动。

## 真实运行（第二个时段，D229）

- 运行对象：提交 `0d10871`（脚本提交 `447c645`），开跑前 `git status --porcelain` 为空；与产品基线 main `f06d30c` 的产品代码相同（本分支只改文档与 Demo 脚本）。
- 预检：11:57:36–11:58:28 连续 6 次，均为 0（10 s 采样，日志 `$env:TEMP\s7-precheck2.log`；规则：node / chrome / msedge 进程命令行含 vitest、playwright、headless）。
- 命令：README §4 整块，一次。`npm run build` 退出 0（约 3 s）；`run-main.ps1`：就绪 `ready port=4199 pid=50000 start=11:58:44`；`posted product SERVICE 201`，PO-F1、PO-F2、SO-F3、SO-F4 均 201；`readiness ok: partners and 4 orders present`；capture 输出 `[]`（无横向溢出、无错误）、`shots 16`、`capture exit 0`；`port 4199 released`；截图数 16，已复制。全程 39 s。
- 清理：端口 4199 已释放，无 `erp-demo-*`，无 vitest / playwright / headless 进程，时段已释放。
- 页面核对（`capture-log-main.json`，4 个组合一致）：无筛选 4 行（首次请求只带 `company`、`limit`）；仅伙伴 PARTY 2 行；伙伴 + 销售 + 日期区间 1 行（SO-F3）；清除后 4 行且四个控件清空；PARTY2 + 销售 + 截止 10-31 无结果，显示“没有符合条件的订单。” / “No orders match the filters.”；起始 12-01 晚于截止 11-01 时显示日期错误，没有发请求，列表仍 4 行。每个组合 6 次列表请求，0 个页面错误、0 个 ≥400 响应。
- 截图：16 张，在 `screenshots/`（`trade-orders-filter-{all,combined,no-match,range-error}-{zh-red-1440,zh-red-390,en-green-1440,en-green-390}.png`），另有 `capture-log-main.json`。截图前 `assertState` 通过。人工抽看了 zh/1440 日期错误与 en/390 组合筛选两张，内容与预期一致，教学说明里有“列表筛选……不会被记忆”的句子。
- 已知控制台错误：无。
- 未实跑：见 README §5。第一个时段的中止见上文。