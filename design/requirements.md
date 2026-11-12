# Requirements

## ARCH-SME-01：独立前端、分层业务与双数据库架构（已委托实施）

用户已授权按推荐方案执行ARCH-M00..09，并恢复M-TRADE/TASK24；完整备份/哈希与余额核对、保留ID3及只读原库后切换原预览。DC01..04均为**协调者代为决定，可调整**：React/Vite/TS、Nest/Fastify、Kysely；首交付Local SQLite，另提供PG+本地开发OIDC的Server Compose试点（仅虚构账号），运维/OIDC责任人为用户；预算采为目标非SLA；GL优先。各阶段G3/G5/G6与真实验收不能省略，未完成44FG不宣称完成。

架构需求AR-01..08、预算及具体决策维护在[architecture](architecture.md)，对应AT-01..11计划用例；技术决策见[ADR](adr/ADR-SME-001.md)，阶段详细需求FR-AM00/设计/TC-AM00及运行时限制见[实施基线](architecture-migration.md)。每可用里程碑哈希保护本地同步、独立security-review、非强制快进main、干净clone验证；远端前进则停止并报告，不覆盖。

现有OQ-02本机模拟/非生产及OQ-09同库事务约束仍是**当前实现**。目标Server档案将引入真实身份、多用户PostgreSQL及新的租户/账套作用域，须用户确认与逐阶段门禁，不把该提案写成当前已启用功能。旧教学模式及所有既有会计政策不因架构文档改变；原44FG覆盖统计保持。

## M-TRADE-A：非库存应付/应收闭环（金融基线G3释放，缓存补充待审）

本节是七里程碑中M-TRADE的第一个可验收切片，不是整个M-TRADE出口。用户已授权全部44FG；本切片先使真实伙伴、发票、未结项、付款/收款、预付款及应用可操作，再接实物流。库存、外币、银行实际支付、自计/条件/预收税、催收利息和坏账仍是具名后续验收，不以零成本/零税或纯GL替代。继续POLICY-01；来源研究只用于推导原创需求，原文、案例和答案不进入产品。

| 需求 / 映射 | 本切片的可观察验收 |
| --- | --- |
| FR-T01 / FG01/04/07/09/13 | 明确维护贸易伙伴（vendor/customer/both）、非库存商品（expense/service）、AP/AR过账配置、付款条件和税码。均使用法人作用域、严格字段、配置CAS、有效期及版本；代码不变。伙伴与商品显式允许税码交集，选择一个有效税码，不把缺税配置当免税。AP控制为AP负债，AR控制为AR资产；预付/预收分别是同模块的资产/负债；现金账户仅本切片支持的普通cash资产，不冒充BANK子账。初始没有行为的分组字段不添加。 |
| FR-T02 / FG09/13/20限定 | 共享确定性计算器接受最多6位小数的数量/单价，输出币种精度整数金额。支持税外/税内、商业折扣、应税费用、普通税/零税/免税、采购部分不可抵扣及行/单据舍入；预览显示基数、税、可抵扣/进费用部分、现金折扣基数及尾差来源。原币必须是会计币，报告币不同继续明确未折算。不能把负价/负数量当贷项，也不能接受客户端计算税额。 |
| FR-T03 / FG05/07/42 | 新固定贸易适配器建立有schema的权威业务事件及可重建的逻辑状态，不再只是存一段无人使用的objectEffects。每次动作校验对象及余额版本、业务重复键、日期链和状态；预览零写，确认在同一BEGIN IMMEDIATE中读取一致的完整逻辑投影并重算，原子持久化业务事件/GL/回执/审计。投影可由已验证前缀增量恢复，但不能相信客户端或未验证的持久化后像；完整历史重放、重启/独立恢复得到相同未结项。任一失败全部不变，旧已成功原封套重试仍先返回原回执；原始凭证/事件不可改删。 |
| FR-T04 / FG09/13/14限定 | 费用采购发票形成真实供应商未结项、费用与可抵扣税；服务销售发票形成客户未结项、收入与销项税，不产生库存或COGS。关联非库存订单须逐行提供唯一orderLineId：累计不超剩余数量，按D-TRADE-A保存的原行净额比例量化后比较，含商业折扣/应税费用且剔除税，价差1%含边界；超价须单独明确模拟例外批准和原因。无PO的费用发票明确“不适用PO匹配”，不是伪造匹配通过。供应商外部发票号按NFKC/首尾去空白/大写去重，内部空白保留；同伙伴不同事件号仍不能重复开票。 |
| FR-T05 / FG10/13限定 | 明确选择未结项及核销总额，可部分账面付款/收款；计算实际现金及可选净额1.5%现金折扣。期限以单据日加30/7自然日，折扣截止日包含当天，过期或不可用折扣拒绝；未勾选不自动拿折扣。每次按剩余净额/税额分配核销总额，最后一次吃尽尾差；普通现金折扣不改变原税。禁止超额、跨伙伴/币种、重复、无来源核销。输出账面已结算/剩余及链路，不声称实际银行支付或对账完成。 |
| FR-T06 / FG10/13限定 | AP预付款、AR预收和正式发票分开；预收不确认收入。明确将同伙伴同币种的预付款或贷项应用到发票，受两边剩余额/版本约束，输出控制科目转移与结算链。部分应用可继续，重复不能多冲；预付发票路线及预收税另在后续切片验收，不把本次日记账预付冒充两路线全做。 |
| FR-T07 / FG06/11/13限定 | 非库存贷项关联原发票，按原行的价格、税和累计可贷数量分配，保留原来源并形成可应用/退款的反向未结项；不是实物退货。通用手工冲销不得取消贸易凭证。完整未结发票/贷项/预付均可专用取消，恢复受影响原发票可贷量/订单数量；结算/应用可专用反向并恢复其余额，必须新来源号、原因及不早于相关对象最晚事件日。全量精确反向取服务器原行，停用/结构变化不阻断历史；部分新贷项仍须当前合法写入配置。有效后续依赖未撤销前拒绝取消，不自动反转其他业务。 |
| FR-T08 / FG03/07/39/41/42限定 | 查询供应商/客户未结项、当前余额、月末历史余额、到期及账龄、来源/凭证/核销详情。金额按保存的控制/预付科目汇总，与同范围GL核对；其他来源/差异单列，不自动抹平。历史不能被未来核销或当前配置隐藏。扩充trade/tax模块准入，已有期间不自动打开新模块；配置/对象/期间任何变更令旧预览失效。中文/英文label、教学开关、红绿主题及未保存输入/迟到响应保护保留；新贸易数据不自动发送AI。 |

M-TRADE-A明确数值与边界：输入沿64KiB及现有代码/文本/日期约束，单据1..100行；数量为正、单价非负，货币总额须为正，不接受舍入成零的发票。商业折扣及比例0..100%，有效税率区间不得重叠；不同业务日期保留，税率按taxDate选、会计/维度/科目按accountingDate选。计算中间用BigInt有理数，最终安全整数；无可用率或不支持税种/库存/币种明确拒绝。以上是可调整的本产品输入约束，不是会计准则或性能承诺。

补充可观察口径：核销控制/预付与贷项损益/税科目取原对象角色快照；现金/折扣取当前profile。新行遇原快照科目停用须明确拒绝并提示恢复/纠错，不改投新控制。折扣以付款accountingDate核窗口，allowPartialDiscount=false仅无有效结算的原发票一次全额可用。税抵扣在最终逐行税分配后分别half-up。月末账龄按原到期日分未到期、逾期1–30/31–60/61–90/91+天桶，贷项/预付单列；具体响应字段与整数oracle见D-TRADE-A及TC-T02/03/06/07/08/10。新旧法人均不自动开启trade/tax；内置权威投影及备份只读构造必须同样验证贸易事件。

