# 中小企业ERP目标架构 ARCH-SME-01

**状态：宏观独立G3已释放EXCEPTION (user-approved MODEL01)，用户已委托执行DC-01..04及后续迁移。** 三项设计结论均PASS，具体缺陷已关闭；MODEL01仅涉及评审模型身份不能独立核实。M-TRADE获准恢复，原未提交成果保留移植；原账须完整备份/核对且ID3和只读源保留后才能切换。每阶段仍独立G3/G5/G6；当前正做[实施基线](architecture-migration.md)，不是上述新功能已经可用，更不代表44FG已完成。

入口：[选型ADR](adr/ADR-SME-001.md) · [项目状态](project.md) · [任务](tasks.md) · [验收](test-cases.md#arch-sme-01-计划验收) · [评审](reviews.md) · [总览图](diagrams/sme-overview.svg)。

## 1. 事实、目标与本轮决策范围

当前不是只有一个book.mjs：旧教学账在`src/book.mjs`；新ERP内核在`src/enterprise.mjs`，已分离贸易领域与纯金额计算器。`src/server.mjs`仍兼任HTTP、静态文件和启动；前端是原生JS、DOM与手工状态，API/领域/SQL边界尚未充分独立。内置node:sqlite同步访问、同进程缓存与本机模拟批准适合演示，不是多用户服务器架构。

基线：main的M-CORE为`3fbd75f717f7e98ca21ba059888ac2316643ff3c`，已发布172项回归。暂停贸易候选最近全套291/291、14语法通过；之后新增贸易恢复用例所在备份套件8/8通过，**尚未重跑包含该新增用例的完整套件**。TASK20..23各G5按MODEL01释放，TASK24真实GUI只到AP零写预览，组合G6、交付与发布未完成。以上不能被架构计划改标done。

本轮确认目标是“按中小企业ERP规格分离前端、业务及后端，并提供数据库选项”。下列技术栈、权限模型、容量预算是**建议默认，供用户拍板**；没有确认具体客户规模、准则/税区、托管地区、认证租户、运行成本或生产服务等级。保留现有业务政策与44FG范围，不新造行业功能。

### 架构需求与验收索引

| ID | 目标和可观察验收 | 设计 / 用例 |
| --- | --- | --- |
| AR-01 | 前端独立构建部署；业务计算不依赖DOM、HTTP框架或SQL；禁跨层反向导入，CI可检查 | §2/3 / AT-01 |
| AR-02 | 版本化OpenAPI契约，严格输入与错误、分页、命令版本、幂等；现有预览/明确批准边界不丢 | §4 / AT-02/05 |
| AR-03 | SQLite本机和PostgreSQL多用户两种明确部署档案，同一领域行为契约；不能仅换连接串宣称等价 | §5/6 / AT-03/05 |
| AR-04 | 真实身份及租户/账套/法人授权、制单复核分离、同事务审计；本机模拟不能冒充审批 | §7 / AT-04/06 |
| AR-05 | 业务、GL、税/成本事实、回执和审计原子一致；精确金额及不可编辑历史不被ORM/异步削弱 | §4/5 / AT-03/05 |
| AR-06 | 旧教学账原样保留且仅Local兼容运行；选定已发布ERP基线可验证试迁移/回退；172旧测试及暂停候选保留，无自动原地升级 | §6/9 / AT-08 |
| AR-07 | 中英label、红/绿主题、教学偏好与未保存输入保留；AI独立受限，不能写账或持有业务事务 | §3/8 / AT-07/09 |
| AR-08 | 给出可复现实测的容量预算、备份恢复、观测与生产上线门禁；未测不宣称达标 | §6/8 / AT-10/11 |

非范围：本轮不完成上述工程；不默认采用微服务、消息总线、Kubernetes、离线双向同步或多地域多写；不承诺法定税务/审计认证；不将架构设计作为恢复M-TRADE或迁移真实账的授权。

## 2. 推荐形态：独立前端 + 分层模块化单体

采用**React/TypeScript SPA + NestJS/Fastify API + 纯TypeScript领域包 + Kysely持久化适配器**。PostgreSQL是中小企业多人生产首选；SQLite保留本机单人、教学和快速测试。先模块化单体，不先把GL/AP/AR拆成独立网络服务：跨模块过账仍需要一个数据库事务。

前后端是独立工程、构建产物和进程，生产默认通过反向代理同源发布。前端静态部署、后端API部署解耦，并不意味着默认跨域开放。Server后台worker可作为第二进程复用应用服务和数据库，只负责经批准的异步任务；Local用同API进程内调度器，不另起SQLite写进程。

总览14节点，细节另图，避免一张图塞进所有模块：
- [Mermaid总览源](diagrams/sme-overview.mmd) / [可直接打开SVG](diagrams/sme-overview.svg)。
- [事务与异步细节](diagrams/sme-posting.mmd) / [迁移DAG](diagrams/sme-migration.mmd)。

### 目标目录与依赖规则（仅建议，不创建空工程）

```text
apps\web                     SPA路由、页面、表单、客户端状态
apps\api                     控制器、认证入口、契约映射、组合根
apps\worker                  报表/导入/outbox任务宿主
packages\contracts           OpenAPI、DTO/schema、生成客户端；不导出SQL实体
packages\domain\core         Money、日期、维度、期间与过账不变量
packages\domain\modules      GL/AP/AR/INV/TAX/FX/BANK/FA/LEASE/CLOSE/IC/REPORT
packages\application         用例、授权端口、UnitOfWork、固定事件编排
packages\infrastructure      SQLite/PG仓储、审计/outbox、OIDC、AI适配器
packages\ui                  通用组件、label、主题token、教学可见性
tools\migrations             两方言SQL迁移与源账导出/核验CLI
tests\contract               双数据库共同契约、跨模块和兼容测试
```

允许依赖：web→contracts/ui；api/worker→application/contracts；application→domain和**其自身定义的ports**；infrastructure→这些ports/domain；组合根选择适配器。domain不得导入Nest、Kysely、驱动、SDK、文件、网络或UI；application不得导入具体infrastructure。API不直接调用SQL，前端不导入领域写服务。`contracts`只含跨边界数据约束和OpenAPI，不成为数据库/领域大杂烩。

单仓库npm workspaces、一个锁文件、各工程独立构建；初期无需Nx/Turborepo。共享schema、数据库迁移和公共契约各一名集成作者；独立模块可以并行，不能按“页面不同”掩盖同表写冲突。

## 3. 前端工程

React + Vite + TypeScript strict，React Router按工作区/法人/模块组织路由。TanStack Query管理服务端缓存、分页和失效；React Hook Form管理本地编辑状态；Zod校验DTO边界，但服务端再次验证。初期不加全局Redux/Zustand；只有实际跨路由草稿复杂度证明需要时另ADR。

导航：业务概览；日常交易（GL、AP、AR、库存、银行、资产）；查询报表；期末；设置。未实现模块隐藏或明确不可用，不放假按钮。提供可复用金额、维度、多行单据、来源链、版本冲突及预览批准组件；配置不退化为任意JSON业务编辑器。

label继续稳定key和zh/en资源，两语言keys/插值/aria一致，由UI层的label服务提供；主题保留红默认/绿可选；教学默认关闭。偏好是浏览器界面状态，不影响账套语义；切换不重建表单、丢输入或自动保存。服务端诊断用稳定错误码和字段路径，可本地化展示，原始用户输入/历史名称/AI正文不翻译。迁移期保留旧中文诊断兼容映射，不强行改原账内容。

API结果以账套/法人/期间/筛选/版本作为query key。改变范围、注销或权限收回时撤销旧预览和缓存；迟到结果必须核上下文代次。未经保存的草稿可先仅留内存，离开提醒；若引入本地草稿恢复须独立隐私ADR，不默认将真实财务数据存localStorage。

## 4. API、应用服务与会计事务

### API与命令契约

REST `/api/v1`，OpenAPI为版本化契约；JSON Schema/Zod与契约生成需有一致性测试，不维护两个互相漂移的字段白名单。OpenAPI文档及客户端不等于已验证领域规则。兼容桥在迁移期保持旧`/api`语义，仅在已验证路由显式适配，不同时双写旧新数据库。

- 读：分页游标、稳定排序、账套/法人/期间/版本、asOf及staleness。报表月末与当前可操作对象分开。
- 写：application command含requestId、业务对象版本、合法日期；路径账套/法人必须与登录授权相符。禁止客户端传可信actor、origin或任意GL。
- 预览：无写、同一领域planner，返回计划、依赖版本、期限及签名。Server制单者以仍有效的预览显式提交ApprovalRequest；提交只持久化工作流/审计，不写GL。批准人从权限化待办取该请求，不依赖制单浏览器传递临时token。
- ApprovalRequest由application审批服务拥有：记录tenant/book/company、不可改的命令/计划摘要、依赖版本、maker的真实subject、提交时刻、单独的expiresAt及操作审计。生命周期submitted→approved/rejected/withdrawn/expired；approved与过账接受在同事务，过账失败仍submitted、不留假批准。仅maker可撤回submitted，拒绝/过期均不写账，修改后须重新预览并新提交；旧请求不可原地改内容。
- 工作流期限与短预览签名期限分开：提交核有效签名，此后以持久请求及配置的审批期限为准，不因原预览token到期丢失待办。期限的数值由M05详细政策冻结；依赖版本变化或超审批期限时拒绝批准，独立原子记录expired及原因，须重新提交。批准以requestId/原计划摘要、独立幂等键及明确确认提交；当前锁定状态同planner复算须仍与请求完全一致。密钥轮换不破坏已接受回执，回执重试仍逐请求重新校验授权。
- 错误：`code/messageKey/params/fieldErrors/requestId/retryable`；400输入、401认证、403授权、404作用域内不存在、409版本/生命周期冲突、422业务政策、429限流、503暂态。精确映射旧AppError行为，不用200错误对象。

**待实施时的同步过账序列：** 验证当前身份/动作权限/作用域→事务开始→锁定作用域、配置/期间/业务对象及审批请求→锁定状态下复核当前授权→核幂等绑定/已成功回执→核请求状态/期限/依赖版本及maker≠approver→同一planner重算并比摘要→写业务事件/受控投影+GL+税成本事实+批准状态+回执+业务审计+outbox→提交→发布缓存失效/响应。授权策略变更也取对应tenant/book/company排他锁并升版本，不能只在事务外核权限。到期/失效的独立状态记录只能条件更新同版本submitted，不能覆盖并发已批准终态。无外部HTTP或AI在事务内。审计记录经验证的actor而非请求自报身份。同步原子事务失败不能先改子账后补GL；下述显式手工待转路线不是已完成同步过账。

幂等唯一键为(tenant, book, company, operation, key)，同事务保存规范化请求指纹：可信principal、动作、完整scope、ApprovalRequest/plan摘要和业务payload；忽略仅关联用的追踪requestId，不忽略金额、对象或版本。先核当前授权，再查键：指纹不同409且不返回旧财务回执；相同且当前有权才返回原结果。权限撤销明确403，即使键已成功也不泄漏。新旧命名空间及旧Local保证级别按映射保留，旧模拟actor不能改标真实Server批准；规则/对象改回原值也变版本，多实例共用DB版本。

**持久审批的细粒度依赖：** ApprovalRequest只冻结planner实际读取的会计配置/政策版本、相关科目/维度/汇率、目标期间版本及触及业务对象/余额版本；规则候选检索须含范围版本（包括缺失候选、后来新增更强规则），不能只核命中那一行漏掉phantom。同一相关依赖发生ABA也升版本。全局水位及tenant/book/company锁行或粗粒度修订计数**不纳入**审批依赖或业务计划摘要；它们只用于互斥、观测/缓存失效。旧global revision仅保留旧预览token兼容，不移植到Server持久审批。计划摘要也排除追踪时间/读取水位等非业务元数据。别的法人写入、同法人无交叠依赖的其他对象过账、无关用户权限变化不能使该请求过期；相关配置、期间、对象或实际读取的余额变化必须失效。每次批准仍重新核当前参与人权限，权限撤销可403，但不因全局权限计数改变把所有待办作废。M05必须实现并测试该依赖集合，不能用现有全局revision代替。

### 保留OQ-02手工待转GL路线

GL应用服务拥有TransferQueue与显式transfer/withdraw命令。仅现有手工journal允许选择queued，AP/AR等仍同步原子，不因引入worker扩大准入。批准queued请求时原子记录不可变来源/冻结计划、批准/回执、pending义务及审计，**没有GL且不是已过账子账余额**；后续pending/failed→transferred或withdrawn，transferred不可withdraw。待转/失败阻止相应期间冻结/完成。

transfer重新校验当前动作授权、作用域、当前期间和冻结计划完整性，在同一UoW写GL、队列transferred、回执结果和审计；按原批准计划，不用后来配置重算，幂等重试不重复GL。失败全回滚；另短事务仅能记failed/原因，若连状态也写不了则保留pending/failed并显式可重试错误。withdraw须理由，终态不写GL且原reference不可复用。不由outbox/AI自动转账。旧pending/failed/transferred/withdrawn及冻结计划逐项迁移核验，不静默清空或改成posted。此路线及Server持久审批是对OQ-02的显式延续/增强，不是撤销原政策。

### 模块所有权与边界

| 模块 | 应用服务 / 领域职责与拥有的数据 | 合法协作 |
| --- | --- | --- |
| GL | Journal/Posting/Correction/Transfer；科目、凭证、来源/回执、手工待转队列、控制科目准入和不可变行 | 各业务通过固定posting port提交类型化意图，不能直写GL表 |
| AP / AR | Invoice/Settlement/Credit/Advance；伙伴角色、订单/未结、核销和账龄 | 调TAX/FX计算、GL过账；同事务，不把现金状态冒充银行实际支付 |
| INV | Receipt/Issue/Cost/Count；数量、成本层、结算及WIP | 收发来源由贸易编排；成本与税明细分别归属 |
| TAX / FX | TaxCalculation/Settlement、Rate/Revaluation；税版本/明细、汇率/差额链 | 纯计算返回精确事实；持久化由受控UoW完成 |
| BANK | Payment/Statement/Reconcile/Forecast；银行账户、流水、匹配/桥接 | 消费已批准付款及回执，匹配不暗中记账 |
| FA / LEASE | Asset/Depreciation/Disposal、LeaseSchedule；资产卡及账簿、租赁版本 | 消费唯一取得来源；主账簿与比较账簿不重复写GL |
| CLOSE | Accrual/Allocation/PeriodClose/YearClose；计划、义务检查、期初链 | 只通过模块公开接口汇总义务；不查询私有表推断可关账 |
| IC | Intercompany/Consolidation；双边来源、配对、抵销/集团层 | 同DB双边授权/原子事务；集团层不覆盖法人账 |
| REPORT | Trial/Financial/Reconciliation/CashFlow；只读投影和运行快照 | 不拥有业务余额，不以报表修复写业务表 |

跨模块用application层编排；领域层只依赖类型化值/port。数据库事务上下文由UnitOfWork传给各repository，不各自提交或取第二连接。“仓储”按aggregate/用例提供方法而非一套万能CRUD；重型报表有只读query adapter，不强迫走逐条aggregate仓储。

同步业务事件与GL的权威关系保留。暂停贸易的已验证事件reducer/前缀缓存是可迁移资产，不为“用了ORM”改成盲信后像。未来规范表投影可加，但与事件同事务、可从完整历史核验；恢复必须对投影和GL复核。

## 5. 数据库、金额与并发

### 两种支持档案

| 档案 | 数据库 / 部署边界 | 保障与限制 |
| --- | --- | --- |
| Local | SQLite、本地磁盘、单API进程、明确本机操作员；测试另用独立临时库 | BEGIN IMMEDIATE、FK/约束/版本和独占写；不把共享文件夹、网络盘或多副本SQLite当多人生产 |
| Server | PostgreSQL、独立API/worker、多人真实登录；一个部署数据库承载获准租户 | MVCC、行锁/唯一键/CAS，连接池、事务超时、迁移锁；生产推荐档案 |

数据库抽象在application ports而非通用SQL字符串替换。Kysely辅助类型化查询；PG `pg`、SQLite `better-sqlite3`为**候选驱动**，须ARCH-M02验证Node/平台/打包及两方言行为再锁版本。现有node:sqlite作为旧v1读取桥保留，不为了查询构建器先改旧数据库。所有port提供async签名；不能只给同步SQLite套Promise就声称非阻塞。Local以进程内mutex从BEGIN到COMMIT/ROLLBACK独占写连接，禁止跨请求重入/交错事务；另用只读WAL连接完成读快照，后台job在同进程经同一写调度器，不能启动独立写worker。长操作有上限/超时，真正阻塞风险须M02测量，不以单人假定只有一个标签页。

PostgreSQL默认READ COMMITTED；需要一致的预览/历史/完整性多查询使用REPEATABLE READ读事务。普通法人写入按tenant、book取修订行FOR SHARE，再对company取FOR UPDATE，之后锁配置/期间/对象；同company初期串行，不同company可并行。tenant级配置取tenant FOR UPDATE；book共享科目/政策改动取tenant FOR SHARE及book FOR UPDATE；company配置/期间变更遵循普通法人锁模式并更新相应版本。禁止先共享后升级上级锁；命令开始即确定所需模式。跨book/company先按级别及(tenant,book,company,object identity)全序取得所有锁，避免交叉死锁。变更共享配置须与在途法人写互斥，旧预览随后因版本失效。不能把SQLite全库写锁当PG已解决并发。

唯一键约束幂等身份、外部发票号、业务对象身份及核销事件，金额/余量以版本条件更新并检查影响行数。PG serialization/deadlock错误仅对明确可重试、同幂等命令进行有界重试（建议最多3次/指数退避）；每次重读权限、配置和对象，不重新执行外部动作。POST结果不明时客户端以原幂等键查询/重试，不生成新业务键。

### 金额与数据约束

初期API兼容**安全整数最小单位**、币种scale0..4；PostgreSQL用BIGINT、SQLite用INTEGER，驱动不得把大整数无校验转number。输入小数为字符串；中间BigInt/有理数及现half-up、税尾差、数量/单价6位与汇率8位保持；同币精度登记唯一。超过安全整数明确拒绝；以后若需更大金额用版本化decimal-string API，不在本轮偷偷扩上限。NUMERIC可用于有界费率/数量的精确保存，但业务计算不交数据库浮点或驱动默认转换。

schema中的源、凭证行、政策快照、核销/纠错链、三日期及不可变证据保留。结构化财务键/版本/日期/金额是列及约束；扩展快照可JSON/JSONB，但验证不可省略，不能全模型装入无schema JSON。方言差异如JSON函数、布尔、排序、ID序列、时间、FK/检查及触发器都有共同契约与各方言SQL，不承诺单份DDL跨库。

### 多租户、账套与法人

部署初期支持一个数据库中的`tenant_id / book_id / company_id / fiscal_year_id`显式边界；生产可先单租户部署，仍使用相同作用域键，不先出售多租户SaaS承诺。账套是共享会计政策/科目及授权边界；法人是法律实体，不是部门维度；财政年是独立日历实体。

所有业务关联/唯一键/FK含必要tenant/book/company作用域，报表/审计/导出也强制作用域。授权端口产生可信Scope，repository不接受随意省略作用域；禁止仅靠前端选择框隔离。PG RLS建议作为Server附加防线：事务内`SET LOCAL`租户上下文、非owner且无BYPASSRLS应用角色、FORCE RLS及池连接回收测试；不替代应用授权，SQLite不能靠注释假装RLS等价。

公司间同数据库、同获准tenant内事务可跨book/company，须分别授权、明确跨账套映射，任何一边失败全回滚。跨部署/跨数据库业务先不支持原子联动；如需联邦必须另ADR saga/补偿，不以本设计宣称已支持。

## 6. 迁移、版本与恢复

两方言各维护有序、校验和不可变SQL迁移，Kysely Migrator协调执行和版本表，方言特有DDL/触发器由显式SQL管理；在M02验证实际锁/原子能力。禁止生产启动时自动`schema push`，禁止多API副本竞跑迁移。发布操作员先备份→预检查→独立迁移任务取锁→迁移→完整性/版本核验→再启动兼容应用；不支持的schema显式拒绝。

新目标schema从新的版本命名空间开始，不将旧`PRAGMA user_version=1`伪装成新schema已迁移。旧book.mjs教学SQLite**只在Local loopback独立兼容运行，不迁入PG/新ERP模型**；Server不打开该文件、禁用其读写API/入口，不将单一无scope文件共享给多用户。Server教学样本须另建有真实tenant/book/company授权的ERP sandbox；教学开关不能启用旧接口。新ERP v1导出到中间类型化manifest，附源版本/摘要/计数/映射及断点，导入**新的**目标库。源只读，不修改原触发器或删除旧数据。PG ID、布尔/JSON/排序的物理变化不改变逻辑身份/来源顺序；audit稳定接受序单独映射，不靠新ID自增偶然一致。

旧company记录绑定year，新模型分离实体/年；每个旧(companyCode,year,原账文件标识)显式映射tenant/book/company/year及legacy identity。默认一旧公司年映射一个隔离目标company，跨年合并只在操作员明确选择且配置/期间/来源去重核验后进行；不能因为同code把两本账自动合并。映射清单保留原凭证/来源号和原回执。密码、宿主认证、AI会话和未完成preview不导出；已接受回执的输入/token原样作为受保护会计证据保留，API不泄漏其他授权范围。

禁止自动双写两库。试迁移在隔离副本，停写维护窗做最终一致快照/导入/核对；目标通过后显式切换连接配置。回退只在目标尚未接受新业务时重新启旧源；目标已写入后必须停写、保存新交易并另经批准反向迁移/修复，不能把旧备份覆盖回去丢增量。每次练习都验证来源/回执、对象版本、配置、月末/当前、金额/维度/税、队列/审计及完整性，不只比表行数。

SQLite：保留一致快照/独立恢复验证，应用升级后依然拒绝已有目标覆盖。PG：基础备份+WAL归档/PITR作为Server推荐，逻辑`pg_dump`用于可移植导出而非等价PITR；备份含加密/访问控制、异地副本和密钥恢复管理。**建议服务目标**RPO≤15分钟、RTO≤4小时，须用户预算确认并在选定部署演练达标后才承诺；本机档案仍以最后一次验证备份为恢复点，不继承Server SLA。

## 7. 身份、权限及审计

Server推荐企业OIDC（如现有身份提供方）+后端BFF/session；浏览器仅HttpOnly/Secure/SameSite cookie，不把长期token存localStorage。受控同源反代、TLS、CSRF令牌/Origin校验、CSP、JSON输入限制、限流、会话到期/撤销；不把现有loopback Host guard当身份认证。首次管理员通过一次性离线引导、操作员确认绑定OIDC租户，不设默认密码/匿名管理入口。

角色建议：配置管理员、制单、复核/过账、付款、关账、只读审计；RBAC动作权限叠加tenant/book/company与金额/业务范围。制单与批准默认不同真实subject；同subject兼任角色也不能批准自己的单据。例外职责冲突须明示政策、受控授权及审计，不能由教学开关放开。教学样本在单独sandbox账套；关闭教学只隐藏说明，不改变权限。

Local仅loopback、明确单操作员模拟，不宣称职责分离；若用户要多人登录，即切Server档案并通过真实身份验收，而不是把Local监听改0.0.0.0。后台worker用独立service principal，最小权限、不得伪造人类复核者。

事务内业务审计包括实际actor/subject、授权scope、操作、对象/来源、前后版本/摘要、批准人、原因、UTC时间、requestId及本地/真实身份保证级别。禁止记录secret/token/完整财务请求到普通日志；审计证据按权限检索，必要字段加密/脱敏。追加与DB角色权限阻止普通应用改历史；管理员仍可能控制DB，不声称绝对防篡改。安全审计、日志留存/个人信息删除与财务法定保留期限需部署法域决定，不能由本提案编造年限。

## 8. 运行规格、AI与质量门禁

| 项 | 建议目标与验收口径（均未测、待确认） |
| --- | --- |
| 容量参考 | Server基准4vCPU/16GiB、SSD、API及PG明确资源限制；20并发活跃会话、10法人、累计100万GL行。负载配比/数据分布固定，不以1000个空账替代真实热点 |
| 延迟预算 | 热分页/单据读取p95≤1秒、常规≤100行业务预览和同步确认各p95≤2秒，测完整HTTP含鉴权/事务，排除外部AI；运行30分钟并记录错误/锁等待/吞吐及p99。客户端静态加载另测，不混平均值 |
| 一致性 | 金额/数量零丢失、零重复已接受业务、跨范围零泄漏；强制完整性、两会话并发/幂等/关期/配置竞争必须通过，不能为延迟跳过检查 |
| 长任务 | 报表/导入按身份入持久job，可取消/查进度/失败原因；结果注明asOf和watermark，不以缓存旧结果冒充最新。任务时限/大小按基准再定 |
| 可用性/恢复 | 上述RPO/RTO仅Server建议；可用率、维护窗及保留期未定。恢复演练同时核业务/GL/审计，不能仅证明容器能启动 |
| 国际化/可访问性 | 中英完整label/插值契约、红绿及不只靠颜色的警告，键盘及核心表单可读标签；关键流程窄视口/权限/教学开关测试 |

性能阈值是本次建议验收预算，不改写旧OQ-02“未测不作承诺”；用户确认后在M00冻结硬件/数据/场景再作为实施门禁。当前400张五行贸易38秒级热路径实测只是旧候选规模证据，不证明以上多人PG规格已达标。

可观测：结构化日志requestId/错误码/时延，不含原始财务正文；OpenTelemetry trace跨HTTP/UoW/worker，指标含锁等待/冲突/重试、outbox滞留、备份年龄、队列积压。健康分liveness/readiness，readiness核schema兼容/DB连接，不能在每次探针全库重放；显式完整性为受控运维任务。

Outbox与业务同事务持久化，仅用于已提交事实的通知、投影刷新、导出等；至少一次投递，消费者inbox唯一键幂等。不能用消息补偿冒充GL与子账跨库原子。默认DB持久job/outbox不引Redis或消息平台；实际吞吐需要后再ADR。任务以短事务claim/lease，崩溃重领及重复执行测试，派生报表不能回写权威余额。

AI独立adapter/service port，默认本模块显式授权的最小事实快照、来源/时点及隐私提示。候选返回后由确定性领域校验，用户保存草稿及另行批准；AI不能持有业务UoW、DB角色、控制科目写权限或管理员工具。认证scope改变/请求超时撤销候选；provider故障显式失败，不产生伪成功草稿。模型/费用/数据驻留及外发许可按部署配置，新贸易数据不因架构迁移自动发送外部AI。当前SDK受限模式继续作为兼容适配器，独立进程隔离可后增，不强制先微服务。

测试：保留node:test兼容套件；新领域仍可node:test，API contract/integration同时跑SQLite和真实PostgreSQL；React组件用Testing Library，浏览器Playwright；构建/依赖方向/类型/OpenAPI漂移进CI。PG不是用SQLite mock代替，测试数据库唯一专属并清理；测试/截图只用虚构账，不用原4173或未知草稿。

## 9. 从现有代码分阶段迁移（建议DAG，不执行）

本轮只评审设计，**以下都不是ready实施任务**。用户确认架构后，ARCH-M00先冻结可验收最小切片，每个阶段自己的详细FR/TC/G3/G5/G6后才编码；宏观G3不批准尚无设计的重构。迁移按strangler/compatibility adapter逐条替换，不做一次性大重写。

| 阶段 | 真实前置 | 小切片交付/验证 | 文件与并行边界 |
| --- | --- | --- | --- |
| ARCH-M00 冻结和试迁移基线 | 本架构G3及用户确认 | 暂停态清单/32运行文件哈希、main172与当前候选全部测试ID/结果；选Local/Server首批规模、身份源、维护窗及预算，定义回退点 | 文档/夹具，不能自动提交贸易或碰原账；技术选择未验证项记spike出口 |
| ARCH-M01 工程/契约骨架 | M00 | TS/workspaces、独立web/api构建、OpenAPI错误/作用域/版本桥与依赖方向检查；旧npm start/API仍运行 | contracts/构建单一作者；先固定协议供M02/03/04 |
| ARCH-M02 数据访问与双库契约 | M01 | UoW/仓储ports、现SQLite只读桥、PG+SQLite目标适配器；驱动/迁移锁/触发器/整数/重试真实验证，非原地迁移 | domain ports/shared schema单作者；与M03/M04分文件 |
| ARCH-M03 前端壳与一个只读页面 | M01 | 登录/法人/期间壳，三偏好和label；先迁一张试算下钻只读页，旧界面可回退，mock只验证契约不冒充联通 | apps/web、ui专属作者；契约变更统一归并；不并发写旧app.js |
| ARCH-M04 身份与授权切片 | M01 | OIDC/BFF、scope/RBAC/自审拒绝及事务审计port；角色矩阵与撤销测试，不能用mock身份称生产 | API安全层独占；测试stub独立，真实集成等M02/M05 |
| ARCH-M05 GL预览/批准垂直切片 | M02、M03、M04 | 单种手工同步过账：真实登录→零写预览→持久提交→第二人待办批准→双库各自精确GL/回执/审计；失效/拒绝/撤回及旧172兼容通过 | 合约/授权/事务汇合串行；不先切全部路由 |
| ARCH-M06 暂停贸易映射切片 | M05；另需用户明确恢复M-TRADE | 映射纯计算及reducer、归档/控制段/历史缓存；AP一条非库存链双库验证，保存trade各G5但补新适配器组合验收 | 原enterprise.mjs只做桥，不同时重写全核心；不将暂停TASK24自动标完成 |
| ARCH-M07 运维及异步切片 | M05 | 同事务outbox/inbox、单一报告job、旧手工待转GL全状态兼容桥、版本迁移/只读导入CLI、权限化备份及独立恢复演练；发布清单 | infrastructure运维文件可与M06分工；公共schema仍单写者 |
| ARCH-M08 隔离试迁移/容量验收 | M05、M07；仅当冻结的已发布迁移基线含贸易时另需M06 | 选定已发布基线全部能力/测试，不只单条GL；两库、真实性能、故障恢复、用户UAT，逐业务/源/GL/历史/待转队列核对 | 默认M-CORE可独立验收，不强制恢复贸易；独立临时目标，无双写，G6通过才提出切换 |
| ARCH-M09 受控切换 | M08及单独停写/真实数据迁移授权 | 最终备份、维护窗、逐项核对、显式切换和回退演练；目标有新写入不允许盲回旧库 | 操作员执行；不因“继续开发”自动迁移真实账 |

M00冻结迁移源commit及模块清单；默认仅已发布M-CORE，暂停候选不偷偷纳入。M06是条件分支：仅用户明确恢复、完成原TASK24及发布门禁、且将已发布贸易选入迁移基线时才成为M08额外前置。否则M08依M05/M07推进，暂停文件及候选测试仍在旧兼容工程保留核验，不要求将它们全部迁入目标才允许M-CORE切换。变更冻结基线须更新依赖/验收并重新评审。

M02/M03/M04为协议固定后的首个并行批次；获准的M06可与M07在共享表版本明确后分文件并行。M05/M08/M09为汇合串行门禁。调度依赖不等于模块依赖全部串行；所有真实前置见[迁移DAG](diagrams/sme-migration.mmd)。具体实施任务只在用户确认及该阶段详细G3后拆分，避免高层蓝图假装十个可直接编码任务。

### 现有成果如何落位

| 当前资产 | 目标位置/保留策略 |
| --- | --- |
| book.mjs及旧教学库 | 仅Local兼容入口；Server禁用且不打开文件，不迁入PG。保留原8科目、月度结转、原始草稿，绝不重新解释为新ERP |
| enterprise.mjs | 逐步抽离配置/期间、GL应用服务、仓储/UoW；旧门面维持兼容，不整体翻译一次性替换 |
| enterprise-trade-math.mjs | domain纯计算包，保留精度/舍入全部oracle，不引HTTP/DB |
| enterprise-trade.mjs | AP/AR领域服务与事件reducer，保持原最终控制维度/核销分段/版本及税快照语义 |
| 可信前缀缓存 | infrastructure projection adapter，显式完整性仍从空状态重放；多API失效依据DB水位，不共享进程内对象 |
| server.mjs / enterprise*.js | 旧兼容入口；新API controller/application ports与React逐页面替换，禁止先删旧界面再补功能 |
| 中英label、money、主题/教学 | ui/契约测试，当前keys先保留，新增设计系统语义tokens；偏好失败仍显式提示 |
| 暂停贸易未提交文件 | 冻结清单和hash保留，未经用户恢复不提交/丢弃/搬走；以后基于其通过G5的精确版本做适配，TASK24缺失组合验收仍需补齐 |

## 10. 已委托决策（协调者代为决定，可调整）

| 决策 | 已选择方案 | 执行边界 |
| --- | --- | --- |
| DC-01 架构/技术路线 | React+TS、Nest/Fastify模块化单体、Kysely、Local SQLite + Server PG | 已委托执行；M02验证驱动/方言再锁版本 |
| DC-02 首次运行档案与身份 | 首交付Local单人SQLite；同时提供Docker Compose局域网Server试点，PostgreSQL+本地开发OIDC（例如Keycloak，仅虚构测试账号）；用户为运维/OIDC负责人 | 生产OIDC/TLS仍须真实配置；没有容器运行时不能宣称Server验收已做，不开放外网 |
| DC-03 容量与恢复预算 | 采纳§8试点基准及RPO15分钟/RTO4小时为目标非SLA | 实测记录达标/未达标，不弱化指标或伪称生产承诺 |
| DC-04 迁移顺序 | GL优先，M06恢复并移植贸易、完成TASK24；M08/M09迁移原4173账并切换新预览 | 已明确授权；先完整备份、哈希/余额/ID3核对，原库只读保留可回滚不删除；授权不豁免阶段门禁 |

会计政策/部署法域/审计保留/可用率等与代码结构不同，仍需在受影响里程碑冻结，不能拿选择前端框架代替政策批准。独立G3记录见reviews；用户确认后的范围如改变回到相应设计门禁。
