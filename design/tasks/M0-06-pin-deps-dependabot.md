# M0-06 锁定依赖版本；配置 Dependabot 定期升级

- 里程碑：M0　依赖：M0-04（可与 M0-05 并行）　建议分支：`pin-deps-dependabot`　决定：D2 = Dependabot（见[路线图 §6](../roadmap.md)）

## 目标

所有依赖精确版本；Dependabot 定期提升级 PR，经 CI 和评审后合并。

## 范围

- 所有 `package.json` 的依赖写精确版本（去掉 `^`/`~`）；`.npmrc` 设 `save-exact=true`；`engines.node` 与 CI Node 版本一致。
- `.github/dependabot.yml`：
  - `npm` 生态，目录 `/`，每周一次；`versioning-strategy: increase`（保持精确版本）；`open-pull-requests-limit: 3`；`groups` 按生态分组（react、vite/vitest、types、其它 dev 依赖），次要/补丁版本合并为一个 PR，主版本单独 PR。
  - `github-actions` 生态，每月一次，分组为一个 PR。
  - 不自动合并（无分支保护）。
- 一次性检查并删除未使用依赖，结论写 PR 描述，不把检查工具加入常驻工具链。

不包含：Renovate（D2 已否决，不添加 `renovate.json`）。

## 涉及文件

各 `package.json`、`package-lock.json`、`.npmrc`、`.github/dependabot.yml`。

## 验收标准

- 各 `package.json` 依赖版本不含 `^`/`~`。
- 合并后 GitHub 仓库 Insights → Dependency graph → Dependabot 页面识别配置且无报错（PR 描述或合并后评论说明核验结果）。
- CI 绿。

## 性能考虑

限制升级 PR 数量与频率，避免挤占每月 Actions 分钟（npm 每周 ≤ 3 个 PR，Actions 每月 1 个）。

## 测试要求

无新增测试。
