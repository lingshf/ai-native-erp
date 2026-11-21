# Demo 模板

复制到 `docs/demo/vX.Y.Z/README.md` 使用，并按发布流程 `docs/release/README.md` 执行。本文件不放相对链接，避免复制后指错目录；版本 README 中写链接时，从 `docs/demo/vX.Y.Z/` 出发应为 `../../release/README.md`，写完请点开确认可达。

## 硬性要求

1. **每条命令在评审前已在 PowerShell 中实跑**。脚本旁或 `run-through.md` 记录：commit SHA、命令、实际输出摘要、退出码；有界面的步骤附截图路径。
2. **不出现 `<…>` 占位符**（PowerShell 会把 `<` 当作重定向）。路径与参数用先赋值的变量或写实际值，命令可直接复制运行。
3. **一次性数据集与独立端口**：账套放在 `erp-demo-<guid>` 临时目录（GUID 实际生成），端口取不同于 4173 及此前 Demo 的值（v0.1.0 4190、v0.2.0 4191、v0.3.0 4193、v0.4.0 4194）；不使用用户数据、真实旧账、`.bak`、用户主检出。
4. **复跑命令自带检查**（见下“启动与检查”）：启动前确认端口空闲；写入数据前确认该端口的监听进程就是本次启动的进程；收尾只停本次启动的进程。不用 `Get-Process node`、进程名或历史 PID 去停进程；历史 PID 只出现在 `run-through.md` 的执行记录里，不写进给读者复跑的命令。
5. **截图状态断言**：文件名里的语言、主题、宽度、教学开关，必须在截图前从页面读取并断言，不符就中止（见下“截图状态断言”）。故障注入会改变状态（例如让偏好读取失败，应用回退到 zh / 红 / 教学关闭），此时按**实际状态**命名，并在说明里写出是哪个故障分支，不要用循环变量命名。
6. **滚动位置**：截图前显式设定滚动位置（通常回到页首），整页截图时粘性顶栏才不会压在正文中间；怀疑遮挡是否会在正常使用中出现时，在真实视口里量输入框与顶栏的位置并记录，不在截图里掩盖。
7. 未实跑的分支（例如夹具无法覆盖的用法）写明“仅对照代码，未实跑”，不得写成已通过；预期结果与实测结果分开标注。
8. **执行记录里做过的人工检查，都要落到可复制的命令里**（例如“确认端口空闲”“确认进程归属”“确认服务就绪”）；写不成命令的检查，注明是人工目视。
9. **脚本先写好、先用替身跑通，再申请 Demo 时段**：复跑脚本（含 seed、capture、清理）在申请时段之前就写完，并用不启动浏览器的替身完整跑通成功分支和失败分支（见下“替身验证”）；真实运行使用的就是通过评审、通过替身验证的那份脚本，运行后不再为“整理成可复制”而改它。运行前核对账套就绪清单：迁移已执行，预览 / 保存所需的主数据（例如伙伴）已 seed；缺少就中止，不要带着空账套去截图。（v0.6.0 回顾行动项 1）
10. **含删除 / 复制操作的替身必须隔离 `TEMP`（`TMP`）并校验真实产物哈希**：替身把 `TEMP`、`TMP` 指向本次专用的临时目录，并在前后各记一次真实产物（账套、备份、截图等）的 SHA256，证明替身没有触及它们（见下“替身验证”）。每个场景还要断言预期结果（是否抛出、复制了几次、停了哪些 pid、有无残留），任一断言失败就以非零退出。（v0.6.0 回顾行动项 2）

11. **替身执行真实运行会调用的每一个写入脚本，并按产品规则断言请求内容**：每个 seed，以及 capture 中发出写请求的部分，都由替身 HTTP 服务（回环临时端口）接收请求；只模拟退出码不算覆盖。替身服务至少断言：商品类型与收入 / 费用科目是否匹配单据方向、必填字段、引用的主数据（伙伴、商品、税码）是否已在本轮创建；不符时返回与真实服务相同的状态码和错误码，并有一个负例（例如销售单用只有费用科目的商品）证明确实会被拒绝。每条规则在替身里注明来源（源码 `path:line` 或契约），产品规则变化时替身随之更新。（S7 回顾行动项 3）
12. **申请浏览器时段前，先对真实服务做一次无浏览器演练**：迁移 → 启动 → 全部 seed → 就绪清单 → 清理，遵守本模板的端口、归属与清理规则；不启动 Chrome、Playwright、Vitest。演练的命令、脚本 SHA 与输出摘要写进 `run-through.md`（原始命令没有保存的，如实注明）。演练失败就修脚本后重做，不申请时段。演练是否需要独占时段，由协调者按路线图“E2E 独占时段”决定，申请前先问。（S7 回顾行动项 4）
## 启动与检查

