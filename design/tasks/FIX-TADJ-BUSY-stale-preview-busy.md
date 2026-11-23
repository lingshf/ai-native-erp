# FIX-TADJ-BUSY：调整页在途预览被编辑取代后，busy 必须清除

- Sprint：S17 补充任务（[计划](S17.md#补充任务fix-tadj-busy)、[任务表](README.md#s17调整页函数体拆分--smoke-拆分--订单--发票列表刷新列表建议-v0160草案)）　依赖：REFAC-07 [#275](https://github.com/lingshf/ai-native-erp/pull/275) 已合并（本任务按其拆分后的文件写；#275 合并后再派发）　建议分支：`fix-tadj-busy`
- 冲突域（逐个列文件）：
  - web-ui:trade-adjustments：`packages/web/src/trade-adjustments/action-commands.ts`（只改 `runAction` 的 `finally`，可加一行“为什么”注释）；
  - 测试：`packages/web/test/trade-adjustments.test.tsx`（新增 2 个用例；`mockApi` 可加一个默认不生效的可选参数，用于挂起预览请求）；
  - 共享单文件：无；
  - 取证所需观测点 / 新增测试文件：无。测试文件在 base 上 504 行，未到路线图 §5 ③ 的 800 行热点线，用例加在原文件，不新建测试文件，不改 `scripts/test-shard-weights.json`（S15 回顾行动 3）；
  - 受影响的 e2e 断言（路线图 §5 设计文档自查 12）：
    - 检索：`git grep -l -E "#tadj-|tadj\." -- packages/infra/test/support`，在 `fd2192e` 上命中 5 个文件：`navigate-ready.ts`、`trade-gui/scenario/adjustments-reports.ts`、`trade-gui/scenario/invoice-entry.ts`、`trade-gui/scenario/order-invoicing-filter.ts`、`trade-gui/smoke/pages.ts`；
    - **必须继续成立**：上述文件中的全部断言；与预览直接相关的是 `trade-gui/scenario/adjustments-reports.ts:59–67`（等待预览 POST 的响应，断言 400）。本任务不改 `id`、标签、按钮名与请求；
    - **须随本任务改**：无；
  - 受影响的文档引用（D460）：不适用，不搬移、不拆分文件；
  - **不涉及**：`trade-adjustments/use-action-entry.ts`（`busy`、`locked`、守卫的计算）、`changeDraft` / `clearEntry` / `applyPartyFilter`、确认路径的 `pending` 与 `uncertain` 语义、`TradeAdjustments.tsx`、其他 `trade-adjustments/` 文件、标签、CSS、教学文案、`@erp/core` 契约、`master-data-client.ts`、迁移。
- 类型：缺陷修复（页面状态）
- 优先级：P3（理由见“现状”第 4 条：真实界面上，预览在途期间所有草稿字段与命令按钮都已禁用，鼠标和键盘都改不了草稿；目前只有绕过 `disabled` 的程序化编辑能触发。修复的是 `runAction` 的不变量，防止今后新增的编辑入口把页面卡死）。

## 现状（#275 head `fd2192e`）

下文 `file:line` 按 #275 的 head `fd2192e`（REFAC-07 只搬移，行为与 base `32f63ef` 相同）。#275 合并时若行号变动，开发按合并提交重新核对，行为描述不变。

1. **缺陷来源**：REFAC-07 [#275](https://github.com/lingshf/ai-native-erp/pull/275) 的 R4 证据场景 P（“stale preview: edit while preview in flight, then preview and clear (direct, zh)”，10 步，base 与 head 的输出 SHA-256 都是 `9d1bc237d1ab9111…`）记录了这一行为；#275 正文“疑似缺陷”一节给出现象与原因，并建议另立任务。场景 P 的驱动代码在 #275 第 5 条评论中：`type` 用 `fireEvent.change` 写字段。
2. **原因**（读代码核对）：
   - `runAction` 每次进入都 `setBusy(true)`，并取 `version = ++sequence.current`（`trade-adjustments/action-commands.ts:174–176`）；
   - `changeDraft` 先执行 `sequence.current++`，再写草稿、清空预览 / 回执 / 错误（`action-commands.ts:25–31`）。`clearEntry`（`:46`）与卸载清理（`use-action-entry.ts:34–39`）也会自增 `sequence`；
   - 过期结果与过期错误按 `sequence` 丢弃：预览成功 `:184`，确认成功 `:193`，失败 `:199`；
   - `finally` 里只有 `sequence.current === version` 时才 `setBusy(false)`（`:201–204`）。在途期间 `sequence` 一旦被改动，这次请求结束后 `busy` 就再也不会清除。`running.current` 会正常复位（`:202`），但 `locked = busy || …`（`use-action-entry.ts:33`）始终为真：预览、确认、清除按钮（`action-command-bar.tsx:21`、`:29`、`:34`）、两个字段组（`action-general-tab.tsx:11`、`action-allocation-tab.tsx:154`）一直禁用；守卫一直报告 `busy`（`use-action-entry.ts:49–61`），账套选择也被禁用。只有重新挂载能恢复。
3. **复现**（设计在 `fd2192e` 上试跑，见“证据要求”的试跑记录）：直接渲染或经 `App` 进入 `#/trade-adjustments`，中文；
   1. 动作选“预付”，方向 AR，伙伴 `C1`，金额 `1234`；
   2. 点“预览”，让预览请求挂起；
   3. 用 `fireEvent.change` 把金额改成 `1235`（字段此时是禁用的，见第 4 条）；
   4. 放行挂起的预览：成功或 500 失败都一样；
   5. 结果：“预览”按钮仍禁用，账套选择仍禁用，没有预览结果，也没有错误提示（过期结果与错误都被正确丢弃）；页面停在 busy，直到重新挂载。
4. **真实界面可达性**（推断，附依据）：
   - 预览在途时 `busy` 为真，两个字段组 `<fieldset disabled={locked}>` 禁用其中全部控件。试跑在第 3 步之前打印出金额输入框 `:disabled` 为 `true`；
   - 场景 P 与试跑都用 `fireEvent.change`，它直接派发事件，不检查 `disabled`；真实浏览器里，鼠标和键盘都不能编辑禁用控件；
   - 本页没有键盘快捷键（`git grep -n -i "keydown\|accesskey\|hotkey\|shortcut" fd2192e -- packages/web/src` 在 `trade-adjustments/` 下只命中伙伴筛选的 Enter，`action-allocation-tab.tsx:34`，该输入框同样在禁用的字段组内）；
   - 伙伴筛选失焦会调 `changeDraft`（`action-allocation-tab.tsx:33` → `applyPartyFilter`）。但预览只能通过激活“预览”按钮发起，焦点先移到按钮，失焦发生在 `runAction` 之前。

   结论：目前未发现真实用户能触发的路径。本任务按“不变量缺陷”修，不按“用户可见缺陷”修。真实 Chrome 中的可达性不在本任务里证明（见“证据要求”）。
5. **既有测试**：`packages/web/test/trade-adjustments.test.tsx`，504 行，vitest 计 16 个用例（`fd2192e` 与 main `d43fe6d` 上该文件相同，REFAC-07 R3 要求它 diff 为空）。`mockApi`（`:135`）的预览分支立即返回，不能挂起；确认分支已能用 Promise 挂起第一次确认（`unknownFirst`）。没有用例覆盖“预览在途时编辑”。

## 设计决定（产品负责人）

1. **取代，不中止**：预览在途时编辑草稿，在途预览作废，由新草稿取代。它的响应（成功或失败）照旧按 `sequence` 丢弃：不显示结果、不显示错误、不改草稿。不引入 `AbortController`，理由：
   - 预览是只读请求，让它跑完没有副作用；
   - 真实界面上在途期间本就不能编辑（现状 4），没有必要为它加取消通道；
   - 最小改动，确认路径不受影响。
2. **busy 跟随请求的生命周期**：`runAction` 里每次 `setBusy(true)`，在同一次调用的 `finally` 中都无条件 `setBusy(false)`。`running.current` 的守卫（`:172–173`）保证同一时刻只有一个请求在途，所以无条件清除不会误清另一个请求的 `busy`；组件卸载后调用 setter 是无操作。参考做法（设计已在 `fd2192e` 上试过）：把 `:203` 改成 `entry.setBusy(false);`，并加一行注释说明为什么不按 `sequence` 判断。其他等价写法也可以，但须满足下述验收。
3. **`sequence` 的丢弃语义不变**：`:184`、`:193`、`:199` 的判断保留；过期的结果、回执、错误照旧丢弃。
4. **确认路径不改语义**：同一个 `finally` 对确认请求同样生效。确认在途期间，草稿因 `saved.pending` 而锁定（`use-action-entry.ts:33`）。`stagePending`、`failAction`、`uncertain`、`pending` 的处理都不改。
5. **busy 始终清除**：请求成功、4xx、5xx、网络错误、过期丢弃这五种结局，结束后 `busy` 都为假。
6. **用户可见变化**：无。正常操作下，预览在途期间字段本就禁用（现状 4）；只有绕过禁用的程序化编辑才会从“卡住”变成“可继续操作”。发布记录（S16 回顾行动 5，[S17 DEMO-17 验收](S17.md#demo-17-验收)）：
   - 在 DEMO-17 的 RC 之前合并：RC 必须在 CHANGELOG `[Unreleased]` 的“变更”下写入“调整页在途请求结束后总是解除忙碌状态（内部健壮性，无用户可见变化）”，发布说明同样写明；
   - 未在 v0.16.0 中发布（经协调者决定移出）：不写修复条目，RC 只记为“延后”。

## 导航与历史

不适用：只改 `runAction` 的状态复位，不改地址，不加监听。

## 范围

- `action-commands.ts`：按决定 2 改 `runAction` 的 `finally`。
- `trade-adjustments.test.tsx`：
  - 新增验收 F2 的 2 个用例；
  - 给 `mockApi` 加挂起预览的能力，可选参数，默认行为不变；既有调用点不改；
  - 测试用 `fireEvent.change` 写禁用中的金额字段。这是有意为之，代表任何绕过禁用的编辑入口。用例里加一行注释说明，并先断言该字段确实是禁用的（F2 第 2 步）。

## 入口参数与异常

不适用：不新增、不改 URL 或查询参数。请求失败的显示沿用 `failAction` / `report`，不改。

## 不在范围

- 给 `masterRequest` 加取消、改用 `AbortController`（决定 1）。
- 预览在途期间允许编辑（字段组禁用保持不变）。
- 确认在途期间编辑时 `pending` 被清空的问题：真实界面因 `saved.pending` 锁定而不可达，本任务不改，也不加用例。
- `use-action-entry.ts`、`TradeAdjustments.tsx` 与其他展示组件。
- 真实 Chrome 中的可达性调查。

## 验收标准

- **F1 范围**：`git diff --name-only <base> <head>` 只含 `packages/web/src/trade-adjustments/action-commands.ts` 与 `packages/web/test/trade-adjustments.test.tsx`。不加迁移，不改标签、CSS、契约。
- **F2 新增用例**：加在 `trade-adjustments.test.tsx` 的 `describe("typed trade adjustments")` 内，用下列名字（直接渲染或经 `App` 都可以，中文）：
  - `clears busy after an edit supersedes an in-flight preview and ignores its late result`：
    1. 填预付草稿（AR、`C1`、`1234`），点“预览”，预览请求挂起；
    2. 断言金额输入框 `:disabled` 为真（记录真实界面的锁定）；
    3. 用 `fireEvent.change` 把金额改为 `1235`；
    4. 放行挂起的请求，成功返回 `1234` 的预览；
    5. 等待，直到“预览”按钮可用。断言：账套选择可用；没有结果区，“确认”禁用；金额输入框值为 `1235`；没有错误提示；
    6. 再点“预览”，等“确认”可用（沿用 `plan()`）；断言第二次预览请求体的 `gross` 为 `1235`；
    7. 点“清除草稿”，断言金额输入框为空。
  - `clears busy when a superseded preview fails and shows no stale error`：步骤 1–3 同上；放行的请求返回 500；断言“预览”按钮与账套选择可用，页面没有 `role="alert"` 的错误文本；再预览一次能成功（`gross` 为 `1235`）。
  - 两个用例在 base（本任务 PR 的实际合并基）上**必须失败**，失败点是“预览”按钮仍禁用；在 head 上通过。PR 正文附 base 上失败、head 上通过的未截断输出。
- **F3 既有用例**：`trade-adjustments.test.tsx` 原有 16 个用例全部通过，用例体不改，`mockApi` 只加默认不生效的可选参数；Web 全部 jsdom 测试通过。确认路径的两个用例（`locks unknown outcomes and replays exactly the stored confirmation after remount and language switch`、`reports an unknown outcome only after the first send fails, never while it is in flight`）原样通过，即决定 4。
- **F4 丢弃语义**：`action-commands.ts` 中 `sequence.current === version` / `!==` 的三处判断（`:184`、`:193`、`:199`）保留。PR 正文贴 `runAction` 的 base / head 对照。
- **F5 尺寸**：见“可读性”。
- **F6 打包字节**：
  - 调整页块 `TradeAdjustments-*.js` 屏蔽哈希后的 gzip-9 字节，相对 base 增加不超过 **+50 B**；设计试跑结果为 −3 B（见“证据要求”）；
  - 用下文“证据要求”的测量命令；PR 正文附“构建来源”块与原始输出；
  - 超过上限先停下，报设计角色与协调者，不得自行放宽。
- **F7 质量门**：`typecheck`、`lint`、CI-02 预检通过；PR CI 绿；合并后覆盖该合并提交的 main Full 绿，包括 tests:trade-e2e 中“冲突域”列出的断言。
- **F8 无法判定**（路线图 §5 设计文档自查 14）：下列情形一律按失败处理，停下报设计角色，不得改写用例来“通过”：
  - F2 在 base 上不失败，例如挂起手段不生效、编辑没有进入 `changeDraft`；
  - 构建或测量命令出错，或找不到 `TradeAdjustments-*.js`。

## 性能考虑

- 规模 / 热点、读写路径与索引、查询次数、分页、事务：不适用，不改数据访问与请求。
- 前端开销：请求数不变；渲染次数相同或更少（卡住时不再有后续渲染，正常路径不变）。
- 预算与验证方式：只有 F6 的字节上限。设计在 `fd2192e` 上对参考做法试算过一次（见“证据要求”），不跑 Bench。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥：

- **热点文件**：无。`action-commands.ts` 205 行，`trade-adjustments.test.tsx` 504 行，都未到 ③ 的热点线；
- **净增上限**：
  - `action-commands.ts` 净增 ≤ 3 行，含一行“为什么”注释；`runAction`（base 36 行）改后 ≤ 40 行；
  - `trade-adjustments.test.tsx` 净增 ≤ 80 行，2 个用例。两个用例共用的步骤（填草稿、挂起与放行）抽成文件内的小函数（④），不复制两遍；
- **结构要求**：
  - 不新增模块，不新增导出；
  - 注释只写不明显的约束，例如“`running` 守卫保证只有一个在途请求，所以 busy 不按 `sequence` 判断”；
  - `:142–143` 关于同步路径的既有注释保留；
- **验收**：PR 正文“可读性”一节贴 `git diff --numstat` 与 `runAction` 的行数。

## 证据要求

- **不需要浏览器时段**：
  - 改动只影响 jsdom 能完整观测的状态复位，由 F2、F3 证明；
  - 调整页的真实浏览器路径（“冲突域”列出的 e2e 断言），合并后由覆盖合并提交的 main Full 浏览器分片执行；
  - 本地运行须服从协调者的时段停用通知（D442 / D480），繁忙机器上的本地验证按[路线图 §4](../roadmap.md#4-ci-与测试策略设计角色牵头)。
- **可行性与试跑**（S13 回顾行动 4，路线图 §5 设计文档自查 11）：
  - **设置**：设计在 `fd2192e` 的临时工作树中复制 `trade-adjustments.test.tsx`；在 `mockApi` 的预览分支前加一个可挂起的 Promise 队列；按 F2 的步骤写成两个试跑用例，放行结果分别为成功和 500；
  - **base 结果**：两个用例都失败。实际输出摘录：`TRIAL in-flight: gross disabled = true preview disabled = true`；`TRIAL settled: preview disabled = true company disabled = true alert = null confirm disabled = true`；`AssertionError: expected true to be false`；`Tests  2 failed | 16 skipped (18)`；
  - **改动后结果**：按决定 2 只改 `:203` 一行后，`npx vitest run --config ../../vitest.config.ts --project web test/trial-busy.test.tsx test/trade-adjustments.test.tsx` 输出 `Test Files  2 passed (2)`、`Tests  34 passed (34)`，即原 16 个用例、复制的 16 个用例与 2 个试跑用例全部通过；
  - **字节**：在同一工作树先后对参考做法和 base 各跑一次 `npm run build`，再运行下面的 `bytes.cjs`。结果：改动后 `TradeAdjustments-*.js` raw 19500、gzip-9（屏蔽哈希）6282；base raw 19515、gzip-9 6285，即 −15 B / −3 B。环境：Node v26.13.0，npm 11.20.0，Windows；
  - 试跑文件未提交，工作树已删除。
- **字节测量命令**（F6；在仓库根 `npm run build` 之后运行 `node bytes.cjs <标签>`，脚本不提交，原文贴进 PR 正文）：

  ```js
  const fs = require("fs"), z = require("zlib"), p = require("path");
  const d = "packages/web/dist/assets";
  for (const f of fs.readdirSync(d).filter((f) => /^TradeAdjustments-.*\.js$/.test(f))) {
    const b = fs.readFileSync(p.join(d, f));
    const s = Buffer.from(b.toString().replace(/-[A-Za-z0-9_-]{8}\.(js|css)/g, "-HASH.$1"));
    console.log(process.argv[2], f, "raw", b.length, "gz9(masked)", z.gzipSync(s, { level: 9 }).length);
  }
  ```

- **PR 正文附**：
  - F2 在 base 上失败、在 head 上通过的未截断输出；
  - F4 的 `runAction` 对照；
  - F6 的“构建来源”块（[任务书模板](TEMPLATE.md)“证据要求”）与原始输出；
  - “可读性”与“用户可见变化”两节（后者写“无”，理由同决定 6）；
  - 数字一律附原始输出（S15 回顾行动 1）。
- 中英双语、红 / 绿主题、键盘、教学模式：不改 DOM、文案、CSS 与教学提示，不需要截图。

## 设计自查（推送前勾选，路线图 §5 设计文档自查 1–14，另加可读性一项）

- [x] 1 事实断言有来源：原因与行号按 `fd2192e` 读代码；“真实界面不可达”标为推断，附依据与检索命令
- [x] 2 涉及进行中的 PR（#275）已用 `git show fd2192e:` 对照拆分后的文件，并读了 #275 的正文与 R4 评论
- [x] 3 依赖列（#275 已合并）与 S17 泳道说明一致
- [x] 4 不适用：不加 CSS
- [x] 5 转述 #275“疑似缺陷”时保留了原限定（base 与 head 行为相同、本 PR 未修）
- [x] 6 不适用：无共享单文件
- [x] 7 不适用：无入口参数
- [x] 8 S17 计划的任务表、泳道、DEMO-17 验收与 README 任务表已同步
- [x] 9 不适用：不涉及导航与历史
- [x] 10 不适用：无几何类验收与 Demo 截图
- [x] 11 F2 的复现与修复、F6 的字节测量都已在 `fd2192e` 上试跑，命令与结果见上
- [x] 12 已列出受影响的 e2e 断言及检索命令（全部必须继续成立，无须改）
- [x] 13 “可读性”一节写明无热点文件与各文件净增上限
- [x] 14 文中的检索、测试与构建命令都已在 `fd2192e` 上实跑；任务表已对照 `git log` 同步
- [x] 15 已跑 `node scripts/slot/check-manifest.mjs`（输出见 PR 正文）；F8 写出了“无法判定”的处理
