# ai-native-erp

## 当前优先事项：ARCH-M00实施基线，已授权架构迁移和恢复贸易

用户已委托“you do all this”，DC01..04采用推荐技术路线、首Local+Server Compose试点、预算目标非SLA、GL优先，决定均标“协调者代为决定，可调整”。授权包含恢复贸易/TASK24及备份核验后切换原4173，原库只读/ID3保留；不因授权跳过逐阶段G3/G5/G6或擅自丢弃未提交成果。详细设计见[architecture-migration](architecture-migration.md)。M00 G3/G5/G6均已独立释放MODEL01，保护工具10/10、完整302/302及语法通过，真实原源/快照逻辑与canonical相等、ID3保留且源物理摘要不变；当前准备安全交付/发布。M01已独立G3释放、可依M00门禁进行骨架，不代表数据库/业务迁移完成；后文暂停和待确认是历史，以本节为当前状态。

执行前完整292/292及14语法通过，远端main仍3fbd75f。当前4173无监听、HTTP拒绝连接，与上轮“保持运行”的历史记录不同；已有工作区两SQLite待只读身份核对。没有发现Docker/Podman/psql，先做Local/保护基线，Server真实验证不得伪造。原32运行文件保护摘要仍作为改造前证据，不是永久禁止获准新实现。

用户要求按中小企业ERP规格完善前端、API/业务与数据库分层。本轮仅设计，未获准重构、迁移真实账或提交推送；既有M-TRADE-A未提交成果原样保留。设计入口[architecture](architecture.md)、[ADR](adr/ADR-SME-001.md)、[图](diagrams/sme-overview.svg)，需求AR-01..08、计划验收AT-01..11；宏观迁移阶段ARCH-M00..09不是ready代码任务。

推荐独立React/TS前端、Nest/Fastify API、纯领域/应用服务、Kysely仓储和UoW，SQLite Local单人+PostgreSQL Server多人两档案。真实OIDC/作用域/制单复核分离、双库事务契约/迁移恢复与建议性能预算均需用户确认和逐阶段门禁。当前OQ本机模拟行为不变；44FG仍0完成/13部分/31未实现。原32运行/测试/脚本及manifest已冻结核对，架构文件不修改它们。

设计前模型计划及实际结果：作者实际gpt-6.1-sol；跨数据库、财务事务、多人身份与真实数据迁移为高风险。独立G3经宿主task请求claude-opus-5.5，实际身份不能独立核实时沿用户MODEL01例外；该例外不豁免具体设计缺陷。首轮九项缺陷及修订新增一项均经同一独立评审实际关闭，requirements/design/test三项PASS，G3释放EXCEPTION (user-approved MODEL01)，不是借用贸易门禁。仍待用户确认DC-01..04，10迁移阶段planned、0 ready，不自行恢复实施。用例AT均是未来验收，不是已执行测试；图已用浏览器实际打开核14节点。

暂停点：TASK24隔离真实GUI只完成AP预览零写/金额/未折算，贸易恢复套件新增用例8/8；最终G6、安全检查/本地同步/推送未做。本人隔离4182 helper已停止，原4173保持运行。本轮不启动任何临时服务。

公开版保留产品范围、进度及通用ERP规划；私有研究原文、案例/答案、机器路径与宿主交付日志不包含在仓库中。下文TASK历史仅说明限定产品增量，原本机操作证据不是公开仓库的一部分。

## 当前执行：44目标实施授权与七里程碑

**当前实现检查点：** M-CORE已实际发布至main提交`3fbd75f717f7e98ca21ba059888ac2316643ff3c`，干净公共clone安装依赖、172/172及11语法通过。M-TRADE-A修订G3已释放，当前实现并审查非库存应付/应收切片，尚未发布。作者实际gpt-6.1-sol；原子业务对象/GL、并发数量和税尾差为高风险，采用当前宿主推理能力、独立源码分析及具体G3/G5审查。宿主task支持请求claude-opus-5.5作为独立强推理评审，实际运行身份仍不可独立核实，保留MODEL01例外；来源分析不替代G3。共享核心、接口和界面分别由单一作者维护，其他里程碑未经各自G3不改运行代码。

M-TRADE-A暂停检查点：金融及缓存/分段补充G3、TASK20/21/22/23各G5均已释放MODEL01，原24项任务为23完成、0实施中、1用户暂停阻塞。领域两High已由独立原探针和96/96关闭；SQL计数证明热路径不逐事件重验旧前缀，两句柄历史回填及强制损坏检查通过。父完整291/291及14语法、独立400张五行实测37.903秒；冷月末/完整重放成本仍明示。TASK24停在CLI恢复新增套件8/8及GUI零写预览，组合G6/本地/公开交付未完成；本架构任务不恢复它。旧教学对象保持，44FG统计不变，非库存A不代表整个M-TRADE完成。

