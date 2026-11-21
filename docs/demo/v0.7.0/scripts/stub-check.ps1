# 无浏览器替身检查（D208）：用函数遮蔽 npm / node / Start-Process / Get-NetTCPConnection / Invoke-WebRequest 等，
# 原样运行 README 第 4 节的复跑块（现版命令），覆盖成功分支与失败分支，并对每个场景断言预期结果；任一断言失败则以非零退出。
# 不启动 Chrome、Playwright、Vitest，不监听端口，不重拍截图。
# 隔离：运行期间 TEMP/TMP 指到专用临时目录，所有输出（shots、erp-demo-*）都落在那里；结束时（无论成败）在 finally 里恢复环境、
# 删除专用目录并重新计算真实截图目录（含隐藏文件 .gitkeep）的 SHA256；读不了的文件、前后不一致都视为失败。
# 假 PID：服务 111；不属于本轮的监听进程 999（任何场景都不得被停止）。
# 用法（仓库根目录）：powershell -NoProfile -File docs\demo\v0.7.0\scripts\stub-check.ps1
$ErrorActionPreference = "Stop"
$root = (Get-Location).Path
$real = Join-Path $root "docs\demo\v0.7.0\screenshots"
$oldTemp = $env:TEMP; $oldTmp = $env:TMP; $iso = $null; $before = $null; $after = $null
$problems = New-Object System.Collections.Generic.List[string]
function Fail($msg) { $script:problems.Add($msg); "ASSERT FAIL: $msg" }
$snap = { param($dir) @(Get-ChildItem -LiteralPath $dir -Recurse -File -Force -ErrorAction Stop | Sort-Object FullName | ForEach-Object { (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256 -ErrorAction Stop).Hash + "  " + $_.FullName }) }
$ServerPid = 111; $ForeignPid = 999; $oldNode = (Get-Command node -CommandType Application).Source

