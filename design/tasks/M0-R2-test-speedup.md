# M0-R2 测试提速与精简

- 里程碑：M0 评审后续　依赖：M0-R　建议分支：`test-speedup`
- **阻塞 M1：否**

## 背景

M0 测试审计（[design/reviews/M0.md](../reviews/M0.md) §5）：Linux 上 Vitest 共跑 43.2s，其中约 37s 花在 3 个用例上；`*.slow.test.*` 分层规则存在，但没有任何文件使用；还有几处重复和低价值用例。

## 范围

1. 存储事务超时改为可注入（生产默认值不变），`infra/test/support/storage-contract.mjs:466,498` 的两个 hung 用例改用约 200ms 的超时。
2. `legacy-launcher` 的参数拒绝用例（17.1s）合并成少量代表性子进程用例，其余变体改成纯函数参数解析测试；剩下必须启动子进程的用例放进 `*.slow.test.ts`，只在 Full 跑。
3. 删除 `core/test/application/runtime.test.ts` 的纯委托测试。
4. 去重：报表合计只在 application 层断言（`reports.test.ts:88`），HTTP 用例（`:314`）只测契约和状态码；旧账输入拒绝的规则只在 `legacy-teaching` 测，`legacy-cli` 和 `legacy-http` 各留一个代表用例。
5. `http/api.test.ts` 的 CLI unsafe hosts 改成参数表，只启动一次。

## 验收标准

- Linux main Full 中 Vitest 报告的总时长（Duration，墙钟）≤ 25s（基线 43.22s，main Full 44459418837）。这是整体墙钟目标，以合并后的 main Full 实测为准，不按单个用例耗时相减估算；PR CI 中不再出现超过 5s 的单个用例。
- M0-R2b（D12/D13）：2 vCPU runner 上单 job 下限约 35–40s，经 D13 Full 拆成 2 个分片（`--shard=i/2`），验收口径改为合并后 Linux main Full 每个分片的 Vitest Duration ≤ 25s；PR CI 单例仍 ≤ 5s、总耗时 ≤ 10 分钟。PR 描述记录每分片 Duration 及 Full 总 runner 分钟数（拆分前后）。
- 不删除任何行为的唯一覆盖：每处删除或合并在 PR 描述里写出“由哪个测试覆盖”。
- 生产代码只为可注入超时做最小改动，默认值和行为不变。
- CI 绿。

## 性能考虑

只涉及测试，不影响生产性能。

## 实施约定

- 存储内部工厂 `targetStorage(backend, transactionTimeoutMs)` 提供回调超时注入；公开 SQLite 工厂及生产调用保持默认 10,000ms，迁移超时保持 120,000ms。只有两个 hung contract 用例使用 200ms，其他契约测试仍走生产默认值。
- D11：单元测试不设置亚秒级墙钟性能断言；上述 200ms 是触发超时行为的输入，不是执行耗时门槛。性能门槛仅在 Bench。
- 输入拒绝去重保留 CLI/HTTP 自身的参数语法、序列化和状态映射覆盖；旧账月份/数值范围、游标规则由 `legacy-teaching` 覆盖，不把传输层独有校验当作重复覆盖删除。
- launcher 参数表直接测试 `parsePreviewArguments`；启动顺序、资源生命周期和信号处理仍在 PR 层测试。真实 CLI 的导入惰性、参数/运行配置拒绝、服务启动/退出及错误场景放入 `legacy-launcher.slow.test.ts`，仅 Full 执行。
- 并发初始化契约沿用外部写锁契约的测试内 `PRAGMA busy_timeout=1`，保留真实锁竞争；独立连接配置测试仍断言生产忙超时为 5,000ms。恢复失败矩阵逐项保留锁、备份和存储拒绝访问断言，真实服务启动拒绝只在独立维护锁用例启动一次子进程。
- Vitest 配置：`maxWorkers` 跟随 `availableParallelism()`；全局 `isolate: false`，配合 `unstubGlobals`/`unstubEnvs` 及 web setup 的 restore/cleanup；`packages/infra` 中含顶层 `vi.mock(` 的测试文件在加载配置时自动归入 `infra-isolated` 项目（`isolate: true`），新增 mock 文件无需手工登记。
- 合并前记录 PR CI 与 Full 基线和候选分支完整运行结果；合并后的 main Full 总墙钟由协调者核实，不能用单用例耗时相减替代。
