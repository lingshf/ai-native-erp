# 公开验证记录

> **历史记录（D561，KDOC-03）。** 本文件是 M0 重启之前 ARCH-M0x 阶段的公开验证记录，内容不再更新。它与同名目录 [`reviews/`](reviews/README.md) 无关：现行的里程碑评审、Sprint 评审与回顾都在 `reviews/` 目录下，见其 [README](reviews/README.md)。

本文件只保留可公开的产品验证结论。私有研究资料、原始来源案例、机器路径、内部依赖地址及宿主操作记录不随代码发布。它不是原本机审查日志的逐字副本。

## ARCH-M03-DESIGN-01：revision3 G3已释放MODEL01

作者实际gpt-6.1-sol，设计前模型/风险计划已记project；本轮FR-AM03-01..08、D-AM03和TC-AM03-01..14已写齐。范围为显式M00已验证快照→M02只读桥→应用查询→严格REST/OpenAPI→React真实试算/同月完整总账；Local财务披露/来源绑定/精确金额/异步查询为高风险。计划通过宿主task请求claude-opus-5.5独立审requirements/design/tests，以当前六份文档的实际摘要固定审查版本，沿MODEL01，不把请求名当实际身份。作者已交叉核对八FR均有TC、旧health/偏好/CLI保护及无Server/写账边界；这不是独立通过。本轮尚无G3结论，不拆实施任务或更改产品/依赖，不借M02 G6批准新增接口。

首轮独立G3实际核六摘要一致、读M03与相关源码；所核D全文SHA256为a253e9f89f793d584f075d47064d095e44e400b39abef5c33243c0f9585eddab。requirements充分，设计可行，但**G3 BLOCKED**：B1真实同源Vite GET不发Origin，原“必须配置dev origin才能proxy成功”用例不可成立。另N1..06为非阻塞澄清：跨页应按lineId而非journal id查重、存储错误映射、Query默认值、listen前fail-closed、skip/overview两链接、root package公共变体与trade保护。作者revision2逐项写入D/TC并澄清FR07；尚待同一独立评审实际复核，不能把自称修复当释放。没有执行测试/PG/浏览器，没有称此设计审查为最终安全审查。

宿主拒绝向sync评审发送复核消息，故另开独立窄修订评审，仅核上述七项及交互，不重复声称原评审亲自复核。该评审实际核revision2六摘要及相关源码，D全文c90a64a0185deabc5b81ee639b52af13fb64ce771055613d4938b531ca0a66dc；B1/N1..06全部关闭，requirements/design/test充分，限定G3释放**EXCEPTION (user-approved MODEL01)**。另S1非阻塞建议保留Vite默认allowedHosts并测外域Host，因为proxy改写后API不能验证原Host；作者revision3已补一句及TC07、固定4180/5173配对说明，待该窄评审复核新增文本。无安全漏洞实测结论，依赖/代码/详细任务仍未改。

随后该窄评审实际核revision3六摘要，D全文8709809b593ab05784f7a559c1671f70e10f16d7ca224c3538e2a8b7a7c33560；S1关闭、没有新增问题，requirements/design/tests及**当前revision3 G3明确释放EXCEPTION (user-approved MODEL01)**，仅允许启动M03分解/实现。未运行测试/服务或打开真实账，不代表G5/G6、安全/发布或后续阶段已通过。之后project/reviews/tasks的门禁状态回填不是改写所核详细D。

### ARCH-T11-G5：r2已独立释放MODEL01

实现作者gpt-6.1-sol；独立高风险评审请求claude-opus-5.5，实际身份未独立核实，沿MODEL01。首审实际核16文件摘要及源码，独立43项通过、零失败/跳过；specification compliance通过，code quality因新锁中六条非公共包源而阻塞，T12/T13未启动。作者首轮完整workspace/build123及类型/边界通过不能抵销此发布缺陷。

r2仅改锁及真实互操作测试两个文件：六URL规范到公共npm，完整锁非link包源正向限定公共origin；唯一新增弱摘要Cookie以真实归档SHA1匹配原锁、实际SHA512匹配打包摘要、完整六文件树逐字节匹配后升级强摘要，其余五个新依赖摘要不变。逆向还原六URL及单一摘要后精确等于首审锁SHA256，未把非公共地址写入公开证据。四种客户端正常TLS公网连接失败，未关闭证书校验；公共元数据独立核实和匿名在线安装未完成。首次严格离线`npm ci --ignore-scripts`因Cookie归档缓存缺失失败，失败保留；仅缓存已核归档后，同一公共锁/禁止registry替换/严格离线安装实际成功，不冒称在线通过。

按首审建议补真实reader→应用查询→context/三阶段试算/完整月总账schema互操作与跨100行分页，并核目录字节不变。r2完整workspace/build124（15+6+60+2+11+30）、严格类型及7项边界全部通过、零跳过；16文件r2摘要已冻结并交同一独立评审窄复核。目前仍待其specification及quality明确结论，不自放行G5，不称M03 G6或最终安全审查已完成。

同一独立评审随后实际重核r2全部16摘要、所核D全文及相对r1仅两文件变化，独立完成六URL/一摘要逆向还原、归档SHA1/SHA512及新增真实schema分页测试检查，并重新执行44项、零失败/跳过。明确**specification compliance通过、code quality通过、T11 G5 EXCEPTION (user-approved MODEL01)**，允许放行T12/T13，不代表组合G6、安全批准或公开发布。其未重新核web30格式输出及类型/边界日志，这些仍为作者实际执行结果，不冒称评审者重跑。非阻塞建议由当前授权的实现决策保留：测试的相对contracts/dist导入依赖现有根构建顺序、边界允许且不进入生产图；无需为该真实互操作测试扩大生产依赖，独立包测试拆分时再整理。既有锁的其他历史SHA1不属于本轮新增，不以本轮单包加固宣称全锁强摘要。正常TLS公网/匿名在线未验限制保留。

### ARCH-T13-G5：r4当前已独立释放MODEL01

分文件实现者由宿主general-purpose任务承载，实际模型身份未独立核实；父集成作者gpt-6.1-sol。八文件当前摘要已冻结，T11全部16摘要及G3详细D不变。实现者报告先缺实现、后路由断言RED，随后web53（原30保持）、UI2及作用域类型/生产构建通过，未改manifest或锁；这是实现证据，不是独立批准或实际浏览器。独立强推理评审通过宿主请求claude-opus-5.5，沿MODEL01，正在核当前八文件、原测试、D-AM03-WEB及TC03/09..12；尚无specification/quality结论。API/CLI在另一个独占域继续实现，未混入此G5。

首审随后实际核八摘要/G3详细D/共享16及原web30/UI2测试文件不变，独立web53、UI2、UI/web/test类型及web生产构建均通过。明确specification compliance及code quality通过、r1 G5释放**EXCEPTION (user-approved MODEL01)**；真实browser/CLI/Vite外域Host及组合G6仍未验。四非阻塞项：focus/online事件测试没有真实切换Query管理器；未设retryOnMount会在错误无数据查询重新挂载时请求；主导航丢合法source/month/stage；教学开启未正向断言；另需G6核403/409实际messageKey。前三行为/测试问题选择现在修正，保持原断言并新增用例，r2仍须同一独立审查，不把r1通过带到已变代码。无害generation计数器在离开后重置仅多一次context读取，保留，不扩大重构。

同一独立评审随后实际核r2全部八摘要，确认恰App/Reports/报告测试三文件变化，其余五文件、共享16和D不变；独立58web（28报告+原30）、UI2、web/test类型及生产构建通过，旧测试仍无差异。逐项关闭：retryOnMount:false加按source/month的Trial key阻止同组件换月后默认重试、stage不入key；主导航保留非末期间/阶段及显式错误参数；focus/online manager实际状态转换并恢复；教学开/关均有正向断言。**r2 specification compliance及code quality均通过，T13 G5 EXCEPTION (user-approved MODEL01)释放**；用户重试在离开时取消后回到先前错误、需再手工重试符合设计，不增隐式请求。真实UI/390px、实际API及403/409标签、Vite外域Host、安全与组合G6仍不由本门禁代替。

真实浏览器随后观察到Vite默认对许可loopback Origin添加CORS头，违反D-AM03-LOCAL的无跨域响应约束。父作者在现有root边界测试加入真实临时Vite listener，实际RED反射头，再仅加`server.cors:false`；八边界GREEN。r3九摘要为原八文件加根测试，原七个其他前端文件/共享16/详细D均不变；同一独立评审全部重核，独立58web、UI2、8边界、类型/build通过，另做默认/修订的实际GET、代理死目标及OPTIONS对照，均验证头移除。**r3 specification compliance及code quality通过，G5 EXCEPTION (user-approved MODEL01)**；非阻塞建议为回归增加代理/OPTIONS覆盖，由当前授权决策保留：真实GET回归覆盖全局中间件，父实际proxy与独立探针均已补实证，不为此扩大测试服务夹具。不是G6、安全或发布批准。

### ARCH-T12-G5：r3当前已独立释放MODEL01

实现者模型身份未独立报告，沿父模型计划及MODEL01；作者报告先观察真实context404、launcher不存在与坏财务路径头/DTO不符的RED，再实现六文件。实际API build/严格类型、launcher语法及旧health11与新增真实listener/CLI合计27项通过、零skip，夹具清理。Windows子进程退出不冒充graceful callback证明，另有组合root真实close次序/失败测试。新六摘要冻结且T11/详细D未变，独立高风险评审请求claude-opus-5.5正在审，尚无当前specification/quality结论；未把根入口尚未接入说成已发布。

首审独立27项、类型/build、原始socket路径别名与重复信号探针通过并释放MODEL01。父选择补真实async onSend下early return、隔离runtime注入的重复信号仅一次关闭及API→reader次序、成功无exitCode和失败安全CloseError/exitCode1自动化；r2六摘要及恰四文件变化由同评审重核，独立30项/类型/build通过，规范/质量G5释放。首个完整`npm run verify`随后实际失败API25通过/5失败：CLI测试按cwd定位scripts，npm workspace运行目录不同导致MODULE_NOT_FOUND，失败日志保留。

r3父作者gpt-6.1-sol仅将该测试定位改为`fileURLToPath(new URL(...,import.meta.url))`，无生产变化；同一独立评审重核六摘要、共享16和详细D，独立实际workspace30/根CLI9均零失败/跳过，**specification compliance和code quality均通过、G5 EXCEPTION (user-approved MODEL01)**。r2原文件未完整留存，评审未虚称能逐字diff该未跟踪文件的旧版，但核当前完整断言且计数不变。非阻塞建议保留：HTTP测试的故意missing-web路径也依赖cwd，但两目录均不存在、不改变所测行为，未扩大修订。

随后r3组合G6的非阻塞N1指出概览“不能查看任何账簿”与已联通的只读快照矛盾。父选择即时修正，r4只改中英四个现有label：intro/unconfigured/dataWarning/teachingNote，明确目标业务账套尚未配置、显式已验证快照仍可读、无财务写入或AI。其他八文件、共享16和详细D未变；同一独立评审实际核九摘要及唯一差异，独立UI2/web58，并重算父完整源481日志，规范/质量均通过，**r4 G5 EXCEPTION (user-approved MODEL01)**。组件测试按key取文案，不冒称其验证文字含义；实际新概览文字由独立人工审查及随后真实浏览器精确断言核验。

### ARCH-M03-COMBINATION-01：r4 G6已释放，交付待完成

同一独立评审随后实际重核当前79份源/公共摘要及规范化、68代码摘要、r4冻结和仅label变化；确认最新公共树仅状态文档更新，实际执行的是同代码的前一树。重算源481/公共361/公共真实70日志、清理及恢复生效配置，实际查看中英新概览截图，N1/N2关闭；**当前r4 specification compliance和code quality均释放G6 EXCEPTION (user-approved MODEL01)**。纠正旧报告将182项公共测试数误写为文件数：HEAD127、其中清单内64/外63、清单新增15，公共树142文件；当前临时index实际全142 blob/40修改/330公共依赖URL核验通过，不把heuristic泄漏检查当独立安全审查。实际交付、安全及发布仍未完成。

