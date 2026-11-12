# Requirements

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

**授权分层：** 原本地单人GL及TASK01-10、完整文档/任务规划均已确认；FR29-35允许ERP优先界面、可选教学、主题和双语，不修改会计引擎。44FG是产品规划，不是44模块立即实施授权。未知业务政策先决策再更新设计/验收/G3。金额、税率、汇率、成本/匹配容差和SLA未确认时不设虚构阈值；未来综合演示应独立编写虚构输入与预期，不复用未公开案例。

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

### 未决事项与受影响门禁

| 决策ID | 尚须明确的选择（本轮不代替用户决定） | 依赖范围 |
| --- | --- | --- |
| OQ-01 | 后续先采购应付还是销售应收、每轮最小垂直切片及演示对象；本轮只规划 | FG08-15及后续新业务的实施授权 |
| OQ-02 | 继续单人本机教学还是部署/多人；角色/审批模拟方式、备份恢复、容量/性能/可用性/数据保留和隐私边界 | 所有生产/多人/NFR扩展，FG07/42 |
| OQ-03 | 旧月度结转与新月冻结/年度结转并存方式、日历/日期/重开/年结重跑政策；不得静默迁移 | FG03/32-34 |
| OQ-04 | 首批库存成本模型、负库存、物理/财务收发、价差及重算标记政策 | FG08-12/16-19 |
| OQ-05 | 税教学辖区或中性模型、税基/抵扣/折扣/舍入/容差、条件税/更正与预提税政策 | FG09-15/20-22 |
| OQ-06 | 单币首发还是多币、汇率来源/精度、部分结算/连续重估及报告币政策 | FG23-24及外币业务 |
| OQ-07 | 匹配容差/付款折扣/预付款核销、坏账账龄、催收利息及银行匹配/支票状态 | FG09-15/25-27/41 |
| OQ-08 | 资产账簿/折旧惯例/处置、租赁模式/折现/付款时点；分摊与履约算法 | FG28-33 |
| OQ-09 | 多法人边界/配对失败恢复、合并映射/未实现利润/持股NCI/CTA政策 | FG35-38 |
| OQ-10 | 现金流分类和比率公式、完整综合教学分支与方法对照的优先级 | FG40/43 |

### 可独立审查的明确切片（尚未实施）

- FR-139-A / TC-139-A：现有三种试算表的科目可进入同月该科目完整已过账总账，保持历史月份、停用科目可见，不隐式增加维度或试算阶段过滤；非法科目/月份保留服务端错误。必须说明未调整/调整后试算与完整总账包含凭证种类不同，金额不必相等；已关月损益试算非零而总账期末为零是预期。只读导航，不新增会计政策。
- FR-139-B / TC-139-B：只读对账结果包括每种试算借贷差、资产-负债-权益、权益摘要期末-权益、收入-费用-利润。逐项输出整数分left/right/difference/pass及allPass；差异必须可见，不写账/不阻止合法业务，不代表子账/税/现金流已核对。月份缺失/格式非法400，合法但不存在404，不默认最新月。固定检查ID及左右值定义见D-READ-B；当前利润关系由同源公式生成，可能恒成立，不是独立会计真实性证明。
- FR-142-A / TC-142-A：在报表界面展示上述有限数学勾稽结果、选定月份与“不能检测所有平衡但错/非审计认证”边界；不是新增配置变更日志或跨子账对账。依赖FR-139-B接口、与FR-139-A导航集成后单独验收。

以上清晰切片可由本轮G3单独评审释放**规划门禁**；其余44目标的关键政策仍OPEN/BLOCKED，不得伪造全范围G3PASS。本轮没有未来业务模块的代码实施授权。

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
