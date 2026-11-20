# M1-R2a 贸易页教学提示：补齐与测试

- Sprint：S4　依赖：—（贸易线第一个）　建议分支：`trade-teaching-tests`
- 冲突域：web-ui:trade（主要是 `packages/web/test/trade-*.test.tsx`；只有缺提示的页面才改 `.tsx` 和 labels）
- 原任务：[M1-R2](M1-R2-trade-teaching-and-lists.md) 的教学部分

## 现状（main `2a23025`）

- UI-04 和 UI-06 已给付款与收款（`TradeSettlements.tsx`）、预付 / 贷项 / 专用纠错（`TradeAdjustments.tsx`）、贸易主数据（`TradeMaster.tsx`）加上 `TeachingTip`。
- 期间准入（`TradePeriodAdmission.tsx`）渲染在期末结账页内，由期末结账页的教学提示覆盖，本身没有提示。
- 只有 trade-settlements 和 trade-adjustments 有教学开 / 关的 Web 测试。

## 范围

- 期间准入组件增加一条简短提示：“准入只控制贸易单据能否在该期间记账，不结账”。中英文都要，教学关闭时不渲染。
- 补齐 Web 测试：贸易主数据、期间准入的教学开 / 关测试，提示出现 / 消失，中英键一致。
- 复核四个页面的提示内容，覆盖原任务列出的借贷方向、核销 / 折扣 / 取消规则和期间准入含义；缺的补上，不改已有文案的含义。

## 验收标准

1. 四个页面（付款与收款、纠错、主数据、期间准入）都有教学开 / 关 Web 测试。
2. 关闭教学后，边界说明、风险、必填信息、错误与警告仍然显示（UI-1 通用验收 7）。
3. 有改动的页面附教学开 / 关截图（中文 + 红、English + 绿）。只改测试的页面不需要截图。
4. PG-05：入口 JS 不变，CSS 合计不增，路由 chunk ≤ +15%。
5. 真实 Chrome 贸易场景在 PR head 上通过（有 `.tsx` 改动时）。
