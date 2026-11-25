# SEC-02：AI 适配器交给 SDK 工厂的环境变量改为显式白名单（D568）

状态见[任务总表·安全候选](README.md#安全候选d563)。来源：SEC-01 非作者安全评审 [#364 评论 7148351359](https://github.com/lingshf/ai-native-erp/issues/364#issuecomment-7148351359)（基线 `25c0855f0079cdcaceb65cdeb15355acc1a8799d`），Product/Design 已接受（D568）。

## 背景

`packages/infra/src/copilot-ai-client.ts:4–21`（@ `25c0855`）只排除 `AI_API_KEY`、`AI_BASE_URL`、`COPILOT_CLI_PATH`，其余已设置的变量（如 `ERP_SQLITE_FILE`、无关凭据）都进入 SDK 工厂的 `env`。评审等级 MEDIUM；下游是否泄露**未证实**。本任务只最小化“适配器 → SDK 工厂”的 `env`，不宣称子进程环境已隔离，也不宣称变量曾发往 GitHub。

## 产品决定（D568）

1. **接受**评审结论，立项实施，P2。
2. **白名单**：工厂 `env` 始终是显式对象。只有用户明确设置了 `COPILOT_GITHUB_TOKEN` 时才放入这一项；未设置时传空对象 `{}`。
3. **不默认转交**：`GH_TOKEN`、`GITHUB_TOKEN` 两个兼容别名；`PATH`、`HOME`、`TMPDIR`、`XDG_CONFIG_HOME`、`GH_CONFIG_DIR`、`TEMP`、`USERPROFILE`、`WINDIR`、`APPDATA` 等平台运行键；代理、自定义 CA 及其他变量；`ERP_SQLITE_FILE` 等 ERP 配置。理由：仓库文档从未承诺过这些别名或键（`README.md`、`docs/` 中无 `GH_TOKEN` / `GITHUB_TOKEN` / `COPILOT_GITHUB_TOKEN`），本机单用户，缺省最小。
4. **不在本任务中选** SDK 显式 `gitHubToken` 参数这一备选。理由：改动面更大，且与现行 `env` 认证的兼容性同样未验证。若下方探针表明 `env` 白名单不可行，退回 Product/Design 重新选择。
5. **传输**：若当前只支持 stdio，实施中显式固定传输方式，不依赖宿主的 `COPILOT_SDK_DEFAULT_CONNECTION`，也不靠 `env` 过滤代替。
6. 这是**行为变化**：以前靠 `GH_TOKEN` / `GITHUB_TOKEN` 或其他继承变量让 AI 可用的环境，改后可能变为“AI 不可用”。须在 `CHANGELOG.md` 与 `docs/ai-assistant.md` 配置一节写明，措辞由 Delivery/Release 核对。

## 前置与冲突域

- **须在 BUG-02a–d 全部合并之后开始**（同一组文件，串行）。
- 冲突域：`packages/infra/src/copilot-ai-client.ts` 及同目录 `copilot-ai*.ts`、`packages/infra/test/copilot-ai.test.ts`、`docs/ai-assistant.md` 配置一节、`CHANGELOG.md`。
- 不加迁移；不需要浏览器时段。

## 验收标准

- **R1 白名单**：两种场景下，假工厂收到的 `env` 都是显式对象，键与值精确相等：配置了虚构令牌时为 `{ COPILOT_GITHUB_TOKEN: <虚构值> }`；未配置时为 `{}`。
- **R2 排除**：同一测试中注入以下变量，均不得出现：三项旧排除键的混合大小写形式、`GH_TOKEN`、`GITHUB_TOKEN`、`ERP_SQLITE_FILE`、一个虚构的无关凭据、`PATH`。
- **R3 大小写**：覆盖 Windows 大小写不敏感（如 `copilot_github_token` 的处理须写明并测试）与 Unix 区分大小写的策略；PR 写明所选规则。
- **R4 传输**：若适用第 5 条，测试断言传输方式被显式固定。
- **R5 不越界**：CI 不读取真实凭据、不调用真实 Copilot；PR 不把假工厂断言写成子进程隔离的证明。
- **R6 平台探针**：用独立的合成进程探针，在 Windows 与 Linux 各跑一次，报告固定版本 SDK（package-lock 中的 1.0.31）在白名单下能否启动、是否需要某个运行键。若需要额外的键，**不自行加入**，附证据退回 Product/Design 决定。
- **R7 文档**：`CHANGELOG.md` 与 `docs/ai-assistant.md` 写明新行为与迁移方法（改设 `COPILOT_GITHUB_TOKEN`）；KGAP-04 引用的 SEC-01 结论与之一致。
- **R8 门禁**：精确 head 非作者评审 APPROVED、QA PASS（含 R6 证据），合并后 main Full 绿。

## 不在范围

SDK 显式 `gitHubToken` 参数；代理 / CA 支持；子进程环境的端到端隔离证明；其他 AI 行为变化（BUG-02 归 BUG-02 任务）。
