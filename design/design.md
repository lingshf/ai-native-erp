# Proposed design

当前用户已委托执行ARCH-M00..09、恢复贸易及在完整保护旧账/ID3后切换预览。宏观架构见[architecture](architecture.md)，详细设计和FR/TC见[architecture-migration](architecture-migration.md)。M00/M01/M02已限定验收发布。D-AM03/FR-AM03-01..08/TC-AM03-01..14的revision3独立G3及T11 r2/T12 r3/T13 r4各G5均释放MODEL01，当前r4组合规范/质量G6亦已释放MODEL01，正在交付与发布；当前证据见[项目](project.md)、[评审](reviews.md)。所核详细D全文8709809b…33560未改，旧标题“计划/待审”保留当时设计状态，不覆盖此门禁记录。M03不开放Server、真实身份或业务写入；本轮实际修复Vite默认CORS行为以符合原同源设计，没有扩展会计政策或改原账。

## ARCH-SME-01：新的长期架构提案入口

[中小企业ERP架构](architecture.md)及[选型ADR](adr/ADR-SME-001.md)的推荐方案已获委托分阶段执行，含独立前端、API/应用/领域/基础设施边界、SQLite/PG档案、真实授权及迁移DAG。下文D-CORE/D-TRADE保留原已实施或未发布候选行为；贸易保留到M06恢复并迁移，旧暂停记录为历史，不是禁止继续架构工作。真实原账切换、各业务实现及发布仍须各自实际门禁与保护，不因高层G3自动通过。

## D-TRADE-A：权威事件投影与非库存贸易（金融基线已审，缓存补充待审）

对应FR-T01..08及TC-T01..14；M-CORE发布版本为3fbd75f。金融基线修订G3已释放MODEL01；下面D-TRADE-CACHE是领域G5实测退化后新增的设计补充，另需G3后才实施缓存。M-TRADE-A完成也只代表非库存切片，B/C和其他里程碑组合仍待验收。

### 状态存储选择与同事务边界

选择有限schema的事件溯源：复用已受company/source复合外键约束且不可变的source_events、adapter_facts、receipts和source.accept审计，不增加第二个SQLite文件、不改旧教学库、不迁移原凭证。新的trade事实是**权威领域事件**，固定reducer重建订单/发票/预付款/结算状态，所有后续动作必须读取并验证这个状态，不是只供展示的任意JSON。相较另一套可变余额表，此方案少一套必须保持一致的状态。首候选每次完整重放已在独立G5暴露规模退化，不能作为交付状态；拟用下述可丢弃缓存复用已验证前缀，完整性与权威事件一致性不能削弱。不增加持久化缓存表或迁移。

核心私有加载器只读当前company已接受的固定trade.*操作，联结source/receipt/facts及唯一source.accept审计，按整数audit.id重放，绝不按会被VACUUM重排的隐含rowid或同秒时间排序。每事件包含schemaVersion=1、类型、对象身份、前后对象版本、规范业务输入、精确分配及政策/会计角色快照；事实与receipt.plan严格相同。重复/缺失审计、版本断链、重复业务键、未知事件版本或余额/数量不守恒都显式失败，不能跳过坏记录或只取当前页。投影不暴露DB/文件句柄给适配器。

预览和事务内确认用同一纯planner和reducer，计划绑定全局/配置/期间及所触及对象版本。BEGIN IMMEDIATE内核对当前版本和审计水位、补验未见后缀，取得同一事务快照下的完整逻辑投影；原回执检查优先，再核HMAC，最后一次性写领域事件、来源、GL、回执和审计。没有先改余额后发网络请求的apply回调；确认失败不能留下半个“已付款”状态。固定贸易描述符是内核内置能力，普通及readOnly构造均无条件注册，不依赖HTTP或调用者传adapters；备份CLI因此也执行同一贸易重放。贸易实现缺失/未知事件版本须显式启动或完整性失败，不能忽略已有trade.*历史。只有这些固定描述符有新能力，HTTP不得注册、传SQL、提交原始领域事件/GL/可信origin。旧第三方/测试适配器协议默认保持原行为。

非金融订单事件可明确无GL并获得recorded回执；描述符指定ledgerMode=none，输入不能切换。发票/现金/贷项必须required且形成真实平衡计划；应用在相同控制账户净GL恰为零时仅可由声明optional的固定描述符记录，同时保留完整两边子账变化和解释，不能用空行规避其他金融事件。普通手工、服务、统计、队列及成功重试语义不改。

### 固定配置与数据契约

配置继续`company/kind/code/expectedRevision/active/data`。新增kind固定为tradeParty、tradeProduct、tradeProfile、tradeTerms、taxCode，逐种严格校验；不引入动态模块/表达式。tradeParty包含角色、AP/AR profile、terms、允许税码及默认维度；tradeProduct只接受expense/service、expense或revenue科目、允许税码及默认维度。所有引用同company且类型匹配，停用不隐藏已用历史。

tradeProfile区分AP/AR；包含对应control、advance、cash、discount科目，科目类别/purpose/controlModule/报表组匹配角色。AP控制必须AP负债，AR控制必须AR资产；AP advance是AP资产，AR advance是AR负债；cash只接受非BANK控制的cash资产；折扣科目为收入类，AR借记抵减、AP贷记收入，预览说明口径。普通直接记账限制继续约束手工；新固定贸易描述符仅对自身经过类型验证的会计角色允许受限普通科目，现有适配器默认不得借此越权。商品费用/收入是显式行会计来源，控制/预付/现金/折扣来自对应profile，税来自taxCode；不允许客户端传成组任意GL行。已有M-CORE模板1300是AR控制、2100是AP控制，不套用研究资料的示意科目号或改旧类型；其他角色由用户明确选择/新建。

各配置data严格字段如下（全部共有from/to含首尾；名称1..160；引用均为已有同法人有效代码，不默默创建）：