独立组合评审实际核r3的79份源/公共摘要、三个增量冻结、详细D、源481/公共361/双方真实70日志，另独立真实API19项及Host/Origin/路径/查询/分页探针通过；规范与质量G6均释放**EXCEPTION (user-approved MODEL01)**。Edge/全量/PG仍为作者执行，未冒称reviewer重跑。N1概览文案选择现在关闭，故此批准不直接覆盖r4；N2安装证据需记录argv与生效配置，新的公共恢复日志已补；N3交付逐文件hash/锁可在后项冲突时留下前项安全更新，明确接受该非阻塞局限，不称整批原子性。

r4重新导出公共树、实际禁生命周期/严格公共锁离线恢复，日志包含精确argv及四项生效配置；源完整481、公共361/build/types及公共真实SQLite/PG18强制70、零失败/取消/跳过全部通过并清理。新source代码摘要cd763f59938720a2b25d0de782e353b2b0943ed06df000a881f65a4ea2a8edb6，公共摘要8d04d289f931384ca161228c41fdb6c0bc8843c4508d78789b3f19b9a7f347b4；代码相对r3仅labels变化，详细D未改。

重建后的真实Edge全场景再次通过并清理，新增中英概览文字和零财务查询精确断言及两张概览截图，共六图。新profile单样本load122.4ms/FCP280ms、health-ready观测344.3ms、首次试算ready观测94.4ms；旧静态样本仅为r3历史。一次误用私有脚本参数的失败发生在启动任何helper前，原日志保留，随后按真实位置参数执行，不改产品或降断言。r4独立组合窄复核、本地、安全、main/精确新clone仍待完成；下段旧摘要及“待G6”均为过程时序。

完整源第二轮480（302+7+15+6+60+2+30+58）/build/types及真实SQLite/PG18强制70、零失败/取消/跳过通过；最后Vite修订后完整源尚在重跑，期望481不是已通过事实。M03相对已发布M02的原测试身份未删，保留贸易仍未公开。真实Edge最终四图覆盖三试算逐分/原始名称、104行两页完整总账、双击单次请求、实际403 label及409明确重载到不同SHA最后期间、历史调整/冲销/结转/维度/停用、偏好持久及无额外查询、键盘/390px、Vite无Origin200/外域Host403/显式Origin拒绝后许可且无CORS；源/快照/原两库及29保护文件字节不变。操作使用真实`runPreview`参数/配置/API/reader组合根，隔离runtime注入是进程内调用，不冒称OS CLI子进程；实际OS子进程由完整自动套件独立覆盖。

验收失败均留存：前六轮私有脚本的oracle嵌套、HTML错误注入、保留ledger路由、中文按钮定位及ANSI就绪读取等错误，修正后不改产品断言；其中一次同端口重启后Node fetch出现ECONNRESET，确切底层原因未证明，单次新TCP就绪探针无复用且无重试，不声称修复生产网络栈。第七轮真实Vite CORS缺口按上述RED→GREEN及独立G5关闭，第八轮全部真实验收及清理通过，失败不由重跑抹除。

Local单人预算：同一Node26/Windows x64、16逻辑CPU、约64GiB主机；5预热+100试算及100完整104行两页总账，HTTP/JSON/严格schema计时，p95/p99为3.664/4.385ms与7.966/8.228ms、0错误，满足1秒目标。首次静态UI尚未单独计时；不是SLA、生产/多人/认证/PostgreSQL容量或M08耐久结论。当前完整源/公共候选回归、独立当前G6、本地同步、安全/main/精确新clone仍待实际完成，不把增量G5合并当G6。

后续当前修订全源实际481（302+8+15+6+60+2+30+58）、build/types及真实70均零失败/取消/跳过；最终真实Edge同代码全部场景再次通过并清理。静态UI另以全新浏览器profile单次测得导航load135.7ms、DOMContentLoaded135.5ms、FCP268ms，health-ready观测338.9ms、首次试算ready观测78.9ms；观测含CDP轮询，不混入后端热读样本。详细设计全文8709809b…33560、共享16和T12r3/T13r3冻结代码均不变；这覆盖前段“重跑/静态计时尚待”的过程状态。公共候选/G6/交付/安全/发布仍未实际完成。

公共候选随后实际从HEAD3d7e1f0导出，叠加79白名单payload；只将源package中的三条未发布trade检查去掉，其他选中文本仅UTF-8 CRLF→LF，全部工作区原字节不变。代码清单source摘要bf126614416f76fff7c2e635c5b8f6adfedf823a8ca5752f84979165eea9fc93，公共摘要3fee14431147b3358a871f5d7691a8f09b67d9fe1c10952ee8292a82467abb21；未选入的暂停贸易仍为HEAD公共原版。该独立树实际严格公共锁/禁止registry替换/禁生命周期/离线恢复成功，完整361（182+8+15+6+60+2+30+58）及build/types、真实双库70零失败/取消/跳过通过，自有PG清理。不是匿名公共网络亲验，亦不是独立G6。8FR/14TC、10入口85相对链接、无环M03 DAG及当前三份冻结代码均核；当前规范/质量组合G6尚待独立结论。

### ARCH-M03-SECURITY-01：独立审查无已确认漏洞（发布前记录）

独立security-review请求claude-opus-5.5，MODEL01仍仅涉及身份。评审读取精确公共树而非含暂停贸易的脏工作区，实际核142文件/40差异及全部330锁定公共包源；完整阅读新API、CLI、严格schema、查询、旧桥和配置，前端App/Reports仅风险模式检索，不冒称逐行全审。另在已执行同代码树用虚构reader/临时端口做真实raw-socket Host/Origin/Fetch Metadata/重复头/路径/查询/方法探针，拒绝结果符合Local威胁模型，临时脚本清理。没有碰原4173、ID3、真实账或.env；**本轮范围无已确认可利用漏洞**，不是完整ERP认证。

| # | Severity | File | Lines | Vulnerability | Confidence |
|---|----------|------|-------|---------------|------------|
| — | — | — | — | 无已确认漏洞 | — |

未做在线依赖公告查询、匿名公网安装/TLS亲验、全回归或浏览器重跑；后三类验收由作者证据分别记录，不能冒称安全评审亲跑。旧152项SHA1、无敏感字段的health/static未做Host门禁，以及dev代理依赖Vite默认allowedHosts均为明确范围内的非漏洞加固建议，不制造LOW项。原始TCP重置原因未知；预算仅为样本。实际本地保护交付25更新/15新增/39相同/0冲突，随后独立恢复/native int64/rollback、完整361/build/types和79交付hash复核通过，Git配置未变、本地原无data目录且仍无；原工作区两库另按迁移前物理hash精确核对不变。尚未stage/commit/push/新clone，T14不done。

### ARCH-M03-RELEASE-01：代码已发布，精确新clone验证通过

公共代码`a608ee1d898821900052b66e645f0041f9d22d6b`已从3d7e1f0非强制快进main；真实Git index全142 blob/40修改/330公共依赖URL核验通过且提交tree精确等于批准index，未发布暂停贸易或三条专属检查。新GitHub clone实际选择精确a608ee1、严格公共锁离线禁lifecycle恢复（argv与四项配置留证）、native int64/rollback、完整361/真实SQLite及PG18强制70/build/types、零失败/取消/跳过通过，临时clone/自有PG/集群/密码已清理。匿名公网安装与在线公告未亲验，不以缓存代替。M03限定功能和TC已验收；状态文档单独发布/复核，最终提交以实际报告为准，不预写未发生的clone结论。

## ARCH-M00-DESIGN-01：实施授权后的保护基线G2

用户已委托DC01..04决策/执行、恢复贸易与备份核验后切换原账。作者gpt-6.1-sol；FR-AM00/D-AM00/TC-AM00-01..04见architecture-migration。原候选执行前完整292/292及14语法通过，不复用这些作为新工具通过。独立G3请求claude-opus-5.5，MODEL01仍只涉及身份。当前尚未独立审查，不写新工具/测试；不因本轮授权冒称宏观提案已实现或所有阶段G3已释放。

随后独立G3实际读取M00全文及原公开核心接口，先释放MODEL01但要求两项Medium在测试前明确：canonical算法/源与快照双核、manifest完整发布与消费者复核。作者修订后同评审实际关闭，两项无豁免，requirements/design/test均释放**EXCEPTION (user-approved MODEL01)**；所核architecture-migration全文SHA256为5f00e9d52c21adf6506117d7c9576278c91a7f355eab66ea7e8788cd52b927e9（只评M00，不评其后M01草案）。按其非阻塞建议将固定虚构SHA明确加入TC-AM00-01。原只读身份核已确认原canonical及3凭证/ID3 draft、两库前后物理摘要一致；具体财务/路径/hash留私有session。现在仅释放M00工具/测试实施，M01仍待自己的G3。

### ARCH-M00-INCREMENT/FINAL-01：G5/G6已释放MODEL01

先新增测试并实际ERR_MODULE_NOT_FOUND，再实现工具。首实现6/8仅两项Windows夹具清理顺序错误，关连接再清理后8/8；后依独立评审修正精确bigint文件ID、最终复核失败及pending名字删除失败均撤销成功manifest，新增两例，当前聚焦10/10、完整候选302/302（0跳过）及14旧运行语法+新工具语法通过。既有未提交贸易代码未作为本工具改动或混入发布。

独立评审实际运行聚焦10/10及语法，先前另从公开3fbd75f导出、仅加入两新文件，15/15（当时8新+7备份）通过，独立虚构hard-link/大小写别名及WAL主/WAL/SHM不变探针通过。specification compliance、code quality、组合G6均**EXCEPTION (user-approved MODEL01)**；具体备注均修复并实际复核，不以身份例外豁免。当前脚本/测试SHA256分别32891c3257c41af169f4156e961731d6b2efbeec6acb73505054a1932feb6c64、b89dc892c72b72adafbcf777b6d779b9ae05d5f8cccfdde1fedd0dd6040f6f40。独立未重复完整302及未打开真实账，不伪称其亲自执行。

作者对实际原账以只读源生成私有双快照，源与快照schema/全表/ERP完整性和旧canonical一致，原3凭证/ID3 draft保留、前后两个源物理摘要不变；冻结执行前52文件及300测试清单，之后新增两故障用例另列，不覆盖最初冻结证据。4173原本未监听，本轮未启动或切换。两源分别一致、不宣称跨库同时快照；真实最终切换仍须M09停写/重新核对。本地哈希保护交付、安全审查、精确main发布和干净clone以随后实际报告为准，不能把G6当发布已做。

随后已完成M00本地16文件哈希保护交付（7更新/9新增/0冲突），不复制环境/依赖/数据库/Git；交付副本工具10/10通过。另行独立security-review完整读取两新代码文件、扫描本轮公开文档，实际10/10通过，未发现达到门槛的漏洞；仅可信本机操作员/私有备份目录威胁模型，不承诺抵御目录同权限写者。公开发布白名单严格排除旧未验收贸易src/public/package与贸易测试；main干净clone应为已发布172+新10=182项，而不是把未发布候选302项冒称远端功能。

## ARCH-M01-DESIGN-01：独立G3已释放MODEL01，实施待M00

独立首轮发现五项实质缺陷：默认node测试发现新TS/dist、SPA跨源未定、无消费者scope DTO、配置host/port不具体、框架错误绕契约；另说明Kysely实际安装时机及label边界。作者修订后原独立评审逐项关闭，requirements/design/test均PASS，G3为**EXCEPTION (user-approved MODEL01)**；仅释放FR-AM01/D-AM01/TC-AM01-01..05，所核M01完整章节UTF-8 SHA256为1eb52614fffd0f0345bc201ee65b9789bc126f6b231f63d2d2fdb160a1606169。M00部分后续变动不等于M01重新获新内容批准。

按评审非阻塞说明，在实施任务明确坏JSON/415路径仅用测试工厂注入路由，生产/CLI不装载额外POST接口；500也仅注入测试port。M01仍依M00 G5/G6，其骨架不代表真实双库/身份/业务页已完成。公共npm端点在当前环境TLS握手失败，现有已配置registry的证书验证连接可用；不关闭TLS验证、不把宿主私有端点/配置/凭据写入公开锁文件。

### ARCH-M01-INCREMENT-01：首轮G5，T01/T03因具体缺陷阻塞

