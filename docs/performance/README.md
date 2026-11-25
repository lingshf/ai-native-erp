# 性能：预算与证据索引

本页只链接现有的预算与基准记录，不新增阈值。事实依据为 main `5780f95c3a1c7908200cb8631fec38375666e5d2`；Developer 事实复核已提出修改意见，本页据此更新，复核通过与 QA 仍待做，状态见 [docs/README 矩阵](../README.md)。

## 1. 预算在哪里定义

| 预算 | 权威位置 |
| --- | --- |
| 热读 p95 ≤ 1 s；≤100 行预览/确认各 p95 ≤ 2 s；100 万 GL 行合成基准（目标，非 SLA） | [路线图](../../design/roadmap.md) 第 9 行 |
| 性能考虑已落实**且**预算有证据或明确“未测” | [产品准则 PG-05](../../design/product-guidelines.md) 第 59 行 |
| 预算的 80% 为预警线：读 800 ms、预览/确认 1,600 ms、对账 120 s 预算的 96 s | D18：[贸易基准](trade-e2e-bench.md)（含 1,600 ms 一行）与[对账基准](legacy-reconciliation-bench.md)的原文；[决定索引](../../design/decisions.md)有 D18 行，但只列出提及位置，缺决定正文 |
| 旧账迁移耗时与内存：快照 ≤ 60 s；dry-run ≤ 120 s、峰值 RSS ≤ 512 MB；导入 ≤ 10 min、RSS ≤ 512 MB；确认核对 ≤ 120 s | [迁移手册 §9](../migration-runbook.md) 表 |
| 完整 Bench 验收线（保留 20% 余量）：480 s、各进程 RSS < 409.6 MiB、HTTP p95 ≤ 800 ms | [根 README](../../README.md)“历史导入”一节 |
| 原五路径相对回退 p50 ≤ 10%（#26）；p95/p99 各自 1 s / 2 s 绝对预算 | [根 README“性能证据”](../../README.md#性能证据) |
| 各基准场景自带预算（如 `budgetMs`、`readBudgetMs`） | `packages/infra/bench/` 下各脚本，例如 `sqlite.ts`、`journals.ts`、`business-events.ts` |
| PR CI ≤ 10 分钟；完整套件与基准在 main/每晚（路线图第 36 行），基准为每晚/手动（第 70 行与 [bench.yml](../../.github/workflows/bench.yml)） | [路线图](../../design/roadmap.md) |

## 2. 基准与记录

| 内容 | 命令 / 入口 | 记录 |
| --- | --- | --- |
| 100 万 GL 行合成库生成 | `npm run bench:generate-ledger -- <新文件>` | [根 README“性能证据”](../../README.md#性能证据) |
| 完整 Bench（含 journals、business-events、reports 场景） | `npm run bench`（运行 `packages/infra/bench/sqlite.ts`；不读取上一条的输出文件） | 同上；CI 为 [bench.yml](../../.github/workflows/bench.yml) |
| 贸易 100 万 GL + 1000 伙伴 + 10 万未结项（M1-07、M1-R3） | `node packages\infra\bench\trade-http.ts` | [贸易基准](trade-e2e-bench.md)，原始数据 [trade-bench.json](trade-bench.json) |
| 旧账导入后的对账（M2-04） | `node packages\infra\bench\reconciliation.ts OUTPUT.json` | [对账基准](legacy-reconciliation-bench.md) |
| 迁移演练（dry-run、导入、核对） | `node scripts/bench-migration-rehearsal.mjs` | [迁移手册 §9](../migration-runbook.md)；工件 `artifacts/ci/migration-rehearsal.json` |
| 旧账快照耗时 | `node scripts/bench-legacy-snapshot.mjs` | [迁移手册 §9](../migration-runbook.md) |
| 导入基准支持代码 | `packages/infra/test/support/legacy-import-bench.mjs` | 被迁移演练使用，无独立记录页 |
| 预付/取消确认采样（非门槛） | `node packages\infra\bench\trade-adjustments.ts` | 口径见[根 README](../../README.md)“预付、贷项、专用取消与反向”一节；无独立结果页 |
| 并发真实浏览器 E2E 干扰调查 | — | [E2E-01](e2e-01-concurrent-e2e.md)：测试稳定性调查，不是性能基准 |

`packages/infra/bench/` 下还有其他专用脚本（如 `trade-*.ts`、`reports.ts`），没有在本目录单独成页，其口径以根 README 和 bench.yml 为准。

## 3. 缺口

- 本页没有重跑任何基准；所列结果为各记录当时的数据，不代表当前 main。
- 日常交互（打开页面、保存凭证等）没有单独预算，只有上面的目标。
- 浏览器端渲染耗时、多公司并存、真实用户硬件：本页未找到对应的基准记录，按“未测”处理，不新增阈值。
- D18 缺决定正文，预警线只能引用基准页原文。
