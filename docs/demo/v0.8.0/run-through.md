# v0.8.0 Demo 运行记录

状态：16 张截图和日志在第 4 个独占时段（D257）由 head `cc2aae8` 的脚本采集，全部入库。前 3 个时段（D254、D255、D256）都在 capture 中止，原因与修复见下。基线 `981151d`（#173 合并提交，Full 12/12）；#174 评审后补充了不开浏览器的替身与负例证据（§2.1、§2.1a），与 D257 的截图和日志分开。产品代码与 S8 产品基线 `3720e96` 相同，之后 main 只有文档提交。演示账套是临时目录里的虚构账套，端口 4200，未连接 4173，未碰真实旧账或 `.bak`。

## 1. 脚本版本

**D257 取图时段实际运行的**（与提交 `cc2aae8b215dd98509337c4b21ff5c541a946165` 一致）。取图用到的脚本没有变化：

| 脚本 | git blob SHA |
|---|---|
| `scripts/capture.mjs` | `832e4d68177da90ed7e6928a77d1791a020c0e99` |
| `scripts/seed-invoicing.mjs` | `e4bc71a109b00ed6da5228b68cff0827b8684029` |
| `scripts/run-main.ps1` | `de98addcd6bf489a03de470b15d3d9f0461b46d9` |
| `docs/demo/v0.4.0/scripts/seed-trade.mjs`（真实服务也运行它） | `7de326091110590d812c1c082ddd9589db9d04f0` |

**#174 评审后的补充证据**（不开浏览器、不需要时段；与 D257 的截图和日志分开，截图与日志没有重拍）。下面这些脚本在 `cc2aae8` 时是旧版，本次评审修订改了它们：

| 脚本 | `cc2aae8` 的 blob | 本次修订后的 blob |
|---|---|---|
| `scripts/seed-invoicing-stub.mjs` | `d6dc6546cba3caa12b1192654bfbaf646973b701`（只运行 seed-invoicing，不校验主数据） | `cfe6400c821c6764cd02df79ae8aa7318979fc88`（带状态，依次运行 seed-trade 与 seed-invoicing，校验主数据引用） |
| `scripts/stub-check.ps1` | `6cd05dc4a4fdd3f69526d90d2d40ac6899b25c3a` | `3a64087bf8658ce1ca08164b36e4ec5c5d4c5495` |
| `scripts/proc05-negatives.ps1`（新增） | — | `8d7e3b3a127d224cef96585e60641ebe33954887` |
| `scripts/orchestration-stub.ps1`（#174 复审后新增） | — | `8aae0a45bded9864439c8d091c22ea4df2e80a46` |

`run-main.ps1`、`seed-invoicing.mjs` 在时段 1 到 4 之间没有变化；`capture.mjs` 在时段 1–3 之间的三次修订见 §3 的表。这些是全新脚本，没有“历史旧版”；替身负例用的是改过的副本（在隔离临时目录里生成），不是历史脚本。

## 2. 无浏览器检查（不需要时段）

### 2.1 替身检查（评审后补充，覆盖写数据的 seed-trade 与前置主数据）

命令（仓库根目录）：`powershell -NoProfile -File docs\demo\v0.8.0\scripts\stub-check.ps1`。替身是带状态的回环假服务，按顺序运行 `seed-trade.mjs`（实际写主数据与记账的脚本：账期、条款、税码、档案、伙伴 PARTY 与 PARTY2、商品 EXPENSE、两张发票）和 `seed-invoicing.mjs`，并执行产品的主数据引用规则（伙伴与商品的税码必须存在，伙伴的条款与档案必须存在且方向匹配，订单的伙伴与商品必须存在），规则来源带 `path:line` 写在替身头部。科目与期间不由替身模拟，由 `prepare.mjs` 在账套里准备，由 §2.2 的真实服务演练覆盖。

