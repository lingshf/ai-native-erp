# Test cases

## TASK15实际执行记录（TC41-44）

迁移前聚焦命令28项22过/6失败；实现后全回归62/62与8文件语法通过。覆盖资源key/参数/隐式转换、HTML/app无内联语言、默认/持久主题语言、全部偏好失败聚合及可用英语提示、写失败保留旧值、全部10视图及教学开关下英文非数据文本/属性、正常方向/备抵/停用后缀、服务端诊断原文与本地前缀、未保存表单/业务预览/异步AI候选零自动写。标题真实浏览器发现已修复，并增加非同文label的TITLE切换回归。

真实隔离浏览器两组主题/语言截图、重载持久、zh请求等待时切en再收到同面板AI候选、账务零写与state不变、390px真实iframe无溢出均已执行；本机mock不是本轮真实AI连接证据。G6发现内存累积后改WeakMap，实际200,000绑定/0语言切换堆测量并独立复核，最终组合PASS。本地实际62/62+8文件语法PASS，4173重启同账套后原3凭证/ID3/期间哈希相同，真实浏览器已加载新版本；具体命令和限制见reviews顶部。

## 主题与双语验收（TC41-44 / FR33-35）

- TC-41：无偏好默认red/zh；选择green/en后重载保留，教学偏好独立；损坏值/读写失败提示且不假保存。三项getItem全部抛错时合并notice必须同时列语言中文/主题红/教学关闭，不被最后一条覆盖。主题CSS值改变，警示!+方向/差额不与主色混淆，0写账。
- TC-42：zh/en资源key及插值参数一一对应/缺key参数明确失败；app/index无直接显示硬编码label，新增模块HTTP白名单+同源CSP及语法通过。中文界面无重复英文装饰，英文label涵盖导航/按钮/表格/选项/占位/aria/隐私/确认/状态/空态。
- TC-43：在凭证/科目/维度/服务规则/业务录入输入未保存值，切语言/主题保持同一输入节点/值/编辑目标/维度选择；已展示AI候选/业务preview继续可用、未自动调用/保存。切换后按钮/风险/金额差额/正常方向用途组合列/停用后缀及aria更新语言；逐页扫描非data文本节点/placeholder/aria，无遗留中文，所有data节点快照字节一致。示例摘要填入时固定为当前语言可编辑数据，之后不随UI翻译。中文及英文切换后保存仍需原明确动作。
- TC-44：实际隔离浏览器红/绿、中文/英文截图；英文执行候选/配置/预览路径、插值/错误/确认不显示key或undefined。4173原期间/3凭证/ID3只读哈希不变，实际刷新已加载新版本；不以mock宣称新真实AI质量。

TC43预编码补充：先触发API原始中文诊断，切en后检查翻译前缀与单独data诊断原文，不能整个notice标data；held AI请求在zh发送、切en后再release，同一面板接收候选/英文操作前缀，不新增调用或写入。客户端提示仍属于label绑定而不是原始data。

## ERP工作台验收（TC-37..40，FR-29..32）

当前执行：改UI前5项聚焦DOM测试5失败；实现后53、54通过。增量审查暴露维度状态隐藏/试算显示口径错误及隐私/不可逆提示缺口，新增回归先失败。修订后首个56项运行3项失败（两处旧测试只取第一条essential、维度版本误写0），改为遍历必需内容及真实版本1，不删除断言；最终实际 `npm test && npm run check` **56/56、0跳过、全部语法PASS**。含8项真实DOM用例，切月迟到/离页迟到/非法精度均有执行。

- TC-37 / FR-29：默认ERP概览/分组导航/全局唯一期间/无序号及LOCAL标签；业务页无服务规则表单，设置可创建/更新同一配置；缺服务/规则/回执有下一步。原查询、配置、确认过账与关账仍可达，桌面/窄屏可操作。
- TC-38 / FR-30：无偏好默认关闭、打开恢复路径概念卡、重载持久；关闭隐藏教学辅助但保留权限/不可逆/隐私/口径。明确检查AI隐私/密钥警告、凭证过账不可改、科目编号/类型不可变仍可见。切换时未保存日记账/业务/配置输入不丢、没有写API；localStorage读/写抛错显示错误，不冒充已保存。原期间/凭证不变。
- TC-39 / FR-31：新建/清空均空科目/空金额，已有/示例/AI保留；借10/贷3显示差7借方较大，借3/贷10显示差7贷方较大，相等/非法精度可识别；无维度显示设置入口，有维度直接显示输入，空科目不能误选现金。旧草稿保存/确认逻辑回归。
- TC-40 / FR-32：工作台受控AI返回后无新增凭证，明确采纳只填编辑器；正在编辑旧草稿时采纳须确认并清editingId，下次保存创建新ID、旧草稿不变。报表行带正确期间/科目/金额/口径且不自动调用。教学关闭仍可用。延迟返回前切月/离页，旧响应不填新表单；失败可见，未配置提示准确。每例新window显式执行脚本、stub scrollIntoView，先证导航/期间/工作区渲染后才断言无写/无调用，避免空跑。独立实际浏览器+截图验收；模拟结果不能当真实模型质量证据。

