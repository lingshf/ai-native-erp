# REFAC-06c：拆分 `InvoiceEntry` 函数体（不改行为）

- Sprint：S15（[计划](S15.md)）　类型：重构（页面）　优先级：P2　决定：待协调者定编号　建议分支：`refac-06c-split-invoice-entry`
- 来源：REFAC-06（#242，main `48ba245`）只搬移、不拆函数体，把“按 ② 拆 `InvoiceEntry`”登记进候选池（[S14 REFAC-06 决定 5](S14.md#refac-06拆分-tradeinvoicestsx只搬移不改行为)）。做法比照 [REFAC-03b](REFAC-03b-company-journals-split.md)（#231）。
- 迁移：**不加**。浏览器时段：**不需要**（理由见“证据要求”）。
- 数据：只用虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 现状（main `002c237`）

- `packages/web/src/trade-invoices/invoice-entry.tsx` 共 553 行：
  - 模块层（`:1–82`）：导入；`IntakeState` 类型、`intakeTone`、`lineFields`、`ADD_LINE_SHORTCUT`、`toCommand`；
  - 其余全部是 `export function InvoiceEntry`（`:83–553`，约 470 行），远超 ②。
- `InvoiceEntry` 内部分两块：
  - **状态与命令**（`:83–292`）。Hook 调用按源码顺序为（自定义 Hook 无）：
    1. `useQueryClient`（`:98`）；
    2. `useState`：`saved`、`draft`、`documentId`、`dirty`、`preview`、`pending`、`busy`、`error`、`retry`（`:99–111`）；
    3. `useLayoutEffect`：写 `sessionStorage`（`:115–117`）、向页面报告离开守卫（`:118–120`）、卸载时报告空闲守卫（`:121`）；
    4. `useState` `receipt`（`:122`）、`useRef` `firstField`（`:123`）；
    5. `useState` `fromOrder`（`:144`）；
    6. `useEffect`：从订单填入后聚焦外部发票号（`:146–148`）、处理地址中的开票请求（`:184–189`，带 `biome-ignore` 注释说明依赖只含 `intake`、`onIntake`）；
    7. `useLayoutEffect`：Alt+Shift+N 加行的 `keydown` 监听（`:203–212`），**没有依赖数组**，每次渲染重新注册，以读到最新的 `draft` 与 `locked`（注释 `:201–202`）。
  - 命令函数：`edit`、`discard`（`window.confirm`）、`fillFromOrder`（`masterRequest`、`window.confirm`）、`editLine`、`addLine`、`runPreview`、`post`（`invalidateQueries` 后聚焦 `firstField`）、`confirm`（先同步 `storeSaved` 再 `post`，注释“D7”`:276`），以及派生值 `command`、`serialized`、`stale`、`money`、`locked`、`generalSummary`。
  - **JSX**（`:294–552`）：`<form className="tinv-entry">` 下依次为：
    - 操作栏 `div.tinv-command-bar`（`:300–330`）；
    - `{error && …}` 错误条与“按原身份重试”（`:331–348`）；
    - `{receipt && …}` 过账回执（`:349–353`）；
    - `{fromOrder && …}` 从订单开票结果与“重试”（`:354–377`）；
    - `{stale && …}` 预览过期提示（`:378–382`）；
    - `TeachingTip`（`:383–391`）；
    - 常规 `FastTab`（`:392–450`）、行 `FastTab`（`:451–536`）、`{preview && …}` 预览 `FastTab`（`:537–551`）。
- 唯一导出是 `InvoiceEntry`，导入方只有 `TradeInvoices.tsx:17`。
- 数字字面量：行数上限 `100` 出现两次（`addLine` `:195` 与加行按钮 `disabled` `:506`）；`maxLength` 有 `40`、`100`、`10`（常规字段表 `:408–413`）、`60`（行输入）、`160`（例外原因，`:529`）。
- 测试：
  - jsdom：`packages/web/test/trade-invoices.test.tsx` 共 24 个用例（`git grep -c -E "^\s*it\(" -- packages/web/test/trade-invoices.test.tsx`），其中驱动录入表单的有 `:126`（预览、过期阻止、不确定过账按原身份重试）、`:246`（按公司保存草稿与不确定信封）、`:352`（信封写不进去时不发请求）、`:413`（加行快捷键）、`:526`–`:701`（从订单开票的六个用例）、`:764`–`:942`（离开守卫）。
  - 真实 Chrome（tests:trade-e2e）：`packages/infra/test/support/trade-gui/scenario/invoice-entry.ts` 按元素 `id` 驱动录入表单（`#tinv-side`、`#tinv-party`、`#tinv-externalInvoice`、`#tinv-orderId` 等，`:36–39`、`:75`）；`invoice-source-orders.ts`、`leave-guard.ts` 也经过本表单。
