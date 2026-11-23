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

## 2b. 最终取图（D382，R1，一次成功）与结果核对

- 命令：`pwsh -NoProfile -File scripts\slot\slot-run.ps1 -OutDir C:\Users\shaoling\slot-s11-demo-recapture-3 -StepsFile docs\demo\v0.11.0\scripts\steps-demo11.ps1`（steps 内容与 D382 时本机的步骤文件相同，现已入库）。HEAD `0b956d62f7c7e8f1016947f7973650b6790ea2a2`，`status=[]`（`demo-capture-start-rev.txt` / `end-rev.txt` 一致）。build 与 dist 新鲜度门禁由 runner 完成（`logs/recapture-d382-build.log`），预检 6 次 `counted=0`，step `demo-capture` exit 0、`counted-after=0`。
- 核对（取图后离线做，没有开浏览器）：
  - 日志完整：`demo-capture.out.log` 33 行，以 `shots 32`、`capture exit 0`、`port 4201 released` 结尾，`demo-capture.err.log` 为空；seed 链路 `seed-trade → seed-invoicing → seed-sales → seed-detail → readiness ok` 完整。
  - 源图都在：`shots/` 32 个 PNG，文件名与 `capture-log-main.json` 的 32 个截图条目一一对应；宽度 1440 / 390 全部符合文件名。
  - hash 与断言一致：32 个条目的 `hash` 都等于 `expectHash`（28 个 `#/trade-invoices?company=DEFAULT`，4 个 `#/`），不一致 0；`overflowPx > 0` 的条目 0。
  - 重置步骤：四个组合都有 `reset-switch-back`，`listRequests=[]`（切回 DEFAULT 命中缓存，没有请求，符合 `staleTime: Infinity`）；每个组合的 `errors=[]`。
- 结论：这次取图结果可信，不申请重取。

## 3. `capture.mjs` 针对 D373 ③ 的断言

| 断言 | 出处 |
|---|---|
| 截图前 `location.hash` 等于预期（列表步骤 `#/trade-invoices?company=DEFAULT`，侧栏步骤 `#/`），并记进日志 `expectHash` | `capture.mjs:82–90`，入口 hash 另在 `openList` 校验 |
| 伙伴错误文案等于本地化文本（zh/en），文案取自 `TradeInvoices` 的校验提示 | `capture.mjs:255–256` |
| 重置：AR 筛选 2 行 → 刷新，请求 `company=DEFAULT` 且不带 party/side/from/to，101 行 → 应用 PARTY2+AP，请求带 `party=PARTY2&side=AP`，5 行 → 切 DEMO2，请求 `company=DEMO2` 不带筛选，0 行 → 切回 DEFAULT：期间任何列表请求都不带筛选，筛选条为空，101 行（不是筛选后的 5 行） | `capture.mjs:301–345` |
| 侧栏：16 个链接顺序等于 `navOrder`；五个分组标题（1440 可见、390 隐藏）；`role=group` 与 `aria-labelledby` | `capture.mjs:350` 起 |

