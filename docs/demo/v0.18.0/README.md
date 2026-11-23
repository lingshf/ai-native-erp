# v0.18.0 Demo（DEMO-19）

本 Demo 用临时演示账套 `erp-demo-<guid>`，端口 **4203**（不是 4173），不连接任何真实旧账或 `.bak`。**证明页面在真实 Chrome 下正常渲染、键盘行为正确，不是逐像素对比。**

状态：**窗口前草稿**，截图与真实运行结果在窗口结束后补入（§2、§3）。SHA 角色与时间线见 [`run-through.md`](run-through.md)。

## 1 演示内容

1. **科目表“刷新列表”**（TLIST-03，[#288](https://github.com/lingshf/ai-native-erp/pull/288)）：1440 中英文排布；390 px 下页面不横向溢出、两个按钮都在视口内；原生键盘（Tab / Enter / 空格），编辑器打开时同样可用。
2. **订单列表拆分**（REFAC-10，[#291](https://github.com/lingshf/ai-native-erp/pull/291)）：页面外观不变；1440 中英文，列表有行、筛选栏三个按钮可见（只证明拆分后正常渲染，没有拆分前对比图）。

脚本：`scripts/capture.mjs`（新）、`run-main.ps1`（改：只把 capture 路径换成 v0.18.0；仍先调用 `assert-web-dist.ps1`）、`steps-demo19.ps1`；造数复用 v0.4.0 的 `prepare.mjs`、`seed-trade.mjs`，v0.10.0 的 `seed-invoicing.mjs`、`seed-sales.mjs`，v0.14.0 的 `seed-credit.mjs`。Demo 证据脚本，按 D446 例外，不属于产品与 CI 代码。

## 2 截图（真实运行后补入，`screenshots/`）

预期文件：`trade-orders-list-{zh-red,en-green}-1440.png`、`accounts-{zh-red,en-green}-1440.png`、`accounts-{zh-red,en-green}-390.png`（共 6 张）。

## 3 真实运行结果

待补。
