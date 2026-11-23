# PROC-05 固定负例组第 1-5、7 项的实际运行（Demo v0.11.0）。不启动 Chrome、Playwright、Vitest，不连真实账套。第 6 项（从渲染文档复制）由 orchestration-stub.ps1 的 B 段覆盖。
# 每个夹具都在 erp-p5-<guid> 专用临时目录里造数据；检查函数与 stub-check.ps1 同一写法（SHA256，含隐藏文件，读不了就失败，空目录和缺失都报）。
# 第 1-5 项的预期是“检查被判失败（FAIL）/被拦住”；预期的失败出现才算该项通过，没出现或出现别的原因都算整体失败。
# 第 7 项在 Windows PowerShell 5.1 子进程里运行：Copy-Item 的源与目标是同一文件（非终止 CopyError）。不带 -ErrorAction Stop 时继续执行并把 ok 设为真（缺陷对照）；带 Stop 时进入 catch、退出码非零、ok 不为真、源文件仍在。
# 用法（仓库根目录）：powershell -NoProfile -File docs\demo\v0.11.0\scripts\proc05-negatives.ps1
$ErrorActionPreference = "Stop"
$root = (Get-Location).Path
$real = Join-Path $root "docs\demo\v0.11.0\screenshots"
$snap = { param($dir) @(Get-ChildItem -LiteralPath $dir -Recurse -File -Force -ErrorAction Stop | Sort-Object FullName | ForEach-Object { (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256 -ErrorAction Stop).Hash + "  " + $_.Name }) }
# 返回 @{ ok; why }：空快照、缺失、变化、新增、读不了都不通过
$verify = {
  param($dir, $before)
  try { $after = @(& $snap $dir) } catch { return @{ ok = $false; why = "读不了：" + $_.Exception.GetType().Name } }
  if ($after.Count -eq 0) { return @{ ok = $false; why = "缺失：目录现在是空的（运行前 $($before.Count) 个文件）" } }
  $missing = @($before | Where-Object { $after -notcontains $_ }).Count
  $added = @($after | Where-Object { $before -notcontains $_ }).Count
  if ($missing -gt 0 -or $added -gt 0) { return @{ ok = $false; why = "不一致：缺失或变化 $missing 个，新增 $added 个" } }
  return @{ ok = $true; why = "未变" }
}
$problems = New-Object System.Collections.Generic.List[string]
$results = New-Object System.Collections.Generic.List[string]
$iso = Join-Path ([IO.Path]::GetTempPath()) ("erp-p5-" + [guid]::NewGuid())
$realBefore = @(& $snap $real)
if ($realBefore.Count -eq 0) { throw "真实截图目录为空，无法证明夹具没有触及它" }
$expectFail = {
  param($name, $got, $needle)
  if ($got.ok) { $problems.Add("$name：预期判失败，实际通过") }
  elseif (-not $got.why.Contains($needle)) { $problems.Add("$name：失败原因不是预期的 [$needle]：$($got.why)") }
  else { $results.Add("$name -> FAIL（预期）：$($got.why)") }
}
try {
  New-Item -ItemType Directory $iso | Out-Null
  $dir = { param($n) $d = Join-Path $iso $n; New-Item -ItemType Directory $d | Out-Null; $d }
  $fill = { param($d, $names) foreach ($f in $names) { [IO.File]::WriteAllText((Join-Path $d $f), "content-$f") } }

  # 第 1 项 a：初始就是空目录。空快照不能当“没变”
  $d = & $dir "p1a"
  $b = @(& $snap $d)
  $r = & $verify $d $b
  & $expectFail "第1项a 初始空目录" $r "缺失"

  # 第 1 项 b：非空目录被删光，脚本正常返回
  $d = & $dir "p1b"; & $fill $d @("a.png", "b.png", "c.png")
  $b = @(& $snap $d)
  $script = { param($x) Get-ChildItem -LiteralPath $x -File -Force | Remove-Item -Force }
  & $script $d
  $r = & $verify $d $b
  & $expectFail "第1项b 删光后正常返回" $r "缺失"

  # 第 2 项：隐藏文件被计入，只改隐藏文件也能发现
  $d = & $dir "p2"; & $fill $d @("a.png", ".gitkeep")
  (Get-Item -LiteralPath (Join-Path $d ".gitkeep") -Force).Attributes = "Hidden"
  $b = @(& $snap $d)
  if (@($b | Where-Object { $_.EndsWith(".gitkeep") }).Count -ne 1) { $problems.Add("第2项：隐藏文件没有被计入快照") }
  (Get-Item -LiteralPath (Join-Path $d ".gitkeep") -Force).Attributes = "Normal"
  [IO.File]::WriteAllText((Join-Path $d ".gitkeep"), "changed")
  (Get-Item -LiteralPath (Join-Path $d ".gitkeep") -Force).Attributes = "Hidden"
  & $expectFail "第2项 只改隐藏文件" (& $verify $d $b) "不一致"

  # 第 3 项：独占锁住的文件必须失败，不能静默跳过
  $d = & $dir "p3"; & $fill $d @("a.png", "locked.png")
  $b = @(& $snap $d)
  $lock = [IO.File]::Open((Join-Path $d "locked.png"), "Open", "ReadWrite", "None")
  try { $r = & $verify $d $b } finally { $lock.Dispose() }
  & $expectFail "第3项 独占锁文件" $r "读不了"

  # 第 4 项：运行中途抛错，finally 里的后置检查照常运行，原始异常和检查结果都被报告；含“删光再抛错”
  $d = & $dir "p4"; & $fill $d @("a.png", "b.png")
  $b = @(& $snap $d)
  $original = $null; $post = $null; $finallyRan = $false
  try {
    Get-ChildItem -LiteralPath $d -File -Force | Remove-Item -Force
    throw "模拟脚本中途抛错"
  } catch { $original = $_.Exception.Message } finally { $finallyRan = $true; $post = & $verify $d $b }
  if (-not $finallyRan) { $problems.Add("第4项：finally 没有运行") }
  elseif ($original -ne "模拟脚本中途抛错") { $problems.Add("第4项：原始异常丢失") }
  else { & $expectFail "第4项 删光后抛错（原始异常：$original）" $post "缺失" }

  # 第 5 项：监听端口的归属在两步之间变了，第二步前的独立检查要拦住，第二步不运行（检查表达式与 run-main.ps1 的 owner mismatch 检查相同）
  $node = (Get-Command node -CommandType Application).Source
  $tcp = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 0); $tcp.Start(); $port = $tcp.LocalEndpoint.Port; $tcp.Stop()
  $listen = "require('http').createServer().listen($port,'127.0.0.1');setTimeout(()=>{},60000)"
  $server = Start-Process $node -ArgumentList @("-e", $listen) -PassThru -WindowStyle Hidden
  $other = $null; $step2 = Join-Path $iso "step2-ran.txt"
  try {
    Start-Sleep 2
    $owner = @((Get-NetTCPConnection -LocalPort $port -State Listen).OwningProcess)
    if ($owner.Count -ne 1 -or $owner[0] -ne $server.Id) { $problems.Add("第5项：前置检查应通过，实际 owner mismatch") }
    Stop-Process -Id $server.Id
    $server.WaitForExit()
    $other = Start-Process $node -ArgumentList @("-e", $listen) -PassThru -WindowStyle Hidden
    Start-Sleep 2
    $caught = $null
    try {
      $owner = @((Get-NetTCPConnection -LocalPort $port -State Listen).OwningProcess)
      if ($server.HasExited -or $owner.Count -ne 1 -or $owner[0] -ne $server.Id) { throw "owner mismatch before step 2" }
      [IO.File]::WriteAllText($step2, "step 2 ran")
    } catch { $caught = $_.Exception.Message }
    if ($caught -ne "owner mismatch before step 2") { $problems.Add("第5项：归属变化没有被拦住：$caught") }
    elseif (Test-Path -LiteralPath $step2) { $problems.Add("第5项：被拦住后第二步仍然运行了") }
    else { $results.Add("第5项 端口归属变化 -> 拦住（预期）：$caught；第二步未运行（标记文件不存在）") }
  } finally {
    if ($other -and -not $other.HasExited) { Stop-Process -Id $other.Id }
    if (-not $server.HasExited) { Stop-Process -Id $server.Id }
  }

  # 第 7 项：Copy-Item 源与目标是同一文件（PS 5.1 的非终止 CopyError），在 Windows PowerShell 5.1 子进程里对照运行
  $d = & $dir "p7"; & $fill $d @("a.png")
  $src = Join-Path $d "a.png"
  $hashSrc = (Get-FileHash -LiteralPath $src -Algorithm SHA256 -ErrorAction Stop).Hash
  $blockText = @'
