# 编排级替身检查（Demo v0.8.0，#174 复审）：不启动真实服务、Chrome、Playwright、Vitest，不连账套，不碰真实截图目录。
# 在 erp-orch-<guid> 沙箱里放一套假的 npm / prepare / seed / main.ts / run-main 替身，然后：
#  A) 原样运行真实的 run-main.ps1（只是它调用的命令是沙箱里的假命令），构造“进程 A 存活，但 4200 端口监听归进程 B”：
#     A 存活且 HasExited 为假，只有 PID 比较能发现；断言 run-main 以“owner mismatch before seed-invoicing”中止、seed-invoicing 没有执行。
#     对照 1：不换监听（A 一直是监听者）时 run-main 走完，说明替身编排本身可用。
#     对照 2：把 run-main 副本里那处检查的 PID 比较去掉，同一场景下 seed-invoicing 被执行了（负例失效），证明 PID 比较是必需的。
#  B) 从 GitHub 渲染后的 README 取出第 3 块（真实服务演练）和第 6 块（取图），在沙箱里实际执行，断言它们的调用、产物与清理；
#     第 6 块再做一个 dist 缺 fromOrder 的负例：必须中止，run-main 替身没有被调用。
# 端口 4200 是 run-main 写死的；开始前必须空闲，否则中止。用法（仓库根目录）：
#   powershell -NoProfile -File docs\demo\v0.8.0\scripts\orchestration-stub.ps1
$ErrorActionPreference = "Stop"
$root = (Get-Location).Path
$realRun = Join-Path $root "docs\demo\v0.8.0\scripts\run-main.ps1"
$readme = Join-Path $root "docs\demo\v0.8.0\README.md"
$realShots = Join-Path $root "docs\demo\v0.8.0\screenshots"
$snap = { param($dir) @(Get-ChildItem -LiteralPath $dir -Recurse -File -Force -ErrorAction Stop | Sort-Object FullName | ForEach-Object { (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256 -ErrorAction Stop).Hash + "  " + $_.Name }) }
$problems = New-Object System.Collections.Generic.List[string]
$oldTemp = $env:TEMP; $oldTmp = $env:TMP; $oldPath = $env:PATH; $iso = $null
$realBefore = @(& $snap $realShots)
if ($realBefore.Count -eq 0) { throw "真实截图目录为空，无法证明沙箱没有触及它" }
if (Get-NetTCPConnection -LocalPort 4200 -State Listen -ErrorAction SilentlyContinue) { throw "端口 4200 已被占用，不运行（run-main 写死 4200）" }
$utf8 = New-Object Text.UTF8Encoding $false
$put = { param($path, $text) New-Item -ItemType Directory -Force (Split-Path $path) | Out-Null; [IO.File]::WriteAllText($path, $text, $utf8) }

function New-Sandbox {
  param($name)
  $sb = Join-Path $iso $name
  New-Item -ItemType Directory $sb | Out-Null
  New-Item -ItemType Directory (Join-Path $sb "tmp"), (Join-Path $sb "bin") | Out-Null
  & $put "$sb\bin\npm.cmd" "@echo off`r`necho npm %* >> `"%SBX%\calls.log`"`r`nif not `"%2`"==`"build`" exit /b 0`r`nmkdir `"%SBX%\packages\web\dist\assets`" 2>nul`r`nif `"%NO_FROMORDER%`"==`"1`" (echo /invoicing> `"%SBX%\packages\web\dist\assets\app.js`") else (echo /invoicing fromOrder> `"%SBX%\packages\web\dist\assets\app.js`")`r`nexit /b 0`r`n"
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
  & $put "$sb\docs\demo\v0.8.0\scripts\seed-invoicing.mjs" 'import { writeFileSync } from "node:fs"; writeFileSync(process.env.SBX + "\\seed-invoicing.ran", "1");'
  & $put "$sb\packages\infra\src\b.js" @'
const http = require("http"), fs = require("fs");
fs.writeFileSync(process.env.SBX + "\\b.pid", String(process.pid));
const body = '"PARTY" "PO-I1" "PO-I2"';
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
const body = '"PARTY" "PO-I1" "PO-I2"';
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
  if ($r.code -ne 0 -or $r.out -notmatch "capture skipped" -or -not (Test-Path "$sb\seed-invoicing.ran")) { $problems.Add("A1 对照应走完并执行 seed-invoicing：退出 $($r.code)`n$($r.out)") }
  else { "A1 通过：退出 0，seed-trade、seed-invoicing 都执行，端口释放：" + ($r.out -match "port 4200 released") }

  "== A2 真实 run-main：A 存活，监听换成 B，应在 seed-invoicing 之前中止 =="
  $sb = New-Sandbox "a2"
  $r = Invoke-Run $sb $realRun "1" @("-SkipCapture")
  $r.out.Trim()
  if ($r.code -eq 0) { $problems.Add("A2 应非零退出") }
  if ($r.out -notmatch "owner mismatch before seed-invoicing") { $problems.Add("A2 没有因 owner mismatch before seed-invoicing 中止") }
  if (-not (Test-Path "$sb\seed-trade.ran")) { $problems.Add("A2 seed-trade 替身没有执行，场景不成立") }
  if (Test-Path "$sb\seed-invoicing.ran") { $problems.Add("A2 seed-invoicing 被执行了，后续步骤没有被拦住") }
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

  "== B 渲染结果里的第 3、6 块 =="
  $html = (& gh api -X POST markdown -f mode=gfm -F text=@$readme | Out-String)
  $pre = [regex]::Matches($html, '<pre.*?</pre>', "Singleline")
  if ($pre.Count -lt 7) { throw "README 渲染后只有 $($pre.Count) 个代码块" }
  $texts = @($pre | ForEach-Object { [Net.WebUtility]::HtmlDecode([regex]::Replace($_.Value, '<[^>]+>', '')).Trim() })
  $found3 = @($texts | Where-Object { $_ -match 'run-main\.ps1 -Shots \$shots -SkipCapture' -and $_ -notmatch "npm run build" })
  $found6 = @($texts | Where-Object { $_ -match "npm run build" -and $_ -match "run-main\.ps1" })
  if ($found3.Count -ne 1 -or $found6.Count -ne 1) { throw "渲染结果里按内容找不到唯一的真实服务演练块或取图块" }
  $b3 = $found3[0]; $b6 = $found6[0]
  "取到的块：真实服务演练块序号 $([array]::IndexOf($texts, $b3) + 1)，取图块序号 $([array]::IndexOf($texts, $b6) + 1)（共 $($texts.Count) 块）"
  $runStub = @'
