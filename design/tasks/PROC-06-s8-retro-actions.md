# PROC-06 S8 回顾行动落地 + 发布与 Demo 文档残留 + `components.css` 注释

- Sprint：S9（[计划](README.md#s9订单--发票双向可追溯--v080-回顾行动建议-v090)）　依赖：无　建议分支：`proc-06-s8-retro-actions`
- 负责人：版本管理（不占开发名额，D263）
- 冲突域（逐个列文件）：
  - docs:release：`docs/demo/TEMPLATE.md`、`docs/release/README.md`、`docs/release/v0.8.0-release-notes.md`（只改第 3 行）、`docs/demo/v0.8.0/README.md`（引言）、`docs/demo/v0.8.0/run-through.md`（§5、§7）。
  - web-ui:components：`packages/web/src/theme/components.css` **只改第 3–4 行注释**（原 CSS-01，D263 并入本任务）。
  - 共享单文件：无（A 线不改上述文件；A 线确实需要改 `components.css` 时停下报告）。
  - **不涉及**：任何 CSS 规则、组件代码、测试、权重文件、`docs/release/v0.5.0-release-notes.md` 与 `v0.7.0-release-notes.md`（历史文档不改，D263）、`CHANGELOG.md` 已有条目。
- 类型：文档 + 注释
- 优先级：P2（v0.9.0 RC 之前合并）
- 来源：[S8 回顾](../reviews/S8-retro.md)行动项 1、2、3、6（D258）；[S8 评审 §5](../reviews/S8.md#5-遗留项均不阻塞-v080) 遗留 1、6；协调者 D263。

## 现状（main `deb80fc`）

- `docs/demo/TEMPLATE.md`：“启动与检查”（`:20`）没有“先 build、断言 dist 新于 HEAD”；“时段前真实服务演练（要求 12）”（`:150`，要求本身在 `:19`）只要求无浏览器演练，没有覆盖 capture 的要求；“截图状态断言”（`:158`）没有逐条对照组件实际渲染的核对表；“演练记录模板”（`:181`）没有核对记录栏。
- `docs/release/README.md` 的“检查清单”（`:73`）没有“CHANGELOG 只增不删”与“‘已验证’写明命令与取证 head”两项。
- `docs/release/v0.8.0-release-notes.md:3` 仍写“tag 与 Release 仍须协调者授权”，句末有“（tag 创建后生效）”；v0.8.0 已发布（tag → `deb80fc`），两处都已过时。
- `docs/demo/v0.8.0/README.md` 引言的“第 3、6 块”是旧编号；`run-through.md` §5、§7（第 124 行附近）仍描述旧的表达式夹具（S8 遗留 6）。
- `packages/web/src/theme/components.css:3–4` 的注释仍提到 `styles.css` 的全局 button 规则；`styles.css` 已在 UI-11e 删除（D-7），注释与现状不符（S7 遗留 1、S8 遗留 1）。

## 范围

| 来源 | 落点 | 内容 |
| --- | --- | --- |
| 行动 1：断言对照组件实际渲染与响应 schema 字段位置 | `docs/demo/TEMPLATE.md`“截图状态断言” | 新增逐条核对表：断言文本、组件 `file:line`、装饰符 / `aria-hidden` 内容、默认值、翻译键、响应 schema 字段位置 |
| 行动 2：取证第一步先 build，断言 dist 新于 HEAD | `docs/demo/TEMPLATE.md`“启动与检查” | 可复制的命令块：`npm run build`，再比较 dist 产物修改时间与 `git log -1 --format=%cI HEAD`；dist 过旧时脚本以非 0 退出，不启动浏览器 |
| 行动 3：演练覆盖 capture、每步用新浏览器上下文；覆盖不了时至少逐条核对断言（D258） | 要求 12 及“时段前真实服务演练（要求 12）”；“演练记录模板” | 要求 12 增加上述子项；记录模板增加“断言逐条核对”栏（断言 → 来源 `file:line` → 结果） |
| 行动 6：CHANGELOG 只增不删；“已验证”写明命令与取证 head | `docs/release/README.md`“检查清单” | 新增两项 |
| 过时提示（D263） | `docs/release/v0.8.0-release-notes.md:3` | 删除“tag 与 Release 仍须协调者授权”与“（tag 创建后生效）”，其余事实不变。GitHub Release 正文如含同样文字，经协调者授权后同步修改 |
| S8 遗留 6 | `docs/demo/v0.8.0/README.md` 引言；`run-through.md` §5、§7 | 改为当前块号；第 124 行附近改为引用 §2.1b，不再描述旧的表达式夹具 |
| S7 / S8 遗留 1（原 CSS-01，D263） | `packages/web/src/theme/components.css:3–4` | 只改注释，写明现状：元素默认外观由 `theme/base.css` 等提供（以实际文件为准，给出 `file:line`），`styles.css` 已删除；不再提它的全局 button 规则 |

## 入口参数与异常

不适用：本任务不涉及 URL、查询或路径参数。

## 不在范围

- 历史 release-notes（v0.5.0、v0.7.0）中同样的“（tag 创建后生效）”。
- `components.css` 的任何规则、选择器或注释以外的文字。
- 路线图 §5 的证据清单与设计自查（由设计在 S9 计划 PR 中写入）。

## 验收标准

1. 上表每一行在 `git diff` 中可见，且只改所列文件。
2. `docs/release/v0.8.0-release-notes.md` 只改第 3 行，删除的只有上述两处文字；v0.5.0、v0.7.0 release-notes 的 `git diff` 为空。
3. `components.css`：`git diff` 只涉及注释行（`/* … */` 内）；base 与 head 分别 `npm run build`，产出的 CSS 文件字节一致；如果注释被保留进产物，给出 gzip-9 差值。PR 正文写明命令与两次构建所用的 SHA。不改渲染，不需要真实 Chrome 时段。
4. 新增的命令块按 [PROC-05](PROC-05-doc-code-negative-cases.md) 的负例组执行并记录结果（可执行代码块适用）。
5. `CHANGELOG.md` 已有条目不删不改。

## 证据要求

- PR 正文：每条验收的命令、输出摘要与所用 head；构建字节对比的两个 SHA。
- 不需要真实 Chrome（理由：只改文档与 CSS 注释，构建产物字节不变）。

## 设计自查（路线图 §5 设计文档自查 1–8）

- [x] 1 事实断言有来源
- [x] 2 不涉及进行中的 PR
- [x] 3 依赖列与泳道说明一致（与 A 线不相交）
- [x] 4 不新增 CSS 规则
- [x] 5 覆盖类断言给出 `file:line`
- [x] 6 无共享单文件
- [x] 7 不涉及入口参数
- [x] 8 改动条款已通读上下文
