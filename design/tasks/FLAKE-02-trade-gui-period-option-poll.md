# FLAKE-02 贸易 / 迁移 GUI E2E：期末月份下拉选项轮询偶发为空；afterAll teardown 超时（两项原因均未知）

- Sprint：S5（排队，不计入 S5 目标）　依赖：—（与 S5-h 无文件重叠，可并行，见下文“与 S5-h 的关系”）　建议分支：`flake-02-trade-gui-option-poll`
- 冲突域：tests:e2e（`packages/infra/test/support/trade-gui-scenario.ts`、`packages/infra/test/http/trade-gui-*.slow.test.ts`、`packages/infra/test/http/migration-gui.slow.test.ts`）。如果查明需要改页面，再报告设计角色，追加 web-ui:period-close（`PeriodClose.tsx`）
- 类型：调查 / 测试（必要时页面 tsx）
- 来源：S5-f [#115](https://github.com/lingshf/ai-native-erp/pull/115) 作者在 head `c2f0310` 上的两轮本机真实 Chrome E2E（[原始日志](https://gist.github.com/lingshf/0f2258dbc1805c681fd297e2ca90c117/ea629fe74d4d65e10323ec5c2e6fef6ffb37b7cf)，协调者转报）

## 观察

来源：[#115 原始日志](https://gist.github.com/lingshf/0f2258dbc1805c681fd297e2ca90c117/ea629fe74d4d65e10323ec5c2e6fef6ffb37b7cf)。两轮运行都在 head `c2f0310`、干净工作树（`status --porcelain` 为空）上，命令为 `ERP_E2E_BROWSER_CHANNEL=chrome npx vitest run trade-gui- migration-gui.slow`。两轮的现象**不同，分开记录**：

| 轮次 | 日志 | 用例 | 失败的 suite |
|---|---|---|---|
| 第 1 轮 | `r2-e2e-chrome-run1-failed.log` | 13/13 通过 | 3 个 suite 的 `afterAll` 超过 15 s：`migration-gui.slow.test.ts:29`、`trade-gui-en-green-2.slow.test.ts` 与 `trade-gui-smoke.slow.test.ts`（均为 `trade-gui-scenario.ts:413`） |
| 第 2 轮 | `r2-e2e-chrome-run2.log` | 12/13 通过 | `trade-gui-en-green-1` 用例失败；另只有 `migration-gui.slow.test.ts:29` 的 `afterAll` 超时 |

1. **option 空列表**（仅第 2 轮）：报错 `Missing keyboard-selectable option: 2026-01: expected [] to include '2026-01'`。
   - 位置：`trade-gui-scenario.ts:90` 的 `choose`，它在 10 s 的 `expect.poll` 中读取 `#close-month` 的全部 `option` 值。调用方是 `:843` 的 `setUp`（`navigate("period-close")` 之后）。
   - 轮询最后一次读到的是**空数组**：一个 `option` 都没读到，不是“有选项但缺 2026-01”。
   - 失败截图里下拉框已显示 2026-01。
   - `#close-month` 的选项来自 `PeriodClose.tsx:123–125` 的 `periodOptions`（分页查询；`<option>` 没有 `value` 属性，值取文本）。
2. **afterAll teardown 超时**（两轮都有）：第 1 轮没有任何 `choose` 或用例失败，也出现了 3 个 suite 超时。因此 teardown 超时**不是** option 失败的伴随现象。具体卡在哪一步（`harness.launching`、`browser.close()`、删除临时目录），日志没有给出。
3. 尚未在其他 head 或 CI 上见到这两种失败。
4. **第 3 轮 trace（待验证的观察，不是结论）**：来源 [gist 修订 b81ded7](https://gist.github.com/lingshf/0f2258dbc1805c681fd297e2ca90c117/b81ded7d26659c2fd8e8222410fc0e2898190e93) 的 `r3-trace-timeline.txt`。
   - `navigate("period-close")` 的最后一步 `page.locator("main h2").waitFor()` 在约 25.70 s 解析，命中的是 `<h2>Runtime status</h2>`。这是 `shell.overview`（`labels.ts:88`），即跳转前那一页的标题，不是期末页的标题。
   - 此后 `#close-month` 的 option 被读取了很多次（timeline 中可见 95 次，协调者转报约 120 次），每次都是空数组，直到失败截图。
   - trace 的 network 部分为 0 字节，看不到 `/periods` 请求的发出与响应时间。
   - 这些只说明该轮 `navigate()` 可能在期末页渲染前就返回了。为何此后 10 s 内选项一直为空、是否与本轮之前的现象同因，均未验证。

## 推断（均待验证，不作为结论）

两个现象**分别**推断，不预设共同原因：

- **option 空列表**：
  - 截图在轮询超时之后才拍，所以“截图显示 2026-01”不能说明轮询期间选项已存在。轮询的 10 s 内选项可能确实为空，例如期间数据还没返回，或下拉在加载中被重新挂载。
  - locator 也可能在轮询期间命中了已卸载的旧节点，或其他同 id 的元素。
  - 观察 4 提示：`navigate()` 只等待“`main` 下有一个 `h2`”，没有确认它属于目标页，旧页标题即可满足这一条件。这只能解释提前返回，不能解释之后 10 s 都为空；两者的关系待验证。
- **teardown 超时**：可能卡在 `browser.close()`、等待 `harness.launching` 或删除临时目录中的任一步，也可能与本机负载有关。按 [S4 回顾](../reviews/S4-retro.md)议题 4 的结论，不能仅凭本机运行判定为负载造成。

## 范围

1. **先查已有证据**：失败的用例在 artifacts 中已有 `*-last.png` 和 `*-trace.zip`（`trade-gui-scenario.ts:535–536`，仅失败时保存）。先从第 2 轮的 trace 中查 `#close-month` 在轮询期间的 DOM 变化与 periods 请求时间，再决定要加哪些诊断。teardown 超时没有 trace，需要定向诊断。
2. **定向诊断**（只在失败或超时时输出，不改断言和超时）：
   - option：轮询每一次读到的选项列表，`#close-month` 的元素数量与 `disabled` 状态，`main h2` 的文本；periods 查询的请求与响应时间（trace 的 network 为空，需用 `page.on("request" / "response")` 之类的方式另行记录）；
   - teardown：`afterAll` 中每一步的开始与结束时间，以定位卡住的那一步。
3. **稳定性实验**：开始前在 PR 中**预先写明**运行次数（≥ 5 次）和命令，按序保存每一次的完整日志（Tee-Object），成功的和失败的都保存。这是本地诊断，不是失败后反复重跑直到通过，也不是 PR CI 单次重跑的豁免（[路线图 §5 偶发失败](../roadmap.md#5-团队流程)）。
4. 查明原因后再修复：
   - 原因在测试：改等待条件为真实的就绪信号（例如 periods 响应完成或选项出现），而不是加长时间；
   - 原因在页面（例如加载中重新挂载）：报告设计角色追加冲突域，再改 `PeriodClose.tsx`。
5. 两个现象各自独立结论。某一项证据不足时，该项保留“原因未知”，只提交诊断，不得宣布已修复。

## 验收标准

1. **D11**：不加重试，不放宽 `choose` 的 10 s 轮询，不放宽 `afterAll` 的 15 s 超时，不删除、不削弱断言。等待条件可以改为更准确的就绪信号，但必须在 PR 中说明它比原条件严格或同样严格。
2. PR 描述对 **option 空列表**和 **teardown 超时**分别按“观察 / 推断 / 未排除”三段写结论。每项的结论可以独立为“已修复”或“原因未知”，不要求二选一归因，也不要求两项同因。只有复现了失败、并证明修复后不再失败，才能对该项写“已修复”。
3. **验证分层**（PR 的 `verify` 不跑 slow E2E；Full 只在 main push / schedule 上运行）：
   - **合并前**：在 PR 的精确 head、干净工作树上，本地用真实 Chrome（`ERP_E2E_BROWSER_CHANNEL=chrome`）运行 `trade-gui-*.slow` 与 `migration-gui.slow`，按范围 3 的预定次数保存全部日志，并记录 `git rev-parse HEAD` 与 `git status --porcelain`；
   - **合并后**：覆盖该合并提交的 main Full 中，各分片的测试步骤实际通过（按[路线图 §5](../roadmap.md#5-团队流程) 的解堵规则核对）。合并后由设计角色在任务表中记录该 run。
4. teardown 超时若查明与 option 空列表无关、且需要另改文件，在 PR 中另列，报告设计角色拆分任务。

## 与 S5-h 的关系

两者**不合并，也不互为依赖**：
- 共同点：都是间歇失败、原因待证实、按 D11 处理，调查方法相同（同一 head 重跑、保存失败日志、观察 / 推断分开写）。
- 不同点：
  - S5-h 验收 3 要求 `trade-gui-*.slow` 通过，FLAKE-02 未修复前可能使它偶发失败；此时按路线图 §5 同 head 重跑并在 S5-h PR 中引用 FLAKE-02，不算 S5-h 回退；
  - S5-h 是 jsdom 单元测试（`trade-orders.test.tsx`）在订单录入页保存后的焦点断言；FLAKE-02 是真实 Chrome E2E 在期末页的下拉选项轮询；
  - 冲突域（web-ui:trade-orders 对 tests:e2e）和文件都不重叠。
- 若调查发现两者的共同原因（例如外壳的路由切换后重新挂载、焦点与渲染时序），先完成的一方在 PR 中写明，设计角色再决定是否合并后续修复。
