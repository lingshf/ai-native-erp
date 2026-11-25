# 性能：预算与证据索引

本页只链接现有的预算与基准记录，不新增阈值。事实依据为 main `33b40e117d857fbfa9d506001a74acbb6941f165`；Developer 的事实复核尚未做，状态见 [docs/README 矩阵](../README.md)。

## 1. 预算在哪里定义

| 预算 | 权威位置 |
| --- | --- |
| 热读 p95 ≤ 1 s；≤100 行预览/确认各 p95 ≤ 2 s；100 万 GL 行合成基准 | [路线图](../../design/roadmap.md) 第 9 行（目标，非 SLA） |
| 性能“已落实，或预算有证据，或明确‘未测’” | [产品准则 PG-05](../../design/product-guidelines.md) |
| 预算的 80% 为预警线（读 800 ms；对账 120 s 预算的 96 s） | D18，见 [贸易基准](trade-e2e-bench.md) 与 [对账基准](legacy-reconciliation-bench.md) 的原文；[决定索引](../../design/decisions.md)中 D18 只有“提及”，没有独立记录行 |
| PR CI ≤ 10 分钟；基准只在每晚/手动运行 | [路线图](../../design/roadmap.md) 第 36、60、70 行 |

## 2. 基准与记录

| 内容 | 命令 / 入口 | 记录 |
| --- | --- | --- |
| 账本 100 万 GL 行与读路径 | `npm run bench:generate-ledger -- <新文件>`、`npm run bench` | [根 README“性能证据”](../../README.md#性能证据)；CI 为 [bench.yml](../../.github/workflows/bench.yml) |
| 贸易 100 万 GL + 1000 伙伴 + 10 万未结项（M1-07、M1-R3） | `node packages\infra\bench\trade-http.ts` | [贸易基准](trade-e2e-bench.md)，原始数据 [trade-bench.json](trade-bench.json) |
| 旧账导入后的对账（M2-04） | `node packages\infra\bench\reconciliation.ts OUTPUT.json` | [对账基准](legacy-reconciliation-bench.md) |
| 预付/取消确认采样（非门槛） | `node packages\infra\bench\trade-adjustments.ts` | 命令与口径见[根 README](../../README.md)“预付、贷项、专用取消与反向”一节；无独立结果页 |
| 并发真实浏览器 E2E 干扰调查 | — | [E2E-01](e2e-01-concurrent-e2e.md)：测试稳定性调查，不是性能基准 |

`packages/infra/bench/` 下的其他脚本（如 `journals.ts`、`reports.ts`、`business-events.ts`）没有在本目录单独成页，其口径以根 README 和 bench.yml 为准。

## 3. 缺口

- 本页没有重跑任何基准；所列结果为各记录当时的数据，不代表当前 main。
- 日常交互（打开页面、保存凭证等）没有单独预算，只有上面的目标。
- 浏览器端渲染耗时、多公司并存、真实用户硬件：本页未找到对应的基准记录，按“未测”处理，不新增阈值。
