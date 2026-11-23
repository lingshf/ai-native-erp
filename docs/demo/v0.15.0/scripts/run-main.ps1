# Demo 证据脚本，按 D446 例外，不属于产品与 CI 代码（DEMO-16，端口 4203，不是 4173）
param(
  [Parameter(Mandatory)][string]$Shots,   # per-run unique output dir, named by the caller; capture writes only into it
  [switch]$SkipCapture                    # browserless dry-run: migrate, start, seed, readiness; no Chrome
)
. {
  $server=$null;$demo=$null;$db=$null;$port=$null
  try {
  $port = 4203
  $year = (Get-Date).Year
  $day = Get-Date -Format yyyy-MM-dd
  if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { throw "port busy" }
  $demo = Join-Path ([IO.Path]::GetTempPath()) ("erp-demo-" + [guid]::NewGuid()); New-Item -ItemType Directory $demo -ErrorAction Stop | Out-Null
  $db = Join-Path $demo "demo.sqlite"
  npm run storage:admin -- migrate --provider sqlite --file $db | Out-Null; if ($LASTEXITCODE) { throw "migrate" }
  node docs/demo/v0.4.0/scripts/prepare.mjs $db $year; if ($LASTEXITCODE) { throw "prepare" }
  $env:ERP_SQLITE_FILE=$db;$env:ERP_PORT="$port";$env:ERP_HOST="127.0.0.1";$env:ERP_PROFILE="local"
  $server = Start-Process node -ArgumentList "packages/infra/src/main.ts" -PassThru -WindowStyle Hidden -ErrorAction Stop
  $ready=$false; 1..20|%{ if(-not $ready){ try{$ready=(Invoke-WebRequest "http://127.0.0.1:$port/" -UseBasicParsing -ErrorAction Stop).StatusCode -eq 200}catch{Start-Sleep 1} } }
  if(-not $ready -or $server.HasExited){throw "not ready"}
  $owner=@((Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop).OwningProcess); if($owner.Count -ne 1 -or $owner[0] -ne $server.Id){throw "owner mismatch"}
  "ready port=$port pid=$($server.Id) start=$(Get-Date -Format HH:mm:ss)"
  $seeds = @("docs/demo/v0.4.0/scripts/seed-trade.mjs","docs/demo/v0.10.0/scripts/seed-invoicing.mjs","docs/demo/v0.10.0/scripts/seed-sales.mjs","docs/demo/v0.14.0/scripts/seed-credit.mjs")
  foreach ($seed in $seeds) {
    $owner=@((Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop).OwningProcess); if($server.HasExited -or $owner.Count -ne 1 -or $owner[0] -ne $server.Id){throw "owner mismatch before $seed"}
    node $seed "http://127.0.0.1:$port" $day; if ($LASTEXITCODE) { throw "seed failed: $seed" }
  }
  $companies=(Invoke-WebRequest "http://127.0.0.1:$port/api/v1/companies?limit=100" -UseBasicParsing -ErrorAction Stop).Content
  foreach($c in "DEFAULT"){ if($companies -notmatch "`"$c`""){ throw "readiness: company $c missing" } }
  foreach($state in "none","partial","full"){
    $orders=(Invoke-WebRequest "http://127.0.0.1:$port/api/v1/trade/orders?company=DEFAULT&limit=100&invoicing=$state" -UseBasicParsing -ErrorAction Stop).Content | ConvertFrom-Json
    if(@($orders.items).Count -lt 1){ throw "readiness: no order with invoicing=$state" }
  }
  "readiness ok: company DEFAULT; orders exist for invoicing none / partial / full; PO-C1 partial (seed-credit asserts 10 -> 6; credited 4)"
  $owner=@((Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop).OwningProcess); if($server.HasExited -or $owner.Count -ne 1 -or $owner[0] -ne $server.Id){throw "owner mismatch after seed"}
  if ($SkipCapture) { "capture skipped (dry-run)" }
  else { node docs/demo/v0.15.0/scripts/capture.mjs "http://127.0.0.1:$port" $Shots $day; if ($LASTEXITCODE) { throw "capture failed, exit $LASTEXITCODE" }; "capture exit 0" }
  } finally {
  if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -ErrorAction Stop }
  if ($demo -and (Split-Path $demo -Leaf) -like "erp-demo-*") { Remove-Item -Recurse -Force $demo -ErrorAction Stop }
  if ($port) { if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {"port still listening"} else {"port $port released"} }
  }
}
