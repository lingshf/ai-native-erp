# MCF-20 业务事件六场景的真实 Chrome 断言

- Sprint：S26（[计划](S26.md#范围与验收)第 6 行，泳道 D）　依赖：本任务书合并（[S26 泳道](S26.md#泳道按冲突域)）　建议分支：`mcf-20-business-event-gui`
- 冲突域（逐个列文件）：
  - 新增测试文件：`packages/infra/test/http/business-events-gui.slow.test.ts`（文件名须含 `gui`，否则进不了 `infra-browser` 项目，见“现状”第 1 条）；只在设计决定 6 要求拆分时，另允许 `packages/infra/test/http/business-events-gui-2.slow.test.ts`；
  - 新增测试辅助文件：`packages/infra/test/support/business-events-gui.ts`（只放本文件用的 HTTP 前置数据与页面步骤）；不改 `packages/infra/test/support/trade-gui/` 与 `trade-gui-scenario.ts`，只导入其中已导出的函数；
  - 共享单文件：`scripts/test-shard-weights.json`（新增上面新文件的条目，不改其他条目）；
  - 注释：`.github/workflows/full.yml:22-24`（只改注释，见设计决定 6；超出 S26 第 6 行的冲突域，送审时请 Team Leader 确认）；
  - 受影响的 e2e 断言：无。本任务只新增断言，不改页面；`tests:trade-e2e` 与现有 `*gui*.slow.test.ts` 不动。检索：`git grep -n "business-events\|/events" -- packages/infra/test/http/*gui*.slow.test.ts packages/infra/test/support/trade-gui` 在 `d78b3d4` 上无输出（退出码 1）；
  - 受影响的文档引用：不适用（不搬移、不拆分文件）；
  - 受影响的文档：`docs/ci.md:34,57-58` 描述 browser lane 的运行方式、artifact 与启动阶段日志，新文件沿用同一 lane、同一 artifact 目录（`full.yml:32,120-121`）与同一阶段日志，内容仍成立，无需改；`.github/workflows/full.yml:22-24` 的注释“each get their own runner”在新增第 7 个浏览器文件后不再成立，同 PR 修改（见设计决定 6）；`design/tasks/backlog/MCF.md:27` 与 `design/tasks/S26.md` 的状态由 Team Leader 在状态同步时改。检索：`git grep -n "R8b\|infra-browser\|business-events-gui" -- docs README.md CHANGELOG.md` 只命中 `docs/ci.md:34,57` 与 `docs/demo/v0.11.0/logs/` 中的历史日志（历史日志不改）；
  - **不涉及**：迁移 / schema、领域过账、HTTP 契约、页面行为与文案（`packages/web/src/` 一律不改）、`vitest.config.ts`、`scripts/ci.ts`、Full 的分片数（`full.yml:21` 仍为 6）。
- 类型：只加测试（真实 Chrome）
- 优先级：P3（[D582](S25.md#s25-期间决定)；补 REFAC-31 R8b 的“未确认”项，不阻塞功能）

## 现状（main `d78b3d4769e0cd19bbc6d7c0073968d83ba958e7`）

1. 只有文件名匹配 `packages/infra/test/http/*gui*.slow.test.ts` 的文件进 `infra-browser` 项目（`vitest.config.ts:12,142-145`）；`CI_TEST_LAYER=pr` 时排除所有 slow 文件（`vitest.config.ts:11`），所以只在 Full 运行。Full 的 browser lane 运行 `npm run test:ci -- --project=infra-browser --maxWorkers=1 --shard=N/6`（`.github/workflows/full.yml:94`），同一 runner 上的文件**串行**执行。
2. 当前浏览器文件 6 个，权重（`scripts/test-shard-weights.json`）：`migration-gui` 7529、`trade-gui-en-green-1` 6920、`trade-gui-en-green-2` 30124、`trade-gui-smoke` 9000、`trade-gui-zh-red-1` 7615、`trade-gui-zh-red-2` 25647。6 个 browser 分片各一个文件（`full.yml:20-24` 的注释）。分片按权重分配（`scripts/ci.ts:175` `balanceShards`，`:224` `selectShardFiles`，规划模型为 2 worker）。
3. 加第 7 个文件后的分配，已在 `d78b3d4` 上用 `balanceShards` 试算（命令见“证据要求”第 4 条），新文件权重取 6000 / 10000 / 15000 / 20000 / 25000 五档：
   - 6000：新文件与 `trade-gui-en-green-1` 同一分片，合计 12920；
   - 10000 至 25000：新文件独占一个分片，`migration-gui` 与 `trade-gui-en-green-1` 合并到同一分片，合计 14449；
   - 各档的最大分片仍是 `trade-gui-en-green-2` 30124。
   结论：无论权重多少，总有两个文件共用一个 runner，`full.yml:22-24` 的注释都要改。
4. browser lane 成功时，`node scripts/ci.ts summary` 要求日志里有 `browser` 与 `page` 两种启动阶段计时，否则报 “Missing browser startup phase timings”（`scripts/ci.ts:362-368`）。现有文件用 `guiPhase` 写这两种计时（`packages/infra/test/http/migration-gui.slow.test.ts:33,67`；`packages/infra/test/support/trade-gui-scenario.ts:57`）。
5. 可复用的真实 Chrome 支架（`packages/infra/test/support/trade-gui/harness.ts`）：`guiHarness`（`:21`，每个文件一次 Vite 构建、一次 Chrome 启动，`beforeAll` 上限 60 s）、`provisionServer`（`:75`，迁移、初始化 2026 年并写入 6 个控制科目后启动 API，端口 0）、`openTracedPage`（`:154`）、`closeAll`（`:137`）。截图与 trace 写入 `ERP_E2E_ARTIFACTS`（`packages/infra/test/support/trade-gui/paths.ts:6`；Full 中为 `artifacts/ci/trade-e2e`，`full.yml:32`，上传为 `trade-gui-shard-*`，`full.yml:120-121`）。现有用例的显式超时：`migration-gui` 每个用例 30 s（`migration-gui.slow.test.ts:112`），贸易场景 180 s（`trade-gui-scenario.ts:90`）。
6. 业务事件页在 `#/events`（`packages/web/src/App.tsx:329`），凭证页在 `#/journals`（`App.tsx:345`）。页面入口：
   - 新建按钮“新建 · 现金服务 / 统计 / 清算匹配”（`packages/web/src/business-events/events-view.tsx:37-47`）；
   - 编辑器的预览按钮 `journal.preview`（`business-events/editors.tsx:220`），Ctrl+Enter 也触发预览（`editors.tsx:60-61`）；
   - 预览对话框的确认按钮：业务事件为 `business.confirm`，待转队列为 `business.transfer`（`business-events/event-dialogs.tsx:24-29`）；
   - 已过账现金服务的详情里有“取消现金服务”按钮（`business-events/event-detail.tsx:70-79`），冲销事件详情显示原事件链接（`event-detail.tsx:47-58`），每个凭证有“查看”按钮（`event-detail.tsx:80-90`）；
   - 只记证据、不生成总账行时预览显示 `business.noGl`（`business-events/business-plan.tsx:45`）；
   - 待转队列视图在“待转队列”分段按钮下（`events-view.tsx:12-25`），行操作为查看 / 预览 / 撤回，预览与撤回只在 `pending` / `failed` 时显示（`business-events/queue-view.tsx:74-104`）；
   - 待转列表按状态筛选：筛选是标签为 `business.queue` 的下拉框，选项为 `pending` / `failed` / `transferred` / `withdrawn`（`queue-view.tsx:10,18-38`），默认 `pending`（`business-events/use-company-events.ts:39`），列表查询带 `&status=` 该值（`use-company-events.ts:49-56`）。确认成功后页面打开结果详情并刷新列表，但不改筛选（`business-events/event-commands.ts:40-49`），所以已转入的行会从 `pending` 列表中消失；
   - 转入待转队列的唯一界面入口是凭证页的 `business.enqueue` 按钮，只对 `journal` 类凭证显示（`packages/web/src/journals/journal-confirm.tsx:144-152`），请求 `POST /api/v1/transfer-queue`（`journals/journal-commands.ts:140-145`）。
   - 中英文文案在 `packages/web/src/ui/business-labels.ts`（如 `business.posted` `:70` / `:163`，`business.pending` `:65` / `:158`，`business.transferred` `:67` / `:160`，`business.recorded` `:69` / `:162`，`business.cancelled` `:71` / `:164`）。
7. R8b 六行在 [#362 评论 7150062662](https://github.com/lingshf/ai-native-erp/pull/362#issuecomment-7150062662) 中均为“未确认”（Full 的浏览器分片只跑贸易 GUI 与迁移 GUI）。现有非浏览器覆盖（`packages/infra/test/application/business-events.test.ts`）：现金服务收付 `:166`；冲销 `:251`（原事件变为 `cancelled`，`:291`）；统计 `:307`（有符号六位小数，`status: "recorded"`，无总账，`:328`）；清账匹配 `:356`（`:398` 为 `recorded`、`journalIds: []`）；待转转入与确认 `:408`（转入后 `pending`、`journalIds: []`，`:410`）；HTTP 层前置数据写法见 `packages/infra/test/http/business-events.test.ts:47-87`（服务、`cash` / `offset` 两条过账规则）。
8. 检索 `git grep -n "business-events\|/events" -- packages/infra/test/http/*gui*.slow.test.ts packages/infra/test/support/trade-gui` 无输出：现有真实 Chrome 测试不打开业务事件页。

## 设计决定（产品负责人）

1. **一个新文件，四个用例，覆盖六行**：
   - 用例 A“现金服务收付与冲销”：覆盖第 1、2 行；
   - 用例 B“统计”：覆盖第 3 行；
   - 用例 C“清账匹配”：覆盖第 4 行；
   - 用例 D“待转转入与确认”：覆盖第 5、6 行。
   冲销依赖已过账的现金服务，确认依赖已转入的队列项，所以各放在同一用例内。每行在用例里是一个有名字的步骤（用 `guiPhase` 记计时，步骤名含行名），失败时能看出是哪一行。
2. **业务动作走页面，前置数据走 HTTP**：被断言的六个动作（预览、确认、取消、选择未清项、转入队列、确认转入）一律在真实 Chrome 中点击渲染出的控件完成；服务、过账规则、清算科目、清账用的两张已过账凭证这类前置数据用 HTTP 写入（同 `provisionServer` 只写前置科目的做法，`harness.ts:94-95` 的注释）。不要求全程键盘：R8b 保护的是业务行为，键盘路径由贸易 GUI 覆盖；但按钮须按可访问名称（角色 + 文案）定位，不用 CSS 选择器或 `data-*`。
3. **语言与主题**：用例 A、B 用中文 / 红色主题，用例 C、D 用英文 / 绿色主题，两种语言和两种主题都至少出现一次；视口 1440 × 1000，教学模式关闭（偏好写入 `localStorage` 的 `erp.workspace.preferences.v1`，同 `migration-gui.slow.test.ts:73` 的写法）。不做 390 px：本任务不改布局，窄屏由各页面自身的测试负责。
4. **隔离**：每个文件一次构建、一次 Chrome 启动（`guiHarness`）、一个数据库与 API（`provisionServer`）；每个用例新开 `BrowserContext` 与页面，用自己的来源单号与数据，不依赖其他用例的结果或执行顺序。
5. **超时**：每个用例显式超时 60 s，`beforeAll` 沿用 `guiHarness` 的 60 s；不加重试。60 s 是起始上限，不是预算：按模板，单个用例 > 2 s 的逐个在 PR 正文写原因（真实 Chrome 用例预计都会超过）；不得为了通过而提高超时。
6. **分片**：不改分片数，不改 `scripts/ci.ts`。新文件的权重取本机实测耗时（毫秒，取整，取法与命令见“证据要求”第 3 条），手工加进权重文件；不用 `node scripts/ci.ts weights` 重新生成，因为它会整体重写权重文件（`scripts/ci.ts:375-386`）、改动其他条目。再用“证据要求”第 4 条的命令重算分配，任何 browser 分片的计划权重合计不得超过当前最大值 30124。超过时把文件拆成两个（文件名都含 `gui`，第二个为 `packages/infra/test/http/business-events-gui-2.slow.test.ts`，用例 C、D 移入），两个文件分别实测、分别登记权重后重算，不提高超时。**拆分后仍超过 30124 时停下**：不再拆第三个文件，不扩大冲突域，不改其他文件的权重，不提高超时；在 PR 中写出两个文件的实测值与重算输出，报 Team Leader 决定。`full.yml:22-24` 的注释同 PR 改成与实际分配一致的描述（只改注释）。合并后第一次 main Full 的实际耗时由 Team Leader 记在 PR 评论；与权重差距大时，在下一次刷新权重时一起修正，不在本任务内反复改。
7. **发现产品缺陷时**：不改 `packages/web/src/` 或其他产品代码，按 [D565](S24.md#s24-期间决定) 另记缺陷候选，并在 PR 正文列出；该行写“已断言到缺陷出现前的最后一步”，由 Team Leader 决定是否先合并。
8. **用户可见变化**：无。只新增测试与一个权重条目，改一处 CI 注释；产品代码、页面、接口与文案都不变。

## 导航与历史

不适用：本任务不改地址、不加监听。测试只用 `page.goto` 打开 `#/events` 与 `#/journals`，并用页面上的分段按钮切换视图。

## 范围

- 新增 `packages/infra/test/http/business-events-gui.slow.test.ts`，包含设计决定 1 的四个用例（按设计决定 6 拆分时，用例 C、D 移到 `business-events-gui-2.slow.test.ts`）；
- 新增 `packages/infra/test/support/business-events-gui.ts`，放 HTTP 前置数据与公共页面步骤；
- `scripts/test-shard-weights.json` 增加该文件的条目；
- `.github/workflows/full.yml:22-24` 注释与新的分配一致。

## 入口参数与异常

不适用：本任务不新增或改动 URL / 查询参数。测试只读页面现有的 `company`、`view` 参数行为，不为参数异常加用例。

## 不在范围

- 产品代码与页面文案（发现缺陷按设计决定 7 处理）；
- 撤回（withdraw）、`failed` 状态、并发确认与幂等：已由应用层 `business-events.test.ts:408` 覆盖，不在 R8b 六行内；
- 390 px 与键盘全路径；
- 修改其他 `*gui*.slow.test.ts`、`trade-gui/` 支架、`vitest.config.ts`、`scripts/ci.ts`；
- 改分片数或 Full 工作流的步骤。

## 验收标准

“来源”列的用例名都是新增的计划名，开发可微调措辞，但须保留行名。环境统一为：真实 Chrome（Full 中为 runner 自带 Chrome，`ERP_E2E_BROWSER_CHANNEL=chrome`）、视口 1440 × 1000、教学模式关闭。

| 编号 | 验收 | 证据类型 | 平台 / 环境 | 来源 |
| --- | --- | --- | --- | --- |
| 1 | 现金服务收付：在页面新建“收款”现金服务（服务、金额），预览中显示命中的过账规则（`business.match`），点 `business.confirm` 后详情标题为来源单号 · `business.posted`，并有凭证“查看”按钮；再新建一张“付款”现金服务，同样到 `business.posted` | 真实 Chrome 断言 | Linux main Full（browser lane）；本机 Windows 送审前跑一次；中文 / 红色 | 新增：用例 A “cash service receive/pay and cancel”，步骤 `cash-receive`、`cash-pay` |
| 2 | 冲销：在第 1 条的收款详情点“取消现金服务”，编辑器显示原事件编号，预览后确认；冲销事件详情显示原事件链接，点链接后原事件状态为 `business.cancelled`，且不再显示“取消现金服务”按钮 | 真实 Chrome 断言 | 同上；中文 / 红色 | 新增：用例 A 步骤 `cash-cancel` |
| 3 | 统计：新建统计事件（代码、数量为负的六位小数，如 `-3.125`，单位），预览显示 `business.noGl`，确认后状态为 `business.recorded`，详情没有凭证“查看”按钮；另用 HTTP 读凭证列表，条数不变 | 真实 Chrome 断言 + HTTP 补充断言 | 同上；中文 / 红色 | 新增：用例 B “statistics records evidence without GL” |
| 4 | 清账匹配：前置为清算用途科目与两张已过账凭证（HTTP 写入）；页面上新建清算匹配，选科目后未清项列出两行，两行都选中，预览后确认，状态为 `business.recorded`；再新建一次清算匹配并选同一科目，未清项为空 | 真实 Chrome 断言 | 同上；英文 / 绿色 | 新增：用例 C “clearing match reserves every selected line” |
| 5 | 待转转入：在凭证页新建并保存一张 `journal` 凭证，预览后点 `business.enqueue`；到业务事件页“待转队列”，该来源单号一行状态为 `business.pending`；另用 HTTP 读凭证列表，没有新增已过账凭证 | 真实 Chrome 断言 + HTTP 补充断言 | 同上；英文 / 绿色 | 新增：用例 D “transfer queue intake and confirm”，步骤 `queue-intake` |
| 6 | 待转确认：在第 5 条那一行（筛选为默认 `business.pending`）点“预览”，对话框按钮为 `business.transfer`；点确认，先等 POST 返回 2xx，再等页面打开的结果详情出现凭证“查看”按钮。确认不改筛选，原行离开 `pending` 列表是正常过滤，不算缺陷（“现状”第 6 条）。然后把 `business.queue` 筛选切到 `business.transferred`，按原来源单号找到同一行：状态为 `business.transferred`，该行没有预览与撤回按钮 | 真实 Chrome 断言 | 同上；英文 / 绿色 | 新增：用例 D 步骤 `queue-confirm` |
| 7 | 新文件进 `infra-browser` 项目，只在 Full 运行：`CI_TEST_LAYER=full` 时 `npx vitest list --project=infra-browser --filesOnly` 列出该文件；`CI_TEST_LAYER=pr` 时不列出 | 命令输出 | Windows 本机（Linux 由合并后 Full 体现，见第 9 条） | 新增；PR 正文附两次命令原文（在 `d78b3d4` 上试跑：`full` 列出现有 6 个文件，`pr` 无输出，两次退出码 0） |
| 8 | 权重与分配：`node scripts/ci.ts weights-check` 通过；新文件（拆分时两个）的权重按“证据要求”第 3 条从各自的 JSON 报告取得；“证据要求”第 4 条的脚本输出 `OK`，即各分片计划合计 ≤ 30124 | 命令输出 | Windows 本机 | 新增；PR 正文附命令与输出 |
| 9 | 启动阶段计时：新文件的日志里有 `browser` 与 `page` 两种阶段，`node scripts/ci.ts summary` 不报 “Missing browser startup phase timings” | 日志 | Linux main Full（合并后检查） | `scripts/ci.ts:362-368`；合并后由 Team Leader 记录 |
| 10 | 只改冲突域内的文件：`git diff --name-only <base>...<head>` 只含冲突域所列文件（4 个；拆分时 5 个） | `git diff` | — | PR 正文附原文 |

第 1–6 条以文案键定位与判定时，断言用 `business-labels.ts` 中该语言的文案（经测试里的 `t` 查表，不手写字符串），PR 正文“断言 → 来源”表逐条写到 `file:line`。

## 性能考虑

- **规模 / 热点**：每个用例只写几条前置数据（1 个服务、4 条过账规则、1 个清算科目、2 张凭证、1 张待转凭证），没有大数据量。
- **读写路径与索引**：不适用：不改产品代码与 schema。
- **查询次数**：不适用：不改接口。
- **分页**：不适用。
- **事务 / 锁 / 缓存边界**：不适用；用例间不共享页面或查询缓存（设计决定 4）。
- **前端开销**：不适用：页面不变。
- **预算与验证方式**：本任务只影响 Full 的 browser lane 耗时。约束是设计决定 6 的“各 browser 分片计划合计 ≤ 30124（当前最大分片）”，依据为“现状”第 3 条的试算；新文件自身不另设绝对耗时预算（实测前未知，不编造）。验证：本机 vitest 汇总行 + 重算分配；合并后第一次 main Full 的分片耗时由 Team Leader 记录。

## 可读性

- **热点文件**：无。两个新文件从零开始，按路线图 §5 ③ 都不是热点；`scripts/test-shard-weights.json` 只加一行；`full.yml` 只改注释。
- **结构要求**：测试文件只写四个用例与断言；前置数据（HTTP）与重复的页面步骤（打开页面、新建事件、预览并确认、读详情状态）放在 `business-events-gui.ts`，每个步骤一个小函数；不复制 `trade-gui/` 的函数，直接导入。用例 A–D 之间不共享可变状态。
- **验收**：PR 正文“可读性”一节按路线图 §5 填写两个新文件的行数与结构说明。

## 设计阶段质量项

- **UI**：`applicable`。本任务不改页面，但断言的是渲染结果。证据为四个用例在 1440 × 1000 下的真实 Chrome 断言（中文 / 红色、英文 / 绿色各两例），每行至少一张截图写入 `ERP_E2E_ARTIFACTS`；不涉及 390 px 与键盘全路径（设计决定 3，不在范围）。
- **功能边界**：`applicable`。测试文件只通过 HTTP（前置数据与补充断言）和页面与系统交互，不直接读写 SQLite；前置数据只写本用例自己的对象；失败边界是单个用例，不连带其他用例。产品缺陷按设计决定 7 记候选，不在本任务修。
- **性能计划**：`applicable`。关键路径是 Full browser lane 的分片耗时；工作量为 1 个新文件、4 个用例；预算与验证见“性能考虑”与设计决定 6。没有未确认的实质性 `to_confirm`。
- **类型**：`applicable`。两个新文件为 TS，使用原生类型；不新增 `.js` / `.mjs`。

## 证据要求

1. 真实 Chrome：按[路线图 §5 UI PR 证据清单](../roadmap.md#5-团队流程)执行，其中：
   - 第 7 项：PR 正文附“断言 → `file:line`”表，每条断言对到页面渲染位置（“现状”第 6 条所列）与 `business-labels.ts` 的文案行；数量类断言（未清项两行、凭证条数不变）另列产生数据的前置语句 `file:line`；
   - 第 8 项：取证前构建，`guiHarness` 每次在临时目录重新构建 `packages/web`，PR 正文写明这一点即可；
   - 第 9 项：不适用（不测 390 px，设计决定 3）；
   - 第 10 项：每个等待写目标状态本身（如详情标题出现 `business.posted`），带墙钟上限；属于必发请求的步骤（确认、转入）先等 POST 返回 2xx，再等 DOM。
2. **只能由真实 Chrome 证明的验收项**：第 1–6 条。几何类验收：无（不测布局）。
3. **测试在满载下的耗时**：构建与 Chrome 启动每文件一次（`guiHarness`）；每个新文件单独运行一次（`CI_TEST_LAYER=full`，见 `docs/ci.md:57`），同时写出 JSON 报告：

   ```text
   npx vitest run --project=infra-browser --maxWorkers=1 packages/infra/test/http/business-events-gui.slow.test.ts --reporter=default --reporter=json --outputFile=artifacts/mcf20-1.json
   npx vitest run --project=infra-browser --maxWorkers=1 packages/infra/test/http/business-events-gui-2.slow.test.ts --reporter=default --reporter=json --outputFile=artifacts/mcf20-2.json
   ```

   第二条只在拆分时运行。每个文件的权重用生产的 `fileWeights`（`scripts/ci.ts:74`，与 `weights` 命令同一取法：报告中该文件的 `endTime - startTime`，取整）从各自的报告读出：

   ```text
   node --input-type=module -e "import { readFileSync } from 'node:fs'; import { fileWeights } from './scripts/ci.ts'; console.log(fileWeights([JSON.parse(readFileSync(process.argv[1], 'utf8'))]))" artifacts/mcf20-1.json
   ```

   拆分时对 `artifacts/mcf20-2.json` 再运行一次。该命令在 `d78b3d4` 上用一个小测试文件的报告试过，输出形如 `{ 'packages/core/test/contracts/contracts.test.ts': 591 }`，退出码 0。PR 正文附每个文件的 vitest 汇总行原文与 `fileWeights` 输出；单个用例 > 2 s 的逐个写原因；不加大超时、不加重试。`artifacts/` 不提交。
4. **分配试算**：PR 正文附用实测权重重算 browser 分配的命令与输出。在仓库根目录把下面的脚本存为临时文件 `shard-plan.tmp.ts`（不提交），运行 `node shard-plan.tmp.ts`。脚本调用生产的 `selectShardFiles`（`scripts/ci.ts:224`，与 Full 同一规划模型），从磁盘列出全部 `*gui*.slow.test.ts`，打印 6 个分片各自的文件与权重合计；有文件缺权重或任一分片超过 30124 时打印 `FAIL`，退出码 1：

   ```ts
   import { readFileSync, readdirSync } from "node:fs";
   import { selectShardFiles } from "./scripts/ci.ts";

   const limit = 30124;
   const weights: Record<string, number> = JSON.parse(readFileSync("scripts/test-shard-weights.json", "utf8"));
   const dir = "packages/infra/test/http";
   const files = readdirSync(dir)
     .filter((name) => /gui.*\.slow\.test\.ts$/.test(name))
     .map((name) => `${dir}/${name}`)
     .sort();
   const projects = Object.fromEntries(files.map((file) => [file, "infra-browser"]));
   const missing = files.filter((file) => !(file in weights));
   for (const file of missing) console.log(`missing weight: ${file}`);
   let max = 0;
   for (let index = 1; index <= 6; index++) {
     const shard = selectShardFiles(files, weights, { shard: { index, count: 6 } }, projects);
     const total = shard.reduce((sum, file) => sum + (weights[file] ?? 0), 0);
     max = Math.max(max, total);
     console.log(`shard ${index}: ${total} = ${shard.map((file) => file.slice(dir.length + 1)).join(" + ")}`);
   }
   console.log(`max ${max} / limit ${limit}: ${missing.length || max > limit ? "FAIL" : "OK"}`);
   if (missing.length || max > limit) process.exitCode = 1;
   ```

   在 `d78b3d4` 上的输出（退出码 0）：

   ```text
   shard 1: 30124 = trade-gui-en-green-2.slow.test.ts
   shard 2: 25647 = trade-gui-zh-red-2.slow.test.ts
   shard 3: 9000 = trade-gui-smoke.slow.test.ts
   shard 4: 7615 = trade-gui-zh-red-1.slow.test.ts
   shard 5: 7529 = migration-gui.slow.test.ts
   shard 6: 6920 = trade-gui-en-green-1.slow.test.ts
   max 30124 / limit 30124: OK
   ```

   写作时另用两个空的占位文件试过拆分分支：未登记权重时列出两行 `missing weight` 并以 `FAIL`、退出码 1 结束；登记 15000 与 12000 后两文件各占一个分片，最大仍为 30124，`OK`。试完已删除占位文件并还原权重文件。开发把实测权重写进权重文件后运行同一脚本，附完整输出；结果为 `FAIL` 时按设计决定 6 处理（超过上限先拆分，拆分后仍超过则停下报 Team Leader）。
5. **无法判定**：第 7–9 条的命令出错或日志缺失时按失败处理；第 1–6 条在 Chrome 无法启动时按失败处理，不跳过。
6. **合并后检查**，按[团队章程 §3 第 8 项](../team-charter.md#3-完成定义dod)与 D585 执行：
   - 场景：本文件四个用例（六行）在合并后第一次覆盖该合并提交的 main Full 中通过，并满足第 9 条；运行环境为真实 Chrome（Full browser lane）；
   - 合并前门槛是证据计划完整：PR 正文写“合并后检查的证据计划”，六行各对应一个用例步骤；
   - 合并后的 main Full 不是合并前门槛；合并后由 Team Leader 在 PR 评论中记 run 链接与结论。#362 评论 7150062662 不改：按 D582，REFAC-31 的 R8b 在该评论中永久记为“未确认”，后续证据只记在本任务的 PR 中（[MCF-17](backlog/MCF.md)）。
7. **计划批准条件**（团队章程 §3 第 7 项）：开发者在 `plan.md` 开头复述：只改冲突域所列文件；`packages/web/src/` 不改；缺陷按 D565 记候选；不加超时或重试；分片合计 ≤ 30124，拆分后仍超过时停下报 Team Leader。PR 正文写“计划批准条件”一节。
8. 本机全量 web 测试：不适用（不改 `packages/web`）。
9. 构建来源、chunk 归属、Web 字节：不适用（不改会进打包产物的文件）。
10. 断言 → 来源对照（D591）：适用于本任务书所在的设计 PR；开发 PR 的“断言 → `file:line`”表见第 1 条。

## 设计自查（推送前勾选，路线图 §5 设计文档自查 1–14，另加可读性一项）

- [x] 1 事实断言有来源（否定性断言附检索命令：“现状”第 8 条、冲突域 e2e 检索）
- [x] 2 涉及进行中的 PR：无（本任务书只依赖已合并的 `d78b3d4`）
- [x] 3 依赖列与泳道说明一致（S26 泳道 D：任务书合并后开始）
- [x] 4 新增 CSS：无
- [x] 5 转述带上原限定语（R8b 原文见 [REFAC-31](REFAC-31-business-event-compute-split.md) 第 80、130 行）
- [x] 6 共享单文件 `scripts/test-shard-weights.json` 已在 S26 泳道 D 中列出；`full.yml` 注释为新增，送审时请 Team Leader 确认
- [x] 7 入口参数：不适用（不新增参数）
- [x] 8 改动条款已通读上下文：本任务书为新增，不改旧条款
- [x] 9 导航与历史：不适用，已说明
- [x] 10 几何类验收：无；不涉及 Demo 截图
- [x] 11 证明条款已在实际 base 上试过：分配试算（“现状”第 3 条）、验收第 7 条的 `vitest list` 与 `check-manifest` 已在 `d78b3d4` 上运行
- [x] 12 不改页面行为；受影响的 e2e 断言为“无”，附检索命令
- [x] 13 “可读性”一节已写（无热点文件）
- [x] 14 文中的命令已在当前 main 上实跑，输出附在 PR 正文
- [x] 15 已跑 `node scripts/slot/check-manifest.mjs`（输出附在 PR 正文）；门禁类验收已写出“无法判定”的处理
- [x] 16 已写满载耗时要求（每文件一次构建与启动、附耗时、> 2 s 写原因、不加超时或重试）；不涉及 Web 字节
- [x] 17 预算条款不矛盾：只有“分片合计 ≤ 30124”一条；不进打包产物
- [x] 18 设计阶段质量项四项已填写，没有未确认的 `to_confirm`
- [x] 19 每条验收写了证据类型与平台；受影响的文档已逐页写同步时点
- [x] 20 合并后检查已列场景与运行环境，并写明合并前门槛是证据计划完整
- [x] 21 PR 正文附“断言 → 来源”对照
- [x] 22 钉版本：不适用（本 PR 不钉 `docs/README.md`）
