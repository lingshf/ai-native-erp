# Self-test of procs.ps1 (rule version R3, roadmap §5 "进程采样规则"). Windows only; run by hand, not in CI.
#   pwsh -File scripts/slot/selftest.ps1 [-OutDir DIR_OUTSIDE_REPO] [-ReferenceProcs KIT_PROCS_PS1]
# Part 1, the D316 kit's 27 checks (cases A-W), each now also asserting the rule id. The cases list keeps the kit's
# reference result; where that is "counted, SR-C3" (unknown ownership), R3 (D472) expects "excluded, SR-X6" and the
# check is marked "R3 差异" (SLOT-03 S4):
# D311/D314 candidate and ownership rules with stand-in processes (no real tsc / vite / browser). Cases K-P: this
# repository's vite build and non-headless Chrome are candidates and counted, other-repository controls are
# excluded, and an unreadable command line is of unknown ownership. Windows gives a non-elevated session no way to
# start a process whose command line it cannot read, so case P is a real stand-in whose CommandLine is blanked in
# the snapshot handed to Counted (logged as such).
# D315 cases Q-T: no Chrome or Edge is installed where a stand-in may be written, so a copy of node.exe named
# chrome.exe / msedge.exe runs from Temp and its ExecutablePath (and, for the orphan, ParentProcessId) is rewritten
# in the snapshot to the Program Files location (logged as such); cwd and command line are the real ones.
# D316 cases U-W are real orphans: launcher.cjs starts a detached cmd.exe running a batch file and exits. U's child is
# a node.exe copy named "fake app.exe" under the user's real AppData\Local\Programs (no rewrite); V's child is node;
# W's batch is a builtin loop, so its cmd.exe has no child at all.
# Stand-ins are started through WMI (Win32_Process.Create), so they are outside this script's process tree,
# exactly like another session's processes. Each is a node.exe (or a copy of node.exe named
# chrome-headless-shell.exe) sleeping in a stub script; only the stand-ins' own process trees are stopped.
# Part 2, at least one positive (rule hits) and one negative (rule does not hit) case per SR rule. Most are
# synthetic snapshots (made-up PIDs that no live process has, so no cwd is readable; evidence comes from real
# directories: this repository, a temporary git repository, a temporary non-repository directory); the SR-X5 cases
# reuse the real orphan of case U, the PID-reuse one with its child's creation time moved before the cmd.exe.
# SLOT-03 S2 / S3 (R3): SR-X6 on real stand-ins (P unreadable, I from a non-repository directory) with every logged
# field; counted controls in this worktree (K) and in another git worktree of this repository (same common dir, D442;
# a --no-checkout worktree under Temp with its own node stand-in), and the other-repository control A stays SR-X1.
# Part 3 (only with -ReferenceProcs, a copy of the D316 kit's procs.ps1 placed inside a worktree of this repository,
# e.g. artifacts/ci/gate01-ref/procs.ps1, which is git-ignored): every snapshot of parts 1 and 2 is also handed to
# the kit's Counted; the counted and excluded PID sets must be identical, except that the PIDs R3 excludes as SR-X6
# are exactly ones the kit counted.
# Part 4 (D354), slot-run.ps1 entry checks: a relative -OutDir is resolved once against the caller's directory (its
# log does not follow the runner into the repository root), a relative -OutDir inside the repository is refused, and
# a -StepsFile that yields no step ends the run with exit 4 before the build. The -Ports port gate (exit 4 / 7) is
# tested in selftest-ports.ps1.
# Part 5 (S12 SLOT-02, D407 / D408), in selftest-preflight.ps1: step PSModulePath (I1), TDZ fixtures (I4), and
# preflight.mjs / slot-run.ps1 exit-code pass-through before the build (I5); runner runs there are -Stub only.
param([string] $OutDir = "", [string] $ReferenceProcs = "")
if ($PSVersionTable.PSEdition -eq 'Core' -and -not $IsWindows) { Write-Host "selftest.ps1 只能在 Windows 运行 (Windows only)"; exit 2 }
# procs.ps1 (as in the D316 kit) uses [IO.Path]::GetFullPath(path, base), which only .NET Core has: under Windows PowerShell 5.1
# every git worktree (a .git file) would silently read as "no repository". The kit always ran under PowerShell 7.
if ($PSVersionTable.PSVersion.Major -lt 7) { Write-Host "selftest.ps1 needs PowerShell 7 (pwsh); Windows PowerShell $($PSVersionTable.PSVersion) cannot read git worktrees with procs.ps1"; exit 2 }
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot 'procs.ps1')
$erpRoot = (git -C $PSScriptRoot rev-parse --show-toplevel) -replace '/', '\'
if (-not $OutDir) { $OutDir = Join-Path $env:TEMP "slot-selftest-out-$((Get-Date).ToString('yyyyMMdd-HHmmss'))" }
$OutDir = [IO.Path]::GetFullPath($ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OutDir))
if (($OutDir.TrimEnd('\') + '\').StartsWith($erpRoot.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { Write-Host "-OutDir must be outside the repository ($erpRoot)"; exit 4 }
New-Item -ItemType Directory -Force $OutDir | Out-Null
$log = Join-Path $OutDir "selftest.log"
function Say([string] $text) { $line = "$((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')) $text"; Write-Host $line; Add-Content $log $line }
$script:ever = @{ [int]$PID = $true }
Say "selftest rules=$($script:SlotRuleVersion) head=$(git -C $PSScriptRoot rev-parse HEAD) log=$log"

$ref = $null
if ($ReferenceProcs) {
  $lf = [IO.File]::ReadAllText($ReferenceProcs) -replace "`r`n", "`n"
  $sha = -join ([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($lf)) | ForEach-Object { $_.ToString('X2') })
  Say "reference $ReferenceProcs LF sha256=$sha"
  if ($sha -ne '906A4B70DDF8F16C265240338667D4EBA94532988FE693B593435EF74490A6F8') { Say "FAIL reference is not the D316 kit procs.ps1"; exit 1 }
  # The kit runs in its own module scope, so its functions and $script: state do not touch this script's.
  $ref = New-Module -Name slot-d316-reference -ArgumentList $ReferenceProcs -ScriptBlock {
    param($path)
    . $path
    function Invoke-ReferenceCounted([object[]] $snap, [hashtable] $ever) {
      $script:ever = $ever
      $h = Counted -All $snap
      @{ Counted = @($h | ForEach-Object { [int]$_.ProcessId }); Excluded = @($script:lastExcluded | ForEach-Object { [int]$_.ProcessId }) }
    }
    Export-ModuleMember -Function Invoke-ReferenceCounted
  }
}
$script:items = 0; $script:fail = 0; $script:equiv = 0
function Check([string] $label, [bool] $ok, [string] $detail) {
  $script:items++; if (-not $ok) { $script:fail++ }; if ($label -like 'EQUIV *') { $script:equiv++ }
  Say "$(if ($ok) { 'PASS' } else { 'FAIL' }) $label $detail"
}
function Copy-Snap([object[]] $snap) { @($snap | Select-Object ProcessId, ParentProcessId, Name, CommandLine, ExecutablePath, CreationDate) }
# Runs the new Counted on $snap (and the kit's, with -ReferenceProcs, on a copy); returns pid -> @(state, rule, owner).
# $ever/$refEver are this scenario's runner trees (SR-R1); both are extended in place, as across real samples.
function Judge([string] $label, [object[]] $snap, [hashtable] $ever, [hashtable] $refEver) {
  $refSnap = Copy-Snap $snap
  $saved = $script:ever, $script:foreignSeen; $script:ever = $ever; $script:foreignSeen = @{}  # D411 memory: fresh per call, as the kit has none
  try { $hits = Counted -All $snap } finally { $script:ever, $script:foreignSeen = $saved }
  $state = @{}
  foreach ($h in $hits) { $state[[int]$h.ProcessId] = @('counted', $h.Rule, $h.Owner) }
  foreach ($x in $script:lastExcluded) { $state[[int]$x.ProcessId] = @('excluded', $x.Rule, $x.Owner) }
  $state['runner-tree'] = $script:lastRunnerTree
  if ($ref) {
    $r = & $ref { param($s, $e) Invoke-ReferenceCounted $s $e } $refSnap $refEver
    $nc = @($hits | ForEach-Object { [int]$_.ProcessId } | Sort-Object); $rc = @($r.Counted | Sort-Object)
    $x6 = @($script:lastExcluded | Where-Object Rule -eq 'SR-X6' | ForEach-Object { [int]$_.ProcessId } | Sort-Object)
    $nx = @($script:lastExcluded | Where-Object Rule -ne 'SR-X6' | ForEach-Object { [int]$_.ProcessId } | Sort-Object); $rx = @($r.Excluded | Sort-Object)
    # R3 (D472): the kit counted every PID R3 excludes as SR-X6; all other verdicts are the kit's.
    $kitCounted = @($nc + $x6 | Sort-Object)
    $same = (($kitCounted -join ',') -eq ($rc -join ',')) -and (($nx -join ',') -eq ($rx -join ','))
    Check "EQUIV $label" $same "counted=$($nc.Count) excluded=$($nx.Count) r3-sr-x6=$($x6.Count)$(if (-not $same) { " new counted+SR-X6=[$($kitCounted -join ',')] kit counted=[$($rc -join ',')] new excluded=[$($nx -join ',')] kit excluded=[$($rx -join ',')]" })"
  }
  return $state
}
function Got($state, [int] $id) { if ($state.ContainsKey($id)) { $state[$id] } else { @('not-a-candidate', '', '') } }
# SLOT-03 S4: a kit reference of "counted, SR-C3" is "excluded, SR-X6" under R3; returns @(want, rule, mark).
$script:r3Diffs = [System.Collections.Generic.List[string]]::new()
function Get-R3Expectation([string] $want, [string] $rule) {
  if ($want -eq 'counted' -and $rule -eq 'SR-C3') { return @('excluded', 'SR-X6', ' R3 差异 (kit: counted SR-C3)') }
  return @($want, $rule, '')
}
# The fields Get-UnknownDetail logs for every SR-X6 process (SLOT-03 decision 4).
$script:x6Fields = 'name=\S+ pid=\d+ ppid=\d+ created=\S+ exe=.+ cwd=.+ cmdline=\['

$tmp = Join-Path $env:TEMP "slot-selftest-$([guid]::NewGuid().ToString('N').Substring(0, 8))"
$foreign = Join-Path $tmp 'other-repo'; $nogit = Join-Path $tmp 'nogit'; $bin = Join-Path $tmp 'bin'
$erpDir = Join-Path $PSScriptRoot 'selftest'
$apps = Join-Path $env:LOCALAPPDATA "Programs\slot-selftest-$(Split-Path $tmp -Leaf)"
$started = @()
try {
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
New-Item -ItemType Directory -Force $apps | Out-Null
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
# SLOT-03 S3 (b): a node stand-in whose cwd is another git worktree of this repository (same common dir, D442).
$otherWt = Join-Path $tmp 'erp-other-worktree'
git -C $erpRoot worktree add --quiet --detach --no-checkout $otherWt HEAD 2>&1 | Out-Null
$r = Invoke-CimMethod Win32_Process -MethodName Create -Arguments @{ CommandLine = "`"$node`" `"$nogit\sleep.js`""; CurrentDirectory = $otherWt }
if ($r.ReturnValue -ne 0) { throw "Create failed $($r.ReturnValue) for the other-worktree stand-in" }
$otherWtPid = [int]$r.ProcessId; $started += $otherWtPid
Say "start S3b-other-worktree pid=$otherWtPid cwd=$otherWt repo=$(Get-PathOwner $otherWt)"

# ---- Part 1: the D316 kit's cases A-W (27 checks); Rule / ChildRule are the R1 ids each result comes from.
$cases = @(
  @{ Id = 'A-other-repo-node-tsc'; Want = 'excluded'; Rule = 'SR-X1'; Cwd = $foreign; Cmd = "`"$node`" `"$foreign\node_modules\typescript\bin\tsc`" -p tsconfig.json --noEmit" }
  @{ Id = 'B-other-repo-cmd-tsc (cwd only; like debate-coach)'; Want = 'excluded'; Rule = 'SR-X1'; Cwd = $foreign; Cmd = "cmd.exe /d /s /c node node_modules\typescript\bin\tsc -p tsconfig.json --noEmit"; Child = 'excluded'; ChildRule = 'SR-X1' }
  @{ Id = 'C-cmd-with-other-repo-path-only-in-/c'; Want = 'counted'; Rule = 'SR-C3'; Cwd = $nogit; Cmd = "cmd.exe /d /s /c node `"$foreign\node_modules\typescript\bin\tsc`" -p tsconfig.json"; Child = 'excluded'; ChildRule = 'SR-X1' }
  @{ Id = 'D-chrome-whose-parent-is-other-repo'; Want = 'n/a'; Cwd = $nogit; Cmd = "`"$node`" `"$foreign\spawner.cjs`" `"$chrome`" `"$nogit\sleep.js`" `"$nogit`""; Child = 'excluded'; ChildRule = 'SR-X1' }
  @{ Id = 'E-this-repo-node-tsc'; Want = 'counted'; Rule = 'SR-C2'; Cwd = $erpRoot; Cmd = "`"$node`" `"$erpDir\node_modules\typescript\bin\tsc`" -p tsconfig.json --noEmit" }
  @{ Id = 'F-this-repo-cmd-tsc (cwd only)'; Want = 'counted'; Rule = 'SR-C2'; Cwd = $erpRoot; Cmd = "cmd.exe /d /s /c node `"$nogit\node_modules\typescript\bin\tsc`" -p tsconfig.json"; Child = 'counted'; ChildRule = 'SR-C2' }
  @{ Id = 'G-chrome-whose-parent-is-this-repo'; Want = 'n/a'; Cwd = $nogit; Cmd = "`"$node`" `"$erpDir\spawner.cjs`" `"$chrome`" `"$nogit\sleep.js`" `"$nogit`""; Child = 'counted'; ChildRule = 'SR-C2' }
  @{ Id = 'H-this-repo-chrome (cwd only)'; Want = 'counted'; Rule = 'SR-C2'; Cwd = $erpRoot; Cmd = "`"$chrome`" `"$nogit\sleep.js`" --headless" }
  @{ Id = 'I-unknown-node-tsc'; Want = 'counted'; Rule = 'SR-C3'; Cwd = $nogit; Cmd = "`"$node`" `"$nogit\node_modules\typescript\bin\tsc`" -p tsconfig.json" }
  @{ Id = 'J-unknown-chrome'; Want = 'counted'; Rule = 'SR-C3'; Cwd = $nogit; Cmd = "`"$chrome`" `"$nogit\sleep.js`" --headless" }
  @{ Id = 'K-this-repo-vite-build (relative path, cwd only)'; Want = 'counted'; Rule = 'SR-C2'; Cwd = $erpDir; Cmd = "`"$node`" node_modules\vite\bin\vite.js build" }
  @{ Id = 'L-this-repo-chrome-not-headless (cwd only)'; Want = 'counted'; Rule = 'SR-C2'; Cwd = $erpDir; Cmd = "`"$chromeUi`" `"$nogit\sleep.js`" --user-data-dir=profile" }
  @{ Id = 'M-unknown-chrome-not-headless'; Want = 'counted'; Rule = 'SR-C3'; Cwd = $nogit; Cmd = "`"$chromeUi`" `"$nogit\sleep.js`" --user-data-dir=profile" }
  @{ Id = 'N-other-repo-chrome-not-headless (control)'; Want = 'excluded'; Rule = 'SR-X1'; Cwd = $foreign; Cmd = "`"$chromeUi`" `"$nogit\sleep.js`" --user-data-dir=profile" }
  @{ Id = 'O-other-repo-vite-build (control)'; Want = 'excluded'; Rule = 'SR-X1'; Cwd = $foreign; Cmd = "`"$node`" node_modules\vite\bin\vite.js build" }
  @{ Id = 'P-other-repo-node-command-line-unreadable'; Want = 'counted'; Rule = 'SR-C3'; Cwd = $foreign; Cmd = "`"$node`" node_modules\vite\bin\vite.js build"; Blank = $true }
  @{ Id = 'Q-orphan-program-files-chrome-remote-debugging-pipe'; Want = 'counted'; Rule = 'SR-C3'; Cwd = $nogit; Cmd = "`"$chromeUi`" `"$nogit\sleep.js`" --remote-debugging-pipe --no-first-run"; SnapSelf = @{ ExecutablePath = $pfChrome; ParentProcessId = 2147483000 } }
  @{ Id = 'R-program-files-msedge-plain (+ its cmd.exe helper)'; Want = 'excluded'; Rule = 'SR-X2'; Cwd = $nogit; Cmd = "`"$edge`" `"$nogit\edge-stub.cjs`" --no-startup-window"; SnapSelf = @{ ExecutablePath = $pfEdge }; Child = 'excluded'; ChildRule = 'SR-X3' }
  @{ Id = 'S-program-files-msedge-user-data-dir-in-Temp'; Want = 'counted'; Rule = 'SR-C3'; Cwd = $nogit; Cmd = "`"$edge`" `"$nogit\sleep.js`" --user-data-dir=$tmp\profile"; SnapSelf = @{ ExecutablePath = $pfEdge } }
  @{ Id = 'T-program-files-chrome-started-by-this-repo'; Want = 'n/a'; Cwd = $nogit; Cmd = "`"$node`" `"$erpDir\spawner-plain.cjs`" `"$chromeUi`" `"$nogit\sleep.js`" `"$nogit`""; Child = 'counted'; ChildRule = 'SR-C2'; SnapChild = @{ ExecutablePath = $pfChrome } }
  @{ Id = 'U-orphan-cmd-ollama-like (child under AppData\Local\Programs)'; Want = 'excluded'; Rule = 'SR-X5'; Cwd = $nogit; Cmd = "`"$node`" `"$nogit\launcher.cjs`" `"$nogit\orphan-U.cmd`" `"$nogit`""; Orphan = 'orphan-U.cmd' }
  @{ Id = 'V-orphan-cmd-whose-child-is-node'; Want = 'counted'; Rule = 'SR-C3'; Cwd = $nogit; Cmd = "`"$node`" `"$nogit\launcher.cjs`" `"$nogit\orphan-V.cmd`" `"$nogit`""; Orphan = 'orphan-V.cmd' }
  @{ Id = 'W-orphan-cmd-without-children'; Want = 'counted'; Rule = 'SR-C3'; Cwd = $nogit; Cmd = "`"$node`" `"$nogit\launcher.cjs`" `"$nogit\orphan-W.cmd`" `"$nogit`""; Orphan = 'orphan-W.cmd' }
)
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
$liveSnap = Copy-Snap $snap
$state = Judge 'live snapshot (cases A-W)' $snap $script:ever @{ [int]$PID = $true }
$procs = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name
foreach ($c in $cases) {
  $checks = @(@{ Pid = $c.Pid; Want = $c.Want; Rule = $c.Rule; What = 'self' })
  # A WMI-started console process also gets a conhost.exe child; that is not a stand-in.
  $kids = @($procs | Where-Object { [int]$_.ParentProcessId -eq $c.Pid -and $_.Name -ne 'conhost.exe' } | ForEach-Object { [int]$_.ProcessId })
  if ($c.Child) {
    if ($kids.Count -ne 1) { Check $c.Id $false "expected 1 child, found $($kids.Count)" }
    foreach ($k in $kids) { $checks += @{ Pid = $k; Want = $c.Child; Rule = $c.ChildRule; What = 'child' } }
  }
  foreach ($k in $checks) {
    if ($k.Want -eq 'n/a') { continue }
    $got = Got $state $k.Pid
    $want, $rule, $mark = Get-R3Expectation $k.Want $k.Rule
    if ($mark) { $script:r3Diffs.Add("$($c.Id.Substring(0, 1)) $($k.What)") }
    Check "$($c.Id) $($k.What)$mark" ($got[0] -eq $want -and $got[1] -eq $rule) "pid=$($k.Pid) want=$want $rule got=$($got[0]) $($got[1]) [$($got[2])]"
  }
}
$part1 = $script:items - $script:equiv

# ---- Part 2: per-rule positive / negative cases.
$base = 2147400000; $t0 = (Get-Date).AddMinutes(-30)
function P([int] $n, [int] $ppid, [string] $name, [string] $cl, [string] $exe, [int] $age) {
  [pscustomobject]@{ ProcessId = $base + $n; ParentProcessId = $ppid; Name = $name; CommandLine = $cl; ExecutablePath = $exe; CreationDate = $t0.AddSeconds($age) }
}
$nodeExe = 'C:\Program Files\nodejs\node.exe'; $cmdExe = 'C:\Windows\System32\cmd.exe'
function Case([string] $rule, [string] $sign, [string] $what, [object[]] $snap, [int] $n, [string] $want, [string] $wantRule, [string] $reasonLike = '*') {
  $st = Judge "$rule$sign $what" $snap @{} @{}
  $got = Got $st ($base + $n)
  Check "$rule$sign $what" ($got[0] -eq $want -and $got[1] -eq $wantRule -and $got[2] -like $reasonLike) "want=$want $wantRule got=$($got[0]) $($got[1]) [$($got[2])]"
}

# SLOT-03 S2 / S3 on the live snapshot of part 1: SR-X6 positives with every logged field, and counted / foreign controls.
function CheckLive([string] $label, [int] $id, [string] $want, [string] $wantRule, [string] $reasonMatch = '') {
  $got = Got $state $id
  Check $label ($got[0] -eq $want -and $got[1] -eq $wantRule -and $got[2] -match $reasonMatch) "pid=$id want=$want $wantRule got=$($got[0]) $($got[1]) [$($got[2])]"
}
$byCase = @{}; foreach ($k in $cases) { $byCase[$k.Id.Substring(0, 1)] = $k.Pid }
CheckLive 'S2-i SR-X6+ unreadable command line, no D411 record (real stand-in P): excluded, all fields' $byCase['P'] 'excluded' 'SR-X6' "command line unreadable, no D411 record; $($script:x6Fields)unreadable\]"
CheckLive 'S2-ii SR-X6+ node from a non-repository Temp directory, no evidence in the chain (real stand-in I): excluded, all fields' $byCase['I'] 'excluded' 'SR-X6' "ancestors-walked=\d+ $($script:x6Fields)"
CheckLive 'S3-a SR-C2 cwd in this worktree (real stand-in K): counted' $byCase['K'] 'counted' 'SR-C2'
CheckLive 'S3-b SR-C2 cwd in another git worktree of this repository (same common dir, D442): counted' $otherWtPid 'counted' 'SR-C2' ([regex]::Escape($otherWt))
CheckLive 'S3-c SR-X1 cwd in a temporary other git repository (real stand-in A): SR-X1, not SR-X6' $byCase['A'] 'excluded' 'SR-X1'

# SR-R1: cumulative runner tree, two samples sharing one tree.
$runner = $base + 1; $tree = @{ $runner = $true }; $refTree = @{ $runner = $true }
$s1 = @((P 1 4 'pwsh.exe' 'pwsh -File slot-run.ps1' 'C:\Program Files\PowerShell\7\pwsh.exe' 0), (P 2 $runner 'node.exe' "`"$nodeExe`" `"$nogit\sleep.js`"" $nodeExe 10))
$null = Judge 'SR-R1+ sample 1' $s1 $tree $refTree
$s2 = @((P 2 4 'node.exe' "`"$nodeExe`" `"$nogit\sleep.js`"" $nodeExe 10), (P 3 4 'node.exe' "`"$nodeExe`" `"$nogit\sleep.js`"" $nodeExe 20))
$st = Judge 'SR-R1+/- sample 2' $s2 $tree $refTree
$g2 = Got $st ($base + 2); $g3 = Got $st ($base + 3)
Check 'SR-R1+ descendant reparented after its parent exited still belongs to this run' ($g2[0] -eq 'not-a-candidate' -and $st['runner-tree'] -eq 1) "got=$($g2[0]) runner-tree n=$($st['runner-tree'])"
Check 'SR-R1- same-name process that never descended from the runner is judged' ($g3[0] -eq 'excluded' -and $g3[1] -eq 'SR-X6') "got=$($g3[0]) $($g3[1]) [$($g3[2])]"

# SR-C1: candidate by image name only.
Case 'SR-C1' '+' 'esbuild.exe with no evidence is a candidate' @((P 10 4 'esbuild.exe' "esbuild.exe --service=0.25.0 --ping" "$nogit\esbuild.exe" 0)) 10 'excluded' 'SR-X6'
Case 'SR-C1' '-' 'python.exe naming this repository is not a candidate' @((P 11 4 'python.exe' "python `"$erpRoot\scripts\x.py`"" 'C:\Python312\python.exe' 0)) 11 'not-a-candidate' ''

# SR-C2: nearest level with evidence decides; this repository first at a level; cmd args never exclude.
Case 'SR-C2' '+' 'self in other repository, ancestor in this one: excluded (nearest level)' @(
  (P 20 4 'node.exe' "`"$nodeExe`" `"$erpRoot\scripts\ci.ts`"" $nodeExe 0), (P 21 ($base + 20) 'node.exe' "`"$nodeExe`" `"$foreign\x.js`"" $nodeExe 5)) 21 'excluded' 'SR-X1' '*self:*'
Case 'SR-C2' '+' 'same level names both repositories: this repository wins, counted' @(
  (P 22 4 'node.exe' "`"$nodeExe`" `"$foreign\x.js`" `"$erpRoot\y.js`"" $nodeExe 0)) 22 'counted' 'SR-C2' '*self:*'
Case 'SR-C2' '-' 'self cmd.exe names another repository only in its /c argument: walk continues up' @(
  (P 23 4 'node.exe' "`"$nodeExe`" `"$erpRoot\scripts\ci.ts`"" $nodeExe 0), (P 24 ($base + 23) 'cmd.exe' "cmd.exe /d /s /c node `"$foreign\tsc`"" $cmdExe 5)) 24 'counted' 'SR-C2' '*ancestor*depth=1*'
Case 'SR-C2' '-' 'parent younger than the child (PID reuse) is not walked into' @(
  (P 25 4 'node.exe' "`"$nodeExe`" `"$foreign\x.js`"" $nodeExe 50), (P 26 ($base + 25) 'node.exe' "`"$nodeExe`" `"$nogit\sleep.js`"" $nodeExe 10)) 26 'excluded' 'SR-X6'

# SR-X6 (i) (R3, D472): unreadable command line without a D411 record, excluded without the walk.
Case 'SR-X6' '+' '(i) unreadable command line, executable in another repository: excluded, not walked' @((P 30 4 'node.exe' $null "$foreign\node.exe" 0)) 30 'excluded' 'SR-X6' '*command line unreadable*'
Case 'SR-X6' '-' 'same process with a readable command line: walked, SR-X1' @((P 31 4 'node.exe' "`"$foreign\node.exe`" x.js" "$foreign\node.exe" 0)) 31 'excluded' 'SR-X1'

# SR-X1 carry-over (R2, D411): samples of one run; the last has the command line unreadable. -Middle adds a readable
# sample in between. Counted is called directly because the D316 kit (EQUIV) keeps no verdicts across samples.
function SampleSequence([string] $sign, [string] $what, [object[]] $first, [object] $second, [string] $want, [string] $wantRule, [object[]] $Middle) {
  $saved = $script:ever, $script:foreignSeen; $script:ever = @{}; $script:foreignSeen = @{}
  try {
    $null = Counted -All $first
    if ($Middle) { $null = Counted -All $Middle }
    $hits = Counted -All @($second)
  } finally { $script:ever, $script:foreignSeen = $saved }
  $got = if ($hits.Count) { @('counted', $hits[0].Rule, $hits[0].Owner) } elseif ($script:lastExcluded.Count) { @('excluded', $script:lastExcluded[0].Rule, $script:lastExcluded[0].Owner) } else { @('not-a-candidate', '', '') }
  Check "SR-X1$sign D411 $what" ($got[0] -eq $want -and $got[1] -eq $wantRule) "want=$want $wantRule got=$($got[0]) $($got[1]) [$($got[2])]"
}
$foreignCl = "`"$nodeExe`" `"$foreign\x.js`""
SampleSequence '+' 'judged foreign, then unreadable with the same creation time: still excluded' @((P 32 4 'node.exe' $foreignCl $nodeExe 0)) (P 32 4 'node.exe' $null $nodeExe 0) 'excluded' 'SR-X1'
SampleSequence '-' 'judged foreign, then unreadable with another creation time (PID reuse): SR-X6' @((P 33 4 'node.exe' $foreignCl $nodeExe 0)) (P 33 4 'node.exe' $null $nodeExe 7) 'excluded' 'SR-X6'
$noTime = P 34 4 'node.exe' $null $nodeExe 0; $noTime.CreationDate = $null
SampleSequence '-' 'judged foreign, then unreadable without a creation time: SR-X6' @((P 34 4 'node.exe' $foreignCl $nodeExe 0)) $noTime 'excluded' 'SR-X6'
SampleSequence '-' 'never judged foreign (first sample unknown ownership), then unreadable: SR-X6' @((P 35 4 'node.exe' "`"$nodeExe`" `"$nogit\sleep.js`"" $nodeExe 0)) (P 35 4 'node.exe' $null $nodeExe 0) 'excluded' 'SR-X6'
SampleSequence '-' 'judged foreign, then this repository (cwd changed), then unreadable: latest verdict wins, SR-X6' @((P 36 4 'node.exe' $foreignCl $nodeExe 0)) (P 36 4 'node.exe' $null $nodeExe 0) 'excluded' 'SR-X6' -Middle @((P 36 4 'node.exe' "`"$nodeExe`" `"$erpRoot\scripts\ci.ts`"" $nodeExe 0))

# SR-X1: other-repository evidence at the nearest level.
Case 'SR-X1' '+' 'node with an other-repository script' @((P 40 4 'node.exe' "`"$nodeExe`" `"$foreign\tsc`"" $nodeExe 0)) 40 'excluded' 'SR-X1'
Case 'SR-X1' '-' 'cmd.exe whose only other-repository path is its /c argument' @((P 41 4 'cmd.exe' "cmd.exe /d /s /c node `"$foreign\tsc`"" $cmdExe 0)) 41 'excluded' 'SR-X6'

# SR-X2: system browser.
$edgeCl = "`"$pfEdge`" --no-startup-window"
Case 'SR-X2' '+' 'plain Program Files msedge' @((P 50 4 'msedge.exe' $edgeCl $pfEdge 0)) 50 'excluded' 'SR-X2'
Case 'SR-X2' '-' 'Program Files msedge with --remote-debugging-port (d)' @((P 51 4 'msedge.exe' "$edgeCl --remote-debugging-port=9222" $pfEdge 0)) 51 'excluded' 'SR-X6'
Case 'SR-X2' '-' 'msedge outside system locations (a)' @((P 52 4 'msedge.exe' "`"$bin\msedge.exe`" --no-startup-window" "$bin\msedge.exe" 0)) 52 'excluded' 'SR-X6'
Case 'SR-X2' '-' 'ancestor cmd.exe /c names another repository (b counts cmd args)' @(
  (P 53 4 'cmd.exe' "cmd.exe /d /s /c `"$foreign\run.cmd`"" $cmdExe 0), (P 54 ($base + 53) 'msedge.exe' $edgeCl $pfEdge 5)) 54 'excluded' 'SR-X6'

# SR-X3: cmd.exe of an excluded system browser.
$pingCl = 'cmd.exe /d /s /c "ping -n 120 127.0.0.1 >nul"'
Case 'SR-X3' '+' 'cmd.exe whose parent is an excluded Program Files msedge' @(
  (P 60 4 'msedge.exe' $edgeCl $pfEdge 0), (P 61 ($base + 60) 'cmd.exe' $pingCl $cmdExe 5)) 61 'excluded' 'SR-X3'
Case 'SR-X3' '-' 'cmd.exe whose parent is a candidate node' @(
  (P 62 4 'node.exe' "`"$nodeExe`" `"$nogit\sleep.js`"" $nodeExe 0), (P 63 ($base + 62) 'cmd.exe' $pingCl $cmdExe 5)) 63 'excluded' 'SR-X6'

# SR-X4: cmd.exe of a system-location launcher (D320).
$launcher = 'C:\Program Files\Vendor\launcher.exe'
Case 'SR-X4' '+' 'cmd.exe whose parent is a non-candidate launcher under Program Files' @(
  (P 70 4 'launcher.exe' "`"$launcher`" --tray" $launcher 0), (P 71 ($base + 70) 'cmd.exe' $pingCl $cmdExe 5)) 71 'excluded' 'SR-X4'
Case 'SR-X4' '-' 'launcher under C:\Windows' @(
  (P 72 4 'explorer.exe' 'C:\Windows\explorer.exe' 'C:\Windows\explorer.exe' 0), (P 73 ($base + 72) 'cmd.exe' $pingCl $cmdExe 5)) 73 'excluded' 'SR-X6'
Case 'SR-X4' '-' 'launcher with an automation marker (d)' @(
  (P 74 4 'launcher.exe' "`"$launcher`" --headless" $launcher 0), (P 75 ($base + 74) 'cmd.exe' $pingCl $cmdExe 5)) 75 'excluded' 'SR-X6'

# SR-X5: the real orphan cmd.exe of case U (its cwd must be readable, so it cannot be synthetic).
$u = $cases | Where-Object { $_.Orphan -eq 'orphan-U.cmd' }
$x5 = Copy-Snap $liveSnap
$st = Judge 'SR-X5+ orphan U' $x5 @{ [int]$PID = $true } @{ [int]$PID = $true }
$g = Got $st $u.Pid
Check 'SR-X5+ orphan cmd.exe driving a non-candidate under AppData\Local\Programs (case U)' ($g[0] -eq 'excluded' -and $g[1] -eq 'SR-X5') "pid=$($u.Pid) got=$($g[0]) $($g[1]) [$($g[2])]"
$x5 = Copy-Snap $liveSnap
$uCmd = $x5 | Where-Object { [int]$_.ProcessId -eq $u.Pid }
$uKids = @($x5 | Where-Object { [int]$_.ParentProcessId -eq $u.Pid -and $_.Name -ne 'conhost.exe' })
foreach ($k in $uKids) { $k.CreationDate = $uCmd.CreationDate.AddSeconds(-5); Say "snapshot: SR-X5- child pid=$($k.ProcessId) CreationDate moved before cmd.exe pid=$($u.Pid)" }
$st = Judge 'SR-X5- orphan U, child older' $x5 @{ [int]$PID = $true } @{ [int]$PID = $true }
$g = Got $st $u.Pid
Check 'SR-X5- child created before the cmd.exe (PID reuse) is not its child: no live child, SR-X6' ($uKids.Count -ge 1 -and $g[0] -eq 'excluded' -and $g[1] -eq 'SR-X6') "pid=$($u.Pid) children moved=$($uKids.Count) got=$($g[0]) $($g[1]) [$($g[2])]"
foreach ($id in 'orphan-V.cmd', 'orphan-W.cmd') {
  $c = $cases | Where-Object { $_.Orphan -eq $id }; $g = Got $state $c.Pid
  Check "SR-X5- $($c.Id)" ($g[0] -eq 'excluded' -and $g[1] -eq 'SR-X6') "pid=$($c.Pid) got=$($g[0]) $($g[1]) [$($g[2])]"
}

# Real processes elsewhere on the machine at this moment, for the record (not asserted).
$ours = @{}; foreach ($p in $started) { $ours[$p] = $true }
do { $grew = $false; foreach ($p in $procs) { if ($ours.ContainsKey([int]$p.ParentProcessId) -and -not $ours.ContainsKey([int]$p.ProcessId)) { $ours[[int]$p.ProcessId] = $true; $grew = $true } } } while ($grew)
foreach ($p in $liveSnap) {
  $s = Got $state ([int]$p.ProcessId)
  if ($s[0] -ne 'not-a-candidate' -and -not $ours.ContainsKey([int]$p.ProcessId)) { Say "other $($s[0]) pid=$($p.ProcessId) rule=$($s[1]) $($p.Name) [$($s[2])] cmdline=[$($p.CommandLine -replace '\s+', ' ')]" }
}
}
finally {
  $procs = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId
  $ours = @{}; foreach ($p in $started) { $ours[$p] = $true }
  do { $grew = $false; foreach ($p in $procs) { if ($ours.ContainsKey([int]$p.ParentProcessId) -and -not $ours.ContainsKey([int]$p.ProcessId)) { $ours[[int]$p.ProcessId] = $true; $grew = $true } } } while ($grew)
  foreach ($id in $ours.Keys) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 1
  if ($otherWt) { git -C $erpRoot worktree remove --force $otherWt 2>&1 | Out-Null }
  Remove-Item -Recurse -Force $tmp, $erpDir, $apps -ErrorAction SilentlyContinue
}
$equivText = if ($ref) { "$($script:equiv) EQUIV vs D316 kit" } else { "EQUIV not checked (no -ReferenceProcs)" }

# Part 4, slot-run.ps1 entry checks (D354). Each run is a child pwsh started here (inside this script's tree) that must
# stop with exit 4 before the build and before any sample; nothing is left running. Each passes -Ports (R3), so its
# exit 4 comes from the condition under test, not from a missing -Ports.
$part4Start = $script:items
$pwshExe = (Get-Process -Id $PID).Path
$runner = Join-Path $PSScriptRoot 'slot-run.ps1'
$p4 = Join-Path $OutDir 'runner-entry'; New-Item -ItemType Directory -Force $p4 | Out-Null
function Invoke-Runner([string] $cwd, [string] $outArg, [string] $stepsArg, [string] $tag) {
  $o = Join-Path $p4 "$tag.out.txt"
  $proc = Start-Process -FilePath $pwshExe -WorkingDirectory $cwd -NoNewWindow -Wait -PassThru -RedirectStandardOutput $o -RedirectStandardError (Join-Path $p4 "$tag.err.txt") `
    -ArgumentList @('-NoProfile', '-File', "`"$runner`"", '-OutDir', "`"$outArg`"", '-StepsFile', "`"$stepsArg`"", '-Ports', '4203')
  @{ Code = $proc.ExitCode; Out = (Get-Content -Raw $o -ErrorAction SilentlyContinue) }
}
$noSteps = Join-Path $p4 'steps-none.ps1'; Set-Content $noSteps 'param($OutDir, $Root, $BaseRoot)'
$nullStep = Join-Path $p4 'steps-null.ps1'; Set-Content $nullStep "param(`$OutDir, `$Root, `$BaseRoot)`n`$null"
$cwd = Join-Path $p4 'cwd'; New-Item -ItemType Directory -Force $cwd | Out-Null
$rel = "rel-out-$([guid]::NewGuid().ToString('N').Substring(0, 8))"
# OutDir+: a relative -OutDir is resolved against the caller's directory once; the runner's later Set-Location to the
# repository root must not move its log there.
$r = Invoke-Runner $cwd $rel $noSteps 'outdir-relative'
$inCwd = Join-Path (Join-Path $cwd $rel) 'slot-summary.log'; $inRepo = Join-Path $erpRoot $rel
$logText = if (Test-Path $inCwd) { Get-Content -Raw $inCwd } else { '' }
Check 'RUN-OUTDIR+ relative -OutDir: log stays under the caller''s directory, nothing in the worktree' ($r.Code -eq 4 -and $logText -match 'runner start' -and -not (Test-Path $inRepo)) "exit=$($r.Code) log-in-cwd=$(Test-Path $inCwd) in-worktree=$(Test-Path $inRepo)"
# Archive (never delete) anything a faulty runner wrote into the worktree, so it does not stay there.
if (Test-Path $inRepo) { Move-Item $inRepo (Join-Path $p4 "leaked-$rel") }
# OutDir-: a relative -OutDir that resolves inside the repository is refused before anything is written.
$relIn = "slot-selftest-in-$([guid]::NewGuid().ToString('N').Substring(0, 8))"
$r = Invoke-Runner $erpRoot $relIn $noSteps 'outdir-in-repo'
$leak = Join-Path $erpRoot $relIn
Check 'RUN-OUTDIR- relative -OutDir inside the repository is refused' ($r.Code -eq 4 -and $r.Out -match 'must be outside the repository' -and -not (Test-Path $leak)) "exit=$($r.Code) created=$(Test-Path $leak)"
if (Test-Path $leak) { Move-Item $leak (Join-Path $p4 "leaked-$relIn") }
# Steps-: a steps file that yields nothing (or only $null) ends the run with exit 4 instead of a vacuous success.
foreach ($c in @(@{ Tag = 'steps-none'; File = $noSteps; What = 'no output' }, @{ Tag = 'steps-null'; File = $nullStep; What = 'only $null' })) {
  $od = Join-Path $p4 "$($c.Tag)-out"
  $r = Invoke-Runner $cwd $od $c.File $c.Tag
  $l = if (Test-Path (Join-Path $od 'slot-summary.log')) { Get-Content -Raw (Join-Path $od 'slot-summary.log') } else { '' }
  Check "RUN-STEPS- steps file with $($c.What) is rejected" ($r.Code -eq 4 -and $l -match 'produced no steps' -and $l -notmatch 'build start') "exit=$($r.Code) no-steps-logged=$($l -match 'produced no steps') build-started=$($l -match 'build start')"
}
# Steps+: the example steps file yields steps (evaluated in memory, nothing started).
$ex = @(& (Join-Path $PSScriptRoot 'steps.example.ps1') -OutDir $p4 -Root $erpRoot -BaseRoot '' | Where-Object { $null -ne $_ })
Check 'RUN-STEPS+ steps.example.ps1 yields at least one step' ($ex.Count -ge 1) "steps=$(($ex | ForEach-Object { $_.name }) -join ',')"
$part4 = $script:items - $part4Start

# Part 5 (S12 SLOT-02): every input is passed explicitly; each result is logged through Check.
. (Join-Path $PSScriptRoot 'selftest-preflight.ps1')
$part5Start = $script:items
Get-PreflightSelftestResults -SlotDir $PSScriptRoot -RepoRoot $erpRoot -WorkDir (Join-Path $OutDir 'preflight') -PwshExe $pwshExe |
  ForEach-Object { if ($_.Skip) { Say "SKIP $($_.Label) $($_.Detail)" } else { Check $_.Label $_.Ok $_.Detail } }
$part5 = $script:items - $part5Start

Say "summary: $($script:items) checks = $part1 kit cases A-W + $($script:items - $part1 - $script:equiv - $part4 - $part5) SR rule cases + $equivText + $part4 runner entry checks + $part5 preflight / step environment checks; $($script:items - $script:fail) PASS, $($script:fail) FAIL"
Say "R3 差异 (kit SR-C3 cases now SR-X6, SLOT-03 S4): $($script:r3Diffs.Count) checks: $($script:r3Diffs -join ', ')"
Say "selftest $(if ($script:fail) { "FAILED ($($script:fail))" } else { 'passed' })"
exit [int]($script:fail -ne 0)
