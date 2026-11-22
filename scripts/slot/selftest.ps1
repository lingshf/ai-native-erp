# GATE-01 D311/D314 self-test of procs.ps1 candidate and ownership rules with stand-in processes (no real tsc /
# vite / browser). D314 cases K-P: this repository's vite build and non-headless Chrome are candidates and
# counted, other-repository controls are excluded, and an unreadable command line is counted as unknown. Windows
# gives a non-elevated session no way to start a process whose command line it cannot read, so case P is a real
# stand-in whose CommandLine is blanked in the snapshot handed to Counted (logged as such).
# D315 cases Q-T: no Chrome or Edge is installed where a stand-in may be written, so a copy of node.exe named
# chrome.exe / msedge.exe runs from Temp and its ExecutablePath (and, for the orphan, ParentProcessId) is rewritten
# in the snapshot to the Program Files location (logged as such); cwd and command line are the real ones.
# D316 cases U-W are real orphans: launcher.cjs starts a detached cmd.exe running a batch file and exits. U's child is
# a node.exe copy named "fake app.exe" under the user's real AppData\Local\Programs (no rewrite); V's child is node;
# W's batch is a builtin loop, so its cmd.exe has no child at all.
#   pwsh -File artifacts/ci/gate01/slot-selftest.ps1 -OutDir DIR
# Stand-ins are started through WMI (Win32_Process.Create), so they are outside this script's process tree,
# exactly like another session's processes. Each is a node.exe (or a copy of node.exe named
# chrome-headless-shell.exe) sleeping in a stub script; only the stand-ins' own process trees are stopped.
param([Parameter(Mandatory)] [string] $OutDir)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot 'procs.ps1')
New-Item -ItemType Directory -Force $OutDir | Out-Null
$log = Join-Path $OutDir "selftest.log"
function Say([string] $text) { $line = "$((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')) $text"; Write-Host $line; Add-Content $log $line }
$script:ever = @{ [int]$PID = $true }