| kind | data字段 |
| --- | --- |
| tradeParty | name、role、apProfile/arProfile（按角色必需，另一侧null）、terms、allowedTaxCodes、defaultDimensions |
| tradeProduct | name、type=expense/service、expenseAccount/revenueAccount（按类型必需，另一侧null）、allowedTaxCodes、defaultDimensions |
| tradeProfile | name、side=AP/AR、controlAccount、advanceAccount、cashAccount、discountAccount |
| tradeTerms | name、dueDays整数0..3650、discountDays整数0..dueDays、discountPercent精确0..100且最多6小数、allowPartialDiscount |
| taxCode | name、mode=ordinary/zero/exempt、rates数组（每项id/from/to/ratePercent，非重叠）、deductiblePercent、inputAccount、outputAccount；zero/exempt率必须0 |

本切片不增加无行为group字段；物料/伙伴分组过账在实物流具体G3补齐。未配置的角色/类型不接受多余会计字段。ordinary税码的input/output是TAX控制的资产/负债；zero/exempt允许这两个字段均null，不生成0金额GL行但保留税事实。AR忽略抵扣比例但保留原税码快照。未确认AP/AR业务不能因为profile保存而产生余额或付款。

data字段完整白名单如下，表中字段均必需，明确标可选者除外。AP/AR前缀操作不另接受side；其他操作side为AP/AR。标识沿核心code约束，版本为非负安全整数，reason为1..160文本。A中的documentId在company/side内跨invoice/credit/advance唯一；销售外部发票号另在company内唯一。全部金额操作以本法人会计币为准，带currency的操作必须相等，不接受暗中换算。

| 操作 | data |
| --- | --- |
| trade.order.create | documentId、side、party、currency、expectedVersion=0、priceIncludesTax、roundingMode=line/document、lines |
| trade.order.cancel | documentId、side、expectedVersion、reason；只能取消尚未开票的剩余承诺，不删除已开票部分 |
| trade.ap.invoice / trade.ar.invoice | documentId、party、externalInvoice、currency、expectedVersion=0、priceIncludesTax、roundingMode=line/document、lines；可选headerDimensions；orderId/expectedOrderVersion必须成对，可选matchingException={confirmed:true,reason} |
| trade.ap.payment / trade.ar.receipt | paymentId、party、target={kind:invoice/credit/advance,documentId,expectedVersion}、applyGross、takeDiscount、reason；credit/advance表示明确退款方向且禁止折扣 |
| trade.ap.advance / trade.ar.advance | documentId、party、currency、expectedVersion=0、amount、reason |
| trade.apply | side、source={kind:advance/credit,documentId,expectedVersion}、target={kind:invoice,documentId,expectedVersion}、amount、reason |
| trade.credit | side、documentId、originalInvoiceId、expectedVersion（原发票当前版本）、lines=[{originalLineId,quantity}]、reason |
| trade.document.cancel | side、kind=invoice/credit/advance、documentId、expectedVersions=[{kind,documentId,version}]、reason；集合恰含自身及需要更新的原发票/关联订单 |
| trade.settlement.reverse | side、settlementId（原接受事件reference）、expectedVersions=[{kind,documentId,version}]、reason；集合必须恰含原动作所触及当前对象 |

订单/发票lines为1..100唯一lineId的数组，每行固定lineId/product/quantity/unitPrice/discountPercent/taxableCharge/taxCode及可选dimensions。关联订单的发票每行另必填orderLineId，同张发票内不重复，必须指向该订单同商品行；无orderId则禁止该字段。taxableCharge为非负精确币种金额；priceIncludesTax=true时它与单价同为含税值，否则为税外值。discountPercent为0..100且最多6小数。缺省维度为{}；伙伴默认→商品默认→单据header→行显式值逐层覆盖并记录来源，再走核心默认/派生/固定/最终结构。核心接收固定适配器raw.headerDimensions以保留单据来源，而非把它伪称行值；现有适配器默认{}不变。

订单固定保存按同一计算器求得的每行净额/税/总额作为承诺快照，不产生税负或GL。匹配必须同法人/伙伴/side/币种，以orderLineId逐行检查累计有效开票量不超过原量减已取消量。令E=half-up(订单行原净额×本次数量/订单行原数量)、I=本次发票该行净额，按整数币种单位检查100×abs(I-E)<=E；E=0时仅I=0自动通过。净额包含商业折扣及按数量比例分摊的原应税费用，剔除税；税内订单使用保存的税内提取净额，不拿当前税率重算原承诺。超价仅可有明确例外批准，超量/错行/错伙伴不能例外。部分开票后order.cancel只取消其余承诺；已开票部分保留。日后取消关联发票恢复数量：订单未取消则重新可开票，已取消则该数量并入取消量，不自动重开订单。

paymentId为company/现金方向内重复键，改变事件reference也不能二次记款；不批量暗中分配。付款目标credit/advance时现金方向与其原始发票/预付相反，仅退其剩余额，不改变无关发票。发票/订单字段不接收客户端汇总金额/原始事件或GL行，matchingException并不放宽数量限制。advance/apply/credit均保留不可重用新身份及与原source的链。

tradeTerms含dueDays、discountDays、discountPercent、allowPartialDiscount，默认30/7/1.5/true；伙伴可显式选已配置版本。taxCode含ordinary/zero/exempt、互不重叠且含首尾的有效税率区间、deductiblePercent、input/output科目和适用说明。普通默认12须显式配置与选取；零税/免税仍分别保存事实。所选税码必须在伙伴/商品交集；A每行一个码，多组件、自计/条件/预收税不支持时明确拒绝。税率按taxDate、其余新行配置/维度按accountingDate；保存整个发布版本及命中区间，不回填历史税。

