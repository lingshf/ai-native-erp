# TINV-02 订单页：已开票 / 未开票数量与“开票”入口

- Sprint：S8（[计划](README.md#s8从订单开票--v070-回顾行动建议-v080)）　依赖：TINV-01（开票明细接口 `GET /api/v1/trade/orders/:orderId/invoicing` 与发票页 `fromOrder` 入口；见下“开工与评审门禁”）　建议分支：`tinv-02-order-invoice-entry`
- 冲突域：
  - web-ui:trade-orders：`TradeOrders.tsx`、`pages/trade-orders.css`、`ui/trade-order-labels.ts`、`packages/web/test/trade-orders.test.tsx`。
  - tests:trade-e2e：`packages/infra/test/support/trade-gui-scenario.ts` 与 `trade-gui-*.slow.test.ts`（端到端用例，见范围 4）。
  - 共享单文件：`scripts/test-shard-weights.json`（仅当新增测试文件；TINV-01 在前，见 [S8 泳道](README.md#s8从订单开票--v070-回顾行动建议-v080)）。
  - **不涉及**：契约、后端、存储、迁移、领域过账、发票页（都属 TINV-01）、`App.tsx`、`contrast.test.ts`、`components.css`。
- 类型：页面 + 端到端测试
- 优先级：P1（与 TINV-01 一起构成 S8 的产品功能）
- 来源：产品负责人选题；[S7 评审遗留 8](../reviews/S7.md#5-遗留项均不阻塞-v070)（“切换页面后筛选重置”没有直接用例，由下次修改订单页的任务补一条）。

## 现状（main `1bb9dbb`）

- 订单页查看已保存订单时，明细表（`packages/web/src/TradeOrders.tsx:1157` 起）只列订单行与金额，看不出每行已开多少发票、还剩多少；也没有去开票的入口。
- TINV-01 合并后，`GET /api/v1/trade/orders/:orderId/invoicing` 返回 `{ order, invoiced: [{ lineId, invoicedQuantity }] }`（`tradeOrderInvoicingSchema`）；`POST /trade/orders` 与 `GET /trade/orders/:orderId` 仍返回原 `tradeOrderSchema`，不含已开票数量。发票页可通过 `#/trade-invoices?company=<公司>&fromOrder=<订单号>` 带入草稿。

## 设计决定（产品负责人）

1. **数据来源**：订单页现有的保存（POST）与按订单号查询（GET）照旧解析 `tradeOrderSchema`。显示已保存订单的详情时（保存成功后，或查询到订单后），再请求一次开票明细接口，按 `lineId` 对应到明细行。该请求进行中两列显示占位、“开票”入口不可用；失败时用页面已有的 MessageBar 提示并可重试，订单本身照常显示。
2. **明细表加两列**：“已开票数量”（`invoicedQuantity`）与“未开票数量”（`quantity − invoicedQuantity`，按 `decimal` 精确相减，不经浮点）；未开票为 0 的行在该列显示“已开完”徽标（复用现有徽标组件，不新增颜色）。390 宽度下沿用该表现有的横向滚动 / 换行方式，不另设布局。
3. **“开票”入口**：在已保存订单的详情操作区放一个链接式按钮“开票”，目标为 TINV-01 的入口地址（带当前公司与订单号），用 `Link`，不用 `window.location`。全部行都已开完时禁用，并在旁边说明原因（不是只靠 `title`）。键盘可达，顺序在详情现有操作之后。
4. **不改列表**：订单列表不加开票状态列，不加按开票状态筛选（需要按页聚合，另议）。
5. **筛选重置用例**（S7 遗留 8）：补一条 web 用例：在订单列表设置伙伴 / 方向 / 日期筛选后离开订单页，再返回，筛选控件为空，列表请求不带 `party`、`side`、`from`、`to`。只补用例；若用例失败，说明 TORD-05 的行为与其任务书不符，停下报告设计角色，不在本任务里改筛选逻辑。

## 开工与评审门禁

- **只有开工可以并行**：TINV-01 开工后，本任务可以按 [TINV-01 任务书](TINV-01-invoice-from-order.md)写定的接口与 mock 形状（TINV-01 范围 4）并行开发，只改本任务冲突域内的文件，只跑 mock fetch 的 web 测试。
- **依赖验收与权重改动串行**：TINV-01 合并、且覆盖其合并提交的 main Full 变绿之前，本任务不得改动 `scripts/test-shard-weights.json`，不跑依赖真实接口的路径（端到端用例、真实 Chrome 取证），不得请求评审。门禁满足后依次：rebase 到该 main → 登记权重（如有新增测试文件）→ 在独占时段跑端到端用例并取证 → 请求评审。
- 若 TINV-01 评审中接口、响应形状或入口地址有变，以合并后的 main 为准调整本任务。

## 范围

1. 订单详情明细表两列与“已开完”徽标（决定 1、2）；中英文 labels。
2. “开票”入口与禁用说明（决定 3）。
3. web 用例（mock 形状按 TINV-01 范围 4）：保存后与查询后各请求一次开票明细接口；明细请求失败时的提示与重试；两列取值（含部分开票、全部开完）、入口链接地址、全部开完时禁用与说明、筛选重置（决定 5）。
4. 端到端（真实 Chrome，`tests:trade-e2e`）：在现有贸易 GUI 场景中追加一条路径：新建订单 → 订单页“开票” → 发票页带入 → 填外部发票号 → 预览 → 过账 → 回订单页，已开票 / 未开票数量更新；再开一次至全部开完，入口变为禁用。优先追加到现有场景与用例文件；只有现有文件放不下时才新增文件，新增时登记权重。

## 不在范围

- 发票页、契约、后端（TINV-01）。
- 订单列表开票状态、按开票状态筛选、多订单合并开票。
- `components.css` 第 3–4 行的过时注释（[S7 评审遗留 1](../reviews/S7.md#5-遗留项均不阻塞-v070)，本任务不改该文件）。

## 验收标准

1. 范围 3 的 web 用例全部通过；未开票数量用精确十进制相减（含小数数量的用例）。
2. 范围 4 的端到端用例（`*.slow.test.*`，真实 Chrome）按下面两步验证；现有贸易 GUI 用例不删除、不削弱、不跳过（D11）：
   - **请求评审前**：开发者在独占时段内用 PR head 跑该用例与现有贸易 GUI slow 用例，保存完整日志（首尾为完整 SHA 与空的 `status --porcelain --untracked-files=all`），附进 PR 正文；
   - **合并后**：覆盖合并提交的 main Full（push 到 main 时触发，`CI_TEST_LAYER=full`）通过。失败时按[路线图 §5 合并后动作](../roadmap.md#5-团队流程)处理。
   - 默认 PR CI（`verify`，`CI_TEST_LAYER=pr`）排除 `*.slow.test.*`（`vitest.config.ts:11`），不会运行该用例；它只证明非 slow 用例。**不得为过验收修改 `CI_TEST_LAYER`、`vitest.config.ts` 或 workflow**；若认为需要在 PR 上跑 Full，报告协调者另行授权，不自行改 CI。
3. 中英文、红 / 绿两主题、1440 / 390 两种宽度下明细两列与入口完整可用；键盘可从订单列表进入详情并触发“开票”。
4. 满足 [UI-1 通用验收标准](README.md#ui-1界面逐步改进) 1–9；PG-05 口径同 S7；真实 Chrome 证据按 [路线图 §5 UI PR 证据清单](../roadmap.md#5-团队流程)，在独占时段内取证（含 D234 的停用与回执）。
5. 只改本任务冲突域内的文件；没有迁移、没有 `package.json` / lock 变化。
