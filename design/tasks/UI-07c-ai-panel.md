# UI-07c AI 面板

- 里程碑：UI-1 界面逐步改进　依赖：UI-05　建议分支：`ui-ai-panel`
- 冲突域：web-ui:journals（`AiPanel.tsx`，由 `Journals.tsx` 渲染）
- 设计依据：[design/ui/README.md](../ui/README.md) §5、§6

## 范围

- `AiPanel.tsx`：
  - 候选结果改为卡片，采用、拒绝等按钮的主次与 UI-05 凭证页一致；
  - “仅候选、需人工确认”的边界说明保持可见，用边界说明或 MessageBar 呈现，不归入教学提示。
- 样式并入 `src/pages/journals.css`。
- 依赖 UI-05，是因为与凭证页同属 `web-ui:journals`；它也需要沿用凭证页定型后的布局。

## 验收标准

1. 满足 [UI-1 通用验收标准](README.md#ui-1界面逐步改进)。
2. 截图：AI 面板空态、有候选、出错三态，改前 / 改后；中文 + 红、英文 + 绿；宽 1440 与 390。
3. `journals.test.tsx` 中 AI 面板相关的原有断言不删改。
