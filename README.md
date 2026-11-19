# AI Native ERP

本地优先、面向小企业的 AI-native ERP，同时提供可关闭的会计教学辅助。UI 参考 Dynamics 365 的工作区组织，界面与素材保持原创。当前只支持 **SQLite、本机单用户、loopback、无登录**；PostgreSQL、Docker、身份和多人部署均不在当前范围。

已实现独立新目标库的公司、科目、维度、凭证、业务事件、队列、总账报表、结账及候选式 AI 助手。产品仍是非生产演示版，不承诺符合某国会计准则；应付、应收、库存等后续业务不能视为已完成。教学开关不改变会计规则。

当前计划以[路线图](design/roadmap.md)、[任务总表](design/tasks/README.md)及[产品准则](design/product-guidelines.md)为准。[项目记录](design/project.md)、[历史评审](design/reviews.md)保留历史证据，不代表旧实现仍在维护或新功能已经验收。

## 安装与启动

需要 **Node.js 26.x、npm 11**。在新的副本中执行：

```powershell
git clone https://github.com/lingshf/ai-native-erp.git
Set-Location ai-native-erp
npm ci
npm run verify
npm run storage:admin -- migrate --provider sqlite --file new-target.sqlite
$env:ERP_SQLITE_FILE = (Resolve-Path .\new-target.sqlite).Path
npm run start:local
```

`verify`依次检查 Biome、严格类型、目录导入边界、完整 Vitest，最后构建 Web。测试与启动直接执行 TS 源码，不需要中间 JS 构建。API 默认监听 `http://127.0.0.1:4180` 并托管 Web 构建产物；未构建前端时明确返回 503，不回退旧页面。开发时在第二终端运行 `npm run dev --workspace @erp/web`，Vite 固定 5173/strictPort，代理到 4180。

`start:local`不自动加载`.env`，示例环境项见`.env.example`；只向当前进程显式提供新目标库的绝对路径。启动仅校验最新 schema，不自动迁移；旧目标库须先显式 migrate 升级到 014，已发布迁移与 checksum 不变。未提供 `ERP_SQLITE_FILE` 时只启动未配置壳，health 标记`data:unconfigured`，财务请求明确 503，不创建账簿。

首次连接有效的新目标库时建立固定 LOCAL tenant/book 下的 DEFAULT 月度教学公司（CNY、精度 2、当前财年）、八个内置科目和 12 个开放期间；**不创建示例凭证**。重复启动不覆盖已有主数据。不要把原账或快照选为目标库；不会隐式导入旧账，也不会改动其他副本的凭证或草稿。

仓库不包含账套、`.env`、依赖目录、日志或认证凭据。npm 11 的`allowScripts`仅放行`better-sqlite3`安装脚本，`koffi`保持禁用；不要用全局开放生命周期脚本或跳过必要原生构建代替。

## 目录与工程命令

| 位置 | 职责 |
| --- | --- |
| `packages/core` | 纯 domain、application、Zod 契约及 OpenAPI |
| `packages/infra` | SQLite、worker、Fastify HTTP、Copilot、只读旧账桥与组合根 |
| `packages/web` | React 工作区、共享 UI 资源和偏好、页面测试 |
| `scripts` | 目标库管理、只读旧快照校验/读取/预览、工程边界和 CI |
| `design` | 当前任务、产品规则及明确标注的历史记录 |

M0-15 已移除旧服务器、旧浏览器工作台及其专属测试、备份/快照创建命令。只保留后续 M2 所需的**只读旧账消费链**，没有同步旧总账或旧写入模式开关。旧启动与旧测试命令不再提供。

```powershell
npm test
npm run test:changed
npm run check
npm run typecheck
npm run check:boundaries
npm run verify:sqlite
npm run build
npm run openapi -- openapi.json
```

`npm test`运行根 Vitest 的 core/infra（Node 独立进程）和 web（jsdom）项目；`test:changed`只选相对`origin/main`的受影响非慢测试。Biome recommended lint/formatter 覆盖全部现行代码，不再保留旧代码 override。类型检查覆盖源码与 TS 测试；包导出直指 TS 源码，边界禁止 core 反向导入 infra、domain 导入 application、web 导入 Node 或存储驱动。Zod 是 DTO 单一来源，OpenAPI 仅按需生成。

PR CI 限时 10 分钟：安装、Biome、类型和边界后，对实际 PR base 选受影响 Vitest；workspace manifest/lock、Vitest 或 `tsconfig*` 变化回退全部非慢测试。`*.slow.test.ts`/`*.slow.test.tsx`只进入完整运行，本地`npm test`/`verify`仍为完整模式。summary 列出实际执行的最慢 10 个 Vitest，不再包含已删除的旧测试层。

