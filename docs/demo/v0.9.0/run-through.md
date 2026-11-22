# v0.9.0 Demo 执行记录

状态：已完成。脚本与无浏览器替身已验证，真实服务演练通过，真实 Chrome 取图在第 3 次独占时段通过，16 张截图与 `capture-log-main.json` 已入库。基线 main `9bbabe7`。

## 1. 已执行（无浏览器、无真实服务、无 build）

| 命令 | 结果 | 退出码 |
|---|---|---|
| `powershell -NoProfile -File docs\demo\v0.9.0\scripts\stub-check.ps1` | 场景 1–5 通过：成功（22 个请求 = seed-trade 12 + seed-invoicing 10，含 PO-I3 开票查询）、超量开票被拒 400、缺前置主数据被拒、缺税码被拒、缺参数退出 2；真实截图目录未变 | 0 |
| `powershell -NoProfile -File docs\demo\v0.9.0\scripts\proc05-negatives.ps1` | 第 1a、1b、2、3、4、5 项都按预期失败或被拦住；真实截图目录未变 | 0 |
| `powershell -NoProfile -File docs\demo\v0.9.0\scripts\orchestration-stub.ps1` | A1 对照走完；A2 “A 存活、监听归 B”在 seed-invoicing 之前中止（`owner mismatch before seed-invoicing`）；A3 去掉 PID 比较后该负例失败（放行）；README 渲染后按内容取出真实服务演练块（第 4 块）和取图块（第 6 块），B3、B6 在沙箱实际执行通过；B6 负例两个：dist 缺 `Source order`、dist 时间等于 HEAD，均中止且不调用 run-main、不复制截图；端口 4201 已空闲，真实截图目录未变 | 0 |

orchestration-stub 相对 v0.8.0 的改动：渲染后的代码块下限由 7 改为 6（本版 README 没有独立的清理块，块的识别仍按内容）；沙箱新增假 `git`（报告 HEAD 提交时间）和会固定 `index.html` 时间的假 build，用来执行取图块里“严格晚于 HEAD”的断言，并新增“相等”负例。

## 1b. 独占时段记录（D298–D300，均为 -08:00，端口 4201，每次预检 6 次外部进程数均为 0）

| 时段 | head | 范围 | 结果 |
|---|---|---|---|
| D298 21:54:26–21:56:42 | fc994e1 | 步骤 1 演练 + 步骤 2 取图 | 演练退出 0；build、dist 断言通过；capture 退出 1。我用 `Select-Object -Last 30` 截断了输出且清掉了 shots 目录，失败断言原文已丢失，**根因未知**（不能确认是脚本问题），未重试；D299 起改为 tee 日志并在失败时保留目录 |
| D299 21:58:15–21:59:59 | be2ae39 | 步骤 2（输出 tee 到文件、失败保留目录、4b 改用真实 `page.goBack`） | 中止：步骤 3“发票列表来源订单”断言应为 2 行，实际有 4 行，多出 seed-trade 自带的 AP-DEMO、AP-DEMO2（来源列“—无来源订单”）。脚本断言错误，产品正确。步骤 1、2 的 2 张截图已落盘 |
| D300 22:00:46–22:02:48 | a4f9857 | 步骤 2 | 通过：dist 严格晚于 HEAD 且含 `Partly invoiced`、`Source order`；capture 退出 0；16 张截图；每张 overflowPx 为 0；离开确认步骤中的 confirm 对话框是累计计数：4a 点链接取消后 1 次，4b 后退取消后累计 2 次（日志 `dialogs=2` 记录的是截图时的累计值），4c 确认离开的链接点击是第 3 次，脚本断言总共 3 次、每次文案为 `trade.leaveConfirm`；结束后 chrome 0、端口 4201 释放、无 `erp-demo-*` 与 shots 残留 |

D300 控制台错误：4 组各只有 `order=PO-MISSING` 的预期 404（HTTP 404 与 Failed to load resource 两条），无其他。
## 2. 未实跑（诚实披露）

