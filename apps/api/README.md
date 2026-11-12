# Local API skeleton (ARCH-M01)

This package is a runtime-status shell, not a financial API. It neither opens a
database nor loads `.env`. Server profile is deliberately unavailable until
authentication is implemented.

After the root owner installs the workspace dependencies, build in dependency
order: contracts, application, infrastructure, api. Each package provides
`npm run build`, `npm run typecheck`, and `npm test` (run from its directory, or
use `npm run <command> --workspace @erp/<name>` from the root). Tests import
compiled package exports; build before testing. No tests are emitted into dist.
Start with `npm start --workspace @erp/api`; the legacy root start is unchanged.

Only `ERP_PROFILE`, `ERP_HOST`, and `ERP_PORT` configure the CLI. Defaults are
`local`, `127.0.0.1`, `4180`. Only literal IPv4/IPv6 loopback hosts are allowed;
CLI port 0 and reserved legacy port 4173 are rejected. Port conflicts are fatal.

The only public API is `GET /api/v1/health`. Its strict response is:

```json
{"service":"ai-native-erp","contractVersion":"1","profile":"local","data":"unconfigured"}
```

The API serves the independently built `apps/web/dist` at the same origin.
Missing static builds produce a strict 503; CORS is not enabled. The static
root is resolved relative to the compiled module, never the working directory.

## Compiled exports

`@erp/api` exports `createApi(options?)`, `defaultWebRoot()`, and
`UnifiedHttpExceptionFilter`; types include `LocalApi`, `CreateApiOptions`,
`SafeErrorEvent`, and `SafeErrorLogger`. `createApi` returns an initialized,
ready (not listening) `{ app, server, configuration, listen(), close() }`.
`listen()` uses the validated host/port and returns the bound origin.
`server.inject()` runs real Fastify/Nest HTTP handling without opening a port.

Factory-only options are `environment`, `allowPortZero`, absolute `webRoot`,
`runtimeInfoPort`, `logError`, and `registerTestRoutes(server)`. The CLI never
supplies test routes or fault injection. Factory defaults ignore process.env;
the CLI explicitly copies only its three supported environment variables.
Call `close()` after use. Tests create isolated `.test-artifacts-*` fixtures
inside this package and remove their own fixtures.

`@erp/application` exports the pure `RuntimeInfoService`, `RuntimeInfo`, and
`RuntimeInfoPort`. `@erp/infrastructure` exports `LocalRuntimeInfo`,
`parseRuntimeConfiguration`, `RuntimeConfigurationError`, `RuntimeEnvironment`,
and `RuntimeConfiguration`. Application code has no contracts, framework, SQL,
or concrete infrastructure imports.

Errors use `errorSchema` from `@erp/contracts`; health uses `healthSchema` and
the shared `HealthResponse` type. Logs contain only generated request IDs and
fixed error classifications, never bodies, exception messages, stacks, or paths.
