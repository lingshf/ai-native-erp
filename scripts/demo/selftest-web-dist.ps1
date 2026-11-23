# Self-test for scripts/demo/assert-web-dist.ps1 (RUNMAIN-01 acceptance W1-W7).
# Builds a fictitious git repo in a private temp dir, prepares packages\web\dist\index.html per scenario, and
# runs -Helper in pwsh and powershell.exe child processes. Both hosts must give the expected exit code (hence
# the same code) and output within $MaxCaseSeconds. One line per scenario and host, then a summary line.
# Exit 0 when every line passes, else 1. A missing -Helper makes every scenario FAIL (never skipped).
param([string]$Helper = (Join-Path $PSScriptRoot 'assert-web-dist.ps1'))

$MaxCaseSeconds = 5
$ExitAllPassed = 0
$ExitSomeFailed = 1
$ChildHosts = @('pwsh', 'powershell.exe')
$CommitTimeUtc = [DateTimeOffset]::new(2026, 1, 15, 10, 0, 0, [TimeSpan]::Zero)
$Missing = 'web-dist: missing'
$Stale = 'web-dist: stale'
$Undetermined = 'web-dist: undetermined'
$FixCommand = 'npm run build'

# Root: repo = fictitious git repo, plain = existing non-git dir, absent = path that does not exist.
# DistMinutes: index.html time relative to the commit time; $null = no dist directory.
$Scenarios = @(
  @{ Id = 'W1'; Root = 'repo'; DistMinutes = $null; Exit = 3; Expect = @($Missing, '{index}', $FixCommand, 'D481') }
  @{ Id = 'W2'; Root = 'repo'; DistMinutes = 0; Exit = 4; Expect = @($Stale, $FixCommand) }
  @{ Id = 'W3'; Root = 'repo'; DistMinutes = -1; Exit = 4; Expect = @($Stale, $FixCommand) }
  @{ Id = 'W4'; Root = 'repo'; DistMinutes = 1; Exit = 0; Expect = @('web-dist: ok') }
  @{ Id = 'W5'; Root = 'plain'; DistMinutes = 1; Exit = 2; Expect = @($Undetermined) }
  @{ Id = 'W6'; Root = 'absent'; DistMinutes = $null; Exit = 2; Expect = @($Undetermined) }
)

function New-FixtureRepo([string]$Dir) {
  New-Item -ItemType Directory -Path $Dir | Out-Null
  git -C $Dir init -q
  Set-Content -LiteralPath (Join-Path $Dir 'README.md') -Value 'fixture'
  $env:GIT_AUTHOR_DATE = "@$($CommitTimeUtc.ToUnixTimeSeconds()) +0000"
  $env:GIT_COMMITTER_DATE = $env:GIT_AUTHOR_DATE
  git -C $Dir add README.md
  git -C $Dir -c user.name=selftest -c user.email=selftest@example.invalid -c commit.gpgsign=false commit -q -m fixture
  $code = $LASTEXITCODE
  Remove-Item Env:GIT_AUTHOR_DATE, Env:GIT_COMMITTER_DATE
  if ($code -ne 0) { throw "fixture commit failed in $Dir" }
}

# Resets <Root>\packages\web\dist to the scenario state and returns the index.html path.
function Set-DistState([string]$Root, $DistMinutes) {
  $dist = Join-Path $Root 'packages\web\dist'
  if (Test-Path -LiteralPath $dist) { Remove-Item -LiteralPath $dist -Recurse -Force }
  $index = Join-Path $dist 'index.html'
  if ($null -eq $DistMinutes) { return $index }
  New-Item -ItemType Directory -Path $dist -Force | Out-Null
  Set-Content -LiteralPath $index -Value '<!doctype html>'
  [IO.File]::SetLastWriteTimeUtc($index, $CommitTimeUtc.UtcDateTime.AddMinutes($DistMinutes))
  $index
}

