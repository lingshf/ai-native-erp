# 界面外壳与页面模板（UI-1）

v0.3.0 起全站共用同一外壳和三类页面模板。下图说明用户如何在页面间移动，以及每类页面的组成。

## 外壳与导航

```mermaid
flowchart TD
  Shell[顶栏 + 侧栏] --> Bar[顶栏右侧：语言 / 主题 / 教学说明]
  Shell --> Nav[侧栏导航]
  Nav --> Status[运行状态]
  Nav --> Mig[迁移核对 只读]
  Nav --> Cfg[基础配置]
  Nav --> GL[总账]
  Nav --> RO[只读报表]
  Cfg --> Acc[科目表 / 财务维度 / 贸易主数据]
  GL --> Doc[凭证 / 业务事件 / 发票 / 付款 / 纠错]
  GL --> Rep[往来报表 / 总账报表 / 明细]
  GL --> Close[期末结账]
  RO --> Trial[试算平衡表]
  Shell --> Narrow[≤760px：横向导航条]
```

## 页面模板

```mermaid
flowchart TD
  Head[页头：标题 + 边界说明] --> Cmd[命令栏：主按钮唯一]
  Cmd --> Tip{教学说明开?}
  Tip -- 是 --> TT[教学卡片]
  Tip -- 否 --> Body
  TT --> Body[内容区]
  Body --> List[列表页：筛选栏 + 卡片表格]
  Body --> Doc[单据页：FastTab 分区]
  Body --> Rpt[报表页：分段视图 + KPI 卡]
  Doc --> Prev[预览]
  Prev --> Conf[确认 过账]
  Conf --> Msg[消息条：成功 / 失败]
  Rpt --> Drill[下钻到单据与凭证]
```

## 说明

- “教学说明”只控制教学卡片；页头边界说明、风险 / 错误消息条与 AI 面板的“仅为候选，需人工确认。”始终显示。
- 预览永不自动确认；取消、反向等操作的确认按钮为红色危险按钮。
- 点击区：桌面 36px，窄屏或粗指针 44px；390px 宽无页面横向溢出。
- 规范与模板细节见 [UI-1 设计规范](../../design/ui/README.md)。
