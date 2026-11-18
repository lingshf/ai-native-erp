# M0-02 API 去掉 NestJS，改为纯 Fastify

- 里程碑：M0　依赖：M0-01　建议分支：`api-pure-fastify`

## 目标

`apps/api` 只用 Fastify 5，不再依赖 NestJS / reflect-metadata / rxjs，为 M0-04 直接运行 TS 源码（禁止装饰器）扫清障碍。

## 范围

- 用 Fastify 插件/路由函数重写 `apps/api/src/index.ts`、`legacy.ts`、`bootstrap.ts` 中的 Nest 控制器、模块、异常过滤器；保留 `errors.ts` 的安全错误映射语义（统一错误体、敏感信息不外泄）。
- 保持所有现有 HTTP 行为：`/api/v1/health`、旧账只读快照接口、开发 Origin 校验、loopback 限制、端口规则（拒绝 4173 等）、静态 web 资源、测试缝。
- 从 `apps/api/package.json` 删除 `@nestjs/common`、`@nestjs/core`、`@nestjs/platform-fastify`、`reflect-metadata`、`rxjs`；更新 lock。
- `scripts/check-boundaries.mjs` 中与 `@nestjs/` 相关的规则可保留或删除，不影响结果即可。

不包含：包合并、测试框架迁移（测试仍是 node:test）。

## 涉及文件

`apps/api/src/*.ts`、`apps/api/package.json`、`apps/api/tsconfig.json`（去掉装饰器相关选项）、`package-lock.json`。

## 验收标准

- `apps/api/test/*.test.mjs` 全部通过且断言未削弱（只允许把对 Nest 内部对象的访问改为对 Fastify 实例的访问）。
- 源码中 `@nestjs`、`reflect-metadata`、`rxjs` 无引用，lock 中也不再出现。
- 代码量不增加（目标：`apps/api/src` 行数 ≤ 现在的 362 行）。
- CI 绿。

## 性能考虑

启动时间应下降：在 PR 描述记录改前/改后 `createApi()` 到 `listen` 就绪的耗时（各 5 次取中位数）。

## 测试要求

沿用现有 API 测试；不新增重复用例。
