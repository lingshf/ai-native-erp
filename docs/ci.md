# CI 说明

四个 GitHub Actions 工作流各管一层。本页只解释它们是什么、何时跑、失败时看哪里；**确切的步骤、命令和数字以 [`.github/workflows`](../.github/workflows/) 与 [`scripts/ci.ts`](../scripts/ci.ts) 为准**，本页不复制它们。事实核对于 `main` 的 `04b576baf9f03c13055daf98be6b0831cf086648`（逐文件最后提交见 [docs/README](README.md) 矩阵），未经 QA 演练。

## 分层与触发

| 层 | 工作流 | 触发 | 作业超时 | 作用 |
| --- | --- | --- | --- | --- |
| PR CI | [`ci.yml`](../.github/workflows/ci.yml)（作业 `verify`） | 每个 pull request | 10 分钟 | 合并前的门禁：静态检查 + 受影响测试 + 构建 |
| Full | [`full.yml`](../.github/workflows/full.yml) | push 到 `main`；每天 03:17 UTC | 每个分片 8 分钟 | 全部测试（含 `*.slow.test.*` 与真实浏览器），分片并行 |
| Bench | [`bench.yml`](../.github/workflows/bench.yml) | 每天 03:47 UTC；手动 | `bench` 10 分钟（手动带基线或扫描时 45）、`trade-http` 20、`migration-rehearsal` 30 | 性能与迁移预演证据，不是合并门禁 |
| Legacy snapshot Windows | [`legacy-snapshot-windows.yml`](../.github/workflows/legacy-snapshot-windows.yml) | 每天 03:37 UTC；手动 | 10 分钟 | 在 Windows 上验证旧账快照的独占句柄、合成基准和预演 |

并发取消：PR CI 按 PR 号分组；Full 按 ref、lane、分片分组；Bench 三个作业各按候选 ref 分组，同组的新运行取消旧运行。Windows 层没有并发取消设置，也没有 24 小时门禁。

## PR CI（`verify`）

按顺序执行，前一步失败则停（最后的耗时摘要无论成败都执行）：

1. 检查 lockfile 只指向公共 npm registry（`scripts/check-lockfile-registry.mjs`），再 `npm ci`；
2. 烟测真实 Chrome 通道；
3. `npm run check`（Biome）、`npm run typecheck`、slot 预检（`scripts/slot/preflight.mjs`）、`npm run check:boundaries`；
4. **分片权重守卫**（`scripts/ci.ts weights-check`）：每个被收集的测试文件在 `scripts/test-shard-weights.json` 里必须有正的权重，且没有多余权重项。该步无条件执行；
5. **选测试**（`scripts/ci.ts plan`）：默认只跑相对 PR base 的受影响测试；改动了 `scripts/ci.ts`、`scripts/test-shard-weights.json`、`full.yml`、`package.json`、`package-lock.json`、`vitest.config.ts` 或任何 `tsconfig*` 时回退为全部非慢测试；
6. 受影响测试（`npm run test:ci`）；作业设了 `CI_TEST_LAYER=pr`，由 `vitest.config.ts` 排除慢测试（`*.slow.test.ts(x)`）；
7. `npm run build`（web 构建）；
8. 测试耗时摘要（始终执行，列出最慢的测试）。

因此 PR 绿灯**不代表**慢测试和真实浏览器测试通过，那些只在 Full 层跑。

## Full

- 矩阵为 `lane`（`unit`、`browser`）× 6 个分片，共 12 个作业，`fail-fast: false`，一个分片失败不会取消其他分片。
- `unit` 跑 `!infra-browser` 项目；`browser` 跑 `infra-browser`，单 worker，用 runner 自带 Chrome。
- 分片按 `scripts/test-shard-weights.json` 的权重切分（见 [`vitest.config.ts`](../vitest.config.ts)），不是按路径哈希；新增测试文件须登记权重，否则 PR CI 的权重守卫会失败。重新生成用 `node scripts/ci.ts weights REPORT.json...`（用法见 `vitest.config.ts` 的注释）。
- 附带检查只在指定分片跑：Biome 与类型检查在 `unit` 分片 1，导入边界与 web 构建在 `unit` 分片 2。
- **24 小时门禁**（`scripts/ci.ts gate`）：定时触发时，若最近 24 小时没有新的 `main` 提交，则跳过安装、测试、构建与基准；push 和手动触发不受限制。被跳过的作业仍显示绿色，所以看到绿灯时要看摘要里是 “Run requested.” 还是 “Skipped”。
- 上传的 artifact 都以门禁放行为前提（被跳过的运行什么也不传），保留 14 天：每个分片无论成败都上传 `vitest-shard-*`（含 `vitest.json`、`vitest.log`、`gui-phases.json`，缺的文件忽略）；只有当分片失败时才再上传 `trade-gui-shard-*`（`artifacts/ci/trade-e2e/` 下的截图与 trace，没有就忽略）。该规则对 unit 与 browser 分片相同，只是 GUI 测试集中在 browser。PR CI 不上传 artifact。