## PLAN-44完整目标验收（均为计划，不是执行证据）

TC-101..144与FR-101..144、FG-01..44一对一。每项应独立编写虚构输入与可计算的预期，不引用未公开案例；精确金额及算法依确认政策，不新增虚构容差。先校验输入/状态→非写入预览→明确批准→业务/GL/报表核对→重复/异常/历史；以下“预期”不是实际测试通过。原TC01-36的历史执行证据保留在后文，不把旧回归算作新业务验收。

| 用例 / FG | 正常步骤与预期 | 边界/异常及门禁 |
| --- | --- | --- |
| TC-101 / FG-01 | 创建用途/类别配置并核原值/备抵/分组/结转 | 禁止直接记控制科目、错误类型、历史不可改；高级用途待政策 |
| TC-102 / FG-02 | 默认→派生→固定→最终组合解释，按维度查询 | 缺必填/停用/冲突/重叠拒绝，标签不当平衡维度；高级顺序待定 |
| TC-103 / FG-03 | 原发票日与新会计日分开，按日历准入 | 无日历/禁止日期/永久关闭/非法重开拒绝；OQ03 |
| TC-104 / FG-04 | 对象/组/全部命中解释及分录来源可复算 | 缺失、同级/多轴冲突不兜底，验证版本/生效边界 |
| TC-105 / FG-05 | 同源预览与确认一致，原子状态及回执 | 旧版本/重启/双提交/异步未转不伪成功 |
| TC-106 / FG-06 | 来源→GL→精确纠错链，保留原行 | 重复/伪造/已过账编辑拒绝；业务取消独立验证 |
| TC-107 / FG-07 | 按对象行定位校验及批准状态 | 借贷平衡但匹配错误仍拦；审批/容差待OQ02/07 |
| TC-108 / FG-08 | 分两次收货，数量价值/未票应计核对 | 超收、重复、关期拒绝；OQ04数量与成本联合契约 |
| TC-109 / FG-09 | 发票匹配并清应计；费用采购不增库存 | 重复/价差超政策不留未结半笔；含税分支待OQ05 |
| TC-110 / FG-10 | 部分付款/折扣/预付款核销后余额可核 | 超余额/重复应用拒绝；银行支付状态不能从申请推断 |
| TC-111 / FG-11 | 关联原行退货/贷项及待批准发票 | 超量/重复/未批准状态拒绝；税与成本同步回溯 |
| TC-112 / FG-12 | 分交付/分开票，收入税COGS/数量对应 | 不重复计成本、禁止超交付/关期；成本政策待定 |
| TC-113 / FG-13 | 部分收款/预收应用/退回/仅贷项分支 | 重复核销/超额拒绝；仅贷项不产生假入库 |
| TC-114 / FG-14 | 服务开票无库存，账龄/利息依日期重现 | 到期边界、重复催费、未定利率明确阻塞 |
| TC-115 / FG-15 | 准备→核销→恢复/收回及控制科目核对 | 无余额/重复恢复拒绝，不重复计费用 |
| TC-116 / FG-16 | 同组收发按明确模型估值，数量守恒 | 负库存/缺成本按政策，暂估与最终财务成本分开 |
| TC-117 / FG-17 | 重算/结算/标记回溯原行及调整凭证 | 重跑幂等、非法关联/已结算状态检查 |
| TC-118 / FG-18 | 标准/移动平均独立计算PPV/在手差异 | 无成本版本/回溯错误拒绝，不混用模型 |
| TC-119 / FG-19 | 盘点与WIP投入/完工数量成本守恒 | 重复/无批准/异常差异定位，不替代原业务更正 |
| TC-120 / FG-20 | 税码交集/可抵扣性决定税明细和成本 | 缺码、生效期、舍入和零税率/免税区分 |
| TC-121 / FG-21 | 自计税及条件/预收税触发时点可核 | 重复触发拒绝，净零仍保留双边税证据 |
| TC-122 / FG-22 | 税期结算/更正/留抵/预提税链路勾稽 | 迟到归期、重复结算/付款税防重 |
| TC-123 / FG-23 | 三币金额/汇率来源、日期、精度重现 | 缺汇率拒绝，改现汇率不改历史 |
| TC-124 / FG-24 | 连续重估及部分结算区分实现/未实现 | 重复批次/双算差额、不同重估对象分开 |
| TC-125 / FG-25 | 付款方法/桥接/支票到实际支付状态一致 | 重复支票/不合法状态拒绝，申请非实际现金 |
| TC-126 / FG-26 | 流水匹配时间差/待记账分开、批准后复核 | 重复导入/未解差异不标完成，不暗中记账 |
| TC-127 / FG-27 | 预测可查来源/刷新/假设且零写账 | 过时来源标注，不冒充现金流/实际余额 |
| TC-128 / FG-28 | 取得来源/原值/账簿与AP不重复 | 重复资本化/错误账簿汇总拒绝 |
| TC-129 / FG-29 | 折旧提议→批准，方法/惯例可解释 | 残值/处置后/关期/重复期间拦截 |
| TC-130 / FG-30 | 调整/处置/拆分/转移并核原值累计额 | 守恒、重复处置和已处置再折旧拒绝 |
| TC-131 / FG-31 | 现值/负债滚动/利息与付款勾稽 | 时点与费用模式未定阻塞，重复支付拒绝 |
| TC-132 / FG-32 | 四类调整/摊销计划跨期及冲回守恒 | 计划总额/重复/关期/无源冲回验证 |
| TC-133 / FG-33 | 分摊来源目标守恒，履约不等同开票 | 零/负基数和未明比例拒绝；政策OQ08 |
| TC-134 / FG-34 | 启用模块关账清单、月冻结与年结分开 | 未解依赖/重跑期初去重，旧账不静默迁移 |
| TC-135 / FG-35 | 双法人账各自平衡且双边可配对 | 模拟单边失败不伪完成；法人不以维度替代 |
| TC-136 / FG-36 | IC贸易/付款归属配对追溯 | 漏单/重复分摊/币种日期差异明确定位 |
| TC-137 / FG-37 | 独立合并/抵销/内部利润处理可重现 | 缺映射/重复合并/未配对差异不覆盖原账 |
| TC-138 / FG-38 | CTA/NCI按持股/汇率政策与权益勾稽 | 缺持股/折算口径阻塞，不混同未结重估 |
| TC-139 / FG-39 | 试算下钻期初发生期末、报表净利权益勾稽 | 同期同口径、停用历史/差异不隐藏 |
| TC-140 / FG-40 | 现金分类/非现金项/比率公式可复算 | 分母零显式提示，三类净额=现金变动 |
| TC-141 / FG-41 | 子账/GL/待转差异→处置→复核 | 未解不标done，不靠手工抹平 |
| TC-142 / FG-42 | 原业务/版本/凭证证据链及只读诊断 | 缺证据不补造，“平衡但错”与审计边界明确 |
| TC-143 / FG-43 | 独立编写虚构主线及业务分支，逐项核对明确预期 | 不使用未公开案例，不污染原账，不把未实现分支声明可用 |
| TC-144 / FG-44 | 每个已启用模块只读事实/时点→AI候选→校验批准 | 编造/越权/工具请求/敏感外发拒绝，无真实证据不称真连接 |

