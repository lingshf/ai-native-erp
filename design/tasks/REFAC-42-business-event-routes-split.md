# REFAC-42：拆分业务事件路由 `registerBusinessRoutes`（不改行为）

- Sprint：S32（[计划](S32.md)）
- 类型：重构（基础设施 HTTP；业务事件、服务 / 往来单位、记账规则与转入队列的 12 条路由）
- 优先级：P2
- 决定：[D628](S32.md#s32-期间决定)。REFAC-42 不改行为：导出名与签名、12 条路由的方法、路径与**注册顺序**、每个请求的检查先后（403 → 405 → 503 → 400 → 415 → schema）、调用服务的方法与实参、响应的状态码、响应头与响应体都不变；只搬移与传参。详见“范围与决定”1–9。
- 建议分支：`refac-42-split-business-event-routes`
- 来源：[S32 范围与验收](S32.md#范围与验收)第 2 行、[REFAC-42 路由 × 方法可达矩阵](S32.md#refac-42-路由--方法可达矩阵)、[三项 REFAC 共用：可读性与嵌套复验](S32.md#三项-refac-共用可读性与嵌套复验)、[回顾行动落地](S32.md#回顾行动落地)；本任务书不放宽。
- 模板：[REFAC-39](REFAC-39-trade-reporting-repository-split.md)（infra、调用序列 R4、不跑 Bench、无 R7）；R4 改为 Fastify `inject` 两侧对照。
- 迁移：**不加**。
- 浏览器时段：**不需要申请**。等价由 R3（非浏览器部分）与 R4 在 node 中证明；`business-events-gui.slow.test.ts` 属 `infra-browser` 项目（`vitest.config.ts:12`、`:142-144`），由 R8b 的 main Full 覆盖。开发若要在本机跑它，须另行申请 D442 时段。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 为什么是它

- 按 [S30 统一量法](S30.md#s30-统一量法)（D615），`registerBusinessRoutes` **120** 行，是 infra HTTP 层尚未拆分的最长函数（[S32 选题依据](S32.md#选题依据可复现)，D626）。
- 函数内是 12 条互不引用的路由注册，按业务分组（主数据与记账规则、业务事件、转入队列）抽出即可降长；共用的只有 `ready` 与模块级 `parse`。
- 拆分最容易悄悄改掉的是**注册顺序**与**检查先后**（例如把 `ready` 挪到 `boundary.assert` 前，403 会变成 503），所以 R4 按路由 × 方法逐格比到响应字节。

## 现状（main `218284a`）

下文 `file:line` 都按 `218284a372d4b84a2597665da863d1cd9120cc88`（S32 计划 [#480](https://github.com/lingshf/ai-native-erp/pull/480) 合并提交）；`packages/` 与 `34da911` 相同（`git diff --stat 34da911 218284a -- packages` 无输出），所以 S32 矩阵的行号仍然成立。

- `packages/infra/src/http/business-events.ts` 共 **153** 行，最后一次改动为 `a401d6f`（[#25](https://github.com/lingshf/ai-native-erp/pull/25)）。
- **导入**（`:1-28`）：`businessError` 从 `@erp/core/domain`；类型 `ApplicationServices` 从 `@erp/core/application`；20 个 schema 与类型 `ContractSchema` 从 `@erp/core/contracts`；类型 `FastifyInstance`、`FastifyRequest` 从 `fastify`；类型 `LocalFinanceBoundary` 从 `./legacy.ts`；`httpError` 从 `./errors.ts`。
- **模块私有**：`parse(schema, value)`（`:29-33`），`safeParse` 失败时 `businessError("form", "shape")`，即 `DomainError("INVALID_INPUT", { scope: "business", path: "form", rule: "shape" })`（`core/src/domain/business-events.ts:35-37`）。
- **导出**只有 `registerBusinessRoutes(server, service, boundary)`（`:34-153`，`.length` 为 3，无返回类型注解）。
- **内层 `ready`**（`:39-52`）：`service` 未注入 → `httpError(503)`（`:40`）；非 GET 时，查询串为 `null`、非对象或有键 → `httpError(400)`（`:42-47`），`content-type` 主类型不是 `application/json` → `httpError(415)`（`:48-49`）；返回 `service`。
- **注册顺序**（12 条，`server.all`）：`:57` 循环 services、parties → `:70` posting-rules → `:82` events → `:90` events/preview → `:96` events/confirm → `:102` events/open-items → `:113` events/:id → `:119` transfer-queue → `:130-131` 循环 transfer-queue/:id/{preview, confirm, withdraw}。每个处理函数的第一句都是 `boundary.assert`（允许方法见 S32 矩阵），第二步是 `ready`（`events/confirm` 为 `ready(request).confirm(parse(…))`，`:98-100`，同样先 `ready` 后 `parse`）。
- **调用服务的方法**：`masters`、`saveMaster`、`rules`、`saveRule`、`list`、`preview`、`confirm`、`openItems`、`detail`、`queue`、`enqueue`、`transferPreview`、`transfer`、`withdraw`（与 `ApplicationServices["events"]` 的 `Pick` 相同，`core/src/application/use-cases.ts:51-67`）。列表类调用的分页实参写法为 `{ limit: Number(limit), ...(cursor ? { cursor } : {}) }`（5 个源码位置：`:63`、`:76`、`:87`、`:107-110`、`:125`；`:63` 在循环内，服务 6 条列表路由）。每个成功返回值都经对应输出 schema 的 `.parse`。
- **上游错误与响应**：`boundary.assert`（`http/legacy.ts:32-49`）先查来源（403，`:44`），再设 `Allow` 头并抛 405（`:47-48`）；错误响应由 `sendHttpError`（`http/errors.ts`）生成，响应体含 `requestId`，取自 `genReqId: () => randomUUID()`（`http/index.ts:86`；`errors.ts:92` 兜底再调一次 `randomUUID`）。
- **使用方**：只有 `http/index.ts:13` 导入、`:137` 调用（`index.ts` 不改）。`docs/code-entry.md:28` 只写文件路径（见 [S32 跨文件验收](S32.md#跨文件验收d595按文件列验收句)），所以文件路径与导出都不变。
- **测试**：`packages/infra/test/http/business-events.test.ts`（201 行，`infra` 项目；`:84`、`:103`、`:141`、`:163` 用 `randomUUID`）；`packages/infra/test/http/business-events-gui.slow.test.ts` 与 `test/support/business-events-gui.ts`（`infra-browser` 项目，Playwright）。
- **Fastify** 版本 5.12.8。
- **新文件名**：`git ls-files packages/infra/src/http | grep business-event-` 在 `218284a` 上无输出。

## 范围与决定

1. **只拆不改**：路径、允许方法、`ready` 与 `parse` 的条件、输入 / 输出 schema 的选择、服务方法与实参写法都不变（唯一例外：分页实参可按决定 5 的唯一形状抽取）；不修缺陷。发现疑似缺陷时在 PR 正文记录并报协调者，另开 Backlog。
2. **注册顺序不变，循环不展开**：12 条路由的注册先后与“现状”相同（R4 直接断言 1）。两处循环（`:53-69` services / parties，`:130-152` 队列动作）**保持为循环**，数组字面量与循环体整体搬进分组注册函数，不展开为逐条 `server.all`；这样源码中 `server.all` 仍为 9 处，R5a、R5c 可按原文与多重集比较。
3. **检查先后不变**：每个处理函数内 `boundary.assert` → `ready` → `parse` → 服务调用 → 输出 `.parse` 的顺序不变；`ready` 内 503 → 400 → 415 的顺序不变。
4. **签名不变**：`registerBusinessRoutes` 的参数名、顺序与类型不变（`.length` 3），不加返回类型注解；`http/index.ts` 无 diff。
5. **分页实参只允许一种抽取**：分页实参表达式 `{ limit: Number(limit), ...(cursor ? { cursor } : {}) }`（5 个源码位置）可以不抽；若抽，只能抽成**一个**模块级函数，形如 `function pageOptions(limit: string, cursor: string | undefined) { return { limit: Number(limit), ...(cursor ? { cursor } : {}) }; }`（名称可换，参数须为 `(limit, cursor)` 且顺序不变，函数体只有这一条 `return`，表达式逐字相同），5 处调用点都写作 `pageOptions(limit, cursor)`，实参原文就是 `limit`、`cursor`。除此之外不抽取处理函数体内的任何表达式。
6. **传参代替闭包**：`ready` 可改为模块级函数，以参数接收 `service`（例如 `readyService(service, request)`），或由工厂返回闭包；两者都须保持 `ready` 函数体逐字（只改自由变量名，R5a 列出）。
7. **建议拆法**（不强制）：主数据与记账规则 3 条 → `business-event-master-routes.ts`；业务事件 5 条 → `business-event-routes.ts`；转入队列 4 条 → `business-event-queue-routes.ts`；`parse` 与 `ready` → `business-event-guards.ts`。`registerBusinessRoutes` 只按原顺序依次调用三个分组注册函数。
8. **文件与依赖**：新文件为同目录 `business-event-*.ts`；新文件不从 `./business-events.ts` 导入运行时值；新文件之间单向无环（R5d）。`http/index.ts` 不导入新文件。
9. **不改的路径**：`packages/infra/src/http/index.ts`、`legacy.ts`、`errors.ts`，`packages/infra/src/**` 其余文件，`packages/infra/test/**`、`packages/core/**`、`packages/web/**`、`docs/**`。

## 冲突域

写入域：`packages/infra/src/http/business-events.ts` 与同目录新增 `business-event-*.ts`（`218284a` 上不存在；`application/business-event-*.ts` 与 `storage/business-event-store.ts` 不在本域）。与 REFAC-41（web）、REFAC-43（core）无文件交集，可并行（[S32 泳道](S32.md#泳道按冲突域)）。

## 验收

### base 失败、head 通过

量法用 [S30 统一量法](S30.md#s30-统一量法)（D615，命令见“可读性”）；base 为最终送审 head 的实际合并基（当前 `218284a`）。

| 编号 | 检查 | base `218284a` | head 要求 |
| --- | --- | --- | --- |
| R6a | 函数长度（不计空行与纯注释行，外层含内层） | `registerBusinessRoutes` **120**（失败） | `business-events.ts` 与新文件中每个函数 ≤ 80 |
| R6b | 嵌套深度 | 最深为 `registerBusinessRoutes` 3、`ready` 2（已满足） | 每个函数 ≤ 3（保持） |
| R6c | 文件行数（`(Get-Content <file>).Count`） | `business-events.ts` **153** | `business-events.ts` ≤ **100**；新文件各 ≤ **150** |

上表 head 要求都是**硬上限**。`business-events.ts` ≤ 100 由设计角色按决定 7 估定（只保留导入、导出函数与三次分组调用时约 20–40 行；若 `ready` / `parse` 留在本文件，约 60 行），未经试拆实测。实测超出即停下，报设计角色与协调者；不得自行放宽，也不得为凑数字机械拆分。是否调整由 TL 决定，并记入 PR。

### 两侧都须成立的不变量

- **R1 范围**：`git diff --name-only <base>...<head>` 只含 `packages/infra/src/http/business-events.ts` 与同目录新增的 `business-event-*.ts`；决定 9 所列路径 diff 为空。不加迁移。
- **R2 导出不变**：用 `@babel/parser`（插件 `typescript`）解析，`business-events.ts` 的导出名集合两侧都为 `["registerBusinessRoutes"]`，签名源文本相同（只归一空白）；`http/index.ts` 无 diff。新文件的导出只在 `business-events.ts` 与新文件之间使用，PR 正文附 `git grep` 结果。`npm run typecheck`、`npm run check`、`npm run check:boundaries` 通过。
- **R3 既有测试原样通过**：`npx vitest run --project infra` 全部通过（不含 `infra-browser`）；测试文件 diff 为空。PR 正文附汇总行原文，base 与 head 各一次。`business-events-gui.slow.test.ts` 由 R8b 覆盖。
- **R4 路由、检查先后与响应等价**（送审证据；驱动不提交，不加常驻 CI 用例）：
  - **驱动**：临时 vitest 文件（例如 `packages/infra/test/http/zz-r42-probe.test.ts`，送审前删除），在 base 与 head 上运行，分两部分：
    - **注册序列**：新建 `Fastify({ logger: false, exposeHeadRoutes: false })`，先 `addHook("onRoute", …)` 记录每次注册的 `method` 与 `url`，再直接调用 `registerBusinessRoutes(app, 桩服务, new LocalFinanceBoundary(undefined))`。
    - **HTTP 矩阵**：用 `createApi({ environment: { ERP_PORT: "0" }, allowPortZero: true, events: 桩服务, logError: 记录桩 })`，`listen()` 后用 `app.inject` 发请求（同 `business-events.test.ts:38-47` 的写法：`createApi` `:38-44`、`listen` `:45`、`inject` `:46-47`）；503 用例另建一个不传 `events` 的 `createApi`。
  - **桩服务**：普通新对象，为“现状”所列 14 个方法逐个写转发（不用 `Proxy`）；每次调用记 `{ seq, method, args }`（参数确定性编码，键排序；`cursor` 缺省与存在要区分）。每个方法按用例返回固定的合法 DTO（须能通过对应输出 schema）、固定的不合法对象（用于输出 schema 失败）、或抛 `new DomainError("CONFLICT")`。
  - **记录**：每个请求的序号、方法、路径（`pathname + search`，**不含主机与端口**）、除 `host` 外的请求头与请求体原文（`inject` 的 URL 带主机与端口，同 `business-events.test.ts:45-47`）；响应的状态码、全部响应头（名称小写排序，值原文）、响应体原始字节；`logError` 记录；桩服务调用日志。带 REFAC-17 自测（a）–（c）。同一驱动连续两次运行输出逐字节相同。
  - **夹具确定性**（[S31 回顾行动 1](../reviews/S31-retro.md#行动项汇总)，[S32 回顾行动落地](S32.md#回顾行动落地)）：
    1. 夹具（请求、桩服务的返回 DTO、`id`、`fingerprint`、日期）一律写固定值，不得出现 `randomUUID`、`Math.random`、`Date.now`、`new Date(` 或读取当前时间的写法；`git grep -n -e randomUUID -e "Math.random" -e "Date.now" -e "new Date(" -- <驱动文件>` 须无输出，原文附 PR。
    2. **产品代码中的随机值**：错误响应体含 `requestId`（`http/index.ts:86`、`errors.ts:92` 调 `randomUUID`）。驱动用 `vi.mock("node:crypto", …)` 把 `randomUUID` 换成从 1 起的计数器（格式仍为 UUID，例如 `00000000-0000-4000-8000-000000000001`），其余导出保持原实现；不得在记录中删去或改写 `requestId`。
    3. **端口**：`listen()` 的端口由系统分配，是驱动中唯一不固定的值。记录中不含主机与端口；驱动自检“输出中不出现 `:<端口>` 字样”，自检结果附 PR。若某个响应头或响应体含端口、时间或其他随机值，停下上报，不得在记录中遮掉。
    4. **借用 helper**：不借用 `infra/test/support/` 的数据构造 helper；如必须借用，PR 正文逐个列出其随机默认值并在调用处覆盖（已知例子：`infra/test/support/trade-ledger.ts:185`、`:188`、`:336`、`:348`、`:360` 用 `randomUUID`；`business-events.test.ts:84`、`:103`、`:141`、`:163` 同样，不得照抄）。
    5. 送审时固定夹具构建步骤与夹具 SHA-256（把全部请求与桩返回值按用例顺序做确定性 JSON 编码后取哈希）；附“在两个新目录中独立重建两次，夹具哈希相同”的原始输出。
    6. 不满足 1–5 就不送审。约束之间冲突时停下上报，不得在证据中遮掉。
  - **用例**（按 [S32 矩阵](S32.md#refac-42-路由--方法可达矩阵)逐格，行号以开发时的实际合并基重新核对）：
    - **表 A，16 个“路由 + 允许方法”组合**，每格标“可达”的列各一例：403（`origin` 头为外来来源）、503（不注入 `events`）、400（POST 带 `?x=1`）、415（POST，`content-type: text/plain`）、schema 失败、成功；另加每个组合各一例“服务抛 `CONFLICT`”与“服务返回不合法对象”（输出 schema 失败）。N/A 格（7 个 GET 组合的 400 / 415）不构造，PR 正文照表标 N/A。
    - **表 B，12 条路由各 1 个 `DELETE`**：断言 405、`Allow` 头原文与响应体。
    - **先后用例**（每个组合各一组，逐级只修正一项）：外来来源且方法为 `DELETE` → 403；本地来源、`DELETE`、不注入 `events` → 405；允许方法、不注入 `events`、带查询串、`text/plain`、坏请求体 → 503；注入 `events` 后同一请求 → POST 组合为 400，GET 组合为 schema 失败；去掉查询串 → POST 为 415；改为 `application/json` → POST 为 schema 失败。
    - **分页实参**：6 个列表 GET 组合各两例，`cursor` 缺省与存在。
    - **路径参数**：`events/:id` 与三个 `transfer-queue/:id/*` 的 `id` 用固定值 `E-1`、`Q-1`，核对桩调用的实参。
  - **判定**：两侧注册序列、每个请求记录、桩调用日志与 `logError` 记录逐字节相同（附两侧输出 SHA-256）；并且**直接断言**：
    1. **注册序列**：`url` 依次为 `/api/v1/services`、`/api/v1/parties`、`/api/v1/posting-rules`、`/api/v1/events`、`/api/v1/events/preview`、`/api/v1/events/confirm`、`/api/v1/events/open-items`、`/api/v1/events/:id`、`/api/v1/transfer-queue`、`/api/v1/transfer-queue/:id/preview`、`/api/v1/transfer-queue/:id/confirm`、`/api/v1/transfer-queue/:id/withdraw`，共 12 条（`method` 按 Fastify 记录原样比两侧）；
    2. **405**：表 B 每例状态 405，`allow` 头等于表 B 所列，响应体 `code` 为 `METHOD_NOT_ALLOWED`，桩调用日志无新增；
    3. **503 / 400 / 415**：`code` 依次为 `UNAVAILABLE`（`retryable` 为 `true`）、`INVALID_REQUEST`、`UNSUPPORTED_MEDIA_TYPE`，`fieldErrors` 为 `[]`，桩调用日志无新增；
    4. **schema 失败**：状态 400，`fieldErrors` 为 `[{ path: "form", messageKey: "api.error.business.shape" }]`，桩调用日志无新增；
    5. **先后用例**：每级状态码等于上文所列；
    6. **分页实参**：`GET /api/v1/services?company=DEFAULT&limit=10` 使桩记录 `masters("DEFAULT", "service", { limit: 10 })`，结果对象中没有 `cursor` 键；带 `&cursor=C1` 时为 `{ limit: 10, cursor: "C1" }`；
    7. **静态路径优先**：`GET /api/v1/events/preview` 命中 `events/preview`（不是 `events/:id`），状态 405，`allow` 为 `POST`。
    断言 1–7 由设计角色从源码与 S32 矩阵推出，**未用驱动在 base 上实测**；base 上任一直接断言不成立，先停下报协调者，不得改断言迁就，也不得改产品代码。
  - **PR 正文附**：驱动全文与用例清单（按表 A、表 B、先后、分页、路径参数分组，标明对应矩阵格）；两侧输出的 SHA-256 与比较结果；直接断言 1、2、5 的输出原文。
  - **驱动原件**：PR 正文贴原文件字节的 base64，或同时给原始字节与“UTF-8 解码、换行归一为 LF”两种 SHA-256。
- **R5 结构规则**（静态）：
  - **R5a 原文搬移**：比较对象是 base 源码中的 9 个处理函数（9 处 `server.all`，其中 2 个在循环内，共注册 12 条路由）、两处循环的数组字面量（`:53-56`、`:130`）、`ready` 函数体（`:40-51`）与 `parse` 函数体（`:30-32`）。比较前对两侧做且只做以下规范化，然后逐字比较：
    1. 去掉每行行首空白，删除空行（缩进与换行位置变化不计）；
    2. 若按决定 5 抽了分页实参：先核对该函数满足决定 5 的形状，再把 head 中的 `<函数名>(limit, cursor)` 调用点按源码出现顺序与 base 的 5 个位置一一对应（`masters` → `:63`，`rules` → `:76`，`list` → `:87`，`openItems` → `:107-110`，`queue` → `:125`；所在服务调用不符即失败），每处回替为**该位置的 base 精确原文**，不用通用字符串，然后再做规则 1：
       - `:63`、`:76`、`:87`、`:125`：单行 `{ limit: Number(limit), ...(cursor ? { cursor } : {}) }`；
       - `:107-110`：多行原文，即 `{` 换行 `limit: Number(limit),` 换行 `...(cursor ? { cursor } : {}),` 换行 `}`（`:109` 行末带尾逗号；`:110` 的 `}),` 中只有 `}` 属于对象，`),` 属于外层调用）。
       回替次数须恰为 5，否则失败。外层调用（例如 `await app.openItems(company, account, date, …),`）的写法与换行位置不得因抽取而改变，否则规则 1 后仍不同，按失败处理；
    3. 若按决定 6 改了 `ready` 的取得方式：只允许把 `ready(request)` 换成决定 6 所选的调用形式，逐处列表（base 9 处中的 9 处）；`ready` 函数体内只允许自由变量 `service` 改名，逐处列表。
    规范化后仍不同即失败；PR 正文贴出规范化脚本全文与两侧规范化后的文本。循环按决定 2 不展开，所以没有“展开后比较”的情形；若出现展开，R5a 直接失败。
  - **R5b 无模块级可变状态**：`business-events.ts` 与新文件的模块顶层只有 `import` / `export`、类型、函数声明与不可变 `const`（不在加载时调用导入的函数）；附 Babel AST 检查输出。
  - **R5c 调用点不变**：`boundary.assert(` 实参原文多重集（base 9 处：`:58`、`:71`、`:83`、`:91`、`:97`、`:103`、`:114`、`:120`、`:134`）、`httpError(` 实参多重集（base 3 处：`:40`、`:47`、`:49`）、`parse(` 调用多重集与 `server.all` 第一个实参原文多重集（base 9 处，含 `:57`、`:132` 两个模板字面量）两侧相同；Babel AST 抽取，附两侧列表。若按决定 5 抽了分页实参，另附该函数的调用点多重集（恰为 5 处 `(limit, cursor)`）。
  - **R5d 依赖方向**：新文件不从 `./business-events.ts` 导入运行时值；新文件之间单向无环；`http/index.ts` 无 diff；附导入图。
- **R6 尺寸**：见上表；PR 正文列出超过 60 行的函数，附行数与最深层数（base 与 head 两列）。
- **R7 打包字节**：不适用。infra 不被 web 导入，不进任何 web chunk，不跑 `bundle-measure.mjs`。编号保留。
- **R8 质量门**：R8a 合并前 `npm run typecheck`、`npm run check`、`npm run check:boundaries`、CI-02 预检通过，PR CI 绿；R8b 合并后第一次覆盖该合并提交的 main Full（含 `infra-browser` 的 `business-events-gui.slow.test.ts`）须绿，失败报协调者，按 D456 暂停后续合并。
- **R9 可读性一节**：PR 正文按下文“可读性”逐项给出改前 / 改后数据。

### 测试命令

```powershell
npx vitest run --project infra packages/infra/test/http/business-events.test.ts
npx vitest run --project infra
npm run typecheck; npm run check; npm run check:boundaries
```

## 性能考虑

- 路由数、注册顺序与每个请求的检查次数不变（R4、R5c）；分组注册只在启动时多几次函数调用，不在请求路径上。
- 不跑 Bench：请求路径上的语句原样搬移（可选的分页实参函数只把同一对象字面量移入一次函数调用），没有新增查询。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥ 与 [S32 共用要求](S32.md#三项-refac-共用可读性与嵌套复验)。PR 正文“可读性”一节按下表逐项给出**改前 / 改后**数据。

| 维度 | 要求 | 改前（`218284a`，设计角色实测） | PR 正文改后须列 |
| --- | --- | --- | --- |
| 函数长度（②） | `business-events.ts` 与新文件每个函数 ≤ 80 | `registerBusinessRoutes` 120、`ready` 14、`parse` 5 | 量法对 `business-events.ts` 与全部新文件的**完整输出**；超过 60 行的逐个列行数 |
| 嵌套深度（②） | 每个函数 ≤ 3 | `registerBusinessRoutes` 3、`ready` 2、`parse` 1 | 同一输出第 2 列；超过 2 层的逐个说明 |
| 文件长度（③） | `business-events.ts` ≤ 100；新文件各 ≤ 150 | `business-events.ts` 153；`http/business-event-*.ts` 不存在 | `git diff --numstat <base> <head>` 与拆后行数 |
| 重复（④） | 第三次出现即抽取 | 分页实参 `{ limit: Number(limit), ...(cursor ? { cursor } : {}) }` 5 个源码位置（`:63`、`:76`、`:87`、`:107-110`、`:125`）；`boundary.assert` 开头 9 处（`ready` 紧随其后 8 处，`events/confirm` 内联在 `:99`）；`businessResultSchema.parse(` 5 处（`:98`、`:117`、`:128`、`:142`、`:147`） | 分页实参可按决定 5 的唯一形状抽取（或不抽，PR 正文写明理由），R5a 按规范化规则 2 比较，返回对象的键与键序须不变（R4 直接断言 6）；`assert` / `ready` 开头与输出 `.parse` 是逐路由的检查先后，保留原位以便 R5a 逐字比较，PR 正文写明“不抽取的理由：检查先后须在每条路由内可见”；每处去向 |
| 命名（①） | 新函数、新文件名表达业务含义；不用 `step1`、`part2`、`helper`、`utils` | — | 新增名称清单，每个一句职责；附 `git diff --name-only <base>...<head> \| grep -i -E "step[0-9]\|part[0-9]\|helper\|util"` 输出（预期为空） |

### 量法

用 [S30 统一量法](S30.md#s30-统一量法) 的 `s30-measure.cjs`，脚本原文以 S30.md 该节为准，本任务书不另附。在仓库根目录运行：

```powershell
node <保存位置>\s30-measure.cjs 218284a packages/infra/src/http/business-events.ts
node <保存位置>\s30-measure.cjs <head> packages/infra/src/http/business-events.ts @(git diff --name-only --diff-filter=A <base> <head> -- packages/infra/src/http)
```

base 完整输出（`行数 / 层数 / 范围 / 名称`）：

```text
5    1  :29-33   parse
120  3  :34-153  registerBusinessRoutes
14   2  :39-52   ready
```

开发在 base 上重跑的输出与上表不符时，先停下报告。

### 其余各条

- **②**：拆后 `registerBusinessRoutes` 只做“按原顺序调用分组注册”；每个分组注册函数只注册一组业务的路由。
- **⑤**：`503`、`400`、`415` 原样保留，不新增未命名数字。
- **⑥**：不新增注释，除非拆分需要说明“为什么”（例如分组调用的先后即注册顺序）。不留调试输出。
- **测试耗时**：PR 正文附 `business-events.test.ts` 在 base 与 head 上的耗时（vitest 汇总行原文）；两侧差异 > 20% 时说明原因。

## 用户可见变化

- 无。业务事件页、服务 / 往来单位与记账规则维护、转入队列的请求与响应都不变（R3、R4）。

## 证据要求

- **原始输出固定**（S30 回顾行动 1）：摘要、哈希与驱动不算原始证据。R2、R3 汇总行、R4 两侧输出、夹具两次重建输出、R5 抽取输出与 R6 量法输出的原文，须固定到带修订号的链接（例如 gist 的某个 revision），PR 正文给出链接与该文件的 SHA-256。
- **分支清单**（S30 回顾行动 2）：PR 正文附 base 上的抛错、提前返回与分支清单及枚举命令 `git grep -n -e "throw" -e "return" -e "if (" -e "boundary.assert" 218284a -- packages/infra/src/http/business-events.ts`，并把 R4 用例逐一对到分支：`parse` 失败（`:31`，直接断言 4）；`ready` 的 503（`:40`，断言 3）、400（`:42-47`，断言 3）、415（`:48-49`，断言 3）；各处理函数的 `request.method === "GET"` 分支（`:60`、`:73`、`:122`）与 `action` 分支（`:136`、`:140`）；405（`legacy.ts:47-48`，断言 2）；403（`legacy.ts:44`）。`ready` 中 `request.query === null` 与 `typeof request.query !== "object"` 两个条件在 Fastify 中无法由合法 HTTP 请求触发（查询串总被解析为对象），写明原因并报协调者，不得静默删去。
- **夹具确定性**（S31 回顾行动 1）：PR 正文附 R4“夹具确定性”1–5 的命令与输出原文；Reviewer 与 QA 各自独立重建一次，哈希须与 PR 正文相同。
- **QA 留证**（S30 回顾行动 3）：QA 在 base、head 两侧实跑 R3 与 R4，并独立重建夹具后，在本开发 PR 下发评论（PASS / FAIL、所跑命令、用例数、夹具哈希、对比结果）；时点为评审批准后、合并前；未发不合并。
- **可行性**：设计角色在 `218284a` 上实测了 R6 的 base 数字；R4 直接断言**未实测**，开发先在 base 上跑，不成立时先停下报告。

## 合并后项

- QA 结论（PR 评论链接），见 [S32 执行状态](S32.md#执行状态)。
- Product/Design 在合并提交上用 S30 统一量法复测 `business-events.ts` 与 `http/business-event-*.ts`，确认 main Full（含 `infra-browser`）结果，结论以评论发在开发 PR。

## 设计自查

- [x] 冲突域与 REFAC-41、REFAC-43 逐文件不相交；不改 `http/index.ts`、`legacy.ts`、`errors.ts`、测试文件与 `docs/`。
- [x] R6a 有 base 实测值（base 失败）；R6b base 已满足，要求保持；`business-events.ts` ≤ 100 为估定硬上限，未试拆，超出即停下由 TL 决定。
- [x] 循环不展开（决定 2）；分页实参只允许决定 5 的一种抽取，R5a 规范化规则与之对应，R5c 多重集仍按 base 9 处 `server.all` 比较；决定、R5 与可读性一节互不冲突。
- [x] 用例按 S32 矩阵逐格（表 A 16 个组合、表 B 12 个 405），N/A 格不构造；检查先后、注册顺序、分页实参与静态路径优先都有直接断言，均注明未实测。
- [x] R4 一节写明 S31 回顾行动 1（无随机值与当前时间、`requestId` 用计数器替换、端口不入记录并自检、helper 默认值、夹具 SHA-256、两次独立重建、不满足不送审、冲突停下上报）。
- [x] 可读性五项都有要求、改前数据（S30 统一量法完整输出）与改后须列；无用户可见变化。
- [x] 不加迁移，不碰 `scripts/slot/`、`scripts/measure/`。