function Resolve-CaseRoot([hashtable]$Scenario, [string]$Work) {
  $root = Join-Path $Work $Scenario.Root
  if ($Scenario.Root -eq 'absent') { return $root }
  if (-not (Test-Path -LiteralPath $root)) { New-Item -ItemType Directory -Path $root | Out-Null }
  (Get-Item -LiteralPath $root).FullName
}

function Invoke-Helper([string]$ChildHost, [string]$Root) {
  $watch = [Diagnostics.Stopwatch]::StartNew()
  $output = try { & $ChildHost -NoProfile -ExecutionPolicy Bypass -File $Helper -Root $Root 2>&1 | Out-String } catch { "$_" }
  $code = $LASTEXITCODE
  $watch.Stop()
  @{ Code = $code; Output = $output; Seconds = $watch.Elapsed.TotalSeconds }
}

# Returns the failure reasons of one run (empty when it passes).
function Get-CaseFailures([hashtable]$Scenario, [hashtable]$Run, [string]$Index) {
  $reasons = @()
  if (-not (Test-Path -LiteralPath $Helper -PathType Leaf)) { $reasons += "helper not found: $Helper" }
  if ($Run.Code -ne $Scenario.Exit) { $reasons += "expected exit $($Scenario.Exit)" }
  if ($Run.Seconds -gt $MaxCaseSeconds) { $reasons += "slower than $MaxCaseSeconds s" }
  foreach ($text in $Scenario.Expect) {
    $needle = $text.Replace('{index}', $Index)
    if (-not $Run.Output.Contains($needle)) { $reasons += "output lacks '$needle'" }
  }
  $reasons
}

function Invoke-Case([hashtable]$Scenario, [string]$Work) {
  $root = Resolve-CaseRoot $Scenario $Work
  $index = $null
  if ($Scenario.Root -ne 'absent') { $index = Set-DistState $root $Scenario.DistMinutes }
  foreach ($childHost in $ChildHosts) {
    $run = Invoke-Helper $childHost $root
    $reasons = @(Get-CaseFailures $Scenario $run $index)
    $verdict = 'PASS'; if ($reasons.Count) { $verdict = 'FAIL' }
    $line = '{0} {1} {2} exit={3} {4:0.00}s' -f $verdict, $Scenario.Id, $childHost, $run.Code, $run.Seconds
    if ($reasons.Count) { $line += ' (' + ($reasons -join '; ') + ')' }
    Write-Output $line
    if ($reasons.Count) { Write-Output ('  first output line: ' + ($run.Output.Trim() -split "`r?`n")[0]) }
  }
}

$work = Join-Path ([IO.Path]::GetTempPath()) ('selftest-web-dist-' + [guid]::NewGuid().ToString('N'))
$savedEnv = @{ TEMP = $env:TEMP; TMP = $env:TMP; GIT_CEILING_DIRECTORIES = $env:GIT_CEILING_DIRECTORIES }
try {
  New-Item -ItemType Directory -Path (Join-Path $work 'tmp') | Out-Null
  $env:TEMP = Join-Path $work 'tmp'; $env:TMP = $env:TEMP
  $env:GIT_CEILING_DIRECTORIES = $work   # keeps git from finding a repo above the plain (non-git) dir
  New-FixtureRepo (Join-Path $work 'repo')
  $lines = @(foreach ($scenario in $Scenarios) { Invoke-Case $scenario $work })
} finally {
  foreach ($name in $savedEnv.Keys) { [Environment]::SetEnvironmentVariable($name, $savedEnv[$name]) }
  if (Test-Path -LiteralPath $work) { Remove-Item -LiteralPath $work -Recurse -Force }
}
$lines
$results = @($lines | Where-Object { $_ -match '^(PASS|FAIL) ' })
$passed = @($results | Where-Object { $_ -like 'PASS *' }).Count
Write-Output ("selftest-web-dist: {0}/{1} passed, helper={2}" -f $passed, $results.Count, $Helper)
if ($results.Count -eq $Scenarios.Count * $ChildHosts.Count -and $passed -eq $results.Count) { exit $ExitAllPassed }
exit $ExitSomeFailed
