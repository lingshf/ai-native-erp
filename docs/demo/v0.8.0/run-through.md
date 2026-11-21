# v0.8.0 Demo 运行记录

状态：16 张截图和日志在第 4 个独占时段（D257）由 head `cc2aae8` 的脚本采集，全部入库。前 3 个时段（D254、D255、D256）都在 capture 中止，原因与修复见下。基线 `981151d`（#173 合并提交，Full 12/12）；产品代码与 S8 产品基线 `3720e96` 相同，之后 main 只有文档提交。演示账套是临时目录里的虚构账套，端口 4200，未连接 4173，未碰真实旧账或 `.bak`。

## 1. 脚本版本（实际运行的）

时段 4 与本 PR 提交 `cc2aae8b215dd98509337c4b21ff5c541a946165` 的脚本一致：

| 脚本 | git blob SHA |
|---|---|
| `scripts/capture.mjs` | `832e4d68177da90ed7e6928a77d1791a020c0e99` |
| `scripts/seed-invoicing.mjs` | `e4bc71a109b00ed6da5228b68cff0827b8684029` |
| `scripts/seed-invoicing-stub.mjs` | `d6dc6546cba3caa12b1192654bfbaf646973b701` |
| `scripts/run-main.ps1` | `de98addcd6bf489a03de470b15d3d9f0461b46d9` |
| `scripts/stub-check.ps1` | `6cd05dc4a4fdd3f69526d90d2d40ac6899b25c3a` |

`run-main.ps1`、`seed-invoicing.mjs` 在时段 1 到 4 之间没有变化；`capture.mjs` 在时段 1–3 之间的三次修订见 §3 的表。这是全新脚本，没有“历史旧版”；替身负例用的是改过数量的副本，不是历史脚本。

## 2. 无浏览器检查（不需要时段）

### 2.1 替身检查

命令（仓库根目录）：`powershell -NoProfile -File docs\demo\v0.8.0\scripts\stub-check.ps1`，head `cc2aae8` 上退出 0。

| 场景 | 预期 | 实际 |
|---|---|---|
| 1 现行 `seed-invoicing.mjs`，替身 pass 模式 | 退出 0；请求日志 8 条（2 次 POST 订单 201；2 次 preview 200 加 invoices 201；2 次 GET invoicing 200） | 一致，`stub pass ok` |
| 2 隔离 TEMP 里的副本，PO-I1 开票数量 4 改为 11（over-quantity 模式） | 脚本退出 1；日志恰为 2 次 POST 订单 201 加 1 次 preview 400，错误码 `api.error.tradeDocument.quantity`，路径 `lines.0.quantity`；之后没有请求发出 | 一致，`stub over-quantity ok` |
| 3 不带脚本路径 | 替身退出 2 | 一致 |
| 截图目录哈希 | 运行前后 SHA256 一致（含隐藏文件 `.gitkeep`） | 一致（当时 18 个文件） |

规则来源已写在 `seed-invoicing-stub.mjs` 头部注释，带 `path:line`。

### 2.2 无浏览器真实服务演练（D253 批准）

命令：`run-main.ps1 -Shots <唯一目录> -SkipCapture`；head `d892eee`（脚本与 `ed07cc1` 相同）；退出 0，约 19 秒。端口 4200、新建 `erp-demo-<guid>` 账套；迁移、启动、两个 seed、就绪清单（伙伴 PARTY、订单 PO-I1、PO-I2）通过；PO-I1 L1 4/10、L2 0/4，PO-I2 L1 10/10；端口已释放，临时账套已清。不启动 Chrome、Playwright、Vitest。

## 3. 独占时段记录

每个时段都是 `npm run build`，断言 `packages/web/dist` 含 `/invoicing` 与 `fromOrder`，再 `run-main.ps1`（不带 `-SkipCapture`）。预检 6 次、10 秒采样，外部进程均为 0（`msedgewebview2`、输入法、Defender 等系统进程不是 chrome.exe、vitest、biome 或 playwright）。

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

## 5. 固定负例组（PROC-05）

| 项 | 本 Demo 的情况 |
|---|---|
| 1 空目录与非空目录 | 替身检查的真实截图目录非空（18 个文件），前后哈希一致；“从非空删光”与“初始就空”都会判失败，但**没有单独构造**这两种情形（只读代码确认） |
| 2 读不了的文件 | `stub-check.ps1` 把读取失败当作失败；没有单独构造 |
| 3 中途抛错 | 真实验证：D254、D255、D256 三次中止都走了 `finally`，端口释放、账套清理 |
| 4 归属变化 | `run-main.ps1` 在每个 seed 与 capture 前校验监听进程；没有构造“被别的进程占用”，只读代码确认 |
| 5 渲染后复制 | 见 §6 |
| 6 隐藏文件 | `.gitkeep` 纳入哈希，替身检查读到 18 个文件（含它） |

## 6. 文档渲染检查

README 与本文档用 `gh api -X POST markdown -f mode=gfm -F text=@文件` 渲染后检查；结果见 PR 正文。

## 7. 没做的事

- 销售方向、价格超容差例外、跨月账期、取消后恢复草稿没有演示。
- 超量开票只由替身用改过数量的副本验证（负例），未在真实服务上演示。
- 项 1、2、4 只靠代码与既有证据，没有新构造。
