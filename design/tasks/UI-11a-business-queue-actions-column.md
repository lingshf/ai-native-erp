# UI-11a 业务事件“待转队列”操作列按钮截断、无法点击

- Sprint：S5 收尾后的 backlog（不计入 S5 目标，版本由协调者定）　依赖：[FOCUS-01](FOCUS-01-journals-events-passive-focus.md)（同冲突域串行）、[S5-g](S5-g-delete-global-element-rules.md)（S5-g 取证覆盖全部页面，开工时不应有正在进行的页面 CSS 任务）　建议分支：`ui-11a-business-queue-actions`
- 冲突域：web-ui:journals（`BusinessEvents.tsx`、业务事件 labels、`src/pages/journals.css`）。如必须改 `theme/components.css`（web-ui:components），先报告设计角色加依赖。
- 类型：页面 CSS（必要时 tsx）
- 来源：FOCUS-01 在真实 Chrome 取证时发现；现存布局缺陷，base `045fa59` 上已存在，FOCUS-01 未改样式。

## 观察

以下由 FOCUS-01 作者报告：

1. 业务事件页“待转队列”表（`BusinessEvents.tsx` 中 `title={t("business.queue")}` 的 `PageTable`）操作列按钮被截成“…”。
2. 点击这些按钮时，`<td>` 拦截鼠标事件，3 条交互路径点不到。
3. base `045fa59` 上即可复现，与 FOCUS-01 的改动无关。

代码中该列有 3 个 `btn btn-subtle btn-sm` 按钮：“查看”（所有行）、“预览”和“撤回”（仅 `pending` / `failed` 行）。3 条路径具体是哪 3 个按钮、在哪个宽度和主题下复现，以 FOCUS-01 PR 的证据为准，开工时先核对。

## 推断（待开工时验证，不是结论）

- 规则在 main `90569f7` 上的现值：`:is(.journals, .business-events) .journal-scroll th:last-child { width: 9rem }`；`.journal-row td` 与 `.journal-row button` 都是 `nowrap` + `overflow: hidden` + `text-overflow: ellipsis`，按钮还有 `max-width: 100%`。三个按钮放不进 9rem，于是被截断。
- 按钮超出 `td` 可见区的部分被裁掉，所以点击落在 `td` 上。

## 范围

- 只改业务事件页“待转队列”表的操作列，可选做法：
  - 用 `.business-events` 限定的规则加宽这一列，或允许按钮换行 / 改为不截断；
  - 必要时调整按钮布局（例如 `display: flex` + `gap`），或在 tsx 里加类名。
- **凭证列表（`.journals`）的操作列不变**：UI-10b（#101）已定宽，`:is(.journals, .business-events)` 共用规则要拆开时，凭证页计算值必须零差（同 S5 共同验收 3 的 `rules-probe.mjs` 方法）。
- 按钮可访问名称、`disabled` 条件、点击行为、焦点返回（`returnFocus`）不变。
- 虚拟列表行高（44）与 overscan 不变（design/ui §8）。如需让按钮换行而导致行高变化，先报告设计角色，不要自行改 `estimateSize`。
- 不改 `styles.css`，不改其他页面。

## 验收标准

1. 满足 [UI-1 通用验收标准](README.md#ui-1界面逐步改进) 1–9。PG-05：入口 JS 不变，CSS 合计 ≤ +0.2 kB，路由 chunk ≤ +15%。
2. **完整显示**：1440 与 390 宽，中文 + 红、English + 绿，`pending` 或 `failed` 行（三个按钮都出现）上，每个按钮 `scrollWidth ≤ clientWidth`，文字不含省略号，按钮矩形完全落在所在 `td` 与表格滚动区的可见区域内（390 下若表格横向滚动，滚到该列后判定）。
3. **可点击**：真实 Chrome（Playwright，不用 `force`）分别点击三个按钮，得到改前应有的结果：“查看”打开详情、“预览”打开转换预览、“撤回”打开撤回对话框。`document.elementFromPoint` 在每个按钮中心点返回该按钮（或其子节点）。在精确 head 上采集，记录 `git rev-parse HEAD` 与 `git status`；同一路径在 base 上失败、在 head 上通过。
4. **触控目标**：这三个按钮在 1440 与 390 下命中区域都不小于 44 × 44 CSS px，用 `elementFromPoint` 在命中区四角内侧 1px 处取点验证。可视高度可以保持 `--control-h`（桌面 36px，design/ui §7），用不影响布局的方式扩大命中区；也可以直接把按钮做成 44px 高。**本条只适用于这三个按钮**，不改变全站“桌面 36px、窄屏或粗指针 44px”的规定。相邻按钮的命中区不能重叠。
5. 键盘：Tab 顺序与改前相同，三个按钮都能聚焦并用 Enter / Space 触发；焦点环完整可见，不被 `overflow` 裁切。
6. 截图：改前 / 改后，1440 中文 + 红、English + 绿，以及 390，用虚构夹具。改前图应能看到“…”。凭证列表页改前 / 改后像素差为 0。
7. 测试：Web 测试新增一条，断言队列操作列三个按钮的可访问名称；按钮尺寸与可点击性在真实 Chrome 中验证（jsdom 不做布局，不作为本条依据）。现有测试与 E2E 不删除、不削弱（D11），证据运行保存完整日志，失败的也保存。
8. 验证分层同 [FLAKE-02](FLAKE-02-trade-gui-period-option-poll.md)：PR 快速 CI 不跑 slow E2E；合并前以精确 head 的本地真实 Chrome 为证据；合并后看 main Full，每个分片的测试步骤都为 success（[路线图 §5](../roadmap.md#5-团队流程)）。
