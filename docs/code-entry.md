# 代码入口、扩展点与调试

读者：要改代码的维护者。本页只覆盖三处 REFAC 拆分后的模块（业务事件预览计算 REFAC-31、AI 适配器 REFAC-32、贸易单据路由 REFAC-34），并给出这些模块的调试命令。分层与数据流看 [M0 架构](../design/m0-architecture.md)；取舍看[取舍汇总](tradeoffs.md)；AI 行为看 [AI 助手](ai-assistant.md)。

**钉住的版本**：入口文件与行号取自 `664b37c1f092591b4677be4c785057c2eac3fc3c`；下面“调试命令”都在该提交上实际运行过，结果见各命令后。该提交之后 main 只有 `design/` 的提交（`8ca7ddf` 为 #404），这三处代码未变。**状态：partial**，事实尚待 Developer 复核（MCF-08）。

## 目录与分层

仓库没有 `src/`，代码在 `packages/*`：

| 包 | 内容 | 本页涉及 |
|---|---|---|
| `packages/core` | `domain`（纯规则）、`application`（服务与端口）、`contracts`（请求/响应模式） | 业务事件、AI 端口、贸易单据服务 |
| `packages/infra` | `http`（Fastify 路由）、`storage`（SQLite）、`workers`（SQLite worker 与服务装配）、`legacy`（旧账导入）、`copilot-ai*.ts` | 路由拆分、AI 适配器 |
| `packages/web` | 界面 | 不涉及 |

依赖方向由 `scripts/check-boundaries.mjs` 检查（见下）。

## 1. 业务事件预览计算（REFAC-31）

- 入口：`packages/core/src/application/business-events.ts` 的 `BusinessEventService.preview`（经 `compute` 驱动生成器 `businessPreviewSteps`，约第 139 行）。
- 拆分后的文件（都在 `packages/core/src/application/`）：
  - `business-event-plan.ts`：共用类型与小工具（`BusinessEventPart`、`JournalPlanner`、`RepositorySteps`、`waitFor`、`required`）。
  - `business-event-cash.ts`：`businessDraft`、`cashServicePlan`、`cashServiceCancelPlan`（现金服务及其取消）。
  - `business-event-ledger.ts`：`statisticsPreview`、`clearingMatchPreview`、接口 `LedgerContext`（统计与清账匹配）。
- 流程：`journal` 操作直接返回日记账计划；其余按 `operation` 选 `cash_service` / `cash_service.cancel` / `statistics` / `clearing.match` 之一，再把结果与 `businessStamp` 一起交给 `tools.hash` 对数组求指纹（business-events.ts:168-178）；`"business-plan-v1"` 只是数组首位的版本标记，其后依次是 company、event、`current.fingerprint`、`businessStamp`、matches、statistics、clearing、evidence。
- 扩展点：新增一种业务事件操作，要：(1) 在 `checkedEvent`（约 104–137 行）里放行该 `operation`，否则落入末尾的 `operation` 形状错误；(2) 在 `businessPreviewSteps` 的三元链（约 156–164 行）里、默认的 `clearing.match` 分支之前插入一个返回 `BusinessEventPart` 的生成器；契约与校验分别在 `contracts/business-events.ts`、`domain/business-events.ts`。指纹的输入顺序会影响已有指纹，改动前先看现有测试。
- 装配：`packages/infra/src/workers/entry.ts` 里 `new BusinessEventService(store, journalTools)`；HTTP 在 `packages/infra/src/http/business-events.ts`；存储在 `packages/infra/src/storage/business-event-store.ts`。
- 测试：`packages/core/test/domain/business-events.test.ts`、`packages/infra/test/application/business-events.test.ts`、`packages/infra/test/http/business-events.test.ts`。

## 2. AI 适配器（REFAC-32）

- 入口：`packages/infra/src/copilot-ai.ts` 的 `CopilotAiAdapter.complete`（实现 `@erp/core/application` 的 `AiPort`）。生产构造点在 `packages/infra/src/main.ts`（动态导入）。
- 拆分后的文件（都在 `packages/infra/src/`）：
  - `copilot-ai-interruption.ts`：调用状态与中断（`createCallState`、`interruptionOf`、`checkedBy`）。
  - `copilot-ai-client.ts`：`copilotRuntimeEnv`（SEC-02 的环境白名单，只转发非空 `COPILOT_GITHUB_TOKEN`）、`isolatedClient`（隔离工作目录的客户端）。
  - `copilot-ai-session.ts`：`runTextSession`，系统提示与事件监控。
  - `copilot-ai-cleanup.ts`：`cleanupSteps`，终止与清理；只有无法确认 CLI 进程已终止（`forceStop` 失败或超时，`copilot-ai-cleanup.ts:53-57` → `copilot-ai.ts:112-115`）时，适配器才被禁用直到重启；`stop()` 出错或临时目录删除失败只让当前调用失败，若答案已收到则只记日志（`settle`，`copilot-ai.ts:39-43`）。