核销维度验收沿已批准的原角色/维度约束：付款、收款、退款和应用的各控制/预付行保留各原对象最终控制行的维度集合，不受伙伴默认维度后续变化重定向。多维度集合按D-TRADE-A的规范段序、逐段剩余比例half-up及末段取尽算法精确分摊，部分核销保留段余额，反向恢复原分配。相同控制科目的跨维度应用仍须真实转移两段，只有逐科目及维度集合均净零才可无GL。当前新写入结构或固定维度若不再容许原集合则明确拒绝，不悄悄把历史余额移至新维度；完整历史反向仍免于新配置限制。

**NFR-T01（缓存补充G2待审）：** 日常预览、确认及读取不得为每个请求重新执行已验证贸易前缀的归档配置/领域planner/历史GL逐事件校验。在同一SQLite快照内核对法人、全局版本和接受审计水位，补验新增后缀；每个后缀事件须按接受序更新所有asOf不早于其accountingDate的已缓存月末切点，包括后录入的独立回填单据，不能只更新所属月份。失败、回滚、跨句柄更新及法人/月切换不能留下超前或过期余额。完整性检查、构造重开和备份校验仍强制独立完整重放，不能因热缓存跳过坏事件。缓存仅在内存、可丢弃，不更改v1 schema或token/幂等/历史语义。以确定性前缀复用、两句柄及回滚/损坏用例验收，并记录400张五行发票的冷/热开销；这是复现规模，不是生产容量或毫秒SLA。实现须先通过D-TRADE-CACHE及TC-T15的独立G3。

有限后续范围：M-TRADE-B接采购库存订单/分次收货/已收未票、销售分次交付/发票、原成本实物退货及库存价值来源；依赖M-COST-TAX对应FIFO/暂估计算契约。M-TRADE-C补预付发票路线、待批准发票登记/审批、催收利息/费用及准备/核销/恢复。完整成本方法、税时点/结算、FX、实际银行状态分别与其既定里程碑组合验收。这些不是本切片已就绪的代码任务，也不能在A完成时将FG08..15整体标done。

## 主题与双语label（FR-33..35）

- FR-33：默认红色、可选绿色，全局主题选择；本机同源localStorage `ai-native-erp.theme`存red/green。切换即时且不重建表单/不请求写API。错误/不平衡采用显式!、文字/差额及区别主色的警示色，不能仅以主色表示错误。存储失败可见，不假称已保存。
- FR-34：默认中文，可选English，localStorage `ai-native-erp.language`存zh/en；HTML lang同步。所有界面label（导航/标题/按钮/表头/选项/提示/确认/隐私/空态/AI前缀/占位/aria等）外置为独立zh/en资源，按稳定key引用；两套keys与插值参数一致，不用运行时机器翻译或未匹配时默默回退。语法/服务路径/会计编码等非label字符串不要求翻译。中文去重复英文装饰，英文显示英文label。
- FR-35：切语言原地更新label，不丢输入/所选科目维度/正在编辑ID、业务预览token、已展示AI候选或未完成请求；不覆盖账套双语科目名、用户摘要/业务ID、AI正文。API/会计引擎诊断原文作为服务端诊断保留，不编造英文会计错误；客户端提示/操作文案按当前语言。错误/隐私/确认等仍明确可见。prefs损坏值回到已声明默认并提示；无写账/无真实AI自动调用。原教学开关/56回归保护。

## ERP工作台改版（用户确认，FR-29..32）

- FR-29：业务概览+分组导航（日常：日记账/业务事件；查询：总账/报表/关账；设置：科目/维度/服务规则；AI助手）。仅保留现有真实功能，不创建未来空模块。期间位于唯一全局顶栏，不再LOCAL WORKSPACE。业务事件页不含配置表单；缺服务/规则/回执给可操作空状态。
- FR-30：教学模式默认关闭，以本机同源localStorage键`ai-native-erp.teaching-mode`保存on/off。关闭隐藏学习路径/概念卡/教学扩展说明/概念提示，保留风险、输入要求、数据口径/权限/不可逆操作及非生产边界；打开恢复教学。开关不请求写API、不影响期间/账套/会计/AI能力，不丢当前未保存输入。存储不可用要明确提示，不假装持久保存。
- FR-31：新凭证及清空行科目为空、借贷为空且以占位提示，已有/示例/AI内容保持原值；已配置维度行直接展示，无维度时显示设置入口。金额以整数分比较，差额非零醒目标红并显示绝对差额及较大方向；非法精度仍提示错误，服务端校验不变。
- FR-32：凭证内“一句话→AI起草”，报表行“为什么是这个数”预填同月/科目/金额/口径问题，仍由用户明确发送后调用原受限API。结果仅显示候选，明确采纳后填编辑器、不自动保存/过账；切月/离开页面后的迟到响应不能填入新上下文。教学关闭也保留业务AI、隐私/质量提示及显式操作边界。无真实调用不得宣称连接/质量新验收。

本轮不含TASK11-13下钻/勾稽，不改变GL/期间/原始教学账套，不新增ERP业务对象。原48回归是历史证据，新改版须实际DOM/真实浏览器和独立评审。

## 完整功能需求基线 PLAN-44（上轮文档，目标继续有效）

**权威关系：** 下表是公开产品目标及稳定需求/验收编号；FR-01..28仍是已获准并交付的具体增量，不被新规划覆盖。FG整体状态只在全部目标验收满足时才标完成，当前状态以[项目进度](project.md)为准。[范围索引](source-analysis.md)不是私有研究资料的副本；公开版本不包含原始来源、案例或答案。不作税法、特定准则或生产合规承诺。

**当前授权：** 用户已授权自行获取完整信息并完成全部44FG，代选OQ-01..10的可调整默认政策。新增政策不是已实现功能或全范围G3结论；每个里程碑仍须先审查其需求、设计与用例，再实施并实际验收。FR29-35的ERP优先、教学开关、主题及双语约束继续有效。以下默认数值是本产品显式选择，不冒充会计实务的统一强制标准；综合演示必须独立编写虚构输入与预期，不复用未公开案例。

下表每项输入均包括明确政策/有效版本，状态改变须由用户批准且原子持久化；失败不留半账，重复提交不得重复入账，历史链路不可改写，AI不得决定规则或自主写账。TC-101..144是**计划验收**，不是已执行测试；具体用例见[test-cases](test-cases.md)。这些是通用ERP产品能力，不是来源章节的转载。

