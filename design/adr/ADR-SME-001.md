# ADR-SME-001..006：中小企业ERP选型提案

> **已取代（superseded，D560）**：本文中的双数据库（SQLite / PostgreSQL）、Server 档案、OIDC 身份与多用户批准设计已被 [ADR-LOCAL-001](ADR-LOCAL-001.md) 取代：只做 SQLite、本机单用户、loopback 无登录。现行架构以 [M0 架构](../m0-architecture.md)为准，方向以[路线图](../roadmap.md)为准。本文保留为历史记录；其中的 FG / OQ 需求与会计政策按路线图开头的说明继续有效。

状态：ACCEPTED（协调者受用户委托代为决定，可调整），ARCH-SME-01宏观独立G3已释放MODEL01例外；不是已安装/已实施选型。首Local SQLite，同时Server Compose/PostgreSQL/本地开发OIDC试点，GL优先；预算是目标非SLA，运维/OIDC责任人为用户。关联[架构与验收](../architecture.md)及[阶段实施](../architecture-migration.md)。作者实际gpt-6.1-sol；独立评审请求claude-opus-5.5，实际身份不能独立核实时沿用户MODEL01，仅豁免身份核实。

## ADR-SME-001：模块化单体而非先拆微服务

| 方案 | 优点 | 成本/取舍 |
| --- | --- | --- |
| 推荐：独立SPA/API、应用服务+纯领域+基础设施ports，同一ERP事务DB | 前后端独立部署；GL与子账原子性直接可测；模块可逐步拆迁 | 需严管依赖方向、表所有权和共享迁移作者；进程内隔离不是安全边界 |
| 微服务按GL/AP/AR先拆DB | 团队/部署可独立扩容 | 要跨库一致性、幂等补偿/消息运维；本项目尚无支持该成本的规模证据，不接受子账已写而GL未成的伪原子 |
| 延续单文件+SQL内嵌 | 最省初期工具 | 身份/多人/方言/测试边界难扩，不能满足此次目标 |

决策：保留单DB原子编排；模块公开port/事件而非互调私有表。只有真实瓶颈或独立团队需要且一致性模型另审才拆网络服务。

## ADR-SME-002：前端与状态

| 方案 | 适配与不采用原因 |
| --- | --- |
| 推荐React+Vite+TS、Router、TanStack Query、React Hook Form、Zod | 复杂多行ERP表单、查询缓存/失效和typed契约；UI与会计引擎分离；不默认再加Redux |
| Vue+Vite/Pinia | 同样合理、组件/学习成本友好；当前无团队偏好证据，选一个生态避免双框架；若团队明确Vue可在M00替换并重审UI细节 |
| Angular | 体系完整但迁移/工具量更重，当前小团队没有采用证据 |
| 继续原生DOM | 可作迁移桥，不作为多人ERP长期组件/状态方案 |
| Next.js/SSR | 财务登录后工作台无SEO需求，SSR增加会话/部署边界；后续公开门户可另独立工程 |

后果：新增构建链需锁文件/CI/浏览器兼容及国际化测试；不借新框架删除旧UI/旧测试。label、主题、教学偏好单独保留，不依赖框架隐式翻译。

## ADR-SME-003：后端与输入契约

| 方案 | 适配与不采用原因 |
| --- | --- |
| 推荐NestJS+Fastify、TS strict、版本化REST/OpenAPI | 模块/DI/guard便于多用户分层，Fastify处理HTTP；domain不放decorator，避免框架渗入会计 |
| Fastify独立+自建DI | 依赖更少，也可行；但需要自行维持模块/guard/事务编排规范，当前选择可审查的统一结构 |
| Express | 成熟，但输入schema/模块规范需额外组装；非性能结论 |
| 现node:http | 兼容桥继续，长期多用户认证/运维/契约维护手工成本大 |
| .NET/Java | 企业生态强，需重写JS精确会计行为并跨语言维护；没有团队/组织必须改语言证据，不额外扩大迁移 |

验证候选：Zod DTO与OpenAPI单源生成/一致性测试，若所选工具不能保留精确金额/可空/版本语义，M01阻塞而非手工维护两份。结构校验不能替代领域政策。兼容接口与新/v1明确分离；没有“启用Nest即自动安全”的承诺。

## ADR-SME-004：数据库和查询层

