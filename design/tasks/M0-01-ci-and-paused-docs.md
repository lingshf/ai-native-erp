# M0-01 落地暂停现场文档 + 建立 CI

- 里程碑：M0　依赖：无　建议分支：`ci-and-paused-docs`

## 目标

让此后每个 PR 都有 CI；把暂停现场中仍需保留、但不属于 `design/` 的改动落地。

## 范围

包含：
1. `.github/workflows/ci.yml`：触发 `pull_request` 与 push 到 `main`；`concurrency: ci-${{ github.ref }}` 并 `cancel-in-progress: true`；`ubuntu-latest`、`actions/setup-node`（Node 26，`cache: npm`）；`npm ci` 后运行 `npm run verify`；`timeout-minutes: 15`；`permissions: contents: read`。
2. 确认 CI 环境下 `better-sqlite3` 原生模块可加载（npm 11 默认不跑 install scripts；若 Linux 下缺预编译产物，用 `npm ci --allow-scripts=better-sqlite3` 或等价方式显式允许，不全局放开）。`koffi`（Copilot SDK 依赖）如无需原生构建则保持禁用。
3. `README.md`：顶部加入产品目标一段（完整 ERP 场景、小企业简化、可关闭教学、原创 UI、性能优先，链接 `design/product-guidelines.md`）和当前路线一段（SQLite 本机单用户无登录；PG/Docker/登录延后；当前计划见 `design/roadmap.md`、`design/tasks/README.md`）。参考暂停现场 README 的前两段，但删掉其中 M05/M06/G1 及“开发继续暂停”等已过时表述；README 中 PostgreSQL 操作说明与 `verify:databases` 说明改写为“已延后、不维护”。
4. `.github/agents/developer.agent.md`：在 Operating rules 开头加入仓库专属规则：本仓库产品准则以 `design/product-guidelines.md` 为准；流程以 `design/roadmap.md` §5 为准——任务来自 `design/tasks/`，每任务一个分支一个 PR，由 PR 评审角色评审，本仓库不执行 G1–G6 门禁、模型计划记录和 `design/` 工件维护（`design/` 由设计角色维护）。
5. 在 `README.md` 加 CI 徽章（可选）。

不包含：PG 代码删除（M0-03）；`deferred-postgres` 测试归档、`verify:sqlite` 拆分、`packages/infrastructure/README.md`（随 M0-03 一并处理）；未跟踪夹具 `apps/api/.legacy-fixture-*`（不提交）；任何 `design/` 文件。

## 涉及文件

`.github/workflows/ci.yml`（新）、`README.md`、`.github/agents/developer.agent.md`；必要时 `package.json`（仅为 CI 可运行做最小调整）。

## 验收标准

- 本 PR 自身的 CI 运行并通过；CI 不需要 PostgreSQL、Docker、网络服务或密钥。
- 同一 PR 新推送会取消旧运行。
- CI 总墙钟 ≤ 10 分钟（在 PR 描述中记录实际时长：安装、verify 各步）。
- README 中不再出现把 PG/Server/M04 当作当前可用或当前计划的表述；链接有效。
- 旧 4173 账套、stash、暂停现场目录均未被触碰。

## 性能考虑

不适用（工具链任务）。记录 CI 各步耗时作为后续 CI 预算基线。

## 测试要求

无新增测试；现有 `npm run verify` 在 CI 全绿。