输入Command沿D-CORE，sourceRevision仍为新事件0；data中的documentId及expectedVersion才是业务对象身份/版本，不能拿事件reference重用作后续核销。所有数据字段逐操作白名单，数量/价格精确字符串、金额不接收JS浮点。日期链：每个新事件的accountingDate不得早于其全部依赖对象当前最晚事件日；同日按稳定事件序可重放，不能后月核销后再回填较早取消。单据日/税日独立保留，不自动移到开放月。

固定操作族：trade.order.create/cancel（仅非库存）；trade.ap.invoice及trade.ar.invoice；trade.ap.payment及trade.ar.receipt；trade.ap.advance及trade.ar.advance；trade.apply；trade.credit；trade.document.cancel；trade.settlement.reverse。side/角色与目标类型不匹配拒绝。不接受库存类型，业务重复键独立于reference。

### 精确计算与核销

共享decimal计算使用BigInt系数/10的幂及对称half-up；最终金额转安全整数，API不返回BigInt。税外：数量×单价×商业折扣后加应税费用，量化净额，再算税。税内：同样计算并量化含税总额，再以1+税率提取净额，税=含税额-净额。应税费用以币种精度输入，单价/数量最多6位。输入缺税码/越有效期不返回0。

行模式逐行half-up；单据模式按税码及相同税处理分组，对精确税额合计量化，以各行向下整数及最大余数分配尾差，同余按不可变输入行序。税内模式保留各行已量化含税额，再由分配税反推各行净额，保证总额守恒。采购在最终行税分配后逐行计算可抵扣=half-up(该行税×抵扣比例)，不可抵扣=该行税-可抵扣并进该行费用；不另按整单比例二次舍入。AR不扣减销项税。税事实保存原始净/税/总额、抵扣分配、算法及来源；新贷项按原事实累计比例反向，末次吃尽原余额，不按现行税率重算。

付款以**选择的核销总额G**为输入，而非对现金倒算一个可能超额的核销量。对每个目标，用剩余net/tax按G/remainingGross分配，net half-up、tax=G-net，最后一次直接取尽；不得丢失净/税剩余。选择现金折扣且本次付款accountingDate在原发票documentDate..documentDate+discountDays内，折扣=half-up(本次被核销net×保存的discountPercent)，现金=G-折扣；不得以付款documentDate/taxDate回填取得折扣。allowPartialDiscount=false时仅原发票无有效结算且G等于原始全部gross可拿折扣，最后一笔剩余付款也不能追认折扣。过期/不允许部分折扣拒绝请求，不悄悄忽略选项。普通现金折扣不改原间接税。

trade.apply只接受invoice目标；对source及target各自按amount/各自剩余gross分配net/tax，half-up净额、税为差额，尾次分别取尽；advance原本net=amount/tax=0。两边gross同时减少相同amount，不拿现金折扣、不重算原税、不改变无关对象。账面现金明确不等于银行生成/清算/实付状态。

结算/退款/应用的控制或预付科目一律取各被核销对象的原始角色快照，不能随伙伴新profile改投别处；现金及折扣科目取动作当日有效的当前profile。部分贷项的费用/收入及税科目取原发票行快照。所有新金融行的实际科目仍须在动作日有效并满足原角色/维度；原快照科目停用时明确拒绝，提示先显式恢复原科目或撤销业务依赖后精确取消，不偷偷换科目。未用到的新profile控制科目不替代历史控制。只有下面完整历史反向免于新配置限制。

原控制维度是首次落GL后的最终维度集合，不只是会被新fixed/default重解释的原输入。按“科目+完整最终维度集合”合并控制/预付段，保存原gross和未核销gross；先将维度键按ASCII码点排序生成规范JSON，再按该字符串码点序排列各段，不用localeCompare。设本次待分配整数为A、所有非零段剩余gross之和为G：除最后非零段外，依序分配half-up(A×本段剩余gross/G)，然后同时扣减A和G；最后段取剩余A，零剩余段分配0。每步都用当步剩余A/G，不是按初始总额独立舍入各段。分配后扣减各段余额；反向恢复保存的实际原分配，不重新估算。文档级net/tax继续按前述原规则分配，控制段分配的是gross，不另改变原税。

整数oracle：规范序DEPT=D1/D2/D3三段剩余gross分别2/3/2，总额7个最小单位。先核销3：D1=half-up(3×2/7)=1，D2=half-up(2×3/5)=1，D3取尽1；剩余1/2/1。再结清4分配1/2/1，各段归零。反向首笔则精确恢复1/1/1，不以此后余额重算。

应用的source/target分别沿自己的原段分配，不能全归新伙伴默认段。相同控制科目只有每个完整维度集合借贷均净零才可省略GL，不可仅比较科目：例如AR原贷项控制贷5/D1应用到另一发票借5/D2，应用必须产生控制借5/D1、贷5/D2两行，不能因科目相同而无GL。当前合法性校验后还须保证最终集合未被重定向，否则明确拒绝。现金/折扣仍按当前配置处理，不能反过来改原控制段；完整历史反向继续保留实际原行及内部平衡。

原创独立oracle：净额73.19、普通12%税外得到税8.78/总额81.97；税内输入81.97提取net73.19/tax8.78。合格全额净额折扣1.10、现金80.87。首笔核销40.99时net36.60/tax4.39/折扣0.55/现金40.44，剩余gross40.98/net36.59/tax4.39。单据舍入例：三行各净0.03、12%，行模式税各0/整单0；单据模式精确合计0.0108，量化税0.01仅给第一行。三行各含税0.03时单据税同为0.01，行净分别0.02/0.03/0.03。用于测试的数字不是来源案例；过期第二笔不再拿折扣。

### 纠错、历史与一致性

