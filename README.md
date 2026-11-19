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

`start:local`不自动加载`.env`，示例环境项见`.env.example`；只向当前进程显式提供新目标库的绝对路径。启动仅校验最新 schema，不自动迁移；旧目标库须先显式 migrate 升级到 007，已发布迁移与 checksum 不变。未提供 `ERP_SQLITE_FILE` 时只启动未配置壳，health 标记`data:unconfigured`，财务请求明确 503，不创建账簿。

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

D6 历史反向逐行精确镜像同公司原已过账行，即使科目/维度后来失效，也不重跑默认/派生；仍校验来源、金额取反和不能重复冲回。替换原子生成反向和新凭证；重分类必须全额。纠错不能早于原凭证及完整后代链最晚日期。已过账数据及封印不可变，累计安全整数护栏由末值索引维护。

服务/往来双轴 exact/group/all 用 Pareto 关系选唯一规则，互不支配为明确歧义；最强命中失效不退回弱规则。现金和对方科目都须显式配置，不推断 1000 或 forecast。维度按 party→service→rule→事件叠加后走统一解析。统计固定六位精度，允许正、负和零，不产生 GL。清算按 entryId+lineNo 引用同公司同科目完整来源行，净额须为零，排除未来/自动平衡/已匹配行，不做部分匹配。

业务现金取消从来源进入并沿用 D6；来源 GL 详情链接业务事件，不允许手工纠错绕过。普通凭证的 QUEUE 与立即 POST 是不同明确命令；队列转入按**当前配置**重新预览确认，待转/失败项目阻止冻结或关闭期间。D7：同一已撤回项、同一 trim 后 reason 重试幂等返回，不同 reason 409；任何未知写结果保留原键、计划和命令，只允许明确原命令重试，不自动重放或悄悄保存。

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

`INVALID_SNAPSHOT` 的读取器诊断会区分 `header`、`sidecar`、`identity`、`digest` 和一般 `validation` 检查，并在错误对象的 `diagnostic` 及消息中记录前后两次的 `size`、`mtimeNs`、`ino`、`dev`、`ctimeNs`（十进制字符串；尚无文件元数据时为 `null`），不包含文件路径、SQL 或业务数据。可手动或由外部夜间任务运行 `node scripts/stress-legacy-snapshot.mjs --iterations 50`：记录 Node/SQLite/平台版本，循环运行只读验收和诊断测试，失败时保留具体检查信息并以非零状态退出；不接入 PR CI。

CLI 输出标注`live:false`、快照 SHA、`scale:2`精确最小单位；总账保留同月完整分录和稳定游标，不因分页改变总额。来源变化 409 必须显式重新加载，不能静默切账。读取器测试用已提交的小型确定性 SQL 数据及冻结旧输出，不再调用旧 Book 或 Enterprise 写模型；另冻结由旧 main a401d6f 生产者生成的含过账、回执和封印的双账快照及原始 manifest，独立检验新 verifier 的兼容性与消费前后字节不变。来源记录在夹具的`producer.json`，原始 manifest 以`.oracle`保存，测试只复制为固定消费文件名，不重算预期。

旧账快照创建/备份/恢复不在当前新运行时提供。真正 M2 迁移仍需另行授权、独立备份、核对和回滚准备；读取现有快照不代表完成迁移，更不能操作受保护的 4173 账套、ID3 草稿或旧 checkout。

## 目标存储工具

仅针对显式独立文件，父目录须已存在；不从旧环境变量选择账套，不自动修复陌生文件：

```powershell
npm run storage:admin -- --help
npm run storage:admin -- verify --provider sqlite --file new-target.sqlite
npm run storage:admin -- provision --provider sqlite --file new-target.sqlite --tenant T1 --book B1 --company C1
```

`provision`只建立技术作用域，不是建账或 GL 导入。目标库连接使用 WAL/NORMAL、外键和 5000ms 忙等待；只读旧快照不改变 journal 模式。D4：已发布 001 的历史 dialect 允许值/checksum 保持不变，运行时只支持 sqlite。详见[存储说明](packages/infra/README.md)。

## 性能证据

```powershell
npm run bench:generate-ledger -- C:\absolute\new-synthetic.sqlite
npm run bench
```

生成器只接受新文件：1 公司、200 科目、24 期间、3 维度、100 万真实 GL 行，单科目单月 10 万行；使用生产迁移、外键、不可变约束与封印，bulk 加载不冒充逐凭证过账吞吐。完整 Bench 使用独立生产 main 子进程、真实 loopback HTTP、完整 JSON 和共享客户端契约解析，每场景 5 预热、50 样本；微基准另用独立小库。

原五路径的相对回退按 #26 的 p50≤10% 判定，p95/p99 各自核对原有 1s/2s 绝对预算；与基线差值继续输出供参考。其他场景原 p95 门槛不变。原始样本、fixture 摘要/大小、事件循环、查询计划及 PASS/MISS 写入 Bench 的`sqlite-ledger-*` artifact，保留 14 天；不缩库或删除异常样本掩盖 MISS。

下载同一 run 的`bench.json`和`baseline.json`后，可用`node packages\infra\bench\reports.ts recalculate <bench.json> <baseline.json> artifacts\ci\recalculated`离线重算。复用正式判定、从 raw 重算分位数并复核调度，输出 JSON/Markdown，分别记录实测提交、判定提交和输入 SHA-256，不启动服务或重新造数。PR 慢查询测试显式释放闸门，看门狗到期只能失败，不能自动放行成成功结果。