共享契约/边界先确认缺模块失败再实现；TS7编译通过但不提供旧compiler API，实际采用已声明Babel AST解析TypeScript/JSX/legacy decorators，不用文本正则冒充语法树。作者完整原候选302/302，逐项测试名称/数量与M00冻结清单相等；拓扑build、严格typecheck及首版workspace46项/边界4项通过。独立评审请求claude-opus-5.5，实际身份不能自核则保留MODEL01，不豁免以下三项Medium。

T01：scanner漏.mts/.cts/JS等源码，且从其他cwd运行可空扫0文件仍通过；独立原探针实际重现。T03：shell.teaching/shell.loading与旧label同key异文案且缺旧资源交叉断言；成功保存偏好后不清storageWrite，恢复后仍显示“未保存/未改变”的错误。首轮T01/T03 G5 BLOCKED；T02 spec/quality独立通过并释放MODEL01，实际application1/infra2/API11、占用端口/IPv6/静态SPA/编码路径/统一错误探针通过，无服务遗留。该评审不是安全审查或最终G6。

作者随后为T01增加新扩展、缺失/空src及异cwd回归，先实际重现0文件假通过；改为按工具自身定位根目录、缺失/空项目拒绝、扫描全部JS/TS扩展，7/7及真实12源边界通过。前端作者先重现2个label和3个恢复断言失败，再更名新壳key、加入真实旧label交叉测试、成功保存仅清storageWrite；UI2/web30、类型/build通过。上述为作者修订，尚不能当作独立复审关闭。真实Edge同源桌面/390px初版已验偏好、网络故障重试和损坏/拒写存储，最终修订仍须重跑及组合G6。

### ARCH-M01-FINAL-01：修订G5及组合/公共变体G6已释放MODEL01

同一独立评审实际逐项关闭上述三项Medium，T01/T02/T03各specification compliance及code quality均PASS，G5按**EXCEPTION (user-approved MODEL01)**释放。独立重跑完整`npm run verify`，实际302旧测试+7边界+49 workspace=358项，零跳过，所有拓扑build/typecheck通过；另从临时cwd确认仍扫12文件，真实.d.mts/.jsx/.cts跨层及junction/空缺src探针正确拒绝，删除独立夹具、无遗留服务。集成作者实际gpt-6.1-sol；两个实现代理的实际模型ID未独立核实，不虚称模型组合。评审请求claude-opus-5.5，实际身份仍不可自核，MODEL01仅涉及身份。

组合G6的specification compliance及code quality均PASS并按MODEL01释放。工作区46个代码/配置文件原始字节清单摘要为cae97ae64d1c7de977da16da0de00feb4e88a7156c94744dc9f7d20730b402ab（PowerShell默认文化排序，LF分隔小写SHA与相对路径）；同一清单按ordinal字节序摘要为1a7a1b76fd5c227c7f2683942b7da6e38d899398f230de415dc353c4ad915e7c。Git换行规范化可能产生不同blob摘要，不把它当代码变化或略过逐字比对。原已批准M01设计章节1eb52614…6169未改。

作者最终真实Edge/CDP使用隔离同源仅health壳，验1280/390px、默认中红/教学关闭、英绿/教学打开、重载持久、切换不重取health/不重建main；网络阻断显错并显式重试恢复、损坏偏好回默认并警示、拒写保旧值、存储恢复后显式保存清过时警示均通过，页面无未捕异常、无其他账务API。截图/浏览器私有profile不进Git，profile已清理。独立评审实际检查安全的浏览器证据及中文红色390px截图，未亲自运行Edge；不冒称其独立执行UI或旧302身份比对。

另从已发布74819f9导出公共基线，叠加精确50文件，保留未提交贸易于工作区；公共package仅移除三条未发布贸易文件语法检查，其余行为完全一致。作者在该真实公共候选`npm ci`及完整verify为182+7+49=238项，零跳过。独立窄复审核45代码文件逐字相同，package只上述一行差异（公共原始SHA256 16959c4f4d03a11aba540314c0761355d07f965abf4af38fe9ebe011e27be705），原公共代码除此及四份进度文档不变；实际运行候选check及针对公共旧label的UI2/2，公共变体G6 spec/quality同样释放MODEL01。它未重复候选安装/238全套，也未打开真实账。发布前补准确状态文档；保护本地同步/独立安全/main/新clone仍须实际完成后另记，代码G6不等于已发布。

### ARCH-M01-DELIVERY/SECURITY-01：本地及独立安全已完成，发布待核

随后50文件按最新M00及原M-CORE的逐文件目标哈希安全同步，43新建/7匹配更新/0冲突；公共package变体与工作区保留贸易版本明确区分，不把后者复制到缺贸易文件的本地副本。不复制Git、环境、账套或node_modules；交付副本按已变更manifest独立恢复依赖，实际完整verify238项、零跳过及build/typecheck通过。29个冻结的原运行/测试/贸易文件逐字未变，已发布M00工具也未变；自建4188验收helper已停，未切换4173。

另行独立security-review核50个候选SHA、源码、实际随机loopback监听器，探测静态路径编码/遍历、隐藏文件、方法/查询、跨域、测试工厂与安全错误、React/偏好及锁文件来源/完整性，未发现已确认漏洞。模型请求claude-opus-5.5、实际不能自核仍保留MODEL01；该安全结论不替代G5/G6。其live探针用已构建候选dist，未亲自重构建，未读真实账/环境/备份，无遗留helper。

npm audit初次遭配置registry HTTP429（实际地址不公开）；独立补充用正常TLS向官方OSV querybatch仅发送306个公开npm名称/版本，不发送工作区包名、源代码、内部端点、账号、路径或凭据。首请求HTTP200、306结果无公告且无截断，故已知漏洞库查询缺口已补齐；只覆盖检查时OSV已知公告及锁定版本，不保证未知/未报告漏洞或已安装文件没有篡改。真实main发布和新clone验证仍以随后实际记录为准。

### ARCH-M01-PUBLISH-01：实际main发布及干净clone完成

精确50文件按已审公共候选选入提交，逐项核Git换行规范化及五类公开泄露规则，排除全部未提交贸易和工作区package中的三条贸易语法检查。代码以`1574db67eacdcc1b6c06cb5ca3f6f754dfedb47d`非强制快进main，实查远端分支等于该提交；带规定Co-authored-by，不开PR，不改独立本地副本Git配置。

随后从GitHub main全新clone并确认该SHA，实际`npm ci --no-audit --no-fund`和`npm run verify`通过：182旧测试、7边界、49 workspace（1应用+3契约+2基础设施+2 UI+11 API+30 web），总238、零失败/跳过、全部build/typecheck通过。未含未验贸易；该证据不是仅导出工作区或复用发布前候选。专属临时clone已删除，安装与验证日志留私有宿主，不进入Git。四份入口/进度文档随后仅回填这些已发生事实，不改变已审代码/契约/设计；M01/T04完成仍保留MODEL01，不将真实双库/身份/业务或44FG标完成。

## ARCH-M02-DESIGN-01：详细G2待独立审查

作者实际gpt-6.1-sol，双库驱动/UoW、作用域锁、DDL及精度为高风险。M01代码和最终状态提交均已实际干净clone验证后，新增FR-AM02-01..07、D-AM02/LEGACY/RUNTIME、TC-AM02-01..14；范围限基础仓储、真实双库共同契约、显式迁移和旧教学只读桥，不宣称GL/审批/身份已完成。版本元数据与可移植PG来源链由独立只读研究辅助，但没有安装或运行，不作为G3或实现证据。独立评审请求claude-opus-5.5，身份未核实时沿MODEL01，不豁免具体缺陷。当前G3未释放，M02不拆实施任务或改运行代码。

独立首轮实际核六份冻结摘要、HEAD/main及新章节完整差异，并读宏观架构、M00消费者、原Book报表/总账与现ports；G3 BLOCKED，两项实质阻塞为scope层级与company回执的arity冲突、共用SQLite读连接跨await并发快照不明。另八项可操作澄清涵盖超时/同步BUSY、逐行锁顺序、TRUNCATE/父FK/owner边界、自定义迁移偏差、旧快照TOCTOU/游标、WAL快照header、并发provision和native模块回退门禁。MODEL01不豁免这些问题。

作者已修订分级scope/company专属业务证据、独立串行读mutex/嵌套拒绝及对应TC；其余八项均写明机制/失败与用例，并同步宏观§6及ADR的迁移runner偏差。仅为解决G2不确定性做隔离原生VACUUM可行性探针，当前Node/Windows下DELETE与WAL源经readOnly VACUUM INTO均产生[1,1]非WAL目标、提交值保留，夹具已清；不是M02桥或TC运行证据。当前仍待独立复审，不把作者修订当问题已关闭。

宿主随后实际拒绝向同步评审追加消息（write_agent只支持background），因此本次修订将由新的窄范围独立评审核原B1/B2及N1..N8，不冒称原评审已读修订。另明确Promise边界：运行时拒提交时仍在途操作/已发生失败，不虚称能检测已settled Promise有没有被await；业务callback仍必须await/return全部操作。

新窄评审实际核revision2八份摘要，原B1/B2与N1..N8逐项关闭，requirements/design/test三项充分性通过、G3释放EXCEPTION (user-approved MODEL01)。它只检查原生探针及JSON、没有亲跑探针/安装或访问原账。另提六项非阻塞澄清：native包真实分发/完整性、read队列预算、迁移预算、PG事务超时FATAL、换行/BOM校验、provision隔离级别；作者决定纳入而非隐藏延期，故实施仍等新窄复核。

作者补所有read/write队列1秒/64等待者及read预算、独立迁移预算、FATAL销毁/不重试、CRLF规范与BOM/孤CR拒绝、READ COMMITTED provision及对应TC。原native评审沿旧包V8/prebuild-install记忆；作者新查实际13.0.3元数据及npm pack --dry-run --ignore-scripts清单，含node-addon-api依赖和随包win32-x64.node（受包SRI覆盖），默认安装仍会node-gyp rebuild（后续实测确认是binding.gyp触发npm隐式install，并非包的显式脚本），因此明确支持恢复命令使用--ignore-scripts并实核加载二进制指纹/Node ABI，不能声称已安装或可编译回退。版本可用性及官方PG18.7/已发布摘要文件仅元数据查询，不是驱动执行。此revision3澄清待独立窄复核，不冒称原评审事实推断正确或当前已完成M02。

同一窄评审随后实核revision3八份摘要（仅阶段设计/本文变，其余六文件逐字相同），新增六项及候选元数据全部关闭，未发现修订新实质问题。它实际读取当前13.0.3包清单，明确撤回原旧版V8/prebuild-install及二进制不受包SRI覆盖的错误推断；以当前包原始证据为准，仍不宣称原生模块已经加载。requirements completeness、design quality、test completeness均通过，**G3为EXCEPTION (user-approved MODEL01)**，仅释放FR-AM02-01..07/D-AM02/TC-AM02-01..14实施与任务拆解。

其核阶段设计SHA256为bd2889a2a9be447b8b6d3198b4c02421b1f360d6b07ae12317f41fe04fcd2154、本文41a95a8767543b11ace111ebd9032efab48cd48838b6865c63275ed1e8093b3e；其余八文件完整清单及原生探针留私有。这里只回填G3元数据，不改已核设计内容。非阻塞测试执行说明：TC03中R1正常互锁场景必须用显式barrier控制在排队预算内，hung-reader场景单独验证busy/取消，不能靠机器速度碰巧过线。评审未安装/构建/运行DB或访问原账，后续G5/G6及真实双库/发布门禁全部仍须执行。

### ARCH-T05-PORTS-01 — 共享存储接口/纯边界G5

作者gpt-6.1-sol；独立rubber-duck请求claude-opus-5.5、实际身份不可自核沿MODEL01。首版所核三文件SHA为storage183fe514…/index067771ef…/test6e137514…，评审实际运行10项及额外边界探针，specification compliance与code quality均接受、无阻塞，可按MODEL01释放；它明确未重跑编译与boundary，作者另有真实workspace58项/构建/全类型及boundary证据。此非security-review，也非DB验收。

