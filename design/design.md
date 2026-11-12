# Proposed design

## 主题与双语架构（FR33-35）

新public/labels/zh.js、en.js各一份静态字典，稳定key及具名插值；public/labels.js只负责取label/绑定更新，不联网翻译。现有app UI文本经一次AST codemod迁到资源（仅开发工具，不在运行时代替key查询），人工核英文；协议/状态值/用户及账套数据保持原样。server只追加精确白名单静态路径，未知label键/参数不回退假成功。新增模块纳入语法与HTTP资源测试，保持CSP同源限制。

label对象保留key/参数，隐式String/模板coercion抛错，防止`${normalSides[x]}`等无中文模板冻结；只允许绑定helper及命名边界resolveLabel（confirm/Error消息、AI问题预填、示例摘要作为当前语言可编辑输入）显式解析。所有混合UI模板/后缀/aria必须以完整key/参数绑定，不靠“含中文”判定覆盖；中文文本检测只是附加校验。页头使用每view独立shortDescription key，删除split句号逻辑。

el/label/button/table创建独立文本节点并用WeakMap把绑定归属到DOM节点，切语言查询文档当前已连接的data-label-bound节点，仅更新对应文本/placeholder/aria，不设置整个label父节点textContent以免删除input；原DOM及closure/AI结果/preview保留。没有模块全局逐条绑定Set，删除页面时节点和其label/参数可一起回收，不依赖切语言才清理。现有少数直接赋值UI文本/属性改为绑定helper，动态混合内容必须完整绑定；option文本后缀追加绑定文本节点，不用textContent+=冻结。预先打开的确认弹窗不强制刷新，下一次confirm解析当前资源。原始数据节点显式标记为data，永不翻译。chrome可重绘导航/页头，不动workspace。

主题根data-theme映射red/green CSS变量，默认red，所有原绿色固定色改为变量；警示统一独立琥珀/深色+!文字，主色按钮不冒充失败。先完成language/theme/teaching三项读取与校验，再以最终可用语言显示一条合并startup notice，逐项列出失败/损坏及各自默认（语言中文、主题红、教学关闭），不相互覆盖。pref写成功再切，失败保留当前状态并提示。language改变先验证字典，再存储并更新lang/绑定；不要调用账务API或render workspace。

替代：不整体重绘表单、不把中文字符串运行时查找替换当i18n、不翻译数据层、不引入远程翻译。DOM测试仍真实app执行：注入每例独立的labels实例和真实money；资源key/占位参数一致、app/index没有硬编码UI文本、动态模板/成功确认/错误都取label。真实隔离浏览器验收两主题/两语言及表单/AI/预览保持；既有4173只读，截图均实拍。

G3预编码澄清：API错误分为绑定label前缀+独立data标记的原始服务端诊断节点，不能把整个notice标data来漏检客户端提示；客户端错误保留label对象，切语言原地更新。TC43另覆盖错误可见后切语言及pendingAI在语言切换后返回同一面板，前缀随新语言、输入/结果仍在、零新增自动调用。

## ERP工作台设计（FR-29..32）

仅改静态HTML/CSS/浏览器应用与聚焦DOM测试；原Book/server/SDK会计与AI接口不改。导航按业务组渲染；拆eventsView的服务/规则配置为settingsView，同一服务端配置CAS/预览失效机制不变。首页ERP模式显示草稿待办、期间及现有余额，教学模式再追加原学习路径/概念卡。不虚构未来模块可用。

偏好仅同源localStorage，默认off；存取失败显示可见错误并按当前页状态继续工作，不谎称已保存。模式切换只更新chrome/教学可见性，除概览外不重建表单DOM，保留人工/AI/业务/配置未保存输入；概览无输入可重新渲染。`.teaching-content`只控制明确分类的辅助内容，不能机械按句号截断。panel的说明完整移入折叠“了解更多”，按内容显式另列简短always-visible essential风险：凭证“过账后不可修改”、科目“编号/类型创建后不可变；类型决定分类与结转”、AI“不输入真实财务/个人信息/密钥，显式发送，只读候选”等；warning/确认/权限/报表必要口径始终可见，不受教学模式影响。全局期间保留原refresh语义，关闭月份仍不可创建。

凭证新增空选项（required），遍历科目权限时跳过空选项；借贷空值序列化仍为0，服务端要求至少正金额且平衡。维度始终可见/无配置时给设置入口；非零差额红色aria-live并标方向，整数分计算复用现有规则。

AI面板复用一套组件用于工作台及独立助手。报表入口只预填问题，不自动发网；发送前说明原有上下文和隐私。捕获请求month及面板连接状态；响应若切月/旧面板已离开则丢弃并明确告知，不填错期间。采纳草稿再核同月/开放，若编辑器已有内容先确认替换未保存输入；始终editingId=undefined，作为新草稿填入（不PUT覆盖正在编辑的旧草稿），原保存/确认过账分离。开关教学不取消可见的业务AI结果。不新增工具/文件/执行权限或真实外发测试。

测试使用每例独立JSDOM window（outside-only），显式执行读取的app.js，仅将顶层money.js import替换为注入真实formatMinor，不依赖jsdom自动加载ES module；每例新window和脚本作用域避免缓存/状态泄漏，stub scrollIntoView/confirm/fetch，localStorage在该window控制。首先断言导航/期间/工作区确已渲染，再检验“未写入/未发送”；受控AI返回不是模型实测。真实浏览器另用隔离虚构账套。

## PLAN-44：完整目标架构与门禁（文档基线，非实现）