`navOrder` 与 UI-14 [#197](https://github.com/lingshf/ai-native-erp/pull/197) 核验过的 16 个链接顺序相同（base `506201e`、head `5f67f2e`；#197 正文：slot-2 比对 16 对、`failures=[]`；`App.test.tsx` “UI-14 sidebar navigation groups”）。比对结果的 JSON 不在仓库里，本 Demo 没有重做 base/head 比对。

### 3b. 既有断言的出处（D383 ②，逐条核对）

组件在 `packages/web/src/`；seed 在 `docs/demo/v0.11.0/scripts/seed-detail.mjs`（行号以该文件为准）。

| 步骤 | 断言（capture.mjs 行） | 组件 / schema 出处 | seed 出处 |
|---|---|---|---|
| 1 AP 详情 | 筛选 PARTY2+AP 恰好 AP-D1-1、AP-DEMO2、AP-EARLY-1..3（~176）；对话框名 `发票详情 · AP-D1-1`（~180）；合计 100.00/13.00/113.00、未结 113.00、来源 PO-D1、空态文案（~183–188）；地址栏不变、恰好 1 个详情请求、无离开确认框（~189–193） | `TradeInvoiceDetail.tsx:87`（标题）、`ui/trade-invoice-detail-labels.ts`（title/totals/settlements 文案）、`TradeInvoices.tsx:1288`（`tinv-detail-trigger`） | `seed-detail.mjs:4`（PO-D1 与 AP-D1-1）、`:85`；AP-DEMO2 来自 seed-trade.mjs |
| 2 AR 详情 | 方向 AR 恰好 AR-I1-1、AR-I2-1（~204）；Tab 至多 12 次到达“查看发票 AR-I1-1”按钮后 Enter（~207–214）；合计 120.00/15.60/135.60、未结 85.60、核销记录含 50.00（~218–224） | `TradeInvoiceDetail.tsx:271–279`（核销记录表） | `seed-detail.mjs:8`、`:93`、`:106–107` |
| 3 日期 | 起止同为当月 1 日只剩 AP-EARLY-1..3；请求带 `from=`/`to=`；地址栏不变；无确认框 | `TradeInvoices.tsx` 筛选条（`#tinv-filter-from`/`-to`） | `seed-detail.mjs:5`、`:86`、`:16`（day 晚于当月 1 日） |
| 4 错误 | 伙伴文案等于 `tinv.filter.partyInvalid`、`aria-invalid=true`、0 个列表请求、行数不变；倒置文案等于 `tinv.filter.range`（`#tinv-filter-range-error`） | `TradeInvoices.tsx:1193–1194`、`:1230–1231`；`ui/trade-labels.ts:211–213`、`:444–446` | 不依赖 seed |
| 5 加载更多 | 第一页 `aria-rowcount=101`；请求带 `cursor=` 与 `party=PARTY`；返回 5 行且都是 PARTY；之后 106；筛选条不变 | `TradeInvoices.tsx:1260`（`aria-rowcount={rows.length + 1}`）；列表 `limit` 默认 100 与 `nextCursor` 由 API 返回 | `seed-detail.mjs:6`、`:87`（PARTY 共 105 = 102 + 3）、`:114` |
| 6 重置、7 侧栏 | 见上表 | `App.tsx:67–70`、`:199–236`；`TradeInvoices.tsx:1091–1112` | `seed-detail.mjs:114`（DEFAULT 共 112，首页 100 行 → `aria-rowcount=101`） |

每一步之前的状态断言（语言、主题、宽度、教学开关、`scrollY`，390 宽再断言不横向溢出）在 `capture.mjs` 的 `assertState`（~61–80）。

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

## 6. D387 槽位运行（一次，经 `slot-run.ps1` + `steps-rehearsal.ps1`，本地 22:10:23–22:12:49）

- 起止 HEAD 均为 `4d41a7d536eec69aeed56c1ef321a3a4b7459b4e`，工作区干净。
- **真服务预演（run-main.ps1 -SkipCapture，端口 4201 为 D373 例外）exit 0**：播种、readiness ok，`capture skipped (dry-run)`，`port 4201 released`。日志 `logs/rehearsal-d387.out.log`（31 行，SHA-256 `8E99307BA56EA7A65ABC542301EE46C1D0B7576B472EF01033208EEC32C8A2AC`）、`logs/rehearsal-d387-build.log`（56 行，`CD73B752578FBCB90F45AF5B163ADEAE8C6D9B28D2697A1D3B024A7FB60D3C84`）。注意：这次直接跑 run-main，**没有**走 README 统一步骤块（块里的新鲜度门禁与日志复核未在真服务上验证，仍待补）。
- **orchestration-stub exit 1，runner 按规则中止**：第 15 行 `Get-FileHash` 在 runner 子进程里不可用（原文见 `logs/orchestration-stub-d387-abort.err.log`，SHA-256 `259F96C9CA55012C089F19D87FE0A9E82C6B7DA0DD563A712CEC81E345529470`），尚未执行任何断言。
- 原因（离线复现）：pwsh 启动的 powershell.exe 继承带 PowerShell 7 目录的 `PSModulePath`，5.1 加载了 7 版 `Microsoft.PowerShell.Utility`；在该环境里逐个探测脚本用到的 55 个 cmdlet，仅 `Get-FileHash`、`New-Guid` 缺失。`New-Guid` 在 demo 脚本里无使用。
- 修复（仅文档/脚本）：stub 改用 .NET SHA256（`Get-Sha256`）；README 统一步骤块里的 `Get-FileHash` 同样改为 .NET。`proc05-negatives.ps1`、`stub-check.ps1` 仍含 `Get-FileHash`，它们不经 runner 子进程运行（D372 在本机 shell 跑过），未改。
- 待办：协调者批准新时段后重跑 `orchestration-stub.ps1` 一次，结果记入本节。

## 6b. D392 槽位运行（一次，`slot-run.ps1` + 两步，本地 22:19:24–22:22:28，HEAD `30800e0e1dfc5c5f515d35af99f0e8a030633d73`，工作区干净）

- 步骤 1 `readme-block-rehearsal`：用 `[regex]` 从 README 取出统一步骤块（`$capture = $false`），以 `[scriptblock]::Create` 在真服务上运行。**exit 0**：build、新鲜度门禁（runner 记录 `dist-index 06:19:29Z` 晚于 HEAD 提交 `06:14:55Z`，`newer=True`）、播种、readiness ok、`capture skipped (dry-run)`、`port 4201 released`；块自己的复核输出 `sha256=5B7F438BE8137790FCE6E092F2D9F2548B8E3565452E6FC9245A23D293E4A3B9 lines=96`，入库日志 `logs/readme-block-d392.run.log` 的 SHA-256 与行数一致；build 日志 `logs/readme-block-d392-build.log`（56 行，`9D7C43B00D77BDD4AB0F9E58EDE51034999E41C6E189DBF16D1A140A44D5E582`）。
- 步骤 2 `orchestration-stub`：**未运行**。runner 在步骤 1 之后的计数检查发现 3 个外部进程（cmd.exe 67240、node.exe 16464、cmd.exe 76024，命令行不可读，不是本轮启动的），按规则 `ABORT: external counted process after readme-block-rehearsal (counted=3)`。我没有结束任何进程。
- 待办：stub 仍待一个新时段。

## 6c. D395 槽位运行：orchestration-stub（一次，本地 22:29:17–22:31:47，HEAD `2d0d723494da457b049c97f63a040afd0b69c295`，工作区干净）

- 预检连续 6 次为 0 后开跑；**exit 0，runner `counted-after=0`**，stderr 为空（未入库）。取到的块是 README 渲染结果里的统一步骤块（序号 5/共 5 块）。
- 全部断言通过：A1–A6 与各对照（owner mismatch 在 seed-invoicing / seed-sales / seed-detail 之前中止，去掉 PID 比较后负例失效）；B3 预演、B6 取图、B6 两个 dist 负例；B7 成功 / 日志只读写失败 / exit 3 / 抛错 / 复制失败；B7 日志复核 `sha256=A446E107…CC57 lines=12` 与落盘一致；结束时端口 4201 空闲，真实截图目录未变（55 个文件）。
- 日志 `logs/orchestration-stub-d395.out.log`（75 行，SHA-256 `0E9E316A9C0243B307267C748A32E5DA8858382EC32FB49CD3CAD222A9E14660`）。它取代 §5 里旧版 stub 日志，作为当前脚本的证据。
- 至此 D372/D373/D383 的三项（stub、PROC-05 负例、README 块实跑）均已在当前脚本上跑通。