### 下一批明确只读切片的可执行验收设计

TC-139-A：准备开放及已关月份、自定义及停用历史科目；分别在3类试算点击科目，检查同月同科目完整总账的期初/发生/期末与现有查询相等；不自动维度/阶段过滤，无写请求，无原账变化，非法查询错误不丢失。必须验证调整影响科目的未调整试算与完整总账差异，以及已关月损益调整后试算非零/完整总账期末零，页面说明差异是阶段口径而非漏账，不错误断言二者相等。

TC-139-B：在现有虚构账套检查D-READ-B固定6个ID（3个TB平衡+资产等式+权益期末+利润关系）及左右值映射、left-right、pass/allPass，值为安全整数分；受控只读快照替身分别制造每种差异应显示false/准确差额，不修改账套来造差异；无写入，缺月/非法月400，未知月404。不包括不存在的子账、税或现金流对账，利润同源关系不当作独立真实性保证。

TC-142-A：在页面显示所选月、全部逐项结果及非审计边界；切月不显示旧月成功，错误保留可见；与导航集成后独立浏览器验收，仍需未来实现后的回归/评审，当前没有执行证据。

## Accounting property acceptance (FR-26..28)

Actualexecution:3expectedtestfirstmissingmethodfailures;48/48fullregressions/syntaxPASSafternegativezero+syntaxfixes(noassertionweakening). IndependentG5/G6spec+qualityPASS/MODEL01. TC36isolatedactualUIconfig/cancel/invalidside409/CASpreserved/gross100-10=90/revenue20-2=18, realreversebalance20save/separatepost/flagonly andactualclose/nominalclosing0vsactivity18PASS; helperstopped.4173newreportsBrowserreadonly/0properties/original3records+ID3exact. Safe22-filelocalhashdelivery12updated/10same/0conflicts, target27domain/syntaxPASS, finalmanifest/fullhashaudit. FiniteA1-A7exittraceableinproject, sourceFG01-07remainpartial.

| ID | Setup/action | Observable result |
| --- | --- | --- |
| TC-33 | Empty/default properties; custom config/no-op/CAS; builtin/unknown account; malformed enums/revisions/fields; contra self/unknown/wrongcategory/chain; gross target becomingcontra/nondefaultnormal and contra targetingnondefaultgross | Defaultnormal direction correct; strict400/404/409 and atomic unchanged state; independentsettingsrevision; no builtin/type edits; relatedinactiveallowed; contra direction oppositecategory; manycontras per gross allowed |
| TC-34 | Asset gross100/contra10, revenue gross20/contra2; reverse-sign ordinary balance; multiplecontra grouping; change properties afterpreview includingABA; completed replay; sharedmanual/AI control | Original financial totals/TB/lines unchanged by configuration; separate gross100/adjustment-10/net90 and20/-2/18, normal-relative/negative flags accurate; reverse balance stillposts; stale source rejects and original replay works; normal direction not entry restriction |
| TC-35 | Tempdb properties persist/reopen; legacy tables absent/ID3; exact reversal afternormal-side/contra changes/disablemanual; monthly close and nextperiod/historical query | Empty additive defaults preserve original data, saved properties persist; no migration; close/reversal work; revenue explanation uses nonclosing activity afterclose; balance-sheet usesclosing, reports say currentconfig; prior44 preserved |
| TC-36 | HTTP properties guard/CAS/malformed, controlledAI context; isolated actualUI configure general/contra/invalid/cancel/stale error, oppositebalance and grossnet reports; readonly4173; hashguardlocaldelivery | Real observable config/report behavior, no inferred account/use/auto-post, no realAI; original3journals/ID3 unchanged; independentG3/G5/G6 MODEL01; fulltests/syntax/targetchecks and A1-A7 evidence |