Full 在 push main 及每天 03:17 UTC 运行；Bench 每天 03:47 UTC 及手动运行。夜间超过 24 小时无新 main 提交则跳过安装、测试、构建/基准；push 和手动不受限制。各层有超时、同层并发取消和 npm 缓存，大库不进入 PR CI。

依赖锁定精确版本，`.npmrc`保持`save-exact=true`。更新前核实 registry 为`https://registry.npmjs.org/`，CI 拒绝非公共 tarball 地址；不要提交私有源或凭据。Dependabot 每周分组检查 npm、每月检查 Actions，不自动合并。Copilot SDK 由 infra 声明，根目录不再重复依赖；Babel 保留用于导入边界解析，旧专属 acorn 已删除。

## 当前业务与统一规则

所有写入只针对显式选择的新目标库。预览只读，保存与明确确认是独立命令；AI、教学和偏好都不能自动记账。金额采用公司精度 0–4 位的精确最小单位及安全整数边界。

### 主数据与维度（M0-08 / M0-09）

公司、科目、期间及六类维度配置使用严格 DTO、同公司隔离和实体 revision CAS。版本冲突 409 保留输入，要求显式重新载入；可修正字段错误 400 定位字段，不伪装成版本冲突。内置八科目保持保护；统驭模块须明确选择，不默认推断为 AP。有界分页，超过 100 行虚拟化。

科目正常方向是余额解释，不限制合法反向记账；备抵自然抵减，关联规则和历史金额不因 UI 偏好变化。维度保存检查引用存在，应用时检查启停和包含端点的有效期。D5 统一 subset：组合未列维度不限制，必填/禁止仍独立校验。默认按账套→科目→主数据→抬头→显式行覆盖，再依赖顺序派生，fill 保留显式 null，最后稳定固定条件与结构。业务本身须先借贷相等，自动平衡行仍按当前科目与结构重校验；最终维度最多 32 键。

### 凭证与业务事件（M0-10 / M0-11）

草稿可保存不完整输入、修改或明确删除，记账日期显式填写。预览与 Ctrl+Enter 只计算当前编辑内容，不能后台保存；未保存修改须独立保存、重新预览再确认。确认在同一写事务重读当前同公司科目、期间、维度并重算指纹，原子写凭证/回执/审计并删除草稿。同键同内容返回持久原回执，公司内来源引用唯一。

M0-R1 的凭证头保留 `date` 为记账日期（accountingDate），新增可选 `documentDate`（单据日期）、`taxDate`（税日期），省略时各自等于记账日期。三者均须为真实日历日期；草稿仍允许未填完整，保存/读取补齐缺省值。只有记账日期决定期间、维度有效期、GL 和报表归属；单据/税日期可以跨期，不另增模块期间或税率计算规则。预览、详情和 API 返回实际日期。008 只新增两列、不加索引，原凭证回填记账日期；历史业务/队列不可变 JSON 读取时按相同规则补齐，原回执/指纹/GL 不重写。

控制科目仍拒绝手工、AI、普通导入/队列的新分录，错误码不变。受控入口为进程内 `JournalService.adapter(module)`；授权来自 `packages/core/src/application/posting-adapters.ts` 的静态登记表（模块 → 允许的 controlModule）：`TRADE` 对应 AP/AR/TAX，且受期间 trade/tax 准入约束；`LEGACY` 仅用于新库的历史导入，登记全部已知控制模块，不冒用 TRADE 的期间门禁。不提供运行时登记 API、配置开关或 HTTP/worker 通用调用入口。普通适配器使用同一草稿保存、预览、同事务重读/指纹、确认和幂等管道，只放行本模块获准的有效控制科目。模块绑定指纹并持久记录在回执 `module`，普通入口不能接管其幂等键或纠错；原来源模块可按 D6 镜像纠错，详情展示来源模块而不提供手工纠错按钮。

D6 历史反向逐行精确镜像同公司原已过账行，即使科目/维度后来失效，也不重跑默认/派生；仍校验来源、金额取反和不能重复冲回。替换原子生成反向和新凭证；重分类必须全额。纠错不能早于原凭证及完整后代链最晚日期。已过账数据及封印不可变，累计安全整数护栏由末值索引维护。

服务/往来双轴 exact/group/all 用 Pareto 关系选唯一规则，互不支配为明确歧义；最强命中失效不退回弱规则。现金和对方科目都须显式配置，不推断 1000 或 forecast。维度按 party→service→rule→事件叠加后走统一解析。统计固定六位精度，允许正、负和零，不产生 GL。清算按 entryId+lineNo 引用同公司同科目完整来源行，净额须为零，排除未来/自动平衡/已匹配行，不做部分匹配。

