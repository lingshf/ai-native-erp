# 公开验证记录

本文件只保留可公开的产品验证结论。私有研究资料、原始来源案例、机器路径、内部依赖地址及宿主操作记录不随代码发布。它不是原本机审查日志的逐字副本。

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
