# Port gate self-test (S16 SLOT-03 S5; R3, D472). Standalone:
#   pwsh -File scripts/slot/selftest-ports.ps1 -OutDir DIR_OUTSIDE_REPO
# P1: a stand-in node process listens on a free local port; slot-run -Stub pass -Ports <port> ends with exit 7 before
#     the static preflight and the build, and logs the listener's PID, command line and SR verdict.
# P2: after the stand-in is stopped, the same command does not end with 7 (a -Stub rehearsal: build, stub steps, no
#     browser) and logs "ports free" at both checks (before the preflight, before the first step).
# P3: a run without -Stub and without -Ports ends with exit 4 before the build.
# P4 / P5 (D475): a wrapper replaces Get-NetTCPConnection with a function that fails. P4 writes a non-terminating
#     provider error at the first check: exit 8 before the preflight and the build. P5 succeeds once (no listeners) and
#     throws at the second check: exit 8 before the first step. Both log the full error; neither ends with 7.
# Only processes this script starts are stopped. Exit 0 when every check passes, 1 otherwise.
param([Parameter(Mandatory)] [string] $OutDir)
if ($PSVersionTable.PSVersion.Major -lt 7 -or -not $IsWindows) { Write-Host "selftest-ports.ps1 needs PowerShell 7 on Windows"; exit 2 }
$ErrorActionPreference = 'Stop'
# Reused helpers: New-CheckResult, Invoke-SlotRunner, Test-StoppedBeforeBuild.
. (Join-Path $PSScriptRoot 'selftest-preflight.ps1')

