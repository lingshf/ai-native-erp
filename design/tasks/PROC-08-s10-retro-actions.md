# PROC-08 S10 回顾行动 1–4 写入 Demo 模板、发布清单与 Git 属性

- Sprint：S11（[计划](S11.md)）　依赖：S11 定稿 PR 合并（D339；须在 v0.11.0 RC 之前合并）　建议分支：`proc-08-s10-retro-actions`
- 负责人：版本管理（不占开发名额）
- 冲突域（逐个列文件）：
  - docs:release：`docs/demo/TEMPLATE.md`、`docs/release/README.md`；
  - 仓库配置：`.gitignore`（追加一条反忽略规则）、根 `.gitattributes`（追加一条作用域限定的属性）；
  - 共享单文件：无（开发任务不改这四个文件，见 [S11 泳道](S11.md#泳道)）；
  - **不涉及**：路线图 §5 与 `design/tasks/TEMPLATE.md`（行动 4–7 的设计侧部分已由 S11 定稿 PR 写入）；任何代码、测试、CSS；历史版本的 `docs/demo/v*/` 与 release-notes（含 `docs/demo/v0.10.0/logs/.gitattributes`，保持原样）；`CHANGELOG.md` 已有条目。
- 类型：文档 / 仓库配置
- 优先级：P2（v0.11.0 RC 与 Demo 按新条款执行）
- 来源：[S10 回顾](../reviews/S10-retro.md#行动项汇总d338-认可)行动 1、2、3 与行动 4 的模板部分（D338 认可；行动 1 的验证方式按 D339 修订）。

## 现状（main `ad70189`）

- `.gitignore:9` 为 `*.log`，`docs/demo/` 下的日志默认被忽略；仓库里没有 `!docs/demo/*/logs/*.log` 之类的反忽略规则（检索：`Select-String .gitignore -Pattern '^!'`，只命中 `:3` `!.env.example`）。
- 根 `.gitattributes:2` 为 `* text=auto eol=lf`：提交时会把日志里的 CRLF 改写为 LF（D334）。v0.10.0 用目录内的 `docs/demo/v0.10.0/logs/.gitattributes`（内容 `*.log -text`）保留原始字节；根文件没有针对 `docs/demo/*/logs/` 的规则。
- `docs/demo/TEMPLATE.md`“日志完整保留与失败现场”（`:82–111`）的日志写入 `$env:TEMP`（`:87`），不在仓库内；块内把 `$ErrorActionPreference` 设为 `Continue`（`:93`），以便原生命令的 stderr 落盘。模板中的 cmdlet 只有部分带 `-ErrorAction Stop`（例如 `:136` 带；`:37` `New-Item`、`:120` `Remove-Item`、`:142`、`:149` 不带）。
- `docs/release/README.md`“固定负例组”（`:88–96`）共 6 项，没有“非终止错误”一项；“检查清单”（`:73–101`）没有 RC 正文“证据索引”节的要求，也没有“不进发布说明”清单的对照要求。
- `docs/demo/TEMPLATE.md` 没有“截图必须由用户操作到达、与断言同一页面实例、记录到达后的 hash”的要求（检索：`Select-String docs\demo\TEMPLATE.md -Pattern 'goto|hash'`，无结果）。

## 范围

| 来源 | 落点 | 内容 |
| --- | --- | --- |
| 行动 1：日志入库、字节不变且不删 | `.gitignore`；根 `.gitattributes`；`docs/demo/TEMPLATE.md`“日志完整保留与失败现场”与“收尾” | `.gitignore` 在 `*.log` 之后追加 `!docs/demo/*/logs/*.log`；根 `.gitattributes` 追加 `docs/demo/*/logs/*.log -text`；模板日志路径改为 `docs/demo/vX/logs/`（`vX` 为本次版本）；模板给出入库前的核对块：对未跟踪的日志运行 `git check-ignore -v -- <日志>`（输出须命中 `!docs/demo/*/logs/*.log`）、`git check-ignore -q -- <日志>`（退出码须为 1；0 表示仍被忽略，其他退出码是错误）、`git check-attr text -- <日志>`（须为 `unset`）；成功路径先记录日志路径、SHA-256 与行数，再清理临时截图目录；日志在任何路径下都不删；合并后核对块：`cmd /c "git cat-file blob <提交>:<路径> > <临时文件>"` 取原始字节，SHA-256 须与写日志时记录的一致（不经 PowerShell 管道，D334） |
| 行动 2：日志块内 cmdlet 一律 `-ErrorAction Stop` | `docs/demo/TEMPLATE.md` 日志块（`:84–111`）及模板其他可执行块；`docs/release/README.md`“固定负例组” | 块内 `Copy-Item`、`Remove-Item`、`Move-Item`、`New-Item`、`Out-File`、`Set-Content` 等逐个显式加 `-ErrorAction Stop`（`Continue` 只为原生命令的 stderr 服务）；负例组新增第 7 项“非终止错误”：复制目标不可写时块以非零退出、`ok` 不为真、源截图仍在 |
| 行动 3：RC 正文“证据索引”节 | `docs/release/README.md`“检查清单” | RC PR 正文固定一节“证据索引”：实际核对时间（UTC）、完整 head SHA 与该 head 的 verify 链接；每个合并任务的 PR、合并提交、main Full 链接与取证 gist（含 commit）；PROC-05 逐项结果（含从渲染后的 `<pre>` 复制执行的命令与输出）；对照计划中“不进发布说明”的清单（例如以不合并方式结案的任务）逐项写“未出现” |
| 行动 4（模板部分）：导航路径 | `docs/demo/TEMPLATE.md`“截图状态断言” | 每类截图写明入口与到达操作：只有入口页可以 `page.goto`；目标状态必须由点击 / 键盘操作产生，截图与断言来自同一页面实例；capture 日志（如 `capture-log-main.json`）每张目标截图记录操作与到达后的实际 `location.hash` |

## 入口参数与异常

不适用：不涉及 URL、查询或路径参数。

## 不在范围

- 路线图 §5 与任务书模板（S11 定稿 PR 已写入）。
- 修改历史版本的 Demo 记录、release-notes 与 `docs/demo/v0.10.0/logs/.gitattributes`。
- v0.11.0 RC 与 Demo 本身（DEMO-11）。

## 验收标准

1. 上表每一行在 `git diff` 中可见，且只改所列四个文件。
2. 对一份未跟踪的样例日志 `docs/demo/v0.11.0/logs/x.log`：`git check-ignore -v` 的输出命中 `.gitignore:<行>:!docs/demo/*/logs/*.log`；`git check-ignore -q` 退出码为 1；`git check-attr text` 为 `unset`。PR 正文贴出三条命令的原始输出与退出码。
3. 字节保留：一份含 CRLF 的样例日志在一个**不合入**的验证提交中提交后，`cmd /c "git cat-file blob <提交>:<路径> > <临时文件>"` 取出的字节 SHA-256 与源文件一致；同一文件放在不受新规则覆盖的路径（例如仓库根）对照提交一次，SHA-256 不一致（证明根规则确实改写字节、新规则确实生效）。验证提交与样例文件在 PR 合并前删除，PR 正文给出两个 SHA-256 与验证提交 SHA。
4. 新增或改动的可执行代码块按 [PROC-05](PROC-05-doc-code-negative-cases.md) 负例组（含新增第 7 项）从渲染后的 `<pre>` 复制执行并逐项记录；第 7 项给出“复制目标不可写”时的非零退出码、`ok` 的值与源截图仍在的证据。
5. `CHANGELOG.md` 已有条目不删不改。
6. **用户可见变化**：无（只改发布流程文档与仓库 Git 配置）。

## 性能考虑

不适用：只改文档与 Git 配置，不改任何运行时代码与构建产物。

## 证据要求

- PR 正文：每条验收的命令、原始输出、退出码与所用 head。
- 不需要真实 Chrome（理由：只改文档与 Git 配置；导航路径的要求在 v0.11.0 Demo 中执行）。

## 设计自查（路线图 §5 设计文档自查 1–10）

- [x] 1 事实断言有来源（否定性断言附检索命令）
- [x] 2 不涉及进行中的 PR
- [x] 3 依赖列与泳道说明一致
- [x] 4 不新增 CSS
- [x] 5 覆盖类断言给出 `file:line`
- [x] 6 无共享单文件
- [x] 7 不涉及入口参数
- [x] 8 改动条款已通读上下文
- [x] 9 不涉及导航与历史
- [x] 10 无几何类验收；导航路径要求写入 Demo 模板