用户已授权获取完整信息并实现FG-01..44，也授权代选OQ-01..10的可调整默认政策；不再等待普通政策逐项询问。这是实施授权，不是全部需求已经通过G3或功能已经完成。上一公开基线为`61a86dbe8163cd8f12ebd137e259ea5e35694b42`，44FG仍为0完成、13部分、31未实现，TASK01..19保持已验收状态；本轮远端发布结果另见实际交付报告。

**设计前模型计划：** 集成作者实际为`gpt-6.1-sol`。七里程碑涉及会计完整性、期间状态、多法人隔离及精度，均按高风险处理。三个只读分析者分别覆盖基础控制、交易成本税币银行、资产期末集团及报表，统一作者归并政策和共享契约，禁止多写者并发改共享schema。每个里程碑独立G3、G5及组合G6仍通过宿主`task`请求用户指定`claude-opus-5.5`；实际评审模型身份不可核实，继续标记`EXCEPTION (user-approved MODEL01)`，不能以请求名代替身份确认或绕过实质性问题。

本轮按M-CORE、M-TRADE、M-COST-TAX、M-BANK、M-ASSET-CLOSE、M-GROUP、M-REPORT-LEARN推进，联合契约先统一、真实依赖决定切片次序。M-CORE的POLICY-01/FR-C01..08/D-CORE/TC-C01..12及领域时序补充已由独立G3释放MODEL01例外；TASK16..19各自G5、期间刷新补充G5及当前组合G6均已独立释放。19项任务全部完成，尚无新增完整FG验收完成。每个实际完成的里程碑须独立验收、保护旧账和未知草稿、本地哈希保护交付及公开泄露检查后才可快进发布main；远端已由其他工作推进则停止推送并报告。旧月度教学结转语义保留，不静默迁移。下文仍未更新的OPEN/BLOCKED说明和排除项是旧授权下的历史状态，以本节与后续正式决策、实际门禁记录为准，不等于其余六里程碑已就绪。

当前检查点：领域时序、UI异步及期间刷新缺口均经测试先行修复并独立确认关闭，备份真实WAL夹具7/7及G5通过。当前作者及独立完整组合各172/172、0跳过及11语法通过；实际隔离UI金额/期间/偏好/旧模式往返/审计/完整详情，以及外部改期间后刷新并重新批准保存已核。独立安全窄差异复审未发现达到门槛的漏洞；代码G5/G6门禁已关闭。本地36文件哈希保护交付15更新/8新增/13相同/0冲突，本地实际172/172及11语法通过；公开发布须另以实际远端和干净clone证据确认。原4173同一目录/账套重启后新模块与GET状态均200，3凭证/期间完整哈希和ID3 draft保持。

## 历史TASK15：主题与双语label（用户确认）

新授权：默认红色主题，可选绿色；中文/英文切换，所有显示label外置为每语言资源并按key引用。本机主题/语言偏好持久，原科目/输入/AI及账务数据不改。主题仅CSS变量；错误/不平衡以!+文字+差额及独立警示色识别，不与红主色混淆。语言默认中文。

TASK15交付时：15项任务为12完成、2设计就绪未启动、1等待前置、0实施中；原44FG仍0整体完成/13部分/31未实现。工作区/本地/独立评审各实际62/62及8项语法PASS，独立G3/G5/组合G6已释放MODEL01例外；内存累积Medium已根治并独立复核。真实隔离红/绿和中/英截图、输入与迟到AI保留/零账务写、重载持久及390px视口已验证。本地28文件15更新/4新建/9相同/0冲突，原.git/env/账套保留。4173为新增label路由重启同一工作区/同一data后，实际浏览器已加载红色/中文新版本，原3凭证/ID3/期间canonical哈希不变；会计模块剩余与OQ未因此完成。

设计前模型计划：作者实际gpt-6.1-sol；全UI label迁移/异步DOM及隐私提示为中风险，沿已批准MODEL01机制请求claude-opus-5.5独立G3/G5/G6，实际评审身份未核实则保留例外。开发仍当前worktree，交付基线erp-ui-local-delivery-final.json，原3凭证/ID3/期间保护，不提交推送PR，不展开TASK11-13。

## 历史TASK14：ERP工作台与可选教学（用户确认）

