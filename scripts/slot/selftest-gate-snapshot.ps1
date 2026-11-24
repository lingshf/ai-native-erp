# Self-test of gate-snapshot.ps1 (S22 SLOT-05 G1–G7, cadence G4b, TSV write failure G6b); Windows, pwsh 7, node on PATH.
# Each case runs the tool via pwsh -NoProfile -File like a window request; stand-ins are its GATE_SNAPSHOT_* variables.
# 4173 is only queried. Only processes started here are stopped; the temp directory is removed. Exit 0 = all pass.
if ($PSVersionTable.PSVersion.Major -lt 7 -or -not $IsWindows) { Write-Host 'selftest-gate-snapshot.ps1 needs PowerShell 7 on Windows'; exit 2 }
$ErrorActionPreference = 'Stop'
$Tool = Join-Path $PSScriptRoot 'gate-snapshot.ps1'
$Pwsh = (Get-Process -Id $PID).Path
$Work = Join-Path ([IO.Path]::GetTempPath()) "gate-snapshot-selftest-$([guid]::NewGuid().ToString('N').Substring(0, 8))"
$DirA = Join-Path $Work 'A'; $DirB = Join-Path $Work 'B'
$SnapshotWaitSeconds = 30; $RunLimitSeconds = 30; $StopExitLimitSeconds = 15; $ListenWaitSeconds = 10
$CadenceIntervalSeconds = 3; $CadenceSlowFirstSeconds = 4; $CadenceToleranceSeconds = 0.2
$ListenFailure = @{ GATE_SNAPSHOT_FAIL_LISTEN_QUERY = 'ObjectNotFound' }
$script:results = [Collections.Generic.List[object]]::new(); $script:started = [Collections.Generic.List[int]]::new()
# ---- helpers ------------------------------------------------------------------------------------------------------
function Invoke-Case([string] $name, [scriptblock] $body) {
  $watch = [Diagnostics.Stopwatch]::StartNew()
  try {
    if (-not (Test-Path -LiteralPath $Tool)) { throw "gate-snapshot.ps1 not found ($Tool)" }
    $r = & $body; $ok = [bool]$r.Ok; $detail = $r.Detail
  } catch { $ok = $false; $detail = "error: $($_.Exception.Message)" }
  Write-Host ('{0} {1} ({2} ms) {3}' -f $(if ($ok) { 'PASS' } else { 'FAIL' }), $name, $watch.ElapsedMilliseconds, $detail)
  $script:results.Add([pscustomobject]@{ Name = $name; Ok = $ok })
}
function New-OutPath([string] $label) { Join-Path $Work "$label.tsv" }
# TSV -> one hashtable per data row (cmdline may hold quotes, so no Import-Csv).
function Read-Tsv([string] $path) {
  if (-not (Test-Path -LiteralPath $path)) { return @() }
  $lines = @(Get-Content -LiteralPath $path -Encoding utf8); $header = $lines[0] -split "`t"
  foreach ($line in $lines | Select-Object -Skip 1) {
    $cells = $line -split "`t"; $row = @{}; for ($i = 0; $i -lt $header.Count; $i++) { $row[$header[$i]] = $cells[$i] }; $row
  }
}
# Starts the tool through its public command line; stand-in variables are set only while it starts (it inherits them).
function Start-GateSnapshot([string] $label, [string[]] $arguments, [hashtable] $standIns = @{}) {
  $log = Join-Path $Work "$label.out"; $quoted = ($arguments | ForEach-Object { "`"$_`"" }) -join ' '
  foreach ($k in $standIns.Keys) { Set-Item "env:$k" $standIns[$k] }
  try { $proc = Start-Process $Pwsh -ArgumentList "-NoProfile -File `"$Tool`" $quoted" -RedirectStandardOutput $log -WindowStyle Hidden -PassThru }
  finally { foreach ($k in $standIns.Keys) { Remove-Item "env:$k" -ErrorAction SilentlyContinue } }
  $null = $proc.Handle; $script:started.Add($proc.Id)
  [pscustomobject]@{ Process = $proc; Log = $log }
}
# Waits for a started run to exit; returns its exit code, output and the TSV rows.
function Complete-GateSnapshot($run, [string] $outPath, [int] $limitSeconds = $RunLimitSeconds) {
  if (-not $run.Process.WaitForExit($limitSeconds * 1000)) { throw "gate-snapshot did not exit within $limitSeconds s" }; $run.Process.WaitForExit()
  [pscustomobject]@{ Code = $run.Process.ExitCode; Output = "$(Get-Content -LiteralPath $run.Log -Raw)".Trim(); Rows = @(if ($outPath) { Read-Tsv $outPath }) }
}
# Polls $done every 100 ms until it returns true; throws $failure when $seconds pass or $abort returns true first.
function Wait-Until([scriptblock] $done, [int] $seconds, [string] $failure, [scriptblock] $abort = { $false }) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while (-not (& $done)) { if ((& $abort) -or (Get-Date) -gt $deadline) { throw $failure }; Start-Sleep -Milliseconds 100 }
}
# Waits until the still running $run has written snapshot $number to the TSV.
function Wait-TsvSnapshot([string] $path, [int] $number, $run) {
  Wait-Until { @(Read-Tsv $path | Where-Object snapshot -EQ "$number").Count } $SnapshotWaitSeconds "$SnapshotWaitSeconds s 内未见第 $number 次快照" { $run.Process.HasExited }
}
function Get-FreePort {
  $probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::IPv6Any, 0); $probe.Server.DualMode = $true; $probe.Start()
  try { $probe.LocalEndpoint.Port } finally { $probe.Stop() }
}
# Parent node (cwd A, listens 127.0.0.1:port) starts a child node (cwd B, listens ::1:port); waits for both listeners.
# Both run pair.cjs: given a child cwd it is the parent; the child exits once its parent is gone.
function Start-NodePair([int] $port) {
  Set-Content (Join-Path $Work 'pair.cjs') @'
const [port, childCwd] = process.argv.slice(2);
require('net').createServer().listen(+port, childCwd ? '127.0.0.1' : '::1');
if (childCwd) require('child_process').spawn(process.execPath, [__filename, port], { cwd: childCwd, stdio: 'ignore', windowsHide: true });
setInterval(() => { try { process.kill(process.ppid, 0); } catch { process.exit(0); } }, 500);
'@
  $parent = Start-Process (Get-Command node).Source -ArgumentList "`"$Work\pair.cjs`" $port `"$DirB`"" -WorkingDirectory $DirA -WindowStyle Hidden -PassThru
  $script:started.Add($parent.Id)
  Wait-Until { @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue).Count -ge 2 } $ListenWaitSeconds "node pair did not listen on 127.0.0.1 and ::1 port $port"
  $child = Get-CimInstance Win32_Process -Filter "ParentProcessId=$($parent.Id) AND Name='node.exe'"; $script:started.Add([int]$child.ProcessId)
  [pscustomobject]@{ ParentPid = $parent.Id; ChildPid = [int]$child.ProcessId; Port = $port }
}
# A real create failure: a new directory in which the current user may not create files.
function New-DeniedDirectory([string] $dir) {
  $acl = Get-Acl -LiteralPath (New-Item -ItemType Directory $dir).FullName
  $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.WindowsIdentity]::GetCurrent().User, 'CreateFiles', 'Deny'))
  Set-Acl -LiteralPath $dir $acl
}
# A real append failure: opens the TSV for reading and denies other writers (retries while the tool is appending).
function Lock-TsvFile([string] $path) {
  for ($try = 1; ; $try++) { try { return [IO.File]::Open($path, 'Open', 'Read', 'Read') } catch { if ($try -ge 50) { throw } }; Start-Sleep -Milliseconds 20 }
}
function Remove-SelftestTraces {
  foreach ($id in $script:started) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
  foreach ($id in $script:started) { Wait-Process -Id $id -Timeout 5 -ErrorAction SilentlyContinue }
  Remove-Item -LiteralPath $Work -Recurse -Force -ErrorAction SilentlyContinue
}
function Test-SameDir([string] $a, [string] $b) { $a.TrimEnd('\') -ieq $b.TrimEnd('\') }
function Get-SnapshotNumbers($rows) { @($rows | ForEach-Object { [int]$_.snapshot } | Sort-Object -Unique) }
# ---- cases --------------------------------------------------------------------------------------------------------
function Test-ChainG1 {
  $script:pair = Start-NodePair (Get-FreePort); $script:freePort = Get-FreePort; $out = New-OutPath 'once'
  $script:once = Complete-GateSnapshot (Start-GateSnapshot 'once' @('-OutFile', $out, '-Ports', "$($pair.Port),$freePort,4173", '-Once')) $out
  $rows = $once.Rows; $i = [array]::FindIndex([object[]]$rows, [Predicate[object]] { param($r) $r.kind -eq 'node' -and $r.pid -eq "$($pair.ChildPid)" })
  if ($i -lt 0) { return @{ Ok = $false; Detail = "no node row for child pid=$($pair.ChildPid); exit=$($once.Code)" } }
  $c = $rows[$i]; $p = $rows[$i + 1]; $s = $rows[$i + 2]; $after = $rows[$i + 3]
  $ok = $c.depth -eq '0' -and (Test-SameDir $c.cwd $DirB) -and
    $p.kind -eq 'ancestor' -and $p.depth -eq '1' -and $p.pid -eq "$($pair.ParentPid)" -and $p.name -eq 'node.exe' -and (Test-SameDir $p.cwd $DirA) -and
    $s.kind -eq 'ancestor' -and $s.depth -eq '2' -and $s.pid -eq "$PID" -and $s.name -eq 'pwsh.exe' -and
    -not ($after -and $after.kind -eq 'ancestor' -and $after.depth -eq '3')
  @{ Ok = $ok; Detail = "chain: node $($c.pid) cwd=[$($c.cwd)] -> $($p.name) $($p.pid) cwd=[$($p.cwd)] -> $($s.name) $($s.pid) depth=$($s.depth)" }
}

function Test-FieldsG2 {
  $rows = @($once.Rows | Where-Object { $_.kind -in 'node', 'ancestor' -and $_.pid -in "$($pair.ChildPid)", "$($pair.ParentPid)", "$PID" })
  $bad = @($rows | Where-Object {
      $created = [datetimeoffset]::MinValue; $cpu = 0.0
      -not ([datetimeoffset]::TryParse($_.created, [ref]$created) -and $_.created -match '[+-]\d\d:\d\d$') -or
      -not ([double]::TryParse($_.cpuSeconds, [Globalization.NumberStyles]::Float, [cultureinfo]::InvariantCulture, [ref]$cpu) -and $cpu -ge 0) -or
      $_.cmdline -match "[`t`r`n]" })
  @{ Ok = $rows.Count -ge 3 -and $bad.Count -eq 0; Detail = "checked=$($rows.Count) bad=$($bad.Count) sample created=$($rows[0].created) cpu=$($rows[0].cpuSeconds)" }
}

function Test-PortsG3 {
  $p = @($once.Rows | Where-Object { $_.kind -eq 'listen' -and $_.port -eq "$($pair.Port)" })
  $v4 = @($p | Where-Object { $_.localAddress -eq '127.0.0.1' -and $_.pid -eq "$($pair.ParentPid)" })
  $v6 = @($p | Where-Object { $_.localAddress -eq '::1' -and $_.pid -eq "$($pair.ChildPid)" })
  $q = @($once.Rows | Where-Object port -EQ "$freePort"); $vite = @($once.Rows | Where-Object port -EQ '4173')
  $errors = @($once.Rows | Where-Object kind -EQ 'error')
  $ok = $once.Code -eq 0 -and $p.Count -eq 2 -and $v4.Count -eq 1 -and $v6.Count -eq 1 -and
    $q.Count -eq 1 -and $q[0].kind -eq 'listen' -and $q[0].pid -eq 'none' -and $q[0].localAddress -eq '' -and
    $vite.Count -ge 1 -and @($vite | Where-Object kind -NE 'listen').Count -eq 0 -and $errors.Count -eq 0
  @{ Ok = $ok; Detail = "exit=$($once.Code) P=$($pair.Port) rows=$($p.Count) Q=$freePort pid=$($q.pid) 4173 pid=$($vite.pid -join ',') errors=$($errors.Count)" }
}

function Test-StopFileG4 {
  $out = New-OutPath 'stop'; $stop = Join-Path $Work 'stop.flag'
  $run = Start-GateSnapshot 'stop' @('-OutFile', $out, '-Ports', "$freePort", '-StopFile', $stop, '-IntervalSeconds', '1')
  Wait-TsvSnapshot $out 2 $run
  New-Item -ItemType File $stop | Out-Null; $watch = [Diagnostics.Stopwatch]::StartNew()
  $r = Complete-GateSnapshot $run $out $StopExitLimitSeconds; $exitSeconds = $watch.Elapsed.TotalSeconds
  $numbers = Get-SnapshotNumbers $r.Rows
  $ok = $r.Code -eq 0 -and $numbers.Count -ge 2 -and ($numbers -join ',') -eq ((1..$numbers[-1]) -join ',') -and $r.Output -match 'timedOut=false'
  @{ Ok = $ok; Detail = "exit=$($r.Code) snapshots=$($numbers -join ',') exit-after-stop=$([math]::Round($exitSeconds, 2)) s $($r.Output)" }
}

function Start-CadenceRun {
  $out = New-OutPath 'cadence'; $stop = Join-Path $Work 'cadence.flag'; $slowFirst = @{ GATE_SNAPSHOT_SLOW_FIRST_SECONDS = "$CadenceSlowFirstSeconds" }
  $run = Start-GateSnapshot 'cadence' @('-OutFile', $out, '-Ports', "$freePort", '-StopFile', $stop, '-IntervalSeconds', "$CadenceIntervalSeconds") $slowFirst
  [pscustomobject]@{ Run = $run; Out = $out; Stop = $stop }
}
function Test-CadenceG4b($cadence) {
  Wait-TsvSnapshot $cadence.Out 3 $cadence.Run; New-Item -ItemType File $cadence.Stop | Out-Null
  $r = Complete-GateSnapshot $cadence.Run $cadence.Out $StopExitLimitSeconds
  $starts = @($r.Rows | Group-Object snapshot | Sort-Object { [int]$_.Name } | ForEach-Object { [datetimeoffset]::Parse($_.Group[0].takenAt) })
  $gaps = @(for ($i = 1; $i -lt $starts.Count; $i++) { ($starts[$i] - $starts[$i - 1]).TotalSeconds })
  $short = @($gaps | Where-Object { $_ -lt $CadenceIntervalSeconds - $CadenceToleranceSeconds })
  $ok = $r.Code -eq 0 -and $gaps.Count -ge 2 -and $gaps[0] -ge $CadenceSlowFirstSeconds -and $short.Count -eq 0
  @{ Ok = $ok; Detail = "exit=$($r.Code) interval=$CadenceIntervalSeconds s, snapshot 1 slowed by $CadenceSlowFirstSeconds s, gaps=[$(($gaps | ForEach-Object { $_.ToString('F2') }) -join ', ')] s" }
}

function Test-ArgumentsG5 {
  $existing = New-OutPath 'existing'; Set-Content $existing 'keep'; $fresh = New-OutPath 'never'
  $sets = [ordered]@{
    'OutFile exists' = @('-OutFile', $existing, '-Ports', '4204', '-Once')
    'Once and StopFile' = @('-OutFile', $fresh, '-Ports', '4204', '-Once', '-StopFile', "$Work\x.flag")
    'neither Once nor StopFile' = @('-OutFile', $fresh, '-Ports', '4204')
  }
  foreach ($ports in '0', '70000', 'abc', '4204,', '4204,4204') { $sets["Ports `"$ports`""] = @('-OutFile', $fresh, '-Ports', $ports, '-Once') }
  $runs = [ordered]@{}; foreach ($name in $sets.Keys) { $runs[$name] = Start-GateSnapshot "arguments-$($runs.Count)" $sets[$name] }
  $failed = foreach ($name in $runs.Keys) {
    $code = (Complete-GateSnapshot $runs[$name]).Code
    if ($code -ne 3 -or (Test-Path $fresh) -or (Get-Content $existing -Raw).Trim() -ne 'keep') { "$name -> exit=$code" }
  }
  @{ Ok = -not $failed; Detail = "cases=$($sets.Count) (in parallel) $(if ($failed) { 'failed: ' + ($failed -join '; ') } else { 'all exit=3, nothing written' })" }
}

function Test-QueryErrorG6 {
  $out = New-OutPath 'error'; $ports = "$($pair.Port),$freePort"
  $r = Complete-GateSnapshot (Start-GateSnapshot 'error' @('-OutFile', $out, '-Ports', $ports, '-Once') $ListenFailure) $out
  $portRows = @($r.Rows | Where-Object port)
  $errorPorts = @($portRows | Where-Object { $_.kind -eq 'error' -and $_.note -match '\[ObjectNotFound\]' } | ForEach-Object port) -join ','
  $processRows = @($r.Rows | Where-Object kind -In 'node', 'ancestor', 'none')
  $ok = $r.Code -eq 8 -and $portRows.Count -eq 2 -and $errorPorts -eq $ports -and $processRows.Count -ge 1
  @{ Ok = $ok; Detail = "exit=$($r.Code) ports=$ports rows=[$($portRows.kind -join ',')] pid=none rows=$(@($portRows | Where-Object pid -EQ 'none').Count) note=[$($portRows[0].note)] process-rows=$($processRows.Count)" }
}

function Test-WriteFailureG6b {
  $denied = Join-Path $Work 'denied'; New-DeniedDirectory $denied
  $create = Start-GateSnapshot 'create-failed' @('-OutFile', "$denied\x.tsv", '-Ports', "$freePort", '-Once')
  $out = New-OutPath 'append'; $stop = Join-Path $Work 'append.flag'
  $run = Start-GateSnapshot 'append-failed' @('-OutFile', $out, '-Ports', "$freePort", '-StopFile', $stop, '-IntervalSeconds', '1')
  Wait-TsvSnapshot $out 1 $run; $lock = Lock-TsvFile $out
  try { $a = Complete-GateSnapshot $run '' $StopExitLimitSeconds } finally { $lock.Dispose() }
  $c = Complete-GateSnapshot $create ''
  $written = (Get-SnapshotNumbers (Read-Tsv $out)).Count
  $ok = $c.Code -eq 8 -and $c.Output -match 'TSV create failed' -and $c.Output -match 'snapshots=0 ' -and -not (Test-Path "$denied\x.tsv") -and
    $a.Code -eq 8 -and $a.Output -match 'TSV write failed' -and $a.Output -match "snapshots=$written " -and $written -ge 1 -and -not (Test-Path $stop)
  @{ Ok = $ok; Detail = "create: exit=$($c.Code) [$($c.Output -replace '\s+', ' ')] | append (TSV locked, written=$written): exit=$($a.Code) [$($a.Output -replace '\s+', ' ')]" }
}

function Test-MaxMinutesG7 {
  $clock = @{ GATE_SNAPSHOT_SECONDS_PER_MINUTE = '2' }; $out = New-OutPath 'timeout'; $out2 = New-OutPath 'timeout-error'
  $common = @('-Ports', "$freePort", '-StopFile', "$Work\never.flag", '-IntervalSeconds', '1', '-MaxMinutes', '1')
  $timeout = Start-GateSnapshot 'timeout' (@('-OutFile', $out) + $common) $clock
  $timeoutError = Start-GateSnapshot 'timeout-error' (@('-OutFile', $out2) + $common) ($clock + $ListenFailure)
  $t = Complete-GateSnapshot $timeout $out; $e = Complete-GateSnapshot $timeoutError $out2
  $ok = $t.Code -eq 9 -and $t.Output -match 'timedOut=true' -and $t.Rows.Count -ge 1 -and $e.Code -eq 8 -and $e.Output -match 'errors=[1-9]\d* timedOut=true'
  @{ Ok = $ok; Detail = "timeout: exit=$($t.Code) rows=$($t.Rows.Count) [$($t.Output)] | error+timeout: exit=$($e.Code) [$($e.Output)]" }
}
# ---- run ----------------------------------------------------------------------------------------------------------
$total = [Diagnostics.Stopwatch]::StartNew()
New-Item -ItemType Directory -Force $DirA, $DirB | Out-Null
try {
  Invoke-Case 'G1 -Once: child node (cwd B) -> parent node (cwd A) -> selftest pwsh, chain ends' { Test-ChainG1 }
  Invoke-Case 'G2 created has an offset, cpuSeconds >= 0, cmdline without tab/newline' { Test-FieldsG2 }
  Invoke-Case 'G3 -Ports "P,Q,4173": P per endpoint (127.0.0.1, ::1), Q pid=none, 4173 queried, no error' { Test-PortsG3 }
  $cadence = Start-CadenceRun # overlaps G4 to keep the self-test within 60 s
  Invoke-Case 'G4 -StopFile -IntervalSeconds 1: stop after snapshot 2, exit 0, consecutive, timedOut=false' { Test-StopFileG4 }
  Invoke-Case 'G4b cadence: after a slow snapshot the next is due interval after its start, no catch-up' { Test-CadenceG4b $cadence }
  Invoke-Case 'G5 bad arguments: exit 3, nothing written' { Test-ArgumentsG5 }
  Invoke-Case 'G6 listen query throws ObjectNotFound (stand-in): exit 8, every port kind=error, no pid=none' { Test-QueryErrorG6 }
  Invoke-Case 'G6b TSV create / append fails: exit 8, stops at once, summary matches the file' { Test-WriteFailureG6b }
  Invoke-Case 'G7 -MaxMinutes reached: exit 9 timedOut=true; with a query error: exit 8 (8 > 9)' { Test-MaxMinutesG7 }
} finally { Remove-SelftestTraces }
$failed = @($script:results | Where-Object { -not $_.Ok })
Write-Host ('summary pass={0} fail={1} total={2:N1} s' -f ($script:results.Count - $failed.Count), $failed.Count, $total.Elapsed.TotalSeconds)
exit $(if ($failed) { 1 } else { 0 })
