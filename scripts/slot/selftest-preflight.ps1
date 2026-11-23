# Part 5 of selftest.ps1 (S12 SLOT-02, D407 / D408; S11 retrospective actions 2 and 3). Dot-sourced by selftest.ps1,
# which passes every input explicitly and logs each returned result through its Check:
#   Get-PreflightSelftestResults -SlotDir scripts/slot -RepoRoot ROOT -WorkDir DIR_OUTSIDE_REPO -PwshExe PWSH
# I1: a Windows PowerShell 5.1 probe loads its built-in hash cmdlet with the step PSModulePath (and, as the D387
# control, fails with this pwsh 7's inherited one); a step's own env.PSModulePath wins; lines this branch adds use the
# .NET hash and GUID APIs. I4: the TDZ fixtures. I5: slot-run.ps1 passes preflight exit 4 / 6 through before the
# build, the process precheck and any step, runs base only after a clean head, and logs the skipped base preflight.
# Every runner run here is -Stub or ends in the preflight: no browser, no vitest.
. (Join-Path $PSScriptRoot 'step-env.ps1')

$script:CORRUPT_BASELINE = '{ "tsc": { "TS2322: broken": 0 }'
$script:DOTNET_RULE_PATTERN = 'Get-File[H]ash|New-[G]uid'
$script:PROBE_RELATIVE_PATH = 'scripts/slot/fixtures/psmodulepath-probe.ps1'

function New-CheckResult([string] $Label, [bool] $Ok, [string] $Detail) {
  [pscustomobject]@{ Label = $Label; Ok = $Ok; Detail = $Detail; Skip = $false }
}

# A check that does not apply here (logged as SKIP with the reason, counted neither as PASS nor FAIL).
function New-SkipResult([string] $Label, [string] $Reason) {
  [pscustomobject]@{ Label = $Label; Ok = $true; Detail = $Reason; Skip = $true }
}

function Get-PreflightSelftestResults([string] $SlotDir, [string] $RepoRoot, [string] $WorkDir, [string] $PwshExe) {
  New-Item -ItemType Directory -Force $WorkDir | Out-Null
  Get-ModulePathResults -SlotDir $SlotDir -WorkDir $WorkDir
  Get-DotNetRuleResult -RepoRoot $RepoRoot
  Get-TdzFixtureResults -SlotDir $SlotDir -WorkDir $WorkDir
  Get-PreflightCliResults -SlotDir $SlotDir -WorkDir $WorkDir
  Get-RunnerPreflightResults -SlotDir $SlotDir -RepoRoot $RepoRoot -WorkDir $WorkDir -PwshExe $PwshExe
}

# ---- I1: PSModulePath ------------------------------------------------------------------------------------------