作者在下游启动前选择收紧其非阻塞建议：RevisionReader/Writer按session层级泛型化（不代替运行时完整scope membership）；统一parseAuditQuery的0..safe游标/显式1..100上限；对象字段从descriptor快照读取，拒accessor而不触发Proxy property get。任意host Proxy的反射trap仍可执行，输入来自可信应用装配，不宣称JS sandbox。新增三个负向类型断言先实测unused directive失败、缺query parser先实测缺export失败，然后新12项app测试、build/type/负向类型和boundary实际通过；六文件revision2冻结后正独立窄复核，**当前新增修订尚未释放G5，不启动依赖任务**。回执JSON保持canonical TEXT而非jsonb；write callback保留判别union让消费者显式核level，不为仅语法便利增加overload。领域目录仍未创建，只在T08实际投影消费时提取。

随后独立窄复核实际核六摘要（storage a5118b98…/index067771ef…/testc48c43b1…/package9e54f5dc…/testConfiga42e658d…/typeFixture39a761b9…），12项另实跑及额外边界探针通过，三建议均关闭，无新阻塞、不需回G3，specification compliance及code quality再次明确接受。**当前revision2 G5释放EXCEPTION (user-approved MODEL01)，T05 done，释放T06/07/08。** 作者另实跑全部workspace60项（12+3+2+2+11+30）/build/全typecheck含负向fixture通过。方法参数bivariance可能被显式宽化、同层跨ID也无编译授权，所以T06/07必须实测exact plan membership及禁止共享父锁写入；T05不声称类型即运行时隔离。Book writer本轮只需自身技术revision，下级company行为待真实后续消费者设计，不提前扩权。

### ARCH-T09-RUNTIME-01 — 隔离PostgreSQL预检

实现为general-purpose子代理（宿主未返回实际模型ID），独立于该实现的主集成者gpt-6.1-sol审其两份私有脚本及实际证据，specification compliance与code quality接受，身份差异无法自核保留MODEL01。官方18.7 ZIP实际389515503字节、发布者HTTPS SHA256匹配ead0bbc…；四个PE实际Authenticode Valid/EnterpriseDB并记录SHA，不能把同源checksum称独立签名。真正server_version_num180007、loopback-only/SCRAM/错密码拒绝及正常停自有PID已运行；独立重核四文件SHA与零私有PG进程。虚构集群/密码/ZIP已删，保留私有binary，不装系统服务/账户或改全局环境。

复用helper只在callback暴露进程级PG*，finally恢复；父调用显式URI编码并以finally管理ERP_TEST_DATABASE_URL、错误只报安全分类，不把密码/连接串写入日志。T09 G5仅释放运行时，不能算T07仓储/事务/迁移通过。Windows启动pipe与inet地址格式两次失败均在证据中保留并正确清理，不删失败记录冒充首跑成功。

依赖真实恢复时npm给13个新依赖记录SHA1（其中native与G3已核npm-pack SHA512不同算法），前置guard按预期拒绝执行。作者另取实际tarball、同时核原SHA1及计算SHA512，native与原已核强摘要完全相同；逐个比对13包全部已安装regular文件（native68个）后仅将对应lock.integrity升级SHA512。所有版本/依赖不变、URL仍标准npm地址，无lifecycle/编译回退。OneDrive云文件ReparsePoint与真正SymbolicLink/Junction分开，内容摘要检查未放宽。随后真native加载、int64两极值与磁盘事务rollback通过，专属夹具与13个明确命名临时包已清理；本段只是可用性/供应链证据，不是完整target UoW验收。

### ARCH-T08-LEGACY-01 — 实现、修订与G5闭环

旧账桥/domain由独立实现子代理交付（模型ID宿主未返回），CLI/共享集成由gpt-6.1-sol完成；当前11桥/纯domain及3个真实child-process CLI测试、严格独立编译通过，尚待独立spec/quality G5，不标T08完成。CLI先缺入口RED→3 GREEN，新增verifier消费用例用注入写负控制实证失败再恢复11 GREEN。代码只针对虚构fixture；实际未知ID3未访问。基础设施用显式subpath，不令M01未接账health根入口因import打开数据库。

准确的物理保护范围：初次未pin的虚构WAL源在M00创建/验证阶段SHM读标记发生变化，main/WAL不变；修订夹具只证明先pin源read版本的创建情况，不冒称一般WAL读天然零写。另在创建完成之后、消费者之前捕获完整目录，重新verify及bridge close后各自核源main/WAL/SHM和snapshot字节/名字不变；负控制可抓写入。此限制须纳入后续M08真实备份设计，不默改M00或隐瞒首次失败。下一步独立评审实际冻结旧桥/CLI及调用边界，target存储仍另作者进行。

首轮独立评审实际核15hash、14项复跑，另在移除未发布贸易的独立副本同14项通过；spec/quality通过，但发现畸形WAL header配套改manifest时CLI先M00 verifier会建sidecar后才拒绝。虽非阻塞，作者仍修复：旧桥共享导出纯文件系统`preflightLegacySnapshotPair`，固定teaching.sqlite/erp.sqlite而非取不可信manifest路径，CLI先检查再verify；保留bridge持SHARED后摘要/身份/头复核。真实CLI两种文件各RED（原3通过/新增2失败）→GREEN；domain存储坏数据改INVALID_SNAPSHOT，OVERFLOW及真实参数错误不变；成功JSON延至close之后。

revision2独立窄审实际重核15hash、18/18（13桥/domain+5真实CLI）及原探针，再次明确spec/quality PASS，无新发现，T08 G5释放MODEL01。root新增目标管理CLI/强制数据库命令的实际实现不在该G5范围，须组合审查；infra lock/依赖、domain与T07必须同一个白名单M02候选发布，不能单独提交本项造成npm ci不一致。

### ARCH-T06/T07-G5-01 — 首轮通过、加固待复核

独立rubber-duck请求claude-opus-5.5（MODEL01保留）实际核19hash，SQLite27项复跑两次、队列/BEGIN异步退避及路径探针；真实PG30项为作者日志、reviewer未自行运行，不冒称双方PG复跑。parent另用官方隔离PG18.7真实运行30项，首次inet地址/32表示断言失败已以host()修正、保留失败日志；接parent目标CLI后`verify:databases`58项（SQLite27+PG31）通过，所有私有集群/凭据/自有PID已清理。

首轮spec/quality均PASS、不需回G3，三个非阻塞N1..3仍选择修复：归一化后的UNC/device路径保护、pg_catalog优先防public阴影、完整结构漂移检测而非仅对象名。另补持久坏JSON/日期、hung write回滚、真实core FATAL连接销毁及COMMIT返回ROLLBACK；已请求原作者处理、不得把首次PASS冒充修订已验收。checksum缓存优化不为性能提前引入，0byte且无标记未知文件仍拒绝而不冒认归属。T06/07保持in_progress，修订后实际两库及窄审/G6未完成。

加固首轮Local31项通过；真实强制矩阵68项首次65通过/3失败（两种实际失败加外层汇总），0跳过。结构漂移/坏存储/挂起写入回滚均通过；剩余为PG name[]返回表示断言，以及真实core FATAL超时被误归STORAGE_FAILURE。交原作者修复，不降低预期或抹去失败。新SQL尚未发布，仅用全新虚构目标，不对已有账套迁移。官方OSV另实际查询324个公开依赖版本，0公告匹配；这不是代码安全审查或未知漏洞保证。

revision3修正catalog数组的text[]表示、真实25P04跨闭包保留和查询协议drain；FATAL夹具先停当前计时器再重置1秒，断言移出生产错误脱敏边界，不把断言失败伪装成存储故障。父实际68/68、零跳过及无原并发query弃用警告。随后发现同样计时问题也适用于真实BEGIN继承非零数据库默认值：revision4在业务/迁移BEGIN后先停已有事务timer再设置10/120秒，并补真实继承1秒默认、迁移/读/写跨1秒仍健康的用例，未降低原FATAL断言。父完整`npm run verify`实际421项（旧302+边界7+workspace112）、构建/严格类型通过，强制双库实际69/69（SQLite31+PG37+PG生命周期CLI1），零失败/跳过；自有PG正常停止、集群/凭据清理。当前20文件冻结并交原独立评审窄G5，未用作者成绩代替审查关闭。

父另实际用独立health-only同源壳验证1280/390px、中红/英绿、教学开关、三偏好重载/不重建main及不重取health、网络显错重试、坏偏好/拒写及恢复显式保存；无其他财务API或未捕页面异常，自有helper/浏览器profile已清。14节点被动存储SVG已真实浏览器检查；不是新财务页面截图。独立虚构100次公司UoW（CAS+receipt+audit）实测p95为5.78ms、最慢7.81ms；4000次native操作最慢1.36ms，事件循环最大延迟7.27ms。它是当前机器有界顺序样本、包含driver包装/可能嵌套计时，不是生产容量或SLA，不为达标修改预算。

随后原独立评审实际核20/20摘要、另实跑SQLite31/31及源码/故障用例，原N1..3/T1..4/S1及继承timer缺口全部关闭，不需回G3，specification compliance与code quality均PASS，T06/07修订G5释放**EXCEPTION (user-approved MODEL01)**。PG37与CLI1仍为父真实运行证据，评审没有自启PG。其非阻塞运维意见已写README：指纹与PG主版本有关，本阶段不支持自动跨主版本升级/重签，必须另行备份、恢复副本验收、迁移设计与回退；owner/superuser重写版本表/DDL和event trigger不在防篡改承诺内。查询成本缓存、无归属0byte崩溃文件恢复及跨进程首次初始化友好重试明确延后，当前分别保留即时校验、显式拒绝与失败而不冒认归属。集成作者按已委托技术决策接受这些边界，不增加未审缓存或升级工具。父目标管理CLI、双库命令、根lock/元数据仍须组合G6，不以两切片G5代替它。

### ARCH-M02-FINAL-01 — 公共候选真实验证，组合G6待审

父从已发布69cdb211导出，叠加精确54文件；root package只去除三条已知未发布贸易语法检查，其余JSON深比较相同，贸易运行/测试全部留在活工作区。候选实际`npm ci --ignore-scripts`、随包native加载/int64/rollback、完整verify301项（182旧+7边界+112 workspace）、强制双库69项、build/typecheck通过；不是复用原421成绩。候选与源代码摘要冻结，文档仅按实际结果回填并补主版本升级边界；组合G6尚待独立审查，不声称本地同步、安全或发布已完成。

独立首轮组合G6实际核54/54源/候选摘要、其余73个已跟踪文件与HEAD逐字一致、公共package仅三条语法片段差异；独立候选19项CLI/application、44项SQLite/旧桥、边界7项与check通过，源CLI8项/check通过，缺PG实际非零/零skip及native两极值加载通过，没有重复父完整或真实PG。发现一项阻塞B1：CLI默认TLS未提供adapter必需的CA，始终在连接前INVALID_INPUT，只有显式无TLS能运行；这是向安全方向拒绝的功能缺陷，不冒充已完成security-review。G6为BLOCKED，未交付或发布。父先新增真实child-process SSLRequest/拒绝明文回退回归并实际3通过/新增1失败，再加显式`--ca-file`、PEM/大小校验和与无TLS互斥；当前4项Local CLI GREEN，完整回归、真实PG/TLS及原reviewer窄复核仍须实际完成。

随后修订实际完整工作区422项（302+7+113）、精确公共候选302项（182+7+113），双方各真实强制双库69项、build/typecheck及零跳过通过。另在同一自有PG18上生成仅供隔离验收的临时自签证书，启用TLS并以HBA拒绝所有新明文连接，CLI显式CA的migrate/verify实际成功，错误CA与显式明文均实际STORAGE_FAILURE/零成功输出；专属DB、证书/私钥删除，配置原样恢复后自有PG正常停止，未发布密钥。此证据不等于生产PKI、LAN或OIDC验收。新54文件摘要冻结后仍须原reviewer实际关闭B1，不能仅凭作者GREEN释放G6。

原reviewer随后实际核revision2全部54源/公共摘要、相对首轮恰为两代码及五文档变更，源与候选各4项CLI/候选check通过；另独立单CA/双证书bundle/尾随垃圾/空/超大/目录/坏base64/注释头/SQLite误选CA及仅环境CA探针，均符合显式配置与脱敏，实际关闭B1、无新阻塞或非阻塞发现。其读父真实TLS脚本/日志及完整测试摘要，没有自启PG/重跑完整，也未自称重加113总数。**源与公共变体的specification compliance/code quality G6均释放EXCEPTION (user-approved MODEL01)**；仅建议在README说清PEM不接受注释/subject行，已补。当前G6所核54文件revision2清单与源码摘要留私有，后续仅回填实际交付元数据不改变已审代码；本地同步/独立security-review/非强制main与推送后干净clone仍须真实执行后再记。