需求权威：[requirements](requirements.md) 的FR-101..144及OQ-01..10；历史实现FR-01..28不变。[范围索引](source-analysis.md)只说明公开资料边界，不包含私有来源快照。[project](project.md)是进度入口，未来任务在相应G3之后才分解。应用不得将私有资料发给外部AI。

### 模块、状态和真实依赖

| 设计域 / FG | 未来对象与状态、输出 | 前置/联合契约及阻塞 |
| --- | --- | --- |
| D-BASE / 01-07 | 科目/账套/维度/日历/事件规则→明确激活配置；业务源→预览→用户批准→已过账或明确待转；来源→精确纠错链 | 复用已交付GL，不重写历史。多法人/日期/角色/异步转账等是扩展，不假造已存在；OQ02/03等影响切片 |
| D-P2P / 08-11 | PO及行→分次收货→未票应计→发票匹配/未结应付→部分付款/结算；退货/贷项和待批准单据关联原行 | 收货数量事实先于发票匹配；费用无库存路线可独立。数量/税行/成本接口先统一，不要求整个库存或税FG先完成；OQ01/04/05/07 |
| D-O2C / 12-15 | 销售行→部分交付→发票/未结应收→预收/收款/核销；服务、账龄、坏账分别引用原未结项 | 库存交付与服务发票分支隔离，坏账与催费不可推断政策；OQ01/04/05/07 |
| D-INV / 16-19 | 库存数量收发事实与财务成本事实分层；成本模型版本→估值/重算/结算/标记→调整来源；盘点与WIP独立来源 | 先明确首个模型/负库存/物理财务时点；采购/销售提供事实，不以整体FG循环作实施依赖；OQ04 |
| D-TAX / 20-22 | 税码/税基/抵扣政策→税明细→条件税触发/转实→结算/更正/留抵/付款预提税 | 先有税计算契约，再接含税发票；无税路线不假冒税完成。税归期、舍入、生效期须版本化；OQ05/07 |
| D-FX / 23-24 | 原币/会计币/报告币及不可变汇率来源→未结重估批次→结算已实现差额 | 币种/精度基础可先定义；AR/AP未结、银行和GL重估对象分别接入，不能重复计量；OQ06 |
| D-BANK / 25-27 | 银行子账/付款方式/桥接/支票→实际付款；流水→匹配/时间差/待记账→批准调整/复核；预测只读计划 | 业务付款/收款事实与银行执行状态分层，不构造FG10↔25整体依赖环；OQ07，预测假设OQ10 |
| D-ASSET / 28-30 | 资产卡/账簿/取得→折旧提议/批准→估值/处置/拆分/转移；原值、累计额分开 | 与AP取得来源去重，先账簿后折旧/处置，多账簿不重复进GL；OQ08 |
| D-LEASE / 31 | 合同/支付时点/折现参数→初始确认/计划→利息/付款/费用滚动 | 明确教学费用模式及支付政策，再与银行/资产账簿接入；OQ08，不预设准则 |
| D-CLOSE / 32-34 | 四类调整计划/冲回→分摊/履约→已启用模块关账清单→期间冻结/年度结转与重跑记录 | 旧教学月结保留，不把用户旧账迁移为年结；已启用模块才进入关账依赖；OQ03/08 |
| D-IC / 35-38 | 独立法人账→双边往来/贸易付款→配对→独立合并映射/抵销→折算CTA/NCI | 先法人身份及双边失败语义，再合并；抵销不覆盖法人账；OQ09/06 |
| D-REPORT / 39-41 | 同口径期初/发生/期末→下钻→数学/子账差异→处置复核；现金流/比率独立口径 | 只对已有事实做确定性查询；无银行/子账不声称跨子账对账。现金流分类/比率待OQ10 |
| D-EVIDENCE / 42-44 | 源事实/版本/变更证据→只读诊断；隔离教学分支/方法比较；AI事实快照/建议 | AI是消费者，不能成为会计引擎前置/工具执行者。缺历史配置日志不得补造；OQ02/10及各模块政策 |

### 共同契约与并行边界

业务对象使用自己的稳定身份/原始行关联；未来事件契约应携带源对象/行/事件类型/版本、会计日期及相关原币/维度/税成本事实。确定性计算先验证对象/规则/期间/金额，给出来源解释；用户批准后同事务写业务状态、GL、不可变来源回执，或按批准的异步设计显式记录待转，不能二者含糊。重复源按同版本同输入幂等，改变配置后需重预览；已完成重试保持原结果。这里只是设计约束，**不声称通用业务表、子账、税币模型已经实现**；具体schema/失败补偿和迁移须在政策确认后的子基线G3定稿。

可并行的是独立政策分析/明确接口后的不同模块或不同文件工作。采购/销售/税/库存均触及科目规则、未结项、源事件、金额/税/币精度和共享SQLite，必须由一个集成负责人维护共享契约，不能在同一checkout多个写者改schema。FG能力网络有联合设计关系，不把所有FG硬排成假DAG；真正实施任务必须用切片、真实前置构成无环图。部署/角色/性能等未确认约束在OQ表保留，不为通过评审发明阈值。

### 仅供下一批的已明确只读切片

