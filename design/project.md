# ai-native-erp

公开版保留产品范围、进度及通用ERP规划；私有研究原文、案例/答案、机器路径与宿主交付日志不包含在仓库中。下文TASK历史仅说明限定产品增量，原本机操作证据不是公开仓库的一部分。

## 历史TASK15：主题与双语label（用户确认）

新授权：默认红色主题，可选绿色；中文/英文切换，所有显示label外置为每语言资源并按key引用。本机主题/语言偏好持久，原科目/输入/AI及账务数据不改。主题仅CSS变量；错误/不平衡以!+文字+差额及独立警示色识别，不与红主色混淆。语言默认中文。

TASK15交付时：15项任务为12完成、2设计就绪未启动、1等待前置、0实施中；原44FG仍0整体完成/13部分/31未实现。工作区/本地/独立评审各实际62/62及8项语法PASS，独立G3/G5/组合G6已释放MODEL01例外；内存累积Medium已根治并独立复核。真实隔离红/绿和中/英截图、输入与迟到AI保留/零账务写、重载持久及390px视口已验证。本地28文件15更新/4新建/9相同/0冲突，原.git/env/账套保留。4173为新增label路由重启同一工作区/同一data后，实际浏览器已加载红色/中文新版本，原3凭证/ID3/期间canonical哈希不变；会计模块剩余与OQ未因此完成。

设计前模型计划：作者实际gpt-6.1-sol；全UI label迁移/异步DOM及隐私提示为中风险，沿已批准MODEL01机制请求claude-opus-5.5独立G3/G5/G6，实际评审身份未核实则保留例外。开发仍当前worktree，交付基线erp-ui-local-delivery-final.json，原3凭证/ID3/期间保护，不提交推送PR，不展开TASK11-13。

## 历史TASK14：ERP工作台与可选教学（用户确认）

产品定位为ERP，同时提供可关闭的教学辅助；不因定位变化声称已有完整应收/应付/库存或生产合规。用户确认业务分组导航、精简说明、设置/业务分离、凭证空白科目与金额占位、可见维度/醒目差额、就地AI起草/报表解释、全局期间和本机教学偏好。默认教学关闭，localStorage仅存on/off，不改账务、默认账套或既有ID3。TASK11-13仍独立待办，本轮不实现试算下钻/勾稽接口。

历史TASK14完成：G3/G5修订及独立组合G6已释放MODEL01例外，56/56+语法PASS、实际隔离浏览器与前后截图/窄视口；本地24文件12更新/1新建/11相同/0冲突、依赖本地恢复后56/56+语法PASS。当时原会计引擎/server/SDK与3凭证/ID3未变，仅刷新静态界面无需重启。TASK15新增静态路由不适用“无需重启”的旧结论。TASK14任务剩余清零，其他业务与3个规划任务未完成；历史审查见ERP-UI-FINAL-01。

模型计划（设计前记录）：作者实际gpt-6.1-sol；UI/异步AI/本机偏好为中风险，采用现有作者实现、独立设计/增量及组合最终审查请求claude-opus-5.5，宿主实际评审身份仍不可核实，保留MODEL01用户批准例外。沿现有task工具审查，不声称会话切换agent。本轮在当前隔离工作区实施，完成后按plan44-local-delivery-final.json基线安全交付用户本地目录；旧账/不可编辑过账/确认语义不变。

## 本地进度总览（PLAN-44，完整目标入口）

### 当前执行：TASK11–13 只读报表切片

用户已授权继续开发此批次及验收后的公开main快进发布。沿既有FR-139-A/B、FR-142-A与D-READ-A/B/C的G3限定基线，不扩展OQ01–10政策依赖范围。TASK11与TASK12按UI/服务文件边界并行，TASK13在两者G5释放后串行集成；共享文档由集成作者维护。

模型计划：集成作者实际gpt-6.1-sol；只读但会计解释易误导，风险中等。实现使用宿主任务子代理，独立G5/G6审查请求claude-opus-5.5；请求不等于已核实实际模型身份，继续保留用户批准MODEL01例外。新UI文字进入中英文label资源。当前已完成READ-G5-A-01及READ-FINAL-01，独立spec/quality通过并按MODEL01释放；原账套、未知草稿与过账/关账语义保持不变。

**PLAN44是产品规划基线；TASK14/15改进ERP界面，不扩展会计模块。** [完整需求与OQ决策](requirements.md) · [架构与并行边界](design.md) · [计划验收](test-cases.md) · [任务](tasks.md) · [公开验证记录](reviews.md) · [公开范围索引](source-analysis.md)。

当前**44FG整体完成0、部分覆盖13、未实现31**；功能覆盖与政策待决是两个维度，不将“待决”当作实现程度或虚构百分比。TASK11–13已完成，不等于任一FG整体完成。旧A1-A7有限底座收口仍成立。Book新增同快照只读勾稽，server新增GET接口；SDK/数据库schema/账务写边界不变。工作区、本地及独立评审实际各80/80与8项语法检查通过；独立G5/G6释放MODEL01例外。28文件哈希保护交付无冲突，原4173同账套重启后API/静态资源匹配、3凭证/ID3/期间保持。