- 无（演练、build、取图均已在上表时段执行；以下只列仍未实跑的项）。
- `capture.mjs` 没有替身页面路径，断言先对照源码逐条核对（§3），再由 D300 在真实 Chrome 实跑通过。核对时最可能在真实 Chrome 里出问题的是：Playwright 对 `window.confirm` 的 dialog 处理次数、`history.back()` 触发 HashRouter 的 popstate 与离开守卫的时序、390 宽度下深链接结果区的焦点。若取图时某条断言在真实页面上失败，按 D234 中止，不放宽语义断言，记入本文。
- dist 标记 `Partly invoiced`、`Source order` 来自 `trade-order-labels.ts` 与 `trade-labels.ts` 的英文文案，是否出现在构建产物里，取图块的 dist 断言会在 build 之后实际检查。

## 3. capture.mjs 断言逐条核对（对照 main 9bbabe7）

| 断言 | 源码依据 | 结论 |
|---|---|---|
| 订单列表末列表头为“开票状态” / `Invoicing`，表为 `table.tord-list` | `TradeOrders.tsx` 列表表头 `tord.invoicing`；`trade-order-labels.ts` | 一致 |
| 徽章 textContent 为符号 + 文字（`!未开票`、`i部分开票`、`✓已开完`；en 同理），class 含 warning / info / success | `ui/components/index.tsx` Badge：`<span class="badge tone"><span aria-hidden>symbol</span>children</span>`；符号表在 `ui/components/message-bar.tsx`（info `i`、success `✓`、warning `!`）；`tord.invoicing.none/partial/full` 映射 | 一致 |
| 深链接 `#/trade-orders?company=DEFAULT&order=PO-I1`：行 L1 10/4/6、L2 4/0/4；焦点在 `.tord-lookup-result`；刷新仍在 | `TradeOrders.tsx`:1114–1118、1202–1212；#179 正文已核对；`HashRouter`（`App.tsx`:84），刷新保留 hash | 一致 |
| `order=PO-MISSING`：404 → `tord.notFound`；点返回后 hash 为 `#/trade-orders?company=DEFAULT`（控制台出现预期的一条 404） | OrderLookup 的 `error` 渲染 MessageBar，返回调用 `link({order:null})`，以 replace 方式保留 `company` | 一致 |
| `company=NOPE`：文案“公司不在已加载的列表中 · NOPE”；返回后 hash 为 `#/trade-orders` | `<p>{t(tord.deepLink.company)} · {linkCompany}</p>`；返回 `link({company:null,order:null})` | 一致 |
| 发票列表表头“来源订单” / `Source order`（`th.tinv-source`）；四行：AP-DEMO、AP-DEMO2（seed-trade 自带，“—无来源订单”，无链接）、AP-I1-1→PO-I1、AP-I2-1→PO-I2，href（D299 因漏掉前两行中止，已修正） 为 `#/trade-orders?company=DEFAULT&order=PO-I*` | `TradeInvoices.tsx` 列表 `SourceOrderCell` 渲染 `<Link to=/trade-orders?company=..&order=..>`；`trade-labels.ts` `tinv.sourceOrder` | 一致 |
| 外部发票号输入使页面“有未提交修改”：`#tinv-externalInvoice` 存在，`edit()` 里 `setDirty(true)` | `TradeInvoices.tsx`:~755、:466–469；守卫 `onGuard({unsaved: dirty \|\| pending})`:455 | 一致 |
| 点来源订单链接：恰好一次 confirm，文案为 `trade.leaveConfirm`，取消后 hash 不变、草稿保留 | `useInvoiceLeaveGuard`（~203–245）对链接点击用 `window.confirm` | 一致 |
| `history.back()` 取消：再出现一次 confirm，hash 不变、草稿保留（D275 截断前进历史，本演示不断言前进） | `leave-guard-history.ts` `guardHistory`；`App.tsx` 在 HashRouter 之前注册 popstate | 一致，待真实浏览器验证时序 |
| 确认后点链接：第 3 次 confirm，hash 变为 `#/trade-orders?company=DEFAULT&order=PO-I1` | 同上 | 一致 |
| 第 4 步在同一页面内连续进行 | 草稿存在于页面内存，不能每步新建上下文；脚本注释已说明；步骤 1–3 每步用新浏览器上下文 | 设计如此 |
| `main h2` 存在 | `App.tsx`:243 `<main>`；`PageHeader` 渲染 `<h2>` | 一致 |

## 4. 已知的预期控制台错误

`order=PO-MISSING` 会产生一条 404 资源错误，`capture.mjs` 把控制台错误记入 `capture-log-main.json` 并在结束时打印；取图后逐条核对，除这条预期的 404 外出现其他控制台错误，按缺陷报告。
