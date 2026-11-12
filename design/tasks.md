# Implementation tasks

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
