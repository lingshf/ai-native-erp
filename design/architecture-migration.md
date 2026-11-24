# ARCH-MIGRATION-01：分阶段架构实施

> **已取代（superseded，D560）**：本文中的双数据库（SQLite / PostgreSQL）、Server 档案、OIDC 身份与多用户批准设计已被 [ADR-LOCAL-001](adr/ADR-LOCAL-001.md) 取代：只做 SQLite、本机单用户、loopback 无登录。现行架构以 [M0 架构](m0-architecture.md)为准，方向以[路线图](roadmap.md)为准。本文保留为历史记录；其中的 FG / OQ 需求与会计政策按路线图开头的说明继续有效。

## 当前授权、事实与模型计划

用户已委托执行推荐方案、恢复贸易及在完整备份/核对后切换原本机预览。DC01..04为“协调者代为决定，可调整”，不是所有阶段已过门禁。先交付Local单人SQLite，并提供PostgreSQL/本地OIDC虚构账号的Server Compose试点；运维/OIDC责任人为用户。性能/恢复预算是目标非SLA，未测或不达标如实记录。GL优先，现有会计语义不因架构迁移改变。

作者实际gpt-6.1-sol；数据完整性与迁移高风险，独立G3/G5/G6均请求claude-opus-5.5，不能独立核实时沿用户MODEL01例外，只涉及身份、不豁免缺陷。本文件按阶段追加详细设计，宏观架构G3不能代替阶段G3。

执行前核main仍为3fbd75f717f7e98ca21ba059888ac2316643ff3c，未覆盖远端。当前候选完整292/292、14语法通过（补齐上轮只跑新增备份套件后的全套缺口）。原4173此时无监听且HTTP拒绝连接，不能声称仍运行；工作区已有两SQLite源文件。Docker/Podman/psql未发现，不擅自安装系统服务；可先推进Local，真实Server验收待提供运行时，不能用mock冒充。

## M00详细需求 / 设计 / 用例（G2，待独立G3）

### FR-AM00 / AR06、08

在进入工程改造前，保存未提交候选文件摘要和测试清单；同时以只读源连接为旧教学库及ERP库建立新的独立快照、核验并生成私有manifest。只核原账，不新增凭证；原ID3须仍draft。源文件/备份/manifest及其中路径、回执、数据均不进入公开Git；公开工具和虚构测试可发布。原先冻结32文件在新增实现前再核，不把恢复授权理解为可丢弃原候选。

### D-AM00

新增`script`工具位于`scripts/ledger-snapshot.mjs`：输入显式teaching/enterprise源及不存在的目标目录，父目录必须存在；不读.env、不扫描用户磁盘。源均为regular file且不能是符号链接，拒绝路径别名/已有目标；目标目录独占创建。每源用只读node:sqlite `VACUUM INTO`写入该新目录，检查SQLite integrity/foreign_key及当前ERP完整性。快照失败显式抛错、非零，不输出成功manifest，不删除原源或覆盖任何目标；失败目录保留供受控诊断，不能作为已验证备份使用。

逻辑摘要从快照自身的只读事务读取：schema/user_version、全部业务表（含sqlite_sequence）的列名/有类型值及逐表行数/排序内容SHA256。整数使用BigInt精确读，二进制以base64及类型标记，不能静默转浮点或依赖SQLite未指定行序；schema包括表/索引/触发器。另记录物理SHA256/字节、旧教学journal状态及posted借贷整数合计；两类摘要用于不同目的，不宣称VACUUM前后文件哈希应相同。生成的manifest只写在私有备份目录，CLI终端只输出完成状态和摘要，不输出路径/账务/token。M00基线工具允许读取整表排序，百万行迁移/容量出口须评估内存或改流式外排序，不能将此算法冒充生产报表热路径。

成功协议：所有快照完整性/摘要核验后，最后以wx写同目录manifest.pending、fsync并关闭，再以文件系统独占hard-link将完整文件发布为manifest.json（存在即失败，不用可能覆盖目标的rename），移除pending名字。中断只留下未完成目录，未出现manifest.json不算成功；任何消费方（包括后续迁移CLI）必须重新检查manifest版本/文件白名单/字节/物理SHA256及逻辑完整性，不能仅看文件存在。目录为本机私有备份目录，不承诺抵御拥有该目录写权限的攻击者或未演练的掉电持久性；失败显式，无成功输出。

两文件快照逐个一致，**不保证同时刻的跨库事务快照**；M00原两账独立，只是保护基线。M09真实最终切换须停写后再取一对，源/快照逻辑哈希一致、余额/原凭证ID和草稿核对，并且保留只读旧源。现阶段不启动或切换4173，不把备份等于迁移完成。

旧teaching canonical算法明确固定：UTF-8的JSON.stringify({periods,journals})，periods为SELECT * FROM periods ORDER BY month的普通对象；journals为SELECT * FROM journals ORDER BY date DESC,id DESC的普通对象，保留列顺序及全部header字段，另按行ID排序附lines，每行只依次含account/debit/credit（number，须安全整数）；有非空维度时再附dimensions对象，键按dimension排序，来自line_dimensions(dimension,value)，空维度不附字段；不包含line id。SHA256大写hex。源只读事务及新快照均重新计算，与先前私有基线相等且ID3仍draft才确认原账身份；算法用虚构固定SHA oracle防漂移。通用工具不内置真实hash或ID3业务限制，实际迁移由私有验收显式比较。若不一致保留所有源并阻塞M09，不凭文件名认账；ERP旧源用完整性和事件/配置/队列摘要冻结。

### TC-AM00（先失败后实现）

| 用例 | 输入 / 执行 | 预期 |
| --- | --- | --- |
| TC-AM00-01 / FR-AM00 | 两个虚构SQLite账：教学含已过账与ID3草稿及固定canonical SHA oracle，ERP含真实来源/回执；取快照后重开 | 源字节不变；两目标可读、逻辑摘要与源一致，借贷/草稿、ERP完整性与回执保留；manifest完整且无临时preview密钥 |
| TC-AM00-02 / FR-AM00 | 已有目标目录/文件、同源别名、缺父目录、符号链接、坏库/错误类型；在VACUUM后manifest发布前注入失败，或篡改已验快照再消费 | 明确失败，不覆盖现有内容/源；无成功manifest，不将失败遗留目录标为有效；消费者重新核字节/摘要，篡改拒绝 |
| TC-AM00-03 / FR-AM00 | WAL源有未checkpoint提交、超过安全整数及BLOB的摘要夹具；不同插入顺序 | 快照含已提交WAL；只读验证不改源，精确有类型编码无溢出，排序独立于插入顺序；篡改行/触发器使摘要改变 |
| TC-AM00-04 / FR-AM00 | 对实际原账仅以只读连接/新私有快照核canonical SHA及ID3，前后源物理摘要 | 与既有原预览证据一致才确认身份；ID3仍draft；不生成新账、不启动服务。该操作证据仅存session，不公开 |

M00完成标准：以上实际通过、全292及新增回归、独立G5与组合G6、私有基线保护证据齐备；后续工程M01仍另需详细G3。公开发布不能把未完成TASK24候选混作已发布贸易；若M00只含保护工具/文档，必须精确选文件并在干净已发布基线验证。

## M01工程/契约骨架（独立G2草案，不实施）

### FR-AM01 / AR01、02、07

