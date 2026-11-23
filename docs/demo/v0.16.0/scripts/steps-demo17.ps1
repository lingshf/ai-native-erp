# Demo 证据脚本，按 D446 例外，不属于产品与 CI 代码
param([string] $OutDir, [string] $Root, [string] $BaseRoot)
$shots = Join-Path $OutDir "shots"
@(@{ name = "demo-capture"; dir = $Root; file = "powershell.exe"
  args = "-NoProfile -File docs\demo\v0.16.0\scripts\run-main.ps1 -Shots `"$shots`""
  env = @{ ERP_E2E_BROWSER_CHANNEL = "chrome" } })
