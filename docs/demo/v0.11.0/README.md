# v0.11.0 Demo（DEMO-11）

产品基线 `68620fd`（`f5defcc` 之后只有文档提交）。演示账套是本轮新建的临时库（`erp-demo-<guid>`，端口 4201，结束即删），不连 4173，不碰真实旧账、.bak 与本地主检出。

## 1. 截图（32 张，另有开发提交的 TINV-06 `tinv06-*`，不属本 Demo）

每种 × {zh-red, en-green} × {1440, 390}，文件名 `<名称>-<语言>-<主题>-<宽度>.png`，全部在 `screenshots/`；逐步记录在 `screenshots/capture-log-main.json`（含入口 hash、操作路径、最终 hash）。

| 名称 | 到达方式（同一页面实例内的用户操作） | 断言 |
|---|---|---|
| invoice-detail-ap | 发票列表 → 筛选 PARTY2 + AP → 鼠标点击 AP-D1-1 | 合计 100.00/13.00/113.00、来源订单 PO-D1、未结 113.00、无核销；地址栏 hash 不变；恰好一次详情请求；无离开确认框 |
| invoice-detail-ar | 筛选 AR → 焦点放在“应用”，Tab 到 AR-I1-1，Enter | 合计 120.00/15.60/135.60、核销 50.00、未结余额 85.60；hash 不变 |
| invoice-filter-date | 填起止都为当月 1 日 → 应用 | 只剩 AP-EARLY-1..3；请求带 from/to |
| invoice-filter-error-party | 伙伴填 `bad party` → 应用 | 显示错误、`aria-invalid`、0 个列表请求、行数不变 |
| invoice-filter-error-range | 起日期晚于止日期 → 应用 | 显示固定提示、0 个列表请求、行数不变 |
| invoice-filter-loadmore | 伙伴 PARTY → 应用 → 加载更多 | 第一页 100 行，加载更多请求带 `party=PARTY` 且返回 5 行全为 PARTY，筛选条不变 |
| invoice-filter-reset | 应用 AR → 刷新；应用 PARTY+AP → 切到 DEMO2 → 切回 DEFAULT | 每次筛选条为空，回到未筛选第一页 |
| sidebar-groups | 首页（入口页，无操作） | 1440：分组标题可见；390：标题隐藏；链接顺序同 `App.tsx:199–236`；无横向溢出 |

数据来源见 `scripts/seed-detail.mjs`：伙伴 PARTY2 的 AP-D1-1（订单 PO-D1）、AP-EARLY-1..3（当月 1 日）、BULK-001..102（伙伴 PARTY，凑够 >100 行）；AR-I1-1 核销 50.00。DEFAULT 共 112 张，PARTY 105 张。

**与任务书的差异**：任务书写“三个新分组”，页面实际有五个带标题的分组（基础配置/凭证与业务事件/贸易往来/总账与结账/只读报表），其中三个由 UI-14 拆出；首组（运行状态、迁移核对）无标题。以代码为准。

## 2. 槽位与运行记录

槽位：D308（当前无开发在岗，协调者已确认可直接使用）。预检：Chrome 进程 6 次采样（间隔 2 s）均为 0（比 R1 的 10 s 间隔短，未使用 `scripts/slot/` 采样器）。
先 `-SkipCapture` 真服务预演一次（退出码 0），再整体运行一次，通道 `ERP_E2E_BROWSER_CHANNEL=chrome`，端口 4201：

- 运行 21:13:04–21:15:03，退出码 0，输出 `shots 32`，结束后端口释放。
- 完整日志：`logs/demo-capture-main.log`（33 行），SHA-256 `32B2869BD5CC8800701A2C48144B285F0ABE7C3961562BD2BB0CDF1ECAB62E52`。
- 命令：`$env:ERP_E2E_BROWSER_CHANNEL='chrome'; ./docs/demo/v0.11.0/scripts/run-main.ps1 -Shots docs/demo/v0.11.0/screenshots`（需先 `npm run build`）。

## 3. 未做 / 限制

- **未做无浏览器替身检查**：v0.10.0 的 `stub-check.ps1`、`orchestration-stub.ps1`、`proc05-negatives.ps1` 没有为 v0.11.0 新增副本，PROC-08 要求的“README 渲染块实跑”与负例也未补跑。本次直接在真服务上预演并一次取图成功；如评审要求，我再补。
- 390 宽的详情对话框是 fixed 定位，整页截图里显示在页面顶部，属 TINV-06 已有行为，不是本 Demo 引入。
- 本 PR 只加 Demo 材料；CHANGELOG 日期和 tag 目标留给日期 PR。
