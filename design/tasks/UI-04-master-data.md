# UI-04 主数据页：财务维度、贸易主数据

- 里程碑：UI-1 界面逐步改进　依赖：UI-02b　建议分支：`ui-master-data`
- 冲突域：web-ui:master（`Dimensions.tsx`），web-ui:trade（`TradeMaster.tsx`）
- 设计依据：[design/ui/README.md](../ui/README.md) §4.3、§5；参照 UI-02b 已落地的科目表页

## 范围

- `Dimensions.tsx`、`TradeMaster.tsx` 套用与科目表相同的列表页模板：
  - 页头 + 公司；
  - 有筛选时加筛选栏；
  - `card` 内 DataGrid；
  - 编辑表单放 FastTab（`form-grid`）。
- 行内“编辑配置”等改为轻量小按钮；保存为主按钮，取消 / 放弃为轻按钮。
- 虚拟化行高 44 不变；表头粘顶。
- 页面样式放 `src/pages/master.css`。

## 验收标准

1. 满足 [UI-1 通用验收标准](README.md#ui-1界面逐步改进)。
2. 截图：两页的列表态与编辑态，改前 / 改后；中文 + 红、英文 + 绿；宽 1440 与 390。
3. `dimensions.test.tsx`、`trade-master.test.tsx` 原有断言不删改。