| FG / 需求 / 计划验收 | 用户操作、输入与可观察输出；正常/异常验收 | 范围 |
| --- | --- | --- |
| FG-01 / FR-101 / TC-101 | 教师维护科目类型/报表类别/方向/用途/账套；配置影响分组和结转，原值与备抵分别保留。正常可解释净额；异常受限直接录入/错误用途定位，历史不重写；统计数量不塞货币试算。 | 产品规划目标 |
| FG-02 / FR-102 / TC-102 | 维护维度和值、默认/派生/固定/有效期/最终组合来源；业务输入产生可解释科目组合。正常新增部门不复制费用科目；缺必填/停用/非法组合拒绝，覆盖顺序明确；平衡维度解释内部平衡行，标签不冒充维度报表。 | 产品规划目标 |
| FG-03 / FR-103 / TC-103 | 维护会计/单据/税日期和年度日历/开放范围；会计日决定期间，到期/税时点独立。正常保留旧发票日期并用获准会计日；禁止期/缺日历/无权日期拒绝，Opening/Closing不可普通录入，永久关闭不可恢复。 | 产品规划目标 |
| FG-04 / FR-104 / TC-104 | 维护事件/对象/组/科目/维度/生效版本，输出命中路径与分录来源。正常具体覆盖组再覆盖全部；缺规则/同级或多轴冲突拒绝不兜底，费用与库存/运费处理不混用，预测科目不作付款科目。 | 产品规划目标 |
| FG-05 / FR-105 / TC-105 | 同业务源生成非写入预览，再确认业务及GL；显示原始配置、凭证和待转状态。正常预览与落账一致；配置变化重预览，重复无二次账，失败全回滚，异步路线须可对账而非伪成功。 | 产品规划目标 |
| FG-06 / FR-106 / TC-106 | 查询业务/凭证身份，按来源冲销/更正/重分类；输出原交易与纠错链。正常精确反向并保留原始记录；已过账不可编辑删除，重复/非法取消拒绝；GL冲销不冒充子账业务取消。 | 产品规划目标 |
| FG-07 / FR-107 / TC-107 | 对输入、审批、对象/数量/金额匹配及重复业务校验，输出行级诊断和批准状态。正常合规输入可预览批准；类型/受限科目/超政策差异拦截，借贷平衡不能绕过业务完整性。 | 产品规划目标 |
| FG-08 / FR-108 / TC-108 | 采购订单→分次收货→已收未票清单/应计，保存数量与价值来源。正常按已收数量形成选定政策分录并与清单一致；超收/重复收货/关期拒绝，发票后对应清理而非抹平应计。 | 产品规划目标 |
| FG-09 / FR-109 / TC-109 | 供应商发票关联PO/收货或费用采购，匹配税费/价差，输出应付与库存或费用分录。正常费用不增库存；重复发票、超匹配政策或缺会计规则明确拒绝，失败不更新未结项。 | 产品规划目标 |
| FG-10 / FR-110 / TC-110 | 选择应付未结项、付款、部分结算、折扣及预付款应用；输出剩余余额/结算链和GL。正常部分付款后子账与控制科目相符；重复应用/超余额/失效折扣拒绝，不把生成付款当实际银行支付。 | 产品规划目标 |
| FG-11 / FR-111 / TC-111 | 关联原采购退货/贷项或待批准发票，输出数量、税额、应付/待批准状态。正常原来源及批准状态可查；重复退货/无来源贷项/超过可退量拒绝，未批准与费用确认不能混淆。 | 产品规划目标 |
| FG-12 / FR-112 / TC-112 | 销售订单→部分交付→开票，按政策产生收入/税/成本和库存来源。正常收入与COGS配比可追；重复成本、超交付/重复发票、关期拒绝，物理与财务更新分清。 | 产品规划目标 |
| FG-13 / FR-113 / TC-113 | 客户收款/预收/部分结算/销售退回及贷项应用；输出应收未结和原交易链。正常预收应用后子账与GL一致；超额应用/重复核销拒绝，实物退回与仅贷项不能混作同一库存变化。 | 产品规划目标 |
| FG-14 / FR-114 / TC-114 | 无库存服务发票及付款条件输入，查询到期/账龄/催收计划和利息/费用依据。正常发票不造库存或COGS；无计算政策不得生成催费/利息，日期边界可核，重复收费拒绝。 | 产品规划目标 |
| FG-15 / FR-115 / TC-115 | 评估坏账准备，批准核销/恢复/收回；输出准备、客户未结与控制科目变化。正常不重复记费用，恢复/收回关联核销；无可核销余额/重复恢复拒绝，子账与GL不允许分离更新。 | 产品规划目标 |
| FG-16 / FR-116 / TC-116 | 维护物料及财务收发，在选定成本模型下查询数量/价值/暂估。正常收发存守恒、模型对照可复现；缺成本政策/超可用量或负库存按明示政策拒绝或标识，暂估不冒充最终财务成本。 | 产品规划目标 |
| FG-17 / FR-117 / TC-117 | 对选定库存交易运行重算、结算或标记，输出原交易→成本调整凭证链。正常按模型处理而非把重算当关闭；重复运行/错误关联拒绝或幂等，已结算与待结算差额清楚。 | 产品规划目标 |
| FG-18 / FR-118 / TC-118 | 输入标准成本版本/实际价格或移动平均收发，输出PPV、在手重估和差异归属。正常按各模型独立算法解释；无有效版本/错误回溯/重复重估拒绝，不混用FIFO/标准/移动平均。 | 产品规划目标 |
| FG-19 / FR-119 / TC-119 | 输入盘点数量或教学生产投入/完工，输出盘盈亏、WIP和完工差异。正常数量/成本守恒；无批准盘点/重复完工/不明差异定位，不以盘点代替退货或业务纠错。 | 产品规划目标 |
| FG-20 / FR-120 / TC-120 | 配置税码交集、税基、税率/生效期和可抵扣性，业务产生税明细及税/成本分录。正常可区分零税率/免税与不抵扣；缺税码/越生效期/不明舍入政策拒绝，不冒充法定税务合规。 | 产品规划目标 |
| FG-21 / FR-121 / TC-121 | 按明确政策模拟自计税/条件税/预收税，输出净额及对应时点的双边税明细。正常付款触发/递延转实可核；重复触发/时点不明拒绝，净税为零不代表没有交易。 | 产品规划目标 |
| FG-22 / FR-122 / TC-122 | 按税期结算、更正、留抵及付款预提税，输出税明细→结算→付款链。正常税明细和结算勾稽；重复结算/迟到更正归期错误拒绝，不重复确认税或费用。 | 产品规划目标 |
| FG-23 / FR-123 / TC-123 | 录入原币、会计币/报告币、汇率类型/日期及精度，输出可追来源的换算金额。正常重现历史折算；缺汇率/币种/精度不明拒绝，新汇率不改历史凭证。 | 产品规划目标 |
| FG-24 / FR-124 / TC-124 | 选外币未结项/GL/银行进行连续重估及结算，区分已实现/未实现差额。正常重估滚动及部分结算不重复计差额；缺未结项来源/重估冲销政策或重复批次拒绝，AR/AP、GL与银行口径不混同。 | 产品规划目标 |
| FG-25 / FR-125 / TC-125 | 银行账户、付款方式、桥接与支票状态驱动银行子账和GL，输出实际付款与在途。正常桥接前后来源一致；重复支票/错误状态迁移拒绝，生成付款不等于付现。 | 产品规划目标 |
| FG-26 / FR-126 / TC-126 | 导入教学银行流水，匹配业务并批准银行发起费用/利息，输出匹配/时间差/待记账差异。正常批准调整后GL与对账复核；重复导入/不明差异不得标完成，匹配本身不偷偷记账。 | 产品规划目标 |
| FG-27 / FR-127 / TC-127 | 按来源未结、到期计划与假设生成现金预测，显示刷新时点和假设。正常与实际现金隔离；失效来源/重复预测不造凭证，不把预测当现金流量表。 | 产品规划目标 |
| FG-28 / FR-128 / TC-128 | 建资产卡、取得/资本化及账簿，关联采购/费用来源，输出原值与账簿价值。正常避免AP与资产或多账簿重复入账；无归属/重复资本化拒绝，子账与GL勾稽。 | 产品规划目标 |
| FG-29 / FR-129 / TC-129 | 按方法/年限/残值/惯例形成折旧提议，批准后记录期间折旧。正常可解释计量、处置后停止；重复期间/关期/超可折旧额拒绝，不自动采用未确认准则。 | 产品规划目标 |
| FG-30 / FR-130 / TC-130 | 资产估值调整、出售/报废、拆分/转移，输出原值/累计折旧/处置损益链。正常拆分守恒；已处置再折旧/重复处置/无来源变更拒绝，不改原取得记录。 | 产品规划目标 |
| FG-31 / FR-131 / TC-131 | 明确租赁支付时点/折现率/费用模式，生成初始确认与负债摊销计划。正常现值、付款、利息及负债滚动勾稽；缺政策/重复支付或重估拒绝，教学模型不宣称准则合规。 | 产品规划目标 |
| FG-32 / FR-132 / TC-132 | 四类期末调整、摊销计划和自动冲回输入日期/金额/计划，输出本期调整及后续来源链。正常总额守恒/跨期可追；重复运行、关闭期、冲回无来源拒绝，原手工示例不等同计划模块。 | 产品规划目标 |
| FG-33 / FR-133 / TC-133 | 选分摊来源/目标/基数或履约计划，输出归属变化与确认分录。正常分摊守恒、履约不同于开票；零/负基数或未定比例政策拒绝，不混用未确认算法。 | 产品规划目标 |
| FG-34 / FR-134 / TC-134 | 查询已启用模块关账依赖/差异，单独选择期间冻结或年结/重跑，输出状态与期初来源。正常年结不重复期初；未处理依赖/非法重开拒绝，不静默改变旧每月结转模式。 | 产品规划目标 |
| FG-35 / FR-135 / TC-135 | 两个独立法人账发生公司间交易，生成关联due-from/due-to及双边凭证。正常各账独立平衡；单边失败可识别且不得伪称配对完成，法人不由维度冒充。 | 产品规划目标 |
| FG-36 / FR-136 / TC-136 | 公司间贸易/集中付款关联双边业务与付款归属，输出配对差异及清算链。正常源单据/币种/期间对应；漏单/重复分摊/单边归属错误定位，不用差额GL掩盖。 | 产品规划目标 |
| FG-37 / FR-137 / TC-137 | 选择法人范围/映射/抵销规则运行合并，输出内部往来、交易及未实现利润抵销。正常独立合并账不覆盖法人原账；映射缺失/重复批次/未配对差异拒绝或明确待处置。 | 产品规划目标 |
| FG-38 / FR-138 / TC-138 | 输入集团折算政策/汇率及持股，输出CTA/NCI和合并权益勾稽。正常净资产/损益份额可核；缺持股或汇率政策拒绝，不将子账重估当集团折算。 | 产品规划目标 |
| FG-39 / FR-139 / TC-139 | 从试算/报表科目下钻期间总账及来源，输出期初+发生=期末、净利→权益→资产负债勾稽。正常同口径金额可复核；差异可定位不掩盖，历史和停用科目仍可查；当前无独立维度平衡试算。 | 产品规划目标 |
| FG-40 / FR-140 / TC-140 | 明确现金流分类/非现金项目和比率公式/期间，生成现金流量表及比率依据。正常三类净额=现金变动；无分类/分母零/口径不明显式提示，不以现金预测替代。 | 产品规划目标 |
| FG-41 / FR-141 / TC-141 | 按子账/GL/待转批次对账、分类差异、处置后复核，输出控制科目一致性与来源。正常未结项/已过账与待转分开；未解差异不标完成，不通过手工抹平消失。 | 产品规划目标 |
| FG-42 / FR-142 / TC-142 | 只读追溯业务证据/凭证/配置变更并检查“平衡但错”，输出已知诊断及不能自动判断的边界。正常解释源路径；缺证据/配置历史不编造，金额平衡不等于业务无错，不承诺审计认证。 | 产品规划目标 |
| FG-43 / FR-143 / TC-143 | 在独立教学环境使用自行编写的虚构业务、明确政策和错误练习，输出可复现分录及报表核对。各业务分支单独验证来源和预期，不污染用户账套，不把尚不存在的模块硬拼为已可用综合流程。 | 产品规划目标 |
| FG-44 / FR-144 / TC-144 | AI按已启用模块事实快照解释、建议及诊断差异，展示来源/时点/不确定性。正常候选确定性校验再人工批准；编造科目/越权/工具请求或敏感外发拒绝，无真实调用证据不称连接成功。 | 产品规划目标 |

