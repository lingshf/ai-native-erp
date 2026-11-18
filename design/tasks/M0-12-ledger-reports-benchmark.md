# M0-12 迁移切片 5：查询与报表 + 100 万 GL 行基准

- 里程碑：M0　依赖：M0-10（可与 M0-11 并行）　建议分支：`ledger-reports-benchmark`

## 目标

迁移总账明细与下钻、试算平衡、利润表/资产负债表、对账；建立 100 万 GL 行合成数据基准并验证热读预算。

## 范围

- core：报表结构（按科目报表类别汇总）、对账规则。
- infra：查询仓储（SQL 聚合，不全量载入内存）、`/api/v1/reports/*`、`/api/v1/ledger`（游标分页）；`packages/infra/bench/`：确定性数据生成器（1 公司、200 科目、24 期间、3 维度、100 万 GL 行）+ 基准脚本，接入 M0-07 的 `bench.yml`。
- web：总账明细（虚拟滚动、按页取数）、试算、报表、从报表数字下钻到凭证。
- 旧行为对照表写入 PR 描述。

行为参考：`src/book.mjs`（reports、ledger、reconciliation）、`src/enterprise.mjs` 查询部分、`scripts/ledger-snapshot.mjs`（报表口径）；测试 `tests/book.test.mjs`、`tests/ledger-snapshot.test.mjs`、`tests/ui.test.mjs` 相关用例。

## 验收标准

- 对照表全覆盖；报表数字与对应 GL 行合计一致（属性式测试或多组样例）。
- 基准（每晚 CI）：试算、单期利润表/资产负债表、单科目总账首页 p95 ≤ 1s；结果写入 job summary。未达标时如实记录并由设计角色生成子任务（例如期间余额表），本任务不预先实现余额表。
- `EXPLAIN QUERY PLAN` 测试锁定试算和总账查询走索引。
- 总账明细 10 万行滚动不卡顿（虚拟滚动，DOM 行数 ≤ 可视行 + 缓冲）。
- CI 绿；数据生成和基准不进 PR 层。

## 性能考虑

见上；索引 `journal_lines(company_id, period, account_code)` 已在 M0-10 建立，按需补 `(company_id, account_code, period, id)` 供总账游标分页。

## 测试要求

报表口径在 application 层用小数据测；大数据只在 bench。