非库存贷项保存原发票/原行身份、可贷数量及累计净/税分配，产生反向未结项，不偷偷修改已付原发票，不代表实物回库；通过显式apply或退款处理。document.cancel明确支持invoice/credit/advance：三者均须全额未结且无有效付款/退款/应用；invoice另须无有效贷项，credit取消另恢复原发票可贷数量，invoice取消另恢复关联订单数量。需要更新的全部对象版本及最晚事件日均纳入校验；已取消对象不能再取消。有效依赖先显式反向，不能以退款代替录错纠正。settlement.reverse恢复原核销量/分配，不能超过合法原余额，不能把反向现金称银行退票已处理。

这两族完整历史反向通过描述符允许的`historicalReverse`计划意图，由核心自行查同company原source/凭证并复制全量原规范化反向行（含内部平衡），验证允许的操作族及唯一有效取消；客户端不可提交该意图，不能通过普通业务行校验绕过任意停用限制。部分贷项新行仍经当前角色、维度与科目约束；无法合法过账则全拒绝并说明，不改原账。

读模型完整重放产生当前状态；月末历史投影只包含accountingDate不晚于月末的事件。依赖日期链保证被包含事件的前置也包含，未来核销不抹掉早月未结项。查询保留原profile/control/tax/terms快照，不按当前停用/新分组丢记录；历史操作仍对**最新全量状态**预览，界面明示两口径。未结净/税/总额及信用/预付符号分列，不把客户净余额误当单一AR控制余额。

发票dueDate=原documentDate+保存的dueDays自然日；账龄以所选月末减dueDate的整日差计算，<=0为notDue，之后为overdue1_30、overdue31_60、overdue61_90、overdue91Plus。按剩余gross分类，不含已取消发票；credit/advance各自按正数gross单列，不填逾期桶也不与发票桶静默抵消。API每个未结项返回kind/side/documentId/party/currency/version、documentDate/dueDate、remainingNetMinor/remainingTaxMinor/remainingGrossMinor、overdueDays/ageingBucket及controlAccount/sourceReference；credit/advance的dueDate/overdueDays/ageingBucket为null。ageing汇总包含invoiceGrossMinor、上述五个桶、creditGrossMinor和advanceGrossMinor，全部来自同一未分页的asOf投影。当前全量版本与月末历史版本分开返回。

完整性检查新增权威事件结构/版本重放、source/facts/receipt一致及贸易自身控制科目GL净额守恒。全部控制GL与贸易子账核对另输出未归属来源/差异，不因金额平衡称业务全对；其他注册模块/测试来源不能被悄悄吸收成贸易余额。CLI备份/恢复必须验证新投影，不只复制GL；现有v1无贸易历史库继续可只读检查和恢复，不增DDL或自动种子。

### D-TRADE-CACHE：可丢弃已验证前缀（补充G2待审）

对应NFR-T01、FR-T03/08及TC-T12/15。选择每个EnterpriseBook句柄内按法人隔离的私有已验证前缀，而非新增持久余额、信任receipt后像或跳过归档验证。缓存记录全局revision、最后唯一source.accept整数审计id、经完整校验的当前领域投影及历史重放所需已验证事件。初次构造（包括readOnly）在一致读快照内从空状态全验；关闭/重开丢弃缓存，不随备份迁移。

每次预览/读取及BEGIN IMMEDIATE中的确认，先在该操作自己的SQLite快照内核对revision/接受水位。相同前缀直接复用；新增事件严格按审计id加载，继续执行原命令、归档配置、facts/receipt/GL/审计的完整校验，再运行同一纯planner。只有配置/其他业务改变时可复用不变的已验证领域前缀，但新动作仍读当前配置/期间并绑定新的全局版本，绝不因缓存保留旧token。另一句柄已提交的后缀必须在当前操作内补齐；水位倒退、前缀不可信或不一致显式失败或从空状态全验，不静默接受。

规划不许直接修改共享缓存对象，返回的API对象也不能成为可修改缓存引用。新事件的状态仅在SQLite提交成功后发布；可选择提交后只留旧可信前缀、下次增量补验，而不是提交前乐观推进。失败、token冲突、存储异常及ROLLBACK不能缓存尚未提交事件；事务读到的候选缓存不得越过回滚后真实水位。原封套已接受重试继续优先且零新增。

历史视图使用已验证事件、原归档配置及自身前置状态，不能直接把当前对象按日期筛选。同一法人年度最多保留12个月末投影。对每个新增事件，严格按接受audit.id顺序应用到**所有asOf >= accountingDate的已缓存切点**，更早切点跳过；不是只更新事件所属月份。独立单据可晚录入并回填开放早月：已缓存二月及三月后再接受一月15日独立发票，二月及三月都必须增入它；日期链仍约束已有依赖对象，不能借回填绕过。若淘汰，按已验证序列确定性重建，不再逐个查询/校验旧GL。当前版本及月末版本仍分别返回；未来结算不抹早月历史，回填也不能遗漏晚月。缓存/历史投影不可跨法人或被分页结果代替。

integrity()必须绕过缓存，在一致读快照中从空状态全验全部贸易来源/归档版本/事实/GL/审计及守恒；成功后才可替换缓存。备份快照和独立恢复通过无先验缓存的readOnly构造及完整性检查同样全验，坏事件不能因热路径成功被掩盖。直接手改数据库不属于支持的写入接口；热缓存不是持续物理防篡改监视器，显式完整性和重开仍必须发现损坏。

验证拒绝仅靠“耗时变短”推断正确：用SQL调用计数或等效只读探针证明热路径没有重新逐事件验证已接受前缀；独立比较热/冷当前及历史结果、两句柄新增/配置变更、失败后余额、回执与完整强制重放。另记录400张五行发票从首笔到末笔、分页读取及重开的耗时作为本次规模证据，不承诺跨机器容量。原全量检查的线性成本、GL聚合和状态安全复制仍可存在，不把所有操作虚称常数复杂度。