### ARCH-M02-DELIVERY/SECURITY-01 — 本地与独立安全完成，发布待核

54文件按M01及更早逐文件目标哈希保护交付，初次39新建/15匹配更新/0冲突；仅进度前置ID修正再1更新/53相同。未复制Git、环境、账套或依赖目录；本地独立`npm ci --ignore-scripts`、真实native int64/rollback和完整302项/build/typecheck通过、零跳过，全部54目标摘要与公共payload相同。11个明确命名作者临时日志已逐个SHA核对后移存私有证据，不进Git。

专门security-review请求claude-opus-5.5、保留MODEL01，实际读已暂存生产核心及补充domain/SQLite DDL/types/exports/lock，初轮和补充均0已确认漏洞。补充实际独立核54源/候选摘要与暂存路径集合、Git规范化后54/54一致；root package只保留已知三条贸易语法片段差异，工作区贸易未发布。另实际扫描完整暂存差异，无私钥、凭据、私有路径或内部registry；没有运行测试、网络/PG/TLS或外部渗透，完整/真实双库/TLS/OSV/安装证据仍来自父，不能冒称安全评审亲跑。可信本机操作员/数据库owner边界保持，不承诺抵御同OS用户或恶意owner、生产PKI/OIDC与容量。

lock对HEAD新增18项均SHA512/标准npm URL，13项中间恢复时的弱SRI升级属于私有过程记录，并非对HEAD又修改13个既有项；152个既有SHA1条目未在本轮改动。安全评审提醒native机制措辞后，父实查安装包无显式install/postinstall、有binding.gyp，明确npm隐式构建风险，继续禁lifecycle；不是宣称依赖本身没有安装行为。代码G6与安全结论不替代真实main和新clone；发布结果随后按实测回填。

### ARCH-M02-PUBLISH-02 — 实际发布、首轮clone失败与有界测试工具修订

代码`430076f4ed35568c896eaa7f0c43e6cb721f1045`已快进main，未强推或发布贸易。首次真实新clone的native/Local302/build/typecheck通过；真实双库69项在hung-read期间收到未处理`ECONNRESET`，43通过/25失败/1取消/0跳过，后续25项并未开始。失败原始脱敏日志保留；原PG服务日志当时随临时集群清理，不能补称已查明首次TCP重置原因。独立诊断的新clone验证同一精确提交，实际302+真实69/零跳过/build/types通过；额外保留脱敏PG服务日志，仅见测试预期的FATAL。两次clone、自有PG进程/集群/密码文件均清理，不能以第二次通过抹掉第一次失败。

原目标作者与原G5独立核查确认仅测试工具的admin/raw `pg.Client`缺少异常监听；生产客户端已有生命周期及pool监听，未证明同类生产缺陷。三份测试文件修订为持续监听、脱敏sticky故障和可靠hung-callback清理，并增加真实idle-disconnect回归；首版独立G5明确spec/quality PASS（MODEL01），实际SQLite31和无服务连接拒绝探针通过，没有自启PG。其非阻塞建议中，真实fixture路径覆盖、等待预算及多重清理错误优先级继续窄修；修订后的真实PG、组合G6、安全与发布后最终clone尚待完成。M02/T10不标完成。

### ARCH-M02-HARNESS-FINAL-01 — 四文件窄修、真实双库与组合G6释放

测试工具三文件增加持续error/end监听、脱敏sticky故障和可靠hung-callback清理；真实断连回归覆盖admin/fixture及实际f.raw、后续query/close均失败、数据库已删除、再次close幂等、5秒等待清timer及多重清理保留首错。原G5独立核当前修订，实际SQLite31/语法及连接拒绝探针通过，spec/quality释放MODEL01。组合G6另找到CLI测试裸pool的同类缺口，第四文件仅复用同一guarded客户端（+7/-6），原三文件逐字未动；G6实际语法、缺PG非跳过和关闭端口脱敏探针后，CLI窄G5/spec/quality通过。基础设施/应用测试再查只剩带监听的构造工厂，无裸Client/Pool；生产源码、SQL、脚本、依赖/lock未改。

最终54路径快照摘要`8d86a25e…62d2d0`保持，源与公共仅根package中三条保留贸易语法片段不同。父实际完整源422/公共302、双方各强制SQLite31+真实PG38+CLI1=70、build/typecheck/零失败取消跳过通过，正常停自有PG并清集群/密码；原G6独立重核54源/候选摘要、四份日志逐项重加及两个证据绑定，明确对源/公共specification compliance和code quality均释放**EXCEPTION (user-approved MODEL01)**，没有冒称亲跑PG或全回归。独立安全评审全读四测试差异并实际核54哈希、其余生产/SQL/lock不变，三文件及第四补充均0已确认漏洞，未运行PG/测试/外部渗透。保护本地重同步8更新/46相同/0冲突，交付副本完整302/build/typecheck通过，不改其Git/环境/账套。进度元数据回填不改已审代码；仍待修订快进main与精确新clone，T10不预标done。

保留三项边界：首次TCP重置原因未知，后续通过不关闭它；断连可能在query拒绝之后被标idle，仅诊断标签、并非此前空闲的证据；管理员连接丢失时持久测试实例可能残留随机夹具库且测试明确失败，父临时集群已完整清理，不当作生产数据恢复能力。独立reviewer接受前述诊断标签延期，MODEL01只豁免模型身份核实，不豁免测试或缺陷。

### ARCH-M02-PUBLISH-FINAL-01 — 精确修订main及发布后clone完成

最终独立安全补核实际确认暂存恰四测试文件+五状态文档，四代码blob与冻结payload、五文档与当前候选在Git换行规范化后相同，全部54/54与index一致；生产源码/SQL/脚本/manifest/lock未改，未发现已确认漏洞或披露问题。它未重跑测试、网络或父的127blob扫描，不冒称执行本地同步；父实际全127 index blob/精确9路径公开泄露模式检查0。

修订以`f9f1bcbce539c13aae80aeddec5dc7d3280d250b`非强制快进main，实核远端一致，无PR/贸易发布。随后从GitHub新建独立临时clone选精确同SHA，实际`npm ci --ignore-scripts`、native int64/rollback、完整302（182旧+边界7+workspace113）、真实SQLite31+PG38+CLI1=70、build/typecheck及零失败/取消/跳过全部通过；自有PG进程/集群/密码文件与临时clone已清理，不改另一独立本地仓库Git配置。54文件本地保护交付的本轮加固8更新46同0冲突、副本完整302通过，其后仅五文档状态保护更新无冲突。T10及M02限定技术验收done（MODEL01）；仍保留首轮失败原证据和未知TCP重置原因，不冒称全部44FG或Server/原账切换完成。后续本条状态回填只改文档，不改变已审与已克隆验证的代码。

## ARCH-SME-DESIGN-01：独立G3已释放MODEL01，待用户确认

用户要求中小企业ERP分层和数据库选项；贸易继续暂停，本轮仅设计。作者实际gpt-6.1-sol，风险为跨库事务/多人隔离/迁移恢复高风险。新增architecture、6项ADR、3张Mermaid源及14节点SVG，AR-01..08和AT-01..11，更新现有入口而不重构运行代码。独立评审实际经宿主task请求claude-opus-5.5、保留MODEL01身份未核实例外；不复用旧贸易门禁。

初次提交时只是作者提案，无本轮独立结论；以下按先阻塞、作者修订、再独立关闭记录。SQLite/PG及新框架未安装或验证，建议容量/RPO/RTO非既有服务承诺；宏观任务仍待用户确认和阶段详细G3。现有32个运行/测试/脚本/manifest冻结核对未改变。公开图只画通用目标结构，不含账务或私有知识库内容。

独立首轮核13份G2摘要、完整架构/ADR/图及新增入口，并只读核当前company-year和transfer_queue。三项requirements completeness/design quality/test completeness均BLOCKED：持久maker/approver流程缺失High；锁模式/幂等绑定/旧待转GL政策/旧教学Server边界/迁移被恢复贸易阻塞五项Medium；Local连接互斥、SVG连线及项目暂停状态三项Low。MODEL01不豁免这些具体缺陷。评审未跑测试、构建、安装或服务，未改文件。作者随后补持久审批/指纹/锁模式/手工队列兼容/Local限定/条件DAG与计划AT，修图及状态；这些是作者修订，尚不能当独立关闭。

同一独立评审复核revision1全部13摘要及修订，九项原缺陷逐项关闭、planned10/ready0任务表与条件DAG一致；requirements completeness PASS。但发现新增N1 Medium：持久审批未区分细粒度依赖与旧global revision，可能让无关过账使所有待办失效，design/test仍BLOCKED。作者补实际配置/政策/期间/对象余额及规则候选范围版本、明确排除粗修订锁行/global水位/非业务摘要，并扩AT04/05“无关写不失效、相关写/ABA/新增更强规则必失效”；仍须独立窄复核，不以作者说明豁免。

随后同一独立评审核revision2全部13摘要，仅前三文件发生实质修订，窄核细粒度依赖/AT04/05及真实阻塞记录。N1实际关闭，未发现修订新增缺陷；requirements completeness、design quality、test completeness三项均PASS，**G3为EXCEPTION (user-approved MODEL01)**。此处“test completeness”是计划用例充分性，不是AT已运行。评审所核architecture/ADR/test-cases SHA256分别为98a1c75e697ff842f7656844b4c7e045dbca7c88f9e11efe29302adb9646ad2c、d520f6b09570a11cfd546ce765728c5b603091b2a9d1be1611e375cec22b4833、e9d7610a4433e650687ff9e3740c3ca6b97aa2d67db02d89751a45c9af8bf236；随后仅更新本文及入口的已评审状态元数据，不改已核设计。

作者实际校验8个AR/11个未来AT全映射、62本地链接及2锚点、10阶段15条无环必需边及贸易条件依赖、14节点SVG XML/15连线与Mermaid对应、32运行文件哈希不变，README/design whitespace通过；SVG在浏览器以本地文件实际渲染查看，无helper/端口。没有为纯文档重跑产品测试或把旧291/新增备份8冒称新完整292。全部原九项及N1已关闭，无具体缺陷由MODEL01豁免；用户DC-01..04未确认，10阶段planned/0 ready，贸易/TASK24继续暂停，真实迁移/切换另需授权，FG仍0/13/31。

## M-TRADE-A-DESIGN-01：修订G3释放MODEL01例外

基于已发布M-CORE提交3fbd75f，新增FR-T01..08、D-TRADE-A、TC-T01..14，仅非库存应付/应收切片；实物流、其他成本/税、FX及M-TRADE剩余仍有具名依赖。作者实际gpt-6.1-sol；独立评审请求claude-opus-5.5，身份未核实时沿用户批准MODEL01。设计撰写时尚未释放G3，当时不拆新TASK或改运行代码；以下保留首轮阻塞与后续实际释放的顺序。

父作者完整阅读采购/销售正文与既有内核事务/适配器/完整性实现；独立只读分析者完整覆盖成本/税/汇兑正文及POLICY-01，反馈精度/尾差、暂估与最终成本、条件税及连续FX边界。本次先拒绝未支持能力，不以成功零值掩盖；政策由委托决定，具体可行性仍须独立审查。公开需求和原创数值例子不是私有来源转载。G3须检查权威投影不退化为仅展示事实、历史查询/日期链、业务唯一键/并发余额、精确反向/当前合法写边界、taxDate税率及原子/恢复保证。

独立首轮实际核对五文档SHA、HEAD及仅文档差异，并读取核心准入/事务/适配器、API限制和备份构造；未跑运行测试或写账。评审冻结requirements/design/test-cases SHA分别为863ddcc40b1944838676d3bf65578959115ebd382691090f0b002415e4439244、82b06de46cb20828d56a2bc974642f05c29b6874beacfac8092a2f201e7318cf、c8d567b2b2c4a73bc6f37f45477bbfbcf7a31f9ae875b7ac9b8cb3ebc8998aea。五项Major：订单行无显式匹配键/比较口径；配置变更后的结算角色不明；贷项/预付无录错取消路径；历史账龄缺桶和oracle；抵扣/折扣日期/部分折扣/应税费用/应用分配及测试不完整。另两项Medium：新公司可能因MODULES扩展自动启新模块，readOnly备份无适配器可能漏校验。结论为G3 BLOCKED，MODEL01不能豁免这些缺陷。

