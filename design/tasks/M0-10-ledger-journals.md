# M0-10 迁移切片 3：凭证（草稿 → 预览 → 确认）与纠错

- 里程碑：M0　依赖：M0-09　建议分支：`ledger-journals`

## 目标

迁移凭证核心：草稿可改删；预览零写入并返回计划与指纹；确认在单事务内重算比对指纹，原子写 GL 行、回执、审计；幂等；过账后不可改删，纠错只能反向/替换/重分类并保留链。

## 范围

- core：凭证与行校验（借贷平衡、精度、期间开放、科目启用、维度结构——复用 M0-09）、过账计划、指纹、纠错链规则。
- infra：`journal_drafts`、`journal_entries`、`journal_lines`（含维度列）、`receipts`（来源引用 + 幂等键唯一）、`audit_log`；`/api/v1/journals` 路由（草稿 CRUD、preview、confirm、reverse/replace/reclassify）。
- web：凭证列表（虚拟滚动、按页取数）、凭证编辑器（键盘可用：Tab/Enter 新增行、Ctrl+Enter 预览）、预览确认对话框、纠错入口。
- 旧行为对照表写入 PR 描述。

行为参考：`src/book.mjs`（save/post/reverse drafts）、`src/enterprise.mjs`（preview/post `journal`、corrections reverse/replace/reclassify、audit）、`public/app.js`、`public/enterprise.js`；测试 `tests/book.test.mjs`、`tests/enterprise.test.mjs`、`tests/server.test.mjs`、`tests/enterprise-server.test.mjs`、`tests/ui.test.mjs`、`tests/enterprise-ui.test.mjs` 相关用例。

不包含：业务事件/过账规则（M0-11）、报表（M0-12）。

## 验收标准

- 对照表全覆盖；重复确认（同幂等键）返回原回执且不重复写；预览后配置被改则确认被拒（指纹不符）。
- 确认事务失败时无部分写入（注入故障测试）。
- 纠错链可从原凭证追到所有纠错凭证。
- CI 绿。

## 性能考虑

- 100 行凭证预览/确认 p95 ≤ 2s（在已有 100 万 GL 行的库上；基准脚本放 `packages/infra/bench/`，M0-12 合入 1M 数据生成后在每晚跑）。
- 索引：`journal_lines(company_id, period, account_code)`、`receipts(company_id, source_ref)` 唯一、`receipts(idempotency_key)` 唯一。
- 用 `EXPLAIN QUERY PLAN` 测试锁定幂等查找走索引。

## 测试要求

正确性用例集中在 application 层（真实临时 SQLite）；HTTP 层只测契约与错误映射；Web 测编辑器键盘流和预览确认。
