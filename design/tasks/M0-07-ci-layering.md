# M0-07 CI 分层与预算

- 里程碑：M0　依赖：M0-05　建议分支：`ci-layering`

## 目标

按[路线图 §4](../roadmap.md)把 CI 分为 PR 快速层、main/每晚完整层、性能基准层，并让耗时可见。

## 范围

- `ci.yml`（PR）：安装 → `biome ci` → `typecheck` → `check:boundaries` → 受影响测试（`vitest run --changed origin/<base>`；`package.json`/lock/`vitest.config.ts`/`tsconfig*` 变动时跑全部）→ `test:legacy`（仅当 `src/`、`public/`、`tests/` 有改动；M0-15 后删除）→ web build。checkout `fetch-depth: 0`。
- `full.yml`：push 到 `main` 及每晚 cron；每晚运行前检查过去 24 小时 main 是否有新提交，无则跳过。跑全部测试 + build。
- `bench.yml`：每晚（同样跳过规则）+ `workflow_dispatch`；先放占位基准（例如 1 万行 SQLite 插入/查询），真实 100 万 GL 行基准由 M0-12 提供。结果写 `$GITHUB_STEP_SUMMARY`，上传 artifact（保留 14 天）。
- 每个 job：`timeout-minutes`、`concurrency`、npm 缓存；summary 列出最慢 10 个测试。
- 慢测试约定：`*.slow.test.ts` 只在完整层运行，用于真实浏览器/大数据测试。

## 涉及文件

`.github/workflows/{ci,full,bench}.yml`、`vitest.config.ts`、`package.json`、`packages/infra/bench/`（占位）。

## 验收标准

- 仅改一个 web 组件的 PR 不运行 core/infra 测试；PR CI 墙钟 ≤ 10 分钟（记录实际）。
- `full.yml` 合并后自动运行；每晚无新提交时跳过（说明验证方法）。
- `bench.yml` 可手动触发并在 summary 输出结果表。
- PR 描述给出月度 Actions 分钟估算。

## 性能考虑

本任务即 CI 性能；目标见路线图预算。

## 测试要求

无新增产品测试。