- D-READ-A（FR-139-A/TC-139-A）：三种试算表中的科目导航到现有完整已过账总账，带选定月份/科目，不隐式套维度或阶段筛选。保留现有总账期初/发生/期末和停用历史；页面导航零写账。导航提示明确未调整试算排除当月调整/其冲销、调整后试算排除结转，而完整总账包含这些分录，不能要求二者期末相等。此切片不需要税、成本或年结政策。
- D-READ-B（FR-139-B/TC-139-B）：拟新增只读GET `/api/reconciliation?month=YYYY-MM`，复用同一Book.reports快照计算6项勾稽（3个TB各一项、资产等式、权益摘要、利润关系）。返回 `{month,checks:[{id,left,right,difference,pass}],allPass}`，整数分及安全算术，不能将失败变成“全通过”。非法/未知月份沿现有400/404语义，不扫描未实现子账，不写数据库或阻断过账。具体接口仍是未来任务设计，当前路由不存在。
- D-READ-C（FR-142-A/TC-142-A）：UI显示选定月及逐项差额；依赖D-READ-B，在D-READ-A导航基础集成，不缓存为审计通过证明。共享 `public/app.js`，与导航切片不能同一checkout并行写。

D-READ-B固定ID与左右值：`tb.unadjusted`、`tb.adjusted`、`tb.postClosing`各为该试算的debit/credit；`balanceSheet`为assets/(liabilities+equity，含未结损益)；`equitySummary`为equitySummary.closing/equity；`profit`为(revenue-expense)/profit。difference=left-right、pass=(difference===0)，allPass为全部6项通过。字段来自一次reports快照并映射现有返回结构，不新增账务计算口径；利润关系当前同源恒等，清楚说明诊断限制。缺month或非法month返回400，未知month返回404；不得沿state接口缺月时默认最新月的语义。

拒绝方案：为填44FG添加无行为字段；用平衡分录冒充子账；用预测冒充现金流；把配置可维护等同已获准政策；给未实现范围标done；未定税/成本/租赁/合并政策时直接分解ready代码任务。风险控制：先范围/决策及ID基线G3，后明确切片任务；其余仅待澄清里程碑，重新G3前BLOCKED。本轮无运行代码/账套/依赖改动，回滚仅文档文件，不涉及数据库迁移。

## Normal side and contra explanation (FR-26..28)

Add empty `account_properties(code PK FK accounts,normal_side CHECK DEBIT/CREDIT,purpose CHECK general/contra,related_account nullable FK accounts,revision positiveinteger)` with SQL CHECK general=>null,contra=>nonnull/nonself. No ALTER/backfill/old-row rewrite. `accounts()` LEFT JOIN returns `normalSide` (category default), `purpose` defaultgeneral, `relatedAccount` null, `propertyRevision`0. Existing account settings/revision and create/update contracts untouched. PUT `/api/accounts/:code/properties` exactbody `{normalSide,purpose,relatedAccount,revision}` -> `setAccountProperties` BEGINIMMEDIATE. Custom only; verify exactfields/types/safeinteger/target/CAS; contra requires opposite CATEGORY side and same-category general target, may be inactive. Any account referenced as gross cannot become contra. General requires null relatedAccount. Increment even identical config; no delete/audit-log claim. No new standalone control/clearing/suspense fields without behavior.

G3clarificationselectedbeforecode: gross target must also have category-default normal side; changing an alreadyreferenced gross to nondefaultnormal or contra409. Manycontraaccounts may shareone gross. Rows label actualclosing/afterclosezero, groups labelactivity/closingexplicitly.

`reports()` retains all existing numeric/row payloads and adds `accountAnalysis:{basis:"current_account_configuration",rows,contraGroups}`. Rows `{code,normalSide,purpose,relatedAccount,propertyRevision,balance,normalAmount,oppositeBalance}` use actual closing debit-minus-credit; normalAmount=balance*(DEBIT?1:-1), flag<0 only, zero no flag. `contraGroups` one per referenced gross with `{account,category,measure,gross,contra,net,accounts:[contra codes]}`; measure `activity` for REVENUE/EXPENSE otherwise `closing`. Convert each amount using category ordinary sign, NOT configured normal side; contra is signed adjustment (normally negative), net=safe(gross+sumadjustments). Safe sums reused, no mutation or double counting in existing statements. Grouping and signal apply current config even in old months, disclosed; they are teaching explanations, not historical config snapshots or automatic reconciliation. A reversal/reverse balance remains valid; no Book.validate changes.

UI custom account editor has independent property form, normal side/purpose/related samecategorygeneral selector/revision and explicit confirm. Purpose change can suggest conventional side ONLY in unsaved form, never change account type/actual inputs silently; simplest no automatic default change, user selects valid side. API/error/cancel retain text. Account list displays normal/purpose. Report panels show current-configuration/closing warnings and separate gross/signedcontra/net groups (all groups visible including zero). No per-group journal/auto-clearing button. AI current chart includes new properties automatically; append semantic caveat, no new tools/authority.

Fingerprint already includes full accounts(), so separate propertyRevision covers every save/ABA; receipt engine unchanged, original snapshot and completedretry kept. SDK/dependencies unchanged. Legacy table drop/reopen fixture extended, temporary-db persistence, custom contra historical reversals/monthclose/nonzero opposite balance and malformed/CAS/loop/unknown parent/strong amount probes. Old reports' financial values/threeTBs unchanged; new current-config explanatory object may change on property updates by design. Recovery retain complete database; old runtime ignores explanations but do not recommend downgrading after preceding controls. Reviewer must verify finite A1-A7 traceability rather than label entire source FG01-07 complete.

## Exact-account dimension structure (FR-23..25)

Add only `account_dimension_structures(account PRIMARY KEY REFERENCES accounts, active CHECKbool, revision CHECKpositiveinteger, segments_json, allowed_json)`. Empty on old books. No update of journal/line/catalog/period data. Ordered GET catalog `dimensionStructures()` returns `{account,active,revision,segments,allowed}`; PUT `/api/accounts/:code/dimension-structure` exactbody `{active,revision,segments,allowed}` creates with expectedrevision0 or updates current CASrevision, positive-safe nextrevision. BEGINIMMEDIATE and shared HTTP protections. No delete/range assignment/multiple applicable structures; configuration state mutable, no new configuration-audit-log claim.