作者当时修订上述具体契约和TC-T02..12：orderLineId/逐行比例净额、快照控制及新行停用拒绝、document.cancel覆盖三类并维护依赖对象、明确账龄响应和月末oracle、税/折扣/应用规则及退款/取消/去重测试、默认只原五模块、所有构造内置贸易投影。该作者修订说明不等于独立关闭；当时仍待独立复审，未拆任务或实施。

随后已完成独立窄范围复审：宿主拒绝向sync评审追加消息，因此使用新的只读评审检查原七项及修订是否引入实质缺陷，未伪称原评审复用。其实际核对五文档摘要、限定差异及核心/备份相关源码，逐项关闭五Major及两Medium，未发现修订新增实质缺陷；requirements completeness、design quality、test completeness三项均释放。当前requirements/design/test-cases SHA256分别为f09a3039418cbcd103199b165e92561277093c7b70ed109e04355e72373ee69e、163e9607e01037d638b2a025022b11d8ed5f2ea36297d257c496afdc382c3b53、809ebcd0451f4c41f7a2609c71fb51512be5ad7224ec552ca9c4f5ffbdd72b29。**G3为EXCEPTION (user-approved MODEL01)**，仅释放此M-TRADE-A基线任务拆解，不是代码/测试已完成。评审没有执行运行测试、服务器或真实账套；实现、旧172回归、新用例、G5及组合G6仍须实际完成。

## M-TRADE-A-CALC-01：TASK20独立G5释放MODEL01例外

独立评审实际核对下列源码/测试摘要、测试先行日志并重跑7/7及语法；另只读运行3000个随机文档、两行累计溢出、精度/非均匀尾差/100行税内及无输入变异探针，无发现。specification compliance及code quality均释放，**TASK20 G5为EXCEPTION (user-approved MODEL01)**；仅释放纯计算器与TASK22依赖，不覆盖业务日期/税码有效期/真实子账。作者和评审没有写真实账套。评审指出已有溢出用例首先触发单行税溢出，不误称测试已覆盖两行累计；其额外两行探针确认累计保护有效，此为覆盖说明不是未解决缺陷。

先新增聚焦测试并实际确认缺enterprise-trade-math.mjs而ERR_MODULE_NOT_FOUND，再实现BigInt有理数纯计算。当前实际7/7、0跳过及模块语法通过，覆盖73.19税内外/部分折扣oracle、三行0.03最大余数及抵扣、币种0/2/4位、6位数量价格/商业折扣/应税费、零税免税/无率拒绝、浮点/超精度/负数/零发票/单行税溢出拒绝。源码/测试SHA256分别f49ce7941a31dc39e70d72da4a64e38088a09de8c05a36e5f9b15ae0907b74d9、640c27c295a74757a171c9b718509b92d163556e4b9a85718ee2f757d3c7246c。此处纯函数结果不代表税有效期/业务对象/会计写入已经完成；计算G5释放后才启动TASK22。

## M-TRADE-A-UI-G5-01：首轮及二轮BLOCKED，第三轮已释放

TASK21作者实际46项独立widget及2项label通过；独立评审重跑46项widget、四文件语法、两语言keys/插值及额外各操作/配置双语探针。原四文件摘要依次为widget fd265a641602b3b369e907237ef4faa601c773704c134f87691446aac5396579、中文19bd698c51fa7f8f2cde344457653077f45b6c8bd79e9e70877832c494920a8f、英文7ee35983ea6f7dd924cb368d85d9e6a6671172c865677073555a418bf31d5b06、测试7dd1fffa438e882b9b4d7c401198d9ed21b09a5f5337852a33e831039d3ffc57。首轮spec/quality各有一项Medium：同月刷新仅升配置CAS版本但留旧值，可能覆盖并发改动；预览/回执/勾稽/来源只有无币种精度的原始整数JSON。已退回作者测试先行修复，未释放TASK21 G5。此为功能/质量审查，不冒充新的安全审计或全组合结果。

TASK23薄层先实际重现GET贸易404及动态挂载缺失，再完成只读路由及按服务端能力惰性加载。作者当时接口/旧widget合计44/44通过；旧4173实际浏览器reload/只读ERP导航仍200、0法人/无trade挂载/期间空且禁用/0警示，原凭证期间完整哈希及3凭证/ID3 draft不变。此为旧服务器兼容与mock接口证据，不是新贸易真实联通验收。随后为trade/tax默认未勾选、明确保存准入添加失败先行断言，实际联通仍待领域/界面G5及组合。

UI作者新增9项修订用例实际先失败，后55项widget与2项label通过；独立原CAS探针确认保留原版本/新草稿CAS0、显式重载同取值与版本，quality释放。金额问题首修仍漏真实核心transactionDebit/Credit及reportingDebit/Credit，独立第二轮因此保留spec BLOCKED；已退回作者补真实行字段、报告币独立精度及null明确未折算显示，不把原币精度套报告币。此为新具体字段证据，未以绿色mock测试强行关闭。

父集成实际接口/旧widget/修订trade widget/label合计101/101通过，期间新模块默认未勾选及明确批准保存已核。另新增独立真实HTTP夹具：AP发票/跨月部分付款/历史账龄/旧回执重试/配置失效，以及AR预收/应用/部分贷项/退款两项通过；真实挂载DOM+HTTP第三项当时在null报告币未显示“未折算”处失败，其他73.19/77.58/4.39 EUR展示通过。夹具全部独立内存账，旧教学对象完整未变；失败用例保留驱动当前修订，尚非组合通过。

第三轮补七项真实核心行形状用例，实际先7/7失败，修复后62项widget加两项label64/64通过；真实挂载+HTTP三项亦通过。同一独立评审重跑62项widget和三项真实集成65/65、四文件语法，并核对摘要和自己的0/2/4位双语GL预览/回执及CAS探针。原四GL槽位金额、null非零提示、报告币独立精度、原始ID/数量保留及CAS缺陷均关闭，specification compliance/code quality无阻塞，**TASK21 G5释放EXCEPTION (user-approved MODEL01)**。评审自建GL探针为核心形状mock，实际核心证据来自其重跑的三项HTTP/DOM测试；未自称运行label两项或全套。其未额外探测报告币不同精度但非null的金额（当前核心不产生该组合），源码明确读取reportScale，未以会计币精度回退。

第三轮四文件SHA256：widget e9cd8e1ff81f6b74433c979026959957298b4b1c9db8953f6f014a35701d4d59；测试7b418e46c797553fa6f0b703b5086b660a3de1030b83ce678e5c8cb34bb3665d；英文3986a3b06058b80e9d1d3234d81ab8a1d03b1646ed739881155ba1e2b7c40cb6；中文a371b81b80dec872c0c65c1f9f35435ef3c1eab96b48107bc0fb0455bd894a03。

## M-TRADE-A-INTEGRATION-01：候选全回归通过，其他门禁待独立验收

领域作者实际实现31项贸易测试，与既有core/calculator/backup合计85/85；首次两项缺操作/配置失败及后续维度来源/订单剩余/非贸易控制范围问题均测试先行。领域及接口各独立G5审查中，未以作者结果代替释放。

父作者当前实际完整npm test为280/280、零跳过，npm run check为14个运行文件语法通过，git diff --check通过。三个实际HTTP/挂载DOM均已从原报告币失败走通至明确预览、批准写入和偏好/输入保护；独立内存夹具的旧教学对象未变。此为候选回归，不是TASK24的真实浏览器、贸易CLI恢复或组合G6，尚未新增本地同步、提交、远端推送及干净clone证据。

## M-TRADE-A-INTERFACE-G5-01：TASK23独立G5已释放

独立评审实际审查发布基线3fbd75f后的六文件限定差异，并重跑接口、父widget及真实HTTP/DOM合计47/47、零跳过；specification compliance/code quality无阻塞，**TASK23 G5释放EXCEPTION (user-approved MODEL01)**。精确静态白名单、贸易GET过滤/重复字段拒绝、旧服务器无能力时不加载新模块、新期间trade/tax不自动启用、跨上下文迟到保护、同上下文保留输入及明确批准写入已核。未独立重跑全套280、14语法或diff检查，不把作者结果称为其执行。

评审的非阻塞观察：贸易输入也会使同一父shell中的手工分录预览失效并取消确认，这是向安全方向失效，不自动写账，也不保留旧批准，不是待修缺陷。评审未创建文件或服务。六文件SHA256：server 7f58825db36925a70c8b4f7ac3257bfdd689ca993a29e179d8ef115064a3c0c8；enterprise.js aa452681d9158f4562c87015c296af036c87c9080fe9a9dd686d52d271bd6441；package d79c7f418e296520d77f9330a5d1dbe8fc499bb6a02675ccf8cc4f674819644e；接口测试7f55e8a431785a85b087473af00489f7e0fec11ebe536a2023fb324474fe3474；父widget测试bfc8758f5c2c31dd8471d5097017b44d85f32a5523334d8856ba7995cf1a27c2；真实集成测试ccb65c4656f7fd9dfeaaa326bbc368baeb45d6615af182426c4154adb48147af。领域G5及最终组合仍待，不据此宣称ERP完成。

## M-TRADE-A-DOMAIN-G5-01：两High，BLOCKED

独立领域评审实际85/85及14语法通过，并独立三个临时文件账探针，源码/核心/领域测试SHA256分别a51765601a1ef213455597f752c0bb730d912aacb63e3f6475c16b12de1d5248、86369b228854e513b20b3450d2cef9674edbeb8da4df40742ddb94b565613e35、24100e25aa96b8391f2862dd1e5c9b33020ce80be09e98a0065550bd188f0fd6；旧core测试未改。specification compliance与code quality各有High，**TASK22 G5为BLOCKED**，MODEL01不能豁免。

一、控制/预付行在结算、退款、应用时取当前伙伴默认维度，未保留原控制行维度。评审实际商品默认DEPT:D1、伙伴无默认：发票2100贷11200/D1，结清借11200/空段，科目汇总勾稽仍true；加控制科目DEPT必填结构后合法发票不能付款。已退回原作者按已批准原角色/维度约束测试先行修复，多段及当前fixed重定向须覆盖，尚未独立关闭。

二、每次preview/post/read/open完整重放及逐事件归档/GL校验，post持写锁期间尤甚。评审原创400张各五行AP夹具：第1/100/300/400笔preview+post约43/3038/6517/10346ms，累计1637秒；limit10读取9180ms、readOnly重开5337ms。不是生产负载SLA，但已证实日常热路径严重退化。拟用可丢弃可信前缀增量缓存，新增NFR-T01/D-TRADE-CACHE/TC-T15先独立G3，不先写缓存再补批准。显式完整性/备份仍须全验。

其他独立探针确认两句柄旧付款409、精确结算反向及重新合法折扣、外部号NFKC去重和适配器能力边界；未独立执行HTTP/UI或原4173。临时目录全部清理，无生产/原账写入。本次是功能及性能G5，不冒充已完成安全审计；未启动TASK24或发布。

## M-TRADE-A-CACHE-G3-01：首轮BLOCKED，修订复审已释放

独立原领域评审实际核对补充三文档，requirements/design/test-cases SHA256分别3ad077c98efa4a02df5cc17f7c2279b1c29a176f38d6c935b05f3392190e02eb、1b543d3df31a5c49f4d2b9dfd7374b73e6b59c6eae0c1ea4f83915f75ba3b0bc、fe77b8e4f79ed75003a431bedc6636da4a8c05f4d9527d5dab8097b5170944a1，仅文档及相关源码只读，未执行运行探针。NFR范围/权威前缀/一致快照/回滚后发布/强制完整性原则认可，但design quality有Major：新增回填事件不能仅更新所属月，必须更新所有asOf不早于事件日期的切点；TC-T15缺缓存二/三月后再回填一月独立事件。另test completeness有Medium：多维度段的排序/舍入尾差及跨发票同科目异段应用无整数oracle。