- 同目录其他文件（`invoice-model.ts` 121 行、`invoice-session.ts` 56 行、`preview-panel.tsx` 146 行、`invoice-list.tsx` 326 行、`use-invoice-leave-guard.ts` 52 行等）已满足 ③，本任务不改。

## 范围与决定

1. **不改行为**。以下内容全部不变：
   - DOM 结构、类名、文本、属性（含 `id`、`aria-*`、`maxLength`、`inputMode`）；
   - 焦点移动（`firstField`、外部发票号聚焦）；
   - 请求的方法、URL、请求体与发出顺序；查询缓存失效；
   - `sessionStorage` 的写入时机与内容；`window.confirm` 的调用时机与文案；
   - 向页面报告的离开守卫值序列（`onGuard` 的每次调用及参数）；
   - 键盘快捷键的注册方式。

   本任务只改代码组织，不修 bug；拆分时发现的疑似缺陷登记在 PR 正文，留作后续任务。
2. **状态只有一个主人**：
   - 所有 `useState`、`useRef`、`useEffect`、`useLayoutEffect`、`useQueryClient` 调用，要么留在 `InvoiceEntry`，要么放进它在顶层无条件调用的自定义 Hook（例如 `useInvoiceDraft`、`useInvoicePosting`、`useOrderIntake`、`useAddLineShortcut`，名称由开发定）。
   - 新抽出的**展示组件不得调用任何 Hook**，只接收 props 渲染。原因同 REFAC-03b 决定 2：子组件状态会随条件渲染卸载而重置，子组件的 layout effect 会先于父组件执行。
   - 展开自定义 Hook 之后，Hook 调用序列（种类、先后顺序、依赖数组源文本）与 base 相同（验收 P5a）。特别是：三个 layout effect 的先后（写存储 → 报告守卫 → 卸载清理）不变；快捷键 layout effect 仍**没有依赖数组**、仍在全部 Hook 的最后；开票请求 effect 的依赖仍只有 `intake`、`onIntake`，`biome-ignore` 注释随之搬移，原文不改。
3. **组件层级对等**：
   - 新组件一律在模块顶层定义。
   - 抽出的组件只替换 `<form>` 下的**一个子表达式**（或某个 `FastTab` 内部的一个子表达式），只渲染该表达式原来渲染的内容。不得把几个相邻兄弟（例如四个消息条）合成一个返回 Fragment 的组件。
   - 条件渲染的条件（`{error && …}`、`{receipt && …}`、`{fromOrder && …}`、`{stale && …}`、`{preview && …}`、`{draft.exception && …}`）留在父级原位置。
3a. **命令函数**：
   - `fillFromOrder`、`runPreview`、`post`、`confirm` 可以搬进自定义 Hook，也可以搬成模块级函数（显式接收所需的状态与 setter）。
   - 每个函数内 setter、`storeSaved`、`invalidateQueries`、`focus()` 的调用顺序不变；`confirm` 仍先同步写入信封、写入成功后才 `setPending` 并发请求（D7 注释随之搬移）。
   - `fillFromOrder` 由开票请求 effect 调用，读取的是**该次渲染**的 `draft` / `dirty` / `locked`；搬移后仍须如此（不得改成读 ref 或最新值）。