Segments1-10 `{code,required:boolean}`, unique known definitions, canonical ASCII-code order. Allowed0-50 plain maps; keys must belong to segments, each value exists, every required segment has value, optional missing means explicit blank. Canonical sorted keys and duplicate rejection. Empty array disables whitelist, not requiredness. On activation referenced definitions and listed values must currently be active; disabling retains known inactive references. Later dimension/value restriction does not auto-deactivate structure, current normal-line active validation still rejects restricted selections. Unlisted dimensions remain valid/unconstrained by this structure, with existing maximum10pairs on each actual line. More than10required/present pairs cannot be synthesized by engine.

`validateStructure(account,map,lineNumber)` called by Book.validate on each ordinary normal/adjusting line after existing dimension syntax/catalog validation; no map returns early only if no active structure, NOT before requiredness. Compare canonical projection on declared segments to whitelist. Failure409 includes line index, account, structure revision and missing dimensions/disallowed combination; no map mutation. Existing exact-reversal post compares all source rows first, then existing private-option allowRestricted route skips structure checks too; reverse draft remains original attributes. System aggregate close uses existing internal insertion, exempt by design. No new HTTP/AI bypass.

EventPlan calls same validate and returns relevant active structure snapshots alongside rule/lines; all structures in global config fingerprint, revision detects change+restore. HMAC covers snapshots too. Completed event receipt retry stays ahead of current validation; old stored snapshots may not have the new field, readers default to empty list only for historical snapshot display, not validation. No changes to original receipt/journal shapes or balances beyond optional extra plan metadata.

G3pretestclarifications: active snapshotarrayalwayspresentonnewplans, fullconfigs dedupedbyaccountinfirstlineorder; inactive/absent configs omitted/emptyarraymeans no appliedstructure. Structuralerror reportsfirstfailinginputline. Emptytuple `{}` onlyvalidifallsegmentsoptional/allblank, neverwildcard; explicitempty/nullvalues400. Conflictingcash/revenuestructuresrejectratherthanadjustingeventmap, includingadjustingmanualcase in tests.

GETstate exposes catalog. AI context adds active structures for eligible draft accounts, full configuration for teaching. Existing after-await Book.validate sees current structure and returns explicit502 proposal error; no default/inference, existing explicit-pair check retained. No private source notes sent or real inference needed. UI dimension workspace adds account selector, segment ignored/optional/required choices and exact-whitelist JSON textarea, active defaultfalse until explicit choice, revision and explicit save confirm. Existing configuration loads unchanged; unsafe edits fail visibly and retain text. Structure setup doesn't scan/mutate old drafts. Journal/event dimension pickers remain optional-looking at input level but enforcement is authoritative at save/preview; guide explains per-account requiredness and exact combo errors. Event preview/history shows applied account/revision snapshots, original histories remain viewable under new rules.

Alternatives rejected: broad account ranges/overlap solver, per-value independent lists (would miss invalid cross-pairs), automatic defaults or silent retroactive edits, arbitrary expression evaluator. This is a bounded exact-tuple teaching adaptation, not full source account-structure/advanced-rule engine. Rollback retain whole database after stopping; do not advise old runtime after structures because it would ignore control. Testfirst missing-method failures, shared writer boundary/canonical/scope/CAS/inactive tests, SQL/file persistence/legacy compatibility, AI heldresponse race, source token ABA/replay, restricted exact reversal and monthlyclose/history. IsolatedUI and hashguardlocaldelivery as earlier increments.

## Deterministic teaching cash-service posting (FR-19..22)

Status: deliveredboundedTASK08;40tests/syntax/isolatedactualUI/previewpreservationPASS, independentG3/G5/combinedG6releasedMODEL01exception, local22-filehashsync0conflicts/target21domain+syntaxPASS. PartialFG04/05/06, notentirefirststage.

Add `teaching_services(code,name,group_code,active,revision)`, `posting_rules(id,scope,match_code,revenue_account,active,revision)` and immutable `posting_events(reference,input_json,plan_json,preview_token,journal_id)` tables. RevenueFKaccounts; journalFK+UNIQUE; insertguardrequirespostednormaljournalwithno reversalreference; source receiptupdate/deleteSQLblocked. Catalogcodes/namesimmutable atAPI; group/active/rulemapping editableCAS inexistingtransactions, positive-safe revisions. Duplicate active rules allowed for teachable ambiguity, but never arbitrary first-match execution. Active rulescope service/group must refer to existingservice/group at configuration time; inactiveunusedmatchallowed. Movingservicegroups may leave unused rules, visible and harmless. Allscope match literal `*`. No rule deletion/effective-date layer.

Pure shared `eventPlan(input)` normalizes input, selects active service/ranked matchingrules, rejects top ties, validates selectedREVENUE/1000cash/shared accountflags/dimensions/date/money and constructs exactlytwo normaljournal lines with line meaning cash_receipt/service_revenue. Explicit dimensions copied to both. Public plan contains normalizedevent, matchedrule/candidates/version, integer-minor-unit journal and teaching-unit metadata. Conservative SHA256fingerprint includes allservices/rules/accounts/dimensions/periods and engineversion1, not changing journal balances (which are freshly aggregate-validated on commit).

