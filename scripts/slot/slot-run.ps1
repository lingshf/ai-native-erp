# Exclusive-slot runner (roadmap §5 "E2E 独占时段"; from the D316 GATE-01 kit, gist 4e00af7, SLOT-01).
#   pwsh -File scripts/slot/slot-run.ps1 -OutDir DIR_OUTSIDE_REPO -StepsFile STEPS.ps1 -Ports PORT [-BaseRoot BASE_WORKTREE] [-PreflightFiles PATH,...]
# Sampling rules: version R3 of roadmap §5 "进程采样规则", implemented in procs.ps1.
# Counted process: any process outside this runner's own process tree whose image name is applicable
# (node, cmd, any Chrome or Edge, vite, esbuild, biome, tsc, npm, npx; D314: no command-line prefilter) that
# procs.ps1 attributes to ai-native-erp, any of its worktrees included (SR-C2, D442). Other repositories (D311), system
# browsers / their cmd.exe (D315, D316, D320) and, from R3, unknown ownership (SR-X6, D472) are excluded. Every excluded
# process is logged in excluded.tsv and slot-summary.log with its rule id (SR-X1–X6); processes.tsv gives each sample's
# SR-X6 count; each sample also logs one "runner-tree n=…" line (SR-R1: this runner's own tree, neither counted nor excluded).
# Precheck: 6 consecutive counts of 0 at 10 s intervals, waiting at most 15 min. Each step runs once; during it the runner samples every 10 s and aborts (exit 2) on any
# counted process, or (exit 1) on any non-zero step exit. No step is retried.
# Port gate (R3, D472): -Ports lists the slot's ports (required unless -Stub, else exit 4 before the build). They are
# checked after the steps are loaded (before the static preflight, the build and the process precheck) and again after
# the precheck, before the first step; a TCP listener on any of them (any address, IPv4 / IPv6) ends the run with
# exit 7, no wait, no retry (D444). A failed port lookup (provider error or exception) ends the run with exit 8 (D475).
# Static preflight (S12 SLOT-02, D407 / D408): before the build, preflight.mjs checks head (with -PreflightFiles), then
# base; its exit code 4 (input or configuration error) or 6 (new finding) ends the run with that same code before the
# build, the dist check, the process precheck and any step. Each step gets the PSModulePath from step-env.ps1.
# Call location (SLOT-04): R-base (-BaseRoot is the current root) or R-steps (steps file in a third worktree): exit 4, no action.
param([Parameter(Mandatory)] [string] $OutDir, [Parameter(Mandatory)] [string] $StepsFile, [string] $BaseRoot = "", [string] $Stub = "",
  [string[]] $PreflightFiles = @(), [int[]] $Ports = @())