G2authorcheck: FR26→TC33/35, FR27→TC34/35, FR28→TC34/36; isolated teaching amounts not source-case reproduction. All7finite exit checks must trace existing TASK06-09/originalGL/SDK plus this TASK10, not seven new modules. G3 PROPERTY-DESIGN-01 released MODEL01exception withpretestclarifications; tests/runtime not changed yet. TC35 specificallychecks nominalrowclosing0/noflagafterclose versus groupactivityunchanged.

## Dimension structure acceptance (FR-23..25)

TC32actualUI/G5/G6/previewPASS: invalidJSON/cancel/noautoconfig, explicitinactive/enable, olddraftmissingrequired409/invalidcombo409/correct10.00save+separatepost, source12.50fullsnapshot/HMACstale409, staleconfigCAS/textpreservation, currentv5doesnotrewritev3receipt/historyfiltered22.50, legacywithoutnewfieldview/replay200. Nativeconfirmharnessdisclosed, no realAI; helperstopped.4173readonlynewUI/0structures/original3records+ID3exact. G6independently44tests/check/spec+qualityPASSunderMODEL01; safe22-filelocaldelivery12updated/10same/0conflicts, actualtarget24domain/syntaxPASS andfinalmanifesthashaudit.

Execution:3testfirstmissing-methodfailuresbeforecode, then24domain/all44regression+syntaxPASS. TC29catalog/strict/CAS/10segments50tuples/optionalblank/unconstrainedotherdim, TC30ordinary+adjusting/latepost/eventconflictingpolicies/ABA/originalreceiptretry, TC31persist/reversal/inactivehistory/aggregateclose/legacyemptytable, TC32HTTPguards/heldAIrequired+combinationlateerrors/explicitpaircheck allpass. IndependentG3/G5/G6/actualUI/newpreview/localdeliverycomplete underMODEL01.

| ID | Setup/action | Observable result |
| --- | --- | --- |
| TC-29 | Empty old configuration; exact-account create inactive/activate/CAS/no-op;1-10segments/0-50tuples; unknown/duplicate/type/foreign/overlapping-by-exactaccount attempts, optionalblank vs wildcard | No automatic rule/backfill; singleaccount assignment, strict400/409; sortedcanonicalmaps; duplicate tuple rejection; inactive knownrefs can be disabled, active references must be enabled; unrelated dimensions remain allowed |
| TC-30 | Save old incomplete draft beforeenable; enable required DEPT and exact DEPT/COST pairs for expense/revenue/cash; ordinary save/edit/post and event preview/confirm; mutate config+restore; source completedreplay | Shared required/tuple check with line/account/revision diagnostic; failedpost staysdraft/zero balances; correcting/deleting draft explicit; no silentdefault/drop; invalidevent nojournal/receipt, oldtoken invalid includingABA, originalcompletedretry allowed undernewrules |
| TC-31 | Original posted lines before rule/inactive dimension; exact reverse after rules; monthly close; filtered/unfiltered historical query; tempoldschema+ID3/restart | Exact-source reversal bypass only after comparison, no caller spoof; aggregateclose stillworks withoutdims; old lines/history/reports retained; newtableemptyonoldbook, configpersists, oldreceiptswithoutstructurefieldreadable |
| TC-32 | HTTP route guards/CAS/malformed; heldfakeAI afterrequest tightenstructure; isolated realUI configure/enable/required+invalidcrosspair errors/correct/post, event snapshot, readonly4173, hashguardtarget | AI includesstructures but cannotinfer/autopost; revalidatesafterawait and fails502/no writes; all writepaths/explicitconfirmation/historicalviews correct; no persistentpreviewchanges, no realAI; original40 +focusedtests/syntax, independentG3/G5/G6MODEL01 and localdelivery verified |

G2authorcheck: FR23→TC29/catalog, FR24→TC30/32/sharedvalidation+signedsnapshot, FR25→TC31/32/history+UI+AI. Scope/ordinarychoices delegated; no need new business modules, user roles or year-close mode. G3releasedunderMODEL01.

