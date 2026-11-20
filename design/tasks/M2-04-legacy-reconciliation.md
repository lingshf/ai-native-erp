# M2-04 迁移核对报告

- 里程碑：M2　依赖：首批 M2-03；跟进 M2-04b 依赖首批与 M2-03b（D26）　建议分支：`legacy-reconciliation`
- **分两批交付（D26）**：首批按原边界交付，复用现行 `tradeReconciliation`，贸易子账用期初门禁 fail-closed；M2-03b 合并后，由小跟进 M2-04b 改用 P 公式并验收跟进第 1–3 条。M2-05 要等 D25 全部完成（M2-03b 与 M2-04b 都已合并）。
- 冲突域：legacy-import, admin-cli, web-ui:migration
- **开工门禁**：M0-R4、M0-R5 都已合并（M2-01、M2-02 显式依赖两者，其余 M2 任务经依赖传递继承）。
- **数据**：开发、CI 和 Bench 只用虚构夹具。对真实旧账（4173 原账套、ID3 草稿、旧 checkout）的任何操作都需要 README“待用户决定”中对应的授权，本任务的开发与验收不需要真实数据。

## 背景

“备份不等于迁移完成”：切换前必须逐项核对，不能只比表行数（architecture.md 迁移原则）。

## 范围

- 核对分两条路径：
  - **只读检查** `legacy-reconcile --check`：readonly 连接，不跑初始化、种子或迁移，不写任何东西；M2-05 的抽查也用它。只输出报告和判定。
  - **确认** `legacy-reconcile --confirm <文件>`：持有 M0-R5 的独占维护锁。先读 `write_seq` 得到 W，在同一个读事务中完成核对；然后在一个写事务里再次确认 `write_seq` 仍为 W，并原子写入：run 状态、核对报告 SHA、确认文件 SHA、基线 W。期间任何其他写入都被维护锁挡住。
  - **首次 W 锁定（D10）**：首次确认写入的基线 W 之后不可改写。run 已是 `reconciled` 时再次 `--confirm` 只校验 `write_seq` 是否等于 W：相等则通过且不写任何东西；不等则拒绝。不能用重新确认洗掉切换后的业务写入。确需重建基线时，只能把整个目标库作废，从快照重新导入。
- 两条路径共用一个核对函数，输入快照（经只读读取器）和目标库，输出结构化报告：
  - 每月每阶段试算、每科目余额（精确最小单位）；
  - 凭证数、分录数，按 `legacy_ref` 一一对应，列出缺失和多余；
  - 维度合计、期间状态、草稿清单（例如 ID3 按选项导入后仍为草稿）；
  - **已知差异**：M2-02 中不可映射或按选项未导入的对象，按类别列数量和清单。
- **判定**：
  - `差异`：上面任一核对项不一致 → 失败。
  - `待确认`：核对项一致，但有已知差异尚未确认 → 阻断，不能切换。
  - `阻断`：核对项一致，但有不能用确认文件放行的项。目前只有一类：贸易期初未完成（代码 `M2_03B_OPENING_REQUIRED`；首批标注“待 M2-03b 消除”，M2-04b 起页面改为“缺少期初完成标记 opening=done，需用期初明细文件重新导入”），见下面的期初门禁。
  - `待确认`：核对项一致、没有阻断项，但有已知差异尚未确认 → 不能切换。
  - `通过`：核对项一致、没有阻断项，且已知差异全部确认。确认文件由用户提供，内容绑定本次报告中已知差异清单的 SHA-256；清单有任何变化，原确认失效。虚构测试可以自带确认文件。
  - 优先级：`差异` > `阻断` > `待确认` > `通过`。
- 接入 M2-03：`legacy-import` 结束时仍持有维护锁，直接执行一次只读检查：`差异` → 在同一锁内把 run 记为 `failed`（目标保留供排查，运行时拒绝打开）；其他情况（含 `阻断`）保持 `imported`。只有 `--confirm` 路径能把状态改为 `reconciled` 并写基线，判定必须为 `通过`。
- 两条路径的判定非 `通过` 时都非零退出。
- Web 只读页 `/migration`：显示最近一次运行与核对结论，不提供任何写操作或切换按钮。
- **贸易子账，首批（D26）**：复用现行 `tradeReconciliation`（`packages/infra/src/storage/trade-reporting.ts:146-182`），报告逐控制科目列出切换日的 `subledgerMinor`、`glMinor`、`tradeGlMinor`、`otherSourceMinor`、`tradeDifferenceMinor`、`differenceMinor`，只用于显示。
- **期初门禁（fail-closed，单一规则，两批相同）**：
  - 期初完成证据只有一种：run 记录中的 M2-03b 阶段标记 `opening=done`，它绑定明细文件 SHA，包括逐科目的 `detail`/`empty` 声明。
  - 目标库切换日存在任一 AP/AR 控制科目（`tradeReconciliation` 的 `accounts_in_scope`），而 run 没有该标记 → 贸易子账判 `阻断`（代码 `M2_03B_OPENING_REQUIRED`）。
  - 这条不看各差额字段的值：即使净额为 0、三个差额全为 0，也不能放行。首批不把 LEGACY 余额落在 `otherSourceMinor` 判为 `差异`，因为它由门禁统一阻断。
  - 确认文件不能放行这一项，它也不进入已知差异清单。
  - 目标库没有 AP/AR 控制科目时，门禁不适用。