从仓库根目录执行。整段放在 `. { ... }` 里：`throw` 会中止整段，而逐行粘贴时 `throw` 不会阻止后面的行；变量仍留在当前会话，供收尾使用。

```powershell
. {
  $server = $null; $demo = $null; $db = $null; $port = $null
  $port = 4195
  if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
    throw "端口 $port 已被占用：换端口，或先确认占用者归属；不要停止不属于本次演示的进程"
  }
  $demo = Join-Path ([IO.Path]::GetTempPath()) ("erp-demo-" + [guid]::NewGuid())
  New-Item -ItemType Directory -Path $demo | Out-Null
  $db = Join-Path $demo "demo.sqlite"
  npm run storage:admin -- migrate --provider sqlite --file $db
  if ($LASTEXITCODE -ne 0) { throw "迁移失败，退出码 $LASTEXITCODE" }
  $day = Get-Date -Format yyyy-MM-dd
  node docs/demo/v0.4.0/scripts/prepare.mjs $db (Get-Date).Year   # 本版的预置脚本，换成本版实际的；服务启动前写入
  if ($LASTEXITCODE -ne 0) { throw "预置失败，退出码 $LASTEXITCODE" }
  $env:ERP_SQLITE_FILE = $db
  $env:ERP_PORT = "$port"
  $env:ERP_HOST = "127.0.0.1"
  $env:ERP_PROFILE = "local"
  $server = Start-Process node -ArgumentList "packages/infra/src/main.ts" -PassThru -WindowStyle Hidden
  $ready = $false
  1..20 | ForEach-Object {
    if (-not $ready) {
      try { $ready = (Invoke-WebRequest "http://127.0.0.1:$port/" -UseBasicParsing).StatusCode -eq 200 } catch { Start-Sleep 1 }
    }
  }
  if (-not $ready -or $server.HasExited) { throw "演示服务未就绪，不要写入数据" }
  $owner = @((Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue).OwningProcess)
  if ($owner.Count -ne 1 -or $owner[0] -ne $server.Id) {
    throw "端口 $port 的监听进程 ($($owner -join ',')) 不是本次启动的 $($server.Id)，中止，不要写入数据"
  }
  "ready: port=$port pid=$($server.Id) db=$db"
}
```

（端口 4195 仅为示例，按本版实际选用。每轮开头先清空 `$server`、`$demo`、`$db`、`$port`，同一会话复跑时，端口检查先中止也不会让收尾块碰上一轮残留的对象；本轮已创建的临时目录和已启动的 `$server` 仍按下面的收尾清理。）

**每个写入数据的脚本（seed、截图）都放进下面这种“校验 + 执行”同一个块里**，校验失败时 `throw` 会中止整块，写入不会执行；不要把校验和写入分成两次粘贴。不依赖启动块是否中止过：

