# Local HTTP adapter

After `npm ci` at the repository root, `npm run start:local` runs
`node packages/infra/src/main.ts`. Node 26 strips TypeScript directly; no package
build is required. `npm run typecheck` checks all three workspaces and TS tests.
The CLI listener uses `ERP_PROFILE`, `ERP_HOST`, and `ERP_PORT`. Defaults are
`local`, `127.0.0.1`, `4180`. Only literal IPv4/IPv6 loopback is allowed;
CLI port 0 and reserved legacy port 4173 are rejected. Port conflicts are fatal.
It does not load `.env` or implicitly migrate storage. Without `ERP_SQLITE_FILE`
it starts an unconfigured shell and does not open a business ledger. With an
explicit absolute `ERP_SQLITE_FILE`, it opens that dedicated target through the
SQLite worker pool, verifies the published schema, and initializes default
master data when needed. Missing, invalid or outdated target schemas fail rather
than being silently created or upgraded. Run explicit storage migration first.

`@erp/infra/http` exports `createApi`, `defaultWebRoot`, `validateDevOrigin`
and the API/error types. `createApi` returns a ready, not-listening Fastify
instance with `listen()` and `close()`. Factory-only test routes are never
enabled by the CLI. `server.inject()` exercises the actual Fastify handlers.

`GET /api/v1/health` reports `data:unconfigured` for the shell or `data:configured`
when the explicit target is ready. Legacy report endpoints
require an explicitly verified snapshot reader; the ordinary CLI has none.
Logs contain only generated request IDs and fixed classifications, not raw
messages, bodies, SQL, paths, or stacks. CORS is not enabled.

Only web needs a build: root `npm run build` emits `packages/web/dist`.
The HTTP adapter serves that directory on the same origin, resolved from this
source module rather than the working directory. Missing assets return 503.

Application services and ports are exported by `@erp/core/application`, DTOs
by `@erp/core/contracts`, and runtime configuration by `@erp/infra`.
Run HTTP tests with `npm test -- packages/infra/test/http`.

Trade master maintenance lives at `/#/trade`. Each of `tradeParty`, `tradeProduct`,
`tradeProfile`, `tradeTerms` and `taxCode` has `GET/POST/PUT /api/v1/trade/{kind}`.
Writes require `{company,kind,code,expectedRevision,active,data}`; create uses
revision 0 and update uses the last returned revision. Codes cannot be renamed.
All references are company-scoped and must cover the configuration's inclusive
validity window. Saving configuration never posts a journal or initiates payment.
Lists use `company`, bounded `limit` (default 100, maximum 500), optional code
`cursor`, and literal, case-sensitive name-prefix `search`. Current and
recorded-at history (including disabled configurations) are available through
`GET /api/v1/trade/{kind}/{code}?company=...&at=...`.
Percentages and tax rates are exact decimal strings with at most six fractional
digits. Tax rates have explicit inclusive, non-overlapping date intervals;
missing tax is never interpreted as zero-rated or exempt.

An existing record can be disabled with unchanged data even when its references
have since expired or been disabled. Reactivation or changed data revalidates
references. While an editor is open, company/type/row switches are locked.
Discarding a dirty draft requires confirmation; writes in flight or with unknown
outcomes block navigation. An explicit safe retry reuses the same CAS command,
and on conflict verifies the stored revision and data instead of creating a
second revision or silently assuming success.

The independent synthetic trade benchmark is deliberately outside fast CI:
`node packages/infra/bench/trade-master.ts OUTPUT.json`. It seeds exactly 10,000
partners and 10,000 products in a temporary ledger, then measures each kind's
list and name-prefix search separately: 10 warmups and 100 samples through real
loopback HTTP, production worker dispatch, full JSON body and shared DTO parse.
Each of the four p95 values must be at most 1,000 ms. It closes the server and
workers and deletes only its temporary ledger on completion.
