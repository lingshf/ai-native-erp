# Implementation tasks

## 当前授权：ARCH-M00起逐阶段实施

用户已委托DC01..04与M00..09执行、恢复M06/TASK24和备份核对后切换原4173账。M00已通过G3/G5/G6、安全审查、本地保护同步并发布main `74819f9bfa7087ac230c4ccaf96b6b40f1e740bf`，干净clone安装/182项/语法通过。M01三个增量G5、组合及公共变体G6已独立释放MODEL01，工作区358项、原302测试身份完整保留；本地保护交付和安全完成，代码1574db67及状态69cdb211的全新clone各238项/build/typecheck通过且已清理。M00/M01/M02现已完成限定验收，M02修订f9f1bcb精确新clone302+真实70/build/typecheck通过；M03现已独立G3/G5/G6、安全/本地交付并发布a608ee1，精确新clone361+真实70/build/types通过；M04..09仍须各阶段详细门禁。完整需求/工具环境见[architecture-migration](architecture-migration.md)，下方“仅设计/暂停/0 ready”为前次交付历史，不再限制继续开发，但原成果和剩余验收不能删除。44FG仍0/13/31，不因授权改done。

| 实施任务 | 状态 / 前置 | 追踪 / 文件边界 / 验收 |
| --- | --- | --- |
| ARCH-T00 原账保护基线 | done（MODEL01）；已发布74819f9 | FR-AM00/D-AM00/TC-AM00-01..04；仅scripts/ledger-snapshot.mjs、虚构测试/文档。10/10聚焦、完整302/302及语法，独立G5/G6实际释放；私有源/快照/ID3/逻辑hash核验及原源不变，公开工具不含真实hash/路径。公开干净clone为原172+新10=182项，不含未验收贸易候选 |
| ARCH-T01 共享工程/契约 | done（MODEL01）；M00及M01 G3已释放 | FR-AM01/D-AM01/TC-AM01-01/03/05；根manifest/lock/TS配置/边界脚本/contracts单写。contract3/边界7，实际JS/TS变体/空缺目录/异cwd/别名探针关闭原Medium，spec/quality G5及组合G6独立释放；原302冻结测试无丢失 |
| ARCH-T02 API与应用边界 | done（MODEL01）；固定G3契约，与01/03分文件 | TC-AM01-01/02/05；独占apps/api、packages/application/infrastructure。application1/infra2/API11均通过，独立真实静态/编码路径/方法/端口探针通过，spec/quality G5释放。坏JSON/415/500仅测试工厂，无财务/数据访问；不替代组合G6 |
| ARCH-T03 前端壳/偏好 | done（MODEL01）；固定G3契约，与01/02分文件 | TC-AM01-01/04；UI2/web30、严格类型/build及真实桌面/390px验收通过。两个label冲突更名并真实交叉旧资源；恢复保存清过时警示、保留其他诊断，独立原两Medium已关闭，spec/quality G5释放 |
| ARCH-T04 骨架组合验证 | done（MODEL01）；01/02/03各G5已释放 | TC-AM01-01..05：工作区358（302+7+49）/公开及本地238（182+7+49）、完整build/typecheck及真实同源UI通过；组合/公共变体G6按MODEL01释放。50文件43新/7更新/0冲突，独立安全及OSV306零已知公告；代码1574db67已快进main且推送后全新clone安装/完整238项/零跳过、构建/类型通过，临时clone已删除。不把骨架称M02/03/04已完 |

### M02实施批次（revision3 G3已释放MODEL01）

**T10发布后状态：done（MODEL01）。** 代码430076f及四测试文件加固`f9f1bcbce539c13aae80aeddec5dc7d3280d250b`已快进main。精确f9f1bcb的全新GitHub clone实际安装/native预检、完整302/build/types及真实双库70通过、零跳过，临时clone/自有PG集群与密码文件清理。源422/公共302及双方真实70、独立G3/G5/G6和安全0、本地54文件保护交付/修订8更新46同0冲突及副本302均有证据。首次430的新clone失败仍保留、TCP重置原因未知，不以重跑抹除。下一阶段M03必须先详细G3；不是44FG或整个架构迁移done。

只对所核FR-AM02-01..07/D-AM02/TC-AM02-01..14拆解，作者gpt-6.1-sol统一集成；复杂DB/恢复/精度为高风险、独立强推理G5/G6请求claude-opus-5.5，实际身份不可自核保留MODEL01。实现代理若未报告实际模型ID不臆造；共享manifest/lock/入口由集成作者单写，原贸易代码只冻结核对。

| 任务 | 状态 / 真实前置 | 文件所有权与追踪 | 可观察出口 / 测试先行 |
| --- | --- | --- | --- |
| ARCH-T05 共享port/精确值与边界 | done（MODEL01）；M02 revision3 G3 | application新storage接口/作用域/技术revision/JSON纯校验；领域金额/旧桥port由T08实际消费时提取，不提前建空domain；FR01/02，TC01/02/11 | 缺模块及边界/类型RED→GREEN；12项app及全部workspace60项/build/types/boundary通过，revision2六hash独立spec/quality G5释放；不以接口通过冒充双库 |
| ARCH-T06 SQLite/迁移切片 | done（MODEL01）；T05 G5已释放 | 目标存储作者独占infrastructure storage目录及SQLite迁移/测试；FR01..04/06，TC01..08/12/14 | 修订20摘要独立核；双方各真实SQLite31/31及漂移/坏数据/挂起/回滚通过，spec/quality G5释放；仍非整体发布 |
| ARCH-T07 PostgreSQL对应切片 | done（MODEL01）；T05/T09 G5已释放 | 与T06同一目标存储作者维护共享事务核心，PG方言/锁/迁移及测试分文件；FR01..04/06，TC01..08/12..14 | 父真PG18目标37/37及生命周期CLI1、零skip，含实际FATAL销毁/继承timer/结构漂移；独立20摘要/源码/用例窄审spec/quality G5释放；未冒称reviewer自启PG |
| ARCH-T08 旧教学只读桥 | done（MODEL01）；T05 G5已释放 | 另作者独占domain旧账投影、infrastructure legacy桥及其测试；CLI与公共exports集成作者统一接入；FR02/05/07，TC09..12/14 | 修订15hash独立重核；13桥/domain+5真实CLI由双方各18/18；双文件WAL前置保护及坏存储分类关闭，scope/旧语义/精确分页/历史/原源保护通过；本项done不是整体发布 |
| ARCH-T09 官方PG运行时预检 | done（MODEL01）；M02 G3，与T05无依赖 | 仅私有工具/虚构临时集群及证据，不改产品源码/系统服务 | 官方18.7 ZIP/SHA/4PE签名及180007/loopback/SCRAM/错密码拒绝实证；正常停自有PID，密码/集群/ZIP清理，独立parent spec/quality及4SHA/零进程核验通过；非T07验收 |
| ARCH-T10 M02组合与发布 | done（MODEL01）；T06/07/08/09各G5及源/公共G6均已释放MODEL01 | 集成作者独占根manifest/lock/exports/CLI/文档/交付清单；全部TC-AM02，组合G6不由分切片G5代替 | TLS阻塞及四测试文件监听修订已独立关闭；源422/公共302、双方强制双库70/build/type/零跳过；54文件保护交付/修订8更新46同0冲突、副本302、安全0。f9f1bcb非强制main且精确新clone安装/native/完整302+真实70/build/types通过、临时clone/PG清理；首次失败及未知TCP原因保留 |