### API、UI及边界

复用configure/preview/post；增加只读GET `/api/erp/trade?company&month&kind&party&status&cursor&limit`，company/month必须，其他枚举/分页严格校验，返回明确asOf/currentVersion/总数/游标。不得用分页后的事件计算余额。详情由明确documentId或source查询，不把全部历史每次传前端。新增trade/tax期间模块，但createCompany的既有字段不扩展，所有新旧法人默认仍仅原五模块；只在期间配置明确勾选并确认后开启trade/tax，不因扩大MODULES合法值集合自动启用。固定描述符校验requiredModules数组：订单/预付/结算/应用为trade，发票/贷项及其取消同时需trade与tax；全局hold及permanent仍禁止新动作。

`public/enterprise-trade.js`提供独立伙伴/商品/配置表单、发票行编辑、订单匹配、未结项选择/付款/预付款/应用/贷项及详情。不是任意JSON业务编辑器。现有ERP组件仅负责挂载/公司月上下文和刷新通知，旧核心操作选择器不把新贸易操作误渲染成手工纠错。数据/金额/版本改变即撤预览；同公司同月轻刷新保留无关输入，跨上下文迟到响应不能回填。新文字进成对label，关闭教学仍可操作且保留现金/税/非生产边界；主题/语言不重建表单。AI尚未接入新贸易，不自动外发伙伴、发票或来源。

独立作者可在G3后并行实现无文件冲突的纯decimal/tax计算器与贸易UI；核心/领域事件整合归单一schema/API作者。具体任务、角色及文件白名单只在G3释放后写tasks。先TDD验证普通/精度/版本/竞争/日期/回滚，再全172旧回归、新HTTP和真实隔离UI、独立各G5及跨任务G6。不得在原4173或本地既有账套演示新业务；公开和本地交付沿前里程碑的实际hash基线。

## D-CORE：44目标的共同契约与M-CORE基线

范围为[POLICY-01及FR-C01..08](requirements.md)。旧章节的待决/仅规划措辞保留为历史，不能覆盖当前全44目标实施授权；也不能把本节写成已经实现或已经评审。

### 隔离与替代方案

采用模块化单体：原`Book`及`teaching.sqlite`继续服务旧教学模式，新`EnterpriseBook`在**另一个本地SQLite文件**维护新法人账。该文件内以company为每个配置/期间/业务/凭证/子账事实的强制分区键；公司间双边事务因此可同事务提交。法人不是维度，任何查询/引用都显式核所属company。新账创建无分录、不自动复制旧账；仅共享经过版本化的科目模板定义，法人覆盖彼此隔离。首次选中ERP工作区只读列举，新建法人须明确确认。

拒绝直接扩展旧表并重解释累计期初/月结：旧算法没有多币、年度期初和子账源身份，静默升级可能双算期初。拒绝每模块自建独立GL或无约束表达式引擎。新内核复用现有`AppError`、安全整数思想和本机HTTP保护，但不把旧教学构造器的示例入账带进新法人。新模块首次创建空schema可写新文件，不能声称这等于修改了旧账；新模式回退只切换工作区，不降级/删除ERP数据。

### 内核、持久化与金额

- `src/enterprise.mjs`为唯一共享schema/事务作者；不引入运行依赖。`src/enterprise-core.mjs`可分离纯校验/计算；后续贸易、成本/税币、银行、资产关账、集团、报表为固定注册适配器，不允许请求指定任意模块/SQL/代码。`public/enterprise.js`是独立工作区渲染模块；现有app只做入口和全局期间上下文分派。
- 单一ERP数据库的核心集合：companies；版本化chartTemplates及法人accountOverrides；configs/current及不可变configVersions；calendars/periods；drafts/typed business objects；sourceEvents/immutable receipts；journals/lines；statistics；clearingLinks；transferQueue；append-only audit。业务模块使用同一受控事务协调器增加自己的事实，不能绕过源及GL校验直接写凭证。
- 每条货币金额为安全整数最小单位，带币种及0-4位scale；输入为十进制字符串，不通过浮点数累计。数量及单价最多6小数，汇率最多8小数，精确有理数/BigInt中间计算后按对称half-up量化；超安全整数明确拒绝。API不返回BigInt。统计数量另带unit/scale，不参与货币TB。会计类型固定五类，详细reportGroup为类型内枚举，不能重定义类型决定的损益/永久性质。
- 币种登记为全库共享`currencies(code,scale)`，法人不能为同一币种另设精度；币种被法人/行使用后scale不可改。每条最终行固定保存`{account,currency,transactionDebit,transactionCredit,accountingCurrency,debit,credit,reportingCurrency,reportingDebit,reportingCredit,rateRefs,dimensions,dimensionOrigins,metadata}`，金额均最小单位、借贷恰有一侧为正；`rateRefs={accounting,reporting}`保留不可变率版本引用。M-CORE仅接受交易币=会计币，transaction两侧等于debit/credit，accounting率引用null。报告币相同则报告两侧相等；报告币不同则两侧和reporting率引用均null，报表显式`translated:false`/“未折算”，不能以0冒充报告币金额。后续FX补充新行的数据，不重写既有未折算行，也不伪造历史率。
- 科目操作purpose为general/control/clearing/suspense，contraOf单独表达备抵属性；备抵须同类型、方向相反、无链环，正常方向不限制分录方向。control按注册子账用途限制来源；手工不能伪造系统/子账origin。clearing按原来源残余查询并显式零和配对，不能用任意差额抹账。suspense普通行必须有owner/reason/reviewDate，未解及逾期可查。停用不隐藏历史，已使用账户身份/类型/币种/操作purpose不能改，不能把既有手工余额转为无来源控制余额。
- 审计包含动作/源/模拟身份保证级别/UTC时间/前后版本/原因/配置快照引用，应用及SQL触发器禁止修改已过账及历史证据；不宣称抵御拥有文件控制权的管理员。只写错误类型等诊断，不记录完整财务请求/凭据。

