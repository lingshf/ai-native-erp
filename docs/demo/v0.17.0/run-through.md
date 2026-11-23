# DEMO-18 演练记录

状态：**真实时段已完成**（见 [`README.md`](README.md) §3、§4）。不打 tag。

## 1 时段前的演练

没有单独的时段前演练：`run-main.ps1` 的浏览器外 `-SkipCapture` 需要端口 4203，D489 把它并入安静时段，作为 D487 的 run-main 证据（[`logs/skipcapture.out.log`](logs/skipcapture.out.log)）。因此没有 `-Stub` 运行。

## 2 D487 证据对照

| 脚本 | 要求 | 证据 |
| --- | --- | --- |
| `run-main.ps1`（改） | 浏览器外 `-SkipCapture` | `logs/skipcapture.out.log`，退出码 0，含 `web-dist: ok` |
| `capture.mjs`（新） | 窗口内干跑（TEMPLATE 第 17 条）后才真实运行 | `logs/capture-dry-run.out.log` 与 `capture-log-dry-run.json`，退出码 0；第一次干跑失败的记录见 `logs/capture-dry-run1-failed.out.log` |

## 3 复盘与建议（S18 回顾的输入）

- 新 capture 脚本第一次干跑就在窗口内失败（选择器 `#trade-editor` 不存在，D491）；浏览器外预演无法覆盖它，所以窗口内干跑是必需步骤。建议：写 capture 选择器前先读组件源码确认 id 落在哪个元素（`FastTab` 只给正文 `<id>-body`）。
- `run-main.ps1` 的 `-Shots` 是必填参数，即使 `-SkipCapture`（D490）；模板的 `-SkipCapture` 示例应带 `-Shots <目录>`。
- 提交晚于 dist 时 `assert-web-dist` 报 `stale`，干跑前要重新构建一次；这是预期行为，建议模板写明“RC 头每变一次，窗口内重新构建”。
