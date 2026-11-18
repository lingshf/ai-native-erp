# M0-04 6 个包合并为 core / infra / web，直接运行 TS 源码

- 里程碑：M0　依赖：M0-02、M0-03　建议分支：`merge-packages-core-infra-web`

## 目标

按 [M0 架构](../m0-architecture.md) §1–2 把 `packages/{domain,application,contracts,infrastructure,ui}` 与 `apps/{api,web}` 收敛为 `packages/core`、`packages/infra`、`packages/web`；开发和测试不需要先 build。

## 范围

- `core/src/{domain,application,contracts}` ← domain、application、contracts；`infra/src/{storage,http,legacy,...}` + `main.ts` ← infrastructure + apps/api；`web/src` ← apps/web + packages/ui（labels/偏好）。
- 包名：`@erp/core`（子路径导出 `./domain`、`./application`、`./contracts`）、`@erp/infra`、`@erp/web`。`exports` 指向 `.ts` 源码。
- tsconfig：根 `tsconfig.base.json` 打开 `erasableSyntaxOnly`、`verbatimModuleSyntax`、`allowImportingTsExtensions`、`noEmit`；源码相对导入改为 `.ts` 扩展名。`typecheck` 一条命令覆盖 3 个包和测试类型。
- contracts 的 OpenAPI 生成脚本：无消费方则删除；有则改为按需脚本，不挂在每次测试前。
- 启动改为 `node packages/infra/src/main.ts`；web 仍 `vite build` 后由 infra 服务。
- 根 `package.json`：`workspaces: ["packages/*"]`；删除包构建步骤；测试不再先 build。
- `scripts/check-boundaries.mjs` 与 `tooling-tests/boundaries.test.mjs`：改为按目录规则（见架构 §1 表），保留现有违规用例的等价覆盖。
- 旧 `src/`、`public/`、`tests/` 不动；现有测试暂保持 node:test（Vitest 在 M0-05）。

## 涉及文件

`packages/**`、`apps/**`（移走后删除目录）、`package.json`、`package-lock.json`、`tsconfig*.json`、`scripts/check-boundaries.mjs`、`tooling-tests/boundaries.test.mjs`、`scripts/*.mjs` 中引用旧包路径之处、`.github/workflows/ci.yml`、`README.md`。

## 验收标准

- 只有 3 个 workspace；`apps/` 目录不存在。
- 运行测试和启动服务器前不需要 `tsc` 产出（`verify` 不含包构建步骤；web 只在 build 步骤构建）。
- 边界检查对“core 导入 infra”“web 导入 node:fs/better-sqlite3”“domain 导入 application”各有失败用例。
- 测试数量与合并前一致（逐包对比数量写入 PR 描述），断言未削弱。
- CI 时长较 M0-01 基线下降（PR 描述记录）。

## 性能考虑

本任务目标就是缩短反馈循环：记录合并前后 `npm run verify` 和 CI 总时长。

## 测试要求

移动测试文件，不改测试意图；边界检查补齐上述 3 个失败用例。