param([string]$File, [string]$Mode)
$ok = $false; $code = 0
$ErrorActionPreference = "Continue"
try {
  if ($Mode -eq "stop") { Copy-Item -LiteralPath $File -Destination $File -ErrorAction Stop } else { Copy-Item -LiteralPath $File -Destination $File }
  $ok = $true
} catch { $code = 1; "CAUGHT: $($_.Exception.Message)" }
"ok=$ok"
exit $code
'@
  $blockPath = Join-Path $iso "p7-block.ps1"
  [IO.File]::WriteAllText($blockPath, $blockText, (New-Object Text.UTF8Encoding $true))
  $outFile = Join-Path $iso "p7.out"; $errFile = Join-Path $iso "p7.err"
  $runBlock = {
    param($mode)
    $p = Start-Process "powershell.exe" -ArgumentList @("-NoProfile", "-File", $blockPath, $src, $mode) -Wait -PassThru -WindowStyle Hidden -RedirectStandardOutput $outFile -RedirectStandardError $errFile
    @{ code = $p.ExitCode; out = ((Get-Content -Raw -LiteralPath $outFile -ErrorAction Stop) + (Get-Content -Raw -LiteralPath $errFile -ErrorAction Stop)) }
  }
  $plain = & $runBlock "plain"
  $stop = & $runBlock "stop"
  $stillThere = (Test-Path -LiteralPath $src) -and ((Get-FileHash -LiteralPath $src -Algorithm SHA256 -ErrorAction Stop).Hash -eq $hashSrc)
  if ($plain.code -ne 0 -or $plain.out -notmatch "ok=True" -or $plain.out -notmatch "CopyError|same|相同|identical|cannot be overwritten") { $problems.Add("第7项对照（不带 Stop）应报错但继续执行并 ok=True、退出 0：退出 $($plain.code)`n$($plain.out)") }
  else { $results.Add("第7项 不带 -ErrorAction Stop（缺陷对照）-> 报错后继续，ok=True，退出 $($plain.code)") }
  if ($stop.code -eq 0 -or $stop.out -notmatch "CAUGHT:" -or $stop.out -notmatch "ok=False" -or -not $stillThere) { $problems.Add("第7项修正版（带 Stop）应进入 catch、ok=False、退出非零、源文件仍在：退出 $($stop.code)，源文件在 $stillThere`n$($stop.out)") }
  else { $results.Add("第7项 带 -ErrorAction Stop（修正版）-> 进入 catch，ok=False，退出 $($stop.code)，源文件仍在且哈希未变") }
} catch {
  $problems.Add("夹具运行失败：" + $_.Exception.Message)
} finally {
  if ((Split-Path $iso -Leaf) -like "erp-p5-*" -and (Test-Path -LiteralPath $iso)) { Remove-Item -Recurse -Force $iso }
}
$realAfter = @(& $snap $real)
if (($realBefore -join "`n") -ne ($realAfter -join "`n")) { $problems.Add("真实截图目录前后不一致") }
$results | ForEach-Object { $_ }
if ($problems.Count -gt 0) { $problems | ForEach-Object { "PROBLEM: $_" }; exit 1 }
"第 1-5、7 项负例都按预期失败/被拦住；真实截图目录未变：$($realBefore.Count) 个文件（含隐藏文件）"
