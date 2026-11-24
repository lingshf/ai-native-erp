# Demo v0.21.0（DEMO-22）

> 窗口结果、失败原因与证据清单只写在 [run-through.md](run-through.md)，此处不重复。截图在 `shots/`，日志在 `logs/`。

## 范围（RC 范围终点 `3ae4848d36c4c06c2e208173e58ed2cac3771564`）

祖先检查与 SHA 角色见 run-through。本版本的用户可见改动只有 TLIST-06（付款与收款页“刷新列表”）。

## 拍摄内容（`scripts/capture.mjs`）

1. 付款与收款（`#/trade-settlements?company=DEFAULT`，“核销分配”页签）中英文各一张 1440 截图（红 / 绿主题），“刷新列表”在表格上方、fieldset 之外。
2. 390 px 中英文各一张：`scrollWidth ≤ 390`，按钮 `left ≥ 0` 且 `right ≤ 390`。
3. 原生键盘记录（`page.keyboard.press`）：
   - K1：焦点起点是“核销分配”页签头按钮（`button.fasttab-toggle[aria-controls=tset-allocation-body]`），Tab → “刷新列表”，Enter 与空格各触发 1 次未结项第一页请求；
   - K2：先选中一条未结项，再 Tab 到“刷新列表”并按 Enter，选中保持。核销金额保持的断言用错了选择器，已作废（D521）；金额保持由产品测试 TLIST-06 S3 证明；
   - K3：预览后点“确认账面核销”，确认的 POST 被中止，进入“结果未知”锁定态；表格锁定，“刷新列表”仍可用，Tab 仍到达，Enter 触发 1 次请求，“安全重试过账”按钮与锁定状态保持。

## 运行方式

`run-main.ps1` 要求显式 `-Port`，开账套后立即打印完整 `demo-account-path=`（D500），并在删除账套前列出其中全部文件的字节数与 SHA-256（含 `-wal` / `-shm`，S21 回顾行动 1）。窗口内的逐字命令见 run-through 与 PR 正文。