try {
  if (-not (Test-Path -LiteralPath $real)) { throw "真实截图目录不存在：$real" }
  $before = @(& $snap $real)
  if ($before.Count -eq 0) { throw "真实截图目录为空（连 .gitkeep 都没有），无法证明替身没有触及它" }
  $iso = Join-Path ([IO.Path]::GetTempPath()) ("erp-stub-" + [guid]::NewGuid())
  New-Item -ItemType Directory $iso | Out-Null
  $env:TEMP = $iso; $env:TMP = $iso

  $readme = Get-Content (Join-Path $root "docs\demo\v0.7.0\README.md") -Raw -Encoding UTF8
  $sec = $readme.Substring($readme.IndexOf("## 4."))
  $m = [regex]::Match($sec, '(?s)```powershell\r?\n(.*?)```')
  if (-not $m.Success) { throw "README 第 4 节没有 powershell 块" }
  $block = [scriptblock]::Create($m.Groups[1].Value)

  # seed-orders 的真实脚本对假 HTTP 服务（回环临时端口）跑一遍，覆盖 AR 分支需要带收入科目的商品
  $seedOut = & $oldNode "$root\docs\demo\v0.7.0\scripts\seed-orders-stub.mjs" 2>&1
  $seedOut | ForEach-Object { "seed-orders-stub: $_" }
  if ($LASTEXITCODE -ne 0) { Fail "seed-orders 对假服务的运行失败（AR 分支或请求序列不符）" }

  $global:Calls = New-Object System.Collections.Generic.List[string]
  $global:Stopped = New-Object System.Collections.Generic.List[int]
  $global:Copied = 0; $global:Captures = 0; $global:SeedOrders = 0; $global:Nq = 0; $global:Sc = $null

  function npm {
    $global:Calls.Add("npm " + ($args -join " ")); $global:LASTEXITCODE = 0
    if ($args -contains "build") { $global:LASTEXITCODE = [int]$global:Sc.build }
  }
  function node {
    $global:Calls.Add("node " + ($args -join " "))
    $script = [string]$args[0]
    $global:LASTEXITCODE = 0
    if ($script -like "*seed-orders.mjs") { $global:SeedOrders++; $global:LASTEXITCODE = [int]$global:Sc.seedOrders }
    if ($script -like "*capture.mjs") {
      $global:Captures++
      $out = [string]$args[2]
      if (-not $out.StartsWith($iso)) { throw "替身拦截：capture 输出目录 $out 不在隔离目录内" }
      if ([string]$args[3] -ne [string](Get-Date).Year) { throw "替身拦截：capture 没收到财年参数" }
      New-Item -ItemType Directory -Force $out | Out-Null
      1..([int]$global:Sc.pngs) | ForEach-Object { New-Item -ItemType File -Force (Join-Path $out "stub-$_.png") | Out-Null }
      New-Item -ItemType File -Force (Join-Path $out "capture-log-main.json") | Out-Null
      $global:LASTEXITCODE = [int]$global:Sc.capture
    }
  }
  function Start-Process {
    $global:Calls.Add("Start-Process node (fake pid $ServerPid)")
    [pscustomobject]@{ Id = $ServerPid; HasExited = $false }
  }
  function Invoke-WebRequest {
    $url = [string]$args[0]
    $content = ""
    if ($url -like "*/trade/tradeParty*") { $content = $global:Sc.parties }
    if ($url -like "*/trade/orders*") { $content = $global:Sc.orders }
    [pscustomobject]@{ StatusCode = 200; Content = $content }
  }
  function Stop-Process { $global:Stopped.Add([int]$args[1]); $global:Calls.Add("Stop-Process " + ($args -join " ")) }
  function Copy-Item {
    $global:Copied++; $global:Calls.Add("Copy-Item " + ($args -join " "))
    if (($args -join " ") -notlike "*$iso*") { throw "替身拦截：Copy-Item 只记录，不应真正执行" }
  }
  function Get-NetTCPConnection {
    $q = $global:Sc.q; $i = $global:Nq; $global:Nq++
    if ($i -lt $q.Count -and $null -ne $q[$i]) { [pscustomobject]@{ OwningProcess = $q[$i] } }
  }

  $okParties = '[{"code":"PARTY"},{"code":"PARTY2"}]'
  $okOrders = '[{"orderId":"PO-F1"},{"orderId":"PO-F2"},{"orderId":"SO-F3"},{"orderId":"SO-F4"}]'
  $okQ = @($null, $ServerPid, $ServerPid, $null)
  $shortQ = @($null, $ServerPid, $null)   # 就绪清单或 seed 失败时不会做第三次端口查询，finally 里的那次是最后一次
  $base = @{ q = $okQ; build = 0; seedOrders = 0; capture = 0; pngs = 16; parties = $okParties; orders = $okOrders
    throws = $null; copied = 1; stopped = @($ServerPid); captures = 1; seedOrderCalls = 1 }
  function Variant($changes) { $h = $base.Clone(); foreach ($k in $changes.Keys) { $h[$k] = $changes[$k] }; $h }
  $scenarios = [ordered]@{
    "1 success" = Variant @{}
    "2 capture exit 3" = Variant @{ capture = 3; throws = "capture failed, exit 3"; copied = 0 }
    "3 build fails" = Variant @{ build = 1; throws = "构建失败"; copied = 0; stopped = @(); captures = 0; seedOrderCalls = 0 }
    "4 port busy at start" = Variant @{ q = @(4242, 4242); throws = "port busy"; copied = 0; stopped = @(); captures = 0; seedOrderCalls = 0 }
    "5 owner mismatch after start" = Variant @{ q = @($null, $ForeignPid, $null, $null); throws = "owner mismatch"; copied = 0; captures = 0; seedOrderCalls = 0 }
    "6 owner mismatch after seed" = Variant @{ q = @($null, $ServerPid, $ForeignPid, $null); throws = "owner mismatch after seed"; copied = 0; captures = 0 }
    "7 seed-orders fails" = Variant @{ q = $shortQ; seedOrders = 1; throws = "seed-orders"; copied = 0; captures = 0 }
    "8 readiness: order missing" = Variant @{ q = $shortQ; orders = '[{"orderId":"PO-F1"},{"orderId":"PO-F2"},{"orderId":"SO-F3"}]'; throws = "readiness: order SO-F4 missing"; copied = 0; captures = 0 }
    "9 readiness: partner missing" = Variant @{ q = $shortQ; parties = '[{"code":"PARTY"}]'; throws = "readiness: partner PARTY2 missing"; copied = 0; captures = 0 }
    "10 wrong screenshot count (15)" = Variant @{ pngs = 15; throws = "截图数"; copied = 0 }
  }
  foreach ($name in $scenarios.Keys) {
    $s = $scenarios[$name]
    $global:Sc = $s; $global:Calls.Clear(); $global:Stopped.Clear()
    $global:Copied = 0; $global:Captures = 0; $global:SeedOrders = 0; $global:Nq = 0
    "=== $name"
    $threw = $null
    try { . $block } catch { $threw = $_.Exception.Message }
    $left = @(Get-ChildItem $iso -Directory -Filter "erp-demo-*" -ErrorAction SilentlyContinue).Count
    $stoppedList = @($global:Stopped) -join ","
    "--- threw: $threw | Copy-Item: $global:Copied | seed-orders: $global:SeedOrders | capture: $global:Captures | Stop-Process pids: [$stoppedList] | leftover erp-demo-*: $left"
    if ($null -eq $s.throws) { if ($threw) { Fail "$name：不应抛错，实际：$threw" } }
    elseif (-not $threw -or $threw -notlike "*$($s.throws)*") { Fail "$name：应抛出 '$($s.throws)'，实际：$threw" }
    if ($global:Copied -ne $s.copied) { Fail "$name：Copy-Item 应 $($s.copied) 次，实际 $global:Copied" }
    if ($global:Captures -ne $s.captures) { Fail "$name：capture 应 $($s.captures) 次，实际 $global:Captures" }
    if ($global:SeedOrders -ne $s.seedOrderCalls) { Fail "$name：seed-orders 应 $($s.seedOrderCalls) 次，实际 $global:SeedOrders" }
    if ($stoppedList -ne (@($s.stopped) -join ",")) { Fail "$name：应停止 pid [$(@($s.stopped) -join ',')]，实际 [$stoppedList]" }
    if (@($global:Stopped) -contains $ForeignPid) { Fail "$name：停了不属于本轮的进程 $ForeignPid" }
    if ($left -ne 0) { Fail "$name：残留 erp-demo-* 目录 $left 个" }
  }
} catch {
  $problems.Add("替身或前置检查失败：" + $_.Exception.Message)
} finally {
  $env:TEMP = $oldTemp; $env:TMP = $oldTmp
  if ($iso -and (Split-Path $iso -Leaf) -like "erp-stub-*") { Remove-Item -Recurse -Force $iso }
  if ($null -ne $before) {
    try { $after = @(& $snap $real) } catch { $problems.Add("后置哈希失败（有文件读不了或目录消失）：" + $_.Exception.Message) }
  }
}
if ($null -ne $before -and $null -ne $after) {
  if (($before -join "`n") -ne ($after -join "`n")) { $problems.Add("真实截图目录的哈希在替身运行前后不一致（运行前 $($before.Count) 个，运行后 $($after.Count) 个）") }
  else { "=== isolation: real screenshot dir ($($before.Count) file(s) incl. hidden) SHA256 unchanged" }
}
if ($iso -and (Test-Path $iso)) { $problems.Add("隔离目录未删除") }
if ((git status --porcelain -- docs/demo/v0.7.0/screenshots)) { $problems.Add("真实截图目录出现 git 改动") }
if ($problems.Count -gt 0) { $problems | ForEach-Object { "PROBLEM: $_" }; "FAILED: $($problems.Count) problem(s)"; exit 1 }
"ALL ASSERTIONS PASSED (10 scenarios + seed-orders stub)"
