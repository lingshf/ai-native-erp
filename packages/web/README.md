# Local web

React/Vite read-only runtime shell and verified legacy-snapshot reports.
This is not the active ledger and has no financial write or AI endpoint.

After `npm ci` at the repository root:

```powershell
npm run typecheck
npm run test --workspace @erp/web
npm run dev --workspace @erp/web
npm run build
```

Tests and development use source directly, without a package build. Labels and
preferences are local modules in `src/ui`. All 60 web tests, including the former
UI package's two compatibility cases, use the root Vitest web/jsdom project.
Root typechecking includes source, test types and Vite configs.

Vite emits `dist` only on `build`. The Local HTTP adapter serves those assets
and `/api/v1` on the same origin. Development uses loopback with only `/api/v1`
proxied to `127.0.0.1:4180`; CORS remains disabled.

DTOs come from `@erp/core/contracts`. Web cannot import other core layers,
infra, Node builtins or server libraries. Reports retain abort/late-result guards,
explicit retries, source identities and bounded pagination.

Preferences remain at `erp.workspace.preferences.v1`, defaulting to
Chinese/red/teaching-off. Preference updates do not refetch reports or write
financial data. Storage failures remain visible. Legacy label imports exist
only in compatibility tests, not in production source.