- **贸易子账，跟进 M2-04b（D25，M2-03b 合并后）**：见下面“跟进 M2-04b”一节。

## 涉及文件

新增 `packages/infra/src/legacy/reconcile.ts` 及测试；`scripts/storage-admin.mjs`；`packages/web/src/pages/migration*` 及 labels（中/英）。

## 验收标准（首批）

1. 不含 AP/AR 控制科目的 M2-03 夹具导入结果 + 有效确认文件 → `--confirm` 判定 `通过`，run 变为 `reconciled`，基线等于确认时的 `write_seq`，状态与基线在同一事务提交；确认前后业务表内容和 `write_seq` 不变。
2. 不带确认文件，或确认文件对应的清单与本次不同 → `待确认`，非零退出，run 不变为 `reconciled`。
3. 改一笔分录金额、删一张凭证、改期间状态 → `差异`，逐项指出并非零退出。
4. `--check` 前后目标库字节不变（字节不变只用于只读路径）。
5. `--confirm` 期间另一个连接尝试业务写入：被维护锁拒绝或阻塞；如果在读和写之间 `write_seq` 变化，确认失败且不写状态。
6. 首次确认后做一次业务写入，再执行 `--confirm`：拒绝，W 和 run 状态不变；无写入时再次 `--confirm` 通过，且不改写 W。
7. 页面支持中/英、红/绿、键盘操作；没有写操作。
8. **期初门禁**：每个用例都带有效确认文件。
   - AR 控制科目有 LEGACY 余额 100、run 无 `opening=done`：`--check` 判 `阻断`（代码 `M2_03B_OPENING_REQUIRED`）；`--confirm` 拒绝，run 仍为 `imported`；两条路径都非零退出。
   - AR 控制科目有两笔 LEGACY 分录 +100/−100，净额为 0，三个差额都为 0：仍判 `阻断`，`--confirm` 拒绝。
   - 控制科目存在但没有任何分录：仍判 `阻断`。

## 跟进 M2-04b（D25/D26）

> 状态：已实现（M2-04b PR）。`tradeReconciliation` 新增 `openingGlMinor`（P：`legacy_refs` 中 `opening_items` 指向、记账日 ≤ 截止日的期初项原始金额带符号合计，与子账同一符号规则），`tradeDifferenceMinor = T + P − S`、`otherSourceMinor = G − T − P`；没有期初项时 P = 0，与 M1 逐字段相同，贸易报表与迁移核对共用这一个公式，无模式开关。`opening=done` 时任一控制科目两式不为 0 记 `trade-reconciliation` 段差异（键 `公司:科目`）。阻断代码 `M2_03B_OPENING_REQUIRED` 保持不变（契约与已存报告兼容），只改页面文案。无新迁移。

- 依赖：M2-04 首批、M2-03b。冲突域：legacy-import, admin-cli（与 M2-03b 串行）。只改核对的贸易子账部分，其他核对项不变。
- 贸易子账改按 [M2-03b §三](M2-03b-legacy-opening-open-items.md) 的同一函数 `tradeReconciliation`，逐控制科目在切换日判定：`tradeDifferenceMinor = T + P − S = 0`，且 `otherSourceMinor = G − T − P = 0`。任一不为 0 记为 `差异`，不作为已知差异类别放行。报告增加 `openingGlMinor`（P）列。
- 期初门禁规则不变：有 `opening=done` 标记时门禁满足，按上式判定；没有标记的 run（例如 M2-03b 之前导入的）仍判 `阻断`。M2-03b 之后，`legacy-import` 结束时的检查在期初阶段提交之后执行。
- 明细缺失或合计不符在导入时已经阻断（M2-03b 阻断口径 1–5），本报告复核同一结论。

### 验收标准（跟进）

1. M2-03b 夹具（含 AP/AR 控制科目、有完整明细或 `empty` 声明）+ 有效确认文件 → `通过`，run 变为 `reconciled`。净额为 0 的相抵明细（M2-03b 验收 6）同样通过。
2. 期初项负例只用**已导入**的目标上的隔离异常夹具：测试夹具绕过不可变触发器，直接构造异常目标（修改一个期初项的原始金额、删除一个期初项，或追加一笔无期初项的 LEGACY 分录）。`--check` 判 `差异`，并指出对应科目的 `tradeDifferenceMinor` 或 `otherSourceMinor`；`--confirm` 拒绝，run 不变为 `reconciled`。非法明细文件（缺声明、删行导致合计不符）由 M2-03b 在导入前阻断，不在本任务作为负例。
3. 首批验收 8 的门禁用例结果不变（无标记的 run 仍为 `阻断`）；首批验收 1–7 仍通过。

## 性能考虑

两侧各按月一次 GROUP BY 流式聚合，不逐行比对全部分录；逐行只查 `legacy_refs` 缺失项。Bench：100 万 GL 行核对 ≤ 120s。页面只读已存储的报告，热读 p95 ≤ 1s。