4. **文件**：新文件放在 `packages/web/src/trade-invoices/` 下，按职责命名（例如 `invoice-command-bar.tsx`、`invoice-messages.tsx`、`invoice-general-tab.tsx`、`invoice-lines-tab.tsx`、`use-invoice-entry-*.ts`），粒度由开发定，写入 PR 正文。模块层的 `IntakeState`、`intakeTone`、`lineFields`、`ADD_LINE_SHORTCUT`、`toCommand` 可以搬进新文件，但不改实现。
5. **具名常量**（⑤）：行数上限 `100` 改为一个具名常量，两处共用；`maxLength` 数字改为具名常量或保留在常规字段表的元组中（表本身已是数据），值都不变。
6. **不改**：
   - `TradeInvoices.tsx` 及 `trade-invoices/` 下的既有文件（`invoice-model.ts`、`invoice-session.ts`、`preview-panel.tsx`、`invoice-list.tsx`、`invoice-link.ts`、`source-order.tsx`、`use-invoice-leave-guard.ts`）；
   - `packages/web/test/**`、`packages/infra/test/**`、`scripts/test-shard-weights.json`；
   - 标签文件（`ui/` 下的中英文案）、CSS、契约（`@erp/core`）；
   - 其他页面与导入方。

## 冲突域

- web-ui:trade 发票录入：只改 `packages/web/src/trade-invoices/invoice-entry.tsx`，并在 `packages/web/src/trade-invoices/` 下新增文件。
- 取证所需观测点 / 新增测试文件：无（P4 脚本不提交）。
- 受影响的 e2e 断言（S13 回顾行动 1）：
  - 检索：`git grep -n -E "#tinv-|tinv\." -- packages/infra/test/support`；
  - **必须继续成立**：上述检索在 `002c237` 上命中 11 个文件（`navigate-ready.ts`、`trade-gui-invoice-links.ts`、`trade-gui/smoke.ts`，以及 `trade-gui/scenario/` 下的 `adjustments-reports.ts`、`invoice-detail.ts`、`invoice-entry.ts`、`invoice-filters.ts`、`invoice-source-orders.ts`、`leave-guard.ts`、`orders.ts`、`part-one.ts`），其中对录入表单元素 `id`、文案与焦点的断言全部不变；
  - **须随本任务改**：无。
- 与 S15 其他任务不相交：
  - REFAC-06b：只改四个页面的导入行、`TradeInvoices.tsx:21` 与两处注释，不碰 `trade-invoices/` 下任何文件；
  - CI-02：`ci.yml`、`scripts/slot/README.md`；
  - TINV-09：infra storage、迁移 020、infra 测试、`ui/trade-order-labels.ts`。

## 验收