PerBook private randomHMACkey signs full serializedplan; neverreadhostcredentials or persistedkey. Preview computes plan+HMAC, noDBwrites. Confirm exactbody `{event,token}` first normalizes syntax, then insideBEGINIMMEDIATE checks existing source-reference receipt: exact normalizedinput+originalstoredtoken returns originalreceipt/journal(replayed=true) before currentperiod/catalog checks, including restart/closedperiod; mismatch409. Otherwise recompute sharedplan, timing-safe verify64hexHMAC, reject409 stale. Insert validated planjournal asdraft then guardedposted transition, run existingreportaggregate checks, insert immutable source receipt in same transaction. No nestedtransaction calls; reuse same validate/insert/reports rather than duplicate accounting arithmetic. Restart loses privatekey, rejects old uncommittedpreviews; persisted completed receipts still retry by originaltoken. Preview token is scoped confirmation evidence, not account auth or a secret copied fromhost.

GETstate includes services/rules/eventreceipts (no storedtokens); receipts expose immutable normalizedsource, originalplan/rule and linkedjournalID. Existing journalshape unchanged, sourceevent lookup separate. POST `/api/services`, PUT `/api/services/:code`; POST `/api/posting-rules`, PUT `/api/posting-rules/:id`; POST `/api/events/preview`, POST `/api/events/post`, with existing origin/Host/JSON/bodyguards. Rule/service validation strictfields andexpliciterrors. Existingmanual/AI endpoints cannot generate specialsource receipt or bypass flags; no eventtool exposedtoAI.

UI newteachingevent tab shows catalog/rule maintenance (scope service/group/all, relation, revenueaccount), eventformreference/date/service/amount/optional dims, preview/explanation and separate confirm. Confirmation reads currentform again, not a capturedoldpayload; changingreference/amount/date/dims requiresnewtoken. Button remainsblockedwhileawait; repeatednetworksubmit uses same reference/token, no duplicatejournal. Never clear reference onerror; explicitnewaction/repreview isuserdecision. Postedreceiptsdisplay originalsnapshot evenafter rulechanges; existingGLreversal doesnotcancel sourceevent.

Rejected alternatives: hand-entered journal pretending to be eventpreview; independent preview/commit generation; digest without server issuance; nonpersistent process-only idempotency; asynchronoussubledger route for nonexistentmodules; guessing two-axispriority or AI matching. Known limitation conservative unrelatedconfigchanges also invalidatepreview; no historical ruleediting/auditlog/fullsubledgertransfer. Additive tables preserve oldbooks; don't downgrade after posted sourceevents. Test isolation ensures4173ID3 untouched.

## Basic dimension increment (FR-16..18)

Status: delivered,35tests/syntax/isolatedbrowserPASS; independentG3/G5/G6 released MODEL01exception. Inactivefilterlabel finding closed; local22-filehashsync0conflicts andtarget17domain+syntaxPASS. This is partialFG02, not a fullfirststagecompletion.

Add three tables only: `dimensions(code,name,active,revision)`, `dimension_values(dimension,code,name,active,revision)` with compositePK/FK, and `line_dimensions(line_id,dimension,value)` with PK(line_id,dimension), FKline cascading deletion and composite valueFK. Active boolean/revision positive checks; posted line-dimension insert/update/delete SQLite triggers inspect both OLD/NEW owning lines on updates. Definitions/value names immutable; enabled-state updates revision-CAS inside existing BEGIN IMMEDIATE. No account-required mapping or migrations/backfill.

Catalog methods create/update dimension and nested value; routes POST `/api/dimensions`, PUT `/api/dimensions/:code`, POST `/api/dimensions/:code/values`, PUT `/api/dimensions/:code/values/:value`, sharing existing JSON/origin guards. Catalog in GETstate includes all definitions/values. Strict createfields `{code,name}`, updatefields `{active,revision}`. No hidden defaults or silent code normalization.

Optional normalized `dimensions` maps on lines use stable sorted keys, omitted when empty. Shared insert helper stores attributes after line insertion; journal/posted projection attaches only nonempty maps. Shared validation checks exact supplied codes and active statuses; at most10pairs. Update draft replaces owned line attributes transactionally. Exact reversal copies and compares maps as well as account/debit/credit before internal restricted bypass; no new API bypass. Posted trigger protection includes attributes; closure inserts existing aggregate lines without attributes, preserves prior accounting outputs. This known limitation is visible, not presented as balanced dimension accounting.

Ledger takes optional `{dimension,value}` known-catalog filter, matches line metadata before computing opening/running balances. Inactive known values valid for historical query; reject partial/unknown filters. Default nofilter keeps exact old response shape. No per-dimension trial balance or attributed closing. New journals show a small dimension selector per catalog definition per line (empty=unassigned); restricted selected values remain visible/disabled, never silently defaulted away. A dimension catalog tab creates definitions/values and explicitly confirms active updates. Ledger filters show full catalog with inactive labels. Text-only DOM rendering and existing run/error helpers.

AI context includes active definitions/values for draft, full catalog for teaching; optional `dimensions` in draft line contract. Returned normalization and browser transfer retain maps; no silent attribute loss. Revalidate after await. No source knowledge or real/private financial data sent. Existing SDK tool/permission boundary unchanged.

Alternative: alter lines with JSON column or replace existing schema; rejected in favor of additive FK rows and posted immutability. Advanced defaults/requiredness/derivation/structure/period validity/balancing deferred explicitly rather than guessed. Rollback: stop service and retain full database; older runtime would ignore new attributes, so do not advise downgrade after dimensional postings. Existing no-dimension records are not rewritten; test oldschema by dropping only new owned tables in a temporary fixture, reopen/restart and compare original records/reports/periods.

