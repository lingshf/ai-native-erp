# v0.11.0 Demo 证据记录（run-through）

本文只记录实际有原始证据的事项；没有留下原始输出的，明确写“未留存”，不事后改写成测量值。

## 1. 21:13–21:15 首次取图（已被后续脚本变更取代）

- 源日志：`docs/demo/v0.11.0/logs/demo-capture-main.log`，33 行，SHA-256 `32B2869BD5CC8800701A2C48144B285F0ABE7C3961562BD2BB0CDF1ECAB62E52`（入库后核对过 Git blob 的 SHA-256 一致）。本机原件在 `%TEMP%\s11-capture.log`，清理前已复制入库。
- 当时 HEAD 是 `f5defcc`；新脚本（seed-detail、run-main、capture）尚未提交，在工作区。**未留存**：当时的 `git status` 输出、build 的完整输出、dist 比 HEAD 新的正式门禁输出（当时没有跑该门禁）、预演（`-SkipCapture`）的完整输出（只留了末 30 行）。
- 这些图早于 `capture.mjs` 的最终断言（见 §3），所以不作为最终证据。槽位与预检的例外见 README §2（D373 ①⑤）。

## 2. 21:38–21:41 按 R1 重取（失败，现场保留）

- 命令：`pwsh scripts/slot/slot-run.ps1 -OutDir C:\Users\shaoling\slot-s11-demo-recapture -StepsFile <steps>`（steps 为一步：`powershell -File docs\demo\v0.11.0\scripts\run-main.ps1 -Shots <OutDir>\shots`，`ERP_E2E_BROWSER_CHANNEL=chrome`）。
- 起始 HEAD `545d7af631da5044f53a1d28dab53d8d221a55f9`，工作区干净（`demo-capture-start-rev.txt` / `end-rev.txt` 均只有这一行）；runner 先 build，再做 dist 新鲜度门禁，预检 6 次均为 0（`processes.tsv`），一次取图。
- 结果：第 7 步（重置）`page.waitForResponse` 30 s 超时，exit 1，按 D308 不重跑。原文：`CAPTURE FAILED: page.waitForResponse: Timeout 30000ms exceeded while waiting for event "response"`。已出 6 张；端口 4201 已释放；无残留进程。
- 原因：QueryClient `staleTime: Infinity`（`packages/web/src/App.tsx:67–70`），切回 DEFAULT 时未筛选第一页取自缓存、没有请求；查询键 `["trade-invoices", company, applied]`（`TradeInvoices.tsx:1091–1112`）。已改 `capture.mjs`（见 §3）。
- 第 1 次尝试（21:23–21:38）预检 15 分钟超时（开发在另一个工作树跑 vitest），exit 3，没有运行任何步骤。两个目录都在本机，未入库；runner 的原始输出在目录里。

## 3. `capture.mjs` 针对 D373 ③ 的断言

| 断言 | 出处 |
|---|---|
| 截图前 `location.hash` 等于预期（列表步骤 `#/trade-invoices?company=DEFAULT`，侧栏步骤 `#/`），并记进日志 `expectHash` | `capture.mjs:82–90`，入口 hash 另在 `openList` 校验 |
| 伙伴错误文案等于本地化文本（zh/en），文案取自 `TradeInvoices` 的校验提示 | `capture.mjs:255–256` |
| 重置：AR 筛选 2 行 → 刷新，请求 `company=DEFAULT` 且不带 party/side/from/to，101 行 → 应用 PARTY2+AP，请求带 `party=PARTY2&side=AP`，5 行 → 切 DEMO2，请求 `company=DEMO2` 不带筛选，0 行 → 切回 DEFAULT：期间任何列表请求都不带筛选，筛选条为空，101 行（不是筛选后的 5 行） | `capture.mjs:301–345` |
| 侧栏：16 个链接顺序等于 `navOrder`；五个分组标题（1440 可见、390 隐藏）；`role=group` 与 `aria-labelledby` | `capture.mjs:350` 起 |

`navOrder` 与 UI-14 [#197](https://github.com/lingshf/ai-native-erp/pull/197) 核验过的 16 个链接顺序相同（base `506201e`、head `5f67f2e`；#197 正文：slot-2 比对 16 对、`failures=[]`；`App.test.tsx` “UI-14 sidebar navigation groups”）。比对结果的 JSON 不在仓库里，本 Demo 没有重做 base/head 比对。

## 4. 种子数据断言出处（`seed-detail.mjs`）

- AR-I1-1 核销前合计 135.60、未结 135.60：`seed-detail.mjs:93`；核销后未结 85.60、核销 1 条：`:106–107`。
- 发票数 DEFAULT 112、PARTY 105、月初 3：`:114`。day 必须晚于当月 1 日：`:16`。

## 5. 无浏览器替身检查（D372，本机原始输出已入库）

| 检查 | 日志 | 结果 |
|---|---|---|
| `stub-check.ps1`（seed-detail 替身：成功 222 个请求，缺 AR、超额核销、日期格式错误、缺参数；真实截图目录前后哈希一致） | `logs/stub-check.log` | exit 0 |
| `proc05-negatives.ps1`（固定负例 1–5 与同文件 `Copy-Item` 对照） | `logs/proc05-negatives.log` | exit 0 |
| `orchestration-stub.ps1`（三处 owner 对照、渲染 README 的演练块与取图块、两个 dist 负例、B7 四条路径） | `logs/orchestration-stub.log` | exit 0，端口 4201 空闲，真实截图目录 55 个文件未变 |

三份日志的 `-text` 与未被忽略已用 `git check-attr text` / `git check-ignore -v` 核对。`orchestration-stub.log` 是 PowerShell 5.1 `Tee-Object` 写出的原文（编码为该命令默认编码）。

## 6. 待办

最终截图需要在修正后的 `capture.mjs` 上取得一次成功的 R1 重取；在此之前，`screenshots/` 里的 32 张仍是首次取图的版本，不能当最终证据。