产品定位为ERP，同时提供可关闭的教学辅助；不因定位变化声称已有完整应收/应付/库存或生产合规。用户确认业务分组导航、精简说明、设置/业务分离、凭证空白科目与金额占位、可见维度/醒目差额、就地AI起草/报表解释、全局期间和本机教学偏好。默认教学关闭，localStorage仅存on/off，不改账务、默认账套或既有ID3。TASK11-13仍独立待办，本轮不实现试算下钻/勾稽接口。

历史TASK14完成：G3/G5修订及独立组合G6已释放MODEL01例外，56/56+语法PASS、实际隔离浏览器与前后截图/窄视口；本地24文件12更新/1新建/11相同/0冲突、依赖本地恢复后56/56+语法PASS。当时原会计引擎/server/SDK与3凭证/ID3未变，仅刷新静态界面无需重启。TASK15新增静态路由不适用“无需重启”的旧结论。TASK14任务剩余清零，其他业务与3个规划任务未完成；历史审查见ERP-UI-FINAL-01。

模型计划（设计前记录）：作者实际gpt-6.1-sol；UI/异步AI/本机偏好为中风险，采用现有作者实现、独立设计/增量及组合最终审查请求claude-opus-5.5，宿主实际评审身份仍不可核实，保留MODEL01用户批准例外。沿现有task工具审查，不声称会话切换agent。本轮在当前隔离工作区实施，完成后按plan44-local-delivery-final.json基线安全交付用户本地目录；旧账/不可编辑过账/确认语义不变。

## 本地进度总览（PLAN-44，完整目标入口）

### 已完成：TASK11–13 只读报表切片

用户已授权继续开发此批次及验收后的公开main快进发布。沿既有FR-139-A/B、FR-142-A与D-READ-A/B/C的G3限定基线，不扩展OQ01–10政策依赖范围。TASK11与TASK12按UI/服务文件边界并行，TASK13在两者G5释放后串行集成；共享文档由集成作者维护。

模型计划：集成作者实际gpt-6.1-sol；只读但会计解释易误导，风险中等。实现使用宿主任务子代理，独立G5/G6审查请求claude-opus-5.5；请求不等于已核实实际模型身份，继续保留用户批准MODEL01例外。新UI文字进入中英文label资源。当前已完成READ-G5-A-01及READ-FINAL-01，独立spec/quality通过并按MODEL01释放；原账套、未知草稿与过账/关账语义保持不变。

**PLAN44是产品规划基线；TASK14/15改进ERP界面，不扩展会计模块。** [完整需求与OQ决策](requirements.md) · [架构与并行边界](design.md) · [计划验收](test-cases.md) · [任务](tasks.md) · [公开验证记录](reviews.md) · [公开范围索引](source-analysis.md)。

当前**44FG整体完成0、部分覆盖13、未实现31**；功能覆盖与政策待决是两个维度，不将“待决”当作实现程度或虚构百分比。TASK11–13已完成，不等于任一FG整体完成。旧A1-A7有限底座收口仍成立。Book新增同快照只读勾稽，server新增GET接口；SDK/数据库schema/账务写边界不变。工作区、本地及独立评审实际各80/80与8项语法检查通过；独立G5/G6释放MODEL01例外。28文件哈希保护交付无冲突，原4173同账套重启后API/静态资源匹配、3凭证/ID3/期间保持。

下表为当前完整FG覆盖；“部分”的已实现子集有TASK/评审证据，其余以FR-101..144为目标。OQ现已有POLICY-01委托默认，全部目标已有实施授权，但新增里程碑须各自G3后才能激活代码任务；旧只读切片的审查不能覆盖新内核。