Status: foundation FR-12..15 delivered; independent G3/G5/combined G6 passed under `EXCEPTION (user-approved)`,31 tests/checks and isolated browser acceptance passed. Safe local22-file synchronization verified without conflicts; destination14domain tests and syntaxPASS. Original scope, FR-09 correction, FR-11 and money-scale correction are completed historical releases. Evidence is in [reviews](reviews.md); model authorization is in [project](project.md).

## Components and data flow

Use the available Node 26 runtime: a loopback HTTP server, built-in `node:sqlite` persistence, built-in `node:test`, and plain HTML/CSS/JavaScript served locally. No build tool is necessary. The official, pinned `@github/copilot-sdk` is the only direct runtime dependency, added for FR-11. Split domain, HTTP/AI transport and browser UI so accounting can be tested independently.

Browser -> JSON API -> domain validation -> SQLite transaction -> report projection. AI requests go through a separate server-side OpenAI-compatible chat-completions adapter. AI output returns to the preview UI, never directly to posted records.

## Data model

- Accounts: code, name, category (`ASSET`, `LIABILITY`, `EQUITY`, `REVENUE`, `EXPENSE`).
- Periods: calendar-month identifier, open/closed state.
- Journals: ID, date, memo, kind (normal/adjusting/reversal/closing), draft/posted status, optional original journal reference.
- Lines: journal ID, account code, integer debit/credit minor units.
- Seed metadata is implicit in period existence. On an empty database only, create the teaching chart, current calendar period and balanced posted sample capital/revenue entries transactionally. Inject `today` into the book constructor for deterministic tests; production uses the local calendar date.
- Retained earnings and contributed capital have distinct accounts. Database foreign keys are enabled. All SQL data uses parameter binding.

## Accounting invariants (FR-02 through FR-07; NFR-01/02)

Convert decimal strings (maximum 999,999,999.99 per line) to integer hundredths. Limit journals to 2-100 lines, with explicit aggregate guards. Never parse ambiguous dates or round excess precision. Saving and posting both require a date in an existing open period; future/uncreated/closed months reject. The original fixed chart remains preserved; the authorized foundation extension below adds custom-account flags without reclassifying the original chart.

Drafts must already be structurally balanced to save in v1; edit them before posting. Unbalanced proposals show validation errors without persisted fragments. Posted journals are immutable. Only normal/adjusting posted journals may be reversed, once per existing reversal; a unique original-reference index enforces this. Draft reversals may be deleted but not edited. Server-generated opposite lines are rechecked against the original at posting. Never accept client/AI `reversal`, `closing` or original-reference fields.

Reports use all posted journals up to the selected month end for balance-sheet accounts; selected-month non-closing activity for income/expense. Unadjusted trial balance excludes selected-month adjusting journals and their reversals, but retains earlier-month closes for carry-forward; adjusted excludes selected-month closing journals; post-closing includes all. Reversals inherit the source journal's adjustment classification. All views remain double-entry balanced.

Equity formulas: opening equity is equity balance before month start plus any still-unclosed cumulative profit (zero with sequential periods). Non-profit movements are current-month non-closing lines on equity accounts. Period profit is non-closing revenue less expense activity. Closing equity = opening equity + non-profit movements + period profit; it must equal balance-sheet equity both before and after close. Closing transfers are never counted as non-profit movements. Balance-sheet equity = actual equity account balances plus cumulative unclosed profit, so profit is included exactly once.

Close preview derives per-account current revenue/expense balances and generates opposite lines with net difference to retained earnings. Closing uses one transaction with a fresh state check; draft entries block it. Empty or zero-profit periods may close without a redundant zero journal. Future periods cannot exist until their predecessor closes; historical reports are therefore stable. No direct user-created `closing` entries.

Use `BEGIN IMMEDIATE` and guarded state transitions (`UPDATE ... WHERE status='draft'` / `status='open'`) with row-count checks. Add SQLite CHECK constraints for enums, nonnegative amounts and exactly one positive side; enforce posted-record immutability with triggers. Compute closing lines fresh inside the transaction, never accept a browser preview as accounting input, and never hold a transaction across an asynchronous AI call.

## HTTP and local security (NFR-03/04)

Serve on `127.0.0.1`; use a configured local port. Enforce loopback Host values to mitigate DNS rebinding, exact same-origin checks for every non-GET route (including AI) and reject cross-site fetch metadata. Non-browser loopback API requests may omit Origin. JSON-only writes, 64 KiB request body limit, no CORS exposure, no external scripts. Apply restrictive CSP and no-store API responses. Static files are allowlisted, not arbitrary disk paths.

Domain validation errors use actionable 400/409 JSON responses. Unexpected failures are logged without request contents or secrets and return a generic 500. The UI displays errors and preserves user input. Do not silently recover a corrupt database.

## AI boundary (FR-08/09; NFR-04/05)

Environment: `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY`; optional `PORT` and `DATA_DIR`. Append `/chat/completions` to the configured API base. Require HTTPS except for a loopback development endpoint. No key is placed into a URL, response, SQLite record or browser storage.

Send only an explicit prompt (1-4,000 characters) plus demo account/report context; disclose that this leaves the machine. Use a 30-second timeout and 256 KiB streaming response-body limit, explicit upstream error handling and no upstream error body leakage. Tests may inject a shorter timeout without changing the production default. Draft generation requests a JSON object; parse it and validate account/date/amount/balance using the same domain validator. Treat AI text as untrusted. No server tool execution, automatic save, automatic posting or automatic close.

