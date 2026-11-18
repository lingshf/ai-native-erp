# M0-08 迁移切片 1：公司、科目、期间 + 应用外壳

- 里程碑：M0　依赖：M0-05（D1 已定：合并为一个总账模型）　建议分支：`ledger-companies-accounts`

## 目标

在新架构建立统一总账模型的基础主数据（[架构 §4](../m0-architecture.md)）和 Web 应用外壳，后续切片在此之上叠加。

## 范围

- core：公司（代码、名称、会计币/精度、财年、`closeMode`）、科目（类型、报表类别、正常方向、用途、备抵、启用）、期间（开放/冻结/关闭）领域规则与用例；配置类型化表 + `revision` CAS + `config_history`。
- infra：SQLite 迁移、仓储、Fastify 路由 `/api/v1/companies`、`/api/v1/accounts`、`/api/v1/periods`（列表有界分页）。
- web：应用外壳（左侧分组导航只列已实现功能、中/英、红/绿主题、教学开关）、公司选择、科目表（可新建/编辑/停用，乐观并发冲突提示）。
- 首次启动建立一个默认 `monthly-teaching` 公司与默认科目表（对应旧 `Book` 默认科目）。
- 旧行为对照表：在 PR 描述中列出（旧测试 → 行为 → 新测试位置/放弃理由）。

行为参考：`src/book.mjs`（默认科目、科目校验）、`src/enterprise.mjs`（companies、KINDS 中 account/period 配置与版本）、`public/app.js`/`enterprise.js` 对应界面、`public/labels*`；测试 `tests/book.test.mjs`、`tests/enterprise.test.mjs`、`tests/ui.test.mjs`、`tests/enterprise-ui.test.mjs`、`tests/labels.test.mjs` 的相关用例。

不包含：维度（M0-09）、凭证（M0-10）。不修改旧代码。

## 验收标准

- 对照表中每条旧行为有新测试或放弃理由；并发修改同一科目时后提交者收到冲突，不覆盖。
- 历史查询：可按时间点取得科目配置版本。
- 中/英 label 完整（无硬编码文案），切换不刷新丢数据。
- CI 绿，PR 层时长 ≤ 预算。

## 性能考虑

科目 ≤ 2000、公司 ≤ 50 规模下列表接口 p95 ≤ 1s；科目列表 > 100 行时用虚拟滚动。`accounts(company_id, code)` 唯一索引。

## 测试要求

domain 纯函数单测为主；每个 HTTP 路由 1–2 个 inject 测试；Web 只测关键交互（创建、冲突提示、语言切换）。