### OQ决策记录：委托默认方案（POLICY-01）

下列每项均为 **协调者依据知识库代为决定，可调整**。通用会计约束与产品默认分开：双重记账、可追来源、原子性、不可改写历史不是可关闭的偏好；税率、日期惯例、容差、方法、分类和展示是版本化产品政策。已过账交易保留原政策快照；变更不重算历史，未确认预览失效。私有原文、案例及答案不进入公开文档、种子或AI提示。

| 决策ID | 采用的默认方案 | 依赖范围 |
| --- | --- | --- |
| OQ-01 | 先共享事实/计算契约，再采购应付、销售应收；成本及税计算器先于相关交易编排，不要求整模块先完成。缺能力明确阻塞该交易，不能成功落零成本/零税占位账。七里程碑按真实切片依赖推进。 | FG08-15及所有新业务 |
| OQ-02 | 本机、单操作员、非生产，真实身份认证及多人部署不支持。审批为明确标注的模拟制单/复核/配置/只读角色，不能冒充独立人员授权。默认同步原子过账；仅对已审查路线提供显式待转总账状态。账证/配置/来源历史不自动删除；不记录完整财务请求或凭据。备份为显式一致性快照，恢复到独立副本并验证，不覆盖活动账。恢复点为最后一次验证备份，无生产SLA/RTO保证；容量/延迟只有实际基准结果才能宣称。 | FG07/42及跨模块非功能要求 |
| OQ-03 | 旧账继续月度教学结转；新法人账默认公历财政年度、12自然月、月冻结不清损益。期间open/hold/permanent，重开需原因，永久关闭不可恢复；禁止自动改会计日期。Opening/Closing只由专用工作流写入。年结生成次年期初及留存收益，不叠加旧年余额；重跑追加差额、无变化不新增，撤销保留反向链。迟到业务令后续快照失效，逐年更新；默认保留归属维度。 | FG03/32-34 |
| OQ-04 | 首条实物流FIFO；完整比较范围保留FIFO、LIFO、LIFO-date、加权平均、日加权平均、标准成本、移动平均。数量/单价最多6小数，金额按币种精度；禁止负实物库存/超预约。物理与财务收发分层，未票库存可按明确暂估出库，财务结算不得伪造缺失成本。重算不等于结算关闭；关闭与撤销有截止/最新优先规则。标准价版本、收货与发票价差分开；移动平均将已出库份额价差入差异科目。标记须来源同池且限量，移动平均不接受标记。盘点须批准；有限生产含材料、人工/间接费、WIP、完工及差异。 | FG08-12/16-19 |
| OQ-05 | 中性教学税制，不作辖区合规承诺；示范普通税率12%，须显式选择应税/零税/免税/自计税，缺码不得当免税。默认税外价，支持税内价；税基为商业折扣后净额加应税费用。按行/税码对称half-up到币种精度，单据模式按最大余数及稳定行序分尾差。不可抵扣税进对应成本。条件税按实际消除的合格本金比例转实，最终分配吃尽尾差；预收税显式启用，应用时冲回对应预收税，发票税只留一份。付款折扣默认不改间接税，另验同比减税政策。付款预提税单独登记，不混间接税。月度税结算按明细身份去重，更正追加、留抵可追，关闭期更正保留原税期/新会计日。 | FG09-15/20-22 |
| OQ-06 | 新账默认会计币EUR、报告币USD；原教学单位不改名。币种精度显式配置0-4位，人工汇率正向/类型/日期/换算因子保留，最多8位小数；取不晚于交易日的最近有效版本，缺率拒绝。独立从原币换算会计币和报告币，精确定点/有理数计算。AR/AP按未结项，银行按子账，GL排除已由子账处理的控制科目。部分核销只冲对应未实现差额并独立确认已实现差额，尾次吃尽余额；连续重估按增量。标准、仅损失及恢复历史基准为不同显式方法；非货币历史成本项目不重估。 | FG23-24及外币业务 |
| OQ-07 | 库存三单匹配、服务两单匹配；数量零容差，净价差不超过原匹配净额1%（含边界），超额须改商约或记录例外批准。付款默认30天，7天内净额1.5%现金折扣（含当天），允许比例部分折扣；明确核销、禁止超额/重复，最早到期仅作建议。准备法账龄档current/1-30/31-60/61-90/>90，示范比例0/1/5/20/60%；核销用准备，收回先恢复。催收7/21/45逾期天数，费用默认0，需启用才按ACT/365年4%简单利息且区间不重叠。银行申请/生成不付现；桥接/支票/PDC/退票状态独立，核销反转须恢复来源。流水支持规范CSV及有版本边界的ISO20022/BAI2/MT940教学适配；匹配同账户币种、精确金额/标准化参考、日期差最多3天，歧义须选择。匹配不记账，未解差异不完成；仅显式批准最多1最小单位更正。预测90天，已开票部分替换订单计划，不造现金。 | FG09-15/25-27/41 |
| OQ-08 | 一个财务主账簿入GL，比较账簿不重复入主层；资本化唯一来源。默认直线、月频、零残值、服务开始月整月/处置月不提，寿命必须填；余额递减比较及剩余期直线切换、估计变更前瞻，尾差守恒。减值/转回/重估显式政策。租赁默认融资式、期末月付，另验经营式/期初付款；利率/期限显式输入，不猜市场利率。年有效率按等价复利折算，名义率另标频次，非整月ACT/365；计划变更追加版本，单一摊销所有者。四类调整有来源/执行/冲回，月均摊与日摊可选。分摊支持比例/权重/均分/余额基数，基数非负且合计正，最大余数尾差、快照防自循环。履约按相对独立售价分交易价，时段按受益天数/时点需完成证据，合同资产与应收分开。 | FG28-33 |
| OQ-09 | 各法人独立余额/期间/币种/源身份；同一SQLite事务内双边业务和GL原子写入，任一失败全部回滚，不宣称分布式恢复。贸易控制科目与一般公司间清算分开；集中付款折扣/汇差默认归发票法人。合并用独立版本批次和抵销层，不改法人账；缺映射/未解配对不能发布，重跑替代有效版本不累加。库存利润按来源/集团成本/剩余量递延并在外售释放，资产内部利润及多提折旧也抵销。稳定直接控制结构，另验非全资/层级去重；控制与持股分开，全额并表后分NCI。简化投资权益抵销要求明确投资成本/取得净资产/NCI，默认账面价值无商誉，超该前提拒绝简化。资产负债期末率，损益交易日率、平均率仅显式近似，投入权益历史率/期初留存沿用上期，CTA和NCI独立滚动；不得用CTA掩盖缺资料。 | FG35-38 |
| OQ-10 | 同现金范围的直接/间接法独立计算；客户/供应商/员工/所得税/利息默认经营，资产买卖投资，资本/借款本金/股利/融资租赁本金筹资；经营租赁经营，可版本化改政策。内部现金划转排除；非现金单列，多币须三类净额+汇率影响=现金变动。未分类不标最终完成。比率为流动/负债/毛利/净利/DSO/存货周转，公式及范围见设计，零分母不可计算、负分母限制解释。原创隔离教学按14个有限分支覆盖全部业务与方法/错误比较；AI只消费最小已启用事实快照，显式发送、来源/时点/不确定性可见，不选政策、不执行工具、不自动写账。 | FG40/43/44 |

