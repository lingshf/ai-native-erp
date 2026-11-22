# SLOT-01 独占时段进程采样器入库

- Sprint：S11（[计划](S11.md)）　依赖：S11 定稿 PR 合并（规则表先进[路线图 §5](../roadmap.md#5-团队流程)“进程采样规则”R1）　建议分支：`slot-01-sampler-in-repo`
- 负责人：开发
- 冲突域（逐个列文件）：
  - 开发工具：新目录 `scripts/slot/`（与现有文件不重叠；先例 `scripts/e2e-01-experiment.ps1`）；
  - 共享单文件：无。清单检查与自测**不进 Vitest、不进 CI**，因此不改 `scripts/test-shard-weights.json`、`vitest.config.ts` 与 workflow；
  - **不涉及**：路线图 §5 规则表（规则改动须先有决策编号，由设计改路线图）；任何产品代码、测试、CSS。
- 类型：开发工具
- 优先级：P2
- 来源：[S10 回顾](../reviews/S10-retro.md#行动项汇总d338-认可)行动 8（D338 认可）。

## 现状（main `ad70189`）

- 采样器只在私有 gist（`lingshf/c437f3d99887d0214ebd05ae9d741cc5`，已在 [#188](https://github.com/lingshf/ai-native-erp/pull/188) 正文中引用）：`kit__` 为 D316 版 kit，含 `slot-run.ps1`、`procs.ps1` 与 `kit-sha256.txt`。
- 自测 27 项，全部为 PowerShell；部分自测会建真实进程，或在 `%LOCALAPPDATA%\Programs\gate01-selftest-*` 下建文件，只能在 Windows 运行。
- 排除出口在 `procs.ps1` 中没有规则编号；launcher 分支（`procs.ps1:171–172`，D320 追认）在 D316 版 kit 的规则说明中缺失，是这次入库要堵的口子。
- 仓库没有 `scripts/slot/`（检索：`git ls-files scripts/slot`，无结果）。

## 范围

| 内容 | 要求 |
| --- | --- |
| 采样器 | 把 `slot-run.ps1`、`procs.ps1` 移入 `scripts/slot/`；行为与 D316 kit + D320 launcher 分支一致（不新增、不放宽任何排除） |
| 规则编号 | 每个候选、归属与排除出口在代码中标注路线图 §5 的编号（SR-C1–C3、SR-X1–X5）；每条排除日志行带编号，例如 `excluded pid=… rule=SR-X4` |
| 自测 | `scripts/slot/selftest.ps1`：原有 27 项全部迁入；每条 SR 规则至少 1 个正例（应命中）与 1 个反例（不应命中）；Windows 手动运行，输出逐项 PASS / FAIL 与汇总 |
| 清单检查 | `scripts/slot/check-manifest.*`（PowerShell 或 Node，任意 OS 可运行，只做静态解析）：枚举代码中的全部排除出口及其编号，与路线图 §5 表中的编号对照；出现表外编号、出口缺编号、表内编号在代码中没有出口，三种情况都以非零退出 |
| 版本 | 代码中写明所实现的规则版本（`R1`）；与路线图 §5 版本不一致时清单检查失败 |
| README | `scripts/slot/README.md`：运行方法、Windows 限制、日志写到哪里（仓库外的临时目录）、规则变更流程（先有决策编号与路线图改动，再改代码） |

## 入口参数与异常

| 参数 | 缺省 | 无效 | 处理 |
| --- | --- | --- | --- |
| `check-manifest` 的路线图路径 | `design/roadmap.md` | 文件不存在或找不到规则表 | 非零退出，输出原因；不默认通过 |
| `selftest.ps1` 运行环境 | Windows PowerShell 5.1 或 7 | 非 Windows | 立即以非零退出并说明“只能在 Windows 运行” |

## 不在范围

- 修改或新增采样规则（须另有决策编号）。
- 把自测接入 CI 或 Vitest。
- 提交任何运行日志或时段现场数据。

## 验收标准

1. 每个排除出口的日志行带 SR 编号；PR 中给出一次真实采样的日志摘录（日志不入库）。
2. 每条 SR 规则至少 1 个正例与 1 个反例；原有 27 项自测全部迁入并通过；PR 附 `selftest.ps1` 的完整输出与运行时的 head SHA。
3. 清单检查在本分支通过（退出码 0）。
4. 反向对照：清单检查跑在 D316 版 kit（按 `kit-sha256.txt` 核对过的副本，不入库）上，报告 launcher 分支缺编号并以非零退出；另构造一个表外编号（例如 `SR-X9`）的临时改动，同样以非零退出。PR 贴出两次输出与退出码。
5. `git diff --stat origin/main` 只含 `scripts/slot/` 下的文件；`git ls-files scripts/slot` 不含 `*.log` 或采样输出。
6. 采样一次的额外耗时（与 gist 版对照，同一机器、各 5 次取中位数）不超过 10 s。
7. **用户可见变化**：无（开发工具）。

## 性能考虑

- 时段内采样是关键路径的一部分：验收 6 限定每次采样的额外耗时。
- 无运行时代码与构建产物变化，PG-05 不适用。

## 证据要求

- PR 正文：自测完整输出、清单检查正反输出、耗时表、head SHA。
- 不需要真实 Chrome（采样器自测会建真实进程，但不驱动浏览器页面）。

## 设计自查（路线图 §5 设计文档自查 1–10）

- [x] 1 事实断言有来源（否定性断言附检索命令）
- [x] 2 不涉及进行中的 PR
- [x] 3 依赖列与泳道 B 线一致
- [x] 4 不新增 CSS
- [x] 5 覆盖类断言给出 `file:line`
- [x] 6 无共享单文件
- [x] 7 入口参数已列表
- [x] 8 改动条款已通读上下文
- [x] 9 不涉及导航与历史
- [x] 10 无几何类验收
