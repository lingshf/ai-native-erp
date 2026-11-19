# UI-03 采购与销售发票页

- 里程碑：UI-1 界面逐步改进　依赖：UI-02b　建议分支：`ui-trade-invoices`
- 冲突域：web-ui:trade（`TradeInvoices.tsx`）
- 设计依据：[design/ui/README.md](../ui/README.md) §4.4；原型 [trade-invoices.html](../ui/prototypes/trade-invoices.html)

## 背景

问题 P1、P4、P5、P6、P8：发票页横向溢出（v0.2.0 Demo 发票截图为整页 2066px 宽，见 [改前](../ui/screenshots/before/trade-invoices.png)），标签与输入行内挤压，三个操作按钮同样醒目。

### UI-01 遗留例外（本任务负责消除）

UI-01（#62）只改外壳。它让 `main` 设 `overflow-x: auto`，所以根页面不再溢出，但发票页的超宽内容目前**由整个 `main` 横向滚动**，而不是由表格自身容器滚动。这是暂留的例外，不符合通用验收“宽表在自身容器内滚动”。UI-01 截图脚本实测（`design/ui/screenshots/UI-01/capture.mjs`，fbff363 合入后的 UI-01 head）：

- 撑宽的是 `fieldset.form-grid`（发票录入，约 1554px）：其中的发票行 `<table>`（`TradeInvoices.tsx` 中 `aria-label={t("tinv.lines")}`）直接放在 fieldset 内，**没有自身滚动容器**；行内标签与输入也互相挤压。
- `main` 的 `scrollWidth/clientWidth`：1440 宽为 1588/1192，390 宽为 1572/390。
- 已过账发票表格在自身的 `section.accounts-scroll` 内滚动（390 宽为 732/358 与 865/358），这一部分已符合要求。
- 运行状态、往来未结项与账龄两页 `main` 不滚动（1192/1192、390/390）。

## 范围

- `TradeInvoices.tsx`：页头 + 公司；操作栏（“确认过账”主按钮、“预览”次按钮、“放弃草稿”轻按钮，加“预览为最新 / 已过期”状态徽标，状态来自现有 stale 判断）；FastTab“发票录入”（`form-grid`）、“发票行”（结构化行表格，“删除行”轻量小按钮，“新增行”次按钮并以 `kbd` 显示 `Alt+Shift+N`）、“计算明细”（KPI + facts + 过账预览与订单匹配并排）；“已过账发票”卡片列表。
- 过账结果未知、存储失败等提示用 `MessageBar`（error / warning），保留现有 `role`。
- 按钮顺序、`type`、禁用逻辑、快捷键、确认对话框不变；已过账列表虚拟化行高 44 不变。
- 页面样式放 `src/pages/trade-invoices.css`。

## 验收标准

1. 满足 [UI-1 通用验收标准](README.md#ui-1界面逐步改进)。
2. 截图：草稿、预览后、预览过期、过账成功四个状态改前 / 改后（中文 + 红、英文 + 绿，1440 与 390 宽）；1440 宽下页面**无横向滚动条**（`document.documentElement.scrollWidth <= 1440`，写入 E2E 外的组件测试或截图脚本断言）。
   - **消除 UI-01 例外**：1440 与 390 宽下都断言 `main.scrollWidth <= main.clientWidth`，不能只查根节点宽度。发票行表格等宽表必须放进自身滚动容器（`overflow-x: auto`），并断言该容器 `scrollWidth > clientWidth` 时可以在容器内横向滚动。删除 `capture.mjs` 中的 `mainScrollException` 豁免后，截图脚本仍应全部 PASS。
3. `trade-invoices.test.tsx` 原有断言不删改；四个 `trade-gui-*.slow.test.ts` 的发票键盘路径不改即通过。
4. **快捷键按钮的可访问名称不变**：现有名称来自 `tinv.addLine`，即“新增行（Alt+Shift+N）/ Add line (Alt+Shift+N)”，已含快捷键。另行渲染 `kbd` 时，按钮的计算名称必须与该 label 完全一致，例如 label 文本拆成可见文字 + `kbd`，不另加 `aria-label`，也不重复朗读。可额外加 `aria-keyshortcuts="Alt+Shift+N"`。新增单测断言 `getByRole("button", { name: label("tinv.addLine") })` 精确匹配。不得通过修改旧断言过关。
