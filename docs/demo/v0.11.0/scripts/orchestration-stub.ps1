# 编排级替身检查（Demo v0.11.0，沿用 v0.10.0 的结构）：不启动真实服务、Chrome、Playwright、Vitest，不连账套，不碰真实截图目录。
# 在 erp-orch-<guid> 沙箱里放一套假的 npm / prepare / seed / main.ts / run-main 替身，然后：
#  A) 原样运行真实的 run-main.ps1（调用的命令是沙箱里的假命令），构造“进程 A 存活，但 4201 监听归进程 B”，
#     分别发生在 seed-trade 之后、seed-invoicing 之后、seed-sales 之后；断言各自以 owner mismatch before seed-invoicing / seed-sales / seed-detail 中止，后续 seed 没有执行。
#     对照 1：监听不换，run-main 走完。对照 2/3/4：run-main 副本去掉对应处的 PID 比较，同一场景下后续 seed 被执行（负例失效）。
#  B) 从 GitHub 渲染后的 README 取出真实服务演练块和取图块，在沙箱里实际执行，断言调用、产物与清理；
#     取图块做 dist 缺界面文案、dist 时间等于 HEAD 两个负例；再做 B7（成功 / exit 3 / 抛错 / 复制失败）日志完整性。
# 端口 4201 是 run-main 写死的（D373 例外）；开始前必须空闲，否则中止。用法（仓库根目录）：
#   powershell -NoProfile -File docs\demo\v0.11.0\scripts\orchestration-stub.ps1
$ErrorActionPreference = "Stop"
$root = (Get-Location).Path
$realRun = Join-Path $root "docs\demo\v0.11.0\scripts\run-main.ps1"
$readme = Join-Path $root "docs\demo\v0.11.0\README.md"
$realShots = Join-Path $root "docs\demo\v0.11.0\screenshots"
$snap = { param($dir) @(Get-ChildItem -LiteralPath $dir -Recurse -File -Force -ErrorAction Stop | Sort-Object FullName | ForEach-Object { (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256 -ErrorAction Stop).Hash + "  " + $_.Name }) }
$problems = New-Object System.Collections.Generic.List[string]
$oldTemp = $env:TEMP; $oldTmp = $env:TMP; $oldPath = $env:PATH; $iso = $null
$realBefore = @(& $snap $realShots)
if ($realBefore.Count -eq 0) { throw "真实截图目录为空，无法证明沙箱没有触及它" }
if (Get-NetTCPConnection -LocalPort 4201 -State Listen -ErrorAction SilentlyContinue) { throw "端口 4201 已被占用，不运行（run-main 写死 4201）" }
$utf8 = New-Object Text.UTF8Encoding $false
$put = { param($path, $text) New-Item -ItemType Directory -Force (Split-Path $path) | Out-Null; [IO.File]::WriteAllText($path, $text, $utf8) }