| 方案 | 适用性 / 决策 |
| --- | --- |
| 推荐PostgreSQL | 多人生产：MVCC、行锁、约束、RLS附加防线、WAL/PITR；需要运维/容量与恢复演练 |
| 保留SQLite | 本机单人/教学/快速真实库测试；禁止共享盘多实例写，不以SQLite通过替代PG集成 |
| MySQL | 中小企业常见，事务/索引成熟；JSON/检查/迁移/隔离/RLS差异需要第三适配器与CI，首批不承诺支持 |
| SQL Server | 现成微软运维/Entra集成团队可选，许可/驱动/DDL与部署成本需明确；首批不加入四库矩阵 |
| 推荐Kysely + 两个专用adapter | 类型化SQL、显式事务/锁/金额读取，允许方言特有SQL；非自动跨库能力。驱动pg/better-sqlite3先spike再锁版 |
| Drizzle | 显式schema和SQL迁移亦合适，但SQLite/PG各dialect/schema仍要分别维护；当前不同时引入两个查询层 |
| Prisma | 关系建模/客户端便利，但复杂锁/触发器/不可变账证仍需原SQL及方言处理；优先可见SQL而非额外对象映射 |
| 手写SQL全部保留 | 旧桥可继续；新层统一参数化、作用域和事务ports，避免散布字符串SQL复制 |

后果：两套DDL迁移不是“一个连接串”；两驱动真实事务契约CI必需。不把更多数据库按钮当已支持。生产迁移仅review过的SQL及版本锁，禁schema push和启动自动变更。

M02详细G2补充（待本阶段G3）：不采用Kysely Migrator直接协调版本，改用其连接上的显式事务runner/有序SQL/schema_migrations，保留逐版LF规范校验和、SQLite原子DDL及PG事务advisory lock先于迁移表查询。此偏差解决原工具不提供校验和和SQLite事务迁移承诺的问题，不引入第二个查询层；详见[阶段设计](../architecture-migration.md)。PG18是本阶段真实驱动验证目标，确切补丁版/来源/完整性仍须执行时记录；不是宣称已经运行。

## ADR-SME-005：认证、AI与任务

推荐Server OIDC+BFF/session+RBAC/作用域+自审拒绝；Local保持单人模拟并明确标识。拒绝自写密码库、浏览器长效token、把教学开关当绕过权限。

Server持久ApprovalRequest承载maker提交与异人待办批准；零写预览与持久提交分开，批准重算/GL/回执/审计同事务，期限/版本失效不暗中刷新计划。幂等键绑定可信principal、scope及payload/计划指纹，先核当前授权再返回旧结果。旧手工journal待转GL由GL服务显式transfer/withdraw，保留四状态；不是outbox自动补账，AP/AR仍同步。旧教学book仅Local兼容，Server不打开其无scope文件。详见架构§4/6。

AI为受限port/adapter，独立权限与超时，无DB/UoW/自动过账。首批DB outbox+inbox及持久job足够；Redis/Kafka/微服务worker平台待有实测需要再加。系统内事件是已提交事实通知，不把外部消息当GL原子事务替代品。

## ADR-SME-006：测试、构建与部署

| 选项 | 采用 / 边界 |
| --- | --- |
| npm workspaces、TS构建、一个锁文件 | 目标依赖方向/独立产物CI；初期不用Nx/Turbo，不能为目录漂亮无效拆包 |
| 现node:test + 新契约/PG集成 | 保住172和暂停候选全部行为；SQLite/PG双库合同，不能改断言让迁移绿 |
| React Testing Library + Playwright | 组件/真实浏览器校验，按实际迁移页新增；不强制先重写全部旧jsdom用例 |
| 本地开发 | web/API分进程、proxy至API；浏览器同源体验，无随意allow-origin *；独立数据目录 |
| Local发行 | 可打包静态web+API loopback+SQLite，仍独立构建产物；非多人档案 |
| 推荐Server试点：Docker Compose | reverse proxy+静态web+API+worker+PostgreSQL，有volume、health、独立migrate任务及secret注入；开发Compose不是自动生产运维 |
| 局域网服务器（容器或systemd/服务管理） | TLS/真实OIDC/备份/最小DB角色和运维负责人先就绪；数据库不对浏览器公开 |
| Kubernetes/云托管 | 可后续适配，当前不作为必须；托管PG可减少部分维护，不免除恢复验证/权限/预算 |

Node/依赖选项目实施时的受支持版本，精确锁定并记录兼容/许可证/供应链扫描结果，不在本设计假定尚未安装的新版本已经可用。

## 官方参考与核实边界

本轮只将通用架构问题发送到官方文档，不发送项目私有资料/账务/知识库内容。阅读到的官方说明支持技术取舍，**不证明项目集成已通过**：
- [PostgreSQL事务隔离](https://www.postgresql.org/docs/current/transaction-iso.html)：各隔离级别要明确选择，不能把默认READ COMMITTED当一致多查询快照。
- [SQLite适用场景](https://sqlite.org/whentouse.html)：本机嵌入与client/server数据库定位不同。
- [Drizzle迁移方式](https://orm.drizzle.team/docs/migrations)：支持生成SQL/迁移等多模式，生产不因此选择直接push。
- [Kysely官方文档](https://kysely.dev/)及[NestJS官方文档](https://docs.nestjs.com/)用于实施spike入口，本轮未进行驱动/框架安装验证。