已据此明确所有晚于等于事件日的缓存切点按接受序更新，补回填与冷重放对照；控制段采用规范维度键/集合码点序、逐段剩余A/G half-up及末段取尽，2/3/2先核销3得到1/1/1，末4为1/2/1。相同科目跨段应用仍出两行，只有逐段净零才可省GL。当前是作者修订，不是独立关闭；缓存仍未获G3、原两High仍待实际G5复审。

随后原独立评审实际核对修订文档并逐项关闭Major及Medium，未发现新的High/Major/Medium。其验证逐段算法在A<=G时不超段余额且余数非负，三段oracle和同科目跨段AR借贷方向正确；requirements completeness、design quality、test completeness均释放，**补充G3为EXCEPTION (user-approved MODEL01)**。新三文件SHA256分别a2a5eacaef89a16ef84f97313d77017ccfb6252903e2d9f73cd0fb36d8ea0dff、d49d35849bcfbdf9f495951a87930071ecdf4a03e0077924fe41f0f9b79e6a2d、5e3e54957ecd86b5e7323f64e4dbf42e510292d3f49c8603d6461543cf098da4。评审仅文档只读，无运行或性能探针。现在才允许原领域作者实施缓存与精确分段补充；原维度/性能两High仍OPEN，不把G3当成G5修复验收。

## M-TRADE-A-DOMAIN-REPAIR-01：实际修复候选，待原G5复审

补充G3释放后原领域作者只改原三个文件。实际先失败证据包括规范段序不符、热路径仍8次归档及8次旧GL查询、并发预览混合快照revision30而非29；修复后42领域+40旧core+7计算+7备份+3真实HTTP/DOM共99/99及语法通过。原最终控制维度、逐段2/3/2的两次核销和反向、同科目异段两行GL、提交后发布、后缀完整验证及所有相关历史切点、强制完整性和API别名边界已实现，仍需独立核实，不能由作者宣称关闭High。新分段金额采用Minor后缀，与已审界面格式化契约一致；计算器和旧core测试未改。

候选核心/领域/测试SHA256分别d8d324c8b9c9bef6e76960c19d8af678b661944c4ca673d16c50907ed02f4ab5、9bc9b717be91bfdc3dfbc68dcb940ff597312571d7ce60ea11ff17d5cb178493、a685a502b0a1651dd5861c1c69e8910e3941a2c08537023b2aab0e16a3a9cd8e。原独立领域评审已收到此修订进行实际G5复审，结论未到，TASK24继续等待。

父作者另建独立文件账夹具，400张各五行税票，未逐笔调用强制完整性。实际首/100/300/400笔preview+post为40.18/73.88/115.49/162.91ms，400笔共37902.85ms；首次月末limit10读取4081.34ms，热重复57.75ms，强制完整性10113.81ms，readOnly全验重开5234.28ms。精确gross3190800个最小单位、400来源/400凭证、冷/热/独立重开结果与已接受原回执相同，专属临时目录已删除。该规模证据不是毫秒SLA，首次历史切点及强制全验仍有明确开销。

随后父实际完整npm test为291/291、零跳过，14运行文件语法及diff检查通过。此为修复候选回归，不代替独立G5或最终组合G6；无本轮本地/公开交付，也未在原4173写演示业务。

## M-TRADE-A-DOMAIN-G5-02：原两High已独立关闭

原独立评审核对上述三个修订源码摘要、计算器及旧core测试未改、补充G3三文档仍匹配，实际重跑42贸易+40旧core+7计算+7备份共96/96。另以自己的原探针确认商品原D1控制、当前NOW现金、后设fixed D2拒绝新付款但历史反向精确；零段/末段分配、AP跨发票异段两行及相同段可无GL正确。两句柄先缓存二/三月后回填一月，三个历史切点均增224且与冷readOnly逐字一致；另一句柄已付款使旧post409、新超额preview400。热缓存不是物理监视器，但改GL维度或facts后forced integrity及普通/readOnly重开实际拒绝。

性能High亦实际关闭：评审计数热preview+read19条SQL且无归档/旧GL/凭证封印查询；第2至200笔preview+post稳定61条SQL。自造200张五行发票首/50/100/200笔约38/47/72/81ms，热月读8条SQL/32ms；首次冷切点约1.05秒。状态安全复制及冷/全量重放仍有增长，不虚称常数复杂度或生产SLA。其未重跑400规模、HTTP三项、完整291、14语法或旧27分钟基线；原三份规模/测试证据分别归实际执行者。临时目录全部按确切路径清理。

**Specification compliance及code quality均释放，TASK22 G5为EXCEPTION (user-approved MODEL01)**；原两High无未解决阻塞，未发现新的High/Major/Medium。现在才满足TASK24前置；不把领域审查当组合G6或全部44FG完成。

## M-CORE-G3-ADDENDUM-01 / ERP-CORE-G5-01：补充设计与修订G5已释放

M-CORE候选首次全回归138/138及10运行文件语法通过，但独立G5实际发现旧测试未覆盖的时序和异步缺口，不能以绿色测试替代验收。TASK16有两项Medium：纠错/取消可早于原凭证；后月匹配抹除前月未清且可早于原行。TASK17有一项Medium：请求跨公司/离开重入后持久按钮可能永久禁用、迟到新建未刷新法人索引。TASK18独立spec/quality无发现，最终仍待其他任务集成。

首轮TASK16/17 G5为**BLOCKED**；MODEL01只豁免模型身份核实，不豁免未修复行为。领域时序先在FR-C02/C07、D-CORE及TC-C02/C10补明确并送独立G3，未释放前未实施新增明确约束；其余未变更UI缺陷按原G3修复。当时TASK19等待领域G5，没有提前启动。

补充G3首轮独立确认原两项时序目标已被文档覆盖，但发现A1：重分类在六月撤销后，新的原账纠错仍可能回填四月，令四月/五月重叠有效纠错；A2建议明确无GL匹配同样受期间准入控制。已补“不得早于原来源纠错/撤销链最晚会计日”的约束及一月/三月/六月/四月拒绝、六月同日允许用例，另补hold/clearing模块拒绝用例。

**补充G3窄范围复审已释放EXCEPTION (user-approved MODEL01)**：A1/A2实际文本均关闭、specification completeness/design quality/test completeness无阻塞。三文件有序摘要`b25a068bcf79bebd52bf6e06520c4446dcb8013c7422d1c11278e9502af5a61d`；requirements/design/test-cases SHA256分别为`5311713c68078069713532c33318619aed547b395e4763d147ae9feaf95d78a8`、`83e91024c14fedbe6e5e9e06c7bfc126fbb0c3a53603298b86f8e873d60b686d`、`adc441ece862f5a1cadbc4d909a84b4ef50b73a1e46c39a11d175acc4a49ee8c`。只有此后才启动领域时序修订；不豁免实际G5或TASK19。

**TASK17/18独立修订G5已释放EXCEPTION (user-approved MODEL01)**，specification compliance/code quality无阻塞。评审者重跑原两个异步脚本，确认按钮恢复、旧上下文不通知、show/显式刷新重读索引且不改当前法人/月；POST无当前预览仍禁用。实际63/63接口/DOM/label回归及10文件语法通过。此次UI修订SHA256：enterprise.js `ceb7633bbbb6a8c0d0b9e2b50cc795bfe7edc25d5775483487d64af16039d4ec`，enterprise-ui.test.mjs `50f8a10bab739d05a11ddd258d5f193754f54305d338215cc347c67c16c71b88`。迟到创建通过后续show/刷新发现，而非污染另一上下文。作者的独立实际浏览器证明另记，不冒充评审者执行；新增并发HTTP断言、领域修订、备份及全组合仍待最终G6。

**TASK16修订G5已独立释放EXCEPTION (user-approved MODEL01)**，specification compliance/code quality均无阻塞。评审实际运行40/40领域测试及语法检查，并用自己原先的探针确认早期纠错、撤销链边界、早于被配行匹配均400且完整性不变；一月至三月未清、四月已清的历史口径成立。source/test SHA256分别为`bedfedc13912c28f2c784d46fdb4fa53c74dcff7a5e8d3bd0d1d5786375459a0`、`cb805637985247024f4036f4c4267ea30fe0b4b49d2b7bee2c9a4e4cade01d71`。原两项Medium关闭，允许TASK19此后启动；不声称跨进程并发已测，父层六个同时HTTP首次提交是单进程接口证据。

## ERP-CORE-RECOVERY-01：TASK19独立G5已释放

在实际领域G5释放后才新增恢复测试，先确认缺`scripts/enterprise-backup.mjs`导致ERR_MODULE_NOT_FOUND，再实现只读SQLite VACUUM INTO私有暂存、一致快照自身摘要、只读内核完整性核验及COPYFILE_EXCL新目标创建。backup/restore都拒绝覆盖，不自动替换活动账本；CLI异常显式非零。

作者实际7/7聚焦用例通过：源保持在线且快照后写入不混摘要；独立子进程restore；金额/维度/原回执及恢复后已完成重试/未完成token拒绝；已有空/非空文件、目标创建竞争及原路径拒绝；坏SQLite/非ERP/实际篡改不平衡库拒绝；无效命令/缺源零建库；成功和失败暂存清理。

独立G5实际7/7及11语法通过，另以自己新建/清理的夹具验证活动WAL、源被另一进程独占锁定、父目录/源缺失的成功或明确拒绝与清理。评审指出原测试夹具是rollback模式，不能当作WAL证据；已只改测试显式设置并断言journal_mode=wal及活动WAL字节>0，再由同一独立评审读取窄修改、核SHA及实际7/7复审。当前脚本/测试SHA256分别`ac2a37ad5074ce0e3e5e9d3a98bd21eb9fb3dc55c86eb6dd6643e7dc9892b350`、`90e485298570287a0c6c75f6d5f8465f550e1632ed37e08712718d7527bdc1e5`。specification compliance/code quality无阻塞，**TASK19 G5释放EXCEPTION (user-approved MODEL01)**；原rollback夹具不追认为WAL证明。

## ERP-CORE-FINAL-CANDIDATE-01：当前作者组合证据（G6待审）

当前完整组合实际170/170、0跳过及11运行文件语法通过，包含最终WAL夹具、六个同时HTTP首次提交及同值配置保存后旧token拒绝。源完整三文件仍为补充G3冻结版本，未以新测试结果偷偷改变批准的会计行为。

最新进程在同一独立虚构目录重载后，实际GUI证明无法人时全局期间为空/禁用；COREA一月2凭证、二月1凭证，月利润-2.08/YTD7.06、资产/权益60.33，USD报告币不可用非零。红绿/中英及教学来回不改整个二月state且保留同一未保存输入节点；旧模式恢复2026-11及可用期间，再入ERP恢复2026-02和输入。实际UI查询7条审计记录/3来源接受，完整凭证8087字符详情高420px；1280实际视口文档宽1265无横溢。本轮没有实际390新验收，不冒用旧TASK15截图证明新工作区。

浏览器另发现旧页脚在ERP币种界面仍写“教学单位”。先在既有真实HTTP/DOM往返用例增加中文/英文/旧模式金额口径断言，实际确认失败后，仅在chrome按view绑定成对erp.measure label；原教学口径保持。修订后聚焦及完整170/170/11语法通过，真实浏览器最新模块证明中/英ERP页脚不再混称教学单位。此窄修改待补充TASK18 G5及当前跨任务G6，不用修订前的G5快照批准后改内容。

原4173仅只读复核，3凭证/期间有序完整SHA256一致且ID3 draft未变；账务指纹只留本机验证证据，不发布原账内容。当前隔离验证不是迁移原账；本轮尚未本地同步或公开发布。

## ERP-CORE-SECURITY-01：限定候选安全审查

独立security-review检查当前15个修改及8个新增文件，读取完整领域、恢复脚本和集成差异；UI按实际HTML/导航sink及API调用点检查，其余文档、label和测试按公开泄露模式扫描，不声称每个UI分支均逐行审计。实际内存探针确认跨法人token/凭证拒绝、控制科目拒绝、原型/伪造内部行字段拒绝、配置变更后token失效，完整性保持。HTTP/WAL/目标竞争由已记录回归与代码审阅覆盖，不冒称安全评审者重复执行。锁文件仍全公共npm，未发现密钥、私有原文/案例/答案、机器路径或内部端点。

