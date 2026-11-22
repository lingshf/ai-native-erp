# -StepsFile that reproduces the D316 GATE-01 kit's step list (gist 4e00af7, kit__slot-run.ps1) verbatim (D347).
#   pwsh -File scripts/slot/slot-run.ps1 -OutDir DIR_OUTSIDE_REPO -StepsFile scripts/slot/steps.gate01.ps1 -BaseRoot BASE_WORKTREE
# The GATE-01 tools (artifacts/ci/gate01/*.ts) are not in the repository; like the kit, a -BaseRoot without them
# stops the run (slot-run.ps1 exit 4, before the build). The kit set ERP_E2E_BROWSER_CHANNEL=chrome for the whole
# run, so every step here carries it.
param([string] $OutDir, [string] $Root, [string] $BaseRoot)
if (-not $BaseRoot -or -not (Test-Path (Join-Path $BaseRoot 'artifacts/ci/gate01/compare.ts'))) { throw "missing -BaseRoot tools" }
$chrome = @{ ERP_E2E_BROWSER_CHANNEL = "chrome" }
$e2e = "packages/infra/test/http/trade-gui-zh-red-2.slow.test.ts packages/infra/test/http/trade-gui-en-green-2.slow.test.ts"
@(
  # Acceptance 4d: the new steps first pass on the PR's actual base (base + the scenario commit only).
  @{ name = "e2e-base"; dir = $BaseRoot; file = "cmd.exe"; args = "/d /c npx vitest run --config vitest.config.ts --project=infra-browser $e2e --reporter=default --reporter=json --outputFile=`"$(Join-Path $OutDir 'e2e-base-report.json')`""; env = $chrome + @{ ERP_E2E_ARTIFACTS = (Join-Path $OutDir "e2e-base-artifacts") } },
  @{ name = "e2e-head"; dir = $Root; file = "cmd.exe"; args = "/d /c npx vitest run --config vitest.config.ts --project=infra-browser $e2e --reporter=default --reporter=json --outputFile=`"$(Join-Path $OutDir 'e2e-head-report.json')`""; env = $chrome + @{ ERP_E2E_ARTIFACTS = (Join-Path $OutDir "e2e-head-artifacts") } },
  @{ name = "bytes"; dir = $Root; file = "node"; args = "artifacts/ci/gate01/bytes.ts `"$BaseRoot`" `"$Root`""; env = $chrome.Clone() },
  @{ name = "sourcemap"; dir = (Join-Path $Root "packages/web"); file = "cmd.exe"; args = "/d /c npx vite build --sourcemap && node ../../artifacts/ci/gate01/mapcheck.ts dist"; env = $chrome.Clone() },
  @{ name = "base-shots"; dir = $BaseRoot; file = "node"; args = "artifacts/ci/gate01/compare.ts `"$(Join-Path $OutDir 'base')`""; env = $chrome.Clone() },
  @{ name = "head-shots"; dir = $Root; file = "node"; args = "artifacts/ci/gate01/compare.ts `"$(Join-Path $OutDir 'head')`""; env = $chrome.Clone() },
  @{ name = "pixel-diff"; dir = $Root; file = "node"; args = "artifacts/ci/gate01/pixel-diff.ts `"$(Join-Path $OutDir 'base')`" `"$(Join-Path $OutDir 'head')`" `"$(Join-Path $OutDir 'diff')`""; env = $chrome.Clone() }
)