PretestG3clarifications: `{}` validallowedtupleonlywhenallsegmentsoptional, meaningallblank; explicitemptystring/null tuple/linevalues400, keyomissiononlyblank. Includeadjustingjournal and cash/revenue conflictingstructures(no sharedmapcanpass) with409/zeroevents. Newplan `dimensionStructures` alwaysarrayof FULLactive applicableconfigs `{account,active,revision,segments,allowed}`, dedupaccounts in firstjournal-lineorder; inactive/no-config omitted (no appliedconstraint), emptyarrayifnone; oldreceiptmissingfielddefaultsdisplayonly. Diagnosticfirstfailinglineininputorder. Theseareacceptancerefinements, no changeofscope.

## Deterministic posting acceptance (FR-19..22)

| ID | Setup/action | Observable result |
| --- | --- | --- |
| TC-25 | Service/groupcatalog and all/group/specific rules; CAS, invalidaccount/category, missing/tiedmatches, restrictedwinningaccount | Deterministic specificity/explanation, strict400/409; no silentfallback/AIdecision; originalrulesnapshotsimmutable |
| TC-26 | Preview then confirm sameevent; editamount/date/reference/service/dimensions; change+restore rule/account/dimension/service; close/openperiod; restart | Exact sameenginepreview/postedtwo lines incldimensions; no previewwrites; each stale/forgedtoken409/currentvalidationfailure; oldpendingtokeninvalidafterrestart |
| TC-27 | Repeat/parallelconfirm same reference, same and changedpayload/token; restart/closedperiod retry; inject aggregate failure; SQL mutate source receipt | Exactlyone journal+receipt; sameoriginalretry returnsoriginal evenafterrestart/close, conflict409 otherwise; failure leavesneitherrecord; originalsource/rule/GLtrace preserved throughGLreversal |
| TC-28 | Oldschemafixture/newtables absent, full35regression; HTTP routeguards/malformedinputs; isolatedrealUI maintenance→preview→explicitpost→retry/history | Oldbook/ID3/periods/report/dimensions exact; previewnonmutating, visiblewinner/lines/source ref; stale config/formerrors visible, no autosave/post/AI calls; refreshed4173readonly andhashguardlocaldelivery. |

G2authorcheck: FR19=>catalog/matcher/TC25, FR20=>sharedplan/TC26, FR21=>HMAC/atomicreceipt/TC26-27, FR22=>UI/API/compatibility/TC28. No new businessmodule dependency. G3releasedunderMODEL01; executionevidencebelow.

G3releasedMODEL01; pretestrefinements: manualAllowedfalsewinnerfails(no subledgerbypass), tiecheckedfirstevenifoneblockedaccount; pureinputnormalizationwithoutcatalogchecks andcanonicaltwo-decimalamount/emptydimsomitted; signedfixedmemo. Previewusedreference409/existingreceiptquery; completedreplaybeforecurrentperiod/activechecks butsameoriginaltokenrequired. FullrulePUTcaneditmapping/scope/match; inactiveunusedmatchvalid. ReceiptinsertSQLrejectsclosing/reversal/draftjournals. Invalidcurrentplan400/409 distinctfromvalidplan+stale/malformedtoken409. UIhybridteachingdisclosure/reversaldoesnotfree reference. Includeintargetedcases.

Execution: TC25-27/focusedHTTPandlegacyTC28 passwithin40/40fullsuite, syntaxPASS. Confirmed3intendedmissing-methodfailuresbeforecode. Fournewdomaincases/oneHTTPcase cover strictsyntax/catalog/CAS, priority/ties/no fallback, normalizationalias, signedfixedmemo, input/ABA/period/restart invalidation, completedretryafterrestart/closedperiod/inactivedimension, originalrule snapshot, concurrentduplicateHTTP andno exposedtoken, aggregatefailure rollback, SQLsourceguards, reversalkeepsreference; extendedoldschemafixture dropsnewtablesonlyinitstemporarydatabase andpreservesoriginalID3.

TC28actualUI/previewexecutedPASS: isolatedUIcreatedservice+3rules, preview10.00/DEPT=OPS/priority1-3withoutwrites, changedinput/configreject, real11.00postfollowedbylostresponse/explicitretryonlyonejournal+receipt, originalrulesnapshotretainedafterconfigrev2, refreshpreservesinputs/requirespreview, usedref409. Nativeconfirmusesdisclosedisolatedharness; dimensionsfixtureviaHTTP.4173readonlynewUIandexact3journals/periods/ID3preserved. G5andcombinedG6independent40tests/check/compliance+qualityPASSunderMODEL01. Additionalauthorinmemoryprobe individuallychangedreference/date/service/dimensioneach409/no writes andSQLclosingreceiptguardPASS; missingperiod404preservesexistingbehavior. Local22-filehashguarddelivery12updated/10same/0conflicts andtarget21domain/syntaxPASS; finalmanifestfullhashaudit. AllboundedTASK08acceptancecompletewithMODEL01exception.

## Basic dimension increment acceptance (FR-16..18)

