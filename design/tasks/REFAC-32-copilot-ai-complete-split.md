# REFAC-32：拆分 AI 适配器 `CopilotAiAdapter.complete`（不改行为）

- Sprint：S24（[计划草案](S24.md)）
- 类型：重构（infra AI 适配器）
- 优先级：P2
- 决定：[D552](S24.md#s24-期间决定)。只改代码组织，不改结果、失败原因及其先后、运行时调用序列与清理行为，详见“范围与决定”1–7。
- 建议分支：`refac-32-split-copilot-ai-complete`
- 来源：[S24 候选](S24.md#候选s24-其余泳道s23-评审后定)“按 ② 拆 core / infra”。本任务书在设计空闲时提前写好，有开发名额时再派发。REFAC-29（`PeriodClose.tsx` 与 `period-close/`）占了本批唯一的页面拆分名额，本项不是页面拆分。
- 模板：结构规则沿用 [REFAC-31](REFAC-31-business-event-compute-split.md)（编排函数 ≤ 50 行、原文搬移、错误调用点多重集、依赖方向）；R4 的“记录调用序列 + 逐字节比较 + 直接断言”方法沿用 [REFAC-17 R4](REFAC-17-prepare-trade-action-split.md#两侧都须成立的不变量)，被记录的对象从仓储换成注入的假运行时。
- 迁移：**不加**。
- 浏览器时段：**不需要**，理由见“证据要求”。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件；R4 只用假运行时，**不启动真实 Copilot CLI、不联网**。

## 为什么是它

- 设计角色在 `502c547` 上用 `node files/fnlen.cjs packages/web/src packages/core/src packages/infra/src` 实测。排除 legacy、页面与在途冲突域后，最长的非页面函数依次是：
  - `targetStorage`（218）：SQL 存储初始化；
  - `masterDataRepository`（182）：SQL 仓储；
  - **`complete`（181）**：AI 适配器；
  - `registerTradeDocumentRoutes`（181）：HTTP 路由表；
  - `inspectSchema`（175）：迁移的模式检查。
- 为什么不选其他四个：
  - `targetStorage` 是写队列、读快照、超时与嵌套工作单元的并发闭包，拆开要把共享状态改成参数，评审面大；
  - `masterDataRepository` 汇总全部仓储，改动面大；
  - `inspectSchema` 须另核 SQL 文本；
  - `registerTradeDocumentRoutes` 是一张路由表，拆分收益在“分组”而不在逻辑。
- `complete` 一个函数里有四个阶段：前置守卫、临时目录与客户端、会话（26 项隔离配置、事件监控、模型复核、回答检查）、终止与清理。它还嵌套定义了 `checked`、`run`、`verifyModel`、`bounded` 四个闭包，`finally` 中 `try` / `catch` 最深五层。读者要在 181 行里同时追踪 `interrupted`、`rejectRun`、`failure`、`cleanupFailed`、`terminated` 五个可变量。按阶段拆开后，“会话怎样隔离”“哪些事件判为越权”“清理失败怎样禁用 AI”各在一处可读，可读性收益最大。
- 取证成本低：构造器已有 `clientFactory` 注入点，现有测试就用假运行时，R4 不需要真实模型或网络。
- 不进打包产物：`packages/web/src` 不导入 `packages/infra`（`git grep` 计数 0）。`main.ts` 用动态 `import("./copilot-ai.ts")` 加载它，只有配置了 AI 时才加载 `@github/copilot-sdk`。

## 现状（main `502c547`）

下文 `file:line` 都按 `502c5478c64e6a75b2fa42edc7bbe41075641425`。

- `packages/infra/src/copilot-ai.ts` 共 **225** 行：
  - 导出类型 `CopilotTextSession`（`:7`）、`CopilotTextRuntime`（`:20`）；
  - 模块私有常量 `instruction`（`:28–30`，系统提示原文）；
  - 导出类 `CopilotAiAdapter`（`:32`），私有字段 `busy`、`blocked`、`options`；
  - `complete(input, signal): Promise<string>`（`:44–224`）。
- 唯一的生产调用点是 `packages/infra/src/main.ts:62` 的动态导入，只传 `model`、`provider`。`clientFactory` 与 `cleanupTimeoutMs` 只供测试注入。
- fnlen 实测（口径同 S16–S24，只报 > 80 行）：

  ```text
  181	packages/infra/src/copilot-ai.ts:44-224	complete
  ```

  内层 `run`（`:91–164`）不足 80 行，没有单独列出。
- **`complete` 的顺序**（R4 专门覆盖）：
  1. **守卫**（`:45–55`）：
     - 先查 `model`（`trim` 后为空、为 `"auto"`，或 `provider` 不是 `"copilot"`）→ `unavailable`；
     - 再依次查 `signal.aborted` → `cancelled`、`blocked` → `cleanup`、`busy` → `busy`；
     - 都通过后置 `busy = true`。守卫失败时不注册监听、不建目录。
  2. **本次调用状态**（`:56–68`）：
     - 局部变量 `directory`、`client`、`interrupted`、`answer`、`failure`；
     - `rejectRun` 初值只置 `interrupted = true`；
     - `cancel` 经 `rejectRun` 间接调用，用 `{ once: true }` 注册到 `signal`；
     - `checked` 等待后**实时**检查 `interrupted || signal.aborted`，命中报 `cancelled`。
  3. **临时目录与客户端**（`:70–84`）：
     - `mkdtemp(join(tmpdir(), "erp-ai-"))` 后再查一次 `signal.aborted`；
     - 从 `process.env` 去掉 `AI_API_KEY`、`AI_BASE_URL`、`COPILOT_CLI_PATH`（不分大小写）；
     - 用 `clientFactory ?? new CopilotClient` 建客户端，选项键序为 `mode, baseDirectory, workingDirectory, logLevel, env`。
  4. **中断承诺**（`:85–90`）：此后 `rejectRun` 改为“置 `interrupted` 并以该原因拒绝”。
  5. **`run`**（`:91–164`），依次：
     - `start` → `getAuthStatus` → `listModels`：未认证或模型不在列表 → `unavailable`；
     - `createSession`：26 键隔离配置，含 `onPermissionRequest` 与 `onEvent`。`onEvent` 的规则：
       - `tool.*` 或 `subagent.*` 事件 → `rejectRun("response")`；
       - 增量累计超过 262144 字节 → `rejectRun("response")`；
       - 第二条 `assistant.message` → `rejectRun("response")`；
     - `initializeAndValidate` → `getCurrentMetadata`：`tools` 不是空数组 → `response`；
     - `verifyModel` → `sendAndWait({ prompt: JSON.stringify(input) }, 300000)` → 再次 `verifyModel`；
     - 回答不是非空字符串、最终消息数不是 1，或回答超过 262144 字节 → `response`。
  6. **结果**（`:165–167`）：
     - `answer = await Promise.race([run(), interruption])`；
     - 非 `AiFailure` 的异常一律映射为 `unavailable`。
  7. **清理**（`:168–220`）：
     - 先移除监听；
     - 中断或已中止时 `forceStop`，否则 `stop`：返回错误数组非空时 `cleanupFailed` 并 `forceStop`；`stop` 抛错或超时时再 `forceStop`；
     - 两次都失败：先置 `blocked = true`，再 `console.error("AI runtime termination unconfirmed; AI disabled until restart.")`，且**保留**临时目录；
     - 每次终止调用都经 `bounded` 限时，超时值是每次求值的 `cleanupTimeoutMs ?? 5000`；
     - 确认终止后 `rm(directory, { recursive, force, maxRetries: 3, retryDelay: 100 })`，失败则 `console.error("AI temporary state cleanup failed.")`；
     - 然后 `busy = false`；
     - `cleanupFailed` 时把 `failure` 改为 `cleanup`（**成功的回答也会被覆盖**）。
  8. **返回**（`:221–223`）：有 `failure` 抛出；`answer === undefined` 抛 `response`；否则返回回答。
- 调用点计数（`502c547` 实测，全部位于 `complete` 内）：

  | 调用 | 次数 |
  | --- | --- |
  | `new AiFailure(` | 15 |
  | `rejectRun(` | 4 |
  | `console.error(` | 2 |
  | `checked(` | 8 |
  | `bounded(` | 4 |

  `complete` 内没有注释。
- **测试**：`packages/infra/test/copilot-ai.test.ts`（110 行）在 `502c547` 上 1 个用例通过（`infra` 项目）；`AiPanel` 与 HTTP 测试用假 `AiPort`，不经过本类。

### chunk 归属与首屏（S22 回顾行动 3）

| 文件 | 落在哪个 chunk | 依据 |
| --- | --- | --- |
| `packages/infra/src/copilot-ai.ts`（改）与新文件 | **不进任何 web chunk** | `packages/web/src` 不导入 `packages/infra`（`502c547` 上 `git grep` 计数 0） |
| 首屏 | **±0** | 同上；由 R7 的构建测量确认 |

## 范围与决定

1. **不改行为与失败先后**（D552）。对任何构造选项、输入、假运行时行为与中止时机，以下都不变：
   - 结果：返回的字符串，或抛出的 `AiFailure` 及其 `reason`；
   - 运行时与工厂调用的先后、次数与实参。工厂选项含键序与 `env` 过滤结果；会话配置含 26 个键的键序、取值与两个回调的行为；
   - 监听的注册与移除；
   - 临时目录的创建与是否删除，`rm` 的实参；
   - `console.error` 的消息与次数；
   - 调用结束后 `busy`、`blocked` 的值。

   同时触发多种失败时，最终报出的原因不变。只改代码组织，不修 bug：例如“已中止后工厂抛出普通错误报 `unavailable` 而不是 `cancelled`”“`answer === undefined` 分支在现有路径中不可达”都原样保留。拆分时发现的疑似缺陷登记在 PR 正文，留作后续任务。
2. **导出与签名不动**：
   - `copilot-ai.ts` 的运行时导出（`CopilotAiAdapter`）与类型导出（`CopilotTextSession`、`CopilotTextRuntime`）集合不变，两个接口的源文本不变；
   - 类的字段集合（`busy`、`blocked`、`options`）、构造器与 `complete` 的签名源文本不变；
   - **不新增实例字段或方法**，本次调用的状态不得挂到实例上；
   - `main.ts` 的动态导入不变（R2）。
3. **拆分方式**：
   - `complete` 只做编排，≤ 50 行，顺序为“守卫 → 置 `busy` → 建本次调用状态与监听 → 准备目录与客户端 → 运行会话 → 终止与清理 → 返回”。守卫与最后的返回语句留在 `complete` 内原样不动。
   - 其余阶段各成为顶层函数（可在新文件中），以显式参数传递，不用上下文大对象隐藏依赖。例如：
     - 去掉密钥的 `env` 与客户端选项；
     - 26 键会话配置（以 `model` 与事件回调为参数）；
     - 会话运行（原 `run`）；
     - 限时与终止（原 `bounded` 与 `if (client)` 一段）；
     - 删除临时目录。
   - **本次调用的状态只在每次 `complete` 调用内创建**（闭包或局部的小对象），不得是模块级或实例级变量（R5b）：
     - `interrupted` 必须实时读取：`checked` 在每次等待后读，清理时再读一次决定 `stop` 还是 `forceStop`，不得提前取快照；
     - `bytes` 与 `finals` 每次调用从 0 开始；
     - `finals` 在 `onEvent` 中累加，在回答检查中读取，两处读写同一个值。
   - **`rejectRun` 的两段语义不变**：
     - 中断承诺建立之前（含目录创建与工厂调用期间），中止只置 `interrupted`；
     - 建立之后，中止既置 `interrupted` 也拒绝。
     - `cancel` 仍只注册一次，且总是调用**当时的** `rejectRun`。R4 直接断言 8 覆盖两段。
   - **求值时机不变**：
     - `process.env` 在 `mkdtemp` 之后、工厂调用之前读取；
     - `this.options.clientFactory` 在 `env` 之后读取；
     - `this.options.cleanupTimeoutMs ?? 5000` 在每次限时调用时求值：传入 `this.options` 同一引用或取值函数，不得在调用开始时取快照；
     - `model` 是 `trim` 后的值。
   - **清理顺序不变**：
     - 先移除监听；
     - 终止失败时先置 `this.blocked = true`，再输出第一条 `console.error`。若把终止移出类，可以由新函数返回结果、在 `complete` 中置 `blocked` 并输出该消息，也可以传入回调，但两者先后不变；
     - 未确认终止时不删除目录；
     - `rm` 完成（或失败并输出第二条消息）之后才置 `busy = false`，然后才按 `cleanupFailed` 覆盖 `failure`。
   - `Promise.race([run(), interruption])` 的两个参与者与先后不变。不新增 `await`、`Promise.all` 或计时器；不改变 `sendAndWait` 的 300000 毫秒与 `bounded` 计时器的创建与清除。
4. **系统提示**：`instruction` 可以留在原文件，也可以原样搬到新文件，作模块级 `const` 字符串；字符串内容逐字节不变（R5a）。
5. **字面量**：`"erp-ai-"`、`262144`、`300000`、`5000`、`maxRetries: 3`、`retryDelay: 100`、三个环境变量名、`excludedTools` 的三项、拒绝权限的 `feedback` 与两条 `console.error` 消息都是规则值或对外文本，原文不变，不新增具名常量。
6. **文件**：
   - 新文件放在 `packages/infra/src/`（平铺结构，不新建子目录），以 `copilot-ai-` 开头按职责命名，例如 `copilot-ai-session.ts`、`copilot-ai-cleanup.ts`；不得与现有文件重名（该前缀下现有只有 `copilot-ai.ts`）。
   - 新文件只被 `copilot-ai.ts` 或本任务的其他新文件导入，不被 `main.ts` 或其他模块导入，以保持“只有配置了 AI 时才加载 SDK”。
   - 新文件可以 `import type` 自 `./copilot-ai.ts`，但不得从它导入运行时值（R5d）。
7. **不改**：
   - `packages/infra/src/` 下其他现有文件（含 `main.ts`、`http/**`、`storage/**`）；
   - `packages/core/**`（含 `AiFailure`、`AiPort` 所在的 `application/ai-assistant.ts`、REFAC-30 与 REFAC-31 的文件）；
   - `packages/infra/test/**`（含 `copilot-ai.test.ts`）、`packages/web/**`；
   - `scripts/**`（含 `scripts/slot/`、`scripts/measure/`）、`scripts/test-shard-weights.json`、`package.json` / lock、`vitest.config.ts`、`eslint` 与 `tsconfig` 配置。

## 冲突域

- infra-ai:copilot-ai：只改 `packages/infra/src/copilot-ai.ts`，并新增同目录下 `copilot-ai-*.ts`（决定 6）。
- 取证所需的观测点和新增测试文件：无（R4 驱动不提交）。
- 受影响的 e2e 断言（S13 回顾行动 1）：无。仓库中设置 `AI_MODEL` 的只有 `.env.example`（空值）与两个 Bench（置空）；e2e 与 GUI 场景的配置不设置它，服务端不构造本类，所以**须随本任务改**的也是无。
- 受影响的文档引用（D460）：`git grep -n -F "copilot-ai.ts" -- docs design` 在 `502c547` 上命中 1 行（`design/reviews/M0.md:28` 的 M0 评审证据），是当时的事实记录，不改。
- 与在途任务逐文件不相交：
  - REFAC-29 只改 `packages/web/src/PeriodClose.tsx` 与 `period-close/`；
  - REFAC-30 只改 `packages/core/src/domain/trade-calculator.ts` 与 `trade-calculation-*.ts`；
  - REFAC-31 只改 `packages/core/src/application/business-events.ts` 与 `business-event-*.ts`。

  四者没有共享文件。本任务只跑 `infra` 与 `infra-isolated` 项目（R3），不改测试文件；与 REFAC-30、REFAC-31 中先合并的一方之后，本任务的 R3 按实际合并基重做。

## 验收

### base 失败、head 通过

| 编号 | 检查 | base `502c547` | head 要求 |
| --- | --- | --- | --- |
| R6a | `node fnlen.cjs packages/infra/src`（口径同 S16–S24）中 `complete` 的行数 | **181**（失败） | `complete` ≤ 50；本任务新增或改动的函数都 ≤ 80 |
| R6b | `copilot-ai.ts` 的总行数（`(Get-Content <file>).Count`） | **225**（失败：会话、事件监控与清理都在类内） | ≤ 120；新文件各 ≤ 200 |

### 两侧都须成立的不变量

- **R1 范围**：`git diff --name-only <base> <head>` 只含 `packages/infra/src/copilot-ai.ts` 与同目录新增的 `copilot-ai-*.ts`；决定 7 所列文件的 diff 为空。不加迁移。
- **R2 导出不变**：
  - 用 `@babel/parser`（插件 `typescript`）解析，口径同 REFAC-14 R2，以下与 base 相同：
    - `copilot-ai.ts` 的导出名集合（运行时与类型）；
    - `CopilotTextSession`、`CopilotTextRuntime` 的源文本（只归一空白）；
    - `CopilotAiAdapter` 的成员名集合（含私有字段）、构造器与 `complete` 的签名源文本。
  - 在 base 与 head 上各用 node 导入 `packages/infra/src/copilot-ai.ts`，打印 `Object.keys` 排序结果，两侧相同。
  - `git grep -n "copilot-ai" -- packages` 在 head 上只命中 `main.ts:62`、`copilot-ai.test.ts` 与本任务文件之间的导入；PR 正文附结果。
  - `npm run typecheck` 与 `npm run check:boundaries` 通过。
- **R3 既有测试原样通过**：
  - `npx vitest run --project infra --project infra-isolated` 全部通过，测试文件 diff 为空。
  - PR 正文附汇总行原文，base 与 head 各一次；另附 `copilot-ai.test.ts` 单独运行的汇总行（base 1 个用例通过）。
  - 有失败时逐个列出，并附只对失败文件的串行重跑原文（`--no-file-parallelism`）。
- **R4 调用序列、结果与清理等价**（送审证据，驱动不提交，不加常驻 CI 用例）：
  - **驱动**：
    - 临时 vitest 脚本，例如 `packages/infra/test/zz-r32-probe.test.ts`，送审前删除，在 base 与 head 上各运行一次。
    - 驱动要用 `vi.mock("node:fs/promises")` 包装 `rm`（记录实参，可按开关抛错，其余转发真实实现），因此配置会把它归入 **`infra-isolated`** 项目。运行命令：`npx vitest run --project infra-isolated <file> --no-file-parallelism --silent=false`。
    - 每个用例新建 `CopilotAiAdapter`，用 `clientFactory` 注入**假运行时**：普通对象，各方法先记录调用与实参再按用例行为返回、抛错或挂起；不用 `Proxy`。
    - 用 `vi.spyOn` 记录 `signal.addEventListener` / `removeEventListener` 的调用次数，以及 `console.error` 的实参（屏蔽输出）。
    - 用例结束后检查工厂收到的 `baseDirectory` 是否仍存在。被保留的目录由驱动自己删除。
  - **记录与编码**：每个用例按发生顺序记录以下各项，用确定性 JSON 编码：
    - 工厂与运行时调用；`sendAndWait` 记录超时值，以及 `prompt === JSON.stringify(input)`；
    - 工厂选项：键序；`baseDirectory` 记为是否位于 `os.tmpdir()` 且末段以 `erp-ai-` 开头；`workingDirectory === baseDirectory`；`env` 记为是否含被去掉的三个键（不分大小写）、是否保留驱动设置的 `KEEP_ME`；
    - 会话配置：键序，非函数值的 JSON，函数值记为键名；
    - 结果：`OK:<回答>`，或 `<构造器名>:<reason>`；
    - 监听注册与移除次数、目录是否仍在、`rm` 的第二个实参、`console.error` 实参列表、调用后的 `busy` / `blocked`。

    同一驱动连续两次运行的输出须逐字节相同。驱动须带 REFAC-17 的自测（a）–（c），任一自测失败即 R4 失败。
  - **用例**至少包含下列直接断言 1–11 的全部输入，并覆盖 `complete` 内每个 `new AiFailure(` 与 `rejectRun(` 调用点；以静态计数替代不算覆盖。`answer === undefined` 一处在现有路径中不可达，豁免，但须在 PR 正文写明理由。
  - **判定**：base 与 head 每个用例的记录逐字节相同，PR 正文附两侧输出的 SHA-256 与比较结果。只比两侧相同不够，以下**直接断言**也须成立。期望值都由设计角色在 base `502c547` 上用临时驱动实测，驱动已删除。下文“序列”中，`factory` 指工厂调用，`model` 指 `rpc.model.getCurrent`，`init` / `meta` 指 `rpc.tools` 的两个方法；“监听 1/1”指注册 1 次、移除 1 次：
    1. **成功**：
       - 序列为 `factory`、`start`、`getAuthStatus`、`listModels`、`createSession`、`init`、`meta`、`model`、`sendAndWait(300000, prompt 为 JSON.stringify(input))`、`model`、`stop`；
       - 结果为假运行时的回答，监听 1/1，目录已删除；
       - `rm` 的第二个实参为 `{"recursive":true,"force":true,"maxRetries":3,"retryDelay":100}`；
       - `console.error` 0 次，调用后 `busy` 与 `blocked` 都为 `false`；
       - 构造选项 `model: " m "` 时，会话配置的 `model` 为 `"m"`，`allowedModels` 为 `["m"]`；`provider: "copilot"` 时结果同上。
    2. **工厂选项与会话配置**：
       - 工厂选项键序为 `mode, baseDirectory, workingDirectory, logLevel, env`；`baseDirectory` 位于 `os.tmpdir()`、末段以 `erp-ai-` 开头；`workingDirectory === baseDirectory`；驱动设置的 `ai_api_key` 被去掉，`KEEP_ME` 保留；
       - 会话配置的 26 个键依次为：`model, allowedModels, reasoningSummary, availableTools, excludedTools, tools, mcpServers, customAgents, includedBuiltinSkills, enableConfigDiscovery, skipCustomInstructions, enableOnDemandInstructionDiscovery, enableSkills, enableFileHooks, enableHostGitOperations, enableSessionStore, enableSessionTelemetry, requestExtensions, requestCanvasRenderer, enableMcpApps, memory, infiniteSessions, systemMessage, onPermissionRequest, streaming, onEvent`；
       - 函数值只有 `onPermissionRequest` 与 `onEvent`；
       - `onPermissionRequest` 返回 `{"kind":"reject","feedback":"Candidate-only application: no tools or files."}`；
       - `systemMessage.mode` 为 `"replace"`，`content` 与 base 的 `instruction` 逐字节相同。
    3. **守卫先后**：
       - 以下五种都报 `unavailable`，0 次 `factory`，监听 0/0：`model` 未给、为 `"auto"`、为 `"  "`、`provider: "openai"`、`model: "auto"` 且 `signal` 已中止（`model` 检查在中止检查之前）；
       - `signal` 已中止 → `cancelled`；
       - `blocked` 且已中止 → `cancelled`（中止检查在 `blocked` 之前）；
       - `blocked` 且 `busy` → `cleanup`；
       - 第一次调用挂在 `start` 上时发出第二次调用 → 第二次报 `busy` 且不调用工厂；释放 `start` 后第一次照常成功。
    4. **会话前失败**（都报 `unavailable`，都以 `stop` 结束，0 次 `forceStop`，目录已删除）：
       - 未认证：序列以 `start`、`getAuthStatus`、`stop` 结束；
       - 模型不在列表：以 `listModels`、`stop` 结束；
       - `start` 抛普通错误：序列为 `factory`、`start`、`stop`；
       - `createSession` 抛普通错误：以 `createSession`、`stop` 结束；
       - 工厂抛普通错误：只有 `factory`，0 次 `stop` / `forceStop`，监听 1/1，目录已删除。
    5. **回答检查**（都报 `response`，以 `stop` 结束，0 次 `forceStop`）：
       - `meta` 返回非空数组或非数组：以 `meta`、`stop` 结束，0 次 `sendAndWait`；
       - 发送前 `model` 不符：以 `model`、`stop` 结束，0 次 `sendAndWait`；
       - 发送后 `model` 不符：以 `sendAndWait`、`model`、`stop` 结束；
       - 0 条最终消息、回答为空白、回答为 `undefined`、回答 262145 字节：都以 `model`、`stop` 结束；
       - 对照：增量恰为 262144 字节且 1 条最终消息 → 成功。
    6. **事件越权**（都报 `response`，以 `sendAndWait`、`forceStop` 结束，0 次 `stop`）：
       - `tool.execution_start` 事件；
       - 增量 262145 字节；
       - 两条 `assistant.message`；
       - `subagent.started` 事件后 `sendAndWait` 仍返回回答：也报 `response`。
    7. **中止**（都报 `cancelled`，`forceStop`，0 次 `stop`，目录已删除）：
       - 发送中中止：以 `sendAndWait`、`forceStop` 结束；
       - `start` 挂起时中止：序列为 `factory`、`start`、`forceStop`。
    8. **中断承诺建立之前中止**：
       - 在工厂内中止后正常返回运行时 → `cancelled`，序列为 `factory`、`start`、`forceStop`；
       - 在工厂内中止后工厂抛普通错误 → **`unavailable`**（非 `AiFailure` 映射优先，现状保留）。
    9. **终止失败**（都报 `cleanup`）：
       - `stop` 返回非空错误数组、`stop` 抛错、`stop` 永不完成（`cleanupTimeoutMs: 20`）：序列都以 `stop`、`forceStop` 结束，目录已删除，`blocked` 为 `false`；成功的回答也被覆盖为 `cleanup`；
       - `stop` 与 `forceStop` 都抛错：
         - `blocked` 为 `true`、`busy` 为 `false`；
         - **目录保留**；
         - `console.error` 恰为 `["AI runtime termination unconfirmed; AI disabled until restart."]`；
         - 同一实例的下一次调用：未中止报 `cleanup`、已中止报 `cancelled`，都是 0 次 `factory`、监听 0/0；
       - 发送中中止且 `forceStop` 抛错：以 `sendAndWait`、`forceStop`、`forceStop` 结束，`blocked` 为 `true`，目录保留，`console.error` 同上。
    10. **删除目录失败**：`rm` 抛错且其余成功 → `cleanup`，`console.error` 恰为 `["AI temporary state cleanup failed."]`，`blocked` 为 `false`。
    11. **监听移除**：用信号 `S` 成功调用一次后中止 `S`，再用新信号调用同一实例，仍然成功，`console.error` 0 次。

    base 上任一直接断言不成立，先停下并向协调者报告。PR 正文附驱动、用例清单、比较结果与直接断言结果。
  - **驱动原件**：PR 正文贴驱动**原文件字节的 base64**，或同时写出两种 SHA-256：原始字节、按 UTF-8 解码并把换行归一为 LF 后的字节。只给一种哈希不算满足。
- **R5 结构规则**（静态，评审按代码与 PR 表格核对）：
  - **R5a 原文搬移**：以下语句序列在 base 与 head 之间逐字比较（只归一缩进）：
    - 守卫（`:45–55`）；
    - `env` 与工厂选项（`:72–83`）；
    - 会话配置对象字面量（`:102–140`，含 `onEvent` 体）；
    - `run` 的其余语句（`:92–100`、`:142–163`）；
    - `checked`（`:64–68`）；
    - 中断承诺（`:85–90`）；
    - 清理开头（`:169–171`）；
    - `bounded`（`:172–187`）；
    - 终止段（`:188–209`）；
    - 删除目录段（`:210–217`）；
    - 收尾（`:218–223`）；
    - `instruction` 字符串。

    为传参把自由变量或 `this.options` / `this.blocked` 的访问改为参数、回调或返回值的替换，须逐处列表说明。不同且未列明即失败。
  - **R5b 无模块级可变状态**：新文件与 `copilot-ai.ts` 的模块顶层只能有：`import` / `export`、类型与接口、函数与类声明、`const` 常量（不含 `let`、可变容器，且不在加载时调用导入的函数）。`CopilotAiAdapter` 的实例字段集合不变（决定 2）。PR 正文附 Babel AST 检查脚本的输出。
  - **R5c 调用点不变**：用 Babel AST 抽取实参原文（只归一空白），比较 base `complete` 与 head `complete` 加本任务新函数内的多重集，须相同：
    - `new AiFailure(`（base 15 处）、`rejectRun(`（4 处）、`console.error(`（2 处）的实参原文多重集；
    - `checked(`（8 处）与 `bounded(`（4 处）的被包装调用原文。

    为传参改名的逐处说明。PR 正文附两侧列表与比较结果。
  - **R5d 依赖方向**：新文件之间的导入单向无环，`copilot-ai.ts` 位于顶端；新文件不从 `./copilot-ai.ts` 导入运行时值。`@github/copilot-sdk` 的运行时导入（`CopilotClient`）只出现在 `copilot-ai.ts` 或其新文件中。PR 正文附导入图。
- **R6 尺寸**：除上表 R6a、R6b 外，每个新函数满足 ②（≤ 80 行、嵌套 ≤ 3 层）。PR 正文列出所有超过 50 行的函数，附计数行数与最深层数（base 与 head 两列）。
- **R7 打包字节**：首屏与全部 chunk **±0**。用 `scripts/measure/bundle-measure.mjs --d454`，不传 `--route` / `--chunk`，即全部 ±0；写明脚本所在的提交 SHA。base 为最终送审 head 的实际合并基。出现任何非 0 差异即停下报告。
- **R8 质量门**：
  - **R8a 合并前**：`typecheck`、`lint`、`check:boundaries`、CI-02 预检通过；PR CI（`ci.yml`）绿。
  - **R8b 合并后检查（不作合并门）**：合并后第一次覆盖该合并提交的 main Full 须绿；失败时报协调者，按 D456 暂停后续合并。
- **R9 可读性一节**：PR 正文按下节逐条说明。

## 测试命令

```powershell
npx vitest run --project infra packages/infra/test/copilot-ai.test.ts
npx vitest run --project infra --project infra-isolated
npm run typecheck; npm run lint; npm run check:boundaries
node scripts/measure/bundle-measure.mjs --base <合并基全 SHA> --head <head 全 SHA> --work <新目录> --d454
```

## 性能考虑

- 不跑 Bench：AI 请求只在用户手动发起时运行，耗时由模型主导。拆分只多若干函数调用，不新增 `await`、计时器或复制（决定 3）；若 R4 序列出现新调用，即违反 R4，评审退回。
- 不进打包产物（R7）；`main.ts` 的动态导入不变，未配置 AI 时仍不加载 SDK（R2、R5d）。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥：

- **②**：本任务就是为满足 ② 而做。`complete` 从 181 行拆到 ≤ 50 行，`finally` 中五层嵌套降到 ≤ 3 层，其余函数 ≤ 80 行（R6a、R6）。
- **③**：`copilot-ai.ts`（225 行）拆后 ≤ 120 行，新文件各 ≤ 200 行（R6b）。PR 正文贴 `git diff --numstat`。
- **①**：函数名表达阶段，例如 `isolatedClientOptions`、`textSessionConfig`、`runTextSession`、`terminateRuntime`、`removeWorkspace`；不用 `step1`、`part2`、`helper`。
- **④**：读者能在 `complete` 中一屏看出“守卫 → 状态与监听 → 目录与客户端 → 会话 → 终止与清理 → 返回”；每个阶段一处可读，参数显式。
- **⑤**：不适用（决定 5）。
- **⑥**：可以加两行注释：
  - 在 `rejectRun` 处说明“中断承诺建立前只记标志，之后才拒绝”；
  - 在终止失败处说明“未确认终止时保留目录并禁用 AI，直到重启”。

  不加其他注释；不留调试输出。
- **测试耗时**：本任务不改测试；R4 驱动不提交。PR 正文附 `infra` 与 `infra-isolated` 项目在 base 与 head 上的耗时（vitest 汇总行原文），两侧差异 > 20% 时说明原因。

## 用户可见变化

- 无。AI 起草与解释的结果、错误提示（不可用、忙、已取消、回答无效、清理失败）与清理失败后的禁用行为都不变（R3、R4）。

## 证据要求

- **不需要浏览器时段**：行为等价由 R3 与 R4 证明；R4 比较调用序列、结果与清理行为逐字节等价，并核对直接断言。e2e 不加载本类。R4 与构建在本机运行，须服从协调者的时段静默通知（D442 / D480）。
- **可行性**（S13 回顾行动 4）：设计角色已在 `502c547` 上用两个临时 vitest 驱动实测 R4 直接断言 1–11 全部成立，驱动已删除、未提交：
  - 不 mock `fs` 的驱动在 `infra` 项目运行；
  - mock `node:fs/promises` 的驱动在 `infra-isolated` 项目运行；
  - 实测中被保留的临时目录已手动删除。

  `copilot-ai.test.ts` 在同一提交上 1 个用例通过。
- PR 正文附：R2 导出比较与 `git grep` 结果；R3 汇总行；R4 驱动（原件 base64 或两种 SHA-256）、用例清单、比较结果与直接断言结果；R5a–R5d 各表；R6 行数表（base 与 head 两列）；R7 的 `bundle-measure.mjs` 完整输出与退出码；可读性一节。R8b 合并后补到 PR 评论。

## 设计自查

- 冲突域与 REFAC-29（web）、REFAC-30（core domain）、REFAC-31（core application）逐文件不相交；不是页面拆分；不加迁移；不碰 `scripts/slot/`、`scripts/measure/`。
- R6a / R6b 的 base 数字、R5c 的调用点数与 R4 直接断言的期望值都在 `502c547` 上实测。
- 只改代码组织；疑似缺陷（若有）登记后另排任务。