| FG | 当前覆盖与实际已实现子集 | 剩余目标/门禁 |
| --- | --- | --- |
| FG-01 | 部分：TASK06/10旧科目属性；TASK16新增法人、报表组、控制/清算/暂记及未清行为 | 真实子账控制/匹配仍须对应业务；M-CORE限定组合已验收 |
| FG-02 | 部分：TASK07/09旧结构；TASK16/17新增有效期、默认/派生/固定/内部平衡和行来源 | 实际新增业务主数据及归属结转仍待；不把精确结构冒充任意高级结构 |
| FG-03 | 部分：旧月度结转保留；新增公历年度、三日期、模块准入及不清损益月冻结 | 跨年开启/年结和多模块最终结账仍未实现 |
| FG-04 | 部分：旧单轴现金规则；新增服务/对方双轴、有效期及确定性命中解释 | 采购/销售/税/库存等真实事件尚未接入 |
| FG-05 | 部分：八种有限操作共用预览/批准/原子幂等/回执；手工队列转移与撤回 | 尚无真实业务子账状态与GL原子转移，不能以适配器证据代替业务模块 |
| FG-06 | 部分：精确冲销/完整替换/重分类/现金服务取消及日期链约束 | 采购/销售等对象取消及跨法人对应纠错待对应业务实现 |
| FG-07 | 部分：旧写边界/确认；可信控制、模块准入、模拟批准、暂记责任和队列冻结阻止 | 本机模拟不是人员认证；对象匹配/信用/预算等业务控制待实现 |
| FG-08 | 未实现：无采购订单/收货对象 | 收货/未票应计，OQ01/04 |
| FG-09 | 未实现：无供应商发票/匹配 | 采购匹配/费用/税成本，OQ01/04/05/07 |
| FG-10 | 未实现：无应付未结/结算 | 付款/折扣/预付款核销，OQ01/07 |
| FG-11 | 未实现：无采购退货/贷项 | 来源/税/批准状态，OQ01/04/05 |
| FG-12 | 未实现：无销售交付/发票 | 收入/税/成本配比，OQ01/04/05 |
| FG-13 | 未实现：无客户未结/收款核销 | 预收/部分结算/退回，OQ01/07 |
| FG-14 | 未实现：现金服务不是应收服务发票 | 付款条件/账龄/催收，OQ01/07 |
| FG-15 | 未实现：备抵GL配置不是坏账子账 | 准备/核销/恢复/收回，OQ07 |
| FG-16 | 未实现：无库存数量/成本 | 模型/负库存/暂估，OQ04 |
| FG-17 | 未实现：无库存重算/结算/标记 | 成本事实与来源调整，OQ04 |
| FG-18 | 未实现：无标准/移动平均引擎 | 价格差异与重估，OQ04 |
| FG-19 | 未实现：无盘点/生产WIP | 守恒/批准与成本，OQ04 |
| FG-20 | 未实现：无税码/税行 | 税基/抵扣/舍入，OQ05 |
| FG-21 | 未实现：无条件税/自计税 | 税时点与触发，OQ05 |
| FG-22 | 未实现：无税期结算/预提税 | 更正/留抵/付款税，OQ05 |
| FG-23 | 未实现：外币交易/汇率引擎尚无；M-CORE候选仅预留法人币种/精度/三币行槽位 | 交易币仍须等于会计币，报告币不同明确未折算，不能称外币会计已可用 |
| FG-24 | 未实现：无外币未结项 | 连续重估/实现差额，OQ06 |
| FG-25 | 未实现：现金GL不是银行子账 | 付款方法/桥接/支票，OQ07 |
| FG-26 | 未实现：无流水/银行匹配 | 对账/时间差/批准调整，OQ07 |
| FG-27 | 未实现：无预测来源/引擎 | 预测假设/刷新，OQ07/10 |
| FG-28 | 未实现：资产/备抵科目不是资产卡 | 取得/账簿/资本化，OQ08 |
| FG-29 | 未实现：无折旧计划 | 惯例/残值/去重，OQ08 |
| FG-30 | 未实现：无资产处置/转移 | 原值累计额/拆分，OQ08 |
| FG-31 | 未实现：无租赁计划 | 现值/负债/费用模式，OQ08 |
| FG-32 | 部分：TASK01/03手工预付/应计及调整 | 四类计划/自动冲回/跨期去重，OQ03/08 |
| FG-33 | 未实现：无分摊/履约计划 | 来源基数/比例，OQ08 |
| FG-34 | 部分：旧单月教学关账保留；候选新增月冻结/模块准入/队列义务阻止 | 多模块关账、次年承前及年结重跑仍待 |
| FG-35 | 未实现：M-CORE法人隔离不等于公司间成对业务 | 双边原子凭证、往来映射与配对仍待 |
| FG-36 | 未实现：无IC贸易/集中付款 | 双边业务与配对，OQ09 |
| FG-37 | 未实现：无合并账/映射抵销 | 集团边界/内部利润，OQ09 |
| FG-38 | 未实现：无CTA/NCI | 折算/持股，OQ06/09 |
| FG-39 | 部分：旧总账/三TB/财报/下钻/六勾稽；候选新增法人币种、月/YTD及正常方向报表 | 全业务子账勾稽、现金流及更多报表口径仍待 |
| FG-40 | 未实现：无现金流量表/比率 | 分类/非现金/公式，OQ10 |
| FG-41 | 未实现：GL平衡不是跨子账对账 | 实际子账/待转/处置闭环，依启用对象 |
| FG-42 | 部分：旧凭证/规则快照/六勾稽；候选新增配置与源审计、完整性/封印和已核ERP备份 | 未来业务操作审计仍随模块补齐；不抵御文件管理员，不是审计认证 |
| FG-43 | 部分：TASK03内置三练习/独立验证 | 完整固定主线和独立错误/方法分支，OQ10 |
| FG-44 | 部分：TASK02/04/05受限真实Copilot讲解/草稿 | 跨新增模块事实与诊断/质量验证，依已启用对象 |