在原npm start/test/check可用的前提下，增加npm workspaces以及独立web/api/domain/application/contracts/infrastructure/ui工程，保留一个锁文件。新`build`/`typecheck`可独立构建前端和API；默认不改原4173进程或数据入口。只给可观察的只读壳/health，不建立假GL/业务按钮，不声称骨架已完成M03前端数据查询或M04身份。Server档案在M04真实身份实现前明确拒绝启动，不以一个无认证health壳提供财务访问。

### D-AM01

apps/web采用React/Vite/TypeScript，独立静态产物；apps/api采用NestJS/Fastify及显式bootstrap，组合根接应用服务，不让controller导入SQL。contracts以Zod strict对象约束health及错误DTO，提供OpenAPI 3.1静态契约与自动一致性检查；**scope DTO推迟M03/M04**，随实际消费端定义，不在M01编造未使用字段。现阶段金额接口不新增，避免重复维护未定义业务字段。domain纯精确Money类型/操作只在实际迁移用例需要时提取，不为目录创建无行为模型。application提供真实只读运行档案查询use-case，其port由infrastructure的显式Local runtime配置实现。Kysely候选已锁技术路线，但依赖/驱动安装放到M02有实际仓储消费者时，M01不加无用ORM。TS strict、NodeNext ESM、明确package exports与拓扑build，避免运行时依赖TS原文件或路径别名未打包。

首API只返回服务名、契约版本、profile和未配置数据状态，不接受账套路径/actor或写操作。启动只读取`ERP_PROFILE/ERP_HOST/ERP_PORT`显式变量或测试工厂参数，不载入旧.env，不借HOST/PORT/DATA_DIR推断。默认local/127.0.0.1/4180；profile仅local（server须M04认证后再启用），host仅字面127.0.0.1或::1，不接收localhost/空值/0.0.0.0/::或其他主机；port须0..65535整数十进制，其中0仅测试工厂显式允许，CLI须1..65535，4173保留且拒绝。EADDRINUSE显式致命失败，不换端口、不夺用旧进程，不输出实际机器目录。

Local发布时API仅以静态adapter托管构建后的web/dist（产物仍独立）；开发Vite仅代理`/api/v1`到明确loopback API。SPA只用相对URL读取`/api/v1/health`，API不配置CORS、不返回Access-Control-Allow-*；同源状态加载及跨源无允许头均验收，不让用户自行找第二端口。未构建web时静态请求显式503，不回退旧账UI或创建数据。

统一HTTP exception filter和Fastify错误处理器将应用/Nest/解析错误映射为严格`code/messageKey/params/fieldErrors/requestId/retryable`对象和真实非200状态，响应requestId由服务端生成不反射任意header。未知路由404、已知路径非法方法405、health未知/重复query400、坏JSON400/类型415、未知异常500均遵守契约，普通日志只错误类型/requestId，不输出栈/路径/原body。对应入口分别测试，500通过测试注入故障port，不给生产HTTP开放故障按钮。OpenAPI文档与Zod由单源schema生成或对全部DTO深比较，而非只测一份样例。

新SPA用packages/ui独立zh/en资源和纯偏好/label服务，红默认/绿/教学关闭偏好；不相对导入public文件。旧资源暂不搬走，新增shell key必须对齐两语言，复用旧key时测试值与旧资源一致（不是要求所有旧458key都复制进新壳）。本阶段只是启动状态壳，后续M03迁移真实业务页；不把旧原生DOM引擎打包进React。

新增依赖仅在manifest变更后安装，公共npm源/锁定版本，禁止把机器内部registry写进lock。输出dist/构建缓存列.gitignore。CI检查导入边界（含type-only及相对路径）：domain禁框架/DB/SDK/DOM，application禁具体infra，web仅contracts/ui，不依赖写服务；组合根是唯一装配点。根`npm test`显式选`tests/*.test.mjs`旧引擎/保护工具用例，新workspace测试独立脚本；build排除测试，dist不包含test文件，不依赖.gitignore阻止node发现。与M00冻结测试ID/数量比对（执行前旧候选292，加M00工具后数量另冻结；公开main172同理），不悄悄改旧断言或少跑测试。

### TC-AM01计划

| 用例 | 输入 / 执行 | 预期 |
| --- | --- | --- |
| TC-AM01-01 / FR-AM01 | 干净npm ci、拓扑typecheck/build；测试工厂显式port0启动API并从同源静态SPA读health；根测试范围/ID清单对比M00 | web/API产物独立，原命令兼容且旧冻结ID全保留；health严格匹配契约，CORS允许头全部缺失、无路径；测试不进入dist或根测试自动扫描 |
| TC-AM01-02 / FR-AM01 | 允许127.0.0.1/::1及工厂port0；CLI port0/4173/负数/小数/越界/空白、危险host/空值/localhost、unknown/server profile、端口占用、旧PORT/DATA_DIR变量 | 显式配置按契约接受或拒绝；CLI不自动读旧.env，不回退端口/创建原账；EADDRINUSE非零，有安全诊断 |
| TC-AM01-03 / FR-AM01 | 临时违反依赖方向，含相对/类型导入；health schema与OpenAPI故意漂移 | CI非零且定位违规，不以空目录冒充边界已验证；正常依赖链通过 |
| TC-AM01-04 / FR-AM01 | shell切中英/红绿/教学，偏好损坏/不可用 | 所有壳label含aria由资源驱动，输入/状态不丢；失败明确，本阶段没有账务写或AI调用 |
| TC-AM01-05 / FR-AM01 | HTTP404/405、health未知/重复query、坏JSON/错误content-type、测试注入port异常500；额外DTO字段/未知错误码/漂移OpenAPI | 各真实非200响应均严格符合全部错误schema、requestId非空，不含栈/路径/原body；静态未构建503显式；OpenAPI/生成DTO任一漂移CI阻断 |

M01的精确实现任务只在其独立G3后加入tasks。M02/03/04可在固定契约后分文件并行，M01不能提前宣称这些阶段已完成。

## M02双数据库与只读桥（revision3 G3已释放；实现/验收进行中）

### 本阶段事实、范围与模型

M00/M01已实际发布，公开M01代码1574db67、状态69cdb211的全新clone各238项、build/typecheck通过。以下不是这些既有审查所批准的实现。作者实际gpt-6.1-sol；驱动、并发、DDL与精度为高风险，独立G3/G5/G6请求claude-opus-5.5，实际身份不能独立核实时保留MODEL01，仅涉及身份、不豁免具体缺陷。

本阶段交付真实SQLite/PostgreSQL仓储/UoW共同契约、显式版本迁移及旧教学库只读试算/总账桥；不开放新财务写API，不切原账，不把存储契约测试当作已实现审批或双库完整ERP。M03消费只读桥，M04实现真实身份，M05才接领域写入/持久审批与完整GL约束；贸易在M06恢复。当前无Docker/Podman/psql，真实PG运行必须解决后才能标M02完成，不用mock、pg-mem或WASM数据库替代网络PostgreSQL驱动/多会话验证。

