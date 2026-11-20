# 发布流程

版本管理（Release Manager）维护本流程。版本与 tag 规则来自协调者的决定 D20（按里程碑划分 Sprint；SemVer，tag 写作 `vX.Y.Z`，修复用 Z 位）与 D21（tag 打在发布 PR 合并后的 squash 提交）。**这两条目前没有收录在[路线图 §6 决定记录](../../design/roadmap.md#6-决定记录)**（该表无 D20/D21），实际落实记录见 [CHANGELOG](../../CHANGELOG.md) 各版本说明和 `docs/release/v*-release-notes.md`（“按 D21，tag … 打在本发布 PR 合并后的 squash 提交上”）。待协调者把 D20/D21 补进 §6 后，这里改为链接到该表。

## 顺序

1. **发布候选（RC）**：开一个发布 PR，只改文档与发布文件（CHANGELOG、`docs/user`、`docs/flows`、`docs/demo`、`docs/release`）。走评审与 CI。
2. **Demo**：按 [Demo 模板](../demo/TEMPLATE.md)写脚本并实跑。
3. **Sprint 评审**、**回顾**：存为 `docs/release/vX.Y.Z-sprint-review.md`、`vX.Y.Z-retrospective.md`。
4. **tag 与 Release**：发布 PR 合并、main 的 Full 为绿之后，经协调者授权，在**该 PR 的 squash 提交**上打 annotated tag `vX.Y.Z`（D21），再发布 GitHub Release（正文取 release notes，去掉“草稿”字样，相对链接改写为 tag 链接）。
5. 不自行合并、打 tag、开 auto-merge。文档与代码不一致时以代码和测试为准，报告差异，不改代码迁就文档。

## 断言需有来源

发布说明、CHANGELOG、用户文档中的**数字性**和**全称性**断言（例如“所有点击区 ≥ 44px”“行为与上一版相同”“约 7 s”“N 个作业”），每条都要有来源，三选一：

- 测试文件与用例名（或脚本与断言）；
- 截图路径；
- 实测命令及其输出摘要（含 commit SHA）。

没有来源的，收窄说法（写明范围与例外）或删掉。来源写在发布 PR 描述或评审记录中，不要求写进说明正文。

### 来源写法示例（抽查 v0.3.0 发布说明，只演示，不改历史文档）

| 断言（v0.3.0 发布说明） | 来源 | 核对结果 |
| --- | --- | --- |
| “自 v0.2.0（`037b3ce`）以来合并 25 个提交” | 命令 `git rev-list --count 037b3ce..c7e5783` 输出 `25` | 一致 |
| “现为 6 个 browser + 6 个 unit 作业” | `.github/workflows/full.yml`：`matrix.shard: [1..6]`，注释“Unit and browser use 6 shards each”，lane 为 unit 与 browser | 一致 |
| “窄屏与粗指针下按钮等控件 ≥ 44 px” | `design/reviews/UI-1.md` 检查项 2：**仅覆盖 390 px 宽**下可见控件 ≥ 44px，表格内禁用的复选框不计（D-6）；明细见该文 §4。**粗指针（pointer: coarse）条件不在此证据内** | 部分有来源：390 px 成立；粗指针未覆盖，应删去或补证据；“等控件”也应写出例外 |

## 运维可见变化给出对照

日志字段、错误类型、端口、CLI 输出、退出码、迁移编号等变化，在 CHANGELOG 中写**旧值 → 新值**，并说明是否影响 HTTP 响应或脚本。示例：`errorType`：领域 / 存储拒绝的 400 由 `ParseError`、404/409 由 `HttpError` → `DomainRejection`（见 CHANGELOG `[0.3.0]`）。

## 检查清单（发布 PR 评审前自查）

- [ ] 每条数字性 / 全称性断言有来源或已收窄。
- [ ] 运维可见变化有旧值 → 新值。
- [ ] 任务表（`design/tasks/README.md`）状态与 PR 链接与实际一致。
- [ ] Demo 按模板实跑并记录。
- [ ] 只改文档，无真实账套数据。
