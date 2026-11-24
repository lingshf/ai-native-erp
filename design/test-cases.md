# Test cases

> **维护者（D560，KDOC-02）**：自 D560 起，本文件由 QA（评审会话 `5ec013bf`）维护，见[团队章程 §2](team-charter.md#2-权威路径)。Product/Design 确认测试意图，不再直接改写用例；本次交接只记录归属，下列用例内容未改。

## 当前：ARCH-M03限定验收已完成（MODEL01）

最新r4：T13仅四个现有label/语言改为目标业务账套/只读快照的准确说明，同一独立G5核九摘要并实跑web58/UI2。源重新完整481、重新导出公共361/build/types及公共真实SQLite/PG18强制70、零失败/取消/跳过全部通过；恢复日志现包含argv和四项有效npm配置。重建SPA的真实Edge全场景再次通过并清理，共六图，新增中英概览精确文案及零财务请求断言。最新静态单样本load122.4ms/FCP280ms、health-ready观测344.3ms、首次试算ready观测94.4ms；下段135.7ms/268ms为r3历史，不是当前r4样本。当前r4组合规范/质量G6均已独立释放MODEL01，本地25更新15新增39同0冲突、副本361/native/build/types及79hash复核通过，独立安全审查无已确认漏洞；代码a608ee1已非强制main且全新GitHub clone精确选该提交，实际361/真实70/native/build/types/零skip全部通过并清理；限定M03用例已验收，状态文档另行发布核验；不以资源key测试冒称已核文案含义。

TC-AM03-01..14全文及FR映射以[实施基线的M03节](architecture-migration.md)为权威：01/07为真实CLI/开发proxy集成，02为真实桥，03为契约/OpenAPI，04..08为应用/真实HTTP，09..12为React异步与偏好，13为隔离真实浏览器，14为组合/非功能/交付。输入和oracle来自独立虚构M00快照及既有M02投影，原账仅物理hash保护；模拟组件测试不代替端到端。详细D所核8709809b…33560未改，表内“计划/尚未执行”为设计冻结时标题，当前结果如下。

### M03早期组合记录（历史，最终以本节顶部为准）

T11 r2/T12 r3/T13 r3均经独立规范/质量G5（MODEL01）；最后增量独立58web、UI2、8边界及web类型/build通过。Vite无CORS回归先真实失败，再以`cors:false`通过；当前修订完整源实际481/零失败取消跳过/build/types、真实70通过并清理，不沿用旧480。独立Edge最终真实试算/104行两页总账金额oracle、403/409及新来源最后期间、历史停用/维度、两语言主题教学、键盘/390px、Vite实际代理/Host/Origin/无CORS均通过，源/快照/原账/29保护文件不变，自建资源清理。100+100次Local完整读p95为3.664/7.966ms、p99为4.385/8.228ms，0错误；是单人有界样本而非M08容量验收。

TC14公共候选已实际禁生命周期/严格公共锁离线恢复，完整361/build/types及真实70零失败/取消/跳过通过，PG清理；不冒称匿名公网在线安装。当前组合G6、交付、安全/main/精确新clone尚未完成；M03不标done。实际失败历史、修复边界和未验限制见[评审](reviews.md)，后文M02计数均是已发布历史。

首次新profile静态UI单独实测load135.7ms、DOMContentLoaded135.5ms、FCP268ms，health-ready观测338.9ms、首次试算ready观测78.9ms；后两项含CDP轮询，一次样本不代表耐久/容量或SLA。G6/发布仍未完成。

阶段详细用例见[实施基线](architecture-migration.md)：M00/M01已经验收发布；TC-AM02-01..14的G3、T05..09独立G5及当前四测试文件修订/源与公共组合G6均释放MODEL01。当前SQLite31+真实PG38+PG生命周期CLI1组成强制双库70项；完整工作区422项（旧302+边界7+workspace113）、公共54文件候选302项（182+7+113），双方各真实70及build/typecheck通过、零失败/取消/跳过。本轮真实断连覆盖guarded admin/fixture、实际f.raw故障持续拒绝、关闭仍报错但数据库已删除、再次关闭幂等、有界等待及错误优先级；不是隐藏首次clone的43通过/25失败/1取消，首次TCP重置原因仍未知。原G5和G6独立读源码/摘要及故障探针，G6另重算四份完整/双库日志，真实PG由父执行，不冒称reviewer自启。Local生命周期CLI4项及此前同一生产代码的TLS-only成功/错误CA与明文拒绝证据保持；T08桥/domain13+CLI5由双方各18/18。真实health-only壳桌面/390px、三偏好与故障恢复通过，非财务页面或原账迁移。交付与修订发布后新clone另按实际记录，不以G6代替。

发布后验证：精确`f9f1bcbce539c13aae80aeddec5dc7d3280d250b`从GitHub全新clone，实际`npm ci --ignore-scripts`、native int64/rollback、完整302及真实双库70/build/typecheck通过、零跳过；临时clone/自有PG进程、集群及密码文件已清理。T10/M02限定范围done（MODEL01），不是M03..09或44FG全部完成。

## ARCH-SME-01 计划验收

以下AT是架构迁移的**未来验收**，不是已执行测试；本轮只进行文档/引用/DAG/运行文件不变校验及独立G3。阶段详细设计通过后实现相应自动化，用例阈值须按用户确认的Server基准冻结。

| ID / 架构需求 | 正常与边界输入、执行方式 | 可观察预期 / 失败路径 |
| --- | --- | --- |
| AT-01 / AR-01 | 分别构建web/api/domain；依赖图加入domain→SQL或UI→application写服务反向依赖 | 正常独立构建；禁止方向CI失败，domain无需DB/DOM/SDK运行；不创建仅有目录无测试的假分层 |
| AT-02 / AR-02 | OpenAPI与DTO/client一致；未知字段、超界金额、重复字段、非法scope/日期、兼容旧错误与分页；相同幂等键改金额/plan摘要/动作或principal | 正常typed响应；非法400/相应业务码，字段路径可定位、无SQL/内部栈泄漏；契约漂移CI阻断；键指纹冲突409且不返回旧回执，撤权403优先 |
| AT-03 / AR-03/05 | 同一业务oracle分别用真实SQLite/PG：整数边界、JSON/布尔、排序、FK/触发器、回执/历史；不是SQLite mock PG | 精确金额/维度/来源/归档语义一致，方言非法约束显式失败；大整数不静默舍入、未知schema不自动迁移 |
| AT-04 / AR-04 | 两个真实subject：maker零写预览后提交、退出/重启、短token已过期但审批期限未过，approver从待办取原请求；拒绝/撤回/到期/两人同时批准；提交后同法人无交叠依赖的其他对象过账、另一法人过账、第三用户权限变更，再批准；另改相关配置/期间/触及对象及ABA | 预览零写、提交只工作流/审计、合法异人批准原子一次入账；无关写入/权限变更不使请求过期，相关依赖变更必须拒绝并新提交；maker/approver可追、不复活终态、失败不留approved；自审/参与人撤权拒绝，Local仍标模拟 |
| AT-05 / AR-02/03/05 | 两会话核同未结项、改相关配置/关期、同键不同payload/principal、锁顺序/死锁及丢响应；不同company并行与book配置独占冲突；新增更强规则/原无候选/相关余额变化与无关配置写；Local双标签/job交错；注入GL/facts/approval/audit/outbox失败 | 一次原子成功、无超核/半GL/假批准；同company串行、不同company共享上级锁并行；锁行/全局水位变化不失效待办，相关对象/余额/规则范围/期间版本变化409（含ABA），无关写不失效；键冲突409/撤权403无旧回执。Local mutex不交错、只读WAL一致/job同进程；同键有界重试 |
| AT-06 / AR-04/05 | OIDC session过期/撤销、CSRF/Origin、RLS池连接复用、越权导出/审计、日志敏感标记探针 | 无权读写及跨租户缓存均拒绝；真实actor/批准人同事务可追，普通角色不能改历史；日志无secret/完整财务请求，TLS部署配置可核 |
| AT-07 / AR-07 | 中英/红绿/教学切换，未保存多行、预览/迟到响应、scope切换、localStorage失败及键盘标签 | 输入/节点状态按契约保留，无自动保存；必要警告不被教学隐藏，权限不变；旧名称不被翻译改写，迟到数据不跨范围 |
| AT-08 / AR-06 | 冻结已发布commit→新目标试迁移；默认M-CORE且贸易保持暂停，候选测试/文件在旧兼容工程保留；重复号/跨年/原回执；手工队列四状态及失败恢复；Local旧教学读写与Server探测旧接口 | 源/未知草稿原样，旧172及候选冻结清单保留；选定ERP目标语义全核，不以单GL切片代全基线。pending/failed仍阻关期，显式transfer原计划一次GL、withdraw理由终态，非journal不开放排队；Server不打开旧教学文件且接口不可用。M-CORE无需恢复贸易；未完成preview失效/旧回执原保证级别保留/盲回退拒绝 |
| AT-09 / AR-07 | AI有效/非法候选、超时/越权/未知科目、外发未授权字段、scope改变后迟到响应 | 仅最小许可快照，非法候选拒绝且不写账；模型无DB/UoW；保存草稿及另行批准分开；无真实调用不能宣称提供方已认证 |
| AT-10 / AR-08 | 冻结4vCPU/16GiB等试点硬件、20会话/10法人/100万GL行、热点混合负载30分钟，含完整鉴权HTTP | 记录p95/p99/吞吐/锁/错误；建议热读1秒、常规预览/确认各2秒p95，用户确认后才为门禁；零丢失/重复/越权不因性能放松，未测标not_run |
| AT-11 / AR-08 | SQLite一致快照/PG基础备份+WAL演练、worker lease崩溃重领、消息重复、迁移中断/重复进程及升级前后版本 | 独立恢复并核业务/GL/审计，不覆盖活动库；job幂等、outbox不替代GL事务；迁移锁/校验和阻断冲突，RPO/RTO目标需实测；Local不套用Server SLA |


## M-CORE基线验收设计（TC-C01..C12，尚未执行）

当前POLICY-01采用委托默认；本节不是旧80回归或新功能已通过的证据。每例使用独立虚构ERP库，保留原教学账摘要作前后比较。金额预期由测试独立写明，不调用被测函数当答案。M-CORE出口只对应FR-C01..08，完整TC-101..144的跨模块部分仍须后续真实对象验收。

| 用例 / 子需求 | 正常输入与可观察结果 | 边界/失败/历史要求 |
| --- | --- | --- |
| TC-C01 / C01 | 创建A、B两个空法人，同版本模板派生独立科目；A记资本53.27，B零，重启后相同；选择法人和期间不串账。最终行含原币/会计币/报告币及率引用槽位，M-CORE前两者同币同值；报告币不同明确null/未折算。 | 重复code/错误币种scale/同币种跨法人冲突scale/已用币种改精度/非会计币交易/不存在模板/非法年度拒绝；跨公司凭证身份返回404；无种子分录；旧Book八科目/原凭证/ID3不变，不隐式调用旧构造器迁移。 |
| TC-C02 / C02 | 独立配置类型/报表类别/方向/用途/备抵，原值83.00、备抵7.25，净75.75且原报表不再扣一次；合法反向余额保存并提示。清算两来源+11.00/-11.00配对，暂记12.00保留责任人/原因/复核日后解析；统计3.125件不改变TB。领域构造器中仅单元测试注册testOnly可信适配器，合法控制来源及配对事实成功，不对HTTP开放、不代表真实子账完成。 | 一月清算/暂记原行四月配对后，一月清单仍列原未清项、四月已清；选月不列未来原行；匹配日早于任一被配行拒绝、同最晚原行日允许；hold或未准入clearing的期间匹配拒绝且零写。错类别/备抵链环/已用类型或purpose修改/普通余额转控制/重复清算/非零配对/无暂记责任信息拒绝；停用历史仍查；control直接手工/伪造origin拒绝，不能借模拟reviewer绕过来源能力；HTTP未知/testOnly操作拒绝。 |
| TC-C03 / C03 | 公司默认、科目默认、单据、显式行逐层解释；缺省与null不同；fill不补null，replace显式允许覆盖原值/null并保留前后provenance；固定值/固定空值、条件必填及最终允许组合可复算。仅派生结果与fixed冲突时fixed最终覆盖、两步来源可见。 | 会计日首末有效日可用、前后一天拒绝，即使单据/税日位于相反边界；停用/未知/非法组合/派生冲突环拒绝。原始显式行与固定冲突/多个固定矛盾拒绝，不能借派生隐藏冲突；普通默认不回填null。preview后改配置再改回仍拒绝旧token；历史最终值不变。 |
| TC-C04 / C03 | DEPT=A借13.00、DEPT=B贷13.00，启用内部平衡后分别产生相反13.00平衡行，每组及整体为0，原业务来源保留；按DEPT查询能对回实际行。 | 原借13/贷12不得自动补1；缺平衡维度/科目/非法最终组合拒绝，零组不造零行；精确冲销包含原平衡行，不用新配置再生成另一套。 |
| TC-C05 / C04 | 单据日早于会计日，税日另存，会计月决定归属；open→hold不清损益，reason重开保留记录。空且无义务期间显式permanent。 | 无日历/越年/非法日/普通Opening/Closing/无模块准入拒绝；hold拒绝新账，permanent永拒重开；有发生但未完成年度工作、待转或未解义务不得永久关闭，不能用状态按钮冒充已完成年结。 |
| TC-C06 / C05 | 对象/组/全部及对方轴候选显示版本/淘汰解释；exact支配group，再支配all。有效期统一按会计日切换，单据/税日在另一边界仍得相同会计日结果，历史快照保持。 | 缺规则/同级重复/跨轴不可比较拒绝；非法最强科目不回退弱规则，forecast意义不当payment。禁止请求任意SQL/表达式/模块名；每个真实业务适配器后来各自验来源，参考事件不等于AP/AR完成。 |
| TC-C07 / C06 | 对一业务连续preview两次，所有业务/GL/来源/序列/审计零变；明确确认后一次源+凭证+回执+批准+审计，按显示计划逐行一致。 | 改任一输入/源/科目/结构/期间/规则或ABA后旧token拒绝；伪造token/未明确confirmation拒绝；在源、行、效果、回执阶段注入失败，全事务回滚，不留“已批准成功”假象。 |
| TC-C08 / C06 | 同源并发/重复/丢响应重试只有一个结果；重启、关期、停用后原输入+token返回原回执，不重算。 | 同reference不同输入或不同token409；新reference不能绕过实际业务唯一键（后续发票等须各验）。原成功重试与尚未完成预览分清；新公司同reference不串账。 |
| TC-C09 / C06、C08 | 手工队列确认显示pending、无GL；完整性查询列待转。显式transfer后一个凭证及transferred；重试仍相同，重启可恢复。另条pending/failed凭原因withdraw为终态、无GL且清除未完义务，原批准计划/审计保留，原post重试返回withdrawn不执行。 | pending/failed阻止冻结/完成；测试模块准入受限及注入存储失败，连错误状态也写不了时保持pending并返回可重试错误。已转不得withdraw；撤回reference不能复用。当前配置不改原计划，但当前期间不得关闭后仍入账；未支持模块不能选择异步。 |
| TC-C10 / C07 | 原53.27及原维度精确反向；replace同事务两张凭证（反向+新行），失败全无；reclassify一张含全量反向/新归属且金额同原，无部分重分类。可整体reverse错误重分类输出，恢复原金额后以新ref/token重新纠错，旧链保留；服务事件专用cancel可追。 | 四种纠错/取消会计日早于原凭证一日均拒绝且零写，同日/之后在合法期间可用。一月原账、三月重分类、六月撤销后，再对原账的四月纠错拒绝且零写，六月撤销同日或之后才允许，历史月份不叠加有效纠错；旧Book日期语义保持。已过账header/line/dim/snapshot直接SQL或API改删失败；重复/仍有有效纠错原journal、部分金额、伪造源/子账走通用GL取消拒绝；旧token不能重新纠错。原历史反向不受当前停用/结构阻断，replacement新行仍按当前约束校验；撤销新replacement不抹除旧原凭证的精确反向。 |
| TC-C11 / C08 | 真实HTTP/DOM创建/配置/行/预览/确认/来源/待转/总账/报表/审计可达；全局期间跟法人，返回旧模式恢复原月，中英/主题/教学不丢输入。一月资本53.27+收入9.14、二月费用2.08：月利润9.14/-2.08，YTD9.14/7.06，现金/权益62.41/60.33；报告币未折算明确不可用。 | Host/origin/type/请求上限/缺字段/越法人/未知资源；无开启次年API，普通跨未建年拒绝。迟到法人/月/容器响应不覆盖当前；错误/模拟批准/待转/不可逆/口径提示不随教学关闭消失。已有80测试保持，实际浏览器用隔离库，原4173不造业务。 |
| TC-C12 / C01、C06、C08 | 本机CLI经VACUUM INTO一致性快照到新位置，可在源继续运行时备份；摘要从完成的备份读取。恢复新ERP副本，核完整性/源↔凭证/平衡/金额维度；原成功receipt重试不新增，内存HMAC不入备份、未完成preview恢复后失效。 | 已存在目标不覆盖；不完整/不兼容/断来源/不平衡副本明确失败，不替换活动库；日志不含完整请求/凭据。无未实测容量/冷缓存/生产SLA声称；实际基准命令、规模及结果另行记录。 |

G2作者映射：C01→TC-C01/12；C02→C02；C03→C03/04；C04→C05；C05→C06；C06→C07/08/09；C07→C10；C08→C09/11/12。后续完整验收还包括年结/源纠错、子账控制、成本税币/银行、资产集团、现金流及14个原创教学分支；不得因本组通过把所有44FG标完成。

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

TC-142-A：在页面显示所选月、六个固定ID及左右值/差额/状态、allPass与非审计边界；教学关闭仍显示限制，中英切换不改账。使用受控返回分别验证失败差额、接口失败及迟到响应；切月/刷新/离开后不显示旧月成功或旧错误，加载不冒充通过，失败可重试。导航集成后以开放/已关、调整及停用历史科目做隔离真实浏览器验收；原账零写与ID3保持，执行结果在本轮完成后回填，不以计划冒充证据。

本轮实际执行（TASK11–13）：TASK11先2项缺导航失败，TASK12先11项缺方法/路由失败；TASK13先4项缺面板失败。随后 `node --test tests\ui.test.mjs tests\labels.test.mjs` 21/21通过；`npm test` 80/80、0跳过；`npm run check` 8运行文件通过。新增UI覆盖六项中英展示、0.01受控差额、503诊断、错误格式拒绝/重试、切月即撤销旧成功、迟到state不倒退及同月替换面板迟到错误。受控返回不是制造真实错账。

真实浏览器使用独立内存虚构账套：停用费用5300在已关2026-01的三阶段分别70.00/100.00/0.00，均下钻同月完整总账3行、期末0.00、无维度筛选；开放2026-02未调整10.00下钻完整总账15.00。勾稽六行全通过、差额0.00，教学关闭仍显示限制；中英切换与切月即撤销旧成功通过。10次被记录的页面请求均GET，完整凭证/期间与验收前相同；原预览另行只读核对，不拿隔离数据冒充原账。截图展示真实页面，不含真实AI调用。

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
## M-TRADE-A planned acceptance（金融基线G3释放，缓存补充待审）

本节对应FR-T01..08 / D-TRADE-A，仅非库存A切片；源案例不用作产品测试。以下为计划预期，实际执行及失败修订见reviews，不把oracle当已跑结果。TC-T15/NFR-T01是新的缓存设计补充，另需G3后才实施缓存；其余按原已审金融基线验证。共同夹具为独立临时ERP数据库、空法人、显式伙伴/profile/税/商品配置；不使用原4173或用户草稿。

| TC / FR | 层次、操作与输入 | 明确预期与异常 |
| --- | --- | --- |
| TC-T01 / T01 | 配置/API：创建AP/AR伙伴、expense/service商品、角色科目和期限；分别跨法人引用、错类别/控制用途、过期/停用/旧CAS、未选税码 | 合法版本可查，非法400/404/409且全状态不变；旧M-CORE配置与回执可读；不自动开启既有trade/tax期间模块。 |
| TC-T02 / T02 | 纯函数：税外原创net73.19、12%；税内输入gross81.97；0/2/4位币种、6位数量/单价、不可抵扣50%、零税与免税 | 税外tax8.78/gross81.97；税内net73.19/tax8.78；50%抵扣4.39/进费用4.39。税内应税费随单价同为含税。零税/免税可无税科目且不造0金额行。超精度/浮点/溢出/非法码/不支持币种或库存拒绝。 |
| TC-T03 / T02 | 纯函数：三行各税外net0.03/12%，及三行各含税gross0.03；同余稳定行序，重复计算与交换非同余行顺序 | 行模式税各0；单据模式税共0.01仅分首行。税内单据模式各行net0.02/0.03/0.03、gross各0.03。50%抵扣在分配后逐行half-up，首行抵扣0.01/不可抵扣0；不以整单比例再舍入。 |
| TC-T04 / T03 | 领域：先preview，再post；同源同封套多次/并发；外部号含全角/大小写/首尾及内部空白；restart重试；故意约束失败 | preview零写；source/facts/GL/receipt/audit同事务且仅一次。全角Ａｂ首尾空白与AB重复，A B内部空白保留、不等于AB；新reference仍拒绝重复。已完成原token在关期/改配置/重启后仍返回原回执，失败无半子账。 |
| TC-T05 / T04 | 领域/API：费用AP及服务AR、部分非库存订单开票；同商品两行分别净100/200，明确orderLineId；1%边界/超价/超量及例外；部分开票后取消订单 | 缺/错/重复orderLineId拒绝，不按商品猜行；100基数101允许、101.01须例外，数量始终不超。税内及应税费按保存的行净额比例比较。取消只消未开票承诺，不改GL/已开票；之后取消发票不重开已取消订单。无PO显示不适用。 |
| TC-T06 / T05 | 领域：原创invoice net73.19/tax8.78/gross81.97；单据日2026-01-05，付款accountingDate01-12或01-13，另设allowPartialDiscount=false | 全额discount1.10/cash80.87；部分net36.60/tax4.39/discount0.55/cash40.44，remaining40.98/net36.59/tax4.39。01-13即使documentDate01-12仍拒绝折扣；false拒绝40.99及已有部分付款后的剩余折扣，仅未结原全额可用。到期02-04，原税不变。 |
| TC-T07 / T05/06 | 领域：AP/AR预付、部分应用、贷项应用、两种退款及末次尾差；改伙伴控制profile/默认维度；商品/表头/行产生原控制维度及多段；规范序D1/D2/D3 gross2/3/2最小单位，先核销3再4；AR贷项5/D1跨发票应用5/D2；控制结构必填、后改fixed；超余额/他伙伴/他币种/重复/并发应用 | 应用仅invoice目标，两边各分净/税并尾次取尽；预收无收入，控制/预付科目及最终维度集合来自各原对象，不投新profile/伙伴默认段。三段首笔分配1/1/1、剩1/2/1，末笔分配1/2/1归零；反向首笔恢复原1/1/1。相同控制科目的跨发票应用须控制借5/D1、贷5/D2，不因科目相同省GL。新fixed改投明确拒绝，完整反向仍精确；现金/折扣用当前profile，退款不能折扣。零净GL仅许可逐科目及维度均净零的固定应用，source/target余额原子一致。 |
| TC-T08 / T07 | 领域/API：非库存部分贷项，原税率/商品科目之后改变，已付款发票再贷项、选择仅服务贷项 | 仍用原税事实和损益/税角色科目；累计比例及尾次不超原净/税/数量。形成独立信用未结项，原已付发票不改；无物料回库。原科目停用时新贷项明确拒绝，不改投新科目；超额/无原行/重复拒绝。 |
| TC-T09 / T03/07 | 领域：分别取消全未结invoice/credit/advance；有付款/退款/应用/有效贷项先取消；显式反向依赖后再取消；停用原科目/改维度 | 有有效依赖先拒绝；credit取消恢复可贷量，invoice取消恢复订单量，所有触及版本/日期校验。精确反向保留原行/内部平衡及链，不要求新配置有效；普通reverse不能取消贸易；重复取消拒绝。 |
| TC-T10 / T03/07/08 | 领域：01-05发票81.97、due02-04、02-12核销40.99不拿折扣；一月另有credit10/advance5；月末查询及跨公司同ID | 01-31 notDue81.97、其余桶0；02-28 overdue1_30=40.98、其余桶0。credit10/advance5各单列、账龄字段null，不抵消发票桶；正好到期未逾期，31/61/91天正确分桶。未来核销不改一月；逆序日拒绝，同日合法。 |
| TC-T11 / T03/08 | 集成：改配置/期间/对象后旧token、两个窗口付款；停用原控制科目；新旧法人期间trade/tax分别关闭 | 旧预览409且无写、并发不超用。新付款用原控制，停用则明确拒绝并提示恢复；完整取消仍可精确反向。创建公司不默认新模块；缺trade拒绝所有动作，缺tax拒绝发票/贷项及其取消，旧五模块不受影响。 |
| TC-T12 / T03/08 | 完整性/恢复：普通及readOnly构造均不传adapters；完整事件/月末/GL重放；破坏事件版本/审计/事实；实际一致快照恢复 | 内置贸易描述符仍注册，CLI确实检查贸易投影/守恒；未知trade版本显式失败，不跳过。其他来源差异明示不抹平；恢复保持全部业务状态及原回执，未完成预览失效；旧无贸易v1库不迁移可检查。 |
| TC-T13 / T08 | DOM/HTTP与独立真实浏览器：配置→AP/AR发票→preview→明确POST→部分结算→历史查询/详情；取消和失败路径 | 没有任意GL/事件JSON业务入口，无自动写账/AI；真实金额/未结/回执与API一致，跨月/法人迟到返回不能污染，空状态可行动；原3凭证/ID3不变。 |
| TC-T14 / T08 | DOM/UI：中英、红绿、教学来回、同上下文轻刷新、切换上下文及请求失败 | label成对且口径明确，未保存输入/预览节点按约定保留；输入/版本变动撤旧批准，错误显式且按钮可恢复；教学关闭不隐藏业务边界。全旧172回归及新增聚焦、独立G5/G6实际结果另记。 |
| TC-T15 / NFR-T01、T03/08 | 补充待审：独立文件账记录400张各五行发票首/100/300/末笔、分页及重开耗时；SQL计数探测热预览/确认/读取；同文件两句柄、两个法人、多个历史月、配置变更、旧token、失败/回滚；先缓存二月/三月切点再接受一月15日独立回填发票；热缓存后独立破坏事件/事实/GL | 热路径不重复逐事件校验已接受前缀，新增后缀完整验证；两句柄无超用/旧状态，配置变更仍撤token；失败后冷/热状态与回执一致且无超前缓存。未来核销不抹早月，回填一月发票必须同时更新已缓存二月和三月且与冷重放一致，更早切点跳过；跨法人不混。显式integrity/普通及readOnly重开/备份仍从空状态全验并拒绝坏库；性能记录不是固定毫秒SLA，不以省略完整性换速度。 |
