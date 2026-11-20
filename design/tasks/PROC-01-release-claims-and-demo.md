# PROC-01 发布流程：断言来源与 Demo 实跑

- Sprint：S4　依赖：—　负责：版本管理（不计入开发上限）　建议分支：`release-process`
- 冲突域：docs/release（新增 `docs/release/README.md`、`docs/demo/TEMPLATE.md`），与所有代码任务不相交
- 来源：[v0.3.0 回顾](../../docs/release/v0.3.0-retrospective.md)行动项 2、3

## 范围

1. 新增 `docs/release/README.md`（发布流程）。至少写明：
   - RC → Demo → Sprint 评审 → 回顾 → tag 的顺序，以及 D20 / D21 的 tag 规则（链接到路线图，不重复全文）；
   - **断言需有来源**：发布说明、CHANGELOG、用户文档中的数字性和全称性断言（如“所有点击区 ≥ 44px”“行为与上一版相同”），每条要附来源，即测试文件与用例名、截图路径或实测命令；没有来源的就收窄说法或删掉；
   - 运维可见变化（日志字段、错误类型、端口、CLI 输出等）在 CHANGELOG 中给出旧值 → 新值的对照。
2. 新增 `docs/demo/TEMPLATE.md`（Demo 模板）。至少写明：
   - 每条命令在评审前已在 PowerShell 中实跑，并记录 head SHA、实际输出摘要和截图；
   - 不出现 `<…>` 占位符，参数写实际值；
   - 使用一次性数据集与独立端口，不使用用户数据或 4173。
3. 本 Sprint 的发布 PR（建议 v0.4.0）按以上两份文件执行，作为首次验证。

## 验收标准

1. 两份文件存在，并从 `README.md` 的文档区或 `docs/release/` 的现有说明链接可达。
2. PR 评审按 `docs/release/README.md` 对一份既有发布说明（v0.3.0）抽查 3 条断言，PR 中示范每条的来源写法。只演示，不改已发布的历史文档。
3. 只改文档。