### 决策、并行与下一步

OQ01-10的普通政策决策已由用户委托，POLICY-01记录可调整默认。历史PLAN-44-DESIGN-01只释放FR139-A/B、FR142-A，不是全44范围G3PASS；新M-CORE须审查FR-C01..08、D-CORE及TC-C01..12后才实施，其余里程碑仍分别审查。

历史PLAN44任务统计：**15项=15完成，0实施中、0就绪未启动、0等待前置**，不包含顶部新增TASK16..19。TASK11（UI下钻）与TASK12（服务端只读勾稽）按文件边界并行完成限定G5；TASK13随后完成组合G6及安全本地交付。详见[tasks](tasks.md)。该历史批次剩余清零；新里程碑以顶部实际门禁为准，不伪造ready任务。

PLAN44曾经过独立文档审查，保留MODEL01。当前公开版仍保留44个目标、需求/验收编号和任务依赖；计划用例不冒充执行结果。未公开来源及机器交付日志已移除，可从本目录阅读公开产品文档，不依赖个人会话文件。

文档工作已并行：一个只读分析者检查44FG/来源依赖，作者核实际TASK01-10证据并统一编辑；独立评审另行执行，不在同一checkout多个写者。未来自然泳道为采购、销售、库存/税/外币、银行、资产期末、公司间合并；**不是同批全部可编码**。模块契约、政策和业务前置先定；共享schema/规则/未结项的改动交集必须串行集成。真实任务级并行批次在G3后列入[tasks](tasks.md)，FG能力网络不能当成“整FG完成”前置链。

## Confirmed identity and historical first-release scope

- Repository: https://github.com/lingshf/ai-native-erp
- Working root: the current clone; no machine-specific location is required.
- Existing independent local copies are not automatically linked to this repository. Do not overwrite them or change their Git configuration as part of publication.
- Decision source: the user, through this project's conversation.
- Existing baseline: initial empty commit and locally installed developer agent only.
- Confirmed first release: local, single-user browser application without login; persistent teaching books; manual journals, posting, ledger, trial balance, adjustments, closing, balance sheet, income statement and equity summary.
- AI: natural language to reviewable draft journals and contextual teaching explanations; preserve OpenAI-compatible configuration and add official Copilot SDK for the user's subsequent request to reuse this host's AI access.
- Accounting: generic accrual accounting and double entry; educational only, not jurisdictional or standards compliance.
- Excluded: receivables/payables and other business subledgers, cash flow statement, multiuser/server deployment, taxation, multicurrency, production finance, autonomous AI posting.
- Commit and push only on explicit authorization; this publication was authorized for a non-force push to main. No PR was requested.

## Model plan and exception

- Author: actual runtime model `gpt-6.1-sol`.
- Requested independent reviewer: `claude-opus-5.5`, explicitly selected by the user.
- Host mechanism: `task` tool with the requested model and read-only review agent.
- Capability probe returned successfully, but the reviewer reported its runtime did not expose actual model identity. A request value is not proof of actual model.
- User explicitly approved this alternative: retain independent calls requesting `claude-opus-5.5` for design, increment and final review, disclose actual identity as unverified, and do not waive acceptance, tests or blocking findings.
- Applicable review gates must remain `EXCEPTION (user-approved)`, never full model-policy compliance.
- Risk: high for accounting integrity, close-period state transitions and AI trust boundaries. Use stronger-reasoning independent review at each affected gate, focused deterministic tests and real local API checks.
- Actual reviewer identity remains open under the approved exception, not silently resolved.

## Document map

- [Requirements](requirements.md)
- [Design](design.md)
- [Test cases](test-cases.md)
- [Review evidence](reviews.md)
- `tasks.md` must only be created after the document review gate releases scope.

The historical business exclusions above describe the original release, not today's FG01-44 implementation authorization. Local-only nonproduction operation and no autonomous AI posting remain current boundaries.

## Historical checkpoints