# Runs the probe under powershell.exe with $Environment applied to this process (none: the inherited one), the way
# slot-run.ps1 starts a step (Start-Process, redirected output).
function Invoke-ModulePathProbe([string] $Probe, [string] $SampleFile, [string] $WorkDir, [string] $Tag, [System.Collections.IDictionary] $Environment) {
  $out = Join-Path $WorkDir "probe-$Tag.out.txt"
  $err = Join-Path $WorkDir "probe-$Tag.err.txt"
  $saved = if ($Environment) { Set-StepEnvironment $Environment } else { [ordered]@{} }
  try {
    $proc = Start-Process -FilePath 'powershell.exe' -NoNewWindow -Wait -PassThru -RedirectStandardOutput $out -RedirectStandardError $err `
      -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$Probe`"", '-Path', "`"$SampleFile`"")
  }
  finally { Restore-StepEnvironment $saved }
  [pscustomobject]@{ Code = $proc.ExitCode; Hash = "$(Get-Content -Raw $out)".Trim(); Error = "$(Get-Content $err -TotalCount 1)" }
}

function Get-ModulePathResults([string] $SlotDir, [string] $WorkDir) {
  $probe = Join-Path $SlotDir 'fixtures\psmodulepath-probe.ps1'
  $sample = Join-Path $WorkDir 'probe-sample.txt'
  Set-Content $sample "slot-selftest $([guid]::NewGuid())"
  $expected = [Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData([IO.File]::ReadAllBytes($sample)))
  $stepEnvironment = Get-StepEnvironment $null
  $pwsh7Entries = @($stepEnvironment.PSModulePath -split ';' | Where-Object { $_ -and (Test-Pwsh7ModuleDirectory $_) })
  New-CheckResult 'I1-ENV-VALUE step PSModulePath has no pwsh 7 module directory' ($pwsh7Entries.Count -eq 0) `
    "PSModulePath=$($stepEnvironment.PSModulePath) pwsh7-entries=[$($pwsh7Entries -join ';')]"
  $run = Invoke-ModulePathProbe $probe $sample $WorkDir 'step-env' $stepEnvironment
  New-CheckResult 'I1-ENV+ 5.1 probe with the step PSModulePath loads the hash cmdlet' ($run.Code -eq 0 -and $run.Hash -eq $expected) `
    "exit=$($run.Code) hash=$($run.Hash) expected=$expected"
  $pwshModules = Join-Path $PSHOME 'Modules'
  $controlLabel = 'I1-ENV- 5.1 probe with the inherited pwsh 7 PSModulePath fails (D387 control)'
  # The control only applies when this pwsh passes its own module directory down, as in D387.
  if (($env:PSModulePath -split ';') -notcontains $pwshModules) {
    New-SkipResult $controlLabel "inherited PSModulePath has no $pwshModules"
  }
  else {
    $run = Invoke-ModulePathProbe $probe $sample $WorkDir 'inherited' $null
    New-CheckResult $controlLabel ($run.Code -ne 0) "exit=$($run.Code) error=[$($run.Error)]"
  }
  $override = 'C:\slot-selftest\modules'
  $merged = Get-StepEnvironment @{ PSModulePath = $override; SLOT_SELFTEST = '1' }
  New-CheckResult 'I1-ENV-OVERRIDE a step''s env.PSModulePath wins over the default' ($merged.PSModulePath -eq $override -and $merged.SLOT_SELFTEST -eq '1') `
    "PSModulePath=$($merged.PSModulePath) SLOT_SELFTEST=$($merged.SLOT_SELFTEST)"
}

# The module directories pwsh 7 adds (S12 SLOT-02 scope 1): its $PSHOME\Modules, Documents\PowerShell\Modules and
# Program Files\PowerShell\Modules; Windows PowerShell's own are Documents\WindowsPowerShell\Modules and the like.
function Test-Pwsh7ModuleDirectory([string] $Directory) {
  $full = $Directory.TrimEnd('\')
  return $full -eq (Join-Path $PSHOME 'Modules') -or $full -match '\\Documents\\PowerShell\\Modules$' -or $full -match '\\Program Files\\PowerShell\\Modules$'
}

# Lines this branch adds under scripts/slot (git diff origin/main...HEAD) use the .NET APIs; the probe is the one
# deliberate cmdlet call. Existing lines and published Demo scripts are not judged (D408).
function Get-DotNetRuleResult([string] $RepoRoot) {
  $label = 'I1-DOTNET added lines call the hash / GUID cmdlets only in the probe'
  $diff = git -C $RepoRoot diff -U0 'origin/main...HEAD' -- scripts/slot 2>$null
  if ($LASTEXITCODE -ne 0) { return New-CheckResult $label $false 'git diff origin/main...HEAD failed (fetch origin/main first)' }
  $file = ''; $outside = @(); $inProbe = 0
  foreach ($line in $diff) {
    if ($line -match '^\+\+\+ b/(?<path>.+)$') { $file = $Matches.path; continue }
    if ($line -notmatch '^\+' -or $line -notmatch $script:DOTNET_RULE_PATTERN) { continue }
    if ($file -eq $script:PROBE_RELATIVE_PATH) { $inProbe++ } else { $outside += "${file}: $line" }
  }
  New-CheckResult $label ($outside.Count -eq 0) "probe-hits=$inProbe other-hits=$($outside.Count) $($outside -join ' | ')"
}

# ---- I4: TDZ fixtures ------------------------------------------------------------------------------------------

function Get-TdzFixtureResults([string] $SlotDir, [string] $WorkDir) {
  $out = Join-Path $WorkDir 'tdz-fixtures.txt'
  & node (Join-Path $SlotDir 'tdz-fixtures.mjs') *> $out
  $code = $LASTEXITCODE
  foreach ($line in Get-Content $out | Where-Object { $_ -match '^(PASS|FAIL) TDZ-FIXTURE ' }) {
    New-CheckResult "I4-$($line -replace '^(PASS|FAIL) ', '' -replace ' expected=.*$', '')" ($line -like 'PASS *') ($line -replace '^.* expected=', 'expected=')
  }
  New-CheckResult 'I4-FIXTURES tdz-fixtures.mjs exit 0' ($code -eq 0) "exit=$code $(Get-Content $out -Tail 1)"
}

# ---- I5: preflight.mjs and slot-run.ps1 ------------------------------------------------------------------------

# A throw-away git repository (outside this one) holding only what the preflight reads before its tools: a copy of
# tsconfig.preflight.json, the baseline text ($null: no baseline) and, with -WithPreflight, a copy of preflight.mjs.
function New-PreflightTempRoot([string] $SlotDir, [string] $Path, [string] $BaselineText, [switch] $WithPreflight) {
  $slot = Join-Path $Path 'scripts\slot'
  New-Item -ItemType Directory -Force $slot | Out-Null
  Copy-Item (Join-Path $SlotDir 'tsconfig.preflight.json') $slot
  # [string] turns $null into '', so an empty $BaselineText means "no baseline file".
  if ($BaselineText) { Set-Content (Join-Path $slot 'preflight-baseline.json') $BaselineText }
  if ($WithPreflight) { Copy-Item (Join-Path $SlotDir 'preflight.mjs'), (Join-Path $SlotDir 'preflight') $slot -Recurse }
  git -C $Path init --quiet 2>&1 | Out-Null
  git -C $Path add --all 2>&1 | Out-Null
  git -C $Path -c user.name=slot-selftest -c user.email=slot-selftest@invalid commit --quiet -m 'preflight selftest root' 2>&1 | Out-Null
  return $Path
}

function Invoke-PreflightCli([string] $SlotDir, [string] $WorkDir, [string] $Tag, [string[]] $Arguments) {
  $out = Join-Path $WorkDir "preflight-$Tag.txt"
  & node (Join-Path $SlotDir 'preflight.mjs') @Arguments *> $out
  [pscustomobject]@{ Code = $LASTEXITCODE; Text = (Get-Content -Raw $out) }
}

function Get-PreflightCliResults([string] $SlotDir, [string] $WorkDir) {
  $missing = New-PreflightTempRoot $SlotDir (Join-Path $WorkDir 'root-no-baseline') $null
  $corrupt = New-PreflightTempRoot $SlotDir (Join-Path $WorkDir 'root-corrupt-baseline') $script:CORRUPT_BASELINE
  $cases = @(
    @{ Label = 'I5-CLI missing baseline: exit 4'; Tag = 'no-baseline'; Arguments = @('--root', $missing); Expect = 'baseline file missing' },
    @{ Label = 'I5-CLI corrupt baseline: exit 4'; Tag = 'corrupt-baseline'; Arguments = @('--root', $corrupt); Expect = 'baseline is not valid JSON' },
    @{ Label = 'I5-CLI missing --files entry: exit 4'; Tag = 'missing-file'; Arguments = @('--root', $missing, '--files', (Join-Path $WorkDir 'absent.mjs')); Expect = '--files entry does not exist' }
  )
  foreach ($case in $cases) {
    $run = Invoke-PreflightCli $SlotDir $WorkDir $case.Tag $case.Arguments
    New-CheckResult $case.Label ($run.Code -eq 4 -and $run.Text -match $case.Expect) "exit=$($run.Code) $(($run.Text -split "`n" | Select-Object -First 1))"
  }
}

# Runs slot-run.ps1 in a child pwsh from $Cwd; $Parameters maps runner parameter names to single values.
function Invoke-SlotRunner([string] $PwshExe, [string] $Runner, [string] $Cwd, [string] $OutDir, [hashtable] $Parameters) {
  $arguments = @('-NoProfile', '-File', "`"$Runner`"", '-OutDir', "`"$OutDir`"")
  foreach ($name in $Parameters.Keys) { $arguments += @("-$name", "`"$($Parameters[$name])`"") }
  $proc = Start-Process -FilePath $PwshExe -WorkingDirectory $Cwd -NoNewWindow -Wait -PassThru -ArgumentList $arguments `
    -RedirectStandardOutput "$OutDir.out.txt" -RedirectStandardError "$OutDir.err.txt"
  $summary = Join-Path $OutDir 'slot-summary.log'
  $headPreflight = Join-Path $OutDir 'preflight-head.log'
  [pscustomobject]@{
    Code      = $proc.ExitCode
    Log       = if (Test-Path $summary) { Get-Content -Raw $summary } else { '' }
    Preflight = if (Test-Path $headPreflight) { Get-Content -Raw $headPreflight } else { '' }
    Files     = @(Get-ChildItem $OutDir -Name -ErrorAction SilentlyContinue)
  }
}

# True when the run ended before the build, the dist check, the process precheck and any step.
function Test-StoppedBeforeBuild($Run) {
  $stepFiles = @($Run.Files | Where-Object { $_ -like '*-start-rev.txt' -or $_ -like '*.out.log' })
  return $Run.Log -notmatch 'build start|dist check|precheck|step ' -and $Run.Files -notcontains 'build.log' -and $stepFiles.Count -eq 0
}

function Get-RunnerPreflightResults([string] $SlotDir, [string] $RepoRoot, [string] $WorkDir, [string] $PwshExe) {
  $runner = Join-Path $SlotDir 'slot-run.ps1'
  $steps = Join-Path $SlotDir 'steps.example.ps1'
  $fixtures = Join-Path $SlotDir 'fixtures'
  $corruptBase = New-PreflightTempRoot $SlotDir (Join-Path $WorkDir 'base-corrupt-with-preflight') $script:CORRUPT_BASELINE -WithPreflight
  $plainBase = New-PreflightTempRoot $SlotDir (Join-Path $WorkDir 'base-without-preflight') $script:CORRUPT_BASELINE
  $run = { param($tag, $cwd, $parameters) Invoke-SlotRunner $PwshExe $runner $cwd (Join-Path $WorkDir "run-$tag") (@{ StepsFile = $steps } + $parameters) }

  $r = & $run 'tdz-hit' $RepoRoot @{ PreflightFiles = (Join-Path $fixtures 'tdz-hit-d385-shape.ts.txt'); BaseRoot = $corruptBase; Stub = 'pass' }
  $ok = $r.Code -eq 6 -and $r.Preflight -match 'tdz NEW .*historyLength' -and $r.Log -notmatch 'preflight base' -and (Test-StoppedBeforeBuild $r)
  New-CheckResult 'I5-RUN head finding: exit 6 before build / precheck / steps, base not run' $ok "exit=$($r.Code) stopped-before-build=$(Test-StoppedBeforeBuild $r)"

  $r = & $run 'missing-file' $RepoRoot @{ PreflightFiles = (Join-Path $WorkDir 'absent.mjs'); Stub = 'pass' }
  $ok = $r.Code -eq 4 -and $r.Preflight -match '--files entry does not exist' -and (Test-StoppedBeforeBuild $r)
  New-CheckResult 'I5-RUN missing -PreflightFiles entry: exit 4 before build' $ok "exit=$($r.Code)"

  $r = & $run 'head-corrupt-baseline' $corruptBase @{ Stub = 'pass' }
  $ok = $r.Code -eq 4 -and $r.Preflight -match 'baseline is not valid JSON' -and (Test-StoppedBeforeBuild $r)
  New-CheckResult 'I5-RUN corrupt head baseline: exit 4 before build' $ok "exit=$($r.Code)"

  $r = & $run 'base-corrupt-baseline' $RepoRoot @{ BaseRoot = $corruptBase; Stub = 'pass' }
  $ok = $r.Code -eq 4 -and $r.Log -match 'preflight head exit=0' -and $r.Log -match 'preflight base exit=4' -and (Test-StoppedBeforeBuild $r)
  New-CheckResult 'I5-RUN clean head, corrupt base baseline: base runs, exit 4 before build' $ok "exit=$($r.Code)"

  $r = & $run 'tdz-miss' $RepoRoot @{ PreflightFiles = (Join-Path $fixtures 'tdz-miss-function-declaration.ts.txt'); Stub = 'pass' }
  $stepLine = "step e2e-head PSModulePath=$([regex]::Escape((Get-WindowsPowerShellModulePath)))"
  $ok = $r.Code -eq 0 -and $r.Log -match 'base preflight skipped \(no -BaseRoot\)' -and $r.Files -contains 'build.log' -and $r.Log -match $stepLine
  New-CheckResult 'I5-RUN clean preflight continues to build and steps; step logs PSModulePath' $ok "exit=$($r.Code) build-log=$($r.Files -contains 'build.log')"

  $r = & $run 'base-without-preflight' $RepoRoot @{ BaseRoot = $plainBase; Stub = 'pass' }
  $ok = $r.Code -eq 0 -and $r.Log -match 'base preflight skipped \(no preflight\.mjs\)'
  New-CheckResult 'I5-RUN base checkout without preflight.mjs: skipped and logged' $ok "exit=$($r.Code)"
}