业务现金取消从来源进入并沿用 D6；来源 GL 详情链接业务事件，不允许手工纠错绕过。普通凭证的 QUEUE 与立即 POST 是不同明确命令；队列转入按**当前配置**重新预览确认，待转/失败项目阻止冻结或关闭期间。D7：同一已撤回项、同一 trim 后 reason 重试幂等返回，不同 reason 409；任何未知写结果保留原键、计划和命令，只允许明确原命令重试，不自动重放或悄悄保存。

### 账面付款、收款与部分核销（M1-04）

`/trade-settlements` 显式选择同法人、伙伴、AP/AR、币种的 1–100 个未结项，输入每项核销总额（整数最小货币单位）及当前 `revision`。列表分页并虚拟滚动。`POST /api/v1/trade/settlements/preview` 只读计算，`POST /api/v1/trade/settlements` 以 `command`、`fingerprint`、UUID `idempotencyKey` 和 `confirmation: "POST"` 原子确认。`command` 包含 UUID `paymentId`、`company`、`side`、`party`、`currency`、`accountingDate`、`documentDate`、`taxDate` 及 `items: [{ itemId, revision, gross, takeDiscount }]`，不接受客户端 GL/税额。`paymentId` 不可重用；同确认封套可安全重试，写结果未知时界面锁定并保留原封套。预览后配置或余额变动须重新预览；已成功原封套重试不受后续配置或关期影响。

按剩余净额/税额比例 half-up 分配，末次取尽；只有明确 `takeDiscount: true` 且付款记账日在原单据日至折扣截止日（含当天）内，才按保存的净额折扣率计算（常用条件 30/7/1.5%，不覆盖显式配置）。不允许部分折扣时，仅无既有核销的原始全额可用，不能最后一笔追认。折扣不改变原发票税额。控制科目及最终维度取原未结项，现金/折扣取当前 profile；新配置若不再容许原维度或原科目停用，明确拒绝，不重定向历史余额。核销日期不得早于依赖对象的最晚记账日。

011 追加不可变付款身份、发票折扣条件快照与来源校验；001–010 不改。010 没有保存发票对应的条款修订号，墙钟（含过账时间）不能证明配置与发票先后。升级先验证该伙伴及其曾引用条款的完整修订链，再以固化单据日加候选到期/折扣天数，同时匹配旧未结项的到期日及折扣截止日，排除不可能的条款；剩余候选的折扣率与部分折扣策略语义一致才回填。百分比按精确整数规范化，描述等无关字段改变或同毫秒同语义修订不阻断。链缺失/断档、无日期匹配候选或匹配候选语义不同（即便时间戳看似有序）时，错误列出受影响公司/发票及原因，拒绝升级并回滚，不按时间猜测；原余额及日期不改。新发票直接固化条件，不再依赖历史回查。发票详情的 `settlements` 返回核销来源、凭证及每次余额链路，结果仅表示账面已结算/剩余，**不表示银行支付、清算或对账完成**。

### 预付、贷项、专用取消与反向（M1-05）

`/trade-adjustments` 提供类型化预付/预收、贷项、应用、取消与反向表单；`POST /api/v1/trade/actions/preview` 零写预览，`POST /api/v1/trade/actions` 以 `{command, fingerprint, idempotencyKey, confirmation:"POST"}` 原子确认。每个新动作使用新的 UUID `actionId`，共同字段为 `company`、`accountingDate`、`documentDate`、`taxDate`，不接受客户端 GL/税额。确认前同步保存并读回核对完整原封套；拒写、不能读回或内容不一致均显式报错且不发确认 POST。未知写结果锁定并保存原确认封套供安全重试，切语言保留输入；不自动调用 AI。

| `command.kind` | 专用字段与规则 |
| --- | --- |
| `advance` | `side`、`party`、`currency`、整数最小币种单位 `gross`、`dimensions`。AP 借预付资产、贷普通现金；AR 借普通现金、贷预收负债，不确认收入或预收税，不代表预付发票路线。 |
| `credit` | `invoiceId`、原发票当前 `revision`、`lines:[{sourceLineId,quantity}]`。按原行累计可贷数量分配原净额/税/可抵扣税与尾差；保留原损益/税科目及最终控制维度，产生独立反向未结项，不修改已付原发票、不产生实物退货。 |
| `apply` | `sourceId/sourceRevision`、`targetId/targetRevision`、`gross`。来源只能是同伙伴/币种/AP或AR的贷项或预付，目标只能是发票；原子扣减两边余额，末笔取尽各自净/税及分段尾差。 |
| `cancel` | `itemId`、`revision`、`relatedRevision`（取消贷项时必须是原发票当前版本，其余为 `null`）、`reason`。仅完整未结且无有效依赖的发票/贷项/预付可取消；取消贷项恢复可贷数量，取消发票恢复订单可开数量。 |
| `reverse` | `settlementId`、`items:[{itemId,revision}]`（必须恰好覆盖原核销/应用两边或全部选中项）、`reason`。精确恢复原净/税/控制分段分配；现金反向仍不表示银行退票已处理。 |