Current documentation-only baseline model plan BEFORE authoring: user asks complete44-goal requirements, accurate completedTASK01-10 and local progress/parallel decomposition. Authoractual `gpt-6.1-sol`; one read-only explore agent independently maps the pinned source-goal analysis while author reconciles actual prior evidence; only author writes shared docs. IndependentG3/finaldocsreview request user-approved `claude-opus-5.5` via task, actualidentityunverified MODEL01exception persists. Risk high for scope/policy/status misrepresentation, not runtime changes. G3 must distinguish reviewed clear requirements from blocked policy-dependent scope; never approve all44 implementation by default. Local baseline `files\properties-local-delivery-final.json`; no runtime edits/restart/DB/env/credentials/commit/push/PR. Currentgoalcoverage/plannedtasks/docsvalidation are next; earlier checkpoints below remain historical.

TASK10 model plan recorded BEFORE design: user-directed FG01 accounting-property foundation, actualauthor `gpt-6.1-sol`; independentG3/G5/G6 request user-approved `claude-opus-5.5` via task, actualidentityunverified existingMODEL01. Highrisk accounting explanation/CAS/source fingerprint, strongerreasoning reviews/testfirst. Reuse existing active/manualAllowed controls, no new control-subledger flag or pretend automaticclearing. Boundednormal-side/contra-pair explanation, preserve immutabletypes/eightbuiltins/monthclose/amounts/ID3. SourceFG01 andpinnedS02§1/2/5.2 actuallyreread. Local delivery baseline `files\structure-local-delivery-final.json`; no commit/push/PR.

CurrentTASK10complete: G3/G5/G6 PROPERTY-DESIGN/INCREMENT/FINAL-01 releasedMODEL01withpretestclarifications;3expectedmissing-methodfailures, thennewdomain/API/UI+4focusedcases, final48tests/syntaxPASSafteractualnegativezero/syntaxfixes. IsolatedactualUI config/CAS/errorpreservation/grossnet/oppositebalanceallowed/manualpost/monthclosePASS; helperstopped.4173newreportsBrowserreadonly/original3records+ID3exact, no newrealAI. G6combinedA1-A7verificationPASS; safe22-filelocalhashdelivery12updated/10same/0conflicts, target27domain/syntaxPASS, evidence-onlyfinalsync/fullhashaudit. No remainingTASK10item; finiteA1-A7teachingfoundationclosureconditionsmetunderMODEL01. FullFG01-07remainpartial/advancedextensionsseparate. Latest `README.md`, `design\reviews.md` PROPERTY-FINAL-01, sessionfiles\properties-local-delivery-final.json /properties-local-delivery-audit.json. Workroot/authorizedlocaltargetabove.

PreviousTASK09complete: independentG5andcombinedG6compliance+qualityPASSunderMODEL01,44tests/syntaxPASS; isolatedactualUI/old-draftcorrection/required+combo/sourceCAS+HMAC/snapshot+legacyreceipt/history22.50PASS, helperstopped.4173restartedwithnewstructurepageBrowserreadonly,0structures/original3journals/periods/ID3draftexact; no newliveAI. Safe22-filelocalhashdelivery12updated/10same/0conflicts, target24domain/syntaxPASS; evidence-onlyfinalsync/fullhashaudit. No remainingTASK09item; FG02partial. HistoricalSTRUCTURE-FINAL-01/sessionfiles\structure-local-delivery-final.json andstructure-local-delivery-audit.json; currentTASK10above.

TASK09 model plan recorded before design: actualauthor `gpt-6.1-sol`; independentG3/G5/G6request user-approved `claude-opus-5.5` via task, actualidentityunverified MODEL01exception. Highrisk shared accounting constraints/lateAI validation/stale-source tokens/exacthistoricalreversal, strongerreasoning independent review and testfirst. SourceFG02/source02§5.3-5.6 and04§6 reread at pinned [private reference withheld]. Exactaccount opt-in required/optional dimension segments and explicit allowed tuples only; no ranges/overlap, defaults/derivation/balancing/attributedclose. Newemptyconfigurationtable, no oldline/catalog backfill. All ordinary account write paths share deterministic validation; exactsource-checked system reversal/monthclose preserve historic behavior. Local baseline `files\posting-local-delivery-final.json`; existing4173/ID3 remains readonly. G3 STRUCTURE-DESIGN-01 released MODEL01exception withsixclarificationsbeforetest/code. Three intendedmissing-methodtestfirstfailures preceded44/44fullregression/syntaxPASS. Currentreleaseevidenceabove, no newrealAIcall.

