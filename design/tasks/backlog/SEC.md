# 安全候选（D563）

排在在途 REFAC 之后；先由非作者做安全评审，评审结论出来后再决定是否立实施任务。

| ID | 标题 | 优先级 | 负责 | 依赖 | 冲突域 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| SEC-01 | AI 适配器交给 Copilot SDK 的环境变量（历史基线，SEC-02 之前；现行规则见 SEC-02，D577）：当时只去掉 `AI_API_KEY`、`AI_BASE_URL`、`COPILOT_CLI_PATH`（不分大小写，`packages/infra/src/copilot-ai.ts:72–83` @ `a6037b0`），其余已设置的变量（如 `ERP_SQLITE_FILE`）一并交给 SDK 工厂；SDK 子进程是否原样收到未验证（[事实清单 F22](../../ai-assistant-facts.md)）。评审要回答：是否改为白名单；白名单含哪些键（含 SDK 认证与运行必需的变量）；改后如何在 CI 中用假 SDK 断言传入的键集合 | P2 | 安全评审：Team Leader 指派的非作者评审；验收：Product/Design；实施（若立项）：Developer | 实施须在 REFAC-32 合并后（同一文件） | `packages/infra/src/copilot-ai.ts` 与 `copilot-ai-*.ts`、`packages/infra/test/copilot-ai.test.ts` | done（评审结论 [#364 评论 7148351359](https://github.com/lingshf/ai-native-erp/issues/364#issuecomment-7148351359) 已由 Product/Design 接受，D568；实施见 SEC-02） |
| [SEC-02](../SEC-02-copilot-env-allowlist.md) | SDK 工厂 `env` 改为显式白名单：只在明确设置时放 `COPILOT_GITHUB_TOKEN`，否则为空对象；别名与平台运行键不默认转交；CI 用假工厂断言精确键集合；两平台分别给出替身启动路径与原生 CLI 离线启动证据；同步事实清单与 AI 指南（D568） | P2 | Developer 实施；非作者评审；QA；Product/Design 验收；Delivery/Release 核对 CHANGELOG | BUG-02a–d 全部合并后（同一组文件，串行） | `packages/infra/src/copilot-ai-client.ts` 与 `copilot-ai*.ts`、`packages/infra/test/copilot-ai.test.ts`、`docs/ai-assistant.md` §3 / §5 / §7、`design/ai-assistant-facts.md` F22 与 §6.3、`CHANGELOG.md` | done（#391，`70acd04`；Windows R6a 平台补入项按 D570 列为已知例外；Windows R6b 未验证（D571），R6b 验收只用 Linux 证据） |
