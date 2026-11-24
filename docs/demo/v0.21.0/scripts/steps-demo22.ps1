# Demo 证据脚本，按 D446 例外，不属于产品与 CI 代码；端口 4204 为 DEMO-22 窗口申请的提议值，须与批准的 -Ports 一致
param([string] $OutDir, [string] $Root, [string] $BaseRoot)
$shots = Join-Path $OutDir "shots"
@(@{ name = "demo-capture"; dir = $Root; file = "powershell.exe"
  args = "-NoProfile -File docs\demo\v0.21.0\scripts\run-main.ps1 -Shots `"$shots`" -Port 4204"
  env = @{ ERP_E2E_BROWSER_CHANNEL = "chrome" } })
