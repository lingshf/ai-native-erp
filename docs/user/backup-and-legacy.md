# 备份与旧账工具

备份、快照、导入和确认使用**命令行**；当前工作区提供只读“迁移核对”页。

## 备份与恢复（M0-R5）

```powershell
npm run storage:admin -- backup <db> <out>
npm run storage:admin -- restore <db> <in>   # 先停止服务
```

备份使用 SQLite 在线备份并校验；输出已存在、与目标同名或为保留路径时拒绝。恢复需离线，替换前自动生成带时间戳的完整 `.bak`，失败则校验回滚。不要手动删除 WAL/SHM/journal 文件。

## 旧账快照（M2-01）

```powershell
npm run storage:admin -- legacy-snapshot --source-dir <已停写的隔离源目录> --out-dir <不存在的新目录>
```

仅 Windows；两个路径必填，无默认值；源目录须已停止并隔离（独占句柄，冲突则 `SOURCE_BUSY`），残留 `-journal` 则拒绝。**对真实旧账的操作须另行取得授权**，开发和 CI 只用虚构夹具。生成的快照与备份不得提交到 Git。详见 [legacy-snapshot.md](../legacy-snapshot.md)。

## 导入映射与 dry-run（M2-02）

映射器仅有库代码与测试，没有独立命令行或界面入口；不打开或写入任何目标库。决定 C（草稿、回执、来源事件、队列、封印、审计的处理）无默认值。

## 隔离导入与核对（M2-03 / M2-04）

```powershell
npm run storage:admin -- legacy-import --snapshot-dir <已验证快照目录> --target <全新目标.sqlite> --drafts import-as-draft --receipts archive-only --source-events archive-only --transfer-queue archive-only --seals archive-only --audit archive-only
npm run storage:admin -- legacy-reconcile --snapshot-dir <同一快照目录> --target <目标.sqlite> --check
npm run storage:admin -- legacy-reconcile --snapshot-dir <同一快照目录> --target <目标.sqlite> --confirm <用户确认.json>
```

此示例显式保留草稿，其他五类只归档；它不是对真实旧账操作的授权。不可映射对象仍须先解决才能执行导入。只使用虚构夹具开发、测试和性能验收。

只接受已校验 SHA 的快照、新目标路径和全部六项决定，不读取活动旧账、4173 或 `.bak`；拒绝合并或覆盖已有业务库。同一工具的未完成导入可用同一命令断点续跑。全程持有独占维护锁；硬终止遗留的锁须由操作员确认进程已停止后处理，不会自动删锁。历史凭证来源显示为 `LEGACY`，原结转只落账一次，不补造业务回执、不重复生成结转；`archive-only` 的证据留在原只读快照中。

导入结束时在原维护锁内自动核对，核对读取同一事务内的末批数据，不另写业务数据。**末批、核对报告与最终状态在同一事务提交**：发现实际差异时一起保存报告并标记 `failed`，保留目标供排查，业务运行时拒绝打开；其他情况一起保存报告并转为 `imported`。核对或提交前中断会回滚末批，run 保持 `importing`；以同一快照和六项决定再次执行原导入命令，从已提交游标续跑，不重复导入已提交分录。不会留下 `imported` 却没有报告的正常提交状态。判定优先级为 `difference`（差异）> `blocked`（阻断）> `pending`（待确认）> `pass`（通过），非通过均非零退出。每月每阶段金额、科目余额、维度、期间、草稿、凭证与分录引用和数量共同决定结论，不能只看行数。

`--check` 只以 readonly 连接读取快照和目标，不运行初始化、迁移或种子，不保存报告；计算用的临时表与目标业务库分离，目标文件字节不变。报告列出已知差异的分类、数量、完整旧引用清单及 `knownDifferencesSha256`。用户逐项核实后，自行提供以下 JSON（散列必须复制自本次完整清单，不能用示例占位值）：

```json
{"knownDifferencesSha256":"<本次报告中的 SHA-256>"}
```

确认持有独占维护锁，在同一读事务取 W 并核对，再用写事务复查 `write_seq`，原子保存通过报告、报告 SHA、确认文件原始字节 SHA、首次基线 W 与 `reconciled` 状态；不修改业务数据，不递增 `write_seq`。清单不匹配不会确认。已确认后的重复确认只检查当前序号是否仍为 W：相同则不写任何东西，不同则拒绝，不能重建 W；必须作废整个目标，从快照重新导入。

