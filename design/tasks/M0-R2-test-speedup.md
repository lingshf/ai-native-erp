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
- M0-R2b（D12/D13）：2 vCPU runner 上单 job 下限约 35–40s，经 D13 Full 拆成分片、D15 定为 3 个分片（`--shard=i/3`），验收口径改为合并后 Linux main Full 每个分片的 Vitest Duration ≤ 25s；PR CI 单例仍 ≤ 5s、总耗时 ≤ 10 分钟。PR 描述记录每分片 Duration 及 Full 总 runner 分钟数（拆分前后）。分片按 `scripts/test-shard-weights.json` 记录的每文件耗时做最长优先贪心分配（自定义 sequencer，未知文件取中位权重，每个文件恰好进入一个分片）；Full 每个分片上传 `vitest.json`，可用 `node scripts/ci.ts weights --root=/home/runner/work/ai-native-erp/ai-native-erp REPORT.json...` 重新生成权重。权重过期只影响均衡，不影响覆盖。测试增多时，若 Full 较大分片 Duration 的中位数超过 22s，就增加分片或重新生成权重，不降低 25s 目标。
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
- Vitest 配置：`maxWorkers` 跟随 `availableParallelism()`；全局 `isolate: false`，配合 `unstubGlobals`/`unstubEnvs` 及 web setup 的 restore/cleanup；`packages/infra` 中含顶层 `vi.mock(` 的测试文件在加载配置时自动归入 `infra-isolated` 项目（`isolate: true`），新增 mock 文件无需手工登记。自定义 sequencer 会让 `--sequence.shuffle.files` 失效，所以用环境变量 `TEST_FILE_ORDER=reverse|shuffle:<seed>` 做顺序诊断：它在每个项目内反转或按种子打乱文件顺序，项目分组不变；不设置时仍按权重排序。验证 isolate:false 下没有顺序依赖时，用 `--maxWorkers=1` 分别跑默认顺序、`reverse` 和至少一个 `shuffle:<seed>`。CLI 子进程测试每个用例只启动一次 CLI，前置状态在进程内用同一套 storage API 准备，以免多次冷启动叠加后超过单例 5s。
- 合并前记录 PR CI 与 Full 基线和候选分支完整运行结果；合并后的 main Full 总墙钟由协调者核实，不能用单用例耗时相减替代。

## R6：Full 分片再平衡

- `fa812a0` 的 Linux Full run `44546224409` 为 13.83 / 17.78 / 28.33s。第 3 片同时包含 `application/trade-documents.test.ts`（JSON 文件耗时 17,316ms，旧权重 5,855ms）和 `storage-admin-cli.test.ts`（11,416ms，旧权重 5,660ms）；新增 `legacy-import-execute` / `legacy-import-upgrade` 分别仅 1,600 / 361ms，不能把超标归因于新增文件本身。
- 初版五片方案已被新基线取代：`336c0cd`（保留 #56 的 `ERP_E2E_BROWSER_CHANNEL=chrome` 和 `google-chrome --version`）的 Full run `44551649788` 为 24.47 / 21.54 / 147.52s。真实 GUI 文件本身 145,369ms，四个语言/主题用例分别为 47.39 / 35.99 / 30.79 / 31.19s，不能仅增加分片解决。
- 将四个 GUI 用例拆成四个 `*.slow.test.ts` 入口，共用同一场景函数；每个入口仍从新数据库到真实 UI 完整执行，不使用跨文件状态、API 替代 GUI 步骤或浏览器交互捷径。键盘定位改为选择固定的较短 Tab/Shift+Tab 方向，复用并检查 DOM handle、验证文档确有焦点，并等待财务操作解锁和真实路由变更，避免加速后被仍忙碌的离页保护拦截。移除每次 Tab 的重复 DOM trace 快照，保留截图、源代码、完整键盘/网络 trace 和所有业务断言。显式先关 BrowserContext 释放 `route.fetch()` 的 Node 请求连接池，再关浏览器/API/SQLite，避免旧长用例偶然掩盖的 15s teardown 超时；未增大超时或加入重试。
- 59 个未拆分文件的权重来自新 Linux Full；四个新入口尚无 Linux 实测，暂取 Windows 单 worker Chrome 文件实测的 0.7 倍（13,386 / 15,156 / 13,673 / 13,658ms）。该系数由同一旧 zh/red 场景的 Linux 47.39s / Windows 68.34s 向上取整而来，不是性能保证；合并后必须用完整 Linux Full 报告替换这四项临时权重。
- 分片改为按项目的 worker 完成时间估算，而不是只平衡文件耗时总和；项目内部按最长优先放入最空 worker，再求各项目完成时间之和，选择加入文件后预计总时长最短的分片，平手按总权重和分片顺序确定。workers 使用 Vitest 实际配置；未指定项目/worker 参数时兼容原单 worker 权重分配。新增回归用例覆盖跨项目串行尾巴。
- 采用六片：双 worker 文件成本模型为 18.65 / 17.60 / 17.33 / 17.25 / 17.25 / 17.87s，最重的 trade-documents 独占一片，四个 GUI 入口分别落在另外四片。新 Linux 基线三片残差为 4.09 / 3.77 / -3.81s，对应 3 / 4 / 3 个项目；按每项目残差中位数 0.94s 校准，预算约 19.59 / 20.43 / 20.16 / 20.07 / 20.07 / 19.75s。五片同模型最大约 22.35s，故不沿用五片。所有数字均为模型，不是候选 Linux 实测；若统一加总残差中位数，最慢片约 22.41s，也说明项目重叠和跨平台比例的不确定性不能忽略。
- 后续刷新应使用同一代码版本的完整 Full 分片报告；不要混入迁移前的较低成本。执行 `node scripts/ci.ts weights --root=/home/runner/work/ai-native-erp/ai-native-erp REPORT_1.json REPORT_2.json REPORT_3.json REPORT_4.json REPORT_5.json REPORT_6.json`，检查全部 63 个文件都有权重，并重新校准浏览器入口和分片预算。未知文件仍自动进入 Full，中位权重回退不影响覆盖。
- 本地双 worker 对照只用来评估编排，不代替 Linux 验收；Full 仍仅在 main push / schedule 触发。合并后跟踪各片实测 Duration、较大分片的多次运行中位数及总 runner 分钟数；若中位数超过 22s，继续调权重或加片，不放宽阈值。
