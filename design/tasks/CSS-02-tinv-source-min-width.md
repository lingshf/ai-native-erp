# CSS-02 删除“来源订单”列冗余的 `min-width: 8ch`

- Sprint：S10（[计划](S10.md)）　依赖：TINV-05（同一 CSS 文件；TINV-05 合并且覆盖其合并提交的 main Full 变绿之后才开工）　建议分支：`css-02-tinv-source-min-width`
- 冲突域（逐个列文件）：
  - web-ui:trade：`packages/web/src/pages/trade-invoices.css`（只删第 172 行 `min-width: 8ch;`，必要时改第 166–170 行注释）；
  - 共享单文件：`trade-invoices.css`（与 TINV-05 共享，本任务在后，见 [S10 泳道](S10.md#泳道)）；
  - **不涉及**：`TradeInvoices.tsx`；第 173 行 `white-space: normal`；第 177–179 行 `td.tinv-source { position: relative }`（D293 溢出修复）；第 180–190 行链接的 26ch 规则；任何测试期望值。
- 类型：CSS 清理（不改外观）
- 优先级：P3（S9 评审遗留 2，D295 超预算的后续；不影响功能）
- **状态：结案（不合并，D325）**，保留 `min-width: 8ch`，见文末“结案（D325）”。

## 现状（main `f943b8b`）

- `packages/web/src/pages/trade-invoices.css:171–174`：`.trade-invoices .tinv-source { min-width: 8ch; white-space: normal; }`。
- 这条规则同时作用于表头与单元格：表头 `th` 也带 `tinv-source` 类（`packages/web/src/TradeInvoices.tsx:1130`），单元格见 `:1041`。
- 有来源订单的行，列宽由链接的 `width: 26ch` 决定（`trade-invoices.css:180–182`），此时 8ch 的最小宽度不起作用（#181 正文，[S9 评审 §5](../reviews/S9.md#5-遗留项均不阻塞-v090) 第 2 项）。
- **推断，未验证**：列表里所有行都是“—”（没有任何来源订单）时，没有 26ch 的链接，列宽由表头文字与“—”决定，此时 8ch 可能仍起作用（中文表头“来源订单”约 4 个全角字，宽度接近 8ch）。所以“冗余”只在有链接时成立，本任务必须先证明全为“—”时同样不变。
- #181 的 PG-05：CSS +106 B，超预算 6 B（D295 接受）。

## 设计决定（产品负责人）

1. 只删 `min-width: 8ch;` 一行；同一规则块内的 `white-space: normal` 保留（覆盖 `.grid td` 的 `nowrap`，见第 170 行注释）。
2. **先证明，再删除**：验收 2 的全部截图像素差为 0 才算完成。任何一组像素差不为 0（尤其是“全部为—”的列表），**停下报告设计角色**，附配对图与像素差日志；不改其他规则来抵消差异。这是本任务的正常结案路径之一，不需要合并任何 PR：协调者以决定编号确认“保留”，已开的 PR 不合并关闭；设计角色把 S9 遗留 2 改为“不冗余，保留”，并在任务表把状态写为“结案（不合并，D…）”。该结案满足 DEMO-10 的门禁，规则见 [S10“不合并结案与门禁解锁”](S10.md#不合并结案与门禁解锁)。
3. **用户可见变化**：无（外观不变）。PR 正文“用户可见变化”写“无”，并附像素差证据。

## 导航与历史

不适用：只改一条 CSS 声明，不涉及导航、历史或全局监听。

## 范围

1. 删除 `trade-invoices.css:172`。
2. 如第 166–170 行注释提到最小宽度，同步改写；否则不动注释。

## 入口参数与异常

不适用：不涉及 URL、查询或路径参数。

## 不在范围

- 改变列宽、行高、换行或截断规则；改 `TradeInvoices.tsx`；改 `sourceOrders()` 断言的期望值。

## 验收标准

1. `git diff` 只有 `trade-invoices.css` 一个文件，删除一行声明（加可选的注释改动）。
2. **像素差为 0**（真实 Chrome，base 为 PR 实际 base，head 为送审 head）：发票页已过账列表区域，红 / 绿两主题 × 中 / 英 × 1440 / 390，以下两种列表各一组：
   - (a) 至少一行有来源订单（含 60 字符长单号，同 `trade-gui-scenario.ts` `sourceOrders()` 的 `AR-LONG-SO`）；
   - (b) 所有行都是“—”（新账套只过账无订单的发票）。
3. 现有真实 Chrome 断言不改、全部通过：`sourceOrders()`（`packages/infra/test/support/trade-gui-scenario.ts:1338` 起，含 `:1389–1397` 的行高、行数、单元格宽度与页面宽度断言）。
4. PG-05：CSS gzip-9 相对 PR 实际 base 减少（给出字节数）；JS 字节不变。
5. 现有测试与 E2E 不删除、不削弱、不跳过（D11）；无 `package.json` / lock 变化。

## 性能考虑

- 规模、读写路径、索引、查询次数、分页、事务 / 缓存：不适用（只删一条 CSS 声明）。
- **前端开销**：CSS 略小，渲染不变。
- **预算与验证方式**：PG-05 前端体积必测（验收 4），base 为 PR 实际 base，数字绑定最终送审 head。

## 证据要求

- 真实 Chrome：按[路线图 §5 UI PR 证据清单](../roadmap.md#5-团队流程) 1–9 项，请求评审前逐项勾选。
- **只能由真实 Chrome 证明的验收项**（jsdom 不做布局，mock 测试不能替代）：
  - 验收 2 (a)(b) 的像素差：取证步骤写在 PR 正文，(b) 所需的“全部为—”列表由取证脚本 seed，seed 语句给出 `file:line`；
  - 390 px 页面级 `document.documentElement.scrollWidth <= window.innerWidth`：沿用 `sourceOrders()` `:1395–1397`，并在 (b) 的列表上同样断言。

## 设计自查（路线图 §5 设计文档自查 1–9）

- [x] 1 事实断言有来源；“全部为—时 8ch 可能起作用”标为推断
- [x] 2 不涉及进行中的 PR
- [x] 3 依赖列与泳道说明一致（TINV-05 之后）
- [x] 4 不新增 CSS；删除后的层叠结果：`.tinv-source` 只剩 `white-space: normal`，特异度 (0,2,0) 仍覆盖 `.grid td` (0,1,1)
- [x] 5 覆盖类断言给出 `file:line`
- [x] 6 共享单文件 `trade-invoices.css` 已列入泳道
- [x] 7 不涉及入口参数
- [x] 8 改动条款已通读上下文
- [x] 9 不涉及导航与历史

## 结案（D325）

按设计决定 2 结案，不合并，保留 `min-width: 8ch`（main 上现为 `packages/web/src/pages/trade-invoices.css:182`）。S9 遗留 2 改为“不冗余，保留”。

- **取证**：D324 独占时段，chrome 通道，head `665ce62`、base `108684d`（TINV-05 #189 合并后的 main）。
- **结果**：16 对截图中，(a) 的 8 对与 (b) 1440 的 4 对差异为 0；(b) 390 的 4 对不为 0：
  - 中文红 / 绿：各 31281 px，卡片高 549 → 582；
  - 英文红 / 绿：各 53705 px，卡片高 564 → 636。
- **断言原文**：`b-en-green-390.png 期望 [358,564] 实际 [358,636]`（取证工具 `pixel-diff.ts:109`）。
- **原因**：列表全为“—”时没有 26ch 的链接，“来源订单”表头宽度只由 8ch 撑住；删掉后表头从 60.4px 缩到 38px 并折行，表格随之变高。“现状”中标为推断的一条由此证实。
- **证据位置**：CSS-02 开发 session 的 `files\slot-1`（含 `sha256.txt`、`diff\pixel-diff.json`）；分支未推送，未开 PR，main 无变化。
- **门禁**：按 [S10“不合并结案与门禁解锁”](S10.md#不合并结案与门禁解锁) 1(b)、2 满足 DEMO-10 门禁；发布说明不提 CSS-02。
