# v0.5.0 Demo 脚本（S5 用户可见变化）

基线：main `819cbfd`（#128 合并提交；产品代码相对 `6c8724b`、即 S5 全部合并时的代码没有差异，见 [run-through.md](run-through.md)）。条目来源见 [CHANGELOG `[0.5.0]`](../../../CHANGELOG.md) 与 [发布说明](../../release/v0.5.0-release-notes.md)。实际执行记录、源码 SHA、构建记录和未覆盖项见 [run-through.md](run-through.md)。

## 0. 先说清楚：S5 的可见变化很少

S5 绝大部分 PR 只是把全局元素样式改成页面类 / 组件规则，同值，**没有可见变化**，没有也不可能有“前后对比截图”。本 Demo 只演示三项确有用户可见差异的变化，并如实标出每一项能证明什么、不能证明什么：

| # | 变化（来源） | 本 Demo 演示的内容 | 不能证明的 |
| --- | --- | --- | --- |
| 1 | 迁移核对页键值表放进自己的滚动区（#112） | 1440 / 390 下，页面级横向溢出 0；表格容器右缘在详情卡片内（相对卡片右缘 -8px），容器可见宽度 1072 / 310px，`scrollWidth` 等于 `clientWidth`，即本夹具没有触发横向滚动，也没有验证滚动行为 | 没有 v0.4.0 的“前”截图，不做逐像素对比；窄屏滚动与“窄 16px、不再多出 8px”的前后差异以 #112 的证据为准 |
| 2 | 保存订单后焦点落在提示上（#117） | 保存成功后，最终 DOM 焦点是 `div.tord-saved`（提示容器） | 焦点“更早”（同一次提交内）是时序，**本 Demo 未测**；读屏播报时序也未测 |
| 3 | 凭证页焦点（#123，FOCUS-01） | 点“查看”已过账凭证后，采样时焦点在同名按钮上（未观察焦点归还过程）；“新建凭证”是未变化的对照（同步路径，#123 前后均已聚焦），不是 #123 的修复场景。#123 实际修复的是异步打开已保存草稿的“编辑”路径，本 Demo 未走 | 同上，只看最终 DOM 焦点，不测早晚；“确认过账 / 确认删除 / 业务事件查看”等路径本次未走 |

触控尺寸来源变化（#126）高度不变，本 Demo 不演示、也没有重测各控件高度。FLAKE-02 诊断（`ERP_E2E_DIAG=1`）是测试支持代码，不在界面里。

## 1. 数据与截图来源

- 数据是 `%TEMP%` 下新建的 GUID 目录中的虚构临时账套；不使用 4173 账本、真实旧账或 `.bak`；演示端口 4196。
- 主账套（订单、凭证）：沿用 v0.4.0 Demo 的预置脚本 [prepare.mjs](../v0.4.0/scripts/prepare.mjs) 与 [seed-trade.mjs](../v0.4.0/scripts/seed-trade.mjs)（本版未改动，不复制）；订单由 GUI 录入。
- 迁移账套：用测试夹具（`packages/infra/test/support/legacy-fixture.mjs`）生成虚构旧账快照，由 [migration-setup.mjs](scripts/migration-setup.mjs) 复制到临时目录，再用 `storage:admin legacy-import` / `legacy-reconcile` 导入并确认，页面显示的是这份已保存的报告。
- 截图由 [capture.mjs](scripts/capture.mjs) 用系统 Chrome 驱动真实页面产生（DPR 1、整页）；组合 zh/专业红、en/专业绿 × 宽 1440、390；每张截图前断言语言、主题、宽度、教学开关与 scrollY。文件在 `screenshots/`，命名 `<页面>-<语言>-<主题>-<宽度>.png`。

## 2. 复跑（同一个 PowerShell 终端，从仓库根目录执行）

按顺序执行下面的块。每个块是一个 `. { ... }`：校验失败会 `throw` 中止整块，写入不会执行；收尾只处理本轮启动的 `$server` 与本轮生成的 `erp-demo-*` 目录，不按历史进程号或进程名停进程。

**A. 构建与输出目录**