付款界面 `/trade-settlements` 同时支持预付和贷项剩余余额的退款，现金方向与发票结算相反；退款不可拿折扣，也不得与发票混选。`GET /api/v1/trade/open-items` 返回 `kind`、`status`（含 `cancelled`）及 `segments`，`GET /api/v1/trade/open-items/{itemId}/actions?company=...` 与发票详情的 `actions` 返回不可变操作链；原 `settlements` 保留核销证据，反向不会删除旧记录。所有后续动作日期不得早于受影响对象最晚事件日；有效依赖先逐项专用撤销，不自动级联，通用手工冲销仍拒绝贸易凭证。

控制/预付维度按原最终集合分段，键按 ASCII 规范序排列，逐段按当步剩余金额比例 half-up，末段取尽。新发票逐行固化控制维度（包含商品/表头/行维度）；原已过账发票保留原单段，不重写历史。相同控制科目的跨维度应用仍写真实转移分录，只有逐科目及完整维度均净零才可无 GL，但业务来源、回执、双边余额及链路仍完整持久化。新写入验证当前有效角色/结构，不能改投新伙伴默认或 profile；完整专用取消/反向复制服务器原凭证全行（含内部平衡），不因当前停用/结构变化阻断。

迁移 **012** 追加来源身份、不可变动作/关联/贷项行及控制分段；事务内重建 `open_items` 和其直接外键子表以支持三类未结项及取消状态，逐列保留原数据、余额、版本、核销和条款，既有发票回填原控制单段；001–011 不修改。011 及之前的原核销回执仍可精确反向，原幂等封套继续返回原回执。月末历史余额/账龄不是本操作页面的当前余额口径，使用下述 M1-06 查询页。

独立非门槛采样可运行 `node packages\infra\bench\trade-adjustments.ts`，仅创建并清理自有临时合成库；AP/AR 预付确认及取消分别预热 4 次、记录 24 次 raw/p50/p95/p99，不混合路径。计时包含 application 确认与事务持久化，不含预览/HTTP/建库，不代表生产 SLA；普通 PR 套件不运行该采样或设置其墙钟性能门槛。

### 未结项、历史余额、账龄与 GL 核对（M1-06）

`/#/trade-reports` 提供未结项、账龄及核对视图，超过 100 行复用虚拟表格。月份留空为当前全量余额（包括已录入的未来日期事实，账龄参照服务器 UTC 当天）；指定 `YYYY-MM` 为该月最后一日截止。筛选输入须显式应用或撤销，未应用时阻止页面/公司切换；语言、主题、教学偏好不丢输入、不新增财务或 AI 请求。点单据打开原始行、保存的控制科目、来源、核销/动作及凭证链接；历史版本与当前全量版本/余额分别显示，历史版本不能用于新操作。

只读 API：`GET /api/v1/trade/reports/open-items?company=...&month=YYYY-MM&side=AP&party=...&limit=100`（month/side/party 可省略）；`GET /api/v1/trade/reports/open-items/{itemId}?company=...&month=YYYY-MM`；`GET /api/v1/trade/reports/reconciliation?company=...&month=YYYY-MM`。分页回传 UUID `nextCursor` 和 `snapshot`，续页须原样携带两者及同一筛选，事实变化返回 409，显式刷新重读，不混合页。汇总始终涵盖同一只读事务内的全部匹配项，不是本页合计。

余额为保存的原始净/税/总额减截止日内核销与动作差额；核销用已有 `settlements(company_id,item_id,accounting_date)` 索引 SQL 聚合，应用/取消/反向用不可变前后像差额 SQL 聚合，不重放事件、不新增余额缓存。未来核销、退款、取消不隐藏早月记录；当前停用伙伴/科目或新 profile 不改变原科目/日期。发票到期日当天归未到期，之后分 1–30、31–60、61–90、91+ 天；贷项/预付分别以正金额单列，账龄字段为 null，不净抵发票桶。

GL 核对固定为本公司**全部伙伴及 AP/AR**、从账首至同一截止日的借减贷，伙伴/方向筛选不适用。按原保存控制/预付科目并纳入当前 AP/AR 控制科目，分别返回 `subledgerMinor`、`tradeGlMinor`、`otherSourceMinor`、`glMinor`、`tradeDifferenceMinor`（贸易 GL − 子账）及 `differenceMinor`（全部 GL − 子账）；历史停用/重新分类的已用科目仍纳入。其他来源和真实贸易差异单列，绝不造调整凭证抵平，也不声称独立审计或银行对账。

