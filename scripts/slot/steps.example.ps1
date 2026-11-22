# Example -StepsFile for slot-run.ps1: copy it outside the repository (or next to your slot notes) and edit the
# step list for the slot you applied for. Each step runs once, in order; a non-zero exit or any counted process
# ends the run. Paths in args should be absolute or relative to the step's dir.
param([string] $OutDir, [string] $Root, [string] $BaseRoot)
$e2e = "packages/infra/test/http/trade-gui-zh-red-2.slow.test.ts"
$steps = @()
if ($BaseRoot) {
  $steps += @{ name = "e2e-base"; dir = $BaseRoot; file = "cmd.exe"; args = "/d /c npx vitest run --config vitest.config.ts --project=infra-browser $e2e --reporter=default --reporter=json --outputFile=`"$(Join-Path $OutDir 'e2e-base-report.json')`""; env = @{ ERP_E2E_BROWSER_CHANNEL = "chrome"; ERP_E2E_ARTIFACTS = (Join-Path $OutDir "e2e-base-artifacts") } }
}
$steps += @{ name = "e2e-head"; dir = $Root; file = "cmd.exe"; args = "/d /c npx vitest run --config vitest.config.ts --project=infra-browser $e2e --reporter=default --reporter=json --outputFile=`"$(Join-Path $OutDir 'e2e-head-report.json')`""; env = @{ ERP_E2E_BROWSER_CHANNEL = "chrome"; ERP_E2E_ARTIFACTS = (Join-Path $OutDir "e2e-head-artifacts") } }
$steps
