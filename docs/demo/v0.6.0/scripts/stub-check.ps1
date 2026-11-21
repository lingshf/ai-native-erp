# 无浏览器替身检查：用函数遮蔽 npm / node / Start-Process / Get-NetTCPConnection 等，运行 README 第 4 节的复跑块（现版命令），
# 覆盖成功分支与失败分支。不启动 Chrome、Playwright、Vitest，不监听端口，不重拍截图，不改仓库文件。
# 用法（仓库根目录）：powershell -File docs\demo\v0.6.0\scripts\stub-check.ps1
$ErrorActionPreference = "Stop"
$root = (Get-Location).Path
$readme = Get-Content (Join-Path $root "docs\demo\v0.6.0\README.md") -Raw -Encoding UTF8
$sec = $readme.Substring($readme.IndexOf("## 4."))
$m = [regex]::Match($sec, '(?s)```powershell\r?\n(.*?)```')
if (-not $m.Success) { throw "README 第 4 节没有 powershell 块" }
$block = [scriptblock]::Create($m.Groups[1].Value)

$global:Calls = New-Object System.Collections.Generic.List[string]
$global:Q = @{}; $global:Cur = "main"; $global:Nq = 0; $global:Sc = $null

function npm { $global:Calls.Add("npm " + ($args -join " ")); $global:LASTEXITCODE = 0
  if ($args -contains "--check") { '{"verdict":"pending","knownDifferencesSha256":"stub"}' } }
function node {
  $global:Calls.Add("node " + ($args -join " "))
  $script = [string]$args[0]
  if ($script -like "*prepare.mjs") { $global:Cur = "main"; $global:Nq = 1 }
  if ($script -like "*migration-setup.mjs") { $global:Cur = "mig"; $global:Nq = 1 }
  $global:LASTEXITCODE = 0
  if ($script -like "*capture.mjs") {
    $mode = [string]$args[1]; $out = [string]$args[3]
    New-Item -ItemType Directory -Force $out | Out-Null
    $count = if ($mode -eq "main") { 12 } else { 4 }
    1..$count | ForEach-Object { New-Item -ItemType File -Force (Join-Path $out "stub-$mode-$_.png") | Out-Null }
    $global:LASTEXITCODE = [int]$global:Sc.capture[$mode]
  }
}
function Start-Process { $global:Calls.Add("Start-Process node"); [pscustomobject]@{ Id = 111; HasExited = $false } }
function Invoke-WebRequest { [pscustomobject]@{ StatusCode = 200 } }
function Stop-Process { $global:Calls.Add("Stop-Process " + ($args -join " ")) }
function Copy-Item { $global:Calls.Add("Copy-Item " + ($args -join " ")) }
function Get-NetTCPConnection {
  $q = $global:Sc.q[$global:Cur]; $i = $global:Nq; $global:Nq++
  if ($i -lt $q.Count -and $null -ne $q[$i]) { [pscustomobject]@{ OwningProcess = $q[$i] } }
}

$scenarios = [ordered]@{
  "1 success"                        = @{ q = @{ main = @($null,111,111,$null); mig = @($null,111,$null) }; capture = @{ main = 0; migration = 0 } }
  "2 main capture exit 3"            = @{ q = @{ main = @($null,111,111,$null); mig = @($null,111,$null) }; capture = @{ main = 3; migration = 0 } }
  "3 migration capture exit 5"       = @{ q = @{ main = @($null,111,111,$null); mig = @($null,111,$null) }; capture = @{ main = 0; migration = 5 } }
  "4 port busy at start (main)"      = @{ q = @{ main = @(4242,4242); mig = @($null,111,$null) }; capture = @{ main = 0; migration = 0 } }
  "5 owner mismatch after start"     = @{ q = @{ main = @($null,999,$null,$null); mig = @($null,111,$null) }; capture = @{ main = 0; migration = 0 } }
  "6 owner mismatch after seed"      = @{ q = @{ main = @($null,111,999,$null); mig = @($null,111,$null) }; capture = @{ main = 0; migration = 0 } }
  "7 migration owner mismatch"       = @{ q = @{ main = @($null,111,111,$null); mig = @($null,999,$null) }; capture = @{ main = 0; migration = 0 } }
}
foreach ($name in $scenarios.Keys) {
  $global:Sc = $scenarios[$name]; $global:Calls.Clear(); $global:Cur = "main"; $global:Nq = 0
  "=== $name"
  $result = "block completed"
  try { . $block } catch { $result = "THROW: " + $_.Exception.Message }
  $copied = @($global:Calls | Where-Object { $_ -like "Copy-Item*" }).Count
  $stopped = @($global:Calls | Where-Object { $_ -like "Stop-Process*" }).Count
  $left = @(Get-ChildItem ([IO.Path]::GetTempPath()) -Directory -Filter "erp-demo-*" -ErrorAction SilentlyContinue).Count
  "--- result"
  "result: $result"
  "Copy-Item calls: $copied; Stop-Process calls: $stopped; leftover erp-demo-* dirs: $left"
  "capture calls: " + (($global:Calls | Where-Object { $_ -like "*capture.mjs*" }) -join " | ")
}
$shots = Join-Path $env:TEMP "demo-s6-shots"
if (Test-Path $shots) { Remove-Item -Recurse -Force $shots }