| ID | Setup/actions | Observable acceptance |
| --- | --- | --- |
| TC-21 | Domain create dimension/value; malformed codes/names/types/unknown fields/duplicates; toggle definition/value separately, stale revision, restart | Correct scoped catalog;400/409/no partial mutation; immutable code/name and no delete; explicit active/revision persistence |
| TC-22 | Two optional maps on balanced lines; unknown/inactive/array/null/numeric value/>10pairs; disable after draft and reject post; reenable/post; restrict then exact reverse; attempt SQL insert/update/delete posted attributes and forged special journal | Exact line maps survive save/edit/post/restart/reversal; inactive olddraft remains; no attribute mutation/bypass; no-dimension existing31 tests unchanged; monthly aggregate close still reconciles unfiltered statements and visibly documented filtered-close limitation |
| TC-23 | Temporary oldschema seed+unknown-style draft3; reopen new schema/restart; loopback catalog routes/security; controlled fakeAI context/proposal incl disable while awaiting | Original journals/periods/reports exact, no seed/backfill; dimensions retained through AI normalization/transfer, latest restrictions reject with no writes, all write routes guard origin/Host/JSON; no real inference |
| TC-24 | Isolated real browser create Department/OPS and SALES, line selections/save/post; history display/filter with prior/opening and inactive choice; validation/conflict errors; no defaults; read-only refreshed4173 | Known optional fields visible; exact dimension-filtered ledger and unfiltered balance; no claim independent balancedTB, explicit confirmation save/post; previewID3 unchanged and safe22filelocalhashsync. Independent G5/G6compliance+quality underMODEL01. |

G2 author check: FR16=>catalog/TC21, FR17=>attributes/TC22-23, FR18=>filteredledger/TC22/24; existing monthly-close/account/AI boundaries preserved. No critical policy dependency on advancedFG02. Subsequent G3 and implementation evidence follows.

G3 released MODEL-01 exception. Refinements toTC21-24 beforecode: nestedcatalogvalues; independentdefinition/valueflags and valueupdatewhileparentoff; optionalmapcanonicalorder/emptyomission; carrythroughpost/reversal/server/editor/AIpreview/history; AIserverpermitsonlyexact CODE=VALUE pairs foundinprompt; allotherinferencefailswithoutwrites. Query absentpair is unfiltered but eitherpresentempty/incomplete isinvalid; filteredresponse echoesfilter and accumulates nominalopening acrossmonthswithoutattributedclose. All22existingallowlistedfiles sufficient; no new application files. Nativeconfirmharness allowed but disclose; current31baseline remains required.

Actual execution:35/35includingprior31tests andsyntaxPASS. TC21-23domain/API/controlledAI/persistence cases pass. TC24isolatedbrowserPASScreate/duplicate/no-default/edit/post/history/filter10.00/inactiveparent+valuelabels; UI-onlymockAI11.11 preview/transferpreservedattributesandnoautosave. Nonzeropriorfilterednominalopening proveninTC22automatedcase, notclaimedasbrowsercloseexercise. Readonly4173newpage/emptycatalogandcanonical3journals+periods+ID3preserved. G5/G6compliance+qualityPASSunderMODEL01; inactivefilterlabelindependentlyclosed; local22-filehashmatch0conflicts andtarget17domain+syntaxPASS. SeeDIMENSIONS-INCREMENT-01/FINAL-01.

## Foundation increment acceptance (FR-12..15)

| ID | Level/setup and actions | Observable acceptance |
| --- | --- | --- |
| TC-16 | Domain/in-memory: create custom expense/revenue/asset, list, rename unused, change flags with revisions; invalid code/name/category/unknown fields/boolean/revision/duplicates/builtin mutations/reclassification attempts | Accurate metadata; persisted config;400/409 errors and no changes; no deletion/recode/type change; posted-use rename blocked; seed eight unchanged |
| TC-17 | Domain: save custom revenue draft then disable before post; deny new manual/AI suggestion; reenable and post; restrict after posting; exact reverse; custom expense/revenue close | Stale draft stays draft on denial; source-validated reversal succeeds while forged bypass fails; all restricted nominal balances included in close, retained earnings/profit/equity reconcile and historical monetary totals unchanged |
| TC-18 | Old-schema SQLite temp file with8legacy accounts,2posted seeds andID3draft,period/report baseline; instantiate/restart newBook and add config without modifying old data | Exact original journal/period records and money retained; no reseed; flags defaulttrue/rev0; settings persistence; no preview DB writes |
| TC-19 | Real loopbackAPI + controlled localAI: create/update account; same-origin/wrongHost/foreignOrigin/cross-site/nonJSON; hold fakeAI then restrict account before returning proposal | UI/API payloads agree;409 stale update; restricted-account proposal rejected502 without save; unchanged journal/period; no credential/live inference |
| TC-20 | Real browser on separate fictional book: create custom account, edit/save flags, verify disabled journal option and ledger visibility; validation errors; inspect reports and close description | Visible successful create/config and clear errors, unavailable new-entry choice not hidden history, text-only rendering, explicit user save/post controls; persistent4173ID3 preserved. Full26original+newtests and `npm run check` pass. |

