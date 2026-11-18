# M1-01 贸易主数据

- 里程碑：M1　依赖：M0-R　建议分支：`trade-master-data`

## 目标

实现 [FR-T01](../requirements.md)：贸易伙伴（vendor/customer/both）、非库存商品（expense/service）、AP/AR 过账配置、付款条件、税码。

## 范围

- core：主数据规则（伙伴/商品允许税码交集、选择唯一有效税码、缺税配置不等于免税；AP 控制=负债、AR 控制=资产，预付/预收科目类型；现金科目仅普通 cash 资产；代码不可变）。
- infra：类型化表（复用 M0-08 的 `revision` CAS + `config_history` 模式）、`/api/v1/trade/*` 主数据路由。
- web：伙伴、商品、过账配置、付款条件、税码维护页（列表 > 100 行虚拟滚动）。

行为参考：stash `b9f00dbf` 中 `src/enterprise-trade.mjs` 的 `TRADE_KINDS`（tradeParty/tradeProduct/tradeProfile/tradeTerms/taxCode）及 `tests/enterprise-trade*.test.mjs` 主数据用例（只读参考，用 `git show b9f00dbf^3:<path>` 查看）。

不包含：单据、计算器。

## 验收标准

- FR-T01 每条规则有测试；“初始没有行为的分组字段不添加”。
- CI 绿。

## 性能考虑

伙伴 ≤ 1 万、商品 ≤ 1 万时列表/搜索 p95 ≤ 1s：索引 `(company_id, code)` 唯一、`(company_id, name)` 用于前缀搜索。

## 测试要求

规则表驱动单测；路由各 1–2 个 inject 测试。
