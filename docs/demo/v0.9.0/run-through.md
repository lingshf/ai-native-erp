# v0.9.0 Demo 执行记录

状态：**脚本与无浏览器替身已验证；真实服务演练与真实 Chrome 取图尚未执行**（需协调者批准独占时段，D234）。取图后本文补充时段、head、命令、输出和退出码，并把截图与 `capture-log-main.json` 入库。基线 main `9bbabe7`。

## 1. 已执行（无浏览器、无真实服务、无 build）

| 命令 | 结果 | 退出码 |
|---|---|---|
| `powershell -NoProfile -File docs\demo\v0.9.0\scripts\stub-check.ps1` | 场景 1–5 通过：成功（22 个请求 = seed-trade 12 + seed-invoicing 10，含 PO-I3 开票查询）、超量开票被拒 400、缺前置主数据被拒、缺税码被拒、缺参数退出 2；真实截图目录未变 | 0 |
| `powershell -NoProfile -File docs\demo\v0.9.0\scripts\proc05-negatives.ps1` | 第 1a、1b、2、3、4、5 项都按预期失败或被拦住；真实截图目录未变 | 0 |
| `powershell -NoProfile -File docs\demo\v0.9.0\scripts\orchestration-stub.ps1` | A1 对照走完；A2 “A 存活、监听归 B”在 seed-invoicing 之前中止（`owner mismatch before seed-invoicing`）；A3 去掉 PID 比较后该负例失败（放行）；README 渲染后按内容取出真实服务演练块（第 4 块）和取图块（第 6 块），B3、B6 在沙箱实际执行通过；B6 负例两个：dist 缺 `Source order`、dist 时间等于 HEAD，均中止且不调用 run-main、不复制截图；端口 4201 已空闲，真实截图目录未变 | 0 |

orchestration-stub 相对 v0.8.0 的改动：渲染后的代码块下限由 7 改为 6（本版 README 没有独立的清理块，块的识别仍按内容）；沙箱新增假 `git`（报告 HEAD 提交时间）和会固定 `index.html` 时间的假 build，用来执行取图块里“严格晚于 HEAD”的断言，并新增“相等”负例。

## 2. 未实跑（诚实披露）

- 真实服务演练、真实 Chrome 取图、`npm run build`：未执行。
- `capture.mjs` 没有任何替身页面或无头路径会执行它，断言只对照源码逐条核对（下表），**仅对照代码，未实跑**。其中最可能在真实 Chrome 里出问题的是：Playwright 对 `window.confirm` 的 dialog 处理次数、`history.back()` 触发 HashRouter 的 popstate 与离开守卫的时序、390 宽度下深链接结果区的焦点。若取图时某条断言在真实页面上失败，按 D234 中止，不放宽语义断言，记入本文。
- dist 标记 `Partly invoiced`、`Source order` 来自 `trade-order-labels.ts` 与 `trade-labels.ts` 的英文文案，是否出现在构建产物里，取图块的 dist 断言会在 build 之后实际检查。

## 3. capture.mjs 断言逐条核对（对照 main 9bbabe7）

| 断言 | 源码依据 | 结论 |
|---|---|---|
| 订单列表末列表头为“开票状态” / `Invoicing`，表为 `table.tord-list` | `TradeOrders.tsx` 列表表头 `tord.invoicing`；`trade-order-labels.ts` | 一致 |
| 徽章 textContent 为符号 + 文字（`!未开票`、`i部分开票`、`✓已开完`；en 同理），class 含 warning / info / success | `ui/components/index.tsx` Badge：`<span class="badge tone"><span aria-hidden>symbol</span>children</span>`；符号表在 `ui/components/message-bar.tsx`（info `i`、success `✓`、warning `!`）；`tord.invoicing.none/partial/full` 映射 | 一致 |
| 深链接 `#/trade-orders?company=DEFAULT&order=PO-I1`：行 L1 10/4/6、L2 4/0/4；焦点在 `.tord-lookup-result`；刷新仍在 | `TradeOrders.tsx`:1114–1118、1202–1212；#179 正文已核对；`HashRouter`（`App.tsx`:84），刷新保留 hash | 一致 |
| `order=PO-MISSING`：404 → `tord.notFound`；点返回后 hash 为 `#/trade-orders?company=DEFAULT`（控制台出现预期的一条 404） | OrderLookup 的 `error` 渲染 MessageBar，返回调用 `link({order:null})`，以 replace 方式保留 `company` | 一致 |
| `company=NOPE`：文案“公司不在已加载的列表中 · NOPE”；返回后 hash 为 `#/trade-orders` | `<p>{t(tord.deepLink.company)} · {linkCompany}</p>`；返回 `link({company:null,order:null})` | 一致 |
| 发票列表表头“来源订单” / `Source order`（`th.tinv-source`）；两行 AP-I1-1→PO-I1、AP-I2-1→PO-I2，href 为 `#/trade-orders?company=DEFAULT&order=PO-I*` | `TradeInvoices.tsx` 列表 `SourceOrderCell` 渲染 `<Link to=/trade-orders?company=..&order=..>`；`trade-labels.ts` `tinv.sourceOrder` | 一致 |
| 外部发票号输入使页面“有未提交修改”：`#tinv-externalInvoice` 存在，`edit()` 里 `setDirty(true)` | `TradeInvoices.tsx`:~755、:466–469；守卫 `onGuard({unsaved: dirty \|\| pending})`:455 | 一致 |
| 点来源订单链接：恰好一次 confirm，文案为 `trade.leaveConfirm`，取消后 hash 不变、草稿保留 | `useInvoiceLeaveGuard`（~203–245）对链接点击用 `window.confirm` | 一致 |
| `history.back()` 取消：再出现一次 confirm，hash 不变、草稿保留（D275 截断前进历史，本演示不断言前进） | `leave-guard-history.ts` `guardHistory`；`App.tsx` 在 HashRouter 之前注册 popstate | 一致，待真实浏览器验证时序 |
| 确认后点链接：第 3 次 confirm，hash 变为 `#/trade-orders?company=DEFAULT&order=PO-I1` | 同上 | 一致 |
| 第 4 步在同一页面内连续进行 | 草稿存在于页面内存，不能每步新建上下文；脚本注释已说明；步骤 1–3 每步用新浏览器上下文 | 设计如此 |
| `main h2` 存在 | `App.tsx`:243 `<main>`；`PageHeader` 渲染 `<h2>` | 一致 |

## 4. 已知的预期控制台错误

`order=PO-MISSING` 会产生一条 404 资源错误，`capture.mjs` 把控制台错误记入 `capture-log-main.json` 并在结束时打印；取图后逐条核对，除这条预期的 404 外出现其他控制台错误，按缺陷报告。
