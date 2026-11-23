# Demo v0.13.0 补拍（TORD-07 订单筛选记忆）

v0.13.0 的 S13 改动里，用户可见的只有 TORD-07（订单筛选写入地址栏）。本 Demo 只补拍这一项（D448）。取图的产品代码与 `f1536e1` 一致（`git diff f1536e1 1ff57df -- packages scripts` 为空）。运行环境：临时演示账套 `erp-demo-<guid>`，端口 **4202**（不是 4173），不连接真实账套、`.bak`、用户主检出。

## 1 截图（12 张，`screenshots/`）

命名 `<名称>-<语言>-<主题>-<宽度>.png`，组合：zh-red / en-green × 1440 / 390，教学说明开。

| 名称 | 内容 |
| --- | --- |
| `orders-filter-applied-*` | 选“部分开票”并应用：地址变为 `#/trade-orders?company=DEFAULT&invoicing=partial`，列表由 5 行变 2 行（PO-I1、SO-I1） |
| `orders-filter-reload-*` | 刷新页面：筛选条件与同样的 2 行仍在 |
| `orders-filter-invalid-link-*` | 打开 `invoicing=bogus` 的链接：整组筛选被忽略，显示警告与“清除”按钮，列表显示全部 5 行 |

`applied` 与 `reload` 的画面应当一致（刷新后状态不变），文件大小与哈希也相同，这是预期结果。

## 2 运行记录

- 脚本：`scripts/capture.mjs`、`run-main.ps1`、`steps-demo13.ps1`、`slot-run-d449.ps1`。前序夹具沿用 v0.4.0 / v0.10.0 的 seed。以上是 Demo 证据脚本，按 D446 例外，不属于产品与 CI 代码。
- 一共 3 次启动，均为手动单次，没有重试循环，没有结束任何其他进程：
  1. 第 1 次（15:21Z）：`slot-run.ps1` 在 head 静态预检 `exit 6` 中止（相对基线新增 2 个 tsc 错误键，在 `packages/infra/test/support/legacy-opening-fixture.ts` 的 114,36 TS2339 与 118,55 TS2345，来自 M2-05b；TDZ 0 项）。未进入构建、门控、服务和浏览器。D449 决定**不计入** D448 的运行次数。
  2. 第 2 次（15:22Z，D449）：跳过 head 静态预检，6 次采样为零后开跑，在 `run-main.ps1` 的就绪检查中失败（`readiness: company DEMO2 missing`，exit 1）。原因是我的脚本写死了不存在的公司 DEMO2，发生在拍任何截图之前，属脚本问题。
  3. 第 3 次（15:24Z，D450，**本 Demo 采用**）：修正就绪检查（只要求 DEFAULT 公司和三种开票状态都有订单，并去掉了我未核实的发票号检查）后运行，`exit=0`、`counted-after=0`，端口 4202 已释放。
- **跳过的一项**：SLOT-02 的 head 静态预检（tsc 新增键比对）。**原因**：两个新增错误都在 infra 测试夹具中，不影响 web 截图。**依据**：D449。跳过方式：复制 `slot-run.ps1` 为 `scripts/slot-run-d449.ps1`，只把 head 预检两行换成一行日志 `preflight head SKIPPED by D449`，构建、dist 检查和 D308 进程门控不变。夹具类型问题由协调者另行安排修复，不在本 PR 范围。
- 第 3 次的时间线（`logs/slot-summary.log`）：构建 15:24:07Z，dist 比 HEAD 提交新；15:24:12Z–15:25:07Z 6 次预检连续为零；步骤 15:25:07Z–15:25:45Z（约 38 秒）。运行期间每 10 秒采样的 counted 均为 0（`logs/processes.tsv`）。
- 运行时仓库状态：HEAD `057693f`，工作区有 `run-main.ps1` 的修改（就绪检查）和 `slot-run-d449.ps1`，均已随本 PR 提交（`logs/demo-capture-start-rev.txt`）。
- 截图从运行输出目录复制到 `screenshots/`，逐文件 SHA-256 比对一致。
- 断言口径（D448）：只有“截图是否拍对”失败即中止——语言、主题、宽度、路由 hash、`invoicing=partial` 的 hash、列表行集等于 API 结果、刷新后下拉框取值、警告文本可见。其余（浏览器历史条数、横向溢出、页面错误）用 `check()` 只记录。
- 记录项共 20 项，全部通过（`logs/capture-log-main.json` 的 `checks`）：4 个组合各 5 项——应用筛选不新增浏览器历史（历史条数不变）、三张图无横向溢出（溢出为 0）、无页面错误。因为是“只记录”，结论来自记录值。
- 未做：`slot-run -Stub` 桩演练；未运行 head 静态预检（见上）。

## 3 与文档的差异

无。行为与 `docs/user/trade.md` 的 TORD-07 一节一致（筛选写入地址栏、无效筛选整组忽略并提示、刷新保持）。
