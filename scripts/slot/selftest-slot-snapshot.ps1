# Automatic gate snapshot self-test (S23 SLOT-06, D517). Standalone:
#   pwsh -File scripts/slot/selftest-slot-snapshot.ps1 -OutDir DIR_OUTSIDE_REPO
# G1: a stand-in node listens on a free port P; slot-run -Stub pass -Ports P still ends with exit 7, and the run's single
#     gate-snapshot-*.tsv has, in snapshot 1, the listener row of P with the stand-in's PID, its node row and an ancestor
#     row; "gate snapshot started" is logged before "port busy", "gate snapshot exit=" after the abort line.
# G2: after G1, no pwsh process whose command line names G1's TSV is left (Win32_Process).
# G4: as G1 with ports P,4173 (via a wrapper: pwsh -File cannot bind a CSV to int[]): the snapshot does not exit early
#     with 3 and lists each 4173 listener once per snapshot.
# G5: GATE_SNAPSHOT_SLOW_FIRST_SECONDS=60 on the G1 path: exit 7, "not ready after 15 s", then the 30 s stop timeout;
#     no snapshot process is left. It takes about 45 s (15 s start wait + 30 s stop wait) by design.
# G3: after the stand-in stopped, the same command (one -Stub build, no browser) ends with exit 0; the TSV has pid=none
#     listener rows for P and 4173; the log has "gate snapshot exit=0 gate-snapshot done …".
# G6 / G10 (hold on base and head): exit-4 paths start no snapshot; the snapshot PID is never counted or excluded.
# Only processes this script starts are stopped. Exit 0 when every check passes, 1 otherwise.
param([Parameter(Mandatory)] [string] $OutDir)
if ($PSVersionTable.PSVersion.Major -lt 7 -or -not $IsWindows) { Write-Host "selftest-slot-snapshot.ps1 needs PowerShell 7 on Windows"; exit 2 }
$ErrorActionPreference = 'Stop'
# Reused helpers: New-CheckResult, Invoke-SlotRunner.
. (Join-Path $PSScriptRoot 'selftest-preflight.ps1')