Unconfigured AI returns a clear error while manual accounting remains fully usable. Unit/integration tests use a controlled local fake upstream labelled as a test, not a delivered AI feature. Actual model quality/live connectivity requires separate real-call evidence.

### FR-09 correction: authoritative close context

The delivered teaching request contained report totals but omitted actual period status and closing information. Totals cannot reliably indicate whether a period is closed, especially when profit is zero. Correct this existing-scope gap without changing accounting behavior:

- Every AI request includes the selected period object read from the book.
- Teaching requests additionally include `closing`: actual draft count, `canClose` (open with no drafts), `proposedLines` (server-derived close preview for open periods; null if closed), and `postedJournal` (the actual posted closing journal for that period, otherwise null). An empty closed period legitimately has no closing journal.
- Build this snapshot synchronously before the asynchronous external request. Creating it must not post journals, close periods or alter saved work.
- Instruct the teaching model to use supplied facts, distinguish proposals from posted lines and describe the data as a request-time snapshot. Do not infer closed/open state from balances.
- Update the UI and README data-sharing disclosure to name the period/close context as well as report data. The existing AI-generated/possibly-inaccurate label remains.
- No new endpoint, credential source or external service is introduced. Existing origin, size, timeout and secret protections continue to apply.

Revised FR-09 baseline passed focused independent G3 review under MODEL-01's `EXCEPTION (user-approved)`. TASK-04 validation and independent increment/final correction review also passed, separately recorded as CLOSE-CONTEXT-FINAL-01 rather than inferred from the previous delivery approval.

## Copilot provider addition (FR-11; NFR-03..06)

Live capability validation found a tightly coupled FR-09 input-schema gap: the model correctly read period/close facts but described the seeded 200,000 minor-unit profit as 200,000 rather than 2,000 teaching units. Before release, add `money: { unit: "教学单位", minorUnitsPerUnit: 100 }` to both AI payloads and explicitly state in both system prompts that report/closing monetary fields are integer hundredths, whereas generated debit/credit strings use whole teaching units with decimals. Contract tests must observe the metadata and instructions; repeat real teaching with the fictional seed and require a correct 2,000-unit explanation. This changes neither stored amounts nor posting behavior. AI accuracy remains non-guaranteed; record the initial failed quality check rather than counting HTTP 200 as acceptance.

Capability preparation, not inference: local official CLI is 1.0.64-1; pinned official SDK is 1.0.31. Supported `getAuthStatus()` reports authenticated `env` credentials; `listModels()` includes `gpt-6.1-sol`. A separate empty-mode session selected that ID and, after `initializeAndValidate()`, `getCurrentMetadata()` returned `tools: []`. Neither check sent a prompt. Do not equate this evidence with persistent CLI OAuth login or a transferable API key. Sources: official Copilot SDK authentication documentation and the installed SDK's public types/client implementation.

Select `AI_PROVIDER=copilot` explicitly, with `AI_MODEL=gpt-6.1-sol`; absent provider preserves existing OpenAI configuration. No endpoint/key is required for Copilot. The SDK alone handles supported ambient authentication; never read token files, private app configuration or private endpoints. Empty mode disables OS keychain access, so this verified host's environmental authentication may not be available in another terminal or after host credentials expire. Unauthenticated contexts must fail, not copy credentials or fall back silently.

A separate small Copilot adapter creates one request-owned temporary directory under `os.tmpdir()` (not the OneDrive-synced workspace). Both client `baseDirectory` and working directory point there. Use bundled stdio runtime (not in-process), `mode: empty`, `logLevel: none`, and default supported SDK authentication. Supply the supported client `env` option with an inherited environment excluding `AI_API_KEY`, `AI_BASE_URL` and `COPILOT_CLI_PATH`, matching keys case-insensitively, so OpenAI credentials are not exported and the bundled runtime cannot be overridden through this variable. Do not inspect/log Copilot authentication values. No global installation, account switch or repository working directory. Only one Copilot request may be in flight; reject another before runtime startup. Every request rechecks authentication and the real model catalog; restrict `allowedModels` to the requested non-auto model and verify `session.rpc.model.getCurrent().modelId` before and after generation.

Session configuration explicitly supplies `availableTools: []`, deny patterns `builtin:*`, `mcp:*`, `custom:*`, no custom tools/MCP/agents, disabled config discovery/custom instructions/on-demand instructions/skills/file hooks/host git/session store/memory/extensions/canvases/MCP apps/infinite sessions, and `enableSessionTelemetry: false` (session telemetry, not provider billing). Replace the system prompt with the existing accounting boundary; the only user message is the existing JSON teaching snapshot or draft request. Deny every permission callback. Before sending, initialize tools and require a non-null empty effective metadata list; any unsupported RPC or unexpected tools fails closed. Tool execution events also fail the request. No attachments or model-selected fallback.

The shared API still parses/validates drafts and never saves or posts them. For JSON mode the existing system instruction mandates a plain JSON object; malformed or fenced responses fail, rather than being repaired or treated as success. Stream only to the server for a 256 KiB UTF-8 output limit and also validate the final text. Race the complete SDK operation (startup/auth/catalog/session/generation) against the 30-second limit; stop the owned runtime on every exit, including timeout/startup failure, then delete only that request's known temporary directory. Runtime cleanup is outside the inference deadline. Allow graceful `stop()` at most five seconds, then use supported `forceStop()`; cleanup errors (including nonempty `stop()` results) must be visible. After termination, remove the exact request directory with bounded retries for Windows file locks. Cleanup failure must be visible and must not yield success-shaped output. Do not return or log upstream errors/content/credential values.