OQ默认已记录，不再是等待用户普通决策的阻塞；其**设计可行性、精确契约和测试覆盖仍须各里程碑G3**。未来涉及真实认证、互联网部署、真实支付/报税、并购商誉/持股变动或跨存储分布式事务，属于明确新增扩展，不通过伪造现有能力完成目标。

### M-CORE：新法人账的可运行底座（待本轮G3）

新功能使用显式创建的ERP法人账，与原月度教学账并存；原账不原地升级。以下是首个里程碑的有限出口，仍通过FR-101..107映射完整目标，不用有限出口替代其余业务验收。

| 子需求 / FG | 可观察的本轮出口 | 跨里程碑仍须完成 |
| --- | --- | --- |
| FR-C01 / 01、03、35 | 创建/选择独立法人、全库统一币种精度及财政年；空账无种子分录。同币种跨法人scale不得不同，已用币种精度不可改。共享版本化科目模板可复制为法人覆盖，查询/源身份不会串账。M-CORE交易币必须等于会计币，报告币未折算时明确显示不可用、不能记零；行结构仍保留未来原币/会计币/报告币及率来源槽位。原教学账/八科目/未知草稿保持，用户显式选新账才使用新模式。 | 真实FX及报告币折算在M-COST-TAX；实际公司间双边业务及合并，非仅两个法人空壳。 |
| FR-C02 / 01、07 | 会计类型/报表类别/正常方向/操作用途/备抵关系分别配置且有行为；反向余额只提示。控制科目拒绝普通手工/AI/导入，只有注册业务适配器可产生；清算按来源配对、暂记必须责任人/原因/复核日并显示逾期；未清项以选月末为时点，后月匹配不抹除前月未清状态，匹配会计日不得早于任何被配原行；统计数量单独登记不进货币TB。历史使用后禁止身份/类型/操作用途改变（尤其禁止普通余额改成控制余额），配置版本和原值/备抵/净额可查。 | 控制科目与每个实际子账的完整性、结转及源纠错，随相应模块验收。 |
| FR-C03 / 02 | 公司/科目/单据/行默认、显式空值、派生fill/replace、固定值/固定空值按D-CORE顺序解释；最终必填/条件结构/允许组合、维度有效期/状态统一校验。显式选择一个平衡维度及内部平衡科目后，生成有来源的内部平衡行；维度查询/统计口径不冒充法人。 | 年结按归属维度承前在M-ASSET-CLOSE，业务主数据维度在相应模块接入。 |
| FR-C04 / 03 | 会计/单据/税日期独立；完整公历年度及12月经营期间，Opening/Closing只供系统。期间open/hold/permanent及模块准入，禁止日期/无日历拒绝；hold重开有原因，permanent不能重开。新模式月冻结不清损益。 | 灵活财政边界、完整关账依赖、年度期初/差额重跑及连锁失效在M-ASSET-CLOSE；永久关闭只允许无未完义务的专用入口。 |
| FR-C05 / 04 | 有效期内事件语义/对象与对象组/对方组多轴规则，明确exact→group→all；跨轴不相容候选拒绝，缺失/同级冲突拒绝，不能从非法胜者退到弱规则。预览显示候选、版本、科目及维度来源；预测科目不能当支付科目。 | 采购/销售/税/成本/银行等真实事件的专属科目来源契约及价费处理在各模块接入，不以任意手工行冒充业务闭环。 |
| FR-C06 / 05、07、42 | 统一只读预览及确认计算；输入/账套/期间/配置/对象版本变动含ABA后旧token拒绝；明确本机模拟批准，不能冒充独立人员。同步源状态/GL/回执/审计原子写；重复同源返回原批准回执及当前处理状态，不同输入冲突；重启/关期/改配置后成功重试不再执行。可审查的手工队列路线持久显示pending/failed/transferred/withdrawn，转账不重复、不伪称GL完成，待转阻止关期；未转手工计划可凭原因明确撤回，无GL且保留证据/原身份不可重用。 | 各子账自身效果与GL原子一致、特有业务重复检测；更多异步路线只有各自G3批准后开放。 |
| FR-C07 / 06 | 已过账凭证/行/维度/原始快照不可改删；来源→凭证双向查；手工来源的精确冲销/关联替换或重分类保留原始链，停用后仍可反向历史但须合法期间。新ERP中reverse/replace/reclassify及cash_service.cancel的会计日不得早于被纠错原凭证日，也不得早于该原来源纠错/撤销链中最晚的会计日（包括使原来源重新可纠错的撤销事件），同日允许；旧Book不改。重复冲销及普通来源冒充系统/子账拒绝；GL冲销不提供业务取消假成功。 | 退货、核销反转、资产处置/租赁等源纠错及双边取消由对应模块实现；红字比较分支须另验发生额而不只余额。 |
| FR-C08 / 07、39、42 | 确定性行级诊断、历史配置/模拟批准/来源审计、同范围TB/总账/财报和基础维度查询可复核；快照过期可见。显式一致性备份及独立副本恢复核验，原账不覆盖。中文/英文label、红绿主题和教学开关保持，关键限制始终显示。 | 完整报表/跨子账对账/平衡但错诊断及原创教学/AI在所有真实模块启用后组合验收。 |