并行批次：A=T05与T09（产品公共契约 vs 私有工具，无共同写文件）；B=T05 G5后的T06/T07目标存储作者与T08旧账作者（各自模块目录，shared exports/manifest不多人写）；C=全部真实出口后的T10。T07可以先写代码但不在T09真实运行时可用前声称测试通过；T06/T07共享核心归同一作者，不把逻辑独立任务伪称同时写同文件。M03/M04尚无各自详细G3，不提前展开其业务/身份代码。

### M03实施批次（revision3 G3已释放MODEL01）

只对FR-AM03-01..08 / D-AM03 / TC-AM03-01..14分解；所核D全文8709809b593ab05784f7a559c1671f70e10f16d7ca224c3538e2a8b7a7c33560。M02实际已完成；宏观M03与M04可分文件，但本批不提前实施身份/财务写入。集成作者实际gpt-6.1-sol；独立高风险G5/G6通过宿主请求claude-opus-5.5，实际身份不能核实沿MODEL01，不豁免实现/测试缺陷。实现代理如未提供身份依据不臆造；工作量按真实出口而非文件数量判断。

| 任务 | 状态 / 真实前置 | 独占文件 / 追踪 / 风险与作者 | 可观察出口 / 测试先行 / 评审 |
| --- | --- | --- | --- |
| ARCH-T11 只读契约与查询基础 | done（MODEL01）；M03 revision3 G3、M02旧桥及M01 | 集成作者独占contracts、application查询及legacy port、infrastructure legacy的periods方法/聚焦测试、纯root快照opener与旧CLI提取、共享manifest/lock/exports；FR01/02/07/08、TC01..05/08；高风险精确值/来源接口 | 先RED后实现；r1六非公共包源阻塞已独立关闭。r2公共锁及实际Cookie归档SHA512、真实桥到schema跨页互操作；严格离线恢复成功，workspace/build124、类型与边界7通过，独立44项零失败/skip、16摘要重核及spec/quality G5释放。公网匿名在线安装未验证；test-only相对dist依赖沿根构建顺序，非阻塞建议保留 |
| ARCH-T12 Local财务HTTP与启动生命周期 | done（MODEL01）；r3 G5已独立释放；T11 G5已释放 | API作者独占apps/api/src与其test、新scripts/preview-legacy-snapshot.mjs及其CLI集成测试；根script/check由集成作者合入。FR01/02/06/07、TC01/03..08；高风险财务披露/关闭与错误 | r2补early return、真实重复信号及失败关闭测试后独立30/类型/build通过。组合首轮暴露测试cwd路径错误，r3仅按模块URL定位测试脚本，五个其他文件不变；同评审独立workspace30和根CLI9通过，六摘要/共享16/D重核，规范/质量G5释放，原失败保留 |
| ARCH-T13 真实试算/总账SPA | done（MODEL01）；r4 G5已独立释放；T11 G5已释放；与12无依赖 | 前端作者独占apps/web、packages/ui；根边界测试由集成作者单写，不改manifest/lock；FR03..05、TC03/09..12/07；高风险迟到/精度及Local边界 | r2查询/导航/管理器/教学修复、r3真实Vite CORS的RED→GREEN及独立九摘要/58web/UI2/8边界/类型/build已核。r4只改四现有label/语言，区分未配置目标业务账与可读快照，其他八文件/共享16/D不变；同评审独立58web/UI2及九摘要重核，规范/质量G5释放。当前真实UI/组合由14收口 |
| ARCH-T14 M03组合与公开交付 | done（MODEL01）；T11r2/T12r3/T13r4各G5及当前组合G6已释放 | 集成作者单写根入口/文档/候选与交付白名单/私有验收helper；全部FR/TC；高风险组合/公开持久化 | r4源481/公共及副本361/build/types、公共真实70/零skip、重建Edge六图/中英概览零财务查询/104行两页/403/409/历史/偏好/390px/proxy/保护hash通过；静态单样本load122.4ms/FCP280ms。79文件保护交付25更新15新增39同0冲突，安全无已确认漏洞。代码a608ee1已非强制main，精确新GitHub clone实际361+真实70/native/build/types/零skip通过且clone/PG清理；限定TC验收完成，状态文档另行发布核验。不发布保留trade/不切4173 |

真实DAG：`M03 G3 + M02 -> T11 G5 -> {T12, T13} -> T14`。批次A为单写共享基础；B仅API/CLI与web/ui两个独占文件域并行，二者不得改contracts/manifest/lock；C为组合/验收/文档/交付串行。T11未过G5不启动B；分项通过不能代替T14当前组合G6。原全部44FG状态仍0整体完成/13部分/31未实现。

## 历史提案：ARCH-SME-01（确认前，仅设计）