$tmp = Join-Path $env:TEMP "gate01-selftest-$([guid]::NewGuid().ToString('N').Substring(0, 8))"
$foreign = Join-Path $tmp 'other-repo'; $nogit = Join-Path $tmp 'nogit'; $bin = Join-Path $tmp 'bin'
$erpRoot = (git -C $PSScriptRoot rev-parse --show-toplevel) -replace '/', '\'
$erpDir = Join-Path $PSScriptRoot 'selftest'
foreach ($d in $foreign, $nogit, $bin, $erpDir) { New-Item -ItemType Directory -Force $d | Out-Null }
git -C $foreign init -q
$sleep = 'setTimeout(() => {}, 120000);'
$spawner = "const { spawn } = require('child_process'); spawn(process.argv[2], [process.argv[3], '--headless'], { cwd: process.argv[4], stdio: 'ignore' }); $sleep"
foreach ($d in $foreign, $nogit, $erpDir) {
  New-Item -ItemType Directory -Force (Join-Path $d 'node_modules\typescript\bin') | Out-Null
  Set-Content (Join-Path $d 'node_modules\typescript\bin\tsc') $sleep
  Set-Content (Join-Path $d 'spawner.cjs') $spawner
  New-Item -ItemType Directory -Force (Join-Path $d 'node_modules\vite\bin') | Out-Null
  Set-Content (Join-Path $d 'node_modules\vite\bin\vite.js') $sleep
}
Set-Content (Join-Path $nogit 'sleep.js') $sleep
$apps = Join-Path $env:LOCALAPPDATA "Programs\gate01-selftest-$(Split-Path $tmp -Leaf)"; New-Item -ItemType Directory -Force $apps | Out-Null
$fakeApp = Join-Path $apps 'fake app.exe'; Copy-Item (Get-Command node).Source $fakeApp
Set-Content (Join-Path $nogit 'launcher.cjs') "require('child_process').spawn('cmd.exe', ['/d', '/c', process.argv[2]], { cwd: process.argv[3], detached: true, stdio: 'ignore' }).unref(); setTimeout(() => process.exit(0), 500);"
Set-Content (Join-Path $nogit 'orphan-U.cmd') "@`"$fakeApp`" `"$nogit\sleep.js`""
Set-Content (Join-Path $nogit 'orphan-V.cmd') "@node `"$nogit\sleep.js`""
Set-Content (Join-Path $nogit 'orphan-W.cmd') "@for /l %%i in (0,0,1) do @rem"
Set-Content (Join-Path $nogit 'edge-stub.cjs') "require('child_process').spawn('cmd.exe', ['/d', '/s', '/c', 'ping -n 120 127.0.0.1 >nul'], { stdio: 'ignore' }); $sleep"
Set-Content (Join-Path $erpDir 'spawner-plain.cjs') "require('child_process').spawn(process.argv[2], [process.argv[3]], { cwd: process.argv[4], stdio: 'ignore' }); $sleep"
$node = (Get-Command node).Source
$chrome = Join-Path $bin 'chrome-headless-shell.exe'; Copy-Item $node $chrome
$chromeUi = Join-Path $bin 'chrome.exe'; Copy-Item $node $chromeUi
$edge = Join-Path $bin 'msedge.exe'; Copy-Item $node $edge
$pfChrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$pfEdge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
foreach ($d in $foreign, $nogit, $erpDir) { Say "repo of $d = $(Get-PathOwner $d)" }

$cases = @(
  @{ Id = 'A-other-repo-node-tsc'; Want = 'excluded'; Cwd = $foreign; Cmd = "`"$node`" `"$foreign\node_modules\typescript\bin\tsc`" -p tsconfig.json --noEmit" }
  @{ Id = 'B-other-repo-cmd-tsc (cwd only; like debate-coach)'; Want = 'excluded'; Cwd = $foreign; Cmd = "cmd.exe /d /s /c node node_modules\typescript\bin\tsc -p tsconfig.json --noEmit"; Child = 'excluded' }
  @{ Id = 'C-cmd-with-other-repo-path-only-in-/c'; Want = 'counted'; Cwd = $nogit; Cmd = "cmd.exe /d /s /c node `"$foreign\node_modules\typescript\bin\tsc`" -p tsconfig.json"; Child = 'excluded' }
  @{ Id = 'D-chrome-whose-parent-is-other-repo'; Want = 'n/a'; Cwd = $nogit; Cmd = "`"$node`" `"$foreign\spawner.cjs`" `"$chrome`" `"$nogit\sleep.js`" `"$nogit`""; Child = 'excluded' }
  @{ Id = 'E-this-repo-node-tsc'; Want = 'counted'; Cwd = $erpRoot; Cmd = "`"$node`" `"$erpDir\node_modules\typescript\bin\tsc`" -p tsconfig.json --noEmit" }
  @{ Id = 'F-this-repo-cmd-tsc (cwd only)'; Want = 'counted'; Cwd = $erpRoot; Cmd = "cmd.exe /d /s /c node `"$nogit\node_modules\typescript\bin\tsc`" -p tsconfig.json"; Child = 'counted' }
  @{ Id = 'G-chrome-whose-parent-is-this-repo'; Want = 'n/a'; Cwd = $nogit; Cmd = "`"$node`" `"$erpDir\spawner.cjs`" `"$chrome`" `"$nogit\sleep.js`" `"$nogit`""; Child = 'counted' }
  @{ Id = 'H-this-repo-chrome (cwd only)'; Want = 'counted'; Cwd = $erpRoot; Cmd = "`"$chrome`" `"$nogit\sleep.js`" --headless" }
  @{ Id = 'I-unknown-node-tsc'; Want = 'counted'; Cwd = $nogit; Cmd = "`"$node`" `"$nogit\node_modules\typescript\bin\tsc`" -p tsconfig.json" }
  @{ Id = 'J-unknown-chrome'; Want = 'counted'; Cwd = $nogit; Cmd = "`"$chrome`" `"$nogit\sleep.js`" --headless" }
  @{ Id = 'K-this-repo-vite-build (relative path, cwd only)'; Want = 'counted'; Cwd = $erpDir; Cmd = "`"$node`" node_modules\vite\bin\vite.js build" }
  @{ Id = 'L-this-repo-chrome-not-headless (cwd only)'; Want = 'counted'; Cwd = $erpDir; Cmd = "`"$chromeUi`" `"$nogit\sleep.js`" --user-data-dir=profile" }
  @{ Id = 'M-unknown-chrome-not-headless'; Want = 'counted'; Cwd = $nogit; Cmd = "`"$chromeUi`" `"$nogit\sleep.js`" --user-data-dir=profile" }
  @{ Id = 'N-other-repo-chrome-not-headless (control)'; Want = 'excluded'; Cwd = $foreign; Cmd = "`"$chromeUi`" `"$nogit\sleep.js`" --user-data-dir=profile" }
  @{ Id = 'O-other-repo-vite-build (control)'; Want = 'excluded'; Cwd = $foreign; Cmd = "`"$node`" node_modules\vite\bin\vite.js build" }
  @{ Id = 'P-other-repo-node-command-line-unreadable'; Want = 'counted'; Cwd = $foreign; Cmd = "`"$node`" node_modules\vite\bin\vite.js build"; Blank = $true }
  @{ Id = 'Q-orphan-program-files-chrome-remote-debugging-pipe'; Want = 'counted'; Cwd = $nogit; Cmd = "`"$chromeUi`" `"$nogit\sleep.js`" --remote-debugging-pipe --no-first-run"; SnapSelf = @{ ExecutablePath = $pfChrome; ParentProcessId = 2147483000 } }
  @{ Id = 'R-program-files-msedge-plain (+ its cmd.exe helper)'; Want = 'excluded'; Cwd = $nogit; Cmd = "`"$edge`" `"$nogit\edge-stub.cjs`" --no-startup-window"; SnapSelf = @{ ExecutablePath = $pfEdge }; Child = 'excluded' }
  @{ Id = 'S-program-files-msedge-user-data-dir-in-Temp'; Want = 'counted'; Cwd = $nogit; Cmd = "`"$edge`" `"$nogit\sleep.js`" --user-data-dir=$tmp\profile"; SnapSelf = @{ ExecutablePath = $pfEdge } }
  @{ Id = 'T-program-files-chrome-started-by-this-repo'; Want = 'n/a'; Cwd = $nogit; Cmd = "`"$node`" `"$erpDir\spawner-plain.cjs`" `"$chromeUi`" `"$nogit\sleep.js`" `"$nogit`""; Child = 'counted'; SnapChild = @{ ExecutablePath = $pfChrome } }
  @{ Id = 'U-orphan-cmd-ollama-like (child under AppData\Local\Programs)'; Want = 'excluded'; Cwd = $nogit; Cmd = "`"$node`" `"$nogit\launcher.cjs`" `"$nogit\orphan-U.cmd`" `"$nogit`""; Orphan = 'orphan-U.cmd' }
  @{ Id = 'V-orphan-cmd-whose-child-is-node'; Want = 'counted'; Cwd = $nogit; Cmd = "`"$node`" `"$nogit\launcher.cjs`" `"$nogit\orphan-V.cmd`" `"$nogit`""; Orphan = 'orphan-V.cmd' }
  @{ Id = 'W-orphan-cmd-without-children'; Want = 'counted'; Cwd = $nogit; Cmd = "`"$node`" `"$nogit\launcher.cjs`" `"$nogit\orphan-W.cmd`" `"$nogit`""; Orphan = 'orphan-W.cmd' }
)
$started = @()
$fail = 0
try {
  foreach ($c in $cases) {
    $r = Invoke-CimMethod Win32_Process -MethodName Create -Arguments @{ CommandLine = $c.Cmd; CurrentDirectory = $c.Cwd }
    if ($r.ReturnValue -ne 0) { throw "Create failed $($r.ReturnValue) for $($c.Id)" }
    $c.Pid = [int]$r.ProcessId; $started += $c.Pid
    Say "start $($c.Id) pid=$($c.Pid) cwd=$($c.Cwd) cmd=[$($c.Cmd)]"
  }
  Start-Sleep -Seconds 4
  # An orphan case is judged on the detached cmd.exe its launcher left behind, not on the (exited) launcher.
  foreach ($c in $cases | Where-Object Orphan) {
    $o = @(Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" | Where-Object { "$($_.CommandLine)" -like "*$($c.Orphan)*" })
    if ($o.Count -ne 1) { throw "orphan $($c.Id): found $($o.Count) cmd.exe" }
    $c.Pid = [int]$o[0].ProcessId; $started += $c.Pid
    $alive = [bool](Get-Process -Id ([int]$o[0].ParentProcessId) -ErrorAction SilentlyContinue)
    Say "orphan $($c.Id) cmd pid=$($c.Pid) parent pid=$($o[0].ParentProcessId) alive=$alive cmdline=[$($o[0].CommandLine)]"
  }
  $snap = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name, CommandLine, ExecutablePath, CreationDate)
  foreach ($c in $cases | Where-Object Blank) {
    foreach ($s in $snap | Where-Object { [int]$_.ProcessId -eq $c.Pid }) { $s.CommandLine = $null; Say "snapshot: CommandLine of $($c.Id) pid=$($c.Pid) blanked (unreadable stand-in)" }
  }
  foreach ($c in $cases) {
    foreach ($pair in @(@('self', $c.SnapSelf), @('child', $c.SnapChild))) {
      if (-not $pair[1]) { continue }
      $targets = if ($pair[0] -eq 'self') { @($c.Pid) } else { @($snap | Where-Object { [int]$_.ParentProcessId -eq $c.Pid -and $_.Name -ne 'conhost.exe' } | ForEach-Object { [int]$_.ProcessId }) }
      foreach ($s in $snap | Where-Object { $targets -contains [int]$_.ProcessId }) {
        foreach ($k in $pair[1].Keys) { $s.$k = $pair[1][$k] }
        Say "snapshot: $($c.Id) $($pair[0]) pid=$($s.ProcessId) rewritten $(($pair[1].GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join ' ')"
      }
    }
  }
  $hits = Counted -All $snap
  $state = @{}
  foreach ($h in $hits) { $state[[int]$h.ProcessId] = @('counted', $h.Owner) }
  foreach ($x in $script:lastExcluded) { $state[[int]$x.ProcessId] = @('excluded', $x.Owner) }
  $procs = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name
  foreach ($c in $cases) {
    $checks = @(@{ Pid = $c.Pid; Want = $c.Want; What = 'self' })
    # A WMI-started console process also gets a conhost.exe child; that is not a stand-in.
    $kids = @($procs | Where-Object { [int]$_.ParentProcessId -eq $c.Pid -and $_.Name -ne 'conhost.exe' } | ForEach-Object { [int]$_.ProcessId })
    if ($c.Child) {
      if ($kids.Count -ne 1) { $fail++; Say "FAIL $($c.Id): expected 1 child, found $($kids.Count)" }
      foreach ($k in $kids) { $checks += @{ Pid = $k; Want = $c.Child; What = 'child' } }
    }
    foreach ($k in $checks) {
      if ($k.Want -eq 'n/a') { continue }
      $got = if ($state.ContainsKey($k.Pid)) { $state[$k.Pid] } else { @('not-a-candidate', '') }
      $ok = $got[0] -eq $k.Want
      if (-not $ok) { $fail++ }
      Say "$(if ($ok) { 'PASS' } else { 'FAIL' }) $($c.Id) $($k.What) pid=$($k.Pid) want=$($k.Want) got=$($got[0]) [$($got[1])]"
    }
  }
  # Real processes elsewhere on the machine at this moment, for the record (not asserted).
  $ours = @{}; foreach ($p in $started) { $ours[$p] = $true }
  do { $grew = $false; foreach ($p in $procs) { if ($ours.ContainsKey([int]$p.ParentProcessId) -and -not $ours.ContainsKey([int]$p.ProcessId)) { $ours[[int]$p.ProcessId] = $true; $grew = $true } } } while ($grew)
  foreach ($h in $hits) { if (-not $ours.ContainsKey([int]$h.ProcessId)) { Say "other counted pid=$($h.ProcessId) $($h.Name) [$($h.Owner)]" } }
  foreach ($x in $script:lastExcluded) { if (-not $ours.ContainsKey([int]$x.ProcessId)) { Say "other excluded pid=$($x.ProcessId) $($x.Name) [$($x.Owner)] cmdline=[$($x.CommandLine -replace '\s+', ' ')]" } }
}
finally {
  $procs = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId
  $ours = @{}; foreach ($p in $started) { $ours[$p] = $true }
  do { $grew = $false; foreach ($p in $procs) { if ($ours.ContainsKey([int]$p.ParentProcessId) -and -not $ours.ContainsKey([int]$p.ProcessId)) { $ours[[int]$p.ProcessId] = $true; $grew = $true } } } while ($grew)
  foreach ($id in $ours.Keys) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 1
  Remove-Item -Recurse -Force $tmp, $erpDir, $apps -ErrorAction SilentlyContinue
}
Say "selftest $(if ($fail) { "FAILED ($fail)" } else { 'passed' })"
exit [int]($fail -ne 0)
