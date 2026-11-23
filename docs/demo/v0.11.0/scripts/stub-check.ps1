# 无浏览器替身检查（Demo v0.11.0，PROC-04 要求 10、11）：不启动 Chrome、Playwright、Vitest，不连真实账套。
# 用替身 HTTP 服务（回环临时端口）原样运行 seed-detail.mjs 和它的改动副本，断言请求日志与产品规则：
#  场景 1 成功（222 条请求）；2 缺 AR-I1-1（没跑 seed-sales）；3 副本把核销金额改成 20000（超过未结，应被拒）；4 day 取当月 1 日（发请求前失败）；5 缺参数（退出 2）。
# v0.10.0 的前置脚本（seed-trade / seed-invoicing / seed-sales）由 v0.10.0\scripts\stub-check.ps1 覆盖，本脚本不重复。
# 隔离：运行期间 TEMP/TMP 指到专用临时目录；结束时（无论成败）恢复环境、只删专用目录，并重新计算真实截图目录（含隐藏文件）的 SHA256；
# 读不了的文件、前后不一致、真实目录为空都视为失败。
# 用法（仓库根目录）：powershell -NoProfile -File docs\demo\v0.11.0\scripts\stub-check.ps1
$ErrorActionPreference = "Stop"
$root = (Get-Location).Path
$real = Join-Path $root "docs\demo\v0.11.0\screenshots"
$scripts = Join-Path $root "docs\demo\v0.11.0\scripts"
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

  $stub = "$scripts\seed-detail-stub.mjs"
  $seed = "$scripts\seed-detail.mjs"
  $utf8 = New-Object Text.UTF8Encoding $false
  $src = [IO.File]::ReadAllText($seed, [Text.Encoding]::UTF8)

  "== 场景 1：seed-detail.mjs 成功分支（222 条请求；AR-I1-1 核销 5000 后未结 8560；DEFAULT 共 112 张） =="
  & $node $stub pass $seed
  if ($LASTEXITCODE -ne 0) { $problems.Add("场景 1 失败，退出码 $LASTEXITCODE") }

  "== 场景 2：预置里没有 AR-I1-1（没跑 seed-sales），脚本应在 AR-I1-1 的列表查询之后失败，没有任何核销请求 =="
  & $node $stub no-ar $seed
  if ($LASTEXITCODE -ne 0) { $problems.Add("场景 2 失败，退出码 $LASTEXITCODE") }

  "== 场景 3：副本把核销金额改成 20000（大于未结 13560），核销预览应被拒、没有过账 =="
  $needle = 'gross: 5000, takeDiscount: false'
  if (-not $src.Contains($needle)) { throw "场景 3：seed-detail 里找不到核销金额，副本不成立" }
  $over = Join-Path $iso "seed-detail-over.mjs"
  [IO.File]::WriteAllText($over, $src.Replace($needle, 'gross: 20000, takeDiscount: false'), $utf8)
  & $node $stub overpay $over
  if ($LASTEXITCODE -ne 0) { $problems.Add("场景 3 失败，退出码 $LASTEXITCODE") }

  "== 场景 4：day 取当月 1 日，月初发票与其它发票分不开，脚本应在发请求之前失败 =="
  & $node $stub day-first $seed
  if ($LASTEXITCODE -ne 0) { $problems.Add("场景 4 失败，退出码 $LASTEXITCODE") }

  "== 场景 5：缺少参数，替身应以 2 退出（不算通过） =="
  & $node $stub
  if ($LASTEXITCODE -ne 2) { $problems.Add("场景 5 应退出 2，实际 $LASTEXITCODE") }
} catch {
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
