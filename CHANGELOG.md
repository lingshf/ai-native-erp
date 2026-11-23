# 变更日志

本文件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)，tag 写法为 `vX.Y.Z`。内容依据 `main` 上已合并 PR 的标题和正文整理，条目后括号内为 PR 编号。

文档与实现不一致时以代码和测试为准；差异由版本管理角色报告，不在此处修饰。

## [Unreleased]

（暂无）

## [0.15.0] - 发布候选（尚未发布，日期待定）

> **发布候选**：尚未打 tag。产品代码基线为 `main` `00d1ed4`（REFAC-05b [#265](https://github.com/lingshf/ai-native-erp/pull/265) 的合并提交；S16 的四项开发任务全部已合并，该提交的 main Full run 45247858180 绿）。其后 main 只有文档与工具提交（#266 SLOT-03 的工具脚本、#267、#258）；SLOT-03 只改 `scripts/slot`，不改 `packages/`。tag 目标按 D21 / D398 为本 RC 与 Demo 合并后的提交，发布前核对 `git diff 00d1ed4 <tag 目标> -- packages` 为空，并如实报告 `scripts` 的差异；经协调者授权后才打 tag。

S16 Sprint：一项用户可见的小功能（TORD-08）、一项只拆分文件的重构（REFAC-05b）和两项开发流程变化（CI-03、SLOT-03）。按 SemVer 取 minor（0.14.0 → 0.15.0），因为订单详情多了一列。**无迁移（仍为 020），无依赖变化**，已有账套不需要 migrate，不改过账规则与任何金额、数量口径。

### Added（用户可见）

- **订单详情多一列“贷项冲回数量”（TORD-08，[#262](https://github.com/lingshf/ai-native-erp/pull/262)）**：订单行表在“未开票数量”之后、“单价”之前多一列，显示该行未作废贷项冲回的数量；没有贷项时显示 `0`，读取中显示“…”。“已开票数量”仍是扣除贷项后的净数（v0.14.0 起，TINV-09）。例（#262 的 jsdom 用例）：订购 10.5、已开票 6、未开票 4.5、冲回 4。不新增 SQL（#262 的 K4：base 与 head 均为 4 条语句）、不改迁移。**面向调用方**：`GET /api/v1/trade/orders/{id}/invoicing` 响应的 `invoiced[]` 每行多了必填字段 `creditedQuantity`（decimal，同 `invoicedQuantity` 格式；契约 `tradeOrderInvoicingSchema` 为严格对象），请求、端点与参数未变（依据：`git diff --stat 94aefc2 00d1ed4 -- packages` 的契约改动只有 `packages/core/src/contracts/trade-documents.ts` 一行）。订单行表最小宽 920 → 1040 px，390 px 宽下仍在表格容器内横向滚动，该宽度的实测记录由 DEMO-16 给出。

### Changed（仅加载体积，无界面变化）

- **订单页 `OrderWorkspace` 拆分（REFAC-05b，[#265](https://github.com/lingshf/ai-native-erp/pull/265)，合并提交 `00d1ed4`）**：`order-workspace.tsx` 由 608 行减到 110 行，逻辑拆入 `use-order-entry.ts`、`order-entry-commands.ts` 与若干展示组件，只搬移，界面和行为不变。测量对象为订单页路由 `src/TradeOrders.tsx` 的“路由新增 JS”，方法为 D432（文件名哈希屏蔽后的 gzip-9），base `fe371bf` 与 head `deaac5c` 各在 clean worktree 构建，来源为 #265 正文“P7 打包字节”表：JS 17842 → 18694 B（**+852 B**，上限 ≤ +900 B）。其余路由 ±0；首屏入口块未压缩 530516 → 530516 B（±0），屏蔽哈希后 160904 → 160906 B（+2 B，D454）；CSS ±0。这与 TORD-08 下面的逐文件差值是不同的测量（文件级 vs 路由新增），不相加。数字取自 #265 正文，发布前未重测。
- **TORD-08 的体积（#262 正文“构建来源”）**：测量对象为构建产物的各文件，方法为 D432，base `22bd1ce` 与 head `ed3de42`：`TradeOrders` JS 11655 → 11696 B（+41 B）、`TradeOrders` CSS 887 → 888 B（+1 B）、`index` JS 160121 → 160125 B（+4 B），合计 +46 B。数字取自 #262 正文，发布前未重测。

### 开发流程（无界面变化）

- **测试支撑代码的类型错误改为 PR CI 失败（CI-03，[#261](https://github.com/lingshf/ai-native-erp/pull/261)，合并提交 `22bd1ce`）**：修掉测试支撑代码里的 11 个 tsc 错误，并把 SLOT-02 预检的 tsc 基线设为 `{}`；此后这类类型错误会使 PR CI 失败。只改 5 个文件，不含产品代码。有一处行为变化（D469）：`smoke.ts` 里 3 处原先被忽略的 `intervals: [20]` 改为实际生效的 `interval: 20`。合并后耗时（#261 评论“CI-03 决定 3”，测量对象为 main Full browser shard 3，方法为比较 base `94aefc2` run 45230507382 与合并后 `22bd1ce` run 45234362498）：smoke 文件（4 tests）6605 ms → 6799 ms（+2.9%）、shard 3 vitest `Duration` 8.20 s → 8.41 s（+2.6%）、shard 3 作业 31 s → 31 s（0%）。
- **slot 采样规则 R3（SLOT-03，[#266](https://github.com/lingshf/ai-native-erp/pull/266)，合并提交 `1a7f2d7`）**：SR-X6（归属未知的 `node.exe` 不计数但完整记录）；`slot-run.ps1` 新增 `-Ports` 参数（非 `-Stub` 时缺省退出码 4，端口已被监听退出码 7，查询失败退出码 8）；日志新增 `tooling head=` 行，`processes.tsv` 新增 `sr-x6` 列，新增 `selftest-ports.ps1`；`check-manifest.mjs` 一行改动（超出原范围，已在 PR 中披露）。只改 `scripts/slot` 与路线图 §5，不改 `packages/`。
## [0.14.0] - 2026-11-23

> **已发布**：tag `v0.14.0`（annotated，tag 对象 `8fd8940635cc821c0e60e7cdd42e74c481704844`）打在 `f325792`（#264：`release/v0.14.0` 上的 DEMO-15 文档与截图，D473 / D479），不在 main 上；发布日 2026-11-23。Release：<https://github.com/lingshf/ai-native-erp/releases/tag/v0.14.0>。完整变更对比：[v0.13.1...v0.14.0](https://github.com/lingshf/ai-native-erp/compare/v0.13.1...v0.14.0)。`git diff 94aefc2 f325792 -- packages scripts` 为空（已核对），tag 提交以 `072a575` 为祖先（退出码 0），不含 TORD-08（`fe371bf`，退出码 1）与 SLOT-03（`33d5068`，退出码 1）。产品代码基线为 `main` `94aefc2`（REFAC-06c [#256](https://github.com/lingshf/ai-native-erp/pull/256) 的合并提交，S15 五项全部已合并；该提交的 main Full run 45230507382 绿）；上一个提交 `bfeccb7`（TINV-09 [#250](https://github.com/lingshf/ai-native-erp/pull/250)）的 main Full run 45227250621 绿。Demo（12 张截图，6 页 × 中英文，证明页面正常渲染，非逐像素对比）在 tag 内：[docs/demo/v0.14.0](https://github.com/lingshf/ai-native-erp/blob/v0.14.0/docs/demo/v0.14.0/README.md)。

S15 Sprint：一项用户可见的功能变化（TINV-09）、一处按钮文案修正（JV-FIX-01）、一项开发流程变化（CI-02）和重构。按 SemVer 取 minor（0.13.1 → 0.14.0），因为 TINV-09 改变订单的已开票数量与开票状态；**有迁移（019 → 020，只重算已保存的开票状态，不改表结构）**，无依赖变化，不改过账规则、贷项金额与数量上限。

### Changed（用户可见）

- **贷项冲减订单的已开票数量（TINV-09，[#250](https://github.com/lingshf/ai-native-erp/pull/250)）**：订单行的已开票数量 = 未作废发票行数量之和 − 这些发票行上未作废贷项数量之和。订单详情的已开票 / 未开票数量、订单列表的“开票状态”列和“开票状态”筛选都按新口径；被冲回的数量可以再开票，过账时的订单匹配用同一口径。贷项过账与取消贷项时，开票状态在同一事务里刷新。订单页教学说明中英各多一句。迁移 020 只重算已保存的开票状态（用例 V7：PO-07 已开完后部分贷项 `full` → `partial`，PO-08 全部贷项 `full` → `none`，其余订单不变；`schema_migrations` 为 20 行）。v0.13.1 及更早，贷项不改变开票状态。已有账套须 migrate 到 020。
- **凭证页工具栏按钮改名（JV-FIX-01，[#254](https://github.com/lingshf/ai-native-erp/pull/254)）**：“重试” → “刷新列表”（Retry → Refresh list）。按钮一直只是重新读取凭证列表，行为不变；账套读取失败时错误提示里的“重试”不变。该文案自 M0-10 起如此，不是回归。

### Changed（仅加载体积，无界面变化）

- **期末结账、调整、贸易报表、核销四页不再加载发票页代码（REFAC-06b，[#251](https://github.com/lingshf/ai-native-erp/pull/251)）**：四页改为直接从 `trade-invoices/use-invoice-leave-guard.ts` 导入。以下数字的测量对象为各路由“路由新增 JS / CSS”，方法为 D432（文件名哈希屏蔽后的 gzip-9），base `5803ae8` 与 head `69e15a3` 各在 clean worktree 构建（合并提交 `0d2cdd3` 相对 head 的 `packages/` 差异为空），来源为 #251 正文 B4 逐路由表：
  - 期末结账 JS −10287 B、CSS −1246 B；调整 JS −14537 B、CSS −1246 B；贸易报表 JS −10185 B、CSS −1246 B；核销 JS −10286 B、CSS −1246 B；
  - 发票页路由 JS +220 B、CSS ±0（超出任务书 +200 B，按 D462 ① 接受）；
  - 其余路由 JS −3 B 至 +4 B，CSS ±0（D462 视同噪声）；
  - 首屏入口块 `index.js`（测量对象：入口块文件，不是路由新增）：未压缩 −167 B；文件名哈希屏蔽后的 gzip-9 −82 B（D432 方法，base `5803ae8` 与 head `69e15a3`）；来源为 #251 正文 B4 “首屏与 D462 的解释”一节的入口块条目，与上面的逐路由表分开；D462 ② 接受。
  - 数字取自 #251 正文，发布前未重测（合并基 `5803ae8`）。
  - **REFAC-06c（[#256](https://github.com/lingshf/ai-native-erp/pull/256)，合并提交 `94aefc2`）**：`InvoiceEntry` 拆成 hooks、命令和展示组件，无界面变化。测量对象为发票页路由 `src/TradeInvoices.tsx` 的“路由新增 JS”，方法为 D432（文件名哈希屏蔽后的 gzip-9），merge base `03f129b` 与 head `50ebfa4` 各在 clean worktree 构建，来源为 #256 正文 P7 节的路由表：JS 21006 → 21896 B（**+890 B**，D461 上限 ≤ +900 B）。其余路由的路由新增 JS、首屏入口（`index.html` 闭包，JS 160872 → 160872 B）和 CSS（两侧都有的 12 个文件，屏蔽哈希后内容摘要相同）均为 ±0。这与上面 06b 的 +220 B 是不同 PR、不同基线的两次测量，不相加。数字取自 #256 正文，发布前未重测（D466：不按新 main 重测）。

### 内部

- **PR CI 运行 SLOT-02 静态预检（CI-02，[#248](https://github.com/lingshf/ai-native-erp/pull/248)）**：`ci.yml` 的 verify 在 Typecheck 后多一步 `node scripts/slot/preflight.mjs --root .`，基线外有新发现即失败，使 `test/support/**` 与 `*.slow.test.ts` 的类型错误在合并前暴露。无界面变化。

### 文档

- `docs/user/trade.md`、`docs/user/ui-guide.md`、`docs/user/README.md` 与两张订单相关流程图补写贷项冲减口径与迁移 020；凭证页按钮改名见 `ui-guide.md`。
- 无用户可见变化：S15 计划与任务书、S14 评审与回顾（#249）、发布流程“数字三项”规则（#253）。
## [0.13.1] - 2026-11-23

> **已发布**：tag `v0.13.1`（annotated，tag 对象 `5feb803b…`）打在 `002c237`（Demo [#245](https://github.com/lingshf/ai-native-erp/pull/245) 的 squash 提交），`git diff 48ba245 002c237 -- packages scripts` 为空（已核对，D21 / D398），产品代码与 `48ba245` 相同；发布日 2026-11-23。Release：<https://github.com/lingshf/ai-native-erp/releases/tag/v0.13.1>。完整变更对比：[v0.13.0...v0.13.1](https://github.com/lingshf/ai-native-erp/compare/v0.13.0...v0.13.1)。Demo（真实 Chrome，7 个页面 × 中英文共 14 张，证明拆分后正常渲染，非逐像素对比）在 tag 内：[docs/demo/v0.13.1](docs/demo/v0.13.1/README.md)。产品代码基线为 `main` `48ba245`（REFAC-06 [#242](https://github.com/lingshf/ai-native-erp/pull/242) 的合并提交；main Full run 45211228377 绿）。自 v0.13.0 的 tag（`9866728`）到 `48ba245`，`packages/` 下 29 个文件（+2765/−2651），`scripts/` 下无变化（已核对）。

S14 Sprint：三项只搬移的重构和一项测试夹具类型修正。**没有用户可见的功能变化**；无迁移（仍为 019），无依赖变化，不改过账规则。按 SemVer 取 patch（0.13.0 → 0.13.1）。

### Changed（仅加载体积，无界面变化）

- **业务事件、总账报表、期末结账、贸易报表四页少加载凭证页代码（REFAC-04，[#240](https://github.com/lingshf/ai-native-erp/pull/240)）**：共用件改为直接从 `journals/*` 导入，这四个路由的闭包不再含 `Journals.tsx`。路由新增 JS（屏蔽哈希后的 gzip-9）：业务事件 −7320 B、总账报表 −9145 B、期末结账 −9144 B、贸易报表 −9144 B；其余 10 个路由 ±0。代价（D453 例外）：凭证页 +1017 B，首屏入口 +63 B 原始 / +13 B gzip-9。数字取自 #240 正文，发布前未重测。

### 内部（只搬移，不改行为）

- **订单页拆分（REFAC-05，[#238](https://github.com/lingshf/ai-native-erp/pull/238)）**：`TradeOrders.tsx`（1483 行）按职责拆到 `trade-orders/`；DOM、文案、样式不变。订单路由新增 JS +59 B。
- **发票页拆分（REFAC-06，[#242](https://github.com/lingshf/ai-native-erp/pull/242)）**：`TradeInvoices.tsx`（1465 行）拆到 `trade-invoices/`，7 个导入方不改；发票页的 5 条路由各 −23 B（gzip-9）；首屏入口 +3 B（文件名哈希屏蔽后经 gzip-9 压缩测得；D454 视同 ±0）。两个数字分开记。
- **期初夹具类型修正（FIX-01，[#241](https://github.com/lingshf/ai-native-erp/pull/241)）**：只改 `packages/infra/test/support/legacy-opening-fixture.ts` 的类型，产品代码不变。

### 文档

- 用户文档不需要改功能说明；`docs/user` 与 `docs/flows` 里指向拆分前文件的 `file:line` 来源引用已逐条改为 48ba245 上 `trade-invoices/` 的实际位置（D455）。

## [0.13.0] - 2026-11-23

> **已发布**：tag `v0.13.0`（annotated，tag 对象 `51fc727b…`）打在 `9866728`（Demo [#236](https://github.com/lingshf/ai-native-erp/pull/236) 的 squash 提交），`git diff f1536e1 9866728 -- packages scripts` 为空（已核对，D21 / D398），产品代码与 `f1536e1`、`ef0de69` 相同；发布日 2026-11-23。Release：<https://github.com/lingshf/ai-native-erp/releases/tag/v0.13.0>。完整变更对比：[v0.12.0...v0.13.0](https://github.com/lingshf/ai-native-erp/compare/v0.12.0...v0.13.0)。Demo（真实 Chrome，TORD-07 筛选记忆 12 张）在 tag 内：[docs/demo/v0.13.0](docs/demo/v0.13.0/README.md)。产品代码基线为 `main` `ef0de69`（REFAC-01b [#224](https://github.com/lingshf/ai-native-erp/pull/224) 的合并提交，S13 功能全部合并；该提交的 main Full run 45201528305 绿）；其后的 `f1536e1` 只是 v0.12.0 Demo 文档（[#233](https://github.com/lingshf/ai-native-erp/pull/233)）。自 v0.12.0 的 tag 目标 `a7e2d99` 到 `f1536e1`，`packages/` 下 43 个文件（+5679/−3385），`scripts/` 下 3 个文件（+421/−45）。

S13 Sprint：订单筛选写入地址栏、旧账迁移虚构演练与操作手册、导入峰值内存回到预算、三项只搬移的重构。**无迁移**，无依赖变化，不改过账规则。新增用户可见功能，版本号取 minor（0.12.0 → 0.13.0）。

### Added（用户可见）

- **订单列表筛选写入地址栏（TORD-07，[#223](https://github.com/lingshf/ai-native-erp/pull/223)）**：应用筛选后，地址形如 `#/trade-orders?company=…&party=…&side=…&invoicing=…&from=…&to=…`（只写已设置的项），刷新、书签或粘贴链接后筛选与列表还原。只用“替换地址”：应用 / 清除不新增浏览器历史、不弹离开确认、不清掉订单表单草稿；切换账套仍保留原有确认（D423）。地址中的筛选任一项无效则整组忽略、显示全部订单，并提示“链接中的筛选条件无效，已忽略；当前显示全部订单。”和“清除”。订单详情行的数量、已开票数量、单价、折扣按语言加千分位；页面教学说明改为“筛选保存在地址中，刷新或复制链接后保持”。**行为变化：v0.7.0 起“订单筛选不会被记住”不再成立。**
- **旧账导入演练命令与操作手册（M2-05a，[#227](https://github.com/lingshf/ai-native-erp/pull/227)）**：新命令 `npm run storage:admin -- legacy-import --snapshot-dir DIR --dry-run`：不带选项时输出快照 SHA 和六个导入选项各自的影响条数，带齐六个选项时输出可执行性、对象计数、草稿与原因；**不写任何目标库**，选项不全或同时给 `--target` 按用法错误拒绝。新文档 [`docs/migration-runbook.md`](docs/migration-runbook.md)（授权门槛、各步命令、错误码、回滚、证据、预算），并从 `docs/user/backup-and-legacy.md` 与根 README 链接。**全程只用虚构夹具（D417）**，没有连接真实旧账、4173 或 `.bak`；界面无变化。

### Changed

- **期初未结项校验提速（M2-05a，D430）**：每个（公司, 科目）只查询一次历史凭证，不再每条期初项扫描一遍；100 万行 GL 下 10 万条期初的校验由估算约 9 小时降到约 27 秒，判定结果不变，无迁移、无公开接口变化。
- **导入期初分批写入（M2-05b，[#232](https://github.com/lingshf/ai-native-erp/pull/232)，D434）**：校验通过的期初项暂存到临时计划库，在仍为**单一写事务**的期初阶段内每批 1000 项写入目标库。Bench（100 万 GL 行 + 10 万期初，Linux CI，run 45196607138）导入峰值 RSS 由 566.3 MiB（M2-05a 的已知缺口，超出 512 MiB 预算）降到 426.8 MiB，导入耗时 120.2 s → 93.5 s。导入结果、命令行参数、错误码不变；操作手册的“已知缺口”改为已关闭。

### Internal（无用户可见变化）

- **REFAC-01b（[#224](https://github.com/lingshf/ai-native-erp/pull/224)，D419）**：测试支撑代码 `tradeGuiScenario` 约 1440 行的函数体拆到 `trade-gui/scenario/` 的阶段模块，只搬移、不改行为。
- **REFAC-03（[#226](https://github.com/lingshf/ai-native-erp/pull/226)）/ REFAC-03b（[#231](https://github.com/lingshf/ai-native-erp/pull/231)，D438）**：`Journals.tsx` 拆为 `journals/` 下的模块，`CompanyJournals` 再拆为 Hook、命令模块和展示组件（函数由 1025 行降到 76 行），只搬移、不改行为。
- **测试修正（[#229](https://github.com/lingshf/ai-native-erp/pull/229)，D436）**：TORD-07 合并后，main Full 的两个浏览器分片（`trade-gui-zh-red-2`、`trade-gui-en-green-2`）因 e2e 仍断言“筛选后地址不变”而连续失败，#229 把该断言改为新行为；产品代码不变。
- **文档与流程**：S13 计划与任务书 [#222](https://github.com/lingshf/ai-native-erp/pull/222)、[#225](https://github.com/lingshf/ai-native-erp/pull/225)、[#228](https://github.com/lingshf/ai-native-erp/pull/228)、[#230](https://github.com/lingshf/ai-native-erp/pull/230)；v0.12.0 Demo [#233](https://github.com/lingshf/ai-native-erp/pull/233)。
- **测试**：新增 `legacy-opening-batches.test.ts`、`legacy-rehearsal.test.ts`、`trade-orders-fixtures.ts` 等（D425、D443 测试文件例外）；TORD-07 把 TORD-06 的地址断言改为精确值。

### 面向调用方（HTTP API、CLI、迁移）

- **CLI**：新增 `storage-admin legacy-import --snapshot-dir DIR --dry-run`（只读演练）。其余命令、参数、错误码不变。
- **迁移**：无（仍为 019）。**契约、过账规则、依赖**：无变化。

### 已知限制与已接受的决定

- 订单筛选地址：不记游标与每页条数；筛选任一项无效则整组忽略；切换账套仍弹确认（D423）；开票状态只能单选。
- **旧账迁移（M2）仍未完成**：演练只在虚构夹具上验证；真实旧账的演练和切换（M2-06）需用户另行授权，未开始。
- **性能（PG-05，gzip-9，取自 PR 正文）**：TORD-07 入口 +0.034 kB，订单页（含新共享块 `decimal-format.js`）+0.773 kB（预算 ≤ +1.0），CSS 0；发票页 −0.101 kB。两项迁移相关 Bench 为 Linux CI 实测，与 v0.12.0 相比的整体净变化未测量。
- TORD-07 按 D418 / D375 / D406 以 jsdom 与 CI 验收，没有真实 Chrome 截图；Demo 是否补拍待协调者决定。
- 刚合并时 main Full 曾因 TORD-07 与 e2e 断言不符失败（#223 到 #229 之间），#229 修复，`ef0de69` 的 Full 为绿。

## [0.12.0] - 2026-11-23

> **已发布（D414、D415）**：tag `v0.12.0`（annotated，tag 对象 `53867461…`）打在 `a7e2d99`（RC [#221](https://github.com/lingshf/ai-native-erp/pull/221) 的 squash 提交），相对 e703971 仅 1 个提交，`git diff e703971 a7e2d99 -- packages scripts` 为空（已核对），产品代码与 e703971 相同；发布日 2026-11-23。Release：<https://github.com/lingshf/ai-native-erp/releases/tag/v0.12.0>。产品代码基线为 `main` e703971（SLOT-02 [#220](https://github.com/lingshf/ai-native-erp/pull/220) 的合并提交，S12 功能全部合并；该提交的 main Full run 45136789585 绿）。自 v0.11.0 的 tag 目标 `024b7fa` 到 e703971，`packages/` 下 57 个文件（+6255/−3184）（SLOT-02 只改 `scripts/slot/` 与 roadmap，`git diff ab2ba1c e703971 -- packages` 为空，已核对）。Demo（真实 Chrome 截图、大额发票 390 宽实测）在 tag 之后合并：[docs/demo/v0.12.0](docs/demo/v0.12.0/README.md)。

S12 Sprint：发票深链接与地址栏筛选、订单按开票状态筛选、发票页打磨、页头说明、两项只搬移的重构。**含一个迁移（019）**，新增用户可见功能，版本号取 minor（0.11.0 → 0.12.0）。无依赖变化，不改过账规则。

### Added（用户可见）

- **发票详情深链接与筛选写入地址栏（TINV-07，[#208](https://github.com/lingshf/ai-native-erp/pull/208)）**：打开详情后地址含 `invoice=<编号>`，已应用的筛选写成 `party / side / from / to`；刷新和书签按地址恢复详情与筛选。只用“替换地址”（`history.replaceState`），不新增浏览器历史、不触发离开确认；每次写入都带 `company`，切换账套时去掉 `invoice` 与筛选；游标和每页条数不写地址。链接有误时：`invoice` 格式不对或不存在 / 属于别的账套显示“发票不存在或已不在本公司。”（格式不对不发请求）；筛选任一项无效则整组忽略并提示“链接中的筛选条件无效，已忽略；当前显示全部发票。”和“清除”；`company` 不在账套列表里（且带 `invoice` 或筛选）提示“链接中的公司不在已加载列表中，未打开”和“返回发票页”。**行为变化：v0.10.0 的“筛选刷新后清空”不再成立**（刷新后筛选与详情恢复）。
- **订单列表按开票状态筛选（TORD-06，[#209](https://github.com/lingshf/ai-native-erp/pull/209)）**：订单筛选栏“方向”之后多了“开票状态”下拉框（全部 / 未开票 / 部分开票 / 已开完），可与其他筛选组合，点“应用”生效，不写地址栏。API `GET /api/v1/trade/orders` 新增可选查询参数 `invoicing=none|partial|full`；非法值或重复键返回 400 `INVALID_REQUEST`。订单列表的“开票状态”列改为读存储值。
- **发票页打磨（TINV-08，[#219](https://github.com/lingshf/ai-native-erp/pull/219)）**：筛选栏与卡片标题之间多 16 px 留白；列表、详情抬头、详情行明细的匹配状态和详情未结项状态改为带符号的彩色徽标（文字不变，`aria-hidden` 符号）；详情“合计”三项在宽屏排成一行；详情行明细的数量、单价、折扣按语言加千分位（小数位原样）；开票预览的订单匹配表只格式化数量，单价与折扣不变（`TradeInvoices.tsx:1078`）。大额发票在 390 宽下已在 Demo 实测：合计 2 行、不溢出，页面无横向溢出（见 [Demo 记录](docs/demo/v0.12.0/README.md)）。
- **期末结账页整理（UI-15，[#206](https://github.com/lingshf/ai-native-erp/pull/206)）**：页头多一句说明；期间准入摘要徽标显示“贸易 / 税务”（英文 Trade / Tax），读屏另读“已准入 / 未准入”；复选框中文改为“准入贸易 / 准入税务”。
- **总账四页页头说明（UI-16，[#210](https://github.com/lingshf/ai-native-erp/pull/210)）**：科目表、财务维度、凭证、业务事件页头各一句说明，教学模式关闭时也显示。

### Changed

- **通用加载与失败提示（UI-17，[#213](https://github.com/lingshf/ai-native-erp/pull/213)）**：共享键 `master.loading` / `master.error` 的文案由“正在读取主数据…”“主数据请求失败…”改为“正在加载…”“请求失败。请检查连接和目标库配置后重试。”（英文同步），迁移核对、发票等非主数据页不再出现“主数据”。各页专用提示不变。
- **订单开票状态来源（TORD-06）**：列表“开票状态”列不再逐页聚合，改读新表 `trade_order_invoicing`；取值规则不变（已作废发票不计入，贷项、核销、冲销不改变状态）。

### Internal（无用户可见变化）

- **REFAC-02（[#214](https://github.com/lingshf/ai-native-erp/pull/214)）**：`BusinessEvents.tsx` 拆为 `business-events/` 下的模块，只搬移、不改行为。
- **REFAC-01（[#217](https://github.com/lingshf/ai-native-erp/pull/217)）**：端到端场景支撑代码 `trade-gui-scenario.ts` 拆到 `trade-gui/`，只搬移、不改行为。
- **SLOT-02（[#220](https://github.com/lingshf/ai-native-erp/pull/220)，`e703971`）**：独占时段 runner（`scripts/slot/`）开跑前先做静态检查（tsc + TDZ，退出码 0 / 4 / 6，基线只减不增），并在每个步骤子进程重置 `PSModulePath`，修复 D387 的 `Get-FileHash` 缺失；采样规则升为 R2（D411：SR-X1 外仓判定在命令行读不到时沿用）。开发者本机工具，不影响产品。
- **文档与流程**：S12 计划与任务书 [#205](https://github.com/lingshf/ai-native-erp/pull/205)、[#207](https://github.com/lingshf/ai-native-erp/pull/207)、[#211](https://github.com/lingshf/ai-native-erp/pull/211)、[#212](https://github.com/lingshf/ai-native-erp/pull/212)（含可读性 DoD）、[#218](https://github.com/lingshf/ai-native-erp/pull/218)；S11 评审与回顾 [#216](https://github.com/lingshf/ai-native-erp/pull/216)；v0.11.0 Demo [#204](https://github.com/lingshf/ai-native-erp/pull/204) 与日期 [#215](https://github.com/lingshf/ai-native-erp/pull/215)。
- **测试**：新增 `trade-invoice-links.test.tsx`、`trade-order-invoicing-migration.test.ts` 等；按任务书授权改写 TINV-05 / TINV-06 中 4 处“地址不变”的断言（TINV-07 D370）和 3 处徽标相关断言（TINV-08）。

### 面向调用方（HTTP API、迁移）

- **迁移 019**（`019-trade-order-invoicing.sql`）：新表 `trade_order_invoicing(company_id, order_id, status)`，每张订单恰一行，新订单由触发器写入 `none`，迁移时按已有发票回填；在过账与作废的既有事务内同步维护。**已有账套须先 `migrate` 到 019**；迁移在事务内，失败回滚、版本仍为 018。
- **契约**：`GET /api/v1/trade/orders` 追加可选 `invoicing`（纯追加，返回体不变）。其余契约、过账规则不变。
- **依赖**：无变化。

### 已知限制与已接受的决定

- 深链接不记游标和每页条数；筛选参数有任一项无效时整组忽略；有未保存草稿时刷新仍由浏览器离开警告拦截；取消后退会丢弃前进历史（D275）。
- 订单页筛选不写地址栏；开票状态筛选只能单选，没有按开票状态排序。
- 键名 `master.*` 仍被多页借用（命名债，候选池）。
- **性能（PG-05，gzip-9，数字取自各 PR 正文，各自的 base 不同，不能相加）**：UI-15 入口 +103 B、期末结账块 +73 B、CSS 0；UI-16 入口 +274 B、CSS 0；TINV-07 入口 +3 B、发票页块 +853 B；TINV-08 入口 0、发票页块 +219 B、发票页 CSS +17 B。UI-17（[#213](https://github.com/lingshf/ai-native-erp/pull/213)）入口 −11 B、CSS 0 B；TORD-06 未测量构建字节数；与 v0.11.0 相比的净变化未测量，发布前未重测。
- 真实 Chrome 验证在 PR 取证 head 上，不在合并后的 squash 提交上；UI-15 / 16 / 17、TINV-08 按 D375 / D377 / D384 / D406 以 jsdom 验收；视觉由 Demo 截图覆盖 UI-15、UI-16、TINV-08，UI-17 不进截图（D384）。
- 旧账迁移（M2）仍未完成：M2-05（演练）与 M2-06（切换）未开始，另需用户授权。
- Demo 记录与截图：[docs/demo/v0.12.0](docs/demo/v0.12.0/README.md)（真实 Chrome，4 个组合共 52 张）。

## [0.11.0] - 2026-11-22

> 产品代码基线为 `main` 68620fd（Full run 45114359894 绿）。自 v0.10.0（tag 所指提交 ae4fbaa）到 68620fd 共 10 个已合并 PR（#193–#202）；产品与测试提交是 TINV-06 [#199](https://github.com/lingshf/ai-native-erp/pull/199) + 修复 [#200](https://github.com/lingshf/ai-native-erp/pull/200)、UI-14 [#197](https://github.com/lingshf/ai-native-erp/pull/197)；其余为流程、脚本、权重与文档。**tag 目标（D335 的做法无法照搬）**：基线之后 main 上有 S12 的三个产品提交 UI-15 [#206](https://github.com/lingshf/ai-native-erp/pull/206)、UI-16 [#210](https://github.com/lingshf/ai-native-erp/pull/210)、UI-17 [#213](https://github.com/lingshf/ai-native-erp/pull/213)（`git diff --stat 68620fd 1d2602d -- packages` 为 19 个文件、389 行增、15 行删），它们在 Demo PR [#204](https://github.com/lingshf/ai-native-erp/pull/204)（squash 提交 `1d2602d`）之前合并，所以 `git diff 68620fd 1d2602d -- packages` 不为空，tag 不能打在 `1d2602d` 或本日期 PR 的 squash 提交上，否则 v0.11.0 会带入未做 Sprint 评审的 S12 改动。**已定（D398）：tag 目标 `024b7fa`**，即 RC [#203](https://github.com/lingshf/ai-native-erp/pull/203) 之后、S12 产品提交之前的最后一个提交（S12 计划 [#205](https://github.com/lingshf/ai-native-erp/pull/205)），`git diff 68620fd 024b7fa -- packages` 为空（已核对）；Demo 在该产品代码上取图，记录见 [docs/demo/v0.11.0](docs/demo/v0.11.0/run-through.md)（Demo 文档在 tag 之后合并，tag 内不含）。UI-15 #206、UI-16 #210、UI-17 #213 不在 v0.11.0，归入 v0.12.0。

S11 Sprint：发票详情对话框与侧栏分组。**无迁移**（最新仍是 018），无依赖变化，不改 HTTP 契约与过账规则。

### Added（用户可见）

- **发票详情对话框（TINV-06，#199、#200）**：发票列表的“外部单号”变为按钮（`aria-haspopup="dialog"`，`packages/web/src/TradeInvoices.tsx:1286–1297`），点击、Enter 或空格打开只读对话框（`TradeInvoiceDetail.tsx`），含抬头、九列行明细、合计、未结项（状态与未结余额）、核销记录与调整记录；Esc 或“关闭”后焦点回到原按钮，筛选、已加载页和滚动位置保持。读取失败显示错误和“重试”；404 只显示“发票不存在或已不在本公司。”，不提供重试（`TradeInvoiceDetail.tsx:88–126`）。教学开启时显示教学卡片（`:186–192`）。每次打开都重新请求一次 `GET /api/v1/trade/invoices/:id`（`staleTime` 0、`gcTime` 0，`:47–50`）。对话框不写地址栏、不新增深链接、不触发离开确认。
- **390 宽**：行明细表所在区域是可 Tab 聚焦的滚动区（`<section tabIndex=0>`，`:205–210`），在区域内横向滚动，页面本身不横向溢出（#199 的端到端断言）。
- **侧栏分组（UI-14，#197）**：原“总账”组拆成“凭证与业务事件”“贸易往来”“总账与结账”三组；链接文字、顺序与目标不变（共 16 个）；5 个有标题的组带 `role="group"` 与 `aria-labelledby`（`packages/web/src/App.tsx:205–237`；标签 `labels.ts:30–32`、`:93–95`）。≤760 px 组标题仍隐藏，样式未改（#197 正文）。

### Changed

- 侧栏“总账”组名不再出现（`journal.group` 标签已删除，`journal-labels.ts`）。

### Internal（无用户可见变化）

- **SLOT-01（#198）**：独占时段采样器入库 `scripts/slot/`（只支持 PowerShell 7，规则版本 R1），开发者本机工具，不进构建产物和 CI。
- **WEIGHT-01（#201、#202）**：`scripts/test-shard-weights.json` 三行权重按 CI 实测校准；合并后复测偏差 −20.3% / +10.3% / −1.4%，都在 ±25% 内。
- **PROC-08（#196）**：Demo 模板与发布清单落实 S10 回顾行动（日志入库与 `-text`、`-ErrorAction Stop` 负例、RC 正文证据索引）。
- **#193、#194、#195**：日期文档、S10 回顾与 S11 计划，只含文档。
- **测试**：新增 `trade-invoice-detail.test.tsx` 和端到端场景；#200 把 390 键盘滚动断言改为逐键等待滚动稳定（只改测试，产品代码不变）。

### 面向调用方（HTTP API）

- **未变**：`git diff --numstat v0.10.0 68620fd -- packages` 只涉及 `packages/web` 的 App、TradeInvoices、TradeInvoiceDetail（新）、样式、标签与测试，以及 `packages/infra/test/support/trade-gui-scenario.ts`；`packages/core/src`、`packages/infra/src`、`packages/infra/migrations` 无变化，`package.json` 与 lock 无变化。详情对话框使用既有的 `GET /api/v1/trade/invoices/:id`。

### 已知限制与已接受的决定

- **详情对话框是只读的**：没有地址栏深链接，不自动刷新（每次打开才读取）；404 不重试。
- **390 宽行明细在容器内横向滚动**，不是自动换行。
- **性能（PG-05，gzip-9，#199 取自 base `2a2dca1` 对 head `a8c4968`）**：入口 +10 B，发票路由块 +2447 B，发票页 CSS +228 B；#197 入口 +128 B（gzip-9），CSS 0 B。两者基线不同，不能相加；与 v0.10.0 相比的净变化未测量，发布前未重测。
- 真实 Chrome 验证在 PR 取证 head 上，不是合并后的 squash 提交。
- 旧账迁移（M2）仍未完成：M2-05（演练）与 M2-06（切换）未开始，另需用户授权。

## [0.10.0] - 2026-11-22

> 产品代码基线为 `main` 108684d（TINV-05 #189、GATE-01 #188 合并；PROC-07 #187）；历史说明：RC [#191](https://github.com/lingshf/ai-native-erp/pull/191) 基于 main `58e8422`（Full run 45006555904 绿），正式版 tag 在 `ae4fbaa`。自 v0.9.0（tag 所指提交 f943b8b）到 58e8422 共 5 个已合并 PR（#186–#190），其中 #186 是 S10 计划，#187 是流程文档，#190 是文档，#188、#189 是产品与测试提交。之后 main 只有文档提交，产品代码与 108684d 相同。按 D335，tag `v0.10.0` 打在 Demo PR [#192](https://github.com/lingshf/ai-native-erp/pull/192) 的 squash 提交 `ae4fbaa` 上（main Full run 45010014104 绿），不是 108684d；`git diff 108684d ae4fbaa -- packages` 为空。Demo 记录：[docs/demo/v0.10.0](docs/demo/v0.10.0/run-through.md)。

S10 Sprint：发票列表筛选。发票列表能按伙伴、方向、记账日期筛选；S9 回顾行动落入流程文档。**新增迁移 018**（只加一条索引，不改表、不改数据），无依赖变化，不改过账规则。

### Added（用户可见）

- **发票列表筛选（TINV-05，#189）**：「采购与销售发票」页的发票列表上方新增筛选栏：伙伴（伙伴代码，文本输入）、方向（全部 / 采购 AP / 销售 AR）、记账日期起、记账日期止（闭区间），以及「应用」「清除」；在任一输入框按 Enter 等同「应用」（`packages/web/src/TradeInvoices.tsx:1162–1226`）。「加载更多」沿用当前筛选；过账成功后按当前筛选刷新。起始日期晚于截止日期或伙伴代码格式不对时，在控件旁提示（`aria-describedby` 关联）且不发请求；有筛选但无结果时显示“没有符合条件的发票。” / “No invoices match the filters.”（`:1288`）。中英双语。
- **筛选不进地址栏**：地址、浏览器历史和离开确认的行为都不变，只改筛选栏不会弹离开确认；刷新、切换账套后筛选清空（`TradeInvoices.tsx:1077–1078`）。
- **布局**：1440 宽英文界面下四个字段占满一行，Apply / Clear 换到第二行（中文一行）；390 宽（#189 实测的英文绿色主题）下四个字段各占一行，Apply / Clear 在同一行（`TradeInvoices.tsx:1222–1229` 两按钮同在一个容器；截图 `head-en-green-part2-invoice-filter-plain-390.png`）；“来源订单”列宽与行高不变（#189 正文 §6.2）。

### Changed

- **迁移**：最新迁移 017 → **018**，只加索引 `trade_documents_party(company_id, party_id, sequence)`（`packages/infra/migrations/sqlite/018-trade-invoice-filters.sql`）。已有账套须先显式 migrate 到 018；升级前后 `trade_documents`、`trade_document_lines`、`open_items` 的全部行逐字相同（用例 “TINV-05 a 017 ledger with posted invoices upgrades to 018…”）。
- 发票列表的页面结构：无筛选时请求与响应与 v0.9.0 逐字节相同（见下“面向调用方”）。

### Internal（无用户可见变化）

- **GATE-01（#188）**：新增 `packages/web/src/leave-guard-gate.ts`（最小常驻闸门），`leave-guard-history.ts` 保留按页守卫，`App.tsx` 第 4–5 行改为静态导入闸门；入口块 gzip-9 相对 #188 自己的 base 减少 82 B（160517 → 160435，Node zlib；来源 #188 正文）；离开确认的触发时机、文案和渲染不变；新增 2 条 jsdom 用例。
- **PROC-07（#187）**：Demo 模板新增 390 px 页面宽度断言（`scrollWidth <= innerWidth`）、截断容差 `max(0, (字形盒高 − 行高) / 2) + 1 px`、核对表“seed 来源”“工具判定复核”两栏、日志完整保留写法；发布清单新增“行为描述有出处”“范围词逐项枚举”两项。
- **S10 计划（#186）与 #190**：只含设计文档。CSS-02 结案不合并（D325），`min-width: 8ch` 保留。
- **测试与权重（#188、#189）**：新增迁移测试、契约 / 页面 / 兼容性用例与端到端场景；`scripts/test-shard-weights.json` 增加 `trade-invoice-filters-migration.test.ts: 1000`；`trade-order-filters-migration.test.ts` 按 D307 改为“迁移到 017 为止”（断言值不变）。

### 面向调用方（HTTP API）

- **发票列表** `GET /api/v1/trade/invoices`：请求新增可选参数 `party`、`side`（`AP` / `AR`）、`from`、`to`（闭区间，`from > to` 返回 400，未知参数仍 400；`packages/core/src/contracts/trade-documents.ts:451–464`）。
- **响应不变**：不带新参数时，首页（`?company=DEFAULT&limit=2`，672 B）与带游标续页（668 B）的未解析响应体在 base（`c175a32`）与 head 上逐字节相同（SHA-256 见 #189 正文 §2；用例 `TINV-05 invoice list compatibility…`，`packages/infra/test/application/trade-documents.test.ts:4593–4642`）。旧客户端不传新参数即与之前相同。
- **未变**：发票预览 / 过账请求与响应、过账与匹配规则、CLI、日志、端口。`git diff --numstat v0.9.0 58e8422 -- packages/core/src packages/infra/src` 只涉及 trade-documents 的契约、应用、HTTP、存储四个文件和 `migrations.ts`。
- 无依赖变化。

### 已知限制与已接受的决定

- **筛选不保留**：刷新、切换账套或离开页面再回来都会清空；没有地址栏深链接（TINV-05 任务书决定 5）。
- **伙伴筛选是精确的伙伴代码**，不是名称搜索。
- **性能**：1 万张发票下 4 个场景热读 p95 为 12.9–15.5 ms（#189 正文 §3）；只有按伙伴筛选走新索引，按方向、按日期沿用公司索引并过滤。入口 gzip：#189 相对其 base +382 B（159645 → 160027，Python gzip-9；文案 +384 B、契约 +10 B），#188 相对其 base −82 B（160517 → 160435，Node zlib gzip-9）；两者基线与压缩实现不同，不能相加得出版本净值，与 v0.9.0 相比的入口净变化未测量。CSS +44 B（#189）。数字取自 PR 正文，发布前未重测。
- **取消离开确认会截断前进历史**（D275，沿用 v0.9.0）。
- 订单列表仍没有按开票状态的筛选 / 排序；发票列表“来源订单”列没有筛选。
- 真实 Chrome 的验证在 PR 取证 head 上，不是合并后的 squash 提交：#189 为 be9f566（= 最终 head），#188 为 a0bc28a（= 最终 head）。
- 旧账迁移（M2）仍未完成：M2-05（演练）与 M2-06（切换）未开始，另需用户授权。
## [0.9.0] - 2026-11-21

> 产品代码基线为 `main` 6478d10（S9 功能全部合并，Full 12/12，run 44985493365）；自 v0.8.0（tag 所指提交 deb80fc）到 6478d10 共 5 个已合并 PR 的 5 个 squash 提交（#177–#181；`git rev-list --count v0.8.0..6478d10` = 5），其中 #177 是 S9 计划，#178 是流程与文档，#179、#180、#181 是产品与测试提交。之后 main 只有文档提交（RC [#182](https://github.com/lingshf/ai-native-erp/pull/182)、Demo [#183](https://github.com/lingshf/ai-native-erp/pull/183)、S9 评审与回顾 [#184](https://github.com/lingshf/ai-native-erp/pull/184)，main `2df0a17` 为日期 PR 的基线），产品代码与 `6478d10` 相同。按 D21，tag `v0.9.0` 打在本日期 PR 合并后的 squash 提交上，不是 `6478d10`。Demo 记录（基线 `9bbabe7`）：[docs/demo/v0.9.0](docs/demo/v0.9.0/run-through.md)；Sprint 评审与回顾：[S9 评审](design/reviews/S9.md)、[S9 回顾](design/reviews/S9-retro.md)。

S9 Sprint：订单与发票双向可追溯。订单列表显示开票状态并支持深链接；发票列表显示来源订单；五个贸易页统一离开确认，并修复真实 Chrome 中后退不弹确认框的问题。**无新增迁移**（最新仍为 017），无依赖变化，不改过账规则。

### Added（用户可见）

- **订单列表新增“开票状态”列（TINV-03，#179）**：订单列表最后一列，文字 Badge：未开票（`!`）/ 部分开票（`i`）/ 已开完（`✓`），英文界面为 Not invoiced / Partly invoiced / Fully invoiced；不只靠颜色区分。状态与订单详情里的“已开票 / 未开票数量”用同一口径（已作废发票不计）。390 px 宽下该列不隐藏、不换行，表在 `.grid-wrap` 内横向滚动，页面本身不横向滚动。
- **订单页深链接 `#/trade-orders?company=<公司>&order=<订单号>`（#179）**：直接打开该公司下的这张订单只读详情，焦点落在详情区，刷新后仍是同一画面；之后改选公司会重写 `company` 并去掉 `order`，打开另一张订单会重写 `order`；只带 `company` 时只切换公司，缺省 `company` 时在当前公司下打开。异常提示：公司不在已加载列表（提示 + “返回列表”，清掉 `company` 与 `order`，焦点回公司下拉框）；订单号无效（含 `order=`，“值或格式无效。”）；订单不存在（“本公司没有该订单号的订单。”）；这两种“返回列表”只去掉 `order`，地址里原本有 `company` 就保留、没有就继续没有；其他读取失败沿用“重试”。
- **发票列表新增“来源订单”列（TINV-04，#181）**：有来源订单时显示链接，点击进入该订单详情；没有来源显示“—”，读屏读作“无来源订单”。390 px 宽下换行不隐藏：链接固定宽 26ch，最多 3 行，行高仍为 44，完整单号放在 `title` 中；列表变宽时在表格内横向滚动，页面本身不横向滚动。
- **五个贸易页统一离开确认（TINV-04，#181）**：发票、结算、调整、报表、期间准入五页有未提交修改时，点击链接、导航或浏览器后退 / 前进，都只弹一次统一确认框“本页有未提交的修改，仍要离开吗？”（英文 “This page has changes that are not submitted. Leave anyway?”）。订单页和主数据编辑器沿用各自的确认文案，后退 / 前进的处理改用同一个共享模块。

### Changed

- **报表、期间准入页（#181）**：旧 → 新：有未提交修改时，旧版直接阻止跳转；新版弹确认框，确认后可以离开。提交进行中或结果未知（busy）时，链接和历史导航仍直接阻止，不询问；付款与收款、调整、期间准入页存在待重试时同样阻止，期间准入页本地待确认记录读不出时也阻止；发票页的待重试算未保存修改，会询问，确认后可离开；报表页没有提交状态。
- **发票、结算、调整页（#181）**：离开时只确认，草稿不会丢；草稿和待处理的过账按公司保存在 sessionStorage，返回后恢复（D266）。
- **取消后退 / 前进（#179、#181）**：取消时地址和草稿保留，只询问一次，不调用 `history.go`；取消是通过在当前位置之后重新加入原地址实现的，所以**原来在前方的历史项（可前进到的页面）会被丢弃**，这是 D275 已接受的限制。
- 迁移：**无**。最新迁移仍为 017，已有 v0.8.0 账套不需要再 migrate（`git diff --name-only v0.8.0 6478d10` 中没有迁移目录或 `package.json` / lock 变化）。

### Fixed

- **真实 Chrome 中后退不弹确认框（#181，D280、D282）**：HashRouter 的 popstate 监听器先于离开确认执行；现改为模块加载时就装上常驻闸门（`App.tsx` 静态引入 `leave-guard-history.ts`），取消时先拦下事件再恢复原地址。离开确认的安装改为 layout effect，输入第一个字符后紧接着后退也会询问。订单页同样受益。
- **付款 / 收款、调整页过账进行中闪现“结果未知”（FLAKE-06，#180）**：点“确认过账”后请求还在进行时，不再出现“过账结果未知”警告和禁用的“安全重试过账”按钮；只有确实没收到服务器答复（或刷新后恢复出待处理过账）时才显示。
- **从订单开票时偶发带入两次（FLAKE-07，#180）**：发票页消费 `fromOrder` 只取用一次，不会再偶发第二次带入并无故弹出“放弃未保存的草稿？”确认框，焦点稳定停在“外部发票号”。

### Internal（无用户可见变化）

- **PROC-06（#178）**：Demo 模板增加“先 build 并断言 dist 严格晚于 HEAD 提交时间”、要求 12 的两条验证路径和断言逐条核对表；发布清单增加“CHANGELOG 只增不删”“‘已验证’写明命令与取证 head”两项；v0.8.0 release-notes 第 3 行去掉过时提示；`components.css` 第 3–4 行注释改为现状（CSS 产物字节不变）。
- **测试与权重（#180、#181）**：新增 web / infra 用例与端到端场景；`scripts/test-shard-weights.json` 增加 `leave-guard-history.test.ts` 的权重 150（手工估计，待 CI 耗时复核）。
- **S9 计划（#177）**，只含设计文档。

### 面向调用方（HTTP API）

- **订单列表** `GET /api/v1/trade/orders`：每个列表项新增必填 `invoicing`（`none` / `partial` / `full`），与 `GET …/orders/:orderId/invoicing` 推算的状态一致（#179）。请求参数、排序与分页不变。
- **发票列表**：每个列表项新增可空 `orderId`（来源订单号）（#181）。
- **未变**：`tradeOrderListQuerySchema`、`tradeOrderSchema`、`tradeOrderInvoicingSchema`（#179 正文，`git diff` 为空）；发票预览 / 过账请求与响应、过账与匹配规则、CLI、日志、端口。新增字段是响应里的增量：请求契约不变；能忽略未知字段的客户端无需改动，但 v0.8.0 的两个列表项 schema 是 z.strictObject，仍用旧严格校验的客户端会拒绝带新字段的响应，需要更新。依据：`git diff --numstat v0.8.0 6478d10 -- packages/core/src packages/infra/src` 只涉及 trade-documents 的三个文件（+2/−0、+3/−1、+47/−5），删除 / 改写的行是把已开票谓词抽成共用片段（#179 正文）。
- 无依赖变化。

### 已知限制与已接受的决定

- **取消离开确认会截断前进历史**（D275）：见上。
- **PG-05 体积预算超出，均已接受**：入口 gzip +375 B（预算 +300 B，超 75 B，D284，换来修复真实 Chrome 的草稿丢失）；CSS 实测 +106 B，超预算 6 B（D295 已接受）。数字取自 #181 正文，发布前未重测。后续可选清理：入口只保留最小常驻闸门；删除已冗余的 `.tinv-source { min-width: 8ch }`。
- 真实 Chrome 的验证在 PR 取证 head 上，不是合并后的 squash 提交；#179 的取证 head 是 470fb6d，最终合并 head 是 d4967af，评审修复（只涉及导航与历史逻辑）沿用前者的时段证据（D270），这部分只由 jsdom 历史轨迹用例证明。#181 的取证 head 就是最终 head 5f3be0a。
- 旧账迁移（M2）仍未完成：M2-05（演练）与 M2-06（切换）未开始，另需用户授权。

## [0.8.0] - 2026-11-21

> 产品代码基线为 `main` 3720e96（S8 功能与流程任务全部合并，Full 12/12，run 44956152354）；自 v0.7.0（tag 所指提交 9f557f7）到产品基线 3720e96 共 5 个已合并 PR 的 5 个 squash 提交（#168–#172；`git rev-list --count v0.7.0..3720e96` = 5），其中 #168 是设计提交，#169、#170 是流程文档，#171、#172 是产品与测试提交。之后 main 只有文档提交（RC #173、Demo #174、S8 评审与回顾 #175，main `fc54f69` 为日期 PR 的基线），产品代码与 `3720e96` 相同。按 D21，tag `v0.8.0` 打在本日期 PR 合并后的 squash 提交上，不是 `3720e96`。Demo 记录（基线 981151d）：[docs/demo/v0.8.0](docs/demo/v0.8.0/run-through.md)。

S8 Sprint：从订单开票。订单详情逐行显示已开票 / 未开票数量，并提供“开票”入口；发票页按订单带入还没开票的数量，生成发票草稿。**无新增迁移**（最新仍为 017），无依赖变化，不改过账规则。

### Added（用户可见）

- **订单详情显示已开票 / 未开票数量，并提供“开票”入口（TINV-02，#172）**：已保存订单（保存后或按订单号查询）的详情，订单行表在“数量”后新增“已开票数量”“未开票数量”两列；未开票数量 = 订单数量 − 已开票数量，用精确小数计算（百万分位，不经浮点）。某行没有剩余时显示绿色“已开完”徽标；超开的行在徽标前显示负数余量。表下方有“开票”入口，指向 `#/trade-invoices?company=<公司>&fromOrder=<订单号>`；所有行都已开完时变成禁用按钮，`aria-describedby` 指向原因“该订单所有行都已开完发票，没有可开票的数量。”。每次详情挂载时读取一次开票信息（见下“面向调用方”）；读取中两列显示“…”、入口禁用并有状态行；读取失败时订单照常显示，出现错误提示和“重试”，两列仍为“…”，入口保持禁用。教学说明改为介绍这两列和“过账时仍按订单匹配校验”。
- **发票页按订单带入草稿（TINV-01，#171）**：从 `#/trade-invoices?company=X&fromOrder=Y` 打开发票页，按订单填入表头（方向、往来方、订单号、价格含税、舍入）和行（商品、税码、单价、折扣 %、可计税费用、订单行号），数量只带入**每行还没开票的部分**，已开完的行跳过；行号在草稿中重新编为 L1、L2…。外部发票号留空，记账 / 单据 / 税日期沿用空白草稿的默认值（当天），需要自己核对修改；填好后焦点停在“外部发票号”。打开后地址里的 `fromOrder` 立即去掉，刷新不会再填一次。当前有未保存草稿时先弹确认框，取消则保留原草稿。提示：订单已全部开票（信息，不生成行）；订单不存在（接口错误码 `NOT_FOUND`，错误）；其他读取失败（含其他 400、503、网络错误，错误 + “重试”）；链接里的公司不在已加载的公司列表（错误“公司不在已加载列表中，未带入”+“取消”，不显示录入区、不读订单；点“取消”或改选其他公司后丢弃这次带入并回到录入区，已有草稿照常恢复）；存在结果未知的过账（警告，不填）。教学模式打开时，发票页教学提示末尾多一句“数量按订单未开票数量带入，过账时仍按订单逐行匹配校验。”。

### Changed

- **订单详情表更宽（#172）**：订单行表的最小宽度 760 → 920 px（`packages/web/src/pages/trade-orders.css`）；390 px 视口下在 `.grid-wrap` 内横向滚动，页面本身不横向滚动（#172 正文，真实 Chrome 的 16 对基线 / 新版截图见其证据 gist）。
- **教学说明文案（订单页，#172）**：旧 → 新：去掉“开票时在发票页填写订单号和订单行号，并在那里预览匹配结果”，改为“已保存的订单逐行显示已开票与未开票数量；‘开票’打开发票页并按未开票数量带入草稿，过账时仍按订单匹配校验”（中英同步）。教学模式关闭时不显示。
- 迁移：**无**。最新迁移仍为 017，已有 v0.7.0 账套不需要再 migrate（`git diff --name-only v0.7.0 3720e96` 中没有迁移目录或 `package.json` / lock 变化）。

### Internal（无用户可见变化）

- **测试与权重（#171、#172）**：web、infra 新增用例与端到端两步开票场景写入已有测试文件；`scripts/test-shard-weights.json` 为 `trade-gui-zh-red-2`、`trade-gui-en-green-2` 调整权重（6230 → 7791、5662 → 7350；#172 正文称只有两轮样本，噪声大于与均值的差，合并后应按首批 CI 耗时复核）。
- **PROC-04（#169）**：Demo 模板新增要求 11（替身必须以脚本路径为参数、执行每个写入脚本并断言产品规则）和要求 12（申请时段前先做不开浏览器的真实服务演练）。**PROC-05（#170）**：发布清单新增“固定负例组”六项。两项只含文档。
- **文档与设计**：#168（S8 计划）。

### 面向调用方（HTTP API）

- **新增** `GET /api/v1/trade/orders/:orderId/invoicing?company=<公司>`（operationId `getTradeOrderInvoicing`，只读，轻量 lane）：返回 `{order, invoiced:[{lineId, invoicedQuantity}]}`，`order` 与订单查询的 `TradeOrder` 同形，`invoicedQuantity` 取自过账匹配所用的同一个已开票数量查询（`tradeOrderInvoiced`）。订单不存在为 404（`NOT_FOUND`）；同一路径的非 GET 方法返回 405；OpenAPI 同步新增路径与 `TradeOrderInvoicing` 组件。
- **未变**：现有订单契约（`tradeOrderSchema`、订单的 GET / POST、OpenAPI `TradeOrder`）、发票预览 / 过账请求与响应、`GET /api/v1/trade/orders` 的参数与排序、CLI、日志、端口。依据：`git diff --numstat v0.7.0 3720e96 -- packages/core/src packages/infra/src` 只有新增行（trade-documents 用例 +29、use-cases +2、contracts +19、http +12、executor +1，删除均为 0），没有改动已有语句。界面预填的“剩余数量”是页面从该接口读到的值算出的，发票的 API 请求格式未变。
- 无依赖变化。

## [0.7.0] - 2026-11-21

> 产品代码基线为 `main` 9421906（S7 功能任务全部合并，Full 12/12）；自 v0.6.0（tag 所指提交 3548d58）到产品基线 9421906 共 6 个已合并 PR 的 6 个 squash 提交（#155–#157、#159–#161；`git rev-list --count v0.6.0..9421906` = 6），其中 #155、#160 是设计提交，#156 是流程文档，其余为产品与测试提交。基线之后 main 只有文档提交（#162 任务表、#163 发布候选、#164 Demo、#165 Sprint 评审、#167 回顾，以及本日期 PR）；`git diff --name-only 9421906 9f557f7` 只含 docs/、design/、CHANGELOG 与根 README，产品代码与 9421906 相同。按 D21，tag `v0.7.0` 打在本日期 PR 合并后的 squash 提交上。Demo 记录：[docs/demo/v0.7.0](docs/demo/v0.7.0/run-through.md)。

S7 Sprint：订单列表可按伙伴、方向、订单日期区间筛选（新增迁移 017，只加一个索引）；D-7 完成（`styles.css` 删除）；CI 新增分片权重守卫。无依赖变化。

### Added（用户可见）

- **订单列表筛选（TORD-05，#161）**：采购 / 销售订单页的订单列表上方新增筛选栏：“伙伴代码”、“方向”（全部 / 采购 AP / 销售 AR）、“订单日期起”、“订单日期止”，以及“应用”“清除”；在任一输入框按 Enter 等同“应用”。应用后从第一页重新读取，“加载更多”沿用筛选；“清除”恢复无筛选首页；保存新订单成功后按当前筛选刷新。起始日期晚于截止日期，或伙伴代码格式不对时就地提示且不发请求（“起始日期不能晚于截止日期。”“值或格式无效。”）。无结果时区分“本公司还没有订单。”（无筛选）与“没有符合条件的订单。”（有筛选），中英同步。教学说明末尾补一句“筛选只作用于列表、不会被记住”，关闭教学模式后不显示。筛选条件不保存。#161 已在真实 Chrome 做过筛选验收（8 个变体，截图与逐像素对比见其正文）；本轮 RC 未新增复测。

### Changed

- **迁移 017（运维可见，#161）**：新增 `017-trade-order-filters.sql`，只有一条 `CREATE INDEX trade_orders_party ON trade_orders(company_id, party_id, order_id)`。**最新迁移 016 → 017**；既有账套须先显式 migrate 到 017 才能由新版启动（启动只校验最新 schema，不自动迁移）。`trade_orders` 的列、约束和触发器不变（#161 正文，测试 `trade-order-filters-migration.test.ts`）。

### Internal（无用户可见变化）

- **D-7 完成（UI-11e，#159）**：订单号按钮 `button.cell-link` 的圆角改由 `trade-orders.css` 的类规则提供，`styles.css` 及其入口 import 删除。#159 正文称 33 个页面状态 × 5 种变体的计算值差与像素差均为 0；发布前未重测。
- **CI-01（#157）**：`scripts/ci.ts` 新增分片权重完整性守卫，PR CI 新增无条件步骤 “Shard weight guard”（`node scripts/ci.ts weights-check`）；新增测试文件必须在 `scripts/test-shard-weights.json` 登记权重，否则失败。同时补上 5 个缺失权重。附带 D204 Full 墙钟与 D199 用例耗时的观察数据（只观察，不改预算）。
- **PROC-03（#156）**：v0.6.0 回顾行动项写入 Demo 模板与发布清单（只含文档）。
- **文档与设计**：#155（S7 计划）、#160（任务表同步）。

### 面向调用方（HTTP API）

- `GET /api/v1/trade/orders` 新增可选参数 `party`、`side`（`AP` / `AR`）、`from`、`to`（`YYYY-MM-DD`）；不带这些参数时请求、排序（订单号升序）与游标契约不变，语句文本与 v0.6.0 逐字相同（#161 正文）。不存在的伙伴返回空页；`side` 非法、日期非法、`from > to`、未知参数仍返回 400。**旧 → 新**：此前 `party` 是未知参数（400），现在是合法参数。
- 其余 API、CLI、日志、端口未变，无依赖变化。
## [0.6.0] - 2026-11-21

> 产品代码基线为 `main` 0f74db9（S6 功能任务全部合并）；自 v0.5.0（tag 所指提交 5e222e7）起 #132–#148 共 17 个提交，其中设计 / 文档提交为 #140、#143、#145、#146，其余为产品与测试提交。0f74db9 之后 main 只有文档提交（#149–#154），产品代码与 0f74db9 相同；按 D21，tag `v0.6.0` 打在日期 PR（#154）合并后的 squash 提交上。

S6 Sprint：订单页补上订单列表与保存前预览（两个新 API，无迁移）；修复业务事件与迁移核对页的几处显示 / 焦点问题；标签页有了图标；`styles.css` 继续瘦身（D-7 仍只是部分完成）。**无新增迁移**（最新仍为 016），无依赖变化。

### Added（用户可见）

- **订单列表（TORD-03，#132）**：采购 / 销售订单页（`#/trade-orders`）在“新订单”表单与“查询订单”之间新增“订单列表”区。列：订单号、子账（方向）、伙伴、订单日期、币种、行数、价税合计；按订单号升序，每页 100 条，有更多时显示“加载更多”。订单号是链接按钮，点击或按 Enter 等同于在“查询订单”里查该号并把焦点移到只读详情（查询区折叠时自动展开）。保存新订单成功后列表重新读取首页。有加载中、空列表（“本公司还没有订单。”）、错误加重试三态，中英双语；教学说明补了一句列表排序与点击订单号的作用。订单筛选不在本版。
- **订单保存前预览（TORD-04，#138）**：命令栏顺序为“预览 → 保存 → 放弃”。预览由服务端计算每行净额、税额、价税合计和整单合计，显示在带“预览”标记的“金额预览”区，并说明“预览不保存、不占号”；明细表多出三列金额和合计行。改动任一字段、放弃或保存成功都会清除预览；失败提示与保存共用同一个 MessageBar，焦点回到“预览”按钮，成功时焦点移到预览结果区。
- **标签页图标（UI-13，#136）**：新增 16×16 SVG 图标（红、绿主题共用）。首页加载不再请求 `/favicon.ico`：#136 在真实 Chrome 中抓包证实，修复前那一条 404 就是 `/favicon.ico`。

### Changed（用户可见）

- **业务事件“待转队列”操作列（UI-11a，#133）**：“查看 / 预览（Ctrl+Enter）/ 撤回”三个按钮完整显示，不再截成“…”，三个按钮都能点中（此前点“预览”“撤回”会落在单元格上）；操作列变宽到 312px，前三列相应变窄；390px 下横向滚动宽度由 560px 增到 760px；窄屏用 Tab 聚焦按钮时，按钮会被完整滚入可见区。凭证列表页无变化。
- **业务主数据保存失败后的焦点（FOCUS-02，#135）**：业务事件 → 业务配置 → 服务 / 往来方（B3）、过账规则（B4）保存失败（如重复代码 409）后，焦点在保存按钮恢复可用的同一帧回到第一个可用输入框；此前真实 Chrome 中先停在 `body`，下一个任务才回到输入框。最终焦点目标不变。B4 的成功保存 / 取消路径未经真实 Chrome 验证，只有 jsdom 覆盖。
- **迁移核对页 390 宽的键值表（UI-12，#148）**：仅在 ≤599px 生效，各键值表按内容分配列宽，字段名、表头和普通值只在词边界换行，不再出现 `enterpri|se` 这类词内断开；放不下时在自己的滚动区内横向滚动，页面不被撑宽。390px 下页面变短（zh 8464 → 7600 px，en 8704 → 7822 px）。1440 宽像素差为 0。

### Internal（无用户可见变化）

- **D-7 继续（UI-11b #134、UI-11c #141、UI-11d #142）**：补上 `.btn-primary:active`、概览重试按钮、维度命中列复选框、VirtualRows 占位行的类规则，并删除 `styles.css` 中已被覆盖的全局声明；各 PR 的采集状态下像素差为 0。**D-7 仍只是部分完成**：订单列表 `button.cell-link` 的圆角还靠 `styles.css` 的全局 `button { border-radius }`，UI-11e（S7 候选）补类规则并删除 `styles.css` 后才算完成。
- **旧账核对 CLI（FLAKE-04 #144 部分修复、FLAKE-05 #147 最终修复）**：CLI 不再加载 Kysely 与导入管线，相关用例改为进程内调用 + 少量 spawn 冒烟；`@erp/core` 新增 3 条仅供仓库内部使用的子路径导出（`private: true` 的 workspace 包，D199 单项豁免）。CLI 参数、输出和退出码不变：#144 在 13 个用例上逐字比对一致；#147 最终验证为修复前后逐字比对 **11/11 一致**、前后均 0 失败（[验证 gist，固定修订 55f1bc1](https://gist.github.com/lingshf/d1752c2ae3049930000445f77b623f6c/55f1bc1df52c9c6bda16e7a0cc904a3def2f7873)）。3000 ms 超时预算未调整（D199）。
- **测试**：FLAKE-03（#137）`navigate()` 等待目标页自己的标题；E2E-01（#139）并发真实 Chrome E2E 干扰调查，只含文档与脚本。

### 面向调用方（HTTP API）

- 新增 `GET /api/v1/trade/orders?company&limit&cursor`（`listTradeOrders`，keyset 分页，走主键，无迁移）。
- 新增 `POST /api/v1/trade/orders/preview`（`previewTradeOrder`，只读、与保存金额同源）。
- 既有 `POST /api/v1/trade/orders` 行为不变；CLI、日志、端口、迁移编号未变。

### 已知限制与未验证项

- D-7 仍只是部分完成（见上，UI-11e）。
- 订单列表无筛选（需要新索引即为迁移，另行立项）；订单页仍只限非库存订单。
- 旧账迁移 M2-05 / M2-06 仍未开始，需要用户授权。
- 焦点相关说明只指 DOM 焦点落位；读屏播报时序未实测。
- CLI 冒烟 3000 ms 是防挂死阈值，未放宽（D199）；验收只针对 PR 层实际负载，整机 CPU 满载（load-cpu）下 CLI 冒烟仍会超时。
- 本节 PR 描述里的数字（像素差、页面高度、字节数）取自各 PR 正文，发布前未重测。

## [0.5.0] - 2026-11-20

> 产品代码基线为 `main` 6c8724b（S5 全部合并：#112、#113、#115、#117、#118、#120–#123、#125、#126）；自 v0.4.0（tag 所指提交 b3b3fb7）起共 17 个提交，其余为文档与设计提交（#110、#111、#114、#116、#119、#124）。`packages/` 的变化只在 `packages/web/src`（样式、两处焦点修复、迁移核对页的表格容器）和测试。按 D21，tag `v0.5.0` 打在发布 PR 合并后的 squash 提交上。

S5 Sprint：把 `styles.css` 里的全局元素规则逐页改成页面类 / 组件规则，并删除其中已被覆盖的部分；修复订单、凭证、业务事件页的焦点落点时序；为一个偶发的 E2E 失败加诊断。**无新增迁移**（最新仍为 016），无后端 / API / CLI / 日志 / 端口变化，无依赖变化；已升到 v0.4.0 的账套升级无需额外步骤。版本号按 SemVer 取 minor：有少量用户可见改进，无不兼容变化。

### Changed（用户可见）

- **迁移核对页的键值表（S5-b，#112）**：“字段 / 快照预期 / 目标实际 / 差额”表放进自己的滚动区，不再超出折叠区右缘（原来右侧多出 8px，越过分隔线）；表格比原来窄 16px，窄屏放不下时在表格自己的区域内横向滚动，页面不被撑宽。窄屏（390px）下个别单元格可能多折一行（#112 自建夹具中一张表增高 18px，其下内容下移 18px）。页面仍只读，内容与文案不变。
- **保存订单后的焦点（S5-h，#117）**：保存提示出现的同一次提交里，焦点就落到提示上，DOM 焦点更早落位；此前提示先出现，焦点暂留在 `body`，3.6–28.3 ms 后才移到提示（#117 在真实 Chrome 中的测量）。读屏播报时序未实测，不作承诺。最终焦点位置不变，样式、文案和交互不变。
- **凭证与业务事件的焦点（FOCUS-01，#123）**：凭证页点“编辑”打开已保存的草稿后，焦点直接落在第一个输入框；保存草稿、查看已过账凭证、确认过账、确认删除结束后归还焦点，业务事件点已过账事件的“查看”、忙碌结束后焦点回到“查看”按钮，都是在结束状态提交的同一刻完成，不再晚一个任务。最终焦点位置与之前相同；业务事件“确认撤回”的唯一时序差异是先聚焦到“撤回”按钮，该按钮随后随行移除，焦点回到 `body`，与之前一致。#123 评估的其余 4 处在真实 Chrome 中未复现，保持原样。样式、文案和交互不变。
- **触控尺寸的来源（S5-g，#126；用户可见高度不变）**：`styles.css` 的全局 `button, select { min-height: 44px }` 已删除，各 `button` / `select` 的最小高度改由各组件和页面类规则提供（`.btn`、`.ui-field select`、`.filter-bar` / `.page-header` 中的 `.field > select`、`.jv-btn` / `.jv-select`、`.fasttab-toggle`、`.segmented button`、`.cell-link`、`.appbar-prefs select`、`.overview-failed button`）。#126 在 155 张截图（31 个状态 × 5 个变体）上 base 与 head 像素差均为 0，全元素计算值零差。v0.4.0 及更早版本中，“未被其他样式覆盖的 button / select 的 CSS 最小高度基线为 44px（`styles.css`）”自 v0.5.0 起不再成立（机制变了，不是实际高度变了）；该说法只指这类元素的 CSS 最小高度，不保证所有控件或点击区；分段按钮仍是按共享变量减 6px 的例外。
- 其余 S5 页面类规则迁移（#113 贸易页、#115 外壳与共享组件、#118 凭证 / 业务事件、#120 订单录入页、#122 共享表格对齐与 FastTab 禁用态、#125 总账 / 期末 / 科目表）**无用户可见变化**：新规则与原全局规则同值，各 PR 的截图与计算值对照均为 0 像素差。

### D-7（`styles.css` 全局元素规则）只完成了一部分

- **本版删除**：`legend`、`select`、`dl` / `dt` / `dd`（含 ≤ 680px 的 `dd`）、`caption`、`th, td` 的 `padding` 与 `text-align`、`thead, tfoot`、`button` 的 `padding` / `font-weight`、`button:disabled`，以及 `button, select` 的最小高度（#126）。
- **仍保留 4 项（D-7 剩余项）**，因为 #126 的源码检查发现它们在未采集的状态里仍生效：
  1. `button:active:not(:disabled)` 的背景（`.btn-primary` 没有 `:active` 规则）；
  2. 概览加载失败时重试按钮的 `background`、`color`、`border`、`border-radius`、`cursor`，以及 `:hover` / `:active` 背景；
  3. 财务维度列表中 `label.ui-master-hit` 内复选框的 `width`、`height`、`flex-shrink`、`accent-color`；
  4. `th, td` 的 `border-bottom`、`vertical-align`、`min-width`（VirtualRows 超过 100 行时的占位行）。
- 这 4 项在已采集状态里删除后计算值也为 0 差，但按 #126 的判断不能删。设计角色正在把它们登记为 backlog；**不要把 D-7 写成“已完成”或“全局元素规则已全部删除”**。

### Fixed

- 订单、凭证、业务事件三处焦点时序见上（#117、#123）；这是时序修复，不是功能错误。

### Internal（非用户可见）

- FLAKE-02（#121）：为贸易 GUI E2E 的期末月份下拉轮询偶发为空，以及 `afterAll` teardown 超时，增加 JSONL 定向诊断。**默认关闭**，设置 `ERP_E2E_DIAG=1` 才开启；只改测试支持代码与两个 slow E2E，不改断言、超时、重试，不改产品代码。**原因仍未知**，FLAKE-02 保持排队，不算已修复。
- CSS 预算（D133）：条件 1，S5-g（#126）相对 merge-base 的 CSS 减少 122 B；条件 2，S5 累计全部 CSS gzip 为 +413 B（28f9de8 → #126 head a456f33，gzip -9，同一口径），扣除 D112 允许的 Journals.css +222 B 后为 +191 B，在 +0.3 kB（300 B）以内；原 D131 的“累计净负”不再作为条件。数字取自 #126 正文，发布前未重测。
- PROC-02（#111）：发布流程补充范围类断言与 API / GUI 分条规则，Demo 模板补充截图状态断言与进程归属检查（`docs/release/README.md`、`docs/demo/TEMPLATE.md`）。

### 已知限制

- **旧账迁移（M2）仍未完成**：M2-05（演练）与 M2-06（切换）未开始，另需授权；迁移核对页只读，核对通过不等于允许切换。
- 真实迁移演练需用户提供期初未结明细文件（导入范围含 AP/AR 控制科目时必须）；期初未结项不能开贷项或取消（D30）。
- 订单页仅限非库存订单；导入、核对确认与备份 / 恢复仍是命令行。
- D-7 还有上述 4 项全局规则保留（概览失败重试按钮、财务维度复选框、`:active` 背景、VirtualRows 占位行 `td`）。
- 已登记、本版未处理：业务事件“待转队列”操作列按钮截成“…”且 `<td>` 拦截点击（UI-11a）；业务事件主数据保存失败（409）后焦点晚一帧（FOCUS-02）。两项在 v0.4.0 的 base 上已存在，不是本版引入。
- FLAKE-02 的偶发失败原因未知；#125、#126 取证时在 390 宽下曾偶发一个 `journals-detail` 链接高度检查失败（20px），未能稳定复现，也未重跑或放宽断言。
- 触控 / 点击区：本版没有新增真机粗指针测量；v0.4.0 的 36px / 44px 说法的范围限制仍然有效。

## [0.4.0] - 2026-11-20

> S4 Sprint 发布，已获协调者授权（D102）。产品代码基线为 `main` 662a763（S4 全部合并：#86–#104、#106）；之后 main 只增加了文档与设计提交（#105、#107、#108），`packages/` 与 662a763 相同。按 D21，tag `v0.4.0` 打在本日期 PR 合并后的 squash 提交上。

S4 Sprint：补上非库存订单录入页，完善教学提示与未结项筛选，并统一各页的控件高度、徽标与表格细节。产品代码变化只在 `packages/web`（界面、文案、样式）与测试；**无新增迁移**（最新仍为 016），无后端 / CLI / 日志 / 端口变化；已升到 v0.3.0（迁移 016）的账套升级无需额外步骤。

### Added（用户可见）

- **采购 / 销售订单录入页（M1-R1a，#91）**：“总账”导航组中“业务事件”与“采购与销售发票”之间新增页面。表头含订单号、子账 AP/AR、伙伴、币种（公司本位币，只读）、日期、价格含税、舍入；订单行含商品、税码、数量、单价、折扣 %，最多 100 行，行号自动为 L1、L2…。保存前不显示金额，保存后显示服务端算出的每行净额 / 税额 / 价税合计和合计，并链接到发票页。可按订单号只读查询；未保存的草稿离开前会确认。仅限非库存订单，订单不过账、不生成凭证。
- **预付 / 贷项 / 专用纠错页新增“按伙伴代码筛选未结项”（M1-R2b，#90）**：回车或离开输入框生效，由服务端只返回该伙伴的未结项；预付不显示此项；非法代码不发请求并保留已选项；改变筛选会清空已选来源 / 目标并从第 1 页重新加载；“清空草稿”同时重置筛选。默认不筛选时与之前相同。
- **更多教学提示（M1-R2a，#88；UI-10e，#87）**：付款与收款、预付 / 贷项 / 纠错、贸易主数据补充借贷方向与配置说明；期末结账的“期间准入说明”（准入只控制贸易单据能否记账，不结账）；迁移核对页教学提示“核对通过 ≠ 批准切换；切换须用户另行授权。”。均只在教学开启时显示，关闭后边界说明仍保留。

### Changed

- **只读“启用”列改为徽标（#100 科目表，#103 贸易主数据五个页签）**：原为灰色禁用复选框，现为“✓ 启用 / ✓ Active”或“停用 / Inactive”；列宽 72px → 104px（财务维度页该列加宽 32px，仍为复选框）。编辑表单中的复选框不变。
- **凭证已过账列表操作列（#101）**：最后一列表头原为空，现为“操作 / Actions”；按钮可见文字原为带来源号且被截断，现为“查看 / 编辑”；可访问名称（含来源号）不变。
- **窄屏品牌名（#102）**：宽度 ≤ 760px 时顶栏只显示图标，标题视觉隐藏但仍在无障碍树中；1440 宽不变。
- **控件高度（#92 #97 #98）**：桌面（细指针、宽 > 760px）下，财务维度、贸易主数据（#92）、发票、付款与收款、预付 / 贷项 / 纠错（#97）、期末结账（#98）这些页面中改用共享控件高度变量的输入、选择、按钮由 44px 改为 36px；**仅限这些页面的这些控件，不是全站**：v0.4.0 发布时，未被其他样式覆盖的 button / select 的 CSS 最小高度来自 `styles.css` 的全局基线（不保证所有控件或点击区），分段按钮按共享变量减 6px；v0.5.0（#126）起该全局规则已删除，改由各组件和页面类规则提供触控尺寸，实际高度不变。窄屏（≤ 760px）仍为 44px；#92 / #97 的实测表显示，在模拟粗指针的桌面 Chrome 中所列控件为 44px。页面更短。结算分配复选框标签桌面 36×36、窄屏或粗指针 44×44。
- **发票“新增行”按钮（#93）**：可见文字由“新增行（Alt+Shift+N）”改为“新增行”加 `Alt+Shift+N` 徽标；可访问名称由“新增行（Alt+Shift+N）”变为“新增行”；`aria-keyshortcuts` 与快捷键行为不变。
- **迁移核对页（#87）**：页头统一；差异和核对明细展开后先显示“字段 / 快照预期 / 目标实际 / 差额”键值表，值不同的标“× 不符”，原始 JSON 默认折叠。差额只对金额与计数字段计算，明细行不配对。页面仍只读。
- **外壳偏好警告（UI-10a，#104）**：偏好读取 / 保存失败时的“偏好设置警告”由四边 1px 边框的卡片改为共享警告消息条：左侧 4px 实色条、圆角更小，符号由标题里的 `⚠` 改为消息条自带的 `!`（辅助技术忽略）。文案、`role="alert"`、无障碍名称、显示条件（关闭教学后照常显示）与颜色不变。
- **期间准入保存提示（UI-10g，#94）**：由“原操作已成功；请以当前期间状态为准。”改为“贸易期间准入已保存。” / “Trade period admission saved.”。
- **样式细节**：表格内金额 / 科目链接改为点线下划线，悬停或聚焦为 2px 实线，期末结账行标题不再着色或吸顶（#98）；凭证编辑器去掉“框中框”（#99）；分段控件选中态、禁用次要按钮、宽表格横向滚动右缘阴影（#89）；科目表同样加滚动阴影（#92）。均不改会计规则、校验与键盘操作。

### Internal（非用户可见）

- M1-R1b（#95）：E2E 主流程改为通过订单页录入 PO-DEMO，订单行号 `OL1` → `L1`；根 README 的订单步骤同步为界面操作。
- UI-09g（#106，部分完成：删除 dl 布局与 table 声明，其余转 S5）：删除 `styles.css` 中经证实计算值不变的全局 `dl` / `table` 声明；**无用户可见变化**（100 张截图 base→head 像素差均为 0）。其余全局元素规则保留，列为下一 Sprint 迁移待办。
- PROC-01（#86）：发布流程 `docs/release/README.md` 与 Demo 模板 `docs/demo/TEMPLATE.md`；D79 用户文档同步（#96）。

### 已知限制

- **旧账迁移（M2）仍未完成**：M2-05（演练）与 M2-06（切换）未开始，另需授权；迁移核对页只读，核对通过不等于允许切换。
- 真实迁移演练需用户提供期初未结明细文件（导入范围含 AP/AR 控制科目时必须，即使各科目都声明为 empty）；期初未结项不能开贷项或取消（D30）。
- 订单页仅限非库存订单，不含库存与收货。
- 导入、核对确认与备份 / 恢复仍是命令行。
- 36px 仅限上述页面与控件；v0.4.0 发布时，未被其他样式覆盖的 button / select 的 CSS 最小高度来自 `styles.css` 的全局基线（不保证所有控件或点击区），v0.5.0（#126）起改由各组件和页面类规则提供，实际高度不变。粗指针桌面只有 #92 / #97 的模拟粗指针 Chrome 测量（所列控件 44px），没有真机验证。发票行高 53 → 45 仅指桌面细指针。

## [0.3.0] - 2026-11-19

UI-1 界面改进 Sprint（UI-01..UI-08，共 13 项）与 M2 旧账迁移前段完成：全站界面统一为新的设计规范，旧账导入补齐期初未结项与核对。**M2 迁移仍未完成**（M2-05 演练、M2-06 切换未开始，且需另行授权），见“已知限制”。产品代码基线为 `main` c7e5783（#82）；按 D21，tag `v0.3.0` 打在本发布 PR 合并后的 squash 提交上。**升级：新增迁移 015、016，目标库须先显式 `migrate`**（`start:local` 不自动迁移；016 建索引，20 万核销历史下约 7.2 s）。版本号依据 D66（新增界面能力，SemVer 次版本）。

### Added（用户可见）

- **全站新界面（UI-01..UI-08，#62 #65 #67 #68 #69 #71 #72 #74 #75 #76 #77 #80 #82）**：深色品牌顶栏（专业红 / 专业绿），语言、主题、教学说明移到顶栏右侧；248px 分组侧栏；统一的页头、命令栏、FastTab 折叠分区、KPI 卡、卡片表格、徽标（颜色加符号）与消息条；主操作用主色按钮，“预付、贷项与专用纠错”页的取消 / 反向确认按钮用危险样式。窄屏（≤ 760 px）或粗指针下按钮、输入、选择等控件 ≥ 44 px（表格内金额链接高 44 px、宽 26–41 px），390 px 宽下页面不再横向溢出，宽表格在自身卡片内滚动。界面改版不改会计规则、过账校验和键盘操作。
  - 总览 / 运行状态（#71）、科目表（#67）、财务维度与贸易主数据（#77）、凭证与业务事件（#69）、采购与销售发票（#75）、付款与收款及预付 / 贷项 / 专用纠错（#76）、往来未结项与账龄（#65）、总账报表与明细（#68）、期末结账与期间准入（#80）、迁移核对（#74）。
  - 凭证草稿分为“常规”“分录行”两个分区，分录表带借贷合计行，不平时标题显示“借贷不平”徽标（仅提示，仍以服务端预览为准）；预览仍为对话框。
  - 期末结账页新增“期间列表”卡片；结账区位于准入区上方；准入状态用徽标显示。
  - 付款与收款的核销分配新增“应付/应收、已分配、剩余”KPI。
  - AI 面板卡片化：“仅为候选，需人工确认。”边界说明始终显示（不受教学开关影响），候选结果带“候选 · 未保存”或“未通过校验”徽标（#72）。
  - 财务维度、贸易主数据、付款、纠错、期间准入等页新增教学说明卡片（关闭教学说明后不渲染；边界说明始终显示）。
- **贸易子账按期初公式核对（M2-04b，#70）**：往来未结项与账龄的 GL 核对新增“期初”列（旧账期初未结项原始金额 P）；`tradeDifference = 贸易 GL + P − 子账`，`otherSource = 全部 GL − 贸易 GL − P`。没有旧账期初项的账套 P = 0，数值与此前相同。
- **旧账期初未结项导入（M2-03b，#63，D25/D30）**：`legacy-import --opening-items FILE.json`。导入范围含 AP/AR 控制科目就必须提供明细文件（即使各科目都声明为 empty），缺失或有问题时以 `INVALID_INPUT` 退出且不建库，错误逐条列出规则。导入后期初未结项出现在未结项、账龄和历史余额中，可用付款 / 收款核销，也可用预付 / 预收应用；**期初未结项不能开贷项或取消**（返回 `reference` 错误，D30）。
- **旧账核对与迁移核对页（M2-04，#59）**：导入结束自动核对并保存报告；新增 `legacy-reconcile --snapshot-dir DIR --target DB --check` 与 `--confirm FILE`（真实差异拒绝确认）；新增只读页面“迁移核对”（`/#/migration`，`GET /api/v1/migration`），没有确认、演练或切换按钮。有 AP/AR 控制科目而缺 `opening=done` 时判“阻断”；有 `opening=done` 但两式不为零判“差异”。

### Changed

- 迁移核对：默认夹具（全部 `empty`）的结论由“阻断”变为“待确认”（门禁现在能看到 `opening=done`）（#63）；缺 `opening=done` 的阻断提示改为说明需用期初明细文件重新导入（#70）。
- 日志：服务端错误日志（`{requestId, errorType}`）的 `errorType`：领域 / 存储拒绝的 400 由 `ParseError`、404/409 由 `HttpError` 改为 `DomainRejection`；AI 取消的 400 由 `ParseError` 改为 `HttpError`；请求解析失败（含 415）仍为 `ParseError`。HTTP 响应体与状态码不变（#81）。
- 账龄、历史余额与 GL 核对在大量核销历史下更快，内容逐字段不变；新增迁移 016（索引 `settlements_report`）（#78）。
- 凭证已过账列表的“查看”按钮改为从行首显示并以省略号结尾（原先截成单据号中间一段，像乱码）；付款与收款分配表行间由 2px 双线改为 1px 线（#82）。

### Fixed

- 发票页在预览 / 过账请求刚返回的瞬间按 Alt+Shift+N，原来可能被静默忽略，现在会新增行；过账成功后旧草稿存储也及时清理（FLAKE-01，#79）。
- 窄屏下期末结账金额链接、往来报表单元格链接和明细“凭证”链接的点击区提高到 44 px；多页在 390 px 宽度的横向溢出已消除（#62 #65 #68 #72 #82）。

### Internal（非用户可见）

- 设计规范与原型 `design/ui/`、设计一致性审查 `design/reviews/UI-1.md`（有条件通过，条件 C1–C5 已在 #82 完成）、95 张终版截图 `design/ui/screenshots/final/`（#60 #82）。
- CI：Full 浏览器场景拆分与分片重平衡（R6 #55，R6b #73：Chrome 磁盘预热、拆分贸易 GUI 场景，现为 6 个 browser + 6 个 unit 作业）、隔离测量的浏览器作业与 CLI 隔离（#61 #64 #66）。至此 v0.2.0 已知的“Full 一片约 147 s”问题已按 D15/D38 处理，以后续 main Full 实测为准。
- M1-R3（#78）：新增含 20 万核销历史与 3 客户端并发的容量基准（只在 Bench 层运行）。M1-R4（#81）：精简贸易 E2E、细化拒绝断言、统一 LF。

### 已知限制

- **旧账迁移（M2）尚未完成**：M2-05（迁移演练）与 M2-06（受控切换）未开始，且需用户另行授权；迁移核对页只读，没有演练或切换入口。核对通过不等于允许切换。
- **真实迁移演练时，用户需提供期初未结明细文件**（旧账没有子账）。只要导入范围含 AP/AR 控制科目就必须提供，即使各科目都声明为 empty。
- 非库存订单仍只有 API，没有录入界面（M1-R1）。
- 保存期间准入成功后，页面提示仍沿用“原操作已成功；请以当前期间状态为准。”（与“响应丢失后重试”共用文案）。
- 导入、核对确认与备份 / 恢复仍是命令行，不提供界面。
- 随 v0.3.0 发布的终版截图由虚构夹具生成，页面中的编码与金额（如 PARTY、AP-DEMO、DEMO 公司）不是真实账套数据。
## [0.2.0] - 2026-11-19

M1 贸易里程碑完成（M1-01..07，M1-R 评审通过，无阻塞项）。产品代码为 `main` 自 v0.1.0 以来合并的 #49、#47、#53、#54、#56；#57 为 M1-R 评审文档。按 D21，tag `v0.2.0` 打在本发布 PR 合并后的 squash 提交上。v0.1.0 中标为“预览”的 M1-01..05 自本版本起视为 M1 完成。**M2 旧账迁移尚未完成**，见下文“已知限制”。迁移：新增 013、014，目标库须先显式 `migrate`（`start:local` 不自动迁移）。

### Added（用户可见）

- **未结项、账龄与 GL 核对（M1-06，#49）**：新页面“往来未结项与账龄”（`/#/trade-reports`），三个视图——未结项、账龄、GL 核对；可查当前余额或指定月末的历史余额，按往来方和 AP/AR 筛选，并下钻到单据、原发票行、核销记录和凭证。账龄分未到期及逾期 1–30、31–60、61–90、91+ 天；贷项与预付款单列，不抵消发票。GL 核对覆盖全公司全部往来，分列子账、贸易 GL、其他来源 GL 与真实贸易差异，不自动抵平。支持虚拟滚动，贸易数据不会自动发给 AI。
- **期间 trade/tax 准入（M1-06，#49）**：“期末结账”页新增“期间贸易模块准入”：勾选 trade 与 tax、填写原因并保存。旧期间、新公司期间、新开下期默认**不**准入；新增任何贸易过账（含无 GL 的反向和专用取消）前，会计日期间须开放且两个模块都已准入。准入改动会使旧预览失效，且与结账操作互锁。
- **旧账导入命令（M2-03，#47）**：`storage:admin legacy-import`，命令行，无界面。输入已校验的旧账快照、新目标路径和六项导入决定，导入历史凭证与关闭状态；拒绝合并或覆盖已有业务库，同一工具的未完成导入可断点续跑。完成状态为 `imported`，**核对通过（`reconciled`）前不能作为活动库打开**。导入凭证以 `LEGACY` 来源显示，贸易 GL 核对把它们列为“其他来源”，不隐藏差额。
- **贸易 GUI 主路径验收（M1-07，#54）**：README 提供一条完整的贸易主路径（期间准入、主数据、PO 匹配采购、部分付款含折扣、预付应用、销售、贷项、专用取消、月末账龄与 GL 核对）；真实浏览器中/英 × 红/绿纯键盘验收在 Full 层运行。

### Changed

- 期间新增 `modules` 字段（迁移 013）；`PUT /api/v1/periods` 现在必须带 `modules`，保存期间准入要求显式确认（#49）。
- 贸易过账的核销与期间准入确认，在发请求前先持久化完整确认封套并逐字读回；浏览器存储失败时阻止提交，不冒充成功。结果未知时只用原封套重试（#49）。
- 新增迁移 014（M2-03，schema 版本 14）；根 README 的升级说明更新为迁移 014（#47）。已发布的 001–013 不变。

### Fixed

- 凭证页草稿/已过账列表为空时显示“没有凭证。” / “No journals.”，不再误显示“没有科目。”（#53）。
- 未配置旧账快照时，“只读报表 → 试算平衡表”将上下文接口的有效 503 显示为中性“未配置或暂不可用”，说明不影响当前账套并链接到总账报表，可显式重新加载；运行状态页仅请求 health。网络、契约与读取错误仍显示为错误（#53）。
- 返回付款/纠错页时重新读取未结项，能看到刚过账的发票和最新余额/版本（#54）。
- 根 README 升级说明从 008 更正（#53），随 #47 再更新为 014。

### Internal（非用户可见）

- Full 改用 runner 自带 Chrome（`ERP_E2E_BROWSER_CHANNEL=chrome`），修复 Ubuntu 26 上 Playwright 浏览器安装失败导致慢测未运行的问题（#56）。
- 贸易 HTTP 性能基准（`http-contract-v2`，含契约解析）：1M GL、1000 伙伴、10 万未结项，正式 Linux Bench 三轮全部达标，账龄 p95 最高 484 ms（预算 1000 ms）；证据见 `docs/performance/`（#54）。
- M2-03 在 100 万 GL 行 / 5 万凭证导入的验收：三轮总耗时约 200 s，导入进程峰值 RSS ≤ 347.5 MiB，HTTP p95 ≤ 450 ms；导入写连接页缓存由 128 MiB 降至 16 MiB（#47）。
- M1 里程碑评审与测试审计 `design/reviews/M1.md`、任务表更新、后续任务 M1-R1..R4（#57）。
- Full 三个分片的 Vitest 耗时（run 44551649788，336c0cd）：24.47 s / 21.54 s / **147.52 s**；第 3 片超出 D15 的每片 ≤ 25 s 目标，由 R6 #55 与 M1-R4 处理。

### 已知限制

- **Full 第 3 片约 147 s**，超出 D15 的分片耗时目标（≤ 25 s）；R6 #55 正在处理。不影响功能与用户行为。
- **旧账迁移（M2）尚未完成**：按 D25/D26，交付顺序为 M2-04 首批 → M2-03b（期初未结项）→ M2-04b（P 公式验收）→ M2-05（迁移演练）→ M2-06（受控切换）。导入的旧账 AP/AR 余额目前不会成为未结项，贸易 GL 核对会将其列为“其他来源”差额，也不能用付款/收款核销。
- **真实迁移演练时，用户需提供期初未结明细文件**（旧账没有子账）。只要导入范围含 AP/AR 控制科目就必须提供，即使各科目都声明为 empty；未提供时迁移不能放行。
- 非库存订单只有 API，没有录入界面（M1-R1）；教学提示只覆盖发票和报表页，付款、调整、主数据、期间准入页没有（M1-R2）；调整页未结项选择列表只有“加载更多”，没有虚拟滚动（M1-R2）。
- 预付发票路线和预收税不在本版本范围（FR-T06 明确延后）。
- 保存期间准入成功后，页面提示沿用文案“原操作已成功；请以当前期间状态为准。”（与“响应丢失后重试”的提示相同）。
- 导入 CLI（M2-03）与导入映射不提供界面；真实旧账操作须另行授权。
- 账龄/当前余额每次聚合全部未结项；容量基准尚无带核销历史与并发的场景（M1-R3）。

## [0.1.0] - 2026-11-19

产品代码基线为 `main` 提交 `d8fa0bb`；此后 main 仅有文档提交（#50、#52），产品代码与 d8fa0bb 相同。按 D21，tag `v0.1.0` 打在本发布 PR（#51）合并后的 squash 提交上（含 M0 核心账务、M1-01..05 贸易功能、M2-01/02 旧账预演工具）。**贸易（AP/AR）功能尚不完整**（缺 M1-06 未结项/账龄/GL 核对、M1-07 端到端验收），因此本版本标为“预览”。非生产演示版，不承诺符合某国会计准则。

### Added（用户可见）

- **公司、科目、期间**：类型化公司/科目/期间主数据，内置八个科目，12 个开放期间；实体 revision 乐观并发，409 冲突保留输入（#15）。
- **财务维度**：六类维度配置与统一规则，必填/禁止/默认/派生，凭证最多 32 个维度键（#17、#19）。
- **凭证**：草稿保存、只读预览（Ctrl+Enter）、事务内确认过账、历史镜像纠错/替换/重分类；记账日期、单据日期、税日期分别记录，仅记账日期决定期间（#19、#34）。
- **业务事件与待转队列**：现金服务收付及取消、统计事件、清算匹配、普通凭证“排队，暂不过账”（#20）。
- **总账报表**：试算（三阶段）、利润表、资产负债表、六项对账、总账明细，金额→科目→GL 行→原凭证下钻，游标分页（#21）。
- **期末结账**：结账向导、年度冻结、结转凭证、推进到下一期间（#22）。
- **AI 助手（仅候选）**：在凭证编辑器旁起草候选/讲解；绝不保存、排队或过账（#24）。
- **教学说明开关**：侧栏“显示教学说明”，默认关闭，仅影响说明文字，不改变会计规则（随 #15 起的壳及各页面）。
- **贸易主数据**：往来伙伴、非库存商品、AP/AR 过账配置、付款条件、税码，按公司隔离（#36）。
- **采购/销售发票**：税/折扣精确计算预览、确认过账（TRADE 受控适配器）、外部发票号唯一、订单行匹配（数量剩余 + 单价 1% 容差）（#32、#44）。
- **付款与收款**：对 1–100 个未结项部分核销、现金折扣、幂等重试、分页与虚拟滚动（#46）。
- **预付/预收、贷项与专用纠错**：预付款/预收、非库存贷项、双边部分应用、退款、专用取消与反向（#48）。
- **旧账快照（命令行）**：`storage:admin legacy-snapshot`，仅 Windows、需显式授权、隔离已停写的源目录（#42）。
- **备份与恢复（命令行）**：`storage:admin backup|restore`（#37）。

### Changed

- 技术栈：API 由 NestJS 改为纯 Fastify；仅支持 SQLite（WAL 加固），删除 PostgreSQL；6 包合并为 core/infra/web，直接运行 TypeScript 源码；统一 Vitest + Biome（#4、#5、#6、#7）。
- 依赖精确锁定并配置 Dependabot；lockfile 仅使用公共 registry（#8、#13）。
- 控制科目（AP/AR/TAX）只能通过注册的受控适配器过账；手工、AI、导入/队列、通用冲销仍被拒绝（#34、#44）。
- 外部发票号按“往来方”统一唯一，AP 与 AR 同一规则（#44）。
- 启动前先校验运行配置，重依赖延迟加载（#18）。

### Fixed

- Windows 上旧快照间歇 INVALID_SNAPSHOT 的诊断与压力回归（未复现历史故障；增加只读回归与可诊断错误）（#38）。
- 测试时序不稳（计算器与启动器）（#40）。

### Removed

- 旧服务器、旧浏览器工作台、旧专属测试和备份/快照创建命令；仅保留后续 M2 需要的**只读旧账消费链**（#27）。

### Internal（非用户可见）

- CI 分层与预算、每晚 Bench 精简、Full 分片并加速 Vitest（#14、#31、#41、#45）。发布基线 `d8fa0bb` 的 Full 为 **3 分片**（`.github/workflows/full.yml`，`[1, 2, 3]`），run 44526425578 均通过：分片 1/3 约 45 秒、2/3 约 47 秒、3/3 约 51 秒（job 起止时间），整次运行约 54 秒；百万 GL 行容量与并发基准（#21、#22、#25）；SQLite worker 执行器（#25）。
- 设计文档、任务表与评审：#1、#2、#12、#23、#28–#30、#33、#35、#39。

### M2 旧账预演（对用户的实际可见度）

| 能力 | 可见度 | 说明 |
| --- | --- | --- |
| M2-01 旧账快照与 WAL 备份（#42） | 命令行 | 须显式授权；真实旧账尚未被任何自动流程读取 |
| M2-02 导入映射与 dry-run（#43） | 仅库代码/测试 | **没有命令行或界面入口**；决定 C 的六项无默认值，对真实数据仅允许 dry-run 清单 |
| M2-03 导入执行（#47） | 未合并 | 不在 v0.1.0 |

### 已知限制

- 内置八个科目不含 AP/AR/税控制科目；使用贸易单据前须先建立相应科目与贸易主数据。
- 贸易页面尚无未结项/账龄报表（M1-06）与端到端验收（M1-07）。
- 旧快照未配置提示、凭证空列表文案和根 README 迁移版本说明已在 v0.2.0 修复（见 `[0.2.0]`）；v0.1.0 原发布基线不包含这些修复。
- 偏好（语言、主题、教学开关）保存在浏览器 localStorage，不随账套保存。

[Unreleased]: https://github.com/lingshf/ai-native-erp/compare/v0.14.0...HEAD
[0.14.0]: https://github.com/lingshf/ai-native-erp/compare/v0.13.1...v0.14.0
[0.13.1]: https://github.com/lingshf/ai-native-erp/compare/v0.13.0...v0.13.1
[0.13.0]: https://github.com/lingshf/ai-native-erp/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/lingshf/ai-native-erp/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/lingshf/ai-native-erp/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/lingshf/ai-native-erp/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/lingshf/ai-native-erp/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/lingshf/ai-native-erp/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/lingshf/ai-native-erp/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/lingshf/ai-native-erp/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/lingshf/ai-native-erp/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/lingshf/ai-native-erp/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/lingshf/ai-native-erp/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/lingshf/ai-native-erp/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/lingshf/ai-native-erp/releases/tag/v0.1.0
