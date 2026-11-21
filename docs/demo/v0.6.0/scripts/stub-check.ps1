# 无浏览器替身检查：用函数遮蔽 npm / node / Start-Process / Get-NetTCPConnection 等，原样运行 README 第 4 节的复跑块（现版命令），
# 覆盖成功分支与失败分支，并对每个场景断言预期结果；任一断言失败则以非零退出。
# 不启动 Chrome、Playwright、Vitest，不监听端口，不重拍截图。
# 隔离：运行期间把 TEMP/TMP 指到一个独立的临时目录，所有输出（shots、erp-demo-*）都落在那里，结束后整体删除；
# 开始前和结束后核对真实截图目录（docs\demo\v0.6.0\screenshots）的 16 个 PNG 与 2 个日志的 SHA256 与 git 状态完全不变。
# 用法（仓库根目录）：powershell -NoProfile -File docs\demo\v0.6.0\scripts\stub-check.ps1
$ErrorActionPreference = "Stop"
$root = (Get-Location).Path
$realShots = Join-Path $root "docs\demo\v0.6.0\screenshots"
$origTemp = $env:TEMP; $origTmp = $env:TMP
$failures = New-Object System.Collections.Generic.List[string]
function Fail($msg) { $script:failures.Add($msg); "ASSERT FAIL: $msg" }

function Snapshot {
  $h = @{}
  Get-ChildItem $realShots -File | ForEach-Object { $h[$_.Name] = (Get-FileHash $_.FullName -Algorithm SHA256).Hash }
  $h
}
if ((git status --porcelain -- docs/demo/v0.6.0/screenshots)) { throw "真实截图目录有未提交改动，先处理再检查" }
$before = Snapshot
if (@($before.Keys | Where-Object { $_ -like "*.png" }).Count -ne 16 -or $before.Count -ne 18) { throw "真实截图目录应为 16 张 PNG + 2 个日志，实际 $($before.Count) 个文件" }

$iso = Join-Path $origTemp ("s6-stub-" + [guid]::NewGuid())
New-Item -ItemType Directory $iso | Out-Null
$env:TEMP = $iso; $env:TMP = $iso

$readme = Get-Content (Join-Path $root "docs\demo\v0.6.0\README.md") -Raw -Encoding UTF8
$sec = $readme.Substring($readme.IndexOf("## 4."))
$m = [regex]::Match($sec, '(?s)```powershell\r?\n(.*?)```')
if (-not $m.Success) { throw "README 第 4 节没有 powershell 块" }
$block = [scriptblock]::Create($m.Groups[1].Value)

$global:Calls = New-Object System.Collections.Generic.List[string]
$global:Stopped = New-Object System.Collections.Generic.List[int]
$global:Copied = 0; $global:Captures = 0; $global:Started = 0
$global:Cur = "main"; $global:Nq = 0; $global:Sc = $null
$MainPid = 111; $MigPid = 222

function npm { $global:Calls.Add("npm " + ($args -join " ")); $global:LASTEXITCODE = 0
  if ($args -contains "--check") { '{"verdict":"pending","knownDifferencesSha256":"stub"}' } }
function node {
  $global:Calls.Add("node " + ($args -join " "))
  $script = [string]$args[0]
  if ($script -like "*prepare.mjs") { $global:Cur = "main"; $global:Nq = 1 }
  if ($script -like "*migration-setup.mjs") { $global:Cur = "mig"; $global:Nq = 1 }
  $global:LASTEXITCODE = 0
  if ($script -like "*capture.mjs") {
    $global:Captures++
    $mode = [string]$args[1]; $out = [string]$args[3]
    if (-not $out.StartsWith($iso)) { throw "替身拦截：capture 输出目录 $out 不在隔离目录内" }
    New-Item -ItemType Directory -Force $out | Out-Null
    $count = if ($mode -eq "main") { 12 } else { 4 }
    1..$count | ForEach-Object { New-Item -ItemType File -Force (Join-Path $out "stub-$mode-$_.png") | Out-Null }
    $global:LASTEXITCODE = [int]$global:Sc.capture[$mode]
  }
}
function Start-Process {
  $global:Started++
  $id = if ($global:Started -eq 1) { $MainPid } else { $MigPid }
  $global:Calls.Add("Start-Process node (fake pid $id)")
  [pscustomobject]@{ Id = $id; HasExited = $false }
}
function Invoke-WebRequest { [pscustomobject]@{ StatusCode = 200 } }
function Stop-Process { $global:Stopped.Add([int]$args[1]); $global:Calls.Add("Stop-Process " + ($args -join " ")) }
function Copy-Item {
  $global:Copied++; $global:Calls.Add("Copy-Item " + ($args -join " "))
  if (($args -join " ") -notlike "*$iso*") { throw "替身拦截：Copy-Item 只记录，不应真正执行" }
}
function Get-NetTCPConnection {
  $q = $global:Sc.q[$global:Cur]; $i = $global:Nq; $global:Nq++
  if ($i -lt $q.Count -and $null -ne $q[$i]) { [pscustomobject]@{ OwningProcess = $q[$i] } }
}