Execution: TC-16..19 pass in the31/31 full automated suite; syntax checks pass. TC-20 passed on isolated4175 browser: create/edit/cancel/duplicate error, disabled new-entry options, explicit draft/post10.00, restricted historical ledger10.00 and totalassets14,000.00. Confirmation decisions used an isolated page harness, not native modal rendering. Persistent4173 was restarted and browser-checked without writes; all journal/period records includingID3 match pre-restart. Independent G5/combined G6 compliance/quality PASS under MODEL-01; local22-file hash equality verified, destination14domain tests and syntaxPASS. See ACCOUNTS-INCREMENT-01 and ACCOUNTS-FINAL-01. Older evidence below is historical.

G3 clarifications for TC-16..20: used-account flag-only updates with unchanged trimmed name succeed; reject newlines/control chars. Creationrev1, everyPUT increments (includingno-op), legacy missing metadatarev0. Test activefalse and manualAllowedfalse independently. Reports retain full accounts without flag badges; config/entry options show flags. Concrete bypass attempts are journal allowRestricted/reversal_of/kindreversal and editing generated reversal. Assert draftAI context filters restricted accounts, teaching context includes all, and after-await restriction is revalidated. Historical report monetary assertions after new account creation permit additional zero rows; unchanged-chart existing TC-08 remains byte-identical.

Previous release evidence:26 domain/API/SDK-contract tests passed and real Copilot teaching/draft calls have execution evidence below. That release's independent final review and findings re-review passed under MODEL-01. Current foundation evidence is above; mobile layout remains unverified.

| ID | Requirements | Setup / action | Expected observable result |
| --- | --- | --- | --- |
| TC-01 | FR-01, NFR-02 | Create a temporary SQLite book, add work, close/reopen connection. | Seed is balanced and labelled; saved work survives restart and seed is not duplicated. |
| TC-02 | FR-02, NFR-01 | Submit valid two-line journal, plus invalid precision, negative amount, 999,999,999.99 boundary / 1,000,000,000.00 excess, missing account, invalid/closed/nonexistent-period date, both debit/credit, zero total and 101 lines. | Boundary saves precisely; each invalid input returns an explicit validation error and leaves counts unchanged. |
| TC-03 | FR-02/03, NFR-02 | Post a draft twice; attempt edit/delete of posted entry. | First post changes balances once; repeated post and mutations reject with no changes. |
| TC-04 | FR-03/04 | Reverse a posted normal/adjusting entry; try duplicate reversal, reversal-of-reversal, closing reversal, edited reversal lines and forged kind/reference. Delete a draft reversal and retry. | Only one immutable exact server-generated opposite exists; invalid operations reject without mutation; deleting a draft releases retry; original is preserved. |
| TC-05 | FR-04/05/07 | Post prepaid expense and consumption, accrued wages and revenue, then inspect reports/ledger. | Exact expected profit, assets, liabilities, equity, running ledger and equal trial totals. Drafts excluded. |
| TC-06 | FR-06/07, NFR-02 | Preview close with a draft, then clear draft and close; compare reports and all three trial-balance views before/after. | Draft blocks close without partial writes; revenue/expense become zero after close; income statement and equity summary are identical before/after; all trial-balance views balance. |
| TC-07 | FR-06 | Try duplicate close, posting/editing/reversing into closed period, premature next period, skipped month and invalid period. | Each invalid state transition rejects; next consecutive month opens only after prior close; opening balances carry and monthly profit resets. |
| TC-08 | FR-06/07 | Close empty-profit and loss-making periods. Snapshot month-1 reports, open month 2, post activity and close it. | No invalid zero line; loss reduces retained earnings; month-2 opening equity equals month-1 closing equity; month-1 trial balance, income statement, balance sheet and equity summary are byte-identical to their snapshots. |
| TC-09 | FR-08, NFR-04/05 | Controlled upstream returns valid draft and invalid/malformed/unbalanced/unknown-account output. | Valid output is preview only; invalid output gives explicit errors; no automatic record changes; API secret absent from browser responses and book. |
| TC-10 | FR-09, NFR-04/05 | Missing AI config, HTTP upstream failure, malformed envelope, injectable timeout, response at 256 KiB / above, prompt at 4,000 / 4,001 chars. | Explicit bounded failures; no success fallback, no credential/error-body/log leak, no changed accounting records. |
| TC-11 | NFR-03 | Start local HTTP server; test foreign Origin/Host, cross-site metadata, non-JSON and body at 64 KiB / above, including both AI endpoints. | Rejection without mutation or AI spending. Allowed loopback JSON requests work; server binds loopback and static access is allowlisted. |
| TC-12 | FR-10, FR-02/08/09 | Review/browser-check journal creation, post, ledger, statements, AI preview, close confirmation and walkthrough. | Labels distinguish draft/posted, deterministic examples/AI, educational limits; errors visible; dynamic content uses text, controls require intentional actions. |
| TC-13 | FR-09, NFR-04/05 | A controlled local AI upstream captures teaching requests for an open period with a draft, the same period without drafts, a closed profit-bearing period, and a zero-profit period before/after closing without a closing journal. Also request draft AI on a closed period. | Context contains actual status/draft count, truthful close eligibility, only open-period proposed lines and only actual closed-period posted closing journal; zero-profit close is not inferred from balances. Context requests leave all journal/period records unchanged. Closed-period AI draft rejects before an upstream call. |
| TC-14 | FR-11, NFR-04/05/06 | Inject fake official SDK clients, never ambient real credentials. Check exact isolated client/session settings, omission of `AI_API_KEY`/`AI_BASE_URL` from runtime environment, initialized tools null/nonempty, denied permissions, missing auth/model, model change, runtime failures, timeout, UTF-8 text at/above 256 KiB, empty output, stop errors/hanging stop and concurrent-call rejection. | No prompt sent unless auth/model/empty tools verify; text-only settings remain locked. Explicit sanitized errors, owned runtime stopped and request directory removed on success/failure/timeout; no credential/error-body leak or silent fallback. |
| TC-15 | FR-08/09/11, NFR-03..05 | Run both HTTP AI endpoints using fake SDK clients: valid/invalid drafts, period/closing payload, Origin guards and provider/model state. Both providers must send monetary scale metadata and distinguish minor-unit context from decimal teaching-unit output; draft payload omits closing. Separately invoke real SDK with fictional seed data only. | Provider/model shown without secrets, validation preserved, no accounting mutation, rejected origins spend no calls. Live seeded teaching states 2,000 (or 2000.00) teaching-unit profit and nowhere presents 200,000 as teaching units. Record every attempt with model and result; do not retry an unchanged implementation until success. |

