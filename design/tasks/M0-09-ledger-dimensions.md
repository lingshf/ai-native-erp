# M0-09 迁移切片 2：财务维度

- 里程碑：M0　依赖：M0-08　建议分支：`ledger-dimensions`

## 目标

迁移维度功能：维度与值、科目维度结构（必填/禁止/可选）、默认值与派生、平衡维度。

## 范围

- core：维度规则（值有效期/停用、结构校验、默认 → 派生的应用顺序、平衡维度校验），纯函数为主。
- infra：类型化配置表 + 迁移、`/api/v1/dimensions` 路由。
- web：维度、维度值、科目维度结构维护页面。
- 旧行为对照表写入 PR 描述。

行为参考：`src/book.mjs`（dimensions 部分）、`src/enterprise.mjs`（维度/结构/派生/平衡 KINDS 及校验）；测试 `tests/book.test.mjs`、`tests/enterprise.test.mjs`、`tests/enterprise-ui.test.mjs` 中维度相关用例。

不包含：凭证行上的维度应用（在 M0-10 调用本切片的规则）。

## 验收标准

- 对照表全覆盖；结构校验错误给出可定位的字段和中/英提示。
- 维度值 > 100 行时虚拟滚动。
- CI 绿。

## 性能考虑

校验在内存中进行，单凭证 100 行 × 3 维度的校验 < 10ms（单测中用简单计时断言宽松上限，或放 bench）。索引：`dimension_values(company_id, dimension_code, value_code)` 唯一。

## 测试要求

规则组合用表驱动单测；HTTP/Web 只测主路径和一个失败路径。
