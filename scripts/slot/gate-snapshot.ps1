# Window gate snapshot (S22 SLOT-05, D507): records node processes, their parent chains, cwd, CPU seconds and the
# listeners of the given ports into a new TSV. It only records facts: no ownership verdict, no process is stopped.
#   pwsh -NoProfile -File scripts\slot\gate-snapshot.ps1 -OutFile <new.tsv> -Ports "<port>[,<port>…]" (-Once | -StopFile <path>)
#        [-IntervalSeconds 60] [-MaxMinutes 180]
# Exit (priority 8 > 9 > 0): 0 all snapshots done; 2 not Windows / not PowerShell 7; 3 bad arguments (nothing written);
# 8 at least one process or port query failed (a kind=error row); 9 -MaxMinutes reached before -StopFile appeared.
# Self-test stand-ins (selftest-gate-snapshot.ps1 only; unset in real use): GATE_SNAPSHOT_FAIL_PORTS="<port>[,…]" makes
# the lookup of those ports throw; GATE_SNAPSHOT_SECONDS_PER_MINUTE=<n> counts each -MaxMinutes minute as n seconds.
param([string] $OutFile, [string] $Ports, [switch] $Once, [string] $StopFile, [int] $IntervalSeconds = 60, [int] $MaxMinutes = 180)
$SecondsPerMinute = 60
$ExitOk = 0; $ExitPlatform = 2; $ExitArguments = 3; $ExitQueryFailed = 8; $ExitTimedOut = 9
$Columns = 'snapshot', 'takenAt', 'kind', 'pid', 'ppid', 'depth', 'name', 'created', 'cpuSeconds', 'exe', 'cwd', 'cmdline', 'port', 'localAddress', 'note'
$DepthCap = 32
$Unreadable = 'unreadable'
$NodeName = 'node.exe'
$StopPollMilliseconds = 250
$Utf8NoBom = [Text.UTF8Encoding]::new($false)

if (-not $IsWindows -or $PSVersionTable.PSVersion.Major -lt 7) { Write-Host 'gate-snapshot.ps1 needs PowerShell 7 on Windows'; exit $ExitPlatform }

# Ports CSV -> int[]; $null when any item is empty, not a decimal integer in 1–65535, or repeated.
function ConvertFrom-PortCsv([string] $csv) {
  $list = [Collections.Generic.List[int]]::new()
  foreach ($item in $csv -split ',') {
    $text = $item.Trim()
    if ($text -notmatch '^\d{1,5}$' -or [int]$text -lt 1 -or [int]$text -gt 65535 -or $list.Contains([int]$text)) { return $null }
    $list.Add([int]$text)
  }
  return , $list.ToArray()
}

# The reason the arguments are rejected, or $null when they are valid.
function Get-ArgumentError([string] $outPath, [string] $portCsv, [int[]] $portList, [bool] $once, [string] $stopPath, [int] $interval) {
  if (-not $outPath) { return '-OutFile is required' }
  if (Test-Path -LiteralPath $outPath) { return "-OutFile already exists: $outPath" }
  if (-not (Test-Path -LiteralPath (Split-Path -Parent $outPath) -PathType Container)) { return "-OutFile directory does not exist: $outPath" }
  if ($once -eq [bool]$stopPath) { return 'give exactly one of -Once and -StopFile' }
  if (-not $portCsv -or -not $portList) { return "-Ports must be a CSV of distinct ports in 1-65535: [$portCsv]" }
  if ($interval -lt 1) { return '-IntervalSeconds must be at least 1' }
  return $null
}

function Get-Value($value) { if ($null -eq $value -or "$value" -eq '') { $Unreadable } else { "$value" } }

function ConvertTo-ProcessRow($proc, [string] $kind, [int] $depth) {
  $cpu = if ($null -ne $proc.KernelModeTime -and $null -ne $proc.UserModeTime) {
    (($proc.KernelModeTime + $proc.UserModeTime) / 1e7).ToString('F3', [cultureinfo]::InvariantCulture)
  }
  $created = if ($proc.CreationDate -is [datetime]) { $proc.CreationDate.ToString('o') }
  $cmdline = if ($proc.CommandLine) { $proc.CommandLine -replace '\s+', ' ' }
  @{ kind = $kind; pid = $proc.ProcessId; ppid = $proc.ParentProcessId; depth = $depth; name = (Get-Value $proc.Name)
    created = (Get-Value $created); cpuSeconds = (Get-Value $cpu); exe = (Get-Value $proc.ExecutablePath)
    cwd = (Get-Value ([Gate01Cwd]::Get([int]$proc.ProcessId))); cmdline = (Get-Value $cmdline) }
}

# A chain end whose process is not known: only the PID is a fact; every other process field is unreadable.
function New-ChainEndRow([int] $processId, [int] $depth, [string] $note) {
  $row = @{ kind = 'ancestor'; pid = $processId; depth = $depth; note = $note }
  foreach ($field in 'ppid', 'name', 'created', 'cpuSeconds', 'exe', 'cwd', 'cmdline') { $row[$field] = $Unreadable }
  $row
}

# Parents of $child, one row per level, up to and including the first non-node process.
function Get-AncestorRows($child, [hashtable] $byId) {
  for ($depth = 1; ; $depth++) {
    $parent = $byId[[int]$child.ParentProcessId]
    if (-not $parent) { New-ChainEndRow $child.ParentProcessId $depth 'parent-exited'; return }
    if ($parent.CreationDate -gt $child.CreationDate) { New-ChainEndRow $child.ParentProcessId $depth 'pid-reused'; return }
    $row = ConvertTo-ProcessRow $parent 'ancestor' $depth
    if ($parent.Name -ne $NodeName) { $row; return }
    if ($depth -ge $DepthCap) { $row.note = 'depth-cap'; $row; return }
    $row
    $child = $parent
  }
}

