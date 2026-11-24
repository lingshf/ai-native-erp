# Call-location self-test (S21 SLOT-04 S1–S6). Standalone:
#   pwsh -File scripts/slot/selftest-location.ps1 -OutDir DIR_OUTSIDE_REPO
# A throw-away "app" repository (git init + one commit, under -OutDir) stands for another worktree. The marker steps
# file writes steps-file-ran.txt into the run's -OutDir and returns no steps, so a runner without the check stops at
# "produced no steps" (exit 4) without building; with the check it must stop before the steps file runs.
# S1 R-base + R-steps (constructed case, not a replay): current dir = this repository, steps in the app repository,
#    -BaseRoot = this repository. S2 R-steps only (the shape of DEMO-19 4b): as S1 with -BaseRoot = the app repository.
# S3 R-base only: steps outside any git worktree, -BaseRoot = this repository's root in upper case / with a trailing
#    separator. Each of S1–S3: exit 4, the rules listed, no marker, no port check, preflight, build, dist check or step.
# S4 allowed forms log "call location ok": current dir and steps in the app repository; current dir and steps in this
#    repository (artifacts/ci/, git-ignored, removed afterwards).
# S5 a full -Stub pass run (builds once, no browser) logs "dist check web-dist: ok" and ends with 0.
# S6 a copy of the runner whose scripts/demo/assert-web-dist.ps1 is a stand-in printing "web-dist: stale (stand-in)"
#    and exiting 4, run from this repository (builds once): exit 5 before the precheck and any step.
# Exit 0 when every check passes, 1 otherwise.
param([Parameter(Mandatory)] [string] $OutDir)
if ($PSVersionTable.PSVersion.Major -lt 7 -or -not $IsWindows) { Write-Host "selftest-location.ps1 needs PowerShell 7 on Windows"; exit 2 }
$ErrorActionPreference = 'Stop'
# Reused helpers: New-CheckResult, Invoke-SlotRunner, Test-StoppedBeforeBuild.
. (Join-Path $PSScriptRoot 'selftest-preflight.ps1')