`/api/state` exposes configured provider/model only, not a claim that connectivity has been verified. UI names them and states each call checks authentication/model. `.env` may persist only these nonsecret settings for this workspace. README documents dependency installation, both providers, environmental-auth limitations and true live verification. Rolling back provider selection to OpenAI requires no accounting migration.

TC-14 covers SDK isolation configuration/effective tool rejection, auth/model failure, cleanup, timeout, UTF-8 output limits and suppressed upstream details using injected fake SDK clients. TC-15 exercises the actual Copilot adapter through both HTTP endpoints, valid/invalid drafts, context, no mutation and Host/Origin guards without live credentials. After implementation, explicitly invoke real teaching and draft requests with only built-in fictional data; verify selected model and unchanged journals/periods, then restart and inspect the real preview. This is separate live evidence, not part of `npm test`.

## UI and teaching (FR-01/04/07/10)

Chinese primary UI with key English accounting terms. Period selector, journal editor/list, account ledger, trial balance, statement tables, close preview/confirmation, and AI draft/teaching panels. Use semantic forms, labelled inputs, keyboard-operable controls and visible status/error messages. Format amounts from integer minor units.

Show draft versus posted explicitly and show closed-period state. Posting, correction and close use explicit user controls. Journal draft preview displays all AI-proposed lines and rationale before acceptance. A deterministic walkthrough explains example transactions and links to the relevant actions; no claim that predefined examples were generated by AI.

## Alternatives and limits

## Foundation account configuration (FR-12..15; FG-01/07 partial)

Add a small `account_settings` table keyed/FK to accounts: integer active/manual flags, positive revision. Do not alter/delete legacy account columns, amounts or periods. Missing metadata means active/manual=true, revision0. Seed recognition uses originalCHART code set; built-ins are immutable to configuration API, custom code/category are immutable at creation. New account plus metadata creation is transactional. Validate exact allowed request fields, four-digit1000-9999 code, category enum, trimmed1-80name and actual JSON booleans. Updates require current integer revision and set all mutable fields; transaction serializes check/update. Duplicate/stale/posted-use rename/seed modifications return409; unknown account404; bad shape400. Never delete accounts. Existing accounts of unknown non-seed origin remain legacy-active; metadata can be added when explicitly edited.

`accounts()` returns code/name/category plus builtin,active,manualAllowed,revision for configuration. Reporting calculations continue including every account irrespective of flags, projecting code/name/category only so current flag changes do not rewrite historical report metadata. Posted-use rename is forbidden. Adding a new account may add zero rows to past report listings, but never changes historical monetary results; no claim of frozen old report layouts. Existing eight seed definitions never change.

Clarifications from G3: rename means trimmed new name differs from stored name, so flag-only PUT on a posted-used account succeeds. Reject name control characters/newlines. Custom creation revision1; each validPUT, including a no-op, increments revision. Old metadata-free custom rows startrev0. Status flags appear in config/new-entry choices, not historical report row metadata. A restricted saved draft remains editable/deletable and blocks close until fixed/removed or account reenabled; communicate this rather than silently deleting it. Test each flag independently; draftAI context excludes either restricted flag, teaching context includes all. Concrete forged bypass attempts are allowRestricted/reversal_of fields or kindreversal in journal POST/PUT, and editing an actual reversal draft.

POST `/api/accounts` creates `{code,name,category}` with active/manual true. PUT `/api/accounts/:four-digit-code` accepts exactly `{name,active,manualAllowed,revision}`. Existing JSON/body/Host/Origin guards apply. No schema migration/metadata deletion endpoint. Names are text rendered via textContent. A custom manual-blocked account is unavailable for manual/AI posting, not a claim that subledgers exist. No username/role/audit log is invented.

Shared journal validation checks flags on save/post and returned AI proposals. Exact source-validated server-generated reversal alone gets an internal `allowRestricted` validation option; request fields cannot select it and original source must be posted normal/adjusting with identical opposite lines. A flag change must not strand legitimate corrections. Close remains deterministic system operation over all nominal balances, with fixed retained-earnings3100, no manual bypass endpoint. Preserve all old monetary precision/atomicity checks. AI draft context offers eligible accounts only, teaching sees full chart; report still shows restricted balances. No liveAI call required for this feature; controlled upstream verifies late flag changes during await.

UI new account navigation: list existing chart with category,origin,flags and status; create form; custom-only edit name/flags with revision carried from loaded state. Explicit confirmation on config update and clear conflict error (user refreshes to resolve, do not overwrite input). Default journal choices retain restricted accounts visibly disabled, including when inspecting an old draft. Historical ledger/report choices remain unfiltered. Keep current examples and compatibility explanations, label monthly teaching close rather than claiming new year-end semantics.

No dependency/CLI/package change. Test-first domain/API cases before runtime edits; preserve actual old-schema temporary fixture including original two posted records plus third draft, same report totals and journals across restart. Use separate temporary browser book, never alter previewID3 for verification. Sync only last-delivered hash matches; local conflict means preserve both and report, no `.git`/DB/env/dependency copying. Rollback is code selection without destructive metadata/data removal; existing metadata is additive and old seed logic needs explicit insert columns to remain resilient.

SQLite rather than browser-only storage supports transaction integrity and server-side AI secrets. A framework/ORM would increase dependency/build surface without improving this bounded teaching scope. A production financial system would require authentication, stronger audit/backup controls, legal accounting policies and deployment hardening; those are explicitly excluded.

Rollback in this phase is preservation of uncommitted code and the existing developer config; never delete the user's database automatically. Subsequent schema migrations require explicit planning; v1 only initializes its own known schema.
