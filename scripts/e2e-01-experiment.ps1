<#
E2E-01 controlled experiment: are concurrent real-Chrome E2E runs from two worktrees interfering?
(design/tasks/E2E-01-concurrent-e2e-interference.md). Read-only with respect to the tests: every
run is the unchanged README command `vitest run trade-gui- migration-gui.slow` with real Chrome,
no retries, no timeout changes, ERP_E2E_DIAG unset (default code path).

  serial:      the first worktree runs N times back to back.
  concurrent:  every round starts one run in each worktree at the same time (N rounds).

Evidence written to -OutDir:
  <wt>-start|end-rev-parse.txt, <wt>-start|end-porcelain.txt   exact head + `status --porcelain --untracked-files=all`
  precheck-<round>.json        two process checks 10 s apart before the round (D118)
  samples.jsonl                one line every 10 s: total CPU %, every browser / node process with PID,
                               parent, owner, class, CPU seconds and command line
  <label>.log / .json / .exit  tee'd verbose output, Vitest JSON report, exit code
  artifacts\<label>\           ERP_E2E_ARTIFACTS of that run
  summary.json, summary.md     pass/fail, failed tests and assertions, per-file Duration, CPU during run
  SHA256SUMS.txt               sha256 of every file above

Stops immediately (abort.txt) when an external automation browser appears, when an external desktop
browser appears without -AllowDesktopChrome, or when a run fails while external node load was present (D150).
-DryRun replaces vitest with a node sleep so the harness can be checked without starting Chrome.
#>
param(
  [ValidateSet("orchestrate", "sample", "run")] [string]$Role = "orchestrate",
  [ValidateSet("serial", "concurrent")] [string]$Mode = "serial",
  [int]$N = 5,
  [string[]]$Worktrees = @(),
  [string]$OutDir,
  [switch]$AllowDesktopChrome,
  [switch]$DryRun,
  [int]$RootPid = 0,
  [string]$Worktree,
  [string]$Label
)
$ErrorActionPreference = "Stop"

$browserNames = "^(chrome|msedge|chromium|chrome-headless-shell|headless_shell)\.exe$"
$owners = @{}

# Win32_Process.GetOwner costs about 1 s per process here; the token query costs microseconds.
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices; using System.Security.Principal;
public static class E2e01Owner {
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("advapi32.dll")] static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  public static string Of(int pid) {
    IntPtr process = OpenProcess(0x1000, false, pid), token = IntPtr.Zero;
    if (process == IntPtr.Zero) return "?";
    try {
      if (!OpenProcessToken(process, 8, out token)) return "?";
      using (var identity = new WindowsIdentity(token)) return identity.Name;
    } catch { return "?"; } finally { if (token != IntPtr.Zero) CloseHandle(token); CloseHandle(process); }
  }
}
"@
function Get-Owner($process) {
  $id = [int]$process.ProcessId
  if (-not $owners.ContainsKey($id)) { $owners[$id] = [E2e01Owner]::Of($id) }
  $owners[$id]
}

# Classes: own (descendant of the orchestrator), automation-browser (Playwright / headless profile),
# desktop-browser (interactive profile), node, webview (msedgewebview2: counted, not listed).
function Get-Snapshot([int]$root) {
  $all = Get-CimInstance Win32_Process
  $byId = @{}; foreach ($p in $all) { $byId[[int]$p.ProcessId] = $p }
  $children = @{}
  foreach ($p in $all) {
    $parent = [int]$p.ParentProcessId
    if (-not $children.ContainsKey($parent)) { $children[$parent] = [System.Collections.Generic.List[int]]::new() }
    $children[$parent].Add([int]$p.ProcessId)
  }
  $own = [System.Collections.Generic.HashSet[int]]::new()
  $queue = [System.Collections.Generic.Queue[int]]::new(); $queue.Enqueue($root)
  while ($queue.Count) {
    $id = $queue.Dequeue()
    if ($own.Add($id) -and $children.ContainsKey($id)) { foreach ($c in $children[$id]) { $queue.Enqueue($c) } }
  }
  $listed = foreach ($p in $all) {
    $isBrowser = $p.Name -match $browserNames
    if (-not ($isBrowser -or $p.Name -eq "node.exe")) { continue }
    $id = [int]$p.ProcessId
    $class = if ($own.Contains($id)) { "own" } elseif ($p.Name -eq "node.exe") { "node" } else {
      $top = $p
      while ($byId.ContainsKey([int]$top.ParentProcessId) -and $byId[[int]$top.ParentProcessId].Name -eq $p.Name) { $top = $byId[[int]$top.ParentProcessId] }
      if ("$($top.CommandLine)" -match "playwright_|--headless|--remote-debugging|--enable-automation") { "automation-browser" } else { "desktop-browser" }
    }
    [ordered]@{
      pid = $id; ppid = [int]$p.ParentProcessId; name = $p.Name; class = $class; owner = Get-Owner $p
      cpuSeconds = [math]::Round(([double]$p.KernelModeTime + [double]$p.UserModeTime) / 1e7, 2)
      started = $p.CreationDate; commandLine = "$($p.CommandLine)"
    }
  }
  $counts = [ordered]@{}
  foreach ($c in "own", "automation-browser", "desktop-browser", "node") { $counts[$c] = @($listed | Where-Object { $_.class -eq $c }).Count }
  $counts["webview"] = @($all | Where-Object { $_.Name -eq "msedgewebview2.exe" }).Count
  $counts["allProcesses"] = $all.Count
  [ordered]@{ at = (Get-Date).ToString("o"); counts = $counts; processes = @($listed) }
}

