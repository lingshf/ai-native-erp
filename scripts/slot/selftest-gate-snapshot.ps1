# Self-test of gate-snapshot.ps1 (S22 SLOT-05 G1–G7). Standalone, Windows + PowerShell 7, node on PATH:
#   pwsh -NoProfile -File scripts/slot/selftest-gate-snapshot.ps1
# Every case runs the tool as a child process exactly as a window request does (pwsh -NoProfile -File … -Ports "…").
# Stand-ins (G6, G7) go through the tool's environment variables GATE_SNAPSHOT_FAIL_PORTS and
# GATE_SNAPSHOT_SECONDS_PER_MINUTE. Port 4173 is only queried, never bound or stopped. Only the node processes this
# script starts are stopped, and its temporary directory is removed. Exit 0 when every case passes, 1 otherwise.
if ($PSVersionTable.PSVersion.Major -lt 7 -or -not $IsWindows) { Write-Host 'selftest-gate-snapshot.ps1 needs PowerShell 7 on Windows'; exit 2 }
$ErrorActionPreference = 'Stop'
$Tool = Join-Path $PSScriptRoot 'gate-snapshot.ps1'
$Pwsh = (Get-Process -Id $PID).Path
$Work = Join-Path ([IO.Path]::GetTempPath()) "gate-snapshot-selftest-$([guid]::NewGuid().ToString('N').Substring(0, 8))"
$DirA = Join-Path $Work 'A'; $DirB = Join-Path $Work 'B'
$SecondSnapshotWaitSeconds = 30
$StopExitLimitSeconds = 15
$ListenWaitSeconds = 10
$script:results = [Collections.Generic.List[object]]::new()
$script:started = [Collections.Generic.List[int]]::new()

# ---- helpers ------------------------------------------------------------------------------------------------------
function Invoke-Case([string] $name, [scriptblock] $body) {
  $watch = [Diagnostics.Stopwatch]::StartNew()
  try {
    if (-not (Test-Path -LiteralPath $Tool)) { throw "gate-snapshot.ps1 not found ($Tool)" }
    $r = & $body; $ok = [bool]$r.Ok; $detail = $r.Detail
  } catch { $ok = $false; $detail = "error: $($_.Exception.Message)" }
  $line = '{0} {1} ({2} ms) {3}' -f $(if ($ok) { 'PASS' } else { 'FAIL' }), $name, $watch.ElapsedMilliseconds, $detail
  Write-Host $line
  $script:results.Add([pscustomobject]@{ Name = $name; Ok = $ok })
}

function New-OutPath([string] $label) { Join-Path $Work "$label.tsv" }

# TSV -> one hashtable per data row (cmdline may hold quotes, so no Import-Csv).
function Read-Tsv([string] $path) {
  if (-not (Test-Path -LiteralPath $path)) { return @() }
  $lines = @(Get-Content -LiteralPath $path -Encoding utf8)
  $header = $lines[0] -split "`t"
  foreach ($line in $lines | Select-Object -Skip 1) {
    $cells = $line -split "`t"; $row = @{}
    for ($i = 0; $i -lt $header.Count; $i++) { $row[$header[$i]] = $cells[$i] }
    $row
  }
}

# Runs the tool through its public command line with optional stand-in variables; returns exit code, output, rows.
function Invoke-GateSnapshot([string[]] $arguments, [hashtable] $standIns = @{}, [string] $outPath) {
  foreach ($k in $standIns.Keys) { Set-Item "env:$k" $standIns[$k] }
  try { $output = (& $Pwsh -NoProfile -File $Tool @arguments 2>&1 | Out-String).Trim(); $code = $LASTEXITCODE }
  finally { foreach ($k in $standIns.Keys) { Remove-Item "env:$k" -ErrorAction SilentlyContinue } }
  [pscustomobject]@{ Code = $code; Output = $output; Rows = @(if ($outPath) { Read-Tsv $outPath }) }
}