G2研究时事实（不是当前安装状态，执行记录见reviews）：CDN曾列Kysely0.29.9/better-sqlite3 13.1.1，但当时配置registry精确查询404；实际可取得的元数据候选为Kysely0.29.8、pg8.23.1、better-sqlite3 13.0.3，当时均尚未安装/运行。13.0.3的npm dry-run包清单实际含win32-x64.node及其他平台预编译模块，依赖node-addon-api；不能用旧版本V8/prebuild-install记忆替代本版本证据。后续实际确认包无显式install/postinstall脚本，但有binding.gyp，会触发npm默认的隐式node-gyp rebuild；因此本阶段支持的恢复命令仍明确使用npm ci --ignore-scripts，实际加载随包原生模块，禁止静默编译/自动装编译器。这是安装机制说明修正，不改变G3恢复门禁；后续README与干净clone保持同命令。记录包SRI、实际加载.node SHA256、Node版本/ABI/N-API及平台，不声称未测平台可用。版本、依赖完整性及当前Node/Windows真实兼容性须安装后实测，再锁入唯一package-lock。公网registry当时TLS不可达，包SRI没有独立公网交叉核实，安装只用已配置可信源；公共lock保持标准npm URL及实际完整性值，不泄漏源地址，不关闭TLS。候选来源：[Kysely](https://github.com/kysely-org/kysely)、[node-postgres](https://node-postgres.com/features/types)、[better-sqlite3](https://github.com/WiseLibs/better-sqlite3)。

### FR-AM02 / AR03、05、06、08

| ID | 可观察验收 |
| --- | --- |
| FR-AM02-01 作用域/仓储边界 | application定义异步UoW、分级作用域锁、回执/审计ports；SQL、Kysely、驱动仅在infrastructure。目标仓储必须有其类型规定的完整scope；M02回执/业务审计只支持CompanyScope，tenant/book业务回执留M05。非法/空/越级scope拒绝，关联与唯一键包含完整所属scope。无任意SQL/万能CRUD端口，controller无SQL。本阶段消费者是实际共同仓储契约套件和只读CLI，不新增无关示范业务。 |
| FR-AM02-02 真实双库/精度 | 同一仓储契约在真实SQLite及真实PG通过。驱动精确读写有符号int64，领域/API最小单位保持安全整数、scale0..4，不静默Number转换。JSON、布尔、排序、空值及FK行为明确映射；两方言非法约束真实拒绝。 |
| FR-AM02-03 UoW/并发 | SQLite从BEGIN IMMEDIATE到COMMIT/ROLLBACK独占写连接，支持跨await但不能交错、嵌套重入或用过期session；独立只读连接由读mutex串行持有完整WAL快照，不共享并发BEGIN。PG按高层锁先行及固定序取得tenant/book/company锁，不同company可并行，共享book/tenant配置写与下级写互斥。任一步失败全回滚，未等待仓储操作或吞掉底层失败不能假提交。 |
| FR-AM02-04 版本迁移/不可变证据 | 只对显式新目标执行迁移，方言脚本有序/校验和/迁移锁；重复无变化，并发仅一方执行，未知/未来/缺失/改过脚本或陌生非空schema拒绝。失败不留半DDL或成功版本。回执及审计禁止UPDATE/DELETE，跨scope关联、重复业务键/不同指纹明确失败。 |
| FR-AM02-05 只读旧库桥 | 只接受M00 manifest重新验证过的独立旧教学快照，node:sqlite readOnly连接，不调用会执行DDL/种子的Book构造器，不直接打开活动原账。提供同月三阶段试算和完整总账的只读port/CLI；保留原ID、维度、名称、停用历史及旧月结/调整冲销语义，明确显示snapshot基准而非实时。读取无新库/迁移/种子/WAL checkpoint，原源及快照内容不变。 |
| FR-AM02-06 故障/重试/生命周期 | 只有已知“事务必已回滚”的PG40001/40P01和BEGIN前SQLite BUSY可按显式可重试策略最多3次；每次重开完整事务。网络断开/未知COMMIT结果不自动重放。关闭等待在途工作，拒绝新工作，再释放连接/锁；错误稳定分类，不回传SQL、连接串、路径、原请求或栈。 |
| FR-AM02-07 可运行验收/保护 | 提供明确Local测试及真实双库验收命令；PG缺失是双库套件失败，不跳过或以Local通过冒充双库通过。工作区旧302测试身份及M01全部56项保留；公开旧182与M01的56项保留。真实原账/ID3/未提交贸易不改。Server HTTP档案仍拒绝，M01偏好/label/健康状态行为不变。 |

### D-AM02：目标存储、事务及迁移

**范围类型与最小持久模型。** 定义判别类型TenantScope={level:tenant,tenantId}、BookScope={level:book,tenantId,bookId}、CompanyScope={level:company,tenantId,bookId,companyId}，禁止越级省略或附带多余ID。各ID沿现ERP代码约束1..60个ASCII字符、首位大写字母或数字、其后大写字母/数字/`_.:-`。tenant独占模式只操作tenant技术版本；book独占模式只操作book及其所属技术范围；company模式才暴露回执/业务审计仓储，所有记录三ID NOT NULL。tenant/book业务回执与业务审计另在M05按真实用例设计，不用虚构company填空。schema迁移及独立provision CLI/port是基础设施生命周期操作，不伪装成company业务回执。scope对象由可信应用边界产生，不能把它本身当授权证明。Fiscal year归领域/后续GL存储，不用当前锁水位冒充财年或审批依赖。

第一版目标迁移只建立本阶段实际消费的技术基础：tenant、book、company作用域/锁行与0..MAX_SAFE_INTEGER技术revision（增量溢出拒绝）；按CompanyScope/operation/key唯一且含principal/fingerprint/result/version的不可变回执；按CompanyScope的追加业务审计；schema_migrations版本与方言校验和。外键逐级包含所有scope字段，删除行为RESTRICT/NO ACTION，绝不级联删除证据。回执operation为1..60字符小写操作码，key为1..100字符可打印ASCII，principal为1..255字符无控制符的可信内部身份ID，fingerprint为64位小写hex。回执JSON版本1，边界限定UTF-8序列化后64KiB、深度20、每对象/数组最多2000项、安全整数及普通/null原型对象；拒BigInt、非整数/NaN/Infinity、循环对象和危险字段。以确定性canonical JSON文本保存，PG不以jsonb物理键顺序作为指纹或结果相等依据，读取也重新校验；不是无schema存整套ERP。实际GL/配置/审批表及outbox由拥有它们的M05/M07详细迁移加入，不能把基础receipt当成已有财务业务回执。测试来源使用独立`adapter.contract`操作，不对HTTP开放。

作用域技术revision只用于锁定/CAS和观测，**绝不纳入持久审批依赖或业务计划摘要**；相关业务配置/期间/对象版本仍由M05单独拥有。company UoW固定“取得层级锁→查回执→比较绑定→业务/CAS及审计→提交”，不在锁外先查幂等；同company FOR UPDATE也串行化同键竞争。回执仓储比较完整scope、operation、key、principal及规范请求fingerprint；相同绑定返回同一结果，不同绑定产生冲突，不返旧结果。M04/M05调用前必须先核当前授权，本阶段没有“知道回执键就有权”的HTTP接口。审计记录实际传入的可信操作上下文；不把本阶段测试principal称真实登录者。

**SQLite。** 目标采用better-sqlite3/Kysely，旧桥仍node:sqlite。只支持显式磁盘文件，不用独立`:memory:`连接伪装共享读写库；默认不从旧DATA_DIR/.env寻找数据库。首次初始化独占新建文件；已有非空文件须先以文件头application_id认定新ERP命名空间，旧教学/ERP或陌生文件在打开SQL连接/改PRAGMA前拒绝。已有目标仍需核全部schema/版本，不把标记当完整性证明。foreign_keys开启、busy_timeout=0，WAL只在新目标或确认属本应用的目标上、迁移事务外设置；BEGIN BUSY可按获准策略最多3次并异步退避25/50ms，不让同步busy_timeout阻塞事件循环1秒。写事务自定义Kysely driver的beginTransaction为BEGIN IMMEDIATE，不能假设默认BEGIN就是相同隔离。

SQLite新文件的application_id必须在默认DELETE模式下先独立持久化到主文件头，再启WAL和迁移事务，不能只把标记写进尚未checkpoint的WAL而误拒合法重开。标记本身不是成功schema版本；中断后空/未完成的本应用目标仅可由显式迁移恢复，普通启动仍阻断，失败不删该文件。已有文件必须在任何写PRAGMA前完成所属schema/版本预检查；不为修正标记而checkpoint或修改旧库。

写调度器只允许一个callback从BEGIN至终态占用写连接。另有一条只读连接和独立read mutex，**读UoW也从BEGIN/首次读取至COMMIT/ROLLBACK独占该读连接**；并发读先排队，不能在同一连接交错快照，写连接仍可在WAL上独立提交。读写callback内禁止再次开启同存储的read或write UoW，AsyncLocalStorage明确拒绝，不暗中路由到另一快照；写callback如需读己之写，必须用本write session的仓储。一个Local存储实例拥有这两连接，API/job共用实例，不能为每请求重复打开writer。

读/写调度器各最多64个等待者、排队最多1秒；超限/超时明确busy，不入队无限等待。读callback也有10秒取消预算；挂起reader超预算后session失效、已在途操作结束后ROLLBACK再释放read mutex，晚到callback不能再访问DB，不必等待其永不解决的外部Promise才能释放连接。等待及执行预算分开记录，不能把只读操作排除在取消/关闭逻辑之外。

session关闭后所有调用拒绝。callback协议要求await/return全部仓储操作；运行时保证提交前无在途操作且无sticky failure，若仍有未完成操作则先使session失效、等待/取消在途语句、回滚，不假提交。不能声称检测一个已经成功settled的Promise是否曾被await，catch底层失败也不能清除sticky failure。Local callback也有10秒取消预算，但同步原生语句不能被JS定时器即时中断，必须记录超出预算的实际耗时，不声称硬实时限制。超时不能靠Promise.race提前释放仍运行的事务；取消先使session失效、等待已提交给驱动的语句结束并回滚，再释放调度器。启动/关闭故障释放已经打开的资源，原文件不删除。

Local只支持单API进程/本机磁盘，跨进程SQLite竞争只用来证明BUSY/失败不破坏原子性，不宣称多进程Server支持。同步驱动的Promise签名**不等于非阻塞IO**；记录每次有界语句和事件循环停顿实测，不能用吞吐平均值掩盖最长停顿。长报表/job及大容量出口另在M07/M08处理，未测/超预算如实保留。目标库不允许网络共享盘，配置由操作员显式选择；不靠文件名判断原账身份。

**PG。** 支持PostgreSQL18，使用独立pg Pool（每池int8→BigInt解析，不改全局type parser），Kysely PostgresDialect。普通写READ COMMITTED；多查询一致读REPEATABLE READ、READ ONLY。所有锁请求在开始前确定所需模式：普通company写tenant FOR SHARE→book FOR SHARE→company FOR UPDATE；book独占写tenant FOR SHARE→book FOR UPDATE；tenant独占写tenant FOR UPDATE。跨scope先按层级，再用JS逐字符ASCII比较预排完整ID元组，**每个锁行单独一条参数化SELECT取锁**，不依赖IN/ORDER BY、localeCompare或数据库collation保证取锁顺序；不先共享再升级。独立provision port按tenant→book→company执行INSERT ON CONFLICT DO NOTHING再核/读取父子关系，避免23505使PG事务abort后又假装可继续；普通UoW不暗中创建scope。作用域创建也是同一事务，不复用来自其他scope的行。

provision明确使用READ COMMITTED，使ON CONFLICT后的重新SELECT可见并发已提交行，不在REPEATABLE READ复用旧快照。分级scope及技术版本仍不构成业务授权。

PG18事务内显式SET LOCAL lock_timeout=1秒、statement_timeout=5秒、transaction_timeout=10秒并验证，作为可调整运行护栏，不是性能SLA；不在不支持该参数的旧PG上静默删掉限制。rollback故障使连接销毁，不将污染连接放回池。最多3次可重试事务每次重读全部数据；仅40001/40P01可重试，其他完整性错误不重试。UoW不执行网络/AI/邮件或其他外部副作用；未知COMMIT结果交由应用原幂等键查询，不能重跑不明结果。M02不宣称已经实现Server RLS/真实身份；M04/M05另加非owner角色及真实授权/RLS池复用测试。

transaction_timeout从实际设置时开始计时并可FATAL终止整个session，不是普通语句超时；归类为不可自动重试的事务超时，销毁client并重建连接验证池健康，不把此client放回池。COMMIT阶段若结果不明仍按不明结果处理，不能仅凭timeout文字重放。

**整数、JSON与顺序。** better-sqlite3开启defaultSafeIntegers，PG int8保持BigInt；所有业务minor、ID、版本/计数过明确范围检查后才转number，超界显式拒绝，不把SQL类型声明当运行时转换。新增纯domain安全整数/BigInt累计行为只有在只读桥实际消费时提取，不创建空领域目录。底层有符号int64极值由测试专属临时表证明驱动无舍入；业务金额测试仍以MAX_SAFE_INTEGER边界为准。PostgreSQL NUMERIC不转浮点。布尔、JSON列由方言adapter规范到共同类型，排序使用业务显式键，不依赖数据库默认collation、rowid或自然顺序。

**迁移。** 采用基于Kysely连接的自定义runner，替代宏观方案原候选Kysely Migrator：后者没有这里要求的逐版校验和，且SQLite adapter不承诺事务DDL。本阶段详细决定以本段为准，同步修订architecture§6/ADR，不同时维护两套版本表。新目标用schema_migrations（顺序ID、方言、UTF-8/LF规范SQL的SHA256，除此不trim/改内容）；不是旧user_version=1原地升级。SQLite以application_id独立标记新命名空间，未知/旧库在任何PRAGMA写前阻断；首次并发init允许一方成功、另一方明确busy/初始化中，之后重复迁移应幂等，不接管未标记陌生文件。

显式CLI持有整个迁移运行的SQLite排他调度/BEGIN IMMEDIATE或PG事务advisory lock；PG先取advisory lock，**再查/创建schema_migrations**，只用专属数据库的固定public schema，不从search_path猜表。未知表/对象检查覆盖public，并拒绝意外用户schema，系统schema除外。只允许可事务DDL，禁止CREATE INDEX CONCURRENTLY/VACUUM等非事务步骤混入。重新检查当前版本及全部已应用校验和后才执行。DDL和成功版本同事务，须实测故障后表/trigger/版本全部回滚。应用启动遇落后/未来/改过/断档/混合方言版本或陌生已有表均阻断，绝不隐式迁移。前向迁移为正常路线；回退用独立备份/新目标，不编造破坏性down迁移。

迁移不沿用业务1秒锁限制：PG迁移独立连接使用lock_timeout=30秒、statement_timeout=60秒、transaction_timeout=120秒，等待同一advisory锁后重新检查版本；超过预算明确失败、可显式重试，不保证无限等候。SQLite迁移沿BEGIN前最多3次异步尝试，竞争失败明确busy，迁移callback预算120秒且仍遵循原生语句不可即时中断边界。校验和精确定义为CRLF转LF后的UTF-8 SQL，拒BOM及剩余孤立CR，除此不改；实际新增.sql时同时用.gitattributes固定eol=lf，不能仅依赖作者机器core.autocrlf。

两方言分别实现回执/审计不可变触发器和必要CHECK/FK/唯一约束；真实原始SQL更新/删除必须失败，PG另用BEFORE TRUNCATE语句trigger拒绝清空，父scope删除用RESTRICT/NO ACTION，不能仅测repository没提供方法。SQLite需额外typeof整数检查，PG用BIGINT类型及范围；JSON有效性/安全值在边界和DDL各自承担可验证部分。M02测试的owner可改DDL/禁trigger，不宣称抵御数据库所有者；M04再以真实非owner运行角色禁止DDL/TRUNCATE/禁触发器及越权。M05才增加GL借贷/封印等完整约束，不用本阶段技术表证明这些已存在。

### D-AM02-LEGACY：旧教学只读投影

只读bridge直接查已有accounts/periods/journals/lines及可用维度表，先核必需列、有效schema形状、FK/数据库完整性；未来/陌生结构明确拒绝，不回退“空账”。CLI先调用既有M00消费者重新核完整manifest、文件字节/摘要及逻辑完整性，再由可信装配配置选择其中teaching快照；不从HTTP接收文件路径，没有默认原账路径。基础设施只接受这个已核、独立且无活动writer的快照；拒不存在/空文件、目录、符号链接、WAL header或sidecar，不打开活动原源尝试“验证无写”。缺可选历史属性时仅按旧兼容规则处理，不写回填记录。关闭或异常须结束快照并释放连接。

关闭M00验证连接后不能盲信后续路径未变：bridge打开自己的readOnly连接后立即BEGIN并执行首次读取，持有rollback-mode SHARED锁，再核文件头18/19均为1、物理SHA256与manifest相同及前后文件身份相同，才服务该固定快照；全过程无WAL sidecar，身份/摘要不符失败。持锁至bridge关闭，正常SQLite writer不能在此间改变该快照；明确仅信任私有目录操作员，不承诺抵抗拥有同目录写权限、绕过SQLite锁的恶意文件替换者。游标是严格有界的base64url上下文（最多1024字符），绑定snapshot SHA256、account、month及最后(date,journalId,lineId)，字段/位置无效或上下文不同拒绝；它不是授权凭据，M03/M04仍独立核scope。分页只使用该快照，不把重新验证后不同文件的游标沿用。

试算输入有效month和stage=unadjusted/adjusted/postClosing；总账输入有效month/account及显式稳定游标和页大小1..100。不存在期间/科目明确not-found，停用历史不隐藏。按会计日、journal ID、line ID稳定读取，原始ID不改；维度保留原始值，名称不翻译。试算是截至所选月的累计余额：unadjusted只在当前月排除closing、adjusting及调整来源的冲销，adjusted只在当前月排除closing，postClosing全纳入；之前月份保留历史。完整总账不带试算阶段过滤、包含当月调整/冲销/结转，opening与closing覆盖完整范围，分页不能改变总计。逐行精确累计，溢出显式失败，不用返回0掩盖。

新桥先用独立Book夹具对比旧reports/ledger三个阶段、跨月调整冲销、关闭月份及维度；不导入/构造真实Book来读取实际原账。单纯readOnly打开WAL在某些条件下会创建SHM，因此M02固定读经验证的独立非WAL快照，并显式返回snapshot基准，**不得偷偷checkpoint、复制主文件忽略WAL或声称实时**。测试用WAL源通过既有M00一致快照工具保护原源，桥不接原WAL路径；消费后比较原主/WAL/SHM、快照及目录名字。若VACUUM输出仍为WAL header则明确失败并返回G3解决，不修改原源或静默改快照journal_mode；不能假定任何readOnly连接均天然零写。

G2已单独做原生可行性探针：当前Node26/Windows下，DELETE源header[1,1]及持有未checkpoint提交的WAL源header[2,2]，经readOnly连接VACUUM INTO均输出[1,1]独立快照、保存提交值，专属夹具已清理。这不是新桥TC通过；M02自动化仍须对真实M00工具做首个header断言。若其他受支持运行时不符，固定失败并回G3，不偷偷改变M00工具/原源或接受WAL快照。

只读CLI输出所选报告及明确sourceKind/snapshot基准，不输出连接凭据；财务输出只给显式本机操作员，不自动发送AI或保存到公开证据。M03后续才冻结HTTP DTO、scope授权边界、分页上下文及React消费；M02不改health的data=unconfigured，不把桥输出接到尚无鉴权的Server入口。

### D-AM02-RUNTIME：真实PG测试运行时

首选官方PostgreSQL Windows页链接的[EDB portable binaries](https://www.postgresql.org/download/windows/)，固定PG18主版本（具transaction_timeout），具体补丁版先以官方元数据核实后精确固定URL/SHA256；CI真实PG也须18。只在私有专属工具目录解压，不装服务、改PATH/系统账号/防火墙，不提交或复制二进制、集群、日志和凭据。正常TLS校验证书，若发布者提供独立校验和/签名则实核，若无则明确记录“信任发布者HTTPS、首次本地指纹”，不能声称已独立验证发布者签名。未知来源/版本漂移/后续指纹不符拒绝执行。npm的embedded-postgres有EDB→Zonky→npm多次再打包及额外postinstall，不作为默认自动下载源。native SQLite只有实际预编译模块可加载才接受，不自动安装Visual Studio或其他系统编译工具；不兼容须回G3评估node:sqlite自定义Kysely driver，不能未测就静默换驱动。

测试用唯一私有空数据目录、随机高位端口、随机SCRAM凭据、仅127.0.0.1监听、禁止trust认证/外网绑定；通过version()/pg_settings证明确实为真实PG。先探测端口再启动仍有竞争，必须实核启动归属与连接身份，不能误连既有用户5432。PG进程及initdb只由本次创建/记录的精确PID管理；正常/失败均先关池、优雅停自己的集群，再清理自己的确定目录，失败保留私有诊断且报告，不杀同名进程。基础二进制可在私有受控目录复用，测试数据不可跨案例复用；没有运行时双库命令非零退出。

测试基线可使用无TLS的本机loopback隔离PG，这是明确的本机测试威胁边界，不当作LAN TLS验收；Server TLS/OIDC/Compose仍属M04/M08。双库套件须与Local套件分明：默认verify继续完整旧/M01及新增Local测试；单独`verify:databases`强制SQLite+真实PG全部共同契约/并发/迁移测试，两者都通过才释放M02。PG二进制只经显式私有目录配置选择（CI可显式指向其真实service），npm install/test脚本不自动联网下载或装PG。G6及推送后干净clone必须实际执行二者，PG不可用不能只报默认verify通过。CI可用真实PG service，不把CI配置存在当已执行。

### TC-AM02：未来验收，不是执行证据

| ID / FR | 正常、边界及故障输入 | 可观察预期 |
| --- | --- | --- |
| TC-AM02-01 / 01/02 | 同一ports契约用两真实库；分级scope，ID长度0/1/60/61、lowercase/非ASCII/前导下划线；两tenant/两book/同名company、错scope FK，并发provision同scope | 正常同结果、外键实际拒绝跨scope；分级类型不省略必需ID，company业务仓储拒更高层scope；provision无23505 abort、各scope恰一行且父子关系正确 |
| TC-AM02-02 / 02 | 原始驱动int64正负极值；业务安全整数边界/超界，计数、ID、版本；JSON布尔/null、不同键序、BigInt/float/NaN/循环/危险原型、64KiB/深度20边界 | 驱动保持精确；业务超界显式拒绝；共同canonical JSON及显式排序一致，无浮点金额/全局pg类型副作用，非法JSON不落库 |
| TC-AM02-03 / 03 | 同一SQLite UoW两并发writer；R1快照跨await、W提交、R2排队、R1再读/结束后R2启动，再穿插W2；read/write嵌套、过期session、callback返回时仍未完成的仓储操作或catch后失败；hung reader/64等待者/排队超时 | writer及reader各自完整串行、WAL独立；R1始终旧版本，R2见首个提交且跨W2稳定；嵌套拒绝，写内读用本session；在途未完/sticky失败回滚；读超预算终止、排队超限/1秒等待明确busy，后续请求可继续，晚到reader不能再写/读 |
| TC-AM02-04 / 03 | 两真实PG会话：同company竞争，不同company同book并行，book独占与company写、tenant独占与book写；跨book/company分别以{A,B}/{B,A}请求同集合 | 实际锁冲突/并行符合层次，单行逐条取锁全序一致、不死锁；超时显式，无共享后升级或跨scope错锁 |
| TC-AM02-05 / 03/06 | receipts、audit、scope CAS任一步故障；commit/rollback故障、回调超时与取消、真实PG transaction_timeout FATAL、池复用 | 不留半记录；未完成操作不释放连接；FATAL及rollback坏连接销毁、非自动重试，新client健康；状态/超时不串池，不把未知commit结果报成功 |
| TC-AM02-06 / 04 | 两方言首次/再次/并发迁移、PG锁等待/超预算；半DDL失败、落后/未来/断档版本、校验和漂移、陌生旧库/已有表/用户schema；PG迁移表尚不存在；SQL的CRLF/LF、BOM/孤CR | 只一次、幂等；SQLite竞争可busy，不接管未标记文件；PG先锁后查表、预算内等待后幂等/超预算明确失败；失败DDL/版本回滚；旧库PRAGMA前拒绝；CRLF/LF同摘要，BOM/孤CR拒绝 |
| TC-AM02-07 / 04 | 原始SQL UPDATE/DELETE回执及audit、PG TRUNCATE、删除有证据的父scope，错scope关联；并发同operation/key同/异指纹及principal | 实际trigger/FK拒改史/清空/父级级联；锁后查回执使同绑定幂等、异绑定冲突且不返旧结果；不宣称抵御owner禁trigger |
| TC-AM02-08 / 06 | 真PG人为制造40P01/40001及连接断开，SQLite外句柄持BEGIN IMMEDIATE；记录尝试次数 | 只有获准且已知回滚的错误重试且最多3次；未知COMMIT/网络错误不重放；错误无SQL/密码/路径 |
| TC-AM02-09 / 05 | 虚构旧Book同月三TB与完整ledger，跨月调整/冲销/结转、停用科目、维度、草稿ID3；逐项对比旧引擎 | 金额/范围/名称/ID/维度一致；完整ledger与阶段TB不同有真实原因；没有DDL/种子/写回 |
| TC-AM02-10 / 05 | WAL有已提交未checkpoint内容，经M00生成并重验快照、首断言header[1,1]；M00验证后在bridge打开前改快照；持有bridge后普通SQLite writer尝试改快照；活动原WAL/无SHM源或损坏/空/缺路径/symlink/错schema | 原主/WAL/SHM、快照及目录项不改；已核快照含WAL提交，验证后改动拒绝，持SHARED后writer失败；活动路径/错误输入打开前拒绝；header不符阻塞回G3，不修改M00/原源 |
| TC-AM02-11 / 05 | 总账1/100行分页、超长/篡改/错snapshot/account/month游标、非法期间/科目、插入顺序不同、超安全累计 | 稳定排序，opening/closing及总计不受页影响；跨上下文游标/非法输入/溢出明确拒绝，历史停用不丢 |
| TC-AM02-12 / 07 | 默认Local回归及强制双库命令；故意无PG；npm ci --ignore-scripts后当前Node/Windows实际加载随包原生模块，记录包SRI/模块SHA/Node版本ABI及平台 | 完整旧测试身份无丢失；无PG双库非零而非skip；G6/干净clone同已核Node主版本、无编译fallback；模块实际加载证据不由元数据替代，其他Node/平台未经测试不冒称 |
| TC-AM02-13 / 06/07 | 运行期间close、重复close、资源部分初始化失败；两次自建PG集群、端口已占/认证错误/异常退出 | 在途明确完成或回滚后关闭，无新请求；幂等关闭，临时数据/自己PID清理，不接/杀其他集群 |
| TC-AM02-14 / 03/07 | 有界Local批次与单语句/事件循环监测；真实PG版本/loopback/SCRAM/迁移/多连接；原账及贸易冻结比对 | 如实记录时延及未测预算；PG不是模拟；M01 UI/health无改变，原账/ID3/贸易保持，Server档案不提前开放 |

执行状态：上述revision3 G3及M02各增量/组合G5/G6均已独立释放MODEL01；最终发布main3d7e1f0的精确新clone完整302+真实SQLite31/PG38/CLI1=70/build/typecheck通过，详见reviews/project。首次clone失败及未知TCP原因保留，不由后续通过抹除；后续改变契约仍需G3。下节为新增M03 G2，不复用M02许可。

## ARCH-M03 / D-AM03：显式快照的真实只读SPA（G2，待独立G3）

关联FR-AM03-01..08、AR-01/02/07及AT-01/02/07；作者及独立模型计划见project。基线为已发布3d7e1f0和M02真实reader。此阶段不改目标DDL/UoW，不开启Server/登录/审批/财务写入/AI，不迁移或切换原4173；未提交贸易原样保留。M03前端可按既定协议与其他阶段分文件工作，但真实只读验收必须消费M02已验收桥，不能用mock替代。没有真实法人/币种的旧教学快照不编造company/currency；Local操作员不是模拟OIDC用户，snapshot身份不是授权凭据。

### D-AM03-SOURCE：组合根、期间与所有权

在根scripts提取已有只读CLI的公共打开组合：`preflightLegacySnapshotPair` → M00 `verifyLedgerSnapshot` → `openLegacyTeachingSnapshot`，原CLI复用它并保持原错误分类/参数/输出/关闭后成功语义。此模块仅组合已有验证，不复制SQL/校验器。新显式快照预览CLI解析`--snapshot-dir`、可选单个`--dev-origin`和原ERP_PROFILE/HOST/PORT运行配置；不读`.env`/DATA_DIR选择账，不接受HTTP目录。**先**用现有Local配置校验拒绝Server、非literal loopback及4173，才触碰快照。相对目录只由操作员在CLI解析为绝对路径；响应/日志不回传路径。有效配置后才打开快照并注入Nest组合根，失败非零且不回退unconfigured成功；原无快照bootstrap继续仅提供health壳，财务查询503。

`LegacyTeachingReader`增加只读`periods(): readonly {month,status:'open'|'closed'}[]`，在既有SHARED事务中按month升序读原periods表并验证格式/状态；closed reader、坏持久数据明确失败，不增加表或写PRAGMA。原trialBalances/ledger字段及算法不变，默认/最大分页仍100，account仍四位非零开头数字。application新增只读查询服务：context取真实期间与来源info；trial/ledger先核请求snapshot SHA，再调用同一reader，不重新计算会计/过滤历史或把草稿计入。读取能力只涵盖该单一显式快照，不把它映射为已有企业company。

root CLI拥有reader，API只借用；停服先drain/close API再close reader，重复信号幂等，启动/监听失败也释放全部已建资源。任一关闭失败明确非零/安全错误事件，不能记录成功。快照持SHARED至关闭，源/快照物理hash和目录不变；不把跨两库分别快照说成原子同时快照。

root package由集成作者单写：允许添加本轮CLI的npm入口/语法check，活工作副本必须原样保留三条未发布trade check。公开候选及本地交付以HEAD package为底只加入本轮已审M03入口，排除trade段并分别验证，不能直接整文件提交工作副本。29个保护源文件不含root package，它们仍要求逐字节不变；新增依赖/lock单写，禁止UI/API并发改共享lock。

### D-AM03-HTTP：来源绑定和单源契约

新增三个精确GET路径：`/api/v1/legacy/context`、`/api/v1/legacy/trial`、`/api/v1/legacy/ledger`。health v1保持原严格DTO；其中`data=unconfigured`仍指未接入新目标业务账，不能拿它代表快照可用性，快照仅由context证明。普通API启动未配置reader时三个财务路径503，不返回空账200。

- context：无query，返回`contractVersion:'1'`、M02只读snapshot info和真实periods；不含目录、连接信息、假法人/币种或任何草稿正文。
- trial：严格query为snapshot（64小写hex）、month（YYYY-MM）；返回snapshot info、month及M02的三个完整trialBalances。阶段是客户端显示选择，不是服务端改会计规则。没有任意对象投影、维度过滤或客户端总额参数。
- ledger：严格query为snapshot/month/account以及可选limit/cursor；limit十进制规范整数1..100，默认100，cursor沿既有base64url最多1024字符。返回snapshot info、month及原完整月ledger（account/opening/closing/debit/credit/totalEntries/entries/nextCursor）。**不接受stage/维度过滤**，entry中的原ID/date/kind/source_kind/维度及借正贷负balance保留，分页只切行。

Zod strict请求/响应DTO及OpenAPI路径/参数/所有状态单源生成并测试，unknown/重复query或非规范limit400；month沿domain的1900-01..9998-12，不仅检查字符串形状。金额/ID/总数为安全整数，scale恒2，禁止浮点/NaN/超安全整数或静默数值强转。响应来源SHA与请求一致，来源换了409，不能自动改读另一来源；金额超界或坏持久数据503而非0。没有币种证据时只标“金额（2位精度）”，不加货币符号或从另一企业库拿币种。前端按BigInt分解已核安全整数做精确分组/两位格式，不用浮点除100再四舍五入或重新加总会计结果。

错误统一沿既有`code/messageKey/params/fieldErrors/requestId/retryable`；追加403 FORBIDDEN与409 CONFLICT并更新OpenAPI，保留原400/404/405/415/500/503行为。未知期间/科目404、来源冲突409、输入/游标400、不可用/溢出/损坏503；其他异常500。真实非200，不暴露原SQL/路径/原异常，日志仍仅服务器requestId和安全错误类型；不以requestId反射任意header。所有财务成功/失败响应`Cache-Control:no-store`及`X-Content-Type-Options:nosniff`。

只读错误映射固定如下，不能把坏源当输入错，也不能因异常被M02包装而改成空成功：

| 抛出的类型/码 | HTTP |
| --- | --- |
| StorageError INVALID_INPUT / INVALID_CURSOR，DomainError INVALID_INPUT | 400 |
| StorageError / DomainError NOT_FOUND | 404 |
| StorageError CONFLICT（请求快照与当前显式源不符） | 409 |
| StorageError INVALID_SNAPSHOT / SCHEMA_MISMATCH / OVERFLOW / BUSY / CLOSED / STORAGE_FAILURE，DomainError OVERFLOW | 503 |
| 其余不应出现在本只读服务的存储码及非存储异常 | 500 |

### D-AM03-LOCAL：浏览器请求边界与开发代理

财务路由的实际controller/guard独立校验，不能仅按原始URL前缀决定是否加保护：请求Host必须匹配当前API实际监听的literal loopback origin（测试端口0以listen后的真实端口为准）；尚未完成listen时拒绝403，不能以配置端口0/默认inject Host放行。财务集成测试用实际listen，旧health inject测试保持。不采信Forwarded/X-Forwarded-*。Origin存在时只能是该API origin或操作员显式配置的单个开发origin；`Origin:null`、其他来源和`Sec-Fetch-Site:cross-site`拒绝403。Origin缺省保留同机操作员/正常直接导航能力，不声称抵御同OS用户。无通配CORS、无任意Origin反射；查询只读也不得被宽松跨域代理暴露。编码/双斜线等路由别名不能绕过guard，非法方法405，未知路径404，快照身份不能充当认证token。

开发origin默认无；如显式`--dev-origin`，必须是规范http origin、literal 127.0.0.1或[::1]、有效端口且非4173，无用户名/密码/path/query/hash或通配，不开放LAN。Vite固定127.0.0.1:5173/strictPort，`/api/v1` proxy `changeOrigin:true`只改Host、不注入Origin；浏览器继续相对API URL，普通同源GET无Origin时按上述缺省规则允许，**无需**配置开发origin才能proxy成功。`--dev-origin`只决定真实带Origin header的请求：如`Origin:http://127.0.0.1:5173`存在，仅显式许可才接受。测试用实际浏览器证明缺省proxy联通，另用可控请求验证有header时的许可/拒绝，不伪造浏览器必发Origin的oracle。无跨域CORS响应；构建后的web+API同源默认不用此选项，Server/真实身份另属M04；dev origin不是登录、授权或可信proxy认证。

proxy重写Host后不能靠API再次识别原始浏览器Host，所以Vite必须保持默认`server.allowedHosts`或显式空列表，绝不设true/任意外部域名，仍只绑定loopback；TC07实际向5173发外域Host并确认由Vite拒绝。开发命令配套固定API4180与web5173，不宣称改API端口后原固定proxy仍自动适配；需要不同端口时先显式同步并验证proxy目标，不能扩大Host许可来掩盖错配。

### D-AM03-WEB：真实路由、查询与偏好

按已接受ADR消费React Router和TanStack Query：本阶段用HashRouter避免Local静态服务虚假history fallback，overview仍是现有health壳；新增reports/trial及reports/ledger/:account路由和真实分组导航，不添加未实现业务按钮。选用已核公开元数据的react-router-dom7.18.5、@tanstack/react-query5.106.1（适配现React19.3.1/Node26）；G3前不改manifest或安装，实施时精确锁定及验证SRI/新依赖，元数据不是安装/安全通过。React Hook Form待真实编辑表单消费者，不为只读页面加空依赖。

report路由才查询context，不把新查询插入原overview的health-only行为；QueryClient/Router及偏好位于稳定上层，切语言/主题/教学不重建它们。context成功后初次采用最后可用期间、adjusted阶段；URL已明确source/month时必须验证，不静默换来源或非法期间。只有一个全局期间选择，合法空期间列表有明确无期间空态，不制造当月；切月同步撤销旧试算/总账页面与旧游标。来源scope为snapshot SHA而非假companyId；显示旧快照/live:false，旧账套原始科目名、摘要和维度不翻译。

trial query key包含source/month；stage纯显示切换，不重新取数。ledger包含source/month/account/limit并用受控infinite query页参数；返回保留month/stage，阶段不传给ledger API。快照不可变，明确设置`staleTime:Infinity`、`retry:false`、`refetchOnReconnect:false`、`refetchOnWindowFocus:false`、`refetchOnMount:false`，无后台轮询，错误由按钮重试，不依赖库的默认重试/过期策略。更换上下文取消在途，前端严格解析DTO并检查响应source/month/account与请求一致；迟到结果不能回填新key，旧数据不作新上下文placeholder。load-more在途禁止重复，跨页以唯一`lineId`查重（journal `id`可重复）；重复cursor、不一致总计、累计行数超totalEntries、末页累计不等于totalEntries或空页却有nextCursor都明确invalid-response，不静默去重/追加或无限循环。分页失败可以保留同一上下文已成功页但标明失败，不能冒充已完整加载。来源409提供用户明确触发的“重新加载快照”，清除旧来源缓存/游标、重新读context，才可采用新来源最后期间；不能自动改读另一账。

所有新标题/表头/选项/提示/空态/错误/aria在packages/ui的两语言资源，按key引用；借贷不平衡/错误有图标和文字，不只靠红主题区分。教学关隐藏概念扩展，仍保留快照/完整月/金额方向等必要业务边界。下钻用可键盘操作的button/link，返回恢复选择；桌面与390px由真实浏览器验证，表格可以有明确横向滚动区域但页面无溢出遮挡。原三偏好和保存失败提示行为、原旧工作台/未保存贸易代码不变。

HashRouter与现有skip/overview链接共享fragment：skip须拦截默认hash导航并聚焦main，不把`#workspace-main`变成新业务路由；overview须改为真正Router Link并保持aria-current，不能遗留旧anchor。两者各有断言，保留可见焦点与原有可访问性。显式无效的URL期间/来源显示错误和未选择状态，不能由select浏览器默认第一项伪装成合法选择。

### D-AM03-VERIFY：验收、预算与交付

基线原302公开/422完整工作区测试身份及M02真实70保留，新增聚焦用例以失败先行；用现有legacyFixture生成独立虚构M00快照（含草稿ID3、关闭月、调整/冲销/维度/停用历史及多页），真实HTTP和React只消费该快照。模拟fetch只证明组件竞态/错误，不代替实际CLI/API/SPA联通。关闭前后对比fixture源/快照全目录及物理摘要；原真实两库仅FS hash保护，不SQL打开，不重启4173。

在同一已记录Local硬件/Node环境测完整HTTP热读样本的p95/p99/错误，按宏观热读p95不超过1秒预算记录是否达标；UI静态加载单列，不混平均数或把snapshot同步SQLite说成非阻塞。此为单人只读有界样本，不代替M08的30分钟/多人/认证/双库容量与故障验收，也不改其预算或声称SLA。独立G5/G6、精确金额及真实桌面/390px验收后，才白名单哈希保护交付、安全审查、远端未前进时快进main和精确新clone；不发布私有快照/路径/账务/原知识库，不提交贸易候选。

### TC-AM03：计划用例，尚未执行

| ID / FR | 正常、边界及故障输入 | 可观察预期 |
| --- | --- | --- |
| TC-AM03-01 / 01/06 | 新CLI正常/缺参数/错目录/WAL快照；Server/0.0.0.0/4173与坏目录同时提供；bind失败、重复信号 | 正常真实只读服务；先拒运行档案才触快照，FS前置/M00验证不绕过，无env账套兜底；失败非零、无路径/SQL，全部资源关闭 |
| TC-AM03-02 / 01/02 | 空/多期间、open/closed、坏持久month/status、closed reader、正常原三TB | 原期间升序/无假今天；坏数据/closed明确失败，新只读方法不改旧算法/目录/hash |
| TC-AM03-03 / 02/07 | 所有DTO/OpenAPI正反例、unknown/重复query、limit0/1/100/101/01、浮点/超界/NaN、extra响应字段 | 单源契约完整一致；无数值强转/悄悄截断，真实400/503或客户端invalid-response，不渲染0成功 |
| TC-AM03-04 / 02/03 | 同月三阶段、跨月调整/冲销/结转、停用1100/维度、草稿ID3 | HTTP每项等于M02；草稿不计入，完整ledger不带stage，阶段TB与完整月差异不冒充漏账 |
| TC-AM03-05 / 02/03/04 | ledger1/100行及多页，同日同journal多line；篡改/错source/account/month/位置游标 | 顺序及行身份稳定；每页月总计相同，末页无next；非法400，不跨来源合并 |
| TC-AM03-06 / 01/06/07 | 实际loopback端口、Host攻击域/错端口/IPv6、外Origin/null、cross-site、伪Forwarded、编码路径/方法；listen前inject | 财务保护不能由URL别名绕过，403/404/405符合DTO，无CORS反射；listen前拒绝，原health/static兼容 |
| TC-AM03-07 / 06 | 实际Vite5173同源GET/proxy且无Origin；可控请求显式带5173 Origin的有/无许可两种配置；发给Vite的外域Host；4173/外网/带path/用户信息配置 | 无Origin的真实proxy按Host/缺省规则成功，不声称必须dev许可；显式Origin仅匹配许可成功，否则403；Vite自己拒绝外域Host，不设allowedHosts:true；非法配置启动前拒绝，Server始终拒绝，不把dev来源当认证 |
| TC-AM03-08 / 04/07 | 初始无reader503、查询时故障/新来源409、未知月/科目404、500、恢复重试 | 每个真实非200遵循脱敏DTO/requestId/no-store/nosniff；无旧成功/空0兜底，刷新来源需明确操作 |
| TC-AM03-09 / 03/04 | 试算阶段下钻与返回，global month切换、来源参数错、旧请求晚到 | 同月完整账，month/stage恢复；新上下文立即撤销旧数据，迟到/取消不回填，不静默改source |
| TC-AM03-10 / 04 | 快速load-more、失败重试、重复cursor/lineId、相同journal id不同lineId跨页、变总计/错echo/空却有next/末页数量不符 | 只按lineId查重，合法同journal多line保留；不并发重复追加，不丢页/无限循环；坏响应明确失败，同上下文已加载页标明未完整 |
| TC-AM03-11 / 02/05 | 正/负/0及安全整数边界的scale2值、中英格式、旧双语科目/摘要/维度 | 两位显示与整数逐分一致，不用float舍入/猜币种，不改账套内容 |
| TC-AM03-12 / 04/05 | 三偏好切换/刷新、存储损坏/拒写再恢复；overview/report查询计数、重连/焦点/返回缓存、skip及overview链接 | 已声明默认/错误提示保留，语言/主题/教学不增查询或丢选择；无库默认额外重试/refetch，旧overview不偷偷取财务数据；skip聚焦main不改路由，overview真导航 |
| TC-AM03-13 / 01/03/05 | 独立真实CLI/API/构建SPA、桌面/390px、键盘下钻返回及两语言/主题/教学 | 实际来源/期间/金额/页数可核，关键截图；关闭后源/快照/原两库及29保护文件hash不变，无4173切换 |
| TC-AM03-14 / 08 | 原测试身份、全verify/真实70、预算样本、故意无PG、公开发布/新clone | 原断言不降级，新增聚焦失败→通过，build/types/无skip，p95/p99与未测边界如实；保护同步0覆盖冲突，安全0不冒称未知漏洞为零，精确新clone真实验证 |
