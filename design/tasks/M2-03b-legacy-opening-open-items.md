# M2-03b 旧账 AP/AR 期初未结项导入与核对口径

- 里程碑：M2　依赖：M2-03、M1-06　建议分支：`legacy-opening-open-items`
- 冲突域：legacy-import, domain-posting, storage, admin-cli, web-ui:trade
- **决定**：D25（协调者代定，2026-11-19）：旧账 AP/AR 控制科目余额导入为期初未结项，使贸易子账与 GL 一致。见[路线图 §6](../roadmap.md#6-决定记录)、[M1 评审 §7](../reviews/M1.md)。
- **开工门禁 / 数据**：同 M2-04。开发、CI 和 Bench 只用虚构夹具。真实明细文件的制作和真实导入仍需决定 A/C。

## 背景

M2-03 经 LEGACY 适配器（`packages/core/src/application/posting-adapters.ts:10`）把旧账余额过账到 AP/AR 控制科目，但不建 `open_items`。不处理会有两个问题：

- 余额无法用付款/收款核销，因为控制科目拒绝手工凭证。
- M1 的核对（`packages/infra/src/storage/trade-reporting.ts:146-182`）只把 TRADE 回执的分录算作 `tradeGlMinor`，LEGACY 分录全部落在 `otherSourceMinor`。所以单纯补未结项还不够。例：旧 AR 导入 100、补期初未结项 100，现有公式得到 `differenceMinor=0`，但 `otherSourceMinor=100`、`tradeDifferenceMinor=-100`。

本任务有两部分：

- 定义未结明细的来源和阻断口径；
- 把核对改成一条通用规则，单列有来源证据的期初部分。

## 一、未结明细的来源与验证

### 来源

旧账两个库都没有子账：

- 教学库只有科目、期间、凭证/分录和分录维度（`packages/infra/src/legacy/teaching.ts:260-287`）。
- Enterprise 库按 M2-02 只导入公司、币种、配置和审计等，也没有往来表。

快照里没有逐伙伴、逐单据的未结明细，不能从 M2-02 现有输入推出。

因此明细是**独立的显式输入**：用户提供一份未结明细文件，`legacy-import --opening-items <文件>`，JSON 或 CSV，格式在本任务中定版。

- 每行字段：控制科目、方向（AP/AR）、伙伴编码与名称、原单号、单据日、到期日、剩余金额（最小单位，带符号）、币种。
- 可选：旧账凭证 ID（作为 `legacy_ref` 线索）。
- 文件的 SHA-256 写入导入计划和 run 记录，与快照 manifest 一起绑定；文件变化即计划失效。
- 可选附加证据：旧账控制科目分录若带伙伴维度（`line_dimensions`），dry-run 按伙伴汇总，与文件逐伙伴比对。这只是校验，不是来源。

### 映射验证

dry-run 与导入共用同一套验证，导入前全部通过才写库：

- 伙伴按编码映射到目标伙伴：已存在则必须角色相容（M1-01 规则）；不存在则按文件中的伙伴信息新建，必须通过 M1-01 的伙伴校验。
- 控制科目必须是目标库中 `purpose='control'` 且 `control_module` 与方向一致的科目。
- 币种必须是公司本位币（M1 不支持外币）。
- 符号决定种类：AR 借方余额为发票类，贷方余额为预收；AP 方向相反。

### 阻断口径

单一规则，没有放宽开关。任一情形都会让 dry-run 和导入非零退出并逐项列出，导入不写库：

1. **缺整份明细**：切换日任一 AP/AR 控制科目的 GL 余额不为 0，但没有提供明细文件，或文件中没有该科目的行。
2. **合计不符**：任一控制科目上，明细剩余金额合计 ≠ 切换日该科目的 LEGACY GL 余额（精确到最小单位）。
3. **无法归属伙伴**：伙伴编码为空、映射冲突、角色不相容，或新建伙伴校验失败。不提供“归入默认伙伴”的选项。
4. **单行不完整**：缺原单号、单据日或到期日，或金额为 0，或同一伙伴内原单号重复（按 M1-03 外部单号规范化后比较）。
5. **伙伴维度不符**：旧账分录带伙伴维度时，逐伙伴合计与文件不符。

## 二、期初未结项

- 在 `legacy-import` 的同一维护锁、同一写事务内建立期初未结项：`origin='legacy-opening'`，记账日为切换日，冻结控制科目与维度。每行带导入 run ID 和明细行摘要，作为来源证据。
- 期初未结项**不再生成 GL**，因为余额已由 M2-03 的 LEGACY 凭证承载；原始金额不可改。
- 导入后，期初未结项与普通未结项一样参与：
  - M1-04/M1-05 的核销、贷项和取消（这些动作走 TRADE 过账）；
  - 账龄（按到期日）和历史余额。

## 三、核对口径（通用单一规则）

对每个控制科目和截止日 `cutoff`，有以下记号：

- `G` = GL 余额，现有 `glMinor`；
- `T` = TRADE 回执分录，现有 `tradeGlMinor`，包括对期初未结项的核销；
- `S` = 全部未结项 as-of 余额，现有 `subledgerMinor`，包括期初项；
- `P` = 记账日 ≤ cutoff 的 `origin='legacy-opening'` 未结项的**原始金额**带符号合计（符号约定与 `subledger` 相同，即 GL 借正贷负），新增字段 `openingGlMinor`。它表示“已被期初未结项解释的期初 GL”。

公式：

- `tradeDifferenceMinor = T + P − S`
- `otherSourceMinor = G − T − P`：未解释差额，含 LEGACY 中无对应期初项的部分和其他来源
- `differenceMinor = G − S`，恒等于 `tradeDifferenceMinor + otherSourceMinor`

说明：

- 没有期初项时 `P=0`，结果与 M1 现行公式逐字段相同，所以是同一条规则，不加模式开关。
- LEGACY 分录**不**算进 `T`，不把 LEGACY 伪装成 TRADE。`P` 取期初项本身的原始金额，不取 GL；它在 GL 上的依据由导入时的阻断口径 2 保证。
- 只对未解释差额和贸易差异判定为 0。`otherSourceMinor` 保留显示无对应期初项的其他来源，不抹平。
- `cutoff` 早于切换日时，期初项还不存在（`P=0`），旧账历史 GL 按现状显示为 `otherSourceMinor`。这是如实反映，不是差异。
- 实现位置是 `trade-reporting.ts` 的 `tradeReconciliation`，同一函数供 M1 报表和 M2-04 使用。报表页新增“期初”列，中英标签同步。

## 验收标准

1. **对平**：旧 AR 导入 100，期初未结项 100：`P=100`，`tradeDifference=0`，`otherSource=0`，`difference=0`。
2. **后续核销**：在 1 的基础上 TRADE 收款核销 40：`G=60`，`T=−40`，`S=60`，三个差额都为 0。账龄和历史余额正确，切换日前的历史余额不变。
3. **未解释差额保留**：另有一笔无期初项的 LEGACY 或其他来源分录 30：`otherSource=30`，`tradeDifference=0`。
4. **无期初项回归**：M1 现有核对测试（`infra/test/application/trade-documents.test.ts:640` 等）结果逐字段不变。
5. **阻断**：阻断口径 1–5 各有一个虚构用例，dry-run 与导入都非零退出、逐项列出、目标库不写。其中 1（无文件）和 2（合计差 1 个最小单位）必须使用**不带明细文件**的夹具或被篡改的明细文件，不能只用自带完整明细的夹具证明可行。
6. 明细文件改一个字节，原计划失效。
7. 中途失败整体回滚，目标库不留部分未结项或部分伙伴。
8. CI 绿。

## 性能考虑

- 10 万期初未结项的验证和导入纳入 M2-05 的 Bench 记录。
- 核对只多一个对 `open_items` 的聚合，热读预算不变。