| 场景 | 预期 | 实际（本次修订后运行，退出 0） |
|---|---|---|
| 1 现行 `seed-trade.mjs` + `seed-invoicing.mjs`，pass 模式 | 两个脚本都退出 0；请求日志恰好 20 条（seed-trade 12 条：PUT 账期、条款、税码、2 个档案、2 个伙伴、商品、2 组预览加过账；seed-invoicing 8 条）；已开票 PO-I1 L1 4、L2 未开、PO-I2 L1 10 | 一致，`stub pass ok` |
| 2 seed-trade 后，隔离 TEMP 里的副本把 PO-I1 开票数量 4 改为 11 | 最后一个脚本退出 1；日志为前 14 条加 1 次 preview 400 `api.error.tradeDocument.quantity`，路径 `lines.0.quantity`；之后没有请求 | 一致，`stub over-quantity ok` |
| 3 前置主数据缺失：只运行 `seed-invoicing.mjs`，不先跑 seed-trade | 退出 1；日志恰好 1 条：订单 POST 400 `api.error.tradeDocument.reference`，路径 `party`，之后没有请求 | 一致，`stub no-master ok` |
| 4 seed-trade 副本去掉税码 VAT 块（`if (false)`），副本在隔离 TEMP | 退出 1；日志恰好 5 条，第 5 条伙伴 POST 400 `api.error.trade.reference`，路径 `data.allowedTaxCodes`，之后没有请求 | 一致，`stub no-taxcode ok` |
| 5 不带参数 | 替身退出 2 | 一致 |
| 截图目录哈希 | 运行前后 SHA256 一致（含隐藏文件 `.gitkeep`） | 一致（18 个文件） |

场景 3 与 4 是“前置主数据缺失”的负例：脚本被拒后以非零退出，后续请求没有发出。

### 2.1a PROC-05 固定负例 1–5 的实际运行

命令：`powershell -NoProfile -File docs\demo\v0.8.0\scripts\proc05-negatives.ps1`，退出 0。每个夹具都建在 `erp-p5-<guid>` 专用临时目录里，不碰真实截图目录；预期的是检查被判失败，出现预期的失败才算通过。

| 项 | 夹具与实际结果 |
|---|---|
| 1a 初始空目录 | 空快照被判失败：`缺失：目录现在是空的（运行前 0 个文件）` |
| 1b 非空目录删光，脚本正常返回 | 3 个文件删光后函数正常返回；检查判失败：`缺失：目录现在是空的（运行前 3 个文件）` |
| 2 隐藏文件 | 隐藏的 `.gitkeep` 被计入快照；只改它的内容也被发现：`不一致：缺失或变化 1 个，新增 1 个` |
| 3 读不了的文件 | `FileStream` 独占打开一个文件，快照抛错并判失败：`读不了`，没有静默跳过 |
| 4 中途抛错 | 删光后抛“模拟脚本中途抛错”；`finally` 里的后置检查照常运行，原始异常保留，检查报 `缺失：目录现在是空的（运行前 2 个文件）` |
| 5 端口归属变化 | 起一个回环监听进程 A 作“服务”，第一步前检查通过；停掉 A，另一进程 B 占同一端口；第二步前的检查（表达式同 `run-main.ps1` 第 23 行）抛 `owner mismatch before step 2`，第二步的标记文件不存在，说明第二步没有运行。这是用同一表达式的夹具，不是对 `run-main.ps1` 本身的整体运行 |

脚本末尾也重新哈希真实截图目录：18 个文件前后一致。
### 2.2 无浏览器真实服务演练（D253 批准）

命令：`run-main.ps1 -Shots <唯一目录> -SkipCapture`；head `d892eee`（脚本与 `ed07cc1` 相同）；退出 0，约 19 秒。端口 4200、新建 `erp-demo-<guid>` 账套；迁移、启动、两个 seed、就绪清单（伙伴 PARTY、订单 PO-I1、PO-I2）通过；PO-I1 L1 4/10、L2 0/4，PO-I2 L1 10/10；端口已释放，临时账套已清。不启动 Chrome、Playwright、Vitest。

## 3. 独占时段记录

四个时段的命令**不完全相同**：D254 没有 build，直接运行 `run-main.ps1`（当时 README 的复跑块里没有 build 步骤，复跑块的 build 步骤是之后的提交 `ad46c3b` 加的）；D255、D256、D257 依次做预检、`npm run build`、断言 `packages/web/dist/assets/*.js` 含 `/invoicing` 与 `fromOrder`（不含就中止）、再 `run-main.ps1`（不带 `-SkipCapture`，后台运行，每 10 秒采样）。每次中止之后又各改了一处，所以时段之间的差异是三处修复：先在文档里补 build 块（`ad46c3b`），再修徽章断言（`7ee8a7a`），再隔离草稿的浏览器上下文（`cc2aae8`）。各时段当时用的是内联 PowerShell，没有逐字保存；现在可复制的预检与 dist 断言见 [README §4](README.md)（与当时的判定条件一致：预检连续 6 次、每次间隔 10 秒都为 0，外部进程指 chrome、biome 进程，或命令行含 vitest、playwright、vite、tsc、main.ts、capture.mjs 的进程；`msedgewebview2`、输入法、Defender 等系统进程不算）。README 里的这两块在本次评审修订时从渲染结果复制到新终端各运行一次（预检 6 次均 0，退出 0；dist 断言退出 0），见 §6。

