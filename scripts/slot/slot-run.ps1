# Exclusive-slot runner (roadmap §5 "E2E 独占时段"; from the D316 GATE-01 kit, gist 4e00af7, SLOT-01).
#   pwsh -File scripts/slot/slot-run.ps1 -OutDir DIR_OUTSIDE_REPO -StepsFile STEPS.ps1 [-BaseRoot BASE_WORKTREE]
# Sampling rules: version R1 of roadmap §5 "进程采样规则", implemented in procs.ps1.
# Counted process: any process outside this runner's own process tree whose image name is applicable
# (node, cmd, any Chrome or Edge, vite, esbuild, biome, tsc, npm, npx; D314: no command-line prefilter;
# an unreadable command line counts as unknown ownership), unless procs.ps1 attributes it to a repository
# other than ai-native-erp (D311) or a system browser / its cmd.exe (D315, D316, D320). Every excluded process is
# logged in excluded.tsv and slot-summary.log with its rule id (SR-X1–X5); each sample also logs one
# "runner-tree n=…" line (SR-R1: this runner's own tree, neither counted nor excluded).
# Precheck: 6 consecutive counts of 0 at 10 s intervals, waiting at most 15 min. Each step runs once; during it the runner samples every 10 s and aborts (exit 2) on any
# counted process, or (exit 1) on any non-zero step exit. No step is retried.
param([Parameter(Mandatory)] [string] $OutDir, [Parameter(Mandatory)] [string] $StepsFile, [string] $BaseRoot = "", [string] $Stub = "")
# -StepsFile: a script called as  & $StepsFile -OutDir $OutDir -Root $root -BaseRoot $BaseRoot  that returns the
# steps, each @{ name; dir; file; args; env = @{} } (see steps.example.ps1). It replaces the kit's GATE-01 list.
# -Stub pass | fail:<step>: browserless rehearsal; every step is replaced by a node one-liner (a failing
# e2e stub writes a vitest-shaped JSON report so the failure-text extraction is exercised). Never set
# for the real slot.
if ($PSVersionTable.PSEdition -eq 'Core' -and -not $IsWindows) { Write-Host "slot-run.ps1 只能在 Windows 运行 (Windows only)"; exit 2 }
# procs.ps1 needs .NET Core ([IO.Path]::GetFullPath(path, base)); see selftest.ps1.
if ($PSVersionTable.PSVersion.Major -lt 7) { Write-Host "slot-run.ps1 needs PowerShell 7 (pwsh)"; exit 2 }
$ErrorActionPreference = "Stop"
# Candidate pattern, ownership rules and Counted (rule version R1) live in procs.ps1.
. (Join-Path $PSScriptRoot 'procs.ps1')
# Logs and slot data never go into the repository (SLOT-01); keep the directory and archive it, do not delete it.
$repoRoot = [IO.Path]::GetFullPath((git -C $PSScriptRoot rev-parse --show-toplevel)).TrimEnd('\', '/') + '\'
if (([IO.Path]::GetFullPath($OutDir).TrimEnd('\', '/') + '\').StartsWith($repoRoot, [StringComparison]::OrdinalIgnoreCase)) { Write-Host "-OutDir must be outside the repository ($repoRoot)"; exit 4 }
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
  Add-Content $samples "$at`t$phase`t$($hits.Count)`t$detail`t$($script:lastExcluded.Count)`t$($script:lastRunnerTree)"
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
$script:ever = @{ [int]$PID = $true }  # SR-R1: this runner's tree starts at its own PID (kit slot-run.ps1:46)
$script:excludedSeen = @{}
$excluded = Join-Path $OutDir "excluded.tsv"
if (-not (Test-Path $samples)) { Set-Content $samples "utc`tphase`tcounted`tdetail`texcluded`trunner-tree" }
if (-not (Test-Path $excluded)) { Set-Content $excluded "utc`tphase`tpid`tname`trule`treason`tcmdline" }

$root = (git rev-parse --show-toplevel)
Set-Location $root
$head = (git rev-parse HEAD)
Say "runner start head=$head rules=$($script:SlotRuleVersion) status=[$(git status --porcelain --untracked-files=all)]"
if (-not (Test-Path -LiteralPath $StepsFile -PathType Leaf)) { Say "missing -StepsFile $StepsFile"; exit 4 }
if ($BaseRoot) {
  if (-not (Test-Path -LiteralPath $BaseRoot -PathType Container)) { Say "missing -BaseRoot $BaseRoot"; exit 4 }
  Say "base head=$(git -C $BaseRoot rev-parse HEAD) status=[$(git -C $BaseRoot status --porcelain --untracked-files=all)]"
}
# Build gate (roadmap §5 item 8): build this tree, then require packages/web/dist/index.html to be strictly
# newer than the HEAD commit time; otherwise stop before any browser or measurement step runs.
Say "build start"
& cmd.exe /d /c "npm run build" *> (Join-Path $OutDir "build.log")
if ($LASTEXITCODE -ne 0) { Say "ABORT: build exit $LASTEXITCODE"; exit 1 }
$headTime = [DateTimeOffset]::Parse((git log -1 --format=%cI HEAD)).UtcDateTime
$distTime = (Get-Item (Join-Path $root 'packages/web/dist/index.html')).LastWriteTimeUtc
Say "dist check head-commit=$($headTime.ToString('o')) dist-index=$($distTime.ToString('o')) newer=$($distTime -gt $headTime)"
if (-not ($distTime -gt $headTime)) { Say "ABORT: dist not newer than HEAD commit"; exit 5 }
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
$steps = @(& $StepsFile -OutDir $OutDir -Root $root -BaseRoot $BaseRoot)
Say "steps from $StepsFile`: $(($steps | ForEach-Object { $_.name }) -join ', ')"
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
foreach ($step in $steps) {
  $name = $step.name
  Set-Content (Join-Path $OutDir "$name-start-rev.txt") "$(git rev-parse HEAD)`n$(git status --porcelain --untracked-files=all)"
  foreach ($k in $step.env.Keys) { Set-Item "env:$k" $step.env[$k] }
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
  foreach ($k in $step.env.Keys) { Remove-Item "env:$k" }
  Set-Content (Join-Path $OutDir "$name-end-rev.txt") "$(git rev-parse HEAD)`n$(git status --porcelain --untracked-files=all)"
  $c = Sample "after-$name"
  Say "step $name exit=$code counted-after=$c"
  if ($code -ne 0) { if ($name -like "e2e-*") { Failures $name }; Say "ABORT: $name exit $code"; exit 1 }
  if ($c -gt 0 -and $Stub) { Say "stub: external counted=$c after $name (a real run aborts here, exit 2)" }
  elseif ($c -gt 0) { Say "ABORT: external counted process after $name (counted=$c)"; exit 2 }
}
Say "runner done head=$head status=[$(git status --porcelain --untracked-files=all)]"
exit 0

