# Local web

React/Vite Local workspace with verified read-only legacy-snapshot reports and
explicit writes to an independently configured target ledger. It never writes
the protected active legacy ledger and has no AI write endpoint.

After `npm ci` at the repository root:

```powershell
npm run typecheck
npm run test --workspace @erp/web
npm run dev --workspace @erp/web
npm run build
```

Tests and development use source directly, without a package build. Labels and
preferences are local modules in `src/ui`. Web tests, including the former
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

The lazy Business events page maintains services/parties/rules and previews
cash receipts/payments, source cancellations, signed statistics and complete-line
clearing matches. Preview never saves. The Journals preview offers separate POST
and QUEUE actions only after explicit saving; business-owned GL links to its
source rather than manual correction. Queue transfer previews current rules.
Unknown submission results lock the original command, key/plan and withdrawal
reason for explicit same-command retries. Same-reason withdrawal is idempotent.
Lists use 100-item pages and virtualize after 100 loaded items. Labels are bilingual;
language/theme/teaching preferences never save or change business input.

The lazy live `/#/ledger-reports` and `/#/ledger` routes query the target SQLite
ledger, clearly separate from the verified legacy snapshot routes. Select a report
group amount, an account amount, then a GL source link to open the original journal
by company/ID. Trial stage is retained through drilldown. Company/period, income,
balance sheet and reconciliation selections are explicit and bilingual; errors are
never presented as zero balances. Configured inactive accounts remain visible.

The live ledger fetches 500-line keyset pages, automatically loads near the end of
the scroll region, and also offers an accessible Load more button. It virtualizes
even the first page with 44px rows and five-row overscan per side. The focused DOM
test scrolls a single full page and bounds mounted rows to viewport plus
overscan (including one partially visible row). Actual 100,000-line scrolling and
million-row capacity verification remain manual/Bench work, not PR tests.
Reports carry both the GL posting watermark and the same-company aggregate account
revision through group/account links, page requests, filter submissions and
query-cache keys. Navigation and repeated selections revalidate cached results;
pending revalidation and failed reads never display stale cached tables.
Historical GL remains readable only while the account configuration still matches.
Reclassification without new postings returns 409 and requires an explicit refresh,
not a historical-classification mode or an automatic latest-data fallback.
Refresh explicitly removes both pins and starts a new read. Income account drilldowns
show signed period amounts in the statement direction alongside raw trial columns;
the selected group subtotal reconciles to those period amounts, not closing balances.
All posted-journal selection paths share cancellation, so a late deep-link response
or error cannot replace a newer selection. Dimension filters use a concrete value
or `~` for unassigned.
