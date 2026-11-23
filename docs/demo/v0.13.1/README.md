# Demo v0.13.1（S14 拆分后 7 个页面的外观）

v0.13.1 没有用户可见的功能变化（REFAC-04 / 05 / 06 只搬移源码、FIX-01 只改测试夹具）。本 Demo 按 `design/tasks/S14.md` 的 DEMO-14 验收，拍 7 个页面的中英文各 1 张，记录拆分后这些页面仍能正常渲染。产品代码与 `48ba245` 一致（`git diff 48ba245 HEAD -- packages scripts` 为空，只有 Demo 文档、脚本和模板）。运行环境：临时演示账套 `erp-demo-<guid>`，端口 **4202**（不是 4173），不连接真实账套、`.bak`、用户主检出。

## 1 截图（14 张，`screenshots/`）

命名 `<页面>-<语言>-<主题>-<宽度>.png`，组合：zh-red / en-green，1440 宽，教学说明开。账套只有 DEFAULT，由 v0.4.0 / v0.10.0 的 seed 预置（订单 PO-I1..3、SO-I1..2 及其发票）；凭证、业务事件、总账报表、期末结账页没有额外造数据，显示的是该账套的实际状态（例如凭证列表为空）。

| 名称 | 页面（路由） | 本次拆分涉及 |
| --- | --- | --- |
| `journals-*` | 凭证 / Journals（`#/journals`） | REFAC-04：9 处共用件改为直接从 `journals/*` 导入 |
| `business-events-*` | 业务事件（`#/events`） | REFAC-04（`journals.css` 经 `journals/virtual-rows.tsx` 加载） |
| `ledger-reports-*` | 总账报表（`#/ledger-reports`） | 同上 |
| `period-close-*` | 期末结账（`#/period-close`） | 同上 |
| `trade-reports-*` | 往来未结项与账龄（`#/trade-reports`） | 同上 |
| `trade-orders-*` | 采购 / 销售订单（`#/trade-orders`） | REFAC-05：`TradeOrders.tsx` 拆到 `trade-orders/` |
| `trade-invoices-*` | 采购与销售发票（`#/trade-invoices`） | REFAC-06：`TradeInvoices.tsx` 拆到 `trade-invoices/` |

## 2 运行记录

- 脚本：`scripts/capture.mjs`、`run-main.ps1`、`steps-demo14.ps1`。Demo 证据脚本，按 D446 例外，不属于产品与 CI 代码。
- **1 次启动**，手动单次，没有重试循环，没有结束任何其他进程。使用标准 `scripts/slot/slot-run.ps1`，**没有跳过任何预检**（FIX-01 已修复 head 静态预检）。
- 时间线（UTC，`logs/slot-summary.log`）：2026-11-23 16:10:27 开始；head 预检 `exit=0 new-keys=0 reduced-keys=0`（tsc 键与基线一致，TDZ 31 个文件 0 项）；16:10:31 构建，dist 比 HEAD 提交新；16:10:37–16:11:33 连续 6 次采样 counted=0；步骤 16:11:33–16:12:13（约 40 秒）；`step demo-capture exit=0 counted-after=0`；端口 4202 已释放。运行期间每 10 秒采样的 counted 均为 0（`logs/processes.tsv`）。
- 运行时 HEAD `e11a632`（`48ba245` 加本 Demo 的脚本和模板提交，`logs/demo-capture-start-rev.txt`，工作区干净）。
- 截图从运行输出目录复制到 `screenshots/`，逐文件 SHA-256 比对一致（14 / 14）。
- 断言口径（D440 / D441 / D444，`docs/demo/TEMPLATE.md` 第 13、14、15 条）：只有“截图是否拍对”失败即中止——语言、主题、宽度、路由 hash、页头标题（中英文不同，作为对照态）。其余用 `check()` 只记录。脚本用 .NET，不依赖 PowerShell 7 模块。
- 记录项共 18 项，全部通过（`logs/capture-log-main.json` 最后一项的 `checks`）：14 张图无横向溢出（溢出 0 px）、2 个组合无页面错误、发票页 2 张图的间距各为 16 px（见 §3）。因为是“只记录”，结论来自记录值。
- **未做**：没有与 v0.13.0 的同页截图做像素或 DOM 对比（没有拆分前的同组基线图，也没有对 v0.13.0 tag 再跑一次）。所以本 Demo 证明的是“拆分后 7 个页面按预期渲染、无溢出、无页面错误”，不是逐像素不变；“外观不变”的依据是 REFAC-05 / 06 PR 里的 DOM 不变核对，不在本 Demo 重复。另外没有跑 `slot-run -Stub` 桩演练，也没有在时段前做不带浏览器的演练（两者都需要启动 node，按 D442 没有申请）。

## 3 发现

- **发票列表“卡片标题与筛选栏”的间距（口径按 S14 定）**：量卡片头底边到筛选表单内第一个字段标签顶边，两张图均为 **16 px**，达到预期的 ≥ 16 px，只记录。外框到外框的距离按设计是 0 px，不作为断言对象（D445 的结论沿用：外框间距 0、内边距 16 px，视觉上有留白，暂不视为缺陷）。
- 凭证页的工具栏里，“凭证”下拉框右侧有一个“重试 / Retry”按钮，此时页面没有错误提示。这是截图里观察到的现象，没有和 v0.13.0 对比，不确定是否为既有设计；转交设计确认，本 Demo 不改代码。
- 发票页的“已过账发票”列表里有 AP-DEMO / AP-DEMO2 两张“无订单”的发票，来自 v0.4.0 的 seed，不是本次改动。

## 4 与文档的差异

无。7 个页面的页头标题与 `docs/user/` 对应章节的名称一致。`docs/demo/TEMPLATE.md` 新增第 15 条（间距类断言的口径），取代 DEMO-12 里“外框间距应约 16 px”的写法。