```powershell
. {
  $script = "docs/demo/v0.4.0/scripts/seed-trade.mjs"   # 换成本版要运行的脚本
  if (-not $server -or -not $port -or -not $day) { throw "本轮没有已启动的 `$server，先运行启动块" }
  if ($server.HasExited) { throw "本轮服务进程已退出，中止，不要写入数据" }
  $owner = @((Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue).OwningProcess)
  if ($owner.Count -ne 1 -or $owner[0] -ne $server.Id) {
    throw "端口 $port 的监听进程 ($($owner -join ',')) 不是本轮启动的 $($server.Id)，中止，不要写入数据"
  }
  node $script "http://127.0.0.1:$port" $day   # 地址用刚校验过的 $port；本版 seed 还需要日期（yyyy-mm-dd），参数按脚本的 usage 补全
  if ($LASTEXITCODE -ne 0) { throw "$script 失败，退出码 $LASTEXITCODE" }
}
```

## 收尾

只停本轮启动的进程（`$server`），只删本轮生成的目录。变量为空（本轮没有创建）就什么都不做，处理完立刻清空，避免下一轮误用：

```powershell
. {
  if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id }
  if ($demo -and (Split-Path $demo -Leaf) -like "erp-demo-*") { Remove-Item -Recurse -Force $demo }
  if ($port) {
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { "端口 $port 仍有监听（可能不属于本轮，先确认归属，不要强停）" } else { "端口 $port 已释放" }
  } else { "本轮没有创建任何对象，无需收尾" }
  $server = $null; $demo = $null; $db = $null; $port = $null
}
```

## 替身验证（先于申请时段）

替身不启动 Chrome、Playwright 或 Vitest，用假进程和假脚本代替。含删除 / 复制操作的替身，整段放在下面的块里：先记真实产物哈希，再把 `TEMP`、`TMP` 指向专用临时目录，在 `# 替身` 处放本版脚本的替身调用，结束时（无论替身成功还是抛错）恢复环境、只删专用目录，并**在 `finally` 里重新计算哈希**，最后统一判定。以下任一情况都 `throw`（命令行运行时退出码为 1）：替身抛错、哈希前后不一致、任何文件（含隐藏文件）无法读取。后置快照为空（文件被删光、只剩空目录）按“缺失”照常比较，与“快照失败”分开报告。隐藏文件计入；读不了的文件不会被静默跳过。从仓库根目录执行：

```powershell
. {
  $real = "docs/demo/v0.6.0/screenshots"   # 换成本版真实产物目录（截图、账套、备份等）
  $oldTemp = $env:TEMP; $oldTmp = $env:TMP; $iso = $null; $before = $null; $after = $null; $problems = @()
  $snap = { param($dir) @(Get-ChildItem -LiteralPath $dir -Recurse -File -Force -ErrorAction Stop | Sort-Object FullName | ForEach-Object { (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256 -ErrorAction Stop).Hash + "  " + $_.FullName }) }
  try {
    if (-not (Test-Path -LiteralPath $real)) { throw "真实产物目录不存在：$real" }
    $before = @(& $snap $real)
    if ($before.Count -eq 0) { throw "真实产物目录为空，无法证明替身没有触及它：$real" }
    $iso = Join-Path ([IO.Path]::GetTempPath()) ("erp-stub-" + [guid]::NewGuid())
    New-Item -ItemType Directory -Path $iso | Out-Null
    $env:TEMP = $iso; $env:TMP = $iso
    # 替身：在这里调用本版脚本的替身，成功分支和失败分支各一次，并逐个场景断言结果
  } catch {
    $problems += "替身或前置检查失败：" + $_.Exception.Message
  } finally {
    $env:TEMP = $oldTemp; $env:TMP = $oldTmp
    if ($iso -and (Split-Path $iso -Leaf) -like "erp-stub-*") { Remove-Item -Recurse -Force $iso }
    if ($null -ne $before) {
      try { $after = @(& $snap $real) } catch { $problems += "后置哈希失败（有文件读不了或目录消失）：" + $_.Exception.Message }
    }
  }
  # 快照为空（@()）与快照失败（$null）要区分：空快照照常比较，删光文件会报为缺失
  if ($null -ne $before -and $null -ne $after -and (($before -join "`n") -ne ($after -join "`n"))) {
    $missing = @($before | Where-Object { $after -notcontains $_ }).Count
    $problems += "真实产物哈希在替身运行前后不一致（缺失或改动 $missing 个文件，运行前 $($before.Count) 个，运行后 $($after.Count) 个）：$real"
  }
  if ($problems.Count -gt 0) { throw ($problems -join "；") }
  "真实产物未变：$($before.Count) 个文件（含隐藏文件）"
}
```

替身验证的输出（场景、断言、退出码、哈希结论）写进 `run-through.md` 和 PR 正文，成功分支和失败分支都要有。（v0.6.0 回顾行动项 1、2）

替身的失败场景至少覆盖发布流程清单里的“固定负例组”六项（空目录、隐藏文件、不可读文件、中途抛错、归属变化、从渲染文档复制），全文见 `docs/release/README.md`，这里不重复；不适用的项写“不适用”及理由。（S7 回顾行动项 5）