迁移 **013** 仅增加 `periods.modules`（JSON 数组，原期间全部 `[]`）及两项查询索引，001–012、原事实/GL/回执/版本不改。新公司与新开期间同样默认 `[]`，不会继承或自动打开 trade/tax。`/#/period-close` 显式勾选 trade 和 tax、填写原因后保存；`PUT /api/v1/periods` 现在必须含 `modules: [] | ["trade"] | ["tax"] | ["trade","tax"]`，沿期间 revision CAS/历史记录。所有 TRADE 写入（含无 GL 应用反向、专用取消）统一要求**会计日期间**开放且两模块均准入，税日期间不另检查；普通 GL 行为不变。准入撤销再打开也会变更期间版本，旧预览失效；成功原幂等封套重试仍先返回旧回执。期间写入、付款确认均先保存完整封套并逐字读回，失败不发送；期间 CAS 的未知结果只重试原封套，冲突后明确报错并重新读取期间。

### 贸易计算器（M1-02）

`@erp/core/domain` 导出无 I/O 的 `calculateTrade` 和对称 half-up 的 `roundTradeRatio`。计算输入显式包含 `side: "ap" | "ar"`、相同的 `currency`/`accountingCurrency`、`scale: 0..4`、`priceMode: "exclusive" | "inclusive"`、`rounding: "line" | "document"` 及 1–100 个唯一 `id` 的行。行的 `quantity`、`unitPrice`、`discountPercent`、`taxableCharges` 均为非负十进制字符串，数量必须正；数量/单价/百分比最多六位小数，费用使用币种精度。税配置显式传 `code`、`treatment: "standard" | "zero" | "exempt"`、`ratePercent`、`deductiblePercent`（百分比 0–100）；调用者先按 `taxDate` 解析并验证有效税码，计算器不查主数据、不替上层推断税码。未知字段（包括客户端税额、库存类型）明确拒绝，单据舍入后总额必须正。

商业折扣只减数量×单价，再加应税费用；税内费用同为含税。BigInt 中间值不经浮点累计，输出均为币种最小单位安全整数。行模式税外 half-up 税、税内 half-up 净额；单据模式按税码、税处理、规范化税率和抵扣率分组，以最大余数分配税，同余按输入行序。税内保持行含税总额不变；采购在分配后逐行舍入抵扣额，不可抵扣部分进该行费用，销售不减销项税。行及单据均返回净额、税、总额、抵扣/不可抵扣、费用（销售为 0）和净额现金折扣基数；`roundingSource` 给出精确税分数、独立行税额、最终调整和来源行序，`group` 元组为税码/税处理/百万分之一百分比税率/百万分之一百分比抵扣率。仅交付纯计算，不表示 AP/AR 发票、付款或过账已接通。

### 报表、明细与结账（M0-12 / M0-13）

当前账页入口`/#/ledger-reports`和`/#/ledger`；快照入口始终独立。累计试算/资产负债不丢以前年度，利润表显示当月/日历年 YTD，并排除结转本身；权益包含累计未结转利润，不重复抵减备抵。按当前科目分类，历史停用余额仍可见，不跨公司合计或汇兑。

unadjusted 排除当期 adjusting/closing，adjusted 排除当期 closing，postClosing 包含结转；以前期间结转始终保留。利润表经营金额下钻以同一复合水位读取 adjusted、不含结转，原始试算和余额链接保持 postClosing。六项对账只代表同源数学勾稽，不是独立审计或子账对账，教学关闭仍显示。

D8 始终为 **GL sequence + 同公司 SUM(accounts.revision)**，不是 MAX。报表、下钻、筛选、cursor、URL 和缓存都带双水位。独立账页首次读取后写入 URL 并 pin，409 仅进入需显式刷新状态，应用筛选、自动 refetch 或缓存失效都不能去掉 pin。明细按日期/凭证ID/行号 keyset 分页、每页最多 500，逐行余额由 SQL 重算，不使用 OFFSET 或全量 GL 内存加载。

期末向导`/#/period-close`先预览、明确确认，再独立打开下一期间。monthly-teaching 每月结清损益，annual 一至十一月冻结、十二月结转并永久关闭全年；阻塞草稿/队列和前期检查不省略。结转按科目、无维度汇总到当前合法 3100，不冒充 D6 逐行镜像，也不保证维度段清零；无余额不造零凭证。大科目表按 999 个损益科目分块，单张不超 1000 行、最多 10 张，共用事务与回执。关闭不可重开，跨年推进刷新期间目录但不丢旧账页 pin。

### SQLite worker（M0-13a）

