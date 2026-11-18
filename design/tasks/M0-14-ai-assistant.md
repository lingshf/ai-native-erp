# M0-14 迁移切片 7：AI 助手（候选）

- 里程碑：M0　依赖：M0-10　建议分支：`ai-assistant`

## 目标

迁移 AI 起草凭证、讲解/教学说明；AI 只返回候选，用户明确采纳后填入凭证编辑器，绝不直接过账。

## 范围

- core：AI 端口接口（输入：业务描述与上下文；输出：候选草稿/说明）和候选校验（复用凭证校验，不合法的候选标注原因）。
- infra：Copilot SDK 适配器（移植 `src/copilot-ai.mjs`）；未配置/不可用时返回明确的“AI 不可用”状态，不影响其他功能；`/api/v1/ai/draft`、`/api/v1/ai/explain`。
- web：编辑器旁的 AI 面板（输入描述 → 候选 → 采纳/放弃），教学模式关闭时隐藏讲解。
- 旧行为对照表写入 PR 描述。

行为参考：`src/copilot-ai.mjs`、`src/server.mjs`（`/api/ai/draft|teach`）、`public/app.js`；测试 `tests/copilot.test.mjs`、`tests/server.test.mjs`、`tests/ui.test.mjs` 相关用例。

## 验收标准

- 测试用假适配器，CI 不访问网络、不需要凭据；候选未经采纳不会写入任何业务表。
- 超时（默认 30s）与错误给出可理解的提示，不阻塞其他请求。
- 不记录提示词中的敏感内容到日志。
- CI 绿。

## 性能考虑

AI 调用异步，不在数据库事务中；超时可配置；前端显示进行中状态并可取消。

## 测试要求

application 层用假适配器测候选校验和“不写库”；infra 适配器只测参数映射。
