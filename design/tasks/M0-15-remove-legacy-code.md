# M0-15 删除旧代码

- 里程碑：M0　依赖：M0-08..M0-14 全部 done（D3 已定：4173 原账套保持原样）　建议分支：`remove-legacy-code`

## 目标

消除两套并存：删除 `src/*.mjs`、`public/*`、旧 `tests/*.test.mjs` 及只为它们存在的脚本与依赖；保留供 M2 使用的只读旧账读取器。

## 范围

- 删除：`src/`、`public/`、`tests/`；`scripts/enterprise-backup.mjs`、`scripts/ledger-snapshot.mjs`、`scripts/preview-legacy-snapshot.mjs`（若仅服务旧服务器）；`package.json` 中 `start`（旧服务器）、`test:legacy` 等旧脚本；CI 中旧代码步骤。
- 保留只读旧账读取器（`packages/infra/src/legacy/` 与 `scripts/read-legacy-ledger.mjs`/`legacy-snapshot-reader.mjs` 中仍被读取器使用的部分）。其测试夹具目前由 `test/support/legacy-fixture.mjs` 调用 `src/book.mjs`、`src/enterprise.mjs` 生成：改为提交小型、确定性的夹具 SQLite 文件（或由不依赖旧代码的最小 SQL 脚本生成），夹具内容与旧格式一致，读取器测试断言不变。
- 依赖：删除仅旧代码使用的依赖（如 `node:sqlite` 用法无依赖；检查 Copilot SDK 是否仍由 M0-14 使用）。
- `README.md`：启动、测试、目录说明更新为新架构。
- 旧行为对照表汇总：把 M0-08..M0-14 各 PR 的对照表合并检查，确认无遗漏（列在 PR 描述）。

## 验收标准

- 仓库无 `src/`、`public/`、`tests/` 目录；`grep` 不到对它们的引用。
- 旧账读取器测试全部通过且不依赖已删代码。
- 4173 原账套进程与其 checkout 未被触碰（按 D3）。
- CI 绿，PR CI 时长较删除前下降。

## 性能考虑

不适用；记录删除前后 CI 时长和依赖数。

## 测试要求

不新增；删除旧测试前确认对照表覆盖。