目标库用例统一在 worker 内执行，HTTP 主线程不加载 better-sqlite3，不保留同步回退。1 个写 worker；默认`R=max(2,min(3,CPU−1))`个 readonly/query_only 读 worker，重读最多 R−1，保留轻读槽位。`ERP_SQLITE_READERS`可将同一池容量设为 2–32，不改变业务规则。AI 科目目录走轻读，讲解/当前预览走重读，模型网络不占数据库 worker。

同一用例的事务边界与写入重读保持不变；六项对账同事务共享完整聚合及当期阶段差额，不跨请求缓存、不建余额表。关闭先停止 HTTP，再排空已接受用例和连接。worker 丢失明确 503，不自动重放写命令，后续请求恢复；生产入口模块守卫及目录边界阻止主线程加载原生驱动。

### AI 与界面（M0-14）

只使用官方 Copilot SDK。进程须有官方支持的认证并设置明确的`AI_MODEL`（不能是 auto），`AI_PROVIDER`可省略或为 copilot；`AI_TIMEOUT_MS`默认 30000，允许 1–300000。缺配置或认证/模型不可用时 AI 明确 503，记账/报表照常使用；不复制聊天凭据、旧账环境或私有端点，不自动换模型。

起草只读本公司科目主数据，不聚合 GL；讲解在同一个只读快照取得 adjusted 报表、科目/维度/期间、D8 和结账阻塞数量，不发送草稿内容或逐笔业务记录。只代表请求时点，不代替结账预览。发送前显示数据范围，勿输入真实财务/个人信息/密钥。

候选仅允许普通/调整凭证，最多 100 行，不能指定纠错/结转/来源等系统动作。AI 维度须在描述明确为 CODE=VALUE；返回后重读当前配置并复用凭证预览校验，不另建宽松路径。生成/讲解/取消/放弃零业务写入；明确采纳也仅填入新草稿，仍须独立保存、预览与确认。

SDK 使用独立临时目录、明确模型与空工具集，关闭 MCP/代理/技能/配置和指令发现、文件钩子、记忆与会话遥测。发送前核对工具、生成前后核对模型，UTF-8 输出限 256 KiB；无法确认停止则保留目录并禁用 AI 至重启，清理失败不返回候选。日志仅固定错误类别/请求号，不记录提示词、模型原文或上游私密错误。测试用假适配器，不需外网或凭据。

界面默认中文/红色/教学关闭，偏好保存在同源`erp.workspace.preferences.v1`；切换不清输入、不重发 AI、不改变账务。教学关闭隐藏讲解/rationale，仍保留风险、校验和不可逆操作提示。公司/草稿/月切换及离开页面会中止或丢弃迟到响应。业务名称和用户输入不翻译。中英文 label 在 Web 共享 UI 目录按同 key/具名参数维护。

## 只读旧快照（供后续 M2 使用）

读取器仍只接受**已存在且独立、已验证的 M00 双账快照目录**，不能传活动账套目录，不会创建或导入目标业务账：

```powershell
npm run ledger:read -- --help
npm run ledger:read -- trial --snapshot-dir C:\private\verified-snapshot --month 2026-01 --stage adjusted
npm run ledger:read -- ledger --snapshot-dir C:\private\verified-snapshot --month 2026-01 --account 1000 --limit 100
npm run preview:legacy -- --snapshot-dir C:\private\verified-snapshot
```

预览仍是现行 Fastify/React 的只读装配，不是已删除的旧服务器。先构建 Web，默认 4180；只接受 Local 和字面 loopback，拒绝 4173、未实现认证的 Server 及非规范端口。开发 origin 必须显式`--dev-origin http://127.0.0.1:5173`，不提供宽松 CORS 或 LAN。

`scripts/legacy-snapshot-reader.mjs`先做双文件非 SQL preflight，再校验 manifest、字节/逻辑摘要及只读 Enterprise 完整性。只读校验不含初始化、种子、迁移或写业务方法；旧快照格式和检查强度不变。WAL 头、sidecar、符号链接、身份/摘要变化都明确失败，不能放宽已知 Windows 间歇 INVALID_SNAPSHOT 护栏。

只读回归测试同时比较读取前后源快照和已有 WAL/SHM 的内容及纳秒 mtime；接受与拒绝路径都不得 checkpoint 源文件、清理 sidecar 或修改源快照。测试夹具在独立目录生成，不能用真实账套代替。

`INVALID_SNAPSHOT` 的诊断覆盖共享入口的配置、路径、manifest、物理/逻辑摘要、schema、底层 header/sidecar/身份和读取/投影检查；错误对象的 `diagnostic` 及消息记录前后两次的 `size`、`mtimeNs`、`ino`（Windows 文件 ID）、`dev`、`ctimeNs`（十进制字符串；仅元数据尚未取得或不可访问时为 `null`），不包含文件路径、SQL 或业务数据。verifier 交付前会在全部 SQL 句柄关闭后，重新比对 manifest 和两个库的 SHA-256、文件 ID、大小及纳秒 mtime，将一致性检查覆盖到整个双库校验窗口；原有 SQLite 句柄级的 ctime 等身份检查全部保留，不 checkpoint、不增加等待。