| 时段 | head | 起止（2026-11-21） | 结果 | 原因与修复 |
|---|---|---|---|---|
| D254 | `d892eee` | 14:37:22–14:37:54 | 中止，0 张截图 | 没有先 build，服务托管的是旧 dist（没有 `/invoicing`、`fromOrder`），订单行读到旧界面。修复：复跑块加 `npm run build`（head `ad46c3b`） |
| D255 | `ad46c3b` | 14:38:54–14:39:39 | 中止，2 张截图（已删） | Badge 文本带装饰符号 ✓（`aria-hidden`，U+2713），“已开完”断言过严。修复：取行文本时去掉开头的 ✓，语义断言不变（head `7ee8a7a`） |
| D256 | `7ee8a7a` | 14:40:38–14:41:23 | 中止，3 张截图（已删） | 第 4 步在同一页面只改 hash，单页没有重载，第 2 步未保存的草稿还在，行里留着 L1、L2。产品对已全部开票订单不覆盖未保存草稿，是合理行为（D257）。修复：第 4 步改用全新浏览器上下文，断言不变（head `cc2aae8`） |
| D257 | `cc2aae8` | 14:42:12–14:43:06 | 成功，16 张，退出 0 | — |

时段 4 的首尾 SHA 都是 `cc2aae8b215dd98509337c4b21ff5c541a946165`，工作树干净；采样 4 次均为 0；build 退出 0；`capture exit 0`；端口 4200 已释放；`erp-demo-*` 目录 0 个。三次中止时 `run-main.ps1` 的 `finally` 都执行了：端口释放、临时账套已清、没有残留进程。

## 4. 截图与日志

`screenshots/` 里 16 张 PNG 加 `capture-log-main.json`。文件名后缀 = `zh-red-1440`、`zh-red-390`、`en-green-1440`、`en-green-390`（教学模式开启）。

| 截图 | 断言 |
|---|---|
| `order-partial-*` | PO-I1：L1 订购 10、已开 4、未开 6；L2 订购 4、已开 0、未开 4；“开票”是链接，地址含 `fromOrder=PO-I1` 与 `company=DEFAULT` |
| `invoice-prefilled-*` | 提示“已按订单带入 / Filled from order”；两行 EXPENSE、VAT、数量 6 与 4，单价 10 与 25，行号 L1、L2；表头 AP、PARTY、PO-I1，外部发票号为空且获得焦点；地址里的 `fromOrder` 已去掉 |
| `order-full-*` | PO-I2：L1 订购 10、已开 10，显示“已开完 / Fully invoiced”徽章；“开票”是禁用按钮并写明原因；没有链接 |
| `invoice-fully-invoiced-*` | 全新上下文直接打开 `fromOrder=PO-I2`：提示“该订单已全部开票，未生成行”，只有一行空白草稿 |

每张截图前断言语言、主题、宽度、教学开关与 scrollY。日志：16 张截图的横向溢出都是 0；4 个组合的页面错误、控制台错误与 HTTP 错误数都是 0；每个组合都有 3 次 `/invoicing` 请求，全部 200（PO-I1 两次，PO-I2 一次）。我看过的两张：`order-partial-zh-red-1440` 与 `invoice-prefilled-en-green-390`，行数据、提示与焦点与断言一致；390 宽度下发票行表格需要横向滚动，属表格自身滚动，没有页面级溢出。

### 2.1b 编排级替身（#174 复审后补充）

命令：`powershell -NoProfile -File docs\demo\v0.8.0\scripts\orchestration-stub.ps1`，退出 0。沙箱 `erp-orch-<guid>` 里放假的 `npm.cmd`、`prepare.mjs`、`seed-trade.mjs`、`seed-invoicing.mjs`、`main.ts`；不启动真实服务、Chrome、Vitest。run-main 写死端口 4200，开始前必须空闲。

