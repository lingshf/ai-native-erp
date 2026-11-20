# v0.5.0 Demo 采集记录

## 源码与构建

| 项 | 值 |
| --- | --- |
| 产品基线 | `git rev-parse HEAD` = `819cbfdadce8b612db318cbb7b18b02db66ffe1a`（#128） |
| 采集时 origin/main | `49d936bb39225f88e5a99755ed65152ab6f369cc`（#127，仅 design/ 文档，在 819cbfd 之后） |
| `git diff --stat origin/main -- packages` | 空（产品代码与基线一致） |
| 构建 | `npm run build`，退出码 0，`✓ built in 412ms` |
| 最终采集 | 2026-11-20 14:14:53 → 14:16:08（-08:00），端口 4196 |

说明：分支 `s5-demo` 从 `819cbfd` 创建。#127 只改 `design/`，`git diff --stat origin/main -- packages` 为空，所以截图所用产品代码与 main 一致。

## 步骤与结果

最终采集按 README §2 的 A–G 块原文依次执行（A→B→C→D→E→F→D）。

| 步骤 | 结果 |
| --- | --- |
| A 构建 | 退出码 0 |
| B 主账套启动 | pid 50452，端口 4196，归属校验通过 |
| C seed + 采集 | 两张采购发票过账（各 11300）；12 张截图 |
| D 清理 | 端口 4196 已释放 |
| E 迁移账套 | legacy-import 状态 `imported`；check verdict `pending`（确认前）；pid 79836 |
| F 采集 | 4 张截图 |
| G 清理 | 端口 4196 已释放；`erp-demo-*` 临时目录 0 个；无 `.bak`、无 `.legacy-fixture-*` |

之前还做过一轮试跑（不同临时账套，已清理）；最终截图全部来自上表这一轮。

## 采集日志摘要

- 订单保存：4 个组合（zh 红 / en 绿 × 1440 / 390）保存均返回 201，`noticeFocused: true`，焦点在 `div.tord-saved`。
- 凭证查看：4 个组合 `returnedToButton: true`。
- 新建凭证：4 个组合焦点落在表单内的 INPUT。
- 迁移核对页：4 个组合均有 5 个可见 kv 表；容器宽度 1072（1440）/ 310（390），`scrollWidth` 等于 `clientWidth`；页面横向溢出 0；每张截图 `overflowPx` 为 0。
- 控制台：每轮首个页面各有一条 404（订单页一条、迁移页一条）。日志中的 URL 是页面地址，不是请求地址；Playwright 没有给出失败请求。根据代码（仓库无 favicon 文件，也无 `link rel=icon`）**推测**为 `/favicon.ico`，没有抓包证实。

## 观察（报告给协调者，未改代码）

- 迁移核对页在 390 宽度下，kv 表第二列很窄，英文单词内部断行（如 `enterpri/se`、`dimensio/n_values`）。无横向溢出，也不遮挡，但可读性一般。这是产品现状，Demo 如实呈现，是否登记 backlog 由设计决定。

## 未验证项

- 没有改前/改后对比；未测量焦点时机；未用读屏软件验证。
- 未重新测量控件高度。
- #123 的其他焦点路径（只覆盖了“查看后回到按钮”和“新建凭证”）、业务事件页均未走。
- 迁移页只展示了 kv 表的版式，不代表迁移功能本身的验收。

## 文档与代码差异

无。
