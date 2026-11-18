# M0-13 迁移切片 6：结账与期间推进

- 里程碑：M0　依赖：M0-12　建议分支：`ledger-period-close`

## 目标

迁移结账：结账预览（零写入）→ 结账确认 → 下一期间；按公司 `closeMode` 区分月度教学结转（损益结转到留存收益并开新期）与年度模式（月冻结、年结）。

## 范围

- core：结账计划计算（损益科目余额 → 结转分录）、期间状态机。
- infra：复用 M0-10 预览/确认管道写结转凭证；`/api/v1/periods/{id}/close-preview|close|open-next`。
- web：结账向导（预览数字可下钻、确认、提示已关闭期间不可再过账）。
- 旧行为对照表写入 PR 描述。

行为参考：`src/book.mjs`（close/nextPeriod）、`src/enterprise.mjs`（期间冻结/年结）；测试 `tests/book.test.mjs`、`tests/enterprise.test.mjs`、`tests/ui.test.mjs` 相关用例。

## 验收标准

- 对照表全覆盖；两种 `closeMode` 各有端到端用例；已关闭期间过账被拒。
- 结账幂等（重复确认不重复结转）。
- CI 绿。

## 性能考虑

结账预览复用试算聚合查询；在 100 万 GL 行数据上结账预览 p95 ≤ 2s（加入 bench）。

## 测试要求

application 层为主；Web 测向导主路径。
