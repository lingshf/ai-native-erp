# Demo v0.19.0（DEMO-20）

> 状态：D480 窗口（D503/D505）已运行并关闭，结果见 [run-through.md](run-through.md)；截图在 `shots/`，日志在 `logs/`。

## 范围（RC 范围终点 `6156759c2aef6b9805aca70ba5505490e2bd4c5b`）

| 任务 | PR | 合并提交 | `merge-base --is-ancestor <合并提交> 6156759c2aef6b9805aca70ba5505490e2bd4c5b` | 结论 |
| --- | --- | --- | --- | --- |
| TLIST-04 | #296 | `ea24f87d5a4e207e93d9e8cee10d2875bd800f82` | 0 | 在范围内，v0.19.0 |
| REFAC-11 | #299 | `6fbc2da7ad0dddf7e197f47c690528435e848bb8` | 0 | 在范围内 |
| MEAS-01 | #298 | `6156759c2aef6b9805aca70ba5505490e2bd4c5b` | 0 | 在范围内 |

冻结范围之后才合并的 S21 任务（TLIST-05 于 17:20:02 PST 合并，在开窗 17:25:43 PST 之前；FLAKE-08 同属冻结范围之外）一律“延后”，不进入 v0.19.0。

## 拍摄内容（`scripts/capture.mjs`）

1. 财务维度页（`#/dimensions`）中英文各一张 1440 截图（红 / 绿主题），“新建配置”与“刷新列表”可见。
2. 同页 390 px 中英文各一张：`scrollWidth ≤ 390`，两个按钮 `left ≥ 0` 且 `right ≤ 390`。
3. 原生键盘记录（`page.keyboard.press`）：Tab 从“新建配置”到“刷新列表”，Enter 与空格各触发 1 次 `/api/v1/dimensions` 请求；编辑器打开时同样 1 次且编辑器保持打开。
4. 订单详情（PO-C1，数量 10 / 已开票 6 / 未开票 4）中英文各一张 1440 截图，“未开票数量”列与“开票”入口可见（REFAC-11 只证明拆分后能正常渲染，没有拆分前对比图）。

## 运行方式

窗口内的逐字命令、批准端口与 D492 清单见 PR 正文与窗口申请；`run-main.ps1` 要求显式 `-Port`，开账套后立即打印完整 `demo-account-path=`（D500）。
