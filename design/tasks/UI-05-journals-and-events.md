# UI-05 凭证与业务事件页

- 里程碑：UI-1 界面逐步改进　依赖：UI-02　建议分支：`ui-journals-events`
- 冲突域：web-ui:journals
- 设计依据：[design/ui/README.md](../ui/README.md) §4.3、§4.4

## 范围

- `Journals.tsx`：凭证列表（DataGrid，虚拟化行高 44 不变）+ 凭证草稿（单据模板：操作栏、FastTab 常规 / 分录行 / 预览）。借贷合计放 `tfoot`，不平衡时用 `MessageBar` error（保留现有提示文字和 `role`）。
- `BusinessEvents.tsx`：列表 + 详情卡片（Facts + 分录表）。
- 页面样式放 `src/pages/journals.css`。

## 验收标准

1. 满足 [UI-1 通用验收标准](README.md#ui-1界面逐步改进)。
2. 截图：凭证列表、草稿、预览、不平衡错误，业务事件列表与详情，改前 / 改后（中文 + 红、英文 + 绿，1440 与 390 宽）。
3. `journals.test.tsx`、`business-events.test.tsx` 原有断言不删改。
