# CI-01 分片权重完整性守卫 + D204 墙钟复测 + D199 CLI 冒烟余量观察

- Sprint：S7（[计划](README.md#s7订单列表筛选--d-7-完成--s6-遗留收尾建议-v070)）　依赖：无代码依赖　建议分支：`ci-01-shard-weight-guard`
- 冲突域：bench/CI —— `scripts/test-shard-weights.json`、`scripts/ci.ts`（如需要）、`vitest.config.ts`（只在抽出纯函数时）、`packages/infra/test/tooling/*`。不改业务代码、不改任何业务测试。
  - 注意：`scripts/test-shard-weights.json`、`scripts/ci.ts`、`vitest.config.ts` 的改动会让 PR 选择退回全量（`packages/infra/test/tooling/ci.test.ts` “falls back on workspace/config changes”），PR 层运行会比平时长。
- 类型：CI 守卫（附测量报告）
- 优先级：P2
- 来源：
  - **D204**（协调者决定，记录在 FLAKE-05 [#147](https://github.com/lingshf/ai-native-erp/pull/147) 正文，未收录于路线图 §6）：FLAKE-05 之后，PR 层套件报告墙钟由约 62–65 s 升至约 79–82 s，无关文件也变慢（`http/trade-master` 中位 20.7 → 34.8 s）。静态归因：新增的 `packages/core/test/package-exports.test.ts` 不在 `scripts/test-shard-weights.json` 中，`WeightedShardSequencer.sort()` 把没有权重的文件当作 `+Infinity`（`vitest.config.ts` 中 `unknown files count as longest`），使 core 项目排到 infra 之前。#147 补了权重，但没有复测；D204 定为不占时段复测，以合并后的 Full 耗时作观察。
  - **没有守卫**：现在任何新测试文件漏登记权重都会静默改变排序，同样的问题会再次出现。
  - **D199**：3000 ms 是防挂死阈值，验收负载为 PR 层实际负载；load-cpu 下 CLI 冒烟仍超时，是已知限制（[FLAKE-05](FLAKE-05-legacy-cli-tests-under-full-load.md)、[v0.6.0 发布说明](../../docs/release/v0.6.0-release-notes.md)）。后续需要的是在真实 CI 上持续看余量，而不是再做满载实验。

## 设计角色的初步观察（只作起点，不是结论）

main 上 Full 的**作业级**耗时（含安装与准备步骤，噪声大，`gh run view --json jobs`）：#147 之前 4 次（`6ab414b`、`6be3bcf`、`1cf121d`、`0b04ec7`）12 个作业中最长分别为 42 / 44 / 46 / 46 s；#147 及之后 8 次（`d6c5014` … `3548d58`）分别为 51 / 43 / 46 / 49 / 47 / 42 / 44 / 48 s。作业级粒度看不出明确变化，需要按测试步骤和文件粒度复测（范围 2）。

## 范围

1. **守卫**（PR 快速套件，`packages/infra/test/tooling`）：
   - 把“Vitest 实际收集的测试文件集合”与 `test-shard-weights.json` 的键比较，键用与 `WeightedShardSequencer.key()` 相同的规则（仓库相对、`/` 分隔的路径），覆盖全部项目（含 slow、browser 车道）。
   - **缺失**（有测试文件无权重）→ 失败，列出文件，并在消息中写明补救方法（`node scripts/ci.ts weights REPORT.json...` 重新生成，或手工补一个估计值并在 PR 里说明）。
   - **陈旧**（有权重无测试文件）→ 失败，列出键。
   - 比较逻辑写成纯函数，单独有负例测试（构造缺失和陈旧两种输入）。
   - 收集方式由开发决定（复用 `vitest.config.ts` 中各项目的 include / exclude，或 Vitest 的 list 能力），但必须证明与 sequencer 看到的集合一致：PR 中附一次对照，即 `vitest list`（或等价）输出的文件集合与守卫收集到的集合相同。
   - **不改** sequencer 的语义（未知文件仍算最长），不改分片算法。
2. **D204 复测**（报告，写入 PR 描述）：
   - 数据源：Full 上传的 `vitest-shard-*` 报告（保留 14 天，`.github/workflows/full.yml` 中 `retention-days: 14`；拿不到的写明）与 `gh run view` 的步骤耗时。
   - 两组：#147 之前的 main Full（至少 3 次，例如 `6be3bcf`、`1cf121d`、`0b04ec7`）与补权重之后的 main Full（至少 3 次，`50e9d0d` 及之后）。比较每个车道“All tests including slow tests”步骤耗时，以及 `http/trade-master`、`trade-documents` 等 #147 点名文件的文件耗时；写 N、中位数、范围。
   - PR 层套件墙钟：用 #147 测量时的同一命令，在当前 main 上空载跑 ≥ 3 次，与 #147 记录的 62–65 s / 79–82 s 对比。该测量产生整机 node 负载，按独占时段安排，与 E2E 取证错开。
   - 结论只写数据支持的范围：后组落在前组范围内时写“本次未观察到 D204 所述的墙钟上升仍然存在”；仍偏高时写清偏高多少，并给出下一步归因建议交设计角色。**不调整任何超时或预算。**
3. **D199 余量观察**（报告，写入 PR 描述）：从同一批 Full 报告中取 `legacy-reconciliation.test.ts` 三条 spawn 冒烟与租约用例的单用例耗时，按用例列出 N、最大值、p95，与 3000 ms 比较。只观察，不改测试、不改预算；余量低于 1000 ms 的用例在 PR 中单独标出，交协调者决定是否立项。

## 不在范围

- 改分片算法、改权重的计算方式、改 `isolate` 等 Vitest 配置。
- 改任何超时、预算或测试用例（D11、D199）；load-cpu 实验。
- 定期自动化（例如每晚任务）收集墙钟：如需要，另立任务。

## 验收标准

1. 守卫在当前 main 上通过；若当前就有缺失或陈旧的条目，本 PR 一并修正，并在描述中列出。
2. 守卫的纯函数有缺失、陈旧两种负例测试；人为删除一个权重键后守卫失败，并输出该文件路径（PR 中附输出）。
3. 收集集合与 sequencer 集合一致的对照附在 PR 中（范围 1）。
4. 范围 2、3 的表格附在 PR 描述，列出所用的 run id；拿不到的数据写明原因，不估算。
5. 现有测试不删除、不削弱、不跳过、不按平台禁用（D11）；不改业务代码；无 `package.json` / lock 变化。
6. S7 共同验收：本任务合并后，后续新增测试文件的任务（TORD-05 等）须补权重条目。