function Get-FreePort {
  $probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::IPv6Any, 0)
  $probe.Server.DualMode = $true; $probe.Start(); $port = $probe.LocalEndpoint.Port; $probe.Stop()
  return $port
}

function Get-Listeners([int] $port) { @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) }

# Parent node (cwd A, listens 127.0.0.1:port) starts a child node (cwd B, listens ::1:port); waits for both listeners.
function Start-NodePair([int] $port) {
  Set-Content (Join-Path $Work 'child.cjs') @'
require('net').createServer().listen(+process.argv[2], '::1');
setInterval(() => { try { process.kill(process.ppid, 0); } catch { process.exit(0); } }, 500);
'@
  Set-Content (Join-Path $Work 'parent.cjs') @'
const [port, child, cwd] = process.argv.slice(2);
require('net').createServer().listen(+port, '127.0.0.1');
require('child_process').spawn(process.execPath, [child, port], { cwd, stdio: 'ignore', windowsHide: true });
setInterval(() => {}, 1000);
'@
  $node = (Get-Command node).Source
  $arguments = "`"$Work\parent.cjs`" $port `"$Work\child.cjs`" `"$DirB`""
  $parent = Start-Process $node -ArgumentList $arguments -WorkingDirectory $DirA -WindowStyle Hidden -PassThru
  $script:started.Add($parent.Id)
  $deadline = (Get-Date).AddSeconds($ListenWaitSeconds)
  while ((Get-Listeners $port).Count -lt 2) {
    if ((Get-Date) -gt $deadline) { throw "node pair did not listen on 127.0.0.1 and ::1 port $port" }
    Start-Sleep -Milliseconds 100
  }
  $child = Get-CimInstance Win32_Process -Filter "ParentProcessId=$($parent.Id) AND Name='node.exe'"
  $script:started.Add([int]$child.ProcessId)
  [pscustomobject]@{ ParentPid = $parent.Id; ChildPid = [int]$child.ProcessId; Port = $port }
}

function Remove-SelftestTraces {
  foreach ($id in $script:started) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
  foreach ($id in $script:started) { Wait-Process -Id $id -Timeout 5 -ErrorAction SilentlyContinue }
  Remove-Item -LiteralPath $Work -Recurse -Force -ErrorAction SilentlyContinue
}

