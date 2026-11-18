# M0-11 迁移切片 4：业务事件、过账规则、待转队列

- 里程碑：M0　依赖：M0-10　建议分支：`ledger-business-events`

## 目标

迁移基于业务事件的记账：服务/往来对象、过账规则（精确 → 组 → 全部的匹配顺序）、现金服务事件及取消、统计事件、清算匹配、待转队列（排队/撤回/确认），全部复用 M0-10 的预览/确认管道。

## 范围

- core：服务与往来对象、过账规则匹配（纯函数）、各事件到过账计划的转换。
- infra：类型化配置表、事件表、队列表；`/api/v1/events`、`/api/v1/posting-rules`、`/api/v1/transfer-queue` 路由。
- web：服务/往来对象维护、过账规则维护、事件录入（现金收付、统计、清算）、待转队列页面。
- 旧行为对照表写入 PR 描述。

行为参考：`src/book.mjs`（services、posting rules）、`src/enterprise.mjs`（`cash_service`、`statistics`、`clearing.match`、`cash_service.cancel`、transfer queue/withdraw）、`public/*.js` 对应界面；测试 `tests/book.test.mjs`、`tests/enterprise.test.mjs`、`tests/enterprise-integration.test.mjs`、UI 测试相关用例。

## 验收标准

- 对照表全覆盖；规则匹配歧义/缺失时给出明确错误（中/英）。
- 取消事件生成反向记账并保留链；队列撤回后不可再确认。
- CI 绿。

## 性能考虑

规则匹配在内存中按 (精确, 组, 全部) 预建 Map，单事件匹配 O(1)；规则 ≤ 5000 条时预览 p95 ≤ 2s。队列列表分页 + 虚拟滚动；索引 `transfer_queue(company_id, status, created_at)`。

## 测试要求

规则匹配表驱动单测；每类事件一个 application 集成测试（真实 SQLite）；Web 只测事件录入主路径。