### 日期、维度及规则的确定性顺序

新账当前创建公历年度及12个自然月，经营期间连续且不重叠；后续灵活年度边界由关账里程碑实现。会计日决定经营期间，单据日/税日独立保留；日期真实有效、禁止自动挪日。Opening/Closing只能由固定系统工作流生成。期间open可按模块进一步限制，hold可凭原因重开；有未完义务的期间不得永久关闭，永久关闭不可恢复。M-CORE只允许无发生/无义务的期间永久关闭，年度工作尚未实现时不得伪造已完成年结。新月冻结只改状态、不生成损益结转；旧模式不变。

M-CORE对当前发布的规则、默认/派生、固定约束、维度值等配置集合，统一使用`accountingDate`判断有效期，首尾均包含；活动状态取当前已发布版本并进入指纹，不按单据日/税日选另一版本，也不按历史时钟重放旧发布状态。三日期跨配置边界时会计日优先。单据日/税日在本里程碑仅保存；后续税、汇率等若用其自身时点须在对应G3明确，不沿用含糊的“交易日”。已过账行/快照不重新选当前配置。

维度显式区分未给键与`null`清空。每个有效值有from/to（含首尾）、active及版本。取值顺序为公司默认→科目默认→单据/业务主数据默认→显式行值；后续派生规则`fill`只补缺值、`replace`按声明替换并解释，最后固定值/固定空值。显式输入与固定约束矛盾拒绝，两个有效派生给出不同结果或形成依赖环拒绝。显式空值不被普通默认回填；任何覆盖都保留provenance。最终统一核活动状态/有效期/必填/条件附加要求/允许组合，历史和精确系统冲销不重跑当前派生。

`fill`只补未给键，不把显式null当缺省。明确配置为`replace`的派生可覆盖显式值（含null），保存原值/规则来源并在确认前展示；这不改变“普通默认不能回填显式空值”。固定约束与原始显式行值矛盾仍拒绝，不能借派生把原始冲突隐藏。

若只有派生replace结果与固定值冲突、原始显式行未违反固定约束，则固定值最终覆盖派生结果，保留两步provenance；多个固定约束彼此冲突仍拒绝，不按先后掩盖。

一个法人可显式启用一个balancingDimension及内部平衡account；普通新行必须有该维度。先校验原业务整体借贷平衡，再按值汇总借减贷，针对非零组生成反向内部平衡行，合计仍零，显示来源和内部科目。缺账户或非法组合拒绝，不能借此平衡本来不平的业务。历史查询按已保存最终组合，标签不当维度；年结归属稍后接入。

科目规则使用有限typed event/lineMeaning（例如手工规则比较、现金服务参考适配器；真实AP/AR/库存/税/银行意义由各模块注册）。每条规则有有效期、对象exact/group/all、对方exact/group/all、科目、受支持维度来源及版本。候选以两个轴的specificity偏序：一个候选各轴均不弱且至少一轴强才支配另一候选；余下多个不同胜者就是冲突，不按ID/创建顺序挑。缺规则/同级重复/非法胜者拒绝，禁止退回弱规则。预览显示候选、淘汰原因、最终版本及意义，预测专用意义不允许支付适配器引用。多事件科目源选择不由AI决定。

### 预览、批准、业务效果、转账与纠错

`Command={company,operation,reference,accountingDate,documentDate,taxDate,sourceRevision,data}`；reference在法人内为不可重用事件身份，业务对象另有稳定objectId及修订，不能把PO号当每次收货事件号。输入严格字段/schema/大小校验。业务重复键独立于事件幂等键。固定事件适配器从只读上下文计算`Plan={lines,objectEffects,facts,explanations,checks,policySnapshots,expectedRevisions}`。不允许客户端提供可信origin、越权控制行、任意SQL或自动平账指令。

M-CORE固定操作清单如下；不在表中者拒绝，后续模块在自身G3后加入。所有入口均经相同预览/明确确认，不是独立的任意GL旁路。

| operation | 来源/输入与GL效果 | 允许来源状态及限制 |
| --- | --- | --- |
| `journal` | 手工normal/adjusting完整行；一个新凭证，data可选同步/手工待转路线 | 新reference，拒绝Opening/Closing/客户端origin及控制科目；不能传已过账ID改原账。 |
| `cash_service` | 注册的现金服务参考适配器；服务对象/组/对方轴命中收入规则，现金与收入行 | 有效服务/规则、正金额，新reference；不是应收发票/实际银行业务。 |
| `statistics` | 数量/unit及维度；只写独立数量事实，无货币GL | 新reference，币种金额不接受；不能用数量塞TB。 |
| `clearing.match` | 对同一clearing/suspense账户选择原凭证行，完整未配残余零和；记录清算/暂记解决链，无新GL | 全部已过账、同公司币种/账户、未重复匹配；非零/部分匹配本轮拒绝。暂记实际金额先经普通合法凭证对冲，再配对，不用按钮直接抹余额。 |
| `reverse` | 指定原journalId，复制原全行的相反侧（含内部平衡行），一张关联反向凭证 | 仅普通手工、替换后的普通凭证或reclassify输出；没有有效纠错的已过账正常/调整行，完整精确冲销，无部分金额；其他业务源拒绝通用GL取消。 |
| `replace` | 指定原手工journalId及完整新行；同事务写精确反向+新普通凭证，两张均关联本事件和原账 | 未纠错的普通已过账来源，全部替换不接受部分；新行按当前规则合法，失败不留下仅冲销。 |
| `reclassify` | 指定原手工journalId及完整重分类行；一张凭证包含原全量反向及重分类正向，分别有来源组 | 新行借/贷总额须与原经济金额相同，完整重分类不接受部分；原来源登记已纠错，不能再双重纠错。不称红字/发生额抵消。 |
| `cash_service.cancel` | 注册服务来源专用取消，按原计划精确反向并记录取消来源 | 仅未取消的已过账cash_service；不是通用源取消接口，后续AP/AR/库存各自定义取消适配器。 |

