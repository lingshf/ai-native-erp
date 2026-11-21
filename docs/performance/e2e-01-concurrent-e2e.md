# E2E-01 并发真实 Chrome E2E 干扰调查

任务：[E2E-01](../../design/tasks/E2E-01-concurrent-e2e-interference.md)。本文只记录核对与实验，不改任何测试行为、超时或重试（D11）。

## 1. 静态核对

范围：`packages/infra/test/http/trade-gui-*.slow.test.ts`（5 个文件，都只调用 `tradeGuiScenario` / `tradeGuiSmoke`）、`migration-gui.slow.test.ts`，及其支持代码 `test/support/trade-gui-scenario.ts`、`test/support/legacy-fixture.mjs`。Playwright 行号对应锁定版本 `playwright-core` 1.58.2，Vite 行号对应 8.3.6（均为 `npm ci` 后的 `node_modules`）。

“A / B”指两个 worktree 在同一用户、同一 `%TEMP%` 下同时运行 `vitest run trade-gui- migration-gui.slow`，且各自的 `ERP_E2E_ARTIFACTS` 不同或未设置。

| # | 资源 | 取值 | 来源（`path:line`） | A / B 同时运行能否相撞 |
| --- | --- | --- | --- | --- |
| 1 | trade-gui API 端口 | `ERP_PORT: "0"`，`ERP_HOST: "127.0.0.1"`，由操作系统分配临时端口 | `packages/infra/test/support/trade-gui-scenario.ts:621-622`；`packages/infra/src/http/index.ts:183-186` | 否：端口 0 由内核分配，不会重复 |
| 2 | migration-gui API 端口 | `ERP_PORT: "0"`，未设 `ERP_HOST` 时默认 `127.0.0.1` | `packages/infra/test/http/migration-gui.slow.test.ts:61`；`packages/infra/src/index.ts:27-28` | 否，同 1 |
| 3 | 固定端口 4180 / 5173 | 4180 只是未传 `ERP_PORT` 时的默认值；5173 / `strictPort` 只用于 Vite dev server，测试只调用 `build()`，不启动 dev server | `packages/infra/src/index.ts:28`；`packages/web/vite.config.ts:8-10`；`trade-gui-scenario.ts:541-546`；`migration-gui.slow.test.ts:21-26` | 否：两组测试都不监听固定端口 |
| 4 | Chrome 调试通道 | 未传 `cdpPort`，Playwright 用 `--remote-debugging-pipe`（管道，不占端口） | `trade-gui-scenario.ts:525-526`；`migration-gui.slow.test.ts:29-30`；`node_modules/playwright-core/lib/server/chromium/chromium.js:260-263` | 否 |
| 5 | Chrome 用户目录 | 未传 `userDataDir`，每次 launch `mkdtemp(%TEMP%/playwright_chromiumdev_profile-XXXXXX)` | `node_modules/playwright-core/lib/server/browserType.js:164` | 否：随机后缀，每个浏览器独立 profile，Chrome 的进程单例按 profile 区分 |
| 6 | Playwright 浏览器临时目录 | 每次 launch `mkdtemp(%TEMP%/playwright-artifacts-XXXXXX)`；tracing 未给 `tracesDir` 时 `mkdtemp(%TEMP%/playwright-tracing-XXXXXX)` | `browserType.js:157`；`node_modules/playwright-core/lib/server/localUtils.js:185`；`trade-gui-scenario.ts:659` | 否：随机后缀 |
| 7 | Playwright 浏览器注册表锁 | `%LOCALAPPDATA%\ms-playwright\__dirlock` 只在 `install()` 中加锁；测试用 `channel: chrome`（系统 Chrome），launch 不加锁 | `node_modules/playwright-core/lib/server/registry/index.js:1007-1015` | 否：运行时不触及 |
| 8 | trade-gui 临时目录（Vite 产物 + 账套） | `mkdtemp(%TEMP%/erp-trade-gui-XXXXXX)`；`web/` 与 `<name>.sqlite`、`<name>-replay.sqlite` 都在其中 | `trade-gui-scenario.ts:520-521`、`:545`、`:573`、`:712`、`:721` | 否：随机后缀；同名 `<name>.sqlite` 只出现在各自的随机目录里 |
| 9 | migration-gui 临时目录 | `mkdtemp(%TEMP%/erp-migration-gui-XXXXXX)`，Vite 产物在 `web/` | `migration-gui.slow.test.ts:18`、`:25` | 否 |
| 10 | 迁移测试的旧账套与 `target.sqlite` | `resolve(".legacy-fixture-<randomUUID>")`，相对进程 cwd（即各自 worktree 根）；`target.sqlite` 在该目录下；用例结束 `rmSync` | `packages/infra/test/support/legacy-fixture.mjs:166`、`:175`；`migration-gui.slow.test.ts:46` | 否：目录在各自 worktree 内且带 UUID |
| 11 | Vite 构建缓存 / 配置临时文件 | 配置打包的 `.vite-temp` 落在离 `packages/web` 最近的 `node_modules`；默认 `cacheDir` 也在 worktree 内。各 worktree 的 `node_modules` 实测为普通目录，不是链接 | `node_modules/vite/dist/node/chunks/node.js:38134` | 否：每个 worktree 一份 |
| 12 | `ERP_E2E_ARTIFACTS`（trade-gui） | 未设时 `<worktree>/artifacts/ci/trade-e2e`（按模块位置解析） | `trade-gui-scenario.ts:20-21`、`:522` | 未设：否（各 worktree 一份）。**两边设成同一个绝对路径：是**，见下 |
| 13 | `ERP_E2E_ARTIFACTS`（migration-gui） | 未设时 `artifacts\ci\migration-e2e`，相对进程 cwd | `migration-gui.slow.test.ts:15` | 同 12 |
| 14 | 写入 artifacts 的文件 | 固定文件名：`<lang>-<theme>-part<n>-reconciliation.png`、`<name>-last.png`（失败时）、`<name>-trace.zip`（失败时）、`migration-<lang>-<theme>.png`；`ERP_E2E_DIAG=1` 时追加 `flake02-<suite>.jsonl`（每行带 pid） | `trade-gui-scenario.ts:678-679`、`:1186-1187`、`:29-31`；`migration-gui.slow.test.ts:100-101` | 同一目录时：后写的截图 / trace 覆盖先写的，JSONL 两个进程交错追加。只影响证据文件，不影响断言 |
| 15 | Vitest worker 数 | `pool: "forks"`，`maxWorkers: availableParallelism()`（本机 16） | `vitest.config.ts:105-106` | 不是共享文件或端口；两个运行各开最多 16 个 worker，6 个浏览器文件各起 1 个 Chrome，会**争用 CPU / 内存**。这是负载，不是本节意义上的相撞 |
| 16 | 机器级共享 | 系统 Chrome 可执行文件（只读）、`%TEMP%` 磁盘、loopback 临时端口池 | 推断，无单独代码位置 | 未发现会相撞的写入；只有容量争用 |

