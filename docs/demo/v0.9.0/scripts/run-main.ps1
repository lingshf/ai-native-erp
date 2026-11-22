param(
  [Parameter(Mandatory)][string]$Shots,   # per-run unique output dir, named by the caller; capture writes only into it
  [switch]$SkipCapture                    # browserless dry-run: migrate, start, seed, readiness; no Chrome
)
. {
  $server=$null;$demo=$null;$db=$null;$port=$null
  try {
  $port = 4201
  $year = (Get-Date).Year
  $day = Get-Date -Format yyyy-MM-dd
  if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { throw "port busy" }
  $demo = Join-Path ([IO.Path]::GetTempPath()) ("erp-demo-" + [guid]::NewGuid()); New-Item -ItemType Directory $demo | Out-Null
  $db = Join-Path $demo "demo.sqlite"
  npm run storage:admin -- migrate --provider sqlite --file $db | Out-Null; if ($LASTEXITCODE) { throw "migrate" }
  node docs/demo/v0.4.0/scripts/prepare.mjs $db $year; if ($LASTEXITCODE) { throw "prepare" }
  $env:ERP_SQLITE_FILE=$db;$env:ERP_PORT="$port";$env:ERP_HOST="127.0.0.1";$env:ERP_PROFILE="local"
  $server = Start-Process node -ArgumentList "packages/infra/src/main.ts" -PassThru -WindowStyle Hidden
  $ready=$false; 1..20|%{ if(-not $ready){ try{$ready=(Invoke-WebRequest "http://127.0.0.1:$port/" -UseBasicParsing).StatusCode -eq 200}catch{Start-Sleep 1} } }
  if(-not $ready -or $server.HasExited){throw "not ready"}
  $owner=@((Get-NetTCPConnection -LocalPort $port -State Listen).OwningProcess); if($owner.Count -ne 1 -or $owner[0] -ne $server.Id){throw "owner mismatch"}
  "ready port=$port pid=$($server.Id) start=$(Get-Date -Format HH:mm:ss)"
  node docs/demo/v0.4.0/scripts/seed-trade.mjs "http://127.0.0.1:$port" $day; if ($LASTEXITCODE) { throw "seed-trade" }
  $owner=@((Get-NetTCPConnection -LocalPort $port -State Listen).OwningProcess); if($server.HasExited -or $owner.Count -ne 1 -or $owner[0] -ne $server.Id){throw "owner mismatch before seed-invoicing"}
  node docs/demo/v0.9.0/scripts/seed-invoicing.mjs "http://127.0.0.1:$port" $day; if ($LASTEXITCODE) { throw "seed-invoicing" }
  $parties=(Invoke-WebRequest "http://127.0.0.1:$port/api/v1/trade/tradeParty?company=DEFAULT&limit=500" -UseBasicParsing).Content
  $orders=(Invoke-WebRequest "http://127.0.0.1:$port/api/v1/trade/orders?company=DEFAULT&limit=100" -UseBasicParsing).Content
  if($parties -notmatch '"PARTY"'){ throw "readiness: partner PARTY missing" }
  foreach($o in "PO-I1","PO-I2","PO-I3"){ if($orders -notmatch "`"$o`""){ throw "readiness: order $o missing" } }
  foreach($s in "none","partial","full"){ if($orders -notmatch "`"invoicing`":\s*`"$s`""){ throw "readiness: no order with invoicing $s" } }
  $invoices=(Invoke-WebRequest "http://127.0.0.1:$port/api/v1/trade/invoices?company=DEFAULT&limit=100" -UseBasicParsing).Content
  foreach($o in "PO-I1","PO-I2"){ if($invoices -notmatch "`"orderId`":\s*`"$o`""){ throw "readiness: no invoice with source order $o" } }
  "readiness ok: partner, 3 orders (none/partial/full), 2 invoices with source order"
  $owner=@((Get-NetTCPConnection -LocalPort $port -State Listen).OwningProcess); if($server.HasExited -or $owner.Count -ne 1 -or $owner[0] -ne $server.Id){throw "owner mismatch after seed"}
  if ($SkipCapture) { "capture skipped (dry-run)" }
  else { node docs/demo/v0.9.0/scripts/capture.mjs "http://127.0.0.1:$port" $Shots; if ($LASTEXITCODE) { throw "capture failed, exit $LASTEXITCODE" }; "capture exit 0" }
  } finally {
  if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id }
  if ($demo -and (Split-Path $demo -Leaf) -like "erp-demo-*") { Remove-Item -Recurse -Force $demo }
  if ($port) { if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {"port still listening"} else {"port $port released"} }
  }
}
