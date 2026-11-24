# FLAKE-08：jsdom 卸载后虚拟列表防抖定时器触发，main Full 报 `window is not defined`

- Sprint：S21（[计划](S21.md)）　类型：测试稳定性　优先级：P1　决定：待协调者定编号　建议分支：`flake-08-virtualizer-timer-teardown`
- 来源：main Full [run 45291279585](https://github.com/lingshf/ai-native-erp/actions/runs/45291279585)（`5664fea`，unit 分片 2/6）：该分片 26 个文件、191 个测试全部通过，但 Vitest 报 “Errors 1”，`ReferenceError: window is not defined`，被归到 `packages/web/test/shell-targets.test.ts`，作业失败。该 run 是 `run_attempt=1`、结论 failure，**没有**同 SHA 重跑；已知的是随后各提交的 main Full 为绿（`5398eb8` run 45292823039 起）。此 run 不重跑，只引用。同类先例：[FLAKE-03](FLAKE-03-navigate-target-page-ready.md)。
- 迁移：**不加**。浏览器时段：**不需要**。
- 数据：只用测试内的虚构数据；不读取真实旧账、4173 账套或 `.bak` 文件。

## 现状（main `ea5c0a1`）

- **报错栈**（固定来源：上述 run 的作业日志，不重跑）：react-dom `resolveUpdatePriority` ← `dispatchReducerAction` ← `@tanstack/react-virtual` 的 `onChange` ← `Virtualizer.notify` / `maybeNotify` ← `@tanstack/virtual-core` `index.js:84`（`observeElementOffset` 的防抖回退）← `utils.js:60` `debounce`（`targetWindow.setTimeout`）← `Timeout._onTimeout`。即：一个由滚动安排的 Node 定时器，在所属测试文件的 jsdom 已拆除之后才触发，React 读取 `window` 失败。
- 版本：`@tanstack/react-virtual` / `virtual-core` 3.13.12。默认 `isScrollingResetDelay: 150`（`virtual-core` `index.js:253`）、`useScrollendEvent: false`（`:256`），所以每次滚动都会安排一个 150 ms 的防抖定时器；取消订阅时**不清除**尚未触发的定时器。
- 产品代码中的使用点：`Accounts.tsx:263`、`Dimensions.tsx:252`、`TradeMaster.tsx` 与通用 `VirtualRows` 等，都用默认值。
- web 测试中触发滚动的只有 `packages/web/test/ledger-reports.test.tsx`（609 行）的三处：`:399`、`:468`、`:584`。其中 `:568–589` “bounds the paged virtual table DOM while scrolling within a full page” 在文件末尾附近：`:584` `fireEvent.scroll` 后约 150 ms 内文件就结束（其后只剩 `:590` 一个短测试），**首要嫌疑**。
- 该分片的 web 文件完成顺序（固定来源：同一日志）：`trade-reports.test.tsx`、`ledger-reports.test.tsx`、`ui.test.ts`（36 ms）、`contrast.test.ts`（13 ms）、`shell-targets.test.ts`（5 ms，报错归属处）、`business-events.test.tsx`、`trade-adjustments.test.tsx`。`ledger-reports` 之后三个文件合计约 54 ms，与 150 ms 延迟量级吻合。
- 配置：web 项目全部是 jsdom（`vitest.config.ts:156–166`，`setupFiles ./test/setup.ts`）；全局 `pool: "forks"`（`:105`）、`isolate: false`（`:107`）、`WeightedShardSequencer`（`:108`）；诊断开关 `TEST_FILE_ORDER=reverse|shuffle:<seed>`（`:70–71`）。
- `packages/web/test/setup.ts`（13 行）：`beforeEach` 清空 `localStorage`；`afterEach` 调 `cleanup()`、`vi.restoreAllMocks()`、`vi.unstubAllGlobals()`。没有处理遗留定时器。

## 设计决定（产品负责人）

1. **先证明根因，再修**。上面的“首要嫌疑”是设计角色根据栈与日志的推断，**没有**复现。开发须先完成 F1、F2；若不能确定地复现，停下报设计角色与协调者，不合并推测性的修复。
2. **修在测试一侧**：真实浏览器中 `window` 不会消失，产品行为没有缺陷；不改 `packages/web/src/**`，不改 `@tanstack/*` 的默认值或版本。
3. **修法由开发选**，须满足不变量。设计角色认可的两类方向（任选其一，PR 中说明为什么）：
   - **在嫌疑测试内收尾**：让滚动安排的防抖在测试结束前确定地完成（例如在该测试内局部使用假定时器并在卸载前推进，或等待一个可观察的“滚动结束”状态），只改 `ledger-reports.test.tsx`。
   - **在 `setup.ts` 通用收尾**：`afterEach` 在 `cleanup()` 之后清除本测试期间经 `window.setTimeout` 安排、仍未触发的定时器，使任何测试文件都不能把定时器留到 jsdom 拆除之后。须在 PR 中说明不会吞掉被测代码应当观察到的定时器（只在测试结束、组件已卸载之后清除）。
4. **禁止的做法**：重试；`dangerouslyIgnoreUnhandledErrors`；按消息过滤错误；固定时长的 `sleep` / `setTimeout` 等待；改 `vitest.config.ts`（含 `isolate`、`pool`、分片权重）、`package.json`、lock、`scripts/test-shard-weights.json`。

## 范围

- `packages/web/test/ledger-reports.test.tsx` 和 / 或 `packages/web/test/setup.ts`（按决定 3 的选择）。
- F2 用的复现探针（临时测试文件、调序命令）**不提交**；命令与输出贴在 PR 正文。

## 冲突域

- tests:web-setup：只改上述测试文件。
- 与 S21 其他任务不相交：SLOT-04 只改 `scripts/slot/`；TLIST-05 改 `packages/web/src/business-events/` 与 `packages/web/test/business-events.test.tsx`（不同文件）。若 FLAKE-08 选 `setup.ts` 方向，TLIST-05 的新测试也在其下运行，后合并的一方须在合并前基于 main 重跑 web 测试。
- 与 S20 PR 不相交：进行中的 #298 改 `scripts/test-shard-weights.json` 与 `packages/infra/test/tooling/`，本任务不改；已合并的 #299 只改了 `packages/web/src/trade-orders/`。
- 受影响的 e2e 断言：无。

## 验收

### base 失败、head 通过

| 编号 | 断言 | base（S21 送审时的实际合并基） | head |
| --- | --- | --- | --- |
| F1 | **根因有证据**：用不提交的探针（例如临时包装 `window.setTimeout`，记录安排时的测试名与栈）证明：报错的定时器由哪一个测试、哪一行安排，在哪一个文件的 jsdom 拆除之后触发；PR 正文贴探针代码与输出。若根因不是 `ledger-reports.test.tsx:584`，按实际结论改写 F2、F3，不修改本任务书的其他条款 | — | 有结论与原始输出 |
| F2 | **确定性复现**：给出一条只用现有开关的命令（如 `npx vitest run --project web --maxWorkers=1 <文件列表>`，必要时加 `TEST_FILE_ORDER`，允许临时探针文件），在 base 上连续 5 次都出现 `window is not defined`（或探针记录到“拆除后触发”），在 head 上连续 5 次 “Errors 0”。贴两侧 5 次的汇总行 | 5/5 失败 | 5/5 无错误 |
| F3 | **提交的回归护栏**：在已有测试文件中加入断言（不新增测试文件），在 base 上失败、head 上通过。例如：滚动后的测试结束时，没有该测试安排且未触发的定时器；或通用护栏对任意测试成立。贴 base 与 head 的失败 / 通过输出 | 失败 | 通过 |

- **base 上的判定方法**：在 base 的分离 worktree 中运行 F2 命令；F3 把 head 的测试改动放进 base worktree（不带修复）运行。base 写完整 SHA。

### 两侧都须成立的不变量

- **F4 范围**：`git diff --name-only <合并基>..<head>` 只含“范围”所列文件；不改 `packages/web/src/**`、`vitest.config.ts`、`package.json` / lock、分片权重；不新增测试文件。
- **F5 禁止项**：diff 中没有决定 4 所列做法（PR 正文逐项写“无”）。
三类证据分工明确，互不替代，不新增 CI 作业（`full.yml` 只在 main push 与定时触发，PR 上没有 Full；PR 门禁是 `ci.yml` 的 `verify`）：

- **F6 本地证据（开发机）**：F2 的确定复现两侧各 5/5（base 失败、head 无错误），以及 head 上 `npx vitest run --project web` 全部通过、“Errors 0”；`ledger-reports.test.tsx` 既有测试的断言不删、不放宽。贴命令与未截断汇总行。
- **F7 PR verify**：PR 的 `verify` 作业为绿（它跑受影响测试，不是 Full，不能代替 F6）。
- **F8 合并后的 main Full**：合并提交上的 main Full 为绿；合并后至 S21 评审期间，main Full 不再出现 `window is not defined`。S21 评审列出期间 main Full 的 run 编号与结论（只核对引用，不为此重跑；历史 run 45291279585 同样只引用）。
- **F9 PR 正文**须含：F6 / F7 / F8 三类证据分列（F8 在合并后由协调者或 S21 评审补记）；“用户可见变化：无”；“可读性”一节；F1–F3 的命令与未截断输出；修法选择的理由。

## e2e 断言

- 无。GUI e2e 不受影响。

## 性能考虑

- 不得让 web 项目总时长增加超过 2 秒（PR 正文贴 base 与 head 的 `--project web` 耗时，各一次即可，只作参考）；不改分片权重。

## 可读性

按[路线图 §5 完成定义](../roadmap.md#5-团队流程) ①–⑥：

- `setup.ts` 净增 ≤ +25 行；新增函数 ≤ 25 行、嵌套 ≤ 3 层。
- 回归护栏净增 ≤ +60 行；不复制已有的 `geometry()` 等辅助函数。
- 注释只写“为什么”（例如为什么 150 ms 的防抖会越过 jsdom 拆除），一处即可。
- PR 正文“可读性”一节贴 `git diff --numstat`。

## 用户可见变化

- 无（测试稳定性）。

## 证据要求

- 不需要浏览器时段。F1–F3、F6 在开发机上执行；F7 以 PR 的 `verify` 记录为准；F8 以合并后的 main Full 记录为准。
- **可行性**（S13 回顾行动 4）：设计角色**没有**试做 F2。`isolate: false` 时同一 fork 内的文件顺序由分片排序器决定；若 `--maxWorkers=1` 加文件列表不能稳定复现，可用 `TEST_FILE_ORDER` 或临时探针文件（在嫌疑测试之后立即结束的极短文件）。三种都不能稳定复现时，按决定 1 停下报告。