可手动或由外部夜间任务运行 `node scripts/stress-legacy-snapshot.mjs --iterations 50`：记录 Node/SQLite/平台版本，循环运行只读验收和诊断测试，失败时保留具体检查信息并以非零状态退出；不接入 PR CI。

CLI 输出标注`live:false`、快照 SHA、`scale:2`精确最小单位；总账保留同月完整分录和稳定游标，不因分页改变总额。来源变化 409 必须显式重新加载，不能静默切账。读取器测试用已提交的小型确定性 SQL 数据及冻结旧输出，不再调用旧 Book 或 Enterprise 写模型；另冻结由旧 main a401d6f 生产者生成的含过账、回执和封印的双账快照及原始 manifest，独立检验新 verifier 的兼容性与消费前后字节不变。来源记录在夹具的`producer.json`，原始 manifest 以`.oracle`保存，测试只复制为固定消费文件名，不重算预期。

旧账快照创建/备份/恢复不在当前新运行时提供。真正 M2 迁移仍需另行授权、独立备份、核对和回滚准备；读取现有快照不代表完成迁移，更不能操作受保护的 4173 账套、ID3 草稿或旧 checkout。

## 目标存储工具

仅针对显式独立文件，父目录须已存在；不从旧环境变量选择账套，不自动修复陌生文件：

```powershell
npm run storage:admin -- --help
npm run storage:admin -- verify --provider sqlite --file new-target.sqlite
npm run storage:admin -- provision --provider sqlite --file new-target.sqlite --tenant T1 --book B1 --company C1
npm run storage:admin -- backup new-target.sqlite independent-backup.sqlite
# Restore MUST be offline: stop the service and all other database tools first.
npm run storage:admin -- restore new-target.sqlite independent-backup.sqlite
```

`provision`只建立技术作用域，不是建账或 GL 导入。目标库连接使用 WAL/NORMAL、外键和 5000ms 忙等待；只读旧快照不改变 journal 模式。D4：已发布 001 的历史 dialect 允许值/checksum 保持不变，运行时只支持 sqlite。详见[存储说明](packages/infra/README.md)。

`backup <db> <out>` 必须显式指定两个路径，输出须不存在；通过 SQLite 在线备份 API 生成经过完整性和当前迁移校验的单文件，服务运行中也可执行。**恢复必须先停服务**：`restore <db> <in>` 从取得维护锁到 checkpoint、关闭句柄、换库、验证及必要回滚完成，全程独占；持锁时服务启动会失败。恢复前原库完整 checkpoint 为带时间戳的 `.bak`，成功输出其路径；新库验证失败则自动还原，并保留 `.bak`。若回滚本身失败，维护锁继续保留、服务仍拒绝启动；错误会给出已验证 `.bak` 的路径，须先人工恢复并验证，再处理维护锁，不能直接删锁强启。损坏或迁移不匹配的输入在任何目标 SQLite 读写打开前拒绝，不改动原库及 crash-WAL/SHM 字节；仍被使用的数据库也拒绝恢复。替换前若残留 `-wal`/`-shm`，拒绝且不手动删除。不要复制正在运行的库主文件作为备份，也不要删除 sidecar。异常终止遗留的 `.maintenance-lock` 须在确认没有维护进程后由操作员调查处理，不能带锁强启服务。

## 历史导入（M2-03，待串行集成）

只接受已生成并校验 SHA 的双账快照、显式的新目标路径和全部六项决定 C 选项；不会读取活动旧账、4173 或 `.bak`。以下选项仅为合成验收示例，不代表真实数据授权：

```powershell
npm run storage:admin -- legacy-import --snapshot-dir C:\synthetic\verified-snapshot --target C:\synthetic\new-import.sqlite --drafts import-as-draft --receipts archive-only --source-events archive-only --transfer-queue archive-only --seals archive-only --audit archive-only
node packages\infra\test\support\legacy-import-bench.mjs --execute
```

完整消费 M2-02 计划并确认可执行后才创建目标库。无法映射的 `import` 选项明确失败，不伪造回执、来源事件、队列或封印。`archive-only` 的证据保留在原只读快照，run 记录双库 SHA 和规范化选项；`legacy_refs` 对每个实际导入对象保留源引用及映射证据，账号设置/属性折叠到科目，币种折叠到公司配置。