# q：各脚本里依次的端口监听查询结果（$null = 空闲）；999 = 不属于本轮的进程
$ok = @{ main = @($null,111,111,$null); mig = @($null,222,$null) }
$scenarios = [ordered]@{
  "1 success" = @{ q = $ok; capture = @{ main = 0; migration = 0 }
    throws = $null; copied = 1; stopped = @(111,222); captures = 2 }
  "2 main capture exit 3" = @{ q = $ok; capture = @{ main = 3; migration = 0 }
    throws = "capture failed, exit 3"; copied = 0; stopped = @(111); captures = 1 }
  "3 migration capture exit 5" = @{ q = $ok; capture = @{ main = 0; migration = 5 }
    throws = "capture failed, exit 5"; copied = 0; stopped = @(111,222); captures = 2 }
  "4 port busy at start (main)" = @{ q = @{ main = @(4242,4242); mig = $ok.mig }; capture = @{ main = 0; migration = 0 }
    throws = "port busy"; copied = 0; stopped = @(); captures = 0 }
  "5 owner mismatch after start (main)" = @{ q = @{ main = @($null,999,$null,$null); mig = $ok.mig }; capture = @{ main = 0; migration = 0 }
    throws = "owner mismatch"; copied = 0; stopped = @(111); captures = 0 }
  "6 owner mismatch after seed (main)" = @{ q = @{ main = @($null,111,999,$null); mig = $ok.mig }; capture = @{ main = 0; migration = 0 }
    throws = "owner mismatch after seed"; copied = 0; stopped = @(111); captures = 0 }
  "7 migration owner mismatch" = @{ q = @{ main = $ok.main; mig = @($null,999,$null) }; capture = @{ main = 0; migration = 0 }
    throws = "owner mismatch"; copied = 0; stopped = @(111,222); captures = 1 }
}
foreach ($name in $scenarios.Keys) {
  $s = $scenarios[$name]
  $global:Sc = $s; $global:Calls.Clear(); $global:Stopped.Clear()
  $global:Copied = 0; $global:Captures = 0; $global:Started = 0; $global:Cur = "main"; $global:Nq = 0
  "=== $name"
  $threw = $null
  try { . $block } catch { $threw = $_.Exception.Message }
  $left = @(Get-ChildItem $iso -Directory -Filter "erp-demo-*" -ErrorAction SilentlyContinue).Count
  $stoppedList = @($global:Stopped) -join ","
  "--- threw: $threw | Copy-Item: $global:Copied | capture calls: $global:Captures | Stop-Process pids: [$stoppedList] | leftover erp-demo-*: $left"
  if ($null -eq $s.throws) { if ($threw) { Fail "$name：不应抛错，实际：$threw" } }
  elseif (-not $threw -or $threw -notlike "*$($s.throws)*") { Fail "$name：应抛出 '$($s.throws)'，实际：$threw" }
  if ($global:Copied -ne $s.copied) { Fail "$name：Copy-Item 应 $($s.copied) 次，实际 $global:Copied" }
  if ($global:Captures -ne $s.captures) { Fail "$name：capture 应 $($s.captures) 次，实际 $global:Captures" }
  if ($stoppedList -ne (@($s.stopped) -join ",")) { Fail "$name：应停止 pid [$(@($s.stopped) -join ',')]，实际 [$stoppedList]" }
  if ($left -ne 0) { Fail "$name：残留 erp-demo-* 目录 $left 个" }
}

$env:TEMP = $origTemp; $env:TMP = $origTmp
Remove-Item -Recurse -Force $iso
$after = Snapshot
if ($after.Count -ne 18) { Fail "真实截图目录文件数变为 $($after.Count)" }
foreach ($k in $before.Keys) { if ($after[$k] -ne $before[$k]) { Fail "真实截图被改动：$k" } }
if ((git status --porcelain -- docs/demo/v0.6.0/screenshots)) { Fail "真实截图目录出现 git 改动" }
if (Test-Path $iso) { Fail "隔离目录未删除" }
"=== isolation: real screenshot dir (16 PNG + 2 logs) SHA256 unchanged, git status clean, isolated dir removed"
if ($failures.Count -gt 0) { "FAILED: $($failures.Count) assertion(s)"; exit 1 }
"ALL ASSERTIONS PASSED (7 scenarios)"