适配器在构造时以固定服务端函数及能力注册，HTTP不接受注册内容或可信origin。仅领域单元测试可构造含`testOnly`适配器的内核证明合法控制来源能入账；它不在生产注册表/HTTP公开操作清单中，不在`createApp`提供注入接口，不把测试适配器验收当真实子账完成。每个引用/关系以(company,identity)复合外键或同等SQL约束隔离，完整凭证分页顺序固定(accountingDate,journalId,lineNo)。

错误reclassify可整体reverse其输出，原始交易及重分类/反向链均保留；原来源“曾纠错”历史不删除，有效纠错状态由追加事件计算。完整撤销重分类、恢复原金额后可对原来源重新预览纠错，必须新reference/token；仍有效的纠错或任何重复冲销不得叠加。replace已对原凭证做的精确反向不会因反向其新凭证而被抹除，后续纠错针对新的有效普通凭证继续关联。

`preview(command)`只读、不占来源/凭证号/不改审批状态；返回规范化command、plan、token及revision。HMAC绑定完整规范输入/最终plan/相关配置和对象版本/期间；配置同值保存或改回仍变版本。持久化成功回执保存原输入、token、原计划和结果。`post({command,token,confirmation:"POST"})`先查成功同源：原输入和原token完全一致才返回原回执，不因后来关期/改配置重执行；冲突复用409。未完成来源在BEGIN IMMEDIATE内重新计算并核token/版本，人工确认后原子写业务效果、GL、回执、模拟批准和审计；任一失败全部回滚。

批准保证级别固定为`simulated-local-single-operator`，角色是本机动作分类而非登录授权；同一人制单/复核明确可见，不能把请求中actor/persona当真实认证。实际机器所有者仍控制本机，真实多人/独立审批不支持。可信子账来源只能由服务端注册适配器给出，与模拟角色无关。人工改输入/源/规则/期间后必须重预览；AI晚返回同样校验。

默认同步完整写入。仅已审查的手工队列路线可选择延迟GL：先保存被批准计划、源状态及pending回执；界面必须明确“业务已接受、总账未转”，不是成功凭证。显式transfer在事务中核当前期间、唯一源映射，按原批准计划写GL及transferred状态；重复转账返回原凭证。持久失败类包括期间/模块准入受限、计划格式/摘要不一致、已不兼容的计划版本及可捕获存储约束错误；锁/磁盘等导致连失败状态也无法提交时返回明确可重试错误、保留先前pending并在恢复后查询，不能伪称已持久failed。

`withdraw`只允许未转的手工pending/failed，须明确原因，写终态withdrawn和审计而不写GL；引用永久占用，原批准计划/回执不改删，原post重试返回原批准证据及当前withdrawn状态而不执行。transferred不能撤回，须正常精确纠错。源批准回执不可变，队列当前处理状态作为独立带审计记录返回，不把可变状态冒充原批准证据。后续业务模块只有设计和取消/对账接入完成才可启用队列。关期检查pending/failed，不把withdrawn当未完义务；不引入后台worker或分布式成功假象。

精确冲销取服务器保存的原计划全行/维度/金额，包括原内部平衡行；只允许该来源适配器的合法纠错状态，校验新日期/期间但不因当前停用/结构修改破坏原历史。普通手工来源可reverse/关联replace或reclassify；子账来源不能用通用GL反向接口冒充业务取消。一次原交易仅一条有效精确冲销，重复同事件仍幂等；已过账对象SQL层不可改删。红字/子账纠错/公司间取消各自随后验收，不能仅凭反向GL标全目标完成。

M-CORE-G3-ADDENDUM-01的时序澄清：新ERP的reverse/replace/reclassify及cash_service.cancel统一要求纠错会计日不早于原凭证会计日，且不早于该原来源纠错/撤销链中最晚的会计日，包括使原来源重新可纠错的撤销事件；同日合法。这不修改旧Book。clearing.match须不早于其全部原行的最晚会计日，且同其他命令一样要求会计日所在期间open并准入clearing操作，不因无GL而绕过期间。选月未清清单只看截至选月末已发生的原行，并且仅将匹配来源会计日不晚于该月末的链接视为已清；四月的匹配不能抹除一月的未清历史。拒绝路径在非写入计划阶段给出明确诊断，不能挪会计日、改原行或删除已有链接。此补充须独立G3释放后才实现，原G3不被冒用。

### API与UI边界

`createApp`增加可注入的enterprise实例，原调用和全部旧API保持；启动新实例时ERP文件与旧文件不同。增加精确静态白名单`/enterprise.js`。全部`/api/erp/*`沿已有loopback/host/origin/content-type/64KiB限制：

| 接口 | 输入与行为 |
| --- | --- |
| GET `/api/erp/state` | 无company只读列公司/支持的模板/操作，不创建法人。带company须显式month，返回该法人配置/期间/有限页凭证/统计/未解/待转及报表，分页须给总数/游标，不能默默截断。非法400、未知404。 |
| POST `/api/erp/companies` | code/name/year/currency及scale/reportCurrency及scale/chartTemplate；明确创建空法人及日历、模板快照，无种子分录。 |
| POST `/api/erp/config` | company/kind/code/expectedRevision/active/data，kind固定白名单和独立schema；CAS冲突409，保存版本及审计。 |
| POST `/api/erp/period` | company/month/expectedRevision/status/modules/reason/不可逆确认；校验未完义务，记录原因。 |
| POST `/api/erp/preview`、`/api/erp/post` | 上述command及确认封套，预览零写、确认同计划原子幂等。 |
| GET `/api/erp/journals/:id`、`/api/erp/ledger` | 必须company，凭证/来源/完整行与口径可追；跨法人身份不存在不泄露他账。 |
| POST `/api/erp/transfer` | company/reference，显式转被批准队列计划，结果/错误及重试可核。 |
| POST `/api/erp/withdraw` | company/reference/reason，只撤回未转手工计划，保留原批准证据并写无GL终态。 |
| GET `/api/erp/audit` | company及分页，历史配置/动作/源引用可追，显示模拟身份局限。 |