### 写入脚本的替身（要求 11）

- 替身以**脚本路径为参数**，对被测版本的原样文件运行（现行版或从旧提交取出的旧版），不改脚本、不用桩函数替换 `fetch`；脚本输出、退出码和替身的请求日志都要记录。
- 验收写**精确**结果，不能只判“非零退出”：每个请求的状态码与错误码、脚本在哪一步退出、哪些请求没有发出、请求日志恰好有哪些条目。缺参数、替身未就绪、连接失败、错误码不是预期值而导致的非零退出，一律不算通过。
- 先确认替身已就绪（就绪探测成功）且参数齐全，再运行脚本；探测结果写进记录。
- 失败分支用历史上真实出过问题的旧脚本回放（取旧提交的脚本文件），确认替身能复现当时的拒绝；修复版在同一替身、同一规则下全部通过。
- 范例与局限：`docs/demo/v0.7.0/scripts/seed-orders-stub.mjs` 的规则来源是 `packages/core/src/application/trade-documents.ts:638-641`，但它固定运行同目录下的 `seed-orders.mjs`，只能验证现行版；要回放旧版，只能先把旧文件换进该目录，**它不满足“路径参数”和旧版回放的要求**，新替身应按上面写成接受脚本路径参数。PROC-04 验收用的参数化替身全文在 PR #169 正文里。

可勾选核对（每个写入脚本逐项）：

- [ ] 替身接收该脚本的真实请求（非桩函数），请求日志已记录。
- [ ] 替身按产品规则断言请求内容，规则来源已注明 `path:line` 或契约。
- [ ] 有一个负例：违反规则的请求被拒绝，状态码与错误码与真实服务一致。
- [ ] 旧版回放：对历史出过问题的旧脚本，精确复现当时的状态码、错误码、退出码，后续请求未发出。
- [ ] 现行版在同一替身下全部成功，退出 0。
- [ ] 就绪探测与参数齐全已先确认；其余原因的非零退出一律不算通过。
- [ ] 输出、退出码、请求日志写进 `run-through.md` 和 PR 正文。

### 时段前真实服务演练（要求 12）

- [ ] 临时账套（`erp-demo-` 加 GUID）、不同于 4173 及此前 Demo 的端口。
- [ ] 按“启动与检查”：迁移、预置、启动，确认端口空闲和监听归属。
- [ ] 每个 seed 前各做一次归属检查（放在“校验 + 执行”同一块里），全部 seed 退出码为 0。
- [ ] 账套就绪清单：伙伴、商品、订单等 capture 需要的主数据都在，缺少就中止。
- [ ] 按“收尾”清理，并确认端口已释放、无 `erp-demo-*` 残留。
- [ ] 命令、脚本 SHA、输出摘要和退出码写进 `run-through.md`。（S7 回顾行动项 3、4）
## 截图状态断言

用 Playwright（系统 Chrome）时，每张截图前先回到页首并断言状态，文件名里写什么，就断言什么：

```javascript
async function assertState(page, want) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const got = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    theme: document.querySelector(".workspace")?.dataset.theme,
    width: window.innerWidth,
    teaching: document.querySelector("#workspace-teaching")?.checked,
    scrollY: window.scrollY,
  }));
  const wanted = { scrollY: 0, ...want };
  const bad = Object.entries(wanted).filter(([key, value]) => got[key] !== value);
  if (bad.length > 0) throw new Error("截图状态与文件名不符：" + JSON.stringify({ wanted, got }));
}
// 用法：await assertState(page, { lang: "en", theme: "green", width: 390, teaching: true });
```

选择器取自 `packages/web/src/App.tsx`（`document.documentElement.lang`、`.workspace[data-theme]`、`#workspace-teaching`）；若界面结构改了，先更新这里的选择器再用。

## 演练记录模板（`run-through.md`）

| 项 | 内容 |
| --- | --- |
| 对象 | tag / commit SHA |
| 环境 | 临时账套、端口、浏览器 |
| 命令 | 实际执行的命令（可复制） |
| 输出摘要 | 退出码与关键输出 |
| 截图 | 路径 |
| 未实跑 | 列出并说明原因 |
| 已知控制台错误 | 逐条归因（请求路径、状态、日志类型），预期与非预期分开 |