- **P1 范围**：`git diff --name-only <base> <head>` 只含 `packages/web/src/trade-invoices/invoice-entry.tsx` 和 `packages/web/src/trade-invoices/` 下的新文件；决定 6 列出的文件 diff 为空。不加迁移。
- **P2 导出不变**：`invoice-entry.tsx` 的导出集合（名称加类别）与 base 相同，即只有 `InvoiceEntry`。用仓库根 devDependency `@babel/parser` 解析，口径同 [REFAC-03 M2c（D433）](S13.md#refac-03拆分-journalstsx只搬移不改行为)。新文件的导出只供 `trade-invoices/` 目录内部使用（PR 正文附 `git grep` 结果）。
- **P3 既有测试原样通过**：`trade-invoices.test.tsx` 的 24 个用例和 Web 全部 jsdom 测试通过；测试文件 diff 为空。
- **P4 DOM、表单状态、焦点、请求、存储与守卫等价**（送审证据，脚本不提交，不加常驻 CI 用例）：
  - **驱动**：临时 jsdom 驱动脚本，借用 `trade-invoices.test.tsx` 的渲染方式、`QueryClient` 配置与 `fetch` 桩，在 base 与 head 上按同一序列操作。两种渲染都做：
    - 通过 `TradeInvoices` 页面渲染（`MemoryRouter`），覆盖地址中的开票请求（`intake`）；
    - 直接渲染 `InvoiceEntry`，传入记录每次调用的 `onGuard` 与 `onIntake` 间谍。
  - 渲染前固定 `crypto.randomUUID`（按调用次序返回确定值）与时钟；`window.confirm` 换成按脚本预设逐次回答的桩，并记录每次调用的文案；`sessionStorage` 在每个序列开始前清空，`storeSaved` 失败的场景用按次数失败的 `setItem` 桩制造。
  - `fetch` 桩改为**受控响应**，采样边界的规则同 [REFAC-03b P4](REFAC-03b-company-journals-split.md#验收)（操作 → 释放约定响应 → `act` 等待到待决队列与 `isFetching` / `isMutating` 满足约定、连续两次 `act` 后 DOM 不变 → 采样；不满足即报错退出）。
  - **序列**至少包含：
    - 空白草稿；切换方向 AP / AR；填写伙伴、外部发票号、三种日期、来源订单；勾选含税价；切换舍入；
    - 改行字段、用按钮与 Alt+Shift+N 加行（含达到 100 行时的禁用与快捷键无效）、删行；
    - 勾选匹配例外并填写原因；
    - 预览成功、预览失败（带字段路径的错误）、修改后预览过期；
    - 确认过账成功（回执、清空草稿、聚焦方向选择）；确认过账失败；不确定结果后按原身份重试；信封写入失败；
    - 放弃草稿（确认取消与确认放弃）；
    - 从订单开票：成功、订单不存在、已开完、读取失败后重试、忙碌时到达（`locked`）、有未保存修改时替换（取消与确认）；
    - 教学模式开 / 关；zh / en 两种语言。
  - **每步采样**：DOM（`document.body.innerHTML`）；表单即时状态与焦点（口径同 REFAC-03b P4）；累计请求日志（序号、方法、URL、请求体 JSON、结果）；查询缓存（`queryKey`、`status`、`isInvalidated`，按键排序）；`sessionStorage` 全部键值；`window.confirm` 调用记录；`onGuard` / `onIntake` 调用记录（直接渲染时）。
  - **判定**：base 与 head 逐步、逐项、逐字节相同。PR 正文附脚本全文、步骤清单（含每步释放的请求序号与 `confirm` 预设回答）、两边输出的 SHA-256 与比较结果、不确定重试与从订单开票两组场景的逐步输出原文。
- **P5 结构规则**（静态，评审按代码与 PR 表格核对）：
  - **P5a Hook 序列**：PR 正文列出 base 与 head 的 Hook 调用序列，自定义 Hook 按调用处展开。每行写 Hook 种类和依赖数组源文本（空白归一；没有依赖数组的写“无”）。两边逐行相同。
  - **P5b 展示组件无 Hook**：新抽出的组件中没有任何 `use*` 调用。PR 正文附 Babel AST 检查脚本的输出。
  - **P5c 模块级定义**：所有组件与自定义 Hook 都在模块顶层声明，`InvoiceEntry` 与 Hook 的函数体内不再声明组件。
  - **P5d 插槽对等**：PR 正文用一张表列出 base 中 `<form>` 的子表达式，以及两个 `FastTab` 内部被抽出的子表达式，标出 head 中对应的唯一组件或表达式，两边一一对应。
  - **P5e 副作用顺序**：PR 正文逐函数对照 base 与 head 中 `fillFromOrder`、`runPreview`、`post`、`confirm`、`discard` 内 setter、`storeSaved`、`window.confirm`、`masterRequest`、`invalidateQueries`、`focus()` 的调用序列；`invalidateQueries` 的 `queryKey` 表达式不变。
  - **P5f effect 清理**：PR 正文列出 base 中每个 `useEffect` / `useLayoutEffect` 的清理函数，以及它们在 head 中由哪个 Hook 拥有；`keydown` 监听的注册与移除在同一个 effect 内。
- **P6 尺寸与可读性**：
  - `InvoiceEntry`、每个自定义 Hook、每个新组件与命令函数都满足 ②（≤ 80 行、嵌套 ≤ 3 层）；
  - `invoice-entry.tsx` ≤ 200 行，`trade-invoices/` 下每个新文件 ≤ 400 行；
  - PR 正文列出所有超过 60 行的函数，附计数行数与最深层数。
- **P7 打包字节**（构建条件、依赖图、D432 字节口径同 [S14 REFAC-06](S14.md#refac-06拆分-tradeinvoicestsx只搬移不改行为)；首屏按 D454）：
  - PR 正文须有“构建来源”一节（[S15 共同验收](S15.md#共同验收)）。base 为最终送审 head 的实际合并基；合并基变了就重新测量。
  - 首屏：±0。
  - **发票块路由**：在 base 上，“路由新增”JS 含发票页块（`TradeInvoices-*.js`）的路由。REFAC-06b 合并前是发票路由与期末结账、调整、贸易报表、核销四个路由（S15 REFAC-06b“现状”）；合并后只剩发票路由。PR 正文列出 base 上的这组路由及判定依据。
  - 发票块路由**逐个**测量，每个的“路由新增”JS 合计（屏蔽哈希后的 gzip-9）增加不超过 **+400 B**；其他路由 ±0。门槛按实际合并基判定，所以 06b、06c 谁先合并都不阻塞另一个。
  - 各路由 CSS 的集合与字节都不变。
  - **+400 B 的依据**（设计角色在 `002c237` 上试算，本机 Node v26.13.0 / npm 11.20.0，`npm run build -w packages/web`，只量发票页块，屏蔽哈希后 gzip-9；试算改动未提交）：
    - base：`TradeInvoices-*.js` 37,588 B / 10,553 B；
    - 抽出 3 个只收 props 的组件（操作栏、错误条、行 FastTab 内容，各 6–8 个 props）：+212 B，平均每个约 +71 B；
    - 再抽出 2 个组件（从订单开票结果条、常规 FastTab 内容）与 1 个 Hook（加行快捷键）：合计 +263 B（原始 +686 B）。后 3 个模块边际约 +17 B / 个，因为传参写法重复，gzip 复用了前面的模式。
    - 按决定 2、4 的典型拆法（5–7 个组件，加上 3–4 个返回多个状态与 setter 的 Hook），估计 +263 B 再加约 4 × 35 B，约 +400 B。

  超出阈值先停下报设计角色。
- **P8 质量门**：`typecheck`、`lint`、CI-02 预检（若已合并）通过；PR CI 绿；合并后覆盖该合并提交的 main Full 绿（含 tests:trade-e2e 的浏览器分片，即“冲突域”中“必须继续成立”的断言）。
- **P9 可读性一节**：PR 正文按下节逐条说明。

## 性能考虑

- 渲染次数不变：不加 `memo`，不改 Hook 依赖，每次状态变化触发的渲染与 base 相同；组件层级加深只增加少量函数调用，不跑 Bench。
- 打包变化由 P7 约束。
- 其余项（规模、索引、查询次数、分页、事务）不适用：不改数据访问。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥：

- **②**：本任务就是为满足 ② 而做。`InvoiceEntry` 从约 470 行拆到每个函数 ≤ 80 行、嵌套 ≤ 3 层（P6）。
- **③**：`invoice-entry.tsx`（553 行）不是热点（≤ 800）；本任务对它大幅净减。PR 正文贴 `git diff --numstat`。
- **①**：组件与 Hook 名表达职责，如 `InvoiceCommandBar`、`InvoiceLinesTab`、`useOrderIntake`，不用 `Part1`、`Section2`。
- **④**：行数上限 `100` 两处共用一个常量（决定 5）。四个消息条结构相似但条件、语气与按钮各不相同，属于“碰巧相似的独立逻辑”，不强制抽取。
- **⑤**：见决定 5。
- **⑥**：原有的“为什么”注释（layout effect 写存储的两条、守卫、快捷键 layout effect、开票请求 effect 的 `biome-ignore`、`fillFromOrder` 中的取消与 NOT_FOUND 两条、`confirm` 的 D7）随代码搬移，不删改。不留调试输出。

## 用户可见变化

- 无。页面外观、文案、键盘与焦点行为、请求、草稿保存都不变（P3、P4）。

## 证据要求

- **不需要浏览器时段**：
  - 行为等价由 P3（既有 jsdom 用例）与 P4（逐步 DOM、表单状态、焦点、请求、存储与守卫等价）证明；
  - tests:trade-e2e 中经过录入表单的步骤（“冲突域”所列）在合并后由覆盖合并提交的 main Full 的浏览器分片执行；
  - 比照 REFAC-03b / REFAC-06 的口径。

  P4 在本机运行，须服从协调者的时段停用通知（D442）。
- PR 正文附：
  - P2 导出与 `git grep` 结果；
  - P4 脚本、步骤清单、比较结果与两组场景的逐步输出；
  - P5a Hook 序列表、P5b 检查输出、P5d 插槽对照表、P5e 副作用顺序表、P5f 清理归属表；
  - P6 函数行数表；
  - P7 的“构建来源”一节、发票块路由清单与字节表；
  - 可读性一节。
- 证明类验收附脚本原文与未截断输出，或链接到固定修订（S13 回顾行动 6）。