Validation commands: `node --test` (focused domain and HTTP/AI integration), `node --check` on server/domain/browser modules, plus a real local HTTP smoke check. Browser interaction is to be verified with the available browser host when available; lack of that evidence must be disclosed, not inferred from HTTP success.

## Execution and traceability

| Cases | Requirements | Actual evidence |
| --- | --- | --- |
| TC-01 | FR-01, NFR-02 | Persistent temporary SQLite test closes/reopens and proves no reseeding. |
| TC-02/03 | FR-02/03, NFR-01/02 | Invalid draft matrix, exact line maximum, guarded post and SQLite immutability tests; injected aggregate failure rolls back. |
| TC-04 | FR-03/04 | Unique server-generated reversal, rejected edits/tampering, delete/retry and source retention tests. |
| TC-05 | FR-04/05/07 | Exact prepaid/accrual/adjustment/ledger/report assertions. Real browser saved and posted three samples, then showed assets 13,700, liabilities 500, equity 13,200 and profit 1,200. |
| TC-06/07/08 | FR-06/07 | Automated draft-blocked close, profit/equity preservation, three TB views, loss/zero-profit, next month and historical snapshots. Real browser previewed/confirmed close and opened next month with profit zero and opening equity 13,200. |
| TC-09/10 | FR-08/09, NFR-04/05 | Controlled local upstream tests: valid preview without write, malformed/unbalanced/unknown account/blank rationale, explicit failures, prompt/body limits, timeout and no response/log secret leak. No live model call. |
| TC-11 | NFR-03/04 | Raw Host tests, exact Origin/fetch-metadata/JSON rejection on POST/PUT/DELETE including paid AI, zero upstream calls, exact 64 KiB boundary and allowlisted static assets/CSP. |
| TC-12 | FR-02/08/09/10, NFR-06 | Real browser manual sample workflow, reports/ledger/close, missing-AI error, invalid-input preservation; isolated browser fetch mock proved AI preview-only transfer and inert malicious-looking text. Desktop screenshot inspected, no horizontal overflow. |
| Money display boundary | NFR-01 | Pure production formatter tested at safe-integer positive/negative boundaries; no floating-point cent division. |

Limitations: browser AI output was explicitly mocked for that UI-only test; integration contract tests used a controlled local upstream. Neither proves external connectivity/model quality. No mobile viewport check, statutory compliance check, load test or production-readiness claim.

TC-13 execution: before implementation, both the new teaching-context test and the added draft-context assertion failed because `period` was undefined. After implementation all 19 tests pass, including truthful open/draft/closed/zero-profit snapshots, no accounting mutation, and closed-period draft rejection without an upstream call. `npm run check` also passes. The real browser shows the revised period/closing-data disclosure; the README disclosure was checked in place. Focused independent increment/final correction review passed both compliance and quality dimensions under MODEL-01; the reviewer independently reran all 19 tests and syntax checks. No real external AI call was made.

TC-14/15 execution (subsequent Copilot addition): `node --test tests\copilot.test.mjs` initially failed for missing adapter. Monetary-scale assertions later failed in both provider contracts before the fix. Current `npm test` is 26/26 and `npm run check` passes. These include old TC-13 open-with-draft/open-without-draft/actual-close/zero-profit-open-and-closed snapshots and closed-period draft rejection, plus SDK zero-tools/auth/model checks, UTF-8 exact 256 KiB boundary/excess, timeout, stop errors/hang, concurrency, mixed-case runtime-path filtering, retained temporary state on unconfirmed termination, and no writes. Independent combined review reran 25 tests/checks; correction re-review reran all seven SDK tests and closed all findings without runtime edits. Real calls are separate and all five attempts are recorded in reviews. After the scale fix, real teaching correctly states 2000.00 teaching units; after clarifying exact account property/string-code output, real draft validates 10.00 debit/credit. This does not claim model infallibility.