M-CORE没有开启下一财政年度的API。选月利润表显示该月非Opening/Closing经营发生及独立YTD列；资产负债表为当前财政年期初加截至选月末发生，权益明确含未结YTD损益，不能只加本月利润。TB的opening+debit-credit=closing按同口径成立。独立预期：一月资本53.27及收入9.14，二月费用2.08，一月现金/权益62.41、当月及YTD利润9.14；二月现金/权益60.33、当月利润-2.08、YTD利润7.06。未折算报告币列为null/不可用，不与会计币总计混加；未来年度期初接入后仍只按当前财政年含Opening一次，不叠加旧年余额。

复杂配置结构以明确字段和有说明的高级结构编辑器录入，不把一个无schema任意JSON框当ERP业务界面。业务工作区提供公司创建/选择、科目/维度/规则设置、凭证行编辑/预览/明确确认、来源/总账/报表、待转和未解项及期间状态。唯一全局期间控件在进入ERP时切到该法人的期间，返回旧工作区恢复原月；迟到ERP响应不得覆盖新公司/新月份/已离开的容器。

新增界面文字全部进中英文label，主题仍CSS变量，教学开关只控制教学辅助；不重建未保存表单来切语言/主题。必要风险/模拟审批/不可逆/待转/数据口径永远显示。无自动AI/写账，旧控制、原八科目和未知草稿保持。UI测试执行真实模块与受控HTTP，实际浏览器在独立新ERP数据库验收，不在原4173里创建测试业务。

### 备份、依赖与验证

显式本机CLI（不是浏览器文件API）使用SQLite `VACUUM INTO`一致性快照到调用者指定的全新备份位置，可在服务运行时获取一个一致的读快照，无须声称已停服；摘要从完成的备份本身读取，避免与活动源的新写入混合。附schema/完整性和关键计数，不覆盖已有文件；恢复先写独立目标，核完整性、源↔凭证、平衡及原回执重试，不替换活动文件。HMAC预览密钥仅内存、不入数据库/备份，重启/恢复使未完成预览失效；成功回执按保存的原token比较，不依赖旧密钥，仍可重试。路径只在本机命令使用，不进入公开证据或浏览器API。无自动备份/RPO保证，不把普通文件复制宣称已验证恢复。

M-CORE共享schema由单一作者维护；内核/API/UI在固定接口审查后才可按文件边界并行，label及app集成归单一作者或互不重叠的明确文件。后续先独立精确税/成本计算器，再由贸易编排它们并一次提交事实，结算再消费税实现/FX、银行消费结算；不建整模块假依赖环。每里程碑的FG状态按实际全部验收更新，有限底座不会令所有FG01..07完成。

M-CORE风险为原子提交/历史/精度/控制来源/异步完整性/旧账保护。验收见TC-C01..C12；先聚焦缺方法/路由/行为的失败证据，再最小实现、旧80回归、实际隔离UI、独立G5和组合G6。POLICY-01只是全局默认决策，M-TRADE等仍在各自G3落实具体状态/算法/用例；当前不提前释放全部实现。

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

### TASK11–13 已批准的只读切片

- D-READ-A（FR-139-A/TC-139-A）：三种试算表中的科目导航到现有完整已过账总账，带选定月份/科目，不隐式套维度或阶段筛选。保留现有总账期初/发生/期末和停用历史；页面导航零写账。导航提示明确未调整试算排除当月调整/其冲销、调整后试算排除结转，而完整总账包含这些分录，不能要求二者期末相等。此切片不需要税、成本或年结政策。
- D-READ-B（FR-139-B/TC-139-B）：新增只读GET `/api/reconciliation?month=YYYY-MM`，复用同一Book.reports快照计算6项勾稽（3个TB各一项、资产等式、权益摘要、利润关系）。返回 `{month,checks:[{id,left,right,difference,pass}],allPass}`，整数分及安全算术，不能将失败变成“全通过”。非法/未知月份沿现有400/404语义，不扫描未实现子账，不写数据库或阻断过账。
- D-READ-C（FR-142-A/TC-142-A）：UI显示选定月及逐项差额；依赖D-READ-B，在D-READ-A导航基础集成，不缓存为审计通过证明。共享 `public/app.js`，与导航切片不能同一checkout并行写。

本次实现不改变上述六项口径。面板请求须绑定请求月份和当前报表容器；切月、刷新或离开后不得将旧成功/旧失败填入新面板。加载和请求错误单独可见，不能把不可用渲染为通过。列明左右值、差额及逐项状态；保留“同源数学检查、不是完整错账检测/子账对账/审计认证”的必要业务限制，教学关闭仍显示。界面文字全部走中英label，不增加依赖、账务写入、AI调用或过账阻断。

实现采用全局refresh递增版本防止迟到state倒退；开始刷新即替换旧勾稽成功为加载状态。每个面板再捕获月份、refresh版本、请求序号和结果容器连接状态，丢弃失效响应（包含同月离开/返回的新面板）。API失败展示原诊断；200响应仍核固定六ID、安全整数分/差额/布尔状态与月份一致，格式不符显示错误而非通过。重新核对只发GET，不阻断记账；未更改过账/关账/会计引擎的原计算。

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
