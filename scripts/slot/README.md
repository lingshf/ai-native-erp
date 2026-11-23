# 独占时段进程采样器（`scripts/slot/`）

E2E 独占时段（[路线图 §5](../../design/roadmap.md#5-团队流程)“E2E 独占时段”）用的运行器与进程采样器，规则见路线图 §5“进程采样规则”。本目录实现规则版本 **R2**（`procs.ps1` 中的 `$script:SlotRuleVersion`）：R1 即 D319 时段所用 D316 版 kit（gist `lingshf/c437f3d99887d0214ebd05ae9d741cc5` @ `4e00af7`）的实际逻辑，含 D320 追认的 launcher 分支，逐分支一致，只多出规则编号；R2 在 R1 上加了 SR-X1 的沿用判定（D411、D412，S12 SLOT-02）：本次运行已判为外仓的进程，之后命令行读不到但创建时间不变时仍判外仓；一旦某次可读采样改判为非外仓，沿用记录即清除（以最新可读判定为准）。来源：[SLOT-01](../../design/tasks/SLOT-01-slot-sampler-in-repo.md)。

不进 Vitest、不进 CI。

| 文件                              | 作用                                                                                                           | 平台            |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------- |
| `procs.ps1`                       | 候选、归属与排除判定（`Counted`），每个判定出口标注 SR 编号                                                    | Windows         |
| `slot-run.ps1`                    | 时段运行器：构建门禁、预检（连续 6 次计数为 0）、逐步运行并每 10 s 采样                                        | Windows         |
| `steps.example.ps1`               | `-StepsFile` 示例（步骤列表；kit 中为 GATE-01 专用列表）                                                       | Windows         |
| `steps.gate01.ps1`                | 原样复现 D316 kit 的 GATE-01 七个步骤（D347）；需要 `-BaseRoot` 下有 `artifacts/ci/gate01/` 工具，否则退出码 4 | Windows         |
| `selftest.ps1`                    | 自测：kit 原有 27 项 + 每条 SR 规则的正例与反例 + 可选的与 D316 kit 逐 PID 对照                                | Windows         |
| `check-manifest.mjs`              | 清单检查：判定出口与路线图规则表、规则版本逐一对照                                                             | 任意 OS（Node） |
| `preflight.mjs`、`preflight/`     | 开跑前静态检查（S12 SLOT-02，D407 / D408）：tsc 与 TDZ，对照基线                                               | 任意 OS（Node） |
| `tsconfig.preflight.json`         | 静态检查的 tsc 范围：`npm run typecheck` 不覆盖的场景与 `*.slow.test.ts` 文件                                  | —               |
| `preflight-baseline.json`         | 静态检查基线：既有 tsc 错误与 TDZ 发现的计数，只减不增                                                         | —               |
| `fixtures/`                       | TDZ 回归夹具（`tdz-*.ts.txt`，按内容解析，不进 lint 与 typecheck）与 I1 的 `PSModulePath` 探针                 | —               |
| `tdz-fixtures.mjs`                | TDZ 夹具检查：逐个夹具输出 `PASS` / `FAIL`                                                                     | 任意 OS（Node） |
| `step-env.ps1`                    | 步骤子进程环境：每步重置 `PSModulePath`                                                                        | Windows         |
| `selftest-preflight.ps1`          | `selftest.ps1` 第 5 部分：子进程环境（I1）、tsc 基线键（I3）、TDZ 夹具（I4）、静态检查接入 runner（I5）        | Windows         |
| `steps.d387.ps1`                  | D387 回归步骤：用 `powershell.exe` 原样运行 v0.11.0 Demo 的三个无浏览器替身                                    | Windows         |
| const rows = compareWithBaseline( |
    countByKey(findings, (found) => found.key),
    allowedCounts,
);
ast = setup.parse(readFileSync(file, "utf8"), {
sourceType: "module",
plugins: PARSER_PLUGINS,

## 运行

```powershell
# 自测（PowerShell 7 / pwsh；需要 node 在 PATH 上）
pwsh -File scripts/slot/selftest.ps1 [-OutDir $env:TEMP\slot-selftest-out] [-ReferenceProcs artifacts/ci/gate01-ref/procs.ps1]

# 时段运行（先按路线图 §5 申请时段，申请写明规则版本 R2）
pwsh -File scripts/slot/slot-run.ps1 -OutDir $env:TEMP\slot-<任务>-<日期> -StepsFile <步骤文件> [-BaseRoot <base 工作树>] [-PreflightFiles <路径>[,<路径>…]]
# 演练：-Stub pass 或 -Stub fail:<步骤名>，步骤换成 node 一行脚本，不开浏览器

# 开跑前静态检查（runner 会自动运行；也可单独运行）与 TDZ 夹具检查
node scripts/slot/preflight.mjs --root . [--files <路径>…]
node scripts/slot/tdz-fixtures.mjs

# 清单检查（任意 OS）
node scripts/slot/check-manifest.mjs [--roadmap design/roadmap.md] [--code scripts/slot/procs.ps1]
```

- **需 pwsh 7**（D347）：只能在 Windows 的 PowerShell 7 上运行：`selftest.ps1` 与 `slot-run.ps1` 在非 Windows 上立即以退出码 2 结束（“只能在 Windows 运行”）；在 Windows PowerShell 5.1 上同样以退出码 2 结束，因为 `procs.ps1`（与 D316 kit 相同）用了只有 .NET Core 才有的 `[IO.Path]::GetFullPath(path, base)`，5.1 下所有 git 工作树（`.git` 是文件）都会被当成“无仓库”。D316 kit 也一直在 PowerShell 7 下运行。它用 WMI 启动替身进程（node.exe 及其改名副本），在 `%TEMP%\slot-selftest-*`、`%LOCALAPPDATA%\Programs\slot-selftest-*` 与 `scripts/slot/selftest/` 下建临时文件；结束时只停止这些替身进程的进程树并删除这些临时目录，不碰其他进程。输出逐项 `PASS` / `FAIL` 与 `summary` 行，有 FAIL 时退出码 1。
- `-ReferenceProcs`：D316 kit 的 `procs.ps1` 副本（按 LF 计算 SHA-256 须为 `906A4B70…90A6F8`，否则失败）。它用 `git -C <所在目录>` 定位本仓库，所以副本须放在本仓库某个工作树内，建议 `artifacts/ci/gate01-ref/procs.ps1`（`artifacts/ci/` 已被 git 忽略，不入库）。给出时，自测的每个快照同时交给 kit 的 `Counted`，计数集合与排除集合须逐 PID 相同（`EQUIV` 项）。
- `check-manifest.mjs` 退出码：0 一致；1 有出口缺编号、有表外编号、表内编号没有出口，或规则版本不一致；2 输入不可用（文件不存在、找不到规则表或版本）。判定出口按代码结构识别（`Get-Owner` / `Get-UnreadableOwner` / `Get-SystemExclusion` 中返回非空的 `return`，`Counted` 中的 `continue`、`@{ Kind = … }`、运行器树扩展与排除汇总），不依赖标注本身。

## 开跑前静态检查（S12 SLOT-02，D407 / D408）

`slot-run.ps1` 的顺序：输入检查 → 加载步骤 → **静态检查（先 head，再 base）** → 构建 → dist 检查 → 进程预检 → 逐步运行。`-Stub` 演练同样真跑静态检查。

- **检查内容**：`preflight.mjs --root <checkout>` 用 `<checkout>` 自己的 `node_modules` 下的 tsc 和 `@babel/parser`，读取 `<checkout>/scripts/slot/` 下的 `tsconfig.preflight.json` 与 `preflight-baseline.json`。
  - tsc：检查 `tsconfig.preflight.json` 的 `include`（`packages/infra/test/support/**/*.ts`、`packages/infra/test/http/*.slow.test.ts`）。
  - TDZ：同一函数或块作用域中，在某个 `let` / `const` / `class` 声明之前，直接引用该绑定，或调用（含作为参数传出）直接或间接引用该绑定的局部函数；同一条声明中的多个绑定各按自己的声明子句起点判定（`const first = later, later = 1;` 命中 `later`）。检查范围是上述文件加上 `--files`（可以是取证用的 `.mjs`）。
- **退出码**：0 无新发现；**4** 输入或配置错误（参数缺失、`--files` 后没有路径、`--root` 或 `--files` 不存在、tsconfig 或基线缺失或无法解析、找不到 tsc 或 `@babel/parser`、文件无法解析），其他内部异常也是 4；**6** 有新发现（基线外的 tsc 错误或 TDZ 发现，或某条计数超过基线）。输出逐条列出 `tsc NEW|baseline 文件(行,列) 错误码: 消息` 与 `tdz NEW|baseline 文件:行 键 (declared line N) via …`，最后一行是 `preflight result exit=…`。
- **原样传出**：head 预检以 4 或 6 结束时，runner 以同一退出码结束，不构建、不做 dist 检查、不做进程预检、不运行任何步骤；head 不为 0 时不跑 base。`-BaseRoot` 下有 `scripts/slot/preflight.mjs` 时用 base 自己的工具与基线检查 base（`--root <BaseRoot>`，不带 `-PreflightFiles`），结果同样原样传出；没有时记 `base preflight skipped (no preflight.mjs)`，不算错误；不给 `-BaseRoot` 时记 `base preflight skipped (no -BaseRoot)`。
- **`-PreflightFiles`**：只交给 head 预检的 `--files`；相对路径按调用时的当前目录解析。文件不存在时预检返回 4，runner 原样传出。
- **日志**：`OutDir` 下的 `preflight-head.log` / `preflight-base.log` 是完整输出；`slot-summary.log` 中各有一行 `preflight head|base exit=… log=… preflight result …`。
- **基线只减不增**：`preflight-baseline.json` 按“错误码 + 消息首行及其续行”（tsc，续行以 `>>` 连接，不含文件、位置与长联合的省略计数；TS2769 这类诊断的实际参数类型只在续行）和“外层函数路径 > 绑定名”（TDZ）计数。基线外的键或计数变大即为新发现（6）；计数减少或消失的条目只在日志中列为 `reduced`，不阻断，由后续 PR 删除。增加条目或调大计数须经设计角色批准并有决定编号。

## 步骤子进程环境（D387 / D407）

runner 在 pwsh 7 中运行，子进程会继承 pwsh 7 的 `PSModulePath`；步骤中启动的 Windows PowerShell 5.1 因此加载不了自带的模块（D387：哈希 cmdlet “not recognized”）。`step-env.ps1` 让每个步骤（含 `-Stub` 步骤，不只是 `powershell.exe` 步骤）启动前把 `PSModulePath` 设为从资源管理器启动的 5.1 看到的值：User 值（非空时）在前，接 Machine 值。步骤的 `env.PSModulePath` 显式给值时以步骤为准。每步日志多一行 `step <名字> PSModulePath=<值>`；步骤结束后恢复 runner 原来的值。

本目录新写的脚本与改动的行计算哈希用 .NET（`[System.Security.Cryptography.SHA256]`），生成 GUID 用 `[guid]::NewGuid()`，不用对应的 cmdlet（D408）；唯一例外是 `fixtures/psmodulepath-probe.ps1`，它故意调用哈希 cmdlet 来验证环境修正。

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