M-CORE出口是上述限定底座，不提前把FG-01..07整体标done。完整目标的跨模块验收项是有限且具名的集成依赖，不是无限追加可选项。只读待转/未解控制差异、同源链、失效标记随模块完成，不拖到最后一轮才发现。失败必须显式诊断且回滚，不增加自动“差额平账”。

### 已批准实施的明确只读切片

- FR-139-A / TC-139-A：现有三种试算表的科目可进入同月该科目完整已过账总账，保持历史月份、停用科目可见，不隐式增加维度或试算阶段过滤；非法科目/月份保留服务端错误。必须说明未调整/调整后试算与完整总账包含凭证种类不同，金额不必相等；已关月损益试算非零而总账期末为零是预期。只读导航，不新增会计政策。
- FR-139-B / TC-139-B：只读对账结果包括每种试算借贷差、资产-负债-权益、权益摘要期末-权益、收入-费用-利润。逐项输出整数分left/right/difference/pass及allPass；差异必须可见，不写账/不阻止合法业务，不代表子账/税/现金流已核对。月份缺失/格式非法400，合法但不存在404，不默认最新月。固定检查ID及左右值定义见D-READ-B；当前利润关系由同源公式生成，可能恒成立，不是独立会计真实性证明。
- FR-142-A / TC-142-A：在报表界面展示上述有限数学勾稽结果、选定月份与“不能检测所有平衡但错/非审计认证”边界；不是新增配置变更日志或跨子账对账。依赖FR-139-B接口、与FR-139-A导航集成后单独验收。

以上切片沿既有G3限定规划基线完成TASK11–13；当前进度及实际验收见tasks/reviews，不以此宣称FG39/42整体完成。当前44目标虽已获实施授权且有委托政策默认，仍须逐里程碑审查和实际验收，不得伪造全范围G3PASS。

## Accounting properties and bounded phase-A exit (partial FG-01)

- FR-26: Explain normal balance side, not a debit/credit posting requirement. Old/builtin accounts derive DEBIT for ASSET/EXPENSE, CREDIT for LIABILITY/EQUITY/REVENUE. Separate opt-in custom-account properties `{normalSide,purpose,relatedAccount,revision}`: normalSide DEBIT/CREDIT, purpose general/contra, relatedAccount null for general or a distinct existing same-category general account for contra. Contra normal side must oppose the category's ordinary side. A referenced gross account cannot itself become contra; no cycles/chains. Builtin identities/flags/properties remain protected. Separate properties CAS starts0, increments each accepted save including no-op; malformed400/unknown404/stale or protected/conflicting409. No deletion or changes to account type/old lines/periods. Reference may be inactive because historical explanation must remain available.
- FR-27: Observable report explanation under CURRENT configuration: each account's actual closing signed debit-minus-credit balance, configured normal side, normal-relative signed amount and opposite-balance flag. Opposite balance is an informational signal, never a save/post/close prohibition. Contra grouping separately shows gross, signed contra adjustment and net, using closing for balance-sheet types and non-closing period activity for revenue/expense so historical income explanations survive monthly close. Multiple contra accounts sum safely; no netting twice into existing statements. Changing properties changes current explanatory labels/groups for historical queries, NOT original lines, financial totals, classifications, close/reversal logic or source receipt snapshots. All normal-side/contra amounts support legitimate reverse signs.
- FR-28: Chinese account configuration separately saves properties with explicit confirmation/CAS and preserves fields on errors; display purpose/normal side/related account, current-configuration caveat, balance signals and gross/contra/net explanation in reports. AI gets current properties through eligible accounts and report explanation, with instruction that normal side is not a mandatory posting side. Reuse existing active/manualAllowed restrictions (including after-await AI and event shared validation); no new claim of control-subledger support, clearing matching, suspense ownership/workflow or auto-clearing. Any property save changes existing event global fingerprint via accounts including property revision, while completed original source retry remains valid. No external inference needed.

Source: FG01 and （私有引用未公开）: normal-side default differs from DC/CR requirement; contra preserves gross/accumulated amounts; direct GL entry restrictions already implemented. This increment supports general/contra only; other named purposes are NOT selectable inert fields. Acceptance TC33-36; prior44 regressions retained.

G3pretestclarifications: reject a contra whose gross has nonconventional normal side, and reject changing a referenced gross's normal side away from category default (both409); multiplecontras per gross remain allowed. Row signals always use actual closing, so nominal rows are zero afterclose, while nominal groups still show activity; explicitly label both in UI/tests. No historical configuration-snapshot claim.

Finite phase-A teaching-foundation exit (bounded subset, not all source FG01-07): (A1) protected/custom chart plus normal-side/contra explanation and direct-entry restrictions; (A2) dimension catalog, immutable line maps, filtered history, explicitly enabled exact-account required/allowed structures; (A3) existing accounting-date/open-month enforcement and immutable monthly teaching close/carry; (A4) cash-service object/group/all deterministic matching, conflicts and explanation; (A5) same-engine preview/confirmed atomic posting/staleness/idempotency; (A6) immutable journals/source snapshots/exact historical reversal; (A7) shared server validation, reviewable AI without accounting/execution authority, verified browser/old-book/local delivery. These seven observable checks close the teaching-foundation release once verified, rather than extending it indefinitely. Full source goals remain partial. Optional later extensions, not exit blockers: richer reporting categories, control subledgers, clearing documents/matching, suspense owner/cleanup workflow, nonmonetary statistics, sharedCOA/legal entities, defaults/derived/fixed/effective-date/balancing dimensions, fiscal calendar/module permissions/distinct invoice-tax dates/year-close mode, other business events/multi-axis/effective-date rules/async completeness. Existing monthly mode is retained explicitly; no unapproved new modules required for exit.

## Opt-in dimension structures (partial FG-02)