param([Parameter(Mandatory)][string]$Shots, [switch]$SkipCapture)
"run-main stub: Shots=$Shots SkipCapture=$($SkipCapture.IsPresent)" | Add-Content "$env:SBX\calls.log"
if ($Shots -notlike "*demo-s8-shots-*") { throw "Shots 目录名不对" }
if (-not $SkipCapture) {
  New-Item -ItemType Directory -Force $Shots | Out-Null
  1..16 | ForEach-Object { [IO.File]::WriteAllText("$Shots\shot-$_.png", "png-$_") }
}
'@
  $runBlock = {
    param($name, $text, $noFromOrder)
    $sb = New-Sandbox $name
    & $put "$sb\docs\demo\v0.8.0\scripts\run-main.ps1" $runStub
    & $put "$sb\docs\demo\v0.8.0\screenshots\.gitkeep" ""
    [IO.File]::WriteAllText("$sb\block.ps1", $text, (New-Object Text.UTF8Encoding $true))
    $env:SBX = $sb; $env:NO_FROMORDER = $noFromOrder; $env:TEMP = "$sb\tmp"; $env:TMP = "$sb\tmp"; $env:PATH = "$sb\bin;" + $oldPath
    Push-Location $sb
    try { $ErrorActionPreference = "Continue"; $o = (& powershell -NoProfile -File "$sb\block.ps1" 2>&1 | Out-String); $c = $LASTEXITCODE } finally { $ErrorActionPreference = "Stop"; Pop-Location; $env:TEMP = $oldTemp; $env:TMP = $oldTmp; $env:PATH = $oldPath }
    @{ sb = $sb; out = $o; code = $c; calls = $(if (Test-Path "$sb\calls.log") { Get-Content "$sb\calls.log" -Raw } else { "" }) }
  }

  $r = & $runBlock "b3" $b3 "0"
  if ($r.code -ne 0 -or $r.calls -notmatch "SkipCapture=True" -or $r.calls -match "npm run build") { $problems.Add("B3 第 3 块执行结果不符：退出 $($r.code)`n$($r.calls)`n$($r.out)") }
  else { "B3 通过：第 3 块在沙箱里执行，退出 0，替身 run-main 被带 -SkipCapture 调用，没有 build" }

  $r = & $runBlock "b6" $b6 "0"
  $copied = @(Get-ChildItem "$($r.sb)\docs\demo\v0.8.0\screenshots" -Filter *.png -ErrorAction SilentlyContinue).Count
  $left = @(Get-ChildItem "$($r.sb)\tmp" -Directory -Filter "demo-s8-shots-*" -ErrorAction SilentlyContinue).Count
  if ($r.code -ne 0 -or $r.calls -notmatch "npm run build" -or $r.calls -notmatch "SkipCapture=False" -or $copied -ne 16 -or $left -ne 0) { $problems.Add("B6 第 6 块执行结果不符：退出 $($r.code)，复制 $copied 张，残留目录 $left`n$($r.calls)`n$($r.out)") }
  else { "B6 通过：第 6 块在沙箱里执行，退出 0；build 先于 run-main 替身（不带 -SkipCapture）；16 张复制到沙箱截图目录；shots 临时目录已清" }

  $r = & $runBlock "b6neg" $b6 "1"
  $copied = @(Get-ChildItem "$($r.sb)\docs\demo\v0.8.0\screenshots" -Filter *.png -ErrorAction SilentlyContinue).Count
  if ($r.code -eq 0 -or $r.out -notmatch "dist 里没有" -or $r.calls -match "run-main stub" -or $copied -ne 0) { $problems.Add("B6 负例（dist 缺 fromOrder）应中止且不调用 run-main：退出 $($r.code)`n$($r.calls)") }
  else { "B6 负例通过：dist 缺 fromOrder，第 6 块因 dist 断言中止（退出 $($r.code)，输出含[dist 里没有]），run-main 替身没有被调用，没有复制截图" }
} catch {
  $problems.Add("编排替身运行失败：" + $_.Exception.Message)
} finally {
  $env:TEMP = $oldTemp; $env:TMP = $oldTmp; $env:PATH = $oldPath
  if ($iso -and (Split-Path $iso -Leaf) -like "erp-orch-*" -and (Test-Path -LiteralPath $iso)) { Remove-Item -Recurse -Force $iso }
}
if (Get-NetTCPConnection -LocalPort 4200 -State Listen -ErrorAction SilentlyContinue) { $problems.Add("结束时端口 4200 仍在监听") }
$realAfter = @(& $snap $realShots)
if (($realBefore -join "`n") -ne ($realAfter -join "`n")) { $problems.Add("真实截图目录前后不一致") }
if ($problems.Count -gt 0) { $problems | ForEach-Object { "PROBLEM: $_" }; exit 1 }
"编排替身检查全部通过；端口 4200 已空闲；真实截图目录未变：$($realBefore.Count) 个文件"