function Test-SameDir([string] $a, [string] $b) { $a.TrimEnd('\') -ieq $b.TrimEnd('\') }

# ---- cases --------------------------------------------------------------------------------------------------------
function Test-ChainG1 {
  $script:pair = Start-NodePair (Get-FreePort)
  $script:freePort = Get-FreePort
  $out = New-OutPath 'once'
  $script:once = Invoke-GateSnapshot @('-OutFile', $out, '-Ports', "$($pair.Port),$freePort,4173", '-Once') @{} $out
  $rows = $once.Rows
  $i = [array]::FindIndex([object[]]$rows, [Predicate[object]] { param($r) $r.kind -eq 'node' -and $r.pid -eq "$($pair.ChildPid)" })
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
  $listen = @($once.Rows | Where-Object { $_.kind -eq 'listen' })
  $p = @($listen | Where-Object port -EQ "$($pair.Port)")
  $v4 = @($p | Where-Object { $_.localAddress -eq '127.0.0.1' -and $_.pid -eq "$($pair.ParentPid)" })
  $v6 = @($p | Where-Object { $_.localAddress -eq '::1' -and $_.pid -eq "$($pair.ChildPid)" })
  $q = @($once.Rows | Where-Object port -EQ "$freePort")
  $vite = @($once.Rows | Where-Object port -EQ '4173')
  $errors = @($once.Rows | Where-Object kind -EQ 'error')
  $ok = $once.Code -eq 0 -and $p.Count -eq 2 -and $v4.Count -eq 1 -and $v6.Count -eq 1 -and
    $q.Count -eq 1 -and $q[0].kind -eq 'listen' -and $q[0].pid -eq 'none' -and $q[0].localAddress -eq '' -and
    $vite.Count -ge 1 -and @($vite | Where-Object kind -NE 'listen').Count -eq 0 -and $errors.Count -eq 0
  @{ Ok = $ok; Detail = "exit=$($once.Code) P=$($pair.Port) rows=$($p.Count) Q=$freePort pid=$($q.pid) 4173 pid=$($vite.pid -join ',') errors=$($errors.Count)" }
}

function Test-StopFileG4 {
  $out = New-OutPath 'stop'; $stop = Join-Path $Work 'stop.flag'; $log = Join-Path $Work 'stop.out'
  $arguments = "-NoProfile -File `"$Tool`" -OutFile `"$out`" -Ports `"$freePort`" -StopFile `"$stop`" -IntervalSeconds 1"
  $proc = Start-Process $Pwsh -ArgumentList $arguments -RedirectStandardOutput $log -WindowStyle Hidden -PassThru
  $deadline = (Get-Date).AddSeconds($SecondSnapshotWaitSeconds)
  while (-not @(Read-Tsv $out | Where-Object snapshot -EQ '2').Count) {
    if ((Get-Date) -gt $deadline) { Stop-Process -Id $proc.Id -Force; return @{ Ok = $false; Detail = "30 s 内未见第 2 次快照" } }
    Start-Sleep -Milliseconds 100
  }
  New-Item -ItemType File $stop | Out-Null; $stopAt = Get-Date
  if (-not $proc.WaitForExit($StopExitLimitSeconds * 1000)) { Stop-Process -Id $proc.Id -Force; return @{ Ok = $false; Detail = 'no exit within 15 s of the stop file' } }
  $proc.WaitForExit(); $exitSeconds = ((Get-Date) - $stopAt).TotalSeconds
  $numbers = @(Read-Tsv $out | ForEach-Object { [int]$_.snapshot } | Sort-Object -Unique)
  $consecutive = ($numbers -join ',') -eq ((1..$numbers[-1]) -join ',')
  $summary = Get-Content $log -Raw
  $ok = $proc.ExitCode -eq 0 -and $consecutive -and $numbers.Count -ge 2 -and $summary -match 'timedOut=false'
  @{ Ok = $ok; Detail = "exit=$($proc.ExitCode) snapshots=$($numbers -join ',') exit-after-stop=$([math]::Round($exitSeconds, 2)) s $($summary.Trim())" }
}

function Test-ArgumentsG5 {
  $existing = New-OutPath 'existing'; Set-Content $existing 'keep'
  $fresh = New-OutPath 'never'
  $sets = [ordered]@{
    'OutFile exists' = @('-OutFile', $existing, '-Ports', '4204', '-Once')
    'Once and StopFile' = @('-OutFile', $fresh, '-Ports', '4204', '-Once', '-StopFile', "$Work\x.flag")
    'neither Once nor StopFile' = @('-OutFile', $fresh, '-Ports', '4204')
    'Ports "0"' = @('-OutFile', $fresh, '-Ports', '0', '-Once')
    'Ports "70000"' = @('-OutFile', $fresh, '-Ports', '70000', '-Once')
    'Ports "abc"' = @('-OutFile', $fresh, '-Ports', 'abc', '-Once')
    'Ports "4204,"' = @('-OutFile', $fresh, '-Ports', '4204,', '-Once')
    'Ports "4204,4204"' = @('-OutFile', $fresh, '-Ports', '4204,4204', '-Once')
  }
  $failed = foreach ($name in $sets.Keys) {
    $code = (Invoke-GateSnapshot $sets[$name]).Code
    if ($code -ne 3 -or (Test-Path $fresh) -or (Get-Content $existing -Raw).Trim() -ne 'keep') { "$name -> exit=$code" }
  }
  @{ Ok = -not $failed; Detail = "cases=$($sets.Count) $(if ($failed) { 'failed: ' + ($failed -join '; ') } else { 'all exit=3, nothing written' })" }
}

function Test-QueryErrorG6 {
  $broken = Get-FreePort; $out = New-OutPath 'error'
  $r = Invoke-GateSnapshot @('-OutFile', $out, '-Ports', "$broken,$freePort", '-Once') @{ GATE_SNAPSHOT_FAIL_PORTS = "$broken" } $out
  $brokenRows = @($r.Rows | Where-Object port -EQ "$broken")
  $freeRows = @($r.Rows | Where-Object { $_.port -eq "$freePort" -and $_.pid -eq 'none' })
  $processRows = @($r.Rows | Where-Object kind -In 'node', 'ancestor', 'none')
  $ok = $r.Code -eq 8 -and $brokenRows.Count -eq 1 -and $brokenRows[0].kind -eq 'error' -and $freeRows.Count -eq 1 -and $processRows.Count -ge 1
  @{ Ok = $ok; Detail = "exit=$($r.Code) broken=$broken rows=[$($brokenRows.kind -join ',')] note=[$($brokenRows.note)] free-none=$($freeRows.Count) process-rows=$($processRows.Count)" }
}

function Test-MaxMinutesG7 {
  $clock = @{ GATE_SNAPSHOT_SECONDS_PER_MINUTE = '2' }
  $out = New-OutPath 'timeout'
  $common = @('-StopFile', "$Work\never.flag", '-IntervalSeconds', '1', '-MaxMinutes', '1')
  $t = Invoke-GateSnapshot (@('-OutFile', $out, '-Ports', "$freePort") + $common) $clock $out
  $out2 = New-OutPath 'timeout-error'
  $e = Invoke-GateSnapshot (@('-OutFile', $out2, '-Ports', "$freePort") + $common) ($clock + @{ GATE_SNAPSHOT_FAIL_PORTS = "$freePort" }) $out2
  $ok = $t.Code -eq 9 -and $t.Output -match 'timedOut=true' -and $t.Rows.Count -ge 1 -and
    $e.Code -eq 8 -and $e.Output -match 'errors=[1-9]\d* timedOut=true'
  @{ Ok = $ok; Detail = "timeout: exit=$($t.Code) rows=$($t.Rows.Count) [$($t.Output)] | error+timeout: exit=$($e.Code) [$($e.Output)]" }
}

# ---- run ----------------------------------------------------------------------------------------------------------
$total = [Diagnostics.Stopwatch]::StartNew()
New-Item -ItemType Directory -Force $DirA, $DirB | Out-Null
try {
  Invoke-Case 'G1 -Once: child node (cwd B) -> parent node (cwd A) -> selftest pwsh, chain ends' { Test-ChainG1 }
  Invoke-Case 'G2 created has an offset, cpuSeconds >= 0, cmdline without tab/newline' { Test-FieldsG2 }
  Invoke-Case 'G3 -Ports "P,Q,4173": P per endpoint (127.0.0.1, ::1), Q pid=none, 4173 queried, no error' { Test-PortsG3 }
  Invoke-Case 'G4 -StopFile -IntervalSeconds 1: stop after snapshot 2, exit 0, consecutive, timedOut=false' { Test-StopFileG4 }
  Invoke-Case 'G5 bad arguments: exit 3, nothing written' { Test-ArgumentsG5 }
  Invoke-Case 'G6 port query fails (stand-in): exit 8, only kind=error for that port' { Test-QueryErrorG6 }
  Invoke-Case 'G7 -MaxMinutes reached: exit 9 timedOut=true; with a query error: exit 8 (8 > 9)' { Test-MaxMinutesG7 }
} finally { Remove-SelftestTraces }
$failed = @($script:results | Where-Object { -not $_.Ok })
Write-Host ('summary pass={0} fail={1} total={2:N1} s' -f ($script:results.Count - $failed.Count), $failed.Count, $total.Elapsed.TotalSeconds)
exit $(if ($failed) { 1 } else { 0 })