function Get-ProcessRows {
  try { $all = @(Get-CimInstance Win32_Process -ErrorAction Stop) }
  catch { return @{ kind = 'error'; note = "process query failed: $($_.Exception.Message)" } }
  $byId = @{}
  foreach ($p in $all) { $byId[[int]$p.ProcessId] = $p }
  $nodes = @($all | Where-Object Name -EQ $NodeName)
  if (-not $nodes) { return @{ kind = 'none'; note = 'no node process' } }
  foreach ($node in $nodes) { ConvertTo-ProcessRow $node 'node' 0; Get-AncestorRows $node $byId }
}

# All Listen endpoints in one query (one query per port costs about 1 s each); a failure is the error message.
function Get-ListenEndpoints {
  try { return @{ Endpoints = @(Get-NetTCPConnection -State Listen -ErrorAction Stop) } }
  catch {
    if ($_.CategoryInfo.Category -eq 'ObjectNotFound') { return @{ Endpoints = @() } }
    return @{ Failure = $_.Exception.Message }
  }
}

# One row per Listen endpoint of each port; pid=none when nothing listens; only kind=error when the query fails.
function Get-PortRows([int[]] $portList, [int[]] $failPorts) {
  $lookup = Get-ListenEndpoints
  foreach ($port in $portList) {
    $failure = if ($failPorts -contains $port) { 'injected port lookup failure (GATE_SNAPSHOT_FAIL_PORTS)' } else { $lookup.Failure }
    if ($failure) { @{ kind = 'error'; port = $port; note = "port query failed: $failure" }; continue }
    $endpoints = @($lookup.Endpoints | Where-Object LocalPort -EQ $port)
    if (-not $endpoints) { @{ kind = 'listen'; pid = 'none'; port = $port; localAddress = '' } }
    foreach ($c in $endpoints) { @{ kind = 'listen'; pid = $c.OwningProcess; port = $port; localAddress = $c.LocalAddress } }
  }
}

function ConvertTo-TsvLine([hashtable] $row) {
  ($Columns | ForEach-Object { "$($row[$_])" -replace '[\t\r\n]+', ' ' }) -join "`t"
}

function New-TsvFile([string] $path) {
  $stream = [IO.File]::Open($path, [IO.FileMode]::CreateNew)
  try { $bytes = $Utf8NoBom.GetBytes(($Columns -join "`t") + "`n"); $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
}

# Takes one snapshot and appends it to the TSV at once; returns its rows.
function Invoke-Snapshot([string] $path, [int] $number, [int[]] $portList, [int[]] $failPorts) {
  $takenAt = (Get-Date).ToString('o')
  $rows = @(Get-ProcessRows) + @(Get-PortRows $portList $failPorts)
  foreach ($row in $rows) { $row.snapshot = $number; $row.takenAt = $takenAt }
  [IO.File]::AppendAllText($path, (($rows | ForEach-Object { ConvertTo-TsvLine $_ }) -join "`n") + "`n", $Utf8NoBom)
  return , $rows
}

# Waits until $due. Returns 'stop' (stop file seen), 'deadline' (-MaxMinutes passed) or 'due'.
function Wait-NextSnapshot([datetime] $due, [datetime] $deadline, [string] $stopPath) {
  while ($true) {
    if (Test-Path -LiteralPath $stopPath) { return 'stop' }
    if ((Get-Date) -ge $deadline) { return 'deadline' }
    if ((Get-Date) -ge $due) { return 'due' }
    Start-Sleep -Milliseconds $StopPollMilliseconds
  }
}

$OutFile = if ($OutFile) { $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutFile) }
$portList = ConvertFrom-PortCsv $Ports
$argumentError = Get-ArgumentError $OutFile $Ports $portList $Once.IsPresent $StopFile $IntervalSeconds
if ($argumentError) { Write-Host "gate-snapshot: $argumentError"; exit $ExitArguments }
if ($StopFile) { $StopFile = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($StopFile) }
$failPorts = if ($env:GATE_SNAPSHOT_FAIL_PORTS) { @(ConvertFrom-PortCsv $env:GATE_SNAPSHOT_FAIL_PORTS) } else { @() }
$minuteSeconds = if ($env:GATE_SNAPSHOT_SECONDS_PER_MINUTE) { [int]$env:GATE_SNAPSHOT_SECONDS_PER_MINUTE } else { $SecondsPerMinute }
. (Join-Path $PSScriptRoot 'procs.ps1') # only [Gate01Cwd]::Get is used

New-TsvFile $OutFile
$start = Get-Date
$deadline = $start.AddSeconds($MaxMinutes * $minuteSeconds)
$snapshots = 0; $rowCount = 0; $errors = 0; $wait = 'due'
while ($wait -eq 'due') {
  $rows = Invoke-Snapshot $OutFile ($snapshots + 1) $portList $failPorts
  $snapshots++; $rowCount += $rows.Count; $errors += @($rows | Where-Object { $_.kind -eq 'error' }).Count
  $wait = if ($Once) { 'once' } else { Wait-NextSnapshot $start.AddSeconds($snapshots * $IntervalSeconds) $deadline $StopFile }
}
$timedOut = $wait -eq 'deadline'
$exit = if ($errors) { $ExitQueryFailed } elseif ($timedOut) { $ExitTimedOut } else { $ExitOk }
Write-Host "gate-snapshot done snapshots=$snapshots rows=$rowCount errors=$errors timedOut=$("$timedOut".ToLower()) exit=$exit"
exit $exit
