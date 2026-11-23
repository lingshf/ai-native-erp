# Demo v0.15.0（S16：订单详情“贷项冲回数量”列、订单页拆分后的外观、390 px 记录）

**状态：脚本已写好，`-Stub` 演练已做；真实时段尚未申请，没有截图。** 演练记录见 [`run-through.md`](run-through.md)。按 `design/tasks/S16.md` 的 DEMO-16 验收。运行环境（真实时段时）：临时演示账套 `erp-demo-<guid>`，端口 **4203**（不是 4173），不连接真实账套、`.bak`、用户主检出。

## 1 计划拍摄（共 6 张，截图在 [`screenshots/`](screenshots/)，真实时段后才有）

| 名称 | 页面（路由） | 宽度 / 语言 / 主题 | 证明什么 |
| --- | --- | --- | --- |
| `trade-orders-entry-zh-red-1440`、`-en-green-1440` | 订单页（`#/trade-orders`，录入区） | 1440，教学说明开 | REFAC-05b 拆分后订单录入页正常渲染：命令条有“预览 / 保存订单”各 1 个按钮，录入用的订单行表存在 |
| `trade-orders-detail-zh-red-1440`、`-en-green-1440` | 点订单号 PO-C1 后的订单详情 | 1440 | 订单行表第 8 列“贷项冲回数量 / Credited qty”紧跟“未开票数量”，L1：数量 10、已开票 6、未开票 4、冲回 4（TORD-08） |
| `trade-orders-detail-zh-red-390-before-scroll`、`-after-scroll` | 同一订单详情 | 390，zh-red | K7：滚动前后各一张；文档不横向溢出，表格在 `div.grid-wrap` 内横向滚动，滚到新列后该列完整落在容器内 |

PO-C1 的造数复用 [v0.14.0 的 `seed-credit.mjs`](../v0.14.0/scripts/seed-credit.mjs)（不复制）：订单 L1 订购 10 × 10；开票 10；对该发票 L1 贷项 4。TORD-08 的新列显示冲回 4，已开票 6、未开票 4。

## 2 口径

- 订单录入页和订单详情的断言是**内容断言**（具体文字、列顺序和数字），拍错即中止；订单录入页只证明“能正常渲染、关键控件在”，**不证明逐像素不变**（没有与 v0.14.0 的对比图）。溢出、滚动位置、页面错误只记录（D440 / D441、TEMPLATE 第 14、15 条）。
- **390 px 记录（K7）**：`document.documentElement.scrollWidth`（期望 ≤ 390）；`div.grid-wrap` 的 `scrollWidth` 与 `clientWidth`（期望前者更大）；把“贷项冲回数量”表头 `scrollIntoView({inline:"nearest"})` 之后，记录容器的 `scrollLeft` 与容器、表头、L1 行该列单元格三个 `getBoundingClientRect()`，列矩形须完整落在容器矩形内。结果写入 `capture-log-main.json` 的 `k7` 条目，真实运行后抄进本文 §3。最小宽 1040 px 的出处是 `packages/web/src/pages/trade-orders.css:97`。
- D457：每页每语言每宽度一个新 browser context；先做桩演练（已做，见 `run-through.md`）。
- 脚本：`scripts/capture.mjs`、`run-main.ps1`、`steps-demo16.ps1`（以及 v0.14.0 的 `seed-credit.mjs`）。Demo 证据脚本，按 D446 例外，不属于产品与 CI 代码。
- 运行：标准 `scripts/slot/slot-run.ps1 -OutDir <仓库外目录> -StepsFile docs\demo\v0.15.0\scripts\steps-demo16.ps1 -Ports 4203`，规则版本 R3，不跳预检；手动 1 次，不重试（D444）；连续 6 次采样为 0 才开始（D308）。

## 3 真实运行结果

尚未运行。待协调者安排 D478 式安静时段（S17 开发者在做 REFAC-07 / REFAC-08 / TLIST-01，SR-C2 计入他们的本地 node 与 vitest 进程）。

## 4 偏差与没做的事

- 没有 REFAC-05b 前后的对比图；没有首屏字节的 Demo 对比，字节数见发布说明（取自 #262、#265 正文，未重测）。
- 订单录入页只拍了录入区，没有演练“保存订单”或“预览”的写入流程（Demo 不证明这些流程）。
- `-Stub` 不运行步骤脚本，`run-main.ps1` 与 `capture.mjs` 在真实 PowerShell 子进程与 Chrome 下的行为尚未经实跑验证（见 `run-through.md` §2）。
