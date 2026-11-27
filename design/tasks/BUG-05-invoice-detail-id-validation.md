# BUG-05 发票详情前端编号校验与服务端同为小写 UUIDv4

- Sprint：S28（[计划](S28.md)，D602）　依赖：无（S28 计划合并即可开工）　建议分支：`bug-05-invoice-id-shape`
- 冲突域（逐个列文件）：
  - 前端：`packages/web/src/TradeInvoiceDetail.tsx`（只改 :29 注释与 :30 正则）；
  - 测试：`packages/web/test/trade-invoice-links.test.tsx`（只在 P6 的 `it.each` 表 :162-168 增加五行）；
  - 共享单文件：无；
  - 取证所需观测点 / 新增测试文件：无（沿用 P6 用例体与 `served.details()`，:59）；不新建测试文件，不改 `test/support/`，不改 `scripts/test-shard-weights.json`；
  - 受影响的 e2e 断言：“必须继续成立” `packages/infra/test/support/trade-gui-invoice-links.ts:250`、`:363`（只断言真实生成的编号满足 `[0-9a-f-]{36}`，真实编号是小写 UUIDv4，仍成立）；“须随本任务改”：无。检索命令与结果见“现状”第 6 条；
  - 受影响的文档引用：不适用（不搬移、不拆分文件）；
  - 受影响的文档：`docs/flows/invoice-detail-flow.md:35`（“格式不是 36 位 documentId”→ 小写 UUIDv4，行号引用改到合并提交）— 合并后由 Knowledge Lead 修改（S28 泳道 E）；`design/trade-design.md:51`（删去“符合该形状、但不符合服务端 UUIDv4 规则的仍会发请求…”及 BUG-05 链接，改为前后端同一规则，钉合并提交）— 合并后由 Product/Design 修改（S28 泳道 A）；`design/tasks/backlog/BUG.md:17`（状态改 done 并链接 PR 与合并提交）— Sprint 收尾；CHANGELOG — 交给下一次发布候选，由 Delivery/Release 按已合并 PR 整理（S28 计划“版本”节），本 PR 不改。`docs/user/trade.md:107`、`docs/user/ui-guide.md:116`、`docs/flows/invoice-deeplink-flow.md:44` 只说地址带 `invoice=`，不描述形状规则，不改。检索命令：`git grep -ln "invoice=" -- packages scripts docs design`（结果见“现状”第 6 条）；
  - **不涉及**：迁移 / schema、HTTP 契约与服务端校验（`trade-document-http.ts` 不改、不放宽）、领域过账、标签文案（不加新标签）、地址读写与离开确认、P7 及其他用例、`scripts/`、`.github/`。
- 类型：缺陷修复（前端校验，P3）
- 优先级：P3（用户可见，但只有手工构造的地址才触发，后果是一次 400 与“重试”，不丢数据；S28 排序第 4）

## 现状（main `519fc226992fb1575474f3f671fc11f7232150e8`）