新增迁移 **015** 专门存放上述报告和确认元数据，数据库约束禁止通过 UPDATE、DELETE、INSERT OR REPLACE 或 REPLACE 改写已确认基线（不依赖 recursive_triggers）；未确认报告仍可正常刷新。run 上预留 nullable `opening` 阶段标记和 **`opening_details_sha`**（64 位小写十六进制 SHA-256）。M2-03b 应在首次建立 run 时把用户明细文件原始字节的 SHA 写入该列，续跑时比较同一列绑定输入身份；它不属于 `choices` 中的六项决定 C，`opening=done` 也不能替代此 SHA。M2-04 只预留存储；明细文件读取与导入已由 M2-03b 实现，见下文“期初未结项”。新导入目标自动使用最新结构；旧版 014 的隔离导入目标可只读检查，需确认时请从同一快照导入一个新的 015 目标，而不是由核对命令隐式升级。

配置 `ERP_SQLITE_FILE` 为隔离目标后，在工作区导航“迁移核对”（`/#/migration`）查看已存报告；`/api/v1/migration` 仅接受同源 GET，不执行核对或财务写入。未确认或失败的目标只开放报告，不初始化业务账套。页面支持中/英、红/绿和原生键盘展开明细。报告是保存时的结论，不是实时业务健康证明。

**核对通过不等于允许切换。** 演练（M2-05）和切换（M2-06）仍需另行取得用户授权，本功能没有演练、切换或写操作按钮。

D25 / D26 的统一规则是 **AP/AR 期初未结项解释控制科目期初 GL，不能留下未解释差额**。本功能直接调用 `tradeReconciliation`（与贸易报表同一函数，单一公式，无模式开关），在切换日（目标最后过账日）逐科目列出 `subledgerMinor`（S）、`glMinor`（G）、`tradeGlMinor`（T）、`openingGlMinor`（P，记账日 ≤ 截止日的旧账期初未结项原始金额带符号合计，借正贷负）、`otherSourceMinor`、`tradeDifferenceMinor`、`differenceMinor`：

- `tradeDifferenceMinor = T + P − S`，`otherSourceMinor = G − T − P`，`differenceMinor = G − S`；
- 没有期初项时 P = 0，结果与 M1 原公式逐字段相同。

run 有 `opening=done` 时（M2-04b），任一控制科目的 `tradeDifferenceMinor` 或 `otherSourceMinor` 不为 0 即判 `差异`（`trade-reconciliation` 段，键为 `公司:科目`），不进入已知差异清单，确认文件不能放行。例如期初项原始金额被改、期初项被删、或追加了一笔无对应期初项的 LEGACY 分录，都会在该科目的 `otherSourceMinor` 上显示未解释金额，`--confirm` 拒绝。

期初门禁只认 run 上 M2-03b 阶段的 `opening=done` 标记（由 M2-03b 绑定明细文件 SHA 及逐科目 `detail`/`empty` 声明）。`accounts_in_scope` 中存在 AP/AR 控制科目而 run 无此标记时（例如期初阶段之前导入的 run），报告独立 `blockers`（代码 `M2_03B_OPENING_REQUIRED`，页面提示“缺少期初完成标记 opening=done…需用期初明细文件重新导入”），判 `blocked`；控制科目净额为 0、三个差额全为 0，或完全没有分录时也一样阻断。它不进入已知差异清单，确认文件不能豁免；run 保持 `imported`。没有 AP/AR 控制科目时不适用此门禁。

按 D26 分两批交付：M2-04 首批交付核对与门禁；M2-03b 导入期初未结项；M2-04b 启用上面的 P 公式判定。M2-05 仍需用户授权。

### 期初未结项（M2-03b，D25 / D30）

旧账没有子账，AP/AR 期初未结项由用户提供的**明细文件**导入：`legacy-import ... --opening-items FILE.json`。只要导入范围含 AP/AR 控制科目，就必须提供文件，即使每个科目都声明为 `empty`；缺文件或文件不可读时在任何目标写入前以 `INVALID_INPUT` 退出。文件原始字节的 SHA-256 在首次建立 run 时写入 `opening_details_sha`；续跑时先比较原始字节的 SHA，再解析内容：文件改动一个字节（包括改坏成非 JSON）即以 `CONFLICT` 拒绝，目标不变。该 SHA 不属于六项决定 C。

文件格式（JSON，`version` 为 1，示例数据均为虚构）：

