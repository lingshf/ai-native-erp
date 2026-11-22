# WEIGHT-01 分片权重按 CI 实测校准

- Sprint：S11（[计划](S11.md)）　依赖：TINV-06、SLOT-01 都已结案，且覆盖两者合并提交的 main Full 绿　建议分支：`weight-01-shard-weight-calibration`
- 负责人：开发（开工时 A、B 两线已空出，不额外占名额）
- 冲突域（逐个列文件）：
  - CI 配置：`scripts/test-shard-weights.json`（只改下表三项；TINV-06、SLOT-01 若追加了本任务的条目，按其合并值核对，不改别人的新条目）；
  - 共享单文件：`scripts/test-shard-weights.json`（见 [S11 泳道](S11.md#泳道) C 线）；
  - **不涉及**：任何测试文件、`vitest.config.ts`、workflow、sequencer 与 CI-01 守卫代码。
- 类型：CI 配置
- 优先级：P3
- 来源：[S10 评审](../reviews/S10.md)遗留 4（即 S9 遗留 4，含 S8 遗留 3）。
- **结案方式**（D340）：完成（合并校准后的权重），**或**按证据结案（实测与现值偏差都在下文阈值内，不合并，只在任务表写结论与证据）。两种都满足 DEMO-11 门禁。

## 现状（main `ad70189`）

| 文件 | 行 | 现值 | 来源 |
| --- | --- | --- | --- |
| `packages/infra/test/http/trade-gui-en-green-2.slow.test.ts` | `scripts/test-shard-weights.json:37` | 7350 | 本机两次采样（[#172](https://github.com/lingshf/ai-native-erp/pull/172) D250） |
| `packages/infra/test/http/trade-gui-zh-red-2.slow.test.ts` | `:40` | 7791 | 同上 |
| `packages/web/test/leave-guard-history.test.ts` | `:66` | 150 | 手估（[#181](https://github.com/lingshf/ai-native-erp/pull/181)） |

- **权重的口径**（以现有实现为准，D341）：`node scripts/ci.ts weights REPORT.json...`（`scripts/ci.ts:375–386`）调用 `fileWeights`（`:74–101`），对每个文件取 Vitest JSON 报告中 `endTime - startTime` 的样本均值，四舍五入、至少 1，单位毫秒。Full 每个分片 job 上传的 `vitest-shard-<lane>-<n>-<run>-<attempt>` artifact 内含该分片的 `vitest.json`（`.github/workflows/full.yml:106–111`），就是这一口径的原始数据。
- **基线实测**（main Full [45012026502](https://github.com/lingshf/ai-native-erp/actions/runs/45012026502)，`ad70189`，`gh run download 45012026502` 后按 `fileWeights` 同一算式计算，单次样本）：

| 文件 | 分片 artifact | 实测 | 现值 | 偏差 |
| --- | --- | --- | --- | --- |
| `trade-gui-en-green-2.slow.test.ts` | `vitest-shard-browser-5` | 21461 | 7350 | +192% |
| `trade-gui-zh-red-2.slow.test.ts` | `vitest-shard-browser-2` | 22594 | 7791 | +190% |
| `leave-guard-history.test.ts` | `vitest-shard-unit-3` | 344 | 150 | +129% |

  同一 run 中，同为真实 GUI 的 `trade-gui-en-green-1`（`:36` 6920，实测 7970，`browser-6`）与 `trade-gui-zh-red-1`（`:39` 7615，实测 8230，`browser-3`）偏差 +15% 与 +8%，说明现有其他条目与 CI 实测同一量级；三项的偏差不是口径差造成的。
- 背景：同一 run 12 个分片 job 墙钟 26–49 s（`gh run view 45012026502 --json jobs`）；这是 job 墙钟，不是逐文件耗时，不参与判定。
- 守卫：CI-01（[任务书](CI-01-shard-weight-guard-and-wallclock.md)）要求每个测试文件都已登记权重。

## 范围

1. **测量**：取最近一次覆盖本任务 base 的 main Full run，下载其全部 `vitest-shard-*` artifact，按 `fileWeights`（`scripts/ci.ts:74–101`）同一算式取三个文件的值（逐文件 `endTime - startTime`，单位毫秒）。可直接运行 `node scripts/ci.ts weights <12 个 vitest.json>`，但它会**整体重写** `scripts/test-shard-weights.json`：只抄出三项，其余改动 `git checkout` 还原，不提交。
2. **不推算**：某文件不在任何 `vitest.json` 中（例如分片失败或 artifact 缺失），该项标“未测”并另取一次满足同一条件的 main Full；不得用分片总时长或 job 墙钟减去其余文件的估值来推算。
3. **写入**：三项写入步骤 1 的值；其余条目不动（与 `fileWeights` 同口径，故与其他条目可比）。
4. **判定**：每项偏差 = （实测 − 现值）/ 现值。三项都在 ±25% 以内，按证据结案、不合并；任一项超出，合并新值（基线已超出，预期为“完成”）。

## 入口参数与异常

不适用：不涉及 URL、查询或路径参数。

## 不在范围

- 重新校准其他文件的权重，或修改 sequencer 算法。
- 第三分片耗时问题（R6 #55）之外的分片拆分调整。

## 验收标准

1. PR（或结案时的任务表备注）给出：所用 run ID 与 head SHA、三项各自的 artifact 名、`startTime` / `endTime` 原值与差值、现值、偏差百分比；正文无“推算”值。
2. 合并时：`git diff` 只改 `scripts/test-shard-weights.json` 的三行；CI-01 守卫通过。
3. 合并时：PR 附校准前后预计的各分片权重合计（由 sequencer 同一算法算出）。合并后取一次 Linux main Full，按步骤 1 同一算式重新取三项，与写入值逐项对比（同口径：新旧都是 `fileWeights` 值），偏差都在 ±25% 内即通过；超出时在 PR 写明并报设计角色，不再追加改值。分片 job 墙钟只作背景附上，不作判定（D13 / D15）。
4. 按证据结案时：任务表状态写“结案（不合并，偏差 ≤ 25%）”，并链接所用 run。
5. **用户可见变化**：无。

## 性能考虑

- 本任务就是对 CI 耗时的校准；判定只用 `fileWeights` 口径的逐文件值，分片 job 墙钟只作背景。不比较本机耗时。

## 证据要求

- PR 正文：run 链接、三项 `vitest.json` 摘录（`name`、`startTime`、`endTime`）、偏差表、守卫结果。
- 不需要真实 Chrome。

## 设计自查（路线图 §5 设计文档自查 1–10）

- [x] 1 事实断言有来源（行号、run ID）
- [x] 2 不涉及进行中的 PR
- [x] 3 依赖列与泳道 C 线一致
- [x] 4 不新增 CSS
- [x] 5 覆盖类断言给出 `file:line`
- [x] 6 共享单文件已列出门禁
- [x] 7 不涉及入口参数
- [x] 8 改动条款已通读上下文
- [x] 9 不涉及导航与历史
- [x] 10 无几何类验收
