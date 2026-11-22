# 编排级替身检查（Demo v0.10.0，#174 复审）：不启动真实服务、Chrome、Playwright、Vitest，不连账套，不碰真实截图目录。
# 在 erp-orch-<guid> 沙箱里放一套假的 npm / prepare / seed / main.ts / run-main 替身，然后：
#  A) 原样运行真实的 run-main.ps1（只是它调用的命令是沙箱里的假命令），构造“进程 A 存活，但 4201 端口监听归进程 B”：
#     A 存活且 HasExited 为假，只有 PID 比较能发现；断言 run-main 以“owner mismatch before seed-invoicing”中止、seed-invoicing 没有执行。
#     对照 1：不换监听（A 一直是监听者）时 run-main 走完，说明替身编排本身可用。
#     对照 2：把 run-main 副本里那处检查的 PID 比较去掉，同一场景下 seed-invoicing 被执行了（负例失效），证明 PID 比较是必需的。
#  B) 从 GitHub 渲染后的 README 取出真实服务演练块和取图块，在沙箱里实际执行，断言它们的调用、产物与清理；
#     取图块再做一个 dist 缺筛选条文案（No invoices match the filters）的负例：必须中止，run-main 替身没有被调用。
# 端口 4201 是 run-main 写死的；开始前必须空闲，否则中止。用法（仓库根目录）：
#   powershell -NoProfile -File docs\demo\v0.10.0\scripts\orchestration-stub.ps1
$ErrorActionPreference = "Stop"
$root = (Get-Location).Path
$realRun = Join-Path $root "docs\demo\v0.10.0\scripts\run-main.ps1"
$readme = Join-Path $root "docs\demo\v0.10.0\README.md"
$realShots = Join-Path $root "docs\demo\v0.10.0\screenshots"
$snap = { param($dir) @(Get-ChildItem -LiteralPath $dir -Recurse -File -Force -ErrorAction Stop | Sort-Object FullName | ForEach-Object { (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256 -ErrorAction Stop).Hash + "  " + $_.Name }) }
$problems = New-Object System.Collections.Generic.List[string]
$oldTemp = $env:TEMP; $oldTmp = $env:TMP; $oldPath = $env:PATH; $iso = $null
$realBefore = @(& $snap $realShots)
if ($realBefore.Count -eq 0) { throw "真实截图目录为空，无法证明沙箱没有触及它" }
if (Get-NetTCPConnection -LocalPort 4201 -State Listen -ErrorAction SilentlyContinue) { throw "端口 4201 已被占用，不运行（run-main 写死 4201）" }
$utf8 = New-Object Text.UTF8Encoding $false
$put = { param($path, $text) New-Item -ItemType Directory -Force (Split-Path $path) | Out-Null; [IO.File]::WriteAllText($path, $text, $utf8) }