**核对结论（只针对代码中的共享资源）**：

- 未发现两个 worktree 用默认配置同时运行时会相撞的端口、临时目录、账套文件或 Chrome 用户目录。
- 唯一的相撞条件是第 12–14 项：两边把 `ERP_E2E_ARTIFACTS` 设成**同一个绝对路径**。后果是截图、trace 被覆盖，诊断 JSONL 交错，只影响证据，不影响测试结果。CI（`.github/workflows/full.yml:32`）用相对路径，所以每个 checkout 各一份。
- 这一项是否需要立项（例如在文件名中加 pid），由设计角色决定；本任务不修。
- 第 15 项的 CPU 争用由下面的实验观察。

## 2. 受控实验（预定次数，不中途追加）

- **N = 5**。
  - 串行：worktree A 连续跑 5 次。
  - 并发：A 与 B 同时各跑 5 次，共 10 次。每轮两边同时启动，两边都结束后才开始下一轮。
  - 合计 15 份运行日志。任务验收第 2 条的“2N 次”按“串行 N 次 + 并发 N 轮”计。
- **精确 head**：两个 worktree 都在本 PR 的同一 head 上。B 用 `git worktree add --detach <B> <head>` 建立，并单独 `npm ci`。
- **命令**（每次相同，与 [tasks/README.md](../../design/tasks/README.md) 的 E2E 命令一致）：`node node_modules/vitest/vitest.mjs run trade-gui- migration-gui.slow --reporter=verbose --reporter=json`。
  - 环境：`ERP_E2E_BROWSER_CHANNEL=chrome`。
  - `ERP_E2E_ARTIFACTS` 每次运行不同。
  - `CI_TEST_LAYER`、`ERP_E2E_DIAG`、`TEST_FILE_ORDER` 均清除，走默认路径。
- **采集**：由 [`scripts/e2e-01-experiment.ps1`](../../scripts/e2e-01-experiment.ps1) 完成：
  - 首尾两个 worktree 各留独立的 `rev-parse` 与 `status --porcelain --untracked-files=all` 文件；
  - 每轮开跑前间隔 10 s 检查两次外部进程（D118）；
  - 运行中每 10 s 采样一次总 CPU，以及每个浏览器 / node 进程的 PID、父进程、属主、类别、CPU 秒数和命令行；
  - 每次运行用 `Tee-Object` 保存 verbose 输出，另存 Vitest JSON（用于提取各文件 Duration 和失败断言）；
  - 最后生成 `summary.md` 与 `SHA256SUMS.txt`。
- **停止条件**（D150），满足任一条即停止，保留已有日志：
  - 出现外部自动化浏览器（Playwright / headless profile）；
  - 出现外部桌面浏览器（除非协调者同意并用 `-AllowDesktopChrome` 披露）；
  - 在外部 node 负载下出现失败。
- **执行时段**：需要整机独占，向协调者申请后执行。

## 3. 结果

待整机时段执行后填写，全部日志放入 gist。

## 4. 结论

待实验完成后，从任务文件规定的三种表述中选一种填写。
