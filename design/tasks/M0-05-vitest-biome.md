# M0-05 统一 Vitest；引入 Biome

- 里程碑：M0　依赖：M0-04　建议分支：`vitest-biome`

## 目标

新架构只有一个测试运行器（Vitest，可并行、可只跑受影响测试）；用 Biome 做 lint/format，替代 `node --check` 文件列表。

## 范围

- 根 `vitest.config.ts` 用 `projects`：core（node）、infra（node）、web（jsdom）。把 `packages/*` 下 node:test 测试改为 Vitest，统一 `.test.ts(x)`。
- 根脚本：`test`（全部 Vitest）、`test:changed`（`vitest run --changed origin/main`）、`test:legacy`（旧 `tests/*.test.mjs`，仍用 `node --test`，M0-15 删除）。
- Biome：`biome.json`，启用 recommended lint + formatter，作用于 `packages/**`、`scripts/**`；旧 `src/`、`public/`、`tests/` 关闭 linter/formatter，仅保留语法解析，以替代 `npm run check` 的 `node --check` 列表。一次性格式化与功能改动分开 commit。
- 仅为语法检查/边界解析存在的依赖（如 `@babel/parser`、`acorn`）：若边界检查可用 TypeScript API 或 Biome `noRestrictedImports` 实现则删除，否则保留并说明。
- `verify` = `biome ci` + `typecheck` + `check:boundaries` + `test` + `test:legacy` + web build。

## 涉及文件

`vitest.config.ts`（新）、`biome.json`（新）、`packages/**` 测试、`package.json`、`package-lock.json`、`.github/workflows/ci.yml`、`tooling-tests/`（并入 Vitest）。

## 验收标准

- `packages/**` 下不再有 `node:test` 导入；测试数量与 M0-04 后一致，或在 PR 描述逐项说明合并。
- `npm run check` 中的 `node --check` 列表消失。
- `npm run test:changed` 在只改 web 文件时不运行 core/infra 测试（PR 描述贴输出）。
- CI 绿；CI 时长不高于 M0-04。

## 性能考虑

记录 Vitest 全量用时、最慢 10 个测试，作为第一次测试审计输入。

## 测试要求

迁移不改断言含义；发现的重复用例只在 PR 描述列出，由设计角色在测试审计时决定是否删。