function New-Sandbox {
  param($name)
  $sb = Join-Path $iso $name
  New-Item -ItemType Directory $sb | Out-Null
  New-Item -ItemType Directory (Join-Path $sb "tmp"), (Join-Path $sb "bin") | Out-Null
  & $put "$sb\bin\npm.cmd" "@echo off`r`necho npm %* >> `"%SBX%\calls.log`"`r`nif not `"%2`"==`"build`" exit /b 0`r`nmkdir `"%SBX%\packages\web\dist\assets`" 2>nul`r`npowershell -NoProfile -File `"%SBX%\bin\touch.ps1`"`r`nif `"%NO_FROMORDER%`"==`"1`" (echo Accounting date from> `"%SBX%\packages\web\dist\assets\app.js`") else (echo No invoices match the filters. Accounting date from> `"%SBX%\packages\web\dist\assets\app.js`")`r`nexit /b 0`r`n"
  # 假 build 把 index.html 的时间固定为 2030-01-01Z；假 git 报告更早的 HEAD 时间，GIT_EQ=1 时报告与 index.html 相同的时间
  & $put "$sb\bin\touch.ps1" "Set-Content -LiteralPath `"`$env:SBX\packages\web\dist\index.html`" x; (Get-Item -LiteralPath `"`$env:SBX\packages\web\dist\index.html`").LastWriteTimeUtc = [datetime]::SpecifyKind([datetime]'2030-01-01', [DateTimeKind]::Utc)"
  & $put "$sb\bin\git.cmd" "@echo off`r`nif `"%GIT_EQ%`"==`"1`" (echo 2030-01-01T00:00:00+00:00) else (echo 2000-01-01T00:00:00+00:00)`r`n"
  & $put "$sb\docs\demo\v0.4.0\scripts\prepare.mjs" "process.exit(0);"
  & $put "$sb\docs\demo\v0.4.0\scripts\seed-trade.mjs" @'
import { writeFileSync } from "node:fs";
const base = process.argv[2];
writeFileSync(process.env.SBX + "\\seed-trade.ran", "1");
if (process.env.HANDOFF === "1") {
  await fetch(base + "/handoff");
  for (let i = 0; i < 100; i++) {
    try { if ((await (await fetch(base + "/who")).text()) === "B") process.exit(0); } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  process.exit(1);
}
'@
  & $put "$sb\docs\demo\v0.10.0\scripts\seed-invoicing.mjs" 'import { writeFileSync } from "node:fs"; writeFileSync(process.env.SBX + "\\seed-invoicing.ran", "1");
const base = process.argv[2];
if (process.env.HANDOFF === "2") {
  await fetch(base + "/handoff");
  for (let i = 0; i < 100; i++) {
    try { if ((await (await fetch(base + "/who")).text()) === "B") process.exit(0); } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  process.exit(1);
}'
  & $put "$sb\docs\demo\v0.10.0\scripts\seed-sales.mjs" 'import { writeFileSync } from "node:fs"; writeFileSync(process.env.SBX + "\\seed-sales.ran", "1");'
  & $put "$sb\packages\infra\src\b.js" @'
const http = require("http"), fs = require("fs");
fs.writeFileSync(process.env.SBX + "\\b.pid", String(process.pid));
const body = '"PARTY" "PO-I1" "PO-I2" "PO-I3" "SO-I1" "SO-I2" "side":"AR" "invoicing":"none" "invoicing":"partial" "invoicing":"full" "orderId":"PO-I1" "orderId":"PO-I2" "orderId":"SO-I1" "orderId":"SO-I2"';
const listen = () => {
  const s = http.createServer((q, r) => { r.setHeader("content-type", "text/plain"); r.end(q.url === "/who" ? "B" : body); });
  s.on("error", () => setTimeout(listen, 100));
  s.listen(+process.env.ERP_PORT, "127.0.0.1");
};
listen();
setInterval(() => {}, 1000);
'@
  & $put "$sb\packages\infra\src\main.ts" @'
const http = require("http"), path = require("path");
const body = '"PARTY" "PO-I1" "PO-I2" "PO-I3" "SO-I1" "SO-I2" "side":"AR" "invoicing":"none" "invoicing":"partial" "invoicing":"full" "orderId":"PO-I1" "orderId":"PO-I2" "orderId":"SO-I1" "orderId":"SO-I2"';
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
'@
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
  param($sb, $script, [string]$handoff, [string[]]$extra = @(), $noFromOrder = "0")
  $env:SBX = $sb; $env:HANDOFF = $handoff; $env:NO_FROMORDER = $noFromOrder
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
  if ($r.code -ne 0 -or $r.out -notmatch "capture skipped" -or -not (Test-Path "$sb\seed-invoicing.ran") -or -not (Test-Path "$sb\seed-sales.ran")) { $problems.Add("A1 对照应走完并执行 seed-invoicing 与 seed-sales：退出 $($r.code)`n$($r.out)") }
  else { "A1 通过：退出 0，seed-trade、seed-invoicing、seed-sales 都执行，端口释放：" + ($r.out -match "port 4201 released") }

  "== A2 真实 run-main：A 存活，监听换成 B，应在 seed-invoicing 之前中止 =="
  $sb = New-Sandbox "a2"
  $r = Invoke-Run $sb $realRun "1" @("-SkipCapture")
  $r.out.Trim()
  if ($r.code -eq 0) { $problems.Add("A2 应非零退出") }
  if ($r.out -notmatch "owner mismatch before seed-invoicing") { $problems.Add("A2 没有因 owner mismatch before seed-invoicing 中止") }
  if (-not (Test-Path "$sb\seed-trade.ran")) { $problems.Add("A2 seed-trade 替身没有执行，场景不成立") }
  if (Test-Path "$sb\seed-invoicing.ran") { $problems.Add("A2 seed-invoicing 被执行了，后续步骤没有被拦住") }
  if (Test-Path "$sb\seed-sales.ran") { $problems.Add("A2 seed-sales 被执行了，后续步骤没有被拦住") }
  if (-not (Test-Path "$sb\b.pid")) { $problems.Add("A2 进程 B 没有出现，场景不成立") }
  else { "A2 通过：中止信息 owner mismatch before seed-invoicing；seed-trade 执行、seed-invoicing 未执行；B pid " + (Get-Content "$sb\b.pid") }

  "== A3 对照：run-main 副本去掉该处 PID 比较，同一场景应放行（负例失效） =="
  $needle = '-or $owner[0] -ne $server.Id){throw "owner mismatch before seed-invoicing"}'
  if (-not $mainSrc.Contains($needle)) { throw "A3：run-main.ps1 里找不到要改的检查，副本不成立" }
  $sb = New-Sandbox "a3"
  $mut = "$sb\run-main-nopid.ps1"
  & $put $mut $mainSrc.Replace($needle, '){throw "owner mismatch before seed-invoicing"}')
  $r = Invoke-Run $sb $mut "1" @("-SkipCapture")
  if (-not (Test-Path "$sb\seed-invoicing.ran")) { $problems.Add("A3 去掉 PID 比较后 seed-invoicing 仍没有执行，说明负例不依赖 PID 比较") }
  else { "A3 通过：去掉 PID 比较后 seed-invoicing 被执行了（这个负例此时失败），退出 $($r.code)" }

  "== A4 真实 run-main：seed-invoicing 之后监听换成 B，应在 seed-sales 之前中止 =="
  $sb = New-Sandbox "a4"
  $r = Invoke-Run $sb $realRun "2" @("-SkipCapture")
  $r.out.Trim()
  if ($r.code -eq 0) { $problems.Add("A4 应非零退出") }
  if ($r.out -notmatch "owner mismatch before seed-sales") { $problems.Add("A4 没有因 owner mismatch before seed-sales 中止") }
  if (-not (Test-Path "$sb\seed-invoicing.ran")) { $problems.Add("A4 seed-invoicing 替身没有执行，场景不成立") }
  if (Test-Path "$sb\seed-sales.ran") { $problems.Add("A4 seed-sales 被执行了，后续步骤没有被拦住") }
  if (-not (Test-Path "$sb\b.pid")) { $problems.Add("A4 进程 B 没有出现，场景不成立") }
  else { "A4 通过：中止信息 owner mismatch before seed-sales；seed-invoicing 执行、seed-sales 未执行；B pid " + (Get-Content "$sb\b.pid") }

  "== A5 对照：run-main 副本去掉 seed-sales 前的 PID 比较，同一场景应放行（负例失效） =="
  $needle2 = '-or $owner[0] -ne $server.Id){throw "owner mismatch before seed-sales"}'
  if (-not $mainSrc.Contains($needle2)) { throw "A5：run-main.ps1 里找不到要改的检查，副本不成立" }
  $sb = New-Sandbox "a5"
  $mut2 = "$sb\run-main-nopid2.ps1"
  & $put $mut2 $mainSrc.Replace($needle2, '){throw "owner mismatch before seed-sales"}')
  $r = Invoke-Run $sb $mut2 "2" @("-SkipCapture")
  if (-not (Test-Path "$sb\seed-sales.ran")) { $problems.Add("A5 去掉 PID 比较后 seed-sales 仍没有执行，说明负例不依赖 PID 比较") }
  else { "A5 通过：去掉 PID 比较后 seed-sales 被执行了（这个负例此时失败），退出 $($r.code)" }

  "== B 渲染结果里的真实服务演练块和取图块 =="
  $html = (& gh api -X POST markdown -f mode=gfm -F text=@$readme | Out-String)
  $pre = [regex]::Matches($html, '<pre.*?</pre>', "Singleline")
  if ($pre.Count -lt 6) { throw "README 渲染后只有 $($pre.Count) 个代码块" }
  $texts = @($pre | ForEach-Object { [Net.WebUtility]::HtmlDecode([regex]::Replace($_.Value, '<[^>]+>', '')).Trim() })
  $found3 = @($texts | Where-Object { $_ -match 'run-main\.ps1 -Shots \$shots -SkipCapture' -and $_ -notmatch "npm run build" })
  $found6 = @($texts | Where-Object { $_ -match "npm run build" -and $_ -match "run-main\.ps1" })
  if ($found3.Count -ne 1 -or $found6.Count -ne 1) { throw "渲染结果里按内容找不到唯一的真实服务演练块或取图块" }
  $b3 = $found3[0]; $b6 = $found6[0]
  "取到的块：真实服务演练块序号 $([array]::IndexOf($texts, $b3) + 1)，取图块序号 $([array]::IndexOf($texts, $b6) + 1)（共 $($texts.Count) 块）"
  $runStub = @'
param([Parameter(Mandatory)][string]$Shots, [switch]$SkipCapture)
"run-main stub: Shots=$Shots SkipCapture=$($SkipCapture.IsPresent)" | Add-Content "$env:SBX\calls.log"
if ($Shots -notlike "*demo-s10-shots-*") { throw "Shots 目录名不对" }
$mode = $env:RUNMODE
"STDOUT-BEFORE"
if ($mode -in @("fail3", "stderr-ok")) { cmd /c "echo NATIVE-STDERR 1>&2" }
"STDOUT-AFTER-STDERR"
if ($mode -eq "throw") { throw "owner mismatch stub" }
if (-not $SkipCapture) {
  New-Item -ItemType Directory -Force $Shots | Out-Null
  $count = if ($mode -eq "fail3") { 5 } else { 24 }
  1..$count | ForEach-Object { [IO.File]::WriteAllText("$Shots\shot-$_.png", "png-$_") }
}
if ($mode -eq "fail3") { exit 3 }
'@
  $runBlock = {
    param($name, $text, $noFromOrder, $gitEq = "0", $mode = "ok")
    $sb = New-Sandbox $name
    & $put "$sb\docs\demo\v0.10.0\scripts\run-main.ps1" $runStub
    & $put "$sb\docs\demo\v0.10.0\screenshots\.gitkeep" ""
    [IO.File]::WriteAllText("$sb\block.ps1", $text, (New-Object Text.UTF8Encoding $true))
    $env:RUNMODE = $mode; $env:SBX = $sb; $env:NO_FROMORDER = $noFromOrder; $env:GIT_EQ = $gitEq; $env:TEMP = "$sb\tmp"; $env:TMP = "$sb\tmp"; $env:PATH = "$sb\bin;" + $oldPath
    Push-Location $sb
    try { $ErrorActionPreference = "Continue"; $o = (& powershell -NoProfile -File "$sb\block.ps1" 2>&1 | Out-String); $c = $LASTEXITCODE } finally { $ErrorActionPreference = "Stop"; Pop-Location; $env:TEMP = $oldTemp; $env:TMP = $oldTmp; $env:PATH = $oldPath }
    @{ sb = $sb; out = $o; code = $c; calls = $(if (Test-Path "$sb\calls.log") { Get-Content "$sb\calls.log" -Raw } else { "" }) }
  }

  $r = & $runBlock "b3" $b3 "0"
  if ($r.code -ne 0 -or $r.calls -notmatch "SkipCapture=True" -or $r.calls -match "npm run build") { $problems.Add("B3 真实服务演练块执行结果不符：退出 $($r.code)`n$($r.calls)`n$($r.out)") }
  else { "B3 通过：真实服务演练块在沙箱里执行，退出 0，替身 run-main 被带 -SkipCapture 调用，没有 build" }

  $r = & $runBlock "b6" $b6 "0"
  $copied = @(Get-ChildItem "$($r.sb)\docs\demo\v0.10.0\screenshots" -Filter *.png -ErrorAction SilentlyContinue).Count
  $left = @(Get-ChildItem "$($r.sb)\tmp" -Directory -Filter "demo-s10-shots-*" -ErrorAction SilentlyContinue).Count
  if ($r.code -ne 0 -or $r.calls -notmatch "npm run build" -or $r.calls -notmatch "SkipCapture=False" -or $copied -ne 24 -or $left -ne 0) { $problems.Add("B6 取图块执行结果不符：退出 $($r.code)，复制 $copied 张，残留目录 $left`n$($r.calls)`n$($r.out)") }
  else { "B6 通过：取图块在沙箱里执行，退出 0；build 先于 run-main 替身（不带 -SkipCapture）；24 张复制到沙箱截图目录；shots 临时目录已清" }

  $r = & $runBlock "b6neg" $b6 "1"
  $copied = @(Get-ChildItem "$($r.sb)\docs\demo\v0.10.0\screenshots" -Filter *.png -ErrorAction SilentlyContinue).Count
  if ($r.code -eq 0 -or $r.out -notmatch "dist 里没有" -or $r.calls -match "run-main stub" -or $copied -ne 0) { $problems.Add("B6 负例（dist 缺筛选条文案）应中止且不调用 run-main：退出 $($r.code)`n$($r.calls)") }
  else { "B6 负例通过：dist 缺筛选条文案，取图块因 dist 断言中止（退出 $($r.code)，输出含[dist 里没有]），run-main 替身没有被调用，没有复制截图" }
  $r = & $runBlock "b6eq" $b6 "0" "1"
  $copied = @(Get-ChildItem "$($r.sb)\docs\demo\v0.10.0\screenshots" -Filter *.png -ErrorAction SilentlyContinue).Count
  if ($r.code -eq 0 -or $r.out -notmatch "不晚于 HEAD" -or $r.calls -match "run-main stub" -or $copied -ne 0) { $problems.Add("B6 负例（dist 时间等于 HEAD）应中止且不调用 run-main：退出 $($r.code)`n$($r.calls)`n$($r.out)") }
  else { "B6 负例通过：dist 时间与 HEAD 提交时间相等，取图块因严格晚于断言中止（退出 $($r.code)，输出含[不晚于 HEAD]），run-main 替身没有被调用，没有复制截图" }

  # B7 日志完整性（Windows PowerShell 5.1）：取图块把 runner 的 stdout / 原生 stderr / 异常 / 退出码写进日志文件
  $logOf = { param($r) @(Get-ChildItem "$($r.sb)\tmp" -Filter "demo-s10-shots-*.run.log" -ErrorAction SilentlyContinue | ForEach-Object { Get-Content -Raw -Encoding UTF8 $_.FullName }) -join "`n" }
  $shotsLeft = { param($r) @(Get-ChildItem "$($r.sb)\tmp" -Directory -Filter "demo-s10-shots-*" -ErrorAction SilentlyContinue).Count }
  $pngs = { param($r) @(Get-ChildItem "$($r.sb)\docs\demo\v0.10.0\screenshots" -Filter *.png -ErrorAction SilentlyContinue).Count }

  $r = & $runBlock "b7ok" $b6 "0" "0" "stderr-ok"
  $lg = & $logOf $r
  if ($r.code -ne 0 -or $lg -notmatch "STDOUT-BEFORE" -or $lg -notmatch "NATIVE-STDERR" -or $lg -notmatch "STDOUT-AFTER-STDERR" -or $lg -notmatch "exit=0 ok=True" -or (& $pngs $r) -ne 24 -or (& $shotsLeft $r) -ne 0) { $problems.Add("B7 成功路径（stderr 之后仍有 stdout）不符：退出 $($r.code)`n$lg") }
  else { "B7 成功通过：runner 先写 stdout、再写原生 stderr、再写 stdout，三段都在日志里，exit=0；复制 24 张，shots 目录已清，日志保留" }

  $r = & $runBlock "b7fail" $b6 "0" "0" "fail3"
  $lg = & $logOf $r
  if ($r.code -eq 0 -or $lg -notmatch "STDOUT-BEFORE" -or $lg -notmatch "NATIVE-STDERR" -or $lg -notmatch "STDOUT-AFTER-STDERR" -or $lg -notmatch "EXCEPTION:.*run-main 退出码 3" -or $lg -notmatch "exit=3 ok=False" -or (& $pngs $r) -ne 0 -or (& $shotsLeft $r) -ne 1) { $problems.Add("B7 失败路径（exit 3）不符：退出 $($r.code)`n$lg") }
  else { "B7 失败通过：原生 stderr 之后的 stdout 仍落盘；日志记 EXCEPTION 与实际退出码 exit=3（不是 1）；块以失败退出；不复制截图；shots 目录保留（含已写出的 5 张）" }

  $r = & $runBlock "b7throw" $b6 "0" "0" "throw"
  $lg = & $logOf $r
  if ($r.code -eq 0 -or $lg -notmatch "STDOUT-BEFORE" -or $lg -notmatch "EXCEPTION:.*owner mismatch stub" -or $lg -notmatch "exit=1 ok=False" -or (& $pngs $r) -ne 0) { $problems.Add("B7 runner 抛错路径不符：退出 $($r.code)`n$lg") }
  else { "B7 抛错通过：runner 抛错的原始异常（owner mismatch stub）和 exit=1 落盘；块失败退出；不复制截图" }
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
