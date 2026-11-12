# M01 web shell

Read-only React/Vite shell for ARCH-T03. This is not a ledger UI: no accounting
inputs, module placeholders, AI requests, or financial data connections.

The parent workspace installs dependencies once all manifests are ready. Build
`@erp/ui` and `@erp/contracts` before web typechecking, tests, or development:

```powershell
npm run build --workspace @erp/ui
npm run build --workspace @erp/contracts
npm run test --workspace @erp/ui
npm run typecheck --workspace @erp/web
npm run test --workspace @erp/web
npm run build --workspace @erp/web
```

`src/main.tsx` mounts the shell. Vite emits `dist`; tests and config are excluded
from application compilation and the bundle. `vitest.config.ts` explicitly selects
only `test/**/*.test.ts(x)` with jsdom; it is separate from the root legacy runner.

Production uses the Local API static adapter to serve `dist` and the relative
`GET /api/v1/health` on one origin. For development, `npm run dev --workspace
@erp/web` uses loopback with only `/api/v1` proxied to `127.0.0.1:4180`. No CORS
configuration or access to the original application is required.

The shell consumes `healthSchema`, `HealthResponse`, and `errorSchema` from
`@erp/contracts`. Health is strictly
`{service:"ai-native-erp",contractVersion:"1",profile:"local",data:"unconfigured"}`.
Invalid success/error bodies are rejected without displaying body text. Requests
are abortable and guarded against late results. Errors require explicit retry;
preference changes never initiate another request or recreate the shell.

All shell labels (including title, accessible names, and warnings) are independent
`shell.*` keys from `@erp/ui`; no old label keys or values are copied. The UI package
test runner compares the actual shared-key intersection against both legacy
language resources; legacy imports exist only in tests, not production code. Preferences
use `erp.workspace.preferences.v1`, default to Chinese/red/teaching-off, and persist
before accepting an update. Storage failures are aggregated visibly; a successful
save clears only the resolved write warning, preserving any read/corruption notices. Corrupt
preferences recover to complete defaults with a notice, not a silent write.
Teaching mode hides explanations only; operational/data/storage warnings remain.

Integration acceptance still needs a built-API same-origin browser run, keyboard
checks, and a 390px overflow check. No local server is started by the unit tests.