历史凭证通过静态 `LEGACY` 适配器使用统一领域计划与存储封印，不生成运行时回执；当前已停用的历史科目/维度允许保留，但仍检查引用、金额、平衡、控制模块授权和开放期间，且拒绝计划额外增行或改变源行。所有源期间先开放，包含原结转在内的凭证按记账日期导入，再按月份导入关闭/冻结状态。关闭状态复用领域状态转换和前期检查，历史引用源期间及结转 `legacy_ref`；不调用普通关账，不重生成结转，不因保留草稿而阻塞历史状态。

每批最多 5000 分录，业务行、引用、计数、游标和写入序号同事务提交。已存在目标仅允许恰好一条本工具的 `importing` run 续跑，必须匹配 SHA、全部选项、当前迁移版本、已记录表计数和 `write_seq`；陌生、完成、被业务写入过或混入额外数据的库均拒绝，不覆盖、不合并。恢复可重放同一命令；硬终止遗留维护锁须先由操作员确认进程已停止并调查，不自动删锁。

独占批量导入使用 WAL/NORMAL 和 128 MiB 页缓存；事务仍逐批提交，checkpoint 延后到连接关闭，避免 Windows 每个小批次强制刷盘。须为目标库、临时映射库和导入期间增长的 WAL 预留磁盘空间；中断后不能删除 WAL/SHM。

导入全程持独占维护锁，完成状态为 `imported`，不是 `reconciled`。运行时拒绝将任何未核对导入库作为活动库打开，M2-04 核对通过前不能设为活动库。`write_seq` 在 SQLite 业务写事务的统一提交路径递增，主数据、配置、草稿、单据、队列和状态变更均计数，回滚/只读/迁移控制不计数；改后改回仍增加两次。外部工具绕过程序直接修改文件不受支持。

迁移文件预留 `014`；按 D16 已 rebase 到含 `011` 的 main，开发 manifest 临时将 `014` 接在 `011` 后（开发版本 12），不改运行器规则，仍不可合并。待 M1 的 `012–013` 合并后再次 rebase，保持已发布迁移前缀不变，再验证 `013→014` 和 `007→014` 并复审。本分支的升级用例自动覆盖 `007` 和 manifest 中紧邻 `014` 的前一版本。

## 性能证据

```powershell
npm run bench:generate-ledger -- C:\absolute\new-synthetic.sqlite
npm run bench
```

生成器只接受新文件：1 公司、200 科目、24 期间、3 维度、100 万真实 GL 行，单科目单月 10 万行；使用生产迁移、外键、不可变约束与封印，bulk 加载不冒充逐凭证过账吞吐。完整 Bench 使用独立生产 main 子进程、真实 loopback HTTP、完整 JSON 和共享客户端契约解析，每场景 5 预热、50 样本；微基准另用独立小库。

原五路径的相对回退按 #26 的 p50≤10% 判定，p95/p99 各自核对原有 1s/2s 绝对预算；与基线差值继续输出供参考。其他场景原 p95 门槛不变。原始样本、fixture 摘要/大小、事件循环、查询计划及 PASS/MISS 写入 Bench 的`sqlite-ledger-*` artifact，保留 14 天；不缩库或删除异常样本掩盖 MISS。

每晚及手动默认只跑候选、生产默认读池 R，限时 10 分钟；相对回退显示 N/A，不影响全部候选绝对预算、三并发、饱和轻读/专用槽位、未调整报表/六项对账、靠后页及事件循环门禁。手动 Bench 的 `baseline` 可输入完整 40 位 commit SHA，在同一 runner 上先跑基线再跑候选；双方各用自己的代码生成独立物理库，配对只要求 fixture 的 seed/逻辑摘要一致，不要求 schema 或文件字节一致，因此新增候选迁移不会把新库交给旧基线。输入与实际 SHA 或配对信息不一致即失败。`sweep=true` 才扫描 R=2/3/4；显式基线或扫描保留 45 分钟上限。本地对应环境变量为 `ERP_BENCH_BASELINE_SHA`、`ERP_BENCH_BASELINE_JSON` 和 `ERP_BENCH_SWEEP=true`；`reports.ts prepare` 用 `ERP_BENCH_SOURCE_ROOT` 选择生成器版本，`ERP_BENCH_FIXTURE` 的路径和元数据必须来自该版本。无基线时前两项留空。报表门禁 MISS 会令 Bench 失败，证据仍先写出。

下载同一 run 的`bench.json`和`baseline.json`后，可用`node packages\infra\bench\reports.ts recalculate <bench.json> <baseline.json> artifacts\ci\recalculated`离线重算。复用正式判定、从 raw 重算分位数并复核调度，输出 JSON/Markdown，分别记录实测提交、判定提交和输入 SHA-256，不启动服务或重新造数。PR 慢查询测试显式释放闸门，看门狗到期只能失败，不能自动放行成成功结果。