- FR-23: One explicit configuration per exact existing account, including protected builtins without changing their identity. `{active,revision,segments,allowed}`; segment `{code,required}` references existing dimensions,1-10 unique segments. `allowed` is0-50 explicit maps of segment codes to known values; no duplicate tuples. Empty list means unrestricted combinations subject to requiredness and ordinary active-value validation. Nonempty list is an exact whitelist of the line's projection onto these segments: omitted optional segment means blank, not wildcard; required segments must appear in every allowed tuple. Dimensions outside the listed segments remain allowed under existing validation. No ranges/overlap/advanced-expression language. Explicit active flag, absent configuration inactive/revision0; accepted PUT increments revision including no-op, stale409. Active setup requires referenced dimensions/values enabled; inactive setup can retain known inactive references so it can be disabled. Unknown fields/types/foreign keys/duplicates reject without partial writes.
- FR-24: For new/edited normal and adjusting journals validate required segments and allowed projection in the SAME Book.validate used by manual save, late manual post, cash-service event preview/confirm and AI proposal validation after await. No autofill/drop/overwrite; errors identify line/account/structure revision/dimension or combination. Missing/disallowed structure409, malformed input400 as existing validation. Configuration changes enter existing global source-preview fingerprint, including ABA; unchanged completed source retries still return original receipt before current constraints. An existing incomplete draft remains unchanged and visible, can be explicitly corrected or deleted, and blocks close as before. No silent migration or rewriting old lines.
- FR-25: Chinese dimension workspace maintains account structure, explicit enable/disable confirmation and CAS; shows segments/requiredness/exact whitelist semantics/scope. Allow-list editor may use bounded JSON maps (not SQL/expressions); show validation failures. Event preview/receipt includes original applicable structure snapshots/versions; AI draft context includes active eligible structures but still only explicitly requested CODE=VALUE, never infers required values. Historical journals/ledger/reports ignore current structure and remain accessible; exact server-validated reversal bypasses current structure after source comparison, aggregate teaching close remains unassigned/system-generated. No new caller bypass. No defaults/fixed/derived/effective-date/balancing dimension or attributed closing; FG-02 remains partial.

Teaching adaptation: exact-account primary key prevents overlapping assignments by construction; unlike source account ranges or advanced conditional segments this small increment constrains only listed dimensions. Source （私有引用未公开） and （私有引用未公开）. Acceptance TC29-32, all40baseline regressions and actual isolatedUI/oldbook/preview/localdelivery.

## Deterministic teaching event increment (partial FG-04/05)

- FR-19: One event only: cash received for a completed teaching service, immediate revenue, no tax/currency/AR/invoice. Explicit teaching-service catalog `{code,name,group}` (uppercase dimension-style codes), immutablecode/name, editablegroup/active withrevisionCAS. Rules map service/group/all to an existing REVENUE account; debit fixed protected1000cash. Rulecreate `{scope,match,revenueAccount}`, update adds `{active,revision}`. Specificservice > group > all; active equal-priority candidates reject409, no match409, invalid/restricted winner rejects without falling back. Match explanation lists candidates/priority/winner/version; explicit rule maintenance, no AI decision or auto seed rule. No effective-date/two-axis/other-event rules yet.
- FR-20: Source event exactfields `{type:"cash_service",reference,date,service,amount,dimensions?}`. Reference1-40uppercase alphanumeric/underscore/hyphen, dateexistingopenmonth, serviceactive, amountpositivedecimalmoney. Optional dimensions copied unchanged to both cash/revenue lines, shared validation; no defaults/derivation/override. Preview returns normalizedevent, calculatedjournal, line meanings and matchedrule explanation without modifying journals/receipts/balances.
- FR-21: Explicit confirm posts the exact recalculated result in one BEGINIMMEDIATE with immutable source receipt, linkedjournal and originalrulesnapshot. Preview token authenticates entireevent/plan and conservative globalcatalog+period fingerprint; any rule/service/account/dimension/period configuration change requires re-preview, even unrelated change or ABA revision. Restart invalidates uncommitted previews. No UI amount/date/service change may reuse prior preview. Competing/duplicate submit same reference+normalizedevent+originaltoken returns the originaljournal without posting again, including restart/closedperiod retries; same reference different input/token409. No successful response with partial state; aggregate-safety failure rolls back bothjournal/receipt. Correcting GL with exact reversal preserves source history/reference, not a fictional business cancellation.
- FR-22: Chinese rule/event UI maintains service/group and rules; preview shows accounts, amounts, dimensions, line meanings, winner/priority/version and teaching limits; a separate confirmation is required to generate AND post (not save editable manual draft). Show immutable source-reference↔journal and original rule/plan snapshot. AI remains suggestion-only, cannot call eventposting tools or determine rules. Preserve all old journals/periods/dimensions/close/report behavior, no existingdata/defaultcatalog backfill. FullFG04/05 and firststage remain partial.

Source contract: （私有引用未公开） event/object→account, specificity/explanation and explicit dimension policy; （私有引用未公开） synchronous all-or-rollback versus pendingGL distinction. Teaching cashservice/group is an explicit adaptation of the existing seed transaction, not a claim vendor/customer posting profiles implemented.

## Foundation dimension increment (partial FG-02)

- FR-16: Maintain named dimensions and their named values. Definition codes `[A-Z][A-Z0-9_]{0,19}`, value codes `[A-Z0-9][A-Z0-9_-]{0,19}`; names trimmed1-80 without controls. Create with active=true/revision1; change only active with explicit confirmation and matching safe integer revision, increment every accepted update, stale409. Codes/names immutable, no deletion/rename to protect historical descriptions. Values scoped to their definition; duplicate409, malformed/unknown fields400. No preseeded or automatic dimensions in old books.
- FR-17: Each manual/AI journal line may carry optional `dimensions` object mapping dimensioncode to valuecode, at most10pairs; omitted/empty is unassigned and preserves legacy line payload shape. Validate supplied codes/values and both active flags at save and again at post/AI return; inactive old drafts remain visible/editable/deletable, never silently drop attributes. Original posted dimensions immutable in domain and SQLite. Exact server reversal copies dimensions and can post even after restriction; clients cannot forge this bypass. AI may use only supplied active catalog; never infer or mutate settings. Existing monetary validation/user posting approval unchanged.
- FR-18: Journal history shows explicit line dimensions. Ledger optionally filters one known dimension/value and includes prior matching lines in opening balance; inactive values remain queryable. Invalid/incomplete filters400/404, unfiltered ledger and all existing reports unchanged. This is a line-filtered ledger, **not** dimension-balanced TB/reporting: current monthly closing is still aggregate/unassigned, does not zero dimension-filtered nominal ledgers or automatically balance dimension combinations. UI must disclose that limitation alongside filters. No default/derived/fixed/required/effective-date/allowed-combination/balancing rules this increment; FG-02 remains partial.

Acceptance: TC-21..24; all31existing regressions, additive old-schema/restart equivalence, exact dimensional reversal, nonmutating AI/API failures, isolated browser and independent G3/G5/G6 under existing MODEL-01. No real external AI call required; controlled fictional contract tests only.

## Goal and boundaries

Teach the complete general-ledger accounting cycle in a working local application. The user selected this bounded first release instead of business subledgers. "All financial accounting demonstrations" is not a promise of unlimited scenario coverage.

The user confirmed: generic accrual/double-entry teaching; a local single-user browser app without login and with saved progress; natural-language draft journals plus teaching explanations; an OpenAI-compatible API; balance sheet, income statement and equity summary, excluding cash flow for now.

## Functional requirements