| 场景 | 结果 |
|---|---|
| A1 对照：监听不换 | 真实 `run-main.ps1` 走完，退出 0，两个 seed 替身都执行，端口释放 |
| A2 进程 A 存活（`HasExited` 为假），4200 监听换成进程 B（seed-trade 替身触发） | 真实 `run-main.ps1` 以 `owner mismatch before seed-invoicing` 中止；seed-trade 已执行，seed-invoicing 没有执行；`finally` 停掉 A，harness 停掉 B；端口释放 |
| A3 run-main 副本去掉该处的 PID 比较（`-or $owner[0] -ne $server.Id`），同一场景 | seed-invoicing 被执行了，即负例失效，证明 PID 比较是必需的 |
| B3 渲染结果里的真实服务演练块（复审时是第 3 块，加入本块后是第 4 块；脚本按内容取块） | 在沙箱里执行，退出 0；替身 run-main 带 `-SkipCapture` 被调用，没有 build |
| B6 渲染结果里的取图块（复审时是第 6 块，现为第 7 块） | 在沙箱里执行，退出 0；build 先于 run-main 替身（不带 `-SkipCapture`）；16 张复制进沙箱截图目录；`demo-s8-shots-*` 目录已清 |
| B6 负例（取图块）：dist 里没有 `fromOrder` | 第 6 块因 dist 断言中止（退出 1），run-main 替身没有被调用，没有复制截图 |

这里的 run-main 被运行的是真实脚本（A1–A3 的 A3 是改动副本）；它调用的命令是沙箱替身。B3、B6 里的 run-main 是替身，目的是验证块本身的编排（build、dist 断言、复制、清理）。真实截图目录 18 个文件前后一致。
## 5. 固定负例组（PROC-05，按 `docs/release/README.md` 的 1–6 项）

1–5 项的实际运行见 §2.1a（`proc05-negatives.ps1`，退出 0），第 6 项见 §6。此前 D254–D257 的真实中止里 `finally` 也执行了，但那只是旁证，不能替代构造出的负例。

| 项 | 内容 | 证据 |
|---|---|---|
| 1 | 空目录，以及非空目录删光后脚本正常返回 | §2.1a 1a、1b：都判失败，报“缺失” |
| 2 | 隐藏文件被计入 | §2.1a 2：只改隐藏文件也被发现 |
| 3 | 读不了或被独占锁住的文件必须失败 | §2.1a 3：独占锁文件，报“读不了” |
| 4 | 中途抛错时后置检查仍运行，原始异常与检查结果都报告（含“删光再抛错”） | §2.1a 4 |
| 5 | 两步之间监听进程归属变化，第二步前拦住，第二步不运行 | §2.1a 5：夹具使用与 `run-main.ps1` 第 23 行相同的检查表达式；没有对 `run-main.ps1` 整体构造被占用端口 |
| 6 | 按 GitHub 渲染结果验证、渲染后复制运行一次 | §6 |

## 6. 文档渲染检查

README 与本文档用 `gh api -X POST markdown -f mode=gfm -F text=@文件` 渲染（必须是 `-F`，`-f` 会把路径当字面文本）。README 渲染结果：7 个独立的 `<pre>` 代码块（替身检查、PROC-05 夹具、编排替身、真实服务演练、预检、dist 断言、取图块），没有字面 `\n`，没有字面 `@路径`。从渲染结果取出的 stub-check、PROC-05 夹具、预检、dist 断言四块在评审修订时各运行一次，退出码均为 0；真实服务演练块与取图块不能在真实服务上运行，改在隔离替身里实际执行，见 §2.1b B3、B6（含 dist 缺 `fromOrder` 的负例）。渲染对照见 PR 正文。

## 7. 没做的事

- 销售方向、价格超容差例外、跨月账期、取消后恢复草稿没有演示。
- 超量开票只由替身用改过数量的副本验证（负例），未在真实服务上演示。
- 替身不模拟科目与期间；它们由 `prepare.mjs` 在真实账套里准备，由无浏览器真实服务演练覆盖。
- PROC-05 第 5 项只对同一检查表达式做了夹具，没有对 `run-main.ps1` 整体构造端口被占用。