| # | Severity | File | Lines | Vulnerability | Confidence |
|---|----------|------|-------|---------------|------------|
| — | — | — | — | 未发现达到报告门槛的安全漏洞 | 限当前候选与声明的本机威胁模型 |

这不是绝对安全保证、生产认证或支持多用户认证的声明；不防御机器/文件管理员。请求claude-opus-5.5、实际身份不可独立核实，保留MODEL01。后续源码修订仍须检查其差异，不把本次快照审查无限沿用。

## ERP-CORE-FINAL-01：首次组合G6与TASK18补充G5

独立评审实际检查23文件（15修改/8新增）当前组合、自报摘要`895c4dbb00d4553e1c46e23549d31e029af6c0ad86c58cb8dcdc80f299f4da3f`；三份G3冻结文档实际SHA仍一致。独立170/170及11语法通过；TASK18页脚补充G5的specification compliance/code quality无发现，按MODEL01释放。组合specification compliance无阻塞，code quality列出一项Low：期间表单只在完整重建捕获revision，其他窗口改期间后“刷新”未更新状态/模块及闭包版本，409无法靠刷新排除。

该项不是安全漏洞，亦未导致错误写入。作者选择现在修复而不延期：测试先行只刷新变更的期间面板并重置批准，不静默用新版本提交旧权限，不丢业务输入；修改后仍须同一独立评审对新组合复审。当前发布门禁暂不关闭，不将修订前无阻塞结论当作后来源码的批准。请求claude-opus-5.5实际身份仍不可核实，MODEL01例外保留。

## ERP-CORE-FINAL-02：当前修订组合已释放

同一独立评审实际读取期间刷新源码及两个新增用例，独立重跑完整172/172、0失败及11运行文件语法通过，确认TASK17补充G5及当前M-CORE组合G6的specification compliance/code quality无发现，均释放为**EXCEPTION (user-approved MODEL01)**。首次Low正式关闭，不沿用旧快照批准新代码。三份G3冻结文档未改，范围仍为15修改加8新增。

本次enterprise.js/test SHA256分别为`5b9c0284649b7e3a2434ba4f8a6f01dc6d0b80f7adccbba4abc9de28e2526b25`、`eda75e530edcf3512136155a722f2a19e86a35ebf6479ad41f8b6b483f9954db`。当前期间revision变更时同步状态、模块及expectedRevision并清旧原因与两确认；未变更或只有他月变化则保留编辑，无关业务输入和预览节点保留。发布仅回填状态证据，不再修改已审运行代码。

作者另用真实浏览器在独立空法人外部变更期间为hold、仅journal/statistics，实际点击刷新，确认旧批准清除且同一业务输入仍在；重新明确批准后成功保存open并保留这两模块，revision从37到38，零凭证/来源。真实CLI在线backup及独立restore也成功：虚构账本2法人、24期间、3凭证/6行、3来源/回执，快照241664字节，完整性元数据相等；一次含Node启动的温缓存小夹具耗时242/212毫秒，非容量、冷缓存或SLA基准。两个专用输出随证据保存后精确清理，不复制原4173账套。

同一security-review对上述源码/测试及公开元数据窄差异再审，未发现达到报告门槛的漏洞；不重新声称执行安全探针或全回归，完整执行范围见ERP-CORE-SECURITY-01。本轮原账完整指纹仅留本机，不进入公开树。模型身份仍不可独立核实，MODEL01不豁免行为或安全问题。此记录不冒充其余六里程碑已实现，实际本地交付、远端和干净clone结果另以交付报告核实。

交付补充：36文件按上轮实际交付哈希保护同步，15更新/8新增/13相同/0冲突，不复制Git/env/依赖/数据库；本地实际完整172/172及11语法通过。原4173同一工作目录/数据目录受控重启，新enterprise.js及GET /api/erp/state均200，完整原期间/凭证有序哈希保持、3凭证及ID3 draft不变。首次准备检查误用仅支持POST的companies路径做GET而得到404，改用真实只读state契约后通过；不是忽略失败或更改服务器绕过检查。最终交付元数据再次按首次实际manifest保护同步。

## ERP-CORE-DESIGN-01：政策与M-CORE独立G3（首轮BLOCKED）

当前全44FG实施授权下的新审查，不是旧PLAN44/TASK11–13审查的复用。作者实际gpt-6.1-sol；独立调用请求claude-opus-5.5，评审者明确无法核实运行身份，MODEL01仍适用。审查范围为POLICY-01默认方案及FR-C01..08、D-CORE、TC-C01..12，未释放其余六里程碑的具体实现。

首轮9文件有序SHA256清单摘要为`c1b8302f20cbece8ed8d13e8aa4126e2a4bd9aa07dca10acf96d3b8f687a1604`，基线提交`61a86dbe8163cd8f12ebd137e259ea5e35694b42`。评审结论specification completeness BLOCKED / design quality BLOCKED / G3 BLOCKED，未运行新产品测试、没有产品实现提前开始。

- B1：不可变行的三币金额/率引用结构及全库币种精度未固定。已补完整行槽位、同币种统一scale、M-CORE仅会计币交易、报告币未折算null和显式边界，TC-C01/C11/C12补覆盖。
- B2：规则/默认/派生/维度有效期未明确三日期中的依据。已统一当前发布集合按accountingDate判断有效期，活动状态进入当前版本指纹，单据/税日仅存；TC-C03/C06补跨边界。
- N1..N7：队列撤回与失败分类、已用科目用途冻结、可信适配器正路径、有限操作/完整替换重分类、fill/null与replace覆盖、月/YTD及权益口径、在线一致备份及HMAC生命周期均已明确并补对应计划用例；无未经说明的延期。

首轮复审独立确认B1/B2及N1..N7全部关闭，POLICY-01及限定M-CORE设计无阻塞；10文件有序摘要`79bd41912b0603ef759bf3e5cee3e5e0e38fa3a8923289be595a835fd49e5dd0`。评审者另实际运行旧80/80测试通过，作者先前也独立运行80/80及语法检查；二者都只是旧回归基线，不是新功能验收。

复审提出两个小澄清：错误重分类输出如何再纠错、派生replace与最终fixed冲突。作者已补充完整反向重分类/追加有效纠错链及新ref/token要求、fixed最后覆盖派生但不掩盖原始显式冲突，并补TC-C03/C10。未折算历史行的后续报告币策略作为M-COST-TAX的明确G3输入，不能回填改原行。

**最终独立窄范围复审已释放M-CORE G3：EXCEPTION (user-approved MODEL01)。** specification completeness无阻塞 / design quality无阻塞，两处新澄清均由评审者读取实际文本确认关闭。最终10文件摘要为`8a0d95fba41f9f31dbc0c9cc349ca54e2094dd1b7ded8d614d422cb6d966f059`；其需求/设计/用例SHA256分别为`acd7b26a782133b0fb9d77340c48a3739dc99d1f6ae26f15739cfc5a24231a5a`、`a038022a699c06aa4ea830ad05abccf46c848b0da31e69ff5417f0323096537a`、`9026354d2dc171c93b7de50e6c2af8e262c7549cfd9db1d2dad1a1dc2a099db2`。本段只回填审查元数据，不改变已批准行为。评审者确认当时src/public尚未改；当前才允许分解和实现FR-C01..08，每任务仍须G5、组合仍须G6，其他六里程碑及全44目标不因本次释放而通过。

## TASK15：主题与双语界面

- 需求FR33-35：默认红色主题，可选绿色；默认中文，可选英语；界面文字按key读取独立资源。本机偏好持久，切换不改账套或自动写账。
- 实现保留既有总账、科目、维度、确定性业务预览/确认、明确过账与受限AI边界。
- 发布前工作区实际执行 `npm test`：62/62通过、0跳过；`npm run check`：8个运行文件语法通过。
- 独立设计、增量及组合评审完成。组合审查发现的绑定注册内存积累已改为节点归属WeakMap并复核关闭；标题绑定及重复警示符也已修复。
- 最终独立结论：spec compliance PASS / code quality PASS。作者为gpt-6.1-sol；请求评审claude-opus-5.5，但实际评审身份未能独立核实，保留用户批准的MODEL01例外，不声称已核实不同模型。
- 实际隔离浏览器验证红/绿、中/英、重载持久、未保存输入与迟到AI候选保留，以及窄视口无横向溢出。AI使用本机受控模拟返回，不是真实模型连接证明。
- 同一原账套的凭证和期间在界面改版前后保持一致；未知草稿未删除、迁移或改写。

## READ-G5-A-01：TASK11/12 与 TASK13设计澄清

- 基线提交 `f8b80ec8b799bd66352229a912b1e5bfb31b43e5`；已审查8个实现/测试文件的有序SHA256清单摘要 `21DBA0FEA9C61E1311A605ED9AC342B472713863BE2E22EAA898BD70ABC2C36D`。评审读取实际diff及FR139A/B、D-READ、TC139A/B，并独立执行67项领域/API/UI与全套76/76及8项语法检查，全部通过；无阻塞发现。
- TASK11：specification compliance PASS / code quality PASS。三阶段同月完整总账、停用历史科目、清除维度筛选、口径差异、中英label及零写入符合要求。作者测试先行2个预期失败，随后UI/label17通过；后续用例另覆盖错误诊断。
- TASK12：specification compliance PASS / code quality PASS。一次reports快照、固定六项映射、安全整数、负零归一、400/404及零写入符合要求。作者测试先行11个预期失败；随后针对11/11、领域/API52/52通过，包括六种受控差异、溢出及关闭期间。
- TASK13对月份/当前容器约束、加载/错误与非审计边界的设计澄清经同一独立评审接受；实现仍须新增用例、G5及组合G6，不提前算完成。
- 集成作者实际gpt-6.1-sol；子代理实现及请求claude-opus-5.5的独立评审实际身份不可核实。G3沿既有限定批准，G5释放为 **EXCEPTION (user-approved MODEL01)**，不是已核实不同模型的全流程PASS。此例外不豁免行为、检查或阻塞发现。

## READ-FINAL-01：TASK13 G5 与 TASK11–13 组合G6

- 独立最终评审检查当前组合diff而非仅引用TASK11/12旧结论，运行 `npm test` 80/80与 `npm run check` 8项通过。TASK13 G5：specification compliance PASS / code quality PASS；组合G6：specification compliance PASS / code quality PASS。无显著发现或未解决阻塞。
- 评审者记录9个代码/测试文件有序清单SHA256摘要 `57402B40E0DF0A8A58A8DB522E77AD67A28CE6C62768167A9FFDEC65603D73B8`，基线为 `f8b80ec8b799bd66352229a912b1e5bfb31b43e5`。范围含Book/server、app/style/中英label及领域/API/UI测试；后续只回填发布元数据，不变更已审代码。
- 核验六项状态/金额/限制、异常格式不假通过、刷新先撤销旧成功及最新请求优先、月份/请求/容器失效保护、原下钻与普通总账/AI解释入口兼容。全组合不新增schema、写账、AI权限或依赖。
- 作者实际gpt-6.1-sol；独立评审请求claude-opus-5.5，实际身份仍不可核实。G5/G6按 **EXCEPTION (user-approved MODEL01)** 释放，不宣称核实不同模型。评审者未重复作者真实浏览器，相关证据明确归属作者隔离验收。
- 当前公开发布安全独立检查：未发现显著新增泄露/可利用漏洞，70个锁文件包源均公共npm；这是限定候选快照评估，不是绝对无风险保证。
- 交付补充：本地28文件首次19更新/9相同/0冲突，无新增依赖，实际80/80及8项语法通过；最终进度元数据按首次交付哈希再次同步。原预览同目录/同账套重启加载新GET，6项/API及4个静态资源核对通过，原3凭证、ID3草稿与期间canonical哈希一致；不公开账套、凭据或宿主机器路径。

## 公开发布安全边界

公开候选不包含环境密钥、账套/数据库、日志、依赖目录或宿主登录凭据。锁文件使用公共npm解析地址，依赖版本与integrity保持不变。

私有研究副本已从公开树移除；产品规划保留通用ERP能力及稳定编号，不发布私有来源、综合案例或答案。机器专属交付路径使用中性占位符；新机器请从README的clone步骤开始。

推送后的干净克隆验证结果由本次发布报告提供，不把历史验证冒充每台机器均已验证。新机器必须独立配置AI认证并检查模型可用性。