1. 前端形状规则是 `const documentIdPattern = /^[0-9a-f-]{36}$/;`（[`TradeInvoiceDetail.tsx:30`](https://github.com/lingshf/ai-native-erp/blob/519fc226992fb1575474f3f671fc11f7232150e8/packages/web/src/TradeInvoiceDetail.tsx#L30)），上一行注释写“Same shape check as the server … anything else cannot exist”（:29），与实际不符。
2. 服务端规则是小写 UUIDv4：`/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u`（[`trade-document-http.ts:9`](https://github.com/lingshf/ai-native-erp/blob/519fc226992fb1575474f3f671fc11f7232150e8/packages/infra/src/http/trade-document-http.ts#L9)），不符时 `INVALID_INPUT`（:11-13）→ HTTP 400。
3. 前端不合形状时不发请求：`enabled: wellFormed`（:53、:58），直接按“不存在”显示（:98-99），不显示“重试”（:127）。合形状时发请求；服务端 400 不是 404，`notFound` 为假，于是显示 `tinv.detail.error` 与“重试”（:121-135）。
4. 因此旧正则放过、服务端拒绝的形状会发一次详情请求并显示“重试”：36 个 `-`、全 0（`00000000-0000-0000-0000-000000000000`）、非 4 版本位、非法变体位。大写形状含 `A`–`F`，不在 `[0-9a-f-]` 内，旧正则已拒绝（试跑确认，见“试跑记录”第 1 条）。
5. 测试：P6 是 `it.each` 表（[`trade-invoice-links.test.tsx:162-184`](https://github.com/lingshf/ai-native-erp/blob/519fc226992fb1575474f3f671fc11f7232150e8/packages/web/test/trade-invoice-links.test.tsx#L162-L184)），每行断言“不存在”、无“加载中”、无“重试”、关闭后焦点回列表、`served.details()` 为空；P7（:186-204）断言合法但不存在的编号发一次请求、得 404、显示“不存在”、无“重试”。夹具编号 `uuid(n)` = `00000000-0000-4000-8000-<12 位>`（`test/support/trade-invoice-fixtures.ts:22`），本身是合法小写 UUIDv4。该文件 741 行，分片权重 1546（`scripts/test-shard-weights.json:94`）。
6. 检索：`git grep -ln "invoice=" -- packages scripts docs design` 在 `packages/` 下只有 `packages/infra/test/support/trade-gui-invoice-links.ts`（:250、:363 两处断言真实编号，见冲突域）；`git grep -n "notFound\|malformed\|0000-0000" -- packages/infra/test/support/trade-gui-invoice-links.ts` 无结果，e2e 没有非法形状用例。

## 设计决定（产品负责人）

1. 前端规则与服务端完全相同：小写 UUIDv4，同一正则文本（含 `u` 标志可选，不影响结果）。不在前端放宽成大小写不敏感：服务端不接受大写，前端放过只会多一次 400。
2. 不抽共享常量、不跨包引用服务端模块：web 不依赖 infra；两处各写一份，注释互指（前端注释改为指向 `packages/infra/src/http/trade-document-http.ts`，删去不成立的 `application/trade-documents.ts`）。
3. 非法形状的表现沿用现有“不存在”分支（:98-99、:127）：不新增文案、不新增状态。
4. 用户可见变化：手工构造的、旧规则放过而服务端拒绝的 `?invoice=`（四种）由“请求失败 + 重试”改为直接“不存在”、无重试、不发请求。合法编号、大写编号、404 编号的表现不变。

## 导航与历史

不适用：只改形状判定，不改地址读写、不改 `replaceState` 调用、不加或改监听器。

## 范围

- `TradeInvoiceDetail.tsx`：:30 改为服务端同一正则；:29 注释改为指向服务端文件并仍成立。
- `trade-invoice-links.test.tsx`：P6 表增加下列五行（名称与值照抄，便于逐行核对）：

| 名称 | 值 | base（旧正则） | head |
| --- | --- | --- | --- |
| `36 dashes` | `"-".repeat(36)` | 失败（发出详情请求，显示“重试”） | 通过 |
| `all zero` | `00000000-0000-0000-0000-000000000000` | 失败 | 通过 |
| `version not 4` | `00000000-0000-1000-8000-000000000001` | 失败 | 通过 |
| `variant not 8/9/a/b` | `00000000-0000-4000-c000-000000000001` | 失败 | 通过 |
| `upper case` | `0000000A-000B-4000-8000-00000000000C`（合法小写 `0000000a-000b-4000-8000-00000000000c` 转大写） | 通过（旧正则已拒绝，保留行为） | 通过 |

## 入口参数与异常

| 参数 | 情形 | 表现（提示文案键） | 恢复路径（可操作） |
| --- | --- | --- | --- |
| `company` | 不在已加载列表 / 无法解析 | 不变：不打开对话框（见筛选流程） | 不变 |
| `invoice` | 空 | 不变：不打开 | — |
| `invoice` | 不是小写 UUIDv4（含上表五种与 P6 原有五种） | `tinv.detail.notFound`，不发请求，无“重试” | “关闭”，焦点回列表，地址去掉 `invoice` |
| `invoice` | 合法但不存在 / 其他公司（`NOT_FOUND`） | 不变：`tinv.detail.notFound`，无“重试”（P7、P8） | 同上 |
| — | 其他失败 | 不变：`tinv.detail.error` + “重试” | 重试 |
| — | 只有一个账套 | “关闭”仍可用（P6 用例沿用默认单账套） | 同上 |

## 不在范围

服务端规则与 HTTP 契约；P7、P8 等其他用例；错误文案；地址读写；流程图与设计文档修改（合并后另做，见冲突域）；CHANGELOG。

## 验收标准

| 编号 | 验收 | 证据类型 | 平台 / 环境 | 来源 |
| --- | --- | --- | --- | --- |
| 1 | `TradeInvoiceDetail.tsx:30` 的正则文本与 `trade-document-http.ts:9` 相同（`u` 标志可有可无）；:29 注释指向服务端文件 | `git diff` + 人工核对 | 不涉及平台 | PR diff |
| 2 | `36 dashes`、`all zero`、`version not 4`、`variant not 8/9/a/b` 四行在 base 上失败、在 head 上通过（先红后绿） | 单元测试（jsdom） | Windows 本机或 Linux 均可；两侧同一平台、同一命令 | P6 新增四行（新增） |
| 3 | `upper case` 一行在 base 与 head 上都通过（两侧都绿），并照记 | 单元测试（jsdom） | 同上 | P6 新增一行（新增） |
| 4 | P6 原有五行、P7、P8 在 head 上仍通过，用例体不改 | 单元测试 | 同上 | `trade-invoice-links.test.tsx:162-221` |
| 5 | 服务端文件与其他测试文件零改动 | `git diff --stat` | 不涉及平台 | PR diff |
| 6 | PR 的 CI 检查在精确 head 上全绿 | CI | Linux CI（PR） | run 链接 |
| 7 | 真实浏览器中 4 种先红后绿形状与 1 个合法但不存在的编号表现符合“入口参数与异常” | QA 手工取证 | 真实 Chrome，1440 视口，中文，默认主题 | QA 记录（会话 files/） |

## 性能考虑

- 规模 / 热点：不适用，只是一次正则判定。
- 读写路径与索引：不适用，无数据访问。
- 查询次数：非法形状由 1 次详情请求变为 0 次；其余不变。
- 分页：不适用。
- 事务 / 锁 / 缓存边界：不适用。
- 前端开销：少一次请求；正则长度增加，可忽略。
- 预算与验证方式：不设新预算。`TradeInvoiceDetail` 所在 chunk 已在 base 上实测为发票页懒加载 chunk，不在首屏（见“试跑记录”第 3 条）；改动约几十字节，不跑 bundle-measure 预算对比。
- 首屏比对：不适用（不拆分、不改导入）。

## 可读性

- 热点文件：`trade-invoice-links.test.tsx` 741 行（`(Get-Content …).Count`，main `519fc22`），超过 800 行的热点阈值前还有余量；本任务净增 ≤ 6 行（P6 表五行）。`TradeInvoiceDetail.tsx` 359 行，净增 0（替换两行）。
- 结构要求：不新增函数或模块。
- 搬移类任务：不适用。
- 验收：PR 正文“可读性”一节按路线图 §5 填写。

## 设计阶段质量项

- **UI**：applicable。沿用现有“不存在”消息条（:121-136），不新增组件、文案或状态；成功反馈不变；QA 在真实 Chrome 1440、中文、默认主题下核对四种形状与一个 404（验收 7）；键盘与焦点沿用 P6 的“关闭后焦点回列表”断言；红绿主题与教学模式不受影响（不改样式与开关）。
- **功能边界**：applicable。前端只做形状预判，权威校验仍在服务端；两处规则同文、注释互指；失败边界不变（非 404 错误仍显示“重试”）。
- **性能计划**：not_applicable——只替换一个正则，少一次请求；不在 bundle-measure 预算覆盖的首屏路径上（chunk 归属已在 base 上实测，见“试跑记录”第 3 条）。
- **类型**：applicable。原生 TS，不新增类型。

## 证据要求

PR 正文证据计划（D595）：

| 验收 | 证据类型 | 命令或产物 | 取证位置 | 核对人 |
| --- | --- | --- | --- | --- |
| 1、5 | diff | `git diff --stat <base>..<head>` 原文 | 本机 | Reviewer |
| 2、3 base | 测试输出 | 在 base 上只加五行新用例：`npx vitest run --project web packages/web/test/trade-invoice-links.test.tsx`；四行失败（写明失败断言：试跑时首个失败的是 `tinv.detail.notFound` 文案找不到，见试跑记录第 1 条），`upper case` 通过 | 本机 | Reviewer、QA |
| 2、3、4 head | 测试输出 | 同一命令在 head 上：全部通过；附 vitest 汇总行与耗时原文 | 本机 | Reviewer、QA |
| 6 | CI | PR 检查在精确 head 上全绿，附 run 链接与 head SHA；失败 run 只作诊断，不作验收证据 | CI 成功 run | Reviewer |
| chunk 归属 | 构建产物 | 在 base 上 `npm run build` 后，在 `packages/web/dist/assets/*.js` 中查找 :30 的正则字面量，按上下文确认 :30 那一处只在发票页 chunk（`index` 中另有契约游标 schema 含相同片段，不是 :30），并在 `index-*.js` 中确认该 chunk 由 `import()` 动态加载；贴命令与输出（本仓库构建不生成 `dist/.vite/manifest.json`，见试跑记录） | 本机 | Reviewer |
| 7 | QA 记录 | 在精确 head 上手工打开四种形状、`upper case` 与一个合法但不存在的编号，记录网络面板与界面；浏览器时段按 D442 | QA 会话 files/；PR 评论 | Reviewer |
| 全量 | 测试输出 | `npx vitest run --project web` 汇总行原文；有失败按模板串行重跑 | 本机 | Reviewer |

- 满载耗时：只加 `it.each` 行，用例体沿用；附目标文件在默认超时下的 vitest 汇总行（base 与 head 两侧）；单个用例 > 2 s 写原因；不加大 `timeout`、不加重试。
- 不需要真实 Chrome 的验收项：1–6 用 jsdom 与 diff 即可判定（判定对象是是否发请求与渲染哪个分支，不涉及布局几何）；真实 Chrome 只用于 QA 验收 7。
- **可行性**（自查 11、15）：送审前在 base `519fc22` 上加五行并试跑，再试改 :30 后重跑，按行记录——见下方“试跑记录”。
- 合并后检查（D585）：合并前门槛是本节证据计划完整；合并后由 TL 在 PR 评论中记下覆盖合并提交的 main Full run 链接与结论，QA 在合并提交上复验一种非法形状（`all zero`）与一个 404（真实 Chrome）。KL 改流程图、Product/Design 改 `trade-design.md:51` 都钉该合并提交。
- 计划批准条件：开发者在 `plan.md` 开头复述“只改两个文件”“服务端不改”“P7 不改”“不加文案”。

### 试跑记录

设计阶段在 base `519fc226992fb1575474f3f671fc11f7232150e8` 上试跑（Windows，D442 时段结束后），试改未提交，跑完已 `git checkout` 还原。

1. **base + 五行新用例**：`npx vitest run --project web packages/web/test/trade-invoice-links.test.tsx`
   - 原始输出：`Tests  4 failed | 49 passed (53)`；`Duration  13.95s`。
   - 失败四行：`36 dashes`、`all zero`、`version not 4`、`variant not 8/9/a/b`；`upper case` 通过。
   - 失败断言：`test/trade-invoice-links.test.tsx:180:29`（加行后的行号，即现 :175 的 `getByText(d("tinv.detail.notFound"))`），`Unable to find an element with the text: 发票不存在或已不在本公司。`。也就是旧正则放行，页面进入读取分支，没有显示“不存在”。
2. **试改 :30 为服务端正则后重跑同一命令**：`Tests  53 passed (53)`；`Duration  12.99s`。
3. **chunk 归属**（base，`npm run build`）：
   - `dist/assets` 中含 `[0-9a-f-]{36}` 字面量的文件：`TradeInvoices-DaK1kCsM.js`（41083 B）和 `index-b1yzr542.js`。
   - `index` 中的那一处是契约里分页游标的 schema（`cursor:…regex(/^\d{4}-\d{2}-\d{2}\|[0-9a-f-]{36}$/u)`），不是 :30；源码中 :30 的正则只有一处（`packages/web/src/TradeInvoiceDetail.tsx:30`）。
   - `index` 以 ``import(`./TradeInvoices-DaK1kCsM.js`)`` 动态加载发票页 chunk。结论：`TradeInvoiceDetail` 在发票页懒加载 chunk，不在首屏入口。
   - 本仓库构建不生成 `dist/.vite/manifest.json`，所以改用产物检索；chunk 哈希每次构建会变，PR 正文按同法重取。
4. **`node scripts/slot/check-manifest.mjs`**：末行 `OK: every exit has a rule id, every id is in the table, every table id has an exit`。

## 设计自查

- [x] 1 事实断言有来源
- [x] 2 无进行中的相关 PR（`gh pr list --search "TradeInvoiceDetail"` 结果见 PR 正文）
- [x] 3 依赖与 S28 泳道 B1 一致
- [x] 4 不新增 CSS
- [x] 5 转述带原限定语
- [x] 6 无共享单文件
- [x] 7 入口参数已列
- [x] 8 旧口径在原处（`trade-design.md:51`、流程图 :35）的修改时点已写明
- [x] 9 导航与历史：不适用，已说明
- [x] 10 无几何类验收
- [x] 11 base 与试改 head 各跑一次（见试跑记录）
- [x] 12 e2e 断言已检索
- [x] 13 热点文件与净增已写
- [x] 14 命令已在当前 main 实跑（见试跑记录）
- [x] 15 `node scripts/slot/check-manifest.mjs` 输出见 PR 正文
- [x] 16 满载耗时要求已写；不涉及 Web 字节预算
- [x] 17 chunk 归属在 base 上核对（见试跑记录）
- [x] 18 设计阶段质量项已填
- [x] 19 每条验收写了证据类型与平台；受影响文档写了同步时点
- [x] 20 合并后检查已列场景与环境
- [x] 21 PR 正文附“断言 → 来源”
- [x] 22 不涉及钉版本
- [x] 23 证据计划逐条写明
- [x] 24 跨文件验收按文件列（见 S28.md 跨文件表 BUG-05 行）