# -StepsFile: a script called as  & $StepsFile -OutDir $OutDir -Root $root -BaseRoot $BaseRoot  that returns the
# steps, each @{ name; dir; file; args; env = @{} } (see steps.example.ps1). It replaces the kit's GATE-01 list.
# -Stub pass | fail:<step>: browserless rehearsal; every step is replaced by a node one-liner (a failing
# e2e stub writes a vitest-shaped JSON report so the failure-text extraction is exercised). Never set
# for the real slot.
if ($PSVersionTable.PSEdition -eq 'Core' -and -not $IsWindows) { Write-Host "slot-run.ps1 只能在 Windows 运行 (Windows only)"; exit 2 }
# procs.ps1 needs .NET Core ([IO.Path]::GetFullPath(path, base)); see selftest.ps1.
if ($PSVersionTable.PSVersion.Major -lt 7) { Write-Host "slot-run.ps1 needs PowerShell 7 (pwsh)"; exit 2 }
$ErrorActionPreference = "Stop"
# Relative -OutDir / -StepsFile / -BaseRoot are resolved once, here, against the caller's current location; the check
# below and every write use these absolute paths, so the Set-Location to the repository root further down cannot move
# the logs (or put them into the worktree).
$OutDir = [IO.Path]::GetFullPath($ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutDir))
$StepsFile = [IO.Path]::GetFullPath($ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($StepsFile))
if ($BaseRoot) { $BaseRoot = [IO.Path]::GetFullPath($ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($BaseRoot)) }
$PreflightFiles = @($PreflightFiles | ForEach-Object { [IO.Path]::GetFullPath($ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($_)) })
# Candidate pattern, ownership rules and Counted (rule version R3) live in procs.ps1.
. (Join-Path $PSScriptRoot 'procs.ps1')
. (Join-Path $PSScriptRoot 'step-env.ps1')
# Logs and slot data never go into the repository (SLOT-01); keep the directory and archive it, do not delete it.
$repoRoot = [IO.Path]::GetFullPath((git -C $PSScriptRoot rev-parse --show-toplevel)).TrimEnd('\', '/') + '\'
if (($OutDir.TrimEnd('\', '/') + '\').StartsWith($repoRoot, [StringComparison]::OrdinalIgnoreCase)) { Write-Host "-OutDir must be outside the repository ($repoRoot)"; exit 4 }
New-Item -ItemType Directory -Force $OutDir | Out-Null
$samples = Join-Path $OutDir "processes.tsv"
$log = Join-Path $OutDir "slot-summary.log"
function Say([string] $text) { $line = "$((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')) $text"; Write-Host $line; Add-Content $log $line }
# A runner exception (not a step's exit code) is written in full and ends the run as exit 1; nothing is cleaned up.
trap { Say "EXCEPTION: $($_ | Out-String)"; exit 1 }
# The failing assertions' original text from a vitest JSON report, saved next to it.
function Failures([string] $name) {
  $report = Join-Path $OutDir "$name-report.json"
  $file = Join-Path $OutDir "$name-failures.txt"
  if (-not (Test-Path $report)) { Set-Content $file "no JSON report: original assertion lost"; Say "failures: no report"; return }
  $json = Get-Content $report -Raw | ConvertFrom-Json
  $lines = foreach ($suite in $json.testResults) { foreach ($t in $suite.assertionResults) { if ($t.status -eq "failed") {
    "=== $($suite.name) > $($t.fullName)"; $t.failureMessages } } }
  Set-Content $file ($lines -join "`n")
  Say "failures: $(@($json.testResults.assertionResults | Where-Object status -eq 'failed').Count) failed, text in $file"
}
function Sample([string] $phase) {
  $hits = Counted
  $at = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
  $detail = ($hits | ForEach-Object { $cl = $_.CommandLine -replace '\s+', ' '; "$($_.ProcessId):$($_.Name):$($cl.Substring(0, [Math]::Min(200, $cl.Length))) [$($_.Owner)]" }) -join " | "
  $unknown = @($script:lastExcluded | Where-Object Rule -eq 'SR-X6').Count
  Add-Content $samples "$at`t$phase`t$($hits.Count)`t$detail`t$($script:lastExcluded.Count)`t$($script:lastRunnerTree)`t$unknown"
  # SR-R1 is only ever reported here, never as an exclusion.
  Say "runner-tree n=$($script:lastRunnerTree) phase=$phase"
  # Every excluded process, every sample, in full; the summary log names each excluded PID once.
  foreach ($x in $script:lastExcluded) {
    $cl = $x.CommandLine -replace '\s+', ' '
    Add-Content $excluded "$at`t$phase`t$($x.ProcessId)`t$($x.Name)`t$($x.Rule)`t$($x.Owner)`t$cl"
    if (-not $script:excludedSeen.ContainsKey([int]$x.ProcessId)) { $script:excludedSeen[[int]$x.ProcessId] = $true; Say "excluded pid=$($x.ProcessId) rule=$($x.Rule) name=$($x.Name) reason=[$($x.Owner)] cmdline=[$cl]" }
  }
  return $hits.Count
}
# Runs one checkout's preflight.mjs into preflight-<label>.log and returns its exit code unchanged.
function Invoke-Preflight([string] $label, [string] $script, [string] $checkoutRoot, [string[]] $files) {
  $preflightLog = Join-Path $OutDir "preflight-$label.log"
  $arguments = @($script, '--root', $checkoutRoot) + $(if ($files.Count) { @('--files') + $files } else { @() })
  & node @arguments *> $preflightLog
  $code = $LASTEXITCODE
  Say "preflight $label exit=$code log=$preflightLog $(Get-Content $preflightLog -Tail 1)"
  return $code
}
# Port gate (R3, D472). The listener's owner gets the verdict procs.ps1 gives it in a fresh snapshot.
function Get-PortOwnerText([int] $owningPid) {
  $snapshot = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name, CommandLine, ExecutablePath, CreationDate)
  $null = Counted $snapshot
  $p = $snapshot | Where-Object { [int]$_.ProcessId -eq $owningPid } | Select-Object -First 1
  if (-not $p) { return "pid=$owningPid (exited)" }
  $verdict = if ($p.Rule) { $p.Owner } elseif ($script:ever.ContainsKey($owningPid)) { 'SR-R1 runner tree' } else { 'SR-C1 not a candidate' }
  "pid=$owningPid name=$($p.Name) cmdline=[$($p.CommandLine -replace '\s+', ' ')] verdict=[$verdict]"
}
# Listen-state TCP connections on -Ports. Every lookup error is logged in full, including non-terminating errors that a
# later throw follows, and the run ends with exit 8: a port that could not be checked is never treated as free (D475). No retry.
# -ErrorVariable keeps the records written before a throw; the catch adds the thrown record. Each exception is logged once.
function Get-PortListeners([string] $phase) {
  $lookupErrors = @()
  try { $all = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue -ErrorVariable lookupErrors) }
  catch { $lookupErrors = @($lookupErrors) + $_ }
  if ($lookupErrors.Count -eq 0) { return @($all | Where-Object { $Ports -contains [int]$_.LocalPort }) }
  $logged = [Collections.Generic.HashSet[object]]::new([Collections.Generic.ReferenceEqualityComparer]::Instance)
  foreach ($e in $lookupErrors) {
    $record = if ($e -is [Management.Automation.ErrorRecord]) { $e } else { $e.ErrorRecord }
    if (-not $logged.Add($record.Exception)) { continue }
    Say "port lookup failed phase=$phase id=[$($record.FullyQualifiedErrorId)] category=[$($record.CategoryInfo)] exception=[$($record.Exception.GetType().FullName)] message=[$($record.Exception.Message -replace '\s+', ' ')]"
  }
  Say "ABORT: port lookup failed ($phase)"
  exit 8
}
# Ends the run with exit 7 when a listener is confirmed on any -Ports port; never waits or retries (D444).
function Assert-PortsFree([string] $phase) {
  if ($Ports.Count -eq 0) { Say "ports not given (stub) phase=$phase"; return }
  $listeners = @(Get-PortListeners $phase)
  if ($listeners.Count -eq 0) { Say "ports free phase=$phase ports=$($Ports -join ',')"; return }
  foreach ($l in $listeners) { Say "port busy phase=$phase port=$($l.LocalPort) address=$($l.LocalAddress) $(Get-PortOwnerText ([int]$l.OwningProcess))" }
  Say "ABORT: slot port in use ($phase)"
  exit 7
}
# A directory's git worktree top level (full path, no trailing separator), or $null outside any git worktree.
function Get-WorktreeTop([string] $dir) {
  $top = git -C $dir rev-parse --show-toplevel 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $top) { return $null }
  return [IO.Path]::GetFullPath($top).TrimEnd('\', '/')
}
# Call location (SLOT-04): exit 4 before the steps file runs when R-base or R-steps holds. -eq / -notin ignore case.
# The current directory may be outside git (selftest.ps1 Part 4): root is then none and equals no worktree.
function Assert-CallLocation([string] $checkoutRoot, [string] $stepsPath, [string] $baseRootPath) {
  $rootTop = $checkoutRoot ? [IO.Path]::GetFullPath($checkoutRoot).TrimEnd('\', '/') : $null
  $toolTop = Get-WorktreeTop $PSScriptRoot
  $stepsTop = Get-WorktreeTop (Split-Path -Parent $stepsPath)
  $baseTop = if ($baseRootPath) { (Get-WorktreeTop $baseRootPath) ?? $baseRootPath.TrimEnd('\', '/') }
  $broken = @()
  if ($baseTop -and $baseTop -eq $rootTop) { $broken += $script:RULE_BASE }
  if ($stepsTop -and $stepsTop -notin @($rootTop, $toolTop)) { $broken += $script:RULE_STEPS }
  $where = "root=$($rootTop ?? 'none') tool=$toolTop steps-worktree=$($stepsTop ?? 'none')"
  if ($broken.Count -eq 0) { Say "call location ok $where"; return }
  Say "ABORT: call location rules=$($broken -join ',') $where base-root=$($baseRootPath ? $baseRootPath : 'none'); run from the app worktree: pwsh -File $(Join-Path $PSScriptRoot 'slot-run.ps1') …"
  exit 4
}
# Dist gate (roadmap §5 item 8; RUNMAIN-01 rule): the script's exit ends only that script; non-zero ends the run with 5.
function Invoke-WebDistCheck([string] $assertScript, [string] $checkoutRoot) {
  $line = (& $assertScript -Root $checkoutRoot) -join ' '
  $code = $LASTEXITCODE
  Say "dist check $line"
  if ($code -ne 0) { Say "ABORT: dist check exit $code"; exit 5 }
}
$script:RULE_BASE = 'R-base'; $script:RULE_STEPS = 'R-steps'
$webDistScript = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\demo\assert-web-dist.ps1'))
$script:ever = @{ [int]$PID = $true }  # SR-R1: this runner's tree starts at its own PID (kit slot-run.ps1:46)
$script:excludedSeen = @{}
$excluded = Join-Path $OutDir "excluded.tsv"
if (-not (Test-Path $samples)) { Set-Content $samples "utc`tphase`tcounted`tdetail`texcluded`trunner-tree`tsr-x6" }
if (-not (Test-Path $excluded)) { Set-Content $excluded "utc`tphase`tpid`tname`trule`treason`tcmdline" }

$root = (git rev-parse --show-toplevel)
Set-Location $root
$head = (git rev-parse HEAD)
Say "runner start head=$head rules=$($script:SlotRuleVersion) ports=$(if ($Ports.Count) { $Ports -join ',' } else { 'none' }) status=[$(git status --porcelain --untracked-files=all)]"
# The scripts may come from another worktree than the app under test (DEMO-15): log both SHAs.
Say "tooling head=$(git -C $PSScriptRoot rev-parse HEAD) dir=$PSScriptRoot"
if (-not (Test-Path -LiteralPath $StepsFile -PathType Leaf)) { Say "missing -StepsFile $StepsFile"; exit 4 }
if (-not $Stub -and $Ports.Count -eq 0) { Say "missing -Ports: a run without -Stub must name the slot's ports (R3, D472)"; exit 4 }
if (@($Ports | Where-Object { $_ -lt 1 -or $_ -gt 65535 }).Count) { Say "invalid -Ports $($Ports -join ',')"; exit 4 }
if (-not (Test-Path -LiteralPath $webDistScript -PathType Leaf)) { Say "missing $webDistScript"; exit 4 }
if ($BaseRoot) {
  if (-not (Test-Path -LiteralPath $BaseRoot -PathType Container)) { Say "missing -BaseRoot $BaseRoot"; exit 4 }
  Say "base head=$(git -C $BaseRoot rev-parse HEAD) status=[$(git -C $BaseRoot status --porcelain --untracked-files=all)]"
}
Assert-CallLocation $root $StepsFile $BaseRoot
# Steps are loaded before the build so a steps file that rejects its inputs stops the run first (kit: exit 4).
try { $steps = @(& $StepsFile -OutDir $OutDir -Root $root -BaseRoot $BaseRoot | Where-Object { $null -ne $_ }) } catch { Say "$($_.Exception.Message)"; exit 4 }
# A steps file that yields no step would otherwise pass the precheck and report success without running anything.
if ($steps.Count -eq 0) { Say "ABORT: -StepsFile $StepsFile produced no steps"; exit 4 }
Say "steps from $StepsFile`: $(($steps | ForEach-Object { $_.name }) -join ', ')"
Assert-PortsFree 'before-preflight'
$code = Invoke-Preflight 'head' (Join-Path $PSScriptRoot 'preflight.mjs') $root $PreflightFiles
if ($code -ne 0) { Say "ABORT: preflight head exit $code"; exit $code }
$basePreflight = if ($BaseRoot) { Join-Path $BaseRoot 'scripts/slot/preflight.mjs' } else { '' }
if (-not $BaseRoot) { Say "base preflight skipped (no -BaseRoot)" }
elseif (-not (Test-Path -LiteralPath $basePreflight -PathType Leaf)) { Say "base preflight skipped (no preflight.mjs)" }
else {
  $code = Invoke-Preflight 'base' $basePreflight $BaseRoot @()
  if ($code -ne 0) { Say "ABORT: preflight base exit $code"; exit $code }
}
# Build gate (roadmap §5 item 8): build this tree, then the dist check (Invoke-WebDistCheck) before any browser or
# measurement step runs.
Say "build start"
& cmd.exe /d /c "npm run build" *> (Join-Path $OutDir "build.log")
if ($LASTEXITCODE -ne 0) { Say "ABORT: build exit $LASTEXITCODE"; exit 1 }
Invoke-WebDistCheck $webDistScript $root
$zeros = 0; $deadline = (Get-Date).AddMinutes(15); $n = 0
# Stub: one logged sample instead of the gate (other sessions may be working; a real run waits for 6 zeros).
if ($Stub) { $c = Sample "precheck-stub"; Say "precheck stub counted=$c (not gating)"; $zeros = 6 }
while ($zeros -lt 6) {
  if ((Get-Date) -gt $deadline) { Say "precheck timeout after 15 min"; exit 3 }
  $n++; $c = Sample "precheck-$n"
  if ($c -eq 0) { $zeros++ } else { $zeros = 0 }
  Say "precheck $n counted=$c consecutive-zero=$zeros"
  if ($zeros -lt 6) { Start-Sleep -Seconds 10 }
}
if ($Stub) {
  Say "STUB MODE ${Stub}: no browser, no vitest"
  foreach ($step in $steps) {
    $fail = $Stub -eq "fail:$($step.name)"
    $report = (Join-Path $OutDir "$($step.name)-report.json") -replace '\\', '/'
    $js = if ($fail -and $step.name -like "e2e-*") {
      "require('fs').writeFileSync('$report', JSON.stringify({testResults:[{name:'stub.slow.test.ts',assertionResults:[{fullName:'stub test',status:'failed',failureMessages:['AssertionError: stub expected 1 to be 0']}]}]}));console.error('stub $($step.name) failed');process.exit(1)"
    } elseif ($fail) { "console.error('stub $($step.name) failed');process.exit(1)" } else { "console.log('stub $($step.name) ok')" }
    $step.file = "node"; $step.args = "-e `"$js`""
  }
}
Assert-PortsFree 'before-steps'
foreach ($step in $steps) {
  $name = $step.name
  Set-Content (Join-Path $OutDir "$name-start-rev.txt") "$(git rev-parse HEAD)`n$(git status --porcelain --untracked-files=all)"
  $stepEnvironment = Get-StepEnvironment $step.env
  $savedEnvironment = Set-StepEnvironment $stepEnvironment
  Say "step $name PSModulePath=$($stepEnvironment.PSModulePath)"
  Say "step $name start: [$($step.dir)] $($step.file) $($step.args)"
  $proc = Start-Process -FilePath $step.file -ArgumentList $step.args -WorkingDirectory $step.dir -NoNewWindow -PassThru `
    -RedirectStandardOutput (Join-Path $OutDir "$name.out.log") -RedirectStandardError (Join-Path $OutDir "$name.err.log")
  $null = $proc.Handle
  while (-not $proc.WaitForExit(10000)) {
    $c = Sample "run-$name"
    if ($c -gt 0) {
      Say "ABORT: external counted process during $name (counted=$c)"
      & taskkill.exe /PID $proc.Id /T /F | Out-Null
      exit 2
    }
  }
  $proc.WaitForExit()
  $code = $proc.ExitCode
  Restore-StepEnvironment $savedEnvironment
  Set-Content (Join-Path $OutDir "$name-end-rev.txt") "$(git rev-parse HEAD)`n$(git status --porcelain --untracked-files=all)"
  $c = Sample "after-$name"
  Say "step $name exit=$code counted-after=$c"
  if ($code -ne 0) { if ($name -like "e2e-*") { Failures $name }; Say "ABORT: $name exit $code"; exit 1 }
  if ($c -gt 0 -and $Stub) { Say "stub: external counted=$c after $name (a real run aborts here, exit 2)" }
  elseif ($c -gt 0) { Say "ABORT: external counted process after $name (counted=$c)"; exit 2 }
}
Say "runner done head=$head status=[$(git status --porcelain --untracked-files=all)]"
exit 0

