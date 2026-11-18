# M0-06a lockfile tarball 地址改回公共 registry + 防回归检查

- 里程碑：M0　依赖：M0-06　来源：M0-06 合并后 Dependabot npm 更新失败（`private_source_authentication_failure`）

## 目标

`package-lock.json` 中的 `resolved` tarball 地址指向 ms-feed 私有镜像，Dependabot 和其他环境无法访问。全部改为 `https://registry.npmjs.org/`，并防止再次混入。

## 范围

- 把 lockfile 中所有非 `registry.npmjs.org` 的 `resolved` 地址改为对应的 `registry.npmjs.org` 地址；`integrity` 不变，并核对与公共 registry 上同版本的 `dist.integrity` 一致（不一致的条目列出并单独处理，不得直接改 integrity 了事）。
- 轻量防回归检查：一个小脚本（或 CI 内一步）在 lockfile 出现非 `https://registry.npmjs.org/` 的 `resolved` 时失败，接入 PR CI（耗时 < 1 秒级）。
- 如本机 `.npmrc`/用户配置导致镜像地址写入，在 README 开发说明加一句提示（不提交任何私有源配置或凭据）。

不包含：依赖升级（由 Dependabot PR 处理）。

## 验收标准

- lockfile 中 `resolved` 全部以 `https://registry.npmjs.org/` 开头；`npm ci` 在 CI 通过。
- 防回归检查对含镜像地址的 lockfile 样例失败（一个测试或在 PR 描述中贴失败输出）。
- 合并后 Dependabot npm 更新不再报 `private_source_authentication_failure`（合并后核验并在 PR 评论记录）。
- CI 绿，时长不增加。

## 性能考虑

不适用。

## 测试要求

最多一个针对检查脚本的小测试；不增加其它测试。