$OutDir = [IO.Path]::GetFullPath($ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutDir))
$repoRoot = [IO.Path]::GetFullPath((git -C $PSScriptRoot rev-parse --show-toplevel)).TrimEnd('\', '/') + '\'
if (($OutDir.TrimEnd('\', '/') + '\').StartsWith($repoRoot, [StringComparison]::OrdinalIgnoreCase)) { Write-Host "-OutDir must be outside the repository ($repoRoot)"; exit 4 }
New-Item -ItemType Directory -Force $OutDir | Out-Null
$log = Join-Path $OutDir 'selftest-location.log'
function Say([string] $text) { $line = "$((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')) $text"; Write-Host $line; Add-Content $log $line }

$script:MARKER_FILE = 'steps-file-ran.txt'
$script:ABORT_RULES = 'ABORT: call location rules='
# Log lines of the actions the check must prevent (port checks and the static preflight; Test-StoppedBeforeBuild covers the rest).
$script:EARLY_ACTIONS = 'ports free|port busy|ports not given|port lookup|preflight'
$script:STEPS_FILE_TEXT = @"
param([string] `$OutDir, [string] `$Root, [string] `$BaseRoot)
Set-Content (Join-Path `$OutDir '$script:MARKER_FILE') 'the steps file ran'
"@

# A port no process listens on right now (the OS picks it; released before use).
function Get-FreePort {
  $probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
  $probe.Start(); $port = $probe.LocalEndpoint.Port; $probe.Stop()
  return $port
}

# The same top-level form the runner logs: full path, no trailing separator.
function Get-GitTop([string] $Dir) { [IO.Path]::GetFullPath((git -C $Dir rev-parse --show-toplevel)).TrimEnd('\', '/') }

function New-MarkerSteps([string] $Dir) {
  New-Item -ItemType Directory -Force $Dir | Out-Null
  $file = Join-Path $Dir 'marker-steps.ps1'
  Set-Content $file $script:STEPS_FILE_TEXT
  return $file
}

function New-CommittedRepo([string] $Path) {
  git -C $Path init --quiet 2>&1 | Out-Null
  git -C $Path add --all 2>&1 | Out-Null
  git -C $Path -c user.name=slot-selftest -c user.email=slot-selftest@invalid commit --quiet -m 'selftest-location' 2>&1 | Out-Null
  return $Path
}

function Get-LogLines($Run, [string] $Pattern) { ($Run.Log -split "`n" | Where-Object { $_ -match $Pattern }) -join ' ' }

# True when the run stopped before the steps file and every later action.
function Test-NoAction($Run) {
  return $Run.Files -notcontains $script:MARKER_FILE -and $Run.Log -notmatch $script:EARLY_ACTIONS -and (Test-StoppedBeforeBuild $Run)
}

function Test-Rejected($Run, [string] $Rules) {
  return $Run.Code -eq 4 -and $Run.Log -match "$([regex]::Escape("$script:ABORT_RULES$Rules")) " -and (Test-NoAction $Run)
}

function Get-RejectionDetail($Run) {
  "exit=$($Run.Code) marker=$($Run.Files -contains $script:MARKER_FILE) $(Get-LogLines $Run 'call location|produced no steps')"
}

function Get-RuleResults([string] $PwshExe, [string] $Runner, [string] $Root, [string] $AppSteps, [string] $AppRoot, [string] $LooseSteps) {
  $run = { param($tag, $parameters) Invoke-SlotRunner $PwshExe $Runner $Root (Join-Path $OutDir "run-$tag") (@{ Stub = 'pass'; Ports = (Get-FreePort) } + $parameters) }

  $r = & $run 's1' @{ StepsFile = $AppSteps; BaseRoot = $Root }
  New-CheckResult 'S1 constructed: steps in the app repository, -BaseRoot = current root: exit 4, R-base and R-steps, no action' (Test-Rejected $r 'R-base,R-steps') (Get-RejectionDetail $r)

  $r = & $run 's2' @{ StepsFile = $AppSteps; BaseRoot = $AppRoot }
  New-CheckResult 'S2 DEMO-19 4b shape: steps and -BaseRoot in the app repository: exit 4, R-steps only, no action' (Test-Rejected $r 'R-steps') (Get-RejectionDetail $r)

  # A trailing '/' rather than '\': '\"' would escape the closing quote on the command line; the runner normalizes it to '\'.
  foreach ($variant in @(@{ Tag = 's3-case'; Base = $Root.ToUpperInvariant() }, @{ Tag = 's3-separator'; Base = "$Root/" })) {
    $r = & $run $variant.Tag @{ StepsFile = $LooseSteps; BaseRoot = $variant.Base }
    New-CheckResult "S3 steps outside git, -BaseRoot=[$($variant.Base)]: exit 4, R-base only, no action" (Test-Rejected $r 'R-base') (Get-RejectionDetail $r)
  }
}

function Get-AllowedResults([string] $PwshExe, [string] $Runner, [string] $Root, [string] $AppSteps, [string] $AppRoot) {
  $tool = Get-GitTop $PSScriptRoot
  $inRepoDir = Join-Path $Root 'artifacts\ci\slot-location-selftest'
  $cases = @(
    @{ Tag = 's4-app'; Cwd = $AppRoot; Steps = $AppSteps; Label = 'S4 current dir and steps in the app repository' },
    @{ Tag = 's4-tool'; Cwd = $Root; Steps = (New-MarkerSteps $inRepoDir); Label = 'S4 current dir and steps in this repository' }
  )
  try {
    foreach ($case in $cases) {
      $r = Invoke-SlotRunner $PwshExe $Runner $case.Cwd (Join-Path $OutDir "run-$($case.Tag)") @{ StepsFile = $case.Steps; Stub = 'pass' }
      $top = Get-GitTop $case.Cwd
      $ok = $r.Log -match [regex]::Escape("call location ok root=$top tool=$tool steps-worktree=$top") -and $r.Files -contains $script:MARKER_FILE
      New-CheckResult "$($case.Label): call location ok root=$top tool=$tool steps-worktree=$top" $ok (Get-RejectionDetail $r)
    }
  } finally { Remove-Item -Recurse -Force $inRepoDir -ErrorAction SilentlyContinue }
}

# A git repository holding a copy of the runner, the files it dot-sources or calls, and a stand-in assert-web-dist.ps1.
function New-RunnerCopy([string] $Path) {
  $slot = New-Item -ItemType Directory -Force (Join-Path $Path 'scripts\slot')
  $demo = New-Item -ItemType Directory -Force (Join-Path $Path 'scripts\demo')
  foreach ($name in @('slot-run.ps1', 'procs.ps1', 'step-env.ps1', 'preflight.mjs', 'preflight', 'steps.example.ps1')) {
    Copy-Item (Join-Path $PSScriptRoot $name) $slot -Recurse
  }
  Set-Content (Join-Path $demo 'assert-web-dist.ps1') "param([string] `$Root)`nWrite-Output 'web-dist: stale (stand-in)'`nexit 4"
  return New-CommittedRepo $Path
}

function Get-DistResults([string] $PwshExe, [string] $Runner, [string] $Root) {
  $steps = Join-Path $PSScriptRoot 'steps.example.ps1'
  $r = Invoke-SlotRunner $PwshExe $Runner $Root (Join-Path $OutDir 'run-s5') @{ StepsFile = $steps; Stub = 'pass'; Ports = (Get-FreePort) }
  $ok = $r.Code -eq 0 -and $r.Log -match 'dist check web-dist: ok '
  New-CheckResult 'S5 full -Stub pass run: dist check web-dist: ok, exit 0' $ok "exit=$($r.Code) $(Get-LogLines $r 'dist check')"

  $copy = New-RunnerCopy (Join-Path $OutDir 'runner-copy')
  $copySteps = Join-Path $copy 'scripts\slot\steps.example.ps1'
  $r = Invoke-SlotRunner $PwshExe (Join-Path $copy 'scripts\slot\slot-run.ps1') $Root (Join-Path $OutDir 'run-s6') @{ StepsFile = $copySteps; Stub = 'pass'; Ports = (Get-FreePort) }
  $stepFiles = @($r.Files | Where-Object { $_ -like '*-start-rev.txt' -or $_ -like '*.out.log' })
  $ok = $r.Code -eq 5 -and $r.Log -match 'dist check web-dist: stale \(stand-in\)' -and $r.Log -match 'ABORT: dist check exit 4' -and $r.Log -notmatch 'precheck|step ' -and $stepFiles.Count -eq 0
  New-CheckResult 'S6 stand-in assert-web-dist.ps1 exits 4: runner exit 5 before the precheck and any step' $ok "exit=$($r.Code) $(Get-LogLines $r 'dist check')"
}

$pwshExe = (Get-Process -Id $PID).Path
$runner = Join-Path $PSScriptRoot 'slot-run.ps1'
$root = $repoRoot.TrimEnd('\')
$appRoot = Join-Path $OutDir 'app'
$appSteps = New-MarkerSteps $appRoot
$null = New-CommittedRepo $appRoot
$looseSteps = New-MarkerSteps (Join-Path $OutDir 'loose')
Say "selftest-location start head=$(git -C $PSScriptRoot rev-parse HEAD) outdir=$OutDir"
$results = @(Get-RuleResults $pwshExe $runner $root $appSteps $appRoot $looseSteps) + @(Get-AllowedResults $pwshExe $runner $root $appSteps $appRoot) + @(Get-DistResults $pwshExe $runner $root)
foreach ($c in $results) { Say "$(if ($c.Ok) { 'PASS' } else { 'FAIL' }) $($c.Label) $($c.Detail)" }
$failed = @($results | Where-Object { -not $_.Ok }).Count
Say "summary: $($results.Count) checks; $($results.Count - $failed) PASS, $failed FAIL"
Say "selftest-location $(if ($failed) { "FAILED ($failed)" } else { 'passed' })"
exit [int]($failed -ne 0)