下表为当前完整FG覆盖；“部分”的已实现子集有TASK/评审证据，其余以FR-101..144为目标，不能直接激活代码任务。OQ见需求文档。仅FR139-A/B、FR142-A只读切片通过本轮限定G3规划门禁；所有未决范围保持BLOCKED，未来实施仍须启动授权。

| FG | 当前覆盖与实际已实现子集 | 剩余目标/门禁 |
| --- | --- | --- |
| FG-01 | 部分：TASK06/10科目、状态控制、正常方向/备抵解释 | 报表类别/控制子账/清算暂记/法人，OQ02/09 |
| FG-02 | 部分：TASK07/09维度行、历史筛选、精确必填/组合 | 默认/派生/固定/有效期/平衡维度与归属结转，须独立设计 |
| FG-03 | 部分：TASK01开放月/会计日/月度教学结转 | 多日期/日历/月冻结/年结，OQ03 |
| FG-04 | 部分：TASK08现金服务对象/组/全部规则与解释 | 其他业务事件/多轴/有效期，OQ01/04/05 |
| FG-05 | 部分：TASK08同源预览/原子幂等/不可变回执 | 通用业务/异步转账完整性，OQ01/02 |
| FG-06 | 部分：TASK01/07/08不可变GL/维度/来源/精确冲销 | 子账取消与业务纠错、跨法人，依实际对象 |
| FG-07 | 部分：TASK01/02/06/09写边界/结构/用户确认 | 审批/对象匹配/预算等政策，OQ02/07 |
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
| FG-23 | 未实现：仅单一教学单位 | 币种/汇率/精度，OQ06 |
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
| FG-34 | 部分：TASK01单月关账/承前/草稿阻止 | 多模块关账/月冻结/年结重跑，OQ03 |
| FG-35 | 未实现：仅单账本 | 多法人双边往来，OQ09 |
| FG-36 | 未实现：无IC贸易/集中付款 | 双边业务与配对，OQ09 |
| FG-37 | 未实现：无合并账/映射抵销 | 集团边界/内部利润，OQ09 |
| FG-38 | 未实现：无CTA/NCI | 折算/持股，OQ06/09 |
| FG-39 | 部分：TASK01/03总账/三TB/财报；TASK11–13同月科目下钻/六项只读数学勾稽及展示 | 完整维度/业务来源/更多报表口径仍未实现 |
| FG-40 | 未实现：无现金流量表/比率 | 分类/非现金/公式，OQ10 |
| FG-41 | 未实现：GL平衡不是跨子账对账 | 实际子账/待转/处置闭环，依启用对象 |
| FG-42 | 部分：TASK01/08不可变凭证/原事件规则快照；TASK12/13六项数学诊断及展示 | 配置变更日志/业务审计更广，OQ02 |
| FG-43 | 部分：TASK03内置三练习/独立验证 | 完整固定主线和独立错误/方法分支，OQ10 |
| FG-44 | 部分：TASK02/04/05受限真实Copilot讲解/草稿 | 跨新增模块事实与诊断/质量验证，依已启用对象 |

### 决策、并行与下一步

OQ01-10均为OPEN事项组，不等于10个单一政策决定。先确认下一业务切片再澄清其相关政策即可，不要求一次决定所有模块。PLAN-44-DESIGN-01已完成本轮独立审查并落实3项澄清；文档完整性/质量PASS，G3只释放FR139-A/B、FR142-A规划切片，沿MODEL01例外。政策依赖范围保持BLOCKED，不是全44范围G3PASS。

任务统计：**15项=15完成，0实施中、0就绪未启动、0等待前置**。TASK11（UI下钻）与TASK12（服务端只读勾稽）按文件边界并行完成限定G5；TASK13在其后串行集成并完成组合G6及安全本地交付。详见[tasks](tasks.md)。本批次剩余清零；OQ依赖的未来里程碑保持待决，不因此另加ready任务。

PLAN44曾经过独立文档审查，保留MODEL01。当前公开版仍保留44个目标、需求/验收编号和任务依赖；计划用例不冒充执行结果。未公开来源及机器交付日志已移除，可从本目录阅读公开产品文档，不依赖个人会话文件。

文档工作已并行：一个只读分析者检查44FG/来源依赖，作者核实际TASK01-10证据并统一编辑；独立评审另行执行，不在同一checkout多个写者。未来自然泳道为采购、销售、库存/税/外币、银行、资产期末、公司间合并；**不是同批全部可编码**。模块契约、政策和业务前置先定；共享schema/规则/未结项的改动交集必须串行集成。真实任务级并行批次在G3后列入[tasks](tasks.md)，FG能力网络不能当成“整FG完成”前置链。

## Confirmed identity and scope

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

## Checkpoint

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
