# PROC-02 发布流程：RC 断言范围、Demo 截图状态与进程归属（版本管理）

- Sprint：S5　依赖：—　负责人：版本管理（不计入开发上限）
- 冲突域：docs/release（`docs/release/README.md`、`docs/demo/TEMPLATE.md`）
- 类型：文档
- 来源：[S4 回顾](../reviews/S4-retro.md) 议题 6、7（#105、#108 各三轮评审）

## 范围

1. `docs/release/README.md` 的“断言需有来源”与检查清单补充：
   - 尺寸、范围类断言写出“适用范围 + 例外”，引用 CSS 行号或实测表；不写“全站”“所有”，除非有覆盖全站的测试。例：44px 是未被其他样式覆盖的 `button` / `select` 的最小高度基线，36px 只适用于所列页面的控件；
   - 面向调用方（API / CLI）的变化与面向界面的变化分条写；API 未变也要明确写出；
   - 以 #105 三轮评审中的三条意见作为反例样例（只引用，不改历史文档）。
2. `docs/demo/TEMPLATE.md` 补充：
   - **截图状态断言**：文件名中的语言、主题、宽度、教学开关，在截图前从页面读取并断言（如 `document.documentElement.lang`、主题属性、`innerWidth`），不符就中止。故障注入改变状态时，按实际状态命名，并说明是哪个故障分支；
   - **滚动位置**：截图前显式设定滚动位置；
   - **复跑命令自带检查**：启动前确认端口空闲；seed 前确认 `Get-NetTCPConnection -LocalPort <port> -State Listen` 的 `OwningProcess` 等于本次启动的进程 ID，否则中止；收尾只停本次 PID，不用 `Get-Process node`，不写历史 PID；
   - 执行记录中做过的人工检查，都要落到可复制的命令里。

## 验收标准

1. 只改上述两个文件；不改历史发布 / Demo 文档。
2. 模板中的 PowerShell 片段在 Windows PowerShell 中实跑，PR 描述附输出摘要，包括故意占用端口时脚本中止的输出。
3. 评审角色按 #105、#108 的评审意见逐条核对：每条在新规则下都能在 RC / Demo 开出前被自查发现。
