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
6. 这是**行为变化**：以前靠 `GH_TOKEN` / `GITHUB_TOKEN` 或其他继承变量让 AI 可用的环境，改后可能变为“AI 不可用”。须在 `CHANGELOG.md` 与 `docs/ai-assistant.md` 写明，措辞由 Delivery/Release 核对。迁移说明只能写“可改设 `COPILOT_GITHUB_TOKEN`”，**不得**承诺这样一定能恢复原有的全部认证方式（存量登录、`gh` 回退等未验证）。

## 前置与冲突域

- **须在 BUG-02a–d 全部合并之后开始**（同一组文件，串行）。
- 冲突域：`packages/infra/src/copilot-ai-client.ts` 及同目录 `copilot-ai*.ts`、`packages/infra/test/copilot-ai.test.ts`、`docs/ai-assistant.md` §3 / §5 / §7、`design/ai-assistant-facts.md` F22 与 §6.3、`CHANGELOG.md`。
- 不加迁移；不需要浏览器时段。

## 验收标准

- **R1 白名单**：两种场景下，假工厂收到的 `env` 都是显式对象，键与值精确相等：配置了虚构令牌时为 `{ COPILOT_GITHUB_TOKEN: <虚构值> }`；未配置时为 `{}`。
- **R2 排除**：同一测试中注入以下变量，均不得出现：三项旧排除键的混合大小写形式、`GH_TOKEN`、`GITHUB_TOKEN`、`ERP_SQLITE_FILE`、一个虚构的无关凭据、`PATH`。
- **R3 大小写**：覆盖 Windows 大小写不敏感（如 `copilot_github_token` 的处理须写明并测试）与 Unix 区分大小写的策略；PR 写明所选规则。
- **R4 传输**：若适用第 5 条，测试断言传输方式被显式固定。
- **R5 不越界**：CI 不读取真实凭据、不调用真实 Copilot；PR 不把假工厂断言写成子进程隔离的证明。
- **R6 运行证据**：两类证据分开记录，不得互相替代。固定版本均为 package-lock 中的 SDK 1.0.31；Windows 与 Linux 各一次；全程不用真实凭据、不联网。
  - **R6a 替身启动路径**（门禁）。目标：验证“适配器 → SDK 启动 → 子进程”的环境传递路径。做法：让 SDK 启动一个替身可执行文件（只记录收到的环境键名后退出），不启动原生 CLI。通过标准：替身收到的键集合等于白名单，或只多出 PR 中逐项列明、并说明来源的平台补入项（如 Windows 上 libuv 补入的 `SYSTEMROOT`）；不得出现 R2 中的任何键。它**不能**证明原生 CLI 需要哪些键，也**不能**证明认证兼容。
  - **R6b 原生 CLI 离线启动**（门禁）。目标：验证固定版本自带的原生 CLI 在白名单环境下能被 SDK 启动并完成连接。通过标准：在无凭据、无网络的条件下，SDK 启动原生 CLI 并完成一次不需要认证的本地握手（例如 `ping` / 状态查询）；未认证应表现为“未登录”一类状态，而不是启动失败。实施者须在 PR 写明所用的具体步骤和输出。若找不到这样的离线步骤，或原生 CLI 启动失败并显示需要额外的键：标为阻塞，附证据交回 Product/Design 决定，**不自行加键**，也不用 R6a 替代。
  - **仍未验证**（不作门禁，PR 与文档须照此口径写）：真实认证是否兼容（令牌、存量登录、`gh` 回退）；代理、自定义 CA；SDK 子进程环境的端到端隔离。
- **R7 文档**：区分三个时点，不得把旧黑名单或评审前状态写成现状。
  - **历史基线**（SEC-02 前）：只去掉三个键，其余变量交给 SDK 工厂。可保留为历史说明，须注明“SEC-02 之前”。
  - **SEC-01 已验收**（本 PR 起、SEC-02 合并前）：`design/ai-assistant-facts.md` §6.3 由事实所有者（Product/Design）在本 PR 同步；`docs/ai-assistant.md` §3（第 40 行附近）与 §7 “SEC-01 未评审”一句由 KGAP-04 后半项（Knowledge Lead）同步，并由事实所有者复核。F22 在此期间仍描述现行行为，不改。
  - **SEC-02 生效后**：SEC-02 的 PR 本身须同步 F22（新代码位置与固定 SHA）、§6.3（关闭该项，只留 R6 “仍未验证”各项）、`docs/ai-assistant.md` §3 / §5 / §7 与 `CHANGELOG.md`，写明新行为与迁移方法（措辞按决定第 6 条）。合并后 `git grep` 不再有把三键黑名单写成现状的句子。
- **R8 门禁**：精确 head 非作者评审 APPROVED、QA PASS（含 R6a、R6b 证据），合并后 main Full 绿。

## 不在范围

SDK 显式 `gitHubToken` 参数；代理 / CA 支持；子进程环境的端到端隔离证明；其他 AI 行为变化（BUG-02 归 BUG-02 任务）。