```json
{
  "version": 1,
  "terms": [{ "company": "F", "code": "NET30", "name": "Net 30", "from": "2026-01-01", "to": "2099-12-31", "dueDays": 30, "discountDays": 0, "discountPercent": "0", "allowPartialDiscount": false }],
  "profiles": [{ "company": "F", "code": "ARP", "name": "AR profile", "from": "2026-01-01", "to": "2099-12-31", "side": "AR", "controlAccount": "1300", "advanceAccount": "2300", "cashAccount": "1000", "discountAccount": "4000" }],
  "parties": [{ "company": "F", "code": "C1", "name": "Fictional customer", "from": "2026-01-01", "to": "2099-12-31", "role": "customer", "apProfile": null, "arProfile": "ARP", "terms": "NET30" }],
  "accounts": [
    { "company": "F", "account": "1300", "declaration": "detail", "items": [
      { "side": "AR", "party": "C1", "partyName": "Fictional customer", "externalNo": "INV-1", "documentDate": "2026-01-10", "dueDate": "2026-02-09", "remainingMinor": 100, "currency": "EUR", "legacyJournal": "1" }
    ] },
    { "company": "F", "account": "2100", "declaration": "empty", "items": [] }
  ]
}
```

- `terms`、`profiles`、`parties` 可选，与 M1-01 主数据同构，按 M1-01 校验后在期初阶段创建（伙伴 `defaultDimensions` 与 M1-01 保存共用同一校验：形状、最多 32 个维度、维度与值须存在且启用、有效期覆盖伙伴窗口）；不自动生成默认 profile 或付款条件。明细行只按伙伴编码引用。
- 每个 AP/AR 控制科目必须恰有一条 `detail` 或 `empty` 声明；不从净额为 0 推断为空。
- `remainingMinor` 带符号（GL 借正贷负）：AR 正数为发票、负数为预收；AP 负数为发票、正数为预付。币种必须是公司本位币。
- 切换日 = 公司旧账最后记账日（无凭证时取年末），期初项记账日即切换日。
- **来源凭证**（D30，唯一规则，按顺序）：行内给了 `legacyJournal`（旧凭证 ID）就用它，该凭证不含此控制科目则拒绝；没给则取切换日及之前最后一张触及该科目的 LEGACY 凭证；两者都没有则拒绝。
- `partnerDimension` 可选：给出时，旧分录在该维度上的逐伙伴合计须与文件一致（口径 5）。行内可选 `dimensions` 按目标维度目录校验。

阻断口径 1–5（缺声明或缺文件、合计 ≠ 切换日 LEGACY GL 余额、伙伴无法归属、单行不完整或同一公司同一伙伴下原单号重复（规范化后比较，不分 AP/AR，与 M1-03 唯一键一致）、伙伴维度不符）在任何目标写入之前逐项列出：新路径不建库，续跑路径目标字节不变。

GL 批次结束后，期初项、新伙伴与主数据、来源证据（`legacy_refs` 中 `opening_items` 与逐科目 `opening_accounts` 声明，绑定明细 SHA）、`opening=done` 与 `importing → imported` 在**同一事务**提交；提交前在目标库复核每个科目期初项合计 = LEGACY GL 余额，不符则整个阶段回滚、run 标记 `failed`。该阶段中断时目标中没有任何期初项和 `opening` 标记，以同一命令和同一文件续跑，结果与未中断一致。没有明细时（全部 `empty`）也写入阶段标记。

导入后期初未结项不再生成 GL（余额已由 LEGACY 凭证承载），可以：

- 通过付款/收款核销；
- 用预收/预付 apply 到发票。期初项允许挂在 profile 的控制科目或预收预付科目上（D30：仅限同一方向、同一伙伴、同一币种；M1 自建项目仍按原角色检查）；核销分录始终按各项自身的科目过账。

期初未结项**不能**开贷项或取消（D30）：两者都以 `reference` 错误拒绝。需要调整时请在旧账侧修正明细后重新导入新目标。

M2-04 门禁不变：有 AP/AR 控制科目而 run 无 `opening=done` 时仍判 `blocked`，净额为 0 也一样。导入了期初项后，报告按 P 公式判定贸易子账（见上文“迁移核对”）；贸易报表“GL 核对”也新增“期初”列。**迁移尚未完成**：之后是 M2-05 → M2-06，演练与切换另需用户授权。

## 只读旧账报表

导航“只读报表 → 试算平衡表”及 `/api/v1/legacy/*` 读取已验证的旧快照。未配置快照时（上下文接口返回有效 503）页面显示中性的“未配置或暂不可用”，说明不影响当前账套，并链接到“总账报表”，可显式“重新加载快照”；网络、无效响应与实际报表读取失败仍显示错误。运行状态页只请求 health。当前账套的报表请用“总账报表”。

![旧快照未配置](../demo/v0.2.0/screenshots/03-trial-unconfigured.png)


