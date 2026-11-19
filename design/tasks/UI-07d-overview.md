# UI-07d 运行状态页

- 里程碑：UI-1 界面逐步改进　依赖：UI-02a　建议分支：`ui-overview`
- 冲突域：web-ui:shell（`App.tsx` 中的 `Overview`、`useHealth`，以及 labels 中的 `shell.*`）
- 设计依据：[design/ui/README.md](../ui/README.md) §4.5、§9；原型 [overview.html](../ui/prototypes/overview.html)

## 范围

- `App.tsx` 中的 `Overview`：
  - 状态卡片用 Badge 表示连接、契约、数据配置三项；
  - 加载、错误、重试状态保持现有 `role="status"` / `aria-live` 与文字。
- “常用入口”卡片为**可选**：只能链接到已有导航目标，不新增功能，也不新增 labels 以外的文字。
- 样式放 `src/pages/overview.css`。
- 本任务改 `App.tsx`，与 UI-01、UI-08，以及任何新增导航入口的任务（M2 系列等）串行。

## 验收标准

1. 满足 [UI-1 通用验收标准](README.md#ui-1界面逐步改进)。
2. 截图：已连接、未配置、网络错误三态，改前 / 改后；中文 + 红、英文 + 绿；宽 1440 与 390。
3. `App.test.tsx` 原有断言不删改。
