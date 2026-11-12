# ARCH-MIGRATION-01：分阶段架构实施

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