- 流程：守卫（模型为空或 `auto`、提供方不是 copilot → `unavailable`；已取消、已禁用 `cleanup`、占线 `busy`）→ 临时目录 → 隔离客户端 → 会话与中断竞速 → 同步判定是否中断 → 清理。
- 扩展点：测试通过 `clientFactory` 注入假运行时；`cleanupTimeoutMs`（默认 5000 ms）只限制 `stop` / `forceStop`；`sendAndWait` 另有 300000 ms 超时（`copilot-ai-session.ts`），服务层另有 `AI_TIMEOUT_MS`（`main.ts` 读取，默认 30000 ms，`ai-assistant.ts` 的 `ask`）：计时器在 `reads.context` 之后才开始，只与适配器的 `complete` 竞速，不含读取上下文、草稿解析与预览，超时后也不等待清理完成。行为与取舍见 [AI 助手](ai-assistant.md)，本页不重复。
- 测试：`packages/infra/test/copilot-ai.test.ts`、`packages/infra/test/copilot-ai-client.test.ts`。

## 3. 贸易单据路由（REFAC-34）

- 入口：`packages/infra/src/http/trade-documents.ts` 的 `registerTradeDocumentRoutes`，由 `http/index.ts` 调用；服务来自 `workers/entry.ts` 的 `new TradeDocumentService(...)`。
- 按资源拆分（都在 `packages/infra/src/http/`）：

| 文件 | 路由前缀（`/api/v1/trade/…`） |
|---|---|
| `trade-document-reports.ts` | `reports/open-items`、`reports/reconciliation`、`reports/open-items/:itemId` |
| `trade-document-orders.ts` | `orders`、`orders/preview`、`orders/:orderId`、`orders/:orderId/invoicing` |
| `trade-document-actions.ts` | `actions`、`actions/preview`、`open-items/:itemId/actions`、`settlements`、`settlements/preview` |
| `trade-document-invoices.ts` | `invoices`、`invoices/preview`、`invoices/:documentId`、`open-items` |
| `trade-document-http.ts` | 共用：`parse`、`parseTradeId`、`tradeDocumentReady`（服务未就绪 503；非 GET 要求无查询串，否则 400；非 JSON 415） |

- 扩展点：新增资源时新建一个 `registerXxxRoutes(server, ready, boundary)` 并在 `registerTradeDocumentRoutes` 里注册。注册顺序是固定的，且 `orders` 拆成入口（`registerOrderEntryRoutes`）与查询（`registerOrderLookupRoutes`）两段，不能合并或调换（REFAC-34 / D554，`design/tasks/REFAC-34-trade-document-routes-split.md` 80–84 行）。每个处理函数先执行 `boundary.assert`（403/405），再调用 `ready(request)`（503/400/415）；见 `trade-document-actions.ts:23-30`、`trade-document-reports.ts:18-19` 与 `trade-document-guards.test.ts:10-11` 的注释。
- 测试：`packages/infra/test/http/trade-document-guards.test.ts`、`packages/infra/test/application/trade-documents.test.ts`；浏览器烟测是 `*.slow.test.ts`。

## 调试命令

在仓库根目录执行，需先 `npm ci`（Node 26）。结果为在 `664b37c1f092591b4677be4c785057c2eac3fc3c` 上的实测。

| 目的 | 命令 | 实测 |
|---|---|---|
| 类型检查 | `npm run typecheck` | 退出码 0 |
| 依赖边界 | `npm run check:boundaries` | 退出码 0，“Import boundaries passed for 371 source files.” |
| 边界检查自身的测试 | `npm run test:boundaries` | 退出码 0，8 项通过 |
| 业务事件测试 | `npx vitest run packages/core/test/domain/business-events.test.ts packages/infra/test/application/business-events.test.ts packages/infra/test/http/business-events.test.ts` | 退出码 0，3 个文件 7 项通过 |
| AI 适配器测试 | `npx vitest run packages/infra/test/copilot-ai.test.ts packages/infra/test/copilot-ai-client.test.ts` | 退出码 0，2 个文件 21 项通过 |
| 贸易单据测试 | `npx vitest run packages/infra/test/http/trade-document-guards.test.ts packages/infra/test/application/trade-documents.test.ts` | 退出码 0，2 个文件 127 项通过，约 2 分钟 |

完整门禁是 `npm run verify`（本页未运行）；CI 分层与本地复现见 [CI 说明](ci.md)。性能基准：`npm run bench` 运行 `packages/infra/bench/sqlite.ts`（`package.json:33`），它引入 `bench/business-events.ts` 的 `businessEventBenchmark`；后者不是独立入口（本页未运行）。

## 已知缺口

- 其余模块（总账、期末、旧账导入、存储层）的代码入口没有在本页，目前只能看架构文档与目录。
- 页面事实未经 Developer 复核；未覆盖 Web 端的 REFAC 拆分。
