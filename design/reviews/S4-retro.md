# S4 Sprint 回顾（v0.4.0）

- 主持：设计 / 产品负责人。基线：main `66d8e15`（Demo [#108](https://github.com/lingshf/ai-native-erp/pull/108) 合并后，Sprint 评审已通过，验收对照见 [S4.md](S4.md)）。
- 范围：S4 的 #86–#108。D90、D92 是协调者的决定记录编号，本文只引用事实与结论。
- 每项写：发生了什么 → 根因 → 改进动作（负责人、落到哪条流程）。落到路线图的规则由本 PR 直接写入[路线图 §5](../roadmap.md#5-团队流程)；落到发布流程的由版本管理在 [PROC-02](../tasks/PROC-02-release-rc-and-demo-checks.md) 中落实；代码问题进入 [S5 计划](../tasks/README.md#s5stylescss-全局元素规则收尾--s4-回顾行动建议-v050)。

## 做得好

- 19 个任务按三条线、表内依赖派发，外壳串行和 `contrast.test.ts` 串行没有出现冲突。
- 合并门禁按 #85 的新口径执行：每个 PR 的评审都绑定最终 head；main Full 以每个分片的测试步骤结论为准。S4 期间 main 的 Full 没有一次被取消或误判。
- UI-09g 用属性级证据删除规则：只删计算值不变的声明，其余登记为 S5 待办，没有凭截图零差异一刀切。
- 评审在 #105、#108 中都把问题落到具体行号与代码依据，修改轮次虽多，但每轮范围收敛。

## 议题

### 1. D90：`git stash` 跨 worktree 共享，改动串到别的任务

- **发生了什么**：同一仓库的多个 worktree 并行开发时，一个任务的未提交改动经共享的 stash 进入了另一个任务的工作区（经过见协调者 D90 记录）。
- **根因**：stash 存在 `refs/stash`，属于整个仓库，所有 worktree 共用同一个栈；`git stash pop` 默认取栈顶，不区分来自哪个 worktree。我们的会话都在同一仓库的不同 worktree 中运行（本机当前 4 个），而 rebase、切换基线时常顺手用 stash。设计角色本 Sprint 也用过 stash 做 rebase（已核对 `git stash list` 为空，没有遗留）。
- **改进动作**：
  - 规则（负责人：协调者派发时转告，全体角色执行；落到[路线图 §5 工作区隔离](../roadmap.md#5-团队流程)）：worktree 中禁止使用 `git stash`。暂存改动改用本分支上的 WIP 提交（之后 `git reset --soft`），或 `git diff --binary > <session files>/wip.patch`。rebase 用 `git rebase --autostash` 也属于 stash，同样禁止。
  - 发现疑似串入时：先 `git stash list` 和 `git diff --stat origin/main...HEAD` 核对，再报告协调者，不自行丢弃别人的 stash。
  - 评审角色：PR diff 出现任务冲突域之外的文件，要求说明来源。

### 2. D92：trade-orders 焦点断言偶发失败

- **发生了什么**：UI-10b（[#101](https://github.com/lingshf/ai-native-erp/pull/101)）分支的 PR CI 运行 [44761991208](https://github.com/lingshf/ai-native-erp/actions/runs/44761991208)（head `18870fe`）中，与本 PR 无关的 `packages/web/test/trade-orders.test.tsx` 用例 “shows no amounts before save, posts once and then shows the server's amounts” 失败：`expect(document.activeElement).toBe(notice.closest(".tord-saved"))`，实际焦点在 `body`。该 run 只有 attempt 1，没有在 `18870fe` 上重跑；之后通过的 CI 是 rebase 后的新 head `4f89a0d`（运行 [44762941903](https://github.com/lingshf/ai-native-erp/actions/runs/44762941903)），不是同一 head 的重跑。
- **根因：未证实**。区分如下：
  - **观察**：上面一次失败；同一测试在其他 head 上通过；尚未稳定复现。
  - **推断（待验证）**：`TradeOrders.tsx:273–275` 在被动 `useEffect` 中把焦点移到保存提示，测试在 `findByText` 找到提示文字后**同步**断言焦点（`trade-orders.test.tsx:185–186`）。保存由异步请求触发，被动 effect 可能晚于文字出现执行，这可以解释这次失败。
  - **未排除**：真实浏览器中保存后焦点没有到位的产品问题。在 S5-h 复现并核对真实 Chrome 之前，不把它定性为“只是测试竞态”。
- **改进动作**：
  - 调查与修复任务 [S5-h](../tasks/S5-h-trade-orders-focus-race.md)（负责人：开发，冲突域 web-ui:trade-orders，排在 S5-d 之前）：先复现、核对真实 Chrome，再按证实的原因修复。
  - 规则（负责人：评审角色、协调者；落到[路线图 §5 偶发失败](../roadmap.md#5-团队流程)）：PR CI 中出现与本 PR 无关的失败，可以重跑一次，但必须在 PR 描述记录失败的 run 链接、用例名和失败断言，并报告设计角色登记修复任务。不能只重跑不记录。

### 3. 一次性失败没有保留日志（#106 首轮的 2 个失败）

- **发生了什么**：UI-09g（[#106](https://github.com/lingshf/ai-native-erp/pull/106)）在本机第一次跑 `npm test -w packages/web` 时有 2 个文件 / 2 个用例失败，当时本机正在并行采集 100 张截图；输出没有保存。之后在同一 head 上重跑两次都通过，只保存了通过的日志。原因**未知**：没有失败日志，连失败的用例名都无法核对，既不能说是负载导致，也不能说是像 D92 那样的竞态。
- **根因**：没有“证据性测试运行一律保存完整输出”的规则；开发习惯只保存最后一次通过的日志。失败的那次恰恰最有信息量。
- **改进动作**（负责人：开发执行，评审角色核对；落到[路线图 §5 偶发失败](../roadmap.md#5-团队流程)）：
  - 作为 PR 证据的本机测试运行，一律用 `2>&1 | Tee-Object <log>` 保存完整输出，**失败的运行也保存**，和通过的日志一起放进 PR 的证据 gist。
  - 失败日志里必须能看到失败用例名和断言；没有日志的失败，原因记为“未知”，按议题 2 的规则报告。

### 4. 本机负载与 D13 阈值的判定

- **发生了什么**：#106 引用 D13，把两类现象都归为“本机负载”：
  - 本机 4 个 GUI 用例的单例总时长 26.8–31.0s，超过 25s；
  - 上面议题 3 的 2 个失败。
  两者都不能由 D13 证明是负载导致：
  - 本机用例时长不属于 D13 / D15 的验收口径（只在 Linux main Full 的每个分片上验收），所以超出 25s 不阻塞；但这只说明“不计入”，不说明原因已证实是负载；
  - D13 只是耗时口径，不能用来豁免或解释断言失败。
- **根因**：D13 / D15 的口径写在 [M0-R2 任务文件](../tasks/M0-R2-test-speedup.md)里，路线图 §4 没有写“本机数字的地位”。开发因此把 D13 当成了笼统的“本机不算”。
- **改进动作**（负责人：设计角色写规则，评审角色执行；落到[路线图 §4](../roadmap.md#4-ci-与测试策略设计角色牵头)）：
  - **耗时**：阈值只按合并后 Linux main Full 每个分片的 Vitest `Duration` 验收（D13 / D15），不用 step 时长。本机耗时只作参考，超出不阻塞，也不能当作达标证据。
  - **失败**：D13 不豁免任何断言失败。失败日志、同一 head 重跑通过、该 head 的 PR CI 通过，只能说明“未稳定复现”，不能确立负载根因。原因未证实时记为“未知”，按偶发失败报告（议题 2）；只有在受控负载下复现，并找到机制，才能归因于负载。

### 5. 任务表没在合并当天同步（设计角色提出）

- **发生了什么**：#85 写入了“合并后当天同步任务表”的规则，但 #86–#106 的状态直到 [#107](https://github.com/lingshf/ai-native-erp/pull/107) 才集中同步。期间 #105 发布草稿的评审只能说明“任务表同步由 #107 处理，不阻塞”。
- **根因**：规则要求协调者通知、设计角色同步，但本 Sprint 合并密集，一天合并 20 个 PR，协调者没有逐个通知；设计角色也没有主动按 main 日志核对。两边都在等对方，规则没有兜底。另外，一个合并一个文档 PR 会取消 main Full（路线图 §5 Full 被取消时）。
- **改进动作**（负责人：设计角色；落到[路线图 §5 合并后](../roadmap.md#5-团队流程)第 2 条）：
  - 设计角色不再等通知：每天至少一次，或在同冲突域派发下一个任务前，用 `git log --oneline <上次同步>..origin/main` 对照任务表，把当天合并的任务攒进一个文档 PR。
  - 协调者照常通知，但通知缺失不再是不同步的理由。
  - 发布 PR 开 RC 之前，任务表必须已同步（发布流程检查清单已有此项，版本管理开 RC 前核对）。

### 6. RC 文档需要多轮评审（36px 写成全站、API 与 GUI 混写、44px 措辞）

- **发生了什么**：[#105](https://github.com/lingshf/ai-native-erp/pull/105) 共三轮评审：
  - `a726eec` 要求修改：把 36px 写成全站控件高度，实际只有 #92/#97/#98 所列页面的控件沿用 36px，分段按钮用 `calc(var(--control-h) - 6px)`；订单的旧 API 行号与新 GUI 预填编号写在同一项里，容易误读为 API 行为改变。
  - `5267022` 要求修改：44px 仍泛称为“未列出的控件”，准确范围是未被覆盖的 `button` / `select` 的最小高度基线。
  - `ea76b4f` 通过。
- **根因**：
  - RC 的概括按任务标题和 CHANGELOG 摘要写，没有对着 CSS 核对每条尺寸断言的范围。PROC-01 已要求“断言需有来源”，但来源只证明了所列控件，概括句仍然外推到了全站。
  - 条目按 PR 组织，同一 PR 同时涉及 API 与 GUI 时，就被写进了同一条。
- **改进动作**（负责人：版本管理；落到 `docs/release/README.md` 检查清单，由 [PROC-02](../tasks/PROC-02-release-rc-and-demo-checks.md) 落实）：
  - 每条尺寸 / 范围断言写出“适用范围 + 例外”，并引用 CSS 行号或实测表；不写“全站”“所有”，除非有覆盖全站的测试。
  - 面向调用方的变化与面向界面的变化分条写：API 变化单列，标明“API 不变”的也要写明。
  - RC 开出前，用本 Sprint 的 3 条评审意见作为自查样例过一遍。

### 7. Demo 截图标注错误，复跑说明缺少进程归属检查

- **发生了什么**：[#108](https://github.com/lingshf/ai-native-erp/pull/108) 共三轮评审：
  - `aea0cd5` 要求修改：`preference-warning-en-green-390.png` 实际是中文红主题；390 筛选图的粘性顶栏压在正文中间；复跑步骤没有先确认端口 4194 空闲，收尾用 `Get-Process node` 识别不了本次服务。
  - `7229aac` 要求修改：仍缺监听归属检查，即 seed 前确认 4194 的 `OwningProcess` 等于本次 `$server.Id`。
  - `0a1c65e` 通过。
- **根因**：
  - **截图标注**：`capture.mjs` 让所有 `getItem` 抛错来制造偏好读取失败，`loadPreferences` 因此必然回退到 zh / red。文件名却取自循环变量，没有取自页面的实际状态，所以名字和内容不一致。
  - **滚动位置**：截图前没有恢复预期的滚动位置。
  - **进程归属**：执行记录里人工核对过，但可复制的命令没有写进去，读者照做会把 seed 写进占用端口的别的实例。
- **改进动作**（负责人：版本管理；落到 `docs/demo/TEMPLATE.md`，由 [PROC-02](../tasks/PROC-02-release-rc-and-demo-checks.md) 落实）：
  - **截图状态断言**：截图文件名中的语言、主题、宽度、教学开关，必须在截图前从页面读取并断言（`document.documentElement.lang`、主题属性、`innerWidth`），不符就中止，不能从循环变量推断。故障注入改变了状态时，按实际状态命名，并说明是哪个故障分支。
  - **滚动位置**：截图前显式设定滚动位置。
  - **进程归属**：复跑说明必须是可复制、自带检查的命令，包括：启动前端口空闲；seed 前 `Get-NetTCPConnection -LocalPort <port> -State Listen` 的 `OwningProcess` 等于本次 `$server.Id`，否则中止；收尾只停本次 PID。执行记录中做过的人工检查，都要落到命令里。

## 行动项汇总

| # | 行动 | 负责人 | 落到 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | worktree 中禁止 `git stash`（含 `--autostash`），改用 WIP 提交或 patch 文件 | 协调者转告，全体执行 | [路线图 §5 工作区隔离](../roadmap.md#5-团队流程) | 本 PR 写入 |
| 2 | 复现并修复 trade-orders 焦点失败（原因待证实） | 开发 | [S5-h](../tasks/S5-h-trade-orders-focus-race.md) | S5 |
| 3 | 无关失败重跑须记录 run、用例、断言，并报告设计角色登记 | 评审角色、协调者 | [路线图 §5 偶发失败](../roadmap.md#5-团队流程) | 本 PR 写入 |
| 4 | 证据性测试运行保存完整输出，失败的也保存 | 开发执行，评审核对 | [路线图 §5 偶发失败](../roadmap.md#5-团队流程) | 本 PR 写入 |
| 5 | 耗时只按 main Full 分片 Vitest Duration 验收；D13 不豁免断言失败；记录时区分观察、推断与归因，未证实的原因记为“未知” | 设计角色、评审角色 | [路线图 §4](../roadmap.md#4-ci-与测试策略设计角色牵头) | 本 PR 写入 |
| 6 | 设计角色每天按 main 日志主动同步任务表，不等通知 | 设计角色 | [路线图 §5 合并后](../roadmap.md#5-团队流程) | 本 PR 写入 |
| 7 | RC 断言写明范围与例外；API 与 GUI 变化分条 | 版本管理 | [PROC-02](../tasks/PROC-02-release-rc-and-demo-checks.md) → `docs/release/README.md` | S5 |
| 8 | 截图前断言实际状态与滚动位置；复跑命令自带端口与进程归属检查 | 版本管理 | [PROC-02](../tasks/PROC-02-release-rc-and-demo-checks.md) → `docs/demo/TEMPLATE.md` | S5 |