## Bench

三个并行作业，均经同样的 24 小时门禁：

- `bench`：百万行 SQLite 账本基准，artifact `sqlite-ledger-*`。手动运行可填 `ref`（候选分支、tag 或 SHA，留空用所选工作流的 ref，三个作业都用它做 checkout）、`baseline`（完整 40 位 SHA，先跑基线再跑候选做相对对比）或 `sweep`（扫描读池大小）；证据口径与预算见 [docs/performance](performance/) 与 [README 性能证据](../README.md#性能证据)。
- `trade-http`：生产 HTTP 路径的贸易基准，三次等载重复，artifact `trade-http-*`。
- `migration-rehearsal`：虚构 100 万 GL 行与 10 万期初未结项的迁移链预演（dry-run、导入、确认、备份并校验），预算写在 `scripts/bench-migration-rehearsal.mjs`，artifact `migration-rehearsal-*`。

Bench 不进入 PR CI；它的数字用于发布说明和性能记录，不能替代 Full。

## 失败时怎么办

| 现象 | 先看 | 常见处理 |
| --- | --- | --- |
| PR CI 的 Biome / typecheck / boundaries 失败 | 失败步骤日志 | 本地跑同名 `npm run check`、`npm run typecheck`、`npm run check:boundaries` |
| “Shard weight guard” 失败 | 日志列出缺失、无效或多余的文件 | 新增或删除了测试文件而没改 `scripts/test-shard-weights.json`；按 `vitest.config.ts` 注释重新生成 |
| 受影响测试失败 | 步骤日志与作业摘要里的最慢测试 | 本地没有 PR 环境，也没有 `plan` 步骤，不会自动回退全量：用 `npm run test:changed`（相对 `origin/main`，排除慢测试，先 `git fetch`），或 `npm test` 跑全部；改了上面第 5 条列出的文件时应自行跑全部非慢测试 |
| Full 某个分片失败 | 该分片的 `vitest-shard-*` artifact；浏览器分片再看 `trade-gui-shard-*` 里的 trace 与截图 | 本地用 `npm run test:ci -- --project=infra-browser <文件>` 只跑该文件（Full 的命令还带 `--maxWorkers=1` 与 `--shard`）；浏览器测试本机需要 Chrome，或按 README 设 `ERP_E2E_BROWSER_CHANNEL` |
| 浏览器分片报 “Missing browser startup phase timings” | `vitest.log` | 测试已通过但启动阶段日志缺失，属 CI 工具问题，找发布/开发负责人 |
| 夜间运行绿灯但没跑测试 | 作业摘要的 24-hour gate | 正常跳过；需要时手动触发（Bench 支持手动；Full 用 push 或等有新提交） |
| Bench 出现 MISS | `sqlite-ledger-*` artifact | 不缩库、不删异常样本掩盖；按 README 性能证据一节处理 |

不要靠反复重跑把间歇失败变绿：先看日志判断是测试问题还是环境问题（Chrome 冷启动慢是已知来源，Full 有磁盘预热步骤，只做尽力而为）。工作流本身的修改属于 Delivery/Release 的范围，须经评审。

## 本页不覆盖

- 各测试的具体断言：见 `packages/*/test` 与 [design/test-cases.md](../design/test-cases.md)（后者另有 stale 标记，见 [docs/README](README.md)）。
- 合并、打 tag、发布的授权与步骤：见 [发布流程](release/README.md)。
