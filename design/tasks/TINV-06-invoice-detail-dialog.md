# TINV-06 发票详情只读对话框

- Sprint：S11（[计划](S11.md)）　依赖：S11 定稿 PR 合并（D339）　建议分支：`tinv-06-invoice-detail-dialog`
- 冲突域（逐个列文件）：
  - web-ui:trade：`packages/web/src/TradeInvoices.tsx`（只改列表“外部单号”单元格，第 1271 行，以及引入详情组件）；新增 `packages/web/src/TradeInvoiceDetail.tsx`（详情对话框）；`packages/web/src/pages/trade-invoices.css`（只追加详情与触发按钮的规则）；`packages/web/src/ui/trade-labels.ts`（只追加 `tinv.detail.*` 键，中英各一份）；
  - 测试：新增 `packages/web/test/trade-invoice-detail.test.tsx`；`packages/infra/test/support/trade-gui-scenario.ts` 新增详情步骤，由现有 `trade-gui-*.slow.test.ts` 调用；
  - 共享单文件：`trade-gui-scenario.ts`（S11 只有本任务改）；`scripts/test-shard-weights.json`（只追加本任务新增文件的条目，顺序见 [S11 泳道](S11.md#泳道) C 线）；
  - **不涉及**：契约（`packages/core/src/contracts/`）、HTTP 路由、过账与领域代码、迁移；`App.tsx`、`ui/labels.ts`、`theme/shell.css`（UI-14 的冲突域）；`Journals.tsx` 与 `pages/journals.css`（不从中导入，见设计决定 1）；`leave-guard-history.ts` 与发票草稿逻辑。
- 类型：页面
- 优先级：P1（S11 产品目标；接口已有、界面缺失）

## 现状（main `ad70189`）

- 发票列表每行 8 列：方向、伙伴、外部单号、记账日、到期日、匹配状态、来源订单、价税合计（`packages/web/src/TradeInvoices.tsx:1269–1276`）；外部单号是纯文本 `<td>{row.externalNo}</td>`（`:1271`）。行高固定 44 px（`:1268`），列表为虚拟滚动，只渲染可见行（`:1261–1283` 的 `before` / `after` 占位行）；滚动容器 `tabIndex={0}`（`:1244`）。
- 详情接口已存在：`GET /api/v1/trade/invoices/:documentId?company=`（`packages/infra/src/http/trade-documents.ts:204–212`，响应经 `tradeInvoiceDetailSchema.parse`，`:210`）；OpenAPI `getTradeInvoice`，错误码 400 / 403 / 404 / 405 / 500 / 503（`packages/core/src/contracts/trade-documents.ts:722–733`）。
- 响应 `tradeInvoiceDetailSchema`（`trade-documents.ts:411–445`）：`document`（抬头、合计、`controlAccount`、`journalId`、`lines`，行字段见 `documentLine` `:390–410`）、`calculation`、`matches`、`receipt`、`openItem`（`openItemSchema` `:250`，自带 `remainingGross` `:278` 与 `status` open / settled / cancelled）、`settlements`（`tradeSettlementReceiptSchema` `:179`，每张收付款含 `allocations[]`，按 `itemId` 对应未结项）、`actions`（`tradeActionListSchema` `:386`）。`settlements` 与 `actions` 数组没有 `.max()`（`:386`、`:413`）。
- 服务端 `detail()`（`packages/core/src/application/trade-documents.ts:1247–1264`）在一次只读事务内调用 4 个仓储方法（单据、动作、未结项、收付款，`:1252–1261`），成功路径共执行 **6 条 SQL**：`tradeDocument` → `document()` 抬头 1 条与行 1 条（`packages/infra/src/storage/trade-documents.ts:233–243`、`:648–649`）；`tradeItemActions` 1 条（`:282–287`）；`openItem` 未结项 1 条与控制段 1 条（`:781–788`，段查询 `:200–206`）；`itemSettlements` 1 条（`:512–517`）。条数与发票行数无关；`documentId` 不存在时第 1 条后即返回 404。`documentId` 先按 `/^[0-9a-f-]{36}$/` 校验（`:1249–1250`）。
- web 端没有调用该接口：`git grep -n "tradeInvoiceDetailSchema\|/trade/invoices/\${" -- packages/web/src` 0 处命中；唯一的 `/api/v1/trade/invoices/…` 调用是 `preview`（`TradeInvoices.tsx:559`）。
- 现有模态写法：`Modal`（`packages/web/src/Journals.tsx:1217–1283`）——`showModal()` 后聚焦对话框（`:1232–1233`），`onCancel` 与 Esc 关闭（`:1243–1251`），Tab 在对话框内循环（`:1252` 起）。`Journals.tsx` 在模块顶层导入 `./pages/journals.css`（`:37`）。
- 离开确认：发票页用 `guardHistory`（`TradeInvoices.tsx:217`），草稿 dirty 时由 `window.confirm` 询问（`:216`）；草稿存于 sessionStorage（`:152`、`:186–191`）。
- 中文标签都在 `packages/web/src/ui/trade-labels.ts`，由 `ui/labels.ts:10` 静态导入，因此进入入口块；中英键集合由 `packages/web/test/ui.test.ts:16–17` 校验一致。

## 设计决定（产品负责人）

1. **只读模态对话框，新组件**：新文件 `TradeInvoiceDetail.tsx` 按 `Journals.tsx` `Modal` 的同一写法实现（`showModal()`、打开即聚焦、Esc / `onCancel` 关闭、Tab 循环），**不从 `Journals.tsx` 导入**：导入会把 `Journals.tsx` 模块与 `journals.css`（`:37`）带进发票页的路由块。不新增路由。
2. **不改地址栏、不加监听**：打开 / 关闭不调用 `navigate`、`pushState`、`history.go`，不注册 `popstate` / `hashchange` / `beforeunload`，不经过离开确认（与 TINV-05 决定 5 的理由相同）。可接受的限制：刷新后详情关闭；不能把详情链接发给别人（深链接不在本 Sprint，见 [S11“不在本 Sprint”](S11.md#不在本-sprint)）。
3. **触发**：外部单号单元格内放一个 `<button type="button">`，文字仍是外部单号，`aria-haspopup="dialog"`，可访问名称为“查看发票 {外部单号}”（新键）；外观为链接样式，不改变 44 px 行高与列宽。鼠标点击、Enter、Space 打开。
4. **每次打开请求一次**：用 `useQuery`，键为 `["trade-invoice", company, documentId]`，`staleTime` 为 0，打开时取最新数据（未结项余额与核销可能在别的页面刚改过）。关闭后不保留轮询。对话框打开时页面其余部分 inert（模态），不能切换公司。
5. **显示内容**（只用 `tradeInvoiceDetailSchema` 已有字段）：
   - 抬头：方向、伙伴、外部单号、记账 / 单据 / 税 / 到期日、币种、控制科目、匹配状态（`document.poMatch`）、例外原因（有值时）、来源订单（`orderId`，**纯文本**，不做链接：列表行已有来源订单链接 `SourceOrderCell` `TradeInvoices.tsx:1032`，对话框内不引入第二条站内导航）；
   - 行：行号、产品、数量、单价、折扣 %、净额、税额、价税合计、匹配结果（`line.matchStatus`）；行表格在自身滚动容器内横向滚动；
   - 合计：净额、税额、价税合计（`document.net` / `tax` / `gross`）；
   - 未结项：状态（`openItem.status`）与未结余额（`openItem.remainingGross`）；
   - 核销与调整记录：收付款按 `postedAt` 列出日期、`sourceRef`、本发票对应 allocation（`itemId` = `openItem.itemId`）的 `gross`、`cash`、`discount`；动作按 `receipt.postedAt` 列出日期、类型（`receipt.kind`）、金额（`receipt.gross`）、`receipt.sourceRef`。只显示，不提供任何操作按钮。没有记录时显示空态文案。
   - 金额统一用现有 `formatMinor(…, language, company.scale)`。
6. **关闭**：Esc、“关闭”按钮或 `cancel` 事件关闭；焦点回到触发按钮。若该行在关闭时已不在渲染范围（理论上模态期间不会滚动），焦点回到列表滚动容器（`:1244`）。筛选、已加载的页、滚动位置与草稿都不变。
7. **加载与错误**：加载中显示加载状态并保持可关闭；失败显示 `MessageBar` 错误（区分 404“发票不存在或已不在本公司”与其他错误）和“重试”按钮；重试只重发同一请求。
8. **教学模式**：开时在对话框顶部显示一段 `TeachingTip`：发票过账生成一张凭证（显示 `document.journalId`），借贷落在控制科目 `controlAccount`，同时生成一个未结项；付款 / 收款核销减少未结余额。关时不渲染。
9. **用户可见变化**（PR 正文须有同名一节）：① 发票列表外部单号变为可点击按钮；② 点击或 Enter / Space 打开只读详情对话框，显示抬头、行、合计、未结项余额与核销 / 调整记录；③ Esc 或“关闭”返回列表，焦点回到该按钮；④ 失败时显示错误与重试；⑤ 教学模式开时显示一段说明。地址栏、离开确认与草稿行为不变。

## 导航与历史

不改历史、不加监听（设计决定 2）。对话框打开时浏览器“后退”按现有页面行为处理：草稿干净时直接离开发票页，对话框随页面卸载；草稿 dirty 时由现有 `guardHistory`（`TradeInvoices.tsx:217`）弹一次确认，取消后地址、页面、草稿不变，对话框保持打开；继续则离开。这一行为来自现有闸门，本任务只验证不回归（验收 9）。

## 范围

1. `TradeInvoiceDetail.tsx`：对话框、数据请求、错误与重试、教学说明。
2. `TradeInvoices.tsx:1271`：外部单号改为触发按钮；页面持有“当前打开的 `documentId`”状态。
3. `trade-invoices.css`：触发按钮与对话框规则（只追加；写明特异度与层叠结果，路线图 §5 设计文档自查 4）。
4. `trade-labels.ts`：新增 `tinv.detail.*` 键，中英齐全。
5. 测试与场景步骤（见验收）。

## 入口参数与异常

不涉及 URL、查询或路径参数（设计决定 2）。`documentId` 来自列表行，不来自地址栏；仍按接口错误逐项写：

| 参数 | 情形 | 表现（提示文案键） | 恢复路径（可操作） |
| --- | --- | --- | --- |
| `company` | 当前公司（列表所用）；模态期间不能切换 | — | — |
| `documentId` | 格式非法（400，理论上不会出现，id 来自列表） | `tinv.detail.error` + 错误详情 | “重试”；“关闭”回列表 |
| `documentId` | 不存在（404 `NOT_FOUND`，例如别处已改公司数据） | `tinv.detail.notFound` | “关闭”回列表；列表可刷新 |
| — | 其他失败（网络、500、503） | `tinv.detail.error` | “重试” |
| — | 只有一个账套时 | 同上，恢复路径不依赖切换公司 | “重试”或“关闭” |

## 不在范围

- 深链接 `?invoice=`；在详情内跳转来源订单、凭证或未结项页；任何写操作（核销、贷项、反向）；打印 / 导出。
- 改契约或给 `settlements` / `actions` 加上限；改列表其他列。
- 对话框内分页（核销与动作记录全部显示；见“性能考虑”）。

## 验收标准

1. 只调用现有 `GET /api/v1/trade/invoices/:documentId`；`git diff` 中 `packages/core/src/contracts/` 与 `packages/infra/src/http/` 无改动。
2. jsdom 用例（`trade-invoice-detail.test.tsx`），每条附用例名：采购（AP）与销售（AR）各一；有 / 无来源订单各一（有时来源订单为纯文本，对话框内无 `<a>`）；部分核销（未结余额 = `openItem.remainingGross`，核销记录显示本发票 allocation 金额）；有贷项或反向动作（动作记录显示类型与金额）；无记录时空态；行表格表头恰为设计决定 5 的 9 列，并按其顺序（逐个断言 `th` 文字）。
3. 错误：404 显示 `tinv.detail.notFound`；500 显示 `tinv.detail.error`，“重试”后成功显示内容；加载中可关闭。
4. 键盘与焦点：Tab 到外部单号按钮，Enter 与 Space 都能打开；打开后焦点在对话框内，Tab / Shift+Tab 循环；Esc 关闭，焦点回到触发按钮；`history.length` 与 `location.hash` 打开前后相同，`window.confirm` 未被调用。
5. 关闭后筛选栏值、已加载页数与草稿 sessionStorage 值不变（用例断言前后相等）。
6. 每次打开发出一次请求：同一发票关闭再打开，请求计数加 1。
7. 中 / 英、红 / 绿两主题下文本与对比度满足 [UI-1 通用验收](README.md#ui-1界面逐步改进) 1–9；新增标签中英键集合一致（`ui.test.ts:16–17` 通过）。教学模式开时显示说明，关时不渲染（用例断言）。
8. 真实 Chrome：见“证据要求”中的按视口断言表，全部由 `trade-gui-scenario.ts` 新增步骤执行并附日志。
9. 详情打开时按真实浏览器“后退”（`page.goBack()`）：草稿干净时离开发票页、`dialog` 事件 0 次；草稿 dirty 时 `dialog` 事件恰好 1 次，取消后 URL、页面与草稿不变，继续后到达目标页。
10. 现有测试与 E2E 不删除、不削弱、不跳过（D11）；新增 Vitest 文件在 `scripts/test-shard-weights.json` 登记权重并通过 CI-01 守卫。

## 性能考虑

- **规模 / 热点**：单张发票最多 100 行（`documentLine.lineNo` max 100，`trade-documents.ts:392`）；核销与动作记录数取决于该发票的历史，契约无上限（`:386`、`:413`），常见为个位数。
- **读写路径与索引**：只读；服务端沿用现有 `detail()`：4 个仓储方法、成功路径 6 条按主键 / 外键的 SQL（见“现状”），不新增索引，不改仓储代码。
- **查询次数**：每次打开 1 个 HTTP 请求、服务端 6 条 SQL（4 个仓储方法），与行数无关；验收只看 HTTP 请求数（每次打开恰好 1 个），不对 SQL 条数设断言；列表本身的请求不变。
- **分页**：不适用（单张发票详情）。核销 / 动作记录全部渲染；推断：单张发票的历史量级不需要虚拟滚动，若出现上百条再另立任务。
- **事务 / 锁 / 缓存边界**：服务端单个只读事务；前端每次打开取最新数据（设计决定 4），不跨打开缓存。
- **前端开销**：对话框组件进入发票页路由块；新增标签进入入口块（`ui/labels.ts:10` 静态导入 `trade-labels.ts`）。
- **预算与验证方式**：
  - **详情热读 p95**：**未测**。理由：接口与服务端实现不改，本任务只新增调用方；每次用户操作 1 个请求。
  - **PG-05 前端体积（必须测）**：按 S10 口径（base 为 PR 实际 base 的 gzip-9，数字绑定最终送审 head）报告入口块、发票页路由块与 CSS 的增量。预算：入口块 ≤ +0.4 kB（只来自新增标签）；发票页路由块 ≤ +3 kB；CSS ≤ +0.4 kB。超出时 PR 正文说明原因，由评审决定是否接受（同 D284 / D295 的处理）。

## 证据要求

- 真实 Chrome 与 E2E：按[路线图 §5 UI PR 证据清单](../roadmap.md#5-团队流程) 1–9 项，请求评审前逐项勾选；第 7 项列出新增步骤中每条文本断言 → 组件或 schema `file:line`，金额 / 行数断言另列 seed 语句 `file:line`。
- 只能由真实 Chrome 证明的验收（按视口逐行，路线图 §5 设计文档自查 10）：

  | 视口 | 测量 | 阈值或比较方式（依据） | 来源 |
  | --- | --- | --- | --- |
  | 390 | 详情打开时页面级 `document.documentElement.scrollWidth <= window.innerWidth` | 必须成立（证据清单 9） | 新增 `trade-gui-scenario.ts` 详情步骤 |
  | 390 | 对话框 `getBoundingClientRect().width` | ≤ `window.innerWidth`；行表格在其滚动容器内横向滚动（容器 `scrollWidth > clientWidth` 时页面级宽度仍满足上一行） | 同上 |
  | 1440 | 对话框宽度 | 不设固定上限；行表格**全部 9 列**（行号、产品、数量、单价、折扣 %、净额、税额、价税合计、匹配结果，同设计决定 5）都渲染且无横向滚动（`scrollWidth <= clientWidth`），并逐列断言 9 个 `th` 的文字与顺序；依据：1440 下内容区宽度足够。实测不满足时停下报告设计角色，不删列 | 同上 |
  | 1440、390 | 打开前与关闭后：列表滚动容器 `scrollTop`、`location.hash`、发票草稿的 sessionStorage 值 | 前后相等 | 同上 |
  | 1440、390 | Playwright `dialog` 事件计数（打开 → 关闭全过程） | 0 | 同上 |
  | 1440 | 列表各列 `th` 宽度 | 打开前与关闭后相等；base 与 head 相比，外部单号列宽差 ≤ 1 px（按钮不改变列宽） | 同上；base 对比用配对截图 |
  | 1440、390 | 关闭后 `document.activeElement` | 是该行的外部单号按钮 | 同上 |
  | 1440 | 验收 9 的后退三种情形 | `dialog` 次数 0 / 1；取消后 URL、页面、草稿不变；继续后到达目标页 | 同上 |

- PG-05：见“性能考虑”，数字绑定最终送审 head。

## 设计自查（推送前勾选，路线图 §5 设计文档自查 1–10）

- [x] 1 事实断言有来源（否定性断言附检索命令；肯定性断言附 `file:line` 与执行条件）
- [x] 2 无进行中的 PR 涉及同一文件（定稿时 `gh pr list --state open` 只有 Dependabot #10、#11、#16，均不改这些文件）
- [x] 3 依赖列与泳道说明一致
- [x] 4 新增 CSS 要求开发者写明特异度与层叠结果（范围 3）
- [x] 5 转述带原限定语
- [x] 6 共享单文件已列入泳道
- [x] 7 入口参数已逐个列异常（不涉及 URL，按接口错误列）
- [x] 8 改动条款已通读上下文
- [x] 9 “导航与历史”已写机制与限制
- [x] 10 几何类验收已按视口逐行列表
