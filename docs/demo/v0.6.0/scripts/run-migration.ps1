. {
  $server=$null;$demo=$null;$db=$null;$port=$null
  $shots = Join-Path $env:TEMP "demo-s6-shots"
  try {
  $port = 4198
  if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { throw "port busy" }
  $demo = Join-Path ([IO.Path]::GetTempPath()) ("erp-demo-" + [guid]::NewGuid()); New-Item -ItemType Directory $demo | Out-Null
  node docs/demo/v0.6.0/scripts/migration-setup.mjs $demo; if ($LASTEXITCODE) { throw "setup" }
  $snap = Join-Path $demo "snapshot"; $opening = Join-Path $demo "opening.json"; $db = Join-Path $demo "target.sqlite"; $confirm = Join-Path $demo "confirm.json"
  npm run storage:admin -- legacy-import --snapshot-dir $snap --target $db --drafts import-as-draft --receipts archive-only --source-events archive-only --transfer-queue archive-only --seals archive-only --audit archive-only --opening-items $opening | Out-Null; if ($LASTEXITCODE) { throw "import" }
  $report = npm run storage:admin -- legacy-reconcile --snapshot-dir $snap --target $db --check 2>$null | Where-Object { $_ -like '{*' } | ConvertFrom-Json
  "check verdict: $($report.verdict)"
  [IO.File]::WriteAllText($confirm, (@{ knownDifferencesSha256 = $report.knownDifferencesSha256 } | ConvertTo-Json -Compress))
  npm run storage:admin -- legacy-reconcile --snapshot-dir $snap --target $db --confirm $confirm | Out-Null; if ($LASTEXITCODE) { throw "confirm" }
  $env:ERP_SQLITE_FILE=$db;$env:ERP_PORT="$port";$env:ERP_HOST="127.0.0.1";$env:ERP_PROFILE="local"
  $server = Start-Process node -ArgumentList "packages/infra/src/main.ts" -PassThru -WindowStyle Hidden
  $ready=$false; 1..20|%{ if(-not $ready){ try{$ready=(Invoke-WebRequest "http://127.0.0.1:$port/" -UseBasicParsing).StatusCode -eq 200}catch{Start-Sleep 1} } }
  if(-not $ready -or $server.HasExited){throw "not ready"}
  $owner=@((Get-NetTCPConnection -LocalPort $port -State Listen).OwningProcess); if($owner.Count -ne 1 -or $owner[0] -ne $server.Id){throw "owner mismatch"}
  "ready port=$port pid=$($server.Id) start=$(Get-Date -Format HH:mm:ss)"
  node docs/demo/v0.6.0/scripts/capture.mjs migration "http://127.0.0.1:$port" $shots; if ($LASTEXITCODE) { throw "capture failed, exit $LASTEXITCODE" }; "capture exit 0"
  } finally {
  if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id }
  if ($demo -and (Split-Path $demo -Leaf) -like "erp-demo-*") { Remove-Item -Recurse -Force $demo }
  if ($port) { if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {"port still listening"} else {"port $port released"} }
  }
}