$script:SNAPSHOT_PREVIEW_PORT = 4173
$script:SLOW_FIRST_SNAPSHOT_SECONDS = 60
$script:LEFTOVER_QUERY = "SELECT ProcessId, CommandLine FROM Win32_Process WHERE Name = 'pwsh.exe'"
$OutDir = [IO.Path]::GetFullPath($ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutDir))
$repoRoot = [IO.Path]::GetFullPath((git -C $PSScriptRoot rev-parse --show-toplevel)).TrimEnd('\', '/') + '\'
if (($OutDir.TrimEnd('\', '/') + '\').StartsWith($repoRoot, [StringComparison]::OrdinalIgnoreCase)) { Write-Host "-OutDir must be outside the repository ($repoRoot)"; exit 4 }
New-Item -ItemType Directory -Force $OutDir | Out-Null
$log = Join-Path $OutDir 'selftest-slot-snapshot.log'
function Say([string] $text) { $line = "$((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')) $text"; Write-Host $line; Add-Content $log $line }

# A port no process listens on right now (the OS picks it; released before use).
function Get-FreePort {
  $probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
  $probe.Start(); $port = $probe.LocalEndpoint.Port; $probe.Stop()
  return $port
}

# Starts node listening on $Port and waits (at most 10 s) until the listener is visible to Get-NetTCPConnection.
function Start-ListenerStandIn([int] $Port, [string] $WorkDir) {
  $standInScript = Join-Path $WorkDir 'snapshot-listener-stand-in.cjs'
  Set-Content $standInScript "require('net').createServer().listen($Port, '127.0.0.1'); setInterval(() => {}, 1000);"
  $proc = Start-Process -FilePath (Get-Command node).Source -ArgumentList "`"$standInScript`"" -WorkingDirectory $WorkDir -WindowStyle Hidden -PassThru
  $deadline = (Get-Date).AddSeconds(10)
  while ((Get-Date) -lt $deadline) {
    if (@(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue).Count) { return $proc }
    Start-Sleep -Milliseconds 200
  }
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  throw "listener stand-in did not listen on port $Port"
}

# A TSV file's rows as objects keyed by its header; tab-split, since cells hold quotes that Import-Csv would parse.
function Read-TsvRows([string] $Path) {
  $lines = @(Get-Content -LiteralPath $Path)
  $columns = $lines[0] -split "`t"
  foreach ($line in ($lines | Select-Object -Skip 1)) {
    $values = $line -split "`t"; $row = [ordered]@{}
    for ($i = 0; $i -lt $columns.Count; $i++) { $row[$columns[$i]] = $values[$i] }
    [pscustomobject]$row
  }
}

# The run's gate-snapshot TSV (Path is '' unless exactly one exists) and its rows.
function Read-RunSnapshot([string] $RunDir) {
  $files = @(Get-ChildItem -LiteralPath $RunDir -Filter 'gate-snapshot-*.tsv' -ErrorAction SilentlyContinue)
  if ($files.Count -ne 1) { return [pscustomobject]@{ Path = ''; Rows = @() } }
  [pscustomobject]@{ Path = $files[0].FullName; Rows = @(Read-TsvRows $files[0].FullName) }
}

function Get-LeftoverSnapshotCount([string] $TsvPath) {
  @(Get-CimInstance -Query $script:LEFTOVER_QUERY | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($TsvPath) }).Count
}

# True when both patterns match the log and the first match of $FirstPattern comes before that of $SecondPattern.
function Test-LogOrder([string] $Log, [string] $FirstPattern, [string] $SecondPattern) {
  $first = [regex]::Match($Log, $FirstPattern); $second = [regex]::Match($Log, $SecondPattern)
  return $first.Success -and $second.Success -and $first.Index -lt $second.Index
}

# Runs a block of checks, logs its wall time and returns its results.
function Measure-Checks([string] $Name, [scriptblock] $Checks) {
  $watch = [Diagnostics.Stopwatch]::StartNew()
  $results = @(& $Checks)
  Say "time $Name $([Math]::Round($watch.Elapsed.TotalSeconds, 1)) s"
  return $results
}

function Get-BusyPortResults([hashtable] $Ctx, [int] $Port, $StandIn) {
  $r = Invoke-SlotRunner $Ctx.Pwsh $Ctx.Runner $Ctx.Root (Join-Path $Ctx.WorkDir 'run-busy') @{ StepsFile = $Ctx.Steps; Stub = 'pass'; Ports = $Port }
  $snapshot = Read-RunSnapshot (Join-Path $Ctx.WorkDir 'run-busy')
  $first = @($snapshot.Rows | Where-Object snapshot -EQ '1')
  $listen = @($first | Where-Object { $_.kind -eq 'listen' -and $_.port -eq "$Port" -and $_.pid -eq "$($StandIn.Id)" })
  $node = @($first | Where-Object { $_.kind -eq 'node' -and $_.pid -eq "$($StandIn.Id)" })
  $ancestors = @($first | Where-Object kind -EQ 'ancestor')
  $ordered = (Test-LogOrder $r.Log 'gate snapshot started' 'port busy') -and (Test-LogOrder $r.Log 'ABORT: slot port in use' 'gate snapshot exit=')
  $ok = $r.Code -eq 7 -and $snapshot.Path -and $listen.Count -eq 1 -and $node.Count -eq 1 -and $ancestors.Count -ge 1 -and $ordered
  New-CheckResult "G1 port $Port held by stand-in pid=$($StandIn.Id): exit 7, snapshot 1 has its listener / node / ancestor rows, log order" $ok "exit=$($r.Code) tsv=[$($snapshot.Path)] listen=$($listen.Count) node=$($node.Count) ancestor=$($ancestors.Count) ordered=$ordered"
  $left = if ($snapshot.Path) { Get-LeftoverSnapshotCount $snapshot.Path } else { -1 }
  New-CheckResult 'G2 after G1: no snapshot pwsh left' ($left -eq 0) "query=[$($script:LEFTOVER_QUERY)] CommandLine contains [$($snapshot.Path)] count=$left"
}

# pwsh -File binds "-Ports P,4173" as one integer, so this wrapper splits a CSV and calls the runner with int[].
function New-PortCsvWrapper([string] $Runner, [string] $WorkDir) {
  $wrapper = Join-Path $WorkDir 'ports-csv.ps1'
  Set-Content $wrapper @"
param([string] `$OutDir, [string] `$StepsFile, [string] `$Stub, [string] `$PortCsv)
& '$Runner' -OutDir `$OutDir -StepsFile `$StepsFile -Stub `$Stub -Ports ([int[]](`$PortCsv -split ','))
exit `$LASTEXITCODE
"@
  return $wrapper
}

function Get-DuplicatePortResult([hashtable] $Ctx, [int] $Port) {
  $wrapper = New-PortCsvWrapper $Ctx.Runner $Ctx.WorkDir
  $r = Invoke-SlotRunner $Ctx.Pwsh $wrapper $Ctx.Root (Join-Path $Ctx.WorkDir 'run-with-4173') @{ StepsFile = $Ctx.Steps; Stub = 'pass'; PortCsv = "$Port,$($script:SNAPSHOT_PREVIEW_PORT)" }
  $snapshot = Read-RunSnapshot (Join-Path $Ctx.WorkDir 'run-with-4173')
  $previewRows = @($snapshot.Rows | Where-Object { $_.kind -eq 'listen' -and $_.port -eq "$($script:SNAPSHOT_PREVIEW_PORT)" })
  $groups = @($previewRows | Group-Object snapshot, pid, localAddress)
  $ok = $r.Code -eq 7 -and $snapshot.Path -and $r.Log -notmatch 'exited early exit=3' -and $previewRows.Count -ge 1 -and @($groups | Where-Object Count -GT 1).Count -eq 0
  New-CheckResult "G4 -Ports $Port,$($script:SNAPSHOT_PREVIEW_PORT): exit 7, no early exit 3, each 4173 listener once per snapshot" $ok "exit=$($r.Code) tsv=[$($snapshot.Path)] 4173-rows=$($previewRows.Count) groups=$($groups.Count)"
}

function Get-SlowSnapshotResult([hashtable] $Ctx, [int] $Port) {
  $env:GATE_SNAPSHOT_SLOW_FIRST_SECONDS = "$($script:SLOW_FIRST_SNAPSHOT_SECONDS)"
  try { $r = Invoke-SlotRunner $Ctx.Pwsh $Ctx.Runner $Ctx.Root (Join-Path $Ctx.WorkDir 'run-slow') @{ StepsFile = $Ctx.Steps; Stub = 'pass'; Ports = $Port } }
  finally { Remove-Item Env:GATE_SNAPSHOT_SLOW_FIRST_SECONDS -ErrorAction SilentlyContinue }
  $snapshot = Read-RunSnapshot (Join-Path $Ctx.WorkDir 'run-slow')
  $left = if ($snapshot.Path) { Get-LeftoverSnapshotCount $snapshot.Path } else { -1 }
  $ordered = Test-LogOrder $r.Log 'gate snapshot not ready after 15 s' 'gate snapshot stop timeout after 30 s; stopped pid=\d+'
  $ok = $r.Code -eq 7 -and $ordered -and $left -eq 0
  New-CheckResult "G5 first snapshot slowed by $($script:SLOW_FIRST_SNAPSHOT_SECONDS) s: exit 7, not ready after 15 s, stop timeout after 30 s, none left" $ok "exit=$($r.Code) ordered=$ordered left=$left"
}

function Get-FreePortResults([hashtable] $Ctx, [int] $Port) {
  $runDir = Join-Path $Ctx.WorkDir 'run-free'
  $r = Invoke-SlotRunner $Ctx.Pwsh $Ctx.Runner $Ctx.Root $runDir @{ StepsFile = $Ctx.Steps; Stub = 'pass'; Ports = $Port }
  $snapshot = Read-RunSnapshot $runDir
  $free = @($snapshot.Rows | Where-Object { $_.kind -eq 'listen' -and $_.pid -eq 'none' } | ForEach-Object port | Sort-Object -Unique)
  $ok = $r.Code -eq 0 -and $snapshot.Path -and $free -contains "$Port" -and $free -contains "$($script:SNAPSHOT_PREVIEW_PORT)" -and $r.Log -match 'gate snapshot exit=0 gate-snapshot done '
  $build = Get-Item -LiteralPath (Join-Path $runDir 'build.log') -ErrorAction SilentlyContinue
  $buildSeconds = if ($build) { [Math]::Round(($build.LastWriteTime - $build.CreationTime).TotalSeconds, 1) } else { 'none' }
  New-CheckResult "G3 port $Port free: exit 0, pid=none listeners for $Port and 4173, snapshot exit 0 logged" $ok "exit=$($r.Code) build=${buildSeconds}s free=[$($free -join ',')] $(($r.Log -split "`n" | Where-Object { $_ -match 'gate snapshot exit=' }) -join ' ')"
  $snapshotPid = [regex]::Match($r.Log, 'gate snapshot started pid=(\d+)').Groups[1].Value
  $samples = @(Read-TsvRows (Join-Path $runDir 'processes.tsv'))
  $inSamples = @($samples | Where-Object { $snapshotPid -and $_.detail -match "(^| )$($snapshotPid):" }).Count
  $inExcluded = @(Read-TsvRows (Join-Path $runDir 'excluded.tsv') | Where-Object { $snapshotPid -and $_.pid -eq $snapshotPid }).Count
  New-CheckResult "G10 snapshot pid=$snapshotPid neither counted nor excluded" ($inSamples -eq 0 -and $inExcluded -eq 0) "counted-per-sample=[$(($samples | ForEach-Object { "$($_.phase)=$($_.counted)" }) -join ' ')] excluded-rows=$inExcluded"
}

function Get-ExitFourResult([hashtable] $Ctx) {
  $missing = Invoke-SlotRunner $Ctx.Pwsh $Ctx.Runner $Ctx.Root (Join-Path $Ctx.WorkDir 'run-missing-steps') @{ StepsFile = (Join-Path $Ctx.WorkDir 'absent-steps.ps1'); Stub = 'pass' }
  $location = Invoke-SlotRunner $Ctx.Pwsh $Ctx.Runner $Ctx.Root (Join-Path $Ctx.WorkDir 'run-base-is-root') @{ StepsFile = $Ctx.Steps; Stub = 'pass'; BaseRoot = $Ctx.Root }
  $clean = { param($r) $r.Code -eq 4 -and $r.Log -notmatch 'gate snapshot' -and @($r.Files | Where-Object { $_ -like 'gate-snapshot-*' }).Count -eq 0 }
  New-CheckResult 'G6 exit 4 (missing -StepsFile; -BaseRoot is the root): no gate-snapshot file or log line' ((& $clean $missing) -and (& $clean $location)) "exit=$($missing.Code),$($location.Code)"
}

$ctx = @{ Pwsh = (Get-Process -Id $PID).Path; Runner = Join-Path $PSScriptRoot 'slot-run.ps1'; Steps = Join-Path $PSScriptRoot 'steps.example.ps1'; Root = $repoRoot.TrimEnd('\'); WorkDir = $OutDir }
Say "selftest-slot-snapshot start head=$(git -C $PSScriptRoot rev-parse HEAD) outdir=$OutDir"
$total = [Diagnostics.Stopwatch]::StartNew()
$port = Get-FreePort
$standIn = Start-ListenerStandIn $port $OutDir
try {
  $results = @(Measure-Checks 'G1+G2' { Get-BusyPortResults $ctx $port $standIn })
  $results += Measure-Checks 'G4' { Get-DuplicatePortResult $ctx $port }
  $results += Measure-Checks 'G5' { Get-SlowSnapshotResult $ctx $port }
} finally { Stop-Process -Id $standIn.Id -Force -ErrorAction SilentlyContinue; $standIn.WaitForExit(5000) | Out-Null }
$results += Measure-Checks 'G3+G10 (one -Stub build)' { Get-FreePortResults $ctx $port }
$results += Measure-Checks 'G6' { Get-ExitFourResult $ctx }
foreach ($c in $results) { Say "$(if ($c.Ok) { 'PASS' } else { 'FAIL' }) $($c.Label) $($c.Detail)" }
$failed = @($results | Where-Object { -not $_.Ok }).Count
Say "summary: $($results.Count) checks; $($results.Count - $failed) PASS, $failed FAIL; total $([Math]::Round($total.Elapsed.TotalSeconds, 1)) s"
exit [int]($failed -ne 0)