Current authorized increment TASK08: one explicit teaching `cash_service` event (existing cash service revenue example), maintained teaching-service/group identities, specific-service > group > all revenue-account rules, explanation, same-engine nonmutating preview and atomic confirmed posting/idempotent source reference. This adapts source04§1/3/6/7 and source03§8 synchronous principles; it is not AR/invoice/subledger implementation or fullFG04/05.
Model plan before design: actualauthor `gpt-6.1-sol`; independentG3/G5/G6requests `claude-opus-5.5` via task, actualidentityunverified existingMODEL01exception. Highrisk shared accounting generation, stale detection, atomic commit/idempotency and source traceability; additiveonly, no oldbook/default rules/events migration, testsbeforecode and35baseline. Local baseline sessionfiles\dimensions-local-delivery-final.json; preserveID3/monthclose/dimensions, no newAIauthority/realinference. Ordinary teaching choices delegated, no open policy question dependent on subledgers.

TASK08completedwithMODEL01exception:40/40fullregression/syntaxPASS; independentG3/G5/combinedG6compliance+qualityPASS/nofindings; isolatedactualUI/staleform+config/lost-response-idempotentretry/sourcehistoryPASS. Persistent4173restartedandnewpagebrowserverifiedreadonly, original3journals/periods/unknownID3unchanged; nonewAIcalls. Safe22-filelocaldelivery12updated/10identical/0conflicts; target21domain+syntaxPASS; finalmanifestfullhashaudit. LatestREADME.md/design\reviews.md POSTING-FINAL-01 andsessionfiles\posting-local-delivery-final.json. No remainingTASK08item; firststagegoalsremainpartialbelow. No committed/pushed/remote delivery.

Previously delivered TASK07: partialFG02 catalog, optional journal dimensions and one-dimension ledgerfilter. Chart/monthlyadmission dependencies available; no advanceddefault/derivation/requiredness/balancingdimension/subledger. Model plan recorded before design: actualauthor `gpt-6.1-sol`, independentG3/G5/G6requests `claude-opus-5.5` through task, actualreviewidentityunverified MODEL01exception. Highriskimmutableattributes/latevalidation/reversals; additiveonly.

PreviousTASK07deliveryevidence:35/35tests/syntaxPASS, G3/G5/G6releaseunderMODEL01; isolatedbrowserPASSincludingAItransfermock and inactivefilterlabelfix independentlyclosed. Then4173browser showed维度配置; canonical3journals/periods/unknownID3unchanged. Local22filehashsyncverified13updated/9same/0conflicts againstpreviouschartmanifest; target17domain+syntaxPASS. No outstanding item inTASK07. Historicalreview DIMENSIONS-FINAL-01; sessionfiles\dimensions-local-delivery-final.json. SupersededbyTASK08latestcheckpointabove.

### Finite phase-A exit and distinct full source-goal status

Finite teaching-foundation release exit (not complete source goals; no optional item added as a blocker):

| Exit | Required observable behavior | Actual evidence |
| --- | --- | --- |
| A1 | Protected/custom chart, active/manual control, normal side/contra signed explanation | TASK06 andTC33-36;48tests, TASK10realUI |
| A2 | Explicit dimensions, immutable maps/history/filter, required/allowed exact structures | TASK07/09, TC21-24/29-32, retainedin48tests; priorisolatedrealUI |
| A3 | Accounting-date/open-month enforcement, immutable monthlyteachingclose/carry | OriginalTC01-08/current48tests; TASK10actualUIclose, no yearmode |
| A4 | One real cash-service object/group/all matching, conflict and reason | TASK08/TC25/retained48tests andactualTASK08UI |
| A5 | Same-engine preview/confirm, globalstalechecks, atomic durableidempotency | TC26-27/30/34, retained48tests; TASK08lost-responseactualUI |
| A6 | Immutable original journal/source snapshots and exact historical reversals | TC01-08/22/27/31/35/current48tests; actualexistingUI |
| A7 | Shared server/lateAI checks, no AI accounting/tools authority, oldbook/UI/localdeliver | Current48/syntax/SDKcontract andearlierrealfictionalAI; TASK10UI/preview/G6PASS;22files0conflicts/target27domain+syntaxPASS/fullhashaudit |

A1-A7 nowhaveactualcode/test/UI/finalreview/localdeliveryevidence: this finite teaching-foundation release meetsclosureconditionswithMODEL01exception. The following full source-goal residuals are separately scheduled OPTIONAL next-stage expansions, not endless additions to this exit. This is not a claim all44goals or FG01-07 are implemented.

