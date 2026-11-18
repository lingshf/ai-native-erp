# M0-06 锁定依赖版本；配置定期升级

- 里程碑：M0　依赖：M0-04（可与 M0-05 并行）　建议分支：`pin-deps-renovate`　前置决定：D2（见[路线图 §6](../roadmap.md)）

## 目标

所有依赖精确版本；有机器人定期提升级 PR，经 CI 后合并。

## 范围

- 所有 `package.json` 的依赖写精确版本（去掉 `^`/`~`）；`.npmrc` 设 `save-exact=true`；`engines.node` 与 CI Node 版本一致。
- D2 = Renovate：`renovate.json`——每周一次、按生态分组（react、vite/vitest、types、其它 dev）、`rangeStrategy: pin`、`lockFileMaintenance` 每月、同时打开 PR ≤ 3、不自动合并。需要用户在仓库安装 Renovate GitHub App。
- D2 = Dependabot：`.github/dependabot.yml` 等价配置（每周、分组、`open-pull-requests-limit: 3`）。
- 一次性检查并删除未使用依赖，结论写 PR 描述，不把检查工具加入常驻工具链。

## 涉及文件

各 `package.json`、`package-lock.json`、`.npmrc`、`renovate.json` 或 `.github/dependabot.yml`。

## 验收标准

- 各 `package.json` 依赖版本不含 `^`/`~`。
- 配置文件通过对应校验（Renovate：`renovate-config-validator`；Dependabot：GitHub 识别无报错）。
- CI 绿。

## 性能考虑

限制升级 PR 数量，避免挤占每月 Actions 分钟（每周 ≤ 3 个 PR）。

## 测试要求

无新增测试。
