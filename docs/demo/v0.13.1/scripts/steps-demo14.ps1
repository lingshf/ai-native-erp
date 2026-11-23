param([string] $OutDir, [string] $Root, [string] $BaseRoot)
$shots = Join-Path $OutDir "shots"
@(@{ name = "demo-capture"; dir = $Root; file = "powershell.exe"
  args = "-NoProfile -File docs\demo\v0.13.1\scripts\run-main.ps1 -Shots `"$shots`""
  env = @{ ERP_E2E_BROWSER_CHANNEL = "chrome" } })
