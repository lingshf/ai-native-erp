# M0-R1 控制科目受控过账 + 单据日期/税日期

- 里程碑：M0 评审后续（M0-R 生成）　依赖：M0-R　建议分支：`controlled-posting-dates`
- **阻塞 M1：是，M1-03 依赖本任务**（M1-01、M1-02 可以并行开工）

## 背景

M0 评审（[design/reviews/M0.md](../reviews/M0.md) §3）发现，控制科目（`purpose='control'`，AP/AR/TAX…）在新架构中只有“拒绝”这一条路：手工/AI/导入凭证在 `core/src/domain/journals.ts:250` 被拒绝，业务事件在 `core/src/application/business-events.ts:301` 只接受 `general` 科目。旧 Enterprise 账的单据日期/税日期分开（documentDate/taxDate）也没有迁移（M0-15 遗留）。M1 需要：

- FR-C02 / FR-T03：控制科目拒绝手工、AI 和导入凭证，只允许已登记的业务适配器过账；
- FR-T02：税率按 taxDate 选取，记账按 accountingDate；FR-T05：付款条件按单据日期计算。

## 范围

- 凭证过账管道（M0-10 的预览/确认/幂等）增加**一个**受控入口：调用方是已登记的模块适配器时，可以过账到 `controlModule` 与其模块一致的控制科目。适配器登记用代码里的静态表（模块 → 允许的 `controlModule`），本任务不做配置化。其余入口仍然拒绝控制科目，错误码不变。
- 凭证头增加 `documentDate`、`taxDate`（可选，缺省等于 `accountingDate`），带迁移脚本、契约、API 和凭证详情显示。期间校验仍然只看 `accountingDate`。
- 不做：模块期间准入（已在 M1-06 范围内）；具体的贸易适配器（M1-03 实现，并登记到上面的静态表）。

## 验收标准

- 测试覆盖：
  - 未登记的调用方、手工、AI 候选、导入过账到控制科目都被拒绝；
  - 登记的适配器只能过账到自己模块的控制科目，过账到其他模块的控制科目被拒绝；
  - 拒绝时零写入。
- `documentDate`/`taxDate` 测试覆盖：缺省值、持久化、契约往返、在跨期日期下期间仍按 `accountingDate` 校验。
- 现有凭证和报表测试不需要修改断言。没有第二条过账管道（复用 M0-10）。
- CI 绿。

## 性能考虑

适配器校验在内存中查静态表，不增加查询。新增两列不加索引（M1 需要按日期查时再加）。预览/确认 p95 预算不变。

## 测试要求

在 core domain/application 层测试规则；HTTP 层只加一个代表用例。
