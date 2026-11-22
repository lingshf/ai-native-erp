# 独占时段进程采样器（`scripts/slot/`）

E2E 独占时段（[路线图 §5](../../design/roadmap.md#5-团队流程)“E2E 独占时段”）用的运行器与进程采样器，规则见路线图 §5“进程采样规则”。本目录实现规则版本 **R1**（`procs.ps1` 中的 `$script:SlotRuleVersion`），即 D319 时段所用 D316 版 kit（gist `lingshf/c437f3d99887d0214ebd05ae9d741cc5` @ `4e00af7`）的实际逻辑，含 D320 追认的 launcher 分支；逐分支一致，只多出规则编号。来源：[SLOT-01](../../design/tasks/SLOT-01-slot-sampler-in-repo.md)。

不进 Vitest、不进 CI。

| 文件                 | 作用                                                                                                           | 平台            |
| -------------------- | -------------------------------------------------------------------------------------------------------------- | --------------- |
| `procs.ps1`          | 候选、归属与排除判定（`Counted`），每个判定出口标注 SR 编号                                                    | Windows         |
| `slot-run.ps1`       | 时段运行器：构建门禁、预检（连续 6 次计数为 0）、逐步运行并每 10 s 采样                                        | Windows         |
| `steps.example.ps1`  | `-StepsFile` 示例（步骤列表；kit 中为 GATE-01 专用列表）                                                       | Windows         |
| `steps.gate01.ps1`   | 原样复现 D316 kit 的 GATE-01 七个步骤（D347）；需要 `-BaseRoot` 下有 `artifacts/ci/gate01/` 工具，否则退出码 4 | Windows         |
| `selftest.ps1`       | 自测：kit 原有 27 项 + 每条 SR 规则的正例与反例 + 可选的与 D316 kit 逐 PID 对照                                | Windows         |
| `check-manifest.mjs` | 清单检查：判定出口与路线图规则表、规则版本逐一对照                                                             | 任意 OS（Node） |

## 运行

```powershell
# 自测（PowerShell 7 / pwsh；需要 node 在 PATH 上）
pwsh -File scripts/slot/selftest.ps1 [-OutDir $env:TEMP\slot-selftest-out] [-ReferenceProcs artifacts/ci/gate01-ref/procs.ps1]

# 时段运行（先按路线图 §5 申请时段，申请写明规则版本 R1）
pwsh -File scripts/slot/slot-run.ps1 -OutDir $env:TEMP\slot-<任务>-<日期> -StepsFile <步骤文件> [-BaseRoot <base 工作树>]
# 演练：-Stub pass 或 -Stub fail:<步骤名>，步骤换成 node 一行脚本，不开浏览器

# 清单检查（任意 OS）
node scripts/slot/check-manifest.mjs [--roadmap design/roadmap.md] [--code scripts/slot/procs.ps1]
```

- **需 pwsh 7**（D347）：只能在 Windows 的 PowerShell 7 上运行：`selftest.ps1` 与 `slot-run.ps1` 在非 Windows 上立即以退出码 2 结束（“只能在 Windows 运行”）；在 Windows PowerShell 5.1 上同样以退出码 2 结束，因为 `procs.ps1`（与 D316 kit 相同）用了只有 .NET Core 才有的 `[IO.Path]::GetFullPath(path, base)`，5.1 下所有 git 工作树（`.git` 是文件）都会被当成“无仓库”。D316 kit 也一直在 PowerShell 7 下运行。它用 WMI 启动替身进程（node.exe 及其改名副本），在 `%TEMP%\slot-selftest-*`、`%LOCALAPPDATA%\Programs\slot-selftest-*` 与 `scripts/slot/selftest/` 下建临时文件；结束时只停止这些替身进程的进程树并删除这些临时目录，不碰其他进程。输出逐项 `PASS` / `FAIL` 与 `summary` 行，有 FAIL 时退出码 1。
- `-ReferenceProcs`：D316 kit 的 `procs.ps1` 副本（按 LF 计算 SHA-256 须为 `906A4B70…90A6F8`，否则失败）。它用 `git -C <所在目录>` 定位本仓库，所以副本须放在本仓库某个工作树内，建议 `artifacts/ci/gate01-ref/procs.ps1`（`artifacts/ci/` 已被 git 忽略，不入库）。给出时，自测的每个快照同时交给 kit 的 `Counted`，计数集合与排除集合须逐 PID 相同（`EQUIV` 项）。
- `check-manifest.mjs` 退出码：0 一致；1 有出口缺编号、有表外编号、表内编号没有出口，或规则版本不一致；2 输入不可用（文件不存在、找不到规则表或版本）。判定出口按代码结构识别（`Get-Owner` / `Get-SystemExclusion` 中返回非空的 `return`，`Counted` 中的 `continue`、`@{ Kind = … }`、运行器树扩展与排除汇总），不依赖标注本身。

## 日志

- 日志与时段现场数据**只写到仓库外的目录**（`-OutDir`，例如 `%TEMP%` 下）；`OutDir` 在仓库内时两个脚本都拒绝运行（退出码 4）。`slot-run.ps1` 在入口把相对的 `-OutDir`、`-StepsFile`、`-BaseRoot` 按调用时的当前目录解析成绝对路径，校验与写入都用这个路径（运行器随后切到仓库根，日志也不会移位或写进工作树；D354）。`-StepsFile` 没有产出任何步骤时，构建前以退出码 4 结束（D354）。不提交任何日志或采样输出。
- 用完**归档，不删除**（S10 回顾行动 1/2）：例如上传到取证 gist 或附到 PR，并在 PR 正文中链接。
- `slot-run.ps1` 的输出：`slot-summary.log`（每次采样一行 `runner-tree n=…`；每个被排除的 PID 首次出现时一行 `excluded pid=… rule=SR-X… name=… reason=[…]`）、`processes.tsv`（每次采样的计数、计数进程及其规则、排除数、运行器树进程数）、`excluded.tsv`（每次采样的每个排除进程，含 `rule` 列），以及各步骤的输出。SR-R1 只出现在 `runner-tree` 行，不出现在排除日志里。
- `selftest.ps1` 的输出：`<OutDir>/selftest.log`（缺省 `%TEMP%\slot-selftest-out-<时间>`）。

## 规则变更流程

1. 新增、放宽或改变任何一条规则的判定或优先级，先由协调者给出决策编号（D…）。
2. 设计角色把改动写入路线图 §5“进程采样规则”表并升版本号（R2…）。
3. 再改本目录代码：更新 `$script:SlotRuleVersion`、出口标注与自测（新规则至少 1 个正例与 1 个反例），`check-manifest.mjs` 与 `selftest.ps1` 都通过后提 PR。
4. 时段申请写明所用规则版本。

代码先于路线图改动时，`check-manifest.mjs` 会因版本不一致或表外编号而失败。