function Get-Blocker($snapshot) {
  if ($snapshot.counts["automation-browser"] -gt 0) { return "external automation browser" }
  if ($snapshot.counts["desktop-browser"] -gt 0 -and -not $AllowDesktopChrome) { return "external desktop browser" }
  $null
}

if ($Role -eq "sample") {
  $stop = Join-Path $OutDir "stop.flag"; $file = Join-Path $OutDir "samples.jsonl"
  $next = Get-Date
  while (-not (Test-Path $stop)) {
    $tick = Get-Date
    $s = Get-Snapshot $RootPid
    $s["sampleMs"] = [int]((Get-Date) - $tick).TotalMilliseconds
    $s["cpuTotalPercent"] = [int](Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'").PercentProcessorTime
    Add-Content -Path $file -Value ($s | ConvertTo-Json -Depth 5 -Compress) -Encoding utf8
    $blocker = Get-Blocker $s
    if ($blocker) { Set-Content -Path (Join-Path $OutDir "external.flag") -Value "$($s.at) $blocker" -Encoding utf8 }
    # Fixed 10 s schedule; a sample that overruns its slot skips to the next one.
    do { $next = $next.AddSeconds(10) } while ($next -le (Get-Date))
    while (-not (Test-Path $stop) -and (Get-Date) -lt $next) { Start-Sleep -Milliseconds 250 }
  }
  exit 0
}

if ($Role -eq "run") {
  $ErrorActionPreference = "Continue"
  Set-Location $Worktree
  Remove-Item Env:CI_TEST_LAYER, Env:ERP_E2E_DIAG, Env:TEST_FILE_ORDER -ErrorAction SilentlyContinue
  $env:ERP_E2E_BROWSER_CHANNEL = "chrome"
  $env:ERP_E2E_ARTIFACTS = Join-Path $OutDir "artifacts\$Label"
  $log = Join-Path $OutDir "$Label.log"; $json = Join-Path $OutDir "$Label.json"
  "# $Label start $((Get-Date).ToString('o')) head $(git rev-parse HEAD) cwd $Worktree" | Tee-Object -FilePath $log
  if ($DryRun) {
    & node -e "console.log('dry run: no vitest, no Chrome'); setTimeout(() => {}, 25000)" 2>&1 | Tee-Object -FilePath $log -Append
  } else {
    & node node_modules/vitest/vitest.mjs run trade-gui- migration-gui.slow --reporter=verbose --reporter=json "--outputFile.json=$json" 2>&1 | Tee-Object -FilePath $log -Append
  }
  $code = $LASTEXITCODE
  "# $Label end $((Get-Date).ToString('o')) exit $code" | Tee-Object -FilePath $log -Append
  Set-Content -Path (Join-Path $OutDir "$Label.exit") -Value $code -Encoding ascii
  exit $code
}

# orchestrate
if (-not $OutDir) { throw "-OutDir is required" }
$Worktrees = @($Worktrees | ForEach-Object { (Resolve-Path $_).Path })
if ($Mode -eq "serial") { $Worktrees = @($Worktrees[0]) }
if ($Mode -eq "concurrent" -and $Worktrees.Count -ne 2) { throw "concurrent needs exactly two -Worktrees" }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$OutDir = (Resolve-Path $OutDir).Path
if (Get-ChildItem $OutDir -Force) { throw "$OutDir must be empty" }
$self = $PSCommandPath; $tags = @("A", "B")
function Quote([string[]]$arguments) { $arguments | ForEach-Object { if ($_ -match "\s") { "`"$_`"" } else { $_ } } }
# A dry run records what would have stopped a real run (would-abort.txt) and carries on.
function Set-Abort([string]$reason) {
  if ($DryRun) { Add-Content (Join-Path $OutDir "would-abort.txt") -Value $reason -Encoding utf8 } else { $script:abort = $reason }
}

function Write-Head([string]$when) {
  for ($i = 0; $i -lt $Worktrees.Count; $i++) {
    git -C $Worktrees[$i] rev-parse HEAD | Set-Content (Join-Path $OutDir "$($tags[$i])-$when-rev-parse.txt") -Encoding ascii
    $porcelain = git -C $Worktrees[$i] status --porcelain --untracked-files=all
    Set-Content (Join-Path $OutDir "$($tags[$i])-$when-porcelain.txt") -Value $porcelain -Encoding ascii -NoNewline
    if ($porcelain -and -not $DryRun) { throw "$($Worktrees[$i]) is not clean at $when" }
  }
  $heads = @(for ($i = 0; $i -lt $Worktrees.Count; $i++) { (Get-Content (Join-Path $OutDir "$($tags[$i])-$when-rev-parse.txt")).Trim() })
  if (@($heads | Sort-Object -Unique).Count -ne 1) { throw "heads differ at ${when}: $heads" }
  foreach ($w in $Worktrees) { if (-not (Test-Path (Join-Path $w "node_modules\vitest\vitest.mjs"))) { throw "$w has no node_modules" } }
}

function Stop-Own {
  $s = Get-Snapshot $PID
  foreach ($p in $s.processes | Where-Object { $_.class -eq "own" }) { Stop-Process -Id $p.pid -Force -ErrorAction SilentlyContinue }
}

$abort = $null; $runs = [System.Collections.Generic.List[object]]::new()
Set-Content (Join-Path $OutDir "experiment.txt") -Encoding utf8 -Value @(
  "mode $Mode", "N $N", "worktrees $($Worktrees -join ' | ')", "dryRun $([bool]$DryRun)",
  "allowDesktopChrome $([bool]$AllowDesktopChrome)", "orchestrator pid $PID owner $env:USERDOMAIN\$env:USERNAME",
  "logical processors $([Environment]::ProcessorCount)", "started $((Get-Date).ToString('o'))")
Write-Head "start"
$sampler = Start-Process pwsh -PassThru -WindowStyle Hidden -ArgumentList (Quote (@(
  "-NoProfile", "-File", $self, "-Role", "sample", "-OutDir", $OutDir, "-RootPid", $PID) + $(if ($AllowDesktopChrome) { @("-AllowDesktopChrome") } else { @() })))
try {
  for ($round = 1; $round -le $N -and -not $abort; $round++) {
    $checks = @(); foreach ($k in 1, 2) { if ($k -eq 2) { Start-Sleep -Seconds 10 }; $checks += Get-Snapshot $PID }
    $checks | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $OutDir "precheck-$round.json") -Encoding utf8
    foreach ($c in $checks) { $b = Get-Blocker $c; if ($b) { Set-Abort "round ${round} precheck: $b"; break } }
    if ($abort) { break }
    $started = for ($i = 0; $i -lt $Worktrees.Count; $i++) {
      $label = "$Mode-$($tags[$i])-run$round"
      $p = Start-Process pwsh -PassThru -WindowStyle Hidden -ArgumentList (Quote (@("-NoProfile", "-File", $self, "-Role", "run",
        "-Worktree", $Worktrees[$i], "-Label", $label, "-OutDir", $OutDir) + $(if ($DryRun) { @("-DryRun") } else { @() })))
      [pscustomobject]@{ label = $label; worktree = $tags[$i]; round = $round; process = $p; start = (Get-Date).ToString("o") }
    }
    while (@($started | Where-Object { -not $_.process.HasExited }).Count) {
      $flag = Join-Path $OutDir "external.flag"
      if (Test-Path $flag) {
        Set-Abort "round ${round} during run: $(Get-Content $flag)"; Remove-Item $flag
        if ($abort) { Stop-Own; break }
      }
      Start-Sleep -Seconds 2
    }
    foreach ($r in $started) {
      $r.process.WaitForExit()
      $exitFile = Join-Path $OutDir "$($r.label).exit"
      $runs.Add([pscustomobject]@{
        label = $r.label; worktree = $r.worktree; round = $r.round; start = $r.start; end = (Get-Date).ToString("o")
        exit = if (Test-Path $exitFile) { [int](Get-Content $exitFile) } else { $null }
        precheck = @($checks | ForEach-Object { $_.counts })
      })
    }
    $failed = @($runs | Where-Object { $_.round -eq $round -and $_.exit -ne 0 })
    if ($failed.Count -and -not $abort) {
      $during = Get-Content (Join-Path $OutDir "samples.jsonl") | ForEach-Object { $_ | ConvertFrom-Json } |
        Where-Object { [datetime]$_.at -ge [datetime]$started[0].start }
      $nodeLoad = @($checks | Where-Object { $_.counts["node"] -gt 0 }).Count + @($during | Where-Object { $_.counts.node -gt 0 }).Count
      if ($nodeLoad) { Set-Abort "round ${round}: failure with external node load present" }
    }
  }
} finally {
  New-Item -ItemType File -Path (Join-Path $OutDir "stop.flag") -Force | Out-Null
  $sampler.WaitForExit(30000) | Out-Null
  Remove-Item (Join-Path $OutDir "stop.flag")
  if ($abort) { Set-Content (Join-Path $OutDir "abort.txt") -Value $abort -Encoding utf8 }
}
Write-Head "end"

# summary
$samples = @(Get-Content (Join-Path $OutDir "samples.jsonl") | ForEach-Object { $_ | ConvertFrom-Json })
$summary = foreach ($r in $runs) {
  $json = Join-Path $OutDir "$($r.label).json"
  $report = if (Test-Path $json) { Get-Content $json -Raw | ConvertFrom-Json } else { $null }
  $window = @($samples | Where-Object { [datetime]$_.at -ge [datetime]$r.start -and [datetime]$_.at -le [datetime]$r.end })
  $cpu = @($window | ForEach-Object { $_.cpuTotalPercent })
  [ordered]@{
    label = $r.label; worktree = $r.worktree; round = $r.round; start = $r.start; end = $r.end; exit = $r.exit
    result = if ($r.exit -eq 0) { "pass" } else { "fail" }
    tests = if ($report) { "$($report.numPassedTests)/$($report.numTotalTests) passed" } else { $null }
    files = @(if ($report) { foreach ($f in $report.testResults) {
      [ordered]@{ file = (Split-Path $f.name -Leaf); status = $f.status; durationMs = [int]($f.endTime - $f.startTime) } } })
    failures = @(if ($report) { foreach ($f in $report.testResults) { foreach ($a in $f.assertionResults | Where-Object { $_.status -eq "failed" }) {
      [ordered]@{ file = (Split-Path $f.name -Leaf); test = $a.fullName; assertion = (($a.failureMessages -join "`n") -split "`n" | Select-Object -First 6) -join "`n" } } } })
    precheckExternal = $r.precheck
    externalDuringRun = [ordered]@{
      automationBrowserMax = ($window | ForEach-Object { $_.counts.'automation-browser' } | Measure-Object -Maximum).Maximum
      desktopBrowserMax = ($window | ForEach-Object { $_.counts.'desktop-browser' } | Measure-Object -Maximum).Maximum
      nodeMax = ($window | ForEach-Object { $_.counts.node } | Measure-Object -Maximum).Maximum
    }
    cpuSamples = $cpu.Count
    cpuPercent = if ($cpu.Count) { [ordered]@{ min = ($cpu | Measure-Object -Minimum).Minimum; avg = [int]($cpu | Measure-Object -Average).Average; max = ($cpu | Measure-Object -Maximum).Maximum } } else { $null }
  }
}
@($summary) | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $OutDir "summary.json") -Encoding utf8
$md = @("# E2E-01 $Mode, N = $N", "", "head $((Get-Content (Join-Path $OutDir 'A-start-rev-parse.txt')).Trim())",
  $(if ($abort) { "", "**ABORTED**: $abort" }), "",
  "| run | result | tests | CPU % min/avg/max (samples) | external before (node/auto/desktop) | external during max (node/auto/desktop) | file durations ms |",
  "| --- | --- | --- | --- | --- | --- | --- |")
foreach ($s in $summary) {
  $pre = ($s.precheckExternal | ForEach-Object { "$($_.node)/$($_.'automation-browser')/$($_.'desktop-browser')" }) -join ", "
  $cpuText = if ($s.cpuPercent) { "$($s.cpuPercent.min)/$($s.cpuPercent.avg)/$($s.cpuPercent.max) ($($s.cpuSamples))" } else { "-" }
  $d = $s.externalDuringRun
  $md += "| $($s.label) | $($s.result) | $($s.tests) | $cpuText | $pre | $($d.nodeMax)/$($d.automationBrowserMax)/$($d.desktopBrowserMax) | $(($s.files | ForEach-Object { "$($_.file) $($_.durationMs)" }) -join '; ') |"
}
foreach ($s in $summary | Where-Object { $_.failures.Count }) {
  $md += "", "## $($s.label) failures"
  foreach ($f in $s.failures) { $md += "", "- $($f.file) > $($f.test)", "", '```', $f.assertion, '```' }
}
Set-Content (Join-Path $OutDir "summary.md") -Value $md -Encoding utf8
Get-ChildItem $OutDir -Recurse -File | Where-Object { $_.Name -ne "SHA256SUMS.txt" } | Sort-Object FullName | ForEach-Object {
  "$((Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower())  $($_.FullName.Substring($OutDir.Length + 1).Replace('\', '/'))"
} | Set-Content (Join-Path $OutDir "SHA256SUMS.txt") -Encoding ascii
Get-Content (Join-Path $OutDir "summary.md")
if ($abort) { Write-Warning "ABORTED: $abort"; exit 2 }
