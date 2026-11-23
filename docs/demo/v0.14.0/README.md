# Demo v0.14.0（S15：贷项冲减已开票数量、凭证页按钮、发票页拆分后的外观）

**状态：脚本与桩演练已备好，真实截图尚未拍摄（等协调者批准时段）。** 演练记录见 [`run-through.md`](run-through.md)。按 `design/tasks/S15.md` 的 DEMO-15 验收。运行环境：临时演示账套 `erp-demo-<guid>`，端口 **4203**（不是 4173），不连接真实账套、`.bak`、用户主检出。

## 1 计划拍摄（6 组 × zh-red / en-green，1440 宽，教学说明开，共 12 张）

| 名称 | 页面（路由） | 证明什么 |
| --- | --- | --- |
| `trade-orders-*` | 订单列表（`#/trade-orders`） | PO-C1 的开票状态是“部分开票 / Partly invoiced”（TINV-09） |
| `trade-orders-detail-*` | 点订单号 PO-C1 后的订单详情 | L1 数量 10、已开票 6、未开票 4 |
| `journals-*` | 凭证（`#/journals`） | 工具栏是“刷新列表 / Refresh list”，没有“重试 / Retry”（JV-FIX-01 J1） |
| `trade-invoices-*` | 采购与销售发票 | REFAC-06b / 06c 之后仍正常渲染 |
| `period-close-*` | 期末结账 | 同上 |
| `trade-reports-*` | 往来未结项与账龄 | 同上 |

PO-C1 的造数（`scripts/seed-credit.mjs`，在 v0.4.0 / v0.10.0 seed 之后运行）：订单 L1 订购 10 × 10；开票 10（已开完，对照态）；对该发票 L1 贷项 4 → 已开票 6、未开票 4。v0.13.1 及更早贷项不改订单状态，此时仍显示“已开完”；v0.14.0 显示“部分开票”。

## 2 口径

- 订单页与凭证页的断言是**内容断言**（具体文字和数字），截图拍错即中止；发票、期末结账、往来页只证明“能正常渲染”，不证明逐像素不变（没有 v0.13.1 的对比图）。溢出、页面错误、发票页间距只记录（D440 / D441、TEMPLATE 第 14、15 条）。
- D457：每页每语言一个新 browser context；先做桩演练（已做）。
- 脚本：`scripts/seed-credit.mjs`、`capture.mjs`、`run-main.ps1`、`steps-demo15.ps1`。Demo 证据脚本，按 D446 例外，不属于产品与 CI 代码。
- 运行：标准 `scripts/slot/slot-run.ps1 -OutDir <仓库外目录> -StepsFile docs\demo\v0.14.0\scripts\steps-demo15.ps1`，不跳预检；手动 1 次，不重试（D444）；连续 6 次采样为 0 才开始（D308）。

## 3 偏差与待办

- 真实截图未拍；`run-main.ps1`、`seed-credit.mjs`、`capture.mjs` 尚未对真实服务器运行（见 `run-through.md` §2）。真实运行后本页补充 §1 截图清单的实际结果、发现与偏差。