# 每个 seed 替身记一个 .ran 文件；HANDOFF=n 时第 n 个 seed 让进程 A 把监听交给 B 并等到 B 接手
function Seed-Stub { param($n, $ran) "import { writeFileSync } from `"node:fs`"; writeFileSync(process.env.SBX + `"\\$ran.ran`", `"1`");
const base = process.argv[2];
if (process.env.HANDOFF === `"$n`") {
  await fetch(base + `"/handoff`");
  for (let i = 0; i < 100; i++) {
    try { if ((await (await fetch(base + `"/who`")).text()) === `"B`") process.exit(0); } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  process.exit(1);
}" }

function New-Sandbox {
  param($name)
  $sb = Join-Path $iso $name
  New-Item -ItemType Directory $sb | Out-Null
  New-Item -ItemType Directory (Join-Path $sb "tmp"), (Join-Path $sb "bin") | Out-Null
  # 假 build：NO_UI=1 时 dist 缺“Invoice details”；index.html 时间固定为 2030-01-01Z；假 git 报告更早的 HEAD 时间，GIT_EQ=1 时与 index.html 相同
  & $put "$sb\bin\npm.cmd" "@echo off`r`necho npm %* >> `"%SBX%\calls.log`"`r`nif not `"%2`"==`"build`" exit /b 0`r`nmkdir `"%SBX%\packages\web\dist\assets`" 2>nul`r`npowershell -NoProfile -File `"%SBX%\bin\touch.ps1`"`r`nif `"%NO_UI%`"==`"1`" (echo No invoices match the filters.> `"%SBX%\packages\web\dist\assets\app.js`") else (echo Invoice details. No invoices match the filters.> `"%SBX%\packages\web\dist\assets\app.js`")`r`nexit /b 0`r`n"
  & $put "$sb\bin\touch.ps1" "Set-Content -LiteralPath `"`$env:SBX\packages\web\dist\index.html`" x; (Get-Item -LiteralPath `"`$env:SBX\packages\web\dist\index.html`").LastWriteTimeUtc = [datetime]::SpecifyKind([datetime]'2030-01-01', [DateTimeKind]::Utc)"
  & $put "$sb\bin\git.cmd" "@echo off`r`nif `"%GIT_EQ%`"==`"1`" (echo 2030-01-01T00:00:00+00:00) else (echo 2000-01-01T00:00:00+00:00)`r`n"
  & $put "$sb\docs\demo\v0.4.0\scripts\prepare.mjs" "process.exit(0);"
  & $put "$sb\docs\demo\v0.4.0\scripts\seed-trade.mjs" (Seed-Stub 1 "seed-trade")
  & $put "$sb\docs\demo\v0.10.0\scripts\seed-invoicing.mjs" (Seed-Stub 2 "seed-invoicing")
  & $put "$sb\docs\demo\v0.10.0\scripts\seed-sales.mjs" (Seed-Stub 3 "seed-sales")
  & $put "$sb\docs\demo\v0.11.0\scripts\seed-detail.mjs" (Seed-Stub 4 "seed-detail")
  $body = @'
const body = '{"items":[{"code":"DEFAULT"},{"code":"DEMO2"}]} "DEFAULT" "DEMO2" {"externalNo":"AP-D1-1"} {"externalNo":"AR-I1-1"} {"externalNo":"AP-EARLY-1"} {"externalNo":"BULK-102"}';
'@
  & $put "$sb\packages\infra\src\b.js" ("const http = require(`"http`"), fs = require(`"fs`");`nfs.writeFileSync(process.env.SBX + `"\\b.pid`", String(process.pid));`n" + $body + @'
const listen = () => {
  const s = http.createServer((q, r) => { r.setHeader("content-type", "text/plain"); r.end(q.url === "/who" ? "B" : body); });
  s.on("error", () => setTimeout(listen, 100));
  s.listen(+process.env.ERP_PORT, "127.0.0.1");
};
listen();
setInterval(() => {}, 1000);
'@)
  & $put "$sb\packages\infra\src\main.ts" ("const http = require(`"http`"), path = require(`"path`");`n" + $body + @'
const s = http.createServer((q, r) => {
  if (q.url === "/handoff") {
    r.end("ok");
    s.close();
    s.closeAllConnections();
    require("child_process").spawn(process.execPath, [path.join(__dirname, "b.js")], { stdio: "ignore", windowsHide: true, env: process.env });
    return;
  }
  r.setHeader("content-type", "text/plain");
  r.end(q.url === "/who" ? "A" : body);
});
s.listen(+process.env.ERP_PORT, "127.0.0.1");
setInterval(() => {}, 1000);
'@)
  $sb
}

function Stop-Leftovers {
  param($sb)
  $pidFile = "$sb\b.pid"
  if (Test-Path -LiteralPath $pidFile) {
    $bpid = [int](Get-Content -LiteralPath $pidFile)
    if (Get-Process -Id $bpid -ErrorAction SilentlyContinue) { Stop-Process -Id $bpid }
  }
}

function Invoke-Run {
  param($sb, $script, [string]$handoff, [string[]]$extra = @())
  $env:SBX = $sb; $env:HANDOFF = $handoff; $env:NO_UI = "0"
  $env:TEMP = "$sb\tmp"; $env:TMP = "$sb\tmp"; $env:PATH = "$sb\bin;" + $oldPath
  Push-Location $sb
  try {
    $ErrorActionPreference = "Continue"
    $out = (& powershell -NoProfile -File $script -Shots "$sb\tmp\shots-x" @extra 2>&1 | Out-String)
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = "Stop"
    Pop-Location
    $env:TEMP = $oldTemp; $env:TMP = $oldTmp; $env:PATH = $oldPath
    Stop-Leftovers $sb
  }
  @{ out = $out; code = $code }
}

try {
  $iso = Join-Path ([IO.Path]::GetTempPath()) ("erp-orch-" + [guid]::NewGuid())
  New-Item -ItemType Directory $iso | Out-Null
  $mainSrc = [IO.File]::ReadAllText($realRun, [Text.Encoding]::UTF8)

  "== A1 对照：监听不换，run-main 应走完 =="
  $sb = New-Sandbox "a1"
  $r = Invoke-Run $sb $realRun "0" @("-SkipCapture")
  if ($r.code -ne 0 -or $r.out -notmatch "capture skipped" -or $r.out -notmatch "readiness ok" -or -not (Test-Path "$sb\seed-invoicing.ran") -or -not (Test-Path "$sb\seed-sales.ran") -or -not (Test-Path "$sb\seed-detail.ran")) { $problems.Add("A1 对照应走完并执行四个 seed：退出 $($r.code)`n$($r.out)") }
  else { "A1 通过：退出 0，四个 seed 都执行，readiness 通过，端口释放：" + ($r.out -match "port 4201 released") }

  # 三处检查：handoff 编号、被拦的 seed、已执行的 seed、去掉 PID 比较用的 needle
  $cases = @(
    @{ id = "A2"; h = "1"; stop = "seed-invoicing"; ran = "seed-trade"; later = @("seed-invoicing", "seed-sales", "seed-detail") },
    @{ id = "A4"; h = "2"; stop = "seed-sales"; ran = "seed-invoicing"; later = @("seed-sales", "seed-detail") },
    @{ id = "A6"; h = "3"; stop = "seed-detail"; ran = "seed-sales"; later = @("seed-detail") }
  )
  foreach ($c in $cases) {
    "== $($c.id) 真实 run-main：监听换成 B，应在 $($c.stop) 之前中止 =="
    $sb = New-Sandbox $c.id.ToLower()
    $r = Invoke-Run $sb $realRun $c.h @("-SkipCapture")
    $r.out.Trim()
    if ($r.code -eq 0) { $problems.Add("$($c.id) 应非零退出") }
    if ($r.out -notmatch "owner mismatch before $($c.stop)") { $problems.Add("$($c.id) 没有因 owner mismatch before $($c.stop) 中止") }
    if (-not (Test-Path "$sb\$($c.ran).ran")) { $problems.Add("$($c.id) $($c.ran) 替身没有执行，场景不成立") }
    foreach ($l in $c.later) { if (Test-Path "$sb\$l.ran") { $problems.Add("$($c.id) $l 被执行了，后续步骤没有被拦住") } }
    if (-not (Test-Path "$sb\b.pid")) { $problems.Add("$($c.id) 进程 B 没有出现，场景不成立") }
    else { "$($c.id) 通过：中止信息 owner mismatch before $($c.stop)；$($c.ran) 执行、后续 seed 未执行；B pid " + (Get-Content "$sb\b.pid") }

    "== $($c.id) 对照：run-main 副本去掉该处 PID 比较，同一场景应放行（负例失效） =="
    $needle = '-or $owner[0] -ne $server.Id){throw "owner mismatch before ' + $c.stop + '"}'
    if (-not $mainSrc.Contains($needle)) { throw "$($c.id)：run-main.ps1 里找不到要改的检查，副本不成立" }
    $sb = New-Sandbox ($c.id.ToLower() + "ctl")
    $mut = "$sb\run-main-nopid.ps1"
    & $put $mut $mainSrc.Replace($needle, '){throw "owner mismatch before ' + $c.stop + '"}')
    $r = Invoke-Run $sb $mut $c.h @("-SkipCapture")
    if (-not (Test-Path "$sb\$($c.stop).ran")) { $problems.Add("$($c.id) 去掉 PID 比较后 $($c.stop) 仍没有执行，说明负例不依赖 PID 比较") }
    else { "$($c.id) 对照通过：去掉 PID 比较后 $($c.stop) 被执行了（这个负例此时失败），退出 $($r.code)" }
  }

  "== B 渲染结果里的真实服务演练块和取图块 =="
  $html = (& gh api -X POST markdown -f mode=gfm -F text=@$readme | Out-String)
  $pre = [regex]::Matches($html, '<pre.*?</pre>', "Singleline")
  if ($pre.Count -lt 6) { throw "README 渲染后只有 $($pre.Count) 个代码块" }
  $texts = @($pre | ForEach-Object { [Net.WebUtility]::HtmlDecode([regex]::Replace($_.Value, '<[^>]+>', '')).Trim() })
  $found3 = @($texts | Where-Object { $_ -match 'run-main\.ps1 -Shots \$shots -SkipCapture' -and $_ -notmatch "npm run build" })
  $found6 = @($texts | Where-Object { $_ -match "npm run build" -and $_ -match "run-main\.ps1" })
  if ($found3.Count -ne 1 -or $found6.Count -ne 1) { throw "渲染结果里按内容找不到唯一的真实服务演练块或取图块（演练 $($found3.Count)，取图 $($found6.Count)）" }
  $b3 = $found3[0]; $b6 = $found6[0]
  "取到的块：真实服务演练块序号 $([array]::IndexOf($texts, $b3) + 1)，取图块序号 $([array]::IndexOf($texts, $b6) + 1)（共 $($texts.Count) 块）"
  $runStub = @'
param([Parameter(Mandatory)][string]$Shots, [switch]$SkipCapture)
"run-main stub: Shots=$Shots SkipCapture=$($SkipCapture.IsPresent)" | Add-Content "$env:SBX\calls.log"
if ($Shots -notlike "*demo-s11-shots-*") { throw "Shots 目录名不对" }
$mode = $env:RUNMODE
"STDOUT-BEFORE"
if ($mode -in @("fail3", "stderr-ok")) { cmd /c "echo NATIVE-STDERR 1>&2" }
"STDOUT-AFTER-STDERR"
if ($mode -eq "throw") { throw "owner mismatch stub" }
if (-not $SkipCapture) {
  New-Item -ItemType Directory -Force $Shots | Out-Null
  $count = if ($mode -eq "fail3") { 5 } else { 32 }
  1..$count | ForEach-Object { [IO.File]::WriteAllText("$Shots\shot-$_.png", "png-$_") }
}
if ($mode -eq "fail3") { exit 3 }
'@
  $shotDir = "docs\demo\v0.11.0\screenshots"
  $runBlock = {
    param($name, $text, $noUi, $gitEq = "0", $mode = "ok")
    $sb = New-Sandbox $name
    & $put "$sb\docs\demo\v0.11.0\scripts\run-main.ps1" $runStub
    & $put "$sb\$shotDir\.gitkeep" ""
    if ($mode -eq "copyfail") { New-Item -ItemType Directory "$sb\$shotDir\shot-3.png" | Out-Null }
    [IO.File]::WriteAllText("$sb\block.ps1", $text, (New-Object Text.UTF8Encoding $true))
    $env:RUNMODE = $mode; $env:SBX = $sb; $env:NO_UI = $noUi; $env:GIT_EQ = $gitEq; $env:TEMP = "$sb\tmp"; $env:TMP = "$sb\tmp"; $env:PATH = "$sb\bin;" + $oldPath
    Push-Location $sb
    try { $ErrorActionPreference = "Continue"; $o = (& powershell -NoProfile -File "$sb\block.ps1" 2>&1 | Out-String); $c = $LASTEXITCODE } finally { $ErrorActionPreference = "Stop"; Pop-Location; $env:TEMP = $oldTemp; $env:TMP = $oldTmp; $env:PATH = $oldPath }
    @{ sb = $sb; out = $o; code = $c; calls = $(if (Test-Path "$sb\calls.log") { Get-Content "$sb\calls.log" -Raw } else { "" }) }
  }
  $pngsIn = { param($r) @(Get-ChildItem "$($r.sb)\$shotDir" -File -Filter *.png -ErrorAction SilentlyContinue).Count }
  $shotsLeft = { param($r) @(Get-ChildItem "$($r.sb)\tmp" -Directory -Filter "demo-s11-shots-*" -ErrorAction SilentlyContinue).Count }
  $shotsPngs = { param($r) @(Get-ChildItem "$($r.sb)\tmp" -Directory -Filter "demo-s11-shots-*" -ErrorAction SilentlyContinue | ForEach-Object { Get-ChildItem $_.FullName -File -Filter *.png }).Count }
  $logOf = { param($r) @(Get-ChildItem "$($r.sb)\tmp" -Filter "demo-s11-shots-*.run.log" -ErrorAction SilentlyContinue | ForEach-Object { Get-Content -Raw -Encoding UTF8 $_.FullName }) -join "`n" }

  $r = & $runBlock "b3" $b3 "0"
  if ($r.code -ne 0 -or $r.calls -notmatch "SkipCapture=True" -or $r.calls -match "npm run build") { $problems.Add("B3 真实服务演练块执行结果不符：退出 $($r.code)`n$($r.calls)`n$($r.out)") }
  else { "B3 通过：真实服务演练块在沙箱里执行，退出 0，替身 run-main 被带 -SkipCapture 调用，没有 build" }

  $r = & $runBlock "b6" $b6 "0"
  if ($r.code -ne 0 -or $r.calls -notmatch "npm run build" -or $r.calls -notmatch "SkipCapture=False" -or (& $pngsIn $r) -ne 32 -or (& $shotsLeft $r) -ne 0) { $problems.Add("B6 取图块执行结果不符：退出 $($r.code)，复制 $(& $pngsIn $r) 张，残留目录 $(& $shotsLeft $r)`n$($r.calls)`n$($r.out)") }
  else { "B6 通过：取图块在沙箱里执行，退出 0；build 先于 run-main 替身（不带 -SkipCapture）；32 张复制到沙箱截图目录；shots 临时目录已清" }

  $r = & $runBlock "b6neg" $b6 "1"
  if ($r.code -eq 0 -or $r.out -notmatch "dist 里没有" -or $r.calls -match "run-main stub" -or (& $pngsIn $r) -ne 0) { $problems.Add("B6 负例（dist 缺界面文案）应中止且不调用 run-main：退出 $($r.code)`n$($r.calls)`n$($r.out)") }
  else { "B6 负例通过：dist 缺 Invoice details，取图块因 dist 断言中止（退出 $($r.code)，输出含[dist 里没有]），run-main 替身没有被调用，没有复制截图" }
  $r = & $runBlock "b6eq" $b6 "0" "1"
  if ($r.code -eq 0 -or $r.out -notmatch "不晚于 HEAD" -or $r.calls -match "run-main stub" -or (& $pngsIn $r) -ne 0) { $problems.Add("B6 负例（dist 时间等于 HEAD）应中止且不调用 run-main：退出 $($r.code)`n$($r.calls)`n$($r.out)") }
  else { "B6 负例通过：dist 时间与 HEAD 提交时间相等，取图块因严格晚于断言中止（退出 $($r.code)，输出含[不晚于 HEAD]），run-main 替身没有被调用，没有复制截图" }

  $r = & $runBlock "b7ok" $b6 "0" "0" "stderr-ok"
  $lg = & $logOf $r
  if ($r.code -ne 0 -or $lg -notmatch "STDOUT-BEFORE" -or $lg -notmatch "NATIVE-STDERR" -or $lg -notmatch "STDOUT-AFTER-STDERR" -or $lg -notmatch "exit=0 ok=True" -or (& $pngsIn $r) -ne 32 -or (& $shotsLeft $r) -ne 0) { $problems.Add("B7 成功路径不符：退出 $($r.code)`n$lg") }
  else { "B7 成功通过：stdout、原生 stderr、其后的 stdout 三段都在日志里，exit=0；复制 32 张，shots 目录已清，日志保留" }

  $r = & $runBlock "b7fail" $b6 "0" "0" "fail3"
  $lg = & $logOf $r
  if ($r.code -eq 0 -or $lg -notmatch "NATIVE-STDERR" -or $lg -notmatch "STDOUT-AFTER-STDERR" -or $lg -notmatch "EXCEPTION:.*run-main 退出码 3" -or $lg -notmatch "exit=3 ok=False" -or (& $pngsIn $r) -ne 0 -or (& $shotsLeft $r) -ne 1) { $problems.Add("B7 失败路径（exit 3）不符：退出 $($r.code)`n$lg") }
  else { "B7 失败通过：原生 stderr 之后的 stdout 仍落盘；日志记 EXCEPTION 与实际退出码 exit=3；块以失败退出；不复制截图；shots 目录保留（含已写出的 5 张）" }

  $r = & $runBlock "b7throw" $b6 "0" "0" "throw"
  $lg = & $logOf $r
  if ($r.code -eq 0 -or $lg -notmatch "STDOUT-BEFORE" -or $lg -notmatch "EXCEPTION:.*owner mismatch stub" -or $lg -notmatch "exit=1 ok=False" -or (& $pngsIn $r) -ne 0) { $problems.Add("B7 runner 抛错路径不符：退出 $($r.code)`n$lg") }
  else { "B7 抛错通过：runner 抛错的原始异常和 exit=1 落盘；块失败退出；不复制截图" }

  $r = & $runBlock "b7copy" $b6 "0" "0" "copyfail"
  $lg = & $logOf $r
  if ($r.code -eq 0 -or $lg -match "ok=True" -or $lg -notmatch "EXCEPTION:" -or $lg -notmatch "ok=False" -or (& $shotsLeft $r) -ne 1 -or (& $shotsPngs $r) -ne 32) { $problems.Add("B7 复制失败路径不符：退出 $($r.code)，shots 目录 $(& $shotsLeft $r)，原图 $(& $shotsPngs $r)`n$lg") }
  else { "B7 复制失败通过：Copy-Item 失败进入 catch，日志 ok=False 且有 EXCEPTION；块失败退出；shots 目录保留，32 张原图未删" }
} catch {
  $problems.Add("编排替身运行失败：" + $_.Exception.Message)
} finally {
  $env:TEMP = $oldTemp; $env:TMP = $oldTmp; $env:PATH = $oldPath
  if ($iso -and (Split-Path $iso -Leaf) -like "erp-orch-*" -and (Test-Path -LiteralPath $iso)) { Remove-Item -Recurse -Force $iso }
}
if (Get-NetTCPConnection -LocalPort 4201 -State Listen -ErrorAction SilentlyContinue) { $problems.Add("结束时端口 4201 仍在监听") }
$realAfter = @(& $snap $realShots)
if (($realBefore -join "`n") -ne ($realAfter -join "`n")) { $problems.Add("真实截图目录前后不一致") }
if ($problems.Count -gt 0) { $problems | ForEach-Object { "PROBLEM: $_" }; exit 1 }
"编排替身检查全部通过；端口 4201 已空闲；真实截图目录未变：$($realBefore.Count) 个文件"