本节记录授权前状态：M-TRADE当时按用户要求暂停。新增架构需求/ADR/迁移阶段见[architecture](architecture.md)，用例AT-01..11。提案宏观独立G3已释放EXCEPTION (user-approved MODEL01)，当时ARCH-M00..09仍待用户确认及各阶段详细G3；10 planned、0 ready，不运行安装/迁移。当前实施授权与真实完成以本文件顶部为准。

本轮只完成：现状核对→架构/ADR/用例/图→独立G3及修订→文档一致性与交付。文档作者单一归并，独立评审只读；不并发写暂停核心或schema。原TASK01..24历史计数与FG覆盖不因架构设计变化。

### 架构迁移计划索引（10阶段，全部planned，0 ready）

以下不是新增产品完成项。统一状态为**等待架构确认及本阶段详细G3**，不安装、不编码、不迁移；每项还须G5及最终G6。完整验收/文件边界以[架构§9主表](architecture.md#9-从现有代码分阶段迁移建议dag不执行)为准，[DAG](diagrams/sme-migration.mmd)保留条件分支。高风险事务/身份/数据阶段独立强推理评审请求claude-opus-5.5，MODEL01仅适用于身份核实；前端阶段仍独立核输入/异步/label。

| 计划ID | 真实前置 | AR / 计划AT与最小出口 | 风险 / 可并行边界 |
| --- | --- | --- | --- |
| ARCH-M00 | 架构G3及用户确认 | AR06/08，AT08/10/11；冻结已发布源commit/能力、技术预算和恢复点 | 高；基线/文档单写，不包含暂停贸易发布 |
| ARCH-M01 | M00 | AR01/02，AT01/02；独立工程/契约骨架及兼容构建 | 中；共享契约/manifest单写 |
| ARCH-M02 | M01 | AR03/05，AT03/05/11；两真实数据库/驱动/UoW迁移spike | 高；ports/schema单写，可与M03/04分文件 |
| ARCH-M03 | M01 | AR01/07，AT01/07；一个只读SPA页和偏好/label | 中；web/ui单写，协议固定后并行 |
| ARCH-M04 | M01 | AR04，AT04/06；真实身份/scope及审批服务接口 | 高；API授权层独占，真实联通待M02/05 |
| ARCH-M05 | M02/03/04 | AR02..05，AT02..06；持久提交/第二人批准的单种GL闭环 | 高；事务/协议汇合串行 |
| ARCH-M06 | M05及用户明确恢复贸易 | AR05/06，AT03/05/08；已发布贸易选入基线后的非库存链适配 | 高；条件分支，不自动启动TASK24；公共schema单写 |
| ARCH-M07 | M05 | AR05/06/08，AT05/08/11；队列兼容、job/备份恢复 | 高；运维文件可与获准M06并行，迁移单写 |
| ARCH-M08 | M05/M07；仅选定已发布贸易时再依M06 | AR01..08，AT01..11；全选定基线/双库/容量/UAT及G6 | 高；默认M-CORE可独立推进，非单条GL代全基线 |
| ARCH-M09 | M08及单独真实数据停写/切换授权 | AR06/08，AT08/11；最终核对及受控切换/回退 | 高；运维串行，不以架构确认代迁移授权 |

## 当前M-TRADE-A任务（G3释放，尚未验收）

前置为M-TRADE-A-DESIGN-01修订G3，明确EXCEPTION (user-approved MODEL01)。仅非库存A切片，源目标整体完成状态不变。实现集成作者实际gpt-6.1-sol；宿主实现子代理未提供可核模型身份则不臆造，独立G5/G6继续请求claude-opus-5.5并保留MODEL01。会计/并发/恢复均高风险，需独立强推理审查；界面中风险也保留spec/quality两项结论。

| 任务 / 状态 | FG / FR / 设计 / TC | 实际前置与独占文件 | 验收、测试先行及下一步 |
| --- | --- | --- | --- |
| TASK-20 / done（MODEL01） | FG09/13/20限定 / FR-T02 / D-TRADE-A精确计算 / TC-T02/03/06计算 | 修订G3；src/enterprise-trade-math.mjs、tests/enterprise-trade-math.test.mjs | 缺模块先失败已核；作者及独立7/7及语法通过，评审3000随机/累计溢出等探针无发现，spec/quality释放，允许TASK22启动。 |
| TASK-21 / done（MODEL01） | FG09..14界面限定 / FR-T01..08 UI / D-TRADE-A API/UI / TC-T13/14 | 修订G3固定DTO；与20无彼此前置，独占public/enterprise-trade.js、两语言label及tests/enterprise-trade-ui.test.mjs | typed操作/配置、异步/确认、中英金额及输入保护；CAS与真实GL四币种槽位缺口均测试先行修复，独立第三轮65/65及探针、spec/quality释放G5。仅此界面增量完成，不代替领域及最终集成门禁。 |
| TASK-22 / done（MODEL01） | FG03..14/20/39/42限定 / FR-T01..08、NFR-T01 / D-TRADE-A、D-TRADE-CACHE / TC-T01..12/15领域 | TASK20 G5及缓存/分段补充G3；独占原三领域文件，无共享核心并发写者 | 原两High已由独立原探针/新分段/两句柄回填/强制完整性及SQL计数实际关闭，96/96，spec/quality释放G5。父完整291/291及独立400张五行规模另有实测，保留冷月末/完整重放成本非SLA。 |
| TASK-23 / done（MODEL01） | 同上接口限定 / FR-T03/08 / D-TRADE-A API/UI / TC-T04/11/13/14接口 | 修订G3固定契约；与21/22分文件并行。server、enterprise.js挂载、HTTP集成测试、package由集成作者独占 | 实际三项HTTP及挂载DOM通过；独立接口/挂载/真实集成47/47、spec/quality释放G5。父完整280/280、零跳过及14语法通过；真正组合交付仍等待TASK22领域G5，不以此替代内核审查。 |
| TASK-24 / blocked（用户暂停） | 同上组合限定 / FR-T01..08、NFR-T01 / D-TRADE-A及缓存恢复与交付 / TC-T01..15组合 | TASK21/22/23各G5均已释放；恢复测试、README/design由集成作者串行 | 贸易恢复新增真实CLI用例8/8；隔离GUI只完成AP零写预览/金额/未折算，未确认POST。用户要求暂停，helper已停；G6/安全/交付/推送未做。新架构设计不自动恢复本任务。 |

并行批次A为20/21/23（固定协议下薄层）；批次B为20 G5后的22，可与21/23并行；批次C为21/22/23 G5后的24组合验证。共享核心/接口各只有一名写者。统计原24项：23完成、0实施中、1用户暂停阻塞；架构设计不计入这些产品完成项，不能把尚未执行的用例标已通过。

## 当前M-CORE任务（G5及组合G6已验收）

ERP-CORE-DESIGN-01按MODEL01释放FR-C01..08后新增以下任务；旧TASK01..15真实历史保留。新增4项均完成实际G5，TASK17期间刷新版本缺口已测试先行修复并由同一独立评审复审，当前组合G6按MODEL01释放。FG仍0完成/13部分/31未实现；功能验收不替代本地保护交付及远端发布证据。

| 任务 / 状态 | FG / FR / 设计 / TC | 实际前置与并行边界 | 验收、风险与评审策略 |
| --- | --- | --- | --- |
| TASK-16 / done（MODEL01） | FG01..07、39/42限定 / FR-C01..08 / D-CORE / TC-C01..10、C12领域部分 | 前置ERP-CORE-DESIGN-01及已释放时序补充G3；独占src/enterprise.mjs及tests/enterprise.test.mjs，单一schema作者 | 领域40/40及语法通过，独立原探针重现并确认时序/历史清单两项Medium修复、spec/quality无阻塞；实际G5按MODEL01释放。真实业务子账及完整FG仍未完成。 |
| TASK-17 / done（MODEL01） | FG01..07、39/42界面限定 / FR-C01..08 / D-CORE UI / TC-C11、其余可观察路径 | 前置G3固定HTTP契约；与TASK16可并行，独占public/enterprise.js、中英label及tests/enterprise-ui.test.mjs。不写app/server/schema | 异步及期间刷新修订G5均由独立评审确认关闭。刷新同步状态/模块/revision并清旧确认，保留无关输入；35项widget/label及组合172/172通过，真实GUI外部改期间后刷新、重新批准保存成功。 |
| TASK-18 / done（MODEL01） | FG01..07、39/42集成限定 / FR-C01..08 / D-CORE API / TC-C11及旧80回归 | 前置G3固定接口；可与16/17做薄层实现，独占server/app入口、原HTTP/UI测试和package语法入口。最终验证必须等16/17集成 | 原接口/迟到保护及币种页脚补充G5均独立spec/quality通过；完整172/172、11语法、六首次并发/配置失效及真实UI往返已核。当前组合G6独立复审通过。 |
| TASK-19 / done（MODEL01） | FG07/42限定 / FR-C08 / D-CORE备份 / TC-C12 | TASK16修订G5已释放后启动；独占scripts/enterprise-backup.mjs及tests/enterprise-backup.test.mjs，与UI最终修订无写冲突 | 缺模块失败先行，7项真实SQLite/WAL/独立子进程恢复/维度金额与回执/临时token失效/目标竞争拒绝/损坏拒绝测试通过；独立7/7及WAL/锁/路径探针通过，真实WAL夹具窄复审G5释放MODEL01。 |

任务统计：**19项=19完成、0实施中、0等待前置**。TASK17期间刷新Low已关闭，当前作者与独立最终复审各172/172、0跳过及11语法通过；安全窄差异复审无达到门槛的漏洞。16/17/18的并行来自同一已审查协议而非代码先就绪；发布仍须另有目标文件哈希交付及非强制远端核对证据。实际实现子代理身份如宿主不提供不能臆造；集成作者实际gpt-6.1-sol，独立G5/G6按用户指定请求claude-opus-5.5并保留MODEL01例外。复杂会计/原子持久化使用高推理审查，机械UI label修改不单独制造审查角色。

后续六里程碑已有全44目标实施授权及POLICY-01默认，不再等待普通政策问答；尚未释放的是各自具体G3，不提前列ready代码任务。M-TRADE前先统一精确税/成本纯计算契约，按真实对象切片；未折算历史行的后续报告币处理必须在FX G3显式决定。

## TASK-15：红绿主题与中英label

- Status: complete；用户确认FR33-35/主题与双语设计/TC41-44，LABELS-DESIGN-01独立G3与LABELS-FINAL-01组合G6释放MODEL01例外。实际前置TASK14；不做TASK11-13或新增会计模块。
- 中风险：全界面标签/混合数据/未保存表单/异步结果/偏好失败；作者实际gpt-6.1-sol，独立G5与组合G6请求claude-opus-5.5、身份未核实例外沿用。
- 先行失败断言已执行；按单一作者集成，独立英文资源只写en.js，与主题/绑定基础分文件并行。范围public界面/每语言资源/明确静态白名单、聚焦及旧回归；不改Book/AI权限/账务。
- 实际验收：红默认绿可选、中默认英可切换与持久；458个成对label，非数据文本/属性可切换；输入、候选、预览与迟到AI保留，失败显式。实际62/62及语法PASS、真实两组截图及390px视口、独立审查Medium内存累积修复闭合。安全本地28文件15更新/4新建/9相同/0冲突，本地恢复依赖后62/62+语法PASS；4173原3凭证/ID3/期间哈希不变，实际浏览器加载当前版本。本任务剩余0，未来会计功能未完成。

## TASK-14：ERP工作台与可选教学

- Status: complete；用户确认FR29-32/D-ERP工作台/TC37-40，ERP-UI-DESIGN-01复审G3及ERP-UI-FINAL-01组合G6释放MODEL01例外。前置TASK03/05/10，独立于TASK11-13，本轮不做下钻/勾稽。中风险UI/异步AI/本机偏好，作者gpt-6.1-sol，独立审查请求claude-opus-5.5，保留实际身份限制。
- 文件范围public/index.html、app.js、style.css、tests/ui.test.mjs及jsdom开发依赖/锁文件、现有design/README；不改会计引擎/SDK权限/原账。测试先行：实际node --test tests\ui.test.mjs在改UI前5/5失败，已渲染旧导航后断言新ERP行为失败，非空跑。
- 实际56/56+语法PASS、真实隔离UI/前后及窄视口截图、独立G5修订关闭与组合G6无显著发现；4173原3凭证/ID3不变，静态刷新已加载新界面。本地按plan44基线安全交付24文件12更新/1新建/11相同/0冲突；本地实际依赖恢复及56/56+语法PASS，收尾证据按本轮manifest保护回填。本任务剩余清零，TASK11-13与OQ不因此完成。

## 历史PLAN-44批次进度与可执行边界

**该历史批次共15项：15完成、0就绪未启动、0等待前置、0实施中；不包含本页顶部新增TASK16..19。** 当时完整FG为**0完成/13部分/31未实现**，见[44FG进度](project.md)。TASK11–13完成当时限定切片与交付，不将FG39/42整体标done。

| 已交付任务 | 状态 | 限定交付与可追溯证据 |
| --- | --- | --- |
| TASK-01 | done | 会计核心；下文历史及CORE-01 |
| TASK-02 | done | API/AI适配层；API-01 |
| TASK-03 | done | 教学界面/首版交付；UI-FINAL-01 |
| TASK-04 | done | 权威关账AI上下文；CLOSE-CONTEXT-FINAL-01 |
| TASK-05 | done | 官方SDK受限真实Copilot；COPILOT-FINAL-01 |
| TASK-06 | done | 科目配置/写控制；ACCOUNTS-FINAL-01 |
| TASK-07 | done | 基础维度/历史查询；DIMENSIONS-FINAL-01 |
| TASK-08 | done | 现金服务确定性事件；POSTING-FINAL-01 |
| TASK-09 | done | 可配置精确维度结构；STRUCTURE-FINAL-01 |
| TASK-10 | done | 正常方向/备抵解释；PROPERTY-FINAL-01 |
| TASK-11 | done | 同月完整总账下钻；READ-G5-A-01，MODEL01 |
| TASK-12 | done | 六项同快照只读勾稽；READ-G5-A-01，MODEL01 |
| TASK-13 | done | 中英勾稽面板/失效保护与组合验收；READ-FINAL-01，MODEL01 |
| TASK-14 | done | ERP优先导航/可选教学/录入AI；ERP-UI-FINAL-01 |
| TASK-15 | done | 红绿主题/中英label/偏好与异步保留；LABELS-FINAL-01 |

上表证据均在[reviews](reviews.md)；原TASK01-10正文/FR/TC/执行结果保留在后。done不是完整FG完成，更不是全部会计政策已确定。

### 当前限定任务（已过G3规划门禁）

| ID / 状态 / FG | FR / 设计 / TC | 实际前置 | 验收、边界及下一步 |
| --- | --- | --- | --- |
| TASK-11 / done / FG-39部分 | FR-139-A / D-READ-A / TC-139-A | TASK-03、TASK-10 | 三类TB导航同月完整总账，清除维度筛选，停用历史可查且解释阶段差异。聚焦UI/label通过；独立spec/quality PASS，G5按MODEL01释放。 |
| TASK-12 / done / FG-39、42部分 | FR-139-B / D-READ-B / TC-139-B | TASK-01、TASK-02、TASK-10 | 一次快照固定6项、安全整数分、400/404及零写入。六种受控差异/溢出/负零/关账语义验证通过；独立spec/quality PASS，G5按MODEL01释放。 |
| TASK-13 / done / FG-42部分 | FR-142-A / D-READ-C / TC-142-A | TASK-11、TASK-12 | 所选月6项/差额/范围限制，中英显示；加载/失败/重试与月份/替换容器迟到保护。4项用例先失败，后聚焦21/21；工作区/本地/独立评审各全回归80/80、8项语法通过。隔离浏览器零写，G5/G6及28文件哈希保护交付通过。 |

三项均为中风险：只读仍可能误导口径/隐藏差异/污染筛选，必须守住旧报表/过账/ID3。集成作者实际gpt-6.1-sol；独立G5与组合G6请求claude-opus-5.5，实际身份未核实，保留MODEL01例外；无未解决阻塞发现。无需先决定税/库存/年结；用户本轮授权只释放这三个只读切片，其余政策范围不推定获准。FR/TC在[需求](requirements.md)/[用例](test-cases.md)，D-READ在[设计](design.md)。

### 依赖与并行批次

| 批次 | 任务 | 可并行条件 / 集成冲突 |
| --- | --- | --- |
| 已完成 | TASK-01..10 | 真实历史前置均已完成，不重跑实现、不将编号顺序当业务依赖 |
| A（本轮并行完成） | TASK-11、TASK-12 | 无彼此前置；前者UI、后者服务/测试，按文件分工并行。各自隔离测试账套/端口；共享README/design由单一集成者回填，不同时写。 |
| B（本轮串行完成） | TASK-13 | 等A两项G5释放后启动；与TASK11共享app.js，没有同批写；在已完成后端契约上做UI/浏览器集成。 |
| C | 组合回归/最终评审/安全交付 | TASK13验收后串行发布门禁，不是额外实现任务或可提前标done的阶段 |

以上是任务级无环前置，不把整FG01-07全部完成当成后续只读功能的假依赖。运行schema/规则/来源等共享契约的其他业务分支不能靠“不同页面”判断可并行。

### 历史待澄清里程碑（现已授权，具体切片仍须独立G3）

下表保留PLAN44当时识别的业务依赖；OQ01..10现已有POLICY-01默认，不再等待普通政策问答。M-CORE的当前状态见顶部；其余六个里程碑不是已通过G3的ready任务。

| 里程碑 | 目标范围 | 释放所需决策/真实能力 |
| --- | --- | --- |
| M-CORE | FG01-07高级剩余 | OQ02/03/09；日期/法人/维度派生与控制政策，逐切片G3 |
| M-TRADE | FG08-15 | OQ01/07；选采购或销售首个对象，先共定数量/成本/税契约 |
| M-COST-TAX | FG16-24 | OQ04/05/06；模型/税制/币种，按选定业务路径组合，不假设完整库存须先于任何收货 |
| M-BANK | FG25-27 | OQ07/10及已选付款/未结项来源；桥接/匹配/预测边界 |
| M-ASSET-CLOSE | FG28-34 | OQ03/08；资产/租赁/摊提/结账政策，旧月度模式兼容 |
| M-GROUP | FG35-38 | OQ09/06；法人/持股/折算/双边来源契约及映射 |
| M-REPORT-LEARN | FG39-44其余 | OQ02/10及实际已启用对象；子账/现金流/配置日志/案例分支/AI事实 |

这些里程碑覆盖44FG的全部剩余范围，与上面的局部切片有交集但不重复计任务。源案例主线不覆盖所有高级模块，不能虚造一套“全模块已贯通”账；辅助AI不是会计规则引擎前置。

## TASK-10: normal side and contra-account explanation

Testfirst selected3propertycases failedmissing `setAccountProperties` beforecode(exit1). Firstdomainrun26/27 exposednegativezero innewnormalAmount; normalizedzero, assertionunchanged. Firstfull48testsPASS butsyntaxcaughtmissingmapparenthesisinUI; fixed, reran `npm test && npm run check`:48/48/0skipped/allsyntaxPASS(exit0). Fournewcasesover44; sharedmanual/AI guards/latevalidationpreserved. Runtime/API/UI/review/browser/localdeliverycomplete.

G5andcombinedG6spec+qualityPASS/no findings, independent48tests/checkPASSunderMODEL01. ActualisolatedUI explicitconfig/cancel/invalidretained/CAS/grossnet/oppositebalancesave+post/close+nominalhistoryPASS, helperstopped.4173newreportsbrowserreadonly/original3journals/ID3exact.22-filehashguardlocaldelivery12updated/10same/0conflicts; target27domain/syntaxPASS/finalmanifest+audit. No runtime/testchangesafterG5/G6; no remainingTASK10item, finiteA1-A7exitmet, notfullFG01-07.

- Status: complete; G3 PROPERTY-DESIGN-01/G5 PROPERTY-INCREMENT-01/G6 PROPERTY-FINAL-01 releasedunderMODEL01withpretestclarifications, G4traceabilitychecked. FR26-28/normal-side design/TC33-36. DependsTASK06chart+TASK08source+TASK09latestdelivery forcross-regression, notadvancedmodules.
- Highriskaccountingclassification/explanation/CAS/fingerprint; actualauthorgpt6.1-sol, independentG5/G6requestedclaudeopus5.5actualidentityunverifiedMODEL01. Emptyadditiveproperties, protectedbuiltins/types/oldlines/monthclose/ID3; general/contraonly, existingmanualcontrolreused.
- Testfirst3focusedcases forstrictconfig/report+source/persistence+close thenminimaldomain/API/UI, controlledAI/HTTPguards, prior44fullsuite/syntax, isolatedrealUI/readonly4173, independentincrement+combinedreviews, safe22filelocaldeliveryagainststructure-final. A1-A7finiteexittraceabletospecifictests andearlierUI; advancedsourcegoalsremainpartial.

## TASK-09: opt-in exact-account dimension structures

G5andcombinedG6compliance+qualityPASS/no findings underMODEL01; reviewerindependently44tests/checkPASS. IsolatedrealUI/JSON+cancel/CAS/old-draftlatecheck/correct10.00post/source12.50snapshot+staletoken/legacyreceipt/history22.50PASS. Helperstopped;4173newpage/0structures/original3journals/periods/ID3exact. Safe22-filelocalhashdelivery12updated/10same/0conflicts; actualtarget24domain+syntaxPASS. No runtime/testchangesafterG5/G6; no remainingTASK09item, firststagepartial.

Actualtestfirst `node --test --test-name-pattern='dimension structures are|dimension structures share|dimension structure persistence' tests\book.test.mjs`:3expectedmissing-methodfailures(exit1). Then domain24/24 andfull `npm test && npm run check`44/44/allsyntaxPASS(exit0), prior40preserved;4newcasesinclheldAI/HTTPguards. Runtime/API/UI/review/browseracceptance/localdeliverycomplete; finalmanifest/audit in sessionfiles.

- Status: complete; G3 STRUCTURE-DESIGN-01/G5 STRUCTURE-INCREMENT-01/G6 STRUCTURE-FINAL-01 released MODEL01exception, G4traceabilitychecked. DependsTASK06-08/sharedGL. FR23-25/structuredesign/TC29-32, boundedFG02partial. Exactaccount PK/explicitactive/no backfill, requiredsegments+exactallowedprojection, otherdimensionsunconstrained.
- Highrisk sharedwriter/lateAI/sourceABA/reversalhistory; authoractualgpt-6.1-sol, G5/G6requestclaude-opus-5.5 actualidentityunverified MODEL01. G3sixclarificationsrecordedbeforetests/code.
- Testfirst focusedcatalog/sharedboundary/persistence/reversal tests must failmissingmethod; then smallestdomain/API/UI, heldfakeAI/no realcalls, full40baseline+focused/syntax, isolatedactualUI/old4173ID3readonly, independentincrement+combinedreviews, safe22-filetargethashsyncagainstpostingfinalmanifest. No commit/push/PR/credentials/dbcopy oradvancedderivation/balancing.

## TASK-08: deterministic cash-service source posting

- Status: complete; G3/G5/combinedG6 released `EXCEPTION (user-approved)` MODEL01, G4traceabilitychecked.40tests/syntax/isolatedUI/previewpreservationPASS; local22files12updated/10same/0conflicts andtarget21domain+syntaxPASS. No remainingTASK08item; firststagepartial. Depends onTASK06-07 andoriginalGL/periodcore. FR19-22/teachingeventdesign/TC25-28, partialFG04/05/06only.
- Highriskrulematching/signedstalechecks/atomicexactlyonce/sourcehistory. Authoractualgpt6.1-sol; independentG5/G6requestclaudeopus5.5 actualidentityunverified underapprovedMODEL01.
- G3clarifications: activewinner tiesbeforeaccountchecks; eventroute respects manualAllowed asconservativeGLteachingdeviation. Pureinputsyntax/canonicaltwo-decimalamount/sortedoptionalemptyomittedmaps; nocatalogcheckbeforecompletedreceipt replay. Fixedsignedmemo `教学现金服务 {reference} / {service}`. Usedreferencepreview409/readexistingreceipt; sameoriginaltoken retry survivesrestart/closedperiod. Currentinvalidconfigerrorsprecedesignaturemismatch; malformedtoken409. PUTfullrulefields scope/match/revenueAccount/active/revision; inactiveunusedmatchallowed. ReceiptSQLinsertrequirespostednormal/nooriginalref. Hybridteachingflow, GLreversalkeepssource/reference consumed.
- Testfirst: catalog/matcher/planpreview/commit/idempotency/restart/rollbacktests beforecode, plus35regressions; APIguards; isolatedUI/staleform/repeatedconfirm/receipt/explanation; oldschema/ID3; independentincrement+combinedreview; safe22filelocalhashsyncagainst dimensionsfinalmanifest. NoAIauthority, no subledger/defaultbackfill/previewDBmutation.
- Actualtestfirst selected3cases failed missingcreateService beforecode (exit1); domainimplementation20/20 thenAPI/UI39/39; expandedstrictcatalog/accountABA/period/receiptSQL/oldschemacases now `npm test && npm run check`40/40/allsyntaxPASS(exit0). Five newcases overprior35.
- G5compliance+qualityPASSunderMODEL01/no findings. Isolatedactualbrowsercreate/rank/explain/DEPT=OPSpreview, changedform/config409, real11.00post/lostresponse/explicitretryexactlyonejournal+receipt, originalruleversionhistoryPASS; helperstopped. Persistent4173readonlybrowsernewpage/hash+3journals/periods/ID3exact.
- CombinedG6compliance+qualityPASS/no issues, independent40tests/checkPASSunderMODEL01; releasepermitsstatus/evidence/hashsync only. Runtime/testsunchangedsinceG5. Localhashguarddeliveryandtarget21tests/checkPASS; finalmanifest `files\posting-local-delivery-final.json`. No codeacceptance/review/deliveryblocker; source/targetGit/environment/data/dependenciesprotected.

## TASK-07: basic dimensions and filtered ledger

- Status: complete; G3/G5/G6 released `EXCEPTION (user-approved)`, G4traceabilitychecked.35tests/syntax andisolatedbrowserPASS; G5inactivefilterlabel independentlyclosed; local22fileshashmatch13updated/9same/0conflicts, target17domain+syntaxPASS. No remainingTASK07item; overallfirststage remainspartial.
- Depends on completedTASK06/chart and existingperiod/journal/AI infrastructure; FR16-18/basicdimensiondesign/TC21-24. BoundedFG02partial, no advanceddefaults/requiredness/derivation/balancingdim or attributedclose.
- Authoractualgpt-6.1-sol, strongerreasoning; independentG5/G6requestclaude-opus-5.5 actualidentityunverifiedMODEL01. Highriskimmutableattributes/latevalidation/reversals; no credentials/realAI/previewwrites in testing.
- G3clarifications: implementshared sorted optionaldimensions helper across every line projection; preserve/show AIattributes and update disclosure; AIserver accepts only exact CODE=VALUE pairs present inprompt. GETstate nestedvalues; valueupdates allowedwhiledimensioninactive; catalogcode/nameAPIimmutable. Reject empty/presentincompletefilters and echo appliedfilter; unassignedclose means filterednominalopening accumulates acrossmonths, discloseexplicitly.
- Acceptance/testfirst: focused newdomain/catalog/attribute/filter tests failbeforeimplementation, then code; retain31regressions; coverSQLimmutableattribute updates includingmoving to/frompostedline, exactrestrictedreversal, latepost/AI restrictions, unknown/emptyfilters, filteredopeningpostclose and no-dimshape equivalence. ControlledAI/browser tests retain allattributes; isolatedrealUI and exactpreviewID3preservation; independentG5/G6; safe same22fileallowlist localhashsync against precedingfinalmanifest.

## TASK-06: custom chart configuration and manual posting controls

- Status: complete; G3/G5/combined G6 released under MODEL-01 `EXCEPTION (user-approved)`; G4 traceability checked. Safe local synchronization22files verified,12 changed/10 identical/0conflicts; destination14domain tests and syntaxPASS. No outstanding item in TASK-06.
- Depends on completedTASK01-05; linksFR12-15,Foundation account design,TC16-20. Bounded FG01/07 partial with report/AI consistency, no other business implementation.
- Risk high(account classification/control), strong author actualgpt-6.1-sol, independent requestclaude-opus-5.5 identityunverified. Acceptance: additive settings/oldbook preservation,seed protection,strictAPI/revisions,shared manual/AI restrictions,sourceexact reversal and all-account close,usable Chinese UI.
- Strategy: focused domain tests failed before implementation; full`npm test`/`npm run check`,actual oldschema fixture/restart and isolated browser completed. Independent G5 and combined G6 released; safe local sync guarded by preceding delivery hashes, no DB/env copying.
- Actual evidence: three selected test-first failures before runtime implementation;31/31 full tests and syntaxPASS; G5 independent compliance/qualityPASS. Isolated4175 browser accepted create/edit/cancel/duplicate/restriction/draft/post/ledger/report behavior; confirmed10.00 restricted-account historical balance and14,000.00 totalassets. Preview4173 restarted with unchanged three journals/periods/unknownID3 and current UI. See ACCOUNTS-INCREMENT-01; no new live AI call.

G4 baseline: G3 alternative review passed under the documented MODEL-01 exception. Requirements/design/tests have complete links below. No new business scope is added.

All task authors: actual `gpt-6.1-sol`. All independent reviews request user-approved `claude-opus-5.5` through `task`; actual reviewer identity is unverified. G5/G6 must retain `EXCEPTION (user-approved)` when the alternative reviews pass. No tests, acceptance or blocking findings are waived.

## TASK-05: safe official Copilot text provider

- Status: complete; G3/G5/G6 released under MODEL-01 `EXCEPTION (user-approved)`.
- Depends on: completed TASK-02/03/04 and COPILOT-DESIGN-01.
- Links: FR-08/09/11; NFR-03..06; Copilot provider design; TC-14/15.
- Risk/importance: high (credential isolation and agent execution boundary); stronger-reasoning author/reviewer, actual author `gpt-6.1-sol`, independent request `claude-opus-5.5`, actual reviewer unverified under MODEL-01.
- Acceptance: official supported authentication only, exact advertised model verified, effective tools empty, unrelated API secrets not inherited, isolated temporary state removed, bounded errors/output/concurrency, preserved OpenAI/manual accounting and user approval.
- Test-first: fake SDK contract/failure tests first must fail for missing adapter, then API tests and full regression. Real fictional teaching/draft calls run separately; never in normal automated tests.
- Delivery requires independent increment and combined final review, updated evidence and restarted verified preview; no commit/push/PR or main-checkout copying.
- Final evidence: missing-module test-first failure, then scale-contract failures before correction, now 26/26 tests and syntax checks pass. Five real fictional attempts recorded, including two rejected quality/validation attempts, corrected 2,000-unit teaching and validated 10.00/10.00 draft; each live in-memory book unchanged. Restarted preview/browser show Copilot/gpt-6.1-sol. Original persistent seed/period digest verified unchanged; a subsequently observed draft ID3 was preserved, not attributed to the AI tests. Independent increment/combined final review passed compliance/quality; correction re-review closed all three minor findings and confirmed release. Runtime hashes unchanged; only tests/evidence docs refined.

## TASK-01: accounting core

- Status: complete, G5 `EXCEPTION (user-approved)`.
- Depends on: reviewed G3 baseline only.
- Links: FR-01..07; NFR-01/02/06; design data/invariant sections; TC-01..08.
- Risk/importance: high (money/state integrity); stronger reasoning author/reviewer.
- Acceptance: persistent teaching book, exact amounts, atomic immutable posting/reversal, three trial-balance views, correct profit/equity/statements, safe sequential close/carry-forward.
- Clarifications from review: reversal date is supplied by the user and validated within an existing open period, including reversal of a prior closed-period normal/adjusting journal. Unadjusted excludes current-month adjusting journals and reversals of adjusting sources (even earlier-month sources), plus current close; adjusted excludes only current close; earlier-month closes remain. Report payloads contain no generation timestamp.
- Strategy: domain tests first and record intended missing-module failure, then smallest coherent domain implementation; `node --test tests/book.test.mjs`.
- Evidence/review: test-first missing-module failure recorded; all 10 focused domain tests pass. Independent specification and code-quality reviews passed, including rechecks of post/close aggregate safety and exact reversal mismatch. See CORE-01 in reviews.

## TASK-02: local API and AI adapter

- Status: complete, G5 `EXCEPTION (user-approved)`; depends on completed TASK-01.
- Links: FR-08/09; NFR-03..06; design HTTP/AI sections; TC-09..11.
- Risk/importance: high (secrets, paid external calls, untrusted output); stronger reasoning author/reviewer.
- Acceptance: loopback HTTP JSON API, bounded input/output, explicit failures, safe AI preview/context, no auto mutation, no secrets exposed.
- Clarification: cross-site fetch metadata rejects even with missing Origin, including AI requests.
- Strategy: controlled HTTP/AI integration tests first, then transport implementation; test production threshold constants and injectable test timeout; `node --test tests/server.test.mjs`.
- Evidence/review: tests initially failed for missing module, then all 16 domain/API tests passed. Independent compliance/quality review and focused fixes re-review passed. AI failures explicitly return 502, fixtures cannot inherit live credentials, paid routes have counted zero-call rejection tests. Blank rationale regression added for final regression.

## TASK-03: teaching UI and verified delivery

- Status: complete, G5/G6 `EXCEPTION (user-approved)`; depends on completed TASK-01 and TASK-02.
- Links: FR-01..10; NFR-03..06; design UI/limits; TC-12 plus full regression.
- Risk/importance: ordinary UI, high combined accounting/AI workflow; stronger reasoning combined reviewer.
- Acceptance: usable Chinese local browser teaching workflow, manual/reviewed AI draft editing and explicit posting, examples, reports, correction, close, next month, clear failures and startup instructions.
- Strategy: semantic controls and text-only dynamic rendering; syntax checks, all automated tests, real HTTP smoke and host browser verification when available; independent increment and combined final review with separate compliance/quality conclusions.
- Evidence/review: real browser exercised three sample transactions through save/post, ledger, reports, close and next month, with exact expected balances; error input preserved; controlled AI UI mock proved preview-only transfer and inert text. Combined independent review plus final focused correction re-review passed both specification-compliance and code-quality dimensions. Traceability, cent-exact display and corrected teaching links are complete. All 18 automated tests and syntax checks pass. Live AI and mobile layout remain unverified. Only post-review runtime-file change was relocating an existing static import and removing a trailing blank line; semantics unchanged, regression rerun and new digest recorded in reviews.

## TASK-04: authoritative AI closing context

- Status: complete, G5/G6 `EXCEPTION (user-approved)`; depends on completed TASK-02/03 and CLOSE-CONTEXT-DESIGN-01 release.
- Links: FR-09; NFR-04/05/06; design FR-09 correction; TC-13 and existing AI draft contract.
- Risk/importance: bounded read-only correction; accounting interpretation and data disclosure merit independent stronger-reasoning review.
- Author: actual `gpt-6.1-sol`; independent reviewer requests user-approved `claude-opus-5.5`, actual identity unverified under MODEL-01.
- Acceptance: all AI requests include real period state; teaching gets actual draft count/close eligibility, open-period proposed lines or closed-period posted journal; zero-profit open/closed remain distinguishable; no record mutation. Existing limits, guards and human approval remain unchanged.
- Review clarifications: explicitly tell the model proposed lines exclude drafts and may change; open draft generation also asserts supplied period; manually verify updated UI/README data-sharing disclosure.
- Strategy: focused contract test must fail on missing context before implementation, then pass with all prior tests. Independent increment and combined final correction review required before completion.
- Evidence/review: both focused assertions initially failed on missing `period`; all 19 automated tests and syntax checks pass after implementation. Actual browser confirms revised data-sharing disclosure and manual README verification agrees. Preview restarted with the existing book unchanged (two seeded journals). Independent increment/combined correction review passed both specification-compliance and code-quality dimensions; reviewer reran all 19 tests and syntax checks. No unresolved findings. Real external AI remains unverified.
