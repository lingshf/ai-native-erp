# PROC-03 v0.6.0 回顾行动项 1–5 写入 Demo 模板与发布清单

- Sprint：S7（[计划](README.md#s7订单列表筛选--d-7-完成--s6-遗留收尾建议-v070)）　依赖：无　建议分支：`proc-03-v060-retro-actions`
- 负责人：**版本管理**（不占开发在岗名额）
- 冲突域：docs:release —— `docs/demo/TEMPLATE.md`、`docs/release/README.md`。不在六类代码冲突域之内，与 S7 其他任务都不相交。
- 类型：文档
- 优先级：P2（应在 v0.7.0 的 RC 之前合并，使本 Sprint 的发布按新清单执行）
- 来源：[v0.6.0 回顾 行动项汇总](../../docs/release/v0.6.0-retro.md#行动项汇总)。回顾写明 1–4 “如需写入模板和清单，由版本管理在日期 PR 中一并处理”；日期 PR [#154](https://github.com/lingshf/ai-native-erp/pull/154) 只改了 CHANGELOG 与发布说明，main `3548d58` 上 `docs/demo/TEMPLATE.md` 与 `docs/release/README.md` 都还没有这几条（`docs/release/README.md:85` 只有 S5 行动项 10 的替身条目）。

## 范围

1. `docs/demo/TEMPLATE.md`：
   - 行动项 1：Demo 脚本先写好，并用替身完整跑通，再向协调者申请 Demo 时段；
   - 行动项 2：替身中含删除 / 复制操作时，必须把 `TEMP`（`TMP`）指向本次专用的临时目录，并对真实产物（账套、备份、截图等）记录前后哈希，证明替身没有触及它们。
2. `docs/release/README.md` 检查清单：
   - 行动项 3：请求评审前，对 PR 正文与文档中的每个数字、状态、PR 号和 SHA 做全文核对，以当时 `gh` 的输出为准，并在 PR 中写明核对时间；
   - 行动项 4：“没做的事 / 已知限制”在初稿就写出，不在评审后补。
3. 行动项 5（日期 PR）：在 `docs/release/README.md` 检查清单中加入日期 PR 的逐项核对，每项可勾选：
   - CHANGELOG 与 release notes 填入发布日期（两处一致）；
   - compare 链接（`vX.Y.(Z-1)...vX.Y.Z` 或上一版本 tag 到本版本 tag）已填入，并能打开；
   - 去掉“草稿”等草稿标记；
   - 链接到本版本的 Demo 记录（Demo PR 或 `run-through.md`）；
   - 合并后先等该 squash 提交上 main 的 Full 全绿，再按协调者授权在该提交上打 tag、发 Release。
   - 已在“顺序”第 4 步写明的部分（Full 绿、squash 提交、授权）可以引用而不重复，但上述五项都要在清单中能逐项勾选。
4. 每条新条目末尾注明来源（“v0.6.0 回顾行动项 N”），与 S5 行动项 10 的写法一致。

## 不在范围

- 改历史版本的发布说明、CHANGELOG、Demo 记录（行动项 5 只加清单条目，不回补历史发布物）。
- 改 `design/`（任务表由设计角色在合并后同步）。

## 验收标准

1. 行动项 1–4 各有一条可勾选、可核对的条目，落点与回顾表一致；行动项 5 的五项（日期、compare 链接、去草稿标记、Demo 链接、Full 绿后按授权打 tag / 发 Release）都在发布清单中可逐项勾选。
2. 文中新增的命令（如哈希命令）用替身跑过成功分支和失败分支，输出摘要写进 PR 正文（S5 行动项 10）。
3. 只改上述两个文件。
