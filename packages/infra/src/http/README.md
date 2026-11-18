# Local HTTP adapter

After `npm ci` at the repository root, `npm run start:local` runs
`node packages/infra/src/main.ts`. Node 26 strips TypeScript directly; no package
build is required. `npm run typecheck` checks all three workspaces and TS tests.
The legacy root `npm start` is unchanged.

The CLI only copies `ERP_PROFILE`, `ERP_HOST`, and `ERP_PORT`. Defaults are
`local`, `127.0.0.1`, `4180`. Only literal IPv4/IPv6 loopback is allowed;
CLI port 0 and reserved legacy port 4173 are rejected. Port conflicts are fatal.
It does not load `.env`, open a ledger, or migrate storage.

`@erp/infra/http` exports `createApi`, `defaultWebRoot`, `validateDevOrigin`
and the API/error types. `createApi` returns a ready, not-listening Fastify
instance with `listen()` and `close()`. Factory-only test routes are never
enabled by the CLI. `server.inject()` exercises the actual Fastify handlers.

`GET /api/v1/health` reports the unconfigured target. Legacy report endpoints
require an explicitly verified snapshot reader; the ordinary CLI has none.
Logs contain only generated request IDs and fixed classifications, not raw
messages, bodies, SQL, paths, or stacks. CORS is not enabled.

Only web needs a build: root `npm run build` emits `packages/web/dist`.
The HTTP adapter serves that directory on the same origin, resolved from this
source module rather than the working directory. Missing assets return 503.

Application services and ports are exported by `@erp/core/application`, DTOs
by `@erp/core/contracts`, and runtime configuration by `@erp/infra`.
Run HTTP tests with `node --test packages/infra/test/http/*.test.mjs`.
