# M0 目标架构

范围：M0 结束时仓库的形态。只写必须统一的约定；各切片的细节在其任务文档里。遵循[产品准则](product-guidelines.md)，取代旧 [architecture.md](architecture.md) 中的双库/NestJS/Server 设计。

## 1. 包与分层

```text
packages/
  core/    src/domain/       纯领域：金额、科目、凭证、期间、规则求值……无 I/O、无外部运行时依赖
           src/application/  用例与端口（仓储/UoW、时钟、AI 助手接口），只依赖 domain
           src/contracts/    HTTP DTO 与 zod schema，前后端共享；不依赖 domain/application
  infra/   src/storage/      Kysely + better-sqlite3 实现仓储/UoW，SQL 迁移
           src/http/         Fastify 路由（每模块一个文件）、错误映射、静态资源
           src/ai/           Copilot SDK 适配器（实现 application 的 AI 端口）
           src/legacy/       旧账套只读读取器（保留到 M2 账套迁移）
           src/main.ts       组合根：读配置 → 开库 → 组装用例 → 启动 Fastify（仅 loopback）
  web/     src/              React 19 + Vite + TanStack Query/Router(React Router) + TanStack Virtual；labels/偏好并入此包
```

依赖方向（由 `scripts/check-boundaries.mjs` 按目录检查，CI 执行）：

| 来源 | 允许导入 |
| --- | --- |
| core/domain | 仅 core/domain |
| core/application | core/domain |
| core/contracts | zod |
| infra | core/*、Node 内置、kysely、better-sqlite3、fastify、@fastify/static、@github/copilot-sdk |
| web | core/contracts（经 `@erp/core/contracts` 导出）、浏览器 API、React 生态 |

core 不得导入 infra/web；web 不得导入 Node 内置或服务端库。

## 2. 直接运行 TS 源码

- 各包 `exports` 指向 `src/*.ts`；源码内相对导入写 `.ts` 扩展名。tsconfig：`erasableSyntaxOnly`、`verbatimModuleSyntax`、`allowImportingTsExtensions`、`noEmit`、`strict`。
- 服务器：`node packages/infra/src/main.ts`（Node 26 原生类型剥离）。因此禁止装饰器、enum、参数属性等非可擦除语法——这也是去掉 NestJS 的前提。
- 类型检查：根目录一次 `tsc -b`（或 `tsc --noEmit -p` 每包），不产出 JS。
- 只有 web 需要 `vite build` 产物，由 infra 以静态文件服务。

## 3. 存储

- SQLite 唯一实现。连接打开时设置：`journal_mode=WAL`、`synchronous=NORMAL`、`foreign_keys=ON`、`busy_timeout=5000`。
- 迁移为不可变的编号 SQL 文件；启动只校验不自动迁移（沿用现有行为），`storage:admin migrate` 显式迁移。
- 单用户 Local：作用域沿用现有 tenant/book/company 模型，tenant/book 取固定值，不新增多租户逻辑。
- 写用例：一个用例 = 一个 `BEGIN IMMEDIATE` 事务；事务内不做 HTTP/AI/用户等待。better-sqlite3 是同步的，长查询会阻塞事件循环，基准需观测。
- 索引按访问路径在各切片迁移中添加，并在任务文档“性能考虑”中列出；用 `EXPLAIN QUERY PLAN` 测试锁定热点查询走索引。

## 4. 旧代码迁移：统一账模型

旧代码有两套账：`src/book.mjs` 的月度教学账（草稿凭证、服务/过账规则、维度、月结结转、报表、AI 起草）和 `src/enterprise.mjs` 的法人账（版本化配置、预览/确认、多轴规则、纠错链、待转队列、审计）。新架构只保留**一个**模型（决定 D1，见[路线图 §6](roadmap.md#6-决定记录)）：

- **公司（账）**：代码、名称、会计币与精度、财年、`closeMode`（`monthly-teaching` = 旧教学账的月结结转；`annual` = 法人账的月冻结/年结）。旧教学账将来在 M2 作为一个 `monthly-teaching` 公司导入。
- **配置**：科目（类型/报表类别/正常方向/用途/备抵/启用）、维度与值、科目维度结构、默认/派生、平衡维度、服务/往来对象、过账规则。用**类型化表 + `revision` 列做 CAS**，变更写追加式 `config_history` 供历史查询；不再用通用 JSON `configs` 表。
- **凭证**：草稿（可改删）→ 预览（零写入，返回计划与指纹）→ 确认（事务内重算并比对指纹，原子写 GL/回执/审计）。来源引用 + 幂等键唯一；重复确认返回原回执。过账后不可改删，纠错只能反向/替换/重分类并保留链。
- **业务事件**：现金服务事件、统计、清算匹配、待转队列，均走同一预览/确认管道。
- **查询**：总账、试算、利润表/资产负债表、对账、下钻；结账预览/结账/下一期间。
- **AI**：起草/讲解/解释数字，只返回候选，用户明确采纳后填入编辑器。

迁移方式：每个切片先列“旧行为对照表”（旧测试文件 → 行为 → 新测试位置/放弃理由），以旧测试为行为参考在新架构重写，不逐行翻译旧代码。旧代码在 M0-15 前保持可运行、不修改。

## 5. API

- 纯 Fastify 5；路由 `/api/v1/<module>/...`，请求/响应用 core/contracts 的 zod schema 校验；统一错误体（沿用现有 `errors.ts` 的安全错误映射）。
- 仅监听 loopback；无登录，操作者为固定本机 actor（不从 HTTP 读取）。
- 列表接口必须有界：`limit`（默认 100，上限 500）+ 稳定排序游标。

## 6. Web

- 按业务模块的懒加载路由；左侧分组导航只列已实现功能。
- 超过 100 行的列表用 TanStack Virtual，数据按页从 API 取（不先拉全量）。
- 中/英 label 外置、红/绿主题、教学开关保存在 localStorage，不写业务数据。

## 7. 测试与质量

- Vitest 唯一测试框架：根配置 `projects` = core（node）、infra（node，真实临时 SQLite 文件）、web（jsdom）。测试与源码同目录 `*.test.ts(x)`。
- 分层：domain 纯函数单测；application 用内存/真实 SQLite 仓储测用例；infra 用 Fastify `inject` 测 HTTP；web 用 Testing Library 测组件交互。同一行为只在最低能覆盖的层测一次。
- Biome 负责 lint + format，替代 `node --check` 文件列表。
- 性能基准放 `packages/infra/bench/`，用 Vitest bench 或独立脚本，只在每晚/手动 CI 运行。

## 8. 性能考虑（M0 总体）

- 规模：基准账 100 万 GL 行、1 家公司、200 个科目、24 个期间、3 个维度。
- 热路径：试算/总账按 (company, period, account) 聚合——索引 `lines(company_id, period, account_code)`；先测纯聚合查询，p95 不达标再引入在过账事务中维护的期间余额表（不预先设计）。
- 写路径：≤100 行凭证预览/确认 p95 ≤ 2s，确认包含事务提交。
- 前端：路由懒加载；记录首屏 JS 体积作为基线，后续 PR 对比，不设未测的统一上限。
