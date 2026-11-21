# v0.7.0 Demo 运行记录

状态：**脚本已写好并通过无浏览器替身检查；真实运行尚未进行**（等待协调者批准独占时段）。下面“真实运行”一节在获批并跑完后补全。

## 脚本版本（替身检查所用，提交 `8c925e2`）

| 脚本 | git blob SHA |
|---|---|
| `scripts/capture.mjs` | `aaea9fb9ff85063c6769b916a09d46bebdf4eaf4` |
| `scripts/seed-orders.mjs` | `8e9f9a7c793e014aece5c4f3d32b5cf945daafa2` |
| `scripts/run-main.ps1` | `0498df2f0c144475d28987b42424e89711cd9bb4` |
| `scripts/stub-check.ps1` | `445701f6413662dfc9d71cd7e867dc2d1ec50a55` |

真实运行使用的就是这些版本，运行后不为“整理”再改；若运行中必须改，改后重新替身并在此登记新的 blob。

## 无浏览器替身检查（D208）

命令（仓库根目录）：

```powershell
powershell -NoProfile -File docs\demo\v0.7.0\scripts\stub-check.ps1
```

结果：退出码 0，`ALL ASSERTIONS PASSED (10 scenarios)`。替身只在专用临时目录里读写，运行前后真实截图目录（只有哨兵 `.gitkeep`）SHA256 不变，git 状态干净，专用目录已删除。未启动 Chrome、Playwright、Vitest，未监听端口。假服务 PID 111；不属于本轮的监听进程 999 在任何场景都没有被停止。

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

替身首次运行时，场景 7–9 的假端口查询队列比实际多一次，`finally` 里误报“port still listening”；这是替身队列写错，不是脚本问题，已改为短队列后重跑，上表是重跑结果。

## 替身不能证明的事

- 替身不执行 `capture.mjs`；其中对筛选请求参数、列表行数、日期错误无请求、aria 属性的断言，只有真实运行才验证。`capture.mjs` 通过了 `node --check` 语法检查，选择器与 id 对照了 `TradeOrders.tsx`，但没有在浏览器里跑过。
- 替身不验证订单是否能在真实服务里创建（`seed-orders.mjs` 的请求体按 `tradeOrderCommandSchema` 手写）；真实运行时由 seed 与就绪清单检查。

## 真实运行

待补：独占时段预检记录、实际命令输出、退出码、截图数量、清理结果、已知控制台错误。