```powershell
$shots = Join-Path $env:TEMP "demo-s5-shots"
npm run build
if ($LASTEXITCODE -ne 0) { throw "构建失败，退出码 $LASTEXITCODE" }
```

**B. 启动主账套（订单、凭证）**

```powershell
. {
  $server = $null; $demo = $null; $db = $null; $port = $null
  $port = 4196
  if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
    throw "端口 $port 已被占用：换端口，或先确认占用者归属；不要停止不属于本次演示的进程"
  }
  $demo = Join-Path ([IO.Path]::GetTempPath()) ("erp-demo-" + [guid]::NewGuid())
  New-Item -ItemType Directory -Path $demo | Out-Null
  $db = Join-Path $demo "demo.sqlite"
  npm run storage:admin -- migrate --provider sqlite --file $db
  if ($LASTEXITCODE -ne 0) { throw "迁移失败，退出码 $LASTEXITCODE" }
  $day = Get-Date -Format yyyy-MM-dd
  node docs/demo/v0.4.0/scripts/prepare.mjs $db (Get-Date).Year
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

**C. 预置发票并截图（校验 + 写入在同一块里）**

```powershell
. {
  if (-not $server -or -not $port -or -not $day) { throw "本轮没有已启动的 `$server，先运行启动块" }
  if ($server.HasExited) { throw "本轮服务进程已退出，中止，不要写入数据" }
  $owner = @((Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue).OwningProcess)
  if ($owner.Count -ne 1 -or $owner[0] -ne $server.Id) {
    throw "端口 $port 的监听进程 ($($owner -join ',')) 不是本轮启动的 $($server.Id)，中止，不要写入数据"
  }
  node docs/demo/v0.4.0/scripts/seed-trade.mjs "http://127.0.0.1:$port" $day
  if ($LASTEXITCODE -ne 0) { throw "seed 失败，退出码 $LASTEXITCODE" }
  node docs/demo/v0.5.0/scripts/capture.mjs main "http://127.0.0.1:$port" $shots
  if ($LASTEXITCODE -ne 0) { throw "capture 失败，退出码 $LASTEXITCODE" }
}
```

**D. 收尾（主账套）**

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

**E. 迁移账套：生成虚构快照、导入、确认、启动**

```powershell
. {
  $server = $null; $demo = $null; $db = $null; $port = $null
  $port = 4196
  if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
    throw "端口 $port 已被占用：换端口，或先确认占用者归属；不要停止不属于本次演示的进程"
  }
  $demo = Join-Path ([IO.Path]::GetTempPath()) ("erp-demo-" + [guid]::NewGuid())
  New-Item -ItemType Directory -Path $demo | Out-Null
  node docs/demo/v0.5.0/scripts/migration-setup.mjs $demo
  if ($LASTEXITCODE -ne 0) { throw "快照生成失败，退出码 $LASTEXITCODE" }
  $snap = Join-Path $demo "snapshot"
  $opening = Join-Path $demo "opening.json"
  $db = Join-Path $demo "target.sqlite"
  $confirm = Join-Path $demo "confirm.json"
  npm run storage:admin -- legacy-import --snapshot-dir $snap --target $db --drafts import-as-draft --receipts archive-only --source-events archive-only --transfer-queue archive-only --seals archive-only --audit archive-only --opening-items $opening
  if ($LASTEXITCODE -ne 0) { throw "导入失败，退出码 $LASTEXITCODE" }
  $report = npm run storage:admin -- legacy-reconcile --snapshot-dir $snap --target $db --check 2>$null | Where-Object { $_ -like '{*' } | ConvertFrom-Json
  "check verdict: $($report.verdict)"
  [IO.File]::WriteAllText($confirm, (@{ knownDifferencesSha256 = $report.knownDifferencesSha256 } | ConvertTo-Json -Compress))
  npm run storage:admin -- legacy-reconcile --snapshot-dir $snap --target $db --confirm $confirm | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "确认失败，退出码 $LASTEXITCODE" }
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
  if (-not $ready -or $server.HasExited) { throw "演示服务未就绪" }
  $owner = @((Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue).OwningProcess)
  if ($owner.Count -ne 1 -or $owner[0] -ne $server.Id) {
    throw "端口 $port 的监听进程 ($($owner -join ',')) 不是本次启动的 $($server.Id)，中止"
  }
  "ready: port=$port pid=$($server.Id) db=$db"
}
```

**F. 迁移核对页截图（块内重新校验归属）**

```powershell
. {
  if (-not $server -or -not $port) { throw "本轮没有已启动的 `$server，先运行块 E" }
  if ($server.HasExited) { throw "本轮服务进程已退出，中止" }
  $owner = @((Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue).OwningProcess)
  if ($owner.Count -ne 1 -or $owner[0] -ne $server.Id) {
    throw "端口 $port 的监听进程 ($($owner -join ',')) 不是本轮启动的 $($server.Id)，中止"
  }
  node docs/demo/v0.5.0/scripts/capture.mjs migration "http://127.0.0.1:$port" $shots
  if ($LASTEXITCODE -ne 0) { throw "capture 失败，退出码 $LASTEXITCODE" }
}
```

**G. 收尾（迁移账套）**：与块 D 相同，再执行一次块 D。截图在 `$shots`，提交前复制到 `docs\demo\v0.5.0\screenshots\`。

## 3. 演示脚本

| # | 页面与操作 | 要点（来源 PR） | 截图（zh 红 1440；其余组合同名替换） |
|---|---|---|---|
| 1 | 采购 / 销售订单：填订单号、伙伴 `PARTY`、商品 `EXPENSE`、税码 `VAT`、数量 10、单价 10，点「保存订单」 | 保存成功后，最终 DOM 焦点在“已保存”提示容器（`div.tord-saved`）上（#117）；`capture-log-main.json` 的 `orders-focus.noticeFocused` 为 true。只记录最终焦点，不测早晚 | `trade-orders-saved-focus-*` |
| 2 | 凭证：状态选「已过账」，点首行「查看」 | 点击后等 500 ms 采样，焦点在同名按钮上（`returnedToButton` 为 true）。鼠标点击本身可能聚焦该按钮，脚本未验证忙碌阶段、按钮是否曾失焦，所以不证明“焦点归还”过程 | `journals-view-*` |
| 3 | 凭证：点「新建凭证」 | 未变化的对照：同步路径，焦点在表单内的输入框（`insideForm` 为 true）；不是 #123 修复的“异步打开已保存草稿”场景 | `journals-new-draft-*` |
| 4 | 迁移核对（只读；需迁移账套，见块 E） | 键值表在自己的滚动区内；`migration-kv` 记录：页面级溢出 0，表格容器右缘在详情卡片内（#112）。截图只展开第一张键值表所在详情，其余折叠；量表时 5 张表全部展开 | `migration-*` |

## 4. 讲解提示

- 对比 1440 与 390。`capture-log-*.json` 的 `overflowPx` 为每张截图的页面级横向溢出，全部为 0。
- 焦点是看不见的变化：截图里只能看到最终状态，焦点环是否可见取决于浏览器；证据是日志里的 `document.activeElement`，不是截图。
- 两次采集（主账套、迁移账套）各有一条 404，失败请求路径未知；日志里的 URL 是页面地址。推测是 `/favicon.ico`（仓库无该文件，也无 `link rel=icon`），未抓包证实。
- 迁移夹具在 1440 和 390 下均为 `scrollWidth === clientWidth`：只证明表格容器在详情卡片内、页面无横向溢出，没有触发也没有验证横向滚动；窄屏实际滚动行为以 #112 的证据为准。
- 迁移页只读，核对通过不等于演练放行；M2-05（演练）与 M2-06（切换）未开始。

## 5. 范围与限制

- 没有前后对比截图，也没有重测控件高度、CSS 体积或读屏效果；这些数字以各 PR 正文为准。
- 没有走“确认过账 / 确认删除 / 业务事件查看 / 保存草稿”等 #123 其他焦点路径，也没有走业务事件页（UI-11a、FOCUS-02 为已登记未处理项）。
- 预置发票与迁移快照是脚本化 / 夹具写入，不是 GUI 操作。
