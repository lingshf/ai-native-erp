# M1-R1a 非库存订单录入页

- Sprint：S4　依赖：—　建议分支：`trade-order-entry`
- 冲突域：
  - **web-ui:trade-orders**（新增）：`src/TradeOrders.tsx`、`src/ui/trade-order-labels.ts`、`src/pages/trade-orders.css`、`test/trade-orders.test.tsx`；
  - **web-ui:shell**：只在 `App.tsx` 追加一个 `lazy()` 路由和一个导航入口，以及对应的 `shell.*` 导航 label。
- 外壳串行：M1-R1a → [UI-09b](UI-09b-shell-brand-css.md) → [UI-10a](UI-10a-shell-preference-messagebar.md) → [UI-09g](UI-09g-global-element-rules.md)。
- 与 web-ui:trade 不相交：不改现有贸易页面和 `trade-labels.ts`，所以可与贸易线并行。
- 原任务：[M1-R1](M1-R1-trade-order-entry.md)，拆为 R1a（本任务）与 [R1b](M1-R1b-trade-order-gui-e2e.md)。

## 设计决定 P2（产品负责人）：按现有 API 收窄范围

现有订单 API 只有 `POST /api/v1/trade/orders`（创建）和 `GET /api/v1/trade/orders/:orderId?company=`（按号查询），**没有列表接口，也没有订单预览接口**（见 `packages/infra/src/http/trade-documents.ts`）。M1-R1“只用现有 API、不改后端”的约束不变，所以：

- 原“订单列表 >100 行虚拟滚动”不做，改为“按订单号查询”。订单列表要等新增列表 API，另立任务，不在本 Sprint。
- 原“服务端预览金额”改为：保存前**不显示**任何客户端计算的税额或合计；保存成功后显示服务端返回的每行 `net`、`tax`、`gross` 和合计。不在客户端算税（PG-01）。
- 订单行上限 100（schema 规定），不需要虚拟滚动。

## 范围

- 新页面“采购 / 销售订单”，挂在贸易导航组下，懒加载路由。页面包括：
  - 表头：订单号、方向 AP / AR、伙伴、币种、订单日期、价格含税、舍入；
  - 行：商品、税码、数量、单价、折扣，可增删行；
  - 保存：调用 `POST /api/v1/trade/orders`。成功后展示服务端返回的订单与金额，并提示“可在发票页按订单行匹配开票”；
  - 查询：输入订单号，调用 GET 展示已有订单（只读）。
- 伙伴、商品、税码选项来自现有主数据接口，与发票页相同。
- 未保存的输入离开时有守卫，沿用各页现有的 `onGuard` 机制。
- 中 / 英、红 / 绿、键盘可完成全部操作，有教学提示（如“订单不过账；开票时按订单行匹配”）。使用 UI-1 的共享组件与 token。
- 把新页加入 [README 页面归属表](README.md#ui-1界面逐步改进)（负责任务 M1-R1a）。

## 验收标准

1. 满足 [UI-1 通用验收标准](README.md#ui-1界面逐步改进) 2–9，新页面无“改前”图，第 1 条只交改后截图。
2. 纯键盘可录入并保存一张 PO，再在发票页按该 PO 的订单行匹配开票。这一步在 Web 测试或 PR 中的真实 Chrome 录屏 / 截图中证明，E2E 改造在 R1b。
3. Web 测试覆盖：
   - 保存成功后显示服务端金额；
   - 服务端校验错误（如重复订单号、未知税码）按字段显示；
   - 离开守卫；
   - 中英 label 键一致；
   - 教学开 / 关；
   - 保存前页面上没有客户端计算的金额。
4. **PG-05**：
   - 入口 JS ≤ +0.5 kB（gzip），只增加 `lazy()` 与导航；
   - 新路由 chunk ≤ 8 kB（gzip）；
   - CSS 合计 ≤ +1.0 kB；
   - 不新增运行时依赖；
   - 请求次数：主数据各 1 次，保存 1 次。
5. 现有 E2E 不改，导航 `nav a[href]` 只追加，不改动已有入口。