$OutDir = [IO.Path]::GetFullPath($ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutDir))
$repoRoot = [IO.Path]::GetFullPath((git -C $PSScriptRoot rev-parse --show-toplevel)).TrimEnd('\', '/') + '\'
if (($OutDir.TrimEnd('\', '/') + '\').StartsWith($repoRoot, [StringComparison]::OrdinalIgnoreCase)) { Write-Host "-OutDir must be outside the repository ($repoRoot)"; exit 4 }
New-Item -ItemType Directory -Force $OutDir | Out-Null
$log = Join-Path $OutDir 'selftest-ports.log'
function Say([string] $text) { $line = "$((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')) $text"; Write-Host $line; Add-Content $log $line }

# A port no process listens on right now (the OS picks it; released before use).
function Get-FreePort {
  $probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
  $probe.Start(); $port = $probe.LocalEndpoint.Port; $probe.Stop()
  return $port
}

# Starts node listening on $Port and waits (at most 10 s) until the listener is visible to Get-NetTCPConnection.
function Start-ListenerStandIn([int] $Port, [string] $WorkDir) {
  $script = Join-Path $WorkDir 'listener-stand-in.cjs'
  Set-Content $script "require('net').createServer().listen($Port, '127.0.0.1'); setInterval(() => {}, 1000);"
  $proc = Start-Process -FilePath (Get-Command node).Source -ArgumentList "`"$script`"" -WorkingDirectory $WorkDir -WindowStyle Hidden -PassThru
  $deadline = (Get-Date).AddSeconds(10)
  while ((Get-Date) -lt $deadline) {
    if (@(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue).Count) { return $proc }
    Start-Sleep -Milliseconds 200
  }
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  throw "listener stand-in did not listen on port $Port"
}

function Get-PortGateResults([string] $PwshExe, [string] $Runner, [string] $Steps, [string] $Root, [string] $WorkDir) {
  $port = Get-FreePort
  $standIn = Start-ListenerStandIn $port $WorkDir
  try {
    $r = Invoke-SlotRunner $PwshExe $Runner $Root (Join-Path $WorkDir 'run-busy') @{ StepsFile = $Steps; Stub = 'pass'; Ports = $port }
    $busy = "port busy phase=before-preflight port=$port address=\S+ pid=$($standIn.Id) name=node\.exe cmdline=\[.*listener-stand-in\.cjs.*\] verdict=\[SR-"
    $ok = $r.Code -eq 7 -and $r.Log -match $busy -and $r.Log -match 'ABORT: slot port in use \(before-preflight\)' -and $r.Log -notmatch 'preflight head' -and (Test-StoppedBeforeBuild $r)
    New-CheckResult "P1 port $port held by stand-in pid=$($standIn.Id): exit 7 before the preflight and the build, PID / cmdline / verdict logged" $ok "exit=$($r.Code) $(($r.Log -split "`n" | Where-Object { $_ -match 'port busy' }) -join ' ')"
  } finally { Stop-Process -Id $standIn.Id -Force -ErrorAction SilentlyContinue; $standIn.WaitForExit(5000) | Out-Null }

  $r = Invoke-SlotRunner $PwshExe $Runner $Root (Join-Path $WorkDir 'run-free') @{ StepsFile = $Steps; Stub = 'pass'; Ports = $port }
  $ok = $r.Code -ne 7 -and $r.Log -match "ports free phase=before-preflight ports=$port" -and $r.Log -match "ports free phase=before-steps ports=$port"
  New-CheckResult "P2 same command after the stand-in stopped: not exit 7, ports free at both checks" $ok "exit=$($r.Code)"

  $r = Invoke-SlotRunner $PwshExe $Runner $Root (Join-Path $WorkDir 'run-no-ports') @{ StepsFile = $Steps }
  $ok = $r.Code -eq 4 -and $r.Log -match 'missing -Ports' -and $r.Log -notmatch 'build start' -and (Test-StoppedBeforeBuild $r)
  New-CheckResult 'P3 no -Stub, no -Ports: exit 4 before the build' $ok "exit=$($r.Code) $(($r.Log -split "`n" | Where-Object { $_ -match 'missing -Ports' }) -join ' ')"
}

# Writes a wrapper that defines a failing global Get-NetTCPConnection (it shadows the cmdlet inside slot-run.ps1),
# then runs the real runner. -FailMode provider: non-terminating error on every call; throw-second: the first call
# returns no listeners, the second throws.
function New-FailingLookupWrapper([string] $Runner, [string] $WorkDir) {
  $wrapper = Join-Path $WorkDir 'lookup-fails.ps1'
  Set-Content $wrapper @"
param([string] `$OutDir, [string] `$StepsFile, [string] `$Stub, [int[]] `$Ports, [string] `$FailMode)
`$global:tcpLookupCalls = 0
function global:Get-NetTCPConnection {
  [CmdletBinding()] param([string] `$State)
  `$global:tcpLookupCalls++
  if (`$FailMode -eq 'provider') { Write-Error -Message 'simulated provider error: CIM query failed' -Category ResourceUnavailable -ErrorId 'SimulatedProviderError'; return }
  if (`$global:tcpLookupCalls -ge 2) { throw [InvalidOperationException]::new('simulated lookup exception') }
}
& '$Runner' -OutDir `$OutDir -StepsFile `$StepsFile -Stub `$Stub -Ports `$Ports
exit `$LASTEXITCODE
"@
  return $wrapper
}

function Get-LookupFailureResults([string] $PwshExe, [string] $Runner, [string] $Steps, [string] $Root, [string] $WorkDir) {
  $wrapper = New-FailingLookupWrapper $Runner $WorkDir
  $port = Get-FreePort
  $r = Invoke-SlotRunner $PwshExe $wrapper $Root (Join-Path $WorkDir 'run-lookup-provider') @{ StepsFile = $Steps; Stub = 'pass'; Ports = $port; FailMode = 'provider' }
  $failed = "port lookup failed phase=before-preflight id=\[SimulatedProviderError,Get-NetTCPConnection\] category=\[ResourceUnavailable.*message=\[simulated provider error: CIM query failed\]"
  $ok = $r.Code -eq 8 -and $r.Log -match $failed -and $r.Log -match 'ABORT: port lookup failed \(before-preflight\)' -and $r.Log -notmatch 'ports free|preflight head' -and (Test-StoppedBeforeBuild $r)
  New-CheckResult "P4 provider error at the first check: exit 8 before the preflight and the build, error logged" $ok "exit=$($r.Code) $(($r.Log -split "`n" | Where-Object { $_ -match 'port lookup failed' }) -join ' ')"

  $r = Invoke-SlotRunner $PwshExe $wrapper $Root (Join-Path $WorkDir 'run-lookup-throw') @{ StepsFile = $Steps; Stub = 'pass'; Ports = $port; FailMode = 'throw-second' }
  $failed = "port lookup failed phase=before-steps id=\[.*\] category=\[.*exception=\[System\.InvalidOperationException\] message=\[simulated lookup exception\]"
  $stepFiles = @($r.Files | Where-Object { $_ -like '*-start-rev.txt' -or $_ -like '*.out.log' })
  $ok = $r.Code -eq 8 -and $r.Log -match "ports free phase=before-preflight ports=$port" -and $r.Log -match $failed -and $r.Log -match 'ABORT: port lookup failed \(before-steps\)' -and $stepFiles.Count -eq 0
  New-CheckResult "P5 exception at the second check: exit 8 before the first step, error logged" $ok "exit=$($r.Code) $(($r.Log -split "`n" | Where-Object { $_ -match 'port lookup failed' }) -join ' ')"
}

$pwshExe = (Get-Process -Id $PID).Path
$runner = Join-Path $PSScriptRoot 'slot-run.ps1'
$steps = Join-Path $PSScriptRoot 'steps.example.ps1'
Say "selftest-ports start head=$(git -C $PSScriptRoot rev-parse HEAD) outdir=$OutDir"
$results = @(Get-PortGateResults $pwshExe $runner $steps $repoRoot.TrimEnd('\') $OutDir) + @(Get-LookupFailureResults $pwshExe $runner $steps $repoRoot.TrimEnd('\') $OutDir)
foreach ($c in $results) { Say "$(if ($c.Ok) { 'PASS' } else { 'FAIL' }) $($c.Label) $($c.Detail)" }
$failed = @($results | Where-Object { -not $_.Ok }).Count
Say "summary: $($results.Count) checks; $($results.Count - $failed) PASS, $failed FAIL"
Say "selftest-ports $(if ($failed) { "FAILED ($failed)" } else { 'passed' })"
exit [int]($failed -ne 0)
