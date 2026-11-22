# PROC-07 S9 回顾行动 3–6 写入 Demo 模板与发布清单

- Sprint：S10（[计划](S10.md)）　依赖：无（须在 v0.10.0 RC 之前合并）　建议分支：`proc-07-s9-retro-actions`
- 负责人：版本管理（不占开发名额）
- 冲突域（逐个列文件）：
  - docs:release：`docs/demo/TEMPLATE.md`、`docs/release/README.md`；
  - 共享单文件：无（开发任务不改这两个文件）；
  - **不涉及**：路线图 §5 与 `design/tasks/TEMPLATE.md`（由设计在 S10 计划 PR 中写入）；任何代码、测试、CSS；历史版本的 `docs/demo/v*/` 与 release-notes；`CHANGELOG.md` 已有条目。
- 类型：文档
- 优先级：P2（v0.10.0 RC 之前合并；RC 与 Demo 按新清单执行）
- 来源：[S9 回顾](../reviews/S9-retro.md#行动项汇总d302-已认可)行动项 3、4、5、6（D302 已认可）。

## 现状（main `f943b8b`）

- `docs/demo/TEMPLATE.md`“截图状态断言”（`:165`）的 `assertState`（`:170–182`）只断言语言、主题、宽度、教学开关与 `scrollY`，没有页面宽度断言（检索：`Select-String docs\demo\TEMPLATE.md -Pattern 'scrollWidth'`，无结果）。
- “断言逐条核对表”（`:186–194`）有 6 栏：断言、组件 `file:line`、装饰符、默认值、翻译键、schema 字段位置；没有“seed 来源”与“工具判定复核”栏。
- “启动与检查”（`:20` 起）已要求先 build 并断言 dist 新于 HEAD（S8 行动 2，#178）；没有“stdout / stderr 先完整写入文件”“失败时不清理截图与日志”的要求（检索：`Select-String docs\demo\TEMPLATE.md -Pattern 'scrollWidth|stderr|Tee-Object|不清理|2>&1'`，main `f943b8b` 上无结果）。
- `docs/release/README.md`“检查清单”（`:73–99`）有“断言有来源”“范围类断言写适用范围 + 例外”（`:75–76`），但没有要求“用户可见变化 / 兼容性”的每条行为描述附 `file:line` 或用例名，也没有要求逐项枚举“全部、各、无、不存在、硬阻断”所覆盖的页面或情形。

## 范围

| 来源 | 落点 | 内容 |
| --- | --- | --- |
| 行动 3：390 px 页面宽度；截断按实测行距设容差（D290） | `docs/demo/TEMPLATE.md`“截图状态断言” | `assertState` 在 `width` 为 390 时增加 `document.documentElement.scrollWidth <= window.innerWidth`，不满足就抛错；新增一段：截断类判定按实测行距与字形盒设容差，不用 `scrollHeight > clientHeight`，示例指向 `packages/infra/test/support/trade-gui-scenario.ts:1361–1393` |
| 行动 4：核对表增加两栏 | `docs/demo/TEMPLATE.md`“断言逐条核对表”与“演练记录模板” | 新增“seed 来源（数量 / 行数类断言对照产生数据的 seed 语句 `file:line`）”与“工具判定复核（中止后产品代码改过时，列出引用该行为的取证判定并逐条复核）”两栏；示例行同步 |
| 行动 5：日志完整保留 | `docs/demo/TEMPLATE.md`“启动与检查” | runner 与 capture 的 stdout / stderr 先完整写入文件再输出（给出可复制的 PowerShell 写法）；失败时先保存截图目录与日志，不清理；PR 正文给出完整错误与退出码，断言类中止另给出失败断言原文 |
| 行动 6：行为描述有出处、范围词逐项枚举 | `docs/release/README.md`“检查清单” | 新增两项：发布说明与 Demo README 的“用户可见变化 / 兼容性”每条附 `file:line` 或用例名；“全部、各、无、不存在、硬阻断”等范围词逐项列出覆盖的页面或情形（示例：#182 合并时按页面写的硬拦截例外） |

## 入口参数与异常

不适用：本任务不涉及 URL、查询或路径参数。

## 不在范围

- 路线图 §5 证据清单第 2、7、9 项与设计自查第 1、9 项（设计在 S10 计划 PR 写入）。
- 修改历史版本的 Demo 记录或 release-notes。
- v0.10.0 Demo 本身（含销售方向截图，见 [S10 计划](S10.md)“遗留项处理”）。

## 验收标准

1. 上表每一行在 `git diff` 中可见，且只改所列两个文件。
2. 新增或改动的可执行代码块按 [PROC-05](PROC-05-doc-code-negative-cases.md) 负例组执行并记录结果；`assertState` 的页面宽度断言用替身页面各跑一次通过与失败分支（失败分支抛错且错误信息含实测 `scrollWidth` 与 `innerWidth`）。
3. 日志写法的代码块用替身命令（例如故意以非 0 退出并输出到 stderr 的脚本）验证：退出码被记录，stderr 完整进入日志文件，失败后截图目录与日志仍在。
4. `CHANGELOG.md` 已有条目不删不改。
5. **用户可见变化**：无（只改发布流程文档）。

## 性能考虑

不适用：只改文档，不改任何运行时代码与构建产物。

## 证据要求

- PR 正文：每条验收的命令、输出摘要与所用 head。
- 不需要真实 Chrome（理由：只改文档；`assertState` 的新断言用替身页面验证，真实 Chrome 中的效果在 v0.10.0 Demo 中体现）。

## 设计自查（路线图 §5 设计文档自查 1–9）

- [x] 1 事实断言有来源（否定性断言附检索命令）
- [x] 2 不涉及进行中的 PR
- [x] 3 依赖列与泳道说明一致
- [x] 4 不新增 CSS
- [x] 5 覆盖类断言给出 `file:line`
- [x] 6 无共享单文件
- [x] 7 不涉及入口参数
- [x] 8 改动条款已通读上下文
- [x] 9 不涉及导航与历史
