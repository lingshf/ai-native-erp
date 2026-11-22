# 无浏览器替身检查（Demo v0.10.0，PROC-04 要求 10、11）：不启动 Chrome、Playwright、Vitest，不连真实账套。
# 1) 用替身 HTTP 服务（回环临时端口）原样运行 seed-invoicing.mjs，断言请求日志与产品规则（成功分支）。
# 2) 在隔离目录里生成一份“PO-I1 开票数量改为 11”的副本，同一替身、同一规则下应被拒（400 quantity），脚本退出 1，之后的请求没有发出（失败分支）。
# 隔离：运行期间 TEMP/TMP 指到专用临时目录；结束时（无论成败）恢复环境、只删专用目录，并重新计算真实截图目录（含隐藏文件）的 SHA256；
# 读不了的文件、前后不一致、真实目录为空都视为失败。
# 用法（仓库根目录）：powershell -NoProfile -File docs\demo\v0.10.0\scripts\stub-check.ps1
$ErrorActionPreference = "Stop"
$root = (Get-Location).Path
$real = Join-Path $root "docs\demo\v0.10.0\screenshots"
$scripts = Join-Path $root "docs\demo\v0.10.0\scripts"
$oldTemp = $env:TEMP; $oldTmp = $env:TMP; $iso = $null; $before = $null; $after = $null
$problems = New-Object System.Collections.Generic.List[string]
$snap = { param($dir) @(Get-ChildItem -LiteralPath $dir -Recurse -File -Force -ErrorAction Stop | Sort-Object FullName | ForEach-Object { (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256 -ErrorAction Stop).Hash + "  " + $_.FullName }) }
$node = (Get-Command node -CommandType Application).Source
try {
  if (-not (Test-Path -LiteralPath $real)) { throw "真实截图目录不存在：$real" }
  $before = @(& $snap $real)
  if ($before.Count -eq 0) { throw "真实截图目录为空（连 .gitkeep 都没有），无法证明替身没有触及它" }
  $iso = Join-Path ([IO.Path]::GetTempPath()) ("erp-stub-" + [guid]::NewGuid())
  New-Item -ItemType Directory $iso | Out-Null
  $env:TEMP = $iso; $env:TMP = $iso

  $trade = Join-Path $root "docs\demo\v0.4.0\scripts\seed-trade.mjs"
  $stub = "$scripts\seed-invoicing-stub.mjs"
  $utf8 = New-Object Text.UTF8Encoding $false
  $tsrc = [IO.File]::ReadAllText($trade, [Text.Encoding]::UTF8)
  $isrc = [IO.File]::ReadAllText("$scripts\seed-invoicing.mjs", [Text.Encoding]::UTF8)

  "== 场景 1：seed-trade.mjs + seed-invoicing.mjs 依次运行，成功分支（22 条请求，v0.9.0 同一组） =="
  & $node $stub pass $trade "$scripts\seed-invoicing.mjs"
  if ($LASTEXITCODE -ne 0) { $problems.Add("场景 1 失败，退出码 $LASTEXITCODE") }

  "== 场景 1b：再加 seed-sales.mjs，销售方向成功分支（31 条请求） =="
  & $node $stub pass-sales $trade "$scripts\seed-invoicing.mjs" "$scripts\seed-sales.mjs"
  if ($LASTEXITCODE -ne 0) { $problems.Add("场景 1b 失败，退出码 $LASTEXITCODE") }

  "== 场景 1c：seed-sales 副本去掉 SERVICE 商品创建，销售订单应因商品不存在被拒 =="
  $ssrc = [IO.File]::ReadAllText("$scripts\seed-sales.mjs", [Text.Encoding]::UTF8)
  $svcNeedle = 'await send("POST", "/api/v1/trade/tradeProduct", {'
  if (-not $ssrc.Contains($svcNeedle)) { throw "场景 1c：seed-sales 里找不到商品创建，副本不成立" }
  $noSvc = Join-Path $iso "seed-sales-nosvc.mjs"
  [IO.File]::WriteAllText($noSvc, $ssrc.Replace($svcNeedle, 'if (false) await send("POST", "/api/v1/trade/tradeProduct", {'), $utf8)
  & $node $stub sales-no-service $trade "$scripts\seed-invoicing.mjs" $noSvc
  if ($LASTEXITCODE -ne 0) { $problems.Add("场景 1c 失败，退出码 $LASTEXITCODE") }

  "== 场景 1d：seed-sales 副本把销售单商品改为 EXPENSE（费用类），应被拒 =="
  $expNeedle = '  product: "SERVICE",'
  if (-not $ssrc.Contains($expNeedle)) { throw "场景 1d：seed-sales 里找不到行商品，副本不成立" }
  $expCopy = Join-Path $iso "seed-sales-expense.mjs"
  [IO.File]::WriteAllText($expCopy, $ssrc.Replace($expNeedle, '  product: "EXPENSE",'), $utf8)
  & $node $stub sales-expense $trade "$scripts\seed-invoicing.mjs" $expCopy
  if ($LASTEXITCODE -ne 0) { $problems.Add("场景 1d 失败，退出码 $LASTEXITCODE") }

  "== 场景 2：seed-trade 后，副本把 PO-I1 开票数量改为 11，应被拒 =="
  $needle = 'await invoice("PO-I1", "AP-I1-1", "4");'
  if (-not $isrc.Contains($needle)) { throw "场景 2：原脚本里找不到要改的调用，副本不成立" }
  $over = Join-Path $iso "seed-invoicing-over.mjs"
  [IO.File]::WriteAllText($over, $isrc.Replace($needle, 'await invoice("PO-I1", "AP-I1-1", "11");'), $utf8)
  & $node $stub over-quantity $trade $over
  if ($LASTEXITCODE -ne 0) { $problems.Add("场景 2 失败，退出码 $LASTEXITCODE") }

  "== 场景 3：没有前置主数据（不跑 seed-trade）直接运行 seed-invoicing，订单应因伙伴不存在被拒 =="
  & $node $stub no-master "$scripts\seed-invoicing.mjs"
  if ($LASTEXITCODE -ne 0) { $problems.Add("场景 3 失败，退出码 $LASTEXITCODE") }

  "== 场景 4：seed-trade 副本去掉税码 VAT，伙伴创建应因税码不存在被拒 =="
  $taxNeedle = 'await trade("taxCode", "VAT", {'
  if (-not $tsrc.Contains($taxNeedle)) { throw "场景 4：seed-trade 里找不到税码块，副本不成立" }
  $noTax = Join-Path $iso "seed-trade-notax.mjs"
  [IO.File]::WriteAllText($noTax, $tsrc.Replace($taxNeedle, 'if (false) await trade("taxCode", "VAT", {'), $utf8)
  & $node $stub no-taxcode $noTax
  if ($LASTEXITCODE -ne 0) { $problems.Add("场景 4 失败，退出码 $LASTEXITCODE") }

  "== 场景 5：缺少参数，替身应以 2 退出（不算通过） =="
  & $node $stub
  if ($LASTEXITCODE -ne 2) { $problems.Add("场景 5 应退出 2，实际 $LASTEXITCODE") }} catch {
  $problems.Add("替身或前置检查失败：" + $_.Exception.Message)
} finally {
  $env:TEMP = $oldTemp; $env:TMP = $oldTmp
  if ($iso -and (Split-Path $iso -Leaf) -like "erp-stub-*") { Remove-Item -Recurse -Force $iso }
  if ($null -ne $before) {
    try { $after = @(& $snap $real) } catch { $problems.Add("后置哈希失败（有文件读不了或目录消失）：" + $_.Exception.Message) }
  }
}
if ($null -ne $before -and $null -ne $after -and (($before -join "`n") -ne ($after -join "`n"))) {
  $problems.Add("真实截图目录哈希在替身运行前后不一致（运行前 $($before.Count) 个文件，运行后 $($after.Count) 个）")
}
if ($problems.Count -gt 0) { $problems | ForEach-Object { "PROBLEM: $_" }; exit 1 }
"真实截图目录未变：$($before.Count) 个文件（含隐藏文件）；替身检查全部通过"
