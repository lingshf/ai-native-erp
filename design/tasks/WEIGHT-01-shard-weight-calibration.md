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

- 参考：main Full [45012026502](https://github.com/lingshf/ai-native-erp/actions/runs/45012026502)（`ad70189`）12 个分片 job 墙钟 26–49 s（`gh run view 45012026502 --json jobs`）；这是 job 墙钟，不是逐文件耗时，只作背景。
- 守卫：CI-01（[任务书](CI-01-shard-weight-guard-and-wallclock.md)）要求每个测试文件都已登记权重。

## 范围

1. 取最近一次覆盖本任务 base 的 main Full run，从其分片日志读取上表三个文件的实测耗时（Vitest 逐文件 `Duration` 或等价输出）；日志不含逐文件耗时时，在 PR 中写明，并以同一 run 中所在分片的 Vitest 总 `Duration` 减去该分片其余文件按现权重估算的部分来推算，标明“推算”。
2. 按与其他条目相同的单位（毫秒）把实测值写入三项；其余条目不动。
3. 判定：三项实测值与现值的偏差都在 ±25% 以内，按证据结案、不合并；任一项超出，合并新值。

## 入口参数与异常

不适用：不涉及 URL、查询或路径参数。

## 不在范围

- 重新校准其他文件的权重，或修改 sequencer 算法。
- 第三分片耗时问题（R6 #55）之外的分片拆分调整。

## 验收标准

1. PR（或结案时的任务表备注）给出：所用 run ID 与 head SHA、三项各自的实测值（含日志行或推算算式）、现值、偏差百分比。
2. 合并时：`git diff` 只改 `scripts/test-shard-weights.json` 的三行；CI-01 守卫通过。
3. 合并时：PR 附校准前后预计的各分片权重合计（由 sequencer 同一算法算出），并附合并后 Linux main Full 的分片 job 墙钟；以该 Full 为验收依据（D13 / D15），本机数字只作参考。
4. 按证据结案时：任务表状态写“结案（不合并，偏差 ≤ 25%）”，并链接所用 run。
5. **用户可见变化**：无。

## 性能考虑

- 本任务就是对 CI 耗时的校准；验收 3 给出合并后的分片墙钟。不比较本机耗时。

## 证据要求

- PR 正文：run 链接、日志摘录或推算算式、偏差表、守卫结果。
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