| ID | Requirement and observable acceptance |
| --- | --- |
| FR-01 | First startup creates a clearly labelled teaching chart of accounts, an open monthly period and balanced example transactions. Restart preserves all saved work without reseeding or deleting it. Amounts use a single neutral teaching unit, not an implied real currency. |
| FR-02 | Create, inspect, edit and delete draft journals with date, description and 2-100 lines. A line has a chart account and one positive debit or credit. Saving and posting require equal nonzero totals, a valid date within an existing open period and precise two-decimal amounts. Reject dates in closed or nonexistent periods. Invalid requests produce explicit errors and no partial writes. |
| FR-03 | Posting is atomic and exactly once; posted journals and their lines cannot be edited or deleted. Only posted normal/adjusting journals may be reversed, at most once while a reversal exists. Server-generated reversal lines are immutable and revalidated against the original on posting. Deleting a draft reversal permits retry. Clients and AI cannot set reversal/closing kind or original references. |
| FR-04 | Show journal history, account ledger with running debit/credit balance, and period-end trial balance. Only posted entries affect these views. Offer unadjusted, adjusted and post-closing views; all totals agree, including after corrections and closing. |
| FR-05 | Support explicitly labelled adjusting journals, including prepaid-expense consumption and accrued expense. Teaching examples explain their effect on profit and balances. |
| FR-06 | Preview and execute monthly close. Block closing with any draft in that period. Atomically close revenue/expense balances into retained earnings; mark the period closed. Block later posting, editing or duplicate closing there. Allow creation of the next consecutive monthly period only after the current period closes. Balance-sheet balances carry forward and new-period profit starts at zero. No reopening in v1. |
| FR-07 | Show selected-period income statement, end-of-period balance sheet and equity movement summary. Closing entries do not erase displayed period profit. Equity includes current unclosed profit once, and only once. Equity summary excludes closing transfers from non-profit movements and remains unchanged across close. Later-period activity cannot change historical reports; next-period opening equity equals prior closing equity. Reports are labelled educational, not compliant statutory statements. |
| FR-08 | AI journal assistance uses the supplied business description and chart of accounts to return a proposed draft with rationale. Validate the returned structured data using the same domain rules, show it to the user and save only on explicit approval; AI cannot post, close, execute SQL or call tools. |
| FR-09 | A teaching assistant explains selected-period ledger/report/close information. Send the actual selected period status and a read-only closing snapshot: draft count, whether close is currently possible, proposed closing lines for an open period, or the actual posted closing journal for a closed period. A zero-profit closed period without a closing journal must still be identified as closed. These facts are a request-time snapshot, not inferred from profit or a live guarantee. Monetary context declares 100 integer minor units per teaching unit; explanations convert report/closing amounts, whereas generated journal amounts use decimal strings in teaching units. Model responses are labelled AI-generated and potentially inaccurate; financial records remain the source of truth. Render text, never executable HTML. |
| FR-10 | Include a navigable teaching walkthrough covering capital, prepaid expense, revenue, accrual, adjustment, trial balance, reports, correction and close, with observable expected effects. Built-in examples are explicitly deterministic teaching aids, not fake AI responses. |
| FR-11 | Support official Copilot SDK authentication already available to this process, without exporting credentials or configuring private endpoints. Prefer `gpt-6.1-sol` only when the service advertises it; verify the selected session model and fail explicitly if unavailable. Preserve the OpenAI-compatible provider. Expose provider/model settings, not secrets, in the UI. Both providers retain the same draft validation and explicit save/post controls. |

## Non-functional requirements

| ID | Requirement and acceptance |
| --- | --- |
| NFR-01 | Store and aggregate money as bounded integer minor units, never floating-point monetary accumulation. Accept decimal strings with at most two places and a maximum line amount of 999,999,999.99 (99,999,999,999 minor units), reject excess size/precision, and check aggregate totals remain safe integers. |
| NFR-02 | SQLite transactions protect multi-table writes and close. A failed operation leaves journals, lines and period state unchanged. Database and environment files are ignored by Git. |
| NFR-03 | Bind only to loopback. Protect every non-GET route, including paid AI calls, with Host/Origin/fetch-metadata checks and JSON-only payloads. Maximum request body is 64 KiB. No external runtime assets or remote scripts. |
| NFR-04 | API keys remain server-side in local environment variables, never returned to the browser or written into records/logs. AI context is limited to this demonstration book and an explicit user request. Warn users not to enter real financial or personal information. |
| NFR-05 | Missing configuration, upstream errors, timeouts and malformed AI output are visible and do not mutate records or masquerade as success. AI timeout is 30 seconds; maximum response body is 256 KiB; prompt is 1-4,000 characters. Real-service verification may be blocked without credentials; controlled upstream tests cover exact thresholds and integration contract. |
| NFR-06 | Use installed Node tooling and existing repository conventions (none beyond the agent). Keep the first release dependency-light and runnable with documented commands; add focused automated tests for accounting/state/security/AI failures and a local HTTP smoke check. |

## Decisions and residual limits

## Authorized first foundation increment (FG-01/07, partialFG-39/44)

The user requested development after the44-goal analysis. This increment adds a small usable chart-maintenance vertical slice, not dimensions/subledgers/year-end. Existing first-release behavior remains except that the chart may contain new teaching accounts.

| ID | Observable acceptance |
| --- | --- |
| FR-12 | List all accounts with built-in/custom, active and manual-entry flags. Create custom accounts with unique four-digit codes1000-9999, trimmed names1-80characters and one of the five existing categories. Preserve original eight codes/names/types and prohibit their modification. No deletion or recoding/reclassification; custom type/code stay immutable. |
| FR-13 | Update a custom account's name and active/manual flags explicitly. A name with posted use cannot change (historical labels stable); drafts do not block rename. Unchanged trimmed name allows flag-only changes even after posting. Reject invalid/unknown fields, duplicate codes and malformed flag types without writes. Use a revision for lost-update conflicts. Configuration never edits journal/period records or balances. New accounts can add zero rows to historical listings, never change historical monetary results; FR-07's snapshot guarantee otherwise remains. Existing books default all legacy accounts active/manual; additive metadata only, no destructive schema/data migration. |
| FR-14 | Manual and AI-proposed normal/adjusting journals must use active, manual-allowed accounts both at save and at actual post. If flags change after saving/while AI awaits, reject fresh validation without posting. Ineligible accounts remain visible unfiltered in history/reports/ledger; flags are labelled in configuration and new-entry choices only, where unavailable choices are disabled. Exact server-generated reversal may correct the original even if those accounts are now ineligible; clients/AI cannot opt into this bypass. Monthly system close still includes all revenue/expense balances even when accounts suspended/manual-blocked. Both flags stop new manual/AI entries in this increment, not a claim that subledgers exist. |
| FR-15 | Browser account workspace supports create, explicit config save and actionable validation/conflict errors. Dynamic accounts participate in journals, ledger, reports, close and AI context; AI suggestions retain shared validation and cannot modify configuration. Preserve selected periods, integer money, explicit save/post and old month-close behavior. Validate on isolated fictional books; do not create/modify preview draftID3. |

HistoricalTASK06scope: bounded additions to the44-goal analysis; FG-01/07 remained partially covered. Preserved monthly teaching close is not standard fiscal-year close. Dimensions and a single teaching-event rule subsequently arrived inTASK07-09; real multiuser roles, fullbusinesspostingprofiles/auditcertification/accountmigration remain unimplemented, not excluded from the newsource-goal planning by this historical paragraph.

Current implemented teaching runtime uses educational units, one local book, calendar months, no taxes or foreign currency. These are bounded first-release implementation choices rather than claimed accounting obligations or restrictions on PLAN-44 planning. Closed periods are immutable; reopening, audit certification and backups are not part of the current runtime.

No latency, throughput, compliance certification or model accuracy guarantee has been invented. Live connectivity must have actual execution evidence; advertised or selected models alone are not successful inference.

The user subsequently requested real AI using the current Copilot configuration. The supported SDK reports authenticated environmental credentials in this host (`authType=env`), not proven persistent CLI login. No credentials were inspected or copied. Copilot is text-only: no tools, MCP, repository instructions, skills, hooks, file/git operations, extensions or cross-session memory; request-owned state is isolated and removed after runtime shutdown. If these boundaries cannot be verified, do not send the prompt. Normal tests must not use real credentials or paid inference.