| Goal | Actual status | Remaining |
| --- | --- | --- |
| FG-01 | Partial delivered: custom chart/protection/flags; normal-side/current-config contra signed gross/net explanation | Rich reporting categories, control subledgers/clearing/suspense workflows/statistics/sharedCOA/legal entities |
| FG-02 | Partial delivered: catalog/maps/history/filter; opt-in exact-account required/allowed-tuple structure with shared controls and immutable source snapshots | Defaults/derivation/fixed/effective dates/range or conditional structures/balancing and attributed close |
| FG-03 | Partial: existing monthly admission and immutable close | Distinct business/tax dates, fiscal calendar, explicit new lock/year-end modes |
| FG-04 | Partial delivered: cash-service event, maintained service/group/all rules, priority/conflict explanation | Other object/event rules, two-axis matching, effective dates and broader accounting setup |
| FG-05 | Partial delivered: same-source cash-service preview/confirmed synchronous posting | Other business objects, transfer completeness/async reconciliation; close preview alone is not business preview |
| FG-06 | Partial: immutable GL and exact linked reversal, dimensions preserved; immutable cash-service source snapshot | Broader business identities/corrections/red entries/subledger cancellation |
| FG-07 | Partial: amount/account/period/dimension controls and user confirmation | Role approvals/object matching/budget/other policy controls |

### Previously delivered chart increment

Previous increment: user authorized development after the44-goal analysis. Delivered bounded FG-01/FG-07 account configuration plus journal/report/AI integration (partial FG-39/44), not all phase-A goals. Preserved eight seed accounts and monthly teaching close semantics, all existing books and unknown draftID3. That increment added no dimensions/subledgers/year-end mode or migration of existing amounts/history.
Model plan before authoring: author runtime `gpt-6.1-sol`; request independent `claude-opus-5.5` via `task` for G3, increment and final review, actual reviewer identity remains unverified under previously approved MODEL-01. Risk high (accounting classification, additive metadata, posting controls); use focused test-first domain/API cases,26 existing regressions, legacy database restart checks and isolated browser acceptance. Develop in the isolated root; safely synchronize only files matching prior delivery hashes to the authorized local destination. Scope/ordinary choices delegated by user; no critical business-policy question blocks this independent increment.

Previous delivery checkpoint: TASK06complete;31tests/syntax andindependentG5/G6passedunderMODEL01. Browser/previewpreservedID3. Local22filesverified12updated/10same/0conflicts; destination14domain+syntaxPASS. That chartincrement had no remainingdefect. Basicdimensions followedasTASK07above; eventrules/preview andadvancedfoundation stillremain.

### Previous release evidence (TASK-01..05)

Stage at previous release: all five original tasks complete. FR-11 and the discovered monetary-scale correction passed independent design, increment and combined final review under MODEL-01 `EXCEPTION (user-approved)`; no unresolved findings.
Implemented: official SDK 1.0.31 text-only isolated provider alongside existing OpenAI support; actual model catalog and isolated session select `gpt-6.1-sol`. Authentication is supported `env` access, not proven persistent CLI login; no private credentials/configuration were read/exported, no global CLI/account changes.
Evidence: all 26 tests and syntax checks pass; five real fictional calls, including a failed money-scale quality check and a rejected invalid-account proposal, are recorded rather than hidden. Corrected teaching reports 2,000 units; final valid draft is balanced 10.00/10.00. No live call saved/posted anything. Independent combined reviewer reran 25 tests/checks; correction reviewer verified seven focused SDK tests, closed all three minor findings and confirmed unchanged runtime/final release.
Preview: owned detached server restarted at http://127.0.0.1:4173 with ignored nonsecret `.env` selecting Copilot/gpt-6.1-sol. Served app equals reviewed source. At restart, two seed journals/open2026-11 had identical pre/post SHA256. A later read detected a new ordinary draft ID3 dated2026-11-15; its origin was not verified in this session and it was preserved. Final scoped digest confirms original two seed journals and periods unchanged, with the additional draft retained.
Persistence roles: development source and the running 4173 preview stay in the isolated working root. The user-authorized local code delivery destination is `<local-copy>`; README contains commands to run that independent copy on 4174. Delivery uses an explicit file allowlist and per-file hashes, preserves target Git/unrelated files, and never copies `.git`, dependencies, preview databases, credentials or runtime state. An absent target `.env` may receive only the confirmed nonsecret provider/model settings. No commit/push/PR or repository relocation is authorized.
Previous delivery: browser AI page showed copilot/gpt-6.1-sol and the current data-sharing/zero-tool disclosure. README and review records contain startup, live evidence and limitations. Subsequent user authorization is the bounded foundation increment described above, not all business modules.
Outstanding limits: actual reviewer identity and mobile layout unverified; host environmental authentication may expire or be unavailable in another terminal. Model responses can still fail validation and are not an accuracy guarantee.
