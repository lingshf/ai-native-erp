# Automatic gate snapshot self-test (S23 SLOT-06, D517, D524). Standalone:
#   pwsh -File scripts/slot/selftest-slot-snapshot.ps1 -OutDir DIR_OUTSIDE_REPO
# Task book G1–G6 and G10, review checks G11–G15; each label states what it asserts. A stand-in node listens on a free port P
#   for G1 (snapshot 1 holds its listener, node row and the depth-1 row of its parent, this selftest), G2, G4 and G5 (first
#   snapshot 60 s slow: about 45 s by design, 15 s start wait + 30 s stop budget); G3 and G10 share one -Stub build.
# G11: a real preflight.mjs exit 4 (D524) keeps its snapshot. G12 (stop step) and G14 (start step) run the runner's code with stand-in
#   process, taskkill, Say, New-Item / Start-Process (a child pwsh for G12's failing log write). G13 judges one live table with procs.ps1 Counted; G15: its fixture leaves nothing when it throws.
# Only processes this script starts are stopped. Exit 0 when every check passes, 1 otherwise.
param([Parameter(Mandatory)] [string] $OutDir)
if ($PSVersionTable.PSVersion.Major -lt 7 -or -not $IsWindows) { Write-Host "selftest-slot-snapshot.ps1 needs PowerShell 7 on Windows"; exit 2 }
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'selftest-preflight.ps1'); . (Join-Path $PSScriptRoot 'procs.ps1')  # reused: New-CheckResult, Invoke-SlotRunner; Counted (G13)
$script:SNAPSHOT_PREVIEW_PORT = 4173; $script:SLOW_FIRST_SNAPSHOT_SECONDS = 60
$script:STAND_IN_PID = 4194303  # never a real process (not a multiple of 4): G12's kill target, G13's runner row
$script:G12_STOP_SECONDS = 2; $script:G12_KILL_RESERVE_MILLISECONDS = 500; $script:G12_TIMER_SLACK_MILLISECONDS = 250; $script:G12_SLOW_KILL_MILLISECONDS = 1100; $script:G12_LIMIT_MILLISECONDS = $script:G12_STOP_SECONDS * 1000 + $script:G12_TIMER_SLACK_MILLISECONDS  # scaled stop budget: G12's stand-in really waits
$script:LEFTOVER_QUERY = "SELECT ProcessId, CommandLine FROM Win32_Process WHERE Name = 'pwsh.exe'"
$OutDir = [IO.Path]::GetFullPath($ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutDir))
$repoRoot = [IO.Path]::GetFullPath((git -C $PSScriptRoot rev-parse --show-toplevel)).TrimEnd('\', '/') + '\'
if (($OutDir.TrimEnd('\', '/') + '\').StartsWith($repoRoot, [StringComparison]::OrdinalIgnoreCase)) { Write-Host "-OutDir must be outside the repository ($repoRoot)"; exit 4 }
New-Item -ItemType Directory -Force $OutDir | Out-Null; $log = Join-Path $OutDir 'selftest-slot-snapshot.log'
function Say([string] $text) { $line = "$((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')) $text"; Write-Host $line; Add-Content $log $line }
# A port no process listens on right now (the OS picks it; released before use).
function Get-FreePort { $probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0); $probe.Start(); try { $probe.LocalEndpoint.Port } finally { $probe.Stop() } }
# Starts node listening on $Port and waits (at most 10 s) until the listener is visible to Get-NetTCPConnection.
function Start-ListenerStandIn([int] $Port, [string] $WorkDir) {
  $standInScript = Join-Path $WorkDir 'snapshot-listener-stand-in.cjs'; Set-Content $standInScript "require('net').createServer().listen($Port, '127.0.0.1'); setInterval(() => {}, 1000);"
  $proc = Start-Process -FilePath (Get-Command node).Source -ArgumentList "`"$standInScript`"" -WorkingDirectory $WorkDir -WindowStyle Hidden -PassThru
  for ($waited = [Diagnostics.Stopwatch]::StartNew(); $waited.Elapsed.TotalSeconds -lt 10; Start-Sleep -Milliseconds 200) { if (@(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue).Count) { return $proc } }
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue; throw "listener stand-in did not listen on port $Port"
}
# A TSV file's rows as objects keyed by its header; tab-split, since cells hold quotes that Import-Csv would parse.
function Read-TsvRows([string] $Path) {
  $lines = @(Get-Content -LiteralPath $Path); $columns = $lines[0] -split "`t"
  foreach ($line in ($lines | Select-Object -Skip 1)) { $values = $line -split "`t"; $row = [ordered]@{}; for ($i = 0; $i -lt $columns.Count; $i++) { $row[$columns[$i]] = $values[$i] }; [pscustomobject]$row }
}
# The run's gate-snapshot TSV (Path is '' unless exactly one exists) and its rows.
function Read-RunSnapshot([string] $RunDir) {
  $files = @(Get-ChildItem -LiteralPath $RunDir -Filter 'gate-snapshot-*.tsv' -ErrorAction SilentlyContinue); if ($files.Count -ne 1) { return [pscustomobject]@{ Path = ''; Rows = @() } }
  [pscustomobject]@{ Path = $files[0].FullName; Rows = @(Read-TsvRows $files[0].FullName) }
}
# gate-snapshot.ps1 writes each node row followed by its ancestors from depth 1; the stand-in's parent is this selftest.
function Test-StandInChain([object[]] $Rows, $StandIn) {
  $at = @(for ($i = 0; $i -lt $Rows.Count; $i++) { if ($Rows[$i].kind -eq 'node' -and $Rows[$i].pid -eq "$($StandIn.Id)") { $i } })
  if ($at.Count -ne 1 -or $at[0] + 1 -ge $Rows.Count) { return $false }; $parent = $Rows[$at[0] + 1]; return $parent.kind -eq 'ancestor' -and $parent.depth -eq '1' -and $parent.pid -eq $Rows[$at[0]].ppid -and $parent.pid -eq "$PID"
}
# Snapshot pwsh processes still running for $TsvPath; -1 when the run has no TSV.
function Get-LeftoverSnapshotCount([string] $TsvPath) { if (-not $TsvPath) { return -1 }; @(Get-CimInstance -Query $script:LEFTOVER_QUERY | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($TsvPath) }).Count }
# Runs $Runner into WorkDir\$Name with the example steps and -Stub pass; adds RunDir, the run's Snapshot and Left.
function Invoke-SnapshotRun([hashtable] $Ctx, [string] $Name, [hashtable] $Parameters, [string] $Runner = $Ctx.Runner) {
  $runDir = Join-Path $Ctx.WorkDir $Name; $r = Invoke-SlotRunner $Ctx.Pwsh $Runner $Ctx.Root $runDir (@{ StepsFile = $Ctx.Steps; Stub = 'pass' } + $Parameters); $snapshot = Read-RunSnapshot $runDir
  $r | Add-Member -NotePropertyMembers @{ RunDir = $runDir; Snapshot = $snapshot; Left = (Get-LeftoverSnapshotCount $snapshot.Path) } -PassThru
}
# True when both patterns match the log and the first match of $FirstPattern comes before that of $SecondPattern.
function Test-LogOrder([string] $Log, [string] $FirstPattern, [string] $SecondPattern) {
  $first = [regex]::Match($Log, $FirstPattern); $second = [regex]::Match($Log, $SecondPattern); return $first.Success -and $second.Success -and $first.Index -lt $second.Index
}
# Runs a block of checks, logs its wall time and returns its results.
function Measure-Checks([string] $Name, [scriptblock] $Checks) {
  $watch = [Diagnostics.Stopwatch]::StartNew(); $results = @(& $Checks); Say "time $Name $([Math]::Round($watch.Elapsed.TotalSeconds, 1)) s"; return $results
}
function Get-BusyPortResults([hashtable] $Ctx, [int] $Port, $StandIn) {
  $r = Invoke-SnapshotRun $Ctx 'run-busy' @{ Ports = $Port }; $snapshot = $r.Snapshot
  $first = @($snapshot.Rows | Where-Object snapshot -EQ '1'); $chained = Test-StandInChain $first $StandIn
  $listen = @($first | Where-Object { $_.kind -eq 'listen' -and $_.port -eq "$Port" -and $_.pid -eq "$($StandIn.Id)" })
  $ordered = (Test-LogOrder $r.Log 'gate snapshot started' 'port busy') -and (Test-LogOrder $r.Log 'ABORT: slot port in use' 'gate snapshot exit=')
  $ok = $r.Code -eq 7 -and $snapshot.Path -and $listen.Count -eq 1 -and $chained -and $ordered
  New-CheckResult "G1 port $Port held by stand-in pid=$($StandIn.Id): exit 7, snapshot 1 has its listener, node and parent (pid=$PID) rows, log order" $ok "exit=$($r.Code) tsv=[$($snapshot.Path)] listen=$($listen.Count) node+parent=$chained ordered=$ordered"
  New-CheckResult 'G2 after G1: no snapshot pwsh left' ($r.Left -eq 0) "query=[$($script:LEFTOVER_QUERY)] CommandLine contains [$($snapshot.Path)] count=$($r.Left)"
}
# pwsh -File binds "-Ports P,4173" as one integer, so this wrapper splits a CSV and calls the runner with int[].
function New-PortCsvWrapper([string] $Runner, [string] $WorkDir) {
  $wrapper = Join-Path $WorkDir 'ports-csv.ps1'; Set-Content $wrapper "param([string] `$OutDir, [string] `$StepsFile, [string] `$Stub, [string] `$PortCsv)`n& '$Runner' -OutDir `$OutDir -StepsFile `$StepsFile -Stub `$Stub -Ports ([int[]](`$PortCsv -split ','))`nexit `$LASTEXITCODE"; return $wrapper
}
function Get-DuplicatePortResult([hashtable] $Ctx, [int] $Port) {
  $r = Invoke-SnapshotRun $Ctx 'run-with-4173' @{ PortCsv = "$Port,$($script:SNAPSHOT_PREVIEW_PORT)" } (New-PortCsvWrapper $Ctx.Runner $Ctx.WorkDir); $snapshot = $r.Snapshot
  $previewRows = @($snapshot.Rows | Where-Object { $_.kind -eq 'listen' -and $_.port -eq "$($script:SNAPSHOT_PREVIEW_PORT)" })
  $ok = $r.Code -eq 7 -and $snapshot.Path -and $r.Log -notmatch 'exited early exit=3' -and $previewRows.Count -ge 1 -and @($previewRows | Group-Object snapshot, pid, localAddress | Where-Object Count -GT 1).Count -eq 0
  New-CheckResult "G4 -Ports $Port,$($script:SNAPSHOT_PREVIEW_PORT): exit 7, no early exit 3, each 4173 listener once per snapshot" $ok "exit=$($r.Code) tsv=[$($snapshot.Path)] 4173-rows=$($previewRows.Count) groups=$(@($previewRows | Group-Object snapshot, pid, localAddress).Count)"
}
function Get-SlowSnapshotResult([hashtable] $Ctx, [int] $Port) {
  $env:GATE_SNAPSHOT_SLOW_FIRST_SECONDS = "$($script:SLOW_FIRST_SNAPSHOT_SECONDS)"; try { $r = Invoke-SnapshotRun $Ctx 'run-slow' @{ Ports = $Port } } finally { Remove-Item Env:GATE_SNAPSHOT_SLOW_FIRST_SECONDS -ErrorAction SilentlyContinue }
  $ordered = Test-LogOrder $r.Log 'gate snapshot not ready after 15 s' 'gate snapshot stop timeout after 30 s; stopped pid=\d+'; $ok = $r.Code -eq 7 -and $ordered -and $r.Left -eq 0
  New-CheckResult "G5 first snapshot slowed by $($script:SLOW_FIRST_SNAPSHOT_SECONDS) s: exit 7, not ready after 15 s, stop timeout after 30 s, none left" $ok "exit=$($r.Code) ordered=$ordered left=$($r.Left)"
}
function Get-FreePortResults([hashtable] $Ctx, [int] $Port) {
  $r = Invoke-SnapshotRun $Ctx 'run-free' @{ Ports = $Port }; $snapshot = $r.Snapshot; $free = @($snapshot.Rows | Where-Object { $_.kind -eq 'listen' -and $_.pid -eq 'none' } | ForEach-Object port | Sort-Object -Unique)
  $ok = $r.Code -eq 0 -and $snapshot.Path -and $free -contains "$Port" -and $free -contains "$($script:SNAPSHOT_PREVIEW_PORT)" -and $r.Log -match 'gate snapshot exit=0 gate-snapshot done '
  $buildSeconds = if ($build = Get-Item -LiteralPath (Join-Path $r.RunDir 'build.log') -ErrorAction SilentlyContinue) { [Math]::Round(($build.LastWriteTime - $build.CreationTime).TotalSeconds, 1) } else { 'none' }
  New-CheckResult "G3 port $Port free: exit 0, pid=none listeners for $Port and 4173, snapshot exit 0 logged" $ok "exit=$($r.Code) build=${buildSeconds}s free=[$($free -join ',')] $(($r.Log -split "`n" | Where-Object { $_ -match 'gate snapshot exit=' }) -join ' ')"
  Get-NotCountedResult $r.RunDir $r.Log
}
# The PIDs a processes.tsv detail cell lists as counted ("pid:name:cmdline [owner] | …", slot-run.ps1 Sample).
function Get-CountedPids([string] $Detail) { @([regex]::Matches($Detail, '(?:^| \| )(\d+):') | ForEach-Object { $_.Groups[1].Value }) }
function Get-NotCountedResult([string] $RunDir, [string] $Log) {
  $snapshotPid = [regex]::Match($Log, 'gate snapshot started pid=(\d+)').Groups[1].Value; $samples = @(Read-TsvRows (Join-Path $RunDir 'processes.tsv')); $countedPids = @($samples | ForEach-Object { Get-CountedPids $_.detail })
  $mismatched = @($samples | Where-Object { [int]$_.counted -ne @(Get-CountedPids $_.detail).Count }).Count
  $excludedPids = @(Read-TsvRows (Join-Path $RunDir 'excluded.tsv') | ForEach-Object pid); $aliveOverSamples = $Log.IndexOf('gate snapshot started') -lt $Log.IndexOf('runner-tree n=') -and $Log.LastIndexOf('runner-tree n=') -lt $Log.IndexOf('gate snapshot exit=')
  $ok = [bool]$snapshotPid -and $samples.Count -gt 0 -and $aliveOverSamples -and $mismatched -eq 0 -and $countedPids -notcontains $snapshotPid -and $excludedPids -notcontains $snapshotPid
  New-CheckResult "G10 snapshot pid=[$snapshotPid] alive over every sample, neither counted nor excluded; counted = listed PIDs" $ok "counted-per-sample=[$(($samples | ForEach-Object { "$($_.phase)=$($_.counted)" }) -join ' ')] counted-pids=[$(($countedPids | Sort-Object -Unique) -join ',')] mismatched=$mismatched alive=$aliveOverSamples excluded-rows=$($excludedPids.Count)"
}
function Get-PreflightExitFourResult([hashtable] $Ctx, [int] $Port) {
  $r = Invoke-SnapshotRun $Ctx 'run-preflight-4' @{ Ports = $Port; PreflightFiles = (Join-Path $Ctx.WorkDir 'absent-preflight-file.ts') }
  $ok = $r.Code -eq 4 -and $r.Log -match 'preflight head exit=4 ' -and $r.Snapshot.Path -and $r.Log -match 'gate snapshot exit=0 gate-snapshot done ' -and $r.Left -eq 0
  New-CheckResult 'G11 preflight.mjs exit 4 (absent -PreflightFiles): exit 4, snapshot taken and stopped with exit 0, none left' $ok "exit=$($r.Code) tsv=[$($r.Snapshot.Path)] left=$($r.Left) $(($r.Log -split "`n" | Where-Object { $_ -match 'preflight head exit=|gate snapshot exit=' }) -join ' ')"
}
# slot-run.ps1's SNAPSHOT_* constants and *-GateSnapshot* functions, taken from its AST so the stop step runs here alone.
function Get-RunnerSnapshotSource([string] $Runner) {
  $isSnapshotPart = { param($n) ($n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -like '*-GateSnapshot*') -or ($n -is [Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text -like '$script:SNAPSHOT_*') }
  (([Management.Automation.Language.Parser]::ParseFile($Runner, [ref]$null, [ref]$null)).FindAll($isSnapshotPart, $false) | ForEach-Object { $_.Extent.Text }) -join "`n"
}
# A process stand-in for the runner's snapshot steps: fixed Id, WaitForExit given by the test.
function New-ProcessStandIn([int] $Id, [scriptblock] $WaitForExit) { [pscustomobject]@{ Id = $Id; ExitCode = $null } | Add-Member -MemberType ScriptMethod -Name WaitForExit -Value $WaitForExit -PassThru }
# A taskkill stand-in that ends nothing: finishes (exit 128, refused) after $FinishMilliseconds.
function New-KillStandIn([int] $FinishMilliseconds) {
  $kill = New-ProcessStandIn 0 { param($milliseconds) Start-Sleep -Milliseconds ([Math]::Min($milliseconds, $FinishMilliseconds)); $milliseconds -ge $FinishMilliseconds }.GetNewClosure(); $kill.ExitCode = 128
  $kill | Add-Member -NotePropertyMembers @{ StandardOutput = [IO.StringReader]::new('ERROR: stand-in taskkill refused'); StandardError = [IO.StringReader]::new('') } -PassThru
}
# Runs a runner snapshot $Step with the stop budget scaled to G12_*, Say logged (throwing for $FailingLog), taskkill a stand-in, New-Item failing with -StopFileFails.
function Invoke-StandInStep([scriptblock] $Step, [int] $KillMilliseconds, [string] $FailingLog, [switch] $StopFileFails) {
  $logged = [Collections.Generic.List[string]]::new(); $kills = [Collections.Generic.List[int]]::new()
  function Say([string] $text) { $logged.Add($text); if ($FailingLog -and $text -like $FailingLog) { throw 'stand-in log write failed' } }
  function Start-GateSnapshotKill([int] $snapshotPid) { $kills.Add($snapshotPid); New-KillStandIn $KillMilliseconds }; if ($StopFileFails) { function New-Item { throw 'stand-in stop file failed' } }
  $saved = $script:SNAPSHOT_STOP_SECONDS, $script:SNAPSHOT_KILL_RESERVE_MILLISECONDS; $script:SNAPSHOT_STOP_SECONDS, $script:SNAPSHOT_KILL_RESERVE_MILLISECONDS = $script:G12_STOP_SECONDS, $script:G12_KILL_RESERVE_MILLISECONDS
  $watch = [Diagnostics.Stopwatch]::StartNew(); $thrown = try { $output = & $Step } catch { $_.Exception.Message } finally { $script:SNAPSHOT_STOP_SECONDS, $script:SNAPSHOT_KILL_RESERVE_MILLISECONDS = $saved }
  [pscustomobject]@{ Output = $output; Log = $logged -join ' / '; Kills = "$kills"; Ms = $watch.ElapsedMilliseconds; Thrown = "$thrown" }
}
function Get-StopFailureResult([string] $WorkDir, [string] $Pwsh, [string] $SnapshotSource) {
  $waits = [Collections.Generic.List[int]]::new(); $gracefulMs = $script:G12_STOP_SECONDS * 1000 - $script:G12_KILL_RESERVE_MILLISECONDS; $stopFile = Join-Path $WorkDir 'stand-in.stop'
  $neverExits = New-ProcessStandIn $script:STAND_IN_PID { param($milliseconds) $waits.Add($milliseconds); Start-Sleep -Milliseconds $milliseconds; $false }.GetNewClosure()
  $slowKill = Invoke-StandInStep { Stop-GateSnapshot @{ Process = $neverExits; StopFile = $stopFile; OutLog = '' } } $script:G12_SLOW_KILL_MILLISECONDS; $slowWaits = "$waits"; $waits.Clear()
  $noStopFile = Invoke-StandInStep { Stop-GateSnapshot @{ Process = $neverExits; StopFile = $stopFile; OutLog = '' } } 0 -StopFileFails; $noStopFileWaits = "$waits"
  $waitThrows = Invoke-StandInStep { Stop-GateSnapshot @{ Process = (New-ProcessStandIn $script:STAND_IN_PID { throw 'stand-in wait failed' }); StopFile = $stopFile; OutLog = '' } } 0
  $warning = "WARNING: pid=$($script:STAND_IN_PID) not confirmed stopped within the $($script:G12_STOP_SECONDS) s budget"; $all = $slowKill, $noStopFile, $waitThrows
  $slowOk = $slowKill.Log -match "stop timeout after $($script:G12_STOP_SECONDS) s; $warning; taskkill not finished" -and $slowWaits -eq "$gracefulMs"
  $noStopFileOk = $noStopFile.Log -match "stop file not written \(stand-in stop file failed\); $warning; taskkill exit=128 ERROR: stand-in" -and $waits.Count -eq 1 -and $waits[0] -gt $gracefulMs
  $common = "$($all.Thrown)".Trim() -eq '' -and "$($all.Log)" -notmatch 'stopped pid=' -and "$($slowKill.Kills)|$($noStopFile.Kills)" -eq "$($script:STAND_IN_PID)|$($script:STAND_IN_PID)" -and @($all | Where-Object Ms -GT $script:G12_LIMIT_MILLISECONDS).Count -eq 0
  $logFailExit = Get-LogFailureExitCode $WorkDir $Pwsh $SnapshotSource; $ok = $common -and $slowOk -and $noStopFileOk -and $logFailExit -eq 7 -and $waitThrows.Log -match 'gate snapshot cleanup error \(runner exit code kept\): .*stand-in wait failed'
  New-CheckResult "G12 stop step with stand-in process and taskkill ($($script:G12_SLOW_KILL_MILLISECONDS) ms slow / refused): WARNING, no 'stopped', all in the (scaled) budget; no stop file -> kill at once; errors logged, not thrown; failing log write keeps exit 7" $ok "thrown=[$($all.Thrown)] taskkill-pid=[$($slowKill.Kills)|$($noStopFile.Kills)] waits-ms=[$slowWaits|$noStopFileWaits] ms=[$($all.Ms)] limit-ms=$($script:G12_LIMIT_MILLISECONDS) log-write-fails-exit=$logFailExit log=[$($all.Log -join ' // ')]"
}
function Get-StartFailureResult([string] $WorkDir) {
  $started = New-ProcessStandIn $script:STAND_IN_PID { param($milliseconds) $true }; function Start-Process { $started }  # the snapshot process "spawned"; its start log line then fails
  $r = Invoke-StandInStep { Start-GateSnapshot $WorkDir @(1) } 0 -FailingLog 'gate snapshot started *'
  $ok = $null -eq $r.Output -and -not $r.Thrown -and $r.Kills -eq "$($script:STAND_IN_PID)" -and $r.Ms -le $script:G12_LIMIT_MILLISECONDS -and $r.Log -match "gate snapshot not started: stand-in log write failed / gate snapshot start failed; stopped pid=$($script:STAND_IN_PID)"
  New-CheckResult 'G14 start step throws after the snapshot process started: that process is killed at once, logged, nothing thrown, no snapshot returned' $ok "thrown=[$($r.Thrown)] taskkill-pid=[$($r.Kills)] ms=$($r.Ms) log=[$($r.Log)]"
}# As slot-run.ps1 ends: "exit 7" in try, stop step in finally, trap { exit 1 }; here WaitForExit and every Say throw.
function Get-LogFailureExitCode([string] $WorkDir, [string] $Pwsh, [string] $SnapshotSource) {
  $childScript = Join-Path $WorkDir 'stop-step-log-write-fails.ps1'; $standIn = "[pscustomobject]@{ Id = $($script:STAND_IN_PID) } | Add-Member ScriptMethod WaitForExit { throw 'stand-in wait failed' } -PassThru"
  Set-Content $childScript "trap { exit 1 }`n$SnapshotSource`nfunction Say { throw 'stand-in log write failed' }`ntry { exit 7 } finally { Stop-GateSnapshot @{ Process = ($standIn); StopFile = '$WorkDir\stand-in.stop'; OutLog = '' } }"
  & $Pwsh -NoProfile -File $childScript | Out-Null; return $LASTEXITCODE
}
# Counted on copies of $Rows, $SnapshotPid re-parented to the stand-in runner row that seeds SR-R1, as slot-run.ps1 samples.
function Get-Judgement([object[]] $Rows, [int] $SnapshotPid) {
  $rows = @($Rows | Select-Object ProcessId, ParentProcessId, Name, CommandLine, ExecutablePath, CreationDate); foreach ($row in @($rows | Where-Object ProcessId -EQ $SnapshotPid)) { $row.ParentProcessId = $script:STAND_IN_PID }
  $script:ever = @{ [int]$script:STAND_IN_PID = $true }; $script:foreignSeen = @{}; $hits = @(Counted -All $rows)
  "counted=[$((@($hits.ProcessId) | Sort-Object) -join ',')] excluded=[$((@($script:lastExcluded.ProcessId) | Sort-Object) -join ',')] verdict=$(if ($hits.Count) { 'exit 2' } else { 'continue' })"
}
# Ends what G13 started even when a step throws: stop file and 30 s wait for the snapshot, then Stop-Process on either still running (only these PIDs).
function Stop-EquivalenceFixture($Counted, $Snapshot, [string] $StopFile) {
  try { if ($Snapshot) { New-Item -ItemType File -Force $StopFile | Out-Null; $null = $Snapshot.WaitForExit(30000) } }
  finally { foreach ($p in @($Snapshot, $Counted) | Where-Object { $_ -and -not $_.HasExited }) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } }
}
function Get-FixtureCleanupResult([hashtable] $Ctx) {  # G13 whose snapshot start, then stop file, throws: every process it started has exited
  $cases = foreach ($failing in 'Start-Process', 'New-Item') { $started = [Collections.Generic.List[object]]::new()
    function Start-Process { if ($failing -eq 'Start-Process' -and $args[0] -eq $Ctx.Pwsh) { throw 'stand-in snapshot start failed' }; $p = Microsoft.PowerShell.Management\Start-Process @args; $started.Add($p); $p }
    function New-Item { if ($failing -eq 'New-Item') { throw 'stand-in stop file failed' }; Microsoft.PowerShell.Management\New-Item @args }
    $thrown = try { $null = Get-CountedEquivalenceResult $Ctx } catch { $_.Exception.Message }
    [pscustomobject]@{ Failing = $failing; Thrown = "$thrown"; Started = $started.Count; Left = @($started | Where-Object { -not $_.WaitForExit(5000) }).Count; Pids = "$($started.Id)" } }
  $ok = "$($cases.Started)" -eq '1 2' -and "$($cases.Left)" -eq '0 0' -and @($cases | Where-Object Thrown -NotMatch "^stand-in ").Count -eq 0
  New-CheckResult 'G15 G13 fixture: snapshot start / stop file throws -> the error propagates, every process G13 started has exited' $ok "$(($cases | ForEach-Object { "$($_.Failing): thrown=[$($_.Thrown)] started=[$($_.Pids)] left=$($_.Left)" }) -join '; ')"
}
function Get-CountedEquivalenceResult([hashtable] $Ctx) {
  $files = Join-Path $Ctx.WorkDir 'equivalence-snapshot'; $counted = $snapshot = $null
  try { $counted = Start-Process (Get-Command node).Source '-e "setInterval(() => {}, 1000)"' -WorkingDirectory $Ctx.Root -WindowStyle Hidden -PassThru
    $snapshot = Start-Process $Ctx.Pwsh "-NoProfile -File `"$(Join-Path $PSScriptRoot 'gate-snapshot.ps1')`" -OutFile `"$files.tsv`" -Ports $($script:SNAPSHOT_PREVIEW_PORT) -StopFile `"$files.stop`"" -WindowStyle Hidden -PassThru
    Start-Sleep -Seconds 2; $live = @(Get-CimInstance Win32_Process) } finally { Stop-EquivalenceFixture $counted $snapshot "$files.stop" }
  $with = Get-Judgement $live $snapshot.Id; $without = Get-Judgement @($live | Where-Object ProcessId -NE $snapshot.Id) $snapshot.Id
  $ok = @($live.ProcessId) -contains $snapshot.Id -and $with -eq $without -and $with -match "counted=\[([\d,]*,)?$($counted.Id)(,|\])"
  New-CheckResult "G13 same process table with / without the snapshot pid=$($snapshot.Id): same counted, excluded and verdict (stand-in node pid=$($counted.Id) counted)" $ok "with=[$with] without=[$without]"
}
function Get-ExitFourResult([hashtable] $Ctx) {
  $missing = Invoke-SlotRunner $Ctx.Pwsh $Ctx.Runner $Ctx.Root (Join-Path $Ctx.WorkDir 'run-missing-steps') @{ StepsFile = (Join-Path $Ctx.WorkDir 'absent-steps.ps1'); Stub = 'pass' }
  $location = Invoke-SlotRunner $Ctx.Pwsh $Ctx.Runner $Ctx.Root (Join-Path $Ctx.WorkDir 'run-base-is-root') @{ StepsFile = $Ctx.Steps; Stub = 'pass'; BaseRoot = $Ctx.Root }
  $clean = { param($r) $r.Code -eq 4 -and $r.Log -notmatch 'gate snapshot' -and @($r.Files | Where-Object { $_ -like 'gate-snapshot-*' }).Count -eq 0 }
  New-CheckResult 'G6 exit 4 before the snapshot start (missing -StepsFile; -BaseRoot is the root): no gate-snapshot file or log line' ((& $clean $missing) -and (& $clean $location)) "exit=$($missing.Code),$($location.Code)"
}
$ctx = @{ Pwsh = (Get-Process -Id $PID).Path; Runner = Join-Path $PSScriptRoot 'slot-run.ps1'; Steps = Join-Path $PSScriptRoot 'steps.example.ps1'; Root = $repoRoot.TrimEnd('\'); WorkDir = $OutDir }
Say "selftest-slot-snapshot start head=$(git -C $PSScriptRoot rev-parse HEAD) outdir=$OutDir"
$total = [Diagnostics.Stopwatch]::StartNew(); $port = Get-FreePort; $standIn = Start-ListenerStandIn $port $OutDir
try {
  $results = @(Measure-Checks 'G1+G2' { Get-BusyPortResults $ctx $port $standIn })
  $results += Measure-Checks 'G4' { Get-DuplicatePortResult $ctx $port }; $results += Measure-Checks 'G5' { Get-SlowSnapshotResult $ctx $port }
} finally { Stop-Process -Id $standIn.Id -Force -ErrorAction SilentlyContinue; $standIn.WaitForExit(5000) | Out-Null }
$results += Measure-Checks 'G3+G10 (one -Stub build)' { Get-FreePortResults $ctx $port }
$results += Measure-Checks 'G11' { Get-PreflightExitFourResult $ctx $port }; $results += Measure-Checks 'G6' { Get-ExitFourResult $ctx }
$results += Measure-Checks 'G13' { Get-CountedEquivalenceResult $ctx }; $results += Measure-Checks 'G15' { Get-FixtureCleanupResult $ctx }
$snapshotSource = Get-RunnerSnapshotSource $ctx.Runner; . ([scriptblock]::Create($snapshotSource))
$results += Measure-Checks 'G12' { Get-StopFailureResult $OutDir $ctx.Pwsh $snapshotSource }; $results += Measure-Checks 'G14' { Get-StartFailureResult $OutDir }
foreach ($c in $results) { Say "$(if ($c.Ok) { 'PASS' } else { 'FAIL' }) $($c.Label) $($c.Detail)" }
$failed = @($results | Where-Object { -not $_.Ok }).Count; Say "summary: $($results.Count) checks; $($results.Count - $failed) PASS, $failed FAIL; total $([Math]::Round($total.Elapsed.TotalSeconds, 1)) s"
exit [int]($failed -ne 0)